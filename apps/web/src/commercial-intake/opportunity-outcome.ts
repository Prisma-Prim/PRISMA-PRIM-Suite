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

/** Proves one history page at the response boundary; anything else fails. */
export function isOutcomeHistoryPage(
  value: unknown,
  isTimestamp: (value: unknown) => value is string,
): value is OutcomeHistoryPage {
  return (
    isRecord(value) &&
    Array.isArray(value.entries) &&
    value.entries.every((entry: unknown) =>
      isOutcomeHistoryEntry(entry, isTimestamp),
    ) &&
    (value.nextCursor === undefined || typeof value.nextCursor === 'string')
  );
}

function isOutcomeHistoryEntry(
  value: unknown,
  isTimestamp: (value: unknown) => value is string,
): value is OutcomeHistoryEntry {
  return (
    isRecord(value) &&
    isOpportunityOutcomeStatus(value.previousStatus) &&
    isOpportunityOutcomeStatus(value.newStatus) &&
    (value.lossReasonCode === null || isLossReasonCode(value.lossReasonCode)) &&
    (value.reason === null || typeof value.reason === 'string') &&
    (value.note === null || typeof value.note === 'string') &&
    typeof value.version === 'number' &&
    Number.isInteger(value.version) &&
    isRecord(value.actor) &&
    typeof value.actor.workspaceMembershipId === 'string' &&
    typeof value.actor.displayLabel === 'string' &&
    isTimestamp(value.changedAt)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
