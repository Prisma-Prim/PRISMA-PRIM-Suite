import type {
  OpportunityLossReasonCode,
  OpportunityOutcomeChange,
  OpportunityOutcomeStatus,
} from './opportunity-outcome.js';

export interface CreateCommercialIntakeCommand {
  readonly originalText: string;
  readonly sourceLabel: string | null;
  readonly reportedReceivedAt: Date | null;
  readonly reportedReceivedAtInput: string | null;
  readonly subject: string | null;
  readonly clientAccountId: string | null;
  readonly opportunity: {
    readonly title: string;
    readonly scope: string | null;
    readonly nextAction: string;
  };
}

export interface UpdateOpportunityNextActionCommand {
  readonly expectedVersion: number;
  readonly nextAction: string;
}

export interface AssociateClientCommand {
  readonly expectedVersion: number;
  readonly clientAccountId: string;
}

/** Exactly one business field: the new responsible membership. No clear. */
export interface ChangeOpportunityResponsibleCommand {
  readonly expectedVersion: number;
  readonly workspaceMembershipId: string;
}

/** The observed version, the requested status and its reason fields. */
export interface ChangeOpportunityOutcomeCommand {
  readonly expectedVersion: number;
  readonly change: OpportunityOutcomeChange;
}

/**
 * One committed outcome status transition (section 23.6). The reason or note
 * stays consultable here; the acting member keeps the label captured then.
 */
export interface OpportunityOutcomeHistoryEntry {
  readonly previousStatus: OpportunityOutcomeStatus;
  readonly newStatus: OpportunityOutcomeStatus;
  readonly lossReasonCode: OpportunityLossReasonCode | null;
  readonly reason: string | null;
  readonly note: string | null;
  readonly version: number;
  readonly actor: {
    readonly workspaceMembershipId: string;
    readonly displayLabel: string;
  };
  readonly changedAt: string;
}

/** At most 50 entries, newest first; the opaque cursor reads older ones. */
export interface OpportunityOutcomeHistoryPage {
  readonly entries: readonly OpportunityOutcomeHistoryEntry[];
  readonly nextCursor?: string;
}

/**
 * The responsible actor label shown by the Request list and detail. It carries
 * only the membership already scoped to this Company intake read boundary and
 * its current display name; it is not a member directory.
 */
export interface CommercialIntakeResponsibleActor {
  readonly workspaceMembershipId: string;
  readonly displayName: string;
}

export interface CommercialIntakeDetail {
  readonly id: string;
  readonly companyId: string;
  readonly sourceKind: 'MANUAL_TEXT';
  readonly sourceLabel: string | null;
  readonly reportedReceivedAt: string | null;
  readonly subject: string | null;
  readonly originalText: string;
  readonly capturedByWorkspaceMembershipId: string;
  readonly capturedAt: string;
  readonly version: 1 | 2;
  readonly clientAssociationStatus: 'absent' | 'hidden' | 'visible';
  readonly clientReference?: {
    readonly originalClientId: string;
    readonly currentClientId?: string;
    readonly displayName: string;
  };
  readonly initialOpportunity: {
    readonly id: string;
    readonly title: string;
    readonly scope: string | null;
    readonly nextAction: string;
    readonly status: OpportunityOutcomeStatus;
    readonly statusEnteredAt: string;
    readonly outcomeHistory: OpportunityOutcomeHistoryPage;
    readonly responsibleWorkspaceMembershipId: string;
    readonly responsibleActor: CommercialIntakeResponsibleActor;
    readonly createdAt: string;
    readonly version: number;
  };
}

export interface ClientAssociationResult {
  readonly receipt: {
    readonly requestId: string;
    readonly version: 2;
    readonly outcome: 'associated';
  };
  readonly request: CommercialIntakeDetail;
}

// The receipt confirms what one command did; `request` is the current
// permission-filtered state, refreshed separately from the receipt.
export interface OpportunityNextActionUpdateResult {
  readonly receipt: {
    readonly opportunityId: string;
    readonly nextAction: string;
    readonly version: number;
    readonly outcome: 'updated' | 'unchanged';
  };
  readonly request: CommercialIntakeDetail;
}

// The receipt confirms what one reassignment did; `request` is the current
// permission-filtered state, refreshed separately from the receipt.
export interface OpportunityResponsibleChangeResult {
  readonly receipt: {
    readonly opportunityId: string;
    readonly workspaceMembershipId: string;
    readonly version: number;
    readonly outcome: 'updated' | 'unchanged';
  };
  readonly request: CommercialIntakeDetail;
}

// The receipt confirms the one transition a command committed; `request` is
// the current permission-filtered state, refreshed separately from it.
export interface OpportunityOutcomeChangeResult {
  readonly receipt: {
    readonly opportunityId: string;
    readonly previousStatus: OpportunityOutcomeStatus;
    readonly status: OpportunityOutcomeStatus;
    readonly version: number;
  };
  readonly request: CommercialIntakeDetail;
}

/** Eligible members only: a membership identifier and a label, never email. */
export interface OpportunityResponsibleCandidatePage {
  readonly members: ReadonlyArray<{
    readonly workspaceMembershipId: string;
    readonly displayLabel: string;
  }>;
}

export type CommercialIntakeListClientProjection =
  | {
      readonly clientDisplayName: string;
      readonly clientDossierId?: string;
    }
  | {
      readonly clientDisplayName?: undefined;
      readonly clientDossierId?: undefined;
    };

export type CommercialIntakeListItem = {
  readonly id: string;
  readonly subject: string | null;
  readonly capturedAt: string;
  /**
   * Derived projection owned by Client. Its name may remain readable without
   * a current dossier; navigation is offered only when `clientDossierId` is
   * present. Neither field is persisted, accepted as input or used for access.
   */
  readonly initialOpportunity: {
    readonly title: string;
    readonly nextAction: string;
    readonly status: OpportunityOutcomeStatus;
    readonly responsibleActor: CommercialIntakeResponsibleActor;
  };
} & CommercialIntakeListClientProjection;

export interface CommercialIntakeListPage {
  readonly items: CommercialIntakeListItem[];
  readonly nextCursor?: string;
}

export interface ReadablePricingOpportunity {
  readonly id: string;
  readonly clientRequestId: string;
  readonly originalClientAccountId: string | null;
}

export interface ReadableOfferOpportunity extends ReadablePricingOpportunity {
  readonly status: OpportunityOutcomeStatus;
}

export type CommercialClientProjection = NonNullable<
  CommercialIntakeDetail['clientReference']
>;
