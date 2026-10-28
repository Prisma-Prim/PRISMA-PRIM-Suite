import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ActorContext } from '../access/access.types.js';
import { TaskAccessService } from '../access/task-access.service.js';
import { DatabaseContext } from '../database/database-context.js';
import { ProjectService } from '../project/project.service.js';
import { nativeTaskPage } from './native-task-page.query.js';
import { nativeTaskView } from './native-task-view.js';
import { readTeamTaskProjection } from './team-task-projection.js';
import { teamTasksPredicate, teamTasksQuery } from './team-tasks.query.js';

/** One bounded native read. Every participant joins this caller-owned readonly snapshot. */
@Injectable()
export class TeamTasksService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly access: TaskAccessService,
    private readonly projects: ProjectService,
  ) {}
  async list(actor: ActorContext, originalUrl: string) {
    if (!actor.active || !actor.activeCompany) throw new ForbiddenException();
    const { offset, appliedFilters } = teamTasksQuery(originalUrl);
    return this.database.transaction(
      async () => {
        const companyId =
          await this.access.requireActorWithinReadTransaction(actor);
        const projects = new Map(
          (await this.projects.listWithinReadTransaction(actor)).map((p) => [
            p.id,
            p,
          ]),
        );
        const rows = await nativeTaskPage({
          database: this.database,
          workspaceId: actor.workspaceId,
          companyId,
          projectIds: [...projects.keys()],
          predicate: teamTasksPredicate(appliedFilters),
          offset,
        });
        const tasks = rows.map((row) => {
          const project = projects.get(row.projectId);
          if (!project || project.clientAccountId !== row.clientAccountId)
            throw new ServiceUnavailableException(
              'Native Project facts are unavailable.',
            );
          return readTeamTaskProjection(nativeTaskView(row), {
            id: project.id,
            title: project.title,
            clientDisplayName: project.clientDisplayName,
          });
        });
        return {
          companyId,
          offset,
          pageSize: 25,
          hasNextPage: rows.length > 25,
          appliedFilters,
          tasks: tasks.slice(0, 25),
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
}
