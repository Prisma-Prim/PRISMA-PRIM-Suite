import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import {
  requireIdempotencyKey,
  requireUuid,
} from '../access/access-command-validation.js';
import { commandFingerprint } from '../command/idempotent-command.js';
import { DatabaseContext } from '../database/database-context.js';
import { dossierAnalysisEvents } from '../database/schema/dossier-analysis.js';
import {
  dossierHarnessJobs as jobs,
  dossierHarnessCache as cache,
} from '../database/schema/dossier-harness.js';
import { DossierRunService } from '../dossier-analysis/run.service.js';
import {
  DossierSuggestionService,
  MAX_SUGGESTION_IMPORT_BYTES,
} from '../dossier-analysis/suggestion.service.js';
import {
  DOSSIER_ANALYSIS_PIPELINE_VERSION,
  MAX_PROPOSALS_PER_IMPORT,
  type ProposedSuggestion,
} from '../dossier-analysis-engine/index.js';
import {
  DossierHarnessConnectionService,
  ownerKey,
} from './connection.service.js';
import {
  HARNESS_VERSION,
  planDossierReview,
  readBatchProposals,
  reviewRequest,
} from './index.js';
import { PlanFailure } from './provider.js';
import { commandBody, commandText } from './commands.js';

type Job = typeof jobs.$inferSelect;
const hash = (s: string) => createHash('sha256').update(s).digest('hex');

@Injectable()
export class DossierHarnessJobService {
  constructor(
    private readonly db: DatabaseContext,
    private readonly connections: DossierHarnessConnectionService,
    private readonly runs: DossierRunService,
    private readonly suggestions: DossierSuggestionService,
  ) {}

