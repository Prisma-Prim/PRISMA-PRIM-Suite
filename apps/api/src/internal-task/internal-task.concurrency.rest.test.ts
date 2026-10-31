import { setTimeout } from 'node:timers/promises';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { InternalTaskStore } from './internal-task.store.js';
import {
  json,
  object,
  openInternalTaskFixture,
  string,
  workspaceId,
  type InternalTaskFixture,
} from './internal-task.test-support.js';
const databaseUrl = process.env.TEST_DATABASE_URL;
(databaseUrl ? describe : describe.skip)(
  'Internal Task deterministic native ordering',
  () => {
    let fixture: InternalTaskFixture;
    beforeAll(async () => {
      if (!databaseUrl) throw new Error('PostgreSQL required.');
      fixture = await openInternalTaskFixture(databaseUrl);
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
        'Public operation did not reach its held native barrier.',
      );
    }
    async function gate(
      table: string,
      operation: 'INSERT' | 'UPDATE',
      condition = 'true',
    ) {
      await fixture.pool.query(
        `CREATE FUNCTION ict_test_gate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF ${condition} THEN PERFORM pg_advisory_xact_lock(1006); END IF; RETURN NEW; END $$`,
      );
      await fixture.pool.query(
        `CREATE TRIGGER ict_test_gate BEFORE ${operation} ON ${table} FOR EACH ROW EXECUTE FUNCTION ict_test_gate()`,
      );
      const db = await fixture.pool.connect();
      await db.query('BEGIN');
      await db.query('SELECT pg_advisory_xact_lock(1006)');
      const pid = (
        await db.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      ).rows[0]?.pid;
      if (!pid) throw new Error('Missing native barrier.');
      let released = false;
      return {
        pid,
        async release() {
          if (released) return;
          released = true;
          try {
            await db.query('COMMIT');
          } finally {
            db.release();
          }
        },
        remove: () =>
          fixture.pool.query('DROP FUNCTION ict_test_gate() CASCADE'),
      };
    }
    async function prepare() {
      const c = await fixture.setup(),
        response = await fixture.request('/company-internal-tasks', {
          method: 'POST',
          companyId: c.companyId,
          subject: 'manager',
          body: { title: 'Competing work' },
        });
      expect(response.status).toBe(201);
      const first = await json(response);
      return {
        ...c,
        first,
        id: string(object(first.task).id),
        assignmentId: string(
          object(c.actor.activeCompany).internalTaskManagerAssignmentId,
        ),
      };
    }
    it.each(['same-key', 'different-key', 'changed-intent'])(
      'serializes %s changes to one material successor and the exact saved confirmation',
      async (kind) => {
        const c = await prepare(),
          barrier = await gate('internal_company_task_history', 'INSERT'),
          path = '/company-internal-tasks/' + c.id + '/changes';
        const command = (key: string, title = 'One successor') =>
          fixture.request(path, {
            method: 'POST',
            companyId: c.companyId,
            subject: 'manager',
            key,
            body: { kind: 'EDIT', expectedVersion: 1, title },
          });
        let first: Promise<Response> | undefined,
          second: Promise<Response> | undefined;
        try {
          first = command('race-key');
          const pid = await blockedBy(barrier.pid);
          second = command(
            kind === 'different-key' ? 'other-key' : 'race-key',
            kind === 'changed-intent' ? 'Different intent' : 'One successor',
          );
          await blockedBy(pid);
          await barrier.release();
          const saved = await first;
          expect(saved.status).toBe(200);
          const result = await second;
          expect(result.status).toBe(kind === 'same-key' ? 200 : 409);
          if (kind === 'same-key')
            expect(await json(result)).toEqual(await json(saved));
        } finally {
          await barrier.release();
          await first?.catch(() => undefined);
          await second?.catch(() => undefined);
          await barrier.remove();
        }
        expect(
          await json(
            await fixture.request('/company-internal-tasks/' + c.id, {
              companyId: c.companyId,
              subject: 'manager',
            }),
          ),
        ).toMatchObject({
          task: { version: 2, title: 'One successor' },
          history: [{ version: 2 }, { version: 1 }],
        });
      },
    );
    for (const ordering of ['command-first', 'withdrawal-first'])
      for (const subject of [
        'capture',
        'Company',
        'membership',
        'User',
        'changed-assignee',
      ])
        it(`${ordering} serializes ${subject} eligibility without an unauthorized commit`, async () => {
          const c = await prepare(),
            actor = { companyId: c.companyId, subject: 'manager' };
          let memberId = c.membershipId,
            assignmentId = c.assignmentId;
          if (subject === 'changed-assignee') {
            const candidate = await json(
              await fixture.request('/access/current-actor', {
                subject: 'colleague',
              }),
            );
            memberId = string(candidate.workspaceMembershipId);
            await fixture.created('/company-context-assignments', {
              companyId: c.companyId,
              workspaceMembershipId: memberId,
            });
            assignmentId = string(
              (
                await fixture.created(
                  '/company-internal-task-manager-assignments',
                  { companyId: c.companyId, workspaceMembershipId: memberId },
                )
              ).id,
            );
          }
          const table =
            subject === 'Company'
              ? 'companies'
              : subject === 'membership'
                ? 'workspace_memberships'
                : subject === 'User'
                  ? 'internal_users'
                  : 'company_role_assignments';
          const target =
            subject === 'Company'
              ? c.companyId
              : subject === 'membership'
                ? c.membershipId
                : subject === 'User'
                  ? string(c.actor.internalUserId)
                  : assignmentId;
          const mutation = () =>
            fixture.pool.query(
              `UPDATE ${table} SET ${table === 'company_role_assignments' ? 'revoked_at=now()' : "status='inactive'"} WHERE id=$1`,
              [target],
            );
          const barrier =
            ordering === 'command-first'
              ? await gate('internal_company_task_history', 'INSERT')
              : await gate(table, 'UPDATE', `NEW.id='${target}'::uuid`);
          const command = () =>
            fixture.request('/company-internal-tasks/' + c.id + '/changes', {
              ...actor,
              method: 'POST',
              body:
                subject === 'changed-assignee'
                  ? {
                      kind: 'EDIT',
                      expectedVersion: 1,
                      assigneeMembershipId: memberId,
                    }
                  : {
                      kind: 'EDIT',
                      expectedVersion: 1,
                      title: 'Authorized successor',
                    },
            });
          let pending: Promise<Response> | undefined,
            withdrawal: ReturnType<typeof mutation> | undefined;
          try {
            if (ordering === 'command-first') {
              pending = command();
              const pid = await blockedBy(barrier.pid);
              withdrawal = mutation();
              await blockedBy(pid);
              await barrier.release();
              expect((await pending).status).toBe(200);
              await withdrawal;
            } else {
              withdrawal = mutation();
              const pid = await blockedBy(barrier.pid);
              pending = command();
              await blockedBy(pid);
              await barrier.release();
              await withdrawal;
              expect((await pending).status).toBe(
                subject === 'changed-assignee' ? 400 : 403,
              );
            }
          } finally {
            await barrier.release();
            await pending?.catch(() => undefined);
            await withdrawal?.catch(() => undefined);
            await barrier.remove();
          }
          expect(
            (
              await fixture.pool.query(
                'SELECT version FROM internal_company_tasks WHERE id=$1',
                [c.id],
              )
            ).rows,
          ).toEqual([{ version: ordering === 'command-first' ? 2 : 1 }]);
          expect(
            (
              await fixture.pool.query(
                'SELECT count(*)::integer AS n FROM internal_company_task_history WHERE task_id=$1',
                [c.id],
              )
            ).rows,
          ).toEqual([{ n: ordering === 'command-first' ? 2 : 1 }]);
        });
    it('retires a captured actor while its key is held through revoke and explicit identical-permission regrant', async () => {
      const c = await prepare(),
        key = 'held-regrant',
        db = await fixture.pool.connect();
      await db.query('BEGIN');
      const parts = JSON.stringify([
        'company-internal-task',
        workspaceId,
        c.membershipId,
        key,
      ]);
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        parts,
      ]);
      const pid = (
        await db.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      ).rows[0]?.pid;
      if (!pid) throw new Error('Missing barrier.');
      const options = {
          method: 'POST',
          companyId: c.companyId,
          subject: 'manager',
          key,
          body: {
            kind: 'EDIT',
            expectedVersion: 1,
            title: 'Fresh authority only',
          },
        },
        pending = fixture.request(
          '/company-internal-tasks/' + c.id + '/changes',
          options,
        );
      try {
        await blockedBy(pid);
        expect(
          (
            await fixture.request(
              `/company-internal-task-manager-assignments/${c.membershipId}/${c.companyId}`,
              { method: 'DELETE' },
            )
          ).status,
        ).toBe(200);
        const fresh = await fixture.created(
          '/company-internal-task-manager-assignments',
          { companyId: c.companyId, workspaceMembershipId: c.membershipId },
        );
        expect(fresh.id).not.toBe(c.assignmentId);
        await db.query('COMMIT');
        expect((await pending).status).toBe(403);
        expect(
          (
            await fixture.request(
              '/company-internal-tasks/' + c.id + '/changes',
              options,
            )
          ).status,
        ).toBe(200);
      } finally {
        await db.query('ROLLBACK');
        db.release();
        await pending.catch(() => undefined);
      }
    });
    it('reads current and its history from one repeatable snapshot while a material command commits between reads', async () => {
      const c = await prepare(),
        original = InternalTaskStore.prototype.current;
      let resume: () => void = () => undefined,
        started: () => void = () => undefined;
      const pause = new Promise<void>((resolve) => {
          resume = resolve;
        }),
        ready = new Promise<void>((resolve) => {
          started = resolve;
        });
      const schedule = vi
        .spyOn(InternalTaskStore.prototype, 'current')
        .mockImplementation(async function (this: InternalTaskStore, ...args) {
          const current = await original.apply(this, args);
          if (args[1] === c.id && !args[2]) {
            started();
            await pause;
          }
          return current;
        });
      const reading = fixture.request('/company-internal-tasks/' + c.id, {
        companyId: c.companyId,
        subject: 'manager',
      });
      try {
        await ready;
        const changed = await fixture.request(
          '/company-internal-tasks/' + c.id + '/changes',
          {
            method: 'POST',
            companyId: c.companyId,
            subject: 'manager',
            body: {
              kind: 'EDIT',
              expectedVersion: 1,
              title: 'Committed after reader snapshot',
            },
          },
        );
        expect(changed.status).toBe(200);
        resume();
        expect(await json(await reading)).toMatchObject({
          task: object(c.first.task),
          history: [c.first.history],
        });
      } finally {
        resume();
        schedule.mockRestore();
        await reading.catch(() => undefined);
      }
      expect(
        await json(
          await fixture.request('/company-internal-tasks/' + c.id, {
            companyId: c.companyId,
            subject: 'manager',
          }),
        ),
      ).toMatchObject({
        task: { version: 2, title: 'Committed after reader snapshot' },
        history: [{ version: 2 }, { version: 1 }],
      });
    });
  },
);
