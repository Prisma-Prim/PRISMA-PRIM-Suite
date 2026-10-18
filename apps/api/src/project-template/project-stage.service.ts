import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { requireIdempotencyKey } from '../access/access-command-validation.js';
import { ProjectStageAccessService } from '../access/project-stage-access.service.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  projectTemplateInstances,
  projectStageCommands,
  projectStageTransitions,
} from '../database/schema/index.js';
import { ProjectService } from '../project/project.service.js';
import { ProjectClosedGuard } from '../project/project-closed.guard.js';
import { isOpenProjectStatus } from '../project/project-status.js';
import { TaskService } from '../task/task.service.js';
import { ProjectTemplateService } from './project-template.service.js';
import {
  readStageTaskProof,
  stageCommand,
  type ProjectStageReceipt,
} from './project-stage.types.js';

type Transition = typeof projectStageTransitions.$inferSelect;

/** Only the approved first transition of the preserved illustrative Project copy. */
@Injectable()
export class ProjectStageService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly access: ProjectStageAccessService,
    private readonly templates: ProjectTemplateService,
    private readonly projects: ProjectService,
    private readonly closed: ProjectClosedGuard,
    private readonly tasks: TaskService,
    private readonly clients: ClientOperationalReferenceService,
    private readonly accountability: AccountabilityService,
  ) {}

  async read(actor: ActorContext, projectId: string) {
    return this.database.transaction(
      async () => {
        const companyId = await this.access.requireReader(actor);
        const { template } = await this.templates.readWithinTransaction(
          actor,
          projectId,
        );
        if (!template) return { progress: null };
        const instance = await this.instance({ actor, companyId, projectId });
        const project = await this.projects.read(actor, projectId);
        const client = await this.clients.readReferenceClient(
          actor,
          project.clientAccountId,
        );
        const currentStageKey =
          instance.currentStageKey ?? template.stages[0]?.key;
        const current = template.stages.find(
          (stage) => stage.key === currentStageKey,
        );
        if (!current) throw new Error('Invalid stored current Project stage.');
        const next =
          instance.stageRevision === 0 ? template.stages[1] : undefined;
        const requiredTasks = await this.tasks.readStageGateWithinTransaction({
          actor,
          projectId,
          taskIds: current.tasks.map((task) => task.taskId),
        });
        const transitions = await this.database.connection
          .select()
          .from(projectStageTransitions)
          .where(
            and(
              eq(projectStageTransitions.workspaceId, actor.workspaceId),
              eq(projectStageTransitions.companyId, companyId),
              eq(projectStageTransitions.projectId, projectId),
            ),
          );
        const gate = !next
          ? 'last_supported_stage'
          : !isOpenProjectStatus(project.status)
            ? 'project_closed'
            : client.status !== 'active'
              ? 'original_client_inactive'
              : !requiredTasks.every((task) => task.status === 'done')
                ? 'required_tasks_incomplete'
                : !(await this.access.canAdvance(actor))
                  ? 'advance_authority_required'
                  : 'ready';
        return {
          progress: {
            currentStageKey: current.key,
            currentStageTitle: current.title,
            stageRevision: instance.stageRevision,
            nextStage: next ? { key: next.key, title: next.title } : null,
            requiredTasks: requiredTasks.map((task, index) => ({
              ...current.tasks[index],
              ...task,
            })),
            gate,
            canAdvance: gate === 'ready',
            transitions: transitions.map(transitionView),
          },
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  async advance({
    actor,
    projectId,
    body,
    key,
  }: {
    actor: ActorContext;
    projectId: string;
    body: unknown;
    key: string | undefined;
  }): Promise<ProjectStageReceipt> {
    const command = stageCommand(body);
    const idempotencyKey = requireIdempotencyKey(key);
    return this.database.transaction(async () => {
      const lock = JSON.stringify([
        'project.stage.advance',
        actor.workspaceId,
        actor.workspaceMembershipId,
        idempotencyKey,
      ]);
      await this.database.connection.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${lock}, 0))`,
      );
      const companyId = await this.access.requireAdvance(actor);
      const fingerprint = JSON.stringify({ companyId, projectId, ...command });
      const [committed] = await this.database.connection
        .select({
          command: projectStageCommands,
          transition: projectStageTransitions,
        })
        .from(projectStageCommands)
        .innerJoin(
          projectStageTransitions,
          and(
            eq(
              projectStageTransitions.workspaceId,
              projectStageCommands.workspaceId,
            ),
            eq(
              projectStageTransitions.companyId,
              projectStageCommands.companyId,
            ),
            eq(
              projectStageTransitions.projectId,
              projectStageCommands.projectId,
            ),
            eq(projectStageTransitions.id, projectStageCommands.transitionId),
          ),
        )
        .where(
          and(
            eq(projectStageCommands.workspaceId, actor.workspaceId),
            eq(
              projectStageCommands.actorMembershipId,
              actor.workspaceMembershipId,
            ),
            eq(projectStageCommands.idempotencyKey, idempotencyKey),
          ),
        );
      // A live authorized actor can conflict with their own key across changed intents.
      // Confirming the historical outcome still requires actual copied-plan visibility.
      if (committed && committed.command.fingerprint !== fingerprint)
        throw conflict('project_stage_key_conflict');
      // Visibility remains independent of advance authority, including historical original Clients.
      const { template } = await this.templates.readWithinTransaction(
        actor,
        projectId,
      );
      if (!template) throw new NotFoundException();
      const project = await this.projects.read(actor, projectId);
      if (committed) return receipt(committed.transition);
      // The same original-Client identity barrier as Task edits/reopening, closure and union/reversal.
      await this.clients.lockActiveReferenceClient(
        actor,
        project.clientAccountId,
      );
      await this.closed.requireOpen({ actor, companyId, projectId });
      const instance = await this.instance({
        actor,
        companyId,
        projectId,
        lock: true,
      });
      const from = template.stages[0];
      const to = template.stages[1];
      if (
        !from ||
        !to ||
        template.templateKey !== 'CONSULTING_PREPARATION_ILLUSTRATIVE' ||
        template.version !== 1 ||
        from.key !== 'scoping' ||
        to.key !== 'preparation' ||
        instance.stageRevision !== command.expectedStageRevision ||
        (instance.currentStageKey ?? from.key) !== command.expectedStageKey ||
        instance.stageRevision !== 0 ||
        command.expectedStageKey !== from.key ||
        command.targetStageKey !== to.key
      )
        throw conflict('project_stage_conflict');
      const requiredTasks = await this.tasks.readStageGateWithinTransaction({
        actor,
        projectId,
        taskIds: from.tasks.map((task) => task.taskId),
      });
      if (!requiredTasks.every((task) => task.status === 'done'))
        throw conflict('project_stage_required_tasks_incomplete');
      const occurredAt = new Date();
      const transition = await this.accountability.recordProjectStageChanged({
        actor,
        companyId,
        projectId,
        stageRevision: 1,
        fromStageKey: from.key,
        fromStageTitle: from.title,
        toStageKey: to.key,
        toStageTitle: to.title,
        requiredTasks: requiredTasks.map((task) => ({
          taskId: task.taskId,
          version: task.version,
        })),
        occurredAt,
      });
      await this.database.connection
        .update(projectTemplateInstances)
        .set({ currentStageKey: to.key, stageRevision: 1 })
        .where(
          and(
            eq(projectTemplateInstances.workspaceId, actor.workspaceId),
            eq(projectTemplateInstances.companyId, companyId),
            eq(projectTemplateInstances.projectId, projectId),
          ),
        );
      await this.database.connection.insert(projectStageCommands).values({
        workspaceId: actor.workspaceId,
        companyId,
        projectId,
        actorMembershipId: actor.workspaceMembershipId,
        idempotencyKey,
        fingerprint,
        transitionId: transition.id,
      });
      await this.clients.recordReferenceUse(actor, project.clientAccountId);
      return receipt(transition);
    });
  }

  private async instance({
    actor,
    companyId,
    projectId,
    lock = false,
  }: {
    actor: ActorContext;
    companyId: string;
    projectId: string;
    lock?: boolean;
  }) {
    const query = this.database.connection
      .select()
      .from(projectTemplateInstances)
      .where(
        and(
          eq(projectTemplateInstances.workspaceId, actor.workspaceId),
          eq(projectTemplateInstances.companyId, companyId),
          eq(projectTemplateInstances.projectId, projectId),
        ),
      );
    const [row] = lock ? await query.for('update') : await query;
    if (!row) throw new NotFoundException();
    return row;
  }
}
function receipt(row: Transition): ProjectStageReceipt {
  return {
    projectId: row.projectId,
    transitionId: row.id,
    stageRevision: row.stageRevision,
    fromStageKey: row.fromStageKey,
    toStageKey: row.toStageKey,
  };
}
function transitionView(row: Transition) {
  return {
    ...receipt(row),
    fromStageTitle: row.fromStageTitle,
    toStageTitle: row.toStageTitle,
    actor: {
      internalUserId: row.actorInternalUserId,
      workspaceMembershipId: row.actorMembershipId,
      displayName: row.actorDisplayName,
    },
    occurredAt: row.occurredAt.toISOString(),
    requiredTasks: readStageTaskProof(row.requiredTasks),
  };
}
function conflict(code: string) {
  return new ConflictException({
    statusCode: 409,
    code,
    message:
      'The Project stage intent is no longer available. Reload its progress before choosing another action.',
  });
}
