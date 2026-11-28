import {
  dealStages,
  type DealStage,
  type DealStageMarker,
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
