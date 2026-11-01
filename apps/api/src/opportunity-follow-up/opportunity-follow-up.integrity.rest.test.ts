import { randomUUID } from 'node:crypto';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  openFollowUpFixture,
  json,
  object,
} from './opportunity-follow-up.test-support.js';
import { OpportunityFollowUpStore } from './opportunity-follow-up.store.js';
import {
  followUpReceipt,
  followUpHistoryEntry,
} from './opportunity-follow-up.representation.js';
const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)(
  'follow-up native effect path, immutable coupling and atomicity',
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
    async function counts() {
      return (
        await f.pool.query(
          `SELECT (SELECT count(*)::int FROM opportunity_follow_up_heads) AS heads,(SELECT count(*)::int FROM opportunity_follow_up_history) AS history,(SELECT count(*)::int FROM opportunity_follow_up_commands) AS commands,(SELECT count(*)::int FROM opportunity_follow_up_events) AS events,(SELECT count(*)::int FROM opportunity_follow_up_cursor_keys) AS keys`,
        )
      ).rows[0];
    }
    it('validates closed intent, live captures, literal facts, versions and OPEN state at native PostgreSQL entry', async () => {
      const c = await f.createCase();
      const actor = await json(await f.request('/access/current-actor'));
      const company = object(actor.activeCompany);
      const body = {
        expectedRevision: 0,
        observedOpportunityVersion: 1,
        followUpOn: '2026-11-15',
        reason: null,
      };
      async function rejectNative(
        input: unknown,
        constraint: string,
        assignmentId = company.opportunityFollowUpCoordinatorAssignmentId,
      ) {
        const before = await counts();
        await expect(
          f.pool.query(
            `INSERT INTO opportunity_follow_up_commands(workspace_id,company_id,opportunity_id,actor_membership_id,actor_internal_user_id,assignment_id,intake_assignment_id,idempotency_key,intent) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [
              actor.workspaceId,
              company.id,
              c.opportunityId,
              actor.workspaceMembershipId,
              actor.internalUserId,
              assignmentId,
              company.commercialIntakePermissionAssignmentId,
              randomUUID(),
              JSON.stringify({
                format: 'opportunity-follow-up.v1',
                workspaceId: actor.workspaceId,
                companyId: company.id,
                actorMembershipId: actor.workspaceMembershipId,
                opportunityId: c.opportunityId,
                body: input,
              }),
            ],
          ),
        ).rejects.toMatchObject({ code: '23514', constraint });
        expect(await counts()).toEqual(before);
      }
      for (const input of [
        { ...body, followUpOn: '1900-02-29' },
        { ...body, followUpOn: '0000-01-01' },
        { ...body, reason: ' \u00a0' },
        { ...body, reason: 'x'.repeat(501) },
        { ...body, reason: '😀'.repeat(251) },
        { ...body, expectedRevision: Number.MAX_SAFE_INTEGER + 1 },
        { ...body, expectedRevision: '0' },
        { ...body, unknown: 'not admitted' },
      ])
        await rejectNative(input, 'ofup_native_intent');
      await rejectNative(
        { ...body, expectedRevision: 1 },
        'ofup_native_observation',
      );
      await rejectNative(
        { ...body, observedOpportunityVersion: 2 },
        'ofup_native_observation',
      );
      await rejectNative(body, 'ofup_native_authority', randomUUID());
      expect((await f.request(c.path, { method: 'POST', body })).status).toBe(
        200,
      );
      await rejectNative(
        { ...body, expectedRevision: 1, followUpOn: null },
        'ofup_native_reason',
      );
      const changed = await f.request(
        '/commercial-intake/opportunities/' + c.opportunityId + '/next-action',
        {
          method: 'POST',
          body: {
            expectedVersion: 1,
            nextAction: 'Native positive control before SQL no-op',
          },
        },
      );
      expect(changed.status).toBe(200);
      await rejectNative(
        { ...body, expectedRevision: 1 },
        'ofup_native_observation',
      );
      const held = await f.request(
        '/commercial-intake/opportunities/' + c.opportunityId + '/outcome',
        {
          method: 'POST',
          body: {
            expectedVersion: 2,
            status: 'ON_HOLD',
            reason: 'Native hold before SQL no-op',
          },
        },
      );
      expect(held.status).toBe(200);
      await rejectNative(
        { ...body, expectedRevision: 1, observedOpportunityVersion: 3 },
        'ofup_native_observation',
      );
      const revoked = await f.request(
        '/company-opportunity-follow-up-coordinator-assignments/' +
          actor.workspaceMembershipId +
          '/' +
          company.id,
        { method: 'DELETE', subject: 'owner' },
      );
      expect(revoked.status).toBe(200);
      await rejectNative(
        { ...body, expectedRevision: 1, observedOpportunityVersion: 3 },
        'ofup_native_authority',
      );
    });
    it('rejects a completely well-shaped but fabricated head/history/receipt/event graph outside the native command input', async () => {
      const c = await f.createCase(),
        actor = await json(await f.request('/access/current-actor')),
        company = object(actor.activeCompany),
        current = await json(await f.request(c.path)),
        commandId = randomUUID(),
        recordedAt = '2026-11-01T10:00:00.000Z';
      const fact = {
        state: 'RECORDED',
        revision: 1,
        followUpOn: '2026-11-15',
        confirmedEpoch: current.outcomeEpoch,
        recordedBy: {
          workspaceMembershipId: actor.workspaceMembershipId,
          displayLabel: 'Synthetic captured label',
        },
        recordedAt,
      };
      const receipt = {
        format: 'opportunity-follow-up.v1',
        opportunityId: c.opportunityId,
        outcome: 'updated',
        fact,
      };
      const entry = {
        format: 'opportunity-follow-up.v1',
        opportunityId: c.opportunityId,
        revision: 1,
        before: { state: 'UNRECORDED', revision: 0 },
        after: fact,
        reason: null,
        commandId,
        actor: fact.recordedBy,
        occurredAt: recordedAt,
      };
      expect(followUpReceipt(receipt)).toEqual(receipt);
      expect(followUpHistoryEntry(entry)).toEqual(entry);
      const intent = {
        format: 'opportunity-follow-up.v1',
        workspaceId: actor.workspaceId,
        companyId: company.id,
        actorMembershipId: actor.workspaceMembershipId,
        opportunityId: c.opportunityId,
        body: {
          expectedRevision: 0,
          observedOpportunityVersion: 1,
          followUpOn: '2026-11-15',
          reason: null,
        },
      };
      await expect(
        f.pool.query(
          `WITH command AS (
   INSERT INTO opportunity_follow_up_commands(workspace_id,company_id,opportunity_id,id,actor_membership_id,actor_internal_user_id,assignment_id,intake_assignment_id,idempotency_key,intent,revision,outcome,response,created_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,'fabricated',$9,1,'updated',$10,$11) RETURNING id
  ), history AS (
   INSERT INTO opportunity_follow_up_history(workspace_id,company_id,opportunity_id,revision,command_id,fact) SELECT $1,$2,$3,1,id,$12 FROM command RETURNING command_id
  ), head AS (
   INSERT INTO opportunity_follow_up_heads(workspace_id,company_id,opportunity_id,revision,follow_up_on,confirmed_epoch,fact) SELECT $1,$2,$3,1,'2026-11-15',$13,$14 FROM history RETURNING opportunity_id
  ), event AS (
   INSERT INTO opportunity_follow_up_events(workspace_id,company_id,opportunity_id,revision,command_id,actor_membership_id,actor_internal_user_id,occurred_at,action,metadata) SELECT $1,$2,opportunity_id,1,$4,$5,$6,$11,'opportunity.follow_up.updated','{"revision":1}'::jsonb FROM head RETURNING command_id
  ) SELECT count(*) FROM event`,
          [
            actor.workspaceId,
            company.id,
            c.opportunityId,
            commandId,
            actor.workspaceMembershipId,
            actor.internalUserId,
            company.opportunityFollowUpCoordinatorAssignmentId,
            company.commercialIntakePermissionAssignmentId,
            JSON.stringify(intent),
            JSON.stringify(receipt),
            recordedAt,
            JSON.stringify(entry),
            current.outcomeEpoch,
            JSON.stringify(fact),
          ],
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'ofup_native_intent',
      });
      await expect(
        f.pool.query(
          'INSERT INTO opportunity_follow_up_heads(workspace_id,company_id,opportunity_id,revision,follow_up_on,confirmed_epoch,fact) VALUES($1,$2,$3,1,$4,$5,$6)',
          [
            actor.workspaceId,
            company.id,
            c.opportunityId,
            '2026-11-15',
            current.outcomeEpoch,
            JSON.stringify(fact),
          ],
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'ofup_native_effect_path',
      });
      expect(await counts()).toEqual({
        heads: 0,
        history: 0,
        commands: 0,
        events: 0,
        keys: 0,
      });
      expect((await json(await f.request(c.path))).head).toEqual({
        state: 'UNRECORDED',
        revision: 0,
      });
    });
    it('refuses direct partial insertion, mutation or deletion of every saved private effect', async () => {
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
      for (const table of [
        'opportunity_follow_up_history',
        'opportunity_follow_up_events',
        'opportunity_follow_up_commands',
        'opportunity_follow_up_cursor_keys',
      ]) {
        await expect(
          f.pool.query('DELETE FROM ' + table),
        ).rejects.toMatchObject({ code: '23514' });
      }
      await expect(
        f.pool.query(
          'UPDATE opportunity_follow_up_heads SET revision=revision+1',
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        f.pool.query(
          'UPDATE opportunity_follow_up_commands SET response=response || \'{"unrecognized":true}\'::jsonb',
        ),
      ).rejects.toMatchObject({ code: '23514' });
      expect(await counts()).toEqual({
        heads: 1,
        history: 1,
        commands: 1,
        events: 1,
        keys: 1,
      });
    });
    it.each(['event', 'receipt', 'commit'] as const)(
      'rolls back all native facts when %s persistence fails',
      async (kind) => {
        const c = await f.createCase();
        await f.pool.query(
          "CREATE FUNCTION ofup_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Deliberate synthetic persistence failure.'; END $$",
        );
        const ddl =
          kind === 'commit'
            ? 'CREATE CONSTRAINT TRIGGER ofup_test_failure AFTER INSERT ON opportunity_follow_up_commands DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ofup_test_failure()'
            : 'CREATE TRIGGER ofup_test_failure BEFORE INSERT ON ' +
              (kind === 'event'
                ? 'opportunity_follow_up_events'
                : 'opportunity_follow_up_commands') +
              ' FOR EACH ROW EXECUTE FUNCTION ofup_test_failure()';
        await f.pool.query(ddl);
        try {
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
          ).toBe(500);
        } finally {
          await f.pool.query('DROP FUNCTION ofup_test_failure() CASCADE');
        }
        expect(await counts()).toEqual({
          heads: 0,
          history: 0,
          commands: 0,
          events: 0,
          keys: 0,
        });
        expect((await json(await f.request(c.path))).head).toEqual({
          state: 'UNRECORDED',
          revision: 0,
        });
      },
    );
    it('rolls back native effects when successful response construction fails before transaction commit', async () => {
      const c = await f.createCase(),
        original = OpportunityFollowUpStore.prototype.response;
      const fault = vi
        .spyOn(OpportunityFollowUpStore.prototype, 'response')
        .mockImplementation(function (
          this: OpportunityFollowUpStore,
          value: unknown,
        ) {
          original.call(this, value);
          throw new Error(
            'Deliberate synthetic response-construction failure.',
          );
        });
      try {
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
        ).toBe(500);
      } finally {
        fault.mockRestore();
      }
      expect(await counts()).toEqual({
        heads: 0,
        history: 0,
        commands: 0,
        events: 0,
        keys: 0,
      });
      expect((await json(await f.request(c.path))).head).toEqual({
        state: 'UNRECORDED',
        revision: 0,
      });
    });
  },
);
