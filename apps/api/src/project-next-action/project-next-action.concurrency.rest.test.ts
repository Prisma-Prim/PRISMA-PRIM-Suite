import { setTimeout } from 'node:timers/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  json,
  string,
  openNextActionFixture,
  workspaceId,
  type NextActionFixture,
} from './project-next-action.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
(databaseUrl ? describe : describe.skip)(
  'Project next-action competing commands',
  () => {
    let fixture: NextActionFixture;
    beforeAll(async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
      fixture = await openNextActionFixture(databaseUrl);
    });
    afterAll(async () => {
      await fixture?.close();
    });

    async function blockedBy(pid: number) {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const result = await fixture.pool.query<{ pid: number }>(
          'SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND $1=ANY(pg_blocking_pids(pid)) LIMIT 1',
          [pid],
        );
        const blocked = result.rows[0]?.pid;
        if (blocked) return blocked;
        await setTimeout(10);
      }
      throw new Error(
        'The public command did not reach its held native barrier.',
      );
    }
    async function gate(
      table: string,
      operation: 'INSERT' | 'UPDATE',
      condition = 'true',
    ) {
      // All identifiers/conditions are fixed synthetic test literals, never user inputs.
      await fixture.pool.query(
        `CREATE FUNCTION pna_test_gate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF ${condition} THEN PERFORM pg_advisory_xact_lock(993); END IF; RETURN NEW; END $$`,
      );
      await fixture.pool.query(
        `CREATE TRIGGER pna_test_gate BEFORE ${operation} ON ${table} FOR EACH ROW EXECUTE FUNCTION pna_test_gate()`,
      );
      const connection = await fixture.pool.connect();
      await connection.query('BEGIN');
      const pid = (
        await connection.query<{ pid: number }>(
          'SELECT pg_backend_pid() AS pid',
        )
      ).rows[0]?.pid;
      if (!pid) throw new Error('Missing barrier identity.');
      await connection.query('SELECT pg_advisory_xact_lock(993)');
      let released = false;
      return {
        pid,
        async release() {
          if (released) return;
          released = true;
          try {
            await connection.query('COMMIT');
          } finally {
            connection.release();
          }
        },
        remove: () =>
          fixture.pool.query('DROP FUNCTION pna_test_gate() CASCADE'),
      };
    }
    async function race(input: {
      first: () => Promise<Pick<Response, 'status'>>;
      second: () => Promise<Pick<Response, 'status'>>;
      barrier: Awaited<ReturnType<typeof gate>>;
      statuses: [number, number];
    }) {
      let first: ReturnType<typeof input.first> | undefined,
        second: ReturnType<typeof input.second> | undefined;
      try {
        first = input.first();
        const pid = await blockedBy(input.barrier.pid);
        second = input.second();
        await blockedBy(pid);
        await input.barrier.release();
        expect((await first).status).toBe(input.statuses[0]);
        expect((await second).status).toBe(input.statuses[1]);
      } finally {
        await input.barrier.release();
        await first?.catch(() => undefined);
        await second?.catch(() => undefined);
        await input.barrier.remove();
      }
    }
    async function coordinator() {
      const c = await fixture.setup();
      await fixture.created(
        '/company-project-next-action-coordinator-assignments',
        { companyId: c.companyId, workspaceMembershipId: c.membershipId },
      );
      return c;
    }
    it.each(['same-key', 'different-key', 'changed-intent'])(
      'serializes competing %s deliveries to one material fact',
      async (kind) => {
        const c = await coordinator(),
          barrier = await gate('project_next_action_history', 'INSERT');
        const command = (key: string, text = 'Single winner') =>
          fixture.request(c.path, {
            method: 'POST',
            companyId: c.companyId,
            key,
            body: { expectedRevision: 0, expectedLifecycleRevision: 0, text },
          });
        await race({
          barrier,
          first: () => command('race-key'),
          second: () =>
            command(
              kind === 'different-key' ? 'second-key' : 'race-key',
              kind === 'changed-intent' ? 'Changed intent' : 'Single winner',
            ),
          statuses: [200, kind === 'same-key' ? 200 : 409],
        });
        expect(
          await json(await fixture.request(c.path, { companyId: c.companyId })),
        ).toMatchObject({
          current: { revision: 1, text: 'Single winner' },
          history: { entries: [{ revision: 1 }] },
        });
        expect(
          (
            await fixture.pool.query(
              'SELECT count(*)::int AS count FROM project_next_action_commands',
            )
          ).rows,
        ).toEqual([{ count: 1 }]);
      },
    );
    it.each(['action-first', 'closure-first'])(
      'serializes closure and preserves historical confirmation: %s',
      async (order) => {
        const c = await coordinator();
        await fixture.created('/company-project-approver-assignments', {
          companyId: c.companyId,
          workspaceMembershipId: c.membershipId,
        });
        const change = () =>
          fixture.request(c.path, {
            method: 'POST',
            companyId: c.companyId,
            key: 'closure-confirmation',
            body: {
              expectedRevision: 0,
              expectedLifecycleRevision: 0,
              text: 'Explicit pre-closure action',
            },
          });
        const close = () =>
          fixture.request(`/projects/${c.projectId}/lifecycle-transitions`, {
            method: 'POST',
            companyId: c.companyId,
            body: {
              action: 'cancel',
              expectedLifecycleRevision: 0,
              reason: 'Ordinary native Project cancellation',
            },
          });
        const actionFirst = order === 'action-first';
        const barrier = actionFirst
          ? await gate('project_next_action_history', 'INSERT')
          : await gate('projects', 'UPDATE', "NEW.status='cancelled'");
        await race({
          barrier,
          first: actionFirst ? change : close,
          second: actionFirst ? close : change,
          statuses: [200, actionFirst ? 200 : 409],
        });
        expect((await change()).status).toBe(actionFirst ? 200 : 409);
        expect(
          (await fixture.request(c.path, { companyId: c.companyId })).status,
        ).toBe(200);
      },
    );
    const parents = [
      'coordinator',
      'project-read',
      'client-read',
      'membership',
      'internal-user',
      'company',
    ] as const;
    it.each(
      ['client_accounts', 'client_company_relationships'].flatMap((table) =>
        ['action-first', 'archive-first'].map((order) => ({ table, order })),
      ),
    )(
      'rechecks original Client identity and relationship under held $table archive: $order',
      async ({ table, order }) => {
        const c = await coordinator();
        const before = (
          await fixture.pool.query(
            'SELECT version FROM client_accounts WHERE id=$1',
            [c.clientId],
          )
        ).rows;
        const change = () =>
          fixture.request(c.path, {
            method: 'POST',
            companyId: c.companyId,
            key: 'archive-race',
            body: {
              expectedRevision: 0,
              expectedLifecycleRevision: 0,
              text: 'Authorized before native archive',
            },
          });
        // The Client owner has no public archive command. Hold its native owning
        // row transition; the competing next-action command remains public HTTP.
        const archive = async () => {
          await fixture.pool.query(
            `UPDATE ${table} SET status='archived' WHERE ${table === 'client_accounts' ? 'id' : 'client_account_id'}=$1`,
            [c.clientId],
          );
          return { status: 200 };
        };
        const actionFirst = order === 'action-first';
        const barrier = actionFirst
          ? await gate('project_next_action_history', 'INSERT')
          : await gate(table, 'UPDATE', "NEW.status='archived'");
        await race({
          barrier,
          first: actionFirst ? change : archive,
          second: actionFirst ? archive : change,
          statuses: [200, actionFirst ? 200 : 409],
        });
        for (const relation of [
          'project_next_action_heads',
          'project_next_action_history',
          'project_next_action_commands',
          'project_next_action_events',
        ])
          expect(
            (
              await fixture.pool.query(
                `SELECT count(*)::int AS count FROM ${relation} WHERE project_id=$1`,
                [c.projectId],
              )
            ).rows,
          ).toEqual([{ count: actionFirst ? 1 : 0 }]);
        expect(
          (
            await fixture.pool.query(
              'SELECT version FROM client_accounts WHERE id=$1',
              [c.clientId],
            )
          ).rows,
        ).toEqual([
          { version: Number(before[0]?.version) + (actionFirst ? 1 : 0) },
        ]);
      },
      20_000,
    );
    it.each(
      parents.flatMap((parent) =>
        ['action-first', 'invalidation-first'].map((order) => ({
          parent,
          order,
        })),
      ),
    )(
      'fences consumed $parent in both held orders: $order',
      async ({ parent, order }) => {
        const c = await fixture.setup(),
          colleague = await json(
            await fixture.request('/access/current-actor', {
              subject: 'next-action-colleague',
            }),
          );
        const member = string(colleague.workspaceMembershipId),
          user = string(colleague.internalUserId);
        for (const route of [
          'context',
          'director-client',
          'project',
          'project-next-action-coordinator',
        ])
          await fixture.created(`/company-${route}-assignments`, {
            companyId: c.companyId,
            workspaceMembershipId: member,
          });
        const change = () =>
          fixture.request(c.path, {
            method: 'POST',
            companyId: c.companyId,
            subject: 'next-action-colleague',
            key: 'parent-race',
            body: {
              expectedRevision: 0,
              expectedLifecycleRevision: 0,
              text: 'Authorized collaborator declaration',
            },
          });
        async function invalidate(): Promise<Pick<Response, 'status'>> {
          if (parent === 'company') {
            await fixture.pool.query(
              "UPDATE companies SET status='inactive' WHERE id=$1",
              [c.companyId],
            );
            return { status: 200 };
          }
          if (parent === 'internal-user') {
            await fixture.pool.query(
              "UPDATE internal_users SET status='inactive' WHERE id=$1",
              [user],
            );
            return { status: 200 };
          }
          if (parent === 'membership')
            return fixture.request('/workspace-membership-suspensions', {
              method: 'POST',
              body: { workspaceMembershipId: member },
            });
          const route =
            parent === 'coordinator'
              ? 'project-next-action-coordinator'
              : parent === 'project-read'
                ? 'project'
                : parent === 'client-read'
                  ? 'director-client'
                  : 'context';
          return fixture.request(
            `/company-${route}-assignments/${member}/${c.companyId}`,
            { method: 'DELETE' },
          );
        }
        const actionFirst = order === 'action-first';
        const table = actionFirst
          ? 'project_next_action_history'
          : parent === 'company'
            ? 'companies'
            : parent === 'internal-user'
              ? 'internal_users'
              : parent === 'membership'
                ? 'workspace_memberships'
                : 'company_role_assignments';
        const barrier = await gate(table, actionFirst ? 'INSERT' : 'UPDATE');
        const invalidationStatus = parent === 'membership' ? 201 : 200;
        await race({
          barrier,
          first: actionFirst ? change : invalidate,
          second: actionFirst ? invalidate : change,
          statuses: [
            actionFirst ? 200 : invalidationStatus,
            actionFirst ? invalidationStatus : 403,
          ],
        });
        expect((await change()).status).toBe(403);
        expect(
          (
            await fixture.pool.query(
              'SELECT count(*)::int AS count FROM project_next_action_history',
            )
          ).rows,
        ).toEqual([{ count: actionFirst ? 1 : 0 }]);
      },
      20_000,
    );
    it.each(['action-first', 'invalidation-first'])(
      'preserves independently sufficient Client context after an unconsumed context-only grant is revoked: %s',
      async (order) => {
        const c = await coordinator();
        await fixture.created('/company-context-assignments', {
          companyId: c.companyId,
          workspaceMembershipId: c.membershipId,
        });
        const change = () =>
          fixture.request(c.path, {
            method: 'POST',
            companyId: c.companyId,
            key: 'independent-context',
            body: {
              expectedRevision: 0,
              expectedLifecycleRevision: 0,
              text: 'Independent context declaration',
            },
          });
        const invalidate = () =>
          fixture.request(
            `/company-context-assignments/${c.membershipId}/${c.companyId}`,
            { method: 'DELETE' },
          );
        const actionFirst = order === 'action-first';
        const barrier = await gate(
          actionFirst
            ? 'project_next_action_history'
            : 'company_role_assignments',
          actionFirst ? 'INSERT' : 'UPDATE',
        );
        await race({
          barrier,
          first: actionFirst ? change : invalidate,
          second: actionFirst ? invalidate : change,
          statuses: [200, 200],
        });
        expect((await change()).status).toBe(200);
      },
    );
    async function unionScenario() {
      const c = await coordinator();
      await fixture.created('/company-director-client-assignments', {
        companyId: c.companyId,
        workspaceMembershipId: c.membershipId,
      });
      const canonicalId = string(
        (
          await fixture.created(
            '/clients',
            { displayName: 'Canonical race Client DEMO' },
            c.companyId,
          )
        ).id,
      );
      // Only the legacy duplicate fixture is native SQL; all union/reversal decisions are public.
      await fixture.pool.query(
        "UPDATE client_accounts SET tax_id='PNA-RACE-LEGACY-DEMO' WHERE id=ANY($1::uuid[])",
        [[c.clientId, canonicalId]],
      );
      const begin = async () =>
        string(
          (
            await fixture.created(
              `/clients/${c.clientId}/union-reviews`,
              {},
              c.companyId,
            )
          ).reviewReference,
        );
      const confirm = (reference: string) =>
        fixture.request(`/client-union-reviews/${reference}/confirm`, {
          method: 'POST',
          companyId: c.companyId,
          body: {
            canonicalClientId: canonicalId,
            fields: {
              displayName: c.clientId,
              taxId: c.clientId,
              address: c.clientId,
              telephone: c.clientId,
              generalEmail: c.clientId,
              businessActivity: c.clientId,
            },
            companyIds: [c.companyId],
            reviewedDifferences: true,
            reason: 'Governed synthetic union race',
          },
        });
      return { ...c, canonicalId, begin, confirm };
    }
    it.each(['action-first', 'union-first'])(
      'serializes union, conserves original identity and confirms a historical declaration: %s',
      async (order) => {
        const c = await unionScenario(),
          reference = await c.begin(),
          actionFirst = order === 'action-first';
        const change = () =>
          fixture.request(c.path, {
            method: 'POST',
            companyId: c.companyId,
            key: 'union-race',
            body: {
              expectedRevision: 0,
              expectedLifecycleRevision: 0,
              text: 'Original Client declaration',
            },
          });
        const union = () => c.confirm(reference);
        const barrier = actionFirst
          ? await gate('project_next_action_history', 'INSERT')
          : await gate(
              'client_accounts',
              'UPDATE',
              "NEW.status='superseded' AND OLD.status='active'",
            );
        await race({
          barrier,
          first: actionFirst ? change : union,
          second: actionFirst ? union : change,
          statuses: [actionFirst ? 200 : 201, actionFirst ? 404 : 409],
        });
        if (actionFirst)
          expect((await c.confirm(await c.begin())).status).toBe(201);
        expect((await change()).status).toBe(actionFirst ? 200 : 409);
        expect(
          await json(await fixture.request(c.path, { companyId: c.companyId })),
        ).toMatchObject({
          current: {
            revision: actionFirst ? 1 : 0,
            originalClientAccountId: c.clientId,
          },
        });
      },
      20_000,
    );
    it.each(['action-first', 'reversal-first'])(
      'serializes reversal against the actual original Client operational-use fence: %s',
      async (order) => {
        const c = await unionScenario(),
          project = await fixture.created(
            '/projects',
            {
              clientAccountId: c.canonicalId,
              title: 'Pre-union canonical Project DEMO',
            },
            c.companyId,
          ),
          projectId = string(project.id),
          path = `/projects/${projectId}/next-action`;
        expect((await c.confirm(await c.begin())).status).toBe(201);
        const history = await json(
          await fixture.request(`/clients/${c.clientId}/union-history`, {
            companyId: c.companyId,
          }),
        );
        if (!Array.isArray(history.detailReferences))
          throw new Error('Missing native union reference.');
        const reference = string(history.detailReferences[0]),
          actionFirst = order === 'action-first';
        const change = () =>
          fixture.request(path, {
            method: 'POST',
            companyId: c.companyId,
            key: 'reversal-race',
            body: {
              expectedRevision: 0,
              expectedLifecycleRevision: 0,
              text: 'Canonical Client declaration',
            },
          });
        const reverse = () =>
          fixture.request(`/client-union-operations/${reference}/reversal`, {
            method: 'POST',
            companyId: c.companyId,
            body: {
              companyIds: [c.companyId],
              reason: 'Governed reversal race DEMO',
            },
          });
        const barrier = actionFirst
          ? await gate('project_next_action_history', 'INSERT')
          : await gate(
              'client_accounts',
              'UPDATE',
              `NEW.id='${c.canonicalId}'::uuid AND NEW.status='active'`,
            );
        await race({
          barrier,
          first: actionFirst ? change : reverse,
          second: actionFirst ? reverse : change,
          statuses: [actionFirst ? 200 : 201, actionFirst ? 409 : 200],
        });
        expect(
          await json(await fixture.request(path, { companyId: c.companyId })),
        ).toMatchObject({
          current: { revision: 1, originalClientAccountId: c.canonicalId },
        });
        expect(
          (
            await json(
              await fixture.request(`/projects/${projectId}`, {
                companyId: c.companyId,
              }),
            )
          ).clientAccountId,
        ).toBe(c.canonicalId);
      },
      20_000,
    );

    it('refuses a captured Project-read grant replaced while the command waits for its key', async () => {
      const context = await fixture.setup();
      await fixture.created(
        '/company-project-next-action-coordinator-assignments',
        {
          companyId: context.companyId,
          workspaceMembershipId: context.membershipId,
        },
      );
      const blocker = await fixture.pool.connect();
      let pending: Promise<Response> | undefined;
      try {
        await blocker.query('BEGIN');
        const pidResult = await blocker.query<{ pid: number }>(
          'SELECT pg_backend_pid() AS pid',
        );
        const pid = pidResult.rows[0]?.pid;
        if (!pid) throw new Error('Missing held PostgreSQL backend.');
        await blocker.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
          [
            JSON.stringify([
              'project.next-action.command',
              workspaceId,
              context.membershipId,
              'captured-read',
            ]),
          ],
        );
        pending = fixture.request(context.path, {
          method: 'POST',
          companyId: context.companyId,
          key: 'captured-read',
          body: {
            expectedRevision: 0,
            expectedLifecycleRevision: 0,
            text: 'The old read capture cannot be revived.',
          },
        });
        const deadline = Date.now() + 5000;
        let waiting = false;
        while (Date.now() < deadline) {
          const result = await fixture.pool.query<{ waiting: boolean }>(
            'SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))) AS waiting',
            [pid],
          );
          if (result.rows[0]?.waiting) {
            waiting = true;
            break;
          }
          await setTimeout(10);
        }
        expect(waiting).toBe(true);
        expect(
          (
            await fixture.request(
              `/company-project-assignments/${context.membershipId}/${context.companyId}`,
              { method: 'DELETE' },
            )
          ).status,
        ).toBe(200);
        await fixture.created('/company-project-assignments', {
          companyId: context.companyId,
          workspaceMembershipId: context.membershipId,
        });
        await blocker.query('COMMIT');
        expect((await pending).status).toBe(403);
        expect(
          await json(
            await fixture.request(context.path, {
              companyId: context.companyId,
            }),
          ),
        ).toMatchObject({
          current: { revision: 0, text: null },
          history: { entries: [] },
        });
      } finally {
        await blocker.query('ROLLBACK');
        blocker.release();
        await pending;
      }
    });
  },
);
