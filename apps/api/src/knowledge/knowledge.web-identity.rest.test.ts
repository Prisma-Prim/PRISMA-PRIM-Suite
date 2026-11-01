import { verifyToken } from '@clerk/backend';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../app.module.js';
import { EXTERNAL_IDENTITY_VERIFIER } from '../access/external-identity-verifier.js';
import { DATABASE } from '../database/database.constants.js';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';
import { createPostgresRestTestHarness } from '../database/postgres-rest-test-harness.js';
import {
  ClerkIdentityAdapter,
  clerkGateway,
} from '../identity/clerk-identity.adapter.js';
import {
  KnowledgeIdentityVerifier,
  knowledgeClerkGateway,
  type KnowledgeClerkClient,
} from './knowledge-identity.js';

const baseUrl = process.env.TEST_DATABASE_URL,
  withPostgres = baseUrl ? describe : describe.skip;
const webOrigin = 'https://web.example.test',
  audience = 'https://resource.example.test/api/knowledge';
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 }),
  foreign = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicKey = keys.publicKey
  .export({ type: 'spki', format: 'pem' })
  .toString();
function token(claims: Record<string, unknown> = {}, wrongKey = false) {
  const now = Math.floor(Date.now() / 1000),
    header = Buffer.from(
      JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'synthetic' }),
    ).toString('base64url'),
    payload = Buffer.from(
      JSON.stringify({
        sub: 'signed-web-reader',
        sid: 'synthetic-session',
        iss: 'https://fixture.clerk.accounts.dev',
        azp: webOrigin,
        iat: now,
        nbf: now - 1,
        exp: now + 300,
        ...claims,
      }),
    ).toString('base64url'),
    unsigned = header + '.' + payload;
  return (
    unsigned +
    '.' +
    sign(
      'RSA-SHA256',
      Buffer.from(unsigned),
      wrongKey ? foreign.privateKey : keys.privateKey,
    ).toString('base64url')
  );
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected native record.');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value)
    throw new Error('Expected native identity.');
  return value;
}
function gateways() {
  const users = {
    getUser: async () => ({
      firstName: 'Synthetic',
      lastName: 'Reader',
      primaryEmailAddress: { emailAddress: 'signed-reader@example.test' },
    }),
  };
  const authenticateRequest: (
    request: Request,
    options: { authorizedParties: string[]; audience?: string },
  ) => ReturnType<KnowledgeClerkClient['authenticateRequest']> = async (
    request,
    options,
  ) => {
    const credential =
      request.headers.get('authorization')?.slice(7) ??
      request.headers.get('cookie')?.replace(/^__session=/u, '') ??
      '';
    const checked = await verifyToken(credential, {
      jwtKey: publicKey,
      authorizedParties: options.authorizedParties,
      ...('audience' in options ? { audience: options.audience } : {}),
      clockSkewInMs: 0,
    });
    return {
      isAuthenticated: true,
      toAuth: () => ({ userId: checked.sub, sessionClaims: checked }),
    };
  };
  const client = { users, authenticateRequest };
  return {
    web: clerkGateway(client, webOrigin),
    resource: knowledgeClerkGateway(client, { webOrigin, audience }),
  };
}
afterEach(() => vi.unstubAllEnvs());
withPostgres('Signed web/resource Knowledge HTTP identity separation', () => {
  it('admits an ordinary signed web Actor only at the three web adapters and keeps resource audience/party/key/expiry enforcement', async () => {
    if (!baseUrl) throw new Error('TEST_DATABASE_URL required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: baseUrl,
      namePrefix: 'knowledge_web_identity',
    });
    const fixtureHeaders = {
      'x-test-external-provider': 'clerk',
      'x-test-external-subject': 'signed-web-reader',
      'x-test-display-name': 'Synthetic Reader',
      'x-test-email': 'signed-reader@example.test',
    };
    let provision:
      Awaited<ReturnType<typeof createPostgresRestTestHarness>> | undefined;
    const pool = new Pool({ connectionString: database.targetUrl });
    let app: INestApplication | undefined;
    try {
      provision = await createPostgresRestTestHarness({
        databaseUrl: database.targetUrl,
        environment: {
          NODE_ENV: 'test',
          ACCESS_IDENTITY_MODE: 'test',
          ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'clerk',
          ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'signed-web-reader',
          ACCESS_BOOTSTRAP_WORKSPACE_ID: '00000000-0000-4000-8000-000000011015',
          ACCESS_BOOTSTRAP_WORKSPACE_NAME:
            'Synthetic signed identity Workspace',
          KNOWLEDGE_EVIDENCE_ENABLED: 'true',
        },
      });
      async function call(path: string, body?: unknown) {
        if (!provision) throw new Error('Missing provision harness.');
        const response = await fetch(provision.origin + '/api' + path, {
          method: body ? 'POST' : 'GET',
          headers: {
            ...fixtureHeaders,
            'content-type': 'application/json',
            'idempotency-key': randomUUID(),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        expect(response.status).toBe(body ? 201 : 200);
        return object(await response.json());
      }
      const member = await call('/access/current-actor'),
        company = await call('/companies', {
          displayName: 'Synthetic signed Company',
        }),
        companyId = text(company.id);
      for (const path of [
        '/company-director-client-assignments',
        '/company-document-registrar-assignments',
        '/company-document-content-reader-assignments',
        '/knowledge/assignments/readers',
      ])
        await call(path, {
          companyId,
          workspaceMembershipId: member.workspaceMembershipId,
        });
      await provision.close();
      provision = undefined;
      vi.stubEnv('ACCESS_IDENTITY_MODE', 'clerk');
      vi.stubEnv('KNOWLEDGE_TOKEN_AUDIENCE', audience);
      const gateway = gateways();
      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DATABASE)
        .useValue(drizzle({ client: pool }))
        .overrideProvider(EXTERNAL_IDENTITY_VERIFIER)
        .useValue(new ClerkIdentityAdapter(gateway.web))
        .overrideProvider(KnowledgeIdentityVerifier)
        .useValue(new KnowledgeIdentityVerifier(gateway.resource))
        .compile();
      app = module.createNestApplication();
      app.setGlobalPrefix('api');
      await app.init();
      await app.listen(0, '127.0.0.1');
      const origin = await app.getUrl();
      async function read(path: string, credential = token(), cookie = false) {
        return fetch(origin + '/api' + path, {
          headers: {
            'x-company-context-id': companyId,
            ...(cookie
              ? { cookie: '__session=' + credential }
              : { authorization: 'Bearer ' + credential }),
          },
        });
      }
      for (const path of [
        '/knowledge/evidence/sources',
        '/knowledge/evidence/search?query=literal',
      ]) {
        const response = await read(path);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ items: [], nextCursor: null });
      }
      const unknown =
        '/sources/10000000-0000-4000-8000-000000001015/passages/p1';
      expect((await read('/knowledge/evidence' + unknown)).status).toBe(404);
      expect((await read('/knowledge/sources')).status).toBe(401);
      expect((await read('/knowledge/search?query=literal')).status).toBe(401);
      expect((await read('/knowledge' + unknown)).status).toBe(401);
      expect(
        (await read('/knowledge/evidence/sources', token(), true)).status,
      ).toBe(200);
      expect(
        (await read('/knowledge/sources', token({ aud: audience }), true))
          .status,
      ).toBe(401);
      expect(
        (await read('/knowledge/sources', token({ aud: audience }))).status,
      ).toBe(200);
      for (const credential of [
        token({ azp: 'https://foreign.example.test' }),
        token({ exp: 1 }),
        token({}, true),
      ])
        expect(
          (await read('/knowledge/evidence/sources', credential)).status,
        ).toBe(401);
      expect(
        (
          await read(
            '/knowledge/sources',
            token({ aud: 'https://foreign.example.test' }),
          )
        ).status,
      ).toBe(401);
    } finally {
      await app?.close();
      await provision?.close();
      await pool.end();
      await database.close();
    }
  });
});
