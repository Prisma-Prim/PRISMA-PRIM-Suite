import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { and, desc, eq, lt, or, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  internalCompanyTasks as tasks,
  internalCompanyTaskHistory as facts,
  internalCompanyTaskCommands as commands,
} from '../database/schema/internal-task.js';
import {
  history,
  receipt,
  snapshot,
  type History,
  type Receipt,
  type Snapshot,
} from './internal-task.contract.js';

export function stable(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
}
export interface Scope {
  workspaceId: string;
  companyId: string;
}
@Injectable()
export class InternalTaskStore {
  constructor(private readonly database: DatabaseContext) {}
  private condition(scope: Scope, id: string) {
    return and(
      eq(tasks.workspaceId, scope.workspaceId),
      eq(tasks.companyId, scope.companyId),
      eq(tasks.id, id),
    );
  }
  async visible(scope: Scope, id: string) {
    const [row] = await this.database.connection
      .select({ id: tasks.id })
      .from(tasks)
      .where(this.condition(scope, id));
    if (!row) throw new NotFoundException();
  }
  async current(scope: Scope, id: string, lock = false): Promise<Snapshot> {
    const query = this.database.connection
      .select()
      .from(tasks)
      .where(this.condition(scope, id));
    const [row] = lock ? await query.for('update') : await query;
    if (!row) throw new NotFoundException();
    const task = snapshot(row.snapshot);
    if (
      task.id !== id ||
      task.workspaceId !== scope.workspaceId ||
      task.companyId !== scope.companyId ||
      task.version !== row.version
    )
      throw new ServiceUnavailableException({
        code: 'INTERNAL_TASK_UNAVAILABLE',
      });
    const [latest] = await this.database.connection
      .select()
      .from(facts)
      .where(
        and(
          eq(facts.workspaceId, scope.workspaceId),
          eq(facts.companyId, scope.companyId),
          eq(facts.taskId, id),
        ),
      )
      .orderBy(desc(facts.version))
      .limit(1);
    if (!latest || stable(history(latest.fact).after) !== stable(task))
      throw new ServiceUnavailableException({
        code: 'INTERNAL_TASK_UNAVAILABLE',
      });
    return task;
  }
  async detail(scope: Scope, id: string, before: number | undefined) {
    const task = await this.current(scope, id);
    const rows = await this.database.connection
      .select()
      .from(facts)
      .where(
        and(
          eq(facts.workspaceId, scope.workspaceId),
          eq(facts.companyId, scope.companyId),
          eq(facts.taskId, id),
          before === undefined ? undefined : lt(facts.version, before),
        ),
      )
      .orderBy(desc(facts.version))
      .limit(26);
    const entries = rows.map((row) => {
      const fact = history(row.fact);
      if (
        fact.workspaceId !== scope.workspaceId ||
        fact.companyId !== scope.companyId ||
        fact.taskId !== id ||
        fact.version !== row.version ||
        fact.actorMembershipId !== row.actorMembershipId ||
        fact.recordedAt !== row.recordedAt.toISOString()
      )
        throw new ServiceUnavailableException({
          code: 'INTERNAL_TASK_UNAVAILABLE',
        });
      return fact;
    });
    return {
      format: 'company-internal-task-detail-v1',
      task,
      history: entries.slice(0, 25),
      nextBeforeVersion:
        entries.length > 25 ? (entries[24]?.version ?? null) : null,
    };
  }
  async page(scope: Scope, filter: string, beforeTaskId: string | undefined) {
    let boundary;
    if (beforeTaskId) {
      const [cursor] = await this.database.connection
        .select({ id: tasks.id, createdAt: tasks.createdAt })
        .from(tasks)
        .where(this.condition(scope, beforeTaskId));
      if (!cursor) throw new NotFoundException();
      boundary = or(
        lt(tasks.createdAt, cursor.createdAt),
        and(eq(tasks.createdAt, cursor.createdAt), lt(tasks.id, cursor.id)),
      );
    }
    const rows = await this.database.connection
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.workspaceId, scope.workspaceId),
          eq(tasks.companyId, scope.companyId),
          boundary,
          filter === 'all'
            ? undefined
            : filter === 'open'
              ? sql`${tasks.snapshot}->>'status' IN ('todo','in_progress','blocked')`
              : sql`${tasks.snapshot}->>'status'=${filter}`,
        ),
      )
      .orderBy(desc(tasks.createdAt), desc(tasks.id))
      .limit(26);
    const entries = rows.map((row) => {
      const task = snapshot(row.snapshot);
      if (
        task.workspaceId !== scope.workspaceId ||
        task.companyId !== scope.companyId ||
        task.id !== row.id ||
        task.version !== row.version
      )
        throw new ServiceUnavailableException({
          code: 'INTERNAL_TASK_UNAVAILABLE',
        });
      return task;
    });
    return {
      format: 'company-internal-task-page-v1',
      tasks: entries.slice(0, 25),
      nextBeforeTaskId: entries.length > 25 ? (entries[24]?.id ?? null) : null,
    };
  }
  async command(actor: ActorContext, key: string) {
    const [row] = await this.database.connection
      .select()
      .from(commands)
      .where(
        and(
          eq(commands.workspaceId, actor.workspaceId),
          eq(commands.actorMembershipId, actor.workspaceMembershipId),
          eq(commands.idempotencyKey, key),
        ),
      );
    return row;
  }
  response(task: Snapshot, fact: History | null): Receipt {
    return receipt({
      format: 'company-internal-task-command-v1',
      task,
      changed: fact !== null,
      history: fact,
    });
  }
  async append(actor: ActorContext, task: Snapshot, fact: History) {
    const values = {
      workspaceId: task.workspaceId,
      companyId: task.companyId,
      id: task.id,
      version: task.version,
      creatorMembershipId: task.createdByMembershipId,
      assigneeMembershipId: task.assignee?.membershipId ?? null,
      createdAt: new Date(task.createdAt),
      snapshot: snapshot(task),
    };
    if (fact.kind === 'CREATE')
      await this.database.connection.insert(tasks).values(values);
    else
      await this.database.connection
        .update(tasks)
        .set({
          version: task.version,
          assigneeMembershipId: values.assigneeMembershipId,
          snapshot: values.snapshot,
        })
        .where(this.condition(task, task.id));
    await this.database.connection.insert(facts).values({
      workspaceId: task.workspaceId,
      companyId: task.companyId,
      taskId: task.id,
      version: task.version,
      actorMembershipId: actor.workspaceMembershipId,
      actorInternalUserId: actor.internalUserId,
      recordedAt: new Date(fact.recordedAt),
      fact: history(fact),
    });
  }
  async remember(input: {
    actor: ActorContext;
    assignmentId: string;
    key: string;
    intent: unknown;
    response: Receipt;
    recordedAt: Date;
  }) {
    const response = receipt(input.response),
      task = response.task;
    await this.database.connection.insert(commands).values({
      workspaceId: task.workspaceId,
      companyId: task.companyId,
      taskId: task.id,
      version: task.version,
      actorMembershipId: input.actor.workspaceMembershipId,
      actorInternalUserId: input.actor.internalUserId,
      assignmentId: input.assignmentId,
      idempotencyKey: input.key,
      intent: input.intent,
      response,
      changed: response.changed ? 1 : 0,
      recordedAt: input.recordedAt,
    });
  }
}
