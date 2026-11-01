import { OPPORTUNITY_OUTCOME_STATUSES } from '../commercial-intake/opportunity-outcome';

type Guard<T> = (value: unknown) => value is T;
type Parsed<G> = G extends Guard<infer T> ? T : never;
type ShapeValue<S> = { [K in keyof S]: Parsed<S[K]> };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function closed<const S extends Record<string, Guard<unknown>>>(
  shape: S,
): Guard<ShapeValue<S>> {
  return (value): value is ShapeValue<S> =>
    record(value) &&
    Object.keys(value).every((key) => Object.hasOwn(shape, key)) &&
    Object.entries(shape).every(([key, guard]) => guard(value[key]));
}
function literal<const T extends string | number>(expected: T): Guard<T> {
  return (value): value is T => value === expected;
}
function nullable<T>(guard: Guard<T>): Guard<T | null> {
  return (value): value is T | null => value === null || guard(value);
}
function array<T>(guard: Guard<T>): Guard<T[]> {
  return (value): value is T[] => {
    if (!Array.isArray(value)) return false;
    const entries: unknown[] = value;
    return entries.length <= 25 && entries.every(guard);
  };
}
const positive: Guard<number> = (value): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const nonnegative: Guard<number> = (value): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const text: Guard<string> = (value): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  !value.includes('\0') &&
  !/[\uD800-\uDFFF]/u.test(value);
const opaque: Guard<string> = (value): value is string =>
  text(value) && value.trim().length > 0;
const instant: Guard<string> = (value): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) &&
  isCalendarDate(value.slice(0, 10)) &&
  !Number.isNaN(Date.parse(value)) &&
  new Date(value).toISOString() === value;
const cursor = nullable(
  (value: unknown): value is string => opaque(value) && value.length <= 2048,
);
const format = literal('opportunity-follow-up.v1');

/** A calendar value stays literal; validation never constructs an instant. */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value))
    return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const maximum = days[month - 1];
  return maximum !== undefined && day <= maximum;
}
export function isFollowUpReason(value: unknown): value is string {
  return text(value) && value.length <= 500 && value.trim().length > 0;
}
const actorLabel = closed({
  workspaceMembershipId: opaque,
  displayLabel: text,
});
const recordedFact = closed({
  state: literal('RECORDED'),
  revision: positive,
  followUpOn: nullable(isCalendarDate),
  confirmedEpoch: opaque,
  recordedBy: actorLabel,
  recordedAt: instant,
});
const unrecorded = closed({
  state: literal('UNRECORDED'),
  revision: literal(0),
});
const head: Guard<Parsed<typeof recordedFact> | Parsed<typeof unrecorded>> = (
  value,
): value is Parsed<typeof recordedFact> | Parsed<typeof unrecorded> =>
  recordedFact(value) || unrecorded(value);
export type RecordedFollowUp = Parsed<typeof recordedFact>;
export type FollowUpHead = Parsed<typeof head>;

const historyEntryShape = closed({
  format,
  opportunityId: opaque,
  revision: positive,
  before: head,
  after: recordedFact,
  reason: nullable(isFollowUpReason),
  commandId: opaque,
  actor: actorLabel,
  occurredAt: instant,
});
const historyEntry: Guard<Parsed<typeof historyEntryShape>> = (
  value,
): value is Parsed<typeof historyEntryShape> =>
  historyEntryShape(value) &&
  value.revision === value.after.revision &&
  value.before.revision === value.revision - 1 &&
  value.actor.workspaceMembershipId ===
    value.after.recordedBy.workspaceMembershipId &&
  value.actor.displayLabel === value.after.recordedBy.displayLabel &&
  value.occurredAt === value.after.recordedAt &&
  (value.revision === 1 || value.reason !== null) &&
  (value.before.state === 'UNRECORDED' ||
    value.before.followUpOn !== value.after.followUpOn ||
    value.before.confirmedEpoch !== value.after.confirmedEpoch);
const historyShape = closed({
  format,
  opportunityId: opaque,
  headRevision: nonnegative,
  entries: array(historyEntry),
  nextCursor: cursor,
});
export type FollowUpHistory = Parsed<typeof historyShape>;
export type FollowUpHistoryEntry = FollowUpHistory['entries'][number];

