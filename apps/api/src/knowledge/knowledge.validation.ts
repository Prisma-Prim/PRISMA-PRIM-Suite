import type { knowledgeSources } from '../database/schema/knowledge.js';
import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { requireUuid } from '../access/access-command-validation.js';

export function object(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw invalid();
  const result = Object.fromEntries(Object.entries(value));
  if (Object.keys(result).some((key) => !keys.includes(key))) throw invalid();
  return result;
}
export function literal(value: unknown, maximum: number): string {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > maximum ||
    !value.trim()
  )
    throw invalid();
  for (const character of value) {
    const point = character.codePointAt(0);
    if (
      point !== undefined &&
      ((point >= 0xd800 && point <= 0xdfff) ||
        point === 0 ||
        (point < 32 && point !== 9 && point !== 10 && point !== 13))
    )
      throw invalid();
  }
  return value;
}
export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
export function hash(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value))
    throw invalid();
  return value;
}
export function revision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw invalid();
  return value;
}
function instant(value: unknown): Date {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(value)
  )
    throw invalid();
  const parsed = new Date(value);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.getUTCFullYear() < 1 ||
    parsed.toISOString() !== value
  )
    throw invalid();
  return parsed;
}
type KnowledgeDraftInput = Pick<
  typeof knowledgeSources.$inferInsert,
  | 'documentId'
  | 'documentVersionId'
  | 'representationId'
  | 'sourceSha256'
  | 'language'
  | 'ownerReference'
  | 'provenance'
  | 'rightsEvidenceReference'
  | 'permittedPurpose'
  | 'effectiveFrom'
  | 'effectiveUntil'
> & { passages: Array<{ locator: string; text: string }> };
export function draftInput(value: unknown): KnowledgeDraftInput {
  const input = object(value, [
    'documentId',
    'documentVersionId',
    'representationId',
    'sourceSha256',
    'language',
    'ownerReference',
    'provenance',
    'rightsEvidenceReference',
    'permittedPurpose',
    'effectiveFrom',
    'effectiveUntil',
    'passages',
  ]);
  const language = input.language;
  if (language !== 'ro' && language !== 'ru' && language !== 'en')
    throw invalid();
  if (input.permittedPurpose !== 'cited-evidence') throw invalid();
  const effectiveFrom = instant(input.effectiveFrom);
  const effectiveUntil = instant(input.effectiveUntil);
  if (effectiveUntil <= effectiveFrom) throw invalid();
  if (
    !Array.isArray(input.passages) ||
    input.passages.length < 1 ||
    input.passages.length > 20
  )
    throw invalid();
  const seen = new Set<string>();
  const passages = input.passages.map((value) => {
    const passage = object(value, ['locator', 'text']);
    const locator = literal(passage.locator, 120);
    if (locator === '.' || locator === '..' || seen.has(locator))
      throw invalid();
    seen.add(locator);
    return { locator, text: literal(passage.text, 16384) };
  });
  if (Buffer.byteLength(JSON.stringify(passages)) > 48000) throw invalid();
  return {
    documentId: requireUuid(input.documentId),
    documentVersionId: requireUuid(input.documentVersionId),
    representationId: requireUuid(input.representationId),
    sourceSha256: hash(input.sourceSha256),
    language,
    ownerReference: literal(input.ownerReference, 200),
    provenance: literal(input.provenance, 1000),
    rightsEvidenceReference: literal(input.rightsEvidenceReference, 1000),
    permittedPurpose: 'cited-evidence',
    effectiveFrom,
    effectiveUntil,
    passages,
  };
}
export function actionInput(value: unknown, action: 'admit' | 'revoke') {
  const input = object(
    value,
    action === 'admit'
      ? ['expectedRevision', 'attestation', 'sourceSha256', 'projectionSha256']
      : ['expectedRevision'],
  );
  if (
    action === 'admit' &&
    input.attestation !== 'exact-version-source-and-use-reviewed/v1'
  )
    throw invalid();
  if (action === 'admit')
    return {
      kind: 'admit' as const,
      expectedRevision: revision(input.expectedRevision),
      sourceSha256: hash(input.sourceSha256),
      projectionSha256: hash(input.projectionSha256),
    };
  return {
    kind: 'revoke' as const,
    expectedRevision: revision(input.expectedRevision),
  };
}
export type KnowledgeMode =
  { kind: 'current' } | { kind: 'historical'; documentVersionId: string };
export function readQuery(value: unknown, kind: 'list' | 'search' | 'passage') {
  const input = object(
    value,
    kind === 'search'
      ? ['mode', 'documentVersionId', 'limit', 'cursor', 'query']
      : kind === 'list'
        ? ['mode', 'documentVersionId', 'limit', 'cursor']
        : ['mode', 'documentVersionId'],
  );
  let mode: KnowledgeMode;
  if (input.mode === undefined || input.mode === 'current') {
    if (input.documentVersionId !== undefined) throw invalid();
    mode = { kind: 'current' };
  } else if (input.mode === 'historical')
    mode = {
      kind: 'historical',
      documentVersionId: requireUuid(input.documentVersionId),
    };
  else throw invalid();
  const limit =
    input.limit === undefined
      ? 20
      : typeof input.limit === 'string' &&
          /^(?:[1-9]|1\d|20)$/u.test(input.limit)
        ? Number(input.limit)
        : NaN;
  if (!Number.isInteger(limit)) throw invalid();
  const cursor =
    input.cursor === undefined ? null : literal(input.cursor, 2048);
  return {
    mode,
    limit,
    cursor,
    query: kind === 'search' ? literal(input.query, 200) : null,
  };
}
export function invalid(): BadRequestException {
  return new BadRequestException('Invalid Knowledge request.');
}
