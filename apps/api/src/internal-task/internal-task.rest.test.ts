import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  commandAttempt,
  tableRows,
} from '../command/command-writes.test-support.js';
import { versionedCommandProtocolScenarios } from '../command/versioned-command-protocol.js';
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
  'Standalone Internal Company Task REST',
  () => {
    let fixture: InternalTaskFixture;
    beforeAll(async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
      fixture = await openInternalTaskFixture(databaseUrl);
    });
    afterAll(async () => {
      await fixture?.close();
    });

    it('persists literal Company-only work with exact attributable creation history and no Project or Client', async () => {
      const c = await fixture.setup();
      expect(c.actor.workspacePermissions).toEqual([]);
      const company = object(c.actor.activeCompany);
      expect(company.internalTaskPermissions).toEqual([
        'internal_task.read',
        'internal_task.manage',
      ]);
      expect(company.projectPermissions).toBeUndefined();
      expect(company.taskPermissions).toBeUndefined();
      expect(company.clientPermissions).toEqual([]);
      const response = await fixture.request('/company-internal-tasks', {
        method: 'POST',
        companyId: c.companyId,
        subject: 'manager',
        key: 'first-literal-internal-work',
        body: {
          title: '  Prepare equipment inventory  ',
          description:
            '  Read <b>literal</b> instructions.\r\n  Keep  the original.  ',
          dueDate: '2028-02-29',
          priority: 'important',
        },
      });
      expect(response.status).toBe(201);
      const receipt = await json(response);
      expect(receipt).toMatchObject({
        format: 'company-internal-task-command-v1',
        changed: true,
        task: {
          format: 'company-internal-task-v1',
          workspaceId,
          companyId: c.companyId,
          version: 1,
          title: 'Prepare equipment inventory',
          description:
            'Read <b>literal</b> instructions.\r\n  Keep  the original.',
          assignee: null,
          dueDate: '2028-02-29',
          priority: 'important',
          status: 'todo',
          createdByMembershipId: c.membershipId,
          completion: null,
          reason: null,
        },
        history: {
          format: 'company-internal-task-history-v1',
          workspaceId,
          companyId: c.companyId,
          version: 1,
          kind: 'CREATE',
          actorMembershipId: c.membershipId,
          before: null,
        },
      });
      expect(object(receipt.history).after).toEqual(receipt.task);
      const task = object(receipt.task);
      const loaded = await json(
        await fixture.request('/company-internal-tasks/' + task.id, {
          companyId: c.companyId,
          subject: 'manager',
        }),
      );
      expect(loaded).toEqual({
        format: 'company-internal-task-detail-v1',
        task,
        history: [receipt.history],
        nextBeforeVersion: null,
      });
      expect(
        (
          await fixture.pool.query(
            'SELECT (SELECT count(*) FROM projects)::integer AS projects, (SELECT count(*) FROM client_accounts)::integer AS clients',
          )
        ).rows,
      ).toEqual([{ projects: 0, clients: 0 }]);
    });

    it('keeps private work out of public Task, Home and Activity reads and replays its exact receipt after two application restarts', async () => {
      const c = await fixture.setup(),
        actor = { companyId: c.companyId, subject: 'manager' };
      for (const bundle of ['director-client', 'project', 'task-manager'])
        await fixture.created('/company-' + bundle + '-assignments', {
          companyId: c.companyId,
          workspaceMembershipId: c.membershipId,
        });
      async function publicReads() {
        const reads: Record<string, string> = {};
        for (const path of [
          '/assigned-tasks',
          '/unassigned-tasks',
          '/team-tasks',
          '/blocked-tasks',
          '/due-soon-tasks',
          '/attention-tasks',
          '/overdue-tasks',
          '/operational-home',
          '/activity-log',
        ]) {
          const response = await fixture.request(path, actor);
          expect(response.status, path).toBe(200);
          reads[path] = await response.text();
        }
        return reads;
      }
      const before = await publicReads();
      const createBody = {
        title: 'Private Company-only inventory',
        description: 'Literal Ж\r\n  instructions',
        assigneeMembershipId: c.membershipId,
        dueDate: '2026-10-30',
        priority: 'critical',
      };
      const created = await fixture.request('/company-internal-tasks', {
        ...actor,
        method: 'POST',
        key: 'private-before-restart',
        body: createBody,
      });
      expect(created.status).toBe(201);
      const receipt = await json(created);
      const path = '/company-internal-tasks/' + string(object(receipt.task).id);
      const blocked = await fixture.request(path + '/changes', {
        ...actor,
        method: 'POST',
        body: {
          kind: 'MOVE',
          expectedVersion: 1,
          status: 'blocked',
          reason: 'Private blockage',
        },
      });
      expect(blocked.status).toBe(200);
      expect(await publicReads()).toEqual(before);
      const detail = await json(await fixture.request(path, actor));
      expect(object(detail.task)).toMatchObject({
        version: 2,
        status: 'blocked',
      });
      for (let restart = 0; restart < 2; restart++) {
        await fixture.restart();
        expect(await json(await fixture.request(path, actor))).toEqual(detail);
        const replayed = await fixture.request('/company-internal-tasks', {
          ...actor,
          method: 'POST',
          key: 'private-before-restart',
          body: createBody,
        });
        expect(replayed.status).toBe(201);
        expect(await json(replayed)).toEqual(receipt);
      }
    }, 30_000);
    describe('shared versioned command protocol: Internal Task change', () => {
      type Context = Awaited<ReturnType<InternalTaskFixture['setup']>>;
      // The kit hands back the target it arranged; this finds its Company.
      const contexts = new WeakMap<object, Context>();
      const writes = () =>
        tableRows(fixture.pool, [
          'internal_company_tasks',
          'internal_company_task_history',
          'internal_company_task_commands',
          'internal_company_task_events',
          'activity_log_events',
        ]);
      async function task(context: Context, title: string) {
        const created = await fixture.request('/company-internal-tasks', {
          method: 'POST',
          companyId: context.companyId,
          subject: 'manager',
          body: { title },
        });
        expect(created.status).toBe(201);
        const id = object(object(await json(created)).task).id;
        if (typeof id !== 'string') throw new Error('Expected a Task id.');
        return id;
      }
      const submit =
        (context: Context, id: string) =>
        ({ value, key }: { value: unknown; key: string }) =>
          commandAttempt(
            fixture.request(`/company-internal-tasks/${id}/changes`, {
              method: 'POST',
              companyId: context.companyId,
              subject: 'manager',
              key,
              body: value,
            }),
          );
      const edit = (expectedVersion: number, title: string) => ({
        kind: 'EDIT',
        expectedVersion,
        title,
      });
      for (const scenario of versionedCommandProtocolScenarios({
        acceptedStatus: 200,
        receipt: (value) => value,
        arrange: async () => {
          const context = await fixture.setup();
          const id = await task(context, 'Protocol work DEMO');
          const version = async () => {
            const current = object(
              (
                await json(
                  await fixture.request(`/company-internal-tasks/${id}`, {
                    companyId: context.companyId,
                    subject: 'manager',
                  }),
                )
              ).task,
            ).version;
            if (typeof current !== 'number')
              throw new Error('Expected a Task version.');
            return current;
          };
          const target = {
            payload: ({
              expectedVersion,
              variant,
            }: {
              readonly expectedVersion: number;
              readonly variant: 'first' | 'second';
            }) =>
              edit(
                expectedVersion,
                variant === 'first'
                  ? 'First protocol edit DEMO'
                  : 'Second protocol edit DEMO',
              ),
            submit: submit(context, id),
            version,
            writes,
            changeLater: async () => {
              const later = await submit(
                context,
                id,
              )({
                value: edit(await version(), 'Later protocol edit DEMO'),
                key: randomUUID(),
              });
              expect(later.status).toBe(200);
            },
            revokeAuthority: async () => {
              const revoked = await fixture.request(
                `/company-internal-task-manager-assignments/${context.membershipId}/${context.companyId}`,
                { method: 'DELETE' },
              );
              expect(revoked.status).toBe(200);
            },
          };
          contexts.set(target, context);
          return target;
        },
        arrangeElsewhere: async (target) => {
          const context = contexts.get(target);
          if (!context) throw new Error('Expected the arranged Company.');
          return {
            submit: submit(context, await task(context, 'Other work DEMO')),
            writes,
          };
        },
      }))
        it(scenario.name, scenario.run, 30_000);
    });
  },
);
