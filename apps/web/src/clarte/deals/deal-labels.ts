import type { ClarteTone } from '../components/ClarteBadge';
import {
  dealStages,
  type DealStage,
  type DealStageMarker,
  type DecisionState,
  type OfferFact,
} from './deal-response';
import type { DealMessageKey } from './deals.copy';

export const stageLabelKeys = {
  request: 'stageRequest',
  costing: 'stageCosting',
  offer: 'stageOffer',
  contract: 'stageContract',
  delivery: 'stageDelivery',
  closure: 'stageClosure',
  collection: 'stageCollection',
} as const satisfies Record<DealStage, DealMessageKey>;

export const markerLabelKeys = {
  done: 'markerDone',
  current: 'markerCurrent',
  upcoming: 'markerUpcoming',
  not_applicable: 'markerNotApplicable',
  not_available: 'markerNotAvailable',
} as const satisfies Record<DealStageMarker, DealMessageKey>;

/** The stage's place in the thread, 1 to 7, which also picks its prism colour. */
export function stageNumber(stage: DealStage): number {
  return dealStages.indexOf(stage) + 1;
}

/** An Offer or agreement version's internal decision. */
export const decisionLabelKeys = {
  PENDING: 'decisionPending',
  APPROVED: 'decisionApproved',
  REJECTED: 'decisionRejected',
} as const satisfies Record<DecisionState, DealMessageKey>;

export function decisionTone(state: DecisionState): ClarteTone {
  return state === 'APPROVED'
    ? 'success'
    : state === 'REJECTED'
      ? 'danger'
      : 'warning';
}

type EstimateDecision = 'APPROVE' | 'MODIFY' | 'REJECT' | null;

/** A Profitability Estimate version's Director decision, or none yet. */
export function estimateLabel(decision: EstimateDecision): DealMessageKey {
  switch (decision) {
    case 'APPROVE':
      return 'estimateApprove';
    case 'MODIFY':
      return 'estimateModify';
    case 'REJECT':
      return 'estimateReject';
    case null:
      return 'estimatePending';
    default: {
      const exhaustive: never = decision;
      return exhaustive;
    }
  }
}

export function estimateTone(decision: EstimateDecision): ClarteTone {
  return decision === 'APPROVE'
    ? 'success'
    : decision === 'REJECT'
      ? 'danger'
      : 'warning';
}

export const responseLabelKeys = {
  NONE: 'responseNone',
  PENDING: 'responsePending',
  ACCEPTED: 'responseAccepted',
  REJECTED: 'responseRejected',
  EXPIRED: 'responseExpired',
} as const satisfies Record<OfferFact['clientResponseState'], DealMessageKey>;
