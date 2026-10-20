import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  asc,
  count,
  eq,
  inArray,
  isNull,
  or,
  type SQL,
} from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import {
  requireIdempotencyKey,
  requireUuid,
} from '../access/access-command-validation.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import { SERVER_CLOCK, type ServerClock } from '../clock/server-clock.js';
import {
  commandFingerprint,
  idempotencyConflict,
  runIdempotentCommand,
  staleVersionConflict,
} from '../command/idempotent-command.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  complaints,
  complaintIntakeVersions,
  complaintReceipts,
} from '../database/schema/index.js';
import { ProjectService } from '../project/project.service.js';
import {
  readComplaintIntake,
  readComplaintIntakeCorrection,
  readComplaintOffset,
  readComplaintReceipt,
  readComplaintRecord,
  type ComplaintView,
  type ComplaintHistoryPage,
} from './complaints.validation.js';

import { readComplaintHistorySnapshot } from './complaints-history.read.js';
import { writeComplaintJournal } from './complaints-journal.command.js';
import { protectComplaintOutcome } from './complaints.failure.js';

type ComplaintRow = typeof complaints.$inferSelect;

@Injectable()
export class ComplaintsService {
  constructor(
    private readonly authorization: CompanyContextAuthorization,
    private readonly database: DatabaseContext,
    private readonly clients: ClientOperationalReferenceService,
    private readonly projects: ProjectService,
    private readonly accountability: AccountabilityService,
    @Inject(SERVER_CLOCK) private readonly clock: ServerClock,
  ) {}

  list(actor: ActorContext, pageOffset: unknown) {
    const offset = readComplaintOffset(pageOffset);
    return protectComplaintOutcome(() =>
      this.database.transaction(
        async () => {
          const companyId =
            await this.authorization.requireComplaintRead(actor);
          const empty = {
            companyId,
            complaints: [],
            total: 0,
            offset,
            pageSize: 25,
          };
          // Each owner supplies its real eligibility query. No Client/Project
          // permission predicates or full registers are copied into Complaints.
          const clientScope = await this.clients
            .prepareOperationalReadSelection(actor)
            .catch((error: unknown) => {
              if (error instanceof ForbiddenException) return null;
              throw error;
            });
          if (clientScope === null) return empty;
          let projectCondition: SQL | undefined = isNull(complaints.projectId);
          try {
            const projectScope =
              await this.projects.prepareReferenceReadSelection(actor);
            projectCondition = or(
              projectCondition,
              inArray(complaints.projectId, projectScope.selection),
            );
          } catch (error) {
            // Lack of optional Project reads filters linked records, never the
            // independent authorized complaints that have no Project.
            if (!(error instanceof ForbiddenException)) throw error;
          }
          const scope = and(
            eq(complaints.workspaceId, actor.workspaceId),
            eq(complaints.companyId, companyId),
            inArray(complaints.clientAccountId, clientScope.selection),
            projectCondition,
          );
          const [summary] = await this.database.connection
            .select({ total: count() })
            .from(complaints)
            .where(scope);
          if (!summary)
            throw new Error('Complaint register count is unavailable.');
          const rows = await this.database.connection
            .select()
            .from(complaints)
            .where(scope)
            .orderBy(asc(complaints.createdAt), asc(complaints.id))
            .limit(25)
            .offset(offset);
          const records: ComplaintView[] = [];
          // Live Client/Project authority was already held by the scope owners.
          // Project this page in that same snapshot; taking new Client row locks
          // after a concurrent material write would ask PostgreSQL to leave it.
          for (const row of rows)
            records.push(
              await this.view(actor, row, { lockReferenceAuthority: false }),
            );
          return {
            companyId,
            complaints: records,
            total: summary.total,
            offset,
            pageSize: 25,
          };
        },
        { isolationLevel: 'repeatable read' },
      ),
    );
  }

  async read(actor: ActorContext, value: unknown): Promise<ComplaintView> {
    const id = requireUuid(value);
    return protectComplaintOutcome(() =>
      this.database.transaction(() => this.readWithinSnapshot(actor, id), {
        isolationLevel: 'repeatable read',
      }),
    );
  }

