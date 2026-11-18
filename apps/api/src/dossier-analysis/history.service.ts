import { createHmac, timingSafeEqual } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { and, desc, eq, lt, or, sql } from 'drizzle-orm';
import { requireUuid } from '../access/access-command-validation.js';
import type { ActorContext } from '../access/access.types.js';
import { DatabaseContext } from '../database/database-context.js';
import { dossierAnalysisRuns } from '../database/schema/dossier-analysis.js';
import { prepareHistoryPage, readHistoryManifest } from './history.js';
import { DossierRunService } from './run.service.js';
import { DossierSourceService } from './source.service.js';

type Current = Awaited<
  ReturnType<DossierRunService['captureWithinTransaction']>
>;
/** Bounded history reads only compact manifests and authorizes each distinct original once. */
@Injectable()
export class DossierHistoryService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly runs: DossierRunService,
    private readonly sources: DossierSourceService,
  ) {}
  async pageWithinTransaction(
    actor: ActorContext,
    projectId: string,
    cursorValue: string | null,
    current: Current,
  ) {
    const project = await this.sources.projectWithinTransaction(
      actor,
      projectId,
      false,
    );
    let position: { id: string; at: Date } | null = null;
    if (cursorValue !== null) {
      if (cursorValue.length > 2048)
        throw new BadRequestException('Invalid history cursor.');
      let decoded: unknown;
      try {
        decoded = JSON.parse(
          Buffer.from(cursorValue, 'base64url').toString('utf8'),
        );
      } catch {
        throw new BadRequestException('Invalid history cursor.');
      }
      if (
        !Array.isArray(decoded) ||
        decoded.length !== 3 ||
        typeof decoded[0] !== 'string' ||
        typeof decoded[1] !== 'string' ||
        typeof decoded[2] !== 'string' ||
        !/^[a-f0-9]{64}$/u.test(decoded[2])
      )
        throw new BadRequestException('Invalid history cursor.');
      const id = requireUuid(decoded[0]),
        at = new Date(decoded[1]);
      if (Number.isNaN(at.valueOf()) || at.toISOString() !== decoded[1])
        throw new BadRequestException('Invalid history cursor.');
      const [previous] = await this.database.connection
        .select({
          cursorKey: dossierAnalysisRuns.cursorKey,
          createdAt: dossierAnalysisRuns.createdAt,
        })
        .from(dossierAnalysisRuns)
        .where(
          and(
            eq(dossierAnalysisRuns.workspaceId, actor.workspaceId),
            eq(dossierAnalysisRuns.companyId, project.companyId),
            eq(dossierAnalysisRuns.projectId, projectId),
            eq(dossierAnalysisRuns.id, id),
          ),
        );
      if (!previous || previous.createdAt.toISOString() !== decoded[1])
        throw new BadRequestException('Invalid history cursor.');
      const expected = Buffer.from(
          this.sign(
            actor,
            project.companyId,
            projectId,
            id,
            decoded[1],
            previous.cursorKey,
            current.identity,
          ),
          'hex',
        ),
        received = Buffer.from(decoded[2], 'hex');
      if (!timingSafeEqual(expected, received))
        throw new BadRequestException('Invalid history cursor.');
      position = { id, at };
    }
    const snapshot = dossierAnalysisRuns.snapshot;
    const manifest = sql<unknown>`jsonb_build_object(
      'format', ${snapshot}->'format', 'identity', ${snapshot}->'identity',
      'sourceHash', ${snapshot}->'sourceHash', 'pipelineVersion', ${snapshot}->'pipelineVersion',
      'parserVersion', ${snapshot}->'parserVersion', 'missingDocuments', ${snapshot}->'missingDocuments',
      'sources', CASE WHEN jsonb_typeof(${snapshot}->'sources') = 'array' THEN
        (SELECT jsonb_agg(jsonb_build_object('id', element.value->'id', 'documentId', element.value->'documentId', 'documentVersionId', element.value->'documentVersionId', 'representationId', element.value->'representationId', 'sourceSha256', element.value->'sourceSha256') ORDER BY element.ordinal)
         FROM jsonb_array_elements(${snapshot}->'sources') WITH ORDINALITY AS element(value, ordinal))
        ELSE NULL END)`;
    const rows = await this.database.connection
      .select({
        id: dossierAnalysisRuns.id,
        snapshotHash: dossierAnalysisRuns.snapshotHash,
        createdAt: dossierAnalysisRuns.createdAt,
        cursorKey: dossierAnalysisRuns.cursorKey,
        manifest,
      })
      .from(dossierAnalysisRuns)
      .where(
        and(
          eq(dossierAnalysisRuns.workspaceId, actor.workspaceId),
          eq(dossierAnalysisRuns.companyId, project.companyId),
          eq(dossierAnalysisRuns.projectId, projectId),
          position === null
            ? undefined
            : or(
                lt(dossierAnalysisRuns.createdAt, position.at),
                and(
                  eq(dossierAnalysisRuns.createdAt, position.at),
                  lt(dossierAnalysisRuns.id, position.id),
                ),
              ),
        ),
      )
      .orderBy(
        desc(dossierAnalysisRuns.createdAt),
        desc(dossierAnalysisRuns.id),
      )
      .limit(6);
    const entries = rows.map((row) => ({
      ...row,
      manifest: readHistoryManifest(row.manifest, row.snapshotHash),
    }));
    const selected = current.selected.map(({ row }) => ({
      id: row.id,
      documentId: row.documentId,
      documentVersionId: row.versionId,
      representationId: row.representationId,
      sourceSha256: row.sha256,
    }));
    const runs = await prepareHistoryPage({
      rows: entries,
      currentIdentity: current.identity,
      visibleDocuments: current.documents,
      selected,
      authorize: async (sources) =>
        this.sources.authorizeHistoricalWithinTransaction(
          actor,
          projectId,
          sources,
          false,
        ),
    });
    const last = rows[4];
    const runsNextCursor =
      rows.length > 5 && last
        ? Buffer.from(
            JSON.stringify([
              last.id,
              last.createdAt.toISOString(),
              this.sign(
                actor,
                project.companyId,
                projectId,
                last.id,
                last.createdAt.toISOString(),
                last.cursorKey,
                current.identity,
              ),
            ]),
          ).toString('base64url')
        : null;
    return { runs, runsNextCursor };
  }
  private sign(
    actor: ActorContext,
    companyId: string,
    projectId: string,
    id: string,
    at: string,
    key: string,
    currentIdentity: string,
  ) {
    return createHmac('sha256', key)
      .update(
        JSON.stringify([
          'dossier-history/v1',
          actor.workspaceId,
          actor.workspaceMembershipId,
          companyId,
          projectId,
          id,
          at,
          currentIdentity,
        ]),
      )
      .digest('hex');
  }
}
