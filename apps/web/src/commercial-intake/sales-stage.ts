import { isOpportunityVersion } from './opportunity-outcome';

/**
 * The browser mirror of the Commercial Workflow PRD section 24 Sales Stages.
 * The API stays the authority; these proofs only decide what this boundary
 * accepts. A stage label is tenant terminology and is shown as entered.
 */
export const SALES_STAGE_LABEL_MAXIMUM_LENGTH = 80;
export const SALES_STAGE_LIMIT = 30;
/** The section 24.5 page bound. */
export const STAGE_HISTORY_PAGE_SIZE = 50;
const MAXIMUM_REVISION = 2_147_483_647;

export type SalesStage = {
  id: string;
  label: string;
  position: number;
  state: 'ACTIVE';
};

export type SalesStageList = { revision: number; stages: SalesStage[] };

/** The Opportunity's current stage, or null without one. */
export type OpportunitySalesStage = {
  id: string;
  label: string;
  state: 'ACTIVE';
};

/** A stage as one history entry captured it at the change. */
export type RecordedSalesStage = { salesStageId: string; label: string };

export type StageHistoryEntry = {
  previousStage: RecordedSalesStage | null;
  newStage: RecordedSalesStage | null;
  version: number;
  actor: { workspaceMembershipId: string; displayLabel: string };
  changedAt: string;
};

export type StageHistoryPage = {
  entries: StageHistoryEntry[];
  nextCursor?: string;
};

/**
 * The Sales Stage assignment is either closed, loading the stage list, its
 * load failed, choosing a stage or none, in flight, waiting for an explicit
 * retry after an uncertain outcome, refused because the chosen stage is no
 * longer assignable until the list reloads, or blocked until the Request
 * reloads after a conflict. `selection` is a stage identifier, or `none` to
 * clear the stage.
 */
export type StageEdit =
  | { kind: 'idle' | 'loading' | 'load-error' | 'unavailable' | 'conflict' }
  | {
      kind: 'choosing' | 'saving' | 'uncertain';
      stages: SalesStage[];
      selection: string;
    };

export const NO_STAGE_SELECTION = 'none';

/**
 * The section 24.1 label rule: 1–80 characters, not only whitespace. Characters
 * are Unicode code points, as PostgreSQL `length()` counts them, so an astral
 * character such as an emoji counts once, not as two UTF-16 units.
 */
export function isValidStageLabel(value: string): boolean {
  return (
    value.trim().length > 0 &&
    [...value].length <= SALES_STAGE_LABEL_MAXIMUM_LENGTH
  );
}

/**
 * Proves the stage list read: a configuration revision and at most 30 stages
 * at positions 1 to n in order, each with its own identifier and a valid
 * label. An empty list is valid at any revision.
 */
export function isSalesStageList(value: unknown): value is SalesStageList {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 2 ||
    !isRevision(value.revision) ||
    !Array.isArray(value.stages) ||
    value.stages.length > SALES_STAGE_LIMIT
  )
    return false;
  const stages: unknown[] = value.stages;
  const ids = new Set<string>();
  return stages.every((stage, index) => {
    if (!isSalesStage(stage) || stage.position !== index + 1) return false;
    if (ids.has(stage.id)) return false;
    ids.add(stage.id);
    return true;
  });
}

function isSalesStage(value: unknown): value is SalesStage {
  return (
    isRecord(value) &&
    Object.keys(value).length === 4 &&
    isIdentifier(value.id) &&
    isStageLabel(value.label) &&
    typeof value.position === 'number' &&
    Number.isSafeInteger(value.position) &&
    value.state === 'ACTIVE'
  );
}

/** The current stage of a Request detail or list row, or null. */
export function isOpportunitySalesStage(
  value: unknown,
): value is OpportunitySalesStage | null {
  return (
    value === null ||
    (isRecord(value) &&
      Object.keys(value).length === 3 &&
      isIdentifier(value.id) &&
      isStageLabel(value.label) &&
      value.state === 'ACTIVE')
  );
}

/**
 * Proves one stage history page: at most 50 entries newest first with
 * strictly descending versions, each a change between two different stages,
 * each older entry ending in the stage the next newer entry started from.
 */