  history(
    actor: ActorContext,
    value: unknown,
    pageOffset: unknown,
  ): Promise<ComplaintHistoryPage> {
    const complaintId = requireUuid(value);
    const offset = readComplaintOffset(pageOffset);
    return protectComplaintOutcome(() =>
      this.database.transaction(
        async () => {
          const complaint = await this.readWithinSnapshot(actor, complaintId);
          return readComplaintHistorySnapshot({
            database: this.database,
            actor,
            complaint,
            offset,
          });
        },
        { isolationLevel: 'repeatable read' },
      ),
    );
  }

  recordJournal({
    actor,
    complaintId,
    input,
    key,
    target,
  }: {
    actor: ActorContext;
    complaintId: unknown;
    input: unknown;
    key: string | undefined;
    target:
      { kind: 'append' } | { kind: 'correction'; originalEntryId: unknown };
  }): Promise<ComplaintView> {
    return writeComplaintJournal({
      actor,
      complaintId,
      input,
      key,
      target,
      database: this.database,
      authorization: this.authorization,
      clients: this.clients,
      projects: this.projects,
      accountability: this.accountability,
      clock: this.clock,
      readView: (row) => this.view(actor, row),
    });
  }

  // The caller owns one snapshot; public reads must never open nested
  // DatabaseContext transactions for related authorization or history counts.
  private async readWithinSnapshot(
    actor: ActorContext,
    id: string,
  ): Promise<ComplaintView> {
    const companyId = await this.authorization.requireComplaintRead(actor);
    const [row] = await this.database.connection
      .select()
      .from(complaints)
      .where(
        and(
          eq(complaints.workspaceId, actor.workspaceId),
          eq(complaints.companyId, companyId),
          eq(complaints.id, id),
        ),
      );
    if (!row) throw new NotFoundException();
    return this.view(actor, row);
  }

  record({
    actor,
    input: value,
    key,
  }: {
    actor: ActorContext;
    input: unknown;
    key: string | undefined;
  }): Promise<ComplaintView> {
    const input = readComplaintRecord(value);
    const idempotencyKey = requireIdempotencyKey(key);
    const fingerprint = commandFingerprint({
      operation: 'record',
      companyId: actor.activeCompany?.id,
      ...input,
    });
    return protectComplaintOutcome(() =>
      runIdempotentCommand(this.database, {
        fingerprint,
        authorize: async () => {
          const companyId = await this.authorization.requireComplaintRecord(
            actor,
            true,
          );
          if (input.responsibleMembershipId !== actor.workspaceMembershipId)
            throw new ForbiddenException();
          // Historical retries retain original identity and current reads before
          // the new-material-write active-original requirement below.
          const references = await this.clients.readProjectReferences(
            actor,
            [input.clientAccountId],
            true,
            true,
          );
          if (!references.has(input.clientAccountId))
            throw new NotFoundException();
          if (input.projectId !== null) {
            await this.authorization.requireProjectReadPermission(actor, true);
            const project = await this.projects.read(actor, input.projectId);
            if (project.clientAccountId !== input.clientAccountId)
              throw new NotFoundException();
          }
          return companyId;
        },
        lockParts: (companyId) => [
          'complaint-command',
          actor.workspaceId,
          companyId,
          actor.workspaceMembershipId,
          idempotencyKey,
        ],
        findReceipt: async (companyId) => {
          const [receipt] = await this.database.connection
            .select()
            .from(complaintReceipts)
            .where(
              and(
                eq(complaintReceipts.workspaceId, actor.workspaceId),
                eq(complaintReceipts.companyId, companyId),
                eq(
                  complaintReceipts.actorMembershipId,
                  actor.workspaceMembershipId,
                ),
                eq(complaintReceipts.idempotencyKey, idempotencyKey),
              ),
            );
          return receipt;
        },
        conflict: () => idempotencyConflict(),
        replay: async (companyId, receipt) => {
          const result = readComplaintReceipt(receipt.response);
          if (
            result.workspaceId !== actor.workspaceId ||
            result.companyId !== companyId ||
            result.id !== receipt.complaintId
          )
            throw new Error('Invalid persisted Complaint receipt scope.');
          return result;
        },
        execute: async (companyId) => {
          await this.clients.lockActiveReferenceClient(
            actor,
            input.clientAccountId,
          );
          const occurredAt = this.clock.now();
          const id = randomUUID();
          const [row] = await this.database.connection
            .insert(complaints)
            .values({
              id,
              workspaceId: actor.workspaceId,
              companyId,
              clientAccountId: input.clientAccountId,
              projectId: input.projectId,
              responsibleMembershipId: actor.workspaceMembershipId,
              responsibleDisplayLabel: actor.displayName,
              createdByInternalUserId: actor.internalUserId,
              revision: 1,
              latestIntakeRevision: 1,
              createdAt: occurredAt,
            })
            .returning();
          if (!row) throw new Error('Complaint intake was not recorded.');
          await this.database.connection
            .insert(complaintIntakeVersions)
            .values({
              workspaceId: actor.workspaceId,
              companyId,
              complaintId: id,
              revision: 1,
              intake: input.intake,
              actorMembershipId: actor.workspaceMembershipId,
              actorInternalUserId: actor.internalUserId,
              actorDisplayLabel: actor.displayName,
              occurredAt,
            });
          await this.clients.recordReferenceUse(actor, input.clientAccountId);
          await this.accountability.recordComplaintEvent({
            actor,
            companyId,
            complaintId: id,
            occurredAt,
            action: 'complaint.recorded',
            revision: 1,
          });
          const result = await this.view(actor, row);
          await this.database.connection.insert(complaintReceipts).values({
            workspaceId: actor.workspaceId,
            companyId,
            actorMembershipId: actor.workspaceMembershipId,
            idempotencyKey,
            complaintId: id,
            fingerprint,
            response: result,
          });
          return result;
        },
      }),
    );
  }

