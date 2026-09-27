import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { DatabaseContext } from '../database/database-context.js';
import { projects } from '../database/schema/index.js';
import { isOpenProjectStatus } from './project-status.js';

type ClosedProjectOutcome = 'conflict' | 'not_found';

/**
 * The Project module's one public closed-Project guard. Mutation callers use it
 * after locking the original Client; mutation-only eligibility reads use the
 * same check with a safe not-found outcome.
 */
@Injectable()
export class ProjectClosedGuard {
  constructor(private readonly database: DatabaseContext) {}

  async requireOpen(input: {
    actor: ActorContext;
    companyId: string;
    projectId: string;
    closedAs?: ClosedProjectOutcome;
  }): Promise<void> {
    const [project] = await this.database.connection
      .select({ status: projects.status })
      .from(projects)
      .where(
        and(
          eq(projects.workspaceId, input.actor.workspaceId),
          eq(projects.companyId, input.companyId),
          eq(projects.id, input.projectId),
        ),
      );
    if (!project) throw new NotFoundException();
    if (isOpenProjectStatus(project.status)) return;
    if (input.closedAs === 'not_found') throw new NotFoundException();
    throw new ConflictException({
      statusCode: 409,
      code: 'project_closed',
      message: 'This Project is closed. Its records are read-only.',
    });
  }
}
