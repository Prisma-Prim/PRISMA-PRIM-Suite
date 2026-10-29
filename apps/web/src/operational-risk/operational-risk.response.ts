import type {
  OperationalRiskEntry,
  OperationalRiskJournalStatement,
  OperationalRiskFacts,
  OperationalRiskPage,
  OperationalRiskRecord,
  OperationalRiskResult,
  OperationalRiskSummary,
} from './operational-risk.types';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/** The network boundary is unknown, including on exact-command replay. */
export function readRiskRecord({
  value,
  companyId,
  riskId,
}: {
  value: unknown;
  companyId: string;
  riskId?: string;
}): OperationalRiskRecord {
  const body = object(value, [
    'id',
    'companyId',
    'revision',
    'assessment',
    'responsibility',
    'createdAt',
    'originalIntake',
    'currentIntake',
  ]);
  const originalIntake = readRiskEntry(body.originalIntake);
  const currentIntake = readRiskEntry(body.currentIntake);
  const id = uuid(body.id);
  const revision = integer(body.revision);
  const createdAt = instant(body.createdAt);
  if (
    uuid(body.companyId) !== companyId ||
    (riskId !== undefined && id !== riskId) ||
    body.assessment !== 'not-assessed' ||
    body.responsibility !== 'not-specified' ||
    originalIntake.kind !== 'intake-recorded' ||
    (currentIntake.kind !== 'intake-recorded' &&
      currentIntake.kind !== 'intake-corrected') ||
    currentIntake.revision > revision ||
    originalIntake.recordedAt !== createdAt ||
    (currentIntake.kind === 'intake-recorded' &&
      currentIntake.id !== originalIntake.id)
  )
    invalid();
  return {
    id,
    companyId,
    revision,
    createdAt,
    assessment: 'not-assessed',
    responsibility: 'not-specified',
    originalIntake,
    currentIntake,
  };
}

export function readRiskResult({
  value,
  companyId,
  riskId,
  correction,
}: {
  value: unknown;
  companyId: string;
  riskId?: string;
  correction?: {
    entryId: string;
    journalKind: 'observation' | 'reassessment';
    body: string;
  };
}): OperationalRiskResult {
  const body = object(value, ['risk', 'entry']);
  const risk = readRiskRecord({ value: body.risk, companyId, riskId });
  const entry = readRiskEntry(body.entry);
  if (
    entry.revision !== risk.revision ||
    ((entry.kind === 'intake-recorded' || entry.kind === 'intake-corrected') &&
      entry.id !== risk.currentIntake.id)
  )
    invalid();
  if (
    correction !== undefined &&
    (entry.kind !== 'journal-corrected' ||
      entry.originalEntryId !== correction.entryId ||
      entry.journalKind !== correction.journalKind)
  )
    invalid();
  if (correction) {
    const submitted = object(JSON.parse(correction.body), [
      'expectedRevision',
      'predecessorId',
      'narrative',
      'occurredOn',
      'reason',
    ]);
    if (
      entry.kind !== 'journal-corrected' ||
      entry.revision !== integer(submitted.expectedRevision) + 1 ||
      entry.predecessorId !== uuid(submitted.predecessorId) ||
      entry.narrative !== text(submitted.narrative, 5000) ||
      entry.occurredOn !== dateOnly(submitted.occurredOn) ||
      entry.reason !== text(submitted.reason, 2000)
    )
      invalid();
  }
  return { risk, entry };
}

export function readRiskJournalStatement({
  value,
  companyId,
  riskId,
  journalEntryId,
}: {
  value: unknown;
  companyId: string;
  riskId: string;
  journalEntryId: string;
}): OperationalRiskJournalStatement {
  const body = object(value, [
    'riskId',
    'companyId',
    'revision',
    'originalEntry',
    'currentEntry',
  ]);
  const originalEntry = readRiskEntry(body.originalEntry);
  const currentEntry = readRiskEntry(body.currentEntry);
  const revision = integer(body.revision);
  if (
    uuid(body.riskId) !== riskId ||
    uuid(body.companyId) !== companyId ||
    (originalEntry.kind !== 'observation' &&
      originalEntry.kind !== 'reassessment') ||
    originalEntry.id !== journalEntryId ||
    originalEntry.revision > revision ||
    currentEntry.revision > revision ||
    currentEntry.kind === 'intake-recorded' ||
    currentEntry.kind === 'intake-corrected'
  )
    return invalid();
  if (currentEntry.kind === 'journal-corrected') {
    if (
      currentEntry.originalEntryId !== originalEntry.id ||
      currentEntry.journalKind !== originalEntry.kind ||
      currentEntry.revision <= originalEntry.revision
    )
      invalid();
  } else if (JSON.stringify(currentEntry) !== JSON.stringify(originalEntry))
    invalid();
  return { riskId, companyId, revision, originalEntry, currentEntry };
}

