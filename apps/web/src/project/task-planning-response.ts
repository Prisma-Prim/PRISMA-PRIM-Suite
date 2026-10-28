import { readTaskOutcome, type TaskOutcome } from './task-response';

export type PlanningRow = Readonly<{
  taskId: string;
  expectedVersion: number;
  assigneeMembershipId: string | null;
  dueDate: string | null;
}>;
export type PlanningAttempt = Readonly<{
  path: string;
  key: string;
  body: { readonly tasks: readonly PlanningRow[] };
}>;

/** Additive HTTP metadata is compatible; unknown receipt versions and mismatched selected outcomes are not. */
export function readTaskPlanningReceipt(
  value: unknown,
  scope: { companyId: string; projectId: string },
  attempt: PlanningAttempt,
): TaskOutcome[] {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid planning receipt.');
  const row = Object.fromEntries(Object.entries(value));
  if (
    row.schema !== 'task-planning/v1' ||
    row.projectId !== scope.projectId ||
    !Array.isArray(row.tasks) ||
    row.tasks.length !== attempt.body.tasks.length
  )
    throw new Error('Invalid planning result.');
  const values: unknown[] = row.tasks;
  return values.map((value, index) => {
    const task = readTaskOutcome(value, scope),
      planned = attempt.body.tasks[index];
    if (
      !planned ||
      task.id !== planned.taskId ||
      task.dueDate !== planned.dueDate ||
      (task.assignee?.workspaceMembershipId ?? null) !==
        planned.assigneeMembershipId ||
      (task.version !== planned.expectedVersion &&
        task.version !== planned.expectedVersion + 1)
    )
      throw new Error('Invalid selected planning outcome.');
    return task;
  });
}
