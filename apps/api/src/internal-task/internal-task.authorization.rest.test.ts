import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  json,
  object,
  openInternalTaskFixture,
  string,
  type InternalTaskFixture,
} from './internal-task.test-support.js';
const databaseUrl = process.env.TEST_DATABASE_URL;
(databaseUrl ? describe : describe.skip)(
  'Internal Company Task independent authority',
  () => {
    let fixture: InternalTaskFixture;
    beforeAll(async () => {
      if (!databaseUrl) throw new Error('PostgreSQL required.');
      fixture = await openInternalTaskFixture(databaseUrl);
    });
    afterAll(async () => {
      await fixture?.close();
    });
    it('grants no implicit title, administrator, creator, assignee, old Task or Company context authority', async () => {
      const c = await fixture.setup(),
        actor = { companyId: c.companyId, subject: 'manager' };
      expect(
        (
          await fixture.request('/company-internal-tasks', {
            companyId: c.companyId,
            anonymous: true,
          })
        ).status,
      ).toBe(401);
      expect(
        (
          await fixture.request('/company-internal-tasks', {
            companyId: c.companyId,
            subject: 'uninvited',
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await fixture.request('/company-internal-task-manager-assignments', {
            method: 'POST',
            body: {
              companyId: c.companyId,
              workspaceMembershipId: c.membershipId,
              extra: true,
            },
          })
        ).status,
      ).toBe(400);
      const created = await json(
          await fixture.request('/company-internal-tasks', {
            ...actor,
            method: 'POST',
            key: 'created-by-manager',
            body: {
              title: 'Private internal work',
              assigneeMembershipId: c.membershipId,
            },
          }),
        ),
        id = string(object(created.task).id);
      expect(
        (
          await fixture.request('/company-internal-tasks', {
            companyId: c.companyId,
          })
        ).status,
      ).toBe(403);
      const outsider = await json(
        await fixture.request('/access/current-actor', { subject: 'outsider' }),
      );
      await fixture.created('/company-internal-task-manager-assignments', {
        companyId: c.companyId,
        workspaceMembershipId: outsider.workspaceMembershipId,
      });
      expect(
        (
          await fixture.request('/access/current-actor', {
            companyId: c.companyId,
            subject: 'outsider',
          })
        ).status,
      ).toBe(403);
      const revoked = await fixture.request(
        `/company-internal-task-manager-assignments/${c.membershipId}/${c.companyId}`,
        { method: 'DELETE' },
      );
      expect(revoked.status).toBe(200);
      for (const bundle of ['task-manager', 'director-client', 'project'])
        await fixture.created('/company-' + bundle + '-assignments', {
          companyId: c.companyId,
          workspaceMembershipId: c.membershipId,
        });
      for (const path of [
        '/company-internal-tasks',
        '/company-internal-tasks/' + id,
        '/company-internal-tasks/eligible-assignees',
      ])
        expect((await fixture.request(path, actor)).status).toBe(403);
      expect(
        (
          await fixture.request('/company-internal-tasks', {
            ...actor,
            method: 'POST',
            key: 'created-by-manager',
            body: {
              title: 'Private internal work',
              assigneeMembershipId: c.membershipId,
            },
          })
        ).status,
      ).toBe(403);
      await fixture.created('/company-internal-task-manager-assignments', {
        companyId: c.companyId,
        workspaceMembershipId: c.membershipId,
      });
      expect(
        await json(
          await fixture.request('/company-internal-tasks', {
            ...actor,
            method: 'POST',
            key: 'created-by-manager',
            body: {
              title: 'Private internal work',
              assigneeMembershipId: c.membershipId,
            },
          }),
        ),
      ).toEqual(created);
      expect(
        (
          await fixture.pool.query(
            "SELECT bundle,permission_set_version FROM company_role_assignments WHERE bundle='company_internal_task_manager' ORDER BY created_at,id",
          )
        ).rows.every((row) => object(row).permission_set_version === 'v1'),
      ).toBe(true);
    });
    it('protects foreign targets, cursors, actor Workspaces and keys without granting access to old Project Tasks', async () => {
      const c = await fixture.setup(),
        actor = { companyId: c.companyId, subject: 'manager' },
        body = { title: 'Company A private work' };
      const first = await json(
          await fixture.request('/company-internal-tasks', {
            ...actor,
            method: 'POST',
            key: 'same-actor-key',
            body,
          }),
        ),
        id = string(object(first.task).id);
      const otherId = string(
        (
          await fixture.created('/companies', {
            displayName: 'Other Company DEMO',
          })
        ).id,
      );
      for (const bundle of ['context', 'internal-task-manager'])
        await fixture.created('/company-' + bundle + '-assignments', {
          companyId: otherId,
          workspaceMembershipId: c.membershipId,
        });
      const other = { companyId: otherId, subject: 'manager' };
      for (const path of [
        '/company-internal-tasks/' + id,
        '/company-internal-tasks?beforeTaskId=' + id,
      ])
        expect((await fixture.request(path, other)).status).toBe(404);
      expect(
        (
          await fixture.request('/company-internal-tasks/' + id + '/changes', {
            ...other,
            method: 'POST',
            body: { kind: 'EDIT', expectedVersion: 1, title: 'Hidden' },
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await fixture.request('/company-internal-tasks', {
            ...other,
            method: 'POST',
            key: 'same-actor-key',
            body,
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await fixture.request('/company-internal-tasks', {
            ...actor,
            workspaceId: '11111111-1111-4111-8111-111111111111',
          })
        ).status,
      ).toBe(403);
      for (const path of [
        '/assigned-tasks',
        '/unassigned-tasks',
        '/blocked-tasks',
        '/team-tasks',
        '/due-soon-tasks',
        '/attention-tasks',
        '/overdue-tasks',
      ])
        expect((await fixture.request(path, actor)).status).toBe(403);
      expect(
        await json(
          await fixture.request('/company-internal-tasks/' + id, actor),
        ),
      ).toMatchObject({ task: object(first.task) });
    });
    it('retains an ineligible assignee and captured label, allowing unrelated changes, clear and exact replay', async () => {
      const c = await fixture.setup(),
        actor = { companyId: c.companyId, subject: 'manager' },
        colleague = await json(
          await fixture.request('/access/current-actor', {
            subject: 'colleague',
          }),
        ),
        memberId = string(colleague.workspaceMembershipId);
      for (const bundle of ['context', 'internal-task-manager'])
        await fixture.created('/company-' + bundle + '-assignments', {
          companyId: c.companyId,
          workspaceMembershipId: memberId,
        });
      const body = { title: 'Assigned work', assigneeMembershipId: memberId },
        created = await json(
          await fixture.request('/company-internal-tasks', {
            ...actor,
            method: 'POST',
            key: 'assigned-create',
            body,
          }),
        ),
        id = string(object(created.task).id);
      expect(
        (
          await fixture.request(
            `/company-internal-task-manager-assignments/${memberId}/${c.companyId}`,
            { method: 'DELETE' },
          )
        ).status,
      ).toBe(200);
      const members = await json(
        await fixture.request(
          '/company-internal-tasks/eligible-assignees',
          actor,
        ),
      );
      expect(
        Array.isArray(members.members) &&
          members.members.some(
            (member) => object(member).membershipId === memberId,
          ),
      ).toBe(false);
      expect(
        (
          await fixture.request(
            '/company-internal-tasks/eligible-assignees?afterMembershipId=' +
              memberId,
            actor,
          )
        ).status,
      ).toBe(404);
      const edit = await fixture.request(
        '/company-internal-tasks/' + id + '/changes',
        {
          ...actor,
          method: 'POST',
          body: {
            kind: 'EDIT',
            expectedVersion: 1,
            description: 'Unrelated correction',
            assigneeMembershipId: memberId,
          },
        },
      );
      expect(edit.status).toBe(200);
      expect(object((await json(edit)).task).assignee).toEqual(
        object(created.task).assignee,
      );
      expect(
        (
          await fixture.request('/company-internal-tasks', {
            ...actor,
            method: 'POST',
            body: {
              title: 'Ineligible new selection',
              assigneeMembershipId: memberId,
            },
          })
        ).status,
      ).toBe(400);
      expect(
        await json(
          await fixture.request('/company-internal-tasks', {
            ...actor,
            method: 'POST',
            key: 'assigned-create',
            body,
          }),
        ),
      ).toEqual(created);
      const clear = await fixture.request(
        '/company-internal-tasks/' + id + '/changes',
        {
          ...actor,
          method: 'POST',
          body: {
            kind: 'EDIT',
            expectedVersion: 2,
            assigneeMembershipId: null,
          },
        },
      );
      expect(clear.status).toBe(200);
      expect(object((await json(clear)).task).assignee).toBeNull();
    });
    it('filters live Company-only candidates before bounded UUID paging and validates the cursor itself', async () => {
      const c = await fixture.setup(),
        actor = { companyId: c.companyId, subject: 'manager' },
        ids = [c.membershipId];
      for (let i = 0; i < 28; i++) {
        const member = await json(
            await fixture.request('/access/current-actor', {
              subject: 'candidate-' + i,
            }),
          ),
          id = string(member.workspaceMembershipId);
        for (const bundle of ['context', 'internal-task-manager'])
          await fixture.created('/company-' + bundle + '-assignments', {
            companyId: c.companyId,
            workspaceMembershipId: id,
          });
        ids.push(id);
      }
      const page = await json(
        await fixture.request(
          '/company-internal-tasks/eligible-assignees',
          actor,
        ),
      );
      expect(Array.isArray(page.members) && page.members.length).toBe(25);
      const next = await json(
        await fixture.request(
          '/company-internal-tasks/eligible-assignees?afterMembershipId=' +
            page.nextAfterMembershipId,
          actor,
        ),
      );
      expect(Array.isArray(next.members) && next.members.length).toBe(4);
      expect(next.nextAfterMembershipId).toBeNull();
      const members = [
        ...(Array.isArray(page.members) ? page.members : []),
        ...(Array.isArray(next.members) ? next.members : []),
      ];
      expect(members.map((member) => object(member).membershipId)).toEqual(
        [...ids].sort(),
      );
      for (const member of members)
        expect(Object.keys(object(member)).sort()).toEqual([
          'displayLabel',
          'membershipId',
        ]);
      expect(
        (
          await fixture.request(
            '/company-internal-tasks/eligible-assignees?afterMembershipId=' +
              c.membershipId +
              '&afterMembershipId=' +
              c.membershipId,
            actor,
          )
        ).status,
      ).toBe(400);
      const chosen = members.find(
        (member) => object(member).membershipId !== c.membershipId,
      );
      if (!chosen) throw new Error('Missing non-actor candidate.');
      const revoked = string(object(chosen).membershipId);
      expect(
        (
          await fixture.request(
            `/company-internal-task-manager-assignments/${revoked}/${c.companyId}`,
            { method: 'DELETE' },
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await fixture.request(
            '/company-internal-tasks/eligible-assignees?afterMembershipId=' +
              revoked,
            actor,
          )
        ).status,
      ).toBe(404);
    }, 15000);
  },
);