export function readRiskPage({
  value,
  companyId,
}: {
  value: unknown;
  companyId: string;
}): OperationalRiskPage<OperationalRiskSummary> {
  const body = page(value);
  return {
    items: body.items.map((item) => {
      const row = object(item, [
        'id',
        'companyId',
        'revision',
        'process',
        'createdAt',
      ]);
      if (uuid(row.companyId) !== companyId) invalid();
      return {
        id: uuid(row.id),
        companyId,
        revision: integer(row.revision),
        process: text(row.process, 300),
        createdAt: instant(row.createdAt),
      };
    }),
    next_cursor: body.next_cursor,
  };
}

export function readRiskHistory(
  value: unknown,
): OperationalRiskPage<OperationalRiskEntry> {
  const body = page(value);
  const items = body.items.map(readRiskEntry);
  if (
    items.some(
      (entry, index) =>
        index > 0 && entry.revision >= (items[index - 1]?.revision ?? 0),
    )
  )
    invalid();
  return { items, next_cursor: body.next_cursor };
}

export function readRiskEntry(value: unknown): OperationalRiskEntry {
  const body = record(value);
  const actor = object(body.actor, ['workspaceMembershipId', 'displayName']);
  const common = {
    id: uuid(body.id),
    revision: integer(body.revision),
    actor: {
      workspaceMembershipId: uuid(actor.workspaceMembershipId),
      displayName: text(actor.displayName, 10000),
    },
    recordedAt: instant(body.recordedAt),
  };
  const commonKeys = ['id', 'revision', 'actor', 'recordedAt', 'kind'];
  if (body.kind === 'intake-recorded') {
    object(body, [...commonKeys, 'facts', 'predecessorId', 'reason']);
    if (
      common.revision !== 1 ||
      body.predecessorId !== null ||
      body.reason !== null
    )
      invalid();
    return {
      ...common,
      kind: body.kind,
      facts: facts(body.facts),
      predecessorId: null,
      reason: null,
    };
  }
  if (body.kind === 'intake-corrected') {
    object(body, [...commonKeys, 'facts', 'predecessorId', 'reason']);
    if (common.revision <= 1) invalid();
    return {
      ...common,
      kind: body.kind,
      facts: facts(body.facts),
      predecessorId: uuid(body.predecessorId),
      reason: text(body.reason, 2000),
    };
  }
  if (body.kind === 'journal-corrected') {
    object(body, [
      ...commonKeys,
      'originalEntryId',
      'journalKind',
      'predecessorId',
      'narrative',
      'occurredOn',
      'reason',
    ]);
    if (
      common.revision <= 2 ||
      (body.journalKind !== 'observation' &&
        body.journalKind !== 'reassessment')
    )
      return invalid();
    const originalEntryId = uuid(body.originalEntryId);
    const predecessorId = uuid(body.predecessorId);
    if (common.id === originalEntryId || common.id === predecessorId) invalid();
    return {
      ...common,
      kind: body.kind,
      originalEntryId,
      journalKind: body.journalKind,
      predecessorId,
      narrative: text(body.narrative, 5000),
      occurredOn: dateOnly(body.occurredOn),
      reason: text(body.reason, 2000),
    };
  }
  if (body.kind !== 'observation' && body.kind !== 'reassessment')
    return invalid();
  object(body, [...commonKeys, 'narrative', 'occurredOn']);
  if (common.revision <= 1) invalid();
  return {
    ...common,
    kind: body.kind,
    narrative: text(body.narrative, 5000),
    occurredOn: dateOnly(body.occurredOn),
  };
}

function facts(value: unknown): OperationalRiskFacts {
  const body = object(value, [
    'process',
    'cause',
    'effect',
    'plannedMeasure',
    'existingMeasures',
    'sourceDescription',
    'plannedDate',
  ]);
  return {
    process: text(body.process, 300),
    cause: text(body.cause, 2000),
    effect: text(body.effect, 2000),
    plannedMeasure: text(body.plannedMeasure, 2000),
    existingMeasures: nullableText(body.existingMeasures, 2000),
    sourceDescription: nullableText(body.sourceDescription, 300),
    plannedDate: dateOnly(body.plannedDate),
  };
}

function page(value: unknown): {
  items: unknown[];
  next_cursor: string | null;
} {
  const body = object(value, ['items', 'next_cursor']);
  if (
    !Array.isArray(body.items) ||
    body.items.length > 50 ||
    (body.next_cursor !== null &&
      (typeof body.next_cursor !== 'string' ||
        body.next_cursor.length === 0 ||
        body.next_cursor.length > 500))
  )
    invalid();
  return { items: body.items, next_cursor: body.next_cursor };
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return invalid();
  return Object.fromEntries(Object.entries(value));
}
function object(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  const result = record(value);
  if (
    Object.keys(result).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(result, key))
  )
    invalid();
  return result;
}
function text(value: unknown, maximum: number): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > maximum
  )
    return invalid();
  return value;
}
function nullableText(value: unknown, maximum: number): string | null {
  return value === null ? null : text(value, maximum);
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !uuidPattern.test(value)) return invalid();
  return value.toLowerCase();
}
function integer(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 2147483647
  )
    return invalid();
  return value;
}
function instant(value: unknown): string {
  if (typeof value !== 'string') return invalid();
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value)
    return invalid();
  return value;
}
function dateOnly(value: unknown): string | null {
  if (value === null) return null;
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
function invalid(): never {
  throw new Error('Invalid operational Risk response.');
}
