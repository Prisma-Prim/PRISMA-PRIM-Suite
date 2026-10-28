import { ConflictException, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { DatabaseContext } from '../database/database-context.js';
import { taskCommands } from '../database/schema/index.js';

/** Shared native Task namespace. The caller owns the transaction and receipt format. */
@Injectable()
export class TaskCommandStore {
  constructor(private readonly database: DatabaseContext) {}

  async lock(input: { actor: ActorContext; key: string }) {
    const lock = JSON.stringify([
      'task',
      input.actor.workspaceId,
      input.actor.workspaceMembershipId,
      input.key,
    ]);
    await this.database.connection.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${lock},0))`,
    );
  }

  async read(input: {
    actor: ActorContext;
    key: string;
    command: string;
  }): Promise<unknown> {
    const [existing] = await this.database.connection
      .select()
      .from(taskCommands)
      .where(
        and(
          eq(taskCommands.workspaceId, input.actor.workspaceId),
          eq(taskCommands.actorMembershipId, input.actor.workspaceMembershipId),
          eq(taskCommands.idempotencyKey, input.key),
        ),
      );
    if (!existing) return undefined;
    if (existing.command !== input.command)
      throw new ConflictException(
        'Idempotency-Key was already used for another Task command.',
      );
    return existing.result;
  }

  async record(input: {
    actor: ActorContext;
    key: string;
    command: string;
    companyId: string;
    taskId: string;
    result: unknown;
  }) {
    await this.database.connection.insert(taskCommands).values({
      workspaceId: input.actor.workspaceId,
      companyId: input.companyId,
      taskId: input.taskId,
      actorMembershipId: input.actor.workspaceMembershipId,
      idempotencyKey: input.key,
      command: input.command,
      result: input.result,
    });
  }
}
