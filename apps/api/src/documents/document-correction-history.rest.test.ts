import {
  receivedContractRelationsForTest,
  externalInvoiceRelationsForTest,
} from './document-read.test-support.js';
import { ConfigService } from '@nestjs/config';
import { DocumentPdfStorage } from './document-pdf-storage.js';
import { DocumentMalwareScanner } from './document-malware-scanner.js';
import { drizzle } from 'drizzle-orm/node-postgres';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ActorContext } from '../access/access.types.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';
import { ProjectService } from '../project/project.service.js';
import { DocumentsService } from './documents.service.js';
import { DocumentReadBoundary } from './document-read-boundary.js';
import { DocumentVersionsService } from './document-versions.service.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const owner = {
  'x-test-external-provider': 'deterministic-test',
  'x-test-external-subject': 'document-history-owner',
  'x-test-display-name': 'Document Registrar',
  'x-test-email': 'document-history@example.test',
};
const initial = {
  title: 'Initial assessment questionnaire',
  purpose: 'Prepare the first assessment',
  url: 'https://example.test/questionnaire',
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected object');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected string');
  return value;
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Expected array');
  return value;
}
async function body(response: Response) {
  return object(await response.json());
}

describe.skipIf(!databaseUrl)(
  'Working Document correction history REST contract',
  () => {
    let database: IsolatedPostgresTestDatabase;
    let harness: PostgresRestTestHarness;
    let companyId: string;
    let clientId: string;
    let membershipId: string;
    beforeAll(async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL required');
      database = await createIsolatedPostgresTestDatabase({
        baseDatabaseUrl: databaseUrl,
        namePrefix: 'document_history',
      });
      harness = await createPostgresRestTestHarness({
        databaseUrl: database.targetUrl,
        environment: {
          NODE_ENV: 'test',
          ACCESS_IDENTITY_MODE: 'test',
          ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
          ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'document-history-owner',
          ACCESS_BOOTSTRAP_WORKSPACE_ID: '00000000-0000-4000-8000-000000000369',
          ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Document history',
          ACCESS_ACCEPTED_INVITATIONS_JSON: '[]',
        },
      });
    });
    afterAll(async () => {
      await harness?.close();
      await database?.close();
    });
    beforeEach(async () => {
      await harness.pool.query('TRUNCATE workspaces, internal_users CASCADE');
      companyId = '';
      companyId = await createCompany('PRISMA-PRIM');
      membershipId = text(
        (await body(await request('/access/current-actor')))
          .workspaceMembershipId,
      );
      expect(
        (
          await request('/company-director-client-assignments', 'POST', {
            companyId,
            workspaceMembershipId: membershipId,
          })
        ).status,
      ).toBe(201);
      clientId = text(
        (
          await body(
            await request('/clients', 'POST', {
              displayName: 'Synthetic Client',
            }),
          )
        ).id,
      );
    });

    function request(
      path: string,
      method = 'GET',
      value?: unknown,
      options: { key?: string; company?: string; workspace?: string } = {},
    ) {
      const company = options.company ?? companyId;
      return fetch(`${harness.origin}/api${path}`, {
        method,
        headers: {
          ...owner,
          ...(company ? { 'x-company-context-id': company } : {}),
          ...(options.workspace
            ? { 'x-workspace-context-id': options.workspace }
            : {}),
          'content-type': 'application/json',
          'idempotency-key': options.key ?? randomUUID(),
        },
        ...(value === undefined ? {} : { body: JSON.stringify(value) }),
      });
    }
    async function createCompany(displayName: string) {
      return text(
        (await body(await request('/companies', 'POST', { displayName }))).id,
      );
    }
    async function grant(company = companyId) {
      expect(
        (
          await request('/company-document-registrar-assignments', 'POST', {
            companyId: company,
            workspaceMembershipId: membershipId,
          })
        ).status,
      ).toBe(201);
    }
    async function revoke(company = companyId) {
      expect(
        (
          await request(
            `/company-document-registrar-assignments/${membershipId}/${company}`,
            'DELETE',
          )
        ).status,
      ).toBe(200);
    }
    async function register(
      overrides: Partial<typeof initial & { clientId: string }> = {},
      company = companyId,
    ) {
      const response = await request(
        '/documents',
        'POST',
        { clientId, ...initial, ...overrides },
        { company },
      );
      expect(response.status).toBe(201);
      return text((await body(response)).id);
    }
    async function correct(
      documentId: string,
      expectedRevision: number,
      fields: Partial<typeof initial>,
    ) {
      const response = await request(`/documents/${documentId}`, 'PATCH', {
        expectedRevision,
        ...fields,
      });
      expect(response.status).toBe(200);
      return body(response);
    }
    function history(
      documentId: string,
      query = '',
      options: { company?: string; workspace?: string } = {},
    ) {
      return request(
        `/documents/${documentId}/correction-history${query}`,
        'GET',
        undefined,
        options,
      );
    }
    async function page(documentId: string, query = '') {
      const response = await history(documentId, query);
      expect(response.status).toBe(200);
      const value = await body(response);
      return {
        corrections: list(value.corrections).map(object),
        nextBeforeRevision: value.nextBeforeRevision,
      };
    }
    async function revisions(documentId: string, query = '') {
      const { corrections, nextBeforeRevision } = await page(documentId, query);
      return {
        revisions: corrections.map((correction) => correction.revision),
        nextBeforeRevision,
      };
    }
    /** Everything a history read must leave untouched. */
    async function persistedState() {
      const result = await harness.pool.query(
        `SELECT
           (SELECT count(*)::int FROM document_correction_commands) AS commands,
           (SELECT count(*)::int FROM activity_log_events) AS events,
           (SELECT count(*)::int FROM document_registration_events) AS registrations,
           (SELECT json_agg(version ORDER BY id) FROM client_accounts) AS client_versions,
           (SELECT json_agg(json_build_array(id, working_revision, title, purpose) ORDER BY id)
              FROM working_documents) AS documents,
           (SELECT json_agg(url ORDER BY id) FROM document_representations) AS urls`,
      );
      return result.rows[0];
    }

    it('reads the persisted material corrections newest first with actor, server time and before/after values', async () => {
      await grant();
      const documentId = await register();
      await correct(documentId, 1, {
        title: ' Corrected questionnaire ',
        purpose: 'Corrected purpose',
        url: 'https://example.test/corrected',
      });
      expect(
        await correct(documentId, 2, { title: 'Corrected questionnaire' }),
      ).toMatchObject({ revision: 2, outcome: 'unchanged' });
      await correct(documentId, 2, { purpose: 'Second purpose' });

      const response = await history(documentId);
      expect(response.status).toBe(200);
      const read = await body(response);
      // The stored server instant, parsed as the service's driver parses it.
      const stored = await harness.pool.query<{ occurred_at: string }>(
        `SELECT occurred_at::text AS occurred_at FROM document_correction_commands
         WHERE document_id = $1 AND outcome = 'corrected' ORDER BY revision DESC`,
        [documentId],
      );
      const instants = stored.rows.map((row) =>
        new Date(row.occurred_at).toISOString(),
      );
      expect(instants).toHaveLength(2);
      expect(read).toEqual({
        corrections: [
          {
            revision: 3,
            occurredAt: instants[0],
            actor: { displayName: 'Document Registrar' },
            changes: {
              purpose: { before: 'Corrected purpose', after: 'Second purpose' },
            },
          },
          {
            revision: 2,
            occurredAt: instants[1],
            actor: { displayName: 'Document Registrar' },
            changes: {
              title: {
                before: initial.title,
                after: 'Corrected questionnaire',
              },
              purpose: {
                before: initial.purpose,
                after: 'Corrected purpose',
              },
              url: {
                before: initial.url,
                after: 'https://example.test/corrected',
              },
            },
          },
        ],
        nextBeforeRevision: null,
      });
      expect(JSON.stringify(read)).not.toContain(owner['x-test-email']);
      expect(await body(await history(documentId))).toEqual(read);

      const other = await register({ title: 'Untouched questionnaire' });
      expect(await page(other)).toEqual({
        corrections: [],
        nextBeforeRevision: null,
      });
    });

    it('pages 20 material corrections by revision with a lookahead, stays stable across a new correction and rejects malformed queries', async () => {
      await grant();
      const documentId = await register();
      let revision = 1;
      for (let index = 1; index <= 21; index += 1) {
        await correct(documentId, revision, { title: `Title ${index}` });
        revision += 1;
        if (index === 10)
          expect(
            await correct(documentId, revision, { title: 'Title 10' }),
          ).toMatchObject({ outcome: 'unchanged' });
      }
      const descending = (from: number, to: number) =>
        Array.from({ length: from - to + 1 }, (_, index) => from - index);

      const first = await revisions(documentId);
      expect(first).toEqual({
        revisions: descending(22, 3),
        nextBeforeRevision: 3,
      });
      // A correction committed between pages neither duplicates nor displaces
      // the older page the cursor continues.
      await correct(documentId, 22, { title: 'Title 22' });
      expect(await revisions(documentId, '?beforeRevision=3')).toEqual({
        revisions: [2],
        nextBeforeRevision: null,
      });
      expect(await revisions(documentId)).toEqual({
        revisions: descending(23, 4),
        nextBeforeRevision: 4,
      });
      expect(await revisions(documentId, '?beforeRevision=23')).toEqual({
        revisions: descending(22, 3),
        nextBeforeRevision: 3,
      });
      // Exactly 20 older rows: no lookahead row, so no continuation.
      expect(await revisions(documentId, '?beforeRevision=22')).toEqual({
        revisions: descending(21, 2),
        nextBeforeRevision: null,
      });
      for (const before of ['2', '1'])
        expect(
          await revisions(documentId, `?beforeRevision=${before}`),
        ).toEqual({ revisions: [], nextBeforeRevision: null });
      expect(
        (await revisions(documentId, '?beforeRevision=2147483647')).revisions,
      ).toEqual(descending(23, 4));

      const state = await persistedState();
      const rejected = await Promise.all(
        [
          '?beforeRevision=0',
          '?beforeRevision=-1',
          '?beforeRevision=abc',
          '?beforeRevision=1.5',
          '?beforeRevision=03',
          '?beforeRevision=%2B3',
          '?beforeRevision=%203',
          '?beforeRevision=2147483648',
          '?beforeRevision=',
          '?beforeRevision',
          '?beforeRevision=3&beforeRevision=4',
          '?beforeRevision=3&unknown=1',
          '?cursor=3',
          '?unknown',
        ].map(async (query) => {
          const response = await history(documentId, query);
          return { status: response.status, body: await response.json() };
        }),
      );
      expect(
        new Set(rejected.map((result) => JSON.stringify(result))).size,
      ).toBe(1);
      expect(rejected[0]?.status).toBe(400);
      expect(JSON.stringify(rejected[0]?.body)).not.toMatch(/Title|example/u);
      expect(await persistedState()).toEqual(state);
    }, 90_000);

    it('refuses exactly as the detail read does, including across Companies, Workspaces and revoked authority', async () => {
      await grant();
      const documentId = await register();
      await correct(documentId, 1, { title: 'Confidential corrected title' });
      await correct(documentId, 2, { purpose: 'Confidential purpose' });
      const other = await createCompany('BIC');
      await grant(other);
      const otherClient = text(
        (
          await body(
            await request(
              '/clients',
              'POST',
              { displayName: 'BIC-only synthetic Client' },
              { company: other },
            ),
          )
        ).id,
      );
      const otherDocument = await register({ clientId: otherClient }, other);
      const foreignWorkspace = randomUUID();
      await harness.pool.query(
        'INSERT INTO workspaces(id,name) VALUES($1,$2)',
        [foreignWorkspace, 'Hidden Workspace'],
      );
      const state = await persistedState();
      const expectRefusal = async (
        name: string,
        status: number,
        target: string,
        options: { company?: string; workspace?: string } = {},
      ) => {
        const detail = await request(
          `/documents/${target}`,
          'GET',
          undefined,
          options,
        );
        const expected = { status: detail.status, body: await detail.json() };
        expect(expected.status, name).toBe(status);
        for (const query of ['', '?beforeRevision=3', '?beforeRevision=bad']) {
          const response = await history(target, query, options);
          const refusal = {
            status: response.status,
            body: await response.json(),
          };
          expect(refusal, `${name} ${query}`).toEqual(expected);
          expect(JSON.stringify(refusal.body)).not.toMatch(
            /Confidential|Document Registrar/u,
          );
        }
      };

      await expectRefusal('unknown Document', 404, randomUUID());
      await expectRefusal('another Company Document', 404, otherDocument);
      await expectRefusal(
        'this Document from another Company',
        404,
        documentId,
        {
          company: other,
        },
      );
      await expectRefusal('foreign Workspace', 403, documentId, {
        workspace: foreignWorkspace,
      });
      await expectRefusal('no Company context', 403, documentId, {
        company: '',
      });
      await expectRefusal('malformed Document id', 400, 'not-a-document');

      // Current authority is rechecked for every page.
      expect((await revisions(documentId)).revisions).toEqual([3, 2]);
      await revoke();
      await expectRefusal('revoked Registrar', 403, documentId);
      await grant();
      expect(
        (await revisions(documentId, '?beforeRevision=3')).revisions,
      ).toEqual([2]);
      await harness.pool.query(
        `UPDATE client_company_relationships SET status = 'archived'
         WHERE client_account_id = $1 AND company_id = $2`,
        [clientId, companyId],
      );
      await expectRefusal('archived Client relationship', 404, documentId);
      await harness.pool.query(
        `UPDATE client_company_relationships SET status = 'active'
         WHERE client_account_id = $1 AND company_id = $2`,
        [clientId, companyId],
      );
      const after = await persistedState();
      expect({ ...after, events: state.events }).toEqual(state);
    }, 60_000);

    it('lets a Registrar v1 reader without correction authority read the history of a superseded original Client', async () => {
      await grant();
      const documentId = await register();
      await correct(documentId, 1, { url: 'https://example.test/corrected' });
      const second = text(
        (
          await body(
            await request('/clients', 'POST', {
              displayName: 'Second synthetic Client',
              taxId: 'SECOND-369',
            }),
          )
        ).id,
      );
      await harness.pool.query(
        "UPDATE client_accounts SET tax_id='DOCUMENT-369' WHERE id=ANY($1::uuid[])",
        [[clientId, second]],
      );
      const review = await body(
        await request(`/clients/${clientId}/union-reviews`, 'POST', {}),
      );
      expect(review.outcome).toBe('comparison');
      expect(
        (
          await request(
            `/client-union-reviews/${text(review.reviewReference)}/confirm`,
            'POST',
            {
              canonicalClientId: second,
              fields: {
                displayName: clientId,
                taxId: clientId,
                address: clientId,
                telephone: clientId,
                generalEmail: clientId,
                businessActivity: clientId,
              },
              companyIds: [companyId],
              reviewedDifferences: true,
              reason: 'Duplicate synthetic Client identity.',
            },
          )
        ).status,
      ).toBe(201);
      expect(
        await body(await request(`/documents/${documentId}`)),
      ).toMatchObject({ clientId, correction: 'read-only' });

      await revoke();
      await harness.pool.query(
        `INSERT INTO company_role_assignments(workspace_id, company_id, workspace_membership_id, bundle, permission_set_version)
         SELECT workspace_id, $1, $2, 'company_document_registrar', 'v1' FROM workspace_memberships WHERE id=$2`,
        [companyId, membershipId],
      );
      const state = await persistedState();
      expect(await page(documentId)).toEqual({
        corrections: [
          expect.objectContaining({
            revision: 2,
            changes: {
              url: {
                before: initial.url,
                after: 'https://example.test/corrected',
              },
            },
          }),
        ],
        nextBeforeRevision: null,
      });
      expect(await persistedState()).toEqual(state);
    }, 30_000);

    it('omits every prior URL for a metadata-only reader and keeps a URL-only correction as a generic entry', async () => {
      await grant();
      const documentId = await register();
      await correct(documentId, 1, { url: 'https://example.test/url-only' });
      await correct(documentId, 2, {
        title: 'Corrected title',
        url: 'https://example.test/with-title',
      });
      const current = await body(await request('/access/current-actor'));
      const metadataReader: ActorContext = {
        internalUserId: text(current.internalUserId),
        workspaceMembershipId: membershipId,
        workspaceId: text(current.workspaceId),
        workspaceName: 'Document history',
        displayName: 'Document Registrar',
        email: owner['x-test-email'],
        active: true,
        workspacePermissions: ['client.manage'],
        activeCompany: {
          id: companyId,
          displayName: 'PRISMA-PRIM',
          clientPermissions: [],
          documentPermissions: ['document.read'],
        },
      };
      // No metadata-only bundle exists yet; the owning service seam proves the
      // separate Representation-read gate, as for the detail read.
      const context = new DatabaseContext(drizzle(harness.pool));
      const authorization = new CompanyContextAuthorization(context);
      const clients = new ClientOperationalReferenceService(context);
      const accountability = new AccountabilityService(context);
      const boundary = new DocumentReadBoundary(
        authorization,
        context,
        clients,
      );
      const documents = new DocumentsService(
        authorization,
        context,
        clients,
        accountability,
        new ProjectService(context, authorization, clients, accountability),
        boundary,
        new DocumentVersionsService(
          authorization,
          context,
          clients,
          boundary,
          new DocumentPdfStorage(context),
          new DocumentMalwareScanner(new ConfigService()),
        ),
        receivedContractRelationsForTest({
          context,
          authorization,
          clients,
          accountability,
        }),
        externalInvoiceRelationsForTest({
          context,
          authorization,
          clients,
          accountability,
        }),
      );
      const result = await documents.correctionHistory(metadataReader, {
        documentId,
        query: {},
      });
      expect(
        result.corrections.map(({ revision, changes }) => ({
          revision,
          changes,
        })),
      ).toEqual([
        {
          revision: 3,
          changes: {
            title: { before: initial.title, after: 'Corrected title' },
          },
        },
        { revision: 2, changes: {} },
      ]);
      expect(JSON.stringify(result)).not.toMatch(/https:|"url"/u);
      expect(
        (await page(documentId)).corrections.map(
          (correction) => object(correction.changes).url,
        ),
      ).toEqual([
        {
          before: 'https://example.test/url-only',
          after: 'https://example.test/with-title',
        },
        { before: initial.url, after: 'https://example.test/url-only' },
      ]);
    });
  },
);