export function isStageHistoryPage(
  value: unknown,
  isTimestamp: (value: unknown) => value is string,
): value is StageHistoryPage {
  if (
    !isRecord(value) ||
    !Array.isArray(value.entries) ||
    value.entries.length > STAGE_HISTORY_PAGE_SIZE ||
    !(
      value.nextCursor === undefined ||
      (typeof value.nextCursor === 'string' && value.nextCursor.length > 0)
    )
  )
    return false;
  const entries: unknown[] = value.entries;
  // A cursor continues from this page's oldest entry, so an empty page has
  // none; a page without a cursor is complete, so it starts without a stage.
  if (entries.length === 0) return value.nextCursor === undefined;
  const oldest = entries.at(-1);
  return (
    entries.every(
      (entry, index) =>
        isStageHistoryEntry(entry, isTimestamp) &&
        (index === 0 || isOlderStageEntry(entry, entries[index - 1])),
    ) &&
    (value.nextCursor !== undefined ||
      (isRecord(oldest) && oldest.previousStage === null))
  );
}

/**
 * The stage read with a Request agrees with its newest history entry, which
 * is not newer than the Opportunity; without history no stage was assigned.
 */
export function isConsistentStageSnapshot(snapshot: {
  salesStage: OpportunitySalesStage | null;
  version: number;
  stageHistory: StageHistoryPage;
}): boolean {
  const [newest] = snapshot.stageHistory.entries;
  if (!newest) return snapshot.salesStage === null;
  return (
    newest.version <= snapshot.version &&
    (newest.newStage?.salesStageId ?? null) ===
      (snapshot.salesStage?.id ?? null)
  );
}

/** Whether an older page continues the chronology already shown. */
export function continuesStageHistory(
  shown: readonly StageHistoryEntry[],
  older: readonly StageHistoryEntry[],
): boolean {
  const tail = shown.at(-1);
  const head = older[0];
  if (!tail) return true;
  // A cursor promised older entries, so an empty continuation is malformed.
  if (!head) return false;
  return (
    head.version < tail.version && sameStage(head.newStage, tail.previousStage)
  );
}

const STAGE_ENTRY_FIELDS = [
  'previousStage',
  'newStage',
  'version',
  'actor',
  'changedAt',
] as const;

function isStageHistoryEntry(
  value: unknown,
  isTimestamp: (value: unknown) => value is string,
): value is StageHistoryEntry {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== STAGE_ENTRY_FIELDS.length ||
    !STAGE_ENTRY_FIELDS.every((field) => Object.hasOwn(value, field)) ||
    !isRecordedStage(value.previousStage) ||
    !isRecordedStage(value.newStage) ||
    sameStage(value.previousStage, value.newStage)
  )
    return false;
  return (
    isOpportunityVersion(value.version, 2) &&
    isRecord(value.actor) &&
    Object.keys(value.actor).length === 2 &&
    typeof value.actor.workspaceMembershipId === 'string' &&
    typeof value.actor.displayLabel === 'string' &&
    value.actor.displayLabel.trim().length > 0 &&
    isTimestamp(value.changedAt)
  );
}

function isOlderStageEntry(entry: StageHistoryEntry, newer: unknown): boolean {
  return (
    isRecord(newer) &&
    typeof newer.version === 'number' &&
    entry.version < newer.version &&
    isRecordedStage(newer.previousStage) &&
    sameStage(entry.newStage, newer.previousStage)
  );
}

function isRecordedStage(value: unknown): value is RecordedSalesStage | null {
  return (
    value === null ||
    (isRecord(value) &&
      Object.keys(value).length === 2 &&
      isIdentifier(value.salesStageId) &&
      isStageLabel(value.label))
  );
}

function sameStage(
  left: RecordedSalesStage | null,
  right: RecordedSalesStage | null,
): boolean {
  return (left?.salesStageId ?? null) === (right?.salesStageId ?? null);
}

function isStageLabel(value: unknown): value is string {
  return typeof value === 'string' && isValidStageLabel(value);
}

function isRevision(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAXIMUM_REVISION
  );
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
