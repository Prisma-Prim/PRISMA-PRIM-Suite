import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AppModule } from '../app.module.js';
import { DATABASE } from '../database/database.constants.js';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';
import {
  WORKSPACE_INVITATION_PROVIDER,
  type WorkspaceInvitationProvider,
  type ProviderInvitationResult,
} from './workspace-invitation-provider.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const workspaceId = '00000000-0000-4000-8000-000000000162';
const provider: WorkspaceInvitationProvider = {
  issue: vi.fn(),
  inspect: vi.fn(),
  revoke: vi.fn(),
};
const pending = {
  kind: 'confirmed',
  providerId: 'inv_controlled',
  status: 'pending',
} satisfies ProviderInvitationResult;
const recipient = { email: 'recipient@example.test', expiresInDays: 7 };

describe.skipIf(!databaseUrl)('Workspace invitation REST contract', () => {
  let database: IsolatedPostgresTestDatabase;
  let app: INestApplication;
  let origin: string;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'invitation',
    });
    Object.assign(process.env, {
      NODE_ENV: 'test',
      ACCESS_IDENTITY_MODE: 'test',
      DATABASE_URL: database.targetUrl,
      ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
      ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'owner',
      ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
      ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Invitations',
      ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify([
        { provider: 'deterministic-test', subject: 'member', workspaceId },
      ]),
    });
    const connection = drizzle(database.targetPool);
    await migrate(connection, { migrationsFolder: './drizzle' });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DATABASE)
      .useValue(connection)
      .overrideProvider(WORKSPACE_INVITATION_PROVIDER)
      .useValue(provider)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    origin = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
    await database?.close();
  });
  beforeEach(async () => {
    await database.targetPool.query(
      'TRUNCATE workspaces, internal_users CASCADE',
    );
    vi.mocked(provider.issue).mockReset().mockResolvedValue(pending);
    vi.mocked(provider.inspect).mockReset().mockResolvedValue(pending);
    vi.mocked(provider.revoke)
      .mockReset()
      .mockResolvedValue({ ...pending, status: 'revoked' });
    await api('/access/current-actor');
  });

  it('issues exactly once under concurrent replay, audits once, and gives no identity or membership to the recipient', async () => {
    const responses = await Promise.all([
      post('', recipient, 'issue-once'),
      post('', recipient, 'issue-once'),
    ]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    const invitation = await responses[0]?.json();
    expect(invitation).toMatchObject({
      email: recipient.email,
    });
    expect(await (await api('/workspace-invitations')).json()).toMatchObject({
      invitations: [{ id: invitation.id, status: 'pending' }],
    });
    expect(provider.issue).toHaveBeenCalledTimes(1);
    expect(await counts()).toEqual({
      invitations: 1,
      users: 1,
      memberships: 1,
      roles: 0,
      grants: 4,
      issued: 1,
      revoked: 0,
    });
    expect((await api('/access/current-actor', 'recipient')).status).toBe(403);
    const activity = await (await api('/activity-log')).json();
    expect(activity.events).toContainEqual(
      expect.objectContaining({
        action: 'workspace_invitation.issued',
        actor: expect.objectContaining({ displayName: 'owner' }),
        target: { type: 'workspace_invitation', invitationId: invitation.id },
        metadata: {},
      }),
    );
    expect(
      JSON.stringify(await (await api('/workspace-invitations')).json()),
    ).not.toMatch(/inv_controlled|providerId|token|https:/u);
  });

  it('rejects changed intent or operation under the same key without another delivery or mutation', async () => {
    const invitation = await (await post('', recipient, 'immutable')).json();
    expect(
      (
        await post(
          '',
          { ...recipient, email: 'other@example.test' },
          'immutable',
        )
      ).status,
    ).toBe(400);
    expect(
      (await post('', { ...recipient, expiresInDays: 1 }, 'immutable')).status,
    ).toBe(400);
    expect(
      (await post(`/${invitation.id}/revoke`, {}, 'immutable')).status,
    ).toBe(400);
    expect(provider.issue).toHaveBeenCalledTimes(1);
    expect((await counts()).revoked).toBe(0);
  });

  it('keeps timeout uncertain, blocks new-key duplicates, and reconciles without resending', async () => {
    vi.mocked(provider.issue).mockResolvedValue({ kind: 'uncertain' });
    const invitation = await (await post('', recipient, 'timeout')).json();
    expect(invitation.status).toBe('uncertain');
    expect((await post('', recipient, 'timeout')).status).toBe(201);
    expect((await post('', recipient, 'different-key')).status).toBe(409);
    await allowRefresh(invitation.id);
    expect(
      await (await post(`/${invitation.id}/refresh`)).json(),
    ).toMatchObject({ status: 'pending' });
    expect(provider.issue).toHaveBeenCalledTimes(1);
    expect(provider.inspect).toHaveBeenCalledTimes(1);
    await post(`/${invitation.id}/refresh`);
    expect(provider.inspect).toHaveBeenCalledTimes(1);
  });

  it('persists revocation and one audit even when Clerk is unavailable, then confirms it on a bounded retry', async () => {
    const invitation = await (await post('', recipient, 'revoke-me')).json();
    await allowRefresh(invitation.id);
    vi.mocked(provider.revoke).mockResolvedValue({ kind: 'uncertain' });
    expect(
      await (await post(`/${invitation.id}/revoke`, {}, 'revoke-once')).json(),
    ).toMatchObject({ status: 'revoked', deliveryStatus: 'pending' });
    await post(`/${invitation.id}/revoke`, {}, 'revoke-once');
    expect(provider.revoke).toHaveBeenCalledTimes(1);
    expect((await counts()).revoked).toBe(1);
    await allowRefresh(invitation.id);
    vi.mocked(provider.revoke).mockResolvedValue({
      ...pending,
      status: 'revoked',
    });
    expect(
      await (await post(`/${invitation.id}/refresh`)).json(),
    ).toMatchObject({ status: 'revoked', deliveryStatus: 'revoked' });
    expect((await api('/access/current-actor', 'recipient')).status).toBe(403);
  });

  it('reports expiry without creating admission, and never promotes provider acceptance into membership', async () => {
    const invitation = await (await post('', recipient)).json();
    await database.targetPool.query(
      "UPDATE workspace_invitations SET expires_at = now() - interval '1 second', sync_after = now() - interval '1 second' WHERE id = $1",
      [invitation.id],
    );
    vi.mocked(provider.inspect).mockResolvedValue({
      ...pending,
      status: 'accepted',
    });
    expect(
      await (await post(`/${invitation.id}/refresh`)).json(),
    ).toMatchObject({ status: 'expired', deliveryStatus: 'accepted' });
    expect((await api('/access/current-actor', 'recipient')).status).toBe(403);
    expect((await counts()).memberships).toBe(1);
  });

  it('retains local revocation and the provider-used outcome when acceptance wins the external race', async () => {
    const invitation = await (await post('', recipient)).json();
    vi.mocked(provider.revoke).mockResolvedValue({
      ...pending,
      status: 'accepted',
    });
    expect(await (await post(`/${invitation.id}/revoke`)).json()).toMatchObject(
      {
        status: 'revoked',
        deliveryStatus: 'accepted',
        revokedAt: expect.any(String),
      },
    );
    expect((await counts()).memberships).toBe(1);
    expect((await counts()).revoked).toBe(1);
    expect((await api('/access/current-actor', 'recipient')).status).toBe(403);
  });

  it('denies ordinary members and foreign targets without exposing invitation metadata', async () => {
    const invitation = await (await post('', recipient)).json();
    await api('/access/current-actor', 'member');
    expect((await api('/workspace-invitations', 'member')).status).toBe(403);
    expect((await post('', recipient, 'member-key', 'member')).status).toBe(
      403,
    );
    const foreignId = randomUUID();
    const foreignWorkspaceId = randomUUID();
    const foreignMembershipId = randomUUID();
    await database.targetPool.query(
      'INSERT INTO workspaces (id, name) VALUES ($1, $2)',
      [foreignWorkspaceId, 'Foreign Workspace'],
    );
    await database.targetPool.query(
      "INSERT INTO workspace_memberships (id, workspace_id, internal_user_id) SELECT $1, $2, id FROM internal_users WHERE external_subject = 'owner'",
      [foreignMembershipId, foreignWorkspaceId],
    );
    await database.targetPool.query(
      "INSERT INTO workspace_invitations (id, workspace_id, issued_by_workspace_membership_id, email, expires_in_days, expires_at, sync_after) VALUES ($1, $2, $3, 'foreign-secret@example.test', 7, now() + interval '7 days', now())",
      [foreignId, foreignWorkspaceId, foreignMembershipId],
    );
    const unknown = await post(`/${foreignId}/revoke`);
    const forbidden = await post(
      `/${invitation.id}/revoke`,
      {},
      'member-revoke',
      'member',
    );
    expect(unknown.status).toBe(403);
    expect(await forbidden.json()).toEqual(await unknown.json());
    expect(
      JSON.stringify(await (await api('/activity-log', 'member')).json()),
    ).not.toContain(invitation.id);
    expect(provider.issue).toHaveBeenCalledTimes(1);
    expect(
      JSON.stringify(await (await api('/workspace-invitations')).json()),
    ).not.toContain('foreign-secret');
  });

  it('rejects malformed commands before delivery', async () => {
    for (const body of [
      { email: 'invalid', expiresInDays: 7 },
      { ...recipient, expiresInDays: 0 },
      { ...recipient, expiresInDays: 1.5 },
      { ...recipient, expiresInDays: 31 },
    ])
      expect((await post('', body)).status).toBe(400);
    expect(provider.issue).not.toHaveBeenCalled();
  });

  function api(path: string, subject = 'owner', init?: RequestInit) {
    return fetch(`${origin}/api${path}`, {
      ...init,
      headers: {
        'x-test-external-provider': 'deterministic-test',
        'x-test-external-subject': subject,
        'x-test-display-name': subject,
        'x-test-email': `${subject}@example.test`,
        ...init?.headers,
      },
    });
  }
  function post(
    path: string,
    body: unknown = {},
    key: string = randomUUID(),
    subject = 'owner',
  ) {
    return api(`/workspace-invitations${path}`, subject, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': key },
      body: JSON.stringify(body),
    });
  }
  async function allowRefresh(id: string) {
    await database.targetPool.query(
      "UPDATE workspace_invitations SET sync_after = now() - interval '1 second' WHERE id = $1",
      [id],
    );
  }
  async function counts() {
    const result = await database.targetPool.query<{
      invitations: number;
      users: number;
      memberships: number;
      roles: number;
      grants: number;
      issued: number;
      revoked: number;
    }>(`SELECT
      (SELECT count(*)::int FROM workspace_invitations) AS invitations,
      (SELECT count(*)::int FROM internal_users) AS users,
      (SELECT count(*)::int FROM workspace_memberships) AS memberships,
      (SELECT count(*)::int FROM company_role_assignments) AS roles,
      (SELECT count(*)::int FROM workspace_permission_grants) AS grants,
      (SELECT count(*)::int FROM activity_log_events WHERE action::text = 'workspace_invitation.issued') AS issued,
      (SELECT count(*)::int FROM activity_log_events WHERE action::text = 'workspace_invitation.revoked') AS revoked`);
    const row = result.rows[0];
    if (!row) throw new Error('Counts missing.');
    return row;
  }
});
