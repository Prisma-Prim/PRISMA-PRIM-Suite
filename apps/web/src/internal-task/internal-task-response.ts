export type Status = 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled';
export type Priority = 'normal' | 'important' | 'critical';
export interface Member {
  membershipId: string;
  displayLabel: string;
}
interface TaskBase {
  format: 'company-internal-task-v1';
  id: string;
  workspaceId: string;
  companyId: string;
  version: number;
  title: string;
  description: string | null;
  assignee: Member | null;
  dueDate: string | null;
  priority: Priority;
  createdByMembershipId: string;
  createdAt: string;
  updatedAt: string;
}
type Declaration = { actorMembershipId: string; recordedAt: string };
export type Task = TaskBase &
  (
    | { status: 'todo' | 'in_progress'; completion: null; reason: null }
    | { status: 'done'; completion: Declaration; reason: null }
    | {
        status: 'blocked';
        completion: null;
        reason: Declaration & { kind: 'blockage'; text: string };
      }
    | {
        status: 'cancelled';
        completion: null;
        reason: Declaration & { kind: 'cancellation'; text: string };
      }
  );
export interface Fact {
  format: 'company-internal-task-history-v1';
  workspaceId: string;
  companyId: string;
  taskId: string;
  version: number;
  kind: 'CREATE' | 'EDIT' | 'MOVE';
  actorMembershipId: string;
  recordedAt: string;
  before: Task | null;
  after: Task;
}
export interface Receipt {
  format: 'company-internal-task-command-v1';
  task: Task;
  changed: boolean;
  history: Fact | null;
}
export interface Detail {
  task: Task;
  history: Fact[];
  nextBeforeVersion: number | null;
}
export interface Page {
  tasks: Task[];
  nextBeforeTaskId: string | null;
}
export interface Scope {
  workspaceId: string;
  companyId: string;
}
export class InternalTaskResponseError extends Error {
  constructor(readonly kind: 'malformed' | 'unsupported') {
    super(kind);
  }
}
function fail(): never {
  throw new InternalTaskResponseError('malformed');
}
function row(
  value: unknown,
  keys?: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return fail();
  const result = Object.fromEntries(Object.entries(value));
  if (
    keys &&
    (Object.keys(result).length !== keys.length ||
      keys.some((key) => !Object.hasOwn(result, key)))
  )
    return fail();
  return result;
}
function format(value: Record<string, unknown>, expected: string) {
  if (value.format !== expected)
    throw new InternalTaskResponseError(
      typeof value.format === 'string' ? 'unsupported' : 'malformed',
    );
}
export function isNativeUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
      value,
    )
  );
}
function uuid(value: unknown): string {
  if (!isNativeUuid(value)) return fail();
  return value;
}
function version(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 2147483647
  )
    return fail();
  return value;
}
function time(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T/u.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    return fail();
  return value;
}
export function literal(
  value: unknown,
  maximum: number,
  nullable = false,
): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== 'string') return fail();
  for (const point of value) {
    const code = point.charCodeAt(0);
    if (code === 0 || (point.length === 1 && code >= 0xd800 && code <= 0xdfff))
      return fail();
  }
  const normalized = value.trim();
  if ([...normalized].length > maximum || (!nullable && !normalized))
    return fail();
  return normalized || null;
}
function text(value: unknown, maximum: number): string {
  const result = literal(value, maximum);
  if (result === null) return fail();
  return result;
}
export function calendarDate(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u.test(value))
    return fail();
  const year = Number(value.slice(0, 4)),
    month = Number(value.slice(5, 7)),
    day = Number(value.slice(8)),
    leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0),
    days =
      month === 2 ? (leap ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days)
    return fail();
  return value;
}
export function status(value: unknown): Status {
  if (
    value === 'todo' ||
    value === 'in_progress' ||
    value === 'blocked' ||
    value === 'done' ||
    value === 'cancelled'
  )
    return value;
  return fail();
}
export function priority(value: unknown): Priority {
  if (value === 'normal' || value === 'important' || value === 'critical')
    return value;
  return fail();
}
function member(value: unknown): Member {
  const item = row(value, ['membershipId', 'displayLabel']);
  if (typeof item.displayLabel !== 'string' || !item.displayLabel)
    return fail();
  literal(item.displayLabel, 2147483647);
  return {
    membershipId: uuid(item.membershipId),
    displayLabel: item.displayLabel,
  };
}
function declaration(value: unknown) {
  const item = row(value, ['actorMembershipId', 'recordedAt']);
  return {
    actorMembershipId: uuid(item.actorMembershipId),
    recordedAt: time(item.recordedAt),
  };
}
const taskKeys = [
  'format',
  'id',
  'workspaceId',
  'companyId',
  'version',
  'title',
  'description',
  'assignee',
  'dueDate',
  'priority',
  'status',
  'createdByMembershipId',
  'createdAt',
  'updatedAt',
  'completion',
  'reason',
];
export function task(value: unknown, scope: Scope, closed = false): Task {
  const item = row(value, closed ? taskKeys : undefined);
  format(item, 'company-internal-task-v1');
  const title = text(item.title, 200),
    description = literal(item.description, 2000, true);
  if (title !== item.title || description !== item.description) return fail();
  const base: TaskBase = {
    format: 'company-internal-task-v1',
    id: uuid(item.id),
    workspaceId: uuid(item.workspaceId),
    companyId: uuid(item.companyId),
    version: version(item.version),
    title,
    description,
    assignee: item.assignee === null ? null : member(item.assignee),
    dueDate: calendarDate(item.dueDate),
    priority: priority(item.priority),
    createdByMembershipId: uuid(item.createdByMembershipId),
    createdAt: time(item.createdAt),
    updatedAt: time(item.updatedAt),
  };
  if (
    base.workspaceId !== scope.workspaceId ||
    base.companyId !== scope.companyId ||
    base.updatedAt < base.createdAt
  )
    return fail();
  const state = status(item.status);
  if (state === 'done') {
    const completion = declaration(item.completion);
    if (item.reason !== null || completion.recordedAt !== base.updatedAt)
      return fail();
    return { ...base, status: state, completion, reason: null };
  }
  if (item.completion !== null) return fail();
  if (state === 'blocked' || state === 'cancelled') {
    const reason = row(item.reason, [
        'kind',
        'text',
        'actorMembershipId',
        'recordedAt',
      ]),
      reasonText = text(reason.text, 500),
      attribution = declaration({
        actorMembershipId: reason.actorMembershipId,
        recordedAt: reason.recordedAt,
      });
    if (
      reasonText !== reason.text ||
      reason.kind !== (state === 'blocked' ? 'blockage' : 'cancellation') ||
      attribution.recordedAt > base.updatedAt
    )
      return fail();
    return state === 'blocked'
      ? {
          ...base,
          status: state,
          completion: null,
          reason: { ...attribution, kind: 'blockage', text: reasonText },
        }
      : {
          ...base,
          status: state,
          completion: null,
          reason: { ...attribution, kind: 'cancellation', text: reasonText },
        };
  }
  if (item.reason !== null) return fail();
  return { ...base, status: state, completion: null, reason: null };
}
function fact(value: unknown, scope: Scope): Fact {
  const item = row(value, [
    'format',
    'workspaceId',
    'companyId',
    'taskId',
    'version',
    'kind',
    'actorMembershipId',
    'recordedAt',
    'before',
    'after',
  ]);
  format(item, 'company-internal-task-history-v1');
  if (item.kind !== 'CREATE' && item.kind !== 'EDIT' && item.kind !== 'MOVE')
    return fail();
  const result: Fact = {
    format: 'company-internal-task-history-v1',
    workspaceId: uuid(item.workspaceId),
    companyId: uuid(item.companyId),
    taskId: uuid(item.taskId),
    version: version(item.version),
    kind: item.kind,
    actorMembershipId: uuid(item.actorMembershipId),
    recordedAt: time(item.recordedAt),
    before: item.before === null ? null : task(item.before, scope, true),
    after: task(item.after, scope, true),
  };
  if (
    result.workspaceId !== scope.workspaceId ||
    result.companyId !== scope.companyId ||
    result.after.id !== result.taskId ||
    result.after.version !== result.version ||
    result.after.updatedAt !== result.recordedAt
  )
    return fail();
  if (result.kind === 'CREATE') {
    if (
      result.before ||
      result.version !== 1 ||
      result.after.status !== 'todo' ||
      result.after.createdByMembershipId !== result.actorMembershipId ||
      result.after.createdAt !== result.recordedAt
    )
      return fail();
  } else {
    const before = result.before;
    if (
      !before ||
      before.id !== result.taskId ||
      before.version + 1 !== result.version ||
      before.createdAt !== result.after.createdAt ||
      before.createdByMembershipId !== result.after.createdByMembershipId
    )
      return fail();
  }
  if (result.before) {
    const before = result.before,
      after = result.after,
      fields = (task: Task) =>
        JSON.stringify([
          task.title,
          task.description,
          task.assignee,
          task.dueDate,
          task.priority,
        ]),
      open =
        before.status === 'todo' ||
        before.status === 'in_progress' ||
        before.status === 'blocked';
    if (
      result.kind === 'EDIT' &&
      (!open ||
        after.status !== before.status ||
        JSON.stringify(after.reason) !== JSON.stringify(before.reason) ||
        JSON.stringify(after.completion) !==
          JSON.stringify(before.completion) ||
        fields(before) === fields(after))
    )
      return fail();
    if (
      result.kind === 'MOVE' &&
      (after.status === before.status ||
        (!open && after.status !== 'todo') ||
        fields(before) !== fields(after) ||
        (after.completion &&
          (after.completion.actorMembershipId !== result.actorMembershipId ||
            after.completion.recordedAt !== result.recordedAt)) ||
        (after.reason &&
          (after.reason.actorMembershipId !== result.actorMembershipId ||
            after.reason.recordedAt !== result.recordedAt)))
    )
      return fail();
  }
  return result;
}
export function readReceipt(
  value: unknown,
  scope: Scope,
  target?: string,
): Receipt {
  const item = row(value, ['format', 'task', 'changed', 'history']);
  format(item, 'company-internal-task-command-v1');
  if (typeof item.changed !== 'boolean') return fail();
  const result: Receipt = {
    format: 'company-internal-task-command-v1',
    task: task(item.task, scope, true),
    changed: item.changed,
    history: item.history === null ? null : fact(item.history, scope),
  };
  if (
    (target && result.task.id !== target) ||
    result.changed !== (result.history !== null) ||
    (result.history &&
      JSON.stringify(result.history.after) !== JSON.stringify(result.task))
  )
    return fail();
  return result;
}
export function readDetail(
  value: unknown,
  scope: Scope,
  target: string,
  beforeVersion?: number,
): Detail {
  const item = row(value);
  format(item, 'company-internal-task-detail-v1');
  if (!Array.isArray(item.history) || item.history.length > 25) return fail();
  const current = task(item.task, scope);
  if (current.id !== target) return fail();
  const history = item.history.map((value) => fact(value, scope));
  for (const [i, entry] of history.entries()) {
    const previous = history[i - 1];
    if (
      entry.taskId !== target ||
      entry.version > current.version ||
      (previous && previous.version !== entry.version + 1)
    )
      return fail();
    if (
      previous &&
      JSON.stringify(previous.before) !== JSON.stringify(entry.after)
    )
      return fail();
  }
  const firstExpected =
    beforeVersion === undefined
      ? current.version
      : Math.min(current.version, beforeVersion - 1);
  if (
    history.length !== Math.min(25, firstExpected) ||
    (firstExpected > 0 && history[0]?.version !== firstExpected)
  )
    return fail();
  if (
    firstExpected === current.version &&
    history[0] &&
    JSON.stringify(history[0].after) !== JSON.stringify(current)
  )
    return fail();
  const next =
    item.nextBeforeVersion === null ? null : version(item.nextBeforeVersion);
  if (
    next !== null &&
    (history.length !== 25 || history.at(-1)?.version !== next)
  )
    return fail();
  if (next !== (firstExpected > 25 ? history.at(-1)?.version : null))
    return fail();
  return { task: current, history, nextBeforeVersion: next };
}
export function readPage(value: unknown, scope: Scope): Page {
  const item = row(value);
  format(item, 'company-internal-task-page-v1');
  if (!Array.isArray(item.tasks) || item.tasks.length > 25) return fail();
  const tasks = item.tasks.map((value) => task(value, scope)),
    next = item.nextBeforeTaskId === null ? null : uuid(item.nextBeforeTaskId);
  if (
    new Set(tasks.map((value) => value.id)).size !== tasks.length ||
    (next !== null && (tasks.length !== 25 || tasks.at(-1)?.id !== next))
  )
    return fail();
  return { tasks, nextBeforeTaskId: next };
}
export function readMembers(value: unknown) {
  const item = row(value);
  format(item, 'company-internal-task-assignees-v1');
  if (!Array.isArray(item.members) || item.members.length > 25) return fail();
  const members = item.members.map(member),
    next =
      item.nextAfterMembershipId === null
        ? null
        : uuid(item.nextAfterMembershipId);
  if (
    new Set(members.map((value) => value.membershipId)).size !==
      members.length ||
    (next !== null &&
      (members.length !== 25 || members.at(-1)?.membershipId !== next))
  )
    return fail();
  return { members, nextAfterMembershipId: next };
}
