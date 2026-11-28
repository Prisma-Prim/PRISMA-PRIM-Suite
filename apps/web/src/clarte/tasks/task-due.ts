/** The due-date groups of a Tasks view, in display order. */
export const dueGroups = [
  'pastDueGroup',
  'todayGroup',
  'weekGroup',
  'laterGroup',
  'undatedGroup',
] as const;
export type DueGroup = (typeof dueGroups)[number];

/** The calendar day `days` after `date`, as exact YYYY-MM-DD text. */
function addDays(date: string, days: number): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

/**
 * The group of a due date beside the browser's own day: past due, today,
 * the next six days, later and undated. Groups keep the server's order of
 * the rows they hold; the day only names them.
 */
export function dueGroup(dueDate: string | null, today: string): DueGroup {
  if (dueDate === null) return 'undatedGroup';
  if (dueDate < today) return 'pastDueGroup';
  if (dueDate === today) return 'todayGroup';
  return dueDate < addDays(today, 7) ? 'weekGroup' : 'laterGroup';
}

/**
 * The colour of a due date beside the browser's own day: past, today or
 * later. It only colours the date the server returned.
 */
export function dueTone(
  dueDate: string | null,
  today: string,
): 'past' | 'today' | 'later' | 'none' {
  if (dueDate === null) return 'none';
  if (dueDate < today) return 'past';
  return dueDate === today ? 'today' : 'later';
}

/** Rows split into ordered groups, each keeping the rows' own order. */
export function groupRows<Row, Key extends string>(
  rows: readonly Row[],
  keyOf: (row: Row) => Key,
  order?: readonly Key[],
): Array<{ key: Key; rows: Row[] }> {
  const groups = new Map<Key, Row[]>();
  for (const key of order ?? []) groups.set(key, []);
  for (const row of rows) {
    const key = keyOf(row);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return [...groups]
    .filter(([, members]) => members.length > 0)
    .map(([key, members]) => ({ key, rows: members }));
}
