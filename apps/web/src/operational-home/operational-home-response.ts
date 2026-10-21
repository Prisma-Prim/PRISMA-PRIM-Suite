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
export const attentionRules = [
  'overdue',
  'critical',
  'blocked',
  'due_soon',
] as const;
export type AttentionRule = (typeof attentionRules)[number];
export type AttentionTask = Extract<TaskView, { status: OpenTaskState }> & {
  project: { id: string; title: string; clientDisplayName: string };
  rules: AttentionRule[];
  dueInDays: number | null;
};
export type MyAttention = {
  matchingCount: number;
  tasks: AttentionTask[];
};
export type OperationalHomeView = {
  companyId: string;
  today: string;
  summaries: CompanySummary[];
  attention?: MyAttention;
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
  offset: number;
  pageSize: 25;
  tasks: OverdueTask[];
};

/** The fixed overdue page size (Operational Dashboard PRD §17.2). */
const OVERDUE_TASK_PAGE_SIZE = 25;
/** The My attention bound of Operational Dashboard PRD §17.3. */
const ATTENTION_TASK_ROW_LIMIT = 10;

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
  scope: { companyId: string; workspaceMembershipId: string },
): OperationalHomeView {
  const { companyId, workspaceMembershipId } = scope;
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
  const result: OperationalHomeView = {
    companyId: company(row.companyId, companyId),
    today: today(row.today),
    summaries,
  };
  if (row.attention !== undefined)
    result.attention = readAttention(row.attention, {
      companyId,
      workspaceMembershipId,
      operationalToday: result.today,
    });
  return result;
}

function readAttention(
  value: unknown,
  scope: {
    companyId: string;
    workspaceMembershipId: string;
    operationalToday: string;
  },
): MyAttention {
  const row = record(value);
  const matchingCount = count(row.matchingCount);
  if (
    !Array.isArray(row.tasks) ||
    row.tasks.length > ATTENTION_TASK_ROW_LIMIT ||
    row.tasks.length > matchingCount
  )
    throw new Error('Invalid attention Tasks');
  return {
    matchingCount,
    tasks: row.tasks.map((item: unknown) => readAttentionTask(item, scope)),
  };
}

function readAttentionTask(
  value: unknown,
  {
    companyId,
    workspaceMembershipId,
    operationalToday,
  }: {
    companyId: string;
    workspaceMembershipId: string;
    operationalToday: string;
  },
): AttentionTask {
  const entry = record(value);
  const owner = record(entry.project);
  const project = {
    id: text(owner.id),
    title: text(owner.title),
    clientDisplayName: text(owner.clientDisplayName),
  };
  const task = readTask(entry, { companyId, projectId: project.id });
  if (task.assignee?.workspaceMembershipId !== workspaceMembershipId)
    throw new Error('Invalid attention Task assignee');
  if (!Array.isArray(entry.rules))
    throw new Error('Invalid attention Task rules');
  const expectedRules: AttentionRule[] = [];
  const dueInDays = task.dueDate
    ? calendarDayDistance(operationalToday, task.dueDate)
    : null;
  if (dueInDays !== null && dueInDays < 0) expectedRules.push('overdue');
  if (task.priority === 'critical') expectedRules.push('critical');
  if (task.status === 'blocked') expectedRules.push('blocked');
  if (dueInDays !== null && dueInDays >= 0 && dueInDays <= 7)
    expectedRules.push('due_soon');
  if (
    expectedRules.length === 0 ||
    entry.rules.length !== expectedRules.length ||
    !entry.rules.every((rule, index) => rule === expectedRules[index])
  )
    throw new Error('Inconsistent attention Task rules');
  if (entry.dueInDays !== dueInDays)
    throw new Error('Inconsistent attention Task day count');
  switch (task.status) {
    case 'todo':
    case 'in_progress':
    case 'blocked':
      return { ...task, project, rules: expectedRules, dueInDays };
    case 'done':
    case 'cancelled':
      throw new Error('Invalid attention Task state');
    default: {
      const exhaustive: never = task;
      return exhaustive;
    }
  }
}

function calendarDayDistance(from: string, to: string): number {
  return (
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
    86_400_000
  );
}

/** Validates the Company overdue-Task list once at the fetch boundary. */
export function readCompanyOverdueTasks(
  value: unknown,
  reader: { companyId: string; offset: number },
): CompanyOverdueTasks {
  const { companyId, offset } = reader;
  const row = record(value);
  const result = {
    companyId: company(row.companyId, companyId),
    today: today(row.today),
    total: count(row.total),
    offset: count(row.offset),
  };
  if (
    result.offset !== offset ||
    row.pageSize !== OVERDUE_TASK_PAGE_SIZE ||
    !Array.isArray(row.tasks) ||
    row.tasks.length !==
      Math.min(OVERDUE_TASK_PAGE_SIZE, Math.max(0, result.total - offset))
  )
    throw new Error('Invalid overdue Tasks');
  const seen = new Set<string>();
  const tasks = row.tasks.map((item: unknown): OverdueTask => {
    const entry = record(item);
    const owner = record(entry.project);
    const project = {
      id: text(owner.id),
      title: text(owner.title),
      clientDisplayName: text(owner.clientDisplayName),
    };
    const task = readTask(entry, { companyId, projectId: project.id });
    if (seen.has(task.id)) throw new Error('Duplicate overdue Task.');
    seen.add(task.id);
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
  // Equal projected milliseconds do not establish PostgreSQL's identifier tie.
  // Preserve server order and reject only inversions visible in the public facts.
  for (let index = 1; index < tasks.length; index++) {
    const previous = tasks[index - 1];
    const current = tasks[index];
    if (!previous || !current) throw new Error('Invalid overdue Task page.');
    if (
      previous.dueDate > current.dueDate ||
      (previous.dueDate === current.dueDate &&
        Date.parse(previous.createdAt) > Date.parse(current.createdAt))
    )
      throw new Error('Unordered overdue Task page.');
  }
  return { ...result, pageSize: 25, tasks };
}
