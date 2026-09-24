import { BadRequestException } from '@nestjs/common';
import { requireUuid } from '../access/access-command-validation.js';
import {
  OPEN_TASK_STATES,
  type OpenTaskState,
  type TaskActor,
  type TaskAssignee,
  type TaskChanges,
  type TaskDeclaration,
  type TaskEventMeaning,
  type TaskFields,
  type TaskView,
} from './task.types.js';
export interface TaskInput {
  title: string;
  assigneeMembershipId: string | null;
  dueDate: string | null;
}
export type TaskEdit = Partial<TaskInput> & { expectedVersion: number };
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Invalid Task data.');
  return Object.fromEntries(Object.entries(value));
}
function keys(row: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(row).some((key) => !allowed.includes(key)))
    throw new BadRequestException('Unsupported Task fields.');
}
function title(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200)
    throw new BadRequestException('Task title must contain 1–200 characters.');
  return value.trim();
}
export function calendarDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new BadRequestException(
      'Use a valid calendar date in YYYY-MM-DD form.',
    );
  const year = Number(value.slice(0, 4)),
    month = Number(value.slice(5, 7)),
    day = Number(value.slice(8));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days =
    month === 2 ? (leap ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days)
    throw new BadRequestException(
      'Use a valid calendar date in YYYY-MM-DD form.',
    );
  return value;
}
function membership(value: unknown): string | null {
  return value === null || value === undefined ? null : requireUuid(value);
}
function version(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 2147483647
  )
    throw new BadRequestException('A valid expected Task version is required.');
  return value;
}
export function createInput(value: unknown): TaskInput {
  const row = object(value);
  keys(row, ['title', 'assigneeMembershipId', 'dueDate']);
  return {
    title: title(row.title),
    assigneeMembershipId: membership(row.assigneeMembershipId),
    dueDate: calendarDate(row.dueDate),
  };
}
export function editInput(value: unknown): TaskEdit {
  const row = object(value);
  keys(row, ['expectedVersion', 'title', 'assigneeMembershipId', 'dueDate']);
  return {
    expectedVersion: version(row.expectedVersion),
    ...('title' in row ? { title: title(row.title) } : {}),
    ...('assigneeMembershipId' in row
      ? { assigneeMembershipId: membership(row.assigneeMembershipId) }
      : {}),
    ...('dueDate' in row ? { dueDate: calendarDate(row.dueDate) } : {}),
  };
}
export function transitionInput(value: unknown) {
  const row = object(value);
  keys(row, ['expectedVersion']);
  return { expectedVersion: version(row.expectedVersion) };
}
export function isOpenTaskState(value: unknown): value is OpenTaskState {
  return OPEN_TASK_STATES.some((state) => state === value);
}
function reason(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 500)
    throw new BadRequestException('A reason must contain 1–500 characters.');
  return value.trim();
}
export type TaskStatusInput = { expectedVersion: number } & (
  | { status: Exclude<OpenTaskState, 'blocked'> }
  | { status: 'blocked'; reason: string }
);
/** Only entering `blocked` takes a reason; a reason sent with any other open state is rejected. */
export function statusInput(value: unknown): TaskStatusInput {
  const row = object(value);
  keys(row, ['expectedVersion', 'status', 'reason']);
  const expectedVersion = version(row.expectedVersion);
  if (!isOpenTaskState(row.status))
    throw new BadRequestException('Choose an open Task state.');
  if (row.status === 'blocked')
    return { expectedVersion, status: row.status, reason: reason(row.reason) };
  if ('reason' in row)
    throw new BadRequestException('Only a blockage takes a reason.');
  return { expectedVersion, status: row.status };
}
export function cancelInput(value: unknown) {
  const row = object(value);
  keys(row, ['expectedVersion', 'reason']);
  return {
    expectedVersion: version(row.expectedVersion),
    reason: reason(row.reason),
  };
}
/** The assigned-Task read takes no filter, search, paging or scope input. */
export function assignedTasksQuery(value: unknown): void {
  keys(object(value), []);
}
function string(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid stored Task text.');
  return value;
}
function actor(value: unknown): TaskActor {
  const row = object(value);
  return {
    internalUserId: string(row.internalUserId),
    workspaceMembershipId: string(row.workspaceMembershipId),
    displayName: string(row.displayName),
  };
}
function assignee(value: unknown): TaskAssignee | null {
  if (value === null) return null;
  const row = object(value);
  return {
    workspaceMembershipId: string(row.workspaceMembershipId),
    displayLabel: string(row.displayLabel),
  };
}
function fields(value: unknown): TaskFields {
  const row = object(value);
  return {
    title: title(row.title),
    assignee: assignee(row.assignee),
    dueDate: calendarDate(row.dueDate),
  };
}
/** Stored JSON is an external boundary; reconstruct the checked public result. */
export function readTaskView(value: unknown): TaskView {
  const row = object(value);
  const common = {
    ...fields(row),
    id: string(row.id),
    companyId: string(row.companyId),
    projectId: string(row.projectId),
    clientAccountId: string(row.clientAccountId),
    version: version(row.version),
    createdAt: string(row.createdAt),
    updatedAt: string(row.updatedAt),
    createdBy: actor(row.createdBy),
  };
  // Receipts recorded before blocked and cancelled states existed keep exactly this shape.
  switch (row.status) {
    case 'todo':
    case 'in_progress':
      if (row.completion === null)
        return { ...common, status: row.status, completion: null };
      break;
    case 'blocked':
      if (row.completion === null)
        return {
          ...common,
          status: row.status,
          completion: null,
          blockage: declaration(row.blockage),
        };
      break;
    case 'done': {
      const completion = object(row.completion);
      return {
        ...common,
        status: row.status,
        completion: {
          actor: actor(completion.actor),
          occurredAt: string(completion.occurredAt),
        },
      };
    }
    case 'cancelled':
      if (row.completion === null)
        return {
          ...common,
          status: row.status,
          completion: null,
          cancellation: declaration(row.cancellation),
        };
      break;
  }
  throw new Error('Invalid stored Task state.');
}
function declaration(value: unknown): TaskDeclaration {
  const row = object(value);
  return {
    reason: reason(row.reason),
    actor: actor(row.actor),
    occurredAt: string(row.occurredAt),
  };
}
function openState(value: unknown): OpenTaskState {
  if (!isOpenTaskState(value)) throw new Error('Invalid stored Task state.');
  return value;
}
export function readTaskMeaning(value: unknown): TaskEventMeaning {
  const row = object(value),
    metadata = object(row.metadata),
    resultVersion = version(metadata.version);
  switch (row.action) {
    case 'task.created':
      return {
        action: row.action,
        metadata: { version: resultVersion, initial: fields(metadata.initial) },
      };
    case 'task.updated': {
      const stored = object(metadata.changes);
      keys(stored, ['title', 'assignee', 'dueDate']);
      const changes: TaskChanges = {};
      if (stored.title !== undefined) {
        const change = object(stored.title);
        changes.title = {
          before: title(change.before),
          after: title(change.after),
        };
      }
      if (stored.assignee !== undefined) {
        const change = object(stored.assignee);
        changes.assignee = {
          before: assignee(change.before),
          after: assignee(change.after),
        };
      }
      if (stored.dueDate !== undefined) {
        const change = object(stored.dueDate);
        changes.dueDate = {
          before: calendarDate(change.before),
          after: calendarDate(change.after),
        };
      }
      return {
        action: row.action,
        metadata: { version: resultVersion, changes },
      };
    }
    case 'task.status.changed': {
      const before = openState(metadata.before),
        after = openState(metadata.after);
      if (before === after) break;
      if (after === 'blocked')
        return {
          action: row.action,
          metadata: {
            version: resultVersion,
            before,
            after,
            reason: reason(metadata.reason),
          },
        };
      if (metadata.reason === null)
        return {
          action: row.action,
          metadata: { version: resultVersion, before, after, reason: null },
        };
      break;
    }
    // Completions recorded before in-progress and blocked states existed start from `todo`.
    case 'task.completed':
      if (metadata.after === 'done')
        return {
          action: row.action,
          metadata: {
            version: resultVersion,
            before: openState(metadata.before),
            after: 'done',
          },
        };
      break;
    case 'task.cancelled':
      if (metadata.after === 'cancelled')
        return {
          action: row.action,
          metadata: {
            version: resultVersion,
            before: openState(metadata.before),
            after: 'cancelled',
            reason: reason(metadata.reason),
          },
        };
      break;
    case 'task.reopened':
      if (
        (metadata.before === 'done' || metadata.before === 'cancelled') &&
        metadata.after === 'todo'
      )
        return {
          action: row.action,
          metadata: {
            version: resultVersion,
            before: metadata.before,
            after: 'todo',
          },
        };
      break;
  }
  throw new Error('Invalid stored Task history.');
}
