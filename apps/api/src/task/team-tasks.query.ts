import { BadRequestException } from '@nestjs/common';
import { and, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { tasks } from '../database/schema/index.js';
import { calendarDate } from './task.validation.js';
import { OPEN_TASK_STATES } from './task.types.js';

const states = ['open', 'all', ...tasks.status.enumValues] as const;
const responsibilities = ['all', 'unassigned', 'name'] as const;
export type TeamTaskFilters = {
  state: (typeof states)[number];
  responsibility: (typeof responsibilities)[number];
  assigneeName: string | null;
  dueFrom: string | null;
  dueThrough: string | null;
};
function fail(): never {
  throw new BadRequestException('Invalid team Task criteria.');
}
/** Decode the raw request before Express can collapse repetitions or replace malformed UTF-8. */
export function teamTasksQuery(originalUrl: string): {
  offset: number;
  appliedFilters: TeamTaskFilters;
} {
  const marker = originalUrl.indexOf('?');
  const query = marker < 0 ? '' : originalUrl.slice(marker + 1);
  const values = new Map<string, string>();
  for (const part of query ? query.split('&') : []) {
    const separator = part.indexOf('=');
    let key: string, value: string;
    try {
      key = decodeURIComponent(
        (separator < 0 ? part : part.slice(0, separator)).replace(/\+/g, ' '),
      );
      value = decodeURIComponent(
        (separator < 0 ? '' : part.slice(separator + 1)).replace(/\+/g, ' '),
      );
    } catch {
      return fail();
    }
    if (
      ![
        'state',
        'responsibility',
        'assigneeName',
        'dueFrom',
        'dueThrough',
        'offset',
      ].includes(key) ||
      values.has(key)
    )
      fail();
    values.set(key, value);
  }
  const state = values.get('state') ?? 'open';
  const responsibility = values.get('responsibility') ?? 'all';
  const knownState = states.find((item) => item === state);
  const knownResponsibility = responsibilities.find(
    (item) => item === responsibility,
  );
  if (!knownState || !knownResponsibility) return fail();
  const name = values.get('assigneeName');
  const assigneeName = name?.trim() ?? null;
  if (responsibility === 'name') {
    if (
      !assigneeName ||
      Array.from(assigneeName).length > 200 ||
      assigneeName.includes('\0') ||
      /[\uD800-\uDFFF]/u.test(assigneeName)
    )
      fail();
  } else if (name !== undefined) fail();
  const bound = (key: string) =>
    values.has(key) ? calendarDate(values.get(key)) : null;
  const dueFrom = bound('dueFrom'),
    dueThrough = bound('dueThrough');
  if (dueFrom && dueThrough && dueFrom > dueThrough) fail();
  const rawOffset = values.get('offset') ?? '0';
  if (!/^[0-9]+$/.test(rawOffset) || !Number.isSafeInteger(Number(rawOffset)))
    fail();
  return {
    offset: Number(rawOffset),
    appliedFilters: {
      state: knownState,
      responsibility: knownResponsibility,
      assigneeName,
      dueFrom,
      dueThrough,
    },
  };
}
// Exact finite case pairs from Project/Task §33. Other scalars remain unchanged.
export const teamNameUpper =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞŒŸĂȘŞȚŢАБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯЁ';
export const teamNameLower =
  'abcdefghijklmnopqrstuvwxyzàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþœÿășşțţабвгдежзийклмнопрстуфхцчшщъыьэюяё';
export function teamTasksPredicate(filters: TeamTaskFilters) {
  const fold = (value: ReturnType<typeof sql>) =>
    sql`translate(translate(normalize(${value}, NFC), ${teamNameUpper}, ${teamNameLower}), 'ăâîșşțţ', 'aaisstt')`;
  return and(
    filters.state === 'all'
      ? undefined
      : filters.state === 'open'
        ? inArray(tasks.status, [...OPEN_TASK_STATES])
        : eq(tasks.status, filters.state),
    filters.responsibility === 'unassigned'
      ? isNull(tasks.assigneeMembershipId)
      : filters.responsibility === 'name'
        ? sql`strpos(${fold(sql`${tasks.assigneeDisplayLabel}`)}, ${fold(sql`${filters.assigneeName}::text`)}) > 0`
        : undefined,
    filters.dueFrom === null ? undefined : gte(tasks.dueDate, filters.dueFrom),
    filters.dueThrough === null
      ? undefined
      : lte(tasks.dueDate, filters.dueThrough),
  );
}
