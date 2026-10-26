import { BadRequestException } from '@nestjs/common';

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
type Scope = { workspaceId: string; companyId: string };
type Boundary = { createdAt: string; versionId: string };
function invalid(): never {
  throw new BadRequestException('Invalid decision queue cursor.');
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return Object.fromEntries(Object.entries(value));
}
export function readDecisionQueueCursor(
  query: unknown,
  scope: Scope,
): Boundary | undefined {
  const body = object(query);
  if (Object.keys(body).some((key) => key !== 'cursor')) invalid();
  if (body.cursor === undefined) return undefined;
  if (
    typeof body.cursor !== 'string' ||
    body.cursor.length > 2048 ||
    !/^[A-Za-z0-9_-]+$/u.test(body.cursor)
  )
    invalid();
  let value: unknown;
  try {
    const bytes = Buffer.from(body.cursor, 'base64url');
    if (bytes.toString('base64url') !== body.cursor) invalid();
    value = JSON.parse(bytes.toString('utf8'));
  } catch {
    invalid();
  }
  const cursor = object(value);
  if (
    Object.keys(cursor).length !== 4 ||
    cursor.workspaceId !== scope.workspaceId ||
    cursor.companyId !== scope.companyId ||
    typeof cursor.versionId !== 'string' ||
    !uuid.test(cursor.versionId) ||
    typeof cursor.createdAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u.test(cursor.createdAt)
  )
    invalid();
  const date = new Date(cursor.createdAt);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 23) !== cursor.createdAt.slice(0, 23)
  )
    invalid();
  return { createdAt: cursor.createdAt, versionId: cursor.versionId };
}
export function decisionQueueCursor(scope: Scope, boundary: Boundary): string {
  return Buffer.from(JSON.stringify({ ...scope, ...boundary })).toString(
    'base64url',
  );
}
