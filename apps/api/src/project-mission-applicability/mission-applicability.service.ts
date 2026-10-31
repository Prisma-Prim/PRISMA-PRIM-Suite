import { applicabilityResultObservation } from './mission-applicability.result-observation.js';
import { MissionApplicabilityAccessService } from '../access/mission-applicability-access.service.js';
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import { DatabaseContext } from '../database/database-context.js';
import { ProjectService } from '../project/project.service.js';
import { isOpenProjectStatus } from '../project/project-status.js';
import { MissionReadinessService } from '../project-template/mission-readiness.service.js';
import { ProjectTemplateService } from '../project-template/project-template.service.js';
import { TaskResultsService } from '../task/task-results.service.js';
import {
  applicabilityHistoryQuery,
  applicabilityInput,
  applicabilityIdempotencyKey,
} from './mission-applicability.input.js';
import {
  MissionApplicabilityStore,
  type ApplicabilityFact,
} from './mission-applicability.store.js';
import {
  applicabilityKind,
  isPending,
  requireApplicabilityTransition,
  sameApplicabilityFact,
  nextApplicabilityRevision,
} from './mission-applicability.transition.js';

@Injectable()
export class MissionApplicabilityService {
  constructor(
    private readonly access: MissionApplicabilityAccessService,
    private readonly database: DatabaseContext,
    private readonly readiness: MissionReadinessService,
    private readonly store: MissionApplicabilityStore,
    private readonly authorization: CompanyContextAuthorization,
    private readonly templates: ProjectTemplateService,
    private readonly projects: ProjectService,
    private readonly results: TaskResultsService,
    private readonly clients: ClientOperationalReferenceService,
    private readonly accountability: AccountabilityService,
  ) {}
  private scope(actor: ActorContext, projectId: string) {
    if (!actor.activeCompany) throw new NotFoundException();
    return {
      workspaceId: actor.workspaceId,
      companyId: actor.activeCompany.id,
      projectId,
    };
  }
  private async source(actor: ActorContext, projectId: string) {
    await this.access.requireSourceReadWithinTransaction(actor);
    await this.clients.requireReferenceReadAuthorityWithinReadTransaction(
      actor,
    );
    const { assessment } = await this.readiness.readWithinTransaction(
      actor,
      projectId,
    );
    if (!(await this.access.hasEvidenceReadWithinTransaction(actor)))
      return { kind: 'unavailable' as const };
    if (!assessment) return null;
    const activities = [];
    for (const activity of assessment.activities) {
      if (activity.result.kind === 'unavailable')
        return { kind: 'unavailable' as const };
      activities.push({
        ...activity,
        result: {
          kind: 'available' as const,
          current: applicabilityResultObservation(activity.result.current),
        },
      });
    }
    const project = await this.projects.missionContextWithinTransaction({
      actor,
      projectId,
    });
    const client = await this.clients.readReferenceClient(
      actor,
      project.clientAccountId,
    );
    return {
      kind: 'available' as const,
      project,
      client,
      source: assessment.source,
      clarification: assessment.clarification,
      activities,
      mutable:
        client.status === 'active' && isOpenProjectStatus(project.status),
    };
  }
  async read(actor: ActorContext, projectId: string) {
    return this.database
      .transaction(
        async () => {
          const source = await this.source(actor, projectId);
          if (!source) return { applicability: null };
          if (source.kind === 'unavailable') return { applicability: source };
          const scope = this.scope(actor, projectId),
            latest = await this.store.stream(scope),
            activities = [];
          const projections = new Map<
            string,
            ReturnType<MissionApplicabilityStore['view']>
          >();
          const view = (fact: ApplicabilityFact) => {
            const cached = projections.get(fact.id);
            if (cached) return cached;
            const projected = this.store.view(actor, fact);
            projections.set(fact.id, projected);
            return projected;
          };
          try {
            for (const activity of source.activities) {
              const last = await this.store.latest(scope, activity.task.id);
              const proposal = await this.store.latest(
                scope,
                activity.task.id,
                ['PROPOSED', 'PROPOSAL_CORRECTED'],
              );
              const decision = await this.store.latest(
                scope,
                activity.task.id,
                ['APPROVED', 'REJECTED'],
              );
              const restoration = await this.store.latest(
                scope,
                activity.task.id,
                ['RESTORED'],
              );
              activities.push({
                ...activity,
                applicability:
                  last?.kind === 'APPROVED'
                    ? 'EXCLUDED_BY_APPROVER'
                    : 'REQUIRED',
                pendingProposal:
                  last && isPending(last) ? await view(last) : null,
                lastProposal: proposal ? await view(proposal) : null,
                lastDecision: decision ? await view(decision) : null,
                lastRestoration: restoration ? await view(restoration) : null,
                activeApproval:
                  last?.kind === 'APPROVED' ? await view(last) : null,
              });
            }
          } catch (error) {
            if (
              error instanceof ForbiddenException ||
              error instanceof NotFoundException
            )
              return { applicability: { kind: 'unavailable' as const } };
            throw error;
          }
          return {
            applicability: {
              kind: 'available' as const,
              project: source.project,
              source: source.source,
              lifecycleRevision: source.project.lifecycleRevision,
              revision: latest?.revision ?? 0,
              mutable: source.mutable,
              clarification: source.clarification,
              activities,
            },
          };
        },
        { isolationLevel: 'repeatable read', accessMode: 'read only' },
      )
      .catch(applicabilityFailure);
  }
  async history(actor: ActorContext, projectId: string, query: unknown) {
    const before = applicabilityHistoryQuery(query);
    return this.database
      .transaction(
        async () => {
          const source = await this.source(actor, projectId);
          if (!source) return { history: null };
          if (source.kind === 'unavailable') return { history: source };
          const scope = this.scope(actor, projectId);
          await this.store.stream(scope);
          let rows: ApplicabilityFact[];
          const facts = [];
          try {
            rows = await this.store.page(actor, scope, before);
            for (const row of rows)
              facts.push(await this.store.view(actor, row));
          } catch (error) {
            if (
              error instanceof ForbiddenException ||
              error instanceof NotFoundException
            )
              return { history: { kind: 'unavailable' as const } };
            throw error;
          }
          return {
            history: {
              kind: 'available' as const,
              facts: facts.slice(0, 25),
              hasMore: rows.length > 25,
              nextBeforeRevision:
                rows.length > 25 ? (rows[24]?.revision ?? null) : null,
            },
          };
        },
        { isolationLevel: 'repeatable read', accessMode: 'read only' },
      )
      .catch(applicabilityFailure);
  }
  async record(
    actor: ActorContext,
    projectId: string,
    body: unknown,
    key: string | undefined,
  ) {
    const input = applicabilityInput(body),
      idempotencyKey = applicabilityIdempotencyKey(key);
    return this.database
      .transaction(async () => {
        await this.access.requireSourceReadWithinTransaction(actor, true);
        await this.templates.requirePilotReviewWithinTransaction(actor);
        const capture =
          input.action === 'PROPOSE' || input.action === 'CORRECT_PROPOSAL'
            ? await this.authorization.requireMissionApplicabilityCoordinator(
                actor,
              )
            : await this.authorization.requireMissionApplicabilityApprover(
                actor,
              );
        const scope = this.scope(actor, projectId);
        if (!(await this.access.hasEvidenceReadWithinTransaction(actor, true)))
          throw new NotFoundException();
        const source = await this.source(actor, projectId);
        if (!source)
          throw new ConflictException(
            'This Project has no supported applicability plan.',
          );
        if (source.kind === 'unavailable') throw new NotFoundException();
        await this.clients.requireCapturedReferenceReadAuthorityWithinTransaction(
          actor,
        );
        for (const row of source.activities)
          await this.results.requireReviewReadWithinTransaction({
            actor,
            taskId: row.task.id,
          });
        const command = JSON.stringify({
          companyId: scope.companyId,
          projectId,
          ...input,
        });
        const mutex = JSON.stringify([
          'mission.applicability.command',
          actor.workspaceId,
          actor.workspaceMembershipId,
          idempotencyKey,
        ]);
        await this.database.connection.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${mutex},0))`,
        );
        const receipt = await this.store.receipt(actor, idempotencyKey);
        if (receipt) {
          if (receipt.command !== command)
            throw new ConflictException(
              'Idempotency-Key was used for another applicability intent.',
            );
          const fact = await this.store.fact(scope, receipt.factId);
          await this.store.view(actor, fact);
          if (receipt.applicabilityRevision !== fact.revision)
            throw new Error('Invalid immutable applicability receipt.');
          return this.store.response(receipt);
        }
        if (!source.mutable)
          throw new ConflictException(
            'New applicability facts require an open Project and active original Client.',
          );
        const selected = source.activities.find(
          (row) => row.task.id === input.taskId,
        );
        if (!selected)
          throw new ConflictException(
            'Select an exact mapped mission activity.',
          );
        try {
          await this.clients.lockActiveReferenceClient(
            actor,
            source.project.clientAccountId,
          );
        } catch (error) {
          if (error instanceof NotFoundException)
            throw new ConflictException(
              'The original Client or relationship is no longer active.',
            );
          throw error;
        }
        const project = await this.projects.missionContextWithinTransaction({
          actor,
          projectId,
          lock: true,
        });
        if (!isOpenProjectStatus(project.status))
          throw new ConflictException('This Project is closed.');
        const target = await this.results.lockReviewTargetWithinTransaction({
          actor,
          taskId: input.taskId,
        });
        await this.store.serialize(scope);
        const latest = await this.store.stream(scope);
        if (
          input.expectedApplicabilityRevision !== (latest?.revision ?? 0) ||
          input.expectedLifecycleRevision !== project.lifecycleRevision ||
          input.expectedTaskVersion !== target.task.version ||
          input.expectedResultRevision !== (target.current?.revision ?? 0)
        )
          throw new ConflictException(
            'The observed mission facts changed. Reload and review again.',
          );
        const last = await this.store.latest(scope, input.taskId);
        const candidate =
          input.action === 'DECIDE'
            ? await this.store.latest(scope, input.taskId, [
                'APPROVED',
                'REJECTED',
              ])
            : input.action === 'RESTORE'
              ? await this.store.latest(scope, input.taskId, ['RESTORED'])
              : last;
        if (
          candidate &&
          sameApplicabilityFact(
            actor,
            input,
            candidate,
            this.store.intent(candidate),
          )
        )
          return this.store.saveReceipt({
            ...scope,
            actorMembershipId: actor.workspaceMembershipId,
            idempotencyKey,
            command,
            factId: candidate.id,
            applicabilityRevision: candidate.revision,
            action: 'unchanged',
          });
        requireApplicabilityTransition(
          input,
          last,
          last ? this.store.intent(last) : null,
        );
        const nextRevision = nextApplicabilityRevision(latest?.revision ?? 0);
        const fact = await this.store.append({
          ...scope,
          clientAccountId: source.project.clientAccountId,
          relationshipId: source.client.relationshipId,
          revision: nextRevision,
          predecessorId: latest?.id ?? null,
          activityPredecessorId: last?.id ?? null,
          taskId: input.taskId,
          position: source.activities.findIndex(
            (row) => row.task.id === input.taskId,
          ),
          activityKey: selected.key,
          sourceTitle: selected.title,
          sourceActivity: selected.activity,
          intendedResult: selected.intendedResult,
          kind: applicabilityKind(input),
          intent: input,
          taskTitle: target.task.title,
          taskStatus: target.task.status,
          taskVersion: target.task.version,
          resultRevision: input.expectedResultRevision,
          resultId: target.current?.id ?? null,
          lifecycleRevision: project.lifecycleRevision,
          actorInternalUserId: actor.internalUserId,
          actorMembershipId: actor.workspaceMembershipId,
          actorDisplayName: actor.displayName,
          assignmentId: capture.assignmentId,
          permissionSetVersion: capture.permissionSetVersion,
          occurredAt: new Date(),
        });
        await this.accountability.recordMissionApplicabilityEvent({
          actor,
          companyId: scope.companyId,
          projectId,
          factId: fact.id,
          applicabilityRevision: fact.revision,
          kind: fact.kind,
          occurredAt: fact.occurredAt,
        });
        await this.clients.recordReferenceUse(
          actor,
          source.project.clientAccountId,
        );
        return this.store.saveReceipt({
          ...scope,
          actorMembershipId: actor.workspaceMembershipId,
          idempotencyKey,
          command,
          factId: fact.id,
          applicabilityRevision: fact.revision,
          action: 'recorded',
        });
      })
      .catch(applicabilityFailure);
  }
}

function applicabilityFailure(error: unknown): never {
  if (error instanceof HttpException) throw error;
  throw new InternalServerErrorException('The applicability operation failed.');
}
