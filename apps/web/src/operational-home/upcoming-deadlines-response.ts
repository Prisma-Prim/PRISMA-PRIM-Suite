import {
  readAssignedTasks,
  validTaskDate,
  type AssignedTask,
} from '../project/task-response';

export type UpcomingTask = AssignedTask & { dueDate: string };
export type UpcomingDeadlinesPage = {
  companyId: string;
  today: string;
  throughDate: string;
  total: number;
  offset: number;
  pageSize: 25;
  tasks: UpcomingTask[];
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid upcoming deadlines response.');
  return Object.fromEntries(Object.entries(value));
}
function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('Invalid upcoming deadlines pagination.');
  return value;
}
function date(value: unknown): string {
  if (typeof value !== 'string' || !validTaskDate(value))
    throw new Error('Invalid upcoming deadlines date.');
  return value;
}

/** The HTTP boundary owns validation; no row or count escapes a failed page. */
export function readUpcomingDeadlines(
  value: unknown,
  reader: { companyId: string; workspaceMembershipId: string; offset: number },
): UpcomingDeadlinesPage {
  const row = record(value);
  const today = date(row.today);
  const throughDate = date(row.throughDate);
  const total = integer(row.total);
  const offset = integer(row.offset);
  if (
    row.companyId !== reader.companyId ||
    offset !== reader.offset ||
    row.pageSize !== 25 ||
    Date.parse(`${throughDate}T00:00:00Z`) -
      Date.parse(`${today}T00:00:00Z`) !==
      7 * 86_400_000
  )
    throw new Error('Inconsistent upcoming deadlines scope or range.');
  const assigned = readAssignedTasks(row, reader);
  if (assigned.length !== Math.min(25, Math.max(0, total - offset)))
    throw new Error('Inconsistent upcoming deadlines page.');
  const seen = new Set<string>();
  const tasks = assigned.map((task): UpcomingTask => {
    if (
      task.dueDate === null ||
      task.dueDate < today ||
      task.dueDate > throughDate ||
      seen.has(task.id) ||
      !task.title.trim() ||
      !task.project.title.trim() ||
      !task.project.clientDisplayName.trim()
    )
      throw new Error('Invalid upcoming Task row.');
    seen.add(task.id);
    return { ...task, dueDate: task.dueDate };
  });
  // PostgreSQL creation precision exceeds the ISO Date projection. Equal public
  // milliseconds cannot establish an identifier tie; preserve the server order.
  for (let index = 1; index < tasks.length; index++) {
    const previous = tasks[index - 1];
    const current = tasks[index];
    if (!previous || !current) throw new Error('Invalid upcoming Task page.');
    const wrongOrder =
      previous.dueDate > current.dueDate ||
      (previous.dueDate === current.dueDate &&
        Date.parse(previous.createdAt) > Date.parse(current.createdAt));
    if (wrongOrder) throw new Error('Unordered upcoming Task page.');
  }
  return {
    companyId: reader.companyId,
    today,
    throughDate,
    total,
    offset,
    pageSize: 25,
    tasks,
  };
}
