import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  json,
  object,
  string,
  openNextActionFixture,
  workspaceId,
  type NextActionFixture,
} from './project-next-action.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
(databaseUrl ? describe : describe.skip)(
  'Explicit Project next action REST',
  () => {
    let fixture: NextActionFixture;
    beforeAll(async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
      fixture = await openNextActionFixture(databaseUrl);
    });
    afterAll(async () => {
      await fixture?.close();
    });

    it('records a literal action, reloads its exact attributed history and preserves the native Project', async () => {
      const context = await fixture.setup();
      await fixture.created(
        '/company-project-next-action-coordinator-assignments',
        {
          companyId: context.companyId,
          workspaceMembershipId: context.membershipId,
        },
      );
      const before = await json(
        await fixture.request(context.path, { companyId: context.companyId }),
      );
      expect(before).toEqual({
        current: {
          format: 'project-next-action-v1',
          workspaceId,
          companyId: context.companyId,
          projectId: context.projectId,
          originalClientAccountId: context.clientId,
          revision: 0,
          text: null,
          lastChange: null,
        },
        history: { entries: [], hasMore: false, nextBeforeRevision: null },
      });
      const response = await fixture.request(context.path, {
        method: 'POST',
        companyId: context.companyId,
        key: 'first-native-action',
        body: {
          expectedRevision: 0,
          expectedLifecycleRevision: 0,
          text: '  Waiting for Client documents.  ',
        },
      });
      expect(response.status).toBe(200);
      const receipt = await json(response);
      expect(receipt).toMatchObject({
        format: 'project-next-action-command-v1',
        outcome: 'changed',
        record: {
          ...object(before.current),
          revision: 1,
          text: 'Waiting for Client documents.',
          lastChange: {
            internalUserId: context.actor.internalUserId,
            workspaceMembershipId: context.membershipId,
            displayName: 'DEMO Coordinator',
            occurredAt: expect.any(String),
          },
        },
      });
      const loaded = await json(
        await fixture.request(context.path, { companyId: context.companyId }),
      );
      expect(loaded).toEqual({
        current: receipt.record,
        history: {
          entries: [
            {
              revision: 1,
              predecessorRevision: 0,
              before: null,
              after: 'Waiting for Client documents.',
              attribution: object(receipt.record).lastChange,
            },
          ],
          hasMore: false,
          nextBeforeRevision: null,
        },
      });
      expect(
        await json(
          await fixture.request(`/projects/${context.projectId}`, {
            companyId: context.companyId,
          }),
        ),
      ).toEqual(context.project);
    });

    it('replaces and explicitly clears without erasing history, then confirms the exact earlier key outcome', async () => {
      const context = await coordinator();
      const first = await change(
        context,
        0,
        'Waiting for Client documents.',
        'first',
      );
      await change(context, 1, 'Send the report to the body.', 'second');
      const cleared = await change(context, 2, null, 'clear');
      expect(cleared).toMatchObject({
        outcome: 'changed',
        record: { revision: 3, text: null },
      });
      const loaded = await json(
        await fixture.request(context.path, { companyId: context.companyId }),
      );
      expect(object(loaded.history).entries).toEqual([
        expect.objectContaining({
          revision: 3,
          predecessorRevision: 2,
          before: 'Send the report to the body.',
          after: null,
        }),
        expect.objectContaining({
          revision: 2,
          predecessorRevision: 1,
          before: 'Waiting for Client documents.',
          after: 'Send the report to the body.',
        }),
        expect.objectContaining({
          revision: 1,
          predecessorRevision: 0,
          before: null,
          after: 'Waiting for Client documents.',
        }),
      ]);
      const clientBefore = await json(
        await fixture.request(`/clients/${context.clientId}`, {
          companyId: context.companyId,
        }),
      );
      const noop = await change(context, 3, ' \r\n\t ', 'empty-is-null');
      expect(noop).toEqual({ ...cleared, outcome: 'unchanged' });
      expect(
        await json(
          await fixture.request(`/clients/${context.clientId}`, {
            companyId: context.companyId,
          }),
        ),
      ).toEqual(clientBefore);
      expect(
        await json(
          await fixture.request(context.path, { companyId: context.companyId }),
        ),
      ).toEqual(loaded);
      expect(
        await change(context, 0, '  Waiting for Client documents.  ', 'first'),
      ).toEqual(first);
      const conflict = await fixture.request(context.path, {
        method: 'POST',
        companyId: context.companyId,
        key: 'first',
        body: {
          expectedRevision: 0,
          expectedLifecycleRevision: 0,
          text: 'Changed intent',
        },
      });
      expect(conflict.status).toBe(409);
    });

    it('keeps ordinary read independent of explicit coordination and refuses a revoked writer confirmation', async () => {
      const context = await fixture.setup();
      expect(
        (await fixture.request(context.path, { companyId: context.companyId }))
          .status,
      ).toBe(200);
      const input = {
        expectedRevision: 0,
        expectedLifecycleRevision: 0,
        text: 'Read permission does not authorize writing.',
      };
      expect(
        (
          await fixture.request(context.path, {
            method: 'POST',
            body: input,
            companyId: context.companyId,
            key: 'authorized-only',
          })
        ).status,
      ).toBe(403);
      const grant = await fixture.created(
        '/company-project-next-action-coordinator-assignments',
        {
          companyId: context.companyId,
          workspaceMembershipId: context.membershipId,
        },
      );
      expect(grant.permissionSetVersion).toBe('v1');
      const actor = await json(
        await fixture.request('/access/current-actor', {
          companyId: context.companyId,
        }),
      );
      expect(object(actor.activeCompany)).toMatchObject({
        projectNextActionPermissions: ['project.next_action.update'],
        projectNextActionCoordinatorAssignmentId: grant.id,
        projectNextActionCoordinatorPermissionSetVersion: 'v1',
      });
      expect(
        (
          await fixture.request(context.path, {
            method: 'POST',
            body: input,
            companyId: context.companyId,
            key: 'authorized-only',
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await fixture.request(
            `/company-project-next-action-coordinator-assignments/${context.membershipId}/${context.companyId}`,
            { method: 'DELETE' },
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await fixture.request(context.path, {
            method: 'POST',
            body: input,
            companyId: context.companyId,
            key: 'authorized-only',
          })
        ).status,
      ).toBe(403);
      expect(
        (await fixture.request(context.path, { companyId: context.companyId }))
          .status,
      ).toBe(200);
    });

    it('preserves exact interior Unicode scalars and line endings under the 500-code-point bound', async () => {
      const context = await coordinator();
      const literal =
        'Ж / e\u0301 / é / 🌍\r\n  <script>inert()</script>\t\rnext';
      expect(
        await change(context, 0, ' \u00a0' + literal + '\ufeff ', 'literal'),
      ).toMatchObject({ record: { text: literal, revision: 1 } });
      expect(
        await change(context, 1, '🌍'.repeat(500), 'exact-500'),
      ).toMatchObject({ record: { text: '🌍'.repeat(500), revision: 2 } });
      for (const text of [
        '🌍'.repeat(501),
        'bad\u0000text',
        'lone\ud800',
        'lone\udfff',
      ]) {
        expect(
          (
            await fixture.request(context.path, {
              method: 'POST',
              companyId: context.companyId,
              body: { expectedRevision: 2, expectedLifecycleRevision: 0, text },
            })
          ).status,
        ).toBe(400);
      }
      expect(
        object(
          (
            await json(
              await fixture.request(context.path, {
                companyId: context.companyId,
              }),
            )
          ).current,
        ).revision,
      ).toBe(2);
    });

    it('returns bounded exact older history without changing the current record or accepting noncanonical cursors', async () => {
      const context = await coordinator();
      for (let revision = 0; revision < 27; revision++)
        await change(
          context,
          revision,
          `DEMO action ${revision + 1}`,
          `history-${revision}`,
        );
      const newest = await json(
        await fixture.request(context.path, { companyId: context.companyId }),
      );
      expect(object(newest.current).revision).toBe(27);
      const history = object(newest.history);
      if (!Array.isArray(history.entries))
        throw new Error('Expected public history entries.');
      expect(history.entries).toHaveLength(25);
      expect(object(history.entries[0]).revision).toBe(27);
      expect(object(history.entries[24]).revision).toBe(3);
      expect(history.hasMore).toBe(true);
      expect(history.nextBeforeRevision).toBe(3);
      const older = await json(
        await fixture.request(context.path + '?beforeRevision=3', {
          companyId: context.companyId,
        }),
      );
      expect(older.current).toEqual(newest.current);
      expect(older.history).toMatchObject({
        entries: [
          expect.objectContaining({ revision: 2 }),
          expect.objectContaining({ revision: 1 }),
        ],
        hasMore: false,
        nextBeforeRevision: null,
      });
      expect(
        (
          await json(
            await fixture.request(context.path + '?beforeRevision=1', {
              companyId: context.companyId,
            }),
          )
        ).history,
      ).toEqual({ entries: [], hasMore: false, nextBeforeRevision: null });
      for (const query of [
        'beforeRevision=0',
        'beforeRevision=01',
        'beforeRevision=+3',
        'beforeRevision=1e2',
        'beforeRevision=2147483648',
        'beforeRevision=3&beforeRevision=2',
        'limit=1',
        'beforeRevision=',
      ])
        expect(
          (
            await fixture.request(context.path + '?' + query, {
              companyId: context.companyId,
            })
          ).status,
        ).toBe(400);
    });

    async function coordinator() {
      const context = await fixture.setup();
      await fixture.created(
        '/company-project-next-action-coordinator-assignments',
        {
          companyId: context.companyId,
          workspaceMembershipId: context.membershipId,
        },
      );
      return context;
    }
    it('refuses material Client-fence exhaustion while an exact no-op remains conserving', async () => {
      const c = await coordinator();
      await fixture.pool.query(
        'UPDATE client_accounts SET version=2147483647 WHERE id=$1',
        [c.clientId],
      );
      const before = await json(
        await fixture.request(`/clients/${c.clientId}`, {
          companyId: c.companyId,
        }),
      );
      const unchanged = await change(c, 0, null, 'exhausted-noop');
      expect(unchanged).toMatchObject({
        outcome: 'unchanged',
        record: { revision: 0, text: null, lastChange: null },
      });
      expect(
        (
          await fixture.request(c.path, {
            method: 'POST',
            companyId: c.companyId,
            body: {
              expectedRevision: 0,
              expectedLifecycleRevision: 0,
              text: 'Cannot advance the exhausted fence',
            },
          })
        ).status,
      ).toBe(409);
      expect(
        await json(
          await fixture.request(`/clients/${c.clientId}`, {
            companyId: c.companyId,
          }),
        ),
      ).toEqual(before);
      expect(
        await json(await fixture.request(c.path, { companyId: c.companyId })),
      ).toMatchObject({
        current: { revision: 0, text: null },
        history: { entries: [] },
      });
      await expect(
        fixture.pool.query('SELECT 2147483648::integer'),
      ).rejects.toMatchObject({ code: '22003' });
    });
    it('refuses malformed and stale public intents without receipt disclosure or mutation', async () => {
      const c = await coordinator(),
        valid = {
          expectedRevision: 0,
          expectedLifecycleRevision: 0,
          text: 'A valid explicit action',
        };
      for (const body of [
        null,
        [],
        {},
        { ...valid, extra: 'not allowed' },
        { ...valid, expectedRevision: '0' },
        { ...valid, expectedRevision: -1 },
        { ...valid, expectedRevision: 0.5 },
        { ...valid, expectedLifecycleRevision: 2147483648 },
        { ...valid, text: 42 },
        { expectedRevision: 0, expectedLifecycleRevision: 0 },
      ])
        expect(
          (
            await fixture.request(c.path, {
              method: 'POST',
              companyId: c.companyId,
              body,
            })
          ).status,
        ).toBe(400);
      expect(
        (
          await fixture.request(c.path, {
            method: 'POST',
            companyId: c.companyId,
            key: '   ',
            body: valid,
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await fixture.request(c.path, {
            method: 'POST',
            companyId: c.companyId,
            body: { ...valid, expectedLifecycleRevision: 1 },
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await fixture.request(
            '/projects/00000000-0000-4000-8000-000000000999/next-action',
            {
              method: 'POST',
              companyId: c.companyId,
              body: valid,
              key: 'known-only-on-target',
            },
          )
        ).status,
      ).toBe(404);
      expect(
        await json(await fixture.request(c.path, { companyId: c.companyId })),
      ).toMatchObject({
        current: { revision: 0, text: null },
        history: { entries: [] },
      });
      expect(
        (
          await fixture.pool.query(
            'SELECT count(*)::int AS count FROM project_next_action_commands',
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
    });
    it('keeps ordinary Activity, Home, Project DTOs and unrelated stream namespaces unchanged', async () => {
      const c = await coordinator(),
        paths = [
          '/activity-log',
          '/operational-home',
          '/projects',
          `/projects/${c.projectId}`,
        ];
      const before = await Promise.all(
        paths.map(async (path) => {
          const response = await fixture.request(path, {
            companyId: c.companyId,
          });
          expect(response.status).toBe(200);
          return response.text();
        }),
      );
      await change(
        c,
        0,
        'CONFIDENTIAL NATIVE ACTION CANARY',
        'same-key-other-owner',
      );
      for (let i = 0; i < paths.length; i++) {
        const path = paths[i];
        if (!path) throw new Error('Missing baseline path.');
        const response = await fixture.request(path, {
          companyId: c.companyId,
        });
        expect(response.status).toBe(200);
        expect(await response.text()).toBe(before[i]);
      }
      expect(
        (
          await fixture.pool.query(
            'SELECT metadata FROM project_next_action_events',
          )
        ).rows,
      ).toEqual([{ metadata: { revision: 1 } }]);
    });
    it('keeps a committed confirmation readable after governed Client union but refuses a new historical mutation', async () => {
      const c = await coordinator();
      await fixture.created('/company-director-client-assignments', {
        companyId: c.companyId,
        workspaceMembershipId: c.membershipId,
      });
      const saved = await change(
        c,
        0,
        'Original Client remains the historical target.',
        'pre-union',
      );
      const canonicalId = string(
        (
          await fixture.created(
            '/clients',
            { displayName: 'Canonical DEMO Client' },
            c.companyId,
          )
        ).id,
      );
      // Represent synthetic legacy duplicates; governed review/union are public operations.
      await fixture.pool.query(
        "UPDATE client_accounts SET tax_id='NEXT-ACTION-UNION-DEMO' WHERE id=ANY($1::uuid[])",
        [[c.clientId, canonicalId]],
      );
      const review = await fixture.created(
        `/clients/${c.clientId}/union-reviews`,
        {},
        c.companyId,
      );
      const united = await fixture.request(
        `/client-union-reviews/${string(review.reviewReference)}/confirm`,
        {
          method: 'POST',
          companyId: c.companyId,
          body: {
            canonicalClientId: canonicalId,
            fields: {
              displayName: c.clientId,
              taxId: c.clientId,
              address: c.clientId,
              telephone: c.clientId,
              generalEmail: c.clientId,
              businessActivity: c.clientId,
            },
            companyIds: [c.companyId],
            reviewedDifferences: true,
            reason: 'Synthetic governed duplicate correction',
          },
        },
      );
      expect(united.status).toBe(201);
      expect(
        await change(
          c,
          0,
          'Original Client remains the historical target.',
          'pre-union',
        ),
      ).toEqual(saved);
      expect(
        (await fixture.request(c.path, { companyId: c.companyId })).status,
      ).toBe(200);
      expect(
        (
          await fixture.request(c.path, {
            method: 'POST',
            companyId: c.companyId,
            key: 'post-union',
            body: {
              expectedRevision: 1,
              expectedLifecycleRevision: 0,
              text: 'A new historical mutation',
            },
          })
        ).status,
      ).toBe(409);
    });
    async function change(
      context: Awaited<ReturnType<NextActionFixture['setup']>>,
      expectedRevision: number,
      text: string | null,
      key: string,
    ) {
      const response = await fixture.request(context.path, {
        method: 'POST',
        companyId: context.companyId,
        key,
        body: { expectedRevision, expectedLifecycleRevision: 0, text },
      });
      expect(response.status).toBe(200);
      return json(response);
    }
  },
);
