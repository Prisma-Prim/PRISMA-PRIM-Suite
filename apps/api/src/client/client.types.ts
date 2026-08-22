export interface ClientAccountView {
  id: string;
  displayName: string;
  relatedToActiveCompany: boolean;
}

export type ClientQuery =
  | { kind: 'active-company-list' }
  | { kind: 'workspace-search'; query: unknown };

export type ClientCommand =
  | {
      kind: 'register';
      displayName: unknown;
      idempotencyKey: string | undefined;
    }
  | { kind: 'attach'; clientAccountId: string };
