import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  openFollowUpFixture,
  json,
  object,
  text,
} from './opportunity-follow-up.test-support.js';
const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)(
  'manual follow-up authorized bounded discovery and immutable history',
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
    it('rejects supplied continuations in a Company with no recorded dates without creating state', async () => {
      const c = await f.createCase();
      for (const path of [
        c.path + '/history?cursor=foreign.cursor',
        '/commercial-intake/opportunity-follow-ups?through=2026-11-15&cursor=foreign.cursor',
      ])
        expect((await f.request(path)).status).toBe(400);
      expect(
        (
          await f.pool.query(
            'SELECT (SELECT count(*)::int FROM opportunity_follow_up_cursor_keys) AS keys,(SELECT count(*)::int FROM opportunity_follow_up_heads) AS heads',
          )
        ).rows,
      ).toEqual([{ keys: 0, heads: 0 }]);
    });
    it('selects exact eligible dates before 25-row bounds and binds continuation to actor/captures/boundary', async () => {
      const expected: Array<{
        opportunityId: string;
        requestId: string;
        date: string;
      }> = [];
      for (let i = 0; i < 28; i++) {
        const c = await f.createCase('Eligible literal case ' + i),
          date = i < 3 ? '2026-11-14' : '2026-11-15';
        expect(
          (
            await f.request(c.path, {
              method: 'POST',
              body: {
                expectedRevision: 0,
                observedOpportunityVersion: 1,
                followUpOn: date,
                reason: null,
              },
            })
          ).status,
        ).toBe(200);
        expected.push({
          opportunityId: c.opportunityId,
          requestId: c.requestId,
          date,
        });
      }
      const later = await f.createCase('Later than selected boundary');
      expect(
        (
          await f.request(later.path, {
            method: 'POST',
            body: {
              expectedRevision: 0,
              observedOpportunityVersion: 1,
              followUpOn: '2026-11-16',
              reason: null,
            },
          })
        ).status,
      ).toBe(200);
      const undated = await f.createCase('Explicitly undated');
      expect(
        (
          await f.request(undated.path, {
            method: 'POST',
            body: {
              expectedRevision: 0,
              observedOpportunityVersion: 1,
              followUpOn: null,
              reason: null,
            },
          })
        ).status,
      ).toBe(200);
      await f.createCase('No declaration');
      for (const resume of [false, true]) {
        const c = await f.createCase('No current confirmation ' + resume);
        expect(
          (
            await f.request(c.path, {
              method: 'POST',
              body: {
                expectedRevision: 0,
                observedOpportunityVersion: 1,
                followUpOn: '2026-11-13',
                reason: null,
              },
            })
          ).status,
        ).toBe(200);
        expect(
          (
            await f.request(
              '/commercial-intake/opportunities/' +
                c.opportunityId +
                '/outcome',
              {
                method: 'POST',
                body: {
                  expectedVersion: 1,
                  status: 'ON_HOLD',
                  reason: 'Pause',
                },
              },
            )
          ).status,
        ).toBe(200);
        if (resume)
          expect(
            (
              await f.request(
                '/commercial-intake/opportunities/' +
                  c.opportunityId +
                  '/outcome',
                {
                  method: 'POST',
                  body: { expectedVersion: 2, status: 'OPEN' },
                },
              )
            ).status,
          ).toBe(200);
      }
      expected.sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          a.opportunityId.localeCompare(b.opportunityId),
      );
      const firstResponse = await f.request(
        '/commercial-intake/opportunity-follow-ups?through=2026-11-15',
      );
      expect(firstResponse.status).toBe(200);
      const first = await json(firstResponse);
      expect(Object.keys(first).sort()).toEqual([
        'format',
        'items',
        'nextCursor',
        'through',
      ]);
      expect(first.items).toHaveLength(25);
      const cursor = text(first.nextCursor);
      const secondResponse = await f.request(
        '/commercial-intake/opportunity-follow-ups?through=2026-11-15&cursor=' +
          encodeURIComponent(cursor),
      );
      expect(secondResponse.status).toBe(200);
      const second = await json(secondResponse);
      expect(second.items).toHaveLength(3);
      expect(second.nextCursor).toBeNull();
      if (!Array.isArray(first.items) || !Array.isArray(second.items))
        throw new Error();
      const items = [...first.items, ...second.items].map(object);
      expect(
        items.map((row) => ({
          opportunityId: row.opportunityId,
          requestId: row.requestId,
          date: row.followUpOn,
        })),
      ).toEqual(expected);
      for (const row of items) {
        expect(row).not.toHaveProperty('reason');
        expect(row).not.toHaveProperty('total');
        expect(row).not.toHaveProperty('clientDossierId');
      }
      const exact = items[25];
      if (!exact) throw new Error();
      const native = await json(
        await f.request('/commercial-intake/requests/' + text(exact.requestId)),
      );
      expect(object(native.initialOpportunity).id).toBe(exact.opportunityId);
      expect(
        (
          await f.request(
            '/commercial-intake/opportunity-follow-ups?through=2026-11-16&cursor=' +
              encodeURIComponent(cursor),
          )
        ).status,
      ).toBe(400);
      expect(
        (
          await f.request(
            '/commercial-intake/opportunity-follow-ups?through=2026-11-15&cursor=' +
              encodeURIComponent('A' + cursor.slice(1)),
          )
        ).status,
      ).toBe(400);
      const actor = await json(await f.request('/access/current-actor'));
      const company = object(actor.activeCompany),
        membershipId = text(actor.workspaceMembershipId),
        companyId = text(company.id);
      expect(
        (
          await f.request(
            '/company-opportunity-follow-up-coordinator-assignments/' +
              membershipId +
              '/' +
              companyId,
            { method: 'DELETE', subject: 'owner' },
          )
        ).status,
      ).toBe(200);
      await f.grant('opportunity-follow-up-coordinator');
      expect(
        (
          await f.request(
            '/commercial-intake/opportunity-follow-ups?through=2026-11-15&cursor=' +
              encodeURIComponent(cursor),
          )
        ).status,
      ).toBe(400);
    }, 120000);
    it('conserves complete head-bound history across restart and rejects changed-head continuation', async () => {
      const c = await f.createCase();
      for (let revision = 0; revision < 28; revision++)
        expect(
          (
            await f.request(c.path, {
              method: 'POST',
              body: {
                expectedRevision: revision,
                observedOpportunityVersion: 1,
                followUpOn: revision % 2 === 0 ? '2026-11-15' : '2026-11-18',
                reason: revision === 0 ? null : 'Literal change ' + revision,
              },
            })
          ).status,
        ).toBe(200);
      const current = await json(await f.request(c.path)),
        first = object(current.history),
        cursor = text(first.nextCursor);
      expect(first.entries).toHaveLength(25);
      expect(first.headRevision).toBe(28);
      expect(first).not.toHaveProperty('total');
      await f.restart();
      const olderResponse = await f.request(
        c.path + '/history?cursor=' + encodeURIComponent(cursor),
      );
      expect(olderResponse.status).toBe(200);
      const older = await json(olderResponse);
      expect(older.entries).toHaveLength(3);
      expect(older.nextCursor).toBeNull();
      if (!Array.isArray(older.entries)) throw new Error();
      expect(older.entries.map((entry) => object(entry).revision)).toEqual([
        3, 2, 1,
      ]);
      expect(
        (
          await f.request(c.path, {
            method: 'POST',
            body: {
              expectedRevision: 28,
              observedOpportunityVersion: 1,
              followUpOn: null,
              reason: 'No date agreed',
            },
          })
        ).status,
      ).toBe(200);
      const changed = await f.request(
        c.path + '/history?cursor=' + encodeURIComponent(cursor),
      );
      expect(changed.status).toBe(409);
      const rejection = await json(changed);
      expect(rejection.code).toBe('FOLLOW_UP_HISTORY_CHANGED');
      expect(rejection).not.toHaveProperty('entries');
      const fresh = await json(await f.request(c.path));
      expect(object(fresh.history).headRevision).toBe(29);
      expect(
        (
          await f.request(
            c.path +
              '/history?cursor=' +
              encodeURIComponent(text(object(fresh.history).nextCursor)),
          )
        ).status,
      ).toBe(200);
    }, 120000);
    it('requires closed scalar boundary/current/history queries without clocks or writes', async () => {
      const c = await f.createCase();
      for (const query of [
        '',
        '?through=',
        '?through=2026-11-15&through=2026-11-16',
        '?through=2026-11-15&limit=25',
        '?through[]=2026-11-15',
        '?through=2026-11-15&cursor=',
        '?through=2026-11-15&cursor=' + 'x'.repeat(2049),
      ])
        expect(
          (await f.request('/commercial-intake/opportunity-follow-ups' + query))
            .status,
        ).toBe(400);
      expect((await f.request(c.path + '?cursor=x')).status).toBe(400);
      expect(
        (await f.request(c.path + '/history?cursor=x&cursor=y')).status,
      ).toBe(400);
      expect((await json(await f.request(c.path))).head).toEqual({
        state: 'UNRECORDED',
        revision: 0,
      });
      const rows = await f.pool.query(
        'SELECT count(*)::int AS count FROM opportunity_follow_up_commands',
      );
      expect(rows.rows).toEqual([{ count: 0 }]);
    });
  },
);
