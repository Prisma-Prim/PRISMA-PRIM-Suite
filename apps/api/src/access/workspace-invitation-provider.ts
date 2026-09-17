export const WORKSPACE_INVITATION_PROVIDER = Symbol(
  'WORKSPACE_INVITATION_PROVIDER',
);

export interface InvitationIntent {
  reference: string;
  email: string;
  expiresInDays: number;
}

export type ProviderInvitationResult =
  | {
      kind: 'confirmed';
      providerId: string;
      status: 'pending' | 'accepted' | 'revoked' | 'expired';
    }
  | { kind: 'rejected' }
  | { kind: 'uncertain' };

export interface WorkspaceInvitationProvider {
  issue(intent: InvitationIntent): Promise<ProviderInvitationResult>;
  inspect(intent: InvitationIntent): Promise<ProviderInvitationResult>;
  revoke(intent: InvitationIntent): Promise<ProviderInvitationResult>;
}
