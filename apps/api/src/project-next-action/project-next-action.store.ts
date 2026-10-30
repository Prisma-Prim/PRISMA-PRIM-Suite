import { Injectable } from '@nestjs/common';
import { and, desc, eq, lt } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  projectNextActionCommands,
  projectNextActionHeads,
  projectNextActionHistory,
} from '../database/schema/project-next-action.js';
import { normalizeNextActionText } from './project-next-action.input.js';
import { nextActionMaterialRevision } from './project-next-action-revision.js';
import type {
  NextActionRecord,
  NextActionReceipt,
  NextActionScope,
} from './project-next-action.types.js';

type Head = typeof projectNextActionHeads.$inferSelect;
type History = typeof projectNextActionHistory.$inferSelect;
type Command = typeof projectNextActionCommands.$inferSelect;
function requireNormalized(value: string | null) {
  try {
    if (normalizeNextActionText(value) !== value)
      throw new Error('Invalid stored next-action text.');
  } catch {
    throw new Error('Invalid stored next-action text.');
  }
  return value;
}
function keys(value: unknown, expected: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid saved next-action representation.');
  const entries = Object.entries(value);
  if (
    entries.length !== expected.length ||
    entries.some(([name]) => !expected.includes(name))
  )
    throw new Error('Invalid saved next-action fields.');
  return Object.fromEntries(entries);
}
@Injectable()
export class ProjectNextActionStore {
  constructor(private readonly database: DatabaseContext) {}
  private condition(scope: NextActionScope) {
    return and(
      eq(projectNextActionHistory.workspaceId, scope.workspaceId),
      eq(projectNextActionHistory.companyId, scope.companyId),
      eq(projectNextActionHistory.projectId, scope.projectId),
    );
  }
  record(
    scope: NextActionScope,
    row: Head | History | undefined,
  ): NextActionRecord {
    if (!row)
      return {
        format: 'project-next-action-v1',
        ...scope,
        revision: 0,
        text: null,
        lastChange: null,
      };
    if (
      row.workspaceId !== scope.workspaceId ||
      row.companyId !== scope.companyId ||
      row.projectId !== scope.projectId ||
      row.originalClientAccountId !== scope.originalClientAccountId ||
      !Number.isInteger(row.revision) ||
      row.revision <= 0
    )
      throw new Error('Invalid stored next-action scope/revision.');
    return {
      format: 'project-next-action-v1',
      ...scope,
      revision: row.revision,
      text: requireNormalized(row.text),
      lastChange: {
        internalUserId: row.actorInternalUserId,
        workspaceMembershipId: row.actorMembershipId,
        displayName: row.actorDisplayName,
        occurredAt: row.occurredAt.toISOString(),
      },
    };
  }
  async current(scope: NextActionScope) {
    const [head] = await this.database.connection
      .select()
      .from(projectNextActionHeads)
      .where(
        and(
          eq(projectNextActionHeads.workspaceId, scope.workspaceId),
          eq(projectNextActionHeads.companyId, scope.companyId),
          eq(projectNextActionHeads.projectId, scope.projectId),
        ),
      );
    const [latest] = await this.database.connection
      .select()
      .from(projectNextActionHistory)
      .where(this.condition(scope))
      .orderBy(desc(projectNextActionHistory.revision))
      .limit(1);
    if (
      !head !== !latest ||
      (head &&
        latest &&
        JSON.stringify(this.record(scope, head)) !==
          JSON.stringify(this.record(scope, latest)))
    )
      throw new Error('Unavailable next-action head/history.');
    return this.record(scope, head);
  }
  async receipt(actor: ActorContext, key: string) {
    const [row] = await this.database.connection
      .select()
      .from(projectNextActionCommands)
      .where(
        and(
          eq(projectNextActionCommands.workspaceId, actor.workspaceId),
          eq(
            projectNextActionCommands.actorMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(projectNextActionCommands.idempotencyKey, key),
        ),
      );
    return row;
  }
  async history(scope: NextActionScope, before: number | undefined) {
    const rows = await this.database.connection
      .select()
      .from(projectNextActionHistory)
      .where(
        and(
          this.condition(scope),
          before === undefined
            ? undefined
            : lt(projectNextActionHistory.revision, before),
        ),
      )
      .orderBy(desc(projectNextActionHistory.revision))
      .limit(26);
    const entries = rows.map((row, index) => {
      const record = this.record(scope, row),
        next = rows[index + 1];
      if (
        row.predecessorRevision !== row.revision - 1 ||
        (row.revision === 1 && row.beforeText !== null) ||
        (next &&
          (next.revision !== row.predecessorRevision ||
            next.text !== row.beforeText)) ||
        !record.lastChange
      )
        throw new Error('Invalid stored next-action predecessor.');
      requireNormalized(row.beforeText);
      return {
        revision: row.revision,
        predecessorRevision: row.predecessorRevision,
        before: row.beforeText,
        after: record.text,
        attribution: record.lastChange,
      };
    });
    return {
      entries: entries.slice(0, 25),
      hasMore: rows.length > 25,
      nextBeforeRevision:
        rows.length > 25 ? (rows[24]?.revision ?? null) : null,
    };
  }
  response(
    outcome: NextActionReceipt['outcome'],
    record: NextActionRecord,
  ): NextActionReceipt {
    // The response-construction boundary is inside the caller's transaction.
    this.validateRecord(record);
    return { format: 'project-next-action-command-v1', outcome, record };
  }
  private validateRecord(value: unknown): NextActionRecord {
    const row = keys(value, [
      'format',
      'workspaceId',
      'companyId',
      'projectId',
      'originalClientAccountId',
      'revision',
      'text',
      'lastChange',
    ]);
    if (
      row.format !== 'project-next-action-v1' ||
      typeof row.revision !== 'number' ||
      !Number.isInteger(row.revision) ||
      row.revision < 0 ||
      row.revision > 2147483647 ||
      typeof row.workspaceId !== 'string' ||
      typeof row.companyId !== 'string' ||
      typeof row.projectId !== 'string' ||
      typeof row.originalClientAccountId !== 'string' ||
      (row.text !== null && typeof row.text !== 'string')
    )
      throw new Error('Invalid saved next-action record.');
    requireNormalized(row.text);
    const scope = {
      workspaceId: row.workspaceId,
      companyId: row.companyId,
      projectId: row.projectId,
      originalClientAccountId: row.originalClientAccountId,
    };
    if (row.revision === 0) {
      if (row.text !== null || row.lastChange !== null)
        throw new Error('Invalid virtual next action.');
      return {
        format: 'project-next-action-v1',
        ...scope,
        revision: 0,
        text: null,
        lastChange: null,
      };
    }
    const attribution = keys(row.lastChange, [
      'internalUserId',
      'workspaceMembershipId',
      'displayName',
      'occurredAt',
    ]);
    if (
      typeof attribution.internalUserId !== 'string' ||
      typeof attribution.workspaceMembershipId !== 'string' ||
      typeof attribution.displayName !== 'string' ||
      typeof attribution.occurredAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(
        attribution.occurredAt,
      ) ||
      new Date(attribution.occurredAt).toISOString() !== attribution.occurredAt
    )
      throw new Error('Invalid saved next-action attribution.');
    return {
      format: 'project-next-action-v1',
      ...scope,
      revision: row.revision,
      text: row.text,
      lastChange: {
        internalUserId: attribution.internalUserId,
        workspaceMembershipId: attribution.workspaceMembershipId,
        displayName: attribution.displayName,
        occurredAt: attribution.occurredAt,
      },
    };
  }
  async replay(scope: NextActionScope, command: Command) {
    const saved = keys(command.response, ['format', 'outcome', 'record']);
    if (
      saved.format !== 'project-next-action-command-v1' ||
      (saved.outcome !== 'changed' && saved.outcome !== 'unchanged')
    )
      throw new Error('Invalid saved next-action receipt.');
    const record = this.validateRecord(saved.record);
    const [fact] =
      record.revision === 0
        ? []
        : await this.database.connection
            .select()
            .from(projectNextActionHistory)
            .where(
              and(
                this.condition(scope),
                eq(projectNextActionHistory.revision, record.revision),
              ),
            );
    const expected = this.record(scope, fact);
    if (
      record.revision !== command.revision ||
      saved.outcome !== command.outcome ||
      JSON.stringify(record) !== JSON.stringify(expected)
    )
      throw new Error('Invalid next-action receipt/history coupling.');
    return this.response(saved.outcome, record);
  }
  async append(input: {
    scope: NextActionScope;
    actor: ActorContext;
    assignmentId: string;
    previous: NextActionRecord;
    text: string | null;
    lifecycleRevision: number;
    clientUseVersion: number;
    occurredAt: Date;
  }) {
    const { scope, actor, occurredAt } = input;
    const revision = nextActionMaterialRevision(input.previous.revision);
    const [history] = await this.database.connection
      .insert(projectNextActionHistory)
      .values({
        ...scope,
        revision,
        predecessorRevision: input.previous.revision,
        beforeText: input.previous.text,
        text: input.text,
        actorInternalUserId: actor.internalUserId,
        actorMembershipId: actor.workspaceMembershipId,
        actorDisplayName: actor.displayName,
        occurredAt,
        assignmentId: input.assignmentId,
        lifecycleRevision: input.lifecycleRevision,
        clientUseVersion: input.clientUseVersion,
      })
      .returning();
    if (!history) throw new Error('Next-action history was not recorded.');
    const value = {
      ...scope,
      revision,
      text: input.text,
      actorInternalUserId: actor.internalUserId,
      actorMembershipId: actor.workspaceMembershipId,
      actorDisplayName: actor.displayName,
      occurredAt,
    };
    if (input.previous.revision === 0)
      await this.database.connection
        .insert(projectNextActionHeads)
        .values(value);
    else {
      const changed = await this.database.connection
        .update(projectNextActionHeads)
        .set(value)
        .where(
          and(
            eq(projectNextActionHeads.workspaceId, scope.workspaceId),
            eq(projectNextActionHeads.companyId, scope.companyId),
            eq(projectNextActionHeads.projectId, scope.projectId),
            eq(projectNextActionHeads.revision, input.previous.revision),
          ),
        )
        .returning({ revision: projectNextActionHeads.revision });
      if (changed.length !== 1)
        throw new Error('Next-action head changed outside its barrier.');
    }
    return this.record(scope, history);
  }
  async remember(input: {
    actor: ActorContext;
    scope: NextActionScope;
    assignmentId: string;
    key: string;
    fingerprint: string;
    response: NextActionReceipt;
    clientUseVersion: number;
    occurredAt: Date;
  }) {
    await this.database.connection.insert(projectNextActionCommands).values({
      ...input.scope,
      actorInternalUserId: input.actor.internalUserId,
      actorMembershipId: input.actor.workspaceMembershipId,
      assignmentId: input.assignmentId,
      idempotencyKey: input.key,
      fingerprint: input.fingerprint,
      revision: input.response.record.revision,
      clientUseVersion: input.clientUseVersion,
      outcome: input.response.outcome,
      response: input.response,
      createdAt: input.occurredAt,
    });
  }
}
