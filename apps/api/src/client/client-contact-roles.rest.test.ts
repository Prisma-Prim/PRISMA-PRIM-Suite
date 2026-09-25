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

const databaseUrl = process.env.TEST_DATABASE_URL;
const workspaceId = '00000000-0000-4000-8000-000000000366';
const subjects = {
  owner: { subject: 'contact-roles-owner', displayName: 'Workspace Owner' },
  director: { subject: 'contact-roles-director', displayName: 'Iurie Demo' },
  projectMember: {
    subject: 'contact-roles-project',
    displayName: 'Project Member',
  },
  directorC: { subject: 'contact-roles-director-c', displayName: 'ECG Demo' },
} as const;
type Actor = keyof typeof subjects;

const ion = {
  name: 'Ion Demo',
  telephone: '+373 60 000 366',
  position: 'Director general',
  decisionRoles: ['final_decision_maker', 'financial'],
};
const maria = {
  name: 'Maria Demo',
  position: 'Responsabil calitate',
  decisionRoles: ['influencer', 'technical'],
};

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Expected an object.');
  return Object.fromEntries(Object.entries(value));
}
function string(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected a string.');
  return value;
}
function objects(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error('Expected an array.');
  const values: unknown[] = value;
  return values.map(object);
}
async function body(response: Response) {
  const value: unknown = await response.json();
  return object(value);
}

