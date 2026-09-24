import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import {
  requireIdempotencyKey,
  requireUuid,
} from '../access/access-command-validation.js';
import { TaskAccessService } from '../access/task-access.service.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import { DatabaseContext } from '../database/database-context.js';
import { taskCommands, tasks } from '../database/schema/index.js';
import { ProjectService } from '../project/project.service.js';
import {
  assignedTasksQuery,
  createInput,
  editInput,
  readTaskView,
  transitionInput,
  type TaskEdit,
} from './task.validation.js';
import {
  DEFAULT_TASK_PRIORITY,
  type AssignedTaskView,
  type TaskChanges,
  type TaskEventMeaning,
  type TaskFields,
  type TaskView,
} from './task.types.js';
type TaskRow = typeof tasks.$inferSelect;
@Injectable()
export class TaskService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly access: TaskAccessService,
    private readonly projects: ProjectService,
    private readonly clients: ClientOperationalReferenceService,
    private readonly accountability: AccountabilityService,
  ) {}
  async list(actor: ActorContext, projectIdValue: unknown) {
    const projectId = requireUuid(projectIdValue);
    return this.database.transaction(
      async () => {
        const companyId = await this.access.requireActor(actor);
        const project = await this.projects.read(actor, projectId);
        const client = await this.clients.readReferenceClient(
          actor,
          project.clientAccountId,
        );
        const rows = await this.database.connection
          .select()
          .from(tasks)
          .where(
            and(
              eq(tasks.workspaceId, actor.workspaceId),
              eq(tasks.companyId, companyId),
              eq(tasks.projectId, projectId),
            ),
          )
          .orderBy(asc(tasks.createdAt), asc(tasks.id));
        return { mutable: client.status === 'active', tasks: rows.map(view) };
      },
      { isolationLevel: 'repeatable read' },
    );
  }
  /** Reads without side effects: no event, command outcome or reversal-fence advance. */
  async listAssigned(
    actor: ActorContext,
    query: unknown,
  ): Promise<{ tasks: AssignedTaskView[] }> {
    assignedTasksQuery(query);
    return this.database.transaction(
      async () => {
        const companyId = await this.access.requireActor(actor);
        const projects = new Map(
          (await this.projects.list(actor)).map((project) => [
            project.id,
            {
              id: project.id,
              title: project.title,
              clientDisplayName: project.clientDisplayName,
            },
          ]),
        );
        if (projects.size === 0) return { tasks: [] };
        const rows = await this.database.connection
          .select()
          .from(tasks)
          .where(
            and(
              eq(tasks.workspaceId, actor.workspaceId),
              eq(tasks.companyId, companyId),
              eq(tasks.assigneeMembershipId, actor.workspaceMembershipId),
              eq(tasks.status, 'todo'),
              inArray(tasks.projectId, [...projects.keys()]),
            ),
          )
          // Exact YYYY-MM-DD dates sort as their text; undated Tasks follow.
          .orderBy(
            sql`${tasks.dueDate} ASC NULLS LAST`,
            asc(tasks.createdAt),
            asc(tasks.id),
          );
        return {
          tasks: rows.flatMap((row) => {
            const project = projects.get(row.projectId);
            return project ? [{ ...view(row), project }] : [];
          }),
        };
      },
      { isolationLevel: 'repeatable read' },
    );
  }
  async eligibleAssignees(actor: ActorContext, projectIdValue: unknown) {
    const projectId = requireUuid(projectIdValue);
    return this.database.transaction(
      async () => {
        await this.access.requireActor(actor, true);
        const project = await this.projects.read(actor, projectId);
        const client = await this.clients.readReferenceClient(
          actor,
          project.clientAccountId,
        );
        if (client.status !== 'active') throw new NotFoundException();
        return { members: await this.access.eligibleMembers(actor) };
      },
      { isolationLevel: 'repeatable read' },
    );
  }
  async read(actor: ActorContext, taskIdValue: unknown) {
    const taskId = requireUuid(taskIdValue);
    return this.database.transaction(
      async () => {
        await this.access.requireActor(actor);
        const task = await this.visibleRow(actor, taskId);
        const client = await this.clients.readReferenceClient(
          actor,
          task.clientAccountId,
        );
        return { mutable: client.status === 'active', task: view(task) };
      },
      { isolationLevel: 'repeatable read' },
    );
  }
  async history(actor: ActorContext, taskIdValue: unknown) {
    const taskId = requireUuid(taskIdValue);
    return this.database.transaction(
      async () => {
        await this.access.requireActor(actor);
        await this.visibleRow(actor, taskId);
        return {
          events: await this.accountability.readTaskHistory(actor, taskId),
        };
      },
      { isolationLevel: 'repeatable read' },
    );
  }
  async create(
    actor: ActorContext,
    projectIdValue: unknown,
    body: unknown,
    key: string | undefined,
  ) {
    const projectId = requireUuid(projectIdValue),
      input = createInput(body),
      idempotencyKey = requireIdempotencyKey(key);
    return this.database.transaction(async () => {
      const companyId = await this.access.requireActor(actor, true, true);
      const command = JSON.stringify({
        action: 'create',
        companyId,
        projectId,
        ...input,
      });
      await this.lockCommand(actor, idempotencyKey);
      const project = await this.projects.read(actor, projectId);
      const replay = await this.replay(actor, idempotencyKey, command);
      if (replay) {
        await this.visibleRow(actor, replay.id);
        return replay;
      }
      const assignee = input.assigneeMembershipId
        ? await this.access.requireEligibleMember(
            actor,
            input.assigneeMembershipId,
          )
        : null;
      await this.clients.recordReferenceUse(actor, project.clientAccountId);
      const [created] = await this.database.connection
        .insert(tasks)
        .values({
          workspaceId: actor.workspaceId,
          companyId,
          projectId,
          clientAccountId: project.clientAccountId,
          title: input.title,
          assigneeMembershipId: assignee?.workspaceMembershipId ?? null,
          assigneeDisplayLabel: assignee?.displayLabel ?? null,
          dueDate: input.dueDate,
          priority: input.priority ?? DEFAULT_TASK_PRIORITY,
          createdByInternalUserId: actor.internalUserId,
          createdByMembershipId: actor.workspaceMembershipId,
          createdByDisplayName: actor.displayName,
        })
        .returning();
      if (!created) throw new Error('Task creation was not recorded.');
      const result = view(created);
      await this.accountability.recordTaskEvent({
        actor,
        companyId,
        taskId: result.id,
        occurredAt: created.createdAt,
        meaning: {
          action: 'task.created',
          metadata: { version: result.version, initial: fields(result) },
        },
      });
      await this.recordCommand(actor, idempotencyKey, command, result);
      return result;
    });
  }
  async edit(
    actor: ActorContext,
    taskId: unknown,
    body: unknown,
    key: string | undefined,
  ) {
    return this.mutate(
      actor,
      taskId,
      { action: 'edit', input: editInput(body) },
      key,
    );
  }
  async complete(
    actor: ActorContext,
    taskId: unknown,
    body: unknown,
    key: string | undefined,
  ) {
    return this.mutate(
      actor,
      taskId,
      { action: 'complete', input: transitionInput(body) },
      key,
    );
  }
  async reopen(
    actor: ActorContext,
    taskId: unknown,
    body: unknown,
    key: string | undefined,
  ) {
    return this.mutate(
      actor,
      taskId,
      { action: 'reopen', input: transitionInput(body) },
      key,
    );
  }
  private async mutate(
    actor: ActorContext,
    taskIdValue: unknown,
    commandInput:
      | { action: 'edit'; input: TaskEdit }
      | { action: 'complete' | 'reopen'; input: { expectedVersion: number } },
    key: string | undefined,
  ) {
    const taskId = requireUuid(taskIdValue),
      idempotencyKey = requireIdempotencyKey(key);
    return this.database.transaction(async () => {
      const companyId = await this.access.requireActor(actor, true, true);
      const command = JSON.stringify({ companyId, taskId, ...commandInput });
      await this.lockCommand(actor, idempotencyKey);
      const visible = await this.visibleRow(actor, taskId);
      const replay = await this.replay(actor, idempotencyKey, command);
      if (replay) return replay;
      // Lock Client identity before its relationship, including a new no-op command.
      // Only material operations below advance the existing reversal fence.
      await this.clients.lockActiveReferenceClient(
        actor,
        visible.clientAccountId,
      );
      const current = await this.row(actor, taskId, true);
      if (
        current.version !== commandInput.input.expectedVersion ||
        (commandInput.action === 'reopen'
          ? current.status !== 'done'
          : current.status !== 'todo')
      )
        throw new ConflictException(
          'The Task changed. Reload before choosing another action.',
        );
      const before = view(current);
      const occurredAt = new Date();
      let updates: Partial<typeof tasks.$inferInsert>;
      let meaning: TaskEventMeaning;
      if (commandInput.action === 'edit') {
        const input = commandInput.input;
        const assigneeChanged =
          input.assigneeMembershipId !== undefined &&
          input.assigneeMembershipId !== current.assigneeMembershipId;
        const assignee = assigneeChanged
          ? input.assigneeMembershipId
            ? await this.access.requireEligibleMember(
                actor,
                input.assigneeMembershipId,
              )
            : null
          : before.assignee;
        const after: TaskFields = {
          title: input.title ?? before.title,
          dueDate: input.dueDate === undefined ? before.dueDate : input.dueDate,
          assignee,
          priority: input.priority ?? before.priority,
        };
        const changes: TaskChanges = {};
        if (before.title !== after.title)
          changes.title = { before: before.title, after: after.title };
        if (before.dueDate !== after.dueDate)
          changes.dueDate = { before: before.dueDate, after: after.dueDate };
        if (assigneeChanged)
          changes.assignee = { before: before.assignee, after: after.assignee };
        if (before.priority !== after.priority)
          changes.priority = { before: before.priority, after: after.priority };
        if (Object.keys(changes).length === 0) {
          await this.recordCommand(actor, idempotencyKey, command, before);
          return before;
        }
        updates = {
          title: after.title,
          dueDate: after.dueDate,
          assigneeMembershipId: after.assignee?.workspaceMembershipId ?? null,
          assigneeDisplayLabel: after.assignee?.displayLabel ?? null,
          priority: after.priority,
        };
        meaning = {
          action: 'task.updated',
          metadata: { version: current.version + 1, changes },
        };
      } else if (commandInput.action === 'complete') {
        updates = {
          status: 'done',
          completedByInternalUserId: actor.internalUserId,
          completedByMembershipId: actor.workspaceMembershipId,
          completedByDisplayName: actor.displayName,
          completedAt: occurredAt,
        };
        meaning = {
          action: 'task.completed',
          metadata: {
            version: current.version + 1,
            before: 'todo',
            after: 'done',
          },
        };
      } else {
        updates = {
          status: 'todo',
          completedByInternalUserId: null,
          completedByMembershipId: null,
          completedByDisplayName: null,
          completedAt: null,
        };
        meaning = {
          action: 'task.reopened',
          metadata: {
            version: current.version + 1,
            before: 'done',
            after: 'todo',
          },
        };
      }
      if (current.version >= 2147483647)
        throw new ConflictException('Task version is exhausted.');
      await this.clients.recordReferenceUse(actor, current.clientAccountId);
      const [changed] = await this.database.connection
        .update(tasks)
        .set({
          ...updates,
          version: current.version + 1,
          updatedAt: occurredAt,
        })
        .where(
          and(
            eq(tasks.workspaceId, actor.workspaceId),
            eq(tasks.companyId, companyId),
            eq(tasks.id, taskId),
            eq(tasks.version, current.version),
          ),
        )
        .returning();
      if (!changed)
        throw new ConflictException(
          'The Task changed. Reload before choosing another action.',
        );
      const result = view(changed);
      await this.accountability.recordTaskEvent({
        actor,
        companyId,
        taskId,
        occurredAt,
        meaning,
      });
      await this.recordCommand(actor, idempotencyKey, command, result);
      return result;
    });
  }
  private async row(actor: ActorContext, taskId: string, lock = false) {
    const query = this.database.connection
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.workspaceId, actor.workspaceId),
          eq(tasks.companyId, actor.activeCompany?.id ?? ''),
          eq(tasks.id, taskId),
        ),
      );
    const [row] = lock ? await query.for('update') : await query;
    if (!row) throw new NotFoundException();
    return row;
  }
  private async visibleRow(actor: ActorContext, taskId: string) {
    const row = await this.row(actor, taskId);
    await this.projects.read(actor, row.projectId);
    return row;
  }
  private async lockCommand(actor: ActorContext, key: string) {
    const lock = JSON.stringify([
      'task',
      actor.workspaceId,
      actor.workspaceMembershipId,
      key,
    ]);
    await this.database.connection.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${lock},0))`,
    );
  }
  private async replay(actor: ActorContext, key: string, command: string) {
    const [existing] = await this.database.connection
      .select()
      .from(taskCommands)
      .where(
        and(
          eq(taskCommands.workspaceId, actor.workspaceId),
          eq(taskCommands.actorMembershipId, actor.workspaceMembershipId),
          eq(taskCommands.idempotencyKey, key),
        ),
      );
    if (!existing) return undefined;
    if (existing.command !== command)
      throw new ConflictException(
        'Idempotency-Key was already used for another Task command.',
      );
    return readTaskView(existing.result);
  }
  private async recordCommand(
    actor: ActorContext,
    key: string,
    command: string,
    result: TaskView,
  ) {
    await this.database.connection.insert(taskCommands).values({
      workspaceId: actor.workspaceId,
      companyId: result.companyId,
      taskId: result.id,
      actorMembershipId: actor.workspaceMembershipId,
      idempotencyKey: key,
      command,
      result,
    });
  }
}
function fields(task: TaskView): TaskFields {
  return {
    title: task.title,
    assignee: task.assignee,
    dueDate: task.dueDate,
    priority: task.priority,
  };
}
function view(row: TaskRow): TaskView {
  if (
    (row.assigneeMembershipId === null) !==
    (row.assigneeDisplayLabel === null)
  )
    throw new Error('Invalid stored Task assignment.');
  const common = {
    id: row.id,
    companyId: row.companyId,
    projectId: row.projectId,
    clientAccountId: row.clientAccountId,
    title: row.title,
    assignee:
      row.assigneeMembershipId !== null && row.assigneeDisplayLabel !== null
        ? {
            workspaceMembershipId: row.assigneeMembershipId,
            displayLabel: row.assigneeDisplayLabel,
          }
        : null,
    dueDate: row.dueDate,
    priority: row.priority,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdBy: {
      internalUserId: row.createdByInternalUserId,
      workspaceMembershipId: row.createdByMembershipId,
      displayName: row.createdByDisplayName,
    },
  };
  if (row.status === 'todo')
    return { ...common, status: 'todo', completion: null };
  if (
    !row.completedAt ||
    !row.completedByInternalUserId ||
    !row.completedByMembershipId ||
    row.completedByDisplayName === null
  )
    throw new Error('Invalid stored Task completion.');
  return {
    ...common,
    status: 'done',
    completion: {
      occurredAt: row.completedAt.toISOString(),
      actor: {
        internalUserId: row.completedByInternalUserId,
        workspaceMembershipId: row.completedByMembershipId,
        displayName: row.completedByDisplayName,
      },
    },
  };
}
