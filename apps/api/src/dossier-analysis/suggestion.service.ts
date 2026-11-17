import { runClientReferenceTransaction } from '../client/client-reference-transaction.js';
import { randomUUID } from 'node:crypto';
import { commandFingerprint } from '../command/idempotent-command.js';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import {
  requireIdempotencyKey,
  requireUuid,
} from '../access/access-command-validation.js';
import type { ActorContext } from '../access/access.types.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  dossierAnalysisEvents,
  dossierAnalysisReviews,
  dossierAnalysisSuggestions,
} from '../database/schema/dossier-analysis.js';
import {
  validateSuggestions,
  type EvidenceSource,
} from '../dossier-analysis-engine/index.js';
import { parseReview } from './commands.js';
import { DossierRunService } from './run.service.js';

export const MAX_SUGGESTION_IMPORT_BYTES = 256 * 1024;

@Injectable()
export class DossierSuggestionService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly runs: DossierRunService,
  ) {}
  private write<T>(work: () => Promise<T>) {
    return runClientReferenceTransaction({ database: this.database, work });
  }
  private async lockKey(actor: ActorContext, key: string) {
    const lock = JSON.stringify([
      'dossier-analysis',
      actor.workspaceId,
      actor.workspaceMembershipId,
      key,
    ]);
    await this.database.connection.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${lock}, 0))`,
    );
  }
  private async receipt(actor: ActorContext, key: string) {
    const [row] = await this.database.connection
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
    return row;
  }
  async listWithinTransaction(
    actor: ActorContext,
    projectId: string,
    companyId: string,
    runId: string,
    sources: EvidenceSource[],
    snapshotHash: string,
  ) {
    const rows = await this.database.connection
      .select()
      .from(dossierAnalysisSuggestions)
      .where(
        and(
          eq(dossierAnalysisSuggestions.workspaceId, actor.workspaceId),
          eq(dossierAnalysisSuggestions.companyId, companyId),
          eq(dossierAnalysisSuggestions.projectId, projectId),
          eq(dossierAnalysisSuggestions.runId, runId),
        ),
      )
      .orderBy(
        asc(dossierAnalysisSuggestions.createdAt),
        asc(dossierAnalysisSuggestions.id),
      );
    const result = [];
    for (const row of rows) {
      let proposal;
      try {
        [proposal] = validateSuggestions({
          sources,
          snapshotHash,
          value: [row.proposal],
        });
      } catch {
        throw new ServiceUnavailableException(
          'The preserved suggestion is unavailable.',
        );
      }
      const reviews = await this.database.connection
        .select()
        .from(dossierAnalysisReviews)
        .where(
          and(
            eq(dossierAnalysisReviews.workspaceId, actor.workspaceId),
            eq(dossierAnalysisReviews.companyId, companyId),
            eq(dossierAnalysisReviews.projectId, projectId),
            eq(dossierAnalysisReviews.suggestionId, row.id),
          ),
        )
        .orderBy(asc(dossierAnalysisReviews.revision));
      if (
        reviews.length !== row.revision ||
        reviews.some((review, index) => review.revision !== index + 1)
      )
        throw new ServiceUnavailableException(
          'The review history is unavailable.',
        );
      result.push({
        id: row.id,
        proposal,
        revision: row.revision,
        createdAt: row.createdAt.toISOString(),
        reviews: reviews.map((review) => ({
          revision: review.revision,
          decision: review.decision,
          replacementValue: review.replacementValue,
          actorMembershipId: review.actorMembershipId,
          actorDisplayName: review.actorDisplayName,
          recordedAt: review.recordedAt.toISOString(),
        })),
      });
    }
    return result;
  }
  async import(
    actor: ActorContext,
    projectValue: unknown,
    runValue: unknown,
    value: unknown,
    keyValue: string | undefined,
  ) {
    const projectId = requireUuid(projectValue),
      runId = requireUuid(runValue),
      key = requireIdempotencyKey(keyValue);
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Buffer.byteLength(JSON.stringify(value), 'utf8') >
        MAX_SUGGESTION_IMPORT_BYTES
    )
      throw new BadRequestException('Invalid suggestions.');
    const body = Object.fromEntries(Object.entries(value));
    if (
      Object.keys(body).some(
        (key) => key !== 'snapshotHash' && key !== 'suggestions',
      ) ||
      typeof body.snapshotHash !== 'string'
    )
      throw new BadRequestException('Invalid suggestions.');
    const fingerprint = commandFingerprint([
      'suggestions',
      projectId,
      runId,
      value,
    ]);
    return this.write(async () => {
      const frozen = await this.runs.frozenWithinTransaction(
        actor,
        projectId,
        runId,
        true,
      );
      if (body.snapshotHash !== frozen.row.snapshotHash)
        throw new BadRequestException('Invalid run snapshot.');
      let proposals;
      try {
        proposals = validateSuggestions({
          sources: frozen.snapshot.sources,
          snapshotHash: frozen.snapshot.sourceHash,
          value: body.suggestions,
        });
      } catch {
        throw new BadRequestException('Invalid suggestions or citations.');
      }
      await this.lockKey(actor, key);
      const existing = await this.receipt(actor, key);
      if (existing) {
        if (
          existing.companyId !== frozen.row.companyId ||
          existing.projectId !== projectId ||
          existing.action !== 'suggestions.imported' ||
          existing.fingerprint !== fingerprint
        )
          throw new ConflictException('Idempotency-Key was already used.');
        const receipt = existing.receipt;
        if (
          !receipt ||
          typeof receipt !== 'object' ||
          !('ids' in receipt) ||
          !Array.isArray(receipt.ids) ||
          !receipt.ids.every((id: unknown) => typeof id === 'string')
        )
          throw new ServiceUnavailableException('The receipt is unavailable.');
        return { ids: receipt.ids };
      }
      if (frozen.stale) throw new ConflictException('The run is stale.');
      const existingRows = await this.database.connection
        .select({ id: dossierAnalysisSuggestions.id })
        .from(dossierAnalysisSuggestions)
        .where(
          and(
            eq(dossierAnalysisSuggestions.workspaceId, actor.workspaceId),
            eq(dossierAnalysisSuggestions.companyId, frozen.row.companyId),
            eq(dossierAnalysisSuggestions.projectId, projectId),
            eq(dossierAnalysisSuggestions.runId, runId),
          ),
        )
        .limit(200);
      if (existingRows.length + proposals.length > 200)
        throw new ConflictException('The suggestion limit has been reached.');
      const ids = proposals.map(() => randomUUID()),
        now = new Date();
      await this.database.connection.insert(dossierAnalysisSuggestions).values(
        proposals.map((proposal, index) => ({
          id: ids[index],
          workspaceId: actor.workspaceId,
          companyId: frozen.row.companyId,
          projectId,
          runId,
          proposal,
          revision: 0,
          createdByMembershipId: actor.workspaceMembershipId,
          createdAt: now,
        })),
      );
      await this.database.connection.insert(dossierAnalysisEvents).values({
        id: randomUUID(),
        workspaceId: actor.workspaceId,
        companyId: frozen.row.companyId,
        projectId,
        actorMembershipId: actor.workspaceMembershipId,
        idempotencyKey: key,
        fingerprint,
        action: 'suggestions.imported',
        targetId: ids[0],
        receipt: { ids },
        recordedAt: now,
      });
      return { ids };
    });
  }
  async review(
    actor: ActorContext,
    projectValue: unknown,
    suggestionValue: unknown,
    value: unknown,
    keyValue: string | undefined,
  ) {
    const projectId = requireUuid(projectValue),
      suggestionId = requireUuid(suggestionValue),
      key = requireIdempotencyKey(keyValue),
      command = parseReview(value);
    const fingerprint = commandFingerprint([
      'review',
      projectId,
      suggestionId,
      value,
    ]);
    return this.write(async () => {
      await this.runs.projectWithinTransaction(actor, projectId, true);
      const companyId = actor.activeCompany?.id;
      if (!companyId) throw new NotFoundException();
      const [suggestion] = await this.database.connection
        .select()
        .from(dossierAnalysisSuggestions)
        .where(
          and(
            eq(dossierAnalysisSuggestions.workspaceId, actor.workspaceId),
            eq(dossierAnalysisSuggestions.companyId, companyId),
            eq(dossierAnalysisSuggestions.projectId, projectId),
            eq(dossierAnalysisSuggestions.id, suggestionId),
          ),
        )
        .for('update');
      if (!suggestion) throw new NotFoundException();
      const frozen = await this.runs.frozenWithinTransaction(
        actor,
        projectId,
        suggestion.runId,
        true,
      );
      let original;
      try {
        [original] = validateSuggestions({
          sources: frozen.snapshot.sources,
          snapshotHash: frozen.snapshot.sourceHash,
          value: [suggestion.proposal],
        });
      } catch {
        throw new ServiceUnavailableException(
          'The preserved suggestion is unavailable.',
        );
      }
      await this.lockKey(actor, key);
      const existing = await this.receipt(actor, key);
      if (existing) {
        if (
          existing.companyId !== companyId ||
          existing.projectId !== projectId ||
          existing.action !== 'suggestion.reviewed' ||
          existing.fingerprint !== fingerprint
        )
          throw new ConflictException('Idempotency-Key was already used.');
        return { id: suggestionId, revision: command.expectedRevision + 1 };
      }
      if (frozen.stale || suggestion.revision !== command.expectedRevision)
        throw new ConflictException('The run or suggestion changed.');
      const [last] = await this.database.connection
        .select()
        .from(dossierAnalysisReviews)
        .where(
          and(
            eq(dossierAnalysisReviews.workspaceId, actor.workspaceId),
            eq(dossierAnalysisReviews.companyId, companyId),
            eq(dossierAnalysisReviews.projectId, projectId),
            eq(dossierAnalysisReviews.suggestionId, suggestionId),
            eq(dossierAnalysisReviews.revision, suggestion.revision),
          ),
        );
      if (
        last &&
        last.decision === command.decision &&
        last.replacementValue === command.replacementValue
      )
        throw new ConflictException('This decision is already current.');
      if (command.decision === 'correct') {
        const [previousCorrection] = await this.database.connection
          .select()
          .from(dossierAnalysisReviews)
          .where(
            and(
              eq(dossierAnalysisReviews.workspaceId, actor.workspaceId),
              eq(dossierAnalysisReviews.companyId, companyId),
              eq(dossierAnalysisReviews.projectId, projectId),
              eq(dossierAnalysisReviews.suggestionId, suggestionId),
              eq(dossierAnalysisReviews.decision, 'correct'),
            ),
          )
          .orderBy(desc(dossierAnalysisReviews.revision))
          .limit(1);
        if (
          !original ||
          command.replacementValue ===
            (previousCorrection?.replacementValue ?? original.value)
        )
          throw new ConflictException('This value is already current.');
      }
      const revision = suggestion.revision + 1,
        now = new Date();
      await this.database.connection.insert(dossierAnalysisReviews).values({
        id: randomUUID(),
        workspaceId: actor.workspaceId,
        companyId,
        projectId,
        suggestionId,
        revision,
        decision: command.decision,
        replacementValue: command.replacementValue,
        actorMembershipId: actor.workspaceMembershipId,
        actorDisplayName: actor.displayName,
        recordedAt: now,
      });
      await this.database.connection
        .update(dossierAnalysisSuggestions)
        .set({ revision })
        .where(
          and(
            eq(dossierAnalysisSuggestions.workspaceId, actor.workspaceId),
            eq(dossierAnalysisSuggestions.companyId, companyId),
            eq(dossierAnalysisSuggestions.projectId, projectId),
            eq(dossierAnalysisSuggestions.id, suggestionId),
          ),
        );
      await this.database.connection.insert(dossierAnalysisEvents).values({
        id: randomUUID(),
        workspaceId: actor.workspaceId,
        companyId,
        projectId,
        actorMembershipId: actor.workspaceMembershipId,
        idempotencyKey: key,
        fingerprint,
        action: 'suggestion.reviewed',
        targetId: suggestionId,
        receipt: { id: suggestionId, revision },
        recordedAt: now,
      });
      return { id: suggestionId, revision };
    });
  }
}
