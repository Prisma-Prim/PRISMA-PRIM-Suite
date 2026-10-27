import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import {
  requireIdempotencyKey,
  requireUuid,
} from '../access/access-command-validation.js';
import { MissionPlanAccessService } from '../access/mission-plan-access.service.js';
import { TaskAccessService } from '../access/task-access.service.js';
import {
  commandFingerprint,
  idempotencyConflict,
  runIdempotentCommand,
} from '../command/idempotent-command.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  missionPlanInstances,
  missionPlanTaskCopies,
} from '../database/schema/mission-plan.js';
import { projectCreationLock } from '../project/project-creation-lock.js';
import {
  ProjectService,
  readProjectTitle,
} from '../project/project.service.js';
import { TaskService } from '../task/task.service.js';
import { exactRecord } from './mission-plan.content.js';
import {
  readMissionPlanSelection,
  type MissionPlanSelection,
} from './mission-plan-selection.js';
import { MissionPlanService } from './mission-plan.service.js';

@Injectable()
export class MissionPlanCopyService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly access: MissionPlanAccessService,
    private readonly taskAccess: TaskAccessService,
    private readonly sources: MissionPlanService,
    private readonly projects: ProjectService,
    private readonly tasks: TaskService,
  ) {}
  create({
    actor,
    payload,
    key,
  }: {
    actor: ActorContext;
    payload: unknown;
    key: string | undefined;
  }) {
    const body = exactRecord(payload, [
      'title',
      'clientAccountId',
      'planId',
      'versionId',
      'versionNumber',
    ]);
    const input = {
      title: readProjectTitle(body.title),
      clientAccountId: requireUuid(body.clientAccountId),
      ...readMissionPlanSelection({
        planId: body.planId,
        versionId: body.versionId,
        versionNumber: body.versionNumber,
      }),
    };
    const idempotencyKey = requireIdempotencyKey(key);
    return runIdempotentCommand(this.database, {
      fingerprint: commandFingerprint({
        companyId: actor.activeCompany?.id,
        ...input,
      }),
      authorize: () => this.requireUseWithinTransaction(actor),
      lockParts: () => projectCreationLock(actor, idempotencyKey),
      findReceipt: async () => {
        const [row] = await this.database.connection
          .select()
          .from(missionPlanInstances)
          .where(
            and(
              eq(missionPlanInstances.workspaceId, actor.workspaceId),
              eq(
                missionPlanInstances.actorMembershipId,
                actor.workspaceMembershipId,
              ),
              eq(missionPlanInstances.idempotencyKey, idempotencyKey),
            ),
          );
        return row;
      },
      conflict: () => idempotencyConflict(),
      replay: async (_scope, receipt) =>
        this.projects.read(actor, receipt.projectId),
      execute: (companyId) =>
        this.createWithinTransaction({
          actor,
          companyId,
          input,
          key: idempotencyKey,
        }),
    });
  }
  /** Hold live User and Task read authority before the caller locks Client/Contract state. */
  async requireUseWithinTransaction(actor: ActorContext) {
    const companyId = await this.access.requireActor({
      actor,
      operation: 'instantiate',
      lock: true,
    });
    await this.taskAccess.requireActor(actor, false, true);
    return companyId;
  }

  /** Caller owns the transaction/receipt and holds live use authority in this Company. */
  async createWithinTransaction({
    actor,
    companyId,
    input,
    key,
  }: {
    actor: ActorContext;
    companyId: string;
    input: MissionPlanSelection & { title: string; clientAccountId: string };
    key: string;
  }) {
    // New creation alone needs create/manage rights and an active Client.
    if (!actor.activeCompany?.projectPermissions?.includes('project.create'))
      throw new ForbiddenException();
    await this.taskAccess.requireActor(actor, true, true);
    const version = await this.sources.versionWithinTransaction({
      actor,
      companyId,
      planId: input.planId,
      versionId: input.versionId,
    });
    if (version.versionNumber !== input.versionNumber)
      throw new BadRequestException(
        'The exact mission-plan Version is required.',
      );
    const project = await this.projects.createNewWithinTransaction(
      actor,
      { title: input.title, clientAccountId: input.clientAccountId },
      key,
    );
    const tasks = await this.tasks.createTemplateCopiesWithinTransaction({
      actor,
      projectId: project.id,
      titles: version.activities.map((a) => a.title),
    });
    await this.database.connection.insert(missionPlanInstances).values({
      workspaceId: actor.workspaceId,
      companyId,
      projectId: project.id,
      clientAccountId: input.clientAccountId,
      actorMembershipId: actor.workspaceMembershipId,
      idempotencyKey: key,
      fingerprint: commandFingerprint({ companyId, ...input }),
      planId: input.planId,
      versionId: input.versionId,
    });
    await this.database.connection.insert(missionPlanTaskCopies).values(
      version.activities.map((activity, position) => {
        const task = tasks[position];
        if (!task) throw new Error('Incomplete native Task creation.');
        return {
          workspaceId: actor.workspaceId,
          companyId,
          projectId: project.id,
          versionId: version.id,
          activityKey: activity.key,
          position,
          taskId: task.id,
        };
      }),
    );
    return project;
  }
  read({ actor, projectId }: { actor: ActorContext; projectId: string }) {
    return this.database.transaction(
      async () => {
        const companyId = await this.access.requireActor({
          actor,
          operation: 'read',
          lock: false,
        });
        await this.taskAccess.requireActor(actor);
        await this.projects.read(actor, requireUuid(projectId));
        const [instance] = await this.database.connection
          .select()
          .from(missionPlanInstances)
          .where(
            and(
              eq(missionPlanInstances.workspaceId, actor.workspaceId),
              eq(missionPlanInstances.companyId, companyId),
              eq(missionPlanInstances.projectId, projectId),
            ),
          );
        if (!instance) return { plan: null };
        const version = await this.sources.versionWithinTransaction({
          actor,
          companyId,
          planId: instance.planId,
          versionId: instance.versionId,
        });
        const tasks = await this.database.connection
          .select({
            activityKey: missionPlanTaskCopies.activityKey,
            position: missionPlanTaskCopies.position,
            taskId: missionPlanTaskCopies.taskId,
          })
          .from(missionPlanTaskCopies)
          .where(
            and(
              eq(missionPlanTaskCopies.workspaceId, actor.workspaceId),
              eq(missionPlanTaskCopies.companyId, companyId),
              eq(missionPlanTaskCopies.projectId, projectId),
            ),
          )
          .orderBy(asc(missionPlanTaskCopies.position));
        if (
          tasks.length !== version.activityCount ||
          tasks.some(
            (task, n) =>
              task.position !== n ||
              task.activityKey !== version.activities[n]?.key,
          )
        )
          throw new Error('Incomplete mission-plan Task mapping.');
        return { plan: { projectId, version, tasks } };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
}
