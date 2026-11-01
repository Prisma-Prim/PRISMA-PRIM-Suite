import { setTimeout } from 'node:timers/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  openFollowUpFixture,
  json,
  object,
  text,
} from './opportunity-follow-up.test-support.js';
const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)(
  'follow-up native serialized mutation and observation',
  () => {
    let f: Awaited<ReturnType<typeof openFollowUpFixture>>;
    beforeAll(async () => {
      if (!databaseUrl) throw new Error('PostgreSQL is required.');
      f = await openFollowUpFixture(databaseUrl);
    }, 120000);
    beforeEach(async () => {
      await f.setup();
    });
    afterAll(async () => {
      await f?.close();
    });
    async function blockedBy(pid: number) {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const result = await f.pool.query<{ pid: number }>(
          'SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND $1=ANY(pg_blocking_pids(pid)) LIMIT 1',
          [pid],
        );
        const waiter = result.rows[0]?.pid;
        if (waiter) return waiter;
        await setTimeout(10);
      }
      throw new Error(
        'Native command did not reach the held PostgreSQL barrier.',
      );
    }
    async function gate(
      table:
        | 'opportunity_follow_up_history'
        | 'opportunities'
        | 'company_role_assignments',
      operation: 'INSERT' | 'UPDATE',
      condition = 'true',
    ) {
      // Identifiers/conditions are fixed test literals, never input to a product API.
      await f.pool.query(
        'CREATE FUNCTION ofup_test_gate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF ' +
          condition +
          ' THEN PERFORM pg_advisory_xact_lock(1041024); END IF; RETURN NEW; END $$',
      );
      await f.pool.query(
        'CREATE TRIGGER ofup_test_gate BEFORE ' +
          operation +
          ' ON ' +
          table +
          ' FOR EACH ROW EXECUTE FUNCTION ofup_test_gate()',
      );
      const connection = await f.pool.connect();
      await connection.query('BEGIN');
      const pid = (
        await connection.query<{ pid: number }>(
          'SELECT pg_backend_pid() AS pid',
        )
      ).rows[0]?.pid;
      if (!pid) throw new Error();
      await connection.query('SELECT pg_advisory_xact_lock(1041024)');
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
        remove: () => f.pool.query('DROP FUNCTION ofup_test_gate() CASCADE'),
      };
    }
    async function rowGate(requestId: string) {
      const connection = await f.pool.connect();
      await connection.query('BEGIN');
      const pid = (
        await connection.query<{ pid: number }>(
          'SELECT pg_backend_pid() AS pid',
        )
      ).rows[0]?.pid;
      if (!pid) throw new Error();
      await connection.query(
        'SELECT id FROM client_requests WHERE id=$1 FOR UPDATE',
        [requestId],
      );
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
        remove: async () => undefined,
      };
    }
    async function race(
      barrier: {
        pid: number;
        release: () => Promise<void>;
        remove: () => Promise<unknown>;
      },
      first: () => Promise<Response>,
      second: () => Promise<Response>,
    ) {
      let a: Promise<Response> | undefined, b: Promise<Response> | undefined;
      try {
        a = first();
        const firstPid = await blockedBy(barrier.pid);
        b = second();
        await blockedBy(firstPid);
        await barrier.release();
        return [await a, await b] as const;
      } finally {
        await barrier.release();
        await a?.catch(() => undefined);
        await b?.catch(() => undefined);
        await barrier.remove();
      }
    }
    it.each(['same-key', 'different-key', 'changed-intent'] as const)(
      'converges %s writes at one own revision without duplicate effects',
      async (kind) => {
        const c = await f.createCase(),
          barrier = await gate('opportunity_follow_up_history', 'INSERT');
        const command = (key: string, date = '2026-11-15') =>
          f.request(c.path, {
            method: 'POST',
            key,
            body: {
              expectedRevision: 0,
              observedOpportunityVersion: 1,
              followUpOn: date,
              reason: null,
            },
          });
        const result = await race(
          barrier,
          () => command('race'),
          () =>
            command(
              kind === 'different-key' ? 'other' : 'race',
              kind === 'changed-intent' ? '2026-11-18' : '2026-11-15',
            ),
        );
        expect(result.map((response) => response.status)).toEqual([
          200,
          kind === 'same-key' ? 200 : 409,
        ]);
        if (kind === 'same-key')
          expect(await json(result[1])).toEqual(await json(result[0]));
        const current = await json(await f.request(c.path));
        expect(object(current.head).revision).toBe(1);
        expect(object(current.history).entries).toHaveLength(1);
        expect(
          (
            await f.pool.query(
              'SELECT count(*)::int AS count FROM opportunity_follow_up_commands',
            )
          ).rows,
        ).toEqual([{ count: 1 }]);
      },
    );
    it.each(['date-first', 'native-first'] as const)(
      'serializes Hold and preserves past confirmation: %s',
      async (order) => {
        const c = await f.createCase(),
          date = () =>
            f.request(c.path, {
              method: 'POST',
              key: 'before-hold',
              body: {
                expectedRevision: 0,
                observedOpportunityVersion: 1,
                followUpOn: '2026-11-15',
                reason: null,
              },
            }),
          hold = () =>
            f.request(
              '/commercial-intake/opportunities/' +
                c.opportunityId +
                '/outcome',
              {
                method: 'POST',
                body: {
                  expectedVersion: 1,
                  status: 'ON_HOLD',
                  reason: 'Native pause',
                },
              },
            );
        const dateFirst = order === 'date-first',
          barrier = dateFirst
            ? await gate('opportunity_follow_up_history', 'INSERT')
            : await gate('opportunities', 'UPDATE', "NEW.status='ON_HOLD'");
        const responses = await race(
          barrier,
          dateFirst ? date : hold,
          dateFirst ? hold : date,
        );
        expect(responses.map((response) => response.status)).toEqual([
          200,
          dateFirst ? 200 : 409,
        ]);
        expect((await date()).status).toBe(dateFirst ? 200 : 409);
        const current = await json(await f.request(c.path));
        expect(current.status).toBe('ON_HOLD');
        expect(object(current.head).revision).toBe(dateFirst ? 1 : 0);
        expect(
          (
            await json(
              await f.request(
                '/commercial-intake/opportunity-follow-ups?through=2026-11-15',
              ),
            )
          ).items,
        ).toEqual([]);
      },
    );
    it.each(
      (['next-action', 'responsible', 'stage'] as const).flatMap((operation) =>
        (['date-first', 'native-first'] as const).map((order) => ({
          operation,
          order,
        })),
      ),
    )(
      'serializes $operation in $order without changing the independent marker',
      async ({ operation, order }) => {
        const c = await f.createCase();
        let input: Record<string, unknown>;
        if (operation === 'next-action')
          input = { nextAction: 'Native replacement text' };
        else if (operation === 'stage') {
          const stage = await f.request('/sales-stages', {
            method: 'POST',
            body: { expectedRevision: 0, label: 'Fictional stage' },
          });
          expect(stage.status).toBe(201);
          input = {
            salesStageId: text(
              object((await json(stage)).receipt).salesStageId,
            ),
          };
        } else {
          const member = await json(
              await f.request('/access/current-actor', {
                subject: 'reader',
                companyId: '',
              }),
            ),
            membershipId = text(member.workspaceMembershipId);
          for (const bundle of ['context', 'commercial-intake'])
            await f.grant(bundle, membershipId);
          input = { workspaceMembershipId: membershipId };
        }
        const date = () =>
            f.request(c.path, {
              method: 'POST',
              key: 'independent',
              body: {
                expectedRevision: 0,
                observedOpportunityVersion: 1,
                followUpOn: '2026-11-15',
                reason: null,
              },
            }),
          native = () =>
            f.request(
              '/commercial-intake/opportunities/' +
                c.opportunityId +
                '/' +
                operation,
              { method: 'POST', body: { expectedVersion: 1, ...input } },
            ),
          dateFirst = order === 'date-first';
        const barrier = dateFirst
          ? await gate('opportunity_follow_up_history', 'INSERT')
          : await gate('opportunities', 'UPDATE');
        const responses = await race(
          barrier,
          dateFirst ? date : native,
          dateFirst ? native : date,
        );
        expect(responses.map((response) => response.status)).toEqual([
          200,
          dateFirst ? 200 : 409,
        ]);
        const current = await json(await f.request(c.path));
        expect(current.opportunityVersion).toBe(2);
        expect(object(current.head).revision).toBe(dateFirst ? 1 : 0);
        if (dateFirst) expect((await date()).status).toBe(200);
      },
    );
    it.each(
      (
        [
          'context',
          'commercial-intake',
          'opportunity-follow-up-coordinator',
        ] as const
      ).flatMap((bundle) =>
        (['date-first', 'revoke-first'] as const).map((order) => ({
          bundle,
          order,
        })),
      ),
    )(
      'serializes consumed $bundle revocation in $order',
      async ({ bundle, order }) => {
        const c = await f.createCase(),
          actor = await json(await f.request('/access/current-actor')),
          company = object(actor.activeCompany),
          membershipId = text(actor.workspaceMembershipId),
          companyId = text(company.id);
        const revoke = () =>
            f.request(
              '/company-' +
                bundle +
                '-assignments/' +
                membershipId +
                '/' +
                companyId,
              { method: 'DELETE', subject: 'owner' },
            ),
          date = () =>
            f.request(c.path, {
              method: 'POST',
              key: 'revocation',
              body: {
                expectedRevision: 0,
                observedOpportunityVersion: 1,
                followUpOn: '2026-11-15',
                reason: null,
              },
            }),
          dateFirst = order === 'date-first';
        const role =
          bundle === 'context'
            ? 'company_context_access'
            : bundle === 'commercial-intake'
              ? 'company_commercial_intake'
              : 'company_opportunity_follow_up_coordinator';
        const barrier = dateFirst
          ? await gate('opportunity_follow_up_history', 'INSERT')
          : await gate(
              'company_role_assignments',
              'UPDATE',
              "NEW.bundle::text='" + role + "' AND NEW.revoked_at IS NOT NULL",
            );
        const responses = await race(
          barrier,
          dateFirst ? date : revoke,
          dateFirst ? revoke : date,
        );
        expect(responses.map((response) => response.status)).toEqual([
          200,
          dateFirst ? 200 : 403,
        ]);
        expect((await date()).status).toBe(403);
        expect(
          (
            await f.pool.query(
              'SELECT count(*)::int AS count FROM opportunity_follow_up_history',
            )
          ).rows,
        ).toEqual([{ count: dateFirst ? 1 : 0 }]);
      },
    );
    it.each(
      (['current', 'discovery'] as const).flatMap((read) =>
        (['read-first', 'outcome-first'] as const).map((order) => ({
          read,
          order,
        })),
      ),
    )(
      'observes native $read in $order after a real waited Request lock',
      async ({ read, order }) => {
        const c = await f.createCase();
        expect(
          (
            await f.request(c.path, {
              method: 'POST',
              body: {
                expectedRevision: 0,
                observedOpportunityVersion: 1,
                followUpOn: '2026-11-15',
                reason: null,
              },
            })
          ).status,
        ).toBe(200);
        const readCurrent = () =>
            f.request(
              read === 'current'
                ? c.path
                : '/commercial-intake/opportunity-follow-ups?through=2026-11-15',
            ),
          outcome = () =>
            f.request(
              '/commercial-intake/opportunities/' +
                c.opportunityId +
                '/outcome',
              {
                method: 'POST',
                body: {
                  expectedVersion: 1,
                  status: 'ON_HOLD',
                  reason: 'Native pause',
                },
              },
            ),
          readFirst = order === 'read-first';
        const responses = await race(
          await rowGate(c.requestId),
          readFirst ? readCurrent : outcome,
          readFirst ? outcome : readCurrent,
        );
        expect(responses.map((response) => response.status)).toEqual([
          200, 200,
        ]);
        const observed = await json(responses[readFirst ? 0 : 1]);
        if (read === 'current')
          expect(observed.status).toBe(readFirst ? 'OPEN' : 'ON_HOLD');
        else expect(observed.items).toHaveLength(readFirst ? 1 : 0);
        expect(
          (
            await json(
              await f.request(
                '/commercial-intake/opportunity-follow-ups?through=2026-11-15',
              ),
            )
          ).items,
        ).toEqual([]);
      },
    );
  },
);
