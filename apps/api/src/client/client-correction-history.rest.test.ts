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
const workspaceId = '00000000-0000-4000-8000-000000000348';
const foreignWorkspaceId = '00000000-0000-4000-8000-000000003480';
const subjects = {
  owner: { subject: 'history-owner', displayName: 'Workspace Owner' },
  director: { subject: 'history-director', displayName: 'History Director' },
  projectMember: { subject: 'history-project', displayName: 'Project Member' },
  directorC: { subject: 'history-director-c', displayName: 'ECG Director' },
} as const;
type Actor = keyof typeof subjects;

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

describe.skipIf(!databaseUrl)('Client correction history REST contract', () => {
  let database: IsolatedPostgresTestDatabase;
  let harness: PostgresRestTestHarness;
  let companyA: string;
  let companyB: string;
  let companyC: string;
  let clientId: string;
  let version: number;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'client_correction_history',
    });
    harness = await createPostgresRestTestHarness({
      databaseUrl: database.targetUrl,
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: subjects.owner.subject,
        ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Correction History',
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
    companyB = string((await command('/companies', { displayName: 'BIC' })).id);
    companyC = string((await command('/companies', { displayName: 'ECG' })).id);
    const director = await membership('director');
    await grant('/company-director-client-assignments', director, companyA);
    await grant('/company-director-client-assignments', director, companyB);
    await grant(
      '/company-director-client-assignments',
      await membership('directorC'),
      companyC,
    );
    clientId = await register('SICOM Demo SRL', '1003600012345');
    const attached = await request(
      `/clients/${clientId}/active-company-relationship`,
      { actor: 'owner', company: companyB, method: 'PUT' },
    );
    expect(attached.status).toBe(200);
    version = 1;
  });

  function request(
    path: string,
    options: {
      actor?: Actor;
      company?: string | null;
      method?: string;
      value?: unknown;
    } = {},
  ) {
    const {
      actor = 'director',
      company = companyA,
      method = 'GET',
      value,
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
        'idempotency-key': randomUUID(),
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
  async function register(displayName: string, taxId: string) {
    return string(
      (
        await command(
          '/clients',
          { displayName, taxId },
          { actor: 'director', company: companyA },
        )
      ).id,
    );
  }
  async function correct(
    changes: Record<string, unknown>,
    options: {
      client?: string;
      company?: string;
      expectedVersion?: number;
    } = {},
  ) {
    const response = await request(`/clients/${options.client ?? clientId}`, {
      company: options.company ?? companyA,
      method: 'PATCH',
      value: {
        expectedVersion: options.expectedVersion ?? version,
        ...changes,
      },
    });
    expect(response.status).toBe(200);
    const corrected = await body(response);
    if (!options.client) version = Number(corrected.version);
    return corrected;
  }
  function history(
    options: Parameters<typeof request>[1] & {
      client?: string;
      cursor?: string;
    } = {},
  ) {
    const { client = clientId, cursor, ...rest } = options;
    return request(
      `/clients/${client}/correction-history${
        cursor === undefined ? '' : `?cursor=${encodeURIComponent(cursor)}`
      }`,
      rest,
    );
  }
  async function page(options: Parameters<typeof history>[0] = {}) {
    const response = await history(options);
    expect(response.status).toBe(200);
    const result = await body(response);
    expect(Object.keys(result).toSorted()).toEqual([
      'corrections',
      'nextCursor',
    ]);
    return {
      corrections: objects(result.corrections),
      nextCursor: result.nextCursor,
    };
  }
  async function storedCorrections() {
    const result = await harness.pool.query<{
      id: string;
      occurred_at: Date;
      metadata: unknown;
    }>(
      `SELECT id, occurred_at, metadata FROM activity_log_events
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

  it('returns each correction newest first with only its changed fields, exact stored values, actor and server time', async () => {
    await correct({ taxId: '1003600054321' });
    await correct({
      address: 'Str. Demo 1, Chisinau',
      contacts: [{ name: 'Ana Demo', email: 'ana.demo@example.test' }],
    });
    const stored = await storedCorrections();
    const events = await eventCount();

    const result = await page();

    expect(result.nextCursor).toBeNull();
    expect(result.corrections).toEqual([
      {
        id: stored[0]?.id,
        occurredAt: stored[0]?.occurred_at.toISOString(),
        actor: { displayName: 'History Director' },
        changes: {
          address: { before: null, after: 'Str. Demo 1, Chisinau' },
          contacts: {
            before: [],
            after: [{ name: 'Ana Demo', email: 'ana.demo@example.test' }],
          },
        },
      },
      {
        id: stored[1]?.id,
        occurredAt: stored[1]?.occurred_at.toISOString(),
        actor: { displayName: 'History Director' },
        changes: {
          taxId: { before: '1003600012345', after: '1003600054321' },
        },
      },
    ]);
    expect(result.corrections.map((correction) => correction.changes)).toEqual(
      stored.map((event) => object(event.metadata).changes),
    );
    expect(await eventCount()).toBe(events);
  });

  it('returns the dossier read refusal for every actor, Company, Workspace and lifecycle boundary', async () => {
    await correct({ telephone: '+373 60 000 348' });
    const projectMember = await membership('projectMember');
    await grant('/company-context-assignments', projectMember, companyA);
    await grant('/company-project-assignments', projectMember, companyA);
    const foreignClient = randomUUID();
    await insertForeignClient(foreignClient);
    const cases: Array<{
      name: string;
      status: number;
      client?: string;
      options: Parameters<typeof request>[1];
      prepare?: () => Promise<unknown>;
    }> = [
      { name: 'missing Company', status: 403, options: { company: null } },
      {
        name: 'Project Access only',
        status: 403,
        options: { actor: 'projectMember' },
      },
      {
        name: 'Workspace client.manage only',
        status: 403,
        options: { actor: 'owner' },
      },
      {
        name: 'unrelated Company director',
        status: 404,
        options: { actor: 'directorC', company: companyC },
      },
      {
        name: 'unknown Client',
        status: 404,
        client: randomUUID(),
        options: {},
      },
      {
        name: 'another Workspace',
        status: 404,
        client: foreignClient,
        options: {},
      },
      {
        name: 'malformed Client id',
        status: 400,
        client: 'not-a-uuid',
        options: {},
      },
      {
        name: 'archived relationship',
        status: 404,
        options: {},
        prepare: () =>
          harness.pool.query(
            `UPDATE client_company_relationships SET status = 'archived'
             WHERE client_account_id = $1 AND company_id = $2`,
            [clientId, companyA],
          ),
      },
      {
        name: 'archived Client',
        status: 404,
        options: { company: companyB },
        prepare: () =>
          harness.pool.query(
            `UPDATE client_accounts SET status = 'archived' WHERE id = $1`,
            [clientId],
          ),
      },
    ];
    const events = await eventCount();
    for (const refusal of cases) {
      await refusal.prepare?.();
      const client = refusal.client ?? clientId;
      const dossier = await request(`/clients/${client}`, refusal.options);
      const expected = { status: dossier.status, body: await dossier.json() };
      expect(expected.status, refusal.name).toBe(refusal.status);
      for (const cursor of [undefined, 'not-a-cursor']) {
        const response = await history({ ...refusal.options, client, cursor });
        expect(
          { status: response.status, body: await response.json() },
          refusal.name,
        ).toEqual(expected);
      }
    }
    expect(await eventCount()).toBe(events);
  });

  it('shows only corrections recorded in the active Company for this Client', async () => {
    await correct({ taxId: 'A-1' });
    await correct({ telephone: 'B-1' }, { company: companyB });
    await correct({ address: 'A-2' });
    const otherClient = await register('Other Demo SRL', '1003600099999');
    await correct(
      { businessActivity: 'Other activity' },
      { client: otherClient, expectedVersion: 1 },
    );

    const inA = await page();
    const inB = await page({ company: companyB });

    expect(inA.corrections.map((correction) => correction.changes)).toEqual([
      { address: { before: null, after: 'A-2' } },
      { taxId: { before: '1003600012345', after: 'A-1' } },
    ]);
    expect(inB.corrections.map((correction) => correction.changes)).toEqual([
      { telephone: { before: null, after: 'B-1' } },
    ]);
    expect(
      (await page({ client: otherClient })).corrections.map(
        (correction) => correction.changes,
      ),
    ).toEqual([
      { businessActivity: { before: null, after: 'Other activity' } },
    ]);
    expect(
      (await history({ client: otherClient, company: companyB })).status,
    ).toBe(404);
  });

  it('pages 20 corrections with a lookahead and rejects cursors outside this Client correction page', async () => {
    for (let index = 1; index <= 21; index += 1)
      await correct({ telephone: `Telephone ${index}` });

    const first = await page();
    expect(first.corrections).toHaveLength(20);
    expect(first.corrections[0]?.changes).toEqual({
      telephone: { before: 'Telephone 20', after: 'Telephone 21' },
    });
    expect(first.nextCursor).toBe(first.corrections[19]?.id);
    const second = await page({ cursor: string(first.nextCursor) });
    expect(second).toEqual({
      corrections: [
        expect.objectContaining({
          changes: { telephone: { before: null, after: 'Telephone 1' } },
        }),
      ],
      nextCursor: null,
    });
    expect(
      new Set([...first.corrections, ...second.corrections].map(({ id }) => id))
        .size,
    ).toBe(21);

    const otherClient = await register('Other Demo SRL', '1003600099999');
    await correct(
      { telephone: 'Other' },
      { client: otherClient, expectedVersion: 1 },
    );
    await correct({ telephone: 'In BIC' }, { company: companyB });
    const foreignCursors = await harness.pool.query<{ id: string }>(
      `SELECT id FROM activity_log_events
       WHERE (action::text = 'client.corrected' AND target_client_account_id = $1)
          OR (action::text = 'client.created' AND target_client_account_id = $2)
          OR (action::text = 'client.corrected' AND target_company_id = $3)`,
      [otherClient, clientId, companyB],
    );
    expect(foreignCursors.rows).toHaveLength(3);
    const eventsBeforeRejectedReads = await eventCount();
    const rejected = await Promise.all(
      [
        'not-a-uuid',
        '',
        randomUUID(),
        ...foreignCursors.rows.map(({ id }) => id),
      ].map(async (cursor) => {
        const response = await history({ cursor });
        return { status: response.status, body: await response.json() };
      }),
    );
    expect(new Set(rejected.map((result) => JSON.stringify(result))).size).toBe(
      1,
    );
    expect(rejected[0]?.status).toBe(400);
    expect(JSON.stringify(rejected[0]?.body)).not.toMatch(/Telephone|Other/u);
    expect(await eventCount()).toBe(eventsBeforeRejectedReads);
  });

  it('fails closed with a generic error when stored correction metadata is not the typed change shape', async () => {
    await correct({ taxId: 'Confidential-348' });
    const [event] = await storedCorrections();
    for (const metadata of [
      { changes: {} },
      { changes: { unknownField: { before: null, after: 'Secret-value' } } },
      { changes: { taxId: { before: 42, after: 'Secret-value' } } },
      { changes: { displayName: { before: null, after: 'Secret-value' } } },
      { changes: { taxId: { before: null } } },
      {
        changes: {
          contacts: {
            before: [],
            after: [{ name: 'Secret-value', role: 'private' }],
          },
        },
      },
      {
        changes: { taxId: { before: null, after: 'Secret-value' } },
        raw: 'Secret-value',
      },
    ]) {
      await harness.pool.query(
        'UPDATE activity_log_events SET metadata = $1 WHERE id = $2',
        [JSON.stringify(metadata), event?.id],
      );
      const response = await history();
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        statusCode: 500,
        message: 'Internal server error',
      });
    }
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
        VALUES ('deterministic-test', 'history-foreign-owner', 'Foreign Owner',
          'foreign@example.test')
        RETURNING id
      ), foreign_membership AS (
        INSERT INTO workspace_memberships (workspace_id, internal_user_id)
        SELECT foreign_workspace.id, foreign_user.id
        FROM foreign_workspace, foreign_user
        RETURNING id, workspace_id, internal_user_id
      )
      INSERT INTO client_accounts (
        id, workspace_id, display_name, created_by_internal_user_id,
        created_by_workspace_membership_id
      )
      SELECT $2::uuid, workspace_id, 'Foreign Client', internal_user_id, id
      FROM foreign_membership`,
      [foreignWorkspaceId, foreignClientId],
    );
  }
});
