import { InternalServerErrorException } from '@nestjs/common';
import type {
  IdeaAttribution,
  IdeaDisposition,
  IdeaDispositionResult,
  IdeaRecord,
} from './ideas.types.js';
import { calendarDate } from './ideas.validation.js';
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export function ideaRecord(value: unknown): IdeaRecord {
  const body = object(value);
  const revision = positive(body.revision);
  const disposition = body.disposition;
  if (
    disposition !== 'new' &&
    disposition !== 'deferred' &&
    disposition !== 'rejected'
  )
    corrupt();
  if ((revision === 1) !== (disposition === 'new')) corrupt();
  return {
    id: id(body.id),
    companyId: id(body.companyId),
    description: text(body.description, 5000),
    origin: text(body.origin, 300),
    revision,
    disposition,
    submittedBy: attribution(body.submittedBy),
    submittedAt: instant(body.submittedAt),
  };
}
export function ideaDisposition(value: unknown): IdeaDisposition {
  const body = object(value);
  const precedingRevision = positive(body.precedingRevision),
    revision = positive(body.revision);
  if (revision !== precedingRevision + 1) corrupt();
  const common = {
    id: id(body.id),
    ideaId: id(body.ideaId),
    precedingRevision,
    revision,
    reason: text(body.reason, 2000),
    recordedBy: attribution(body.recordedBy),
    recordedAt: instant(body.recordedAt),
  };
  if (body.kind === 'rejected' && body.reconsiderationDate === null)
    return { ...common, kind: 'rejected', reconsiderationDate: null };
  if (
    body.kind === 'deferred' &&
    (body.reconsiderationDate === null ||
      calendarDate(body.reconsiderationDate))
  )
    return {
      ...common,
      kind: 'deferred',
      reconsiderationDate: body.reconsiderationDate,
    };
  return corrupt();
}
export function dispositionResult(value: unknown): IdeaDispositionResult {
  const body = object(value),
    idea = ideaRecord(body.idea),
    entry = ideaDisposition(body.entry);
  if (
    idea.id !== entry.ideaId ||
    idea.revision !== entry.revision ||
    idea.disposition !== entry.kind
  )
    corrupt();
  return { idea, entry };
}
function attribution(value: unknown): IdeaAttribution {
  const body = object(value);
  return {
    workspaceMembershipId: id(body.workspaceMembershipId),
    internalUserId: id(body.internalUserId),
    displayName: text(body.displayName),
  };
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) corrupt();
  return Object.fromEntries(Object.entries(value));
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) corrupt();
  return value;
}
function text(value: unknown, max = Number.MAX_SAFE_INTEGER): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    corrupt();
  return value;
}
function positive(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 2147483647
  )
    corrupt();
  return value;
}
function instant(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    corrupt();
  return value;
}
function corrupt(): never {
  throw new InternalServerErrorException('Idea response is unavailable.');
}
