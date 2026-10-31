import { verifyToken } from '@clerk/backend';
import { UnauthorizedException } from '@nestjs/common';
import { generateKeyPairSync, sign } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  KnowledgeIdentityVerifier,
  knowledgeClerkGateway,
  type KnowledgeClerkClient,
} from './knowledge-identity.js';

const audience = 'https://prisma.example.test/api/knowledge';
const webOrigin = 'https://prisma.example.test';
const issuerKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const foreignKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicKey = issuerKeys.publicKey
  .export({ type: 'spki', format: 'pem' })
  .toString();

function jwt(overrides: Record<string, unknown> = {}, foreign = false): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'fixture-key' }),
  ).toString('base64url');
  const body = Buffer.from(
    JSON.stringify({
      sub: 'user_fixture',
      sid: 'sess_fixture',
      iss: 'https://fixture.clerk.accounts.dev',
      aud: audience,
      azp: webOrigin,
      iat: now,
      nbf: now - 1,
      exp: now + 300,
      ...overrides,
    }),
  ).toString('base64url');
  const unsigned = `${header}.${body}`;
  return `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), foreign ? foreignKeys.privateKey : issuerKeys.privateKey).toString('base64url')}`;
}
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

/** The existing Clerk SDK verifies actual signed fixtures; no custom JWT validator. */
function fixtureGateway() {
  const authenticateRequest: KnowledgeClerkClient['authenticateRequest'] =
    async (request, options) => {
      const token =
        request.headers.get('authorization')?.slice('Bearer '.length) ?? '';
      const checked = await verifyToken(token, {
        jwtKey: publicKey,
        audience: options.audience,
        authorizedParties: options.authorizedParties,
        clockSkewInMs: 0,
      });
      return { isAuthenticated: true, toAuth: () => ({ userId: checked.sub }) };
    };
  const client: KnowledgeClerkClient = {
    authenticateRequest,
    users: {
      getUser: async () => ({
        firstName: 'Synthetic',
        lastName: 'Reader',
        primaryEmailAddress: { emailAddress: 'reader@example.test' },
      }),
    },
  };
  return knowledgeClerkGateway(client, { audience, webOrigin });
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

  it.each([
    ['another audience', { aud: 'https://other.example.test' }, false],
    ['an unapproved party', { azp: 'https://other.example.test' }, false],
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
