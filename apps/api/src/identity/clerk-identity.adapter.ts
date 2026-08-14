import { createClerkClient } from '@clerk/backend';
import { Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import type { ExternalPrincipal } from '../access/access.types.js';
import type { IdentityRequest } from '../access/external-identity-verifier.js';
import { identityConfiguration } from './identity-configuration.js';

interface ClerkUserProfile {
  firstName: string | null;
  lastName: string | null;
  primaryEmailAddress: { emailAddress: string } | null;
}

export interface ClerkGateway {
  authenticate(request: Request): Promise<{ userId: string } | null>;
  getUser(userId: string): Promise<ClerkUserProfile>;
}

interface ClerkClientGateway {
  authenticateRequest(
    request: Request,
    options: { authorizedParties: string[] },
  ): Promise<{
    isAuthenticated: boolean;
    toAuth(): { userId: string | null } | null;
  }>;
  users: { getUser(userId: string): Promise<ClerkUserProfile> };
}

export function clerkGateway(
  client: ClerkClientGateway,
  webOrigin: string,
): ClerkGateway {
  return {
    async authenticate(request) {
      const state = await client.authenticateRequest(request, {
        authorizedParties: [webOrigin],
      });
      if (!state.isAuthenticated) return null;
      const auth = state.toAuth();
      return auth?.userId ? { userId: auth.userId } : null;
    },
    getUser: (userId) => client.users.getUser(userId),
  };
}

function productionGateway(): ClerkGateway {
  const { secretKey, publishableKey, webOrigin } = identityConfiguration();
  const client = createClerkClient({ secretKey, publishableKey });
  return clerkGateway(
    {
      authenticateRequest: (request, options) =>
        client.authenticateRequest(request, options),
      users: client.users,
    },
    webOrigin,
  );
}

@Injectable()
export class ClerkIdentityAdapter {
  constructor(@Optional() private readonly gateway?: ClerkGateway) {}

  async verify(request: IdentityRequest): Promise<ExternalPrincipal> {
    try {
      const url = `${request.protocol}://${request.get('host') ?? 'localhost'}${request.originalUrl}`;
      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers)) {
        if (Array.isArray(value))
          value.forEach((item) => headers.append(name, item));
        else if (value) headers.set(name, value);
      }
      const webRequest = new Request(url, { method: request.method, headers });
      const gateway = this.gateway ?? productionGateway();
      const identity = await gateway.authenticate(webRequest);
      if (!identity) throw new UnauthorizedException();
      const user = await gateway.getUser(identity.userId);
      const email = user.primaryEmailAddress?.emailAddress?.trim();
      const profileName = [user.firstName, user.lastName]
        .filter(Boolean)
        .join(' ')
        .trim();
      if (!email) throw new UnauthorizedException();
      return {
        provider: 'clerk',
        subject: identity.userId,
        displayName: profileName || email,
        email,
      };
    } catch {
      throw new UnauthorizedException();
    }
  }
}
