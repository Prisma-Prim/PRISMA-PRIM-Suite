import type { ActorContext } from '../access-types';

export interface Attribution {
  workspaceMembershipId: string;
  internalUserId: string;
  displayName: string;
}
export interface Idea {
  id: string;
  companyId: string;
  description: string;
  origin: string;
  revision: number;
  disposition: 'new' | 'deferred' | 'rejected';
  submittedBy: Attribution;
  submittedAt: string;
}
export type Disposition = {
  id: string;
  ideaId: string;
  precedingRevision: number;
  revision: number;
  reason: string;
  recordedBy: Attribution;
  recordedAt: string;
} & (
  | { kind: 'deferred'; reconsiderationDate: string | null }
  | { kind: 'rejected'; reconsiderationDate: null }
);
export interface IdeaPage {
  companyId: string;
  ideas: Idea[];
  total: number;
  nextCursor: string | null;
}
export interface History {
  ideaId: string;
  entries: Disposition[];
  total: number;
  nextCursor: string | null;
}

export function parseIdea(value: unknown, companyId: string): Idea {
  const row = object(value),
    revision = positive(row.revision),
    status = row.disposition;
  if (
    row.companyId !== companyId ||
    (status !== 'new' && status !== 'deferred' && status !== 'rejected') ||
    (revision === 1) !== (status === 'new')
  )
    invalid();
  return {
    id: text(row.id),
    companyId,
    description: text(row.description, 5000),
    origin: text(row.origin, 300),
    revision,
    disposition: status,
    submittedBy: attribution(row.submittedBy),
    submittedAt: instant(row.submittedAt),
  };
}
export function parseIdeaPage(value: unknown, companyId: string): IdeaPage {
  const body = object(value);
  if (
    body.companyId !== companyId ||
    !Array.isArray(body.ideas) ||
    body.ideas.length > 25
  )
    invalid();
  const ideas = body.ideas.map((row) => parseIdea(row, companyId));
  const page = pagination(body, ideas.length);
  if (new Set(ideas.map((row) => row.id)).size !== ideas.length) invalid();
  for (let index = 1; index < ideas.length; index++) {
    const previous = ideas[index - 1],
      current = ideas[index];
    if (
      !previous ||
      !current ||
      previous.submittedAt < current.submittedAt ||
      (previous.submittedAt === current.submittedAt && previous.id < current.id)
    )
      invalid();
  }
  return { companyId, ideas, ...page };
}
export function parseHistory(value: unknown, ideaId: string): History {
  const body = object(value);
  if (
    body.ideaId !== ideaId ||
    !Array.isArray(body.entries) ||
    body.entries.length > 25
  )
    invalid();
  const entries = body.entries.map((row) => parseDisposition(row, ideaId));
  const page = pagination(body, entries.length);
  if (new Set(entries.map((row) => row.id)).size !== entries.length) invalid();
  for (let index = 1; index < entries.length; index++) {
    const previous = entries[index - 1],
      current = entries[index];
    if (!previous || !current || previous.revision !== current.revision + 1)
      invalid();
  }
  return { ideaId, entries, ...page };
}
export function parseDispositionResult(
  value: unknown,
  companyId: string,
): { idea: Idea; entry: Disposition } {
  const body = object(value),
    idea = parseIdea(body.idea, companyId),
    entry = parseDisposition(body.entry, idea.id);
  if (idea.revision !== entry.revision || idea.disposition !== entry.kind)
    invalid();
  return { idea, entry };
}
function parseDisposition(value: unknown, ideaId: string): Disposition {
  const row = object(value),
    precedingRevision = positive(row.precedingRevision),
    revision = positive(row.revision);
  if (row.ideaId !== ideaId || revision !== precedingRevision + 1) invalid();
  const shared = {
    id: text(row.id),
    ideaId,
    precedingRevision,
    revision,
    reason: text(row.reason, 2000),
    recordedBy: attribution(row.recordedBy),
    recordedAt: instant(row.recordedAt),
  };
  if (row.kind === 'rejected' && row.reconsiderationDate === null)
    return { ...shared, kind: 'rejected', reconsiderationDate: null };
  if (
    row.kind === 'deferred' &&
    (row.reconsiderationDate === null || calendarDate(row.reconsiderationDate))
  )
    return {
      ...shared,
      kind: 'deferred',
      reconsiderationDate: row.reconsiderationDate,
    };
  return invalid();
}
export function ideasAuthority(actor: ActorContext): {
  read: boolean;
  record: boolean;
  review: boolean;
} {
  const company = actor.activeCompany;
  const active =
    actor.active === true &&
    nonblank(actor.internalUserId) &&
    nonblank(actor.workspaceId) &&
    nonblank(actor.workspaceMembershipId) &&
    nonblank(company?.id);
  const read =
    active &&
    grant(
      company?.ideasReaderPermissions,
      'idea.read',
      company?.ideasReaderPermissionAssignmentId,
      company?.ideasReaderPermissionSetVersion,
    );
  return {
    read,
    record:
      read &&
      grant(
        company?.ideasRecorderPermissions,
        'idea.record',
        company?.ideasRecorderPermissionAssignmentId,
        company?.ideasRecorderPermissionSetVersion,
      ),
    review:
      read &&
      grant(
        company?.ideasReviewerPermissions,
        'idea.disposition.record',
        company?.ideasReviewerPermissionAssignmentId,
        company?.ideasReviewerPermissionSetVersion,
      ),
  };
}
export function ideasContextKey(actor: ActorContext): string {
  const company = actor.activeCompany;
  return JSON.stringify([
    actor.internalUserId,
    actor.workspaceId,
    actor.workspaceMembershipId,
    actor.active,
    company?.id,
    company?.ideasReaderPermissionAssignmentId,
    company?.ideasReaderPermissionSetVersion,
    company?.ideasReaderPermissions,
    company?.ideasRecorderPermissionAssignmentId,
    company?.ideasRecorderPermissionSetVersion,
    company?.ideasRecorderPermissions,
    company?.ideasReviewerPermissionAssignmentId,
    company?.ideasReviewerPermissionSetVersion,
    company?.ideasReviewerPermissions,
  ]);
}
export function calendarDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
    !value.startsWith('0000-') &&
    Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)) &&
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value
  );
}
function grant(
  permissions: unknown,
  expected: string,
  assignmentId: unknown,
  version: unknown,
): boolean {
  return (
    version === 'v1' &&
    nonblank(assignmentId) &&
    Array.isArray(permissions) &&
    permissions.length === 1 &&
    permissions[0] === expected
  );
}
function pagination(body: Record<string, unknown>, rows: number) {
  if (
    typeof body.total !== 'number' ||
    !Number.isSafeInteger(body.total) ||
    body.total < rows ||
    body.total < 0 ||
    (body.nextCursor !== null && (!nonblank(body.nextCursor) || rows !== 25))
  )
    invalid();
  return { total: body.total, nextCursor: body.nextCursor };
}
function attribution(value: unknown): Attribution {
  const row = object(value);
  return {
    workspaceMembershipId: text(row.workspaceMembershipId),
    internalUserId: text(row.internalUserId),
    displayName: text(row.displayName),
  };
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return Object.fromEntries(Object.entries(value));
}
function nonblank(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function text(value: unknown, max = Number.MAX_SAFE_INTEGER): string {
  if (!nonblank(value) || value.length > max) invalid();
  return value;
}
function positive(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 2147483647
  )
    invalid();
  return value;
}
function instant(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    invalid();
  return value;
}
function invalid(): never {
  throw new Error('Invalid Ideas response.');
}
