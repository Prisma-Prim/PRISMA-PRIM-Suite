import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { requireIdempotencyKey } from '../access/access-command-validation.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import { DatabaseContext } from '../database/database-context.js';
import { isOpenProjectStatus } from '../project/project-status.js';
import { ProjectClosedGuard } from '../project/project-closed.guard.js';
import { ProjectService } from '../project/project.service.js';
import { MissionReadinessService } from '../project-template/mission-readiness.service.js';
import { ProjectTemplateService } from '../project-template/project-template.service.js';
import { TaskResultsService } from '../task/task-results.service.js';
import {
  reviewHistoryQuery,
  reviewInput,
} from './mission-result-review.input.js';
import {
  MissionResultReviewStore,
  type ReviewScope,
} from './mission-result-review.store.js';

/** Human judgments compose existing owners without changing fulfillment or Task state. */
@Injectable()
export class MissionResultReviewService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly readiness: MissionReadinessService,
    private readonly store: MissionResultReviewStore,
    private readonly authorization: CompanyContextAuthorization,
    private readonly templates: ProjectTemplateService,
    private readonly projects: ProjectService,
    private readonly results: TaskResultsService,
    private readonly clients: ClientOperationalReferenceService,
    private readonly closed: ProjectClosedGuard,
    private readonly accountability: AccountabilityService,
  ) {}
  private scope(actor: ActorContext, projectId: string): ReviewScope {
    if (!actor.activeCompany) throw new NotFoundException();
    return {
      workspaceId: actor.workspaceId,
      companyId: actor.activeCompany.id,
      projectId,
    };
  }
  private async source(actor: ActorContext, projectId: string) {
    const { assessment } = await this.readiness.readWithinTransaction(
      actor,
      projectId,
    );
    if (!assessment) return null;
    const activities = [];
    for (const activity of assessment.activities) {
      if (activity.result.kind === 'unavailable')
        return { kind: 'unavailable' as const };
      activities.push({ ...activity, result: activity.result });
    }
    const project = await this.projects.read(actor, projectId);
    const client = await this.clients.readReferenceClient(
      actor,
      project.clientAccountId,
    );
    return {
      kind: 'available' as const,
      mutable:
        client.status === 'active' && isOpenProjectStatus(project.status),
      project: assessment.project,
      source: assessment.source,
      activities,
    };
  }
  async read(actor: ActorContext, projectId: string) {
    return this.database.transaction(
      async () => {
        const source = await this.source(actor, projectId);
        if (!source) return { review: null };
        if (source.kind === 'unavailable') return { review: source };
        const scope = this.scope(actor, projectId);
        const latest = await this.store.latest(scope);
        if (latest) await this.store.rows(latest);
        const rows = await this.store.latestItems(scope);
        const activities = [];
        for (const activity of source.activities) {
          const row = rows.find((row) => row.taskId === activity.task.id);
          const latest = row
            ? {
                ...(await this.store.view(
                  actor,
                  await this.store.batch(scope, row.batchId),
                  row,
                )),
                current:
                  row.taskVersion === activity.task.version &&
                  row.resultRevision ===
                    (activity.result.current?.revision ?? 0),
              }
            : null;
          activities.push({
            key: activity.key,
            title: activity.title,
            activity: activity.activity,
            intendedResult: activity.intendedResult,
            task: activity.task,
            result: activity.result,
            latest,
          });
        }
        if (
          rows.some(
            (row) =>
              !source.activities.some(
                (activity) => activity.task.id === row.taskId,
              ),
          )
        )
          throw new Error('Invalid stored mission review mapping.');
        return {
          review: {
            kind: 'available' as const,
            mutable: source.mutable,
            project: source.project,
            source: source.source,
            revision: latest?.revision ?? 0,
            activities,
          },
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  async history(actor: ActorContext, projectId: string, query: unknown) {
    const before = reviewHistoryQuery(query);
    return this.database.transaction(
      async () => {
        const source = await this.source(actor, projectId);
        if (!source) return { history: null };
        if (source.kind === 'unavailable') return { history: source };
        const rows = await this.store.page(
          this.scope(actor, projectId),
          before,
        );
        const batches = [];
        for (const batch of rows.slice(0, 25)) {
          const items = [];
          for (const row of await this.store.rows(batch))
            items.push(await this.store.view(actor, batch, row));
          batches.push({
            id: batch.id,
            reviewRevision: batch.revision,
            outcome: batch.outcome,
            basis: batch.basis,
            items,
          });
        }
        return {
          history: {
            kind: 'available' as const,
            batches,
            hasMore: rows.length > 25,
            nextBeforeRevision:
              rows.length > 25 ? (rows[24]?.revision ?? null) : null,
          },
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  async record(
    actor: ActorContext,
    projectId: string,
    body: unknown,
    key: string | undefined,
  ) {
    const input = reviewInput(body);
    const idempotencyKey = requireIdempotencyKey(key);
    return this.database.transaction(async () => {
      // Parent/role authority precedes the original Client mutex and Task locks.
      await this.templates.requirePilotReviewWithinTransaction(actor);
      const capture =
        await this.authorization.requireMissionResultReviewer(actor);
      const scope = this.scope(actor, projectId);
      const source = await this.source(actor, projectId);
      if (!source)
        throw new ConflictException(
          'This Project has no supported mission review plan.',
        );
      if (source.kind === 'unavailable') throw new NotFoundException();
      const project = await this.projects.read(actor, projectId);
      // Canonical source order makes equivalent selection order an identical command.
      const selected = source.activities.filter((row) =>
        input.items.some((item) => item.taskId === row.task.id),
      );
      if (selected.length !== input.items.length)
        throw new ConflictException('Select only mapped mission activities.');
      const items = selected.map((row) => {
        const item = input.items.find((item) => item.taskId === row.task.id);
        if (!item) throw new Error('Missing selected mission activity.');
        return item;
      });
      for (const item of items)
        await this.results.requireReviewReadWithinTransaction({
          actor,
          taskId: item.taskId,
        });
      const intent = { outcome: input.outcome, basis: input.basis, items };
      const signature = JSON.stringify(intent);
      const command = JSON.stringify({
        companyId: scope.companyId,
        projectId,
        expectedReviewRevision: input.expectedReviewRevision,
        ...intent,
      });
      const lockKey = JSON.stringify([
        'mission.result.review',
        actor.workspaceId,
        actor.workspaceMembershipId,
        idempotencyKey,
      ]);
      await this.database.connection.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey},0))`,
      );
      const receipt = await this.store.receipt(actor, idempotencyKey);
      if (receipt) {
        if (receipt.command !== command)
          throw new ConflictException(
            'Idempotency-Key was used for another review intent.',
          );
        const batch = await this.store.batch(scope, receipt.batchId);
        for (const row of await this.store.rows(batch))
          await this.store.evidence(actor, row);
        return {
          action: receipt.action,
          projectId,
          batchId: batch.id,
          reviewRevision: batch.revision,
        };
      }
      await this.clients.lockActiveReferenceClient(
        actor,
        project.clientAccountId,
      );
      await this.closed.requireOpen({
        actor,
        companyId: scope.companyId,
        projectId,
      });
      // Client serializes all compliant mutation owners. Re-read observed facts after waiting.
      const refreshed = await this.source(actor, projectId);
      if (!refreshed || refreshed.kind !== 'available')
        throw new ConflictException('The mission source changed.');
      const latest = await this.store.latest(scope);
      if (input.expectedReviewRevision !== (latest?.revision ?? 0))
        throw new ConflictException(
          'The review history changed. Reload and review again.',
        );
      const rows = [];
      const previous = await this.store.latestItems(scope);
      for (const item of items) {
        const target = await this.results.lockReviewTargetWithinTransaction({
          actor,
          taskId: item.taskId,
        });
        const position = refreshed.activities.findIndex(
          (row) => row.task.id === item.taskId,
        );
        if (
          position < 0 ||
          target.task.projectId !== projectId ||
          target.task.status !== 'done' ||
          target.task.version !== item.expectedTaskVersion ||
          (target.current?.revision ?? 0) !== item.expectedResultRevision
        )
          throw new ConflictException(
            'The selected Task or result changed. Reload and review again.',
          );
        if (
          item.evidence.kind === 'DECLARED_RESULT' &&
          target.current?.id !== item.evidence.resultId
        )
          throw new ConflictException(
            'The selected declared result is no longer current.',
          );
        rows.push({
          ...scope,
          taskId: item.taskId,
          position,
          taskTitle: target.task.title,
          taskVersion: target.task.version,
          resultRevision: item.expectedResultRevision,
          predecessorId:
            previous.find((row) => row.taskId === item.taskId)?.id ?? null,
          evidenceKind: item.evidence.kind,
          resultId:
            item.evidence.kind === 'DECLARED_RESULT'
              ? item.evidence.resultId
              : null,
          externalReference:
            item.evidence.kind === 'EXTERNAL_REPORTED'
              ? item.evidence.reference
              : null,
        });
      }
      if (
        latest &&
        latest.actorMembershipId === actor.workspaceMembershipId &&
        latest.actorInternalUserId === actor.internalUserId &&
        latest.signature === signature
      )
        return this.store.saveReceipt({
          ...scope,
          actorMembershipId: actor.workspaceMembershipId,
          idempotencyKey,
          command,
          batchId: latest.id,
          reviewRevision: latest.revision,
          action: 'unchanged',
        });
      if (latest?.revision === 2147483647)
        throw new ConflictException('Mission review revision is exhausted.');
      await this.clients.recordReferenceUse(actor, project.clientAccountId);
      const batch = await this.store.append(
        {
          ...scope,
          revision: (latest?.revision ?? 0) + 1,
          predecessorId: latest?.id ?? null,
          previousRevision: latest?.revision ?? null,
          outcome: input.outcome,
          basis: input.basis,
          signature,
          selectedCount: rows.length,
          actorInternalUserId: actor.internalUserId,
          actorMembershipId: actor.workspaceMembershipId,
          actorDisplayName: actor.displayName,
          reviewerAssignmentId: capture.assignmentId,
          reviewerPermissionSetVersion: capture.permissionSetVersion,
          occurredAt: new Date(),
        },
        rows,
      );
      await this.accountability.recordMissionResultReviewEvent({
        actor,
        companyId: scope.companyId,
        projectId,
        batchId: batch.id,
        reviewRevision: batch.revision,
        occurredAt: batch.occurredAt,
      });
      return this.store.saveReceipt({
        ...scope,
        actorMembershipId: actor.workspaceMembershipId,
        idempotencyKey,
        command,
        batchId: batch.id,
        reviewRevision: batch.revision,
        action: 'recorded',
      });
    });
  }
}
