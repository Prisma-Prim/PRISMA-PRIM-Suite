/**
 * The browser mirror of the Commercial Workflow PRD section 23 outcome
 * statuses and transitions. The API stays the authority: this table only
 * decides which changes the control offers and which fields it asks for.
 */
export const OPPORTUNITY_OUTCOME_STATUSES = [
  'OPEN',
  'ON_HOLD',
  'WON',
  'LOST',
  'DISQUALIFIED',
  'ARCHIVED',
] as const;
export type OpportunityOutcomeStatus =
  (typeof OPPORTUNITY_OUTCOME_STATUSES)[number];

export const OPPORTUNITY_LOSS_REASON_CODES = [
  'PRICE',
  'DEADLINE',
  'COMPETITOR',
  'NO_BUDGET',
  'POSTPONED',
  'CLIENT_WITHDREW',
  'OTHER',
  'UNKNOWN',
] as const;
export type OpportunityLossReasonCode =
  (typeof OPPORTUNITY_LOSS_REASON_CODES)[number];

export const OPPORTUNITY_OUTCOME_TRANSITIONS = [
  'hold',
  'resume',
  'win',
  'lose',
  'disqualify',
  'archive',
  'reopen',
] as const;
export type OpportunityOutcomeTransition =
  (typeof OPPORTUNITY_OUTCOME_TRANSITIONS)[number];

type OutcomeTransitionInput = 'none' | 'reason' | 'loss';

const TRANSITIONS = {
  hold: { from: ['OPEN'], to: 'ON_HOLD', input: 'reason' },
  resume: { from: ['ON_HOLD'], to: 'OPEN', input: 'none' },
  win: { from: ['OPEN', 'ON_HOLD'], to: 'WON', input: 'none' },
  lose: { from: ['OPEN', 'ON_HOLD'], to: 'LOST', input: 'loss' },
  disqualify: {
    from: ['OPEN', 'ON_HOLD'],
    to: 'DISQUALIFIED',
    input: 'reason',
  },
  archive: { from: ['OPEN', 'ON_HOLD'], to: 'ARCHIVED', input: 'reason' },
  reopen: {
    from: ['WON', 'LOST', 'DISQUALIFIED', 'ARCHIVED'],
    to: 'OPEN',
    input: 'reason',
  },
} as const satisfies Record<
  OpportunityOutcomeTransition,
  {
    from: readonly OpportunityOutcomeStatus[];
    to: OpportunityOutcomeStatus;
    input: OutcomeTransitionInput;
  }
>;

/** The transitions offered from `current`, in the section 23.2 order. */
/** Whether a recorded pair is exactly one of the section 23.2 transitions. */
export function isOutcomeTransition(
  from: OpportunityOutcomeStatus,
  to: OpportunityOutcomeStatus,
): boolean {
  return Object.values(TRANSITIONS).some((transition) => {
    const sources: readonly OpportunityOutcomeStatus[] = transition.from;
    return transition.to === to && sources.includes(from);
  });
}

export function permittedOutcomeTransitions(
  current: OpportunityOutcomeStatus,
): OpportunityOutcomeTransition[] {
  return OPPORTUNITY_OUTCOME_TRANSITIONS.filter((transition) => {
    const sources: readonly OpportunityOutcomeStatus[] =
      TRANSITIONS[transition].from;
    return sources.includes(current);
  });
}

export function outcomeTransitionInput(
  transition: OpportunityOutcomeTransition,
): OutcomeTransitionInput {
  return TRANSITIONS[transition].input;
}

/** The fields of one outcome change as typed; nothing is trimmed. */
export type OutcomeDraft = {
  transition: OpportunityOutcomeTransition | '';
  reason: string;
  lossReasonCode: OpportunityLossReasonCode | '';
  note: string;
};

export const EMPTY_OUTCOME_DRAFT: OutcomeDraft = {
  transition: '',
  reason: '',
  lossReasonCode: '',
  note: '',
};

/**
 * The outcome change is either closed, being chosen, in flight, waiting for
 * an explicit retry after an uncertain outcome, or blocked until a reload.
 */
