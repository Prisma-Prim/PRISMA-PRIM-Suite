import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { requireUuid } from '../access/access-command-validation.js';

export const MAX_VERSION = 2147483647;
export const states = [
  'todo',
  'in_progress',
  'blocked',
  'done',
  'cancelled',
] as const;
export type Status = (typeof states)[number];
export type Priority = 'normal' | 'important' | 'critical';
export interface Member {
  membershipId: string;
  displayLabel: string;
}
export interface Fields {
  title: string;
  description: string | null;
  assignee: Member | null;
  dueDate: string | null;
  priority: Priority;
}
interface Base extends Fields {
  format: 'company-internal-task-v1';
  id: string;
  workspaceId: string;
  companyId: string;
  version: number;
  createdByMembershipId: string;
  createdAt: string;
  updatedAt: string;
}
type Declaration = { actorMembershipId: string; recordedAt: string };
export type Snapshot = Base &
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
export interface History {
  format: 'company-internal-task-history-v1';
  workspaceId: string;
  companyId: string;
  taskId: string;
  version: number;
  kind: 'CREATE' | 'EDIT' | 'MOVE';
  actorMembershipId: string;
  recordedAt: string;
  before: Snapshot | null;
  after: Snapshot;
}
export interface Receipt {
  format: 'company-internal-task-command-v1';
  task: Snapshot;
  changed: boolean;
  history: History | null;
}
interface InputFields {
  title: string;
  description: string | null;
  assigneeMembershipId: string | null;
  dueDate: string | null;
  priority: Priority;
}
export type Create = Pick<InputFields, 'title'> &
  Partial<Omit<InputFields, 'title'>>;
