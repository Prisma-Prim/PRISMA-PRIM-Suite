import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  asc,
  count,
  eq,
  gte,
  inArray,
  lt,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import {
  requireIdempotencyKey,
  requireUuid,
} from '../access/access-command-validation.js';
import { TaskAccessService } from '../access/task-access.service.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import {
  calendarDaysBetween,
  operationalDate,
} from '../clock/operational-date.js';
import { SERVER_CLOCK, type ServerClock } from '../clock/server-clock.js';
import { DatabaseContext } from '../database/database-context.js';
import { taskCommands, tasks } from '../database/schema/index.js';
import { ProjectService } from '../project/project.service.js';
import {
  assignedTasksQuery,
  cancelInput,
  createInput,
  editInput,
  isOpenTaskState,
  overdueTasksQuery,
  readTaskView,
  statusInput,
  transitionInput,
  type TaskEdit,
  type TaskStatusInput,
} from './task.validation.js';
import {
  DEFAULT_TASK_PRIORITY,
  OPEN_TASK_STATES,
  type AssignedTaskView,
  type AttentionRule,
  type CompanyOverdueTasks,
  type TaskAttention,
  type TaskActor,
  type TaskChanges,
  type TaskDeclaration,
  type TaskEventMeaning,
  type TaskFields,
  type TaskView,
} from './task.types.js';
type TaskRow = typeof tasks.$inferSelect;
/** The Company overdue-Task list shows at most this many rows with its total. */
const OVERDUE_TASK_ROW_LIMIT = 100;
/** The My attention queue shows at most this many rows with its full total. */
const ATTENTION_TASK_ROW_LIMIT = 10;
@Injectable()
export class TaskService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly access: TaskAccessService,
    private readonly projects: ProjectService,
    private readonly clients: ClientOperationalReferenceService,
    private readonly accountability: AccountabilityService,
    @Inject(SERVER_CLOCK) private readonly clock: ServerClock,
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
              inArray(tasks.status, [...OPEN_TASK_STATES]),
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
  /**
   * The reader's own open, readable Tasks that satisfy Operational Dashboard
   * PRD §17.3 at the home read's one sampled date. This uses the My Tasks
   * authority and Project visibility boundary and opens no transaction itself.
   */
  async readAttention(
    actor: ActorContext,
    { today }: { today: string },
  ): Promise<TaskAttention> {
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
    if (projects.size === 0) return { matchingCount: 0, tasks: [] };
    const dueSoonEnd = calendarDateAfter(today, 7);
    const matching = and(
      eq(tasks.workspaceId, actor.workspaceId),
      eq(tasks.companyId, companyId),
      eq(tasks.assigneeMembershipId, actor.workspaceMembershipId),
      inArray(tasks.status, [...OPEN_TASK_STATES]),
      inArray(tasks.projectId, [...projects.keys()]),
      or(
        lt(tasks.dueDate, today),
        eq(tasks.priority, 'critical'),
        eq(tasks.status, 'blocked'),
        and(gte(tasks.dueDate, today), lte(tasks.dueDate, dueSoonEnd)),
      ),
    );
    const [counted] = await this.database.connection
      .select({ total: count() })
      .from(tasks)
      .where(matching);
    const matchingCount = counted?.total ?? 0;
    if (matchingCount === 0) return { matchingCount, tasks: [] };
    const rows = await this.database.connection
      .select()
      .from(tasks)
      .where(matching)
      .orderBy(
        sql`CASE
          WHEN ${tasks.dueDate} < ${today} THEN 0
          WHEN ${tasks.priority} = 'critical' THEN 1
          WHEN ${tasks.status} = 'blocked' THEN 2
          ELSE 3
        END`,
        sql`${tasks.dueDate} ASC NULLS LAST`,
        sql`CASE ${tasks.priority}
          WHEN 'critical' THEN 0
          WHEN 'important' THEN 1
          ELSE 2
        END`,
        asc(tasks.createdAt),
        asc(tasks.id),
      )
      .limit(ATTENTION_TASK_ROW_LIMIT);
    return {
      matchingCount,
      tasks: rows.map((row) => {
        const project = projects.get(row.projectId);
        if (!project) throw new Error('Invalid attention Task row.');
        const dueInDays = row.dueDate
          ? calendarDaysBetween(today, row.dueDate)
          : null;
        const rules: AttentionRule[] = [];
        if (dueInDays !== null && dueInDays < 0) rules.push('overdue');
        if (row.priority === 'critical') rules.push('critical');
        if (row.status === 'blocked') rules.push('blocked');
        if (dueInDays !== null && dueInDays >= 0 && dueInDays <= 7)
          rules.push('due_soon');
        if (rules.length === 0)
          throw new Error('Attention Task matched no rule.');
        return { ...view(row), project, rules, dueInDays };
      }),
    };
  }
  /**
   * The Company overdue-Task list at the operational date of one sampled
   * instant. It refuses exactly as My Tasks and writes nothing.
   */
  async listOverdue(
    actor: ActorContext,
    query: unknown,
  ): Promise<CompanyOverdueTasks & { today: string }> {
    overdueTasksQuery(query);
    const today = operationalDate(this.clock.now());
    const { companyId, total, tasks } = await this.database.transaction(
      () =>
        this.readCompanyOverdueTasks(actor, {
          today,
          rowLimit: OVERDUE_TASK_ROW_LIMIT,
        }),
      { isolationLevel: 'repeatable read' },
    );
    return { companyId, today, total, tasks };
  }
  /**
   * Open Tasks of the reader's Project list in the active Company, whatever
   * their responsible member, due before `today` (Operational Dashboard PRD
   * §17.2): the total and at most `rowLimit` rows by due date, creation time
   * and identifier. It reuses the Task read boundary of My Tasks, opens no
   * transaction of its own and so runs inside the caller's snapshot.
   */
  async readCompanyOverdueTasks(
    actor: ActorContext,
    { today, rowLimit }: { today: string; rowLimit: number },
  ): Promise<CompanyOverdueTasks> {
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
    if (projects.size === 0) return { companyId, total: 0, tasks: [] };
    // Exact YYYY-MM-DD dates compare as calendar values; undated Tasks never match.
    const overdue = and(
      eq(tasks.workspaceId, actor.workspaceId),
      eq(tasks.companyId, companyId),
      inArray(tasks.status, [...OPEN_TASK_STATES]),
      lt(tasks.dueDate, today),
      inArray(tasks.projectId, [...projects.keys()]),
    );
    const [counted] = await this.database.connection
      .select({ total: count() })
      .from(tasks)
      .where(overdue);
    const total = counted?.total ?? 0;
    if (total === 0 || rowLimit === 0) return { companyId, total, tasks: [] };
    const rows = await this.database.connection
      .select()
      .from(tasks)
      .where(overdue)
      .orderBy(asc(tasks.dueDate), asc(tasks.createdAt), asc(tasks.id))
      .limit(rowLimit);
    return {
      companyId,
      total,
      tasks: rows.map((row) => {
        const project = projects.get(row.projectId);
        // The filter above admits only dated Tasks of listed Projects.
        if (!project || row.dueDate === null)
          throw new Error('Invalid overdue Task row.');
        return {
          ...view(row),
          project,
          daysOverdue: calendarDaysBetween(row.dueDate, today),
        };
      }),
    };
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
  async changeStatus(
    actor: ActorContext,
    taskId: unknown,
    body: unknown,
    key: string | undefined,
  ) {
    return this.mutate(
      actor,
      taskId,
      { action: 'status', input: statusInput(body) },
      key,
    );
  }
  async cancel(
    actor: ActorContext,
    taskId: unknown,
    body: unknown,
    key: string | undefined,
  ) {
    return this.mutate(
      actor,
      taskId,
      { action: 'cancel', input: cancelInput(body) },
      key,
    );
  }
  private async mutate(
    actor: ActorContext,
    taskIdValue: unknown,
    commandInput: TaskCommand,
    key: string | undefined,
  ) {
    const taskId = requireUuid(taskIdValue),
      idempotencyKey = requireIdempotencyKey(key);
    return this.database.transaction(async () => {
      const companyId = await this.access.requireActor(actor, true, true);
      // Receipts recorded before blocked and cancelled states existed use this same fingerprint.
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
      const occurredAt = new Date();
      const change =
        current.version !== commandInput.input.expectedVersion
          ? null
          : commandInput.action === 'edit'
            ? isOpenTaskState(current.status)
              ? await this.editChange(actor, current, commandInput.input)
              : null
            : transitionChange(commandInput, current, { actor, occurredAt });
      if (!change)
        throw new ConflictException(
          'The Task changed. Reload before choosing another action.',
        );
      if (change === 'unchanged') {
        const unchanged = view(current);
        await this.recordCommand(actor, idempotencyKey, command, unchanged);
        return unchanged;
      }
      if (current.version >= 2147483647)
        throw new ConflictException('Task version is exhausted.');
      await this.clients.recordReferenceUse(actor, current.clientAccountId);
      const [changed] = await this.database.connection
        .update(tasks)
        .set({
          ...change.updates,
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
        meaning: change.meaning,
      });
      await this.recordCommand(actor, idempotencyKey, command, result);
      return result;
    });
  }
  /** A field correction of an open Task; `unchanged` is a normalized no-op. */
  private async editChange(
    actor: ActorContext,
    current: TaskRow,
    input: TaskEdit,
  ): Promise<TaskChange | 'unchanged'> {
    const before = view(current);
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
    if (Object.keys(changes).length === 0) return 'unchanged';
    return {
      updates: {
        title: after.title,
        dueDate: after.dueDate,
        assigneeMembershipId: after.assignee?.workspaceMembershipId ?? null,
        assigneeDisplayLabel: after.assignee?.displayLabel ?? null,
        priority: after.priority,
      },
      meaning: {
        action: 'task.updated',
        metadata: { version: current.version + 1, changes },
      },
    };
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

function calendarDateAfter(date: string, days: number): string {
  const instant = Date.parse(`${date}T00:00:00.000Z`) + days * 86_400_000;
  return new Date(instant).toISOString().slice(0, 10);
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
  switch (row.status) {
    case 'todo':
    case 'in_progress':
      return { ...common, status: row.status, completion: null };
    case 'blocked':
      return {
        ...common,
        status: row.status,
        completion: null,
        blockage: storedDeclaration(
          row.blockageReason,
          storedAttribution({
            internalUserId: row.blockedByInternalUserId,
            workspaceMembershipId: row.blockedByMembershipId,
            displayName: row.blockedByDisplayName,
            occurredAt: row.blockedAt,
          }),
        ),
      };
    case 'done':
      return {
        ...common,
        status: row.status,
        completion: storedAttribution({
          internalUserId: row.completedByInternalUserId,
          workspaceMembershipId: row.completedByMembershipId,
          displayName: row.completedByDisplayName,
          occurredAt: row.completedAt,
        }),
      };
    case 'cancelled':
      return {
        ...common,
        status: row.status,
        completion: null,
        cancellation: storedDeclaration(
          row.cancellationReason,
          storedAttribution({
            internalUserId: row.cancelledByInternalUserId,
            workspaceMembershipId: row.cancelledByMembershipId,
            displayName: row.cancelledByDisplayName,
            occurredAt: row.cancelledAt,
          }),
        ),
      };
    default: {
      const exhaustive: never = row.status;
      throw new Error(`Invalid stored Task state: ${String(exhaustive)}.`);
    }
  }
}
function storedAttribution(columns: {
  internalUserId: string | null;
  workspaceMembershipId: string | null;
  displayName: string | null;
  occurredAt: Date | null;
}): { actor: TaskActor; occurredAt: string } {
  const { internalUserId, workspaceMembershipId, displayName, occurredAt } =
    columns;
  if (
    internalUserId === null ||
    workspaceMembershipId === null ||
    displayName === null ||
    occurredAt === null
  )
    throw new Error('Invalid stored Task declaration.');
  return {
    actor: { internalUserId, workspaceMembershipId, displayName },
    occurredAt: occurredAt.toISOString(),
  };
}
function storedDeclaration(
  reason: string | null,
  attribution: { actor: TaskActor; occurredAt: string },
): TaskDeclaration {
  if (reason === null) throw new Error('Invalid stored Task declaration.');
  return { reason, ...attribution };
}
type TaskCommand =
  | { action: 'edit'; input: TaskEdit }
  | { action: 'complete' | 'reopen'; input: { expectedVersion: number } }
  | { action: 'status'; input: TaskStatusInput }
  | { action: 'cancel'; input: { expectedVersion: number; reason: string } };
type TaskChange = {
  updates: Partial<typeof tasks.$inferInsert>;
  meaning: TaskEventMeaning;
};
type Declared = { actor: ActorContext; occurredAt: Date };
/**
 * The single owner of legal Task moves. It returns the complete state and event for a
 * permitted move, or null when the move conflicts without change, including a move to
 * the current state.
 */
function transitionChange(
  command: Exclude<TaskCommand, { action: 'edit' }>,
  current: TaskRow,
  declared: Declared,
): TaskChange | null {
  const from = current.status,
    version = current.version + 1;
  switch (command.action) {
    case 'reopen':
      if (from !== 'done' && from !== 'cancelled') return null;
      return {
        updates: stateColumns({ status: 'todo' }),
        meaning: {
          action: 'task.reopened',
          metadata: { version, before: from, after: 'todo' },
        },
      };
    case 'complete':
      if (!isOpenTaskState(from)) return null;
      return {
        updates: stateColumns({ status: 'done', declared }),
        meaning: {
          action: 'task.completed',
          metadata: { version, before: from, after: 'done' },
        },
      };
    case 'cancel': {
      if (!isOpenTaskState(from)) return null;
      const { reason } = command.input;
      return {
        updates: stateColumns({ status: 'cancelled', reason, declared }),
        meaning: {
          action: 'task.cancelled',
          metadata: { version, before: from, after: 'cancelled', reason },
        },
      };
    }
    case 'status': {
      const input = command.input;
      if (!isOpenTaskState(from) || from === input.status) return null;
      if (input.status === 'blocked')
        return {
          updates: stateColumns({
            status: 'blocked',
            reason: input.reason,
            declared,
          }),
          meaning: {
            action: 'task.status.changed',
            metadata: {
              version,
              before: from,
              after: 'blocked',
              reason: input.reason,
            },
          },
        };
      return {
        updates: stateColumns({ status: input.status }),
        meaning: {
          action: 'task.status.changed',
          metadata: {
            version,
            before: from,
            after: input.status,
            reason: null,
          },
        },
      };
    }
    default: {
      const exhaustive: never = command;
      return exhaustive;
    }
  }
}
/** Sets the target state's own declaration and retires every other one; history keeps them. */
function stateColumns(
  target:
    | { status: 'todo' | 'in_progress' }
    | { status: 'blocked' | 'cancelled'; reason: string; declared: Declared }
    | { status: 'done'; declared: Declared },
): Partial<typeof tasks.$inferInsert> {
  const columns = {
    status: target.status,
    completedByInternalUserId: null,
    completedByMembershipId: null,
    completedByDisplayName: null,
    completedAt: null,
    blockageReason: null,
    blockedByInternalUserId: null,
    blockedByMembershipId: null,
    blockedByDisplayName: null,
    blockedAt: null,
    cancellationReason: null,
    cancelledByInternalUserId: null,
    cancelledByMembershipId: null,
    cancelledByDisplayName: null,
    cancelledAt: null,
  } satisfies Partial<typeof tasks.$inferInsert>;
  switch (target.status) {
    case 'todo':
    case 'in_progress':
      return columns;
    case 'blocked': {
      const { actor, occurredAt } = target.declared;
      return {
        ...columns,
        blockageReason: target.reason,
        blockedByInternalUserId: actor.internalUserId,
        blockedByMembershipId: actor.workspaceMembershipId,
        blockedByDisplayName: actor.displayName,
        blockedAt: occurredAt,
      };
    }
    case 'done': {
      const { actor, occurredAt } = target.declared;
      return {
        ...columns,
        completedByInternalUserId: actor.internalUserId,
        completedByMembershipId: actor.workspaceMembershipId,
        completedByDisplayName: actor.displayName,
        completedAt: occurredAt,
      };
    }
    case 'cancelled': {
      const { actor, occurredAt } = target.declared;
      return {
        ...columns,
        cancellationReason: target.reason,
        cancelledByInternalUserId: actor.internalUserId,
        cancelledByMembershipId: actor.workspaceMembershipId,
        cancelledByDisplayName: actor.displayName,
        cancelledAt: occurredAt,
      };
    }
    default: {
      const exhaustive: never = target;
      return exhaustive;
    }
  }
}
