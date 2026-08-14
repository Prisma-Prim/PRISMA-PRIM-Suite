import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  ClerkIdentityAdapter,
  clerkGateway,
  type ClerkGateway,
} from './clerk-identity.adapter.js';

function request(headers: Record<string, string> = {}) {
  return {
    protocol: 'https',
    originalUrl: '/api/access/current-actor',
    method: 'GET',
    headers,
    get: (name: string) => (name === 'host' ? 'app.example.test' : undefined),
  };
}

describe('ClerkIdentityAdapter', () => {
  it('forwards the exact frontend origin as Clerk authorized parties', async () => {
    const authenticateRequest = vi.fn().mockResolvedValue({
      isAuthenticated: true,
      toAuth: () => ({ userId: 'user_123' }),
    });
    const gateway = clerkGateway(
      {
        authenticateRequest,
        users: { getUser: vi.fn() },
      },
      'https://suite.example.test',
    );
    const webRequest = new Request(
      'https://api.example.test/api/access/current-actor',
    );

    await gateway.authenticate(webRequest);

    expect(authenticateRequest).toHaveBeenCalledWith(webRequest, {
      authorizedParties: ['https://suite.example.test'],
    });
  });

  it('translates a verified Clerk identity into an External Principal', async () => {
    const gateway: ClerkGateway = {
      authenticate: vi.fn().mockResolvedValue({ userId: 'user_123' }),
      getUser: vi.fn().mockResolvedValue({
        firstName: 'Ada',
        lastName: 'Ionescu',
        primaryEmailAddress: { emailAddress: 'ada@example.test' },
      }),
    };
    const adapter = new ClerkIdentityAdapter(gateway);

    await expect(
      adapter.verify(request({ authorization: 'Bearer session' })),
    ).resolves.toEqual({
      provider: 'clerk',
      subject: 'user_123',
      displayName: 'Ada Ionescu',
      email: 'ada@example.test',
    });
  });

  it('fails closed without exposing provider details', async () => {
    const gateway: ClerkGateway = {
      authenticate: vi.fn().mockResolvedValue(null),
      getUser: vi.fn(),
    };
    const adapter = new ClerkIdentityAdapter(gateway);
    await expect(adapter.verify(request())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('uses the verified email when an invited user has no profile name', async () => {
    const gateway: ClerkGateway = {
      authenticate: vi.fn().mockResolvedValue({ userId: 'user_email_only' }),
      getUser: vi.fn().mockResolvedValue({
        firstName: null,
        lastName: null,
        primaryEmailAddress: { emailAddress: 'invitee@example.test' },
      }),
    };

    await expect(
      new ClerkIdentityAdapter(gateway).verify(request()),
    ).resolves.toEqual({
      provider: 'clerk',
      subject: 'user_email_only',
      displayName: 'invitee@example.test',
      email: 'invitee@example.test',
    });
  });
});