export function sameFollowUpFact(a: FollowUpHead, b: FollowUpHead): boolean {
  if (a.state === 'UNRECORDED' || b.state === 'UNRECORDED')
    return a.state === b.state;
  return (
    a.revision === b.revision &&
    a.followUpOn === b.followUpOn &&
    a.confirmedEpoch === b.confirmedEpoch &&
    a.recordedBy.workspaceMembershipId === b.recordedBy.workspaceMembershipId &&
    a.recordedBy.displayLabel === b.recordedBy.displayLabel &&
    a.recordedAt === b.recordedAt
  );
}
export function readFollowUpHistory(
  value: unknown,
): FollowUpHistory | undefined {
  if (!historyShape(value)) return undefined;
  if (value.headRevision === 0)
    return value.entries.length === 0 && value.nextCursor === null
      ? value
      : undefined;
  if (value.entries.length === 0) return undefined;
  const commands = new Set<string>();
  for (let index = 0; index < value.entries.length; index += 1) {
    const entry = value.entries[index];
    const newer = value.entries[index - 1];
    if (
      !entry ||
      entry.opportunityId !== value.opportunityId ||
      entry.revision > value.headRevision ||
      commands.has(entry.commandId) ||
      (newer &&
        (!sameFollowUpFact(newer.before, entry.after) ||
          newer.revision !== entry.revision + 1))
    )
      return undefined;
    commands.add(entry.commandId);
  }
  const last = value.entries.at(-1);
  if (!last || (last.revision === 1) !== (value.nextCursor === null))
    return undefined;
  return value;
}

const status: Guard<(typeof OPPORTUNITY_OUTCOME_STATUSES)[number]> = (
  value,
): value is (typeof OPPORTUNITY_OUTCOME_STATUSES)[number] =>
  OPPORTUNITY_OUTCOME_STATUSES.some((candidate) => candidate === value);
const currentShape = closed({
  format,
  opportunityId: opaque,
  requestId: opaque,
  status,
  opportunityVersion: positive,
  outcomeEpoch: opaque,
  head,
  history: (value: unknown): value is FollowUpHistory =>
    readFollowUpHistory(value) !== undefined,
});
export type FollowUpCurrent = Parsed<typeof currentShape>;
export function readFollowUpCurrent(
  value: unknown,
): FollowUpCurrent | undefined {
  if (
    !currentShape(value) ||
    value.history.opportunityId !== value.opportunityId ||
    value.history.headRevision !== value.head.revision
  )
    return undefined;
  const first = value.history.entries[0];
  return value.head.state === 'UNRECORDED' ||
    (first && sameFollowUpFact(value.head, first.after))
    ? value
    : undefined;
}

const receiptShape = closed({
  format,
  opportunityId: opaque,
  outcome: (value: unknown): value is 'updated' | 'unchanged' =>
    value === 'updated' || value === 'unchanged',
  fact: recordedFact,
});
export type FollowUpReceipt = Parsed<typeof receiptShape>;
export function readFollowUpReceipt(
  value: unknown,
): FollowUpReceipt | undefined {
  return receiptShape(value) ? value : undefined;
}
export type FollowUpCommand = {
  expectedRevision: number;
  observedOpportunityVersion: number;
  followUpOn: string | null;
  reason: string | null;
};
export function receiptMatches(
  receipt: FollowUpReceipt,
  current: FollowUpCurrent,
  command: FollowUpCommand,
): boolean {
  return (
    receipt.opportunityId === current.opportunityId &&
    receipt.fact.followUpOn === command.followUpOn &&
    receipt.fact.confirmedEpoch === current.outcomeEpoch &&
    (receipt.outcome === 'updated'
      ? receipt.fact.revision === command.expectedRevision + 1
      : current.head.state === 'RECORDED' &&
        sameFollowUpFact(receipt.fact, current.head))
  );
}
const discoveryRowShape = closed({
  opportunityId: opaque,
  requestId: opaque,
  title: text,
  followUpOn: isCalendarDate,
  recordedBy: actorLabel,
  recordedAt: instant,
  clientDisplayName: (value: unknown): value is string | undefined =>
    value === undefined || text(value),
  clientDossierId: (value: unknown): value is string | undefined =>
    value === undefined || opaque(value),
});
const discoveryShape = closed({
  format,
  through: isCalendarDate,
  items: array(discoveryRowShape),
  nextCursor: cursor,
});
export type FollowUpDiscoveryPage = Parsed<typeof discoveryShape>;
export type FollowUpDiscoveryRow = FollowUpDiscoveryPage['items'][number];
export function followsDiscoveryRow(
  previous: FollowUpDiscoveryRow,
  next: FollowUpDiscoveryRow,
): boolean {
  return (
    next.followUpOn > previous.followUpOn ||
    (next.followUpOn === previous.followUpOn &&
      next.opportunityId > previous.opportunityId)
  );
}
export function readFollowUpDiscovery(
  value: unknown,
): FollowUpDiscoveryPage | undefined {
  if (
    !discoveryShape(value) ||
    (value.items.length === 0 && value.nextCursor !== null)
  )
    return undefined;
  const ids = new Set<string>();
  for (let index = 0; index < value.items.length; index += 1) {
    const row = value.items[index];
    const previous = value.items[index - 1];
    if (
      !row ||
      row.followUpOn > value.through ||
      ids.has(row.opportunityId) ||
      (previous && !followsDiscoveryRow(previous, row))
    )
      return undefined;
    ids.add(row.opportunityId);
  }
  return value;
}
