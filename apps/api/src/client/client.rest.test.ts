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
    await grantOwnerDirectorClientAccess(companyA.id);
    await grantOwnerDirectorClientAccess(companyB.id);
    const request = {
      method: 'POST',
      headers: {
        ...ownerHeaders(companyA.id),
        'content-type': 'application/json',
        'idempotency-key': 'stable-client-command',
      },
      body: JSON.stringify({
        displayName: 'Stable Client',
        contacts: [
          {
            name: 'Ana Popescu',
            telephone: '+373 60 000 000',
            email: 'ana@example.test',
          },
        ],
      }),
    } as const;

    const first = await fetch(`${origin}/api/clients`, request);
    const replay = await fetch(`${origin}/api/clients`, request);
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    const originalResult = await first.json();
    await expect(replay.json()).resolves.toEqual(originalResult);

    const rename = await fetch(`${origin}/api/clients/${originalResult.id}`, {
      method: 'PATCH',
      headers: {
        ...ownerHeaders(companyA.id),
        'content-type': 'application/json',
        'idempotency-key': 'rename-stable-client',
      },
      body: JSON.stringify({
        expectedVersion: 1,
        displayName: 'Renamed Stable Client',
      }),
    });
    expect(rename.status).toBe(200);
    const replayAfterRename = await fetch(`${origin}/api/clients`, request);
    expect(replayAfterRename.status).toBe(201);
    await expect(replayAfterRename.json()).resolves.toEqual(originalResult);

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

  it('combines a Company Director Client grant with Company management permissions', async () => {
    const company = await registerCompany(
      'Additive Permission Company',
      'additive-permission-company',
    );
    const unrelatedCompany = await registerCompany(
      'Unrelated Permission Company',
      'unrelated-permission-company',
    );
    const created = await createClient(
      company.id,
      'Additive Permission Client',
      'additive-permission-client',
    );
    const unrelatedClient = await createClient(
      unrelatedCompany.id,
      'Unrelated Permission Client',
      'unrelated-permission-client',
    );
    await grantOwnerDirectorClientAccess(unrelatedCompany.id);
    const unrelatedCorrection = await fetch(
      `${origin}/api/clients/${unrelatedClient.id}`,
      {
        method: 'PATCH',
        headers: {
          ...ownerHeaders(unrelatedCompany.id),
          'content-type': 'application/json',
          'idempotency-key': 'unrelated-permission-correction',
        },
        body: JSON.stringify({
          expectedVersion: 1,
          telephone: '+373 22 999 999',
        }),
      },
    );
    expect(unrelatedCorrection.status).toBe(200);
    const member = await fetch(`${origin}/api/access/current-actor`, {
      headers: identityHeaders('workspace-member', 'Company Manager'),
    }).then((response) => response.json());
    await pool.query(
      `INSERT INTO workspace_permission_grants (
        workspace_id, workspace_membership_id, permission
      ) VALUES ($1, $2, 'company.manage')`,
      [member.workspaceId, member.workspaceMembershipId],
    );
    await grantDirectorClientAccess(member.workspaceMembershipId, company.id);
    const headers = {
      ...identityHeaders('workspace-member', 'Company Manager'),
      'x-company-context-id': company.id,
    };

    const actorResponse = await fetch(`${origin}/api/access/current-actor`, {
      headers,
    });
    expect(actorResponse.status).toBe(200);
    await expect(actorResponse.json()).resolves.toMatchObject({
      workspacePermissions: ['company.manage'],
      activeCompany: {
        id: company.id,
        clientPermissions: ['client.read', 'client.create', 'client.update'],
      },
    });
    const clients = await fetch(`${origin}/api/clients`, { headers });
    expect(clients.status).toBe(200);
    await expect(clients.json()).resolves.toEqual([created]);
    const activity = await fetch(`${origin}/api/activity-log`, { headers });
    expect(activity.status).toBe(200);
    const activityBody = await activity.text();
    expect(activityBody).toContain(created.id);
    expect(activityBody).toContain(created.displayName);
    expect(activityBody).not.toContain(unrelatedClient.id);
    expect(activityBody).not.toContain(unrelatedClient.displayName);
    expect(activityBody).not.toContain('+373 22 999 999');
  });

  it('keeps legacy client.manage on the minimal interface until the Owner has a Director grant', async () => {
    const company = await registerCompany(
      'Legacy Client Manager Company',
      'legacy-client-manager-company',
    );
    const client = await createClient(
      company.id,
      'Legacy Client Manager Client',
      'legacy-client-manager-client',
    );
    const correction = {
      method: 'PATCH',
      headers: {
        ...ownerHeaders(company.id),
        'content-type': 'application/json',
        'idempotency-key': 'legacy-owner-correction',
      },
      body: JSON.stringify({
        expectedVersion: 1,
        telephone: '+373 22 111 111',
      }),
    } as const;

    const legacyActor = await fetch(`${origin}/api/access/current-actor`, {
      headers: ownerHeaders(company.id),
    });
    expect(legacyActor.status).toBe(200);
    await expect(legacyActor.json()).resolves.toMatchObject({
      workspacePermissions: expect.arrayContaining(['client.manage']),
      activeCompany: {
        id: company.id,
        clientPermissions: [],
      },
    });
    await expect(listClients(company.id)).resolves.toEqual([client]);

    const deniedDossier = await fetch(`${origin}/api/clients/${client.id}`, {
      headers: ownerHeaders(company.id),
    });
    expect(deniedDossier.status).toBe(403);

    const enrichedRegistration = {
      method: 'POST',
      headers: {
        ...ownerHeaders(company.id),
        'content-type': 'application/json',
        'idempotency-key': 'legacy-owner-enriched-registration',
      },
      body: JSON.stringify({
        displayName: 'Enriched Owner Client',
        taxId: '1003600123456',
      }),
    } as const;
    const deniedRegistration = await fetch(
      `${origin}/api/clients`,
      enrichedRegistration,
    );
    expect(deniedRegistration.status).toBe(400);
    await expect(deniedRegistration.json()).resolves.toMatchObject({
      message: 'Unknown Client field.',
    });

    const deniedCorrection = await fetch(
      `${origin}/api/clients/${client.id}`,
      correction,
    );
    expect(deniedCorrection.status).toBe(403);

    await grantOwnerDirectorClientAccess(company.id);
    const directorActor = await fetch(`${origin}/api/access/current-actor`, {
      headers: ownerHeaders(company.id),
    });
    expect(directorActor.status).toBe(200);
    await expect(directorActor.json()).resolves.toMatchObject({
      activeCompany: {
        id: company.id,
        clientPermissions: ['client.read', 'client.create', 'client.update'],
      },
    });

    const dossier = await fetch(`${origin}/api/clients/${client.id}`, {
      headers: ownerHeaders(company.id),
    });
    expect(dossier.status).toBe(200);

    const allowedRegistration = await fetch(
      `${origin}/api/clients`,
      enrichedRegistration,
    );
    expect(allowedRegistration.status).toBe(201);
    const enrichedClient = await allowedRegistration.json();
    const enrichedDossier = await fetch(
      `${origin}/api/clients/${enrichedClient.id}`,
      { headers: ownerHeaders(company.id) },
    );
    expect(enrichedDossier.status).toBe(200);
    await expect(enrichedDossier.json()).resolves.toMatchObject({
      displayName: 'Enriched Owner Client',
      taxId: '1003600123456',
    });

    const allowedCorrection = await fetch(
      `${origin}/api/clients/${client.id}`,
      correction,
    );
    expect(allowedCorrection.status).toBe(200);
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

  it('requires only the Client display name and rejects malformed enriched fields without persistence', async () => {
    const company = await registerCompany('PRISMA-PRIM', 'validation-company');
    const invalidBodies = [
      { telephone: '+373 22 000 000' },
      { displayName: '   ', taxId: '1003600123456' },
      { displayName: 'Invalid Email', generalEmail: 'not-an-email' },
      { displayName: 'Invalid Contact', contacts: [{ telephone: '123' }] },
      { displayName: 'Unknown Field', contractPrice: '1000' },
    ];
    for (const [index, body] of invalidBodies.entries()) {
      const response = await fetch(`${origin}/api/clients`, {
        method: 'POST',
        headers: {
          ...ownerHeaders(company.id),
          'content-type': 'application/json',
          'idempotency-key': `invalid-enriched-client-${index}`,
        },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(400);
    }
    await expectPersistenceCounts({ clients: 0, relationships: 0 });
    const events = await pool.query<{ count: string }>(
      `SELECT count(*) FROM activity_log_events
       WHERE action::text IN ('client.created', 'client.corrected')`,
    );
    expect(events.rows[0]).toEqual({ count: '0' });
  });

  it('grants a narrow Company Director bundle for enriched Client create and read, then revokes it immediately', async () => {
    const company = await registerCompany('PRISMA-PRIM', 'director-company');
    const member = await fetch(`${origin}/api/access/current-actor`, {
      headers: identityHeaders('workspace-member', 'Company Director'),
    }).then((response) => response.json());
    await grantDirectorClientAccess(member.workspaceMembershipId, company.id);
    await grantDirectorClientAccess(member.workspaceMembershipId, company.id);

    const actorResponse = await fetch(`${origin}/api/access/current-actor`, {
      headers: directorHeaders(company.id),
    });
    expect(actorResponse.status).toBe(200);
    await expect(actorResponse.json()).resolves.toMatchObject({
      workspacePermissions: [],
      activeCompany: {
        id: company.id,
        clientPermissions: ['client.read', 'client.create', 'client.update'],
      },
    });

    const createResponse = await fetch(`${origin}/api/clients`, {
      method: 'POST',
      headers: {
        ...directorHeaders(company.id),
        'content-type': 'application/json',
        'idempotency-key': 'director-enriched-create',
      },
      body: JSON.stringify({
        displayName: 'Director Client SRL',
        taxId: '1003600123456',
        address: 'Str. Independenței 10, Chișinău',
        telephone: '+373 22 000 000',
        generalEmail: 'office@director-client.test',
        contacts: [
          {
            name: 'Ana Popescu',
            telephone: '+373 60 000 000',
            email: 'ana@director-client.test',
          },
        ],
        businessActivity: 'Consulting',
      }),
    });
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();

    const dossierResponse = await fetch(`${origin}/api/clients/${created.id}`, {
      headers: directorHeaders(company.id),
    });
    expect(dossierResponse.status).toBe(200);
    await expect(dossierResponse.json()).resolves.toEqual({
      ...created,
      taxId: '1003600123456',
      address: 'Str. Independenței 10, Chișinău',
      telephone: '+373 22 000 000',
      generalEmail: 'office@director-client.test',
      contacts: [
        {
          name: 'Ana Popescu',
          telephone: '+373 60 000 000',
          email: 'ana@director-client.test',
        },
      ],
      businessActivity: 'Consulting',
      version: 1,
      involvedCompanyDisplayNames: ['PRISMA-PRIM'],
    });

    const forbiddenCompanyMutation = await fetch(`${origin}/api/companies`, {
      method: 'POST',
      headers: {
        ...directorHeaders(company.id),
        'content-type': 'application/json',
        'idempotency-key': 'director-cannot-create-company',
      },
      body: JSON.stringify({ displayName: 'Forbidden Provider' }),
    });
    expect(forbiddenCompanyMutation.status).toBe(403);

    const otherCompany = await registerCompany('BIC', 'director-other-company');
    const foreignClient = await createClient(
      otherCompany.id,
      'Confidential BIC Client',
      'confidential-bic-client',
    );
    const hiddenSearch = await fetch(
      `${origin}/api/clients/search?query=Confidential`,
      { headers: directorHeaders(company.id) },
    );
    expect(hiddenSearch.status).toBe(200);
    await expect(hiddenSearch.json()).resolves.toEqual([]);
    const hiddenRead = await fetch(
      `${origin}/api/clients/${foreignClient.id}`,
      {
        headers: directorHeaders(company.id),
      },
    );
    expect(hiddenRead.status).toBe(404);
    expect(await hiddenRead.text()).not.toContain(foreignClient.id);
    const forbiddenAttach = await fetch(
      `${origin}/api/clients/${foreignClient.id}/active-company-relationship`,
      { method: 'PUT', headers: directorHeaders(company.id) },
    );
    expect(forbiddenAttach.status).toBe(403);
    expect(await forbiddenAttach.text()).not.toContain(foreignClient.id);

    const revoke = await fetch(
      `${origin}/api/company-director-client-assignments/${member.workspaceMembershipId}/${company.id}`,
      {
        method: 'DELETE',
        headers: {
          ...identityHeaders('workspace-owner', 'Workspace Owner'),
          'idempotency-key': 'revoke-director-client-access',
        },
      },
    );
    expect(revoke.status).toBe(200);
    await expect(revoke.json()).resolves.toMatchObject({
      bundle: 'Company Director Client Access',
      active: false,
    });
    const revokeReplay = await fetch(
      `${origin}/api/company-director-client-assignments/${member.workspaceMembershipId}/${company.id}`,
      {
        method: 'DELETE',
        headers: {
          ...identityHeaders('workspace-owner', 'Workspace Owner'),
          'idempotency-key': 'revoke-director-client-access',
        },
      },
    );
    expect(revokeReplay.status).toBe(200);
    await expect(revokeReplay.json()).resolves.toMatchObject({
      bundle: 'Company Director Client Access',
      active: false,
    });
    const assignmentEvents = await pool.query<{ count: string }>(
      `SELECT count(*) FROM activity_log_events
       WHERE action::text LIKE 'company_director_client_assignment.%'`,
    );
    expect(assignmentEvents.rows[0]).toEqual({ count: '2' });

    const denied = await fetch(`${origin}/api/clients/${created.id}`, {
      headers: directorHeaders(company.id),
    });
    expect(denied.status).toBe(403);
    expect(await denied.text()).not.toContain(created.id);
    expect(await listClients(company.id)).toEqual([created]);
  });

  it('shows involved provider names and records one attributable correction with optimistic concurrency', async () => {
    const companyA = await registerCompany('PRISMA-PRIM', 'correct-company-a');
    const companyB = await registerCompany('BIC', 'correct-company-b');
    const created = await createClient(
      companyA.id,
      'Shared Director Client',
      'shared-director-client',
    );
    const attach = await fetch(
      `${origin}/api/clients/${created.id}/active-company-relationship`,
      { method: 'PUT', headers: ownerHeaders(companyB.id) },
    );
    expect(attach.status).toBe(200);

    const member = await fetch(`${origin}/api/access/current-actor`, {
      headers: identityHeaders('workspace-member', 'BIC Director'),
    }).then((response) => response.json());
    await grantDirectorClientAccess(member.workspaceMembershipId, companyB.id);

    const firstRead = await fetch(`${origin}/api/clients/${created.id}`, {
      headers: directorHeaders(companyB.id),
    });
    expect(firstRead.status).toBe(200);
    const initial = await firstRead.json();
    expect(initial).toMatchObject({
      version: 1,
      involvedCompanyDisplayNames: ['BIC', 'PRISMA-PRIM'],
    });

    const oversizedVersion = await fetch(
      `${origin}/api/clients/${created.id}`,
      {
        method: 'PATCH',
        headers: {
          ...directorHeaders(companyB.id),
          'content-type': 'application/json',
          'idempotency-key': 'oversized-client-version',
        },
        body: JSON.stringify({
          expectedVersion: 2_147_483_648,
          telephone: '+373 69 999 999',
        }),
      },
    );
    expect(oversizedVersion.status).toBe(400);
    const maximumPersistedVersion = await fetch(
      `${origin}/api/clients/${created.id}`,
      {
        method: 'PATCH',
        headers: {
          ...directorHeaders(companyB.id),
          'content-type': 'application/json',
          'idempotency-key': 'maximum-persisted-client-version',
        },
        body: JSON.stringify({
          expectedVersion: 2_147_483_647,
          telephone: '+373 69 999 999',
        }),
      },
    );
    expect(maximumPersistedVersion.status).toBe(400);

    const correctionRequest = {
      method: 'PATCH',
      headers: {
        ...directorHeaders(companyB.id),
        'content-type': 'application/json',
        'idempotency-key': 'correct-client-telephone',
      },
      body: JSON.stringify({
        expectedVersion: 1,
        telephone: '+373 69 111 222',
        businessActivity: 'Consulting and certification',
      }),
    } as const;
    const correctedResponse = await fetch(
      `${origin}/api/clients/${created.id}`,
      correctionRequest,
    );
    expect(correctedResponse.status).toBe(200);
    const corrected = await correctedResponse.json();
    expect(corrected).toMatchObject({
      id: created.id,
      version: 2,
      telephone: '+373 69 111 222',
      businessActivity: 'Consulting and certification',
      involvedCompanyDisplayNames: ['BIC', 'PRISMA-PRIM'],
    });

    const replay = await fetch(
      `${origin}/api/clients/${created.id}`,
      correctionRequest,
    );
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toEqual(corrected);

    const stale = await fetch(`${origin}/api/clients/${created.id}`, {
      method: 'PATCH',
      headers: {
        ...directorHeaders(companyB.id),
        'content-type': 'application/json',
        'idempotency-key': 'stale-client-correction',
      },
      body: JSON.stringify({ expectedVersion: 1, address: 'Stale address' }),
    });
    expect(stale.status).toBe(409);
    expect(await stale.text()).not.toContain('+373 69 111 222');

    const events = await pool.query<{
      count: string;
      actor_workspace_membership_id: string;
      metadata: {
        changes: Record<string, { before: unknown; after: unknown }>;
      };
    }>(
      `SELECT count(*) OVER () AS count, actor_workspace_membership_id,
         metadata
       FROM activity_log_events
       WHERE action::text = 'client.corrected'`,
    );
    expect(events.rows).toEqual([
      {
        count: '1',
        actor_workspace_membership_id: member.workspaceMembershipId,
        metadata: {
          changes: {
            telephone: { before: null, after: '+373 69 111 222' },
            businessActivity: {
              before: null,
              after: 'Consulting and certification',
            },
          },
        },
      },
    ]);

    const activity = await fetch(`${origin}/api/activity-log`, {
      headers: directorHeaders(companyB.id),
    });
    expect(activity.status).toBe(200);
    const activityBody = await activity.json();
    expect(JSON.stringify(activityBody)).toContain('client.corrected');
    expect(
      activityBody.events
        .filter(
          (event: { action: string }) =>
            event.action === 'client_company_relationship.established',
        )
        .map(
          (event: { target: { companyId: string } }) => event.target.companyId,
        ),
    ).toEqual([companyB.id]);
  });

  it('does not replay a correction after the Client relationship is archived', async () => {
    const company = await registerCompany(
      'Replay Visibility Company',
      'replay-visibility-company',
    );
    const client = await createClient(
      company.id,
      'Replay Visibility Client',
      'replay-visibility-client',
    );
    const member = await fetch(`${origin}/api/access/current-actor`, {
      headers: identityHeaders('workspace-member', 'Replay Director'),
    }).then((response) => response.json());
    await grantDirectorClientAccess(member.workspaceMembershipId, company.id);
    const correctionRequest = {
      method: 'PATCH',
      headers: {
        ...directorHeaders(company.id),
        'content-type': 'application/json',
        'idempotency-key': 'replay-after-relationship-archive',
      },
      body: JSON.stringify({
        expectedVersion: 1,
        telephone: '+373 60 123 456',
      }),
    } as const;

    const corrected = await fetch(
      `${origin}/api/clients/${client.id}`,
      correctionRequest,
    );
    expect(corrected.status).toBe(200);
    expect(await corrected.text()).toContain('Replay Visibility Company');

    await pool.query(
      `UPDATE client_company_relationships
       SET status = 'archived'
       WHERE client_account_id = $1 AND company_id = $2`,
      [client.id, company.id],
    );

    const replay = await fetch(
      `${origin}/api/clients/${client.id}`,
      correctionRequest,
    );
    expect(replay.status).toBe(404);
    const replayBody = await replay.text();
    expect(replayBody).not.toContain(client.id);
    expect(replayBody).not.toContain('Replay Visibility Company');
  });

  it('replays a full dossier correction after PostgreSQL canonicalizes JSON object keys', async () => {
    const company = await registerCompany(
      'Structural Replay Company',
      'structural-replay-company',
    );
    const client = await createClient(
      company.id,
      'Structural Replay Client',
      'structural-replay-client',
    );
    await grantOwnerDirectorClientAccess(company.id);
    const request = {
      method: 'PATCH',
      headers: {
        ...ownerHeaders(company.id),
        'content-type': 'application/json',
        'idempotency-key': 'structural-full-correction-replay',
      },
      body: JSON.stringify({
        expectedVersion: 1,
        displayName: 'Structural Replay Client SRL',
        taxId: '1003600123456',
        address: 'Chișinău',
        telephone: '+373 22 000 000',
        generalEmail: 'office@structural-replay.test',
        contacts: [
          {
            name: 'Ana Popescu',
            telephone: '+373 60 000 000',
            email: 'ana@structural-replay.test',
          },
        ],
        businessActivity: 'Consulting',
      }),
    } as const;

    const first = await fetch(`${origin}/api/clients/${client.id}`, request);
    expect(first.status).toBe(200);
    const corrected = await first.json();
    const replay = await fetch(`${origin}/api/clients/${client.id}`, request);
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toEqual(corrected);
  });

  it('allows one concurrent correction and rolls back the losing command without a success event', async () => {
    const company = await registerCompany(
      'PRISMA-PRIM',
      'concurrent-correction',
    );
    const client = await createClient(
      company.id,
      'Concurrent Correction Client',
      'concurrent-correction-client',
    );
    await grantOwnerDirectorClientAccess(company.id);
    const correct = (key: string, telephone: string) =>
      fetch(`${origin}/api/clients/${client.id}`, {
        method: 'PATCH',
        headers: {
          ...ownerHeaders(company.id),
          'content-type': 'application/json',
          'idempotency-key': key,
        },
        body: JSON.stringify({ expectedVersion: 1, telephone }),
      });

    const responses = await Promise.all([
      correct('concurrent-correction-a', '+373 60 000 001'),
      correct('concurrent-correction-b', '+373 60 000 002'),
    ]);
    expect(responses.map((response) => response.status).toSorted()).toEqual([
      200, 409,
    ]);
    const counts = await pool.query<{
      commands: string;
      events: string;
      version: number;
    }>(
      `SELECT
      (SELECT count(*) FROM client_account_correction_commands) AS commands,
      (SELECT count(*) FROM activity_log_events
        WHERE action::text = 'client.corrected') AS events,
      (SELECT version FROM client_accounts WHERE id = $1) AS version`,
      [client.id],
    );
    expect(counts.rows[0]).toEqual({
      commands: '1',
      events: '1',
      version: 2,
    });
  });

  it('rolls back a correction and its command when attributable history cannot be recorded', async () => {
    const company = await registerCompany('PRISMA-PRIM', 'rollback-correction');
    const client = await createClient(
      company.id,
      'Rollback Correction Client',
      'rollback-correction-client',
    );
    await grantOwnerDirectorClientAccess(company.id);
    await pool.query(`
      CREATE FUNCTION reject_client_correction_activity() RETURNS trigger AS $$
      BEGIN
        IF NEW.action::text = 'client.corrected' THEN
          RAISE EXCEPTION 'reject correction history';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER reject_client_correction_activity_insert
      BEFORE INSERT ON activity_log_events
      FOR EACH ROW EXECUTE FUNCTION reject_client_correction_activity();
    `);
    try {
      const response = await fetch(`${origin}/api/clients/${client.id}`, {
        method: 'PATCH',
        headers: {
          ...ownerHeaders(company.id),
          'content-type': 'application/json',
          'idempotency-key': 'rollback-client-correction',
        },
        body: JSON.stringify({
          expectedVersion: 1,
          telephone: '+373 60 999 999',
        }),
      });
      expect(response.status).toBe(500);
      const persisted = await pool.query<{
        telephone: string | null;
        version: number;
        commands: string;
        events: string;
      }>(
        `SELECT telephone, version,
          (SELECT count(*) FROM client_account_correction_commands) AS commands,
          (SELECT count(*) FROM activity_log_events
            WHERE action::text = 'client.corrected') AS events
        FROM client_accounts WHERE id = $1`,
        [client.id],
      );
      expect(persisted.rows[0]).toEqual({
        telephone: null,
        version: 1,
        commands: '0',
        events: '0',
      });
    } finally {
      await pool.query(`
        DROP TRIGGER reject_client_correction_activity_insert
          ON activity_log_events;
        DROP FUNCTION reject_client_correction_activity();
      `);
    }
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

  async function grantOwnerDirectorClientAccess(companyId: string) {
    const owner = await fetch(`${origin}/api/access/current-actor`, {
      headers: ownerHeaders(companyId),
    }).then((response) => response.json());
    await grantDirectorClientAccess(owner.workspaceMembershipId, companyId);
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

  async function grantDirectorClientAccess(
    workspaceMembershipId: string,
    companyId: string,
  ) {
    const response = await fetch(
      `${origin}/api/company-director-client-assignments`,
      {
        method: 'POST',
        headers: {
          ...identityHeaders('workspace-owner', 'Workspace Owner'),
          'content-type': 'application/json',
          'idempotency-key': `director-${workspaceMembershipId}-${companyId}`,
        },
        body: JSON.stringify({ workspaceMembershipId, companyId }),
      },
    );
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      workspaceMembershipId,
      companyId,
      bundle: 'Company Director Client Access',
      active: true,
    });
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

  function directorHeaders(companyId: string) {
    return {
      ...identityHeaders('workspace-member', 'Company Director'),
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
