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

/** Exactly one business field: the new responsible membership. No clear. */
export interface ChangeOpportunityResponsibleCommand {
  readonly expectedVersion: number;
  readonly workspaceMembershipId: string;
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
  readonly version: 1;
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
    readonly status: 'OPEN';
    readonly responsibleWorkspaceMembershipId: string;
    readonly responsibleActor: CommercialIntakeResponsibleActor;
    readonly createdAt: string;
    readonly version: number;
  };
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

/** Eligible members only: a membership identifier and a label, never email. */
export interface OpportunityResponsibleCandidatePage {
  readonly members: ReadonlyArray<{
    readonly workspaceMembershipId: string;
    readonly displayLabel: string;
  }>;
}

export interface CommercialIntakeListItem {
  readonly id: string;
  readonly subject: string | null;
  readonly capturedAt: string;
  /**
   * Derived navigation target owned by Client, present only for a current
   * Company Client reader; never persisted, accepted as input or used for access.
   */
  readonly clientDossierId?: string;
  readonly initialOpportunity: {
    readonly title: string;
    readonly nextAction: string;
    readonly responsibleActor: CommercialIntakeResponsibleActor;
  };
}

export interface CommercialIntakeListPage {
  readonly items: CommercialIntakeListItem[];
  readonly nextCursor?: string;
}

export interface ReadablePricingOpportunity {
  readonly id: string;
  readonly clientRequestId: string;
  readonly originalClientAccountId: string | null;
}

export type CommercialClientProjection = NonNullable<
  CommercialIntakeDetail['clientReference']
>;
