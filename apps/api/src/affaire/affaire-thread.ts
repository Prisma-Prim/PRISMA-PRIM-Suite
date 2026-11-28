import type { OpportunityOutcomeStatus } from '../commercial-intake/opportunity-outcome.js';

/** The seven stages of one affaire's thread, in order (#1533). */
export const AFFAIRE_STAGES = [
  'request',
  'costing',
  'offer',
  'contract',
  'delivery',
  'closure',
  'collection',
] as const;

export type AffaireStage = (typeof AFFAIRE_STAGES)[number];

/** How the thread shows one stage to the actor. */
export type AffaireStageMarker =
  'done' | 'current' | 'upcoming' | 'not_applicable' | 'not_available';

/**
 * What the actor may read of one stage: its owner refused the read, the stage
 * holds at least one readable record or none, or no existing relation links
 * the stage's records to the affaire.
 */
export type AffaireStagePresence =
  'not_available' | 'record' | 'none' | 'not_linked';

/** Opportunity statuses that end the thread: it shows the status instead. */
export type ClosedAffaireStatus = Extract<
  OpportunityOutcomeStatus,
  'LOST' | 'DISQUALIFIED' | 'ARCHIVED'
>;

export type AffaireThread =
  | { readonly kind: 'in_progress'; readonly currentStage: AffaireStage }
  | { readonly kind: 'closed'; readonly status: ClosedAffaireStatus };

export type AffaireStagePresences = Readonly<
  Record<AffaireStage, AffaireStagePresence>
> & { readonly request: 'record' };

/**
 * The stage rule, a presentation of existing states that stores nothing.
 *
 * - A stage the actor cannot read is not available, whether or not records
 *   exist; a stage with no relation to the affaire is not applicable.
 * - The current stage is the furthest stage holding a readable record. Before
 *   it, a stage with a record is done and one without is not applicable
 *   (skipped); after it, a stage is upcoming.
 * - A lost, disqualified or archived Opportunity has no current stage: the
 *   thread shows that status, stages with a record are done and the others
 *   not applicable.
 */
export function affaireThread(input: {
  readonly status: OpportunityOutcomeStatus;
  readonly presence: AffaireStagePresences;
}): {
  readonly thread: AffaireThread;
  readonly markers: Readonly<Record<AffaireStage, AffaireStageMarker>>;
} {
  const furthest = AFFAIRE_STAGES.reduce(
    (found, stage, index) =>
      input.presence[stage] === 'record' ? index : found,
    0,
  );
  const closed = closedStatus(input.status);
  const marker = (stage: AffaireStage) =>
    stageMarker(
      input.presence[stage],
      AFFAIRE_STAGES.indexOf(stage),
      furthest,
      closed !== undefined,
    );
  const markers = {
    request: marker('request'),
    costing: marker('costing'),
    offer: marker('offer'),
    contract: marker('contract'),
    delivery: marker('delivery'),
    closure: marker('closure'),
    collection: marker('collection'),
  } satisfies Record<AffaireStage, AffaireStageMarker>;
  const currentStage = AFFAIRE_STAGES[furthest] ?? 'request';
  return {
    thread: closed
      ? { kind: 'closed', status: closed }
      : { kind: 'in_progress', currentStage },
    markers,
  };
}

function stageMarker(
  presence: AffaireStagePresence,
  index: number,
  furthest: number,
  closed: boolean,
): AffaireStageMarker {
  switch (presence) {
    case 'not_available':
      return 'not_available';
    case 'not_linked':
      return 'not_applicable';
    case 'record':
      return !closed && index === furthest ? 'current' : 'done';
    case 'none':
      return closed || index < furthest ? 'not_applicable' : 'upcoming';
    default: {
      const exhaustive: never = presence;
      return exhaustive;
    }
  }
}

function closedStatus(
  status: OpportunityOutcomeStatus,
): ClosedAffaireStatus | undefined {
  switch (status) {
    case 'LOST':
    case 'DISQUALIFIED':
    case 'ARCHIVED':
      return status;
    case 'OPEN':
    case 'ON_HOLD':
    case 'WON':
      return undefined;
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}
