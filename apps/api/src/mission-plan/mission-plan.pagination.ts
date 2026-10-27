import { BadRequestException } from '@nestjs/common';
const invalid = (): never => {
  throw new BadRequestException('Invalid mission-plan page.');
};
function object(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return invalid();
  return Object.fromEntries(Object.entries(value));
}
function uuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
      value,
    )
  );
}
type Scope = { workspaceId: string; companyId: string };
export function readPlanCursor(query: unknown, scope: Scope) {
  const q = object(query);
  if (Object.keys(q).some((k) => k !== 'cursor')) invalid();
  if (q.cursor === undefined) return undefined;
  if (
    typeof q.cursor !== 'string' ||
    q.cursor.length > 2048 ||
    !/^[A-Za-z0-9_-]+$/u.test(q.cursor)
  )
    return invalid();
  let raw: unknown;
  try {
    const bytes = Buffer.from(q.cursor, 'base64url');
    if (bytes.toString('base64url') !== q.cursor) invalid();
    raw = JSON.parse(bytes.toString('utf8'));
  } catch {
    return invalid();
  }
  const c = object(raw);
  if (
    Object.keys(c).length !== 4 ||
    c.workspaceId !== scope.workspaceId ||
    c.companyId !== scope.companyId ||
    !uuid(c.planId) ||
    typeof c.createdAt !== 'string' ||
    c.createdAt.startsWith('0000-') ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u.test(c.createdAt)
  )
    return invalid();
  const date = new Date(c.createdAt);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 23) !== c.createdAt.slice(0, 23)
  )
    invalid();
  return { planId: c.planId, createdAt: c.createdAt };
}
export function planCursor(c: Scope & { planId: string; createdAt: string }) {
  return Buffer.from(
    JSON.stringify({
      workspaceId: c.workspaceId,
      companyId: c.companyId,
      planId: c.planId,
      createdAt: c.createdAt,
    }),
  ).toString('base64url');
}
export function historyBoundary(query: unknown) {
  const q = object(query);
  if (Object.keys(q).some((k) => k !== 'beforeVersion')) invalid();
  if (q.beforeVersion === undefined) return undefined;
  if (
    typeof q.beforeVersion !== 'string' ||
    !/^[1-9]\d{0,9}$/u.test(q.beforeVersion) ||
    Number(q.beforeVersion) > 2147483647
  )
    return invalid();
  return Number(q.beforeVersion);
}
