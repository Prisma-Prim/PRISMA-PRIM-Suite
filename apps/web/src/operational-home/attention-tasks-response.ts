import {
  readAttentionTask,
  attentionRules,
  type AttentionTask,
} from './operational-home-response';
import { validTaskDate } from '../project/task-response';

export type AttentionTasksPage = {
  companyId: string;
  today: string;
  total: number;
  offset: number;
  pageSize: 25;
  tasks: AttentionTask[];
};

/** One complete HTTP page is admitted atomically, using the preview's row proof. */
export function readAttentionTasks(
  value: unknown,
  reader: { companyId: string; workspaceMembershipId: string; offset: number },
): AttentionTasksPage {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid attention page.');
  const row: Record<string, unknown> = Object.fromEntries(
    Object.entries(value),
  );
  if (
    row.companyId !== reader.companyId ||
    typeof row.today !== 'string' ||
    !validTaskDate(row.today) ||
    typeof row.total !== 'number' ||
    !Number.isSafeInteger(row.total) ||
    row.total < 0 ||
    row.offset !== reader.offset ||
    row.pageSize !== 25 ||
    !Array.isArray(row.tasks) ||
    row.tasks.length !== Math.min(25, Math.max(0, row.total - reader.offset))
  )
    throw new Error('Inconsistent attention page.');
  const today = row.today;
  const tasks = row.tasks.map((task: unknown) =>
    readAttentionTask(task, { ...reader, operationalToday: today }),
  );
  if (new Set(tasks.map((task) => task.id)).size !== tasks.length)
    throw new Error('Duplicate attention Task.');
  for (let index = 1; index < tasks.length; index++) {
    const previous = tasks[index - 1];
    const current = tasks[index];
    if (!previous || !current || reversed(previous, current))
      throw new Error('Unordered attention Tasks.');
  }
  return {
    companyId: reader.companyId,
    today,
    total: row.total,
    offset: reader.offset,
    pageSize: 25,
    tasks,
  };
}

const priorities = { critical: 0, important: 1, normal: 2 } satisfies Record<
  AttentionTask['priority'],
  number
>;
function reversed(previous: AttentionTask, current: AttentionTask): boolean {
  const previousRule = previous.rules[0];
  const currentRule = current.rules[0];
  if (previousRule === undefined || currentRule === undefined)
    throw new Error('Missing attention rule.');
  const ruleOrder =
    attentionRules.indexOf(previousRule) - attentionRules.indexOf(currentRule);
  if (ruleOrder !== 0) return ruleOrder > 0;
  if (previous.dueDate !== current.dueDate) {
    if (previous.dueDate === null) return true;
    if (current.dueDate === null) return false;
    return previous.dueDate > current.dueDate;
  }
  const priorityOrder =
    priorities[previous.priority] - priorities[current.priority];
  if (priorityOrder !== 0) return priorityOrder > 0;
  // The API's ISO projection cannot expose PostgreSQL microsecond ties. Equal
  // public milliseconds do not prove an id tie; retain the authoritative order.
  return Date.parse(previous.createdAt) > Date.parse(current.createdAt);
}
