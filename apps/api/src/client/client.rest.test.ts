import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (process.env.REQUIRE_CLIENT_POSTGRES === 'true' && !databaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required for the destructive PostgreSQL Client REST suite.',
  );
}
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres('Client REST API', () => {
  let harness: PostgresRestTestHarness;
  let origin: string;
  let pool: Pool;

  beforeAll(async () => {
    if (!databaseUrl) {
      throw new Error('TEST_DATABASE_URL is required to start this suite.');
    }
    harness = await createPostgresRestTestHarness({
      databaseUrl,
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'workspace-owner',
        ACCESS_BOOTSTRAP_WORKSPACE_KEY: 'client-workspace',
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Client Workspace',
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify([
          {
            provider: 'deterministic-test',
            subject: 'workspace-member',
            workspaceKey: 'client-workspace',
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
  });

  it('registers one Client and reuses its shared identity across two active Companies', async () => {
    const companyA = await registerCompany('PRISMA-PRIM', 'company-a');
    const companyB = await registerCompany('BIC', 'company-b');
    const actor = await fetch(`${origin}/api/access/current-actor`, {
      headers: ownerHeaders(companyA.id),
    }).then((response) => response.json());

    const createResponse = await fetch(`${origin}/api/clients`, {
      method: 'POST',
      headers: {
        ...ownerHeaders(companyA.id),
        'content-type': 'application/json',
        'idempotency-key': 'register-exemplu-client',
      },
      body: JSON.stringify({ displayName: 'Exemplu Client SRL' }),
    });
    const created = await createResponse.json();

    expect(createResponse.status).toBe(201);
    expect(created).toEqual({
      id: expect.any(String),
      displayName: 'Exemplu Client SRL',
      relatedToActiveCompany: true,
    });
    await expect(listClients(companyA.id)).resolves.toEqual([created]);

    const searchBefore = await fetch(
      `${origin}/api/clients/search?query=exemplu`,
      { headers: ownerHeaders(companyB.id) },
    );
    expect(searchBefore.status).toBe(200);
    await expect(searchBefore.json()).resolves.toEqual([
      { ...created, relatedToActiveCompany: false },
    ]);

    const attachResponse = await fetch(
      `${origin}/api/clients/${created.id}/active-company-relationship`,
      { method: 'PUT', headers: ownerHeaders(companyB.id) },
    );
    expect(attachResponse.status).toBe(200);
    await expect(attachResponse.json()).resolves.toEqual(created);
    await expect(listClients(companyB.id)).resolves.toEqual([created]);
    await expect(listClients(companyA.id)).resolves.toEqual([created]);

    const persisted = await pool.query<{
      clients: string;
      relationships: string;
      client_events: string;
      relationship_events: string;
    }>(`SELECT
      (SELECT count(*) FROM client_accounts) AS clients,
      (SELECT count(*) FROM client_company_relationships) AS relationships,
      (SELECT count(*) FROM activity_log_events
        WHERE action::text = 'client.created') AS client_events,
      (SELECT count(*) FROM activity_log_events
        WHERE action::text = 'client_company_relationship.established')
        AS relationship_events`);
    expect(persisted.rows[0]).toEqual({
      clients: '1',
      relationships: '2',
      client_events: '1',
      relationship_events: '2',
    });

    const activityResponse = await fetch(`${origin}/api/activity-log`, {
      headers: ownerHeaders(companyB.id),
    });
    expect(activityResponse.status).toBe(200);
    const activity = await activityResponse.json();
    expect(activity.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'client.created',
          actor: {
            internalUserId: actor.internalUserId,
            displayName: 'Workspace Owner',
          },
          target: {
            type: 'client_account',
            clientAccountId: created.id,
            displayName: created.displayName,
          },
        }),
        expect.objectContaining({
          action: 'client_company_relationship.established',
          actor: {
            internalUserId: actor.internalUserId,
            displayName: 'Workspace Owner',
          },
          target: expect.objectContaining({
            type: 'client_company_relationship',
            clientAccountId: created.id,
            clientDisplayName: created.displayName,
            companyId: companyB.id,
            companyDisplayName: companyB.displayName,
          }),
        }),
      ]),
    );
    expect(
      activity.events.filter(
        (event: { action: string }) =>
          event.action === 'client_company_relationship.established',
      ),
    ).toEqual([
      expect.objectContaining({
        actor: {
          internalUserId: actor.internalUserId,
          displayName: 'Workspace Owner',
        },
        target: expect.objectContaining({
          clientAccountId: created.id,
          companyId: companyB.id,
          companyDisplayName: companyB.displayName,
        }),
      }),
    ]);
  });

  it('orders active-Company Clients deterministically and bounds Workspace search', async () => {
    const company = await registerCompany('PRISMA-PRIM', 'ordered-company');
    const displayNames = [
      ...Array.from(
        { length: 21 },
        (_, index) => `Bounded Client ${String(index).padStart(2, '0')}`,
      ),
      'Bounded Client 05',
    ];
    const created = await Promise.all(
      displayNames.map((displayName, index) =>
        createClient(company.id, displayName, `bounded-client-${index}`),
      ),
    );
    const ordered = created.toSorted((left, right) => {
      if (left.displayName !== right.displayName) {
        return left.displayName < right.displayName ? -1 : 1;
      }
      return left.id < right.id ? -1 : left.id === right.id ? 0 : 1;
    });

    await expect(listClients(company.id)).resolves.toEqual(ordered);

    const searchResponse = await fetch(
      `${origin}/api/clients/search?query=bOuNdEd`,
      { headers: ownerHeaders(company.id) },
    );
    expect(searchResponse.status).toBe(200);
    await expect(searchResponse.json()).resolves.toEqual(ordered.slice(0, 20));
  });

  it('replays registration safely and rejects an idempotency key with changed intent', async () => {
    const companyA = await registerCompany('PRISMA-PRIM', 'idempotency-a');
    const companyB = await registerCompany('BIC', 'idempotency-b');
    const request = {
      method: 'POST',
      headers: {
        ...ownerHeaders(companyA.id),
        'content-type': 'application/json',
        'idempotency-key': 'stable-client-command',
      },
      body: JSON.stringify({ displayName: 'Stable Client' }),
    } as const;

    const first = await fetch(`${origin}/api/clients`, request);
    const replay = await fetch(`${origin}/api/clients`, request);
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    await expect(replay.json()).resolves.toEqual(await first.json());

    const changedName = await fetch(`${origin}/api/clients`, {
      ...request,
      body: JSON.stringify({ displayName: 'Changed Client' }),
    });
    const changedCompany = await fetch(`${origin}/api/clients`, {
      ...request,
      headers: { ...request.headers, 'x-company-context-id': companyB.id },
    });

    expect(changedName.status).toBe(400);
    expect(changedCompany.status).toBe(400);
    await expect(changedName.json()).resolves.toMatchObject({
      message: 'Idempotency-Key was already used for another Client command.',
    });
    await expect(changedCompany.json()).resolves.toMatchObject({
      message: 'Idempotency-Key was already used for another Client command.',
    });
    await expectPersistenceCounts({ clients: 1, relationships: 1 });
  });

  it('denies Client access without the dedicated permission and without leaking metadata', async () => {
    const company = await registerCompany('PRISMA-PRIM', 'denial-company');
    const created = await createClient(
      company.id,
      'Owner Client',
      'owner-client',
    );
    const member = await fetch(`${origin}/api/access/current-actor`, {
      headers: identityHeaders('workspace-member', 'Workspace Member'),
    }).then((response) => response.json());
    await grantCompanyContext(member.workspaceMembershipId, company.id);
    await pool.query(
      `INSERT INTO workspace_permission_grants (
        workspace_id, workspace_membership_id, permission
      ) VALUES ($1, $2, 'company.manage')`,
      [member.workspaceId, member.workspaceMembershipId],
    );
    const deniedHeaders = {
      ...identityHeaders('workspace-member', 'Workspace Member'),
      'x-company-context-id': company.id,
    };

    const responses = await Promise.all([
      fetch(`${origin}/api/clients`, { headers: deniedHeaders }),
      fetch(`${origin}/api/clients/search?query=Owner`, {
        headers: deniedHeaders,
      }),
      fetch(`${origin}/api/clients`, {
        method: 'POST',
        headers: {
          ...deniedHeaders,
          'content-type': 'application/json',
          'idempotency-key': 'denied-create',
        },
        body: JSON.stringify({ displayName: 'Denied Client' }),
      }),
      fetch(`${origin}/api/clients/${created.id}/active-company-relationship`, {
        method: 'PUT',
        headers: deniedHeaders,
      }),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(403);
      const body = await response.text();
      expect(body).not.toContain(created.id);
      expect(body).not.toContain(created.displayName);
    }
    const activity = await fetch(`${origin}/api/activity-log`, {
      headers: deniedHeaders,
    });
    expect(activity.status).toBe(200);
    const activityBody = await activity.text();
    expect(activityBody).not.toContain(created.id);
    expect(activityBody).not.toContain(created.displayName);
    await expectPersistenceCounts({ clients: 1, relationships: 1 });
  });

  it('requires a server-validated active Company and hides foreign Clients', async () => {
    const company = await registerCompany('PRISMA-PRIM', 'scope-company');
    const withoutContext = await fetch(`${origin}/api/clients`, {
      headers: identityHeaders('workspace-owner', 'Workspace Owner'),
    });
    expect(withoutContext.status).toBe(403);
    const unknownCompany = await fetch(`${origin}/api/clients`, {
      headers: ownerHeaders('00000000-0000-4000-8000-000000001499'),
    });
    expect(unknownCompany.status).toBe(403);
    await pool.query(`UPDATE companies SET status = 'inactive' WHERE id = $1`, [
      company.id,
    ]);
    const inactiveCompany = await fetch(`${origin}/api/clients`, {
      headers: ownerHeaders(company.id),
    });
    expect(inactiveCompany.status).toBe(403);
    await pool.query(`UPDATE companies SET status = 'active' WHERE id = $1`, [
      company.id,
    ]);

    const foreignClientId = '00000000-0000-4000-8000-000000001419';
    await pool.query(`
      WITH foreign_workspace AS (
        INSERT INTO workspaces (singleton_key, name)
        VALUES ('foreign-client-workspace', 'Foreign Client Workspace')
        RETURNING id
      ), foreign_user AS (
        INSERT INTO internal_users (
          workspace_id, external_provider, external_subject, display_name, email
        )
        SELECT id, 'deterministic-test', 'foreign-client-owner',
          'Foreign Owner', 'foreign@example.test'
        FROM foreign_workspace
        RETURNING workspace_id, id
      )
      INSERT INTO client_accounts (
        id, workspace_id, display_name, created_by_internal_user_id,
        created_by_workspace_membership_id
      )
      SELECT '${foreignClientId}', foreign_user.workspace_id, 'Hidden Client',
        foreign_user.id, membership.id
      FROM foreign_user
      INNER JOIN workspace_memberships AS membership
        ON membership.workspace_id = foreign_user.workspace_id
        AND membership.internal_user_id = foreign_user.id
    `);

    const response = await fetch(
      `${origin}/api/clients/${foreignClientId}/active-company-relationship`,
      { method: 'PUT', headers: ownerHeaders(company.id) },
    );
    expect(response.status).toBe(404);
    const body = await response.text();
    expect(body).not.toContain(foreignClientId);
    expect(body).not.toContain('Hidden Client');
  });

  it('keeps archived Client fixtures and relationships non-visible and non-attachable', async () => {
    const companyA = await registerCompany('PRISMA-PRIM', 'archived-a');
    const companyB = await registerCompany('BIC', 'archived-b');
    const client = await createClient(
      companyA.id,
      'Archived Fixture Client',
      'archived-client',
    );
    await pool.query(
      `UPDATE client_company_relationships
       SET status = 'archived'
       WHERE client_account_id = $1 AND company_id = $2`,
      [client.id, companyA.id],
    );

    await expect(listClients(companyA.id)).resolves.toEqual([]);
    const archivedRelationshipSearch = await fetch(
      `${origin}/api/clients/search?query=Archived`,
      { headers: ownerHeaders(companyA.id) },
    );
    await expect(archivedRelationshipSearch.json()).resolves.toEqual([
      { ...client, relatedToActiveCompany: false },
    ]);
    const archivedRelationshipAttach = await fetch(
      `${origin}/api/clients/${client.id}/active-company-relationship`,
      { method: 'PUT', headers: ownerHeaders(companyA.id) },
    );
    expect(archivedRelationshipAttach.status).toBe(404);
    expect(await archivedRelationshipAttach.text()).not.toContain(client.id);

    await pool.query(
      `UPDATE client_accounts SET status = 'archived' WHERE id = $1`,
      [client.id],
    );
    const archivedClientSearch = await fetch(
      `${origin}/api/clients/search?query=Archived`,
      { headers: ownerHeaders(companyB.id) },
    );
    await expect(archivedClientSearch.json()).resolves.toEqual([]);
    const archivedClientAttach = await fetch(
      `${origin}/api/clients/${client.id}/active-company-relationship`,
      { method: 'PUT', headers: ownerHeaders(companyB.id) },
    );
    expect(archivedClientAttach.status).toBe(404);
    const body = await archivedClientAttach.text();
    expect(body).not.toContain(client.id);
    expect(body).not.toContain(client.displayName);
  });

  it('rejects cross-Workspace Client relationships and Activity Log targets at the database boundary', async () => {
    const company = await registerCompany('PRISMA-PRIM', 'constraint-company');
    const actor = await fetch(`${origin}/api/access/current-actor`, {
      headers: ownerHeaders(company.id),
    }).then((response) => response.json());
    const localClient = await createClient(
      company.id,
      'Constraint Client',
      'constraint-client',
    );
    const foreignClientId = '00000000-0000-4000-8000-000000001420';
    const foreign = await insertForeignClient(foreignClientId);

    await expect(
      pool.query(
        `INSERT INTO client_company_relationships (
          workspace_id, client_account_id, company_id,
          created_by_internal_user_id, created_by_workspace_membership_id
        ) VALUES ($1, $2, $3, $4, $5)`,
        [
          actor.workspaceId,
          foreignClientId,
          company.id,
          actor.internalUserId,
          actor.workspaceMembershipId,
        ],
      ),
    ).rejects.toMatchObject({ code: '23503' });

    await expect(
      pool.query(
        `INSERT INTO client_company_relationships (
          workspace_id, client_account_id, company_id,
          created_by_internal_user_id, created_by_workspace_membership_id
        ) VALUES ($1, $2, $3, $4, $5)`,
        [
          actor.workspaceId,
          localClient.id,
          foreign.company_id,
          actor.internalUserId,
          actor.workspaceMembershipId,
        ],
      ),
    ).rejects.toMatchObject({ code: '23503' });

    await expect(
      pool.query(
        `INSERT INTO client_accounts (
          workspace_id, display_name, created_by_internal_user_id,
          created_by_workspace_membership_id
        ) VALUES ($1, 'Foreign Creator Client', $2, $3)`,
        [actor.workspaceId, foreign.internal_user_id, foreign.membership_id],
      ),
    ).rejects.toMatchObject({ code: '23503' });

    await expect(
      pool.query(
        `INSERT INTO activity_log_events (
          workspace_id, actor_internal_user_id, actor_workspace_membership_id,
          action, target_type, target_client_account_id, metadata,
          idempotency_key
        ) VALUES ($1, $2, $3, 'client.created', 'client_account', $4, '{}', $5)`,
        [
          actor.workspaceId,
          actor.internalUserId,
          actor.workspaceMembershipId,
          foreignClientId,
          'cross-workspace-client-event',
        ],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('collapses concurrent attachment into one relationship and one event', async () => {
    const companyA = await registerCompany('PRISMA-PRIM', 'concurrent-a');
    const companyB = await registerCompany('BIC', 'concurrent-b');
    const client = await createClient(
      companyA.id,
      'Concurrent Client',
      'concurrent-client',
    );

    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        fetch(
          `${origin}/api/clients/${client.id}/active-company-relationship`,
          { method: 'PUT', headers: ownerHeaders(companyB.id) },
        ),
      ),
    );
    expect(responses.every((response) => response.status === 200)).toBe(true);
    await expectPersistenceCounts({ clients: 1, relationships: 2 });
    const events = await pool.query<{ count: string }>(
      `SELECT count(*) FROM activity_log_events
       WHERE action::text = 'client_company_relationship.established'`,
    );
    expect(events.rows[0]).toEqual({ count: '2' });
  });

  it('rolls back attachment when its Activity Log event cannot be recorded', async () => {
    const companyA = await registerCompany('PRISMA-PRIM', 'rollback-a');
    const companyB = await registerCompany('BIC', 'rollback-b');
    const client = await createClient(
      companyA.id,
      'Rollback Client',
      'rollback-client',
    );
    await pool.query(`
      CREATE FUNCTION reject_client_relationship_activity() RETURNS trigger AS $$
      BEGIN
        IF NEW.action::text = 'client_company_relationship.established' THEN
          RAISE EXCEPTION 'forced Client relationship Activity Log failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER reject_client_relationship_activity_insert
      BEFORE INSERT ON activity_log_events
      FOR EACH ROW EXECUTE FUNCTION reject_client_relationship_activity();
    `);

    try {
      const response = await fetch(
        `${origin}/api/clients/${client.id}/active-company-relationship`,
        { method: 'PUT', headers: ownerHeaders(companyB.id) },
      );
      expect(response.status).toBe(500);
      await expectPersistenceCounts({ clients: 1, relationships: 1 });
    } finally {
      await pool.query(`
        DROP TRIGGER reject_client_relationship_activity_insert
          ON activity_log_events;
        DROP FUNCTION reject_client_relationship_activity();
      `);
    }
  });

  it('rolls back Client registration and its command when either Activity Log event fails', async () => {
    const company = await registerCompany('PRISMA-PRIM', 'create-rollback');
    await pool.query(`
      CREATE FUNCTION reject_client_creation_activity() RETURNS trigger AS $$
      BEGIN
        IF NEW.action::text = 'client_company_relationship.established' THEN
          RAISE EXCEPTION 'forced Client creation Activity Log failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER reject_client_creation_activity_insert
      BEFORE INSERT ON activity_log_events
      FOR EACH ROW EXECUTE FUNCTION reject_client_creation_activity();
    `);

    try {
      const response = await fetch(`${origin}/api/clients`, {
        method: 'POST',
        headers: {
          ...ownerHeaders(company.id),
          'content-type': 'application/json',
          'idempotency-key': 'rollback-client-registration',
        },
        body: JSON.stringify({ displayName: 'Rolled Back Client' }),
      });
      expect(response.status).toBe(500);
      await expectPersistenceCounts({ clients: 0, relationships: 0 });
      const commands = await pool.query<{ count: string }>(
        'SELECT count(*) FROM client_account_registration_commands',
      );
      const events = await pool.query<{ count: string }>(
        `SELECT count(*) FROM activity_log_events
         WHERE action::text IN (
           'client.created', 'client_company_relationship.established'
         )`,
      );
      expect(commands.rows[0]).toEqual({ count: '0' });
      expect(events.rows[0]).toEqual({ count: '0' });
    } finally {
      await pool.query(`
        DROP TRIGGER reject_client_creation_activity_insert
          ON activity_log_events;
        DROP FUNCTION reject_client_creation_activity();
      `);
    }

    const retry = await createClient(
      company.id,
      'Rolled Back Client',
      'rollback-client-registration',
    );
    expect(retry).toMatchObject({ displayName: 'Rolled Back Client' });
    await expectPersistenceCounts({ clients: 1, relationships: 1 });
  });

  async function registerCompany(displayName: string, key: string) {
    const response = await fetch(`${origin}/api/companies`, {
      method: 'POST',
      headers: {
        ...identityHeaders('workspace-owner', 'Workspace Owner'),
        'content-type': 'application/json',
        'idempotency-key': key,
      },
      body: JSON.stringify({ displayName }),
    });
    expect(response.status).toBe(201);
    return response.json();
  }

  async function createClient(
    companyId: string,
    displayName: string,
    key: string,
  ) {
    const response = await fetch(`${origin}/api/clients`, {
      method: 'POST',
      headers: {
        ...ownerHeaders(companyId),
        'content-type': 'application/json',
        'idempotency-key': key,
      },
      body: JSON.stringify({ displayName }),
    });
    expect(response.status).toBe(201);
    return response.json();
  }

  async function listClients(companyId: string) {
    const response = await fetch(`${origin}/api/clients`, {
      headers: ownerHeaders(companyId),
    });
    expect(response.status).toBe(200);
    return response.json();
  }

  async function insertForeignClient(clientAccountId: string) {
    const foreignActor = await pool.query<{
      workspace_id: string;
      internal_user_id: string;
    }>(
      `WITH foreign_workspace AS (
        INSERT INTO workspaces (singleton_key, name)
        VALUES ($1, 'Foreign Client Workspace')
        RETURNING id
      ), foreign_user AS (
        INSERT INTO internal_users (
          workspace_id, external_provider, external_subject,
          display_name, email
        )
        SELECT id, 'deterministic-test', $2,
          'Foreign Owner', 'foreign@example.test'
        FROM foreign_workspace
        RETURNING workspace_id, id
      )
      SELECT workspace_id, id AS internal_user_id FROM foreign_user`,
      [`foreign-client-${clientAccountId}`, `foreign-owner-${clientAccountId}`],
    );
    const actor = foreignActor.rows[0]!;
    const membership = await pool.query<{ membership_id: string }>(
      `SELECT id AS membership_id
       FROM workspace_memberships
       WHERE workspace_id = $1 AND internal_user_id = $2`,
      [actor.workspace_id, actor.internal_user_id],
    );
    const membershipId = membership.rows[0]!.membership_id;
    const company = await pool.query<{ company_id: string }>(
      `WITH foreign_company AS (
        INSERT INTO companies (
          workspace_id, display_name, created_by_internal_user_id,
          created_by_workspace_membership_id, registration_idempotency_key
        )
        VALUES ($1, 'Foreign Company', $2, $3,
          'foreign-company-registration')
        RETURNING id
      ), foreign_client AS (
        INSERT INTO client_accounts (
          id, workspace_id, display_name, created_by_internal_user_id,
          created_by_workspace_membership_id
        )
        VALUES ($4, $1, 'Foreign Client', $2, $3)
        RETURNING id
      )
      SELECT foreign_company.id AS company_id
      FROM foreign_company CROSS JOIN foreign_client`,
      [
        actor.workspace_id,
        actor.internal_user_id,
        membershipId,
        clientAccountId,
      ],
    );
    return {
      company_id: company.rows[0]!.company_id,
      internal_user_id: actor.internal_user_id,
      membership_id: membershipId,
    };
  }

  async function grantCompanyContext(
    workspaceMembershipId: string,
    companyId: string,
  ) {
    const response = await fetch(`${origin}/api/company-context-assignments`, {
      method: 'POST',
      headers: {
        ...identityHeaders('workspace-owner', 'Workspace Owner'),
        'content-type': 'application/json',
        'idempotency-key': `grant-${workspaceMembershipId}-${companyId}`,
      },
      body: JSON.stringify({ workspaceMembershipId, companyId }),
    });
    expect(response.status).toBe(201);
  }

  async function expectPersistenceCounts(expected: {
    clients: number;
    relationships: number;
  }) {
    const persisted = await pool.query<{
      clients: string;
      relationships: string;
    }>(`SELECT
      (SELECT count(*) FROM client_accounts) AS clients,
      (SELECT count(*) FROM client_company_relationships) AS relationships`);
    expect(persisted.rows[0]).toEqual({
      clients: String(expected.clients),
      relationships: String(expected.relationships),
    });
  }

  function ownerHeaders(companyId: string) {
    return {
      ...identityHeaders('workspace-owner', 'Workspace Owner'),
      'x-company-context-id': companyId,
    };
  }

  function identityHeaders(subject: string, displayName: string) {
    return {
      'x-test-external-provider': 'deterministic-test',
      'x-test-external-subject': subject,
      'x-test-display-name': displayName,
      'x-test-email': `${subject}@example.test`,
    };
  }
});
