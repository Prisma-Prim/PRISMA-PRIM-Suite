import { BadRequestException, Injectable } from '@nestjs/common';
import type { ActorContext } from '../access/access.types.js';
import { requireUuid } from '../access/access-command-validation.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { MissionPlanAccessService } from '../access/mission-plan-access.service.js';
import { TaskAccessService } from '../access/task-access.service.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import { DatabaseContext } from '../database/database-context.js';
import { ProjectService } from '../project/project.service.js';
import { TaskResultsService } from '../task/task-results.service.js';
import { readTaskView } from '../task/task.validation.js';
import { MissionPlanCopyService } from './mission-plan-copy.service.js';

/** Bounded composition only. Native owners retain facts, authority and current-result meaning. */
@Injectable()
export class MissionPlanCurrentWorkService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly access: MissionPlanAccessService,
    private readonly taskAccess: TaskAccessService,
    private readonly authorization: CompanyContextAuthorization,
    private readonly clients: ClientOperationalReferenceService,
    private readonly projects: ProjectService,
    private readonly copies: MissionPlanCopyService,
    private readonly results: TaskResultsService,
  ) {}

  read(input: { actor: ActorContext; projectId: unknown; query: unknown }) {
    return this.database.transaction(
      async () => {
        const { actor } = input;
        const companyId = await this.access.requireActor({
          actor,
          operation: 'read',
          lock: false,
        });
        await this.taskAccess.requireActor(actor);
        await this.authorization.requireProjectReadPermission(actor);
        await this.clients.requireReferenceReadAuthorityWithinReadTransaction(
          actor,
        );
        const projectId = requireUuid(input.projectId);
        if (
          !input.query ||
          typeof input.query !== 'object' ||
          Array.isArray(input.query) ||
          Object.keys(input.query).length !== 0
        )
          throw new BadRequestException('Unsupported current-work query.');
        const project = await this.projects.read(actor, projectId);
        const { plan } = await this.copies.readWithinTransaction({
          actor,
          companyId,
          project,
        });
        if (plan === null) return { overview: null };
        const activities = [];
        for (const mapping of plan.tasks) {
          const current = await this.results.readinessWithinTransaction(
            actor,
            mapping.taskId,
          );
          const task = readTaskView(current.task);
          if (
            task.id !== mapping.taskId ||
            task.title !== current.task.title ||
            task.companyId !== companyId ||
            task.projectId !== projectId ||
            task.clientAccountId !== project.clientAccountId
          )
            throw new Error('Invalid mission-plan native Task binding.');
          activities.push({
            activityKey: mapping.activityKey,
            position: mapping.position,
            task,
            result: current.result,
          });
        }
        return {
          overview: {
            workspaceId: actor.workspaceId,
            companyId,
            project: {
              id: projectId,
              clientAccountId: project.clientAccountId,
              status: project.status,
            },
            plan,
            activities,
          },
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
}
