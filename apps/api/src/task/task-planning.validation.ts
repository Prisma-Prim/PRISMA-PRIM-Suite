import { BadRequestException } from '@nestjs/common';
import { requireUuid } from '../access/access-command-validation.js';
import {
  calendarDate,
  editInput,
  object,
  readTaskOutcome,
} from './task.validation.js';
import type { TaskOutcome } from './task.types.js';

function exactKeys(row: Record<string, unknown>, keys: readonly string[]) {
  if (
    Object.keys(row).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(row, key))
  )
    throw new BadRequestException('Invalid grouped Task planning fields.');
}

/** One explicit ordered intent; no omitted field means an implicit clear. */
export function planningInput(value: unknown) {
  const row = object(value);
  exactKeys(row, ['tasks']);
  if (
    !Array.isArray(row.tasks) ||
    row.tasks.length < 1 ||
    row.tasks.length > 50
  )
    throw new BadRequestException('Select 1–50 distinct Tasks.');
  const values: unknown[] = row.tasks;
  const tasks = values.map((value) => {
    const task = object(value);
    exactKeys(task, [
      'taskId',
      'expectedVersion',
      'assigneeMembershipId',
      'dueDate',
    ]);
    if (task.dueDate === undefined)
      throw new BadRequestException(
        'An explicit due date or null is required.',
      );
    return {
      taskId: requireUuid(task.taskId),
      expectedVersion: editInput({ expectedVersion: task.expectedVersion })
        .expectedVersion,
      assigneeMembershipId:
        task.assigneeMembershipId === null
          ? null
          : requireUuid(task.assigneeMembershipId),
      dueDate: calendarDate(task.dueDate),
    };
  });
  if (new Set(tasks.map((task) => task.taskId)).size !== tasks.length)
    throw new BadRequestException('Select distinct Tasks.');
  return { tasks };
}
export type TaskPlanningInput = ReturnType<typeof planningInput>;

const receiptSchema = 'task-planning/v1';
export function planningReceipt(projectId: string, tasks: TaskOutcome[]) {
  return { schema: receiptSchema, projectId, tasks };
}

/** Persisted receipts are a closed versioned format, independently of permissive HTTP readers. */
export function readPlanningReceipt(
  value: unknown,
  scope: {
    projectId: string;
    companyId: string;
    taskIds: readonly string[];
  },
) {
  const row = object(value);
  exactKeys(row, ['schema', 'projectId', 'tasks']);
  if (
    row.schema !== receiptSchema ||
    row.projectId !== scope.projectId ||
    !Array.isArray(row.tasks) ||
    row.tasks.length !== scope.taskIds.length
  )
    throw new Error('Invalid stored Task planning receipt.');
  const values: unknown[] = row.tasks;
  const tasks = values.map((value, index) => {
    const task = readTaskOutcome(value);
    if (
      task.id !== scope.taskIds[index] ||
      task.projectId !== scope.projectId ||
      task.companyId !== scope.companyId
    )
      throw new Error('Invalid stored Task planning target.');
    return task;
  });
  return planningReceipt(scope.projectId, tasks);
}