  private filter(actor: ActorContext, projectId: string, companyId: string) {
    return and(
      eq(jobs.workspaceId, actor.workspaceId),
      eq(jobs.companyId, companyId),
      eq(jobs.projectId, projectId),
      eq(jobs.actorId, actor.workspaceMembershipId),
    );
  }
  private async row(
    actor: ActorContext,
    projectId: string,
    companyId: string,
    id: string,
  ) {
    const [row] = await this.db.connection
      .select()
      .from(jobs)
      .where(
        and(
          this.filter(actor, projectId, companyId),
          eq(jobs.id, requireUuid(id)),
        ),
      )
      .for('update');
    if (!row) throw new NotFoundException();
    return row;
  }
  private async frozen(actor: ActorContext, projectId: string, runId: string) {
    const frozen = await this.runs.frozenWithinTransaction(
      actor,
      projectId,
      runId,
      true,
    );
    if (frozen.snapshot.pipelineVersion !== DOSSIER_ANALYSIS_PIPELINE_VERSION)
      throw new ConflictException({ code: 'pipeline_changed' });
    return frozen;
  }
  private checkpoint(
    row: Job,
    frozen: Awaited<ReturnType<DossierHarnessJobService['frozen']>>,
  ) {
    const plan = planDossierReview(frozen.snapshot.sources);
    if (
      row.pipelineVersion !== HARNESS_VERSION ||
      row.snapshotHash !== frozen.row.snapshotHash ||
      row.totalBatches !== plan.batches.length ||
      !Array.isArray(row.checkpoint) ||
      row.checkpoint.length !== row.nextBatch ||
      row.cacheHits > row.nextBatch
    )
      throw new PlanFailure('invalid');
    const results = row.checkpoint.map((value: unknown, index) => {
      const batch = plan.batches[index];
      if (!batch) throw new PlanFailure('invalid');
      return readBatchProposals({
        sources: frozen.snapshot.sources,
        batch,
        value,
      });
    });
    return { plan, results };
  }
  private async view(
    row: Job,
    frozen: Awaited<ReturnType<DossierHarnessJobService['frozen']>>,
  ) {
    const { plan, results } = this.checkpoint(row, frozen);
    const [receipt] = await this.db.connection
      .select({ fingerprint: dossierAnalysisEvents.fingerprint })
      .from(dossierAnalysisEvents)
      .where(
        and(
          eq(dossierAnalysisEvents.workspaceId, row.workspaceId),
          eq(dossierAnalysisEvents.companyId, row.companyId),
          eq(dossierAnalysisEvents.projectId, row.projectId),
          eq(dossierAnalysisEvents.actorMembershipId, row.actorId),
          eq(dossierAnalysisEvents.action, 'suggestions.imported'),
          eq(dossierAnalysisEvents.idempotencyKey, 'harness-' + row.id),
        ),
      );
    const importFingerprint = commandFingerprint([
      'suggestions',
      row.projectId,
      row.runId,
      { snapshotHash: row.snapshotHash, suggestions: results.flat() },
    ]);
    return {
      imported: receipt?.fingerprint === importFingerprint,
      id: row.id,
      runId: row.runId,
      model: row.model,
      language: row.language,
      state:
        ['running', 'pausing'].includes(row.state) &&
        row.leaseUntil &&
        row.leaseUntil.getTime() <= Date.now()
          ? 'uncertain'
          : row.state,
      nextBatch: row.nextBatch,
      totalBatches: row.totalBatches,
      cacheHits: row.cacheHits,
      stale: frozen.stale,
      coverage: plan.coverage,
      proposals: results.flat(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
  async list(actor: ActorContext, projectId: string, runValue: unknown) {
    const runId = requireUuid(runValue);
    return this.connections.transaction(actor, projectId, async (companyId) => {
      const frozen = await this.frozen(actor, projectId, runId);
      const rows = await this.db.connection
        .select()
        .from(jobs)
        .where(
          and(this.filter(actor, projectId, companyId), eq(jobs.runId, runId)),
        )
        .orderBy(desc(jobs.createdAt), desc(jobs.id))
        .limit(10);
      const items = [];
      for (const row of rows) items.push(await this.view(row, frozen));
      return { items };
    });
  }
  async get(actor: ActorContext, projectId: string, id: string) {
    return this.connections.transaction(actor, projectId, async (companyId) => {
      const row = await this.row(actor, projectId, companyId, id);
      return this.view(row, await this.frozen(actor, projectId, row.runId));
    });
  }
  async create(
    actor: ActorContext,
    projectId: string,
    value: unknown,
    keyValue: string | undefined,
  ) {
    const body = commandBody(value, ['runId', 'model', 'language']),
      runId = requireUuid(body.runId),
      model = commandText(body.model, 120);
    const language = (['ro', 'ru', 'fr', 'en'] as const).find(
      (l) => l === body.language,
    );
    if (!language) throw new BadRequestException();
    const key = requireIdempotencyKey(keyValue),
      fingerprint = commandFingerprint([projectId, runId, model, language]);
    this.connections.configuration();
    return this.connections.transaction(actor, projectId, async (companyId) => {
      const frozen = await this.frozen(actor, projectId, runId);
      const [existing] = await this.db.connection
        .select()
        .from(jobs)
        .where(
          and(
            eq(jobs.workspaceId, actor.workspaceId),
            eq(jobs.companyId, companyId),
            eq(jobs.actorId, actor.workspaceMembershipId),
            eq(jobs.commandKey, key),
          ),
        );
      if (existing) {
        if (
          existing.fingerprint !== fingerprint ||
          existing.projectId !== projectId
        )
          throw new ConflictException();
        return this.view(existing, frozen);
      }
      if (frozen.stale) throw new ConflictException({ code: 'stale_source' });
      const connection = await this.connections.row(actor, companyId);
      if (!connection?.encrypted) throw new PlanFailure('reauth');
      const saved = this.connections.credentials(
        connection.encrypted,
        actor,
        companyId,
      );
      if (!saved.models.some((m) => m.id === model))
        throw new BadRequestException({ code: 'model_unavailable' });
      const plan = planDossierReview(frozen.snapshot.sources);
      if (plan.batches.length > 4096)
        throw new BadRequestException({ code: 'review_too_large' });
      const now = new Date();
      const [row] = await this.db.connection
        .insert(jobs)
        .values({
          id: randomUUID(),
          workspaceId: actor.workspaceId,
          companyId,
          actorId: actor.workspaceMembershipId,
          projectId,
          runId,
          snapshotHash: frozen.row.snapshotHash,
          connectionId: connection.id,
          connectionEpoch: connection.epoch,
          connectionIdentityKey: connection.identityKey,
          model,
          language,
          pipelineVersion: HARNESS_VERSION,
          state: plan.batches.length ? 'queued' : 'completed',
          nextBatch: 0,
          totalBatches: plan.batches.length,
          cacheHits: 0,
          checkpoint: [],
          commandKey: key,
          fingerprint,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (!row) throw new PlanFailure('unavailable');
      return this.view(row, frozen);
    });
  }
  async advance(actor: ActorContext, projectId: string, id: string) {
    const captured = await this.connections.transaction(
      actor,
      projectId,
      async (companyId) => {
        const row = await this.row(actor, projectId, companyId, id);
        const frozen = await this.frozen(actor, projectId, row.runId);
        if (frozen.stale) throw new ConflictException({ code: 'stale_source' });
        if (row.state === 'completed')
          return { kind: 'done' as const, view: await this.view(row, frozen) };
        if (
          ['running', 'pausing'].includes(row.state) &&
          row.leaseUntil &&
          row.leaseUntil.getTime() <= Date.now()
        ) {
          const [next] = await this.db.connection
            .update(jobs)
            .set({
              state: 'uncertain',
              lease: null,
              leaseUntil: null,
              updatedAt: new Date(),
            })
            .where(eq(jobs.id, row.id))
            .returning();
          if (!next) throw new PlanFailure('unavailable');
          return { kind: 'done' as const, view: await this.view(next, frozen) };
        }
        if (row.state !== 'queued')
          throw new ConflictException({ code: 'review_paused' });
        const { plan } = this.checkpoint(row, frozen),
          batch = plan.batches[row.nextBatch];
        if (!batch) throw new PlanFailure('invalid');
        const connection = await this.connections.row(actor, companyId);
        if (
          !connection?.encrypted ||
          connection.id !== row.connectionId ||
          connection.epoch !== row.connectionEpoch
        )
          throw new PlanFailure('reauth');
        const cacheKey = hash(
          JSON.stringify([
            ownerKey(actor, companyId),
            projectId,
            connection.identityKey,
            row.model,
            row.language,
            HARNESS_VERSION,
            batch.hash,
          ]),
        );
        const cachedRows = await this.db.connection
          .select()
          .from(cache)
          .where(
            and(
              eq(cache.key, cacheKey),
              eq(cache.workspaceId, actor.workspaceId),
              eq(cache.companyId, companyId),
              eq(cache.actorId, actor.workspaceMembershipId),
              eq(cache.projectId, projectId),
            ),
          );
        const cached = cachedRows.at(0);
        const lease = randomUUID();
        await this.db.connection
          .update(jobs)
          .set({
            state: 'running',
            lease,
            leaseUntil: new Date(Date.now() + 15 * 60_000),
            updatedAt: new Date(),
          })
          .where(eq(jobs.id, row.id));
        return {
          kind: 'work' as const,
          row,
          batch,
          cached,
          cacheKey,
          companyId,
          lease,
        };
      },
    );
    if (captured.kind === 'done') return captured.view;
    try {
      let output: unknown = captured.cached?.output;
      if (!captured.cached) {
        const connection = await this.connections.use(actor, projectId, {
          id: captured.row.connectionId,
          epoch: captured.row.connectionEpoch,
        });
        // Recheck every source after token refresh and immediately before disclosure.
        await this.connections.transaction(
          actor,
          projectId,
          async (companyId) => {
            const row = await this.row(actor, projectId, companyId, id);
            const frozen = await this.frozen(actor, projectId, row.runId);
            const live = await this.connections.row(actor, companyId);
            if (
              row.lease !== captured.lease ||
              frozen.stale ||
              !live?.encrypted ||
              live.epoch !== row.connectionEpoch
            )
              throw new ConflictException();
          },
        );
        output = await this.connections.client.review(connection.token, {
          model: captured.row.model,
          ...reviewRequest(captured.batch, captured.row.language),
        });
      }
      return await this.connections.transaction(
        actor,
        projectId,
        async (companyId) => {
          const row = await this.row(actor, projectId, companyId, id);
          const frozen = await this.frozen(actor, projectId, row.runId);
          const live = await this.connections.row(actor, companyId);
          if (
            !['running', 'pausing'].includes(row.state) ||
            row.lease !== captured.lease ||
            frozen.stale ||
            !live?.encrypted ||
            live.id !== row.connectionId ||
            live.epoch !== row.connectionEpoch
          )
            throw new ConflictException();
          let proposals: ProposedSuggestion[];
          try {
            proposals = readBatchProposals({
              sources: frozen.snapshot.sources,
              batch: captured.batch,
              value: output,
            });
          } catch {
            throw new PlanFailure('invalid');
          }
          const checkpoint = [
            ...this.checkpoint(row, frozen).results,
            proposals,
          ];
          if (
            checkpoint.flat().length > MAX_PROPOSALS_PER_IMPORT ||
            Buffer.byteLength(
              JSON.stringify({
                snapshotHash: row.snapshotHash,
                suggestions: checkpoint.flat(),
              }),
            ) > MAX_SUGGESTION_IMPORT_BYTES
          )
            throw new PlanFailure('invalid');
          await this.db.connection
            .insert(cache)
            .values({
              key: captured.cacheKey,
              workspaceId: actor.workspaceId,
              companyId,
              actorId: actor.workspaceMembershipId,
              projectId,
              output: proposals,
              createdAt: new Date(),
            })
            .onConflictDoNothing();
          const [next] = await this.db.connection
            .update(jobs)
            .set({
              nextBatch: row.nextBatch + 1,
              state:
                row.nextBatch + 1 === row.totalBatches
                  ? 'completed'
                  : row.state === 'pausing'
                    ? 'paused'
                    : 'queued',
              checkpoint,
              cacheHits: row.cacheHits + (captured.cached ? 1 : 0),
              lease: null,
              leaseUntil: null,
              updatedAt: new Date(),
            })
            .where(eq(jobs.id, row.id))
            .returning();
          if (!next) throw new PlanFailure('unavailable');
          return this.view(next, frozen);
        },
      );
    } catch (error) {
      if (!(error instanceof PlanFailure)) throw error;
      return this.connections.transaction(
        actor,
        projectId,
        async (companyId) => {
          const row = await this.row(actor, projectId, companyId, id);
          const frozen = await this.frozen(actor, projectId, row.runId);
          if (row.lease !== captured.lease) return this.view(row, frozen);
          const state =
            error.kind === 'quota'
              ? 'quota'
              : error.kind === 'reauth'
                ? 'reauth'
                : error.kind === 'interrupted'
                  ? 'uncertain'
                  : 'failed';
          const [next] = await this.db.connection
            .update(jobs)
            .set({
              state,
              lease: null,
              leaseUntil: null,
              updatedAt: new Date(),
            })
            .where(eq(jobs.id, row.id))
            .returning();
          if (!next) throw new PlanFailure('unavailable');
          return this.view(next, frozen);
        },
      );
    }
  }
  async import(actor: ActorContext, projectId: string, id: string) {
    const result = await this.connections.transaction(
      actor,
      projectId,
      async (companyId) => {
        const row = await this.row(actor, projectId, companyId, id);
        const frozen = await this.frozen(actor, projectId, row.runId);
        if (frozen.stale || row.state !== 'completed')
          throw new ConflictException();
        const proposals = this.checkpoint(row, frozen).results.flat();
        if (!proposals.length)
          throw new BadRequestException({ code: 'no_proposals' });
        return { runId: row.runId, snapshotHash: row.snapshotHash, proposals };
      },
    );
    return this.suggestions.import(
      actor,
      projectId,
      result.runId,
      { snapshotHash: result.snapshotHash, suggestions: result.proposals },
      'harness-' + id,
    );
  }
  async control(
    actor: ActorContext,
    projectId: string,
    id: string,
    value: unknown,
  ) {
    const body = commandBody(value, ['action']);
    if (!['pause', 'resume', 'cancel'].some((a) => a === body.action))
      throw new BadRequestException();
    return this.connections.transaction(actor, projectId, async (companyId) => {
      const row = await this.row(actor, projectId, companyId, id);
      const frozen = await this.frozen(actor, projectId, row.runId);
      if (['completed', 'cancelled'].includes(row.state))
        return this.view(row, frozen);
      let state: 'queued' | 'paused' | 'pausing' | 'cancelled';
      let connectionEpoch = row.connectionEpoch;
      if (body.action === 'resume') {
        if (
          (['running', 'pausing'].includes(row.state) &&
            (!row.leaseUntil || row.leaseUntil.getTime() > Date.now())) ||
          frozen.stale
        )
          throw new ConflictException();
        const live = await this.connections.row(actor, companyId);
        if (
          !live?.encrypted ||
          live.id !== row.connectionId ||
          live.identityKey !== row.connectionIdentityKey
        )
          throw new PlanFailure('reauth');
        const saved = this.connections.credentials(
          live.encrypted,
          actor,
          companyId,
        );
        if (!saved.models.some((m) => m.id === row.model))
          throw new ConflictException({ code: 'model_unavailable' });
        connectionEpoch = live.epoch;
        state = 'queued';
      } else
        state =
          body.action === 'pause'
            ? ['running', 'pausing'].includes(row.state)
              ? 'pausing'
              : 'paused'
            : 'cancelled';
      const [next] = await this.db.connection
        .update(jobs)
        .set({
          state,
          connectionEpoch,
          lease: state === 'pausing' ? row.lease : null,
          leaseUntil: state === 'pausing' ? row.leaseUntil : null,
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, row.id))
        .returning();
      if (!next) throw new PlanFailure('unavailable');
      return this.view(next, frozen);
    });
  }
}
