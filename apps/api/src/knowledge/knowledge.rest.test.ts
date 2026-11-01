import { AccountabilityService } from '../accountability/accountability.service.js';
import { KnowledgeAuthorization } from './knowledge.authorization.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { UnauthorizedException } from '@nestjs/common';
import { vi } from 'vitest';
import { createKnowledgeMcpServer } from '../knowledge-mcp/server.js';
import { KnowledgeIdentityVerifier } from './knowledge-identity.js';
import {
  createKnowledgeDocumentFixture,
  startKnowledgeScanner,
  KNOWLEDGE_DOCUMENT_LITERAL,
} from './knowledge.test-support.js';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';

const baseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = baseUrl ? describe : describe.skip;
const workspaceId = '00000000-0000-4000-8000-000000007019';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a JSON object.');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected a string.');
  return value;
}

withPostgres('Governed Knowledge source public REST', () => {
  let database: IsolatedPostgresTestDatabase;
  let harness: PostgresRestTestHarness;
  let scanner: Awaited<ReturnType<typeof startKnowledgeScanner>>;
  let companyId: string;
  let membershipId: string;

  beforeAll(async () => {
    if (!baseUrl) throw new Error('TEST_DATABASE_URL is required.');
    database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: baseUrl,
      namePrefix: 'knowledge_read',
    });
    scanner = await startKnowledgeScanner();
    harness = await createPostgresRestTestHarness({
      databaseUrl: database.targetUrl,
      synchronizeIdentityProfile: false,
      serverClock: { now: () => new Date('2026-10-30T12:00:00.000Z') },
      environment: {
        ...scanner.environment,
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'knowledge-owner',
        ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Fictional Knowledge Workspace',
        KNOWLEDGE_EVIDENCE_ENABLED: 'true',
      },
    });
  });
  afterAll(async () => {
    await harness?.close();
    await database?.close();
    await scanner?.close();
  });
  beforeEach(async () => {
    await harness.pool.query('TRUNCATE workspaces, internal_users CASCADE');
    const actor = object(
      await (await call('/access/current-actor', { company: null })).json(),
    );
    membershipId = text(actor.workspaceMembershipId);
    const response = await call('/companies', {
      method: 'POST',
      company: null,
      body: { displayName: 'Synthetic Knowledge Company' },
    });
    expect(response.status).toBe(201);
    companyId = text(object(await response.json()).id);
  });

  function call(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      company?: string | null;
      key?: string;
    } = {},
  ): Promise<Response> {
    const company = options.company === undefined ? companyId : options.company;
    return fetch(`${harness.origin}/api${path}`, {
      method: options.method ?? 'GET',
      headers: {
        'x-test-external-provider': 'deterministic-test',
        'x-test-external-subject': 'knowledge-owner',
        'x-test-display-name': 'Knowledge Owner',
        'x-test-email': 'knowledge-owner@example.test',
        'content-type': 'application/json',
        'idempotency-key': options.key ?? randomUUID(),
        ...(company ? { 'x-company-context-id': company } : {}),
      },
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    });
  }

  function identityHeaders(): Record<string, string> {
    return {
      'x-test-external-provider': 'deterministic-test',
      'x-test-external-subject': 'knowledge-owner',
      'x-test-display-name': 'Knowledge Owner',
      'x-test-email': 'knowledge-owner@example.test',
    };
  }
  async function documentFixture(
    options: { passageText?: string; language?: 'ro' | 'ru' | 'en' } = {},
  ) {
    return createKnowledgeDocumentFixture({
      ...options,
      origin: harness.origin,
      companyId,
      membershipId,
      callerHeaders: identityHeaders(),
    });
  }
  async function grant(role: 'administrators' | 'readers') {
    const response = await call('/knowledge/assignments/' + role, {
      method: 'POST',
      company: null,
      body: { workspaceMembershipId: membershipId, companyId },
    });
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(
      201,
    );
    return object(await response.json());
  }
  async function admitted(
    options: { passageText?: string; language?: 'ro' | 'ru' | 'en' } = {},
  ) {
    const document = await documentFixture(options);
    await grant('administrators');
    const draft = await call('/knowledge/sources', {
      method: 'POST',
      body: document.draftBody,
      key: 'source-draft',
    });
    expect(draft.status, JSON.stringify(await draft.clone().json())).toBe(201);
    const recorded = object(await draft.json());
    const sourceId = text(recorded.sourceId);
    const body = {
      expectedRevision: 1,
      attestation: 'exact-version-source-and-use-reviewed/v1',
      sourceSha256: recorded.sourceSha256,
      projectionSha256: recorded.projectionSha256,
    };
    const admission = await call(`/knowledge/sources/${sourceId}/admission`, {
      method: 'POST',
      body,
      key: 'source-admit',
    });
    expect(
      admission.status,
      JSON.stringify(await admission.clone().json()),
    ).toBe(200);
    return {
      ...document,
      sourceId,
      recorded,
      body,
      admission: object(await admission.json()),
    };
  }
  it('keeps native Document authority separate from source administration and evidence use', async () => {
    const fixture = await documentFixture();
    const denied = await call('/knowledge/sources', {
      method: 'POST',
      body: fixture.draftBody,
    });
    expect(denied.status).toBe(403);
    expect((await call('/knowledge/sources')).status).toBe(403);
  });

  it('admits an attested exact PDF Version, returns its literal citation and retires it on revocation', async () => {
    const source = await admitted();
    expect(source.admission).toMatchObject({ revision: 2, state: 'admitted' });
    expect((await call('/knowledge/sources')).status).toBe(403);
    await grant('readers');
    const activity = await call('/activity-log');
    expect(activity.status).toBe(200);
    const activityEvents = object(await activity.json()).events;
    expect(activityEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'company_knowledge_source_administrator_assignment.granted',
        }),
        expect.objectContaining({
          action: 'company_knowledge_evidence_reader_assignment.granted',
        }),
      ]),
    );
    expect(JSON.stringify(activityEvents)).not.toContain(
      'rightsEvidenceReference',
    );
    const page = await call('/knowledge/sources');
    expect(page.status, JSON.stringify(await page.clone().json())).toBe(200);
    expect(object(await page.json()).items).toEqual([
      expect.objectContaining({
        sourceId: source.sourceId,
        documentVersionId: source.documentVersionId,
        sourceSha256: source.sourceSha256,
        language: 'en',
        versionStatus: 'official',
      }),
    ]);
    const passage = await call(
      `/knowledge/sources/${source.sourceId}/passages/p1`,
    );
    expect(passage.status, JSON.stringify(await passage.clone().json())).toBe(
      200,
    );
    const citation = object(await passage.json());
    expect(citation.text).toBe(KNOWLEDGE_DOCUMENT_LITERAL);
    expect(citation.locator).toBe('p1');
    expect(object(citation.source).documentVersionId).toBe(
      source.documentVersionId,
    );
    expect(JSON.stringify(citation)).not.toContain('rightsEvidenceReference');
    const revoke = await call(
      `/knowledge/sources/${source.sourceId}/revocation`,
      { method: 'POST', body: { expectedRevision: 2 }, key: 'source-revoke' },
    );
    expect(revoke.status, JSON.stringify(await revoke.clone().json())).toBe(
      200,
    );
    expect(object(await revoke.json())).toMatchObject({
      state: 'revoked',
      revision: 3,
    });
    expect(
      (await call(`/knowledge/sources/${source.sourceId}/passages/p1`)).status,
    ).toBe(404);
    expect(
      object(await (await call('/knowledge/sources')).json()).items,
    ).toEqual([]);
    const inspect = await call(
      `/knowledge/sources/${source.sourceId}/administration`,
    );
    expect(inspect.status).toBe(200);
    const history = object(await inspect.json()).history;
    expect(history).toEqual([
      expect.objectContaining({ revision: 1, action: 'drafted' }),
      expect.objectContaining({ revision: 2, action: 'admitted' }),
      expect.objectContaining({ revision: 3, action: 'revoked' }),
    ]);
  });

  it('retains separately cited conflicting sources without inferring precedence', async () => {
    const first = await admitted();
    const other = await documentFixture({
      passageText: 'There are five boxes in this fictional dossier.',
    });
    const draft = await call('/knowledge/sources', {
      method: 'POST',
      body: other.draftBody,
    });
    expect(draft.status).toBe(201);
    const second = object(await draft.json());
    expect(
      (
        await call(`/knowledge/sources/${text(second.sourceId)}/admission`, {
          method: 'POST',
          body: {
            expectedRevision: 1,
            attestation: 'exact-version-source-and-use-reviewed/v1',
            sourceSha256: second.sourceSha256,
            projectionSha256: second.projectionSha256,
          },
        })
      ).status,
    ).toBe(200);
    await grant('readers');
    const response = await call('/knowledge/search?query=boxes');
    expect(response.status).toBe(200);
    const result = object(await response.json());
    expect(result.items).toHaveLength(2);
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: KNOWLEDGE_DOCUMENT_LITERAL,
          source: expect.objectContaining({
            sourceId: first.sourceId,
            documentVersionId: first.documentVersionId,
          }),
        }),
        expect.objectContaining({
          text: 'There are five boxes in this fictional dossier.',
          source: expect.objectContaining({
            sourceId: second.sourceId,
            documentVersionId: other.documentVersionId,
          }),
        }),
      ]),
    );
  });

  it('keeps retrieval disabled by default while protected source administration remains operable', async () => {
    const source = await admitted();
    await grant('readers');
    const previous = process.env.KNOWLEDGE_EVIDENCE_ENABLED;
    delete process.env.KNOWLEDGE_EVIDENCE_ENABLED;
    try {
      for (const path of [
        '/knowledge/sources',
        '/knowledge/search?query=boxes',
        `/knowledge/sources/${source.sourceId}/passages/p1`,
      ]) {
        const measured = await harness.measureApplicationQueries(() =>
          call(path),
        );
        expect(measured.value.status).toBe(503);
        expect(
          measured.queries.some((query) => /knowledge_passages/iu.test(query)),
        ).toBe(false);
        expect(await measured.value.text()).not.toContain(
          KNOWLEDGE_DOCUMENT_LITERAL,
        );
      }
      expect(
        (await call(`/knowledge/sources/${source.sourceId}/administration`))
          .status,
      ).toBe(200);
    } finally {
      if (previous === undefined) delete process.env.KNOWLEDGE_EVIDENCE_ENABLED;
      else process.env.KNOWLEDGE_EVIDENCE_ENABLED = previous;
    }
    expect(
      (await call(`/knowledge/sources/${source.sourceId}/passages/p1`)).status,
    ).toBe(200);
  });

  it('serves a real MCP SDK client through the authenticated Nest/PostgreSQL evidence boundary', async () => {
    const source = await admitted();
    await grant('readers');
    const previousIdentityMode = process.env.ACCESS_IDENTITY_MODE;
    process.env.ACCESS_IDENTITY_MODE = 'clerk';
    const verifier = vi
      .spyOn(KnowledgeIdentityVerifier.prototype, 'verify')
      .mockImplementation(async (request) => {
        if (
          request.get('authorization') !==
          'Bearer synthetic-prisma-knowledge-token'
        )
          throw new UnauthorizedException();
        return {
          provider: 'deterministic-test',
          subject: 'knowledge-owner',
          displayName: 'Knowledge Owner',
          email: 'knowledge-owner@example.test',
        };
      });
    const server = createKnowledgeMcpServer({
      PRISMA_KNOWLEDGE_API_ORIGIN: harness.origin,
      PRISMA_KNOWLEDGE_WORKSPACE_ID: workspaceId,
      PRISMA_KNOWLEDGE_COMPANY_ID: companyId.toUpperCase(),
      PRISMA_KNOWLEDGE_BEARER_TOKEN: 'synthetic-prisma-knowledge-token',
    });
    const client = new Client({ name: 'knowledge-native-proof', version: '1' });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(
        ['list_knowledge_sources', 'search_knowledge', 'get_knowledge_passage'],
      );
      const result = await client.callTool({
        name: 'get_knowledge_passage',
        arguments: { sourceId: source.sourceId.toUpperCase(), locator: 'p1' },
      });
      expect(result.isError).not.toBe(true);
      const payload = object(result.structuredContent);
      expect(payload.text).toBe(KNOWLEDGE_DOCUMENT_LITERAL);
      expect(object(payload.source).documentVersionId).toBe(
        source.documentVersionId,
      );
      expect(JSON.stringify(payload)).not.toContain('rightsEvidenceReference');
      expect(object(payload.source)).not.toHaveProperty('representationId');
      const search = await client.callTool({
        name: 'search_knowledge',
        arguments: {
          query: 'four boxes',
          mode: 'historical',
          documentVersionId: source.documentVersionId.toUpperCase(),
        },
      });
      expect(search.isError).not.toBe(true);
      expect(object(search.structuredContent).items).toEqual([
        expect.objectContaining({ text: KNOWLEDGE_DOCUMENT_LITERAL }),
      ]);
      expect(verifier).toHaveBeenCalledTimes(2);
      const historicalPassage = await client.callTool({
        name: 'get_knowledge_passage',
        arguments: {
          sourceId: source.sourceId.toUpperCase(),
          locator: 'p1',
          mode: 'historical',
          documentVersionId: source.documentVersionId.replace(
            /[a-f]/gu,
            (letter, index) =>
              index % 2 === 0 ? letter.toUpperCase() : letter,
          ),
        },
      });
      expect(historicalPassage.isError).not.toBe(true);
      expect(object(historicalPassage.structuredContent).source).toMatchObject({
        sourceId: source.sourceId,
        documentVersionId: source.documentVersionId,
      });
      expect(object(historicalPassage.structuredContent).text).toBe(
        KNOWLEDGE_DOCUMENT_LITERAL,
      );

      // Retire the real captured grant; the next tool call must re-resolve live authority.
      process.env.ACCESS_IDENTITY_MODE = 'test';
      expect(
        (
          await call(
            `/knowledge/assignments/readers/${membershipId}/${companyId}`,
            { method: 'DELETE' },
          )
        ).status,
      ).toBe(200);
      process.env.ACCESS_IDENTITY_MODE = 'clerk';
      const denied = await client.callTool({
        name: 'get_knowledge_passage',
        arguments: { sourceId: source.sourceId, locator: 'p1' },
      });
      expect(denied.isError).toBe(true);
      expect(JSON.stringify(denied)).not.toContain(KNOWLEDGE_DOCUMENT_LITERAL);
    } finally {
      await client.close();
      await server.close();
      verifier.mockRestore();
      if (previousIdentityMode === undefined)
        delete process.env.ACCESS_IDENTITY_MODE;
      else process.env.ACCESS_IDENTITY_MODE = previousIdentityMode;
    }
  });

  it('returns exact idempotent receipts and rejects a changed command without duplicating attribution', async () => {
    const document = await documentFixture();
    await grant('administrators');
    const first = await call('/knowledge/sources', {
      method: 'POST',
      body: document.draftBody,
      key: 'same-draft',
    });
    expect(first.status).toBe(201);
    const receipt = await first.json();
    const replay = await call('/knowledge/sources', {
      method: 'POST',
      body: document.draftBody,
      key: 'same-draft',
    });
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(receipt);
    const changed = await call('/knowledge/sources', {
      method: 'POST',
      body: {
        ...document.draftBody,
        provenance: 'A different fictional provenance',
      },
      key: 'same-draft',
    });
    expect(changed.status).toBe(409);
    const counts = await harness.pool.query(
      'SELECT (SELECT count(*) FROM knowledge_sources)::int AS sources, (SELECT count(*) FROM knowledge_passages)::int AS passages, (SELECT count(*) FROM knowledge_source_events)::int AS events, (SELECT count(*) FROM knowledge_source_commands)::int AS commands',
    );
    expect(counts.rows).toEqual([
      { sources: 1, passages: 1, events: 1, commands: 1 },
    ]);
  });

  it('rolls back the source, projection and receipt when its owning attribution fails', async () => {
    const document = await documentFixture();
    await grant('administrators');
    const recorder = vi
      .spyOn(AccountabilityService.prototype, 'recordKnowledgeSourceEvent')
      .mockRejectedValueOnce(new Error('Synthetic attribution outage'));
    try {
      const failed = await call('/knowledge/sources', {
        method: 'POST',
        body: document.draftBody,
        key: 'after-attribution-outage',
      });
      expect(failed.status).toBe(500);
      const counts = await harness.pool.query(
        'SELECT (SELECT count(*) FROM knowledge_sources)::int AS sources, (SELECT count(*) FROM knowledge_passages)::int AS passages, (SELECT count(*) FROM knowledge_source_events)::int AS events, (SELECT count(*) FROM knowledge_source_commands)::int AS commands',
      );
      expect(counts.rows).toEqual([
        { sources: 0, passages: 0, events: 0, commands: 0 },
      ]);
    } finally {
      recorder.mockRestore();
    }
    expect(
      (
        await call('/knowledge/sources', {
          method: 'POST',
          body: document.draftBody,
          key: 'after-attribution-outage',
        })
      ).status,
    ).toBe(201);
  });

  it('serializes competing admission revisions to exactly one transition and immutable history', async () => {
    const document = await documentFixture();
    await grant('administrators');
    const draft = await call('/knowledge/sources', {
      method: 'POST',
      body: document.draftBody,
    });
    expect(draft.status).toBe(201);
    const receipt = object(await draft.json());
    const sourceId = text(receipt.sourceId);
    const body = {
      expectedRevision: 1,
      attestation: 'exact-version-source-and-use-reviewed/v1',
      sourceSha256: receipt.sourceSha256,
      projectionSha256: receipt.projectionSha256,
    };
    const holder = await harness.pool.connect();
    await holder.query('BEGIN');
    await holder.query(
      'SELECT id FROM knowledge_sources WHERE id = $1 FOR UPDATE',
      [sourceId],
    );
    let released = false;
    const first = call(`/knowledge/sources/${sourceId}/admission`, {
      method: 'POST',
      body,
      key: 'contending-first',
    });
    const second = call(`/knowledge/sources/${sourceId}/admission`, {
      method: 'POST',
      body,
      key: 'contending-second',
    });
    try {
      let waiting = false;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const result = await harness.pool.query(
          "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%knowledge_sources%' AND pid <> pg_backend_pid()",
        );
        if (object(result.rows[0]).count === 2) {
          waiting = true;
          break;
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      await holder.query('COMMIT');
      released = true;
      const results = await Promise.all([first, second]);
      expect(results.map((response) => response.status).sort()).toEqual([
        200, 409,
      ]);
      const counts = await harness.pool.query(
        'SELECT (SELECT count(*) FROM knowledge_source_events)::int AS events, (SELECT count(*) FROM knowledge_source_commands)::int AS commands',
      );
      expect(counts.rows).toEqual([{ events: 2, commands: 2 }]);
      const changed = await harness.pool.query(
        'SELECT revision, state FROM knowledge_sources WHERE id = $1',
        [sourceId],
      );
      expect(changed.rows).toEqual([{ revision: 2, state: 'admitted' }]);
      await expect(
        harness.pool.query(
          'UPDATE knowledge_passages SET text = $1 WHERE source_id = $2',
          ['A silently changed projection', sourceId],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        harness.pool.query(
          'DELETE FROM knowledge_source_events WHERE source_id = $1',
          [sourceId],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    } finally {
      if (!released) await holder.query('ROLLBACK');
      holder.release();
      await Promise.allSettled([first, second]);
    }
  });

  it('enforces contiguous attributed revisions even for a direct invalid database write', async () => {
    const source = await admitted();
    const invalidSourceId = randomUUID();
    const writer = await harness.pool.connect();
    try {
      await writer.query('BEGIN');
      await writer.query(
        `INSERT INTO knowledge_sources
         SELECT (jsonb_populate_record(NULL::knowledge_sources,
           to_jsonb(s) || jsonb_build_object('id', $2::text, 'revision', 3, 'state', 'revoked'))).*
         FROM knowledge_sources s WHERE id = $1`,
        [source.sourceId, invalidSourceId],
      );
      await writer.query(
        `INSERT INTO knowledge_passages
         SELECT workspace_id, company_id, $2, position, locator, text, sha256
         FROM knowledge_passages WHERE source_id = $1`,
        [source.sourceId, invalidSourceId],
      );
      await writer.query(
        `INSERT INTO knowledge_source_events
         SELECT gen_random_uuid(), workspace_id, company_id, $2, invalid.revision, invalid.action,
           actor_membership_id, actor_internal_user_id, actor_display_name, command_fingerprint, recorded_at
         FROM knowledge_source_events
         CROSS JOIN (VALUES (1, 'drafted'), (3, 'revoked'), (4, 'revoked')) invalid(revision, action)
         WHERE source_id = $1 AND knowledge_source_events.revision = 1`,
        [source.sourceId, invalidSourceId],
      );
      await expect(writer.query('COMMIT')).rejects.toMatchObject({
        code: '23514',
      });
    } finally {
      await writer.query('ROLLBACK');
      writer.release();
    }
    expect(
      (
        await harness.pool.query(
          'SELECT id FROM knowledge_sources WHERE id = $1',
          [invalidSourceId],
        )
      ).rows,
    ).toEqual([]);
  });

  it('refuses a captured read after a grant retires before the live pre-projection boundary', async () => {
    const source = await admitted();
    await grant('readers');
    let announce: (() => void) | undefined;
    let release: (() => void) | undefined;
    const reached = new Promise<void>((resolve) => {
      announce = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = KnowledgeAuthorization.prototype.require;
    let waiting = true;
    const guard = vi
      .spyOn(KnowledgeAuthorization.prototype, 'require')
      .mockImplementation(async function (
        this: KnowledgeAuthorization,
        actor,
        role,
      ) {
        if (role === 'reader' && waiting) {
          waiting = false;
          announce?.();
          await held;
        }
        return original.call(this, actor, role);
      });
    const measured = harness.measureApplicationQueries(async () => {
      const pending = call(`/knowledge/sources/${source.sourceId}/passages/p1`);
      try {
        await reached;
        const revoked = await call(
          `/knowledge/assignments/readers/${membershipId}/${companyId}`,
          { method: 'DELETE' },
        );
        expect(revoked.status).toBe(200);
      } finally {
        release?.();
      }
      return pending;
    });
    try {
      const result = await measured;
      expect(result.value.status).toBe(403);
      expect(await result.value.text()).not.toContain(
        KNOWLEDGE_DOCUMENT_LITERAL,
      );
      expect(
        result.queries.some((query) =>
          query.includes('from "knowledge_passages"'),
        ),
      ).toBe(false);
    } finally {
      release?.();
      guard.mockRestore();
    }
  });

  it.each([
    {
      language: 'ro',
      passageText: 'În acest dosar fictiv sunt patru cutii.',
      query: 'patru cutii',
    },
    {
      language: 'ru',
      passageText: 'В этом учебном досье четыре коробки.',
      query: 'четыре коробки',
    },
    {
      language: 'en',
      passageText: KNOWLEDGE_DOCUMENT_LITERAL,
      query: 'four boxes',
    },
  ] as const)(
    'preserves actual $language PDF/curated citation bytes through literal retrieval',
    async ({ language, passageText, query }) => {
      const source = await admitted({ language, passageText });
      await grant('readers');
      const response = await call(
        '/knowledge/search?query=' + encodeURIComponent(query),
      );
      expect(response.status).toBe(200);
      expect(object(await response.json()).items).toEqual([
        expect.objectContaining({
          text: passageText,
          source: expect.objectContaining({
            language,
            documentVersionId: source.documentVersionId,
          }),
        }),
      ]);
    },
  );

  it('does not give a Workspace administrator implicit source administration or evidence use', async () => {
    expect(membershipId).toEqual(expect.any(String));
    const response = await call('/knowledge/sources', {
      method: 'POST',
      body: {},
    });
    expect(response.status).toBe(403);
    const read = await call('/knowledge/sources');
    expect(read.status).toBe(403);
  });
});