describe.skipIf(!databaseUrl)(
  'Client Contact position and decision roles REST contract',
  () => {
    let database: IsolatedPostgresTestDatabase;
    let harness: PostgresRestTestHarness;
    let companyA: string;
    let companyB: string;
    let companyC: string;
    let clientId: string;

    beforeAll(async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
      database = await createIsolatedPostgresTestDatabase({
        baseDatabaseUrl: databaseUrl,
        namePrefix: 'client_contact_roles',
      });
      harness = await createPostgresRestTestHarness({
        databaseUrl: database.targetUrl,
        environment: {
          NODE_ENV: 'test',
          ACCESS_IDENTITY_MODE: 'test',
          ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
          ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: subjects.owner.subject,
          ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
          ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Contact Roles',
          ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify(
            [subjects.director, subjects.projectMember, subjects.directorC].map(
              ({ subject }) => ({
                provider: 'deterministic-test',
                subject,
                workspaceId,
              }),
            ),
          ),
        },
      });
    });
    afterAll(async () => {
      await harness?.close();
      await database?.close();
    });
    beforeEach(async () => {
      await harness.pool.query('TRUNCATE workspaces, internal_users CASCADE');
      companyA = string(
        (await command('/companies', { displayName: 'PRISMA-PRIM' })).id,
      );
      companyB = string(
        (await command('/companies', { displayName: 'BIC' })).id,
      );
      companyC = string(
        (await command('/companies', { displayName: 'ECG' })).id,
      );
      const director = await membership('director');
      await grant('/company-director-client-assignments', director, companyA);
      await grant('/company-director-client-assignments', director, companyB);
      await grant(
        '/company-director-client-assignments',
        await membership('directorC'),
        companyC,
      );
      clientId = string(
        (
          await command(
            '/clients',
            {
              displayName: 'AGRONOVA Demo SRL',
              taxId: '1003600036600',
              contacts: [{ name: 'Ion Demo', telephone: '+373 60 000 366' }],
            },
            { actor: 'director', company: companyA },
          )
        ).id,
      );
      const attached = await request(
        `/clients/${clientId}/active-company-relationship`,
        { actor: 'owner', company: companyB, method: 'PUT' },
      );
      expect(attached.status).toBe(200);
    });

    function request(
      path: string,
      options: {
        actor?: Actor;
        company?: string | null;
        method?: string;
        value?: unknown;
        key?: string;
      } = {},
    ) {
      const {
        actor = 'director',
        company = companyA,
        method = 'GET',
        value,
        key = randomUUID(),
      } = options;
      const identity = subjects[actor];
      return fetch(`${harness.origin}/api${path}`, {
        method,
        headers: {
          'x-test-external-provider': 'deterministic-test',
          'x-test-external-subject': identity.subject,
          'x-test-display-name': identity.displayName,
          'x-test-email': `${identity.subject}@example.test`,
          ...(company ? { 'x-company-context-id': company } : {}),
          'idempotency-key': key,
          'content-type': 'application/json',
        },
        ...(value === undefined ? {} : { body: JSON.stringify(value) }),
      });
    }
    async function command(
      path: string,
      value: unknown,
      options: Parameters<typeof request>[1] = {},
    ) {
      const response = await request(path, {
        actor: 'owner',
        company: null,
        ...options,
        method: 'POST',
        value,
      });
      expect(response.status).toBe(201);
      return body(response);
    }
    async function membership(actor: Actor) {
      const response = await request('/access/current-actor', {
        actor,
        company: null,
      });
      expect(response.status).toBe(200);
      return string((await body(response)).workspaceMembershipId);
    }
    function grant(
      path: string,
      workspaceMembershipId: string,
      companyId: string,
    ) {
      return command(path, { workspaceMembershipId, companyId });
    }
    function patch(
      changes: Record<string, unknown>,
      options: Parameters<typeof request>[1] & {
        expectedVersion?: number;
      } = {},
    ) {
      const { expectedVersion = 1, ...rest } = options;
      return request(`/clients/${clientId}`, {
        ...rest,
        method: 'PATCH',
        value: { expectedVersion, ...changes },
      });
    }
    async function dossier(company = companyA, actor: Actor = 'director') {
      const response = await request(`/clients/${clientId}`, {
        actor,
        company,
      });
      expect(response.status).toBe(200);
      return body(response);
    }
    async function correctionHistory(company = companyA) {
      const response = await request(
        `/clients/${clientId}/correction-history`,
        { company },
      );
      expect(response.status).toBe(200);
      return objects((await body(response)).corrections);
    }
    async function storedCorrections() {
      const result = await harness.pool.query<{
        id: string;
        metadata: unknown;
      }>(
        `SELECT id, metadata FROM activity_log_events
         WHERE action::text = 'client.corrected'
         ORDER BY occurred_at DESC, id DESC`,
      );
      return result.rows;
    }
    async function eventCount() {
      const result = await harness.pool.query<{ count: string }>(
        'SELECT count(*) FROM activity_log_events',
      );
      return Number(result.rows[0]?.count);
    }
    async function correctionCommandCount() {
      const result = await harness.pool.query<{ count: string }>(
        'SELECT count(*) FROM client_account_correction_commands',
      );
      return Number(result.rows[0]?.count);
    }

    it('records Contact positions and decision roles as one material correction with history visible to every involved director', async () => {
      const events = await eventCount();
      const response = await patch({
        contacts: [
          {
            ...ion,
            position: '  Director general  ',
            decisionRoles: ['financial', 'final_decision_maker', 'financial'],
          },
          { ...maria, decisionRoles: ['technical', 'influencer'] },
        ],
      });

      expect(response.status).toBe(200);
      const corrected = await body(response);
      expect(corrected).toMatchObject({ version: 2, contacts: [ion, maria] });
      expect(await dossier()).toEqual(corrected);
      expect(await eventCount()).toBe(events + 1);
      const contactChange = {
        before: [{ name: 'Ion Demo', telephone: '+373 60 000 366' }],
        after: [ion, maria],
      };
      const [stored] = await storedCorrections();
      expect(object(stored?.metadata).changes).toEqual({
        contacts: contactChange,
      });
      expect(
        (await correctionHistory()).map((correction) => correction.changes),
      ).toEqual([{ contacts: contactChange }]);

      expect((await dossier(companyB)).contacts).toEqual([ion, maria]);

      const telephoneOnly = await patch(
        {
          contacts: [ion, { ...maria, telephone: '+373 60 000 367' }],
        },
        { expectedVersion: 2 },
      );
      expect(telephoneOnly.status).toBe(200);
      expect((await dossier()).contacts).toEqual([
        ion,
        { ...maria, telephone: '+373 60 000 367' },
      ]);
      expect(
        (await correctionHistory()).map((correction) => correction.changes),
      ).toEqual([
        {
          contacts: {
            before: [ion, maria],
            after: [ion, { ...maria, telephone: '+373 60 000 367' }],
          },
        },
        { contacts: contactChange },
      ]);
    });

    it('treats reordered or duplicated decision roles as no change and keeps idempotency semantics', async () => {
      const key = randomUUID();
      const first = await patch({ contacts: [ion] }, { key });
      expect(first.status).toBe(200);
      const result = await body(first);
      const events = await eventCount();

      const reordered = await patch(
        {
          contacts: [
            {
              ...ion,
              decisionRoles: ['financial', 'final_decision_maker', 'financial'],
            },
          ],
        },
        { expectedVersion: 2 },
      );
      expect(reordered.status).toBe(400);
      expect(await reordered.json()).toMatchObject({
        message: 'The Client correction must change at least one field.',
      });

      const replay = await patch({ contacts: [ion] }, { key });
      expect(replay.status).toBe(200);
      expect(await replay.json()).toEqual(result);

      const changedIntent = await patch(
        { contacts: [{ ...ion, decisionRoles: ['user'] }] },
        { key },
      );
      expect(changedIntent.status).toBe(400);
      expect(await changedIntent.json()).toMatchObject({
        message:
          'Idempotency-Key was already used for another Client correction.',
      });
      expect(await eventCount()).toBe(events);
      expect((await dossier()).version).toBe(2);
    });

    it('accepts the fields on enriched registration and keeps the minimal bootstrap refusing Contacts', async () => {
      const key = randomUUID();
      const registration = {
        displayName: 'AGRONOVA Registration Demo SRL',
        contacts: [
          {
            ...maria,
            position: ' Responsabil calitate ',
            decisionRoles: ['technical', 'influencer', 'technical'],
          },
        ],
      };
      const created = await request('/clients', {
        method: 'POST',
        value: registration,
        key,
      });
      expect(created.status).toBe(201);
      const createdClient = await body(created);
      const read = await request(`/clients/${string(createdClient.id)}`);
      expect((await body(read)).contacts).toEqual([maria]);
      const replay = await request('/clients', {
        method: 'POST',
        value: registration,
        key,
      });
      expect(replay.status).toBe(201);
      expect(await replay.json()).toEqual(createdClient);

      const bootstrap = await request('/clients', {
        actor: 'owner',
        method: 'POST',
        value: {
          displayName: 'Bootstrap Demo SRL',
          contacts: [{ name: 'Ion Demo', decisionRoles: ['user'] }],
        },
      });
      expect(bootstrap.status).toBe(400);
      expect(await bootstrap.json()).toMatchObject({
        message: 'Unknown Client field.',
      });
    });

    it('rejects malformed positions and decision roles without persistence', async () => {
      const events = await eventCount();
      const before = await dossier();
      for (const contact of [
        { name: 'Ion Demo', position: 'P'.repeat(501) },
        { name: 'Ion Demo', position: 42 },
        { name: 'Ion Demo', decisionRoles: 'financial' },
        { name: 'Ion Demo', decisionRoles: [7] },
        { name: 'Ion Demo', decisionRoles: ['sponsor'] },
        { name: 'Ion Demo', preference: 'email' },
      ]) {
        const correction = await patch({ contacts: [contact] });
        expect(correction.status, JSON.stringify(contact)).toBe(400);
        const registration = await request('/clients', {
          method: 'POST',
          value: { displayName: 'Rejected Demo SRL', contacts: [contact] },
        });
        expect(registration.status, JSON.stringify(contact)).toBe(400);
      }
      expect(await dossier()).toEqual(before);
      expect(await eventCount()).toBe(events);
    });

    it('omits a blank position and an empty decision-role list', async () => {
      const response = await patch({
        contacts: [
          {
            name: 'Ion Demo',
            telephone: '+373 60 000 366',
            position: '   ',
            decisionRoles: [],
          },
        ],
        telephone: '+373 22 000 366',
      });
      expect(response.status).toBe(200);
      expect(await body(response)).toMatchObject({
        contacts: [{ name: 'Ion Demo', telephone: '+373 60 000 366' }],
      });
      expect(
        (await correctionHistory()).map((correction) => correction.changes),
      ).toEqual([{ telephone: { before: null, after: '+373 22 000 366' } }]);
    });

    it('keeps Contacts and correction events stored before this slice readable unchanged', async () => {
      await harness.pool.query(
        `UPDATE client_accounts SET contacts = $1::jsonb WHERE id = $2`,
        [
          JSON.stringify([
            { name: 'Legacy Demo', email: 'legacy@example.test' },
          ]),
          clientId,
        ],
      );
      expect((await dossier()).contacts).toEqual([
        { name: 'Legacy Demo', email: 'legacy@example.test' },
      ]);
      expect((await patch({ contacts: [ion] })).status).toBe(200);
      const [event] = await storedCorrections();
      const legacyChange = {
        before: [{ name: 'Legacy Demo' }],
        after: [{ name: 'Legacy Demo', telephone: '+373 60 000 366' }],
      };
      await harness.pool.query(
        'UPDATE activity_log_events SET metadata = $1 WHERE id = $2',
        [JSON.stringify({ changes: { contacts: legacyChange } }), event?.id],
      );
      expect(
        (await correctionHistory()).map((correction) => correction.changes),
      ).toEqual([{ contacts: legacyChange }]);

      for (const contact of [
        { name: 'Secret-value', decisionRoles: ['vip'] },
        { name: 'Secret-value', decisionRoles: ['user', 'influencer'] },
        { name: 'Secret-value', position: 7 },
        { name: 'Secret-value', preference: 'email' },
      ]) {
        await harness.pool.query(
          'UPDATE activity_log_events SET metadata = $1 WHERE id = $2',
          [
            JSON.stringify({
              changes: { contacts: { before: [], after: [contact] } },
            }),
            event?.id,
          ],
        );
        const response = await request(
          `/clients/${clientId}/correction-history`,
        );
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({
          statusCode: 500,
          message: 'Internal server error',
        });
      }
    });

    it('keeps the delivered refusals for unrelated, Project-only and Workspace-only actors', async () => {
      expect((await patch({ contacts: [ion, maria] })).status).toBe(200);
      const projectMember = await membership('projectMember');
      await grant('/company-context-assignments', projectMember, companyA);
      await grant('/company-project-assignments', projectMember, companyA);
      const events = await eventCount();
      const commands = await correctionCommandCount();
      const refusals: { actor: Actor; company: string; status: number }[] = [
        { actor: 'directorC', company: companyC, status: 404 },
        { actor: 'projectMember', company: companyA, status: 403 },
        { actor: 'owner', company: companyA, status: 403 },
      ];
      for (const { actor, company, status } of refusals) {
        const read = await request(`/clients/${clientId}`, { actor, company });
        expect(read.status, actor).toBe(status);
        expect(JSON.stringify(await read.json())).not.toMatch(
          /Director general|final_decision_maker/u,
        );
        const history = await request(
          `/clients/${clientId}/correction-history`,
          { actor, company },
        );
        expect(history.status, actor).toBe(status);
        const correction = await patch(
          { contacts: [{ ...ion, decisionRoles: ['blocker'] }] },
          { actor, company, expectedVersion: 2 },
        );
        expect(correction.status, actor).toBe(status);
      }
      const unknownClient = await request(`/clients/${randomUUID()}`, {
        method: 'PATCH',
        value: { expectedVersion: 2, contacts: [ion] },
      });
      expect(unknownClient.status).toBe(404);
      expect(await eventCount()).toBe(events);
      expect(await correctionCommandCount()).toBe(commands);
      expect((await dossier(companyB)).contacts).toEqual([ion, maria]);
    });
  },
);
