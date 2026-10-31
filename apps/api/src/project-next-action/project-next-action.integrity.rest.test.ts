import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  json,
  openNextActionFixture,
  type NextActionFixture,
} from './project-next-action.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
(databaseUrl ? describe : describe.skip)(
  'Project next-action native integrity',
  () => {
    let fixture: NextActionFixture;
    beforeAll(async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
      fixture = await openNextActionFixture(databaseUrl);
    });
    afterAll(async () => {
      await fixture?.close();
    });
    it.each([0, 2])(
      'refuses a fully coupled native material fact with a Client fence advance of %s instead of one',
      async (advance) => {
        const c = await fixture.setup();
        await fixture.created(
          '/company-project-next-action-coordinator-assignments',
          { companyId: c.companyId, workspaceMembershipId: c.membershipId },
        );
        expect(
          (
            await fixture.request(c.path, {
              method: 'POST',
              companyId: c.companyId,
              body: {
                expectedRevision: 0,
                expectedLifecycleRevision: 0,
                text: 'Legitimate native predecessor',
              },
            })
          ).status,
        ).toBe(200);
        const before = await json(
          await fixture.request(c.path, { companyId: c.companyId }),
        );
        const fence = (
          await fixture.pool.query(
            'SELECT version FROM client_accounts WHERE id=$1',
            [c.clientId],
          )
        ).rows;
        async function forge() {
          const db = await fixture.pool.connect();
          try {
            await db.query('BEGIN');
            await db.query(
              `INSERT INTO project_next_action_history(workspace_id,company_id,project_id,original_client_account_id,actor_internal_user_id,actor_membership_id,actor_display_name,occurred_at,revision,predecessor_revision,before_text,text,lifecycle_revision,client_use_version,assignment_id)
               SELECT workspace_id,company_id,project_id,original_client_account_id,actor_internal_user_id,actor_membership_id,actor_display_name,occurred_at,2,1,text,'FORGED missing or doubled fence',lifecycle_revision,client_use_version+$2,assignment_id FROM project_next_action_history WHERE project_id=$1 AND revision=1`,
              [c.projectId, advance],
            );
            await db.query(
              "UPDATE project_next_action_heads SET revision=2,text='FORGED missing or doubled fence' WHERE project_id=$1",
              [c.projectId],
            );
            await db.query(
              `INSERT INTO project_next_action_commands(workspace_id,company_id,project_id,original_client_account_id,actor_internal_user_id,actor_membership_id,assignment_id,idempotency_key,fingerprint,revision,client_use_version,outcome,response,created_at)
               SELECT workspace_id,company_id,project_id,original_client_account_id,actor_internal_user_id,actor_membership_id,assignment_id,'FORGED-fence',jsonb_build_object('format','project-next-action-command-v1','companyId',company_id,'projectId',project_id,'expectedRevision',1,'expectedLifecycleRevision',lifecycle_revision,'text',text)::text,revision,client_use_version,'changed',jsonb_build_object('format','project-next-action-command-v1','outcome','changed','record',pna_record_json(workspace_id,company_id,project_id,original_client_account_id,revision,text,actor_internal_user_id,actor_membership_id,actor_display_name,occurred_at)),occurred_at FROM project_next_action_history WHERE project_id=$1 AND revision=2`,
              [c.projectId],
            );
            await db.query(
              `INSERT INTO project_next_action_events(workspace_id,company_id,project_id,revision,action,actor_internal_user_id,actor_membership_id,occurred_at,metadata)
               SELECT workspace_id,company_id,project_id,revision,'project.next_action.updated',actor_internal_user_id,actor_membership_id,occurred_at,jsonb_build_object('revision',revision) FROM project_next_action_history WHERE project_id=$1 AND revision=2`,
              [c.projectId],
            );
            if (advance > 0)
              await db.query(
                'UPDATE client_accounts SET version=version+$2 WHERE id=$1',
                [c.clientId, advance],
              );
            await db.query('COMMIT');
          } catch (error) {
            await db.query('ROLLBACK');
            throw error;
          } finally {
            db.release();
          }
        }
        await expect(forge()).rejects.toMatchObject({
          code: '23514',
          constraint: 'pna_history_fence_step',
        });
        expect(
          await json(await fixture.request(c.path, { companyId: c.companyId })),
        ).toEqual(before);
        expect(
          (
            await fixture.pool.query(
              'SELECT version FROM client_accounts WHERE id=$1',
              [c.clientId],
            )
          ).rows,
        ).toEqual(fence);
        for (const table of [
          'project_next_action_heads',
          'project_next_action_history',
          'project_next_action_commands',
          'project_next_action_events',
        ])
          expect(
            (
              await fixture.pool.query(
                `SELECT count(*)::int AS count FROM ${table} WHERE project_id=$1`,
                [c.projectId],
              )
            ).rows,
          ).toEqual([{ count: 1 }]);
      },
    );
    it('refuses rewriting an existing head without a new material predecessor and coupled receipt/event', async () => {
      const context = await fixture.setup();
      await fixture.created(
        '/company-project-next-action-coordinator-assignments',
        {
          companyId: context.companyId,
          workspaceMembershipId: context.membershipId,
        },
      );
      expect(
        (
          await fixture.request(context.path, {
            method: 'POST',
            companyId: context.companyId,
            body: {
              expectedRevision: 0,
              expectedLifecycleRevision: 0,
              text: 'Immutable native fact',
            },
          })
        ).status,
      ).toBe(200);
      await expect(
        fixture.pool.query(
          'UPDATE project_next_action_heads SET text=$1 WHERE project_id=$2',
          ['FORGED text', context.projectId],
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'pna_head_transition',
      });
    });
    it('rejects uncoupled native appends, missing immutable rows and forged original identity independently of HTTP', async () => {
      const c = await fixture.setup();
      await fixture.created(
        '/company-project-next-action-coordinator-assignments',
        { companyId: c.companyId, workspaceMembershipId: c.membershipId },
      );
      expect(
        (
          await fixture.request(c.path, {
            method: 'POST',
            companyId: c.companyId,
            body: {
              expectedRevision: 0,
              expectedLifecycleRevision: 0,
              text: 'Native immutable first action',
            },
          })
        ).status,
      ).toBe(200);
      for (const table of [
        'project_next_action_heads',
        'project_next_action_history',
        'project_next_action_commands',
        'project_next_action_events',
      ])
        await expect(
          fixture.pool.query(`DELETE FROM ${table} WHERE project_id=$1`, [
            c.projectId,
          ]),
        ).rejects.toMatchObject({ code: '23514' });
      await expect(
        fixture.pool.query(
          `INSERT INTO project_next_action_history(workspace_id,company_id,project_id,original_client_account_id,actor_internal_user_id,actor_membership_id,actor_display_name,occurred_at,revision,predecessor_revision,before_text,text,lifecycle_revision,client_use_version,assignment_id)
      SELECT workspace_id,company_id,project_id,original_client_account_id,actor_internal_user_id,actor_membership_id,actor_display_name,occurred_at,2,1,text,'Uncoupled forged append',lifecycle_revision,client_use_version+1,assignment_id FROM project_next_action_history WHERE project_id=$1`,
          [c.projectId],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        fixture.pool.query(
          `INSERT INTO project_next_action_history(workspace_id,company_id,project_id,original_client_account_id,actor_internal_user_id,actor_membership_id,actor_display_name,occurred_at,revision,predecessor_revision,before_text,text,lifecycle_revision,client_use_version,assignment_id)
      SELECT workspace_id,company_id,project_id,gen_random_uuid(),actor_internal_user_id,actor_membership_id,actor_display_name,occurred_at,2,1,text,'Foreign original Client',lifecycle_revision,client_use_version+1,assignment_id FROM project_next_action_history WHERE project_id=$1`,
          [c.projectId],
        ),
      ).rejects.toMatchObject({ code: '23503' });
    });
  },
);
