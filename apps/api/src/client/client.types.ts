export interface ClientAccountView {
  id: string;
  displayName: string;
  relatedToActiveCompany: boolean;
}

/** Closed provisional vocabulary, in its canonical storage order. */
export const CLIENT_CONTACT_DECISION_ROLES = [
  'final_decision_maker',
  'influencer',
  'user',
  'financial',
  'technical',
  'blocker',
] as const;

export type ClientContactDecisionRole =
  (typeof CLIENT_CONTACT_DECISION_ROLES)[number];

export interface ClientContact {
  name: string;
  telephone?: string;
  email?: string;
  position?: string;
  /** Non-empty, without duplicates, in vocabulary order. */
  decisionRoles?: ClientContactDecisionRole[];
  /** Descriptive shared text, trimmed and never blank. It grants nothing. */
  communicationPreferences?: string;
}

export interface ClientDossierView extends ClientAccountView {
  taxId: string | null;
  address: string | null;
  telephone: string | null;
  generalEmail: string | null;
  contacts: ClientContact[];
  businessActivity: string | null;
  version: number;
  involvedCompanyDisplayNames: string[];
}

export interface ClientDossierFieldsInput {
  displayName?: unknown;
  taxId?: unknown;
  address?: unknown;
  telephone?: unknown;
  generalEmail?: unknown;
  contacts?: unknown;
  businessActivity?: unknown;
}

export type ClientQuery =
  | { kind: 'active-company-list' }
  | { kind: 'workspace-search'; query: unknown }
  | { kind: 'dossier'; clientAccountId: string };

export type ClientCommand =
  | {
      kind: 'register';
      fields: ClientDossierFieldsInput;
      idempotencyKey: string | undefined;
    }
  | { kind: 'attach'; clientAccountId: string }
  | {
      kind: 'correct';
      clientAccountId: string;
      expectedVersion: unknown;
      changes: ClientDossierFieldsInput;
      idempotencyKey: string | undefined;
    };
