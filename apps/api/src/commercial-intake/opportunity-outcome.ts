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
 * The requested status and the reason fields as submitted. Only a request for
 * `OPEN` leaves its reason open, because the current status decides whether
 * it resumes a held Opportunity (no reason) or reopens a closed one (reason).
 */
export type OpportunityOutcomeChange =
  | {
      readonly status: 'ON_HOLD' | 'DISQUALIFIED' | 'ARCHIVED';
      readonly reason: string;
    }
  | { readonly status: 'WON' }
  | {
      readonly status: 'LOST';
      readonly lossReasonCode: OpportunityLossReasonCode;
      /** Required for `OTHER`, optional otherwise. */
      readonly note: string | null;
    }
  | { readonly status: 'OPEN'; readonly reason: string | null };

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
  | { readonly kind: 'invalid-reason'; readonly message: string };

/**
 * Derives the one permitted transition from the current status and the
 * requested change. Requesting the current status, or a pair outside the
 * table, is not allowed; a reason the derived transition does not take, or
 * one it needs but lacks, is field validation.
 */
export function resolveOutcomeTransition(
  current: OpportunityOutcomeStatus,
  change: OpportunityOutcomeChange,
): OutcomeTransitionResolution {
  const transition = transitionBetween(current, change.status);
  if (!transition) return { kind: 'not-allowed' };
  const base = { previousStatus: current, newStatus: change.status };
  switch (change.status) {
    case 'ON_HOLD':
    case 'DISQUALIFIED':
    case 'ARCHIVED':
      return recorded({ ...base, reason: change.reason });
    case 'WON':
      return recorded(base);
    case 'LOST':
      return recorded({
        ...base,
        lossReasonCode: change.lossReasonCode,
        note: change.note,
      });
    case 'OPEN': {
      const takesReason = transition.input === 'reason';
      if (takesReason && change.reason === null)
        return {
          kind: 'invalid-reason',
          message: 'Enter a reason for reopening.',
        };
      if (!takesReason && change.reason !== null)
        return {
          kind: 'invalid-reason',
          message: 'Resuming takes no reason.',
        };
      return recorded({ ...base, reason: change.reason });
    }
    default: {
      const exhaustive: never = change;
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
