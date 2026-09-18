import type { ExternalPrincipal } from './access.types.js';

export const INVITATION_ACCEPTANCE_PROVIDER = Symbol(
  'INVITATION_ACCEPTANCE_PROVIDER',
);

export interface InvitationProofContext {
  clientId: string;
  sealedToken: string;
}

export interface InvitationProofRequest {
  principal: ExternalPrincipal;
  invitation: { reference: string; providerId: string | null; email: string };
  ticket?: string;
  context?: InvitationProofContext;
}

export type InvitationRecipientProof =
  | {
      kind: 'verified';
      provider: string;
      subject: string;
      reference: string;
      providerId: string;
    }
  | { kind: 'needs-client' }
  | { kind: 'denied' }
  | { kind: 'unavailable' };

export interface InvitationAcceptanceProvider {
  prove(request: InvitationProofRequest): Promise<InvitationRecipientProof>;
  prepare(reference: string): Promise<InvitationProofContext | undefined>;
}
