import { createClerkClient } from '@clerk/backend';
import {
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { AccessService } from '../access/access.service.js';
import type { ActorContextRequest } from '../access/actor-context.adapter.js';
import type { ExternalPrincipal } from '../access/access.types.js';
import type { IdentityRequest } from '../access/external-identity-verifier.js';
import { VerifiedPrincipalAdapter } from '../access/verified-principal.adapter.js';
import {
  ClerkIdentityAdapter,
  clerkGateway,
  type ClerkGateway,
} from '../identity/clerk-identity.adapter.js';
import { identityConfiguration } from '../identity/identity-configuration.js';

type ClerkOwnerClient = Parameters<typeof clerkGateway>[0];
export interface KnowledgeClerkClient {
  authenticateRequest(
    request: Request,
    options: { authorizedParties: string[]; audience: string },
  ): Promise<{
    isAuthenticated: boolean;
    // Clerk exposes the cryptographically verified payload here. Keep its
    // resource-specific representation unknown until this boundary checks it.
    toAuth(): { userId: string | null; sessionClaims?: unknown } | null;
  }>;
  users: ClerkOwnerClient['users'];
}
export const KNOWLEDGE_IDENTITY_GATEWAY = Symbol('KNOWLEDGE_IDENTITY_GATEWAY');

/** Resource-specific verification does not widen the ordinary web identity flow. */
export function knowledgeClerkGateway(
  client: KnowledgeClerkClient,
  configuration: { webOrigin: string; audience: string },
): ClerkGateway {
  return clerkGateway(
    {
      authenticateRequest: async (request, options) => {
        const state = await client.authenticateRequest(request, {
          ...options,
          audience: configuration.audience,
        });
        // Clerk skips its audience comparison for absent/empty aud claims.
        // Require the configured resource audience after SDK authentication.
        if (
          state.isAuthenticated &&
          !hasResourceAudience(
            state.toAuth()?.sessionClaims,
            configuration.audience,
          )
        )
          throw new UnauthorizedException();
        return state;
      },
      users: client.users,
    },
    configuration.webOrigin,
  );
}

function hasResourceAudience(claims: unknown, expected: string): boolean {
  if (!claims || typeof claims !== 'object' || !('aud' in claims)) return false;
  const audience = claims.aud;
  return (
    audience === expected ||
    (Array.isArray(audience) &&
      audience.every(
        (item: unknown) => typeof item === 'string' && item.length > 0,
      ) &&
      audience.includes(expected))
  );
}

@Injectable()
export class KnowledgeIdentityVerifier {
  constructor(
    @Optional()
    @Inject(KNOWLEDGE_IDENTITY_GATEWAY)
    private readonly gateway?: ClerkGateway,
  ) {}

  async verify(request: IdentityRequest): Promise<ExternalPrincipal> {
    const audience = process.env.KNOWLEDGE_TOKEN_AUDIENCE;
    if (!audience || audience.length > 2048 || !audience.trim())
      throw new UnauthorizedException();
    const authorization = request.get('authorization');
    if (!authorization || !/^Bearer [^\s]+$/u.test(authorization))
      throw new UnauthorizedException();
    if (this.gateway)
      return new ClerkIdentityAdapter(this.gateway).verify(request);
    const configuration = identityConfiguration();
    const client = createClerkClient({
      secretKey: configuration.secretKey,
      publishableKey: configuration.publishableKey,
    });
    const adapter = new ClerkIdentityAdapter(
      knowledgeClerkGateway(client, {
        webOrigin: configuration.webOrigin,
        audience,
      }),
    );
    return adapter.verify(request);
  }
}

@Injectable()
export class KnowledgeActorGuard implements CanActivate {
  constructor(
    private readonly identity: KnowledgeIdentityVerifier,
    private readonly access: AccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ActorContextRequest>();
    // Reuse the existing narrowly gated deterministic test/demo identity path.
    // In production this always calls the resource-specific cryptographic verifier.
    const principal = await new VerifiedPrincipalAdapter(this.identity).resolve(
      request,
    );
    request.actorContext = await this.access.resolveActor(principal, {
      workspaceId: request.header('x-workspace-context-id'),
      companyId: request.header('x-company-context-id'),
    });
    return true;
  }
}
