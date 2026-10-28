import { Injectable } from '@nestjs/common';
import {
  requireIdempotencyKey,
  requireUuid,
} from '../access/access-command-validation.js';
import type { ActorContext } from '../access/access.types.js';
import { DatabaseContext } from '../database/database-context.js';
import { TaskCommandStore } from './task-command.store.js';
import { TaskService } from './task.service.js';
import {
  planningInput,
  planningReceipt,
  readPlanningReceipt,
} from './task-planning.validation.js';

@Injectable()
export class TaskPlanningService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly tasks: TaskService,
    private readonly commands: TaskCommandStore,
  ) {}

  async plan(
    actor: ActorContext,
    projectValue: unknown,
    body: unknown,
    keyValue: string | undefined,
  ) {
    const projectId = requireUuid(projectValue),
      input = planningInput(body),
      key = requireIdempotencyKey(keyValue);
    return this.database.transaction(async () => {
      const scope = await this.tasks.planningScopeWithinTransaction({
        actor,
        projectId,
        taskIds: input.tasks.map((task) => task.taskId),
      });
      const command = JSON.stringify({
        action: 'plan-tasks',
        companyId: scope.companyId,
        projectId,
        ...input,
      });
      await this.commands.lock({ actor, key });
      const replay = await this.commands.read({ actor, key, command });
      if (replay !== undefined)
        return readPlanningReceipt(replay, {
          ...scope,
          taskIds: input.tasks.map((task) => task.taskId),
        });
      const changed = await this.tasks.planWithinTransaction({
        actor,
        scope,
        tasks: input.tasks,
      });
      const result = planningReceipt(projectId, changed);
      const first = changed[0];
      if (!first) throw new Error('A Task planning result must not be empty.');
      await this.commands.record({
        actor,
        key,
        command,
        companyId: scope.companyId,
        taskId: first.id,
        result,
      });
      return result;
    });
  }
}
