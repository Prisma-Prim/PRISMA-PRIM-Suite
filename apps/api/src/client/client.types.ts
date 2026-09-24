export interface ClientAccountView {
  id: string;
  displayName: string;
  relatedToActiveCompany: boolean;
}

export interface ClientContact {
  name: string;
  telephone?: string;
  email?: string;
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
