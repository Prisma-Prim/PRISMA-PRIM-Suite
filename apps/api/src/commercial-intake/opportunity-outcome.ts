/**
 * Commercial Workflow PRD section 23: the six outcome statuses an Opportunity
 * can hold, the seven transitions between them and the fixed loss reason
 * codes. The command, its validation, the schema checks and the Activity
 * projection all derive from this table; no other transition exists.
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

/** Fixed in this slice; a configurable list is deferred (section 23.2). */
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

/** What a transition asks for: nothing, a reason, or a loss reason code. */
type OutcomeTransitionInput = 'none' | 'reason' | 'loss';

export const OPPORTUNITY_OUTCOME_TRANSITIONS = {
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
  string,
  {
    from: readonly OpportunityOutcomeStatus[];
    to: OpportunityOutcomeStatus;
    input: OutcomeTransitionInput;
  }
>;

/**
 * The requested status and each reason field exactly as submitted, or null
 * when absent. Which fields are required or refused depends on the transition
 * the current status selects, so they are checked only after the pair is
 * known to be permitted (section 23.2).
 */
export interface OpportunityOutcomeChange {
  readonly status: OpportunityOutcomeStatus;
  readonly reason: string | null;
  readonly lossReasonCode: OpportunityLossReasonCode | null;
  readonly note: string | null;
}

export type OpportunityOutcomeField = 'reason' | 'lossReasonCode' | 'note';

/** One committed transition, as its history entry and receipt record it. */
export interface RecordedOpportunityOutcome {
  readonly previousStatus: OpportunityOutcomeStatus;
  readonly newStatus: OpportunityOutcomeStatus;
  readonly lossReasonCode: OpportunityLossReasonCode | null;
  readonly reason: string | null;
  readonly note: string | null;
}

export type OutcomeTransitionResolution =
  | {
      readonly kind: 'transition';
      readonly recorded: RecordedOpportunityOutcome;
    }
  | { readonly kind: 'not-allowed' }
  | {
      readonly kind: 'invalid-field';
      readonly field: OpportunityOutcomeField;
      readonly message: string;
    };

/**
 * Derives the one permitted transition from the current status and the
 * requested change. Requesting the current status, or a pair outside the
 * table, is not allowed whatever fields were supplied; only then does a field
 * the derived transition refuses, or one it needs but lacks, become field
 * validation.
 */
export function resolveOutcomeTransition(
  current: OpportunityOutcomeStatus,
  change: OpportunityOutcomeChange,
): OutcomeTransitionResolution {
  const transition = transitionBetween(current, change.status);
  if (!transition) return { kind: 'not-allowed' };
  const base = { previousStatus: current, newStatus: change.status };
  const refused = (
    fields: readonly OpportunityOutcomeField[],
  ): OutcomeTransitionResolution | undefined => {
    const field = fields.find((name) => change[name] !== null);
    return field === undefined
      ? undefined
      : {
          kind: 'invalid-field',
          field,
          message: 'This status change does not accept this field.',
        };
  };
  const input: OutcomeTransitionInput = transition.input;
  switch (input) {
    case 'none':
      return refused(['reason', 'lossReasonCode', 'note']) ?? recorded(base);
    case 'reason': {
      const unaccepted = refused(['lossReasonCode', 'note']);
      if (unaccepted) return unaccepted;
      if (change.reason === null)
        return {
          kind: 'invalid-field',
          field: 'reason',
          message:
            change.status === 'OPEN'
              ? 'Enter a reason for reopening.'
              : 'Enter a reason.',
        };
      return recorded({ ...base, reason: change.reason });
    }
    case 'loss': {
      const unaccepted = refused(['reason']);
      if (unaccepted) return unaccepted;
      if (change.lossReasonCode === null)
        return {
          kind: 'invalid-field',
          field: 'lossReasonCode',
          message: 'Choose a loss reason.',
        };
      if (change.lossReasonCode === 'OTHER' && change.note === null)
        return {
          kind: 'invalid-field',
          field: 'note',
          message: 'Enter the actual reason for a loss marked Other.',
        };
      return recorded({
        ...base,
        lossReasonCode: change.lossReasonCode,
        note: change.note,
      });
    }
    default: {
      const exhaustive: never = input;
      return exhaustive;
    }
  }
}

/** Whether a stored pair is exactly one of the section 23.2 transitions. */
export function isOutcomeTransition(
  from: OpportunityOutcomeStatus,
  to: OpportunityOutcomeStatus,
): boolean {
  return transitionBetween(from, to) !== undefined;
}

export function isOpportunityOutcomeStatus(
  value: unknown,
): value is OpportunityOutcomeStatus {
  return OPPORTUNITY_OUTCOME_STATUSES.some((status) => status === value);
}

export function isOpportunityLossReasonCode(
  value: unknown,
): value is OpportunityLossReasonCode {
  return OPPORTUNITY_LOSS_REASON_CODES.some((code) => code === value);
}

function transitionBetween(
  from: OpportunityOutcomeStatus,
  to: OpportunityOutcomeStatus,
) {
  return Object.values(OPPORTUNITY_OUTCOME_TRANSITIONS).find((transition) => {
    const sources: readonly OpportunityOutcomeStatus[] = transition.from;
    return transition.to === to && sources.includes(from);
  });
}

function recorded(
  value: Pick<RecordedOpportunityOutcome, 'previousStatus' | 'newStatus'> &
    Partial<RecordedOpportunityOutcome>,
): OutcomeTransitionResolution {
  return {
    kind: 'transition',
    recorded: {
      previousStatus: value.previousStatus,
      newStatus: value.newStatus,
      lossReasonCode: value.lossReasonCode ?? null,
      reason: value.reason ?? null,
      note: value.note ?? null,
    },
  };
}
