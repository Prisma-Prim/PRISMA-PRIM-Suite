import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, lt } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  missionResultReviewBatches as batches,
  missionResultReviewItems as items,
  missionResultReviewCommands as commands,
} from '../database/schema/index.js';
import { TaskResultsService } from '../task/task-results.service.js';

export type ReviewBatch = typeof batches.$inferSelect;
export type ReviewItem = typeof items.$inferSelect;
export type ReviewScope = {
  workspaceId: string;
  companyId: string;
  projectId: string;
};

/** Persistence and immutable historical evidence; authorization belongs to the composed caller. */
@Injectable()
export class MissionResultReviewStore {
  constructor(
    private readonly database: DatabaseContext,
    private readonly results: TaskResultsService,
  ) {}
  private scope(scope: ReviewScope) {
    return and(
      eq(batches.workspaceId, scope.workspaceId),
      eq(batches.companyId, scope.companyId),
      eq(batches.projectId, scope.projectId),
    );
  }
  async latest(scope: ReviewScope) {
    const [row] = await this.database.connection
      .select()
      .from(batches)
      .where(this.scope(scope))
      .orderBy(desc(batches.revision))
      .limit(1);
    return row;
  }
  async batch(scope: ReviewScope, id: string) {
    const [row] = await this.database.connection
      .select()
      .from(batches)
      .where(and(this.scope(scope), eq(batches.id, id)));
    if (!row) throw new Error('Missing immutable mission review batch.');
    return row;
  }
  async latestItems(scope: ReviewScope) {
    return this.database.connection
      .selectDistinctOn([items.taskId])
      .from(items)
      .where(
        and(
          eq(items.workspaceId, scope.workspaceId),
          eq(items.companyId, scope.companyId),
          eq(items.projectId, scope.projectId),
        ),
      )
      .orderBy(items.taskId, desc(items.reviewRevision));
  }
  async page(scope: ReviewScope, beforeRevision: number | undefined) {
    return this.database.connection
      .select()
      .from(batches)
      .where(
        and(
          this.scope(scope),
          beforeRevision === undefined
            ? undefined
            : lt(batches.revision, beforeRevision),
        ),
      )
      .orderBy(desc(batches.revision))
      .limit(26);
  }
  async rows(batch: ReviewBatch) {
    const rows = await this.database.connection
      .select()
      .from(items)
      .where(eq(items.batchId, batch.id))
      .orderBy(asc(items.position));
    if (rows.length !== batch.selectedCount)
      throw new Error('Incomplete immutable mission review batch.');
    return rows;
  }
  async evidence(actor: ActorContext, row: ReviewItem) {
    switch (row.evidenceKind) {
      case 'EXTERNAL_REPORTED':
        if (row.externalReference === null || row.resultId !== null)
          throw new Error('Invalid reported review evidence.');
        return { kind: row.evidenceKind, reference: row.externalReference };
      case 'DECLARED_RESULT':
        if (row.resultId === null || row.externalReference !== null)
          throw new Error('Invalid exact review evidence.');
        return {
          kind: row.evidenceKind,
          result: await this.results.reviewEvidenceWithinTransaction({
            actor,
            taskId: row.taskId,
            resultId: row.resultId,
          }),
        };
      default: {
        const exhaustive: never = row.evidenceKind;
        return exhaustive;
      }
    }
  }
  async view(actor: ActorContext, batch: ReviewBatch, row: ReviewItem) {
    return {
      id: row.id,
      batchId: batch.id,
      reviewRevision: batch.revision,
      predecessorId: row.predecessorId,
      outcome: batch.outcome,
      basis: batch.basis,
      actor: {
        internalUserId: batch.actorInternalUserId,
        workspaceMembershipId: batch.actorMembershipId,
        displayName: batch.actorDisplayName,
      },
      occurredAt: batch.occurredAt.toISOString(),
      observedTask: {
        id: row.taskId,
        title: row.taskTitle,
        version: row.taskVersion,
      },
      observedResultRevision: row.resultRevision,
      evidence: await this.evidence(actor, row),
    };
  }
  async receipt(actor: ActorContext, key: string) {
    const [row] = await this.database.connection
      .select()
      .from(commands)
      .where(
        and(
          eq(commands.workspaceId, actor.workspaceId),
          eq(commands.actorMembershipId, actor.workspaceMembershipId),
          eq(commands.idempotencyKey, key),
        ),
      );
    return row;
  }
  async saveReceipt(input: typeof commands.$inferInsert) {
    await this.database.connection.insert(commands).values(input);
    return {
      action: input.action,
      projectId: input.projectId,
      batchId: input.batchId,
      reviewRevision: input.reviewRevision,
    };
  }
  async append(
    batch: typeof batches.$inferInsert,
    rows: Omit<typeof items.$inferInsert, 'batchId' | 'reviewRevision'>[],
  ) {
    const [created] = await this.database.connection
      .insert(batches)
      .values(batch)
      .returning();
    if (!created) throw new Error('Mission review was not recorded.');
    await this.database.connection.insert(items).values(
      rows.map((row) => ({
        ...row,
        batchId: created.id,
        reviewRevision: created.revision,
      })),
    );
    return created;
  }
}
