export type TaskActor = {
  internalUserId: string;
  workspaceMembershipId: string;
  displayName: string;
};
export type Assignee = { workspaceMembershipId: string; displayLabel: string };
/** Manual Task priority codes (#375), in their presentation order. */
export const taskPriorities = ['normal', 'important', 'critical'] as const;
export type TaskPriority = (typeof taskPriorities)[number];
export type TaskFields = {
  title: string;
  assignee: Assignee | null;
  dueDate: string | null;
  priority: TaskPriority;
};
/** A creation recorded before priority existed has none; it is never shown as Normal. */
export type TaskInitialFields = Omit<TaskFields, 'priority'> & {
  priority?: TaskPriority;
};
export type TaskView = TaskFields & {
  id: string;
  companyId: string;
  projectId: string;
  clientAccountId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: TaskActor;
} & (
    | { status: 'todo'; completion: null }
    | { status: 'done'; completion: { actor: TaskActor; occurredAt: string } }
  );
type Change<T> = { before: T; after: T };
export type TaskEvent = {
  id: string;
  occurredAt: string;
  actor: TaskActor;
  target: {
    type: 'task';
    taskId: string;
    taskTitle: string;
    companyId: string;
  };
} & (
  | {
      action: 'task.created';
      metadata: { version: number; initial: TaskInitialFields };
    }
  | {
      action: 'task.updated';
      metadata: {
        version: number;
        changes: {
          title?: Change<string>;
          assignee?: Change<Assignee | null>;
          dueDate?: Change<string | null>;
          priority?: Change<TaskPriority>;
        };
      };
    }
  | {
      action: 'task.completed';
      metadata: { version: number; before: 'todo'; after: 'done' };
    }
  | {
      action: 'task.reopened';
      metadata: { version: number; before: 'done'; after: 'todo' };
    }
);
export type TaskScope = { companyId: string; projectId: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('Invalid Task response');
  return value;
}
function string(value: unknown): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error('Invalid Task text');
  return value;
}
function version(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw new Error('Invalid Task version');
  return value;
}
function timestamp(value: unknown): string {
  const result = string(value);
  if (!Number.isFinite(Date.parse(result)))
    throw new Error('Invalid Task timestamp');
  return result;
}
export function validTaskDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000'))
    return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}
