import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/node-postgres';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { EXTERNAL_IDENTITY_VERIFIER } from '../access/external-identity-verifier.js';
import { AppModule } from '../app.module.js';
import { DATABASE } from '../database/database.constants.js';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';
import {
  createIdempotentCleanup,
  type OwnedResource,
} from '../database/owned-resource-cleanup.js';
import { createPostgresRestTestHarness } from '../database/postgres-rest-test-harness.js';
import { knowledgeInteractions } from '../database/schema/index.js';
import {
  ClerkIdentityAdapter,
  clerkGateway,
} from '../identity/clerk-identity.adapter.js';
import {
  KnowledgeIdentityVerifier,
  knowledgeClerkGateway,
} from './knowledge-identity.js';
import {
  createSignedKnowledgeIdentityFixture,
  resourceAudience,
  resourceSubject,
  resourceWebOrigin,
} from './knowledge-resource-identity.test-support.js';

const baseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = baseUrl ? describe : describe.skip;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a public identity fixture record.');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value)
    throw new Error('Expected a public identity fixture identifier.');
  return value;
}

withPostgres('Signed Knowledge resource HTTP identity', () => {
  const resources: OwnedResource[] = [];
  const cleanup = createIdempotentCleanup({
    resources,
    multipleFailuresMessage: 'Signed resource fixture cleanup failed.',
    failureAction: 'close',
  });
  const fixture = createSignedKnowledgeIdentityFixture();
  let app: INestApplication;
  let origin: string;
  let companyId: string;
  let membershipId: string;
  let connection: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    if (!baseUrl) throw new Error('TEST_DATABASE_URL is required.');
    const isolated = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: baseUrl,
      namePrefix: 'knowledge_resource',
    });
    resources.unshift({ name: 'isolated database', cleanup: isolated.close });
    const provision = await createPostgresRestTestHarness({
      databaseUrl: isolated.targetUrl,
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'clerk',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: resourceSubject,
        ACCESS_BOOTSTRAP_WORKSPACE_ID: '00000000-0000-4000-8000-000000011016',
        ACCESS_BOOTSTRAP_WORKSPACE_NAME:
          'Fictional resource identity Workspace',
        KNOWLEDGE_EVIDENCE_ENABLED: 'true',
      },
    });
    resources.unshift({
      name: 'provisioning application',
      cleanup: provision.close,
    });
    async function provisionCall(path: string, body?: unknown) {
      const response = await fetch(provision.origin + '/api' + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'x-test-external-provider': 'clerk',
          'x-test-external-subject': resourceSubject,
          'x-test-display-name': 'Synthetic Reader',
          'x-test-email': 'reader@example.test',
          'content-type': 'application/json',
          'idempotency-key': randomUUID(),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      expect(response.status).toBe(body === undefined ? 200 : 201);
      return object(await response.json());
    }
    const actor = await provisionCall('/access/current-actor');
    membershipId = text(actor.workspaceMembershipId);
    companyId = text(
      (
        await provisionCall('/companies', {
          displayName: 'Fictional resource identity Company',
        })
      ).id,
    );
    for (const path of [
      '/company-director-client-assignments',
      '/company-document-registrar-assignments',
      '/company-document-content-reader-assignments',
      '/knowledge/assignments/readers',
    ])
      await provisionCall(path, {
        companyId,
        workspaceMembershipId: actor.workspaceMembershipId,
      });
    await provision.close();

    vi.stubEnv('ACCESS_IDENTITY_MODE', 'clerk');
    vi.stubEnv('KNOWLEDGE_TOKEN_AUDIENCE', resourceAudience);
    const pool = new Pool({ connectionString: isolated.targetUrl });
    resources.unshift({
      name: 'signed application pool',
      cleanup: () => pool.end(),
    });
    connection = drizzle({ client: pool });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DATABASE)
      .useValue(connection)
      .overrideProvider(EXTERNAL_IDENTITY_VERIFIER)
      .useValue(
        new ClerkIdentityAdapter(
          clerkGateway(fixture.client, resourceWebOrigin),
        ),
      )
      .overrideProvider(KnowledgeIdentityVerifier)
      .useValue(
        new KnowledgeIdentityVerifier(
          knowledgeClerkGateway(fixture.client, {
            webOrigin: resourceWebOrigin,
            audience: resourceAudience,
          }),
        ),
      )
      .compile();
    app = module.createNestApplication();
    resources.unshift({
      name: 'signed application',
      cleanup: () => app.close(),
    });
    app.setGlobalPrefix('api');
    await app.init();
    await app.listen(0, '127.0.0.1');
    origin = await app.getUrl();
  });
  afterAll(async () => {
    try {
      await cleanup();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  function read(
    path: string,
    credential: string,
    {
      cookie = false,
      company = companyId,
    }: { cookie?: boolean; company?: string | null } = {},
  ) {
    return fetch(origin + '/api' + path, {
      headers: {
        ...(company ? { 'x-company-context-id': company } : {}),
        ...(cookie
          ? { cookie: '__session=' + credential }
          : { authorization: 'Bearer ' + credential }),
      },
    });
  }

  it('admits an ordinary no-audience Actor but rejects that credential at all resource reads without success attribution', async () => {
    const ordinary = fixture.token({ aud: undefined });
    const actor = await read('/access/current-actor', ordinary);
    expect(actor.status).toBe(200);
    expect(object(await actor.json()).activeCompany).toMatchObject({
      id: companyId,
    });
    for (const path of [
      '/knowledge/sources',
      '/knowledge/search?query=literal',
      '/knowledge/sources/10000000-0000-4000-8000-000000001016/passages/p1',
    ])
      expect((await read(path, ordinary)).status).toBe(401);
    expect(
      await connection
        .select({ operation: knowledgeInteractions.operation })
        .from(knowledgeInteractions),
    ).toEqual([]);
    for (const path of [
      '/knowledge/sources',
      '/knowledge/search?query=literal',
    ]) {
      const response = await read(path, fixture.token());
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ items: [], nextCursor: null });
    }
    expect(
      await connection
        .select({ operation: knowledgeInteractions.operation })
        .from(knowledgeInteractions)
        .orderBy(knowledgeInteractions.operation),
    ).toEqual([{ operation: 'list' }, { operation: 'search' }]);
  });

  it('rejects signed invalid audiences, bad party/key/expiry and cookie-only credentials without recording success', async () => {
    const before = await connection.select().from(knowledgeInteractions);
    for (const claims of [
      { aud: null },
      { aud: '' },
      { aud: [] },
      { aud: [''] },
      { aud: [resourceAudience, ''] },
      { aud: 42 },
      { aud: { resource: resourceAudience } },
      { aud: [resourceAudience, false] },
      { aud: 'https://other.example.test' },
      { azp: 'https://other.example.test' },
      { azp: undefined },
      { exp: 1 },
      { nbf: Math.floor(Date.now() / 1000) + 3600 },
    ])
      expect(
        (await read('/knowledge/sources', fixture.token(claims))).status,
      ).toBe(401);
    expect(
      (await read('/knowledge/sources', fixture.token({}, true))).status,
    ).toBe(401);
    expect(
      (await read('/knowledge/sources', fixture.token(), { cookie: true }))
        .status,
    ).toBe(401);
    expect(await connection.select().from(knowledgeInteractions)).toEqual(
      before,
    );
  });

  it('accepts matching audience arrays while preserving Company, Reader and native-content denials', async () => {
    const authorized = await read(
      '/knowledge/sources',
      fixture.token({
        aud: ['https://other.example.test', resourceAudience],
      }),
    );
    expect(authorized.status).toBe(200);
    expect(await authorized.json()).toEqual({ items: [], nextCursor: null });
    const before = await connection.select().from(knowledgeInteractions);
    expect(
      (await read('/knowledge/sources', fixture.token(), { company: null }))
        .status,
    ).toBe(403);
    expect(
      (
        await read('/knowledge/sources', fixture.token(), {
          company: '10000000-0000-4000-8000-000000001016',
        })
      ).status,
    ).toBe(403);
    for (const path of [
      '/knowledge/assignments/readers',
      '/company-document-content-reader-assignments',
    ]) {
      const response = await fetch(
        `${origin}/api${path}/${membershipId}/${companyId}`,
        {
          method: 'DELETE',
          headers: {
            authorization: 'Bearer ' + fixture.token({ aud: undefined }),
            'idempotency-key': randomUUID(),
          },
        },
      );
      expect(response.status).toBe(200);
      expect((await read('/knowledge/sources', fixture.token())).status).toBe(
        403,
      );
      const restore = await fetch(origin + '/api' + path, {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + fixture.token({ aud: undefined }),
          'idempotency-key': randomUUID(),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          companyId,
          workspaceMembershipId: membershipId,
        }),
      });
      expect(restore.status).toBe(201);
    }
    expect(await connection.select().from(knowledgeInteractions)).toEqual(
      before,
    );
    expect((await read('/knowledge/sources', fixture.token())).status).toBe(
      200,
    );
  });
});
