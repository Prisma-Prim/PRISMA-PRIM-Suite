import { randomUUID } from 'node:crypto';
import { strToU8, zipSync } from 'fflate';
import { createPlanHttpFixture } from '../dossier-harness/plan-http.test-support.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';
import {
  createKnowledgeDocumentFixture,
  startKnowledgeScanner,
} from '../knowledge/knowledge.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const workspaceId = '00000000-0000-4000-8000-000000007434';
const identity = {
  'x-test-external-provider': 'deterministic-test',
  'x-test-external-subject': 'dossier-owner',
  'x-test-display-name': 'Dossier Owner',
  'x-test-email': 'dossier-owner@example.test',
};
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected object');
  return Object.fromEntries(Object.entries(value));
}
function string(value: unknown): string {
  if (typeof value !== 'string' || !value)
    throw new Error('Expected nonempty string');
  return value;
}
function array(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error('Expected array');
  return value.map(object);
}

describe.skipIf(!databaseUrl)(
  'Subscription dossier harness native public acceptance',
  () => {
    let protocol: Awaited<ReturnType<typeof createPlanHttpFixture>>;
    let database: IsolatedPostgresTestDatabase;
    let harness: PostgresRestTestHarness;
    let scanner: Awaited<ReturnType<typeof startKnowledgeScanner>>;
    let companyId = '';
    let projectId = '';
    let documentId = '';
    let documentVersionId = '';
    let missingDocumentId = '';
    let representationId = '';
    let prefix = '';
    async function call(
      path: string,
      options: {
        method?: string;
        body?: unknown;
        key?: string;
        company?: string;
        subject?: string;
      } = {},
    ) {
      return fetch(`${harness.origin}/api${path}`, {
        method: options.method ?? 'GET',
        headers: {
          ...identity,
          ...(options.subject
            ? {
                'x-test-external-subject': options.subject,
                'x-test-email': `${options.subject}@example.test`,
              }
            : {}),
          ...((options.company ?? companyId)
            ? { 'x-company-context-id': options.company ?? companyId }
            : {}),
          'content-type': 'application/json',
          'idempotency-key': options.key ?? randomUUID(),
        },
        ...(options.body === undefined
          ? {}
          : { body: JSON.stringify(options.body) }),
      });
    }
    async function command(
      path: string,
      body: unknown,
      status = 201,
      key?: string,
    ) {
      const response = await call(path, { method: 'POST', body, key });
      expect(response.status, `${path}: ${await response.clone().text()}`).toBe(
        status,
      );
      return object(await response.json());
    }
    beforeAll(async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required');
      database = await createIsolatedPostgresTestDatabase({
        baseDatabaseUrl: databaseUrl,
        namePrefix: 'dossier_acceptance',
      });
      scanner = await startKnowledgeScanner();
      protocol = await createPlanHttpFixture();
      harness = await createPostgresRestTestHarness({
        databaseUrl: database.targetUrl,
        synchronizeIdentityProfile: false,
        planHttp: protocol.transport,
        environment: {
          ...scanner.environment,
          NODE_ENV: 'test',
          DOSSIER_HARNESS_ENABLED: 'true',
          CHATGPT_PLAN_CLIENT_ID: 'fictional-client',
          CHATGPT_PLAN_REDIRECT_URI: 'http://127.0.0.1:5173/chatgpt/callback',
          DOSSIER_HARNESS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString(
            'base64',
          ),
          ACCESS_IDENTITY_MODE: 'test',
          ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
          ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'dossier-owner',
          ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
          ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Synthetic Analysis',
          ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify([
            {
              provider: 'deterministic-test',
              subject: 'dossier-reader',
              workspaceId,
            },
          ]),
        },
      });
      const actorResponse = await call('/access/current-actor');
      expect(actorResponse.status, await actorResponse.clone().text()).toBe(
        200,
      );
      const actor = object(await actorResponse.json());
      const membershipId = string(actor.workspaceMembershipId);
      companyId = string(
        (
          await command('/companies', {
            displayName: 'Synthetic Analysis Company',
          })
        ).id,
      );
      const readerResponse = await call('/access/current-actor', {
        subject: 'dossier-reader',
        company: '',
      });
      expect(readerResponse.status, await readerResponse.clone().text()).toBe(
        200,
      );
      const readerMembership = string(
        object(await readerResponse.json()).workspaceMembershipId,
      );
      for (const bundle of [
        'context',
        'director-client',
        'project',
        'document-registrar',
        'document-content-reader',
      ])
        await command(`/company-${bundle}-assignments`, {
          companyId,
          workspaceMembershipId: readerMembership,
        });
      const fixture = await createKnowledgeDocumentFixture({
        origin: harness.origin,
        companyId,
        membershipId,
        callerHeaders: identity,
        passageText: 'Tax ID: RO12345678',
      });
      ({ documentId, documentVersionId, representationId } = fixture);
      for (const path of [
        '/company-project-assignments',
        '/company-document-project-organizer-assignments',
      ])
        await command(path, { companyId, workspaceMembershipId: membershipId });
      const document = object(
        await (await call(`/documents/${documentId}`)).json(),
      );
      projectId = string(
        (
          await command('/projects', {
            title: 'Fictional dossier',
            clientAccountId: string(document.clientId),
          })
        ).id,
      );
      await command(`/documents/${documentId}/project-association`, {
        action: 'link',
        projectId,
        expectedRevision: 0,
      });
      const missing = await command('/documents', {
        clientId: string(document.clientId),
        title: 'Fictional missing source',
        purpose: 'Explicitly unselected evidence',
        url: 'https://example.test/missing',
      });
      missingDocumentId = string(missing.id);
      await command(`/documents/${missingDocumentId}/project-association`, {
        action: 'link',
        projectId,
        expectedRevision: 0,
      });
      prefix = `/projects/${projectId}/dossier-analysis`;
    }, 120_000);
    afterAll(async () => {
      await harness?.close();
      await database?.close();
      await scanner?.close();
    });

    it('connects, checkpoints and caches cited reviews, and resumes after quota', async () => {
      const source = await command(`${prefix}/sources`, {
        documentId,
        documentVersionId,
        representationId,
        language: 'ro',
      });
      const runId = string((await command(`${prefix}/runs`, {})).id);
      const initial = await call(`${prefix}/harness`);
      expect(initial.status).toBe(200);
      expect(object(await initial.json()).state).toBe('disconnected');
      const expiredStart = await command(`${prefix}/harness/connect`, {});
      const expiredUrl = new URL(string(expiredStart.authorizationUrl));
      await database.targetPool.query(
        "UPDATE dossier_harness_authorizations SET expires_at = now() - interval '1 second'",
      );
      expect(
        (
          await call(`${prefix}/harness/connect/complete`, {
            method: 'POST',
            body: {
              state: expiredStart.state,
              code: expiredUrl.searchParams.get('nonce'),
            },
          })
        ).status,
      ).toBe(409);
      expect(object(await (await call(`${prefix}/harness`)).json()).state).toBe(
        'disconnected',
      );
      const noGrantStart = await command(`${prefix}/harness/connect`, {});
      const noGrantUrl = new URL(string(noGrantStart.authorizationUrl));
      protocol.controls.grant = false;
      expect(
        (
          await call(`${prefix}/harness/connect/complete`, {
            method: 'POST',
            body: {
              state: noGrantStart.state,
              code: noGrantUrl.searchParams.get('nonce'),
            },
          })
        ).status,
      ).toBe(503);
      expect(object(await (await call(`${prefix}/harness`)).json()).state).toBe(
        'disconnected',
      );
      protocol.controls.grant = true;
      const wrongNonceStart = await command(`${prefix}/harness/connect`, {});
      expect(
        (
          await call(`${prefix}/harness/connect/complete`, {
            method: 'POST',
            body: {
              state: wrongNonceStart.state,
              code: 'wrong-nonce',
            },
          })
        ).status,
      ).toBe(503);
      expect(object(await (await call(`${prefix}/harness`)).json()).state).toBe(
        'disconnected',
      );
      const started = await command(`${prefix}/harness/connect`, {});
      protocol.controls.expiresIn = 1;
      const url = new URL(string(started.authorizationUrl));
      expect(url.origin).toBe('https://auth.openai.com');
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      const body = {
        state: string(started.state),
        code: string(url.searchParams.get('nonce')),
      };
      expect(
        (
          await call(`${prefix}/harness/connect/complete`, {
            method: 'POST',
            body: { ...body, state: 'wrong' },
          })
        ).status,
      ).toBe(404);
      const connected = await command(
        `${prefix}/harness/connect/complete`,
        body,
      );
      expect(connected.state).toBe('connected');
      protocol.controls.expiresIn = 3600;
      expect(JSON.stringify(connected)).not.toContain('fictional-access');
      expect(
        (
          await call(`${prefix}/harness/connect/complete`, {
            method: 'POST',
            body,
          })
        ).status,
      ).toBe(404);
      const create = (language: string) =>
        command(`${prefix}/harness/jobs`, {
          runId,
          model: 'fixture-model',
          language,
        });
      const jobId = string((await create('ru')).id);
      const done = await command(`${prefix}/harness/jobs/${jobId}/advance`, {});
      expect(done.state).toBe('completed');
      expect(done.nextBatch).toBe(done.totalBatches);
      expect(array(done.proposals)).toHaveLength(1);
      expect(protocol.reviewCount()).toBe(1);
      expect(protocol.refreshCount()).toBe(1);
      expect(
        (await command(`${prefix}/harness/jobs/${jobId}/advance`, {})).state,
      ).toBe('completed');
      expect(protocol.reviewCount()).toBe(1);
      const cacheId = string((await create('ru')).id);
      const cached = await command(
        `${prefix}/harness/jobs/${cacheId}/advance`,
        {},
      );
      expect(cached.state).toBe('completed');
      expect(cached.cacheHits).toBe(1);
      expect(protocol.reviewCount()).toBe(1);
      const quotaId = string((await create('ro')).id);
      const listResponse = await call(`${prefix}/harness/jobs?runId=${runId}`);
      expect(listResponse.status).toBe(200);
      expect(array(object(await listResponse.json()).items)).toHaveLength(3);
      protocol.controls.failure = 'quota';
      expect(
        (await command(`${prefix}/harness/jobs/${quotaId}/advance`, {})).state,
      ).toBe('quota');
      const before = protocol.reviewCount();
      expect(
        (
          await call(`${prefix}/harness/jobs/${quotaId}/advance`, {
            method: 'POST',
            body: {},
          })
        ).status,
      ).toBe(409);
      expect(protocol.reviewCount()).toBe(before);
      protocol.controls.failure = 'none';
      await command(`${prefix}/harness/jobs/${quotaId}/control`, {
        action: 'resume',
      });
      expect(
        (await command(`${prefix}/harness/jobs/${quotaId}/advance`, {})).state,
      ).toBe('completed');
      const imported = await command(
        `${prefix}/harness/jobs/${jobId}/import`,
        {},
      );
      expect(imported.ids).toEqual([expect.any(String)]);
      expect(
        await command(`${prefix}/harness/jobs/${jobId}/import`, {}),
      ).toEqual(imported);
      expect(
        object(await (await call(`${prefix}/harness/jobs/${jobId}`)).json())
          .imported,
      ).toBe(true);
      expect(
        (
          await call(`${prefix}/harness/jobs/${jobId}`, {
            subject: 'dossier-reader',
          })
        ).status,
      ).toBe(403);
      const badId = string((await create('en')).id);
      protocol.controls.failure = 'fabricated';
      const invalid = await command(
        `${prefix}/harness/jobs/${badId}/advance`,
        {},
      );
      expect(invalid.state).toBe('failed');
      expect(invalid.proposals).toEqual([]);
      protocol.controls.failure = 'none';
      let release: () => void = () => undefined;
      let entered: () => void = () => undefined;
      const blocked = new Promise<void>((resolve) => {
        release = resolve;
      });
      const startedReview = new Promise<void>((resolve) => {
        entered = resolve;
      });
      protocol.controls.wait = () => {
        entered();
        return blocked;
      };
      const concurrentId = string((await create('fr')).id);
      const advancing = call(`${prefix}/harness/jobs/${concurrentId}/advance`, {
        method: 'POST',
        body: {},
      });
      await startedReview;
      expect(
        (
          await call(`${prefix}/harness/jobs/${concurrentId}/advance`, {
            method: 'POST',
            body: {},
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await command(`${prefix}/harness/jobs/${concurrentId}/control`, {
            action: 'cancel',
          })
        ).state,
      ).toBe('cancelled');
      release();
      expect((await advancing).status).toBe(409);
      expect(
        object(
          await (await call(`${prefix}/harness/jobs/${concurrentId}`)).json(),
        ).proposals,
      ).toEqual([]);
      protocol.controls.wait = null;
      let releaseStale: () => void = () => undefined;
      let enteredStale: () => void = () => undefined;
      const blockedStale = new Promise<void>((resolve) => {
        releaseStale = resolve;
      });
      const startedStale = new Promise<void>((resolve) => {
        enteredStale = resolve;
      });
      protocol.controls.wait = () => {
        enteredStale();
        return blockedStale;
      };
      const staleId = string((await create('fr')).id);
      const staleAdvance = call(`${prefix}/harness/jobs/${staleId}/advance`, {
        method: 'POST',
        body: {},
      });
      await startedStale;
      expect(
        (
          await call(`${prefix}/sources/${string(source.id)}`, {
            method: 'DELETE',
          })
        ).status,
      ).toBe(200);
      releaseStale();
      expect((await staleAdvance).status).toBe(409);
      const stale = object(
        await (await call(`${prefix}/harness/jobs/${staleId}`)).json(),
      );
      expect(stale.stale).toBe(true);
      expect(stale.proposals).toEqual([]);
      protocol.controls.wait = null;
    }, 120_000);
    it('finishes the current native Word batch before pausing, then resumes and reuses every completed batch', async () => {
      const paragraphs = Array.from(
        { length: 80 },
        (_, index) =>
          '<w:p><w:r><w:t>' +
          'Пункт ' +
          index +
          ': Adresă și documente pentru verificare. '.repeat(10) +
          '</w:t></w:r></w:p>',
      ).join('');
      const parts = {
        '[Content_Types].xml':
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        '_rels/.rels':
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        'word/_rels/document.xml.rels':
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>',
        'word/document.xml':
          '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
          paragraphs +
          '</w:body></w:document>',
      };
      const bytes = zipSync(
        Object.fromEntries(
          Object.entries(parts).map(([name, value]) => [name, strToU8(value)]),
        ),
        { level: 0 },
      );
      const uploaded = await fetch(
        `${harness.origin}/api${prefix}/sources/docx?documentId=${documentId}&documentVersionId=${documentVersionId}&fileName=large-fictional.docx&language=ru`,
        {
          method: 'POST',
          headers: {
            ...identity,
            'x-company-context-id': companyId,
            'content-type':
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'idempotency-key': randomUUID(),
          },
          body: new Uint8Array(bytes),
        },
      );
      expect(uploaded.status, await uploaded.clone().text()).toBe(201);
      const runId = string((await command(`${prefix}/runs`, {})).id);
      const create = (language = 'ru') =>
        command(`${prefix}/harness/jobs`, {
          runId,
          model: 'fixture-model',
          language,
        });
      const first = await create(),
        id = string(first.id);
      expect(first.totalBatches).toBeGreaterThan(1);
      let release: () => void = () => undefined;
      let entered: () => void = () => undefined;
      const blocked = new Promise<void>((resolve) => {
        release = resolve;
      });
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      protocol.controls.wait = () => {
        entered();
        return blocked;
      };
      const before = protocol.reviewCount();
      const advancing = call(`${prefix}/harness/jobs/${id}/advance`, {
        method: 'POST',
        body: {},
      });
      await started;
      try {
        expect(
          (
            await command(`${prefix}/harness/jobs/${id}/control`, {
              action: 'pause',
            })
          ).state,
        ).toBe('pausing');
        expect(
          (
            await call(`${prefix}/harness/jobs/${id}/control`, {
              method: 'POST',
              body: { action: 'resume' },
            })
          ).status,
        ).toBe(409);
      } finally {
        release();
      }
      const pausedResponse = await advancing;
      expect(pausedResponse.status).toBe(201);
      const paused = object(await pausedResponse.json());
      expect(paused.state).toBe('paused');
      expect(paused.nextBatch).toBe(1);
      expect(
        object(await (await call(`${prefix}/harness/jobs/${id}`)).json())
          .nextBatch,
      ).toBe(1);
      protocol.controls.wait = null;
      await command(`${prefix}/harness/jobs/${id}/control`, {
        action: 'resume',
      });
      let done = paused;
      for (
        let attempt = 0;
        attempt < 50 && done.state !== 'completed';
        attempt++
      )
        done = await command(`${prefix}/harness/jobs/${id}/advance`, {});
      expect(done.state).toBe('completed');
      expect(protocol.reviewCount() - before).toBe(done.totalBatches);
      const secondId = string((await create()).id),
        beforeCache = protocol.reviewCount();
      let cached = await command(
        `${prefix}/harness/jobs/${secondId}/advance`,
        {},
      );
      for (
        let attempt = 0;
        attempt < 50 && cached.state !== 'completed';
        attempt++
      )
        cached = await command(
          `${prefix}/harness/jobs/${secondId}/advance`,
          {},
        );
      expect(cached.state).toBe('completed');
      expect(cached.cacheHits).toBe(cached.totalBatches);
      expect(protocol.reviewCount()).toBe(beforeCache);
      protocol.controls.verbose = true;
      try {
        const oversized = await create('en');
        const oversizedId = string(oversized.id);
        let result = oversized;
        for (let n = 0; n < 50 && result.state === 'queued'; n++)
          result = await command(
            `${prefix}/harness/jobs/${oversizedId}/advance`,
            {},
          );
        expect(result.state).toBe('failed');
        expect(result.nextBatch).toBeLessThan(result.totalBatches);
        expect(
          (
            await call(`${prefix}/harness/jobs/${oversizedId}/import`, {
              method: 'POST',
              body: {},
            })
          ).status,
        ).toBe(409);
      } finally {
        protocol.controls.verbose = false;
      }
    }, 120_000);
    it('allows reconnecting and clears local use when stored credentials cannot be decrypted', async () => {
      await database.targetPool.query(
        "UPDATE dossier_harness_connections SET encrypted = 'unreadable-ciphertext'",
      );
      const response = await call(`${prefix}/harness`);
      expect(response.status).toBe(200);
      expect(object(await response.json()).state).toBe('disconnected');
      const disconnected = await command(`${prefix}/harness/disconnect`, {});
      expect(disconnected.remoteRevoked).toBe(false);
      const after = await database.targetPool.query(
        'SELECT encrypted FROM dossier_harness_connections',
      );
      expect(
        after.rows.every((row: unknown) => object(row).encrypted === null),
      ).toBe(true);
      const started = await command(`${prefix}/harness/connect`, {});
      const url = new URL(string(started.authorizationUrl));
      expect(
        (
          await command(`${prefix}/harness/connect/complete`, {
            state: started.state,
            code: url.searchParams.get('nonce'),
          })
        ).state,
      ).toBe('connected');
    }, 120_000);
  },
);