function date(value: unknown): string | null {
  if (value === null) return null;
  const result = string(value);
  if (!validTaskDate(result)) throw new Error('Invalid Task date');
  return result;
}
function actor(value: unknown): TaskActor {
  const row = record(value);
  return {
    internalUserId: string(row.internalUserId),
    workspaceMembershipId: string(row.workspaceMembershipId),
    displayName: string(row.displayName),
  };
}
function assignee(value: unknown): Assignee | null {
  if (value === null) return null;
  const row = record(value);
  return {
    workspaceMembershipId: string(row.workspaceMembershipId),
    displayLabel: string(row.displayLabel),
  };
}
function title(value: unknown): string {
  const result = string(value);
  if (result !== result.trim() || result.length > 200)
    throw new Error('Invalid Task title');
  return result;
}
/** Rejects an unknown or missing priority instead of defaulting it. */
export function readTaskPriority(value: unknown): TaskPriority {
  const priority = taskPriorities.find((candidate) => candidate === value);
  if (!priority) throw new Error('Invalid Task priority');
  return priority;
}
function fields(value: unknown): TaskFields {
  const row = record(value);
  return {
    title: title(row.title),
    assignee: assignee(row.assignee),
    dueDate: date(row.dueDate),
    priority: readTaskPriority(row.priority),
  };
}
function initialFields(value: unknown): TaskInitialFields {
  const row = record(value);
  return {
    title: title(row.title),
    assignee: assignee(row.assignee),
    dueDate: date(row.dueDate),
    ...('priority' in row ? { priority: readTaskPriority(row.priority) } : {}),
  };
}
export function readTask(value: unknown, scope: TaskScope): TaskView {
  const row = record(value);
  if (row.companyId !== scope.companyId || row.projectId !== scope.projectId)
    throw new Error('Invalid Task context');
  const common = {
    ...fields(row),
    id: string(row.id),
    companyId: scope.companyId,
    projectId: scope.projectId,
    clientAccountId: string(row.clientAccountId),
    version: version(row.version),
    createdAt: timestamp(row.createdAt),
    updatedAt: timestamp(row.updatedAt),
    createdBy: actor(row.createdBy),
  };
  if (row.status === 'todo' && row.completion === null)
    return { ...common, status: 'todo', completion: null };
  if (row.status === 'done') {
    const completion = record(row.completion);
    return {
      ...common,
      status: 'done',
      completion: {
        actor: actor(completion.actor),
        occurredAt: timestamp(completion.occurredAt),
      },
    };
  }
  throw new Error('Invalid Task status');
}
function mutable(row: Record<string, unknown>): boolean {
  if (typeof row.mutable !== 'boolean')
    throw new Error('Invalid Task write condition');
  return row.mutable;
}
export function readTaskList(value: unknown, scope: TaskScope) {
  const row = record(value);
  if (!Array.isArray(row.tasks)) throw new Error('Invalid Task list');
  return {
    mutable: mutable(row),
    tasks: row.tasks.map((task: unknown) => readTask(task, scope)),
  };
}
export type AssignedTask = Extract<TaskView, { status: 'todo' }> & {
  project: { id: string; title: string; clientDisplayName: string };
};
/** Every row must be the reader's own open Task in the active Company and its own Project. */
export function readAssignedTasks(
  value: unknown,
  reader: { companyId: string; workspaceMembershipId: string },
): AssignedTask[] {
  const row = record(value);
  if (!Array.isArray(row.tasks)) throw new Error('Invalid assigned Tasks');
  return row.tasks.map((item: unknown): AssignedTask => {
    const entry = record(item);
    const owner = record(entry.project);
    const project = {
      id: string(owner.id),
      title: string(owner.title),
      clientDisplayName: string(owner.clientDisplayName),
    };
    const task = readTask(entry, {
      companyId: reader.companyId,
      projectId: project.id,
    });
    if (
      task.status !== 'todo' ||
      task.assignee?.workspaceMembershipId !== reader.workspaceMembershipId
    )
      throw new Error('Invalid assigned Task');
    return { ...task, project };
  });
}
export function readTaskDetail(
  value: unknown,
  scope: TaskScope,
  taskId: string,
) {
  const row = record(value);
  const task = readTask(row.task, scope);
  if (task.id !== taskId) throw new Error('Invalid selected Task');
  return { mutable: mutable(row), task };
}
export function readAssignees(value: unknown): Assignee[] {
  const row = record(value);
  if (!Array.isArray(row.members))
    throw new Error('Invalid responsible members');
  return row.members.map((member: unknown) => {
    const result = assignee(member);
    if (!result) throw new Error('Invalid responsible member');
    return result;
  });
}
function change<T>(value: unknown, read: (value: unknown) => T): Change<T> {
  const row = record(value);
  return { before: read(row.before), after: read(row.after) };
}
export function readTaskHistory(
  value: unknown,
  scope: TaskScope,
  taskId: string,
): TaskEvent[] {
  const row = record(value);
  if (!Array.isArray(row.events)) throw new Error('Invalid Task history');
  return row.events.map((value: unknown): TaskEvent => {
    const event = record(value);
    const target = record(event.target);
    if (
      target.type !== 'task' ||
      target.taskId !== taskId ||
      typeof target.taskTitle !== 'string' ||
      target.companyId !== scope.companyId
    )
      throw new Error('Invalid Task history context');
    const common = {
      id: string(event.id),
      occurredAt: timestamp(event.occurredAt),
      actor: actor(event.actor),
      target: {
        type: 'task',
        taskId,
        taskTitle: title(target.taskTitle),
        companyId: scope.companyId,
      } satisfies TaskEvent['target'],
    };
    const metadata = record(event.metadata);
    const currentVersion = version(metadata.version);
    if (event.action === 'task.created')
      return {
        ...common,
        action: event.action,
        metadata: {
          version: currentVersion,
          initial: initialFields(metadata.initial),
        },
      };
    if (event.action === 'task.updated') {
      const changes = record(metadata.changes);
      if (
        !Object.keys(changes).length ||
        Object.keys(changes).some(
          (key) => !['title', 'assignee', 'dueDate', 'priority'].includes(key),
        )
      )
        throw new Error('Invalid Task changes');
      return {
        ...common,
        action: event.action,
        metadata: {
          version: currentVersion,
          changes: {
            ...(changes.title === undefined
              ? {}
              : { title: change(changes.title, title) }),
            ...(changes.assignee === undefined
              ? {}
              : { assignee: change(changes.assignee, assignee) }),
            ...(changes.dueDate === undefined
              ? {}
              : { dueDate: change(changes.dueDate, date) }),
            ...(changes.priority === undefined
              ? {}
              : { priority: change(changes.priority, readTaskPriority) }),
          },
        },
      };
    }
    if (
      event.action === 'task.completed' &&
      metadata.before === 'todo' &&
      metadata.after === 'done'
    )
      return {
        ...common,
        action: event.action,
        metadata: { version: currentVersion, before: 'todo', after: 'done' },
      };
    if (
      event.action === 'task.reopened' &&
      metadata.before === 'done' &&
      metadata.after === 'todo'
    )
      return {
        ...common,
        action: event.action,
        metadata: { version: currentVersion, before: 'done', after: 'todo' },
      };
    throw new Error('Invalid Task event');
  });
}
