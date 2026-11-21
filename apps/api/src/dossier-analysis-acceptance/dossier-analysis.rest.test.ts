import { randomUUID } from 'node:crypto';
import { strToU8, zipSync } from 'fflate';
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
  'Dossier Analysis native public acceptance',
  () => {
    let database: IsolatedPostgresTestDatabase;
    let harness: PostgresRestTestHarness;
    let scanner: Awaited<ReturnType<typeof startKnowledgeScanner>>;
    let companyId = '';
    let projectId = '';
    let documentId = '';
    let documentVersionId = '';
    let missingDocumentId = '';
    let representationId = '';
    let original: Buffer;
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
      harness = await createPostgresRestTestHarness({
        databaseUrl: database.targetUrl,
        synchronizeIdentityProfile: false,
        environment: {
          ...scanner.environment,
          NODE_ENV: 'test',
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
      original = fixture.bytes;
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

    it('reuses the Project snapshot and exact Versions as its evidence inventory grows', async () => {
      const measured = async () => {
        const result = await harness.measureApplicationQueries(async () => {
          const response = await call(`${prefix}/inventory`);
          expect(response.status).toBe(200);
          return object(await response.json());
        });
        const count = (table: string) =>
          result.queries.filter((query) => query.includes(`from "${table}"`))
            .length;
        return {
          response: result.value,
          total: result.queryCount,
          projects: count('projects'),
          documents: count('working_documents'),
          versions: count('document_versions'),
        };
      };
      const before = await measured();
      const document = object(
        await (await call(`/documents/${documentId}`)).json(),
      );
      const addedIds: string[] = [];
      const after = await (async () => {
        try {
          for (let index = 0; index < 5; index++) {
            const added = await command('/documents', {
              clientId: string(document.clientId),
              title: `Synthetic additional reference ${index}`,
              purpose: 'Inventory architecture test',
              url: `https://example.test/additional/${index}`,
            });
            const addedId = string(added.id);
            await command(`/documents/${addedId}/project-association`, {
              action: 'link',
              projectId,
              expectedRevision: 0,
            });
            addedIds.push(addedId);
          }
          return await measured();
        } finally {
          for (const id of addedIds) {
            await command(`/documents/${id}/project-association`, {
              action: 'unlink',
              projectId,
              expectedRevision: 1,
            });
          }
        }
      })();
      expect(array(after.response.items)).toHaveLength(
        array(before.response.items).length + 5,
      );
      expect(array(after.response.items)).toEqual(
        expect.arrayContaining(array(before.response.items)),
      );
      expect(after.projects).toBe(before.projects);
      expect(after.documents - before.documents).toBe(5);
      expect(after.versions).toBe(before.versions);
      expect(after.total - before.total).toBeLessThanOrEqual(30);
    }, 30000);

    it('preserves the native source, ties evidence to its page, and keeps runs immutable after a native association change', async () => {
      const initialResponse = await call(prefix);
      expect(initialResponse.status, await initialResponse.clone().text()).toBe(
        200,
      );
      const initial = object(await initialResponse.json());
      expect(array(initial.sources)).toHaveLength(0);
      const inventoryResponse = await call(`${prefix}/inventory`);
      expect(inventoryResponse.status).toBe(200);
      const inventory = array(object(await inventoryResponse.json()).items);
      expect(inventory).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            documentId,
            documentVersionId,
            representationId,
          }),
        ]),
      );
      const canonicalBefore = object(
        await (await call(`/documents/${documentId}`)).json(),
      );
      const source = await command(`${prefix}/sources`, {
        documentId,
        documentVersionId,
        representationId,
        language: 'ro',
      });
      let sourceId = string(source.id);
      const downloaded = await call(`${prefix}/sources/${sourceId}/original`);
      expect(downloaded.status).toBe(200);
      expect(Buffer.from(await downloaded.arrayBuffer())).toEqual(original);
      // Seven native runs span two bounded history pages. All are made from
      // the same selected PDF so this exercises HTTP authorization and cursors.
      const runIds: string[] = [];
      for (let index = 0; index < 7; index += 1)
        runIds.push(string((await command(`${prefix}/runs`, {})).id));
      const workspacePage = await call(prefix);
      expect(workspacePage.status).toBe(200);
      const firstHistory = object(await workspacePage.json());
      const firstIds = array(firstHistory.runs).map((item) => string(item.id));
      expect(firstIds).toHaveLength(5);
      const historyCursor = string(firstHistory.runsNextCursor);
      const repeatHistory = object(await (await call(prefix)).json());
      expect(array(repeatHistory.runs).map((item) => string(item.id))).toEqual(
        firstIds,
      );
      const continuation = await call(
        `${prefix}/runs?cursor=${encodeURIComponent(historyCursor)}`,
      );
      expect(continuation.status).toBe(200);
      const nextHistory = object(await continuation.json());
      const nextIds = array(nextHistory.runs).map((item) => string(item.id));
      expect(nextIds).toHaveLength(2);
      expect(nextHistory.runsNextCursor).toBeNull();
      expect(new Set([...firstIds, ...nextIds]).size).toBe(7);
      expect([...firstIds, ...nextIds].sort()).toEqual([...runIds].sort());
      const readerWorkspace = await call(prefix, { subject: 'dossier-reader' });
      expect(readerWorkspace.status, await readerWorkspace.clone().text()).toBe(
        200,
      );
      const invalidCursors = [
        await call(`${prefix}/runs?cursor=not-a-cursor`),
        await call(
          `${prefix}/runs?cursor=${encodeURIComponent(historyCursor.slice(0, 5) + (historyCursor[5] === 'A' ? 'B' : 'A') + historyCursor.slice(6))}`,
        ),
        await call(
          `${prefix}/runs?cursor=${encodeURIComponent(historyCursor)}`,
          { subject: 'dossier-reader' },
        ),
      ];
      for (const rejected of invalidCursors)
        expect([400, 403, 404]).toContain(rejected.status);
      const otherProject = await command('/projects', {
        title: 'Unrelated fictional project',
        clientAccountId: string(canonicalBefore.clientId),
      });
      const otherWorkspace = await call(
        `/projects/${string(otherProject.id)}/dossier-analysis`,
      );
      expect(otherWorkspace.status, await otherWorkspace.clone().text()).toBe(
        200,
      );
      const wrongProject = await call(
        `/projects/${string(otherProject.id)}/dossier-analysis/runs?cursor=${encodeURIComponent(historyCursor)}`,
      );
      expect([400, 403, 404]).toContain(wrongProject.status);
      const retired = await call(`${prefix}/sources/${sourceId}`, {
        method: 'DELETE',
      });
      expect(retired.status, await retired.clone().text()).toBe(200);
      const changedCursor = await call(
        `${prefix}/runs?cursor=${encodeURIComponent(historyCursor)}`,
      );
      expect([400, 403, 404, 409]).toContain(changedCursor.status);
      sourceId = string(
        (
          await command(`${prefix}/sources`, {
            documentId,
            documentVersionId,
            representationId,
            language: 'ro',
          })
        ).id,
      );
      // An independently preserved supplementary original shares the native Version,
      // but is not the official PDF. Its locator is structural rather than a page.
      const parts: Record<string, string> = {
        '[Content_Types].xml':
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        '_rels/.rels':
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="root" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        'word/_rels/document.xml.rels':
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>',
        'word/document.xml': [
          '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>',
          '<w:tbl><w:tr><w:tc><w:p><w:r><w:t xml:space="preserve">  IDNO</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>RO87654321</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
          '<w:p><w:r><w:t>Adresă: Strada Lalelelor</w:t></w:r></w:p><w:p><w:r><w:t>Адрес: улица Мира</w:t></w:r></w:p>',
          '<w:p><w:r><w:t>Adresse: Rue du Soleil certifié</w:t></w:r></w:p>',
          '<w:p><w:r><w:t>Audit documente de certificare</w:t></w:r></w:p><w:p><w:r><w:t>AUDIT de certificare</w:t></w:r></w:p>',
          '<w:p><w:r><w:t>Știință și certificare</w:t></w:r></w:p><w:p><w:r><w:t>Действительный сертификат</w:t></w:r></w:p>',
          '</w:body></w:document>',
        ].join(''),
      };
      const docx = zipSync(
        Object.fromEntries(
          Object.entries(parts).map(([name, value]) => [name, strToU8(value)]),
        ),
      );
      const docxResponse = await fetch(
        `${harness.origin}/api${prefix}/sources/docx?documentId=${documentId}&documentVersionId=${documentVersionId}&fileName=fictional.docx&language=ro`,
        {
          method: 'POST',
          headers: {
            ...identity,
            'x-company-context-id': companyId,
            'content-type':
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'idempotency-key': randomUUID(),
          },
          body: new Uint8Array(docx),
        },
      );
      expect(docxResponse.status, await docxResponse.clone().text()).toBe(201);
      const docxId = string(object(await docxResponse.json()).id);
      const originalDocx = await call(`${prefix}/sources/${docxId}/original`);
      expect(originalDocx.status).toBe(200);
      expect(Buffer.from(await originalDocx.arrayBuffer())).toEqual(
        Buffer.from(docx),
      );
      const created = await command(`${prefix}/runs`, {});
      const runId = string(created.id);
      const response = await call(`${prefix}/runs/${runId}`);
      expect(response.status).toBe(200);
      const run = object(await response.json());
      expect(run.stale).toBe(false);
      const coverage = object(run.coverage);
      expect(array(coverage.missingDocuments)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ title: 'Fictional missing source' }),
        ]),
      );
      expect(JSON.stringify(run)).toContain('Tax ID: RO12345678');
      expect(JSON.stringify(run)).toContain('page:1');
      expect(JSON.stringify(run)).toContain('RO87654321');
      const candidates = array(run.candidates);
      expect(candidates).toContainEqual(
        expect.objectContaining({
          field: 'taxId',
          value: 'RO87654321',
          citation: expect.objectContaining({
            sourceId: docxId,
            start: 7,
            end: 17,
            quote: 'RO87654321',
          }),
        }),
      );
      const candidate = candidates.find(
        (item) => item.field === 'taxId' && item.value === 'RO12345678',
      );
      expect(candidate).toBeDefined();
      if (!candidate) throw new Error('Expected cited synthetic tax ID');
      const citation = object(candidate.citation);
      const proposal = {
        snapshotHash: string(run.snapshotHash),
        suggestions: [
          {
            field: 'taxId',
            value: 'RO12345678',
            rationale: 'Synthetic reviewer proposal',
            citations: [citation],
          },
        ],
      };
      const invalid = await call(`${prefix}/runs/${runId}/suggestions`, {
        method: 'POST',
        body: {
          ...proposal,
          suggestions: [
            {
              ...proposal.suggestions[0],
              citations: [{ ...citation, quote: 'invented' }],
            },
          ],
        },
      });
      expect([400, 409, 422]).toContain(invalid.status);
      const key = randomUUID();
      const submitted = await command(
        `${prefix}/runs/${runId}/suggestions`,
        proposal,
        201,
        key,
      );
      const replay = await command(
        `${prefix}/runs/${runId}/suggestions`,
        proposal,
        201,
        key,
      );
      expect(replay).toEqual(submitted);
      const reopened = object(
        await (await call(`${prefix}/runs/${runId}`)).json(),
      );
      const suggestions = array(reopened.suggestions);
      expect(suggestions).toHaveLength(1);
      const suggestion = suggestions[0];
      if (!suggestion) throw new Error('Expected one suggestion');
      const reviewPath = `${prefix}/suggestions/${string(suggestion.id)}/reviews`;
      const reviewBody = {
        expectedRevision: 0,
        decision: 'correct',
        replacementValue: 'RO12345679',
      };
      const reviewKey = randomUUID();
      const review = await command(reviewPath, reviewBody, 201, reviewKey);
      expect(await command(reviewPath, reviewBody, 201, reviewKey)).toEqual(
        review,
      );
      await command(reviewPath, { expectedRevision: 1, decision: 'confirm' });
      await command(reviewPath, { expectedRevision: 2, decision: 'reject' });
      const eventRows = await harness.pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM dossier_analysis_events WHERE action = 'suggestion.reviewed'",
      );
      expect(eventRows.rows[0]?.count).toBe('3');
      const reviewed = object(
        await (await call(`${prefix}/runs/${runId}`)).json(),
      );
      expect(JSON.stringify(reviewed)).toContain('RO12345678');
      expect(JSON.stringify(reviewed)).toContain('RO12345679');
      const history = array(array(reviewed.suggestions)[0]?.reviews);
      expect(history.map((item) => item.decision)).toEqual([
        'correct',
        'confirm',
        'reject',
      ]);
      // The persisted native objects were created through public commands above.
      // Attempt direct tampering only to verify PostgreSQL's retention boundary.
      const reviewRow = await harness.pool.query<{ id: string }>(
        'SELECT id FROM dossier_analysis_reviews WHERE suggestion_id = $1 AND revision = 1',
        [string(suggestion.id)],
      );
      const eventRow = await harness.pool.query<{ id: string }>(
        "SELECT id FROM dossier_analysis_events WHERE target_id = $1 AND action = 'run.created'",
        [runId],
      );
      const reviewId = string(reviewRow.rows[0]?.id);
      const eventId = string(eventRow.rows[0]?.id);
      for (const [statement, id] of [
        [
          'UPDATE dossier_analysis_sources SET file_name = $2 WHERE id = $1',
          sourceId,
        ],
        [
          'UPDATE dossier_analysis_sources SET original = $2::bytea WHERE id = $1',
          docxId,
        ],
        [
          'UPDATE dossier_analysis_runs SET result = $2::jsonb WHERE id = $1',
          runId,
        ],
        [
          'UPDATE dossier_analysis_reviews SET actor_display_name = $2 WHERE id = $1',
          reviewId,
        ],
        [
          'UPDATE dossier_analysis_events SET receipt = $2::jsonb WHERE id = $1',
          eventId,
        ],
        [
          'UPDATE dossier_analysis_suggestions SET proposal = $2::jsonb WHERE id = $1',
          string(suggestion.id),
        ],
      ]) {
        const value = statement.includes('::jsonb') ? '{}' : 'changed';
        await expect(
          harness.pool.query(statement, [id, value]),
        ).rejects.toMatchObject({ code: '23514' });
      }
      for (const [table, id] of [
        ['dossier_analysis_sources', sourceId],
        ['dossier_analysis_sources', docxId],
        ['dossier_analysis_runs', runId],
        ['dossier_analysis_reviews', reviewId],
        ['dossier_analysis_events', eventId],
        ['dossier_analysis_suggestions', string(suggestion.id)],
      ]) {
        // Every table identifier is a fixed test literal, never client input.
        await expect(
          harness.pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]),
        ).rejects.toMatchObject({ code: '23514' });
      }
      expect(
        array(
          object(await (await call(`${prefix}/runs/${runId}`)).json())
            .suggestions,
        ),
      ).toHaveLength(1);
      // Working decisions do not edit the canonical original or Document.
      const canonicalAfter = object(
        await (await call(`/documents/${documentId}`)).json(),
      );
      expect(canonicalAfter.workingRevision).toEqual(
        canonicalBefore.workingRevision,
      );
      expect(canonicalAfter.version).toEqual(canonicalBefore.version);
      const unchanged = await call(`${prefix}/sources/${sourceId}/original`);
      expect(Buffer.from(await unchanged.arrayBuffer())).toEqual(original);
      const context = await call(`${prefix}/runs/${runId}/context`);
      expect(context.status).toBe(200);
      const contextText = await context.text();
      expect(Buffer.byteLength(contextText, 'utf8')).toBeLessThanOrEqual(
        1024 * 1024,
      );
      const contextBody: unknown = JSON.parse(contextText);
      expect(JSON.stringify(contextBody)).toContain(sourceId);
      expect(JSON.stringify(contextBody)).toContain('Fictional missing source');
      const otherCompany = string(
        (
          await command('/companies', {
            displayName: 'Another synthetic company',
          })
        ).id,
      );
      const foreign = await call(`${prefix}/runs/${runId}/context`, {
        company: otherCompany,
      });
      const foreignText = await foreign.text();
      expect([403, 404]).toContain(foreign.status);
      expect(foreignText).not.toContain(sourceId);
      expect(foreignText).not.toContain('RO12345678');
      const search = await call(
        `${prefix}/runs/${runId}/search?query=RO12345678&mode=literal`,
      );
      expect(search.status).toBe(200);
      expect(JSON.stringify(await search.json())).toContain('RO12345678');
      const firstPage = await call(
        `${prefix}/runs/${runId}/search?query=RO&mode=literal&limit=1`,
      );
      expect(firstPage.status).toBe(200);
      const firstText = await firstPage.text();
      expect(Buffer.byteLength(firstText, 'utf8')).toBeLessThanOrEqual(
        1024 * 1024,
      );
      const first = object(JSON.parse(firstText));
      expect(array(first.hits)).toHaveLength(1);
      const cursor = string(first.nextCursor);
      const secondPage = await call(
        `${prefix}/runs/${runId}/search?query=RO&mode=literal&limit=1&cursor=${encodeURIComponent(cursor)}`,
      );
      expect(secondPage.status).toBe(200);
      const second = object(await secondPage.json());
      expect(array(second.hits)).toHaveLength(1);
      expect(JSON.stringify(second.hits)).not.toEqual(
        JSON.stringify(first.hits),
      );
      const wrongCursor = await call(
        `${prefix}/runs/${runId}/search?query=other&mode=lexical&limit=1&cursor=${encodeURIComponent(cursor)}`,
      );
      expect([400, 409, 422]).toContain(wrongCursor.status);
      for (const mode of ['lexical', 'fuzzy']) {
        const result = await call(
          `${prefix}/runs/${runId}/search?query=RO12345678&mode=${mode}&sourceId=${sourceId}&language=ro`,
        );
        expect(result.status).toBe(200);
        expect(JSON.stringify(await result.json())).toContain('RO12345678');
      }
      for (const [query, mode, expected] of [
        ['lalelelor', 'lexical', 'Lalelelor'],
        ['улица', 'lexical', 'улица'],
        ['soleil', 'lexical', 'Soleil'],
        ['lalelelur', 'fuzzy', 'Lalelelor'],
        ['lalelelro', 'fuzzy', 'Lalelelor'],
        ['certifie\u0301', 'lexical', 'certifié'],
        ['мриа', 'fuzzy', 'Мира'],
        ['S\u0326tiint\u0326a\u0306', 'lexical', 'Știință'],
        ['деи\u0306ствительныи\u0306', 'lexical', 'Действительный'],
      ]) {
        const result = await call(
          `${prefix}/runs/${runId}/search?query=${encodeURIComponent(query)}&mode=${mode}&sourceId=${docxId}`,
        );
        expect(result.status).toBe(200);
        expect(JSON.stringify(await result.json())).toContain(expected);
      }
      const ranked = await call(
        `${prefix}/runs/${runId}/search?query=${encodeURIComponent('audit de certificare')}&mode=lexical&sourceId=${docxId}`,
      );
      expect(ranked.status).toBe(200);
      expect(
        array(object(await ranked.json()).hits).map(
          (hit) => object(hit.passage).text,
        ),
      ).toEqual(['AUDIT de certificare', 'Audit documente de certificare']);
      const documentBefore = object(
        await (await call(`/documents/${documentId}`)).json(),
      );
      const nativeRevision = documentBefore.workingRevision;
      if (typeof nativeRevision !== 'number')
        throw new Error('Expected native revision');
      const draft = await command(`/documents/${documentId}/versions`, {
        expectedRevision: nativeRevision,
      });
      const historical = await call(`${prefix}/runs/${runId}`);
      expect(historical.status).toBe(200);
      expect(object(await historical.json()).stale).toBe(true);
      const staleReview = await call(reviewPath, {
        method: 'POST',
        body: { expectedRevision: 3, decision: 'confirm' },
      });
      expect([403, 404, 409]).toContain(staleReview.status);
      const historicalSearch = await call(
        `${prefix}/runs/${runId}/search?query=RO12345678&mode=literal&history=true`,
      );
      expect(historicalSearch.status).toBe(200);
      expect(JSON.stringify(await historicalSearch.json())).toContain(
        'RO12345678',
      );
      const rerun = await command(`${prefix}/runs`, {});
      expect(rerun.id).not.toBe(runId);
      const newer = object(
        await (await call(`${prefix}/runs/${string(rerun.id)}`)).json(),
      );
      expect(newer.stale).toBe(false);
      expect(newer.snapshotHash).not.toBe(run.snapshotHash);

      const newRevision = draft.workingRevision;
      if (typeof newRevision !== 'number')
        throw new Error('Expected drafted revision');
      const designation = await call(
        `/documents/${documentId}/versions/${string(draft.versionId)}/official-designation`,
        {
          method: 'POST',
          body: { expectedRevision: newRevision },
        },
      );
      expect(designation.status, await designation.clone().text()).toBe(200);
      const implicitHistory = await call(
        `${prefix}/runs/${runId}/search?query=RO12345678&mode=literal`,
      );
      expect(implicitHistory.status).toBe(409);
      const explicitHistory = await call(
        `${prefix}/runs/${runId}/search?query=RO12345678&mode=literal&history=true`,
      );
      expect(explicitHistory.status).toBe(200);
      expect(JSON.stringify(await explicitHistory.json())).toContain(
        'RO12345678',
      );

      // Missing-source manifest entries are governed too: losing an omitted
      // Document's association withholds the frozen manifest everywhere.
      const beforeOmissionChange = await call(prefix);
      expect(beforeOmissionChange.status).toBe(200);
      const omissionCursor = string(
        object(await beforeOmissionChange.json()).runsNextCursor,
      );
      await command(`/documents/${missingDocumentId}/project-association`, {
        action: 'unlink',
        projectId,
        expectedRevision: 1,
      });
      for (const path of [
        `/runs/${runId}`,
        `/runs/${runId}/context`,
        `/runs/${runId}/search?query=RO12345678&mode=literal&history=true`,
      ]) {
        const withheld = await call(prefix + path);
        expect([403, 404, 409]).toContain(withheld.status);
        const payload = await withheld.text();
        expect(payload).not.toContain(missingDocumentId);
        expect(payload).not.toContain('Fictional missing source');
      }
      for (const path of [
        '',
        `/runs?cursor=${encodeURIComponent(omissionCursor)}`,
      ]) {
        const hiddenHistory = await call(prefix + path);
        expect([400, 403, 404, 409]).toContain(hiddenHistory.status);
        const text = await hiddenHistory.text();
        expect(text).not.toContain(missingDocumentId);
        expect(text).not.toContain('Fictional missing source');
      }
      const stillVisible = await call(`${prefix}/sources/${sourceId}/original`);
      expect(stillVisible.status).toBe(200);
      expect(Buffer.from(await stillVisible.arrayBuffer())).toEqual(original);
      await command(`/documents/${documentId}/project-association`, {
        action: 'unlink',
        projectId,
        expectedRevision: 1,
      });
      const old = await call(`${prefix}/runs/${runId}`);
      expect([403, 404, 409]).toContain(old.status);
      expect(await old.text()).not.toContain('RO12345678');
    }, 120_000);
  },
);
