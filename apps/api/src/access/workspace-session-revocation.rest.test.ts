import { randomUUID } from 'node:crypto';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';
import type { SessionRevocationOutcome } from './identity-session-revoker.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const workspaceId = '00000000-0000-4000-8000-000000000161';
const provider = {
  revoke:
    vi.fn<
      (identity: {
        provider: string;
        subject: string;
      }) => Promise<SessionRevocationOutcome>
    >(),
};
const run = databaseUrl ? describe : describe.skip;
run('Suspended member session revocation REST journey', () => {
  let isolated: IsolatedPostgresTestDatabase;
  let harness: PostgresRestTestHarness;
  let targetId: string;
  beforeAll(async () => {
    if (!databaseUrl) throw new Error('Missing test database');
    isolated = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'session_revocation',
    });
    harness = await createPostgresRestTestHarness({
      databaseUrl: isolated.targetUrl,
      sessionRevoker: provider,
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'clerk',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'user_owner',
        ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Session Workspace',
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify([
          { provider: 'clerk', subject: 'user_target', workspaceId },
          { provider: 'clerk', subject: 'user_other', workspaceId },
        ]),
      },
    });
  });
  afterAll(async () => {
    await harness?.close();
    await isolated?.close();
  });
  beforeEach(async () => {
    await harness.pool.query(
      'TRUNCATE activity_log_events, workspace_memberships, internal_users, workspaces CASCADE',
    );
    provider.revoke.mockReset().mockResolvedValue({ status: 'complete' });
    expect((await request('/access/current-actor')).status).toBe(200);
    targetId = string(
      (
        await body(
          await request(
            '/access/current-actor',
            'GET',
            undefined,
            'user_target',
          ),
        )
      ).workspaceMembershipId,
    );
  });

  it('commits denial before calling Clerk, uses verified provider/subject, and records one successful outcome under concurrent replays', async () => {
    provider.revoke.mockImplementation(async (identity) => {
      expect(identity).toEqual({ provider: 'clerk', subject: 'user_target' });
      expect(
        (
          await request(
            '/access/current-actor',
            'GET',
            undefined,
            'user_target',
          )
        ).status,
      ).toBe(403);
      return { status: 'complete' };
    });
    const responses = await Promise.all([suspend('same'), suspend('same')]);
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    expect(provider.revoke).toHaveBeenCalledTimes(1);
    expect(await list()).toMatchObject({
      records: [{ workspaceMembershipId: targetId, status: 'complete' }],
    });
    expect((await retry()).status).toBe(201);
    expect(provider.revoke).toHaveBeenCalledTimes(1);
    expect(await actions()).toEqual([
      'workspace_membership.suspended',
      'workspace_sessions.revoked',
    ]);
    const changed = await request(
      '/workspace-membership-suspensions',
      'POST',
      { workspaceMembershipId: randomUUID() },
      'user_owner',
      'same',
    );
    expect(changed.status).toBe(400);
  });

  it('keeps failures retryable across a fresh request without restoring grants or repeating the suspension', async () => {
    provider.revoke
      .mockRejectedValueOnce(new Error('secret provider failure'))
      .mockResolvedValue({ status: 'complete' });
    expect((await suspend()).status).toBe(201);
    const page = await list();
    expect(page).toMatchObject({ records: [{ status: 'retry_required' }] });
    expect(JSON.stringify(page)).not.toContain('secret');
    expect(
      (await request('/access/current-actor', 'GET', undefined, 'user_target'))
        .status,
    ).toBe(403);
    expect((await retry()).status).toBe(201);
    expect(provider.revoke).toHaveBeenCalledTimes(1);
    await ageAttempt();
    expect((await retry()).status).toBe(201);
    expect(await list()).toMatchObject({ records: [{ status: 'complete' }] });
    expect(await actions()).toEqual([
      'workspace_membership.suspended',
      'workspace_sessions.revocation_retry_required',
      'workspace_sessions.revoked',
    ]);
    const audit = await request('/activity-log');
    const text = await audit.text();
    expect(text).not.toContain('user_target');
    expect(text).not.toContain('secret');
  });

  it('does not retry provider work when a failed suspension is replayed after the lease', async () => {
    provider.revoke
      .mockResolvedValueOnce({ status: 'retry_required' })
      .mockResolvedValue({ status: 'complete' });
    const first = await suspend('failed-replay');
    expect(first.status).toBe(201);
    const original = await body(first);
    await ageAttempt();

    const replay = await suspend('failed-replay');
    expect(replay.status).toBe(201);
    expect(await body(replay)).toEqual(original);
    expect(provider.revoke).toHaveBeenCalledTimes(1);
    expect(await list()).toMatchObject({
      records: [{ status: 'retry_required' }],
    });
    expect(await actions()).toEqual([
      'workspace_membership.suspended',
      'workspace_sessions.revocation_retry_required',
    ]);

    expect((await retry()).status).toBe(201);
    expect(provider.revoke).toHaveBeenCalledTimes(2);
    expect(await list()).toMatchObject({ records: [{ status: 'complete' }] });
    expect(await actions()).toEqual([
      'workspace_membership.suspended',
      'workspace_sessions.revocation_retry_required',
      'workspace_sessions.revoked',
    ]);
  });
  it('exposes an in-flight attempt without starting competing provider work', async () => {
    let release: (outcome: SessionRevocationOutcome) => void = () => undefined;
    let entered: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    provider.revoke.mockImplementation(() => {
      entered();
      return new Promise((resolve) => {
        release = resolve;
      });
    });
    const pending = suspend();
    await started;
    try {
      expect(await list()).toMatchObject({ records: [{ status: 'running' }] });
      expect((await retry()).status).toBe(201);
      expect(provider.revoke).toHaveBeenCalledTimes(1);
    } finally {
      release({ status: 'complete' });
    }
    expect((await pending).status).toBe(201);
  });

  it('recovers an abandoned lease and ignores a late result from its replaced attempt', async () => {
    let release: (outcome: SessionRevocationOutcome) => void = () => undefined;
    let entered: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    provider.revoke
      .mockImplementationOnce(() => {
        entered();
        return new Promise((resolve) => {
          release = resolve;
        });
      })
      .mockResolvedValue({ status: 'complete' });
    const old = suspend();
    await started;
    try {
      await ageAttempt();
      expect(await list()).toMatchObject({
        records: [{ status: 'retry_required' }],
      });
      expect((await retry()).status).toBe(201);
    } finally {
      release({ status: 'retry_required' });
    }
    await old;
    expect(await list()).toMatchObject({ records: [{ status: 'complete' }] });
    expect(await actions()).toEqual([
      'workspace_membership.suspended',
      'workspace_sessions.revoked',
    ]);
  });

  it('denies ordinary, suspended, unknown and foreign targets without provider calls or metadata', async () => {
    await request('/access/current-actor', 'GET', undefined, 'user_other');
    expect(
      (
        await request(
          '/workspace-session-revocations',
          'GET',
          undefined,
          'user_other',
        )
      ).status,
    ).toBe(403);
    expect((await retry(targetId, 'user_other')).status).toBe(403);
    expect((await retry()).status).toBe(403); // Active target has no committed suspension.
    expect((await retry(randomUUID())).status).toBe(403);
    const foreignId = randomUUID();
    const foreignWorkspace = randomUUID();
    await harness.pool.query('INSERT INTO workspaces(id,name) VALUES($1,$2)', [
      foreignWorkspace,
      'Foreign',
    ]);
    await harness.pool.query(
      "INSERT INTO workspace_memberships(id,workspace_id,internal_user_id,status) SELECT $1,$2,internal_user_id,'inactive' FROM workspace_memberships WHERE id=$3",
      [foreignId, foreignWorkspace, targetId],
    );
    expect((await retry(foreignId)).status).toBe(403);
    expect(provider.revoke).not.toHaveBeenCalled();
    await suspend();
    expect(
      (
        await request(
          '/workspace-session-revocations',
          'GET',
          undefined,
          'user_target',
        )
      ).status,
    ).toBe(403);
  });

  it('retains recoverable state when audit persistence fails after provider completion', async () => {
    await harness.pool.query(
      `CREATE FUNCTION reject_session_outcome() RETURNS trigger AS $$ BEGIN IF NEW.action::text = 'workspace_sessions.revoked' THEN RAISE EXCEPTION 'forced failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql; CREATE TRIGGER reject_session_outcome BEFORE INSERT ON activity_log_events FOR EACH ROW EXECUTE FUNCTION reject_session_outcome();`,
    );
    try {
      expect((await suspend()).status).toBe(201);
      expect(
        (
          await request(
            '/access/current-actor',
            'GET',
            undefined,
            'user_target',
          )
        ).status,
      ).toBe(403);
      expect(await actions()).toEqual(['workspace_membership.suspended']);
    } finally {
      await harness.pool.query(
        'DROP TRIGGER reject_session_outcome ON activity_log_events; DROP FUNCTION reject_session_outcome()',
      );
    }
    await ageAttempt();
    await retry();
    expect(await actions()).toEqual([
      'workspace_membership.suspended',
      'workspace_sessions.revoked',
    ]);
  });

  it('bounds status pages and validates cursor input', async () => {
    await suspend();
    const owner = await body(await request('/access/current-actor'));
    for (let index = 0; index < 50; index += 1) {
      const userId = randomUUID();
      const membershipId = randomUUID();
      await harness.pool.query(
        "INSERT INTO internal_users(id,external_provider,external_subject,display_name,email) VALUES($1,'clerk',$2,$3,'fixture@example.test')",
        [userId, `page-user-${index}`, `Fixture ${index}`],
      );
      await harness.pool.query(
        "INSERT INTO workspace_memberships(id,workspace_id,internal_user_id,status) VALUES($1,$2,$3,'inactive')",
        [membershipId, workspaceId, userId],
      );
      await harness.pool.query(
        'INSERT INTO workspace_membership_suspension_commands(workspace_id,actor_workspace_membership_id,idempotency_key,target_workspace_membership_id) VALUES($1,$2,$3,$4)',
        [
          workspaceId,
          string(owner.workspaceMembershipId),
          `page-${index}`,
          membershipId,
        ],
      );
    }
    const first = await list();
    expect(Array.isArray(first.records) ? first.records.length : 0).toBe(50);
    const second = await body(
      await request(
        `/workspace-session-revocations?after=${string(first.nextCursor)}`,
      ),
    );
    expect(Array.isArray(second.records) ? second.records.length : 0).toBe(1);
    expect(second.nextCursor).toBeNull();
    expect(
      (await request('/workspace-session-revocations?after=invalid')).status,
    ).toBe(400);
  });

  function request(
    path: string,
    method = 'GET',
    payload?: unknown,
    subject = 'user_owner',
    key: string = randomUUID(),
  ) {
    return fetch(`${harness.origin}/api${path}`, {
      method,
      headers: {
        'x-test-external-provider': 'clerk',
        'x-test-external-subject': subject,
        'x-test-display-name':
          subject === 'user_target' ? 'Target Member' : 'Workspace Owner',
        'x-test-email': 'same-delivery@example.test',
        'content-type': 'application/json',
        'idempotency-key': key,
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
  }
  function suspend(key: string = randomUUID()) {
    return request(
      '/workspace-membership-suspensions',
      'POST',
      { workspaceMembershipId: targetId },
      'user_owner',
      key,
    );
  }
  function retry(id = targetId, actor = 'user_owner') {
    return request(
      `/workspace-session-revocations/${id}/retry`,
      'POST',
      undefined,
      actor,
    );
  }
  async function list() {
    const response = await request('/workspace-session-revocations');
    expect(response.status).toBe(200);
    return body(response);
  }
  async function ageAttempt() {
    await harness.pool.query(
      "UPDATE workspace_membership_suspension_commands SET session_revocation_attempted_at = now() - interval '31 seconds'",
    );
  }
  async function actions() {
    const result = await harness.pool.query<{ action: string }>(
      "SELECT action FROM activity_log_events WHERE action::text LIKE 'workspace_%' ORDER BY occurred_at, id",
    );
    return result.rows.map((r) => r.action);
  }
});
async function body(response: Response): Promise<Record<string, unknown>> {
  const value: unknown = await response.json();
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Expected response object');
  return Object.fromEntries(Object.entries(value));
}
function string(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected string');
  return value;
}
