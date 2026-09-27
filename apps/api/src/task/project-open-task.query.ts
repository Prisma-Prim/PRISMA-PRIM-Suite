import { Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { DatabaseContext } from '../database/database-context.js';
import { tasks } from '../database/schema/index.js';
import { OPEN_TASK_STATES } from './task.types.js';

/** The Task module's narrow read-only lifecycle query. */
@Injectable()
export class ProjectOpenTaskQuery {
  constructor(private readonly database: DatabaseContext) {}

  async exists(input: {
    workspaceId: string;
    companyId: string;
    projectId: string;
  }): Promise<boolean> {
    const [task] = await this.database.connection
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.workspaceId, input.workspaceId),
          eq(tasks.companyId, input.companyId),
          eq(tasks.projectId, input.projectId),
          inArray(tasks.status, [...OPEN_TASK_STATES]),
        ),
      )
      .limit(1);
    return task !== undefined;
  }
}
