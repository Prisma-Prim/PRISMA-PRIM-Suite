import { timingSafeEqual } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import type { ExternalPrincipal } from '../access/access.types.js';
import type {
  ExternalIdentityVerifier,
  IdentityRequest,
} from '../access/external-identity-verifier.js';
import type {
  IdentitySessionRevoker,
  SessionRevocationOutcome,
} from '../access/identity-session-revoker.js';
import {
  VerifiedPrincipalAdapter,
  type VerifiedPrincipalRequest,
} from '../access/verified-principal.adapter.js';
import type {
  InvitationAcceptanceProvider,
  InvitationProofContext,
  InvitationRecipientProof,
} from '../access/workspace-invitation-acceptance-provider.js';
import type {
  ProviderInvitationResult,
  WorkspaceInvitationProvider,
} from '../access/workspace-invitation-provider.js';
import type { DemonstrationPrincipal } from './demonstration-runner.js';
import {
  DEMONSTRATION_PERSONA_PROVIDER,
  type DemonstrationPersona,
} from './demonstration-scenario.js';

export const DEMONSTRATION_TOKEN_HEADER = 'x-demonstration-seed-token';
export const DEMONSTRATION_PRINCIPAL_HEADER = 'x-demonstration-seed-principal';
const OWNER_PRINCIPAL = 'owner';

/**
 * The seed-only identity verifier. It exists only inside the seed's own
 * short-lived process, is reachable only through its loopback listener, and
 * accepts exactly the configured Workspace owner and the scenario personas,
 * each presented with the run's random token. Every other request is
 * unauthenticated.
 */
export class DemonstrationSeedIdentity implements ExternalIdentityVerifier {
  private readonly token: Buffer;

  constructor(
    private readonly input: {
      readonly token: string;
      readonly owner: ExternalPrincipal;
      readonly personas: readonly DemonstrationPersona[];
    },
  ) {
    if (input.token.length < 32)
      throw new Error('The demonstration seed token is too short.');
    // The two principal kinds never overlap: a persona is never the owner.
    if (input.owner.provider === DEMONSTRATION_PERSONA_PROVIDER)
      throw new Error('The owner cannot use the persona provider.');
    this.token = Buffer.from(input.token, 'utf8');
  }

  async verify(request: IdentityRequest): Promise<ExternalPrincipal> {
    const token = singleHeader(request, DEMONSTRATION_TOKEN_HEADER);
    const principal = singleHeader(request, DEMONSTRATION_PRINCIPAL_HEADER);
    if (!token || !principal || !this.sameToken(token))
      throw new UnauthorizedException();
    if (principal === OWNER_PRINCIPAL) return { ...this.input.owner };
    const persona = this.input.personas.find(
      (candidate) => candidate.key === principal,
    );
    if (!persona) throw new UnauthorizedException();
    return {
      provider: DEMONSTRATION_PERSONA_PROVIDER,
      subject: persona.subject,
      displayName: persona.displayName,
      email: persona.email,
    };
  }

  headersFor(principal: DemonstrationPrincipal): Record<string, string> {
    return {
      [DEMONSTRATION_TOKEN_HEADER]: this.input.token,
      [DEMONSTRATION_PRINCIPAL_HEADER]:
        principal.kind === 'owner' ? OWNER_PRINCIPAL : principal.persona.key,
    };
  }

  private sameToken(candidate: string): boolean {
    const value = Buffer.from(candidate, 'utf8');
    return (
      value.length === this.token.length && timingSafeEqual(value, this.token)
    );
  }
}

function singleHeader(
  request: IdentityRequest,
  name: string,
): string | undefined {
  const value = request.headers[name];
  return typeof value === 'string' && value ? value : undefined;
}

/**
 * Replaces the served deterministic-header path inside the seed's process:
 * whatever the process environment says, only the seed verifier decides.
 */
export class DemonstrationPrincipalAdapter extends VerifiedPrincipalAdapter {
  constructor(private readonly seedIdentity: DemonstrationSeedIdentity) {
    super(seedIdentity);
  }

  override resolve(request: VerifiedPrincipalRequest) {
    return this.seedIdentity.verify(request);
  }
}

/** Counts every attempted provider call; the seed composition expects none. */
export class ProviderCallLedger {
  private count = 0;

  record(): void {
    this.count += 1;
  }

  get attempts(): number {
    return this.count;
  }
}

/**
 * Invitation, invitation-acceptance and session-revocation adapters for the
 * seed's composition. Each records the attempt and fails closed without any
 * network call.
 */
export interface DemonstrationProviderAdapters {
  readonly invitations: WorkspaceInvitationProvider;
  readonly invitationAcceptance: InvitationAcceptanceProvider;
  readonly sessionRevoker: IdentitySessionRevoker;
}

export function failClosedProviderAdapters(
  ledger: ProviderCallLedger,
): DemonstrationProviderAdapters {
  const rejected = async (): Promise<ProviderInvitationResult> => {
    ledger.record();
    return { kind: 'rejected' };
  };
  return {
    invitations: { issue: rejected, inspect: rejected, revoke: rejected },
    invitationAcceptance: {
      async prove(): Promise<InvitationRecipientProof> {
        ledger.record();
        return { kind: 'unavailable' };
      },
      async prepare(): Promise<InvitationProofContext | undefined> {
        ledger.record();
        return undefined;
      },
    },
    sessionRevoker: {
      async revoke(): Promise<SessionRevocationOutcome> {
        ledger.record();
        return { status: 'retry_required' };
      },
    },
  };
}
