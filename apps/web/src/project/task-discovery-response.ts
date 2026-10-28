import { readTask, type TaskView } from './task-response';

export type TaskDiscoveryRow = TaskView & {
  project: { id: string; title: string; clientDisplayName: string };
};
export type TaskDiscoveryPage = {
  companyId: string;
  offset: number;
  pageSize: 25;
  hasNextPage: boolean;
  tasks: TaskDiscoveryRow[];
};
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid discovery Tasks response.');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error('Invalid discovery Task label.');
  return value;
}

/** Validate the complete HTTP page before exposing any row or navigation. */
export function readTaskDiscoveryPage(
  value: unknown,
  scope: { companyId: string; offset: number },
): TaskDiscoveryPage {
  const row = record(value);
  if (
    row.companyId !== scope.companyId ||
    row.offset !== scope.offset ||
    !Number.isSafeInteger(row.offset) ||
    scope.offset < 0 ||
    row.pageSize !== 25 ||
    typeof row.hasNextPage !== 'boolean' ||
    !Array.isArray(row.tasks) ||
    row.tasks.length > 25 ||
    (row.hasNextPage && row.tasks.length !== 25)
  )
    throw new Error('Invalid discovery Tasks page.');
  const seen = new Set<string>();
  const tasks = row.tasks.map((entry: unknown): TaskDiscoveryRow => {
    const item = record(entry);
    const project = record(item.project);
    const projectId = text(project.id);
    const task = readTask(item, { companyId: scope.companyId, projectId });
    if (seen.has(task.id)) throw new Error('Invalid discovery Task.');
    seen.add(task.id);
    const labels = {
      id: projectId,
      title: text(project.title),
      clientDisplayName: text(project.clientDisplayName),
    };
    return { ...task, project: labels };
  });
  for (let index = 1; index < tasks.length; index++) {
    const previous = tasks[index - 1];
    const current = tasks[index];
    if (!previous || !current)
      throw new Error('Invalid discovery Tasks order.');
    if (
      (previous.dueDate === null && current.dueDate !== null) ||
      (previous.dueDate !== null &&
        current.dueDate !== null &&
        previous.dueDate > current.dueDate) ||
      (previous.dueDate === current.dueDate &&
        Date.parse(previous.createdAt) > Date.parse(current.createdAt))
    )
      throw new Error('Unordered discovery Tasks.');
  }
  // PostgreSQL preserves sub-millisecond creation precision: public timestamp
  // equality alone cannot establish an identifier tie. Keep server order.
  return {
    companyId: scope.companyId,
    offset: scope.offset,
    pageSize: 25,
    hasNextPage: row.hasNextPage,
    tasks,
  };
}
