import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  json,
  object,
  openInternalTaskFixture,
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
  },
);
