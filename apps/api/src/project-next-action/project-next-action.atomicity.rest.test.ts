import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ProjectNextActionStore } from './project-next-action.store.js';
import {
  json,
  openNextActionFixture,
  type NextActionFixture,
} from './project-next-action.test-support.js';

const url = process.env.TEST_DATABASE_URL;
const relations = [
  'project_next_action_heads',
  'project_next_action_history',
  'project_next_action_commands',
  'project_next_action_events',
];
(url ? describe : describe.skip)(
  'Project next-action atomic public commands',
  () => {
    let fixture: NextActionFixture;
    beforeAll(async () => {
      if (!url) throw new Error('PostgreSQL required.');
      fixture = await openNextActionFixture(url);
    });
    afterAll(async () => {
      await fixture?.close();
    });
    it('keeps current and history in one real snapshot when another public command commits between their reads', async () => {
      const c = await prepare();
      expect(
        (
          await fixture.request(c.path, {
            method: 'POST',
            companyId: c.companyId,
            body: {
              expectedRevision: 0,
              expectedLifecycleRevision: 0,
              text: 'Snapshot first action',
            },
          })
        ).status,
      ).toBe(200);
      const before = await json(
        await fixture.request(c.path, { companyId: c.companyId }),
      );
      let release: (() => void) | undefined, reached: (() => void) | undefined;
      const held = new Promise<void>((resolve) => {
          release = resolve;
        }),
        entered = new Promise<void>((resolve) => {
          reached = resolve;
        });
      const original = ProjectNextActionStore.prototype.current;
      // Pause only scheduling after the real current query. HTTP, transaction,
      // snapshot, every query/result and the concurrent writer remain real.
      const pause = vi
        .spyOn(ProjectNextActionStore.prototype, 'current')
        .mockImplementationOnce(async function (
          this: ProjectNextActionStore,
          scope,
        ) {
          const value = await original.call(this, scope);
          reached?.();
          await held;
          return value;
        });
      let pending: Promise<Response> | undefined;
      try {
        pending = fixture.request(c.path, { companyId: c.companyId });
        await entered;
        expect(
          (
            await fixture.request(c.path, {
              method: 'POST',
              companyId: c.companyId,
              body: {
                expectedRevision: 1,
                expectedLifecycleRevision: 0,
                text: 'Snapshot concurrent action',
              },
            })
          ).status,
        ).toBe(200);
        release?.();
        expect(await json(await pending)).toEqual(before);
        expect(
          await json(await fixture.request(c.path, { companyId: c.companyId })),
        ).toMatchObject({
          current: { revision: 2, text: 'Snapshot concurrent action' },
        });
      } finally {
        release?.();
        await pending?.catch(() => undefined);
        pause.mockRestore();
      }
    });

    async function prepare() {
      const c = await fixture.setup();
      await fixture.created(
        '/company-project-next-action-coordinator-assignments',
        { companyId: c.companyId, workspaceMembershipId: c.membershipId },
      );
      return c;
    }
    async function unchanged(
      c: Awaited<ReturnType<typeof prepare>>,
      before: unknown,
    ) {
      expect(
        (
          await fixture.pool.query(
            'SELECT version,updated_at FROM client_accounts WHERE id=$1',
            [c.clientId],
          )
        ).rows,
      ).toEqual(before);
      for (const table of relations)
        expect(
          (
            await fixture.pool.query(
              `SELECT count(*)::int AS count FROM ${table}`,
            )
          ).rows,
        ).toEqual([{ count: 0 }]);
      expect(
        await json(await fixture.request(c.path, { companyId: c.companyId })),
      ).toMatchObject({
        current: { revision: 0, text: null },
        history: { entries: [] },
      });
    }
    it.each([...relations, 'client_accounts'])(
      'rolls back every coupled fact, receipt and fence if %s fails',
      async (table) => {
        const c = await prepare(),
          before = (
            await fixture.pool.query(
              'SELECT version,updated_at FROM client_accounts WHERE id=$1',
              [c.clientId],
            )
          ).rows;
        // Only a fixed test-owned PostgreSQL fault is injected; REST and all business owners are real.
        await fixture.pool.query(
          "CREATE FUNCTION pna_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic transaction fault'; END $$",
        );
        await fixture.pool.query(
          `CREATE TRIGGER pna_test_fail BEFORE ${table === 'client_accounts' ? 'UPDATE' : 'INSERT'} ON ${table} FOR EACH ROW EXECUTE FUNCTION pna_test_fail()`,
        );
        try {
          const response = await fixture.request(c.path, {
            method: 'POST',
            companyId: c.companyId,
            key: 'rolled-back-key',
            body: {
              expectedRevision: 0,
              expectedLifecycleRevision: 0,
              text: 'Confidential synthetic action',
            },
          });
          expect(response.status).toBe(500);
          expect(await response.text()).not.toContain('Confidential');
        } finally {
          await fixture.pool.query('DROP FUNCTION pna_test_fail() CASCADE');
        }
        await unchanged(c, before);
        expect(
          (
            await fixture.request(c.path, {
              method: 'POST',
              companyId: c.companyId,
              key: 'rolled-back-key',
              body: {
                expectedRevision: 0,
                expectedLifecycleRevision: 0,
                text: 'Confidential synthetic action',
              },
            })
          ).status,
        ).toBe(200);
      },
    );
    it('rolls back completed writes and fence if public response construction fails', async () => {
      const c = await prepare(),
        before = (
          await fixture.pool.query(
            'SELECT version,updated_at FROM client_accounts WHERE id=$1',
            [c.clientId],
          )
        ).rows;
      const fault = vi
        .spyOn(ProjectNextActionStore.prototype, 'response')
        .mockImplementationOnce(() => {
          throw new Error('Synthetic response construction fault');
        });
      try {
        expect(
          (
            await fixture.request(c.path, {
              method: 'POST',
              companyId: c.companyId,
              body: {
                expectedRevision: 0,
                expectedLifecycleRevision: 0,
                text: 'Atomic response',
              },
            })
          ).status,
        ).toBe(500);
      } finally {
        fault.mockRestore();
      }
      await unchanged(c, before);
    });
  },
);
