import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import {
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import { runClientReferenceTransaction } from '../client/client-reference-transaction.js';
import { SERVER_CLOCK, type ServerClock } from '../clock/server-clock.js';
import {
  commandFingerprint,
  runKeyedCommand,
  type CommandDatabase,
} from '../command/idempotent-command.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  workingEvidenceCases as cases,
  workingEvidenceRevisions as revisions,
  workingEvidenceSupports as supports,
  workingEvidenceOutputs as outputs,
  workingEvidenceReceipts as receipts,
} from '../database/schema/working-evidence.js';
import { DocumentWorkingEvidenceReferenceService } from '../documents/document-working-evidence-reference.service.js';
import { ProjectService } from '../project/project.service.js';
import { ProjectClosedGuard } from '../project/project-closed.guard.js';
import {
  command,
  cursorQuery,
  integer,
  noQuery,
  readIntent,
  readReceipt,
  readSupportView,
  refuse,
  uuid,
  type SupportView,
} from './working-evidence.contract.js';
import {
  buildWorkingEvidenceOutput,
  digest,
} from './working-evidence.output.js';

type CaseRow = typeof cases.$inferSelect;
type RevisionRow = typeof revisions.$inferSelect;
// A Case command's key is its body's commandId, a canonical UUID.
const COMMAND_ID_LENGTH = 36;
const cursorScope = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(value))
    .digest()
    .subarray(0, 16)
    .toString('base64url');
@Injectable()
export class WorkingEvidenceService {
  private readonly cursorKey = randomBytes(32);
  constructor(
    private readonly database: DatabaseContext,
    private readonly access: CompanyContextAuthorization,
    private readonly clients: ClientOperationalReferenceService,
    private readonly projects: ProjectService,
    private readonly closed: ProjectClosedGuard,
    private readonly documents: DocumentWorkingEvidenceReferenceService,
    private readonly accountability: AccountabilityService,
    @Inject(SERVER_CLOCK) private readonly clock: ServerClock,
  ) {}

