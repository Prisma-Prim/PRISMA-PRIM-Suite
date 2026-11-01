import { UnauthorizedException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ClerkIdentityAdapter,
  clerkGateway,
} from '../identity/clerk-identity.adapter.js';
import {
  createSignedKnowledgeIdentityFixture,
  resourceAudience as audience,
  resourceWebOrigin as webOrigin,
} from './knowledge-resource-identity.test-support.js';
import {
  KnowledgeIdentityVerifier,
  knowledgeClerkGateway,
  type KnowledgeClerkClient,
} from './knowledge-identity.js';

const fixture = createSignedKnowledgeIdentityFixture();
const jwt = fixture.token;
function request(authorization?: string) {
  const headers = authorization === undefined ? {} : { authorization };
  return {
    protocol: 'https',
    originalUrl: '/api/knowledge/sources',
    method: 'GET',
    headers,
    get: (name: string) =>
      name.toLowerCase() === 'host'
        ? 'prisma.example.test'
        : name.toLowerCase() === 'authorization'
          ? authorization
          : undefined,
  };
}

function fixtureGateway() {
  return knowledgeClerkGateway(fixture.client, { audience, webOrigin });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('Knowledge resource identity', () => {
  it('forwards the fixed resource audience and existing authorized web party to Clerk', async () => {
    const authenticateRequest = vi
      .fn<KnowledgeClerkClient['authenticateRequest']>()
      .mockResolvedValue({ isAuthenticated: false, toAuth: () => null });
    const gateway = knowledgeClerkGateway(
      {
        authenticateRequest,
        users: {
          getUser: async () => ({
            firstName: null,
            lastName: null,
            primaryEmailAddress: null,
          }),
        },
      },
      { audience, webOrigin },
    );
    const webRequest = new Request(`${audience}/sources`);
    await gateway.authenticate(webRequest);
    expect(authenticateRequest).toHaveBeenCalledWith(webRequest, {
      authorizedParties: [webOrigin],
      audience,
    });
  });

  it('accepts a correctly signed, scoped synthetic PRISMA bearer through the existing identity adapter', async () => {
    vi.stubEnv('KNOWLEDGE_TOKEN_AUDIENCE', audience);
    await expect(
      new KnowledgeIdentityVerifier(fixtureGateway()).verify(
        request(`Bearer ${jwt()}`),
      ),
    ).resolves.toEqual({
      provider: 'clerk',
      subject: 'user_fixture',
      displayName: 'Synthetic Reader',
      email: 'reader@example.test',
    });
  });

  it('keeps an ordinary signed no-audience identity out of the resource boundary', async () => {
    vi.stubEnv('KNOWLEDGE_TOKEN_AUDIENCE', audience);
    const ordinaryRequest = request(`Bearer ${jwt({ aud: undefined })}`);
    await expect(
      new ClerkIdentityAdapter(clerkGateway(fixture.client, webOrigin)).verify(
        ordinaryRequest,
      ),
    ).resolves.toMatchObject({ subject: 'user_fixture' });
    await expect(
      new KnowledgeIdentityVerifier(fixtureGateway()).verify(ordinaryRequest),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it.each([
    ['null', null],
    ['an empty string', ''],
    ['an empty array', []],
    ['empty array entries', ['']],
    ['an empty entry alongside the exact resource', [audience, '']],
    ['a number', 42],
    ['a boolean', false],
    ['an object', { resource: audience }],
    ['mixed array entries', [audience, 42]],
    ['nested arrays', [[audience]]],
    ['a partial match', audience + '/other'],
  ])('rejects a signed audience represented as %s', async (_name, aud) => {
    vi.stubEnv('KNOWLEDGE_TOKEN_AUDIENCE', audience);
    await expect(
      new KnowledgeIdentityVerifier(fixtureGateway()).verify(
        request(`Bearer ${jwt({ aud })}`),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it.each([
    { aud: [audience] },
    { aud: ['https://other.example.test', audience] },
  ])(
    'accepts an exact resource audience within a supported array: %j',
    async ({ aud }) => {
      vi.stubEnv('KNOWLEDGE_TOKEN_AUDIENCE', audience);
      await expect(
        new KnowledgeIdentityVerifier(fixtureGateway()).verify(
          request(`Bearer ${jwt({ aud })}`),
        ),
      ).resolves.toMatchObject({ subject: 'user_fixture' });
    },
  );

  it.each([
    { sessionClaims: undefined },
    { sessionClaims: null },
    { sessionClaims: 'unknown' },
    { sessionClaims: [] },
    { sessionClaims: {} },
  ])(
    'fails closed if an authenticated SDK interop result loses its verified claims: %j',
    async ({ sessionClaims }) => {
      vi.stubEnv('KNOWLEDGE_TOKEN_AUDIENCE', audience);
      const client: KnowledgeClerkClient = {
        ...fixture.client,
        async authenticateRequest(webRequest, options) {
          const state = await fixture.client.authenticateRequest(
            webRequest,
            options,
          );
          return {
            isAuthenticated: state.isAuthenticated,
            toAuth: () => {
              const auth = state.toAuth();
              return auth ? { userId: auth.userId, sessionClaims } : null;
            },
          };
        },
      };
      await expect(
        new KnowledgeIdentityVerifier(
          knowledgeClerkGateway(client, { audience, webOrigin }),
        ).verify(request(`Bearer ${jwt()}`)),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    },
  );

  it.each([
    ['another audience', { aud: 'https://other.example.test' }, false],
    ['an unapproved party', { azp: 'https://other.example.test' }, false],
    ['an absent party', { azp: undefined }, false],
    ['expired', { exp: 1 }, false],
    ['a future validity', { nbf: Math.floor(Date.now() / 1000) + 3600 }, false],
    [
      'a foreign issuer key',
      { iss: 'https://foreign.clerk.accounts.dev' },
      true,
    ],
  ])(
    'rejects %s without accepting the untrusted principal',
    async (_name, claims, foreign) => {
      vi.stubEnv('KNOWLEDGE_TOKEN_AUDIENCE', audience);
      await expect(
        new KnowledgeIdentityVerifier(fixtureGateway()).verify(
          request(`Bearer ${jwt(claims, foreign)}`),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    },
  );

  it.each([
    undefined,
    '',
    'cookie-session',
    'Bearer ',
    'Bearer token with spaces',
  ])(
    'requires an explicit bearer instead of credential discovery: %s',
    async (authorization) => {
      vi.stubEnv('KNOWLEDGE_TOKEN_AUDIENCE', audience);
      await expect(
        new KnowledgeIdentityVerifier(fixtureGateway()).verify(
          request(authorization),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    },
  );

  it('fails closed when the resource audience is not configured', async () => {
    vi.stubEnv('KNOWLEDGE_TOKEN_AUDIENCE', '');
    await expect(
      new KnowledgeIdentityVerifier(fixtureGateway()).verify(
        request(`Bearer ${jwt()}`),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
