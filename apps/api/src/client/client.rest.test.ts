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
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000111';

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
        ACCESS_BOOTSTRAP_WORKSPACE_ID: WORKSPACE_ID,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Client Workspace',
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify([
          {
            provider: 'deterministic-test',
            subject: 'workspace-member',
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
        clientPermissions: [
          'client.read',
          'client.create',
          'client.update',
          'client.duplicate.resolve',
        ],
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
    const legacyActorBody = await legacyActor.json();
    expect(legacyActorBody).toMatchObject({
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
        clientPermissions: [
          'client.read',
          'client.create',
          'client.update',
          'client.duplicate.resolve',
        ],
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

    const revoke = await fetch(
      `${origin}/api/company-director-client-assignments/${legacyActorBody.workspaceMembershipId}/${company.id}`,
      {
        method: 'DELETE',
        headers: {
          ...identityHeaders('workspace-owner', 'Workspace Owner'),
          'idempotency-key': 'revoke-owner-director-client-access',
        },
      },
    );
    expect(revoke.status).toBe(200);

    const legacyActivity = await fetch(`${origin}/api/activity-log`, {
      headers: ownerHeaders(company.id),
    });
    expect(legacyActivity.status).toBe(200);
    const legacyActivityBody = await legacyActivity.text();
    expect(legacyActivityBody).toContain('client.created');
    expect(legacyActivityBody).not.toContain('client.corrected');
    expect(legacyActivityBody).not.toContain('+373 22 111 111');
    expect(legacyActivityBody).not.toContain('1003600123456');
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
        INSERT INTO workspaces (id, name)
        VALUES ('00000000-0000-4000-8000-000000001418', 'Foreign Client Workspace')
        RETURNING id
      ), foreign_user AS (
        INSERT INTO internal_users (
          external_provider, external_subject, display_name, email
        )
        VALUES ('deterministic-test', 'foreign-client-owner',
          'Foreign Owner', 'foreign@example.test')
        RETURNING id
      ), foreign_membership AS (
        INSERT INTO workspace_memberships (workspace_id, internal_user_id)
        SELECT foreign_workspace.id, foreign_user.id
        FROM foreign_workspace, foreign_user
        RETURNING workspace_id, internal_user_id, id
      )
      INSERT INTO client_accounts (
        id, workspace_id, display_name, created_by_internal_user_id,
        created_by_workspace_membership_id
      )
      SELECT '${foreignClientId}', foreign_membership.workspace_id, 'Hidden Client',
        foreign_membership.internal_user_id, foreign_membership.id
      FROM foreign_membership
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
        clientPermissions: [
          'client.read',
          'client.create',
          'client.update',
          'client.duplicate.resolve',
        ],
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
      target_company_id: string;
      metadata: {
        changes: Record<string, { before: unknown; after: unknown }>;
      };
    }>(
      `SELECT count(*) OVER () AS count, actor_workspace_membership_id,
         target_company_id, metadata
       FROM activity_log_events
       WHERE action::text = 'client.corrected'`,
    );
    expect(events.rows).toEqual([
      {
        count: '1',
        actor_workspace_membership_id: member.workspaceMembershipId,
        target_company_id: companyB.id,
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
      activityBody.events.find(
        (event: { action: string }) => event.action === 'client.corrected',
      ).target,
    ).toMatchObject({
      companyId: companyB.id,
      companyDisplayName: 'BIC',
    });
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

  it('paginates more than one durable duplicate-review page within a fixed query budget', async () => {
    const company = await registerCompany(
      'Pagination Company',
      'duplicate-review-pagination',
    );
    const otherCompany = await registerCompany(
      'Other Pagination Company',
      'duplicate-review-pagination-other',
    );
    await grantOwnerDirectorClientAccess(company.id);
    await registerEnrichedClient(
      company.id,
      'Existing Pagination Client',
      'PAGINATION-ID-169',
      'duplicate-review-pagination-existing',
    );

    const references: string[] = [];
    for (let index = 0; index < 21; index += 1) {
      const response = await fetch(`${origin}/api/clients`, {
        method: 'POST',
        headers: {
          ...ownerHeaders(company.id),
          'content-type': 'application/json',
          'idempotency-key': `duplicate-review-pagination-${index}`,
        },
        body: JSON.stringify({
          displayName: `Rejected Pagination Client ${index}`,
          taxId: 'PAGINATION-ID-169',
        }),
      });
      const conflict = await expectOpaqueDuplicateConflict(response);
      references.push(conflict.duplicate_review_reference);
    }
    await pool.query(
      `UPDATE client_duplicate_reviews
       SET created_at = '2026-08-29T12:00:00.123456Z'
       WHERE reference = ANY($1::uuid[])`,
      [references],
    );
    const orderedReferences = references.toSorted();

    const historicalScope = await pool.query<{
      workspace_id: string;
      workspace_membership_id: string;
    }>(
      `SELECT workspace_id::text,
          created_by_workspace_membership_id::text AS workspace_membership_id
       FROM companies WHERE id = $1`,
      [company.id],
    );
    const scope = historicalScope.rows[0];
    if (!scope) throw new Error('Expected one pagination test scope.');
    await pool.query(
      `WITH generated AS (
         SELECT series,
           md5('pagination-history-command-' || series)::uuid AS command_id,
           md5('pagination-history-review-' || series)::uuid AS review_reference
         FROM generate_series(1, 5000) AS series
       ), inserted_commands AS (
         INSERT INTO client_account_registration_commands (
           id, workspace_id, actor_workspace_membership_id, idempotency_key,
           display_name, tax_id, company_id
         )
         SELECT command_id, $1, $2, 'pagination-history-' || series,
           'Historical Pagination Review ' || series,
           'HISTORICAL-PAGINATION-' || series, $3
         FROM generated
         RETURNING id
       )
       INSERT INTO client_duplicate_reviews (
         reference, workspace_id, proposal_kind,
         proposal_actor_workspace_membership_id, attempted_company_id,
         registration_command_id, normalized_identifier, proposed_fields,
         created_at
       )
       SELECT generated.review_reference, $1, 'registration', $2, $3,
         generated.command_id, 'HISTORICAL-PAGINATION-' || generated.series,
         jsonb_build_object(
           'displayName', 'Historical Pagination Review ' || generated.series,
           'taxId', 'HISTORICAL-PAGINATION-' || generated.series,
           'address', NULL, 'telephone', NULL, 'generalEmail', NULL,
           'contacts', '[]'::jsonb, 'businessActivity', NULL
         ),
         '2026-08-29T11:00:00.000Z'
       FROM generated
       INNER JOIN inserted_commands
         ON inserted_commands.id = generated.command_id`,
      [scope.workspace_id, scope.workspace_membership_id, company.id],
    );
    await pool.query('ANALYZE client_duplicate_reviews');
    const historicalAnchorResult = await pool.query<{
      created_at: Date;
      pagination_cursor: string;
      reference: string;
    }>(
      `SELECT created_at, pagination_cursor::text, reference::text
       FROM client_duplicate_reviews
       WHERE workspace_id = $1 AND attempted_company_id = $2
         AND created_at = '2026-08-29T11:00:00.000Z'
       ORDER BY created_at DESC, reference DESC
       LIMIT 1`,
      [scope.workspace_id, company.id],
    );
    const historicalAnchor = historicalAnchorResult.rows[0];
    if (!historicalAnchor) {
      throw new Error('Expected one deep-history pagination anchor.');
    }
    const keysetPlan = await pool.query<{ 'QUERY PLAN': unknown }>(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
       SELECT reference
       FROM client_duplicate_reviews
       WHERE workspace_id = $1 AND attempted_company_id = $2
         AND (created_at, reference) > ($3::timestamptz, $4::uuid)
       ORDER BY created_at ASC, reference ASC
       LIMIT 21`,
      [
        scope.workspace_id,
        company.id,
        historicalAnchor.created_at,
        historicalAnchor.reference,
      ],
    );
    const keysetPlanDocument = keysetPlan.rows[0]?.['QUERY PLAN'];
    const keysetPlanText = JSON.stringify(keysetPlanDocument);
    if (keysetPlanText === undefined) {
      throw new Error('Expected one analyzed keyset query plan.');
    }
    expect(keysetPlanText).toContain('client_duplicate_reviews_list_lookup');
    expect(keysetPlanText).toContain('ROW(created_at, reference)');
    expect(maximumNumericPlanProperty(keysetPlanDocument, 'Actual Rows')).toBe(
      21,
    );
    expect(
      maximumNumericPlanProperty(keysetPlanDocument, 'Rows Removed by Filter'),
    ).toBe(0);

    const firstMeasurement = await harness.measureApplicationQueries(() =>
      fetch(
        `${origin}/api/client-duplicate-reviews?page_size=20&cursor=${historicalAnchor.pagination_cursor}`,
        { headers: ownerHeaders(company.id) },
      ),
    );
    expect(firstMeasurement.value.status).toBe(200);
    const firstPage: unknown = await firstMeasurement.value.json();
    expect(firstPage).toEqual({
      items: orderedReferences.slice(0, 20).map((reference) => ({
        duplicate_review_reference: reference,
      })),
      next_cursor: expect.any(String),
    });
    expect(firstMeasurement.queryCount).toBeLessThanOrEqual(24);
    const pageSelectionQuery = firstMeasurement.queries.find(
      (query) =>
        query.includes('from "client_duplicate_reviews"') &&
        query.includes('order by "client_duplicate_reviews"."created_at" asc'),
    );
    expect(pageSelectionQuery).toMatch(
      /\(\s*"client_duplicate_reviews"\."created_at",\s*"client_duplicate_reviews"\."reference"\s*\)\s*>\s*\(\s*\$\d+::timestamptz,\s*\$\d+::uuid\s*\)/u,
    );
    if (!isRecord(firstPage) || typeof firstPage.next_cursor !== 'string') {
      throw new Error('Expected one opaque duplicate-review page cursor.');
    }
    expect(references).not.toContain(firstPage.next_cursor);

    const secondMeasurement = await harness.measureApplicationQueries(() =>
      fetch(
        `${origin}/api/client-duplicate-reviews?page_size=20&cursor=${firstPage.next_cursor}`,
        { headers: ownerHeaders(company.id) },
      ),
    );
    expect(secondMeasurement.value.status).toBe(200);
    await expect(secondMeasurement.value.json()).resolves.toEqual({
      items: [
        {
          duplicate_review_reference: orderedReferences[20],
        },
      ],
      next_cursor: null,
    });
    expect(secondMeasurement.queryCount).toBeLessThanOrEqual(25);

    await pool.query(
      `UPDATE client_duplicate_review_candidates
       SET captured_version = 999
       WHERE review_reference = ANY($1::uuid[])`,
      [orderedReferences.slice(0, 20)],
    );
    const emptyWindowResponse = await fetch(
      `${origin}/api/client-duplicate-reviews?page_size=20&cursor=${historicalAnchor.pagination_cursor}`,
      { headers: ownerHeaders(company.id) },
    );
    expect(emptyWindowResponse.status).toBe(200);
    const emptyWindow: unknown = await emptyWindowResponse.json();
    expect(emptyWindow).toEqual({
      items: [],
      next_cursor: expect.any(String),
    });
    if (!isRecord(emptyWindow) || typeof emptyWindow.next_cursor !== 'string') {
      throw new Error('Expected continuation after an empty visible page.');
    }
    const afterEmptyWindow = await fetch(
      `${origin}/api/client-duplicate-reviews?page_size=20&cursor=${emptyWindow.next_cursor}`,
      { headers: ownerHeaders(company.id) },
    );
    expect(afterEmptyWindow.status).toBe(200);
    await expect(afterEmptyWindow.json()).resolves.toEqual({
      items: [
        {
          duplicate_review_reference: orderedReferences[20],
        },
      ],
      next_cursor: null,
    });

    const wrongContext = await fetch(
      `${origin}/api/client-duplicate-reviews?cursor=${firstPage.next_cursor}`,
      { headers: ownerHeaders(otherCompany.id) },
    );
    expect(wrongContext.status).toBe(400);
    const unknownCursor = await fetch(
      `${origin}/api/client-duplicate-reviews?cursor=99999999-9999-4999-8999-999999999999`,
      { headers: ownerHeaders(company.id) },
    );
    expect(unknownCursor.status).toBe(400);
  });

  it('returns one opaque exact-ID review reference and reveals it only with complete live v2 authority', async () => {
    const companyA = await registerCompany('PRISMA-PRIM', 'duplicate-review-a');
    const companyB = await registerCompany('BIC', 'duplicate-review-b');
    await grantOwnerDirectorClientAccess(companyA.id);
    await grantOwnerDirectorClientAccess(companyB.id);
    const existingResponse = await fetch(`${origin}/api/clients`, {
      method: 'POST',
      headers: {
        ...ownerHeaders(companyA.id),
        'content-type': 'application/json',
        'idempotency-key': 'duplicate-review-existing',
      },
      body: JSON.stringify({
        displayName: 'Existing Exact Client',
        taxId: '  IDNO-EXACT-158  ',
        telephone: '+373 22 100 100',
      }),
    });
    expect(existingResponse.status).toBe(201);
    const existing = await existingResponse.json();

    const rejectedRequest = {
      method: 'POST',
      headers: {
        ...ownerHeaders(companyB.id),
        'content-type': 'application/json',
        'idempotency-key': 'duplicate-review-rejected',
      },
      body: JSON.stringify({
        displayName: 'Proposed Exact Client',
        taxId: 'IDNO-EXACT-158',
        address: 'Proposed address',
      }),
    } as const;
    const rejected = await fetch(`${origin}/api/clients`, rejectedRequest);
    expect(rejected.status).toBe(409);
    const conflict = await rejected.json();
    expect(conflict).toEqual({
      statusCode: 409,
      error: 'Conflict',
      code: 'possible_duplicate_review_required',
      duplicate_review_reference: expect.any(String),
    });
    expect(JSON.stringify(conflict)).not.toContain(existing.id);
    expect(JSON.stringify(conflict)).not.toContain(companyA.id);

    const replay = await fetch(`${origin}/api/clients`, rejectedRequest);
    expect(replay.status).toBe(409);
    await expect(replay.json()).resolves.toEqual(conflict);
    await expectPersistenceCounts({ clients: 1, relationships: 1 });
    const rejectedSuccessEvents = await pool.query<{ count: string }>(
      `SELECT count(*) FROM activity_log_events
       WHERE action::text IN ('client.created', 'client.corrected',
         'client_company_relationship.established')`,
    );
    expect(rejectedSuccessEvents.rows[0]).toEqual({ count: '2' });

    const owner = await fetch(`${origin}/api/access/current-actor`, {
      headers: ownerHeaders(companyB.id),
    }).then((response) => response.json());
    await revokeDirectorClientAccess(
      owner.workspaceMembershipId,
      companyA.id,
      'duplicate-review-revoke-a',
    );
    await expect(listDuplicateReviews(companyB.id)).resolves.toEqual({
      items: [],
      next_cursor: null,
    });

    await revokeDirectorClientAccess(
      owner.workspaceMembershipId,
      companyB.id,
      'duplicate-review-revoke-b',
    );
    await grantDirectorClientAccess(
      owner.workspaceMembershipId,
      companyA.id,
      'duplicate-review-regrant-a',
    );
    await expect(listDuplicateReviews(companyB.id)).resolves.toEqual({
      items: [],
      next_cursor: null,
    });

    await grantDirectorClientAccess(
      owner.workspaceMembershipId,
      companyB.id,
      'duplicate-review-regrant-b',
    );
    await expect(listDuplicateReviews(companyB.id)).resolves.toEqual({
      items: [
        {
          duplicate_review_reference: conflict.duplicate_review_reference,
        },
      ],
      next_cursor: null,
    });
    const detail = await fetch(
      `${origin}/api/client-duplicate-reviews/${conflict.duplicate_review_reference}`,
      { headers: ownerHeaders(companyB.id) },
    );
    expect(detail.status).toBe(200);
    await expect(detail.json()).resolves.toEqual({
      outcome: 'comparison',
      duplicate_review_reference: conflict.duplicate_review_reference,
      proposal: {
        kind: 'registration',
        fields: {
          displayName: 'Proposed Exact Client',
          taxId: 'IDNO-EXACT-158',
          address: 'Proposed address',
          telephone: null,
          generalEmail: null,
          contacts: [],
          businessActivity: null,
        },
      },
      candidate: {
        id: existing.id,
        displayName: 'Existing Exact Client',
        taxId: 'IDNO-EXACT-158',
        address: null,
        telephone: '+373 22 100 100',
        generalEmail: null,
        contacts: [],
        businessActivity: null,
        version: 1,
        relatedToActiveCompany: false,
        involvedCompanyDisplayNames: ['PRISMA-PRIM'],
      },
    });

    const staleCandidate = await fetch(`${origin}/api/clients/${existing.id}`, {
      method: 'PATCH',
      headers: {
        ...ownerHeaders(companyA.id),
        'content-type': 'application/json',
        'idempotency-key': 'duplicate-review-stale-candidate',
      },
      body: JSON.stringify({ expectedVersion: 1, address: 'Changed address' }),
    });
    expect(staleCandidate.status).toBe(200);
    const staleDetail = await fetch(
      `${origin}/api/client-duplicate-reviews/${conflict.duplicate_review_reference}`,
      { headers: ownerHeaders(companyB.id) },
    );
    expect(staleDetail.status).toBe(404);
    await expect(listDuplicateReviews(companyB.id)).resolves.toEqual({
      items: [],
      next_cursor: null,
    });
  });

  it('blocks an exact-ID correction without changing the dossier or success history', async () => {
    const companyA = await registerCompany(
      'Correction Source',
      'duplicate-correction-a',
    );
    const companyB = await registerCompany(
      'Correction Target',
      'duplicate-correction-b',
    );
    await grantOwnerDirectorClientAccess(companyA.id);
    await grantOwnerDirectorClientAccess(companyB.id);
    const source = await registerEnrichedClient(
      companyA.id,
      'Correction Source Client',
      'CORRECTION-ID-158',
      'duplicate-correction-source',
    );
    const target = await registerEnrichedClient(
      companyB.id,
      'Correction Target Client',
      'ORIGINAL-ID-158',
      'duplicate-correction-target',
    );

    const correctionRequest = {
      method: 'PATCH',
      headers: {
        ...ownerHeaders(companyB.id),
        'content-type': 'application/json',
        'idempotency-key': 'duplicate-correction-rejected',
      },
      body: JSON.stringify({
        expectedVersion: 1,
        taxId: '  CORRECTION-ID-158 ',
      }),
    } as const;
    const rejected = await fetch(
      `${origin}/api/clients/${target.id}`,
      correctionRequest,
    );
    expect(rejected.status).toBe(409);
    const conflict = await rejected.json();
    expect(conflict).toMatchObject({
      code: 'possible_duplicate_review_required',
      duplicate_review_reference: expect.any(String),
    });
    const replay = await fetch(
      `${origin}/api/clients/${target.id}`,
      correctionRequest,
    );
    expect(replay.status).toBe(409);
    await expect(replay.json()).resolves.toEqual(conflict);

    const persisted = await pool.query<{
      tax_id: string;
      version: number;
      correction_events: string;
    }>(
      `SELECT tax_id, version,
          (SELECT count(*) FROM activity_log_events
           WHERE action::text = 'client.corrected') AS correction_events
        FROM client_accounts WHERE id = $1`,
      [target.id],
    );
    expect(persisted.rows[0]).toEqual({
      tax_id: 'ORIGINAL-ID-158',
      version: 1,
      correction_events: '0',
    });

    const detail = await fetch(
      `${origin}/api/client-duplicate-reviews/${conflict.duplicate_review_reference}`,
      { headers: ownerHeaders(companyB.id) },
    );
    expect(detail.status).toBe(200);
    await expect(detail.json()).resolves.toMatchObject({
      outcome: 'comparison',
      proposal: {
        kind: 'correction',
        fields: {
          displayName: 'Correction Target Client',
          taxId: 'CORRECTION-ID-158',
        },
      },
      candidate: { id: source.id, taxId: 'CORRECTION-ID-158' },
    });

    await pool.query(
      `UPDATE client_accounts SET version = version + 1 WHERE id = $1`,
      [target.id],
    );
    const staleProposal = await fetch(
      `${origin}/api/client-duplicate-reviews/${conflict.duplicate_review_reference}`,
      { headers: ownerHeaders(companyB.id) },
    );
    expect(staleProposal.status).toBe(404);
    await expect(listDuplicateReviews(companyB.id)).resolves.toEqual({
      items: [],
      next_cursor: null,
    });
  });

  it('revalidates relationship, lifecycle, actor, Company and assignment state for every review read', async () => {
    const companyA = await registerCompany(
      'Stale Candidate Company',
      'duplicate-stale-company-a',
    );
    const companyB = await registerCompany(
      'Stale Attempt Company',
      'duplicate-stale-company-b',
    );
    const companyC = await registerCompany(
      'Stale Additional Company',
      'duplicate-stale-company-c',
    );
    await grantOwnerDirectorClientAccess(companyA.id);
    await grantOwnerDirectorClientAccess(companyB.id);
    await grantOwnerDirectorClientAccess(companyC.id);
    const owner = await fetch(`${origin}/api/access/current-actor`, {
      headers: ownerHeaders(companyB.id),
    }).then((response) => response.json());

    const createReview = async (
      suffix: string,
      proposalHeaders = ownerHeaders(companyB.id),
    ) => {
      const taxId = `STALE-${suffix.toUpperCase()}-158`;
      const candidate = await registerEnrichedClient(
        companyA.id,
        `Stale Candidate ${suffix}`,
        taxId,
        `duplicate-stale-candidate-${suffix}`,
      );
      const rejected = await fetch(`${origin}/api/clients`, {
        method: 'POST',
        headers: {
          ...proposalHeaders,
          'content-type': 'application/json',
          'idempotency-key': `duplicate-stale-proposal-${suffix}`,
        },
        body: JSON.stringify({
          displayName: `Stale Proposal ${suffix}`,
          taxId,
        }),
      });
      const conflict = await expectOpaqueDuplicateConflict(rejected);
      const detail = await fetch(
        `${origin}/api/client-duplicate-reviews/${conflict.duplicate_review_reference}`,
        { headers: ownerHeaders(companyB.id) },
      );
      expect(detail.status).toBe(200);
      return {
        candidate,
        reference: conflict.duplicate_review_reference,
      };
    };
    const expectUnavailable = async (reference: string) => {
      const detail = await fetch(
        `${origin}/api/client-duplicate-reviews/${reference}`,
        { headers: ownerHeaders(companyB.id) },
      );
      expect(detail.status).toBe(404);
      const page = await listDuplicateReviews(companyB.id);
      expect(page.items).not.toContainEqual({
        duplicate_review_reference: reference,
      });
    };

    const switchedCompany = await createReview('company-switch');
    const switchedDetail = await fetch(
      `${origin}/api/client-duplicate-reviews/${switchedCompany.reference}`,
      { headers: ownerHeaders(companyC.id) },
    );
    expect(switchedDetail.status).toBe(404);

    const relationshipLifecycle = await createReview('relationship-lifecycle');
    await pool.query(
      `UPDATE client_company_relationships SET status = 'archived'
       WHERE client_account_id = $1 AND company_id = $2`,
      [relationshipLifecycle.candidate.id, companyA.id],
    );
    await expectUnavailable(relationshipLifecycle.reference);

    const relationshipSet = await createReview('relationship-set');
    const attach = await fetch(
      `${origin}/api/clients/${relationshipSet.candidate.id}/active-company-relationship`,
      { method: 'PUT', headers: ownerHeaders(companyC.id) },
    );
    expect(attach.status).toBe(200);
    await expectUnavailable(relationshipSet.reference);

    const candidateLifecycle = await createReview('candidate-lifecycle');
    await pool.query(
      `UPDATE client_accounts SET status = 'archived' WHERE id = $1`,
      [candidateLifecycle.candidate.id],
    );
    await expectUnavailable(candidateLifecycle.reference);

    const proposalActor = await fetch(`${origin}/api/access/current-actor`, {
      headers: identityHeaders('workspace-member', 'Company Director'),
    }).then((response) => response.json());
    await grantDirectorClientAccess(
      proposalActor.workspaceMembershipId,
      companyB.id,
      'duplicate-stale-proposal-actor-grant',
    );
    const actorLifecycle = await createReview('actor-lifecycle', {
      ...identityHeaders('workspace-member', 'Company Director'),
      'x-company-context-id': companyB.id,
    });
    await pool.query(
      `UPDATE workspace_memberships SET status = 'inactive' WHERE id = $1`,
      [proposalActor.workspaceMembershipId],
    );
    await expectUnavailable(actorLifecycle.reference);

    const assignmentVersion = await createReview('assignment-version');
    await pool.query(
      `UPDATE company_role_assignments SET permission_set_version = 'v1'
       WHERE workspace_membership_id = $1 AND company_id = $2
         AND bundle::text = 'company_director_client_access'
         AND revoked_at IS NULL`,
      [owner.workspaceMembershipId, companyA.id],
    );
    await expectUnavailable(assignmentVersion.reference);
    await pool.query(
      `UPDATE company_role_assignments SET permission_set_version = 'v2'
       WHERE workspace_membership_id = $1 AND company_id = $2
         AND bundle::text = 'company_director_client_access'
         AND revoked_at IS NULL`,
      [owner.workspaceMembershipId, companyA.id],
    );

    const attemptedCompanyLifecycle = await createReview(
      'attempted-company-lifecycle',
    );
    await pool.query(`UPDATE companies SET status = 'inactive' WHERE id = $1`, [
      companyB.id,
    ]);
    const inactiveCompanyDetail = await fetch(
      `${origin}/api/client-duplicate-reviews/${attemptedCompanyLifecycle.reference}`,
      { headers: ownerHeaders(companyB.id) },
    );
    expect(inactiveCompanyDetail.status).toBe(403);
    const inactiveCompanyList = await fetch(
      `${origin}/api/client-duplicate-reviews`,
      { headers: ownerHeaders(companyB.id) },
    );
    expect(inactiveCompanyList.status).toBe(403);
  });

  it('serializes concurrent exact-ID registrations so only one Client commits', async () => {
    const company = await registerCompany(
      'Race Company',
      'duplicate-race-company',
    );
    await grantOwnerDirectorClientAccess(company.id);
    const register = (name: string, key: string) =>
      fetch(`${origin}/api/clients`, {
        method: 'POST',
        headers: {
          ...ownerHeaders(company.id),
          'content-type': 'application/json',
          'idempotency-key': key,
        },
        body: JSON.stringify({ displayName: name, taxId: 'RACE-ID-158' }),
      });

    const responses = await Promise.all([
      register('Race Client One', 'duplicate-race-one'),
      register('Race Client Two', 'duplicate-race-two'),
    ]);
    expect(responses.map((response) => response.status).toSorted()).toEqual([
      201, 409,
    ]);
    await expectOpaqueDuplicateConflict(
      responses.find((response) => response.status === 409),
    );
    await expectPersistenceCounts({ clients: 1, relationships: 1 });
    const successEvents = await pool.query<{ count: string }>(
      `SELECT count(*) FROM activity_log_events
       WHERE action::text IN ('client.created',
         'client_company_relationship.established')`,
    );
    expect(successEvents.rows[0]).toEqual({ count: '2' });
  });

  it('serializes registration-correction and correction-correction exact-ID races', async () => {
    const company = await registerCompany(
      'Mixed Race Company',
      'duplicate-mixed-race-company',
    );
    await grantOwnerDirectorClientAccess(company.id);
    const firstTarget = await registerEnrichedClient(
      company.id,
      'Mixed Race Existing',
      'MIXED-ORIGINAL-158',
      'duplicate-mixed-existing',
    );
    const mixedEventsBefore = await clientSuccessEventCount();
    const register = fetch(`${origin}/api/clients`, {
      method: 'POST',
      headers: {
        ...ownerHeaders(company.id),
        'content-type': 'application/json',
        'idempotency-key': 'duplicate-mixed-registration',
      },
      body: JSON.stringify({
        displayName: 'Mixed Race Registration',
        taxId: 'MIXED-RACE-ID-158',
      }),
    });
    const correct = fetch(`${origin}/api/clients/${firstTarget.id}`, {
      method: 'PATCH',
      headers: {
        ...ownerHeaders(company.id),
        'content-type': 'application/json',
        'idempotency-key': 'duplicate-mixed-correction',
      },
      body: JSON.stringify({
        expectedVersion: 1,
        taxId: 'MIXED-RACE-ID-158',
      }),
    });
    const mixedResponses = await Promise.all([register, correct]);
    expect(
      mixedResponses.map((response) => response.status).toSorted(),
    ).toEqual(expect.arrayContaining([409]));
    expect(
      mixedResponses.filter((response) => response.status === 409),
    ).toHaveLength(1);
    expect(
      mixedResponses.filter((response) => [200, 201].includes(response.status)),
    ).toHaveLength(1);
    await expectOpaqueDuplicateConflict(
      mixedResponses.find((response) => response.status === 409),
    );
    const mixedIdentifierOwners = await pool.query<{ count: string }>(
      `SELECT count(*) FROM client_accounts
       WHERE tax_id = 'MIXED-RACE-ID-158' AND status = 'active'`,
    );
    expect(mixedIdentifierOwners.rows[0]).toEqual({ count: '1' });
    const mixedTarget = await pool.query<{ version: number }>(
      `SELECT version FROM client_accounts WHERE id = $1`,
      [firstTarget.id],
    );
    expect(mixedTarget.rows[0]?.version).toBe(
      mixedResponses[1]?.status === 200 ? 2 : 1,
    );
    expect((await clientSuccessEventCount()) - mixedEventsBefore).toBe(
      mixedResponses[0]?.status === 201 ? 2 : 1,
    );

    const targetA = await registerEnrichedClient(
      company.id,
      'Correction Race A',
      'CORRECTION-RACE-A-158',
      'duplicate-correction-race-a',
    );
    const targetB = await registerEnrichedClient(
      company.id,
      'Correction Race B',
      'CORRECTION-RACE-B-158',
      'duplicate-correction-race-b',
    );
    const correctionEventsBefore = await pool.query<{ count: string }>(
      `SELECT count(*) FROM activity_log_events
       WHERE action::text = 'client.corrected'`,
    );
    const correctionRace = (clientAccountId: string, key: string) =>
      fetch(`${origin}/api/clients/${clientAccountId}`, {
        method: 'PATCH',
        headers: {
          ...ownerHeaders(company.id),
          'content-type': 'application/json',
          'idempotency-key': key,
        },
        body: JSON.stringify({
          expectedVersion: 1,
          taxId: 'CORRECTION-RACE-SHARED-158',
        }),
      });
    const correctionResponses = await Promise.all([
      correctionRace(targetA.id, 'duplicate-correction-race-command-a'),
      correctionRace(targetB.id, 'duplicate-correction-race-command-b'),
    ]);
    expect(
      correctionResponses.map((response) => response.status).toSorted(),
    ).toEqual([200, 409]);
    await expectOpaqueDuplicateConflict(
      correctionResponses.find((response) => response.status === 409),
    );
    const correctedRows = await pool.query<{
      tax_id: string;
      version: number;
    }>(
      `SELECT tax_id, version FROM client_accounts
        WHERE id IN ($1, $2) ORDER BY id`,
      [targetA.id, targetB.id],
    );
    expect(
      correctedRows.rows.filter(
        (row) => row.tax_id === 'CORRECTION-RACE-SHARED-158',
      ),
    ).toHaveLength(1);
    expect(correctedRows.rows.map((row) => row.version).toSorted()).toEqual([
      1, 2,
    ]);
    const correctionEventsAfter = await pool.query<{ count: string }>(
      `SELECT count(*) FROM activity_log_events
       WHERE action::text = 'client.corrected'`,
    );
    expect(
      Number(correctionEventsAfter.rows[0]?.count) -
        Number(correctionEventsBefore.rows[0]?.count),
    ).toBe(1);

    const independentEventsBefore = await clientSuccessEventCount();
    const independentResponses = await Promise.all([
      fetch(`${origin}/api/clients`, {
        method: 'POST',
        headers: {
          ...ownerHeaders(company.id),
          'content-type': 'application/json',
          'idempotency-key': 'duplicate-independent-key-a',
        },
        body: JSON.stringify({
          displayName: 'Independent Key A',
          taxId: 'INDEPENDENT-ID-A-158',
        }),
      }),
      fetch(`${origin}/api/clients`, {
        method: 'POST',
        headers: {
          ...ownerHeaders(company.id),
          'content-type': 'application/json',
          'idempotency-key': 'duplicate-independent-key-b',
        },
        body: JSON.stringify({
          displayName: 'Independent Key B',
          taxId: 'INDEPENDENT-ID-B-158',
        }),
      }),
    ]);
    expect(independentResponses.map((response) => response.status)).toEqual([
      201, 201,
    ]);
    expect((await clientSuccessEventCount()) - independentEventsBefore).toBe(4);
  });

  it('returns remediation-only after complete authority for multiple exact-ID candidates', async () => {
    const companyA = await registerCompany(
      'Multiple Source',
      'duplicate-multiple-a',
    );
    const companyB = await registerCompany(
      'Multiple Attempt',
      'duplicate-multiple-b',
    );
    await grantOwnerDirectorClientAccess(companyA.id);
    await grantOwnerDirectorClientAccess(companyB.id);
    const first = await registerEnrichedClient(
      companyA.id,
      'Multiple Candidate One',
      'MULTIPLE-ID-158',
      'duplicate-multiple-first',
    );
    const actor = await fetch(`${origin}/api/access/current-actor`, {
      headers: ownerHeaders(companyA.id),
    }).then((response) => response.json());
    const legacy = await pool.query<{ id: string }>(
      `WITH candidate AS (
        INSERT INTO client_accounts (
          workspace_id, display_name, tax_id, created_by_internal_user_id,
          created_by_workspace_membership_id
        ) VALUES ($1, 'Multiple Candidate Two', 'MULTIPLE-ID-158', $2, $3)
        RETURNING id
      )
      INSERT INTO client_company_relationships (
        workspace_id, client_account_id, company_id,
        created_by_internal_user_id, created_by_workspace_membership_id
      )
      SELECT $1, id, $4, $2, $3 FROM candidate RETURNING client_account_id AS id`,
      [
        actor.workspaceId,
        actor.internalUserId,
        actor.workspaceMembershipId,
        companyA.id,
      ],
    );
    expect(legacy.rows[0]?.id).not.toBe(first.id);

    const rejected = await fetch(`${origin}/api/clients`, {
      method: 'POST',
      headers: {
        ...ownerHeaders(companyB.id),
        'content-type': 'application/json',
        'idempotency-key': 'duplicate-multiple-proposal',
      },
      body: JSON.stringify({
        displayName: 'Multiple Candidate Proposal',
        taxId: 'MULTIPLE-ID-158',
      }),
    });
    expect(rejected.status).toBe(409);
    const conflict = await rejected.json();
    const detail = await fetch(
      `${origin}/api/client-duplicate-reviews/${conflict.duplicate_review_reference}`,
      { headers: ownerHeaders(companyB.id) },
    );
    expect(detail.status).toBe(200);
    await expect(detail.json()).resolves.toEqual({
      outcome: 'multiple_duplicate_candidates_require_data_remediation',
      duplicate_review_reference: conflict.duplicate_review_reference,
    });
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
        INSERT INTO workspaces (id, name)
        VALUES ($1, 'Foreign Client Workspace')
        RETURNING id
      ), foreign_user AS (
        INSERT INTO internal_users (
          external_provider, external_subject, display_name, email
        )
        VALUES ('deterministic-test', $2, 'Foreign Owner',
          'foreign@example.test')
        RETURNING id
      ), foreign_membership AS (
        INSERT INTO workspace_memberships (workspace_id, internal_user_id)
        SELECT foreign_workspace.id, foreign_user.id
        FROM foreign_workspace, foreign_user
        RETURNING workspace_id, internal_user_id
      )
      SELECT workspace_id, internal_user_id FROM foreign_membership`,
      [clientAccountId, `foreign-owner-${clientAccountId}`],
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
    commandKey = `director-${workspaceMembershipId}-${companyId}`,
  ) {
    const response = await fetch(
      `${origin}/api/company-director-client-assignments`,
      {
        method: 'POST',
        headers: {
          ...identityHeaders('workspace-owner', 'Workspace Owner'),
          'content-type': 'application/json',
          'idempotency-key': commandKey,
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
      permissionSetVersion: 'v2',
    });
  }

  async function revokeDirectorClientAccess(
    workspaceMembershipId: string,
    companyId: string,
    commandKey: string,
  ) {
    const response = await fetch(
      `${origin}/api/company-director-client-assignments/${workspaceMembershipId}/${companyId}`,
      {
        method: 'DELETE',
        headers: {
          ...identityHeaders('workspace-owner', 'Workspace Owner'),
          'idempotency-key': commandKey,
        },
      },
    );
    expect(response.status).toBe(200);
  }

  async function registerEnrichedClient(
    companyId: string,
    displayName: string,
    taxId: string,
    key: string,
  ) {
    const response = await fetch(`${origin}/api/clients`, {
      method: 'POST',
      headers: {
        ...ownerHeaders(companyId),
        'content-type': 'application/json',
        'idempotency-key': key,
      },
      body: JSON.stringify({ displayName, taxId }),
    });
    expect(response.status).toBe(201);
    return response.json();
  }

  async function listDuplicateReviews(companyId: string) {
    const response = await fetch(
      `${origin}/api/client-duplicate-reviews?page_size=20`,
      { headers: ownerHeaders(companyId) },
    );
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    if (
      !isRecord(body) ||
      !Array.isArray(body.items) ||
      (body.next_cursor !== null && typeof body.next_cursor !== 'string')
    ) {
      throw new Error('Expected one duplicate-review page.');
    }
    const items: Array<{ duplicate_review_reference: string }> = [];
    for (const item of body.items) {
      if (
        !isRecord(item) ||
        typeof item.duplicate_review_reference !== 'string'
      ) {
        throw new Error('Expected one opaque duplicate-review list item.');
      }
      items.push({
        duplicate_review_reference: item.duplicate_review_reference,
      });
    }
    return { items, next_cursor: body.next_cursor };
  }

  async function expectOpaqueDuplicateConflict(
    response: Response | undefined,
  ): Promise<{ duplicate_review_reference: string }> {
    if (!response) throw new Error('Expected one duplicate conflict response.');
    expect(response.status).toBe(409);
    const body: unknown = await response.json();
    if (
      !isRecord(body) ||
      typeof body.duplicate_review_reference !== 'string'
    ) {
      throw new Error('Expected one opaque duplicate review reference.');
    }
    expect(body).toEqual({
      statusCode: 409,
      error: 'Conflict',
      code: 'possible_duplicate_review_required',
      duplicate_review_reference: expect.any(String),
    });
    expect(Object.keys(body).toSorted()).toEqual([
      'code',
      'duplicate_review_reference',
      'error',
      'statusCode',
    ]);
    return { duplicate_review_reference: body.duplicate_review_reference };
  }

  async function clientSuccessEventCount(): Promise<number> {
    const result = await pool.query<{ count: string }>(
      `SELECT count(*) FROM activity_log_events
       WHERE action::text IN ('client.created', 'client.corrected',
         'client_company_relationship.established')`,
    );
    return Number(result.rows[0]?.count);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function maximumNumericPlanProperty(value: unknown, property: string): number {
  if (Array.isArray(value)) {
    return value.reduce(
      (maximum, item) =>
        Math.max(maximum, maximumNumericPlanProperty(item, property)),
      0,
    );
  }
  if (!isRecord(value)) return 0;
  const propertyValue = value[property];
  const ownValue = typeof propertyValue === 'number' ? propertyValue : 0;
  return Object.values(value).reduce<number>(
    (maximum, item) =>
      Math.max(maximum, maximumNumericPlanProperty(item, property)),
    ownValue,
  );
}
