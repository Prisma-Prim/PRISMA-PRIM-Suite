import { UnauthorizedException } from '@nestjs/common';
import { afterEach, describe, expect, it } from 'vitest';
import type { VerifiedPrincipalRequest } from '../access/verified-principal.adapter.js';
import {
  DEMONSTRATION_PRINCIPAL_HEADER,
  DEMONSTRATION_TOKEN_HEADER,
  DemonstrationPrincipalAdapter,
  DemonstrationSeedIdentity,
  ProviderCallLedger,
  failClosedProviderAdapters,
} from './demonstration-identity.js';
import { DEMONSTRATION_PERSONAS } from './demonstration-scenario.js';

const TOKEN = 'a'.repeat(43);
const OWNER = {
  provider: 'clerk',
  subject: 'user_owner',
  displayName: 'Operator',
  email: 'operator@example.test',
};

function identity() {
  return new DemonstrationSeedIdentity({
    token: TOKEN,
    owner: OWNER,
    personas: DEMONSTRATION_PERSONAS,
  });
}

function request(
  headers: Record<string, string | string[] | undefined>,
): VerifiedPrincipalRequest {
  return {
    protocol: 'http',
    originalUrl: '/api/access/current-actor',
    method: 'GET',
    headers,
    get: (name) => {
      const value = headers[name.toLowerCase()];
      return typeof value === 'string' ? value : undefined;
    },
    header: (name) => {
      const value = headers[name.toLowerCase()];
      return typeof value === 'string' ? value : undefined;
    },
  };
}

const originalMode = process.env.ACCESS_IDENTITY_MODE;
const originalNodeEnvironment = process.env.NODE_ENV;

afterEach(() => {
  process.env.ACCESS_IDENTITY_MODE = originalMode;
  process.env.NODE_ENV = originalNodeEnvironment;
  if (originalMode === undefined) delete process.env.ACCESS_IDENTITY_MODE;
  if (originalNodeEnvironment === undefined) delete process.env.NODE_ENV;
});

describe('demonstration seed identity', () => {
  it('presents only the configured owner and the scenario personas', async () => {
    const seed = identity();
    await expect(
      seed.verify(request(seed.headersFor({ kind: 'owner' }))),
    ).resolves.toEqual(OWNER);
    const [ana] = DEMONSTRATION_PERSONAS;
    await expect(
      seed.verify(request(seed.headersFor({ kind: 'persona', persona: ana }))),
    ).resolves.toEqual({
      provider: 'demo-seed',
      subject: 'DEMO-persona-ana',
      displayName: 'Ana DEMO',
      email: 'ana.demo@example.test',
    });
  });

  it.each([
    ['no headers', {}],
    ['no token', { [DEMONSTRATION_PRINCIPAL_HEADER]: 'owner' }],
    [
      'another token of the same length',
      {
        [DEMONSTRATION_TOKEN_HEADER]: 'b'.repeat(43),
        [DEMONSTRATION_PRINCIPAL_HEADER]: 'owner',
      },
    ],
    [
      'a shorter token',
      {
        [DEMONSTRATION_TOKEN_HEADER]: 'a',
        [DEMONSTRATION_PRINCIPAL_HEADER]: 'owner',
      },
    ],
    [
      'a repeated token header',
      {
        [DEMONSTRATION_TOKEN_HEADER]: [TOKEN, TOKEN],
        [DEMONSTRATION_PRINCIPAL_HEADER]: 'owner',
      },
    ],
    [
      'an unknown principal',
      {
        [DEMONSTRATION_TOKEN_HEADER]: TOKEN,
        [DEMONSTRATION_PRINCIPAL_HEADER]: 'local-demonstration-user',
      },
    ],
    [
      'deterministic test headers',
      {
        'x-test-external-provider': 'clerk',
        'x-test-external-subject': 'user_owner',
        'x-test-display-name': 'Operator',
        'x-test-email': 'operator@example.test',
      },
    ],
  ])('refuses %s', async (_case, headers) => {
    await expect(identity().verify(request(headers))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refuses an owner that uses the persona provider and a weak token', () => {
    expect(
      () =>
        new DemonstrationSeedIdentity({
          token: TOKEN,
          owner: { ...OWNER, provider: 'demo-seed' },
          personas: DEMONSTRATION_PERSONAS,
        }),
    ).toThrow();
    expect(
      () =>
        new DemonstrationSeedIdentity({
          token: 'short',
          owner: OWNER,
          personas: DEMONSTRATION_PERSONAS,
        }),
    ).toThrow();
  });

  it('ignores the deterministic header mode inside the seed process', async () => {
    process.env.NODE_ENV = 'test';
    process.env.ACCESS_IDENTITY_MODE = 'test';
    const seed = identity();
    const adapter = new DemonstrationPrincipalAdapter(seed);
    await expect(
      adapter.resolve(
        request({
          'x-test-external-provider': 'local-demo',
          'x-test-external-subject': 'intruder',
          'x-test-display-name': 'Intruder',
          'x-test-email': 'intruder@example.test',
        }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      adapter.resolve(request(seed.headersFor({ kind: 'owner' }))),
    ).resolves.toEqual(OWNER);
  });

  it('fails every provider adapter closed and records each attempt', async () => {
    const ledger = new ProviderCallLedger();
    const adapters = failClosedProviderAdapters(ledger);
    const intent = {
      reference: 'reference',
      email: 'someone@example.test',
      expiresInDays: 7,
    };
    await expect(adapters.invitations.issue(intent)).resolves.toEqual({
      kind: 'rejected',
    });
    await expect(adapters.invitations.inspect(intent)).resolves.toEqual({
      kind: 'rejected',
    });
    await expect(adapters.invitations.revoke(intent)).resolves.toEqual({
      kind: 'rejected',
    });
    await expect(
      adapters.invitationAcceptance.prove({
        principal: OWNER,
        invitation: { reference: 'reference', providerId: null, email: '' },
      }),
    ).resolves.toEqual({ kind: 'unavailable' });
    await expect(
      adapters.invitationAcceptance.prepare('reference'),
    ).resolves.toBeUndefined();
    await expect(
      adapters.sessionRevoker.revoke({ provider: 'clerk', subject: 'user' }),
    ).resolves.toEqual({ status: 'retry_required' });
    expect(ledger.attempts).toBe(6);
  });
});
