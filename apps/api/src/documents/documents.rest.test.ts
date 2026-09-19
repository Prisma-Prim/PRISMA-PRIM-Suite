import { drizzle } from 'drizzle-orm/node-postgres';
import type { ActorContext } from '../access/access.types.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import { DatabaseContext } from '../database/database-context.js';
import { DocumentsService } from './documents.service.js';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const owner = {
  'x-test-external-provider': 'deterministic-test',
  'x-test-external-subject': 'document-owner',
  'x-test-display-name': 'Document Registrar',
  'x-test-email': 'document@example.test',
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
async function body(response: Response) {
  return object(await response.json());
}

describe.skipIf(!databaseUrl)(
  'Working Document reference REST contract',
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
        namePrefix: 'documents',
      });
      harness = await createPostgresRestTestHarness({
        databaseUrl: database.targetUrl,
        environment: {
          NODE_ENV: 'test',
          ACCESS_IDENTITY_MODE: 'test',
          ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
          ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'document-owner',
          ACCESS_BOOTSTRAP_WORKSPACE_ID: '00000000-0000-4000-8000-000000000239',
          ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Documents',
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
      companyId = text(
        (
          await body(
            await request('/companies', 'POST', { displayName: 'PRISMA-PRIM' }),
          )
        ).id,
      );
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
      key = randomUUID(),
      company = companyId,
    ) {
      return fetch(`${harness.origin}/api${path}`, {
        method,
        headers: {
          ...owner,
          ...(company ? { 'x-company-context-id': company } : {}),
          'content-type': 'application/json',
          'idempotency-key': key,
        },
        ...(value === undefined ? {} : { body: JSON.stringify(value) }),
      });
    }
    const input = () => ({
      clientId,
      title: ' Initial assessment questionnaire ',
      purpose: ' Prepare the first assessment ',
      url: 'https://example.test/questionnaire',
    });
    async function grant() {
      const response = await request(
        '/company-document-registrar-assignments',
        'POST',
        { companyId, workspaceMembershipId: membershipId },
      );
      expect(response.status).toBe(201);
      expect(await body(response)).toMatchObject({
        bundle: 'Company Document Registrar',
        permissionSetVersion: 'v1',
      });
    }
    it('requires an explicit grant, registers one draft reference and reopens it after reload', async () => {
      expect((await request('/documents', 'POST', input())).status).toBe(403);
      await grant();
      const created = await request('/documents', 'POST', input());
      expect(created.status).toBe(201);
      const document = await body(created);
      const version = object(document.version);
      const representation = object(version.representation);
      expect(new Set([document.id, version.id, representation.id]).size).toBe(
        3,
      );
      expect(document).toMatchObject({
        companyId,
        clientId,
        title: 'Initial assessment questionnaire',
        purpose: 'Prepare the first assessment',
        type: 'questionnaire',
        confidentiality: 'company-confidential',
        version: {
          status: 'draft',
          representation: {
            kind: 'external-reference',
            verification: 'unverified',
            url: 'https://example.test/questionnaire',
          },
        },
      });
      expect(
        await body(await request(`/documents/${text(document.id)}`)),
      ).toEqual(document);
      expect(await (await request('/documents')).json()).toEqual([document]);
      const activity = await body(await request('/activity-log'));
      expect(activity.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: 'document.registered',
            metadata: {},
            target: { type: 'document', documentId: document.id, companyId },
          }),
        ]),
      );
    });
    it('registers and reopens a valid HTTPS reference longer than 4000 characters', async () => {
      await grant();
      const url = `https://example.test/questionnaire?reference=${'a'.repeat(5000)}`;
      const response = await request('/documents', 'POST', { ...input(), url });
      expect(response.status).toBe(201);
      const document = await body(response);
      expect(document).toMatchObject({
        version: { representation: { url } },
      });
      expect(
        await body(await request(`/documents/${text(document.id)}`)),
      ).toEqual(document);
    });
    it('collapses concurrent exact retries and rejects a conflicting payload without another event', async () => {
      await grant();
      const key = randomUUID();
      const responses = await Promise.all(
        Array.from({ length: 4 }, () =>
          request('/documents', 'POST', input(), key),
        ),
      );
      expect(responses.map((response) => response.status)).toEqual([
        201, 201, 201, 201,
      ]);
      const values = await Promise.all(responses.map(body));
      expect(new Set(values.map((value) => value.id)).size).toBe(1);
      expect(
        (
          await request(
            '/documents',
            'POST',
            { ...input(), title: 'Changed' },
            key,
          )
        ).status,
      ).toBe(409);
      expect(await (await request('/documents')).json()).toHaveLength(1);
      const events = object(
        await (await request('/activity-log')).json(),
      ).events;
      if (!Array.isArray(events)) throw new Error('Expected events');
      expect(
        events
          .map(object)
          .filter((event) => event.action === 'document.registered'),
      ).toHaveLength(1);
    });
    it('denies revoked and inactive authority including retries and hides another Company records and events', async () => {
      await grant();
      const key = randomUUID();
      const document = await body(
        await request('/documents', 'POST', input(), key),
      );
      const other = text(
        (
          await body(
            await request('/companies', 'POST', { displayName: 'BIC' }),
          )
        ).id,
      );
      expect(
        (await request('/documents', 'GET', undefined, randomUUID(), other))
          .status,
      ).toBe(403);
      const hidden = await (
        await request('/activity-log', 'GET', undefined, randomUUID(), other)
      ).text();
      expect(hidden).not.toContain(document.id);
      expect(hidden).not.toContain(document.title);
      expect(
        (
          await request(
            `/company-document-registrar-assignments/${membershipId}/${companyId}`,
            'DELETE',
          )
        ).status,
      ).toBe(200);
      for (const path of ['/documents', `/documents/${text(document.id)}`])
        expect((await request(path)).status).toBe(403);
      expect((await request('/documents', 'POST', input(), key)).status).toBe(
        403,
      );
      await grant();
      await harness.pool.query(
        "UPDATE workspace_memberships SET status='inactive' WHERE id=$1",
        [membershipId],
      );
      expect((await request('/documents', 'POST', input(), key)).status).toBe(
        403,
      );
    });
    it('rejects unsafe links, unrelated Clients and invalid fields without mutation', async () => {
      await grant();
      for (const value of [
        { ...input(), url: 'javascript:alert(1)' },
        { ...input(), url: 'http://example.test' },
        { ...input(), url: 'https://name:secret@example.test' },
        { ...input(), title: ' ' },
        { ...input(), purpose: 'x'.repeat(2001) },
        { ...input(), clientId: 'not-an-id' },
      ])
        expect((await request('/documents', 'POST', value)).status).toBe(400);
      expect(
        (
          await request('/documents', 'POST', {
            ...input(),
            clientId: randomUUID(),
          })
        ).status,
      ).toBe(404);
      expect(await (await request('/documents')).json()).toEqual([]);
      const events = await (await request('/activity-log')).text();
      expect(events).not.toContain('document.registered');
    });
    it('rolls back registration and the Client reversal fence if history cannot commit', async () => {
      await grant();
      const before = await body(await request(`/clients/${clientId}`));
      await harness.pool.query(
        `CREATE FUNCTION reject_document_event() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'forced event failure'; END; $$ LANGUAGE plpgsql; CREATE TRIGGER reject_document_event BEFORE INSERT ON document_registration_events FOR EACH ROW EXECUTE FUNCTION reject_document_event();`,
      );
      try {
        expect((await request('/documents', 'POST', input())).status).toBe(500);
        expect(await (await request('/documents')).json()).toEqual([]);
        expect(
          (await body(await request(`/clients/${clientId}`))).version,
        ).toBe(before.version);
      } finally {
        await harness.pool.query(
          'DROP TRIGGER reject_document_event ON document_registration_events; DROP FUNCTION reject_document_event();',
        );
      }
    });
    async function unionSetup(supersedeOriginal = false) {
      const second = text(
        (
          await body(
            await request('/clients', 'POST', {
              displayName: 'Second synthetic Client',
              taxId: 'SECOND-239',
            }),
          )
        ).id,
      );
      await harness.pool.query(
        "UPDATE client_accounts SET tax_id='DOCUMENT-239' WHERE id=ANY($1::uuid[])",
        [[clientId, second]],
      );
      const review = await body(
        await request(`/clients/${clientId}/union-reviews`, 'POST', {}),
      );
      expect(review.outcome).toBe('comparison');
      const response = await request(
        `/client-union-reviews/${text(review.reviewReference)}/confirm`,
        'POST',
        {
          canonicalClientId: supersedeOriginal ? second : clientId,
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
      );
      expect(response.status).toBe(201);
      return {
        second,
        reference: text((await body(response)).projectionReference),
      };
    }
    function reverse(reference: string) {
      return request(`/client-union-operations/${reference}/reversal`, 'POST', {
        companyIds: [companyId],
        reason: 'Reverse synthetic union.',
      });
    }
    it('keeps an existing original Client association through union and reversal', async () => {
      await grant();
      const registered = await body(
        await request('/documents', 'POST', input()),
      );
      const { reference } = await unionSetup(true);
      expect(
        (await body(await request(`/documents/${text(registered.id)}`)))
          .clientId,
      ).toBe(clientId);
      expect((await reverse(reference)).status).toBe(201);
      expect(
        (await body(await request(`/documents/${text(registered.id)}`)))
          .clientId,
      ).toBe(clientId);
    });
    it('blocks reversal after a new post-union reference without relocating history', async () => {
      await grant();
      const { reference } = await unionSetup();
      const registered = await body(
        await request('/documents', 'POST', input()),
      );
      expect((await reverse(reference)).status).toBe(409);
      expect(
        (await body(await request(`/documents/${text(registered.id)}`)))
          .clientId,
      ).toBe(clientId);
    });
    it('serializes registration against reversal without leaving a dangling Company association', async () => {
      await grant();
      const { reference } = await unionSetup();
      const [registration, reversal] = await Promise.all([
        request('/documents', 'POST', input()),
        reverse(reference),
      ]);
      expect(registration.status).toBe(201);
      expect([201, 409]).toContain(reversal.status);
      const document = await body(registration);
      expect(
        (await body(await request(`/documents/${text(document.id)}`))).clientId,
      ).toBe(clientId);
      if (reversal.status === 409)
        expect((await reverse(reference)).status).toBe(409);
    });
    it('does not serialize a Representation URL for a metadata-only module actor', async () => {
      await grant();
      const registered = await body(
        await request('/documents', 'POST', input()),
      );
      const current = await body(await request('/access/current-actor'));
      const actor: ActorContext = {
        internalUserId: text(current.internalUserId),
        workspaceMembershipId: membershipId,
        workspaceId: text(current.workspaceId),
        workspaceName: 'Documents',
        displayName: 'Document Registrar',
        email: 'document@example.test',
        active: true,
        workspacePermissions: ['client.manage'],
        activeCompany: {
          id: companyId,
          displayName: 'PRISMA-PRIM',
          clientPermissions: [],
          documentPermissions: ['document.read'],
        },
      };
      // No metadata-only bundle is introduced. This public Documents seam proves
      // the separate representation permission even before another bundle exists.
      const context = new DatabaseContext(drizzle(harness.pool));
      const documents = new DocumentsService(
        new CompanyContextAuthorization(context),
        context,
        new ClientOperationalReferenceService(context),
        new AccountabilityService(context),
      );
      const result = await documents.read(actor, text(registered.id));
      expect(result.version.representation).toMatchObject({ access: 'denied' });
      expect(JSON.stringify(result)).not.toContain('https://');
      expect(JSON.stringify(await documents.list(actor))).not.toContain(
        'https://',
      );
    });
    it('does not expose another Company or Workspace even when the actor has grants in both Companies', async () => {
      await grant();
      const registered = await body(
        await request('/documents', 'POST', input()),
      );
      const other = text(
        (
          await body(
            await request('/companies', 'POST', { displayName: 'BIC' }),
          )
        ).id,
      );
      expect(
        (
          await request('/company-document-registrar-assignments', 'POST', {
            companyId: other,
            workspaceMembershipId: membershipId,
          })
        ).status,
      ).toBe(201);
      expect(
        await (
          await request('/documents', 'GET', undefined, randomUUID(), other)
        ).json(),
      ).toEqual([]);
      expect(
        (
          await request(
            `/documents/${text(registered.id)}`,
            'GET',
            undefined,
            randomUUID(),
            other,
          )
        ).status,
      ).toBe(404);
      expect(
        await (
          await request('/activity-log', 'GET', undefined, randomUUID(), other)
        ).text(),
      ).not.toContain(registered.id);
      const unrelated = text(
        (
          await body(
            await request(
              '/clients',
              'POST',
              { displayName: 'BIC-only synthetic Client' },
              randomUUID(),
              other,
            ),
          )
        ).id,
      );
      expect(
        (
          await request('/documents', 'POST', {
            ...input(),
            clientId: unrelated,
          })
        ).status,
      ).toBe(404);
      const foreignWorkspace = randomUUID();
      await harness.pool.query(
        'INSERT INTO workspaces(id,name) VALUES($1,$2)',
        [foreignWorkspace, 'Hidden Workspace'],
      );
      const response = await fetch(
        `${harness.origin}/api/documents/${text(registered.id)}`,
        {
          headers: {
            ...owner,
            'x-workspace-context-id': foreignWorkspace,
            'x-company-context-id': companyId,
          },
        },
      );
      expect(response.status).toBe(403);
      expect(await response.text()).not.toContain(registered.id);
    });
    it('shares the 50-event dated page between Document registrations and older ordinary events', async () => {
      await grant();
      // Isolated fixture default: preserve the append-only event rows while
      // making all new Document events deterministically newer than setup.
      await harness.pool.query(
        "ALTER TABLE document_registration_events ALTER COLUMN occurred_at SET DEFAULT '2030-03-01T12:00:00Z'::timestamptz",
      );
      try {
        for (let index = 0; index < 50; index += 1) {
          const response = await request('/documents', 'POST', {
            ...input(),
            title: `Working questionnaire ${index}`,
          });
          expect(response.status).toBe(201);
        }
        const response = await request('/activity-log');
        expect(response.status).toBe(200);
        const page = await body(response);
        if (!Array.isArray(page.events))
          throw new Error('Expected Activity Log events');
        const events = page.events.map(object);
        expect(events).toHaveLength(50);
        expect(
          events.every((event) => event.action === 'document.registered'),
        ).toBe(true);
        expect(events[0]).toMatchObject({
          occurredAt: '2030-03-01T12:00:00.000Z',
          metadata: {},
        });
        const ids = events.map((event) => text(event.id));
        expect(new Set(ids).size).toBe(50);
        expect(ids).toEqual([...ids].sort().reverse());
      } finally {
        await harness.pool.query(
          'ALTER TABLE document_registration_events ALTER COLUMN occurred_at SET DEFAULT now()',
        );
      }
    });
  },
);
