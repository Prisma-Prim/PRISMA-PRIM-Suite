import type {
  CommercialIntakeResponsibleActor,
  OpportunitySalesStage,
} from '../commercial-intake/commercial-intake.types.js';
import type { OpportunityOutcomeStatus } from '../commercial-intake/opportunity-outcome.js';
import type { AffaireStageMarker, AffaireThread } from './affaire-thread.js';

/**
 * A fact whose owner may refuse the actor: `readable: false` when the actor
 * lacks that owner's existing read permission, whether or not records exist.
 */
export type OwnerFact<Value> =
  | { readonly readable: false }
  | { readonly readable: true; readonly value: Value };

/** The Client as Client projects it for the Request; no identifier leaks. */
export interface AffaireClient {
  readonly displayName: string;
  readonly clientDossierId?: string;
}

/**
 * One affaire as the list row and the page header show it: a read-side view
 * of one Opportunity and its Client Request, never a stored business object.
 */
export interface AffaireSummary {
  readonly opportunityId: string;
  readonly clientRequestId: string;
  readonly title: string;
  readonly subject: string | null;
  readonly client: AffaireClient | null;
  readonly status: OpportunityOutcomeStatus;
  readonly owner: CommercialIntakeResponsibleActor;
  readonly nextAction: string;
  readonly salesStage: OpportunitySalesStage | null;
  /** The recorded follow-up date (YYYY-MM-DD), none, or not readable. */
  readonly followUpOn: OwnerFact<string | null>;
  /** The latest dated change among the Opportunity and its readable stage records. */
  readonly lastChangedAt: string;
  readonly thread: AffaireThread;
}

export interface AffaireListPage {
  readonly items: readonly AffaireSummary[];
  readonly nextCursor?: string;
}

type AvailableMarker = Exclude<AffaireStageMarker, 'not_available'>;

export interface PricingSnapshotFact {
  readonly calculatedAt: string;
  readonly currency: string;
  readonly total: string;
}

export interface ProfitabilityEstimateFact {
  readonly versionNumber: number;
  readonly decision: 'APPROVE' | 'MODIFY' | 'REJECT' | null;
}

export interface OfferFact {
  readonly versionNumber: number;
  readonly decisionState: 'PENDING' | 'APPROVED' | 'REJECTED';
  readonly transmissionState: 'NOT_TRANSMITTED' | 'TRANSMITTED';
  readonly clientResponseState:
    'NONE' | 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
  readonly validUntil: string;
}

export interface AgreementFact {
  readonly id: string;
  readonly kind: 'CONTRACT' | 'PRECONTRACT' | 'ADDENDUM';
  readonly versionNumber: number;
  readonly decisionState: 'PENDING' | 'APPROVED' | 'REJECTED';
  /** EXECUTED once both parties' signatures are recorded. */
  readonly executionState: 'NOT_EXECUTED' | 'EXECUTED';
}

export interface ProjectFact {
  readonly id: string;
  readonly title: string;
  readonly status:
    'preparatory' | 'active' | 'on_hold' | 'completed' | 'cancelled';
}

export interface CertificationCaseFact {
  readonly id: string;
  readonly projectId: string;
  readonly orderReference: string;
  readonly status: 'open' | 'rejected' | 'refused' | 'certified';
}

type UnavailableStage = {
  readonly stage: 'costing' | 'offer' | 'contract' | 'delivery' | 'closure';
  readonly marker: 'not_available';
};

/** The facts of one stage the actor may read, from that stage's owner. */
export type AffaireStageView =
  | {
      readonly stage: 'request';
      readonly marker: AvailableMarker;
      readonly capturedAt: string;
      readonly clientAssociationStatus: 'absent' | 'hidden' | 'visible';
    }
  | UnavailableStage
  | {
      readonly stage: 'costing';
      readonly marker: AvailableMarker;
      readonly pricingSnapshot: OwnerFact<PricingSnapshotFact | null>;
      readonly profitabilityEstimate: OwnerFact<ProfitabilityEstimateFact | null>;
    }
  | {
      readonly stage: 'offer';
      readonly marker: AvailableMarker;
      readonly offer: OfferFact | null;
    }
  | {
      readonly stage: 'contract';
      readonly marker: AvailableMarker;
      readonly agreements: readonly AgreementFact[];
    }
  | {
      readonly stage: 'delivery';
      readonly marker: AvailableMarker;
      readonly projects: readonly ProjectFact[];
    }
  | {
      readonly stage: 'closure';
      readonly marker: AvailableMarker;
      readonly certificationCases: readonly CertificationCaseFact[];
    }
  | {
      readonly stage: 'collection';
      readonly marker: 'not_applicable';
      /** Invoice Records and Payment Observations attach to Documents only. */
      readonly link: 'not_linked';
    };

export interface AffaireDetail extends AffaireSummary {
  readonly opportunityVersion: number;
  readonly stages: readonly AffaireStageView[];
}
