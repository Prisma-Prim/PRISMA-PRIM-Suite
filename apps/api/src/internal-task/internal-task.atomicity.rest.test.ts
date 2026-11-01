import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { InternalTaskStore } from './internal-task.store.js';
import {
  json,
  object,
  openInternalTaskFixture,
  type InternalTaskFixture,
} from './internal-task.test-support.js';
import { successor } from './internal-task.service.js';
const databaseUrl = process.env.TEST_DATABASE_URL;
(databaseUrl ? describe : describe.skip)(
  'Internal Company Task atomic exact outcomes',
  () => {
    let fixture: InternalTaskFixture;
    beforeAll(async () => {
      if (!databaseUrl) throw new Error('PostgreSQL required.');
      fixture = await openInternalTaskFixture(databaseUrl);
    });
    afterAll(async () => {
      await fixture?.close();
    });
    async function counts() {
      return (
        await fixture.pool.query(
          'SELECT (SELECT count(*) FROM internal_company_tasks)::integer AS tasks,(SELECT count(*) FROM internal_company_task_history)::integer AS history,(SELECT count(*) FROM internal_company_task_commands)::integer AS commands,(SELECT count(*) FROM internal_company_task_events)::integer AS events',
        )
      ).rows;
    }
    it.each([
      'internal_company_tasks',
      'internal_company_task_history',
      'internal_company_task_commands',
      'internal_company_task_events',
    ])(
      'rolls back the complete unit when %s fails, retaining the same fresh key for retry',
      async (table) => {
        const c = await fixture.setup(),
          options = {
            method: 'POST',
            companyId: c.companyId,
            subject: 'manager',
            key: 'atomic-key',
            body: { title: 'Confidential atomic work' },
          };
        await fixture.pool.query(
          "CREATE FUNCTION ict_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic transaction fault'; END $$",
        );
        await fixture.pool.query(
          `CREATE TRIGGER ict_test_failure BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION ict_test_failure()`,
        );
        try {
          const response = await fixture.request(
            '/company-internal-tasks',
            options,
          );
          expect(response.status).toBe(503);
          expect(await response.text()).not.toContain('Confidential');
        } finally {
          await fixture.pool.query('DROP FUNCTION ict_test_failure() CASCADE');
        }
        expect(await counts()).toEqual([
          { tasks: 0, history: 0, commands: 0, events: 0 },
        ]);
        expect(
          (await fixture.request('/company-internal-tasks', options)).status,
        ).toBe(201);
        expect(await counts()).toEqual([
          { tasks: 1, history: 1, commands: 1, events: 1 },
        ]);
      },
    );
    it('rolls back already-written current/history/event when response publication fails', async () => {
      const c = await fixture.setup(),
        fault = vi
          .spyOn(InternalTaskStore.prototype, 'response')
          .mockImplementationOnce(() => {
            throw new Error('Synthetic response failure');
          });
      try {
        expect(
          (
            await fixture.request('/company-internal-tasks', {
              method: 'POST',
              companyId: c.companyId,
              subject: 'manager',
              body: { title: 'Atomic response' },
            })
          ).status,
        ).toBe(503);
      } finally {
        fault.mockRestore();
      }
      expect(await counts()).toEqual([
        { tasks: 0, history: 0, commands: 0, events: 0 },
      ]);
    });
    it.each([
      'unsupported-intent',
      'malformed-intent',
      'unsupported-response',
      'malformed-response',
    ])(
      'fails explicitly unavailable for %s at the public persisted collaborator seam without disabling native guards',
      async (kind) => {
        const c = await fixture.setup(),
          options = {
            method: 'POST',
            companyId: c.companyId,
            subject: 'manager',
            key: 'exact-saved',
            body: { title: 'Saved response' },
          },
          created = await json(
            await fixture.request('/company-internal-tasks', options),
          );
        const original = InternalTaskStore.prototype.command,
          fault = vi
            .spyOn(InternalTaskStore.prototype, 'command')
            .mockImplementationOnce(async function (
              this: InternalTaskStore,
              ...args
            ) {
              const row = await original.apply(this, args);
              if (!row) throw new Error('Missing exact synthetic command.');
              return {
                ...row,
                ...(kind === 'unsupported-intent'
                  ? { intent: { format: 'future-intent-v2' } }
                  : kind === 'malformed-intent'
                    ? { intent: { ...object(row.intent), extra: true } }
                    : kind === 'unsupported-response'
                      ? { response: { format: 'future-receipt-v2' } }
                      : { response: { ...object(row.response), extra: true } }),
              };
            });
        try {
          const response = await fixture.request(
            '/company-internal-tasks',
            options,
          );
          expect(response.status).toBe(503);
          expect(await response.json()).toMatchObject({
            code: kind.startsWith('unsupported')
              ? 'INTERNAL_TASK_UNSUPPORTED'
              : 'INTERNAL_TASK_UNAVAILABLE',
          });
        } finally {
          fault.mockRestore();
        }
        expect(
          await json(await fixture.request('/company-internal-tasks', options)),
        ).toEqual(created);
        expect(await counts()).toEqual([
          { tasks: 1, history: 1, commands: 1, events: 1 },
        ]);
      },
    );
    it.each(['creation-state', 'creation-time', 'command-attribution'])(
      'rejects malformed known-format saved %s through the actual replay boundary',
      async (kind) => {
        const c = await fixture.setup(),
          options = {
            method: 'POST',
            companyId: c.companyId,
            subject: 'manager',
            key: 'known-format-capture',
            body: { title: 'Exact saved declaration' },
          };
        const created = await json(
          await fixture.request('/company-internal-tasks', options),
        );
        const original = InternalTaskStore.prototype.command;
        const fault = vi
          .spyOn(InternalTaskStore.prototype, 'command')
          .mockImplementationOnce(async function (
            this: InternalTaskStore,
            ...args
          ) {
            const row = await original.apply(this, args);
            if (!row) throw new Error('Missing synthetic saved capture.');
            const response = object(row.response),
              task = object(response.task),
              history = object(response.history),
              other = '00000000-0000-4000-8000-000000000002';
            const invalid = {
              ...task,
              ...(kind === 'creation-state'
                ? {
                    status: 'done',
                    completion: {
                      actorMembershipId: task.createdByMembershipId,
                      recordedAt: task.updatedAt,
                    },
                  }
                : kind === 'creation-time'
                  ? { createdAt: '2026-10-31T11:00:00.000Z' }
                  : { createdByMembershipId: other }),
            };
            return {
              ...row,
              response: {
                ...response,
                task: invalid,
                history: {
                  ...history,
                  after: invalid,
                  ...(kind === 'command-attribution'
                    ? { actorMembershipId: other }
                    : {}),
                },
              },
            };
          });
        try {
          const response = await fixture.request(
            '/company-internal-tasks',
            options,
          );
          expect(response.status).toBe(503);
          expect(await response.json()).toMatchObject({
            code: 'INTERNAL_TASK_UNAVAILABLE',
          });
        } finally {
          fault.mockRestore();
        }
        expect(
          await json(await fixture.request('/company-internal-tasks', options)),
        ).toEqual(created);
        expect(await counts()).toEqual([
          { tasks: 1, history: 1, commands: 1, events: 1 },
        ]);
      },
    );
    it('proves the real signed integer limit through the native result contract without inventing a two-billion-fact history', async () => {
      const c = await fixture.setup(),
        created = await json(
          await fixture.request('/company-internal-tasks', {
            method: 'POST',
            companyId: c.companyId,
            subject: 'manager',
            body: { title: 'Boundary' },
          }),
        ),
        maximum = { ...object(created.task), version: 2147483647 };
      const noOp = {
          kind: 'EDIT',
          expectedVersion: 2147483647,
          title: 'Boundary',
        },
        material = { ...noOp, title: 'Material correction' };
      const result = await fixture.pool.query(
        'SELECT ict_snapshot_valid($1::jsonb) AS valid,ict_expected_after($1::jsonb,$1::jsonb,$2::jsonb,false,false,$4::uuid,$5::timestamptz) AS noop,ict_expected_after($1::jsonb,$1::jsonb,$3::jsonb,false,true,$4::uuid,$5::timestamptz) AS material',
        [
          JSON.stringify(maximum),
          JSON.stringify(noOp),
          JSON.stringify(material),
          c.membershipId,
          object(created.task).updatedAt,
        ],
      );
      expect(result.rows).toEqual([
        { valid: true, noop: maximum, material: null },
      ]);
      expect(() => successor(2147483647)).toThrow('exhausted');
      expect(successor(2147483646)).toBe(2147483647);
    });
  },
);
