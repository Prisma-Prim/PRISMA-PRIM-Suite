import { BadRequestException } from '@nestjs/common';
import { requireUuid } from '../access/access-command-validation.js';
import {
  DEFAULT_TASK_PRIORITY,
  TASK_PRIORITIES,
  type TaskActor,
  type TaskAssignee,
  type TaskChanges,
  type TaskEventMeaning,
  type TaskFields,
  type TaskInitialFields,
  type TaskPriority,
  type TaskView,
} from './task.types.js';
export interface TaskInput {
  title: string;
  assigneeMembershipId: string | null;
  dueDate: string | null;
  /** Present only when submitted, so a pre-priority receipt keeps its fingerprint. */
  priority?: TaskPriority;
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
function knownPriority(value: unknown): TaskPriority | undefined {
  return TASK_PRIORITIES.find((priority) => priority === value);
}
function priority(value: unknown): TaskPriority {
  const known = knownPriority(value);
  if (!known)
    throw new BadRequestException(
      'Task priority must be normal, important or critical.',
    );
  return known;
}
function storedPriority(value: unknown): TaskPriority {
  const known = knownPriority(value);
  if (!known) throw new Error('Invalid stored Task priority.');
  return known;
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
  keys(row, ['title', 'assigneeMembershipId', 'dueDate', 'priority']);
  return {
    title: title(row.title),
    assigneeMembershipId: membership(row.assigneeMembershipId),
    dueDate: calendarDate(row.dueDate),
    ...('priority' in row ? { priority: priority(row.priority) } : {}),
  };
}
export function editInput(value: unknown): TaskEdit {
  const row = object(value);
  keys(row, [
    'expectedVersion',
    'title',
    'assigneeMembershipId',
    'dueDate',
    'priority',
  ]);
  return {
    expectedVersion: version(row.expectedVersion),
    ...('title' in row ? { title: title(row.title) } : {}),
    ...('assigneeMembershipId' in row
      ? { assigneeMembershipId: membership(row.assigneeMembershipId) }
      : {}),
    ...('dueDate' in row ? { dueDate: calendarDate(row.dueDate) } : {}),
    ...('priority' in row ? { priority: priority(row.priority) } : {}),
  };
}
export function transitionInput(value: unknown) {
  const row = object(value);
  keys(row, ['expectedVersion']);
  return { expectedVersion: version(row.expectedVersion) };
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
/** Only a creation recorded before priority existed lacks one; it stays absent. */
function initialFields(value: unknown): TaskInitialFields {
  const row = object(value);
  return {
    title: title(row.title),
    assignee: assignee(row.assignee),
    dueDate: calendarDate(row.dueDate),
    ...('priority' in row ? { priority: storedPriority(row.priority) } : {}),
  };
}
/** A result recorded before priority existed describes a Task backfilled as normal. */
function resultFields(value: unknown): TaskFields {
  const fields = initialFields(value);
  return { ...fields, priority: fields.priority ?? DEFAULT_TASK_PRIORITY };
}
/** Stored JSON is an external boundary; reconstruct the checked public result. */
export function readTaskView(value: unknown): TaskView {
  const row = object(value);
  const common = {
    ...resultFields(row),
    id: string(row.id),
    companyId: string(row.companyId),
    projectId: string(row.projectId),
    clientAccountId: string(row.clientAccountId),
    version: version(row.version),
    createdAt: string(row.createdAt),
    updatedAt: string(row.updatedAt),
    createdBy: actor(row.createdBy),
  };
  if (row.status === 'todo' && row.completion === null)
    return { ...common, status: 'todo', completion: null };
  if (row.status === 'done') {
    const completion = object(row.completion);
    return {
      ...common,
      status: 'done',
      completion: {
        actor: actor(completion.actor),
        occurredAt: string(completion.occurredAt),
      },
    };
  }
  throw new Error('Invalid stored Task state.');
}
export function readTaskMeaning(value: unknown): TaskEventMeaning {
  const row = object(value),
    metadata = object(row.metadata),
    resultVersion = version(metadata.version);
  switch (row.action) {
    case 'task.created':
      return {
        action: row.action,
        metadata: {
          version: resultVersion,
          initial: initialFields(metadata.initial),
        },
      };
    case 'task.updated': {
      const stored = object(metadata.changes);
      keys(stored, ['title', 'assignee', 'dueDate', 'priority']);
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
      if (stored.priority !== undefined) {
        const change = object(stored.priority);
        changes.priority = {
          before: storedPriority(change.before),
          after: storedPriority(change.after),
        };
      }
      return {
        action: row.action,
        metadata: { version: resultVersion, changes },
      };
    }
    case 'task.completed':
      if (metadata.before === 'todo' && metadata.after === 'done')
        return {
          action: row.action,
          metadata: { version: resultVersion, before: 'todo', after: 'done' },
        };
      break;
    case 'task.reopened':
      if (metadata.before === 'done' && metadata.after === 'todo')
        return {
          action: row.action,
          metadata: { version: resultVersion, before: 'done', after: 'todo' },
        };
      break;
  }
  throw new Error('Invalid stored Task history.');
}