export type OutcomeEdit =
  | { kind: 'idle' }
  | { kind: 'editing' | 'saving' | 'uncertain'; draft: OutcomeDraft }
  | { kind: 'conflict' };

/**
 * The exact command body for a complete draft, with only the fields its
 * transition accepts, or undefined while a required field is missing. Text is
 * sent exactly as typed; an empty optional note is left out.
 */
export function outcomeCommandBody(
  draft: OutcomeDraft,
  expectedVersion: number,
): Record<string, unknown> | undefined {
  if (!draft.transition) return undefined;
  const transition = TRANSITIONS[draft.transition];
  const base = { expectedVersion, status: transition.to };
  switch (transition.input) {
    case 'none':
      return base;
    case 'reason':
      return validText(draft.reason)
        ? { ...base, reason: draft.reason }
        : undefined;
    case 'loss': {
      if (!draft.lossReasonCode) return undefined;
      if (draft.note === '')
        return draft.lossReasonCode === 'OTHER'
          ? undefined
          : { ...base, lossReasonCode: draft.lossReasonCode };
      return validText(draft.note)
        ? { ...base, lossReasonCode: draft.lossReasonCode, note: draft.note }
        : undefined;
    }
    default: {
      const exhaustive: never = transition;
      return exhaustive;
    }
  }
}

/** The section 16.3 text rule: 1–500 characters, not only whitespace. */
function validText(value: string): boolean {
  return value.trim().length > 0 && value.length <= 500;
}

export type OutcomeHistoryEntry = {
  previousStatus: OpportunityOutcomeStatus;
  newStatus: OpportunityOutcomeStatus;
  lossReasonCode: OpportunityLossReasonCode | null;
  reason: string | null;
  note: string | null;
  version: number;
  actor: { workspaceMembershipId: string; displayLabel: string };
  changedAt: string;
};

export type OutcomeHistoryPage = {
  entries: OutcomeHistoryEntry[];
  nextCursor?: string;
};

export function isOpportunityOutcomeStatus(
  value: unknown,
): value is OpportunityOutcomeStatus {
  return OPPORTUNITY_OUTCOME_STATUSES.some((status) => status === value);
}

function isLossReasonCode(value: unknown): value is OpportunityLossReasonCode {
  return OPPORTUNITY_LOSS_REASON_CODES.some((code) => code === value);
}

/** The section 23.6 page bound. */
export const OUTCOME_HISTORY_PAGE_SIZE = 50;

/**
 * Proves one history page at the response boundary: at most 50 valid entries,
 * newest first with strictly descending versions, each older entry ending in
 * the status the next newer entry started from; anything else fails.
 */
export function isOutcomeHistoryPage(
  value: unknown,
  isTimestamp: (value: unknown) => value is string,
): value is OutcomeHistoryPage {
  if (
    !isRecord(value) ||
    !Array.isArray(value.entries) ||
    value.entries.length > OUTCOME_HISTORY_PAGE_SIZE ||
    // An absent cursor ends the history; an empty one is malformed.
    !(
      value.nextCursor === undefined ||
      (typeof value.nextCursor === 'string' && value.nextCursor.length > 0)
    )
  )
    return false;
  const entries: unknown[] = value.entries;
  // A cursor continues from this page's oldest entry, so an empty page has
  // none; a page without a cursor is complete, so it ends at the creation
  // status OPEN.
  if (entries.length === 0) return value.nextCursor === undefined;
  const oldest = entries.at(-1);
  return (
    entries.every(
      (entry, index) =>
        isOutcomeHistoryEntry(entry, isTimestamp) &&
        (index === 0 || isOlderEntry(entry, entries[index - 1])),
    ) &&
    (value.nextCursor !== undefined ||
      (isRecord(oldest) && oldest.previousStatus === 'OPEN'))
  );
}

/**
 * The status read with a Request agrees with its newest history entry: that
 * entry ends in the current status, is not newer than the Opportunity and
 * sets the time the status was entered. Without history the Opportunity is
 * still OPEN since its creation.
 */
