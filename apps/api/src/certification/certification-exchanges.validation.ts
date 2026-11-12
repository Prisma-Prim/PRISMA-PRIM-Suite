import { BadRequestException } from '@nestjs/common';
import { requireUuid } from '../access/access-command-validation.js';
import {
  DEADLINE_DAYS_LIMIT,
  DEADLINE_KINDS,
  EXCHANGE_CHANNELS,
  EXCHANGE_COUNTERPART_KINDS,
  EXCHANGE_DIRECTIONS,
  EXCHANGE_ITEM_KINDS,
  EXCHANGE_LIMITS,
  type DeadlineDays,
  type ExchangeChannel,
  type ExchangeCounterpartKind,
  type ExchangeDirection,
  type ExchangeItemKind,
} from './certification-exchanges.js';
import { calendarDate, inputObject } from './certification.validation.js';

const MAX_REVISION = 2147483646;

/** The declared facts of one Exchange Record version. */
export interface ExchangeValue {
  direction: ExchangeDirection;
  itemKind: ExchangeItemKind;
  attachmentIds: string[];
  counterpart: { kind: ExchangeCounterpartKind; name: string };
  businessDate: string;
  channel: ExchangeChannel;
  reference: string | null;
  note: string | null;
}

export interface ExchangeInput {
  expectedRevision: number;
  /** Required from the second version, absent from the first. */
  reason: string | null;
  value: ExchangeValue;
}

/**
 * An Exchange Record, first or corrected: at least one exact attached
 * Version, a counterpart named in at most 200 characters, a closed channel
 * and a note whenever the channel is "other".
 */
export function exchangeCommand(value: unknown): ExchangeInput {
  const body = inputObject(value, [
    'expectedRevision',
    'reason',
    'direction',
    'itemKind',
    'attachmentIds',
    'counterpart',
    'businessDate',
    'channel',
    'reference',
    'note',
  ]);
  const counterpart = inputObject(body.counterpart, ['kind', 'name']);
  if (
    !Array.isArray(body.attachmentIds) ||
    body.attachmentIds.length < 1 ||
    body.attachmentIds.length > EXCHANGE_LIMITS.attachments
  )
    return invalid();
  const ids: unknown[] = body.attachmentIds;
  const attachmentIds = ids.map((id) => requireUuid(id));
  if (new Set(attachmentIds).size !== attachmentIds.length) return invalid();
  if (!calendarDate(body.businessDate)) return invalid();
  const parsed: ExchangeValue = {
    direction: oneOf(EXCHANGE_DIRECTIONS, body.direction),
    itemKind: oneOf(EXCHANGE_ITEM_KINDS, body.itemKind),
    attachmentIds,
    counterpart: {
      kind: oneOf(EXCHANGE_COUNTERPART_KINDS, counterpart.kind),
      name: text(counterpart.name, EXCHANGE_LIMITS.counterpartName),
    },
    businessDate: body.businessDate,
    channel: oneOf(EXCHANGE_CHANNELS, body.channel),
    reference: optionalText(body.reference, EXCHANGE_LIMITS.reference),
    note: optionalText(body.note, EXCHANGE_LIMITS.note),
  };
  if (parsed.channel === 'other' && parsed.note === null)
    throw new BadRequestException({
      code: 'CERTIFICATION_EXCHANGE_NOTE_REQUIRED',
      message: 'An exchange through another channel states it in a note.',
    });
  return {
    expectedRevision: revision(body.expectedRevision),
    reason: optionalText(body.reason, EXCHANGE_LIMITS.reason),
    value: parsed,
  };
}

/** The source a manual Re-verification Item names, if any. */
export type ReverificationSourceInput =
  | { kind: 'finding'; findingId: string }
  | { kind: 'discrepancy'; discrepancyId: string }
  | { kind: 'exchange'; sequence: number }
  | { kind: 'attachment'; attachmentId: string };

export interface ReverificationInput {
  expectedRevision: number;
  text: string;
  source: ReverificationSourceInput | null;
}

/** A manual Re-verification Item: what to verify, with an optional source. */
export function reverificationCommand(value: unknown): ReverificationInput {
  const body = inputObject(value, ['expectedRevision', 'text', 'source']);
  return {
    expectedRevision: revision(body.expectedRevision),
    text: text(body.text, 2000),
    source:
      body.source === undefined || body.source === null
        ? null
        : reverificationSource(body.source),
  };
}

function reverificationSource(value: unknown): ReverificationSourceInput {
  const body = inputObject(value, [
    'findingId',
    'discrepancyId',
    'exchangeSequence',
    'attachmentId',
  ]);
  const given = Object.values(body).filter((entry) => entry !== undefined);
  if (given.length !== 1) return invalid();
  if (body.findingId !== undefined)
    return { kind: 'finding', findingId: requireUuid(body.findingId) };
  if (body.discrepancyId !== undefined) {
    const id = body.discrepancyId;
    if (
      typeof id !== 'string' ||
      !/^(R\d{2}:[0-9a-f]{32}|manual:[0-9a-f-]{36})$/u.test(id)
    )
      return invalid();
    if (id.startsWith('manual:')) requireUuid(id.slice('manual:'.length));
    return { kind: 'discrepancy', discrepancyId: id };
  }
  if (body.exchangeSequence !== undefined)
    return { kind: 'exchange', sequence: revision(body.exchangeSequence) };
  return { kind: 'attachment', attachmentId: requireUuid(body.attachmentId) };
}

export function withdrawalCommand(value: unknown): {
  expectedRevision: number;
  reason: string;
} {
  const body = inputObject(value, ['expectedRevision', 'reason']);
  return {
    expectedRevision: revision(body.expectedRevision),
    reason: text(body.reason, 2000),
  };
}

/**
 * A new version of the Company's procedure deadline set: every kind, each
 * a whole number of calendar days from 0 to 365 or `null` (not configured).
 */
export function deadlineSetCommand(value: unknown): {
  expectedVersion: number;
  days: DeadlineDays;
} {
  const body = inputObject(value, ['expectedVersion', 'days']);
  const days = inputObject(body.days, DEADLINE_KINDS);
  const expected = body.expectedVersion;
  if (
    typeof expected !== 'number' ||
    !Number.isSafeInteger(expected) ||
    expected < 0 ||
    expected > MAX_REVISION
  )
    return invalid();
  return {
    expectedVersion: expected,
    days: {
      stage_plan_sent: dayCount(days.stage_plan_sent),
      audit_dossier_transmitted: dayCount(days.audit_dossier_transmitted),
      stage_2_report_released: dayCount(days.stage_2_report_released),
    },
  };
}

function dayCount(value: unknown): number | null {
  if (value === null) return null;
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > DEADLINE_DAYS_LIMIT
  )
    return invalid();
  return value;
}

function oneOf<const T extends readonly string[]>(
  values: T,
  value: unknown,
): T[number] {
  const found = values.find((entry) => entry === value);
  return found === undefined ? invalid() : found;
}

function revision(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > MAX_REVISION
  )
    return invalid();
  return value;
}

function text(value: unknown, limit: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > limit)
    return invalid();
  return value;
}

function optionalText(value: unknown, limit: number): string | null {
  return value === undefined || value === null ? null : text(value, limit);
}

function invalid(): never {
  throw new BadRequestException({
    code: 'INVALID_CERTIFICATION_INPUT',
    message: 'Invalid certification input.',
  });
}
