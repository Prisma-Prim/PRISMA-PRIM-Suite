import {
  readTask,
  validTaskDate,
  type OpenTaskState,
  type TaskView,
} from '../project/task-response';

/** The Company summaries of Operational Dashboard PRD §17.2, in their fixed order. */
export const companySummaryKinds = [
  'active_clients',
  'open_projects',
  'overdue_tasks',
] as const;
export type CompanySummaryKind = (typeof companySummaryKinds)[number];
export type CompanySummary = { kind: CompanySummaryKind; count: number };
export type OperationalHomeView = {
  companyId: string;
  today: string;
  summaries: CompanySummary[];
};
export type OverdueTask = Extract<TaskView, { status: OpenTaskState }> & {
  dueDate: string;
  project: { id: string; title: string; clientDisplayName: string };
  daysOverdue: number;
};
export type CompanyOverdueTasks = {
  companyId: string;
  today: string;
  total: number;
  tasks: OverdueTask[];
};

/** The overdue list's server bound (Operational Dashboard PRD §17.2). */
const OVERDUE_TASK_ROW_LIMIT = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('Invalid operational home response');
  return value;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error('Invalid operational home text');
  return value;
}
function count(value: unknown, minimum = 0): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum
  )
    throw new Error('Invalid operational home count');
  return value;
}
function today(value: unknown): string {
  const result = text(value);
  if (!validTaskDate(result)) throw new Error('Invalid operational date');
  return result;
}
/** Fails closed on another Company's reply. */
function company(value: unknown, companyId: string): string {
  if (value !== companyId) throw new Error('Invalid operational home Company');
  return companyId;
}
function isSummaryKind(value: unknown): value is CompanySummaryKind {
  return companySummaryKinds.some((kind) => kind === value);
}

/**
 * Validates the Company summary once at the fetch boundary. A malformed body,
 * an unknown, duplicate or out-of-order kind, or another Company fails.
 */
export function readOperationalHome(
  value: unknown,
  companyId: string,
): OperationalHomeView {
  const row = record(value);
  if (!Array.isArray(row.summaries))
    throw new Error('Invalid operational home summaries');
  let previous = -1;
  const summaries = row.summaries.map((item: unknown): CompanySummary => {
    const entry = record(item);
    if (!isSummaryKind(entry.kind))
      throw new Error('Unknown operational home summary');
    const position = companySummaryKinds.indexOf(entry.kind);
    if (position <= previous)
      throw new Error('Duplicate or unordered operational home summary');
    previous = position;
    return { kind: entry.kind, count: count(entry.count) };
  });
  return {
    companyId: company(row.companyId, companyId),
    today: today(row.today),
    summaries,
  };
}

/** Validates the Company overdue-Task list once at the fetch boundary. */
export function readCompanyOverdueTasks(
  value: unknown,
  companyId: string,
): CompanyOverdueTasks {
  const row = record(value);
  const result = {
    companyId: company(row.companyId, companyId),
    today: today(row.today),
    total: count(row.total),
  };
  if (
    !Array.isArray(row.tasks) ||
    row.tasks.length > OVERDUE_TASK_ROW_LIMIT ||
    row.tasks.length > result.total
  )
    throw new Error('Invalid overdue Tasks');
  const tasks = row.tasks.map((item: unknown): OverdueTask => {
    const entry = record(item);
    const owner = record(entry.project);
    const project = {
      id: text(owner.id),
      title: text(owner.title),
      clientDisplayName: text(owner.clientDisplayName),
    };
    const task = readTask(entry, { companyId, projectId: project.id });
    const daysOverdue = count(entry.daysOverdue, 1);
    const dueDate = task.dueDate;
    // Exact YYYY-MM-DD values order as their text.
    if (dueDate === null || dueDate >= result.today)
      throw new Error('Invalid overdue Task date');
    // UTC midnight measures calendar days without daylight-saving offsets;
    // today remains the server-provided business date, never the browser clock.
    const calendarDays =
      (Date.parse(`${result.today}T00:00:00Z`) -
        Date.parse(`${dueDate}T00:00:00Z`)) /
      86_400_000;
    if (daysOverdue !== calendarDays)
      throw new Error('Inconsistent overdue Task day count');
    switch (task.status) {
      case 'todo':
      case 'in_progress':
      case 'blocked':
        return { ...task, dueDate, project, daysOverdue };
      case 'done':
      case 'cancelled':
        throw new Error('Invalid overdue Task state');
      default: {
        const exhaustive: never = task;
        return exhaustive;
      }
    }
  });
  return { ...result, tasks };
}
