import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
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
} from './workspace-invitation-provider.js';
import {
  INVITATION_ACCEPTANCE_PROVIDER,
  type InvitationAcceptanceProvider,
} from './workspace-invitation-acceptance-provider.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const workspaceId = '00000000-0000-4000-8000-000000000163';
const delivery: WorkspaceInvitationProvider = {
  issue: vi.fn().mockResolvedValue({
    kind: 'confirmed',
    providerId: 'inv_163',
    status: 'pending',
  }),
  inspect: vi.fn(),
  revoke: vi.fn().mockResolvedValue({
    kind: 'confirmed',
    providerId: 'inv_163',
    status: 'revoked',
  }),
};
const provider: InvitationAcceptanceProvider = {
  prove: vi.fn(),
  prepare: vi.fn(),
};

describe.skipIf(!databaseUrl)(
  'Workspace invitation acceptance REST contract',
  () => {
    let database: IsolatedPostgresTestDatabase;
    let app: INestApplication;
    let origin: string;

    beforeAll(async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
      database = await createIsolatedPostgresTestDatabase({
        baseDatabaseUrl: databaseUrl,
        namePrefix: 'acceptance',
      });
      Object.assign(process.env, {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        DATABASE_URL: database.targetUrl,
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'owner',
        ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Acceptance',
        ACCESS_ACCEPTED_INVITATIONS_JSON: '[]',
      });
      const connection = drizzle(database.targetPool);
      await migrate(connection, { migrationsFolder: './drizzle' });
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DATABASE)
        .useValue(connection)
        .overrideProvider(WORKSPACE_INVITATION_PROVIDER)
        .useValue(delivery)
        .overrideProvider(INVITATION_ACCEPTANCE_PROVIDER)
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
      vi.mocked(delivery.issue).mockResolvedValue({
        kind: 'confirmed',
        providerId: 'inv_163',
        status: 'pending',
      });
      vi.mocked(provider.prepare).mockReset();
      vi.mocked(provider.prove)
        .mockReset()
        .mockImplementation(async (request) =>
          request.principal.subject === 'recipient'
            ? {
                kind: 'verified',
                provider: 'deterministic-test',
                subject: 'recipient',
                reference: request.invitation.reference,
                providerId: request.invitation.providerId ?? 'inv_163',
              }
            : { kind: 'denied' },
        );
      await api('/access/current-actor', 'owner');
    });

    it('admits a verified recipient once into the intended shell context with attributable history and no business authority', async () => {
      const invitationId = await issue();
      expect((await api('/access/current-actor', 'recipient')).status).toBe(
        403,
      );
      const response = await api('/access/invitations/accept', 'recipient', {
        method: 'POST',
        headers: { 'Idempotency-Key': 'accept-once' },
        body: JSON.stringify({ invitationId }),
      });
      expect(response.status).toBe(201);
      expect(await response.json()).toMatchObject({
        invitationId,
        workspaceId,
      });
      const actorResponse = await api('/access/current-actor', 'recipient', {
        headers: { 'x-workspace-context-id': workspaceId },
      });
      expect(actorResponse.status).toBe(200);
      expect(await actorResponse.json()).toMatchObject({
        workspaceId,
        workspacePermissions: [],
      });
      expect((await api('/clients', 'recipient')).status).toBe(403);
      const history: unknown = await (
        await api('/activity-log', 'owner')
      ).json();
      if (
        typeof history !== 'object' ||
        history === null ||
        !('events' in history) ||
        !Array.isArray(history.events)
      )
        throw new Error('Expected activity history.');
      const actions = history.events.map((event: unknown) => {
        if (
          typeof event !== 'object' ||
          event === null ||
          !('action' in event) ||
          typeof event.action !== 'string'
        )
          throw new Error('Expected an activity action.');
        return event.action;
      });
      expect(
        actions.filter((action) => action === 'workspace_invitation.accepted'),
      ).toHaveLength(1);
      expect(
        actions.filter((action) => action === 'internal_user.provisioned'),
      ).toHaveLength(2);
    });

    it('returns the canonical replay without another proof or event and rejects a different consumption intent', async () => {
      const invitationId = await issue();
      const original = await accept(invitationId, 'same-intent');
      expect(original.status).toBe(201);
      const canonical: unknown = await original.json();
      vi.mocked(provider.prove).mockResolvedValue({ kind: 'unavailable' });
      const replay = await accept(invitationId, 'same-intent');
      expect(replay.status).toBe(201);
      expect(await replay.json()).toEqual(canonical);
      expect(provider.prove).toHaveBeenCalledTimes(1);
      expect((await accept(invitationId, 'different-intent')).status).toBe(403);
      expect(
        (await accept(invitationId, 'same-intent', 'intruder')).status,
      ).toBe(403);
      const counts = await database.targetPool.query(
        "SELECT (SELECT count(*)::int FROM workspace_invitation_acceptances) AS consumptions, (SELECT count(*)::int FROM activity_log_events WHERE action='workspace_invitation.accepted') AS events",
      );
      expect(counts.rows).toEqual([{ consumptions: 1, events: 1 }]);
    });

    it('denies exact replay after suspension without reactivating the membership', async () => {
      const invitationId = await issue();
      expect((await accept(invitationId, 'suspended-replay')).status).toBe(201);
      await database.targetPool.query(
        "UPDATE workspace_memberships SET status='inactive' WHERE internal_user_id IN (SELECT id FROM internal_users WHERE external_subject='recipient')",
      );
      expect((await accept(invitationId, 'suspended-replay')).status).toBe(403);
      expect((await api('/access/current-actor', 'recipient')).status).toBe(
        403,
      );
      const rows = await database.targetPool.query(
        "SELECT status FROM workspace_memberships WHERE internal_user_id IN (SELECT id FROM internal_users WHERE external_subject='recipient')",
      );
      expect(rows.rows).toEqual([{ status: 'inactive' }]);
    });

    it('resolves an existing global identity into the invited Workspace while preserving unrelated authority', async () => {
      const otherWorkspaceId = '00000000-0000-4000-8000-000000001630';
      await database.targetPool.query(
        'INSERT INTO workspaces (id, name) VALUES ($1, $2)',
        [otherWorkspaceId, 'Other Workspace'],
      );
      const user = await seedRecipient('active');
      const membership = await database.targetPool.query(
        "INSERT INTO workspace_memberships (workspace_id, internal_user_id, created_at) VALUES ($1, $2, now() - interval '1 day') RETURNING id",
        [otherWorkspaceId, user],
      );
      await database.targetPool.query(
        "INSERT INTO workspace_permission_grants (workspace_id, workspace_membership_id, permission) VALUES ($1, $2, 'client.manage')",
        [otherWorkspaceId, membership.rows[0].id],
      );
      const invitationId = await issue();
      const response = await accept(invitationId, 'existing-user');
      expect(response.status).toBe(201);
      expect(await response.json()).toMatchObject({
        internalUserId: user,
        workspaceId,
      });
      const selected = await api('/access/current-actor', 'recipient', {
        headers: { 'x-workspace-context-id': workspaceId },
      });
      expect(await selected.json()).toMatchObject({
        internalUserId: user,
        workspaceId,
        workspacePermissions: [],
      });
      const other = await api('/access/current-actor', 'recipient', {
        headers: { 'x-workspace-context-id': otherWorkspaceId },
      });
      expect(await other.json()).toMatchObject({
        workspaceId: otherWorkspaceId,
        workspacePermissions: ['client.manage'],
      });
      const counts = await database.targetPool.query(
        "SELECT count(*)::int AS events FROM activity_log_events WHERE action='internal_user.provisioned'",
      );
      expect(counts.rows).toEqual([{ events: 1 }]);
      expect(
        (
          await api('/access/current-actor', 'recipient', {
            headers: {
              'x-workspace-context-id': '00000000-0000-4000-8000-000000009999',
            },
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await api('/access/current-actor', 'recipient', {
            headers: { 'x-workspace-context-id': 'invalid' },
          })
        ).status,
      ).toBe(403);
    });

    it('keeps the private provider receipt across a lost response and commits no premature admission', async () => {
      const invitationId = await issue();
      vi.mocked(provider.prepare).mockResolvedValue({
        clientId: 'client_owned',
        sealedToken: 'encrypted-token',
      });
      vi.mocked(provider.prove).mockImplementation(async (request) => {
        if (!request.context) return { kind: 'needs-client' };
        expect(request.context).toEqual({
          clientId: 'client_owned',
          sealedToken: 'encrypted-token',
        });
        return { kind: 'unavailable' };
      });
      expect((await accept(invitationId, 'recover')).status).toBe(503);
      expect((await api('/access/current-actor', 'recipient')).status).toBe(
        403,
      );
      vi.mocked(provider.prove).mockImplementation(async (request) => {
        if (!request.context) return { kind: 'denied' };
        return {
          kind: 'verified',
          provider: 'deterministic-test',
          subject: 'recipient',
          reference: invitationId,
          providerId: 'inv_163',
        };
      });
      const retried = await accept(invitationId, 'recover');
      expect(retried.status).toBe(201);
      expect(await retried.text()).not.toContain('encrypted-token');
      expect(provider.prepare).toHaveBeenCalledTimes(1);
    });

    it('allows local revocation after provider acceptance and denies an already verified in-flight admission', async () => {
      const invitationId = await issue();
      await database.targetPool.query(
        "UPDATE workspace_invitations SET delivery_status='accepted' WHERE id=$1",
        [invitationId],
      );
      const entered = signal();
      const resume = signal();
      vi.mocked(provider.prove).mockImplementation(async () => {
        entered.resolve();
        await resume.promise;
        return {
          kind: 'verified',
          provider: 'deterministic-test',
          subject: 'recipient',
          reference: invitationId,
          providerId: 'inv_163',
        };
      });
      const pending = accept(invitationId, 'revocation-race');
      await entered.promise;
      try {
        const revoked = await api(
          '/workspace-invitations/' + invitationId + '/revoke',
          'owner',
          { method: 'POST', headers: { 'Idempotency-Key': 'revoke' } },
        );
        expect(revoked.status).toBe(201);
        expect(await revoked.json()).toMatchObject({ status: 'revoked' });
      } finally {
        resume.resolve();
      }
      expect((await pending).status).toBe(403);
      expect((await api('/access/current-actor', 'recipient')).status).toBe(
        403,
      );
    });

    it.each(['identity', 'membership'] as const)(
      'never reactivates an inactive %s',
      async (inactive) => {
        const user = await seedRecipient(
          inactive === 'identity' ? 'inactive' : 'active',
        );
        await database.targetPool.query(
          'INSERT INTO workspace_memberships (workspace_id, internal_user_id, status) VALUES ($1, $2, $3)',
          [
            workspaceId,
            user,
            inactive === 'membership' ? 'inactive' : 'active',
          ],
        );
        const invitationId = await issue();
        expect((await accept(invitationId, 'inactive')).status).toBe(403);
        expect((await api('/access/current-actor', 'recipient')).status).toBe(
          403,
        );
        await expectNoAdmission();
      },
    );

    it('keeps an existing active Membership and permissions unchanged', async () => {
      const user = await seedRecipient('active');
      await database.targetPool.query(
        'INSERT INTO workspace_memberships (workspace_id, internal_user_id) VALUES ($1, $2)',
        [workspaceId, user],
      );
      const before = await api('/access/current-actor', 'recipient');
      const actor: unknown = await before.json();
      expect((await accept(await issue(), 'existing-member')).status).toBe(201);
      expect(
        await (await api('/access/current-actor', 'recipient')).json(),
      ).toEqual(actor);
      expect(
        (
          await database.targetPool.query(
            'SELECT count(*)::int AS count FROM workspace_memberships WHERE internal_user_id=$1',
            [user],
          )
        ).rows,
      ).toEqual([{ count: 1 }]);
    });

    it('denies invalid, foreign, cross-Workspace and unverified input without disclosing metadata', async () => {
      const invitationId = await issue();
      const invalidBodies = [
        {},
        { invitationId: 'invalid' },
        { invitationId: '00000000-0000-4000-8000-000000009999' },
        { invitationId, workspaceId: 'foreign' },
        { invitationId, subject: 'recipient' },
        { invitationId, ticket: 123 },
      ];
      for (const body of invalidBodies) {
        const response = await api('/access/invitations/accept', 'recipient', {
          method: 'POST',
          headers: { 'Idempotency-Key': 'invalid' },
          body: JSON.stringify(body),
        });
        await expectDenied(response);
      }
      await expectDenied(await accept(invitationId, 'foreign', 'intruder'));
      const unverified = await fetch(
        origin + '/api/access/invitations/accept',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': 'unverified',
          },
          body: JSON.stringify({ invitationId }),
        },
      );
      expect(unverified.status).toBe(401);
      await expectNoAdmission();
    });

    it.each(['reference', 'subject', 'provider', 'providerId'] as const)(
      'rejects forged provider proof %s',
      async (field) => {
        const invitationId = await issue();
        vi.mocked(provider.prove).mockResolvedValue({
          kind: 'verified',
          provider: 'deterministic-test',
          subject: 'recipient',
          reference: invitationId,
          providerId: 'inv_163',
          [field]: 'foreign',
        });
        await expectDenied(await accept(invitationId, 'forged'));
        await expectNoAdmission();
      },
    );

    it('rolls consumption, identity, Membership and history back together when history cannot commit, then retries safely', async () => {
      const invitationId = await issue();
      await database.targetPool.query(
        `CREATE FUNCTION reject_acceptance_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action::text='workspace_invitation.accepted' THEN RAISE EXCEPTION 'Injected audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_acceptance BEFORE INSERT ON activity_log_events FOR EACH ROW EXECUTE FUNCTION reject_acceptance_event()`,
      );
      try {
        expect((await accept(invitationId, 'rollback')).status).toBe(500);
        await expectNoAdmission();
        expect(
          (
            await database.targetPool.query(
              "SELECT id FROM internal_users WHERE external_subject='recipient'",
            )
          ).rows,
        ).toEqual([]);
      } finally {
        await database.targetPool.query(
          'DROP TRIGGER reject_acceptance ON activity_log_events; DROP FUNCTION reject_acceptance_event()',
        );
      }
      expect((await accept(invitationId, 'rollback')).status).toBe(201);
      expect(
        (
          await database.targetPool.query(
            "SELECT count(*)::int AS count FROM activity_log_events WHERE action IN ('workspace_invitation.accepted', 'internal_user.provisioned')",
          )
        ).rows,
      ).toEqual([{ count: 3 }]);
    });

    it.each([true, false])(
      'serializes concurrent consumption with identical intent = %s',
      async (sameIntent) => {
        const invitationId = await issue();
        const ready = signal();
        const resume = signal();
        let entered = 0;
        vi.mocked(provider.prove).mockImplementation(async () => {
          if (++entered === 2) ready.resolve();
          await resume.promise;
          return {
            kind: 'verified',
            provider: 'deterministic-test',
            subject: 'recipient',
            reference: invitationId,
            providerId: 'inv_163',
          };
        });
        const first = accept(invitationId, 'concurrent');
        const second = accept(
          invitationId,
          sameIntent ? 'concurrent' : 'competitor',
        );
        await ready.promise;
        const lock = await database.targetPool.connect();
        try {
          await lock.query('BEGIN');
          await lock.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE', [
            workspaceId,
          ]);
          resume.resolve();
          // Observe actual PostgreSQL lock waits before allowing either commit.
          await vi.waitFor(async () => {
            const waiting = await database.targetPool.query(
              "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=$1 AND wait_event_type='Lock'",
              [database.databaseName],
            );
            expect(waiting.rows[0]).toEqual({ count: 2 });
          });
        } finally {
          await lock.query('COMMIT');
          lock.release();
          resume.resolve();
        }
        const responses = await Promise.all([first, second]);
        expect(responses.map((response) => response.status).sort()).toEqual(
          sameIntent ? [201, 201] : [201, 403],
        );
        const bodies: unknown[] = await Promise.all(
          responses.map((response) => response.json()),
        );
        if (sameIntent) expect(bodies[0]).toEqual(bodies[1]);
        expect(
          (
            await database.targetPool.query(
              'SELECT count(*)::int AS count FROM workspace_invitation_acceptances',
            )
          ).rows,
        ).toEqual([{ count: 1 }]);
      },
    );

    it('converges two valid invitations on one identity and Membership and rejects key reuse across invitations', async () => {
      const firstId = await issue();
      await database.targetPool.query(
        "UPDATE workspace_invitations SET delivery_status='accepted' WHERE id=$1",
        [firstId],
      );
      vi.mocked(delivery.issue).mockResolvedValue({
        kind: 'confirmed',
        providerId: 'inv_164',
        status: 'pending',
      });
      const secondId = await issue('second');
      const ready = signal();
      const resume = signal();
      let entered = 0;
      vi.mocked(provider.prove).mockImplementation(async (request) => {
        if (++entered === 2) ready.resolve();
        await resume.promise;
        return {
          kind: 'verified',
          provider: 'deterministic-test',
          subject: 'recipient',
          reference: request.invitation.reference,
          providerId: request.invitation.providerId ?? '',
        };
      });
      const first = accept(firstId, 'first');
      const second = accept(secondId, 'second');
      await ready.promise;
      resume.resolve();
      const responses = await Promise.all([first, second]);
      expect(responses.map((response) => response.status)).toEqual([201, 201]);
      expect(
        (
          await database.targetPool.query(
            "SELECT (SELECT count(*)::int FROM internal_users WHERE external_subject='recipient') AS identities, (SELECT count(*)::int FROM workspace_memberships WHERE internal_user_id IN (SELECT id FROM internal_users WHERE external_subject='recipient')) AS memberships, (SELECT count(*)::int FROM workspace_invitation_acceptances) AS consumptions",
          )
        ).rows,
      ).toEqual([{ identities: 1, memberships: 1, consumptions: 2 }]);
      await expectDenied(await accept(secondId, 'first'));
    });

    it.each(['expiry', 'suspension'] as const)(
      'rechecks %s after external proof and before committing admission',
      async (change) => {
        const user = await seedRecipient('active');
        const membership = await database.targetPool.query<{ id: string }>(
          'INSERT INTO workspace_memberships (workspace_id, internal_user_id) VALUES ($1, $2) RETURNING id',
          [workspaceId, user],
        );
        const invitationId = await issue();
        const ready = signal();
        const resume = signal();
        vi.mocked(provider.prove).mockImplementation(async () => {
          ready.resolve();
          await resume.promise;
          return {
            kind: 'verified',
            provider: 'deterministic-test',
            subject: 'recipient',
            reference: invitationId,
            providerId: 'inv_163',
          };
        });
        const pending = accept(invitationId, 'stale');
        await ready.promise;
        try {
          if (change === 'expiry')
            await database.targetPool.query(
              "UPDATE workspace_invitations SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
              [invitationId],
            );
          else {
            const suspension = await api(
              '/workspace-membership-suspensions',
              'owner',
              {
                method: 'POST',
                headers: { 'Idempotency-Key': 'suspend' },
                body: JSON.stringify({
                  workspaceMembershipId: membership.rows[0]?.id,
                }),
              },
            );
            expect(suspension.status).toBe(201);
          }
        } finally {
          resume.resolve();
        }
        await expectDenied(await pending);
        await expectNoAdmission();
      },
    );

    async function expectDenied(response: Response) {
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        message: 'Forbidden',
        statusCode: 403,
      });
    }

    async function expectNoAdmission() {
      expect(
        (
          await database.targetPool.query(
            "SELECT (SELECT count(*)::int FROM workspace_invitation_acceptances) AS consumptions, (SELECT count(*)::int FROM activity_log_events WHERE action='workspace_invitation.accepted') AS events",
          )
        ).rows,
      ).toEqual([{ consumptions: 0, events: 0 }]);
    }

    async function seedRecipient(status: 'active' | 'inactive') {
      const result = await database.targetPool.query(
        'INSERT INTO internal_users (external_provider, external_subject, display_name, email, status) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [
          'deterministic-test',
          'recipient',
          'Existing recipient',
          'recipient@example.test',
          status,
        ],
      );
      const id: unknown = result.rows[0]?.id;
      if (typeof id !== 'string') throw new Error('Fixture identity missing.');
      return id;
    }

    async function issue(key = 'issue') {
      const response = await api('/workspace-invitations', 'owner', {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: JSON.stringify({
          email: 'recipient@example.test',
          expiresInDays: 1,
        }),
      });
      expect(response.status).toBe(201);
      const body: unknown = await response.json();
      if (
        typeof body !== 'object' ||
        body === null ||
        !('id' in body) ||
        typeof body.id !== 'string'
      )
        throw new Error('Expected an invitation identifier.');
      return body.id;
    }

    function accept(invitationId: string, key: string, subject = 'recipient') {
      return api('/access/invitations/accept', subject, {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: JSON.stringify({ invitationId }),
      });
    }

    function api(path: string, subject: string, init: RequestInit = {}) {
      return fetch(origin + '/api' + path, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          'x-test-external-provider': 'deterministic-test',
          'x-test-external-subject': subject,
          'x-test-display-name': subject,
          'x-test-email': subject + '@example.test',
          ...init.headers,
        },
      });
    }
  },
);

function signal() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, resolve: () => release() };
}
