import { BadRequestException } from '@nestjs/common';
import { requireUuid } from '../access/access-command-validation.js';

function object(
  value: unknown,
  fields: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('A review object is required.');
  const parsed = Object.fromEntries(Object.entries(value));
  if (Object.keys(parsed).some((key) => !fields.includes(key)))
    throw new BadRequestException('Unknown review field.');
  return parsed;
}
function revision(value: unknown, minimum = 0) {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > 2147483647
  )
    throw new BadRequestException('A valid observed revision is required.');
  return value;
}
function literal(value: unknown, maximum: number) {
  if (
    typeof value !== 'string' ||
    Array.from(value.trim()).length < 1 ||
    Array.from(value.trim()).length > maximum
  )
    throw new BadRequestException(
      `A literal statement of 1–${maximum} characters is required.`,
    );
  return value.trim();
}
type ReviewEvidence =
  | { kind: 'DECLARED_RESULT'; resultId: string }
  | { kind: 'EXTERNAL_REPORTED'; reference: string };
function evidenceInput(value: unknown): ReviewEvidence {
  const input = object(value, ['kind', 'resultId', 'reference']);
  if (input.kind === 'DECLARED_RESULT' && input.reference === undefined)
    return { kind: input.kind, resultId: requireUuid(input.resultId) };
  if (input.kind === 'EXTERNAL_REPORTED' && input.resultId === undefined)
    return { kind: input.kind, reference: literal(input.reference, 1000) };
  throw new BadRequestException(
    'Choose an exact declared result or a reported external reference.',
  );
}
function outcomeInput(value: unknown): 'ACCEPTED_BY_REVIEWER' | 'NEEDS_WORK' {
  if (value !== 'ACCEPTED_BY_REVIEWER' && value !== 'NEEDS_WORK')
    throw new BadRequestException('Choose an explicit review outcome.');
  return value;
}
export function reviewInput(value: unknown) {
  const input = object(value, [
    'expectedReviewRevision',
    'outcome',
    'basis',
    'items',
  ]);
  const outcome = outcomeInput(input.outcome);
  if (
    !Array.isArray(input.items) ||
    input.items.length < 1 ||
    input.items.length > 13
  )
    throw new BadRequestException('Select 1–13 mission activities.');
  const items = input.items.map((value: unknown) => {
    const item = object(value, [
      'taskId',
      'expectedTaskVersion',
      'expectedResultRevision',
      'evidence',
    ]);
    return {
      taskId: requireUuid(item.taskId),
      expectedTaskVersion: revision(item.expectedTaskVersion, 1),
      expectedResultRevision: revision(item.expectedResultRevision),
      evidence: evidenceInput(item.evidence),
    };
  });
  if (new Set(items.map((item) => item.taskId)).size !== items.length)
    throw new BadRequestException('Select each activity once.');
  return {
    expectedReviewRevision: revision(input.expectedReviewRevision),
    outcome,
    basis: literal(input.basis, 2000),
    items,
  };
}
export type ReviewInput = ReturnType<typeof reviewInput>;
export function reviewHistoryQuery(value: unknown) {
  const input = object(value, ['beforeRevision']);
  if (input.beforeRevision === undefined) return undefined;
  if (
    typeof input.beforeRevision !== 'string' ||
    !/^[1-9]\d*$/u.test(input.beforeRevision)
  )
    throw new BadRequestException(
      'A valid review history revision is required.',
    );
  return revision(Number(input.beforeRevision), 1);
}
