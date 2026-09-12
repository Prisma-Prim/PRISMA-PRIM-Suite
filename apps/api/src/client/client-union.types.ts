import type { ClientContact, ClientDossierView } from './client.types.js';

export const MULTIPLE_DUPLICATE_CANDIDATES_REQUIRE_DATA_REMEDIATION =
  'multiple_duplicate_candidates_require_data_remediation' as const;

export const CLIENT_UNION_CONFIRMED_ACTION = 'client.union_confirmed' as const;
export const CLIENT_UNION_REVERSED_ACTION = 'client.union_reversed' as const;

export type ClientUnionAction =
  typeof CLIENT_UNION_CONFIRMED_ACTION | typeof CLIENT_UNION_REVERSED_ACTION;

/** The shared scalar fields a resolver chooses between when uniting. */
export const CLIENT_UNION_SELECTABLE_FIELDS = [
  'displayName',
  'address',
  'telephone',
  'generalEmail',
  'businessActivity',
] as const;

export type ClientUnionSelectableField =
  (typeof CLIENT_UNION_SELECTABLE_FIELDS)[number];

/** One Contact entry addressed by its source dossier and stable position. */
export interface ClientUnionContactSource {
  clientAccountId: string;
  index: number;
}

/**
 * One explicit consolidation: the retained entry stays on the canonical current
 * dossier and every absorbed entry remains readable in the union snapshots.
 */
export interface ClientUnionContactConsolidation {
  retain: ClientUnionContactSource;
  absorb: ClientUnionContactSource[];
}

export interface ClientUnionComparisonRequest {
  clientAccountIds: unknown;
}

export type ClientUnionComparison =
  | {
      outcome: 'comparison';
      comparison_reference: string;
      normalizedIdentifier: string;
      clients: ClientUnionComparedDossier[];
      affectedCompanies: ClientUnionAffectedCompany[];
      differingFields: ClientUnionSelectableField[];
    }
  | {
      outcome: typeof MULTIPLE_DUPLICATE_CANDIDATES_REQUIRE_DATA_REMEDIATION;
    };

export interface ClientUnionComparedDossier extends ClientDossierView {
  contactSources: ClientUnionContactSource[];
}

export interface ClientUnionAffectedCompany {
  id: string;
  displayName: string;
}

export interface ClientUnionCommand {
  comparisonReference: unknown;
  canonicalClientAccountId: unknown;
  fieldSelections: unknown;
  contactConsolidations: unknown;
  reason: unknown;
  confirmedCompanyIds: unknown;
  idempotencyKey: string | undefined;
}

export interface ClientUnionReversalCommand {
  unionOperationId: string;
  reason: unknown;
  idempotencyKey: string | undefined;
}

/**
 * The restricted operation record. It is returned only to a reader holding
 * current Client read authority plus resolver-enabled `v2` authority in every
 * affected Company.
 */
export interface ClientUnionOperationDetail {
  unionOperationId: string;
  status: 'confirmed' | 'reversed';
  canonicalClientAccountId: string;
  supersededClientAccountId: string;
  normalizedIdentifier: string;
  affectedCompanyIds: string[];
  unionReason: string;
  reversalReason: string | null;
  confirmedAt: string;
  confirmedByInternalUserId: string;
  reversedAt: string | null;
  reversedByInternalUserId: string | null;
  snapshots: ClientUnionParticipantSnapshot[];
}

export interface ClientUnionParticipantSnapshot {
  clientAccountId: string;
  role: 'canonical' | 'superseded';
  version: number;
  displayName: string;
  taxId: string | null;
  address: string | null;
  telephone: string | null;
  generalEmail: string | null;
  contacts: ClientContact[];
  businessActivity: string | null;
}

/**
 * What an Activity Log reader sees in one server-validated Company scope. It
 * carries no actor, no action time, no cross-scope ordering key and no second
 * affected Company.
 */
export interface RedactedClientUnionOperationProjection {
  targetType: 'client_union_operation';
  action: ClientUnionAction;
  projectionReference: string;
  companyId: string;
  actor: 'authorized-resolver';
  companyLocalPosition: number;
}
