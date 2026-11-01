import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';
import { createPostgresRestTestHarness } from '../database/postgres-rest-test-harness.js';
import { startKnowledgeScanner } from './knowledge.test-support.js';
import { createKnowledgeWebDocumentFixture } from './knowledge-web.test-support.js';

const baseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = baseUrl ? describe : describe.skip;
const identity = {
  'x-test-external-provider': 'deterministic-test',
  'x-test-external-subject': 'knowledge-web-owner',
  'x-test-display-name': 'Fictional Knowledge Owner',
  'x-test-email': 'knowledge-owner@example.test',
};
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected public record.');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value)
    throw new Error('Expected public identity.');
  return value;
}
withPostgres('Ordinary web Knowledge evidence adapters', () => {
  let database: Awaited<ReturnType<typeof createIsolatedPostgresTestDatabase>>;
  let harness: Awaited<ReturnType<typeof createPostgresRestTestHarness>>;
  let scanner: Awaited<ReturnType<typeof startKnowledgeScanner>>;
  let companyId: string;
  let membershipId: string;
  beforeAll(async () => {
    if (!baseUrl) throw new Error('TEST_DATABASE_URL required.');
    database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: baseUrl,
      namePrefix: 'knowledge_web',
    });
    scanner = await startKnowledgeScanner();
    harness = await createPostgresRestTestHarness({
      databaseUrl: database.targetUrl,
      serverClock: { now: () => new Date('2026-11-01T12:00:00.000Z') },
      environment: {
        ...scanner.environment,
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'knowledge-web-owner',
        ACCESS_BOOTSTRAP_WORKSPACE_ID: '00000000-0000-4000-8000-000000001015',
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Fictional web evidence Workspace',
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
    scanner.reset();
    await harness.pool.query('TRUNCATE workspaces, internal_users CASCADE');
    membershipId = text(
      record(
        await (await call('/access/current-actor', { company: false })).json(),
      ).workspaceMembershipId,
    );
    companyId = text(
      record(
        await (
          await call('/companies', {
            company: false,
            body: { displayName: 'Fictional web evidence Company' },
          })
        ).json(),
      ).id,
    );
  });
  function call(
    path: string,
    options: { body?: unknown; company?: boolean; method?: string } = {},
  ) {
    return fetch(`${harness.origin}/api${path}`, {
      method: options.method ?? (options.body ? 'POST' : 'GET'),
      headers: {
        ...identity,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
        ...(options.company === false
          ? {}
          : { 'x-company-context-id': companyId }),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
  }
  async function grant(role: 'administrators' | 'readers') {
    const response = await call(`/knowledge/assignments/${role}`, {
      company: false,
      body: { workspaceMembershipId: membershipId, companyId },
    });
    expect(response.status).toBe(201);
  }
  async function source() {
    const document = await createKnowledgeWebDocumentFixture({
      origin: harness.origin,
      companyId,
      membershipId,
      callerHeaders: identity,
      passageText: '  Four Ж boxes e\u0301  ',
    });
    await grant('administrators');
    const draft = await call('/knowledge/sources', {
      body: document.draftBody,
    });
    expect(draft.status).toBe(201);
    const receipt = record(await draft.json());
    const sourceId = text(receipt.sourceId);
    expect(
      (
        await call(`/knowledge/sources/${sourceId}/admission`, {
          body: {
            expectedRevision: 1,
            attestation: 'exact-version-source-and-use-reviewed/v1',
            sourceSha256: receipt.sourceSha256,
            projectionSha256: receipt.projectionSha256,
          },
        })
      ).status,
    ).toBe(200);
    return { ...document, sourceId };
  }
  async function interactions() {
    return (
      await harness.pool.query(
        'SELECT operation, source_references FROM knowledge_interactions ORDER BY recorded_at, id',
      )
    ).rows;
  }
  it('returns the admitted exact Representation through a runnable Reader/native-authorized route', async () => {
    const admitted = await source();
    await grant('readers');
    const response = await call('/knowledge/evidence/sources');
    expect(response.status).toBe(200);
    const value = record(await response.json());
    expect(value.items).toEqual([
      expect.objectContaining({
        sourceId: admitted.sourceId,
        representationId: admitted.representationId,
      }),
    ]);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
  it('keeps literal search, fresh passage, safe denials and minimal success attribution in the same service', async () => {
    const admitted = await source();
    expect((await call('/knowledge/evidence/sources')).status).toBe(403);
    expect(await interactions()).toHaveLength(0);
    await grant('readers');
    expect(
      (
        await call(
          '/knowledge/evidence/search?query=%20%20Four%20%D0%96%20boxes%20e%CC%81%20%20',
        )
      ).status,
    ).toBe(200);
    const exact = await call(
      `/knowledge/evidence/sources/${admitted.sourceId}/passages/p1`,
    );
    expect(exact.status).toBe(200);
    expect(record(await exact.json())).toMatchObject({
      text: '  Four Ж boxes e\u0301  ',
      source: { representationId: admitted.representationId },
    });
    const empty = await call('/knowledge/evidence/search?query=FOUR');
    expect(await empty.json()).toEqual({ items: [], nextCursor: null });
    expect((await call('/knowledge/evidence/search?query=%20%20')).status).toBe(
      400,
    );
    expect(
      (await call(`/knowledge/evidence/sources/${randomUUID()}/passages/p1`))
        .status,
    ).toBe(404);
    const reads = await interactions();
    expect(reads).toHaveLength(3);
    expect(JSON.stringify(reads)).not.toContain('Four');
    expect(JSON.stringify(reads)).not.toContain('rightsEvidenceReference');
    expect(
      (
        await harness.pool.query(
          "SELECT column_name FROM information_schema.columns WHERE table_name='knowledge_interactions'",
        )
      ).rows.map((row) => row.column_name),
    ).not.toContain('query');
  });
  it('keeps the earlier equal-byte Representation through native reads, supersession and explicit exact history, then denies withdrawn admission', async () => {
    const admitted = await source();
    await grant('readers');
    expect(admitted.representationId).not.toBe(admitted.laterRepresentationId);
    const selected = `/knowledge/evidence/sources/${admitted.sourceId}/passages/p1`;
    const initial = record(await (await call(selected)).json());
    expect(initial.source).toMatchObject({
      representationId: admitted.representationId,
      versionStatus: 'official',
    });
    const pdf = await call(
      `/documents/${admitted.documentId}/versions/${admitted.documentVersionId}/content/${admitted.representationId}`,
    );
    expect(pdf.status).toBe(200);
    expect(Buffer.from(await pdf.arrayBuffer())).toEqual(admitted.bytes);
    const versions = record(
      await (await call(`/documents/${admitted.documentId}/versions`)).json(),
    );
    const draftResponse = await call(
      `/documents/${admitted.documentId}/versions`,
      { body: { expectedRevision: versions.workingRevision } },
    );
    expect(draftResponse.status).toBe(201);
    const draft = record(await draftResponse.json());
    expect(
      (
        await call(
          `/documents/${admitted.documentId}/versions/${text(draft.versionId)}/official-designation`,
          { body: { expectedRevision: draft.workingRevision } },
        )
      ).status,
    ).toBe(200);
    expect(await (await call('/knowledge/evidence/sources')).json()).toEqual({
      items: [],
      nextCursor: null,
    });
    expect((await call(selected)).status).toBe(404);
    const historical =
      selected +
      '?mode=historical&documentVersionId=' +
      admitted.documentVersionId;
    const reopened = record(await (await call(historical)).json());
    expect(reopened.source).toEqual({
      ...record(initial.source),
      versionStatus: 'superseded',
    });
    expect(reopened.text).toBe(initial.text);
    expect(
      (
        await call(`/knowledge/sources/${admitted.sourceId}/revocation`, {
          body: { expectedRevision: 2 },
        })
      ).status,
    ).toBe(200);
    const before = await interactions();
    const denied = await call(historical);
    expect(denied.status).toBe(404);
    expect(JSON.stringify(await denied.json())).not.toContain(
      admitted.sourceId,
    );
    expect(await interactions()).toHaveLength(before.length);
    expect(
      await (await call('/knowledge/evidence/search?query=Four')).json(),
    ).toEqual({ items: [], nextCursor: null });
  });
  it('uses the same actually disabled gate at all three ordinary web adapters in a separate native harness', async () => {
    const admitted = await source();
    await grant('readers');
    const disabled = await createPostgresRestTestHarness({
      databaseUrl: database.targetUrl,
      environment: { KNOWLEDGE_EVIDENCE_ENABLED: 'false' },
    });
    try {
      for (const path of [
        '/sources',
        '/search?query=Four',
        `/sources/${admitted.sourceId}/passages/p1`,
      ]) {
        const response = await fetch(
          disabled.origin + '/api/knowledge/evidence' + path,
          { headers: { ...identity, 'x-company-context-id': companyId } },
        );
        expect(response.status).toBe(503);
        expect(JSON.stringify(await response.json())).not.toContain(
          admitted.sourceId,
        );
      }
      expect(await interactions()).toHaveLength(0);
    } finally {
      await disabled.close();
      process.env.KNOWLEDGE_EVIDENCE_ENABLED = 'true';
    }
  });
  it('keeps the Knowledge preflight and subsequent native PDF read as independent authorization points', async () => {
    const admitted = await source();
    await grant('readers');
    const passage = `/knowledge/evidence/sources/${admitted.sourceId}/passages/p1`;
    expect((await call(passage)).status).toBe(200);
    expect(
      (
        await call(`/knowledge/sources/${admitted.sourceId}/revocation`, {
          body: { expectedRevision: 2 },
        })
      ).status,
    ).toBe(200);
    const native = await call(
      `/documents/${admitted.documentId}/versions/${admitted.documentVersionId}/content/${admitted.representationId}`,
    );
    expect(native.status).toBe(200);
    expect(Buffer.from(await native.arrayBuffer())).toEqual(admitted.bytes);
    expect((await call(passage)).status).toBe(404);
  });
});
