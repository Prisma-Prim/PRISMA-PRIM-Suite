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
const workspaceId = '00000000-0000-4000-8000-000000000372';
const foreignWorkspaceId = '00000000-0000-4000-8000-000000003720';
const taxId = '1003600037200';
const subjects = {
  owner: { subject: 'contact-preferences-owner', displayName: 'Owner' },
  director: { subject: 'contact-preferences-director', displayName: 'Iurie' },
  directorB: { subject: 'contact-preferences-director-b', displayName: 'BIC' },
  projectMember: {
    subject: 'contact-preferences-project',
    displayName: 'Project Member',
  },
  directorC: { subject: 'contact-preferences-director-c', displayName: 'ECG' },
} as const;
type Actor = keyof typeof subjects;

/** U+1F600 is one Unicode code point stored as two UTF-16 code units. */
const astral = '\u{1F600}';
const ion = { name: 'Ion Demo', telephone: '+373 60 000 372' };
const ionPreferences = {
  ...ion,
  communicationPreferences: 'Romanian; email preferred\nweekday mornings',
};
const maria = {
  name: 'Maria Demo',
  communicationPreferences: `Telefon după ora 14:00 ${astral}`,
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
  'Client Contact communication preferences REST contract',
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
        namePrefix: 'client_contact_pref',
      });
      harness = await createPostgresRestTestHarness({
        databaseUrl: database.targetUrl,
        environment: {
          NODE_ENV: 'test',
          ACCESS_IDENTITY_MODE: 'test',
          ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
          ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: subjects.owner.subject,
          ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
          ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Contact Preferences',
          ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify(
            [
              subjects.director,
              subjects.directorB,
              subjects.projectMember,
              subjects.directorC,
            ].map(({ subject }) => ({
              provider: 'deterministic-test',
              subject,
              workspaceId,
            })),
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
        await membership('directorB'),
        companyB,
      );
      await grant(
        '/company-director-client-assignments',
        await membership('directorC'),
        companyC,
      );
      clientId = string(
        (
          await command(
            '/clients',
            { displayName: 'AGRONOVA Demo SRL', taxId, contacts: [ion] },
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
    async function correctionChanges(company = companyA) {
      const response = await request(
        `/clients/${clientId}/correction-history`,
        { company },
      );
      expect(response.status).toBe(200);
      return objects((await body(response)).corrections).map(
        (correction) => correction.changes,
      );
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

    it('records, keeps and explicitly clears preferences with one attributable event per material correction', async () => {
      const events = await eventCount();
      const recorded = await patch({
        contacts: [
          {
            ...ion,
            communicationPreferences:
              '  Romanian; email preferred\nweekday mornings \n',
          },
          maria,
        ],
      });

      expect(recorded.status).toBe(200);
      const corrected = await body(recorded);
      expect(corrected).toMatchObject({
        version: 2,
        contacts: [ionPreferences, maria],
      });
      expect(await dossier()).toEqual(corrected);
      expect(await eventCount()).toBe(events + 1);
      const recordedChange = {
        contacts: { before: [ion], after: [ionPreferences, maria] },
      };
      const [stored] = await storedCorrections();
      expect(object(stored?.metadata).changes).toEqual(recordedChange);
      expect(await correctionChanges()).toEqual([recordedChange]);
      expect((await dossier(companyB, 'directorB')).contacts).toEqual([
        ionPreferences,
        maria,
      ]);

      const dossierTelephone = await patch(
        { telephone: '+373 22 000 372' },
        { expectedVersion: 2 },
      );
      expect(dossierTelephone.status).toBe(200);
      expect((await body(dossierTelephone)).contacts).toEqual([
        ionPreferences,
        maria,
      ]);
      const contactTelephone = await patch(
        {
          contacts: [
            { ...ionPreferences, telephone: '+373 60 000 373' },
            maria,
          ],
        },
        { expectedVersion: 3 },
      );
      expect(contactTelephone.status).toBe(200);
      expect((await body(contactTelephone)).contacts).toEqual([
        { ...ionPreferences, telephone: '+373 60 000 373' },
        maria,
      ]);

      const cleared = await patch(
        {
          contacts: [
            {
              ...ionPreferences,
              telephone: '+373 60 000 373',
              communicationPreferences: ' \n ',
            },
            maria,
          ],
        },
        { expectedVersion: 4 },
      );
      expect(cleared.status).toBe(200);
      const clearedContacts = [
        { name: 'Ion Demo', telephone: '+373 60 000 373' },
        maria,
      ];
      expect((await body(cleared)).contacts).toEqual(clearedContacts);
      expect((await dossier(companyB, 'directorB')).contacts).toEqual(
        clearedContacts,
      );
      expect(await eventCount()).toBe(events + 4);
      expect((await correctionChanges())[0]).toEqual({
        contacts: {
          before: [{ ...ionPreferences, telephone: '+373 60 000 373' }, maria],
          after: clearedContacts,
        },
      });
    });

    it('keeps no-op, replay, key-reuse and stale behaviour without writing on failure', async () => {
      const key = randomUUID();
      const first = await patch({ contacts: [ionPreferences] }, { key });
      expect(first.status).toBe(200);
      const result = await body(first);
      const events = await eventCount();

      const canonicalNoOp = await patch(
        {
          contacts: [
            {
              ...ionPreferences,
              communicationPreferences: `\t${ionPreferences.communicationPreferences}  `,
            },
          ],
        },
        { expectedVersion: 2 },
      );
      expect(canonicalNoOp.status).toBe(400);
      expect(await canonicalNoOp.json()).toMatchObject({
        message: 'The Client correction must change at least one field.',
      });

      const replay = await patch({ contacts: [ionPreferences] }, { key });
      expect(replay.status).toBe(200);
      expect(await replay.json()).toEqual(result);

      const changedIntent = await patch(
        { contacts: [{ ...ion, communicationPreferences: 'Telephone only' }] },
        { key },
      );
      expect(changedIntent.status).toBe(400);
      expect(await changedIntent.json()).toMatchObject({
        message:
          'Idempotency-Key was already used for another Client correction.',
      });

      const stale = await patch(
        { contacts: [{ ...ion, communicationPreferences: 'Telephone only' }] },
        { expectedVersion: 1 },
      );
      expect(stale.status).toBe(409);
      expect(await eventCount()).toBe(events);
      expect(await dossier()).toEqual(result);
    });

    it('accepts preferences on enriched registration and replay, keeps them in duplicate-review data and keeps the minimal bootstrap refusing Contacts', async () => {
      const key = randomUUID();
      const registration = {
        displayName: 'AGRONOVA Registration Demo SRL',
        contacts: [
          {
            ...maria,
            communicationPreferences: ` ${maria.communicationPreferences}\n`,
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
      const changedReplay = await request('/clients', {
        method: 'POST',
        value: {
          ...registration,
          contacts: [{ ...maria, communicationPreferences: 'Email only' }],
        },
        key,
      });
      expect(changedReplay.status).toBe(400);
      expect(await changedReplay.json()).toMatchObject({
        message: 'Idempotency-Key was already used for another Client command.',
      });

      const bootstrap = await request('/clients', {
        actor: 'owner',
        method: 'POST',
        value: {
          displayName: 'Bootstrap Demo SRL',
          contacts: [{ name: 'Ion Demo', communicationPreferences: 'Email' }],
        },
      });
      expect(bootstrap.status).toBe(400);
      expect(await bootstrap.json()).toMatchObject({
        message: 'Unknown Client field.',
      });

      expect((await patch({ contacts: [ionPreferences] })).status).toBe(200);
      const rejected = await request('/clients', {
        company: companyB,
        method: 'POST',
        value: {
          displayName: 'AGRONOVA Duplicate Demo SRL',
          taxId,
          contacts: [maria],
        },
      });
      expect(rejected.status).toBe(409);
      const reference = string(
        (await body(rejected)).duplicate_review_reference,
      );
      const review = await request(`/client-duplicate-reviews/${reference}`, {
        company: companyB,
      });
      expect(review.status).toBe(200);
      const detail = await body(review);
      expect(object(object(detail.proposal).fields).contacts).toEqual([maria]);
      expect(object(detail.candidate).contacts).toEqual([ionPreferences]);
    });

    it('rejects malformed preferences on registration and correction without persistence and accepts the astral boundary', async () => {
      const events = await eventCount();
      const before = await dossier();
      for (const [contact, message] of [
        [
          { name: 'Ion Demo', communicationPreferences: null },
          'Client contact communication preferences must be text.',
        ],
        [
          { name: 'Ion Demo', communicationPreferences: 42 },
          'Client contact communication preferences must be text.',
        ],
        [
          { name: 'Ion Demo', communicationPreferences: ['Email'] },
          'Client contact communication preferences must be text.',
        ],
        [
          { name: 'Ion Demo', communicationPreferences: 'x'.repeat(1_001) },
          'Client contact communication preferences are too long.',
        ],
        [
          { name: 'Ion Demo', communicationPreferences: astral.repeat(1_001) },
          'Client contact communication preferences are too long.',
        ],
        [
          { name: 'Ion Demo', preferences: 'Email' },
          'Unknown Client contact field.',
        ],
      ] as const) {
        const correction = await patch({ contacts: [contact] });
        expect(correction.status, JSON.stringify(contact)).toBe(400);
        expect(await correction.json()).toMatchObject({ message });
        const registration = await request('/clients', {
          method: 'POST',
          value: { displayName: 'Rejected Demo SRL', contacts: [contact] },
        });
        expect(registration.status, JSON.stringify(contact)).toBe(400);
        expect(await registration.json()).toMatchObject({ message });
      }
      expect(await dossier()).toEqual(before);
      expect(await eventCount()).toBe(events);

      const boundary = {
        name: 'Ion Demo',
        communicationPreferences: astral.repeat(1_000),
      };
      const accepted = await patch({ contacts: [boundary] });
      expect(accepted.status).toBe(200);
      expect((await dossier()).contacts).toEqual([boundary]);
    });

    it('keeps Contacts and correction events stored before this slice readable and fails closed on invalid stored preferences', async () => {
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
      expect((await patch({ contacts: [ionPreferences] })).status).toBe(200);
      const [event] = await storedCorrections();
      const legacyChange = {
        before: [{ name: 'Legacy Demo' }],
        after: [{ name: 'Legacy Demo', telephone: '+373 60 000 372' }],
      };
      await harness.pool.query(
        'UPDATE activity_log_events SET metadata = $1 WHERE id = $2',
        [JSON.stringify({ changes: { contacts: legacyChange } }), event?.id],
      );
      expect(await correctionChanges()).toEqual([{ contacts: legacyChange }]);

      for (const communicationPreferences of [
        null,
        7,
        '',
        ' Secret-value',
        'Secret-value'.repeat(100),
      ]) {
        await harness.pool.query(
          'UPDATE activity_log_events SET metadata = $1 WHERE id = $2',
          [
            JSON.stringify({
              changes: {
                contacts: {
                  before: [],
                  after: [{ name: 'Secret-value', communicationPreferences }],
                },
              },
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

    it('shows preferences only to authorized dossier readers and never in list, search or another Company Activity Log', async () => {
      expect((await patch({ contacts: [ionPreferences, maria] })).status).toBe(
        200,
      );
      const projectMember = await membership('projectMember');
      await grant('/company-context-assignments', projectMember, companyA);
      await grant('/company-project-assignments', projectMember, companyA);
      const foreignClient = randomUUID();
      await insertForeignClient(foreignClient);
      const events = await eventCount();
      const hidden = /Romanian|weekday|Telefon după/u;

      const refusals: {
        actor: Actor;
        company: string;
        client?: string;
        status: number;
      }[] = [
        { actor: 'directorC', company: companyC, status: 404 },
        { actor: 'projectMember', company: companyA, status: 403 },
        { actor: 'owner', company: companyA, status: 403 },
        {
          actor: 'director',
          company: companyA,
          client: foreignClient,
          status: 404,
        },
      ];
      for (const { actor, company, client = clientId, status } of refusals) {
        const read = await request(`/clients/${client}`, { actor, company });
        expect(read.status, actor).toBe(status);
        expect(await read.text()).not.toMatch(hidden);
        const history = await request(`/clients/${client}/correction-history`, {
          actor,
          company,
        });
        expect(history.status, actor).toBe(status);
        expect(await history.text()).not.toMatch(hidden);
        const correction = await request(`/clients/${client}`, {
          actor,
          company,
          method: 'PATCH',
          value: {
            expectedVersion: 2,
            contacts: [{ ...ion, communicationPreferences: 'Leaked' }],
          },
        });
        expect(correction.status, actor).toBe(status);
        expect(await correction.text()).not.toMatch(hidden);
      }
      expect(await eventCount()).toBe(events);

      for (const path of [
        '/clients',
        `/clients/search?query=${encodeURIComponent('AGRONOVA')}`,
      ]) {
        const response = await request(path);
        expect(response.status, path).toBe(200);
        const text = await response.text();
        expect(text, path).toContain(clientId);
        expect(text, path).not.toMatch(hidden);
      }
      const otherCompanyActivity = await request('/activity-log', {
        actor: 'directorB',
        company: companyB,
      });
      expect(otherCompanyActivity.status).toBe(200);
      expect(await otherCompanyActivity.text()).not.toMatch(hidden);
      expect((await dossier(companyB, 'directorB')).contacts).toEqual([
        ionPreferences,
        maria,
      ]);
    });

    async function insertForeignClient(foreignClientId: string) {
      await harness.pool.query(
        `WITH foreign_workspace AS (
          INSERT INTO workspaces (id, name)
          VALUES ($1, 'Foreign Workspace')
          RETURNING id
        ), foreign_user AS (
          INSERT INTO internal_users (
            external_provider, external_subject, display_name, email
          )
          VALUES ('deterministic-test', 'contact-preferences-foreign',
            'Foreign Owner', 'foreign@example.test')
          RETURNING id
        ), foreign_membership AS (
          INSERT INTO workspace_memberships (workspace_id, internal_user_id)
          SELECT foreign_workspace.id, foreign_user.id
          FROM foreign_workspace, foreign_user
          RETURNING id, workspace_id, internal_user_id
        )
        INSERT INTO client_accounts (
          id, workspace_id, display_name, contacts,
          created_by_internal_user_id, created_by_workspace_membership_id
        )
        SELECT $2::uuid, workspace_id, 'Foreign Client', $3::jsonb,
          internal_user_id, id
        FROM foreign_membership`,
        [
          foreignWorkspaceId,
          foreignClientId,
          JSON.stringify([
            { name: 'Foreign Demo', communicationPreferences: 'Romanian' },
          ]),
        ],
      );
    }
  },
);