  correctIntake({
    actor,
    complaintId: value,
    input: body,
    key,
  }: {
    actor: ActorContext;
    complaintId: unknown;
    input: unknown;
    key: string | undefined;
  }): Promise<ComplaintView> {
    const complaintId = requireUuid(value);
    const input = readComplaintIntakeCorrection(body);
    const idempotencyKey = requireIdempotencyKey(key);
    const fingerprint = commandFingerprint({
      operation: 'correct-intake',
      companyId: actor.activeCompany?.id,
      complaintId,
      ...input,
    });
    return protectComplaintOutcome(() =>
      runIdempotentCommand(this.database, {
        fingerprint,
        authorize: async () => {
          const companyId = await this.authorization.requireComplaintRecord(
            actor,
            true,
          );
          const [row] = await this.database.connection
            .select()
            .from(complaints)
            .where(
              and(
                eq(complaints.workspaceId, actor.workspaceId),
                eq(complaints.companyId, companyId),
                eq(complaints.id, complaintId),
              ),
            );
          if (!row) throw new NotFoundException();
          const references = await this.clients.readProjectReferences(
            actor,
            [row.clientAccountId],
            true,
            true,
          );
          if (!references.has(row.clientAccountId))
            throw new NotFoundException();
          if (row.projectId !== null) {
            await this.authorization.requireProjectReadPermission(actor, true);
            const project = await this.projects.read(actor, row.projectId);
            if (project.clientAccountId !== row.clientAccountId)
              throw new NotFoundException();
          }
          return { companyId, originalClientId: row.clientAccountId };
        },
        lockParts: ({ companyId }) => [
          'complaint-command',
          actor.workspaceId,
          companyId,
          actor.workspaceMembershipId,
          idempotencyKey,
        ],
        findReceipt: async ({ companyId }) => {
          const [receipt] = await this.database.connection
            .select()
            .from(complaintReceipts)
            .where(
              and(
                eq(complaintReceipts.workspaceId, actor.workspaceId),
                eq(complaintReceipts.companyId, companyId),
                eq(
                  complaintReceipts.actorMembershipId,
                  actor.workspaceMembershipId,
                ),
                eq(complaintReceipts.idempotencyKey, idempotencyKey),
              ),
            );
          return receipt;
        },
        conflict: () => idempotencyConflict(),
        replay: async ({ companyId }, receipt) => {
          const result = readComplaintReceipt(receipt.response);
          if (
            result.workspaceId !== actor.workspaceId ||
            result.companyId !== companyId ||
            result.id !== complaintId ||
            receipt.complaintId !== complaintId
          )
            throw new Error('Invalid persisted Complaint receipt scope.');
          return result;
        },
        execute: async ({ companyId, originalClientId }) => {
          await this.clients.lockActiveReferenceClient(actor, originalClientId);
          const [row] = await this.database.connection
            .select()
            .from(complaints)
            .where(
              and(
                eq(complaints.workspaceId, actor.workspaceId),
                eq(complaints.companyId, companyId),
                eq(complaints.id, complaintId),
              ),
            )
            .for('update');
          if (!row) throw new NotFoundException();
          if (row.revision !== input.expectedRevision)
            throw staleVersionConflict(
              'Reload the current Complaint before correcting its intake.',
            );
          const current = await this.view(actor, row);
          let result = current;
          if (
            commandFingerprint({ ...current.currentIntake }) !==
            commandFingerprint({ ...input.intake })
          ) {
            if (row.revision >= 2147483647)
              throw new ConflictException('Complaint revision is exhausted.');
            const revision = row.revision + 1;
            const occurredAt = this.clock.now();
            await this.database.connection
              .insert(complaintIntakeVersions)
              .values({
                workspaceId: actor.workspaceId,
                companyId,
                complaintId,
                revision,
                intake: input.intake,
                reason: input.reason,
                actorMembershipId: actor.workspaceMembershipId,
                actorInternalUserId: actor.internalUserId,
                actorDisplayLabel: actor.displayName,
                occurredAt,
              });
            const [updated] = await this.database.connection
              .update(complaints)
              .set({ revision, latestIntakeRevision: revision })
              .where(
                and(
                  eq(complaints.workspaceId, actor.workspaceId),
                  eq(complaints.companyId, companyId),
                  eq(complaints.id, complaintId),
                ),
              )
              .returning();
            if (!updated)
              throw new Error('Complaint correction was not recorded.');
            await this.clients.recordReferenceUse(actor, originalClientId);
            await this.accountability.recordComplaintEvent({
              actor,
              companyId,
              complaintId,
              occurredAt,
              action: 'complaint.intake.corrected',
              revision,
            });
            result = await this.view(actor, updated);
          }
          await this.database.connection.insert(complaintReceipts).values({
            workspaceId: actor.workspaceId,
            companyId,
            actorMembershipId: actor.workspaceMembershipId,
            idempotencyKey,
            complaintId,
            fingerprint,
            response: result,
          });
          return result;
        },
      }),
    );
  }

