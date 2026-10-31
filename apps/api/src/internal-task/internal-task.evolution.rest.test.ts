import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { memberDisplayLabel } from '../access/member-authority.js';
import {
  json,
  object,
  openInternalTaskFixture,
  type InternalTaskFixture,
  workspaceId,
} from './internal-task.test-support.js';
const databaseUrl = process.env.TEST_DATABASE_URL;
(databaseUrl ? describe : describe.skip)(
  'Internal Task native result contract',
  () => {
    let fixture: InternalTaskFixture;
    beforeAll(async () => {
      if (!databaseUrl) throw new Error('PostgreSQL required.');
      fixture = await openInternalTaskFixture(databaseUrl);
    });
    afterAll(async () => {
      await fixture?.close();
    });
    it('proves exact div quotient and remainder at zero and large base36 boundaries where ordinary numeric division rounds', async () => {
      const boundary = (1n << 120n) * 36n;
      let rounded = 0;
      for (const value of [
        0n,
        1n,
        35n,
        36n,
        37n,
        boundary - 1n,
        boundary,
        boundary + 1n,
        boundary + 35n,
      ]) {
        const result = await fixture.pool.query<{
          quotient: string;
          remainder: string;
          rounded: string;
        }>(
          'SELECT div($1::numeric,36)::text AS quotient,mod($1::numeric,36)::text AS remainder,trunc($1::numeric/36)::text AS rounded',
          [value.toString()],
        );
        const row = result.rows[0];
        expect(row?.quotient).toBe((value / 36n).toString());
        expect(row?.remainder).toBe((value % 36n).toString());
        if (row?.rounded !== row?.quotient) rounded++;
      }
      expect(rounded).toBeGreaterThan(0);
    });
    it('matches Access base36 member references exactly through the read-only native helper', async () => {
      for (const id of [
        '00000000-0000-4000-8000-000000001006',
        '80000000-0000-4000-8000-000000001006',
        'ffffffff-ffff-4fff-8fff-ffffffffffff',
      ]) {
        const expected = memberDisplayLabel('DEMO', id).split(' · ')[1];
        const result = await fixture.pool.query(
          'SELECT ict_member_reference($1::uuid) AS reference',
          [id],
        );
        expect(result.rows, id).toEqual([{ reference: expected }]);
      }
    });
    it('reconstructs a legal ordinary EDIT through read-only native validators without changing committed facts', async () => {
      const c = await fixture.setup(),
        response = await fixture.request('/company-internal-tasks', {
          method: 'POST',
          companyId: c.companyId,
          subject: 'manager',
          body: { title: 'Original' },
        });
      expect(response.status).toBe(201);
      const created = await json(response),
        before = object(created.task),
        after = { ...before, version: 2, title: 'Explicit correction' },
        body = {
          kind: 'EDIT',
          expectedVersion: 1,
          title: 'Explicit correction',
        };
      const fact = {
        format: 'company-internal-task-history-v1',
        workspaceId,
        companyId: c.companyId,
        taskId: before.id,
        version: 2,
        kind: 'EDIT',
        actorMembershipId: c.membershipId,
        recordedAt: before.updatedAt,
        before,
        after,
      };
      const result = await fixture.pool.query(
        'SELECT ict_history_valid($1::jsonb) AS history,ict_input_valid($2::jsonb,false) AS input,ict_expected_after($3::jsonb,$4::jsonb,$2::jsonb,false,true,$5::uuid,$6::timestamptz) AS result',
        [
          JSON.stringify(fact),
          JSON.stringify(body),
          JSON.stringify(before),
          JSON.stringify(after),
          c.membershipId,
          before.updatedAt,
        ],
      );
      expect(result.rows).toEqual([
        { history: true, input: true, result: after },
      ]);
      expect(
        await json(
          await fixture.request('/company-internal-tasks/' + before.id, {
            companyId: c.companyId,
            subject: 'manager',
          }),
        ),
      ).toMatchObject({ task: before, history: [created.history] });
    });
  },
);
