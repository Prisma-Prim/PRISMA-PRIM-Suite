import type { Pool } from 'pg';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000238';
const withPostgres = databaseUrl ? describe : describe.skip;
withPostgres('Client-scoped Project overview REST', () => {
  let harness: PostgresRestTestHarness;
  let database: IsolatedPostgresTestDatabase;
  let origin: string;
  let pool: Pool;
  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'client_projects',
    });
    harness = await createPostgresRestTestHarness({
      databaseUrl: database.targetUrl,
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'workspace-owner',
        ACCESS_BOOTSTRAP_WORKSPACE_ID: WORKSPACE_ID,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Project Workspace',
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify([
          {
            provider: 'deterministic-test',
            subject: 'member',
            workspaceId: WORKSPACE_ID,
          },
        ]),
      },
    });
    ({ origin, pool } = harness);
  });
  beforeEach(async () => {
    await pool.query(
      'TRUNCATE activity_log_events, workspace_memberships, internal_users, workspaces CASCADE',
    );
  });
  afterAll(async () => {
    await harness?.close();
    await database?.close();
  });

  it('discovers only the exact Client before bounded Project pages and preserves ordinary reads', async () => {
    const setup = await prepared();
    const companyId = responseText(setup.company, 'id');
    const clientId = responseText(setup.client, 'id');
    await command(
      '/company-director-client-assignments',
      {
        companyId,
        workspaceMembershipId: responseText(
          setup.actor,
          'workspaceMembershipId',
        ),
      },
      'dossier-access',
    );
    const sameName = await command(
      '/clients',
      { displayName: 'Synthetic Client' },
      'same-name',
      companyId,
    );
    for (let index = 0; index < 52; index += 1)
      await command(
        '/projects',
        {
          title: `Unrelated ${index}`,
          clientAccountId: responseText(sameName, 'id'),
        },
        `unrelated-${index}`,
        companyId,
      );
    const matching: string[] = [];
    for (let index = 0; index < 26; index += 1)
      matching.push(
        responseText(
          await command(
            '/projects',
            { title: `Matching ${index}`, clientAccountId: clientId },
            `matching-${index}`,
            companyId,
          ),
          'id',
        ),
      );
    // Deliberate fixture ties prove the stable secondary ordering independently
    // of request execution speed and JavaScript timestamp precision.
    await pool.query(
      "UPDATE projects SET created_at = '2030-03-01T12:00:00.123456Z' WHERE id = ANY($1::uuid[])",
      [matching],
    );
    matching.sort();
    const directoryBefore: unknown = await (
      await request('/projects', companyId)
    ).json();
    const clientBefore: unknown = await (
      await request(`/clients/${clientId}`, companyId)
    ).json();
    const eventsBefore: unknown = await (
      await request('/activity-log', companyId)
    ).json();
    const first = await request(
      `/projects?clientDossierId=${clientId}`,
      companyId,
    );
    expect(first.status).toBe(200);
    const firstValue: unknown = await first.json();
    expect(firstValue).not.toEqual(directoryBefore);
    const firstBody = responseObject(firstValue);
    expect(firstBody).toMatchObject({
      companyId,
      clientDossierId: clientId,
      offset: 0,
      pageSize: 25,
      hasMore: true,
    });
    const firstRows = responseObjects(firstBody.items);
    expect(firstRows.map((row) => row.id)).toEqual(matching.slice(0, 25));
    expect(firstRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          clientAccountId: clientId,
          clientDossierId: clientId,
          responsible: null,
        }),
      ]),
    );
    const second = await request(
      `/projects?clientDossierId=${clientId}&offset=25`,
      companyId,
    );
    expect(second.status).toBe(200);
    const secondBody = responseObject(await second.json());
    expect(secondBody).toMatchObject({
      companyId,
      clientDossierId: clientId,
      offset: 25,
      pageSize: 25,
      hasMore: false,
    });
    expect(responseObjects(secondBody.items).map((row) => row.id)).toEqual(
      matching.slice(25),
    );
    expect(await (await request('/projects', companyId)).json()).toEqual(
      directoryBefore,
    );
    expect(
      await (await request(`/clients/${clientId}`, companyId)).json(),
    ).toEqual(clientBefore);
    expect(await (await request('/activity-log', companyId)).json()).toEqual(
      eventsBefore,
    );
  });

  it('keeps Client-scoped inputs strict and independently requires current Client and Project authority', async () => {
    const setup = await prepared();
    const companyId = responseText(setup.company, 'id');
    const clientId = responseText(setup.client, 'id');
    const membershipId = responseText(setup.actor, 'workspaceMembershipId');
    const scoped = `/projects?clientDossierId=${clientId}`;
    expect((await request(scoped, companyId)).status).toBe(403);
    await command(
      '/company-director-client-assignments',
      { companyId, workspaceMembershipId: membershipId },
      'client-read',
    );
    for (const query of [
      'clientDossierId=',
      'clientDossierId=bad',
      `clientDossierId=${clientId}&clientDossierId=${clientId}`,
      `clientDossierId[]=${clientId}`,
      `clientDossierId[id]=${clientId}`,
      `clientDossierId=${clientId}&offset=`,
      `clientDossierId=${clientId}&offset=-1`,
      `clientDossierId=${clientId}&offset=0.5`,
      `clientDossierId=${clientId}&offset=9007199254740992`,
      `clientDossierId=${clientId}&offset=0&offset=25`,
      `clientDossierId=${clientId}&offset[]=0`,
      `clientDossierId=${clientId}&view=mine_open`,
      `clientDossierId=${clientId}&unknown=true`,
    ])
      expect(
        (await request('/projects?' + query, companyId)).status,
        query,
      ).toBe(400);
    const uppercase = await request(
      `/projects?clientDossierId=${clientId.toUpperCase()}&offset=000`,
      companyId,
    );
    expect(uppercase.status).toBe(200);
    expect(await uppercase.json()).toMatchObject({
      clientDossierId: clientId,
      offset: 0,
      items: [],
      hasMore: false,
    });
    expect(
      await (
        await request('/projects?unknown=legacy&offset=bad', companyId)
      ).json(),
    ).toEqual([]);
    expect(
      await (await request('/projects?view=mine_open', companyId)).json(),
    ).toEqual([]);
    expect(
      (
        await request(scoped, companyId, {
          headers: { 'x-workspace-context-id': crypto.randomUUID() },
        })
      ).status,
    ).toBe(403);
    const otherCompanyId = responseText(
      await command(
        '/companies',
        { displayName: 'Other Company' },
        'other-company',
      ),
      'id',
    );
    const foreignClientId = responseText(
      await command(
        '/clients',
        { displayName: 'Foreign same-name Client' },
        'foreign-client',
        otherCompanyId,
      ),
      'id',
    );
    expect(
      (await request(`/projects?clientDossierId=${foreignClientId}`, companyId))
        .status,
    ).toBe(404);
    expect((await request(scoped, otherCompanyId)).status).toBe(403);
    expect(
      (
        await request(
          `/projects?clientDossierId=${crypto.randomUUID()}`,
          companyId,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(
          `/company-project-assignments/${membershipId}/${companyId}`,
          undefined,
          {
            method: 'DELETE',
            headers: { 'idempotency-key': 'revoke-project' },
          },
        )
      ).status,
    ).toBe(200);
    expect((await request(scoped, companyId)).status).toBe(403);
    expect((await request(`/clients/${clientId}`, companyId)).status).toBe(200);
  });

  it('re-evaluates original Project membership across union and reversal between pages without advancing their fence', async () => {
    const setup = await prepared();
    const companyId = responseText(setup.company, 'id'),
      clientId = responseText(setup.client, 'id');
    const membershipId = responseText(setup.actor, 'workspaceMembershipId');
    const otherId = responseText(
      await command('/companies', { displayName: 'BIC' }, 'other'),
      'id',
    );
    await command(
      '/company-project-assignments',
      { companyId: otherId, workspaceMembershipId: membershipId },
      'project-b',
    );
    for (const id of [companyId, otherId])
      await command(
        '/company-director-client-assignments',
        { companyId: id, workspaceMembershipId: membershipId },
        `client-${id}`,
      );
    const secondId = responseText(
      await command(
        '/clients',
        { displayName: 'Original B Client' },
        'second',
        otherId,
      ),
      'id',
    );
    expect(
      (
        await request(
          `/clients/${clientId}/active-company-relationship`,
          otherId,
          { method: 'PUT' },
        )
      ).status,
    ).toBe(200);
    // Existing legacy duplicate fixture: ordinary registration/correction never creates a duplicate.
    await pool.query(
      'UPDATE client_accounts SET tax_id = $1 WHERE id IN ($2, $3)',
      ['SYNTHETIC-UNION', clientId, secondId],
    );
    for (let index = 0; index < 26; index += 1)
      await command(
        '/projects',
        { title: `Canonical original ${index}`, clientAccountId: clientId },
        `canonical-${index}`,
        otherId,
      );
    const historicalId = responseText(
      await command(
        '/projects',
        { title: 'Historical original', clientAccountId: secondId },
        'historical',
        otherId,
      ),
      'id',
    );
    const first = responseObject(
      await (
        await request(`/projects?clientDossierId=${clientId}`, otherId)
      ).json(),
    );
    expect(responseObjects(first.items)).toHaveLength(25);
    const review = await command(
      `/clients/${clientId}/union-reviews`,
      {},
      'review',
      otherId,
    );
    const union = await command(
      `/client-union-reviews/${responseText(review, 'reviewReference')}/confirm`,
      {
        canonicalClientId: clientId,
        fields: {
          displayName: clientId,
          taxId: clientId,
          address: clientId,
          telephone: clientId,
          generalEmail: clientId,
          businessActivity: clientId,
        },
        companyIds: [companyId, otherId],
        reviewedDifferences: true,
        reason: 'Same synthetic identity.',
      },
      'union',
      otherId,
    );
    const before: unknown = await (
      await request(`/clients/${clientId}`, otherId)
    ).json();
    const events: unknown = await (
      await request('/activity-log', otherId)
    ).json();
    const united = responseObject(
      await (
        await request(
          `/projects?clientDossierId=${clientId}&offset=25`,
          otherId,
        )
      ).json(),
    );
    expect(responseObjects(united.items)).toHaveLength(2);
    expect(responseObjects(united.items)).toContainEqual(
      expect.objectContaining({
        id: historicalId,
        clientAccountId: secondId,
        clientDossierId: clientId,
      }),
    );
    expect(
      (await request(`/projects?clientDossierId=${secondId}`, otherId)).status,
    ).toBe(404);
    expect(
      await (await request(`/clients/${clientId}`, otherId)).json(),
    ).toEqual(before);
    expect(await (await request('/activity-log', otherId)).json()).toEqual(
      events,
    );
    await command(
      `/client-union-operations/${responseText(union, 'projectionReference')}/reversal`,
      { companyIds: [companyId, otherId], reason: 'Restore originals.' },
      'reverse',
      otherId,
    );
    const restored = responseObject(
      await (
        await request(
          `/projects?clientDossierId=${clientId}&offset=25`,
          otherId,
        )
      ).json(),
    );
    expect(responseObjects(restored.items)).toHaveLength(1);
    const original = responseObject(
      await (
        await request(`/projects?clientDossierId=${secondId}`, otherId)
      ).json(),
    );
    expect(responseObjects(original.items)).toEqual([
      expect.objectContaining({
        id: historicalId,
        clientAccountId: secondId,
        clientDossierId: secondId,
      }),
    ]);
    const otherCompany = responseObject(
      await (
        await request(`/projects?clientDossierId=${clientId}`, companyId)
      ).json(),
    );
    expect(otherCompany.items).toEqual([]);
  });

  it('shows recorded responsibility and every lifecycle while leaving My-open selection unchanged', async () => {
    const setup = await prepared();
    const companyId = responseText(setup.company, 'id'),
      clientId = responseText(setup.client, 'id');
    const membershipId = responseText(setup.actor, 'workspaceMembershipId');
    await command(
      '/company-director-client-assignments',
      { companyId, workspaceMembershipId: membershipId },
      'client-read',
    );
    await command(
      '/company-project-approver-assignments',
      { companyId, workspaceMembershipId: membershipId },
      'approver',
    );
    for (const status of [
      'preparatory',
      'active',
      'on_hold',
      'completed',
      'cancelled',
    ]) {
      const id = responseText(
        await command(
          '/projects',
          { title: status, clientAccountId: clientId },
          `create-${status}`,
          companyId,
        ),
        'id',
      );
      if (status === 'preparatory') continue;
      expect(
        (
          await request(`/projects/${id}/responsible`, companyId, {
            method: 'PUT',
            headers: {
              'content-type': 'application/json',
              'idempotency-key': `responsible-${status}`,
            },
            body: JSON.stringify({
              expectedRevision: 0,
              workspaceMembershipId: membershipId,
            }),
          })
        ).status,
      ).toBe(200);
      async function transition(body: unknown) {
        expect(
          (
            await request(`/projects/${id}/lifecycle-transitions`, companyId, {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'idempotency-key': crypto.randomUUID(),
              },
              body: JSON.stringify(body),
            })
          ).status,
        ).toBe(200);
      }
      if (status === 'cancelled') {
        await transition({
          action: 'cancel',
          expectedLifecycleRevision: 0,
          reason: 'Synthetic cancelled preparation.',
        });
        continue;
      }
      await transition({
        action: 'activate',
        expectedLifecycleRevision: 0,
        declaration: {
          approvedOffer: 'present',
          contractOrPrecontract: 'missing',
          projectPlan: 'present',
          initialDocuments: 'present',
          deadlines: 'present',
          financialConditions: 'present',
          risks: 'present',
        },
        startException: {
          reason: 'Synthetic uncontracted preparation.',
          completionMembershipId: membershipId,
          completionDueDate: '2030-01-15',
        },
      });
      if (status === 'on_hold')
        await transition({
          action: 'hold',
          expectedLifecycleRevision: 1,
          reason: 'Synthetic hold.',
        });
      if (status === 'completed')
        await transition({
          action: 'complete',
          expectedLifecycleRevision: 1,
          note: 'Synthetic ordinary completion; no governed mission policy.',
        });
    }
    const page = responseObject(
      await (
        await request(`/projects?clientDossierId=${clientId}`, companyId)
      ).json(),
    );
    const items = responseObjects(page.items);
    expect(items.map((row) => row.status)).toEqual([
      'preparatory',
      'active',
      'on_hold',
      'completed',
      'cancelled',
    ]);
    expect(items[0]?.responsible).toBeNull();
    for (const row of items.slice(1)) {
      const responsible = responseObject(
        await (
          await request(
            `/projects/${responseText(row, 'id')}/responsible`,
            companyId,
          )
        ).json(),
      );
      expect(row.responsible).toEqual(responsible.responsible);
      expect(responseObject(row.responsible).workspaceMembershipId).toBe(
        membershipId,
      );
    }
    const mine: unknown = await (
      await request('/projects?view=mine_open', companyId)
    ).json();
    expect(responseObjects(mine).map((row) => row.status)).toEqual([
      'active',
      'on_hold',
    ]);
  });

  async function prepared() {
    const company = await command(
      '/companies',
      { displayName: 'PRISMA-PRIM' },
      'company',
    );
    const actor = responseObject(
      await (await request('/access/current-actor')).json(),
    );
    const companyId = responseText(company, 'id');
    await command(
      '/company-project-assignments',
      {
        companyId,
        workspaceMembershipId: responseText(actor, 'workspaceMembershipId'),
      },
      'grant',
    );
    const client = await command(
      '/clients',
      { displayName: 'Synthetic Client' },
      'client',
      companyId,
    );
    return { company, client, actor };
  }
  function request(path: string, companyId?: string, init: RequestInit = {}) {
    return fetch(`${origin}/api${path}`, {
      ...init,
      headers: {
        'x-test-external-provider': 'deterministic-test',
        'x-test-external-subject': 'workspace-owner',
        'x-test-display-name': 'Workspace Owner',
        'x-test-email': 'owner@example.test',
        ...(companyId ? { 'x-company-context-id': companyId } : {}),
        ...init.headers,
      },
    });
  }
  async function command(
    path: string,
    body: unknown,
    key: string,
    companyId?: string,
  ) {
    const response = await request(path, companyId, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': key },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(201);
    return responseObject(await response.json());
  }
});

function responseObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a public response object.');
  return Object.fromEntries(Object.entries(value));
}
function responseObjects(value: unknown) {
  if (!Array.isArray(value)) throw new Error('Expected public rows.');
  const rows: unknown[] = value;
  return rows.map(responseObject);
}
function responseText(value: unknown, key: string) {
  const field = responseObject(value)[key];
  if (typeof field !== 'string' || !field) throw new Error(`Expected ${key}.`);
  return field;
}
