import { BadRequestException } from '@nestjs/common';
import type { OperationalRiskFacts } from './operational-risk.types.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const FACT_FIELDS = [
  'process',
  'cause',
  'effect',
  'plannedMeasure',
  'existingMeasures',
  'sourceDescription',
  'plannedDate',
] as const;

export function readOperationalRiskFacts(value: unknown): OperationalRiskFacts {
  const body = object(value);
  return {
    process: text(body.process, 300),
    cause: text(body.cause, 2000),
    effect: text(body.effect, 2000),
    plannedMeasure: text(body.plannedMeasure, 2000),
    existingMeasures: optionalText(body.existingMeasures, 2000),
    sourceDescription: optionalText(body.sourceDescription, 300),
    plannedDate: optionalDate(body.plannedDate),
  };
}

export function readOperationalRiskIntake(
  value: unknown,
): OperationalRiskFacts {
  const body = object(value);
  fields(body, FACT_FIELDS);
  return readOperationalRiskFacts(body);
}

export function readOperationalRiskJournal(value: unknown) {
  const body = object(value);
  fields(body, ['expectedRevision', 'kind', 'narrative', 'occurredOn']);
  if (body.kind !== 'observation' && body.kind !== 'reassessment') invalid();
  return {
    expectedRevision: revision(body.expectedRevision),
    kind: body.kind,
    narrative: text(body.narrative, 5000),
    occurredOn: optionalDate(body.occurredOn),
  };
}

export function readOperationalRiskCorrection(value: unknown) {
  const body = object(value);
  fields(body, [...FACT_FIELDS, 'expectedRevision', 'predecessorId', 'reason']);
  return {
    facts: readOperationalRiskFacts(body),
    expectedRevision: revision(body.expectedRevision),
    predecessorId: uuid(body.predecessorId),
    reason: text(body.reason, 2000),
  };
}

export function readOperationalRiskJournalCorrection(value: unknown) {
  const body = object(value);
  const keys = [
    'expectedRevision',
    'predecessorId',
    'narrative',
    'occurredOn',
    'reason',
  ];
  fields(body, keys);
  if (
    keys.some((key) => !Object.hasOwn(body, key)) ||
    body.occurredOn === undefined
  )
    invalid();
  return {
    expectedRevision: revision(body.expectedRevision),
    predecessorId: uuid(body.predecessorId),
    narrative: text(body.narrative, 5000),
    occurredOn: optionalDate(body.occurredOn),
    reason: text(body.reason, 2000),
  };
}

export type OperationalRiskJournalCorrectionInput = ReturnType<
  typeof readOperationalRiskJournalCorrection
>;

export function readOperationalRiskNoQuery(value: unknown): void {
  fields(object(value), []);
}

export function readOperationalRiskPagination(value: unknown) {
  const query = object(value);
  fields(query, ['limit', 'cursor']);
  const limit = query.limit === undefined ? 25 : decimal(query.limit, 50);
  if (
    query.cursor !== undefined &&
    (typeof query.cursor !== 'string' ||
      query.cursor.length === 0 ||
      query.cursor.length > 500)
  )
    invalid();
  return { limit, cursor: query.cursor };
}

export function readOperationalRiskHistoryCursor(
  value: string | undefined,
): number | undefined {
  return value === undefined ? undefined : decimal(value, 2147483647);
}

export function readOperationalRiskListCursor(
  value: string | undefined,
): { createdAt: string; id: string } | undefined {
  if (value === undefined) return undefined;
  try {
    const decoded = Buffer.from(value, 'base64url');
    if (decoded.toString('base64url') !== value) invalid();
    const payload: unknown = JSON.parse(decoded.toString('utf8'));
    const body = object(payload);
    fields(body, ['createdAt', 'id']);
    if (
      typeof body.createdAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(body.createdAt)
    )
      invalid();
    const date = new Date(body.createdAt);
    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString() !== body.createdAt
    )
      invalid();
    return { createdAt: body.createdAt, id: uuid(body.id) };
  } catch {
    return invalid();
  }
}

export function equalOperationalRiskFacts(
  left: OperationalRiskFacts,
  right: OperationalRiskFacts,
): boolean {
  return FACT_FIELDS.every((field) => left[field] === right[field]);
}

export function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return invalid();
  return Object.fromEntries(Object.entries(value));
}

function fields(
  value: Record<string, unknown>,
  allowed: readonly string[],
): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) invalid();
}

export function text(value: unknown, maximum: number): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > maximum
  )
    return invalid();
  return value;
}

function optionalText(value: unknown, maximum: number): string | null {
  return value === null || value === undefined ? null : text(value, maximum);
}

export function optionalDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value))
    return invalid();
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    return invalid();
  return value;
}

export function revision(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 2147483647
  )
    return invalid();
  return value;
}

export function uuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) return invalid();
  return value.toLowerCase();
}

function decimal(value: unknown, maximum: number): number {
  if (typeof value !== 'string' || !/^[1-9]\d*$/u.test(value)) return invalid();
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result > maximum) return invalid();
  return result;
}

function invalid(): never {
  throw new BadRequestException({
    code: 'INVALID_RISK_INPUT',
    message: 'Review the Risk fields or continuation before trying again.',
  });
}
