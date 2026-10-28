import { and, asc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { DatabaseContext } from '../database/database-context.js';
import { tasks } from '../database/schema/index.js';

/** Native 25+1 discovery selection. Caller owns authority, snapshot, predicate and projection. */
export async function nativeTaskPage(input: {
  database: DatabaseContext;
  workspaceId: string;
  companyId: string;
  projectIds: string[];
  predicate: SQL | undefined;
  offset: number;
}) {
  if (input.projectIds.length === 0) return [];
  return input.database.connection
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, input.workspaceId),
        eq(tasks.companyId, input.companyId),
        inArray(tasks.projectId, input.projectIds),
        input.predicate,
      ),
    )
    .orderBy(
      sql`${tasks.dueDate} ASC NULLS LAST`,
      asc(tasks.createdAt),
      asc(tasks.id),
    )
    .limit(26)
    .offset(input.offset);
}
