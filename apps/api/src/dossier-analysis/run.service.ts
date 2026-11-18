import { runClientReferenceTransaction } from '../client/client-reference-transaction.js';
import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import {
  requireIdempotencyKey,
  requireUuid,
} from '../access/access-command-validation.js';
import type { ActorContext } from '../access/access.types.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  dossierAnalysisEvents,
  dossierAnalysisRuns,
} from '../database/schema/dossier-analysis.js';
import { DOCUMENT_TEXT_PARSER_VERSION } from '../document-text-extraction/index.js';
import { commandFingerprint } from '../command/idempotent-command.js';
import {
  analyzeDossier,
  type EvidenceSource,
} from '../dossier-analysis-engine/index.js';
import { readSnapshot, snapshotIdentityHash } from './snapshot.js';
import { readResult } from './result.js';
import { extractRunSources } from './run-extraction.js';
import { requireVisibleMissing } from './visible-missing.js';
import {
  createContextBundle,
  DOSSIER_ANALYSIS_PIPELINE_VERSION,
  FIELDS,
  searchDossier,
  type SearchFilters,
  type SearchMode,
} from '../dossier-analysis-engine/index.js';
import { DossierInventoryService } from './inventory.service.js';
import { DossierSourceService } from './source.service.js';

@Injectable()
export class DossierRunService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly sourceService: DossierSourceService,
    private readonly inventory: DossierInventoryService,
  ) {}

  private write<T>(work: () => Promise<T>) {
    return runClientReferenceTransaction({ database: this.database, work });
  }

  projectWithinTransaction(
    actor: ActorContext,
    projectId: string,
    write: boolean,
  ) {
    return this.sourceService.projectWithinTransaction(actor, projectId, write);
  }

  async captureWithinTransaction(
    actor: ActorContext,
    projectId: string,
    write: boolean,
  ) {
    const selected = await this.sourceService.captureWithinTransaction(
      actor,
      projectId,
      write,
    );
    const inventory = await this.inventory.listWithinTransaction(
      actor,
      projectId,
      write,
    );
    const selectedIds = new Set(selected.map((entry) => entry.row.documentId));
    const missing = inventory.documents.filter(
      (document) => !selectedIds.has(document.documentId),
    );
    const identity = createHash('sha256')
      .update(
        JSON.stringify({
          pipelineVersion: DOSSIER_ANALYSIS_PIPELINE_VERSION,
          parserVersion: DOCUMENT_TEXT_PARSER_VERSION,
          selected: selected.map(({ row, live }) => ({
            id: row.id,
            documentId: row.documentId,
            versionId: row.versionId,
            representationId: row.representationId,
            sha256: row.sha256,
            projectRevision: live.document.projectRevision,
            workingRevision: live.document.workingRevision,
            versionStatus: live.version.status,
            caseRevision: live.caseRevision,
          })),
          missing,
        }),
      )
      .digest('hex');
    return { selected, missing, identity, documents: inventory.documents };
  }

  async create(
    actor: ActorContext,
    projectIdValue: unknown,
    body: unknown,
    keyValue: string | undefined,
  ) {
    const projectId = requireUuid(projectIdValue);
    const key = requireIdempotencyKey(keyValue);
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).length
    )
      throw new BadRequestException('Invalid run request.');
    const fingerprint = commandFingerprint(['run', projectId, body]);
    const first = await this.write(async () => {
      const capture = await this.captureWithinTransaction(
        actor,
        projectId,
        true,
      );
      const lockKey = JSON.stringify([
        'dossier-analysis',
        actor.workspaceId,
        actor.workspaceMembershipId,
        key,
      ]);
      await this.database.connection.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
      );
      const [receipt] = await this.database.connection
        .select()
        .from(dossierAnalysisEvents)
        .where(
          and(
            eq(dossierAnalysisEvents.workspaceId, actor.workspaceId),
            eq(
              dossierAnalysisEvents.actorMembershipId,
              actor.workspaceMembershipId,
            ),
            eq(dossierAnalysisEvents.idempotencyKey, key),
          ),
        );
      if (receipt) {
        if (
          receipt.projectId !== projectId ||
          receipt.companyId !== actor.activeCompany?.id ||
          receipt.action !== 'run.created' ||
          receipt.fingerprint !== fingerprint
        )
          throw new ConflictException('Idempotency-Key was already used.');
        await this.frozenWithinTransaction(
          actor,
          projectId,
          receipt.targetId,
          true,
        );
        return { kind: 'replay' as const, id: receipt.targetId };
      }
      if (!capture.selected.length)
        throw new BadRequestException('Select at least one source.');
      return { kind: 'new' as const, capture };
    });
    if (first.kind === 'replay') return { id: first.id };
    const sources: EvidenceSource[] = [];
    const extractions = await extractRunSources(
      first.capture.selected.map(({ row, bytes }) => ({
        bytes,
        kind: row.kind,
      })),
    );
    for (const [index, { row, live }] of first.capture.selected.entries()) {
      const extraction = extractions[index];
      if (!extraction)
        throw new ServiceUnavailableException('The extraction is unavailable.');
      sources.push({
        id: row.id,
        documentId: row.documentId,
        documentVersionId: row.versionId,
        representationId: row.representationId,
        sourceSha256: row.sha256,
        fileName: row.fileName,
        documentTitle: live.document.title,
        documentType: live.document.type,
        versionNumber: live.version.number,
        versionStatus: live.version.status,
        language: row.language,
        extraction,
      });
    }
    const result = analyzeDossier({
      sources,
      missingDocuments: first.capture.missing,
    });
    const publicHash = snapshotIdentityHash({
      identity: first.capture.identity,
      sourceHash: result.snapshotHash,
      pipelineVersion: DOSSIER_ANALYSIS_PIPELINE_VERSION,
      parserVersion: DOCUMENT_TEXT_PARSER_VERSION,
      missingDocuments: first.capture.missing,
      sources,
    });
    return this.write(async () => {
      const capture = await this.captureWithinTransaction(
        actor,
        projectId,
        true,
      );
      const lockKey = JSON.stringify([
        'dossier-analysis',
        actor.workspaceId,
        actor.workspaceMembershipId,
        key,
      ]);
      await this.database.connection.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
      );
      const [receipt] = await this.database.connection
        .select()
        .from(dossierAnalysisEvents)
        .where(
          and(
            eq(dossierAnalysisEvents.workspaceId, actor.workspaceId),
            eq(
              dossierAnalysisEvents.actorMembershipId,
              actor.workspaceMembershipId,
            ),
            eq(dossierAnalysisEvents.idempotencyKey, key),
          ),
        );
      if (receipt) {
        if (
          receipt.projectId !== projectId ||
          receipt.companyId !== actor.activeCompany?.id ||
          receipt.fingerprint !== fingerprint ||
          receipt.action !== 'run.created'
        )
          throw new ConflictException('Idempotency-Key was already used.');
        await this.frozenWithinTransaction(
          actor,
          projectId,
          receipt.targetId,
          true,
        );
        return { id: receipt.targetId };
      }
      if (capture.identity !== first.capture.identity)
        throw new ConflictException('Sources changed; reload and rerun.');
      const companyId = first.capture.selected[0].row.companyId;
      const runs = await this.database.connection
        .select({ id: dossierAnalysisRuns.id })
        .from(dossierAnalysisRuns)
        .where(
          and(
            eq(dossierAnalysisRuns.workspaceId, actor.workspaceId),
            eq(dossierAnalysisRuns.companyId, companyId),
            eq(dossierAnalysisRuns.projectId, projectId),
          ),
        )
        .limit(100);
      if (runs.length >= 100)
        throw new ConflictException('The run limit has been reached.');
      const id = randomUUID(),
        now = new Date();
      await this.database.connection.insert(dossierAnalysisRuns).values({
        id,
        workspaceId: actor.workspaceId,
        companyId,
        projectId,
        snapshotHash: publicHash,
        snapshot: {
          format: 'DOSSIER_ANALYSIS_SNAPSHOT/1',
          pipelineVersion: DOSSIER_ANALYSIS_PIPELINE_VERSION,
          parserVersion: DOCUMENT_TEXT_PARSER_VERSION,
          sourceHash: result.snapshotHash,
          identity: capture.identity,
          sources,
          missingDocuments: capture.missing,
        },
        result: { ...result, snapshotHash: publicHash },
        createdByMembershipId: actor.workspaceMembershipId,
        createdAt: now,
      });
      await this.database.connection.insert(dossierAnalysisEvents).values({
        id: randomUUID(),
        workspaceId: actor.workspaceId,
        companyId,
        projectId,
        actorMembershipId: actor.workspaceMembershipId,
        idempotencyKey: key,
        fingerprint,
        action: 'run.created',
        targetId: id,
        receipt: { id },
        recordedAt: now,
      });
      return { id };
    });
  }
  async frozenWithinTransaction(
    actor: ActorContext,
    projectId: string,
    runId: string,
    write: boolean,
  ) {
    const project = await this.sourceService.projectWithinTransaction(
      actor,
      projectId,
      write,
    );
    const [row] = await this.database.connection
      .select()
      .from(dossierAnalysisRuns)
      .where(
        and(
          eq(dossierAnalysisRuns.workspaceId, actor.workspaceId),
          eq(dossierAnalysisRuns.companyId, project.companyId),
          eq(dossierAnalysisRuns.projectId, projectId),
          eq(dossierAnalysisRuns.id, runId),
        ),
      );
    if (!row) throw new NotFoundException();
    const snapshot = readSnapshot(row.snapshot, row.snapshotHash);
    const authorized =
      await this.sourceService.authorizeHistoricalWithinTransaction(
        actor,
        projectId,
        snapshot.sources,
        write,
      );
    const current = await this.captureWithinTransaction(
      actor,
      projectId,
      write,
    );
    requireVisibleMissing(snapshot.missingDocuments, current.documents);
    const result = readResult(row.result, {
      snapshotHash: row.snapshotHash,
      pipelineVersion: snapshot.pipelineVersion,
      sources: snapshot.sources,
      missingDocuments: snapshot.missingDocuments,
    });
    return {
      row,
      snapshot,
      sourceRows: authorized.rows,
      stale: current.identity !== snapshot.identity,
      result,
    };
  }

  async detail(actor: ActorContext, projectValue: unknown, runValue: unknown) {
    const projectId = requireUuid(projectValue),
      runId = requireUuid(runValue);
    return this.database.transaction(
      async () => {
        const frozen = await this.frozenWithinTransaction(
          actor,
          projectId,
          runId,
          false,
        );
        const sources = frozen.snapshot.sources.map((source) => {
          const metadata = frozen.sourceRows.find(
            (row) => row.id === source.id,
          );
          if (!metadata) throw new NotFoundException();
          return {
            ...source,
            kind: metadata.kind,
            sizeBytes: metadata.size,
            mediaType:
              metadata.kind === 'pdf'
                ? 'application/pdf'
                : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          };
        });
        return {
          id: runId,
          snapshotHash: frozen.row.snapshotHash,
          createdAt: frozen.row.createdAt.toISOString(),
          stale: frozen.stale,
          sources,
          candidates: frozen.result.candidates,
          comparisons: frozen.result.comparisons,
          coverage: frozen.result.coverage,
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  async context(actor: ActorContext, projectValue: unknown, runValue: unknown) {
    const projectId = requireUuid(projectValue),
      runId = requireUuid(runValue);
    return this.database.transaction(
      async () => {
        const frozen = await this.frozenWithinTransaction(
          actor,
          projectId,
          runId,
          false,
        );
        if (
          frozen.snapshot.pipelineVersion !== DOSSIER_ANALYSIS_PIPELINE_VERSION
        )
          throw new ConflictException(
            'The historical pipeline is unavailable.',
          );
        return {
          ...createContextBundle({
            sources: frozen.snapshot.sources,
            missingDocuments: frozen.snapshot.missingDocuments,
            maxBytes: 1024 * 1024,
          }),
          runId,
          snapshotHash: frozen.row.snapshotHash,
          stale: frozen.stale,
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  async search(
    actor: ActorContext,
    projectValue: unknown,
    runValue: unknown,
    value: unknown,
  ) {
    const projectId = requireUuid(projectValue),
      runId = requireUuid(runValue);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new BadRequestException('Invalid search.');
    const query = Object.fromEntries(Object.entries(value));
    if (
      Object.keys(query).some(
        (key) =>
          ![
            'query',
            'mode',
            'cursor',
            'limit',
            'sourceId',
            'field',
            'language',
            'versionStatus',
            'kind',
            'documentId',
            'history',
          ].includes(key),
      ) ||
      typeof query.query !== 'string' ||
      (query.mode !== 'literal' &&
        query.mode !== 'lexical' &&
        query.mode !== 'fuzzy')
    )
      throw new BadRequestException('Invalid search.');
    if (query.history !== undefined && query.history !== 'true')
      throw new BadRequestException('Invalid history selection.');
    const history = query.history === 'true';
    const mode: SearchMode = query.mode;
    const limit =
      query.limit === undefined
        ? 20
        : typeof query.limit === 'string' && /^\d+$/u.test(query.limit)
          ? Number(query.limit)
          : 0;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50)
      throw new BadRequestException('Invalid search.');
    const filters: SearchFilters = {};
    if (query.sourceId !== undefined)
      filters.sourceId = requireUuid(query.sourceId);
    if (query.documentId !== undefined)
      filters.documentId = requireUuid(query.documentId);
    if (query.field !== undefined) {
      const field = FIELDS.find((f) => f === query.field);
      if (!field) throw new BadRequestException('Invalid field.');
      filters.field = field;
    }
    if (query.kind !== undefined) {
      if (typeof query.kind !== 'string' || query.kind.length > 100)
        throw new BadRequestException('Invalid kind.');
      filters.kind = query.kind;
    }
    if (query.language !== undefined) {
      if (
        query.language !== 'ro' &&
        query.language !== 'ru' &&
        query.language !== 'fr' &&
        query.language !== 'en'
      )
        throw new BadRequestException('Invalid language.');
      filters.language = query.language;
    }
    if (query.versionStatus !== undefined) {
      if (
        query.versionStatus !== 'draft' &&
        query.versionStatus !== 'official' &&
        query.versionStatus !== 'superseded'
      )
        throw new BadRequestException('Invalid status.');
      filters.versionStatus = query.versionStatus;
    }
    return this.database.transaction(
      async () => {
        const frozen = await this.frozenWithinTransaction(
          actor,
          projectId,
          runId,
          false,
        );
        if (frozen.stale && !history)
          throw new ConflictException(
            'Select historical search or rerun the analysis.',
          );
        if (
          frozen.snapshot.pipelineVersion !== DOSSIER_ANALYSIS_PIPELINE_VERSION
        )
          throw new ConflictException(
            'The historical pipeline is unavailable.',
          );
        const sign = (cursor: string) =>
          createHmac('sha256', frozen.row.cursorKey)
            .update(
              JSON.stringify([
                actor.workspaceId,
                actor.workspaceMembershipId,
                projectId,
                runId,
                limit,
                history,
                cursor,
              ]),
            )
            .digest('hex');
        let cursor: string | undefined;
        if (query.cursor !== undefined) {
          if (typeof query.cursor !== 'string' || query.cursor.length > 4096)
            throw new BadRequestException('Invalid cursor.');
          let decoded: unknown;
          try {
            decoded = JSON.parse(
              Buffer.from(query.cursor, 'base64url').toString('utf8'),
            );
          } catch {
            throw new BadRequestException('Invalid cursor.');
          }
          if (
            !Array.isArray(decoded) ||
            decoded.length !== 2 ||
            typeof decoded[0] !== 'string' ||
            typeof decoded[1] !== 'string' ||
            !/^[a-f0-9]{64}$/u.test(decoded[1])
          )
            throw new BadRequestException('Invalid cursor.');
          const expected = Buffer.from(sign(decoded[0]), 'hex'),
            received = Buffer.from(decoded[1], 'hex');
          if (!timingSafeEqual(expected, received))
            throw new BadRequestException('Invalid cursor.');
          cursor = decoded[0];
        }
        type Hit = ReturnType<typeof searchDossier>['hits'][number];
        const hits: Array<
          Omit<Hit, 'source'> & {
            source: Hit['source'] & {
              kind: 'pdf' | 'docx';
              sizeBytes: number;
              mediaType: string;
            };
          }
        > = [];
        let continuation = cursor;
        let nextCursor: string | null = null;
        let truncated = false;
        for (let index = 0; index < limit; index++) {
          let found: ReturnType<typeof searchDossier>;
          try {
            found = searchDossier({
              sources: frozen.snapshot.sources,
              query: query.query,
              mode,
              filters,
              limit: 1,
              ...(continuation === undefined ? {} : { cursor: continuation }),
            });
          } catch {
            throw new BadRequestException('Invalid search or cursor.');
          }
          truncated ||= found.truncated;
          const hit = found.hits[0];
          if (!hit) {
            nextCursor = null;
            break;
          }
          const metadata = frozen.sourceRows.find(
            (row) => row.id === hit.source.id,
          );
          if (!metadata) throw new NotFoundException();
          const enriched = {
            ...hit,
            source: {
              ...hit.source,
              extraction: { ...hit.source.extraction, passages: [] },
              kind: metadata.kind,
              sizeBytes: metadata.size,
              mediaType:
                metadata.kind === 'pdf'
                  ? 'application/pdf'
                  : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            },
          };
          if (
            Buffer.byteLength(JSON.stringify([...hits, enriched]), 'utf8') >
            1024 * 1024 - 8192
          ) {
            if (!hits.length || continuation === undefined)
              throw new PayloadTooLargeException(
                'The matching passage exceeds the search response limit.',
              );
            nextCursor = continuation;
            truncated = true;
            break;
          }
          hits.push(enriched);
          nextCursor = found.nextCursor;
          if (nextCursor === null) break;
          continuation = nextCursor;
        }
        return {
          snapshotHash: frozen.row.snapshotHash,
          hits,
          truncated,
          stale: frozen.stale,
          nextCursor:
            nextCursor === null
              ? null
              : Buffer.from(
                  JSON.stringify([nextCursor, sign(nextCursor)]),
                ).toString('base64url'),
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
}