  record(actor: ActorContext, projectId: string, body: unknown) {
    return this.mutate(actor, 'RECORD', uuid(projectId), body);
  }
  correct(actor: ActorContext, caseId: string, body: unknown) {
    return this.mutate(actor, 'CORRECT', uuid(caseId), body);
  }
  private mutate(
    actor: ActorContext,
    action: 'RECORD' | 'CORRECT',
    target: string,
    body: unknown,
  ) {
    const input = command(body, action);
    return this.safe(() =>
      runKeyedCommand(this.clientReferenceCommands(), {
        name: 'working-evidence-case',
        actor,
        key: input.commandId,
        maxKeyLength: COMMAND_ID_LENGTH,
        authorize: async () => {
          const { companyId } =
            await this.access.requireWorkingEvidenceCaseAccess(actor, {
              record: true,
              lockAssignment: true,
            });
          const existing =
            action === 'CORRECT'
              ? await this.findCase(actor, companyId, target)
              : null;
          const projectId = existing?.projectId ?? target;
          const project = await this.projects.missionContextWithinTransaction({
            actor,
            projectId,
          });
          const originalClientId =
            existing?.originalClientId ?? project.clientAccountId;
          if (originalClientId !== project.clientAccountId)
            return refuse('not_found');
          const context = { companyId, originalClientId };
          await this.clients.requireCapturedReferenceReadAuthorityWithinTransaction(
            actor,
          );
          await this.clients.readReferenceClient(actor, originalClientId);
          try {
            await this.documents.requireCurrentAuthority({
              actor,
              context,
              tuples: input.values.supports,
              lock: true,
            });
          } catch (error) {
            if (
              error instanceof HttpException &&
              [403, 404].includes(error.getStatus())
            )
              return refuse('not_found');
            throw error;
          }
          const intent = {
            format: 'WORKING_EVIDENCE_CASE_INTENT/1',
            companyId,
            action,
            target,
            expectedRevision: input.expectedRevision,
            reason: input.reason,
            values: input.values,
          };
          return { companyId, existing, projectId, originalClientId, intent };
        },
        findReceipt: ({ key }) => this.findReceipt(actor, key),
        recordedIntent: (receipt) => receipt.intent,
        intent: ({ scope }) => scope.intent,
        replay: async ({ receipt }) => {
          const recorded = readReceipt(receipt.receipt);
          if (
            recorded.commandId !== input.commandId ||
            recorded.caseId !== receipt.caseId ||
            recorded.revisionId !== receipt.revisionId
          )
            return refuse('content_unavailable');
          return recorded;
        },
        execute: async ({
          scope: { companyId, existing, projectId, originalClientId, intent },
        }) => {
          const context = { companyId, originalClientId };
          const intentDigest = await this.database.connection.execute(
            sql`select encode(sha256(convert_to(${JSON.stringify(intent)}::jsonb::text,'UTF8')),'hex') as fingerprint`,
          );
          const fingerprint: unknown = intentDigest.rows[0]?.fingerprint;
          if (typeof fingerprint !== 'string')
            return refuse('content_unavailable');
          let client;
          try {
            client = await this.clients.lockActiveReferenceClient(
              actor,
              originalClientId,
            );
          } catch (error) {
            if (error instanceof HttpException && error.getStatus() === 404)
              return refuse('new_use_unavailable');
            throw error;
          }
          await this.projects.missionContextWithinTransaction({
            actor,
            projectId,
            lock: true,
          });
          try {
            await this.closed.requireOpen({ actor, companyId, projectId });
          } catch (error) {
            if (error instanceof HttpException && error.getStatus() === 409)
              return refuse('new_use_unavailable');
            throw error;
          }
          const current = existing
            ? await this.findCase(actor, companyId, existing.id, true)
            : null;
          if (current && current.revision !== input.expectedRevision)
            return refuse('conflict');
          const revisionNumber = (current?.revision ?? 0) + 1;
          const caseId = current?.id ?? randomUUID(),
            revisionId = randomUUID(),
            recordedAt = this.clock.now();
          const qualified = new Map<
            string,
            Awaited<
              ReturnType<
                DocumentWorkingEvidenceReferenceService['qualifyWithinWriteTransaction']
              >
            >
          >();
          const ordered = [...input.values.supports].sort((a, b) =>
            `${a.documentId}/${a.versionId}/${a.representationId}`.localeCompare(
              `${b.documentId}/${b.versionId}/${b.representationId}`,
            ),
          );
          for (const item of ordered)
            qualified.set(
              `${item.documentId}/${item.versionId}/${item.representationId}`,
              await this.documents.qualifyWithinWriteTransaction({
                actor,
                context,
                ...item,
              }),
            );
          const frozen = input.values.supports.map((item) => {
            const source = qualified.get(
              `${item.documentId}/${item.versionId}/${item.representationId}`,
            );
            if (!source) return refuse('content_unavailable');
            const { bytes, ...binding } = source;
            return {
              ...readSupportView({
                evidenceId: randomUUID(),
                ...binding,
                locator: item.locator,
                supportNote: item.supportNote,
              }),
              bytes,
            };
          });
          const displayName = actor.displayName;
          const output = buildWorkingEvidenceOutput({
            caseId,
            projectId,
            originalClientId,
            revisionId,
            revisionNumber,
            recordedAt: recordedAt.toISOString(),
            displayName,
            ...input.values,
            reason: input.reason,
            supports: frozen,
          });
          const scope = { workspaceId: actor.workspaceId, companyId, caseId };
          if (!current)
            await this.database.connection.insert(cases).values({
              id: caseId,
              workspaceId: actor.workspaceId,
              companyId,
              projectId,
              originalClientId,
              revision: revisionNumber,
              currentRevisionId: revisionId,
              createdAt: recordedAt,
            });
          await this.database.connection.insert(revisions).values({
            id: revisionId,
            ...scope,
            revisionNumber,
            previousRevisionId: current?.currentRevisionId ?? null,
            action,
            recordedAt,
            actorMembershipId: actor.workspaceMembershipId,
            actorDisplayName: displayName,
            reason: input.reason,
            title: input.values.title,
            declaredContext: input.values.declaredContext,
            process: input.values.process,
            statement: input.values.statement,
            observationNote: input.values.observationNote,
            clientVersionBefore: client.version,
          });
          for (const [position, source] of frozen.entries()) {
            const snapshot = Object.fromEntries(
              Object.entries(source).filter(([key]) => key !== 'bytes'),
            );
            await this.database.connection.insert(supports).values({
              id: source.evidenceId,
              ...scope,
              revisionId,
              position: position + 1,
              documentId: source.documentId,
              versionId: source.versionId,
              representationId: source.representationId,
              snapshot,
            });
          }
          await this.database.connection
            .insert(outputs)
            .values({ ...scope, revisionId, ...output });
          if (current)
            await this.database.connection
              .update(cases)
              .set({ revision: revisionNumber, currentRevisionId: revisionId })
              .where(
                and(
                  eq(cases.workspaceId, actor.workspaceId),
                  eq(cases.companyId, companyId),
                  eq(cases.id, caseId),
                ),
              );
          const receipt = readReceipt({
            format: 'WORKING_EVIDENCE_CASE_RECEIPT/1',
            commandId: input.commandId,
            caseId,
            revisionId,
            revisionNumber,
            action,
            recordedAt: recordedAt.toISOString(),
          });
          await this.database.connection.insert(receipts).values({
            ...scope,
            commandId: input.commandId,
            actorMembershipId: actor.workspaceMembershipId,
            revisionId,
            intent,
            fingerprint,
            receipt,
          });
          await this.accountability.recordWorkingEvidenceCaseEvent({
            actor,
            companyId,
            caseId,
            revisionId,
            revisionNumber,
            recordedAt,
            action:
              action === 'RECORD'
                ? 'working_evidence_case.recorded'
                : 'working_evidence_case.corrected',
          });
          await this.clients.recordReferenceUse(actor, originalClientId);
          return readReceipt(receipt);
        },
      }),
    );
  }
  // Client reference drift restarts the whole keyed command, authority,
  // key lock and receipt lookup included.
  private clientReferenceCommands(): CommandDatabase {
    const database = this.database;
    return {
      get connection() {
        return database.connection;
      },
      transaction: (work) => runClientReferenceTransaction({ database, work }),
    };
  }
  // The actor's receipt for a commandId, whatever Case or Company recorded it.
  // A stored intent this version cannot read exactly fails closed before it
  // is compared.
  private async findReceipt(actor: ActorContext, commandId: string) {
    const [row] = await this.database.connection
      .select()
      .from(receipts)
      .where(
        and(
          eq(receipts.workspaceId, actor.workspaceId),
          eq(receipts.actorMembershipId, actor.workspaceMembershipId),
          eq(receipts.commandId, commandId),
        ),
      );
    if (
      row &&
      commandFingerprint(readIntent(row.intent)) !==
        commandFingerprint(row.intent)
    )
      return refuse('content_unavailable');
    return row;
  }

