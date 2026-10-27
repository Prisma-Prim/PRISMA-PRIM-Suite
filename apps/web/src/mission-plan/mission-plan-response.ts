import { uuid } from './mission-plan-authority';
export type Scope = { workspaceId: string; companyId: string };
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid mission-plan response.');
  return Object.fromEntries(Object.entries(value));
}
export function string(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid text.');
  return value;
}
function id(value: unknown) {
  if (!uuid(value)) throw new Error('Invalid identity.');
  return value.toLowerCase();
}
function integer(value: unknown, max = 2147483647) {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > max
  )
    throw new Error('Invalid number.');
  return value;
}
function title(value: unknown) {
  const s = string(value);
  if (!s.trim() || s !== s.trim() || s.length > 200)
    throw new Error('Invalid title.');
  return s;
}
function paragraph(value: unknown) {
  const s = string(value);
  if (!s.trim() || Array.from(s).length > 2000)
    throw new Error('Invalid content.');
  return s;
}
function array(value: unknown) {
  if (!Array.isArray(value)) throw new Error('Invalid rows.');
  const rows: unknown[] = value;
  return rows;
}
export function metadata(value: unknown, scope: Scope) {
  const v = object(value),
    actor = object(v.actor),
    publishedAt = string(v.publishedAt);
  if (
    v.workspaceId !== scope.workspaceId ||
    v.companyId !== scope.companyId ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(publishedAt) ||
    new Date(publishedAt).toISOString() !== publishedAt
  )
    throw new Error('Unexpected source scope or instant.');
  return {
    id: id(v.id),
    planId: id(v.planId),
    ...scope,
    versionNumber: integer(v.versionNumber),
    title: title(v.title),
    activityCount: integer(v.activityCount, 50),
    publishedAt,
    actor: {
      membershipId: id(actor.membershipId),
      displayName: string(actor.displayName),
    },
  };
}
export function readVersion(value: unknown, scope: Scope) {
  const row = object(object(value).version),
    meta = metadata(row, scope);
  const activities = array(row.activities).map((value) => {
    const a = object(value);
    return {
      key: id(a.key),
      title: title(a.title),
      activity: paragraph(a.activity),
      intendedResult: paragraph(a.intendedResult),
    };
  });
  if (
    activities.length !== meta.activityCount ||
    new Set(activities.map((a) => a.key)).size !== activities.length
  )
    throw new Error('Incomplete activities.');
  return { ...meta, activities };
}
export type PlanVersion = ReturnType<typeof readVersion>;
export type PlanContent = Pick<PlanVersion, 'title' | 'activities'>;
export function catalogue(value: unknown, scope: Scope) {
  const row = object(value),
    items = array(row.items).map((value) => {
      const r = object(value),
        head = metadata(r.head, scope),
        createdAt = string(r.createdAt),
        planId = id(r.planId);
      if (
        r.workspaceId !== scope.workspaceId ||
        r.companyId !== scope.companyId ||
        head.planId !== planId ||
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(createdAt) ||
        createdAt.slice(0, 4) === '0000' ||
        new Date(createdAt).toISOString() !== createdAt.slice(0, 23) + 'Z'
      )
        throw new Error('Invalid catalogue item.');
      return { planId, createdAt, head };
    });
  if (
    items.length > 25 ||
    new Set(items.map((i) => i.planId)).size !== items.length ||
    items.some(
      (a, n) =>
        n > 0 &&
        `${a.createdAt}:${a.planId}` <=
          `${items[n - 1]?.createdAt}:${items[n - 1]?.planId}`,
    )
  )
    throw new Error('Invalid catalogue page.');
  return { items, next: cursor(row.nextCursor, items.length) };
}
function cursor(value: unknown, count: number) {
  if (value === undefined) return null;
  const s = string(value);
  if (count !== 25 || !s || s.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(s))
    throw new Error('Invalid next boundary.');
  return s;
}
export function history(
  value: unknown,
  scope: Scope,
  planId: string,
  before?: string,
) {
  const row = object(value),
    head = integer(row.headVersionNumber),
    items = array(row.items).map((v) => metadata(v, scope));
  if (
    items.length > 25 ||
    items.some(
      (v, n) =>
        v.planId !== planId ||
        v.versionNumber > head ||
        (before !== undefined && v.versionNumber >= Number(before)) ||
        (n > 0 && v.versionNumber !== (items[n - 1]?.versionNumber ?? 0) - 1),
    )
  )
    throw new Error('Invalid Version page.');
  const next =
    row.nextBeforeVersion === undefined ? null : string(row.nextBeforeVersion);
  if (
    next !== null &&
    (items.length !== 25 || next !== String(items.at(-1)?.versionNumber))
  )
    throw new Error('Invalid history boundary.');
  const expectedFirst = Math.min(
    head,
    before === undefined ? head : Number(before) - 1,
  );
  if (
    (expectedFirst > 0 && items[0]?.versionNumber !== expectedFirst) ||
    (expectedFirst === 0 && items.length !== 0) ||
    (next === null && items.length > 0 && items.at(-1)?.versionNumber !== 1) ||
    (next !== null && items.at(-1)?.versionNumber === 1)
  )
    throw new Error('Incomplete Version history.');
  return { items, head, next };
}
export function copiedPlan(value: unknown, scope: Scope, projectId: string) {
  const raw = object(value).plan;
  if (raw === null) return null;
  const row = object(raw),
    version = readVersion({ version: row.version }, scope);
  const tasks = array(row.tasks).map((value, position) => {
    const t = object(value);
    if (
      t.position !== position ||
      t.activityKey !== version.activities[position]?.key
    )
      throw new Error('Invalid Task mapping.');
    return { activityKey: id(t.activityKey), position, taskId: id(t.taskId) };
  });
  if (
    row.projectId !== projectId ||
    tasks.length !== version.activityCount ||
    new Set(tasks.map((t) => t.taskId)).size !== tasks.length
  )
    throw new Error('Incomplete copy.');
  return { version, tasks };
}
