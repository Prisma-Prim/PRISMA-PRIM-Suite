import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;
const workspaceId = '00000000-0000-4000-8000-000000002180';
const owner = {
  'x-test-external-provider': 'deterministic-test',
  'x-test-external-subject': 'union-owner',
  'x-test-display-name': 'Union Resolver',
  'x-test-email': 'union@example.test',
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected an API object.');
  return Object.fromEntries(Object.entries(value));
}
function string(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected an API string.');
  return value;
}
async function body(response: Response) {
  return record(await response.json());
}

describeWithPostgres('Governed Client union REST journey', () => {
  let harness: PostgresRestTestHarness;
  let companyA: string;
  let companyB: string;
  let first: string;
  let second: string;
  let membershipId: string;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    harness = await createPostgresRestTestHarness({
      databaseUrl,
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'union-owner',
        ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Union Workspace',
      },
    });
  });
  afterAll(async () => {
    await harness?.close();
  });
  beforeEach(async () => {
    await harness.pool.query(
      'TRUNCATE activity_log_events, workspace_memberships, internal_users, workspaces CASCADE',
    );
    companyA = '';
    companyB = '';
    companyA = string(
      (
        await body(
          await request('/companies', 'POST', { displayName: 'PRISMA-PRIM' }),
        )
      ).id,
    );
    companyB = string(
      (await body(await request('/companies', 'POST', { displayName: 'BIC' })))
        .id,
    );
    membershipId = string(
      (await body(await request('/access/current-actor')))
        .workspaceMembershipId,
    );
    for (const companyId of [companyA, companyB]) {
      const grant = await request(
        '/company-director-client-assignments',
        'POST',
        { companyId, workspaceMembershipId: membershipId },
      );
      expect(grant.status).toBe(201);
    }
    first = string(
      (
        await body(
          await request(
            '/clients',
            'POST',
            {
              displayName: 'Exemplu SRL',
              taxId: 'UNION-X',
              telephone: '+373 60 000 001',
              contacts: [{ name: 'Alex' }],
            },
            companyA,
          ),
        )
      ).id,
    );
    second = string(
      (
        await body(
          await request(
            '/clients',
            'POST',
            {
              displayName: 'Exemplu S.R.L.',
              taxId: 'LEGACY-Y',
              address: 'Chisinau',
              contacts: [{ name: 'Dana', email: 'dana@example.test' }],
            },
            companyB,
          ),
        )
      ).id,
    );
    // Two independently persisted dossiers represent legacy data. The public
    // create path must continue to reject new duplicates.
    await harness.pool.query(
      'UPDATE client_accounts SET tax_id = $1 WHERE id = $2',
      [' UNION-X ', second],
    );
  });

  function request(
    path: string,
    method = 'GET',
    value?: unknown,
    companyId = companyA,
    key = randomUUID(),
  ) {
    return fetch(`${harness.origin}/api${path}`, {
      method,
      headers: {
        ...owner,
        ...(companyId ? { 'x-company-context-id': companyId } : {}),
        'content-type': 'application/json',
        'idempotency-key': key,
      },
      ...(value === undefined ? {} : { body: JSON.stringify(value) }),
    });
  }
  async function review() {
    const response = await request(`/clients/${first}/union-reviews`, 'POST');
    expect(response.status).toBe(201);
    const result = await body(response);
    expect(result.outcome).toBe('comparison');
    return string(result.reviewReference);
  }
  function confirmation(canonicalClientId = first) {
    return {
      canonicalClientId,
      fields: {
        displayName: first,
        taxId: first,
        address: second,
        telephone: first,
        generalEmail: second,
        businessActivity: first,
      },
      companyIds: [companyA, companyB],
      reviewedDifferences: true,
      reason: 'Same legal identity; preserve both sources.',
    };
  }
  async function unite() {
    const response = await request(
      `/client-union-reviews/${await review()}/confirm`,
      'POST',
      confirmation(),
    );
    expect(response.status).toBe(201);
    return string((await body(response)).projectionReference);
  }
  function reverse(reference: string, key = randomUUID()) {
    return request(
      `/client-union-operations/${reference}/reversal`,
      'POST',
      {
        companyIds: [companyA, companyB],
        reason: 'Revert the mistaken union.',
      },
      companyA,
      key,
    );
  }
  async function state() {
    const result = await harness.pool.query(`SELECT
      (SELECT jsonb_agg(to_jsonb(client) ORDER BY id) FROM client_accounts AS client) AS clients,
      (SELECT jsonb_agg(to_jsonb(relationship) ORDER BY id) FROM client_company_relationships AS relationship) AS relationships,
      (SELECT count(*) FROM client_union_operations)::integer AS operations,
      (SELECT count(*) FROM client_union_projections)::integer AS projections,
      (SELECT count(*) FROM client_identifier_reservations)::integer AS reservations`);
    return result.rows;
  }

  it('unites two dossiers across Companies, preserves sources and reverses once', async () => {
    const originals = await harness.pool.query(
      'SELECT id, client_account_id, company_id, status FROM client_company_relationships ORDER BY id',
    );
    const reference = await review();
    const key = randomUUID();
    const response = await request(
      `/client-union-reviews/${reference}/confirm`,
      'POST',
      confirmation(),
      companyA,
      key,
    );
    expect(response.status).toBe(201);
    const result = await body(response);
    const projection = string(result.projectionReference);
    expect(
      await body(
        await request(
          `/client-union-reviews/${reference}/confirm`,
          'POST',
          confirmation(),
          companyA,
          key,
        ),
      ),
    ).toEqual(result);
    expect(
      (
        await request(
          `/client-union-reviews/${reference}/confirm`,
          'POST',
          { ...confirmation(), reason: 'Changed intent' },
          companyA,
          key,
        )
      ).status,
    ).toBe(409);
    for (const companyId of [companyA, companyB]) {
      expect(
        await (await request('/clients', 'GET', undefined, companyId)).json(),
      ).toEqual([
        { id: first, displayName: 'Exemplu SRL', relatedToActiveCompany: true },
      ]);
      const dossier = await body(
        await request(`/clients/${first}`, 'GET', undefined, companyId),
      );
      expect(dossier.contacts).toEqual(
        expect.arrayContaining([
          { name: 'Alex' },
          { name: 'Dana', email: 'dana@example.test' },
        ]),
      );
      expect(dossier.contacts).toHaveLength(2);
      expect(dossier.address).toBe('Chisinau');
    }
    expect(
      (await request(`/clients/${second}`, 'GET', undefined, companyB)).status,
    ).toBe(404);
    const detail = await body(
      await request(`/client-union-operations/${projection}`),
    );
    expect(detail).toMatchObject({
      state: 'united',
      canonicalClientId: first,
      reason: confirmation().reason,
      canReverse: true,
      actor: { displayName: 'Union Resolver' },
    });
    expect(detail.originals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: second, taxId: ' UNION-X ' }),
      ]),
    );
    const history = await body(
      await request(
        `/clients/${second}/union-history`,
        'GET',
        undefined,
        companyB,
      ),
    );
    expect(history.detailReferences).toEqual(expect.any(Array));
    const reversalKey = randomUUID();
    expect((await reverse(projection, reversalKey)).status).toBe(201);
    expect((await reverse(projection, reversalKey)).status).toBe(201);
    const restored = await harness.pool.query(
      'SELECT id, client_account_id, company_id, status FROM client_company_relationships ORDER BY id',
    );
    expect(restored.rows).toEqual(originals.rows);
    expect(await body(await request(`/clients/${first}`))).toMatchObject({
      version: 3,
      address: null,
      contacts: [{ name: 'Alex' }],
    });
    expect(
      await body(
        await request(`/clients/${second}`, 'GET', undefined, companyB),
      ),
    ).toMatchObject({
      version: 3,
      taxId: ' UNION-X ',
      contacts: [{ name: 'Dana', email: 'dana@example.test' }],
    });
    expect(
      (
        await request('/clients', 'POST', {
          displayName: 'Third claimant',
          taxId: 'UNION-X',
        })
      ).status,
    ).toBe(409);
    const counts = await harness.pool.query(
      'SELECT action, count(*)::integer AS count FROM client_union_projections GROUP BY action ORDER BY action',
    );
    expect(counts.rows).toEqual([
      { action: 'client.union_confirmed', count: 2 },
      { action: 'client.union_reversed', count: 2 },
    ]);
    expect(
      await body(await request(`/client-union-operations/${projection}`)),
    ).toMatchObject({
      state: 'reversed',
      reason: confirmation().reason,
      reversal: { reason: 'Revert the mistaken union.' },
      canReverse: false,
    });
    expect(
      (
        await request(
          `/clients/${second}`,
          'PATCH',
          { expectedVersion: 3, taxId: 'UNION-X' },
          companyB,
        )
      ).status,
    ).toBe(200);
  });

  it('serializes competing confirmations and rejects stale or changed intent without partial state', async () => {
    const reference = await review();
    const responses = await Promise.all([
      request(
        `/client-union-reviews/${reference}/confirm`,
        'POST',
        confirmation(),
      ),
      request(
        `/client-union-reviews/${reference}/confirm`,
        'POST',
        confirmation(),
      ),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 404,
    ]);
    const counts = await harness.pool.query(
      'SELECT (SELECT count(*) FROM client_union_operations)::integer AS operations, (SELECT count(*) FROM client_union_projections)::integer AS projections',
    );
    expect(counts.rows).toEqual([{ operations: 1, projections: 2 }]);
  });

  it('keeps the historical identifier reserved after correction and permits only sole-owner reclaim', async () => {
    const reference = await unite();
    expect(
      (
        await request(`/clients/${first}`, 'PATCH', {
          expectedVersion: 2,
          taxId: 'UNION-Z',
        })
      ).status,
    ).toBe(200);
    const conflict = await request('/clients', 'POST', {
      displayName: 'Third claimant',
      taxId: ' UNION-X ',
    });
    expect(conflict.status).toBe(409);
    const rejected = await body(conflict);
    expect(Object.keys(rejected).sort()).toEqual([
      'code',
      'duplicate_review_reference',
      'error',
      'statusCode',
    ]);
    const comparison = await body(
      await request(
        `/client-duplicate-reviews/${string(rejected.duplicate_review_reference)}`,
      ),
    );
    expect(comparison).toMatchObject({
      outcome: 'comparison',
      candidate: { id: first, taxId: 'UNION-Z' },
    });
    expect(
      (
        await request(`/clients/${first}`, 'PATCH', {
          expectedVersion: 3,
          taxId: 'UNION-X',
        })
      ).status,
    ).toBe(200);
    expect((await reverse(reference)).status).toBe(409);
  });

  it('redacts Company events and denies restricted history after partial authority is lost', async () => {
    const reference = await unite();
    await harness.pool.query(
      "UPDATE company_role_assignments SET permission_set_version = 'v1' WHERE company_id = $1 AND bundle = 'company_director_client_access'",
      [companyB],
    );
    expect(
      (await request(`/client-union-operations/${reference}`)).status,
    ).toBe(404);
    expect((await reverse(reference)).status).toBe(404);
    const publicA = await body(await request('/activity-log'));
    const publicB = await body(
      await request('/activity-log', 'GET', undefined, companyB),
    );
    function unionEvent(value: unknown) {
      if (!Array.isArray(value)) throw new Error('Expected event list.');
      const event = value
        .map(record)
        .find((event) => event.action === 'client.union_confirmed');
      if (!event) throw new Error('Expected Company projection.');
      expect(Object.keys(event).sort()).toEqual([
        'action',
        'actor',
        'companyId',
        'projectionReference',
        'target',
      ]);
      expect(event.actor).toEqual({ kind: 'authorized_resolver' });
      return event;
    }
    const a = unionEvent(publicA.events);
    const b = unionEvent(publicB.events);
    expect(a.projectionReference).not.toBe(b.projectionReference);
    expect(a.companyId).toBe(companyA);
    expect(b.companyId).toBe(companyB);
    expect(
      await body(await request(`/clients/${first}/union-history`)),
    ).toMatchObject({ detailReferences: [] });
  });

  it('denies owner-only or legacy authority and only offers remediation for a complete group of three', async () => {
    await harness.pool.query(
      "UPDATE company_role_assignments SET permission_set_version = 'v1' WHERE company_id = $1 AND bundle = 'company_director_client_access'",
      [companyB],
    );
    expect(
      (await request(`/clients/${first}/union-reviews`, 'POST')).status,
    ).toBe(404);
    await harness.pool.query(
      "UPDATE company_role_assignments SET permission_set_version = 'v2' WHERE company_id = $1 AND bundle = 'company_director_client_access'",
      [companyB],
    );
    const third = string(
      (
        await body(
          await request('/clients', 'POST', {
            displayName: 'Legacy Third',
            taxId: 'THIRD',
          }),
        )
      ).id,
    );
    await harness.pool.query(
      'UPDATE client_accounts SET tax_id = $1 WHERE id = $2',
      ['UNION-X', third],
    );
    const before = await state();
    const response = await request(`/clients/${first}/union-reviews`, 'POST');
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      outcome: 'multiple_duplicate_candidates_require_data_remediation',
    });
    expect(await state()).toEqual(before);
  });

  it('blocks contact overflow atomically and leaves both choices available after a canonical archived collision', async () => {
    const contacts = Array.from({ length: 26 }, (_, index) => ({
      name: `Contact ${index}`,
    }));
    await harness.pool.query(
      'UPDATE client_accounts SET contacts = $1::jsonb WHERE id IN ($2, $3)',
      [JSON.stringify(contacts), first, second],
    );
    const reference = await review();
    const before = await state();
    expect(
      (
        await request(
          `/client-union-reviews/${reference}/confirm`,
          'POST',
          confirmation(),
        )
      ).status,
    ).toBe(409);
    expect(await state()).toEqual(before);
    await harness.pool.query(
      "UPDATE client_accounts SET contacts = '[]'::jsonb WHERE id IN ($1, $2)",
      [first, second],
    );
    await harness.pool.query(
      `INSERT INTO client_company_relationships (workspace_id, client_account_id, company_id, status, created_by_internal_user_id, created_by_workspace_membership_id) SELECT workspace_id, id, $2, 'archived', created_by_internal_user_id, created_by_workspace_membership_id FROM client_accounts WHERE id = $1`,
      [first, companyB],
    );
    const collisionReview = await review();
    const beforeCollision = await state();
    expect(
      (
        await request(
          `/client-union-reviews/${collisionReview}/confirm`,
          'POST',
          confirmation(),
        )
      ).status,
    ).toBe(409);
    expect(await state()).toEqual(beforeCollision);
    expect(
      (
        await request(
          `/client-union-reviews/${collisionReview}/confirm`,
          'POST',
          confirmation(second),
        )
      ).status,
    ).toBe(201);
    const archived = await harness.pool.query(
      'SELECT status FROM client_company_relationships WHERE client_account_id = $1 AND company_id = $2',
      [first, companyB],
    );
    expect(archived.rows).toEqual([{ status: 'archived' }]);
  });

  it('blocks changed dossiers, inactive Companies and empty or foreign review scope safely', async () => {
    const reference = await review();
    expect(
      (
        await request(`/clients/${first}`, 'PATCH', {
          expectedVersion: 1,
          telephone: '+373 60 000 999',
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          `/client-union-reviews/${reference}/confirm`,
          'POST',
          confirmation(),
        )
      ).status,
    ).toBe(404);
    await harness.pool.query(
      "UPDATE companies SET status = 'inactive' WHERE id = $1",
      [companyB],
    );
    expect(
      (await request(`/clients/${first}/union-reviews`, 'POST')).status,
    ).toBe(404);
    expect(
      (await request(`/client-union-reviews/${randomUUID()}`)).status,
    ).toBe(404);
    expect(
      (await request(`/clients/${randomUUID()}/union-reviews`, 'POST')).status,
    ).toBe(404);
    await harness.pool.query(
      "UPDATE client_company_relationships SET status = 'archived'",
    );
    expect(
      (await request(`/clients/${first}/union-reviews`, 'POST')).status,
    ).toBe(404);
  });

  it('blocks reversal when a captured Company is inactive or a new relationship is attached', async () => {
    const reference = await unite();
    await harness.pool.query(
      "UPDATE companies SET status = 'inactive' WHERE id = $1",
      [companyB],
    );
    const before = await state();
    expect((await reverse(reference)).status).toBe(404);
    expect(await state()).toEqual(before);
    await harness.pool.query(
      "UPDATE companies SET status = 'active' WHERE id = $1",
      [companyB],
    );
    expect((await reverse(reference)).status).toBe(409);
    const third = string(
      (await body(await request('/companies', 'POST', { displayName: 'ECG' })))
        .id,
    );
    expect(
      (
        await request(
          `/clients/${first}/active-company-relationship`,
          'PUT',
          undefined,
          third,
        )
      ).status,
    ).toBe(200);
    expect((await reverse(reference)).status).toBe(409);
  });

  it('rolls back the whole union when one Company projection cannot be recorded', async () => {
    const reference = await review();
    const before = await state();
    await harness.pool.query(
      `CREATE FUNCTION reject_union_projection_for_test() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'forced projection failure'; END; $$ LANGUAGE plpgsql; CREATE TRIGGER reject_union_projection_for_test BEFORE INSERT ON client_union_projections FOR EACH ROW EXECUTE FUNCTION reject_union_projection_for_test()`,
    );
    try {
      expect(
        (
          await request(
            `/client-union-reviews/${reference}/confirm`,
            'POST',
            confirmation(),
          )
        ).status,
      ).toBe(500);
      expect(await state()).toEqual(before);
    } finally {
      await harness.pool.query(
        'DROP TRIGGER reject_union_projection_for_test ON client_union_projections; DROP FUNCTION reject_union_projection_for_test()',
      );
    }
  });
});