  detail(actor: ActorContext, caseId: string, query: unknown) {
    uuid(caseId);
    noQuery(query);
    return this.read(async () => {
      const { companyId } = await this.access.requireWorkingEvidenceCaseAccess(
        actor,
        { record: false, lockAssignment: false },
      );
      const row = await this.findCase(actor, companyId, caseId);
      await this.context(actor, row);
      const revision = await this.findRevision(row, row.currentRevisionId);
      return {
        format: 'WORKING_EVIDENCE_CASE/1',
        caseId: row.id,
        projectId: row.projectId,
        originalClientId: row.originalClientId,
        current: await this.revisionView(actor, row, revision),
      };
    });
  }
  revision(
    actor: ActorContext,
    caseId: string,
    revisionId: string,
    query: unknown,
  ) {
    uuid(caseId);
    uuid(revisionId);
    noQuery(query);
    return this.read(async () => {
      const { companyId } = await this.access.requireWorkingEvidenceCaseAccess(
        actor,
        { record: false, lockAssignment: false },
      );
      const row = await this.findCase(actor, companyId, caseId);
      await this.context(actor, row);
      return this.revisionView(
        actor,
        row,
        await this.findRevision(row, revisionId),
      );
    });
  }
  list(actor: ActorContext, projectId: string, query: unknown) {
    uuid(projectId);
    const cursor = cursorQuery(query);
    return this.read(async () => {
      const { access, decoded } = await this.pageAccess(actor, cursor);
      const project = await this.projects.missionContextWithinTransaction({
        actor,
        projectId,
      });
      await this.clients.requireReferenceReadAuthorityWithinReadTransaction(
        actor,
      );
      await this.clients.readReferenceClient(actor, project.clientAccountId);
      const binding = cursorScope([
        actor.workspaceId,
        access.companyId,
        projectId,
        project.clientAccountId,
        access.readCapture,
      ]);
      const offset = this.pageCursor(decoded, binding);
      const rows = await this.database.connection
        .select({ case: cases, revision: revisions })
        .from(cases)
        .innerJoin(
          revisions,
          and(
            eq(revisions.id, cases.currentRevisionId),
            eq(revisions.caseId, cases.id),
            eq(revisions.workspaceId, cases.workspaceId),
            eq(revisions.companyId, cases.companyId),
          ),
        )
        .where(
          and(
            eq(cases.workspaceId, actor.workspaceId),
            eq(cases.companyId, access.companyId),
            eq(cases.projectId, projectId),
          ),
        )
        .orderBy(desc(cases.createdAt), desc(cases.id))
        .limit(26)
        .offset(offset);
      return {
        format: 'WORKING_EVIDENCE_CASE_PAGE/1',
        items: rows.slice(0, 25).map((r) => ({
          caseId: r.case.id,
          revisionId: r.revision.id,
          revisionNumber: r.revision.revisionNumber,
          title: r.revision.title,
          recordedAt: r.revision.recordedAt.toISOString(),
        })),
        nextCursor:
          rows.length > 25
            ? this.signCursor([
                this.packCapture(access.readCapture),
                binding,
                offset + 25,
              ])
            : null,
      };
    });
  }
  history(actor: ActorContext, caseId: string, query: unknown) {
    uuid(caseId);
    const cursor = cursorQuery(query);
    return this.read(async () => {
      const { access, decoded } = await this.pageAccess(actor, cursor);
      const row = await this.findCase(actor, access.companyId, caseId);
      await this.context(actor, row);
      const binding = cursorScope([
        actor.workspaceId,
        access.companyId,
        caseId,
        access.readCapture,
      ]);
      const offset = this.pageCursor(decoded, binding);
      const rows = await this.database.connection
        .select()
        .from(revisions)
        .where(
          and(
            eq(revisions.workspaceId, actor.workspaceId),
            eq(revisions.companyId, access.companyId),
            eq(revisions.caseId, caseId),
          ),
        )
        .orderBy(desc(revisions.revisionNumber))
        .limit(26)
        .offset(offset);
      return {
        format: 'WORKING_EVIDENCE_CASE_HISTORY/1',
        items: rows.slice(0, 25).map((r) => ({
          revisionId: r.id,
          revisionNumber: r.revisionNumber,
          action: r.action,
          recordedAt: r.recordedAt.toISOString(),
          actor: {
            membershipId: r.actorMembershipId,
            displayName: r.actorDisplayName,
          },
        })),
        nextCursor:
          rows.length > 25
            ? this.signCursor([
                this.packCapture(access.readCapture),
                binding,
                offset + 25,
              ])
            : null,
      };
    });
  }
  sources(actor: ActorContext, projectId: string, query: unknown) {
    uuid(projectId);
    const cursor = cursorQuery(query);
    return this.read(async () => {
      const { access, decoded } = await this.pageAccess(actor, cursor);
      const project = await this.projects.missionContextWithinTransaction({
        actor,
        projectId,
      });
      await this.clients.requireReferenceReadAuthorityWithinReadTransaction(
        actor,
      );
      await this.clients.readReferenceClient(actor, project.clientAccountId);
      const context = {
        companyId: access.companyId,
        originalClientId: project.clientAccountId,
      };
      await this.documents.requireCurrentAuthority({
        actor,
        context,
        tuples: [],
        lock: false,
      });
      const company = actor.activeCompany;
      if (!company) throw new ForbiddenException();
      const binding = cursorScope([
        actor.workspaceId,
        access.companyId,
        projectId,
        project.clientAccountId,
        access.readCapture,
        company.documentPermissionAssignmentId,
        company.documentPermissionSetVersion,
        company.receivedAuditSourceAccessAssignmentId,
        company.receivedAuditSourceAccessPermissionSetVersion,
        company.documentContentReaderAssignmentId,
        company.documentContentReaderPermissionSetVersion,
      ]);
      let after = null;
      if (decoded) {
        const v = decoded;
        if (
          !Array.isArray(v) ||
          v.length !== 5 ||
          v[1] !== binding ||
          typeof v[2] !== 'string' ||
          !validInstant(v[2])
        )
          return refuse('invalid_request');
        after = {
          createdAt: String(v[2]),
          documentId: uuid(v[3]),
          versionNumber: integer(v[4], 1, 50),
        };
      }
      const rows = await this.documents.eligibleWithinReadTransaction({
        actor,
        context,
        after,
        limit: 26,
      });
      const last = rows[24];
      return {
        format: 'WORKING_EVIDENCE_CASE_SOURCE_PAGE/1',
        items: rows.slice(0, 25).map((item) => ({
          documentId: item.documentId,
          versionId: item.versionId,
          versionNumber: item.versionNumber,
          representationId: item.representationId,
          sourceTitle: item.sourceTitle,
        })),
        nextCursor:
          rows.length > 25 && last
            ? this.signCursor([
                this.packCapture(access.readCapture),
                binding,
                last.createdAt,
                last.documentId,
                last.versionNumber,
              ])
            : null,
      };
    });
  }
  artifact(
    actor: ActorContext,
    caseId: string,
    revisionId: string,
    kind: 'statement' | 'annex' | 'evidence',
    evidenceId: string | null,
    query: unknown,
  ) {
    uuid(caseId);
    uuid(revisionId);
    if (evidenceId !== null) uuid(evidenceId);
    noQuery(query);
    return this.read(async () => {
      const { companyId } = await this.access.requireWorkingEvidenceCaseAccess(
        actor,
        { record: false, lockAssignment: false },
      );
      const row = await this.findCase(actor, companyId, caseId);
      await this.context(actor, row);
      await this.findRevision(row, revisionId);
      const frozen = await this.supportRows(row, revisionId);
      const context = { companyId, originalClientId: row.originalClientId };
      const selected =
        kind === 'evidence'
          ? frozen.filter((s) => s.evidenceId === evidenceId)
          : frozen;
      if (!selected.length) return refuse('not_found');
      try {
        await this.documents.authorizeRecordedWithinReadTransaction({
          actor,
          context,
          tuples: selected,
        });
      } catch (error) {
        if (
          error instanceof HttpException &&
          [403, 404].includes(error.getStatus())
        )
          return refuse('not_found');
        throw error;
      }
      let exact: Buffer | undefined;
      for (const s of selected) {
        const source = await this.documents.readExactWithinReadTransaction({
          actor,
          context,
          ...s,
        });
        if (
          source.sizeBytes !== s.sizeBytes ||
          source.sha256 !== s.sha256 ||
          source.bytes.length !== s.sizeBytes ||
          digest(source.bytes) !== s.sha256
        )
          return refuse('content_unavailable');
        if (kind === 'evidence') exact = source.bytes;
      }
      if (kind === 'evidence') {
        if (!exact) return refuse('content_unavailable');
        return {
          bytes: exact,
          type: 'application/pdf',
          filename: 'working-evidence-original.pdf',
        };
      }
      const [output] = await this.database.connection
        .select()
        .from(outputs)
        .where(
          and(
            eq(outputs.workspaceId, actor.workspaceId),
            eq(outputs.companyId, companyId),
            eq(outputs.caseId, caseId),
            eq(outputs.revisionId, revisionId),
          ),
        );
      if (
        !output ||
        digest(output.statement) !== output.statementSha256 ||
        digest(output.annex) !== output.annexSha256
      )
        return refuse('content_unavailable');
      return kind === 'statement'
        ? {
            bytes: output.statement,
            type: 'text/html; charset=utf-8',
            filename: 'working-evidence-statement.html',
          }
        : {
            bytes: output.annex,
            type: 'application/zip',
            filename: 'working-evidence-annex.zip',
          };
    });
  }
  private async context(actor: ActorContext, row: CaseRow) {
    await this.clients.requireReferenceReadAuthorityWithinReadTransaction(
      actor,
    );
    const project = await this.projects.missionContextWithinTransaction({
      actor,
      projectId: row.projectId,
    });
    if (project.clientAccountId !== row.originalClientId)
      return refuse('not_found');
    await this.clients.readReferenceClient(actor, row.originalClientId);
  }
  private async findCase(
    actor: ActorContext,
    companyId: string,
    id: string,
    lock = false,
  ) {
    const query = this.database.connection
      .select()
      .from(cases)
      .where(
        and(
          eq(cases.workspaceId, actor.workspaceId),
          eq(cases.companyId, companyId),
          eq(cases.id, id),
        ),
      );
    const [row] = lock ? await query.for('update') : await query;
    if (!row) return refuse('not_found');
    return row;
  }
  private async findRevision(row: CaseRow, id: string) {
    const [revision] = await this.database.connection
      .select()
      .from(revisions)
      .where(
        and(
          eq(revisions.workspaceId, row.workspaceId),
          eq(revisions.companyId, row.companyId),
          eq(revisions.caseId, row.id),
          eq(revisions.id, id),
        ),
      );
    if (!revision) return refuse('not_found');
    return revision;
  }
  private async supportRows(
    row: CaseRow,
    revisionId: string,
  ): Promise<SupportView[]> {
    const rows = await this.database.connection
      .select()
      .from(supports)
      .where(
        and(
          eq(supports.workspaceId, row.workspaceId),
          eq(supports.companyId, row.companyId),
          eq(supports.caseId, row.id),
          eq(supports.revisionId, revisionId),
        ),
      )
      .orderBy(supports.position);
    if (rows.length < 1 || rows.length > 3)
      return refuse('content_unavailable');
    return rows.map((r) => {
      const view = readSupportView(r.snapshot);
      if (
        view.evidenceId !== r.id ||
        view.documentId !== r.documentId ||
        view.versionId !== r.versionId ||
        view.representationId !== r.representationId
      )
        return refuse('content_unavailable');
      return view;
    });
  }
  private async revisionView(
    actor: ActorContext,
    row: CaseRow,
    r: RevisionRow,
  ) {
    const frozen = await this.supportRows(row, r.id);
    let evidence:
      { state: 'visible'; supports: SupportView[] } | { state: 'unavailable' } =
      { state: 'unavailable' };
    try {
      await this.documents.authorizeRecordedWithinReadTransaction({
        actor,
        context: {
          companyId: row.companyId,
          originalClientId: row.originalClientId,
        },
        tuples: frozen,
      });
      evidence = { state: 'visible', supports: frozen };
    } catch (error) {
      if (
        !(error instanceof HttpException) ||
        ![403, 404].includes(error.getStatus())
      )
        throw error;
    }
    return {
      format: 'WORKING_EVIDENCE_CASE_REVISION/1',
      caseId: row.id,
      revisionId: r.id,
      revisionNumber: r.revisionNumber,
      previousRevisionId: r.previousRevisionId,
      action: r.action,
      recordedAt: r.recordedAt.toISOString(),
      actor: {
        membershipId: r.actorMembershipId,
        displayName: r.actorDisplayName,
      },
      reason: r.reason,
      title: r.title,
      declaredContext: r.declaredContext,
      process: r.process,
      statement: r.statement,
      observationNote: r.observationNote,
      evidence,
    };
  }
  private read<T>(work: () => Promise<T>) {
    return this.safe(() =>
      this.database.transaction(work, {
        isolationLevel: 'repeatable read',
        accessMode: 'read only',
      }),
    );
  }
  private async safe<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof HttpException) {
        const status = error.getStatus();
        const response = error.getResponse();
        if (
          typeof response === 'object' &&
          response !== null &&
          'code' in response &&
          [
            'invalid_request',
            'conflict',
            'new_use_unavailable',
            'not_found',
            'content_unavailable',
            'IDEMPOTENCY_CONFLICT',
          ].includes(String(response.code))
        )
          throw error;
        if (status === 404) return refuse('not_found');
        if (status === 503) return refuse('content_unavailable');
        if (status === 409) return refuse('conflict');
        if (status === 400) return refuse('invalid_request');
        if (status === 401 || status === 403) throw error;
      }
      // Keep driver payloads, SQL and confidential literal values out of Nest diagnostics.
      throw new HttpException({ code: 'content_unavailable' }, 500);
    }
  }
  private signCursor(value: unknown) {
    const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
    const signature = createHmac('sha256', this.cursorKey)
      .update(payload)
      .digest('base64url');
    const token = `${payload}.${signature}`;
    if (token.length > 256) return refuse('content_unavailable');
    return token;
  }
  private decodeCursor(token: string): unknown {
    const [payload, signature, ...extra] = token.split('.');
    if (!payload || !signature || extra.length)
      return refuse('invalid_request');
    const expected = createHmac('sha256', this.cursorKey)
      .update(payload)
      .digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return refuse('invalid_request');
    try {
      return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
      return refuse('invalid_request');
    }
  }
  private packCapture(capture: string) {
    if (!/^[a-f0-9]{64}$/.test(capture)) return refuse('content_unavailable');
    return Buffer.from(capture, 'hex').toString('base64url');
  }
  private async pageAccess(actor: ActorContext, token: string | null) {
    let access = await this.access.requireWorkingEvidenceCaseAccess(actor, {
      record: false,
      lockAssignment: false,
    });
    if (token === null) return { access, decoded: null };
    const decoded = this.decodeCursor(token);
    if (
      !Array.isArray(decoded) ||
      decoded.length < 3 ||
      typeof decoded[0] !== 'string'
    )
      return refuse('invalid_request');
    const packed = Buffer.from(decoded[0], 'base64url');
    if (packed.length !== 32 || packed.toString('base64url') !== decoded[0])
      return refuse('invalid_request');
    try {
      access = await this.access.requireWorkingEvidenceCaseAccess(actor, {
        record: false,
        lockAssignment: false,
        readCapture: packed.toString('hex'),
      });
    } catch (error) {
      if (
        error instanceof HttpException &&
        [403, 404].includes(error.getStatus())
      )
        return refuse('invalid_request');
      throw error;
    }
    return { access, decoded };
  }
  private pageCursor(value: unknown[] | null, binding: string) {
    if (value === null) return 0;
    if (value.length !== 3 || value[1] !== binding)
      return refuse('invalid_request');
    return integer(value[2], 0, 2147483647);
  }
}

function validInstant(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}
