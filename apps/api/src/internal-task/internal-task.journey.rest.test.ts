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
  'Internal Company Task complete public journey',
  () => {
    let fixture: InternalTaskFixture;
    beforeAll(async () => {
      if (!databaseUrl) throw new Error('PostgreSQL required.');
      fixture = await openInternalTaskFixture(databaseUrl);
    });
    afterAll(async () => {
      await fixture?.close();
    });
    it('assigns Company-only members, corrects literal fields, declares every state and confirms exact historical commands', async () => {
      const c = await fixture.setup(),
        actor = { companyId: c.companyId, subject: 'manager' };
      const colleague = await json(
        await fixture.request('/access/current-actor', {
          subject: 'colleague',
        }),
      );
      for (const bundle of ['context', 'internal-task-manager'])
        await fixture.created('/company-' + bundle + '-assignments', {
          companyId: c.companyId,
          workspaceMembershipId: colleague.workspaceMembershipId,
        });
      const eligible = await json(
        await fixture.request(
          '/company-internal-tasks/eligible-assignees',
          actor,
        ),
      );
      expect(eligible).toMatchObject({
        format: 'company-internal-task-assignees-v1',
        members: expect.arrayContaining([
          expect.objectContaining({
            membershipId: colleague.workspaceMembershipId,
          }),
        ]),
        nextAfterMembershipId: null,
      });
      const createBody = {
        title: 'Inventory',
        description: ' first\r\n second ',
        assigneeMembershipId: colleague.workspaceMembershipId,
        dueDate: '0001-01-01',
        priority: 'critical',
      };
      const firstResponse = await fixture.request('/company-internal-tasks', {
        ...actor,
        method: 'POST',
        key: 'create',
        body: createBody,
      });
      expect(firstResponse.status).toBe(201);
      const first = await json(firstResponse);
      expect(first).toMatchObject({
        changed: true,
        task: {
          status: 'todo',
          version: 1,
          description: 'first\r\n second',
          assignee: { membershipId: colleague.workspaceMembershipId },
        },
      });
      const id = string(object(first.task).id),
        path = '/company-internal-tasks/' + id + '/changes';
      async function change(body: unknown, key?: string) {
        const response = await fixture.request(path, {
          ...actor,
          method: 'POST',
          key,
          body,
        });
        expect(response.status, await response.clone().text()).toBe(200);
        return json(response);
      }
      const edit = {
          kind: 'EDIT',
          expectedVersion: 1,
          title: ' Inventory corrected ',
          description: null,
          dueDate: null,
          priority: 'normal',
        },
        corrected = await change(edit, 'edit');
      expect(corrected).toMatchObject({
        changed: true,
        task: {
          version: 2,
          title: 'Inventory corrected',
          description: null,
          dueDate: null,
          priority: 'normal',
          assignee: object(first.task).assignee,
        },
        history: { kind: 'EDIT', before: first.task },
      });
      const noopBody = {
          kind: 'EDIT',
          expectedVersion: 2,
          title: 'Inventory corrected',
        },
        noOp = await change(noopBody, 'noop');
      expect(noOp).toEqual({
        format: 'company-internal-task-command-v1',
        task: corrected.task,
        changed: false,
        history: null,
      });
      let current = corrected;
      for (const [index, state] of [
        'blocked',
        'in_progress',
        'done',
        'todo',
        'cancelled',
        'todo',
      ].entries()) {
        current = await change(
          {
            kind: 'MOVE',
            expectedVersion: index + 2,
            status: state,
            ...(state === 'blocked' || state === 'cancelled'
              ? { reason: '  Literal reason\n  preserved  ' }
              : {}),
          },
          'move-' + index,
        );
        expect(current).toMatchObject({
          changed: true,
          task: {
            version: index + 3,
            status: state,
            completion:
              state === 'done'
                ? {
                    actorMembershipId: c.membershipId,
                    recordedAt: expect.any(String),
                  }
                : null,
            reason:
              state === 'blocked' || state === 'cancelled'
                ? {
                    kind: state === 'blocked' ? 'blockage' : 'cancellation',
                    text: 'Literal reason\n  preserved',
                    actorMembershipId: c.membershipId,
                    recordedAt: expect.any(String),
                  }
                : null,
          },
        });
        if (state === 'done' || state === 'cancelled')
          expect(
            (
              await fixture.request(path, {
                ...actor,
                method: 'POST',
                body: {
                  kind: 'EDIT',
                  expectedVersion: index + 3,
                  title: 'Inventory corrected',
                },
              })
            ).status,
          ).toBe(409);
      }
      const replay = await fixture.request('/company-internal-tasks', {
        ...actor,
        method: 'POST',
        key: 'create',
        body: createBody,
      });
      expect(replay.status).toBe(201);
      expect(await json(replay)).toEqual(first);
      expect(await change(edit, 'edit')).toEqual(corrected);
      expect(await change(noopBody, 'noop')).toEqual(noOp);
      expect(
        (
          await fixture.request(path, {
            ...actor,
            method: 'POST',
            key: 'edit',
            body: { ...edit, title: 'Changed intent' },
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await fixture.request(path, {
            ...actor,
            method: 'POST',
            body: { kind: 'EDIT', expectedVersion: 2, title: 'Stale' },
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await fixture.request(path, {
            ...actor,
            method: 'POST',
            body: { kind: 'MOVE', expectedVersion: 8, status: 'todo' },
          })
        ).status,
      ).toBe(409);
      const detail = await json(
        await fixture.request('/company-internal-tasks/' + id, actor),
      );
      expect(detail.task).toEqual(current.task);
      const historyRows = Array.isArray(detail.history)
        ? detail.history.map(object)
        : [];
      expect(historyRows).toHaveLength(8);
      expect(historyRows.at(-1)).toEqual(first.history);
      expect(historyRows[0]).toMatchObject({
        kind: 'MOVE',
        version: 8,
        after: current.task,
      });
      expect(
        (
          await fixture.pool.query(
            'SELECT action,metadata FROM internal_company_task_events ORDER BY version',
          )
        ).rows,
      ).toEqual([
        { action: 'internal_task.created', metadata: { version: 1 } },
        { action: 'internal_task.updated', metadata: { version: 2 } },
        ...[3, 4, 5, 6, 7, 8].map((version) => ({
          action: 'internal_task.status.changed',
          metadata: { version },
        })),
      ]);
      const activity = await fixture.request('/activity-log', {
        companyId: c.companyId,
      });
      expect(activity.status).toBe(200);
      expect(await activity.text()).not.toContain('internal_task.');
    });
    it('rejects closed grammar, malformed scalars, dates, versions and repeated queries without success facts', async () => {
      const c = await fixture.setup(),
        actor = { companyId: c.companyId, subject: 'manager' };
      for (const body of [
        null,
        [],
        {},
        { title: '' },
        { title: '\u0000bad' },
        { title: '\ud800' },
        { title: 'x'.repeat(201) },
        { title: 'Valid', description: 'x'.repeat(2001) },
        { title: 'Valid', description: 42 },
        { title: 'Valid', dueDate: '2027-02-29' },
        { title: 'Valid', dueDate: '0000-01-01' },
        { title: 'Valid', dueDate: '2026-01-01T00:00:00Z' },
        { title: 'Valid', priority: 'urgent' },
        { title: 'Valid', status: 'done' },
        { title: 'Valid', companyId: c.companyId },
      ])
        expect(
          (
            await fixture.request('/company-internal-tasks', {
              ...actor,
              method: 'POST',
              body,
            })
          ).status,
        ).toBe(400);
      const response = await fixture.request('/company-internal-tasks', {
        ...actor,
        method: 'POST',
        body: { title: '😀'.repeat(200), description: ' \uFEFF ' },
      });
      expect(response.status).toBe(201);
      const valid = await json(response);
      expect(valid).toMatchObject({ task: { description: null } });
      const path =
        '/company-internal-tasks/' + object(valid.task).id + '/changes';
      for (const body of [
        { kind: 'EDIT', expectedVersion: 1 },
        { kind: 'EDIT', expectedVersion: 0, title: 'X' },
        { kind: 'EDIT', expectedVersion: 1.5, title: 'X' },
        { kind: 'EDIT', expectedVersion: 2147483648, title: 'X' },
        { kind: 'EDIT', expectedVersion: 1, status: 'done' },
        { kind: 'MOVE', expectedVersion: 1, status: 'blocked' },
        { kind: 'MOVE', expectedVersion: 1, status: 'cancelled', reason: '  ' },
        { kind: 'MOVE', expectedVersion: 1, status: 'done', reason: 'Extra' },
        { kind: 'MOVE', expectedVersion: 1, status: 'unknown' },
        { kind: 'EDIT', expectedVersion: 1, assigneeMembershipId: 'not-uuid' },
      ])
        expect(
          (await fixture.request(path, { ...actor, method: 'POST', body }))
            .status,
        ).toBe(400);
      for (const query of [
        '?status=open&status=all',
        '?unknown=true',
        '?beforeTaskId=wrong',
        '?status=Done',
      ])
        expect(
          (await fixture.request('/company-internal-tasks' + query, actor))
            .status,
        ).toBe(400);
      for (const query of [
        '?beforeVersion=01',
        '?beforeVersion=0',
        '?beforeVersion=2147483648',
        '?beforeVersion=1&beforeVersion=2',
      ])
        expect(
          (
            await fixture.request(
              '/company-internal-tasks/' + object(valid.task).id + query,
              actor,
            )
          ).status,
        ).toBe(400);
      expect(
        (
          await fixture.pool.query(
            'SELECT count(*)::integer AS n FROM internal_company_task_commands',
          )
        ).rows,
      ).toEqual([{ n: 1 }]);
    });
    it('discovers every tied Task and history fact with immutable cursors and deliberate closed filters', async () => {
      const c = await fixture.setup(),
        actor = { companyId: c.companyId, subject: 'manager' },
        ids: string[] = [];
      for (let i = 0; i < 27; i++) {
        const response = await fixture.request('/company-internal-tasks', {
          ...actor,
          method: 'POST',
          body: { title: 'Task ' + i },
        });
        expect(response.status).toBe(201);
        ids.push(string(object((await json(response)).task).id));
      }
      const page = await json(
        await fixture.request('/company-internal-tasks', actor),
      );
      expect(Array.isArray(page.tasks) && page.tasks.length).toBe(25);
      const second = await json(
        await fixture.request(
          '/company-internal-tasks?beforeTaskId=' + page.nextBeforeTaskId,
          actor,
        ),
      );
      expect(Array.isArray(second.tasks) && second.tasks.length).toBe(2);
      expect(second.nextBeforeTaskId).toBeNull();
      const seen = [
        ...(Array.isArray(page.tasks) ? page.tasks : []),
        ...(Array.isArray(second.tasks) ? second.tasks : []),
      ].map((item) => object(item).id);
      expect(new Set(seen).size).toBe(27);
      expect(seen).toEqual([...ids].sort().reverse());
      const id = ids[0];
      if (!id) throw new Error('Missing synthetic Task.');
      for (let v = 1; v <= 27; v++) {
        const response = await fixture.request(
          '/company-internal-tasks/' + id + '/changes',
          {
            ...actor,
            method: 'POST',
            body: {
              kind: 'EDIT',
              expectedVersion: v,
              title: 'Correction ' + v,
            },
          },
        );
        expect(response.status).toBe(200);
      }
      const detail = await json(
        await fixture.request('/company-internal-tasks/' + id, actor),
      );
      expect(object(detail.task).version).toBe(28);
      expect(Array.isArray(detail.history) && detail.history.length).toBe(25);
      expect(detail.nextBeforeVersion).toBe(4);
      const earlier = await json(
        await fixture.request(
          '/company-internal-tasks/' + id + '?beforeVersion=4',
          actor,
        ),
      );
      expect(earlier.task).toEqual(detail.task);
      expect(
        Array.isArray(earlier.history)
          ? earlier.history.map((row) => object(row).version)
          : [],
      ).toEqual([3, 2, 1]);
      expect(earlier.nextBeforeVersion).toBeNull();
      const exhausted = await json(
        await fixture.request(
          '/company-internal-tasks/' + id + '?beforeVersion=1',
          actor,
        ),
      );
      expect(exhausted.history).toEqual([]);
      expect(exhausted.task).toEqual(detail.task);
      expect(
        (
          await fixture.request('/company-internal-tasks/' + id + '/changes', {
            ...actor,
            method: 'POST',
            body: { kind: 'MOVE', expectedVersion: 28, status: 'done' },
          })
        ).status,
      ).toBe(200);
      const closed = await json(
        await fixture.request('/company-internal-tasks?status=done', actor),
      );
      expect(
        Array.isArray(closed.tasks)
          ? closed.tasks.map((row) => object(row).id)
          : [],
      ).toEqual([id]);
      const all = await json(
        await fixture.request('/company-internal-tasks?status=all', actor),
      );
      expect(Array.isArray(all.tasks) && all.tasks.length).toBe(25);
      expect(
        (
          await fixture.request(
            '/company-internal-tasks?beforeTaskId=11111111-1111-4111-8111-111111111111',
            actor,
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await fixture.request(
            '/company-internal-tasks?status=open&beforeTaskId=' + id,
            actor,
          )
        ).status,
      ).toBe(200);
    }, 15000);
  },
);