export function isConsistentOutcomeSnapshot(snapshot: {
  status: OpportunityOutcomeStatus;
  statusEnteredAt: string;
  createdAt: string;
  version: number;
  outcomeHistory: OutcomeHistoryPage;
}): boolean {
  const [newest] = snapshot.outcomeHistory.entries;
  if (!newest)
    return (
      snapshot.status === 'OPEN' &&
      sameInstant(snapshot.statusEnteredAt, snapshot.createdAt)
    );
  return (
    newest.newStatus === snapshot.status &&
    newest.version <= snapshot.version &&
    sameInstant(snapshot.statusEnteredAt, newest.changedAt)
  );
}

function sameInstant(left: string, right: string): boolean {
  const leftTime = Date.parse(left);
  return !Number.isNaN(leftTime) && leftTime === Date.parse(right);
}

/** Whether an older page continues the chronology already shown. */
export function continuesOutcomeHistory(
  shown: readonly OutcomeHistoryEntry[],
  older: readonly OutcomeHistoryEntry[],
): boolean {
  const tail = shown.at(-1);
  const head = older[0];
  if (!tail) return true;
  // A cursor promised older entries, so an empty continuation is malformed.
  if (!head) return false;
  return head.version < tail.version && head.newStatus === tail.previousStatus;
}

function isOlderEntry(entry: OutcomeHistoryEntry, newer: unknown): boolean {
  return (
    isRecord(newer) &&
    typeof newer.version === 'number' &&
    entry.version < newer.version &&
    entry.newStatus === newer.previousStatus
  );
}

const HISTORY_ENTRY_FIELDS = [
  'previousStatus',
  'newStatus',
  'lossReasonCode',
  'reason',
  'note',
  'version',
  'actor',
  'changedAt',
] as const;

/**
 * One recorded transition: exactly the entry fields, a permitted section 23.2
 * pair, and the reason fields that pair records, nothing else.
 */
function isOutcomeHistoryEntry(
  value: unknown,
  isTimestamp: (value: unknown) => value is string,
): value is OutcomeHistoryEntry {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== HISTORY_ENTRY_FIELDS.length ||
    !HISTORY_ENTRY_FIELDS.every((field) => Object.hasOwn(value, field))
  )
    return false;
  const { previousStatus, newStatus, lossReasonCode, reason, note } = value;
  if (
    !isOpportunityOutcomeStatus(previousStatus) ||
    !isOpportunityOutcomeStatus(newStatus)
  )
    return false;
  const input = transitionInputBetween(previousStatus, newStatus);
  const fieldsMatch =
    input === 'none'
      ? lossReasonCode === null && reason === null && note === null
      : input === 'reason'
        ? lossReasonCode === null && isValidText(reason) && note === null
        : input === 'loss'
          ? isLossReasonCode(lossReasonCode) &&
            reason === null &&
            (note === null || isValidText(note)) &&
            (lossReasonCode !== 'OTHER' || note !== null)
          : false;
  return (
    fieldsMatch &&
    typeof value.version === 'number' &&
    Number.isInteger(value.version) &&
    value.version >= 2 &&
    isRecord(value.actor) &&
    Object.keys(value.actor).length === 2 &&
    typeof value.actor.workspaceMembershipId === 'string' &&
    typeof value.actor.displayLabel === 'string' &&
    value.actor.displayLabel.trim().length > 0 &&
    isTimestamp(value.changedAt)
  );
}

function isValidText(value: unknown): value is string {
  return typeof value === 'string' && validText(value);
}

/** The input a recorded pair took, or undefined outside the table. */
function transitionInputBetween(
  from: OpportunityOutcomeStatus,
  to: OpportunityOutcomeStatus,
): OutcomeTransitionInput | undefined {
  const transition = Object.values(TRANSITIONS).find((candidate) => {
    const sources: readonly OpportunityOutcomeStatus[] = candidate.from;
    return candidate.to === to && sources.includes(from);
  });
  return transition?.input;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
