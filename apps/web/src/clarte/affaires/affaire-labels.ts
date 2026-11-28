import {
  affaireStages,
  type AffaireStage,
  type AffaireStageMarker,
} from './affaire-response';
import type { AffaireMessageKey } from './affaires.copy';

export const stageLabelKeys = {
  request: 'stageRequest',
  costing: 'stageCosting',
  offer: 'stageOffer',
  contract: 'stageContract',
  delivery: 'stageDelivery',
  closure: 'stageClosure',
  collection: 'stageCollection',
} as const satisfies Record<AffaireStage, AffaireMessageKey>;

export const markerLabelKeys = {
  done: 'markerDone',
  current: 'markerCurrent',
  upcoming: 'markerUpcoming',
  not_applicable: 'markerNotApplicable',
  not_available: 'markerNotAvailable',
} as const satisfies Record<AffaireStageMarker, AffaireMessageKey>;

/** The stage's place in the thread, 1 to 7, which also picks its prism colour. */
export function stageNumber(stage: AffaireStage): number {
  return affaireStages.indexOf(stage) + 1;
}