  private async view(
    actor: ActorContext,
    row: ComplaintRow,
    {
      lockReferenceAuthority = true,
    }: { lockReferenceAuthority?: boolean } = {},
  ): Promise<ComplaintView> {
    const references = await this.clients.readProjectReferences(
      actor,
      [row.clientAccountId],
      lockReferenceAuthority,
    );
    const client = references.get(row.clientAccountId);
    if (!client) throw new NotFoundException();
    const versions = await this.database.connection
      .select()
      .from(complaintIntakeVersions)
      .where(
        and(
          eq(complaintIntakeVersions.workspaceId, actor.workspaceId),
          eq(complaintIntakeVersions.companyId, row.companyId),
          eq(complaintIntakeVersions.complaintId, row.id),
          inArray(complaintIntakeVersions.revision, [
            1,
            row.latestIntakeRevision,
          ]),
        ),
      );
    const decoded = versions.map((version) => ({
      revision: version.revision,
      intake: readComplaintIntake(version.intake),
    }));
    const original = decoded.find((version) => version.revision === 1);
    const current = decoded.find(
      (version) => version.revision === row.latestIntakeRevision,
    );
    if (!original || !current)
      throw new Error('Recorded Complaint intake is unavailable.');
    const common = {
      id: row.id,
      workspaceId: row.workspaceId,
      companyId: row.companyId,
      clientAccountId: row.clientAccountId,
      clientDisplayName: client.displayName,
      revision: row.revision,
      createdAt: row.createdAt.toISOString(),
      responsible: {
        workspaceMembershipId: row.responsibleMembershipId,
        displayLabel: row.responsibleDisplayLabel,
      },
      originalIntake: original.intake,
      currentIntake: current.intake,
    };
    if (row.projectId === null)
      return { ...common, projectId: null, project: null };
    const project = await this.projects.read(actor, row.projectId);
    if (project.clientAccountId !== row.clientAccountId)
      throw new NotFoundException();
    return {
      ...common,
      projectId: row.projectId,
      project: { id: project.id, title: project.title },
    };
  }
}
