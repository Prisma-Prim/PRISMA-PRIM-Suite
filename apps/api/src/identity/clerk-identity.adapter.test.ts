import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  ClerkIdentityAdapter,
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
});
