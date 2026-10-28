import { nativeTaskView as view } from './native-task-view.js';
import { nativeTaskPage } from './native-task-page.query.js';
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
  isNull,
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
import { tasks } from '../database/schema/index.js';
import { TaskCommandStore } from './task-command.store.js';
import type { TaskPlanningInput } from './task-planning.validation.js';
import { ProjectClosedGuard } from '../project/project-closed.guard.js';
import { isOpenProjectStatus } from '../project/project-status.js';
import { ProjectService } from '../project/project.service.js';
import {
  assignedTasksQuery,
  attentionTasksQuery,
  unassignedTasksQuery,
  blockedTasksQuery,
  cancelInput,
  createInput,
  editInput,
  dueSoonTasksQuery,
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
  type UnassignedTaskView,
  type UnassignedTasksPage,
  type BlockedTaskView,
  type BlockedTasksPage,
  type AttentionRule,
  type AttentionTasksPage,
  type CompanyOverdueTasks,
  type CompanyOverdueTasksPage,
  type DueSoonTasksPage,
  type TaskAttention,
  type TaskChanges,
  type TaskEventMeaning,
  type TaskFields,
  type TaskView,
} from './task.types.js';
type TaskRow = typeof tasks.$inferSelect;
/** Each Company overdue-Task page carries at most this many rows. */
const OVERDUE_TASK_PAGE_SIZE = 25;
/** The My attention queue shows at most this many rows with its full total. */
const ATTENTION_TASK_ROW_LIMIT = 10;
@Injectable()
export class TaskService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly access: TaskAccessService,
    private readonly projects: ProjectService,
    private readonly closedProjects: ProjectClosedGuard,
    private readonly clients: ClientOperationalReferenceService,
    private readonly accountability: AccountabilityService,
    @Inject(SERVER_CLOCK) private readonly clock: ServerClock,
    private readonly commands: TaskCommandStore,
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
        return {
          mutable:
            client.status === 'active' && isOpenProjectStatus(project.status),
          tasks: rows.map(view),
        };
      },
      { isolationLevel: 'repeatable read' },
    );
  }
  /** Current gate facts for the exact copied Tasks, inside the Project command snapshot.
   * Task retains ownership of execution state; this read requires no manager grant.
   * Mutating callers first hold the original Client barrier shared by Task writes.
   */
  async readStageGateWithinTransaction(input: {
    actor: ActorContext;
    projectId: string;
    taskIds: readonly string[];
  }) {
    const companyId = await this.access.requireActor(input.actor);
    await this.projects.read(input.actor, input.projectId);
    const rows = await this.database.connection
      .select({
        taskId: tasks.id,
        status: tasks.status,
        version: tasks.version,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.workspaceId, input.actor.workspaceId),
          eq(tasks.companyId, companyId),
          eq(tasks.projectId, input.projectId),
          inArray(tasks.id, [...input.taskIds]),
        ),
      );
    return input.taskIds.map((taskId) => {
      const task = rows.find((row) => row.taskId === taskId);
      if (!task) throw new NotFoundException();
      return task;
    });
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
  async listUnassigned(
    actor: ActorContext,
    query: unknown,
  ): Promise<UnassignedTasksPage> {
    const page = await this.discoveryPage(actor, {
      ...unassignedTasksQuery(query),
      kind: 'unassigned',
    });
    return {
      ...page,
      tasks: page.tasks.map((task): UnassignedTaskView => {
        if (task.assignee !== null)
          throw new Error('Invalid unassigned Task projection.');
        switch (task.status) {
          case 'todo':
          case 'in_progress':
          case 'blocked':
            return { ...task, assignee: null };
          case 'done':
          case 'cancelled':
            throw new Error('Invalid unassigned Task state.');
          default: {
            const exhaustive: never = task;
            return exhaustive;
          }
        }
      }),
    };
  }
  async listBlocked(
    actor: ActorContext,
    query: unknown,
  ): Promise<BlockedTasksPage> {
    const page = await this.discoveryPage(actor, {
      ...blockedTasksQuery(query),
      kind: 'blocked',
    });
    return {
      ...page,
      tasks: page.tasks.map((task): BlockedTaskView => {
        if (task.status !== 'blocked')
          throw new Error('Invalid blocked Task projection.');
        return task;
      }),
    };
  }
  /** The two bounded Company discovery reads share live authority, scope and 25+1 selection. */
  private async discoveryPage(
    actor: ActorContext,
    input: { offset: number; kind: 'unassigned' | 'blocked' },
  ) {
    return this.database.transaction(
      async () => {
        const companyId = await this.access.requireActor(actor);
        // Project owns original-Client visibility, historical labels and readable closed Projects.
        const readableProjects = new Map(
          (await this.projects.list(actor)).map((project) => [
            project.id,
            {
              id: project.id,
              title: project.title,
              clientDisplayName: project.clientDisplayName,
            },
          ]),
        );
        const page = { companyId, offset: input.offset, pageSize: 25 as const };
        if (readableProjects.size === 0)
          return { ...page, hasNextPage: false, tasks: [] };
        const rows = await nativeTaskPage({
          database: this.database,
          workspaceId: actor.workspaceId,
          companyId,
          projectIds: [...readableProjects.keys()],
          offset: input.offset,
          predicate:
            input.kind === 'blocked'
              ? eq(tasks.status, 'blocked')
              : and(
                  isNull(tasks.assigneeMembershipId),
                  inArray(tasks.status, [...OPEN_TASK_STATES]),
                ),
        });
        return {
          ...page,
          hasNextPage: rows.length > page.pageSize,
          tasks: rows.slice(0, page.pageSize).map((row) => {
            const task = view(row),
              project = readableProjects.get(task.projectId);
            if (!project) throw new Error('Invalid Task discovery Project.');
            return { ...task, project };
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
    const { matchingCount, tasks } = await this.readAttentionPage(actor, {
      today,
      offset: 0,
      rowLimit: ATTENTION_TASK_ROW_LIMIT,
    });
    return { matchingCount, tasks };
  }
  /** Current authority, complete count and bounded page share one read snapshot. */
  async listAttention(
    actor: ActorContext,
    query: unknown,
  ): Promise<AttentionTasksPage> {
    const { offset } = attentionTasksQuery(query);
    const today = operationalDate(this.clock.now());
    const pageSize = 25 as const;
    return this.database.transaction(
      async () => {
        const { companyId, matchingCount, tasks } =
          await this.readAttentionPage(actor, {
            today,
            offset,
            rowLimit: pageSize,
          });
        return {
          companyId,
          today,
          total: matchingCount,
          offset,
          pageSize,
          tasks,
        };
      },
      { isolationLevel: 'repeatable read' },
    );
  }
  /** Sole owner of the preview and complete view's exact set, rules and order. */
  private async readAttentionPage(
    actor: ActorContext,
    {
      today,
      offset,
      rowLimit,
    }: { today: string; offset: number; rowLimit: number },
  ): Promise<TaskAttention & { companyId: string }> {
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
    if (projects.size === 0) return { companyId, matchingCount: 0, tasks: [] };
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
    if (matchingCount === 0) return { companyId, matchingCount, tasks: [] };
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
      .limit(rowLimit)
      .offset(offset);
    return {
      companyId,
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
  /** Complete own due-soon set: current authority, count and page share one snapshot. */
  async listDueSoon(
    actor: ActorContext,
    query: unknown,
  ): Promise<DueSoonTasksPage> {
    const { offset } = dueSoonTasksQuery(query);
    const today = operationalDate(this.clock.now());
    const throughDate = calendarDateAfter(today, 7);
    const pageSize = 25 as const;
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
        const page = { companyId, today, throughDate, offset, pageSize };
        if (projects.size === 0) return { ...page, total: 0, tasks: [] };
        const eligible = and(
          eq(tasks.workspaceId, actor.workspaceId),
          eq(tasks.companyId, companyId),
          eq(tasks.assigneeMembershipId, actor.workspaceMembershipId),
          inArray(tasks.status, [...OPEN_TASK_STATES]),
          inArray(tasks.projectId, [...projects.keys()]),
          gte(tasks.dueDate, today),
          lte(tasks.dueDate, throughDate),
        );
        const [counted] = await this.database.connection
          .select({ total: count() })
          .from(tasks)
          .where(eligible);
        const total = counted?.total ?? 0;
        if (offset >= total) return { ...page, total, tasks: [] };
        const rows = await this.database.connection
          .select()
          .from(tasks)
          .where(eligible)
          .orderBy(asc(tasks.dueDate), asc(tasks.createdAt), asc(tasks.id))
          .limit(pageSize)
          .offset(offset);
        return {
          ...page,
          total,
          tasks: rows.map((row) => {
            const project = projects.get(row.projectId);
            const task = view(row);
            if (!project || task.dueDate === null)
              throw new Error('Invalid due-soon Task Project or date.');
            switch (task.status) {
              case 'todo':
              case 'in_progress':
              case 'blocked':
                return { ...task, project, dueDate: task.dueDate };
              case 'done':
              case 'cancelled':
                throw new Error('Invalid due-soon Task state.');
              default: {
                const exhaustive: never = task;
                return exhaustive;
              }
            }
          }),
        };
      },
      { isolationLevel: 'repeatable read' },
    );
  }
  /**
   * The Company overdue-Task list at the operational date of one sampled
   * instant. It refuses exactly as My Tasks and writes nothing.
   */
  async listOverdue(
    actor: ActorContext,
    query: unknown,
  ): Promise<CompanyOverdueTasksPage> {
    const { offset } = overdueTasksQuery(query);
    const today = operationalDate(this.clock.now());
    const { companyId, total, tasks } = await this.database.transaction(
      () =>
        this.readCompanyOverdueTasks(actor, {
          today,
          rowLimit: OVERDUE_TASK_PAGE_SIZE,
          offset,
        }),
      { isolationLevel: 'repeatable read' },
    );
    return {
      companyId,
      today,
      total,
      tasks,
      offset,
      pageSize: OVERDUE_TASK_PAGE_SIZE,
    };
  }
  /**
   * Open Tasks of the reader's Project list in the active Company, whatever
   * their responsible member, due before `today` (Operational Dashboard PRD
   * §17.2): the total and at most `rowLimit` rows by due date, creation time
   * and identifier, starting at `offset`. It reuses My Tasks authority, opens no
   * transaction of its own and so runs inside the caller's snapshot.
   */
  async readCompanyOverdueTasks(
    actor: ActorContext,
    {
      today,
      rowLimit,
      offset = 0,
    }: { today: string; rowLimit: number; offset?: number },
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
    if (offset >= total || rowLimit === 0)
      return { companyId, total, tasks: [] };
    const rows = await this.database.connection
      .select()
      .from(tasks)
      .where(overdue)
      .orderBy(asc(tasks.dueDate), asc(tasks.createdAt), asc(tasks.id))
      .limit(rowLimit)
      .offset(offset);
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
        const companyId = await this.access.requireActor(actor, true);
        const project = await this.projects.read(actor, projectId);
        const client = await this.clients.readReferenceClient(
          actor,
          project.clientAccountId,
        );
        if (client.status !== 'active') throw new NotFoundException();
        await this.closedProjects.requireOpen({
          actor,
          companyId,
          projectId,
          closedAs: 'not_found',
        });
        return { members: await this.access.eligibleMembers(actor) };
      },
      { isolationLevel: 'repeatable read' },
    );
  }
  /** Result commands call this after the original Client barrier. */
  async lockResultTargetWithinTransaction(input: {
    actor: ActorContext;
    taskId: string;
  }) {
    await this.access.requireActor(input.actor, true, true);
    const current = await this.row(input.actor, input.taskId, true);
    await this.projects.read(input.actor, current.projectId);
    return view(current);
  }
  /** Review owns no Task mutation permission. Acquire after the original Client barrier. */
  async lockReviewTargetWithinTransaction(input: {
    actor: ActorContext;
    taskId: string;
  }) {
    await this.access.requireActor(input.actor, false, true);
    const current = await this.row(input.actor, input.taskId, true);
    await this.projects.read(input.actor, current.projectId);
    return view(current);
  }
  async read(actor: ActorContext, taskIdValue: unknown) {
    const taskId = requireUuid(taskIdValue);
    return this.database.transaction(
      () => this.readWithinTransaction({ actor, taskId }),
      { isolationLevel: 'repeatable read' },
    );
  }
  /** Caller owns the transaction; preserve the ordinary Task read gates. */
  async readWithinTransaction(input: { actor: ActorContext; taskId: string }) {
    const { actor, taskId } = input;
    await this.access.requireActor(actor);
    const task = await this.visibleRow(actor, taskId);
    const project = await this.projects.read(actor, task.projectId);
    const client = await this.clients.readReferenceClient(
      actor,
      task.clientAccountId,
    );
    return {
      mutable:
        client.status === 'active' && isOpenProjectStatus(project.status),
      task: view(task),
    };
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
      await this.clients.lockActiveReferenceClient(
        actor,
        project.clientAccountId,
      );
      await this.closedProjects.requireOpen({ actor, companyId, projectId });
      const assignee = input.assigneeMembershipId
        ? await this.access.requireEligibleMember(
            actor,
            input.assigneeMembershipId,
          )
        : null;
      const result = await this.recordNewTask({
        actor,
        companyId,
        project,
        fields: {
          title: input.title,
          assignee,
          dueDate: input.dueDate,
          priority: input.priority ?? DEFAULT_TASK_PRIORITY,
        },
      });
      await this.recordCommand(actor, idempotencyKey, command, result);
      return result;
    });
  }
  /**
   * The caller owns the transaction and full creation receipt. Copies retain
   * normal Task authority, lifecycle, history and Client-fence semantics.
   */
  async createTemplateCopiesWithinTransaction(input: {
    actor: ActorContext;
    projectId: string;
    titles: readonly string[];
  }): Promise<TaskView[]> {
    const values = input.titles.map((title) => createInput({ title }));
    const companyId = await this.access.requireActor(input.actor, true, true);
    const project = await this.projects.read(input.actor, input.projectId);
    await this.clients.lockActiveReferenceClient(
      input.actor,
      project.clientAccountId,
    );
    await this.closedProjects.requireOpen({
      actor: input.actor,
      companyId,
      projectId: project.id,
    });
    const created: TaskView[] = [];
    for (const value of values) {
      created.push(
        await this.recordNewTask({
          actor: input.actor,
          companyId,
          project,
          fields: {
            title: value.title,
            assignee: null,
            dueDate: null,
            priority: DEFAULT_TASK_PRIORITY,
          },
        }),
      );
    }
    return created;
  }

  private async recordNewTask(input: {
    actor: ActorContext;
    companyId: string;
    project: { id: string; clientAccountId: string };
    fields: TaskFields;
  }): Promise<TaskView> {
    const { actor, companyId, project, fields: initial } = input;
    await this.clients.recordReferenceUse(actor, project.clientAccountId);
    const [created] = await this.database.connection
      .insert(tasks)
      .values({
        workspaceId: actor.workspaceId,
        companyId,
        projectId: project.id,
        clientAccountId: project.clientAccountId,
        title: initial.title,
        assigneeMembershipId: initial.assignee?.workspaceMembershipId ?? null,
        assigneeDisplayLabel: initial.assignee?.displayLabel ?? null,
        dueDate: initial.dueDate,
        priority: initial.priority,
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
    return result;
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
  /** The group owner holds one transaction. This native seam proves live authority and all targets before replay. */
  async planningScopeWithinTransaction(input: {
    actor: ActorContext;
    projectId: string;
    taskIds: readonly string[];
  }) {
    const { actor, projectId } = input;
    const companyId = await this.access.requireActor(actor, true, true);
    const project = await this.projects.read(actor, projectId);
    const targets = await this.database.connection
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.workspaceId, actor.workspaceId),
          eq(tasks.companyId, companyId),
          eq(tasks.projectId, projectId),
          inArray(tasks.id, [...input.taskIds]),
        ),
      );
    if (targets.length !== input.taskIds.length) throw new NotFoundException();
    return { companyId, projectId, clientAccountId: project.clientAccountId };
  }

  /** Uses the same native edit/write participant as individual mutations. No owning transaction or per-Task receipt. */
  async planWithinTransaction(input: {
    actor: ActorContext;
    scope: TaskMutationScope;
    tasks: TaskPlanningInput['tasks'];
  }) {
    await this.lockMutationScope(input.actor, input.scope);
    const results = new Map<string, TaskView>();
    // The original Client barrier serializes overlapping commands. Stable Task order also prevents row-lock inversion.
    for (const row of [...input.tasks].sort((a, b) =>
      a.taskId.localeCompare(b.taskId),
    )) {
      const current = await this.row(input.actor, row.taskId, true);
      if (current.projectId !== input.scope.projectId)
        throw new NotFoundException();
      const { taskId, ...fields } = row;
      results.set(
        taskId,
        await this.applyMutation(input.actor, input.scope.companyId, current, {
          action: 'edit',
          input: fields,
        }),
      );
    }
    return input.tasks.map(({ taskId }) => {
      const result = results.get(taskId);
      if (!result) throw new Error('Missing Task planning result.');
      return result;
    });
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
      await this.lockMutationScope(actor, {
        companyId,
        projectId: visible.projectId,
        clientAccountId: visible.clientAccountId,
      });
      const current = await this.row(actor, taskId, true);
      const result = await this.applyMutation(
        actor,
        companyId,
        current,
        commandInput,
      );
      await this.recordCommand(actor, idempotencyKey, command, result);
      return result;
    });
  }
  private async lockMutationScope(
    actor: ActorContext,
    scope: TaskMutationScope,
  ) {
    // Lock original Client identity before relationship, even for a new no-op. Only material edits advance its fence.
    await this.clients.lockActiveReferenceClient(actor, scope.clientAccountId);
    await this.closedProjects.requireOpen({
      actor,
      companyId: scope.companyId,
      projectId: scope.projectId,
    });
  }
  private async applyMutation(
    actor: ActorContext,
    companyId: string,
    current: TaskRow,
    commandInput: TaskCommand,
  ) {
    const taskId = current.id;
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
      return view(current);
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
    return result;
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
    await this.commands.lock({ actor, key });
  }
  private async replay(actor: ActorContext, key: string, command: string) {
    const result = await this.commands.read({ actor, key, command });
    return result === undefined ? undefined : readTaskView(result);
  }
  private async recordCommand(
    actor: ActorContext,
    key: string,
    command: string,
    result: TaskView,
  ) {
    await this.commands.record({
      actor,
      key,
      companyId: result.companyId,
      taskId: result.id,
      command,
      result,
    });
  }
}

type TaskMutationScope = {
  companyId: string;
  projectId: string;
  clientAccountId: string;
};

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
