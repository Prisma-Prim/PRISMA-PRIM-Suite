import { applicabilityResultObservation } from './mission-applicability.result-observation.js';
import { Injectable, BadRequestException } from '@nestjs/common';
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { DatabaseContext } from '../database/database-context.js';
import {
  missionApplicabilityFacts as facts,
  missionApplicabilityCommands as commands,
  missionApplicabilityStreams as streams,
  missionApplicabilityEvents as events,
} from '../database/schema/index.js';
import type { ActorContext } from '../access/access.types.js';
import { TaskResultsService } from '../task/task-results.service.js';
import { applicabilityInput } from './mission-applicability.input.js';

export type ApplicabilityScope = {
  workspaceId: string;
  companyId: string;
  projectId: string;
};
export type ApplicabilityFact = typeof facts.$inferSelect;

/** Bounded native facts and receipts. The caller supplies live authorization and owns the transaction. */
@Injectable()
export class MissionApplicabilityStore {
  constructor(
    private readonly database: DatabaseContext,
    private readonly results: TaskResultsService,
  ) {}
  private scope(scope: ApplicabilityScope) {
    return and(
      eq(facts.workspaceId, scope.workspaceId),
      eq(facts.companyId, scope.companyId),
      eq(facts.projectId, scope.projectId),
    );
  }
  async serialize(scope: ApplicabilityScope) {
    const key = JSON.stringify([
      'mission.applicability.stream',
      scope.workspaceId,
      scope.companyId,
      scope.projectId,
    ]);
    await this.database.connection.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`,
    );
  }
  async stream(scope: ApplicabilityScope) {
    const [stream] = await this.database.connection
      .select()
      .from(streams)
      .where(
        and(
          eq(streams.workspaceId, scope.workspaceId),
          eq(streams.companyId, scope.companyId),
          eq(streams.projectId, scope.projectId),
        ),
      );
    const [latest] = await this.database.connection
      .select()
      .from(facts)
      .where(this.scope(scope))
      .orderBy(desc(facts.revision))
      .limit(1);
    if (
      (stream?.revision ?? 0) !== (latest?.revision ?? 0) ||
      (stream?.factId ?? null) !== (latest?.id ?? null)
    )
      throw new Error('Invalid applicability stream.');
    return latest ?? null;
  }
  async fact(scope: ApplicabilityScope, id: string) {
    const [row] = await this.database.connection
      .select()
      .from(facts)
      .where(and(this.scope(scope), eq(facts.id, id)));
    if (!row) throw new Error('Missing immutable applicability fact.');
    return row;
  }
  async latest(
    scope: ApplicabilityScope,
    taskId: string,
    kinds?: ApplicabilityFact['kind'][],
  ) {
    const [row] = await this.database.connection
      .select()
      .from(facts)
      .where(
        and(
          this.scope(scope),
          eq(facts.taskId, taskId),
          kinds ? inArray(facts.kind, kinds) : undefined,
        ),
      )
      .orderBy(desc(facts.revision))
      .limit(1);
    return row ?? null;
  }
  async page(
    actor: ActorContext,
    scope: ApplicabilityScope,
    before: number | undefined,
  ) {
    if (before !== undefined) {
      const [cursor] = await this.database.connection
        .select()
        .from(facts)
        .where(and(this.scope(scope), eq(facts.revision, before)));
      if (!cursor)
        throw new BadRequestException(
          'History cursor is not a fact in this Project.',
        );
      await this.view(actor, cursor);
    }
    return this.database.connection
      .select()
      .from(facts)
      .where(
        and(
          this.scope(scope),
          before === undefined ? undefined : lt(facts.revision, before),
        ),
      )
      .orderBy(desc(facts.revision))
      .limit(26);
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
    const [receipt] = await this.database.connection
      .insert(commands)
      .values(input)
      .returning();
    if (!receipt) throw new Error('Applicability receipt was not conserved.');
    return this.response(receipt);
  }
  response(
    input: Pick<
      typeof commands.$inferSelect,
      'action' | 'projectId' | 'factId' | 'applicabilityRevision'
    >,
  ) {
    if (
      (input.action !== 'recorded' && input.action !== 'unchanged') ||
      !Number.isInteger(input.applicabilityRevision) ||
      input.applicabilityRevision < 1
    )
      throw new Error('Invalid stored applicability receipt.');
    return {
      action: input.action,
      projectId: input.projectId,
      factId: input.factId,
      applicabilityRevision: input.applicabilityRevision,
    };
  }
  async append(input: typeof facts.$inferInsert) {
    const [row] = await this.database.connection
      .insert(facts)
      .values(input)
      .returning();
    if (!row) throw new Error('Applicability fact was not recorded.');
    if (row.revision === 1)
      await this.database.connection.insert(streams).values({
        workspaceId: row.workspaceId,
        companyId: row.companyId,
        projectId: row.projectId,
        revision: row.revision,
        factId: row.id,
      });
    else {
      const [advanced] = await this.database.connection
        .update(streams)
        .set({ revision: row.revision, factId: row.id })
        .where(
          and(
            eq(streams.workspaceId, row.workspaceId),
            eq(streams.companyId, row.companyId),
            eq(streams.projectId, row.projectId),
            eq(streams.revision, row.revision - 1),
          ),
        )
        .returning();
      if (!advanced) throw new Error('Applicability stream was not advanced.');
    }
    return row;
  }
  intent(row: ApplicabilityFact) {
    try {
      const input = applicabilityInput(row.intent);
      if (
        input.taskId !== row.taskId ||
        input.expectedApplicabilityRevision !== row.revision - 1 ||
        input.expectedTaskVersion !== row.taskVersion ||
        input.expectedResultRevision !== row.resultRevision ||
        input.expectedLifecycleRevision !== row.lifecycleRevision
      )
        throw new Error('Invalid historical observations.');
      const kind =
        input.action === 'PROPOSE'
          ? 'PROPOSED'
          : input.action === 'CORRECT_PROPOSAL'
            ? 'PROPOSAL_CORRECTED'
            : input.action === 'RESTORE'
              ? 'RESTORED'
              : input.outcome === 'APPROVE'
                ? 'APPROVED'
                : 'REJECTED';
      if (kind !== row.kind) throw new Error('Invalid historical action.');
      return input;
    } catch {
      throw new Error('Invalid immutable applicability payload.');
    }
  }
  async view(actor: ActorContext, row: ApplicabilityFact) {
    const intent = this.intent(row);
    const eventSuffix = {
      PROPOSED: 'proposed',
      PROPOSAL_CORRECTED: 'proposal_corrected',
      APPROVED: 'approved',
      REJECTED: 'rejected',
      RESTORED: 'restored',
    }[row.kind];
    const coupled = await this.database.connection
      .select({ event: events, command: commands })
      .from(events)
      .innerJoin(
        commands,
        and(
          eq(commands.factId, events.factId),
          eq(commands.action, 'recorded'),
        ),
      )
      .where(eq(events.factId, row.id))
      .limit(2);
    const audit = coupled[0];
    if (
      coupled.length !== 1 ||
      !audit ||
      audit.event.action !== `project.mission_applicability.${eventSuffix}` ||
      audit.event.workspaceId !== row.workspaceId ||
      audit.event.companyId !== row.companyId ||
      audit.event.projectId !== row.projectId ||
      audit.event.actorInternalUserId !== row.actorInternalUserId ||
      audit.event.actorMembershipId !== row.actorMembershipId ||
      audit.event.occurredAt.getTime() !== row.occurredAt.getTime() ||
      audit.event.applicabilityRevision !== row.revision ||
      audit.command.actorMembershipId !== row.actorMembershipId ||
      audit.command.applicabilityRevision !== row.revision ||
      audit.command.command !==
        JSON.stringify({
          companyId: row.companyId,
          projectId: row.projectId,
          ...intent,
        })
    )
      throw new Error('Incomplete immutable applicability audit.');
    const metadata: unknown = audit.event.metadata;
    if (
      !metadata ||
      typeof metadata !== 'object' ||
      Array.isArray(metadata) ||
      Object.keys(metadata).length !== 1 ||
      !('applicabilityRevision' in metadata) ||
      metadata.applicabilityRevision !== row.revision
    )
      throw new Error('Invalid immutable applicability metadata.');
    const result = row.resultId
      ? await this.results.reviewEvidenceWithinTransaction({
          actor,
          taskId: row.taskId,
          resultId: row.resultId,
        })
      : null;
    if ((result?.revision ?? 0) !== row.resultRevision)
      throw new Error('Invalid historical result revision.');
    if (row.predecessorId) {
      const previous = await this.fact(row, row.predecessorId);
      if (previous.revision !== row.revision - 1)
        throw new Error('Broken applicability predecessor.');
    } else if (row.revision !== 1)
      throw new Error('Missing applicability predecessor.');
    if (row.activityPredecessorId) {
      const previous = await this.fact(row, row.activityPredecessorId);
      if (previous.taskId !== row.taskId || previous.revision >= row.revision)
        throw new Error('Broken activity predecessor.');
    }
    return {
      id: row.id,
      revision: row.revision,
      kind: row.kind,
      predecessorId: row.predecessorId,
      activityPredecessorId: row.activityPredecessorId,
      activityKey: row.activityKey,
      source: {
        templateKey: 'CONSULTING_MISSION_PILOT_ILLUSTRATIVE',
        version: 1,
        title: row.sourceTitle,
        activity: row.sourceActivity,
        intendedResult: row.intendedResult,
      },
      intent,
      observedTask: {
        id: row.taskId,
        title: row.taskTitle,
        status: row.taskStatus,
        version: row.taskVersion,
      },
      observedResult: applicabilityResultObservation(result),
      observedResultRevision: row.resultRevision,
      observedLifecycleRevision: row.lifecycleRevision,
      actor: {
        internalUserId: row.actorInternalUserId,
        workspaceMembershipId: row.actorMembershipId,
        displayName: row.actorDisplayName,
      },
      capture: {
        assignmentId: row.assignmentId,
        permissionSetVersion: row.permissionSetVersion,
      },
      occurredAt: row.occurredAt.toISOString(),
    };
  }
}