export type Change =
  | ({ kind: 'EDIT'; expectedVersion: number } & Partial<InputFields>)
  | {
      kind: 'MOVE';
      expectedVersion: number;
      status: 'blocked' | 'cancelled';
      reason: string;
    }
  | {
      kind: 'MOVE';
      expectedVersion: number;
      status: 'todo' | 'in_progress' | 'done';
    };

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Expected an Internal Task object.');
  return Object.fromEntries(Object.entries(value));
}
export function exact(value: unknown, keys: readonly string[]) {
  const row = object(value);
  if (
    Object.keys(row).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(row, key))
  )
    throw new BadRequestException('Unexpected Internal Task fields.');
  return row;
}
function allowed(row: Record<string, unknown>, keys: readonly string[]) {
  if (Object.keys(row).some((key) => !keys.includes(key)))
    throw new BadRequestException('Unexpected Internal Task fields.');
}
export function scalar(value: unknown): string {
  if (typeof value !== 'string')
    throw new BadRequestException('Expected plain text.');
  for (const point of value) {
    const code = point.charCodeAt(0);
    if (code === 0 || (point.length === 1 && code >= 0xd800 && code <= 0xdfff))
      throw new BadRequestException('Expected Unicode scalar text.');
  }
  return value;
}
export function text(value: unknown, limit: number, nullable = false) {
  if (nullable && value === null) return null;
  const normalized = scalar(value).trim();
  if ([...normalized].length > limit || (!nullable && !normalized))
    throw new BadRequestException('Internal Task text length is invalid.');
  return normalized || null;
}
function requiredText(value: unknown, limit: number) {
  const result = text(value, limit);
  if (result === null) throw new BadRequestException('Text is required.');
  return result;
}
export function version(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_VERSION
  )
    throw new BadRequestException('Expected a bounded positive version.');
  return value;
}
export function date(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u.test(value))
    throw new BadRequestException('Expected a calendar date.');
  const year = Number(value.slice(0, 4)),
    month = Number(value.slice(5, 7)),
    day = Number(value.slice(8));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0),
    days =
      month === 2 ? (leap ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days)
    throw new BadRequestException('Expected a real calendar date.');
  return value;
}
function priority(value: unknown): Priority {
  if (value !== 'normal' && value !== 'important' && value !== 'critical')
    throw new BadRequestException('Invalid priority.');
  return value;
}
function status(value: unknown): Status {
  const result = states.find((state) => state === value);
  if (!result) throw new BadRequestException('Invalid state.');
  return result;
}
function inputFields(row: Record<string, unknown>): Partial<InputFields> {
  return {
    ...(Object.hasOwn(row, 'title')
      ? { title: requiredText(row.title, 200) }
      : {}),
    ...(Object.hasOwn(row, 'description')
      ? { description: text(row.description, 2000, true) }
      : {}),
    ...(Object.hasOwn(row, 'assigneeMembershipId')
      ? {
          assigneeMembershipId:
            row.assigneeMembershipId === null
              ? null
              : requireUuid(row.assigneeMembershipId),
        }
      : {}),
    ...(Object.hasOwn(row, 'dueDate') ? { dueDate: date(row.dueDate) } : {}),
    ...(Object.hasOwn(row, 'priority')
      ? { priority: priority(row.priority) }
      : {}),
  };
}
const fieldKeys = [
  'title',
  'description',
  'assigneeMembershipId',
  'dueDate',
  'priority',
];
export function createInput(value: unknown): Create {
  const row = object(value);
  allowed(row, fieldKeys);
  return { ...inputFields(row), title: requiredText(row.title, 200) };
}
export function changeInput(value: unknown): Change {
  const row = object(value),
    expectedVersion = version(row.expectedVersion);
  if (row.kind === 'EDIT') {
    allowed(row, ['kind', 'expectedVersion', ...fieldKeys]);
    if (!fieldKeys.some((key) => Object.hasOwn(row, key)))
      throw new BadRequestException('An edit requires an ordinary field.');
    return { kind: 'EDIT', expectedVersion, ...inputFields(row) };
  }
  if (row.kind !== 'MOVE')
    throw new BadRequestException('Expected EDIT or MOVE.');
  const destination = status(row.status);
  if (destination === 'blocked' || destination === 'cancelled') {
    exact(row, ['kind', 'expectedVersion', 'status', 'reason']);
    return {
      kind: 'MOVE',
      expectedVersion,
      status: destination,
      reason: requiredText(row.reason, 500),
    };
  }
  exact(row, ['kind', 'expectedVersion', 'status']);
  return { kind: 'MOVE', expectedVersion, status: destination };
}
export function listQuery(value: unknown) {
  const row = object(value);
  allowed(row, ['status', 'beforeTaskId']);
  const filter =
    row.status === undefined
      ? 'open'
      : row.status === 'open' || row.status === 'all'
        ? row.status
        : status(row.status);
  return {
    status: filter,
    beforeTaskId:
      row.beforeTaskId === undefined
        ? undefined
        : requireUuid(row.beforeTaskId),
  };
}
export function historyQuery(value: unknown) {
  const row = object(value);
  allowed(row, ['beforeVersion']);
  if (row.beforeVersion === undefined) return undefined;
  if (
    typeof row.beforeVersion !== 'string' ||
    !/^[1-9][0-9]*$/u.test(row.beforeVersion)
  )
    throw new BadRequestException('Invalid history cursor.');
  return version(Number(row.beforeVersion));
}
export function memberQuery(value: unknown) {
  const row = object(value);
  allowed(row, ['afterMembershipId']);
  return row.afterMembershipId === undefined
    ? undefined
    : requireUuid(row.afterMembershipId);
}
export function timestamp(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T/u.test(value) ||
    new Date(value).toISOString() !== value
  )
    throw new Error('Invalid server time.');
  return value;
}
function stored<T>(value: unknown, format: string, read: () => T): T {
  if (
    value &&
    typeof value === 'object' &&
    'format' in value &&
    typeof value.format === 'string' &&
    value.format !== format
  )
    throw new ServiceUnavailableException({
      code: 'INTERNAL_TASK_UNSUPPORTED',
    });
  try {
    return read();
  } catch (error) {
    if (error instanceof ServiceUnavailableException) throw error;
    throw new ServiceUnavailableException({
      code: 'INTERNAL_TASK_UNAVAILABLE',
    });
  }
}
function uuid(value: unknown) {
  const result = requireUuid(value);
  if (result !== value) throw new Error('Noncanonical UUID.');
  return result;
}
function normalized(value: unknown, limit: number, nullable = false) {
  const result = text(value, limit, nullable);
  if (result !== value) throw new Error('Unnormalized stored text.');
  return result;
}
function declaration(value: unknown) {
  const row = exact(value, ['actorMembershipId', 'recordedAt']);
  return {
    actorMembershipId: uuid(row.actorMembershipId),
    recordedAt: timestamp(row.recordedAt),
  };
}
export function snapshot(value: unknown): Snapshot {
  return stored(value, 'company-internal-task-v1', () => {
    const row = exact(value, [
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
    ]);
    if (row.format !== 'company-internal-task-v1')
      throw new Error('Invalid format.');
    let assignee: Member | null = null;
    if (row.assignee !== null) {
      const member = exact(row.assignee, ['membershipId', 'displayLabel']);
      const displayLabel = scalar(member.displayLabel);
      if (!displayLabel) throw new Error('Missing captured label.');
      assignee = { membershipId: uuid(member.membershipId), displayLabel };
    }
    const title = normalized(row.title, 200);
    if (title === null) throw new Error('Missing title.');
    const base: Base = {
      format: 'company-internal-task-v1',
      id: uuid(row.id),
      workspaceId: uuid(row.workspaceId),
      companyId: uuid(row.companyId),
      version: version(row.version),
      title,
      description: normalized(row.description, 2000, true),
      assignee,
      dueDate: date(row.dueDate),
      priority: priority(row.priority),
      createdByMembershipId: uuid(row.createdByMembershipId),
      createdAt: timestamp(row.createdAt),
      updatedAt: timestamp(row.updatedAt),
    };
    const state = status(row.status);
    if (state === 'done') {
      if (row.reason !== null) throw new Error('Invalid declaration.');
      return {
        ...base,
        status: state,
        completion: declaration(row.completion),
        reason: null,
      };
    }
    if (row.completion !== null) throw new Error('Invalid completion.');
    if (state === 'blocked' || state === 'cancelled') {
      const reason = exact(row.reason, [
        'kind',
        'text',
        'actorMembershipId',
        'recordedAt',
      ]);
      const kind = state === 'blocked' ? 'blockage' : 'cancellation';
      if (reason.kind !== kind) throw new Error('Invalid reason.');
      const reasonText = normalized(reason.text, 500);
      if (!reasonText) throw new Error('Missing reason.');
      const attribution = declaration({
        actorMembershipId: reason.actorMembershipId,
        recordedAt: reason.recordedAt,
      });
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
    if (row.reason !== null) throw new Error('Invalid reason.');
    return { ...base, status: state, completion: null, reason: null };
  });
}
export function history(value: unknown): History {
  return stored(value, 'company-internal-task-history-v1', () => {
    const row = exact(value, [
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
    if (
      row.format !== 'company-internal-task-history-v1' ||
      (row.kind !== 'CREATE' && row.kind !== 'EDIT' && row.kind !== 'MOVE')
    )
      throw new Error('Invalid history.');
    const after = snapshot(row.after),
      before = row.before === null ? null : snapshot(row.before);
    const fact: History = {
      format: 'company-internal-task-history-v1',
      workspaceId: uuid(row.workspaceId),
      companyId: uuid(row.companyId),
      taskId: uuid(row.taskId),
      version: version(row.version),
      kind: row.kind,
      actorMembershipId: uuid(row.actorMembershipId),
      recordedAt: timestamp(row.recordedAt),
      before,
      after,
    };
    if (
      after.id !== fact.taskId ||
      after.workspaceId !== fact.workspaceId ||
      after.companyId !== fact.companyId ||
      after.version !== fact.version ||
      after.updatedAt !== fact.recordedAt ||
      (fact.kind === 'CREATE'
        ? before !== null ||
          fact.version !== 1 ||
          after.status !== 'todo' ||
          after.createdAt !== fact.recordedAt ||
          after.createdByMembershipId !== fact.actorMembershipId
        : !before ||
          before.version + 1 !== fact.version ||
          before.id !== after.id ||
          before.workspaceId !== after.workspaceId ||
          before.companyId !== after.companyId ||
          before.createdAt !== after.createdAt ||
          before.createdByMembershipId !== after.createdByMembershipId)
    )
      throw new Error('Inconsistent history.');
    if (before) {
      const fields = (task: Snapshot) =>
        JSON.stringify([
          task.title,
          task.description,
          task.assignee,
          task.dueDate,
          task.priority,
        ]);
      const open =
        before.status === 'todo' ||
        before.status === 'in_progress' ||
        before.status === 'blocked';
      if (
        fact.kind === 'EDIT' &&
        (!open ||
          after.status !== before.status ||
          JSON.stringify(after.completion) !==
            JSON.stringify(before.completion) ||
          JSON.stringify(after.reason) !== JSON.stringify(before.reason) ||
          fields(before) === fields(after))
      )
        throw new Error('Invalid field history.');
      if (
        fact.kind === 'MOVE' &&
        (after.status === before.status ||
          (!open && after.status !== 'todo') ||
          fields(before) !== fields(after) ||
          (after.completion &&
            (after.completion.actorMembershipId !== fact.actorMembershipId ||
              after.completion.recordedAt !== fact.recordedAt)) ||
          (after.reason &&
            (after.reason.actorMembershipId !== fact.actorMembershipId ||
              after.reason.recordedAt !== fact.recordedAt)))
      )
        throw new Error('Invalid state history.');
    }
    return fact;
  });
}
export function receipt(value: unknown): Receipt {
  return stored(value, 'company-internal-task-command-v1', () => {
    const row = exact(value, ['format', 'task', 'changed', 'history']);
    if (
      row.format !== 'company-internal-task-command-v1' ||
      typeof row.changed !== 'boolean'
    )
      throw new Error('Invalid receipt.');
    const task = snapshot(row.task),
      fact = row.history === null ? null : history(row.history);
    if (
      row.changed !== (fact !== null) ||
      (fact && JSON.stringify(fact.after) !== JSON.stringify(task))
    )
      throw new Error('Inconsistent receipt.');
    return {
      format: 'company-internal-task-command-v1',
      task,
      changed: row.changed,
      history: fact,
    };
  });
}

export function savedIntent(value: unknown) {
  return stored(value, 'company-internal-task-command-v1', () => {
    const row = exact(value, [
      'format',
      'workspaceId',
      'actorMembershipId',
      'companyId',
      'taskId',
      'kind',
      'body',
    ]);
    if (
      row.format !== 'company-internal-task-command-v1' ||
      (row.kind !== 'CREATE' && row.kind !== 'CHANGE')
    )
      throw new Error('Invalid saved command.');
    const body =
      row.kind === 'CREATE' ? createInput(row.body) : changeInput(row.body);
    const order = (_key: string, item: unknown) =>
      item && typeof item === 'object' && !Array.isArray(item)
        ? Object.fromEntries(
            Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
          )
        : item;
    if (JSON.stringify(body, order) !== JSON.stringify(row.body, order))
      throw new Error('Unnormalized saved command.');
    return {
      format: 'company-internal-task-command-v1',
      workspaceId: uuid(row.workspaceId),
      actorMembershipId: uuid(row.actorMembershipId),
      companyId: uuid(row.companyId),
      taskId: uuid(row.taskId),
      kind: row.kind,
      body,
    };
  });
}
