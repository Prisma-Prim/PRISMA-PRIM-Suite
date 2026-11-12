import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  EXCHANGE_LIMIT,
  exchangeRecords,
  type ExchangeRecordVersion,
} from './certification-exchanges.js';
import { inputObject } from './certification.validation.js';

/** A cursor is a position, never authority; every page rechecks Case access. */
export function exchangePosition(
  query: unknown,
): { caseId: string; revision: number; beforeSequence: number } | null {
  const input = inputObject(query, ['cursor']);
  if (input.cursor === undefined) return null;
  if (typeof input.cursor !== 'string') return invalid();
  const match = /^([a-f0-9-]{36}):([1-9]\d{0,9}):([1-9]\d{0,9})$/u.exec(
    input.cursor,
  );
  if (!match) return invalid();
  const [, caseId, revisionText, sequenceText] = match;
  const revision = Number(revisionText),
    beforeSequence = Number(sequenceText);
  if (!caseId || revision > 2147483646 || beforeSequence > 2147483646)
    return invalid();
  return { caseId, revision, beforeSequence };
}

export function exchangePage(input: {
  caseId: string;
  revision: number;
  versions: readonly ExchangeRecordVersion[];
  position: ReturnType<typeof exchangePosition>;
}) {
  if (input.position && input.position.caseId !== input.caseId)
    return invalid();
  if (input.position && input.position.revision !== input.revision)
    throw new ConflictException({
      code: 'CERTIFICATION_STALE',
      message:
        'The Certification Case changed. Reload it before reading further.',
    });
  const all = exchangeRecords(input.versions);
  const remaining = all
    .filter(
      (entry) =>
        input.position === null ||
        entry.sequence < input.position.beforeSequence,
    )
    .sort((left, right) => right.sequence - left.sequence);
  const selected = remaining.slice(0, EXCHANGE_LIMIT);
  const last = selected.at(-1);
  const nextCursor =
    remaining.length > EXCHANGE_LIMIT && last
      ? `${input.caseId}:${input.revision}:${last.sequence}`
      : null;
  return {
    records: selected.sort(
      (left, right) =>
        left.current.businessDate.localeCompare(right.current.businessDate) ||
        left.sequence - right.sequence,
    ),
    total: all.length,
    nextCursor,
  };
}

function invalid(): never {
  throw new BadRequestException({
    code: 'INVALID_CERTIFICATION_INPUT',
    message: 'Invalid exchange continuation.',
  });
}
