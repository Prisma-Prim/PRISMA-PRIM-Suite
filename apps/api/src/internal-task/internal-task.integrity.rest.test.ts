import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
  'Internal Company Task native coupled integrity',
  () => {
    let fixture: InternalTaskFixture;
    beforeAll(async () => {
      if (!databaseUrl) throw new Error('PostgreSQL required.');
      fixture = await openInternalTaskFixture(databaseUrl);
    });
    afterAll(async () => {
      await fixture?.close();
    });
    async function prepare() {
      const c = await fixture.setup(),
        response = await fixture.request('/company-internal-tasks', {
          method: 'POST',
          companyId: c.companyId,
          subject: 'manager',
          body: { title: 'Legitimate predecessor' },
        });
      expect(response.status).toBe(201);
      const created = await json(response);
      return {
        ...c,
        created,
        task: object(created.task),
        id: string(object(created.task).id),
        assignmentId: string(
          object(c.actor.activeCompany).internalTaskManagerAssignmentId,
        ),
        internalUserId: string(c.actor.internalUserId),
      };
    }
    it.each([
      'predecessor',
      'current',
      'receipt',
      'event',
      'intent',
      'state',
      'assignee-label',
    ])(
      'rejects a fully populated forged %s while preserving all committed facts',
      async (variant) => {
        const c = await prepare(),
          before = await json(
            await fixture.request('/company-internal-tasks/' + c.id, {
              companyId: c.companyId,
              subject: 'manager',
            }),
          ),
          recordedAt = c.task.updatedAt;
        const after = {
          ...c.task,
          version: 2,
          title: 'FORGED correction',
          ...(variant === 'assignee-label'
            ? {
                assignee: {
                  membershipId: c.membershipId,
                  displayLabel: 'FORGED captured label',
                },
              }
            : {}),
          ...(variant === 'state'
            ? {
                status: 'done',
                completion: { actorMembershipId: c.membershipId, recordedAt },
              }
            : {}),
        };
        const fact = {
          format: 'company-internal-task-history-v1',
          workspaceId,
          companyId: c.companyId,
          taskId: c.id,
          version: 2,
          kind: variant === 'state' ? 'MOVE' : 'EDIT',
          actorMembershipId: c.membershipId,
          recordedAt,
          before:
            variant === 'predecessor'
              ? { ...c.task, title: 'FORGED predecessor' }
              : c.task,
          after,
        };
        const intent = {
          format: 'company-internal-task-command-v1',
          workspaceId,
          actorMembershipId: c.membershipId,
          companyId: c.companyId,
          taskId: c.id,
          kind: 'CHANGE',
          body:
            variant === 'state'
              ? { kind: 'MOVE', expectedVersion: 1, status: 'done' }
              : {
                  kind: 'EDIT',
                  expectedVersion: 1,
                  ...(variant === 'assignee-label'
                    ? { assigneeMembershipId: c.membershipId }
                    : {}),
                  title:
                    variant === 'intent'
                      ? 'Different intended correction'
                      : 'FORGED correction',
                },
        };
        const receiptTask =
          variant === 'receipt'
            ? { ...after, description: 'FORGED receipt only' }
            : after;
        const response = {
          format: 'company-internal-task-command-v1',
          task: receiptTask,
          changed: true,
          history:
            variant === 'receipt' ? { ...fact, after: receiptTask } : fact,
        };
        let reachedCommit = false;
        async function forge() {
          const db = await fixture.pool.connect();
          try {
            await db.query('BEGIN');
            await db.query(
              'UPDATE internal_company_tasks SET version=2,snapshot=$2::jsonb,assignee_membership_id=$3 WHERE id=$1',
              [
                c.id,
                JSON.stringify(
                  variant === 'current'
                    ? { ...after, title: 'FORGED current only' }
                    : after,
                ),
                variant === 'assignee-label' ? c.membershipId : null,
              ],
            );
            await db.query(
              'INSERT INTO internal_company_task_history(workspace_id,company_id,task_id,version,actor_membership_id,actor_internal_user_id,recorded_at,fact) VALUES($1,$2,$3,2,$4,$5,$6,$7::jsonb)',
              [
                workspaceId,
                c.companyId,
                c.id,
                c.membershipId,
                c.internalUserId,
                recordedAt,
                JSON.stringify(fact),
              ],
            );
            await db.query(
              'INSERT INTO internal_company_task_events(workspace_id,company_id,task_id,version,actor_membership_id,actor_internal_user_id,recorded_at,action,metadata) VALUES($1,$2,$3,2,$4,$5,$6,$7,$8::jsonb)',
              [
                workspaceId,
                c.companyId,
                c.id,
                c.membershipId,
                c.internalUserId,
                recordedAt,
                variant === 'event'
                  ? 'internal_task.status.changed'
                  : variant === 'state'
                    ? 'internal_task.status.changed'
                    : 'internal_task.updated',
                JSON.stringify({ version: 2 }),
              ],
            );
            await db.query(
              'INSERT INTO internal_company_task_commands(workspace_id,company_id,task_id,version,actor_membership_id,actor_internal_user_id,recorded_at,assignment_id,idempotency_key,intent,changed,response) VALUES($1,$2,$3,2,$4,$5,$6,$7,$8,$9::jsonb,1,$10::jsonb)',
              [
                workspaceId,
                c.companyId,
                c.id,
                c.membershipId,
                c.internalUserId,
                recordedAt,
                c.assignmentId,
                'fully-coupled-forgery',
                JSON.stringify(intent),
                JSON.stringify(response),
              ],
            );
            reachedCommit = true;
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
          constraint:
            variant === 'current'
              ? 'ict_head_coupling'
              : ['predecessor', 'receipt', 'event'].includes(variant)
                ? 'ict_history_coupling'
                : 'ict_command_coupling',
        });
        expect(reachedCommit, variant).toBe(true);
        expect(
          await json(
            await fixture.request('/company-internal-tasks/' + c.id, {
              companyId: c.companyId,
              subject: 'manager',
            }),
          ),
        ).toEqual(before);
        for (const table of [
          'internal_company_tasks',
          'internal_company_task_history',
          'internal_company_task_commands',
          'internal_company_task_events',
        ])
          expect(
            (
              await fixture.pool.query(
                `SELECT count(*)::integer AS n FROM ${table}`,
              )
            ).rows,
          ).toEqual([{ n: 1 }]);
      },
    );
    it('refuses malformed native snapshot CHECKs, missing coupling, immutable rewrite/delete and unknown captures before application fault injection', async () => {
      const c = await prepare();
      for (const bad of [
        { ...c.task, format: 'future-snapshot-v2' },
        { ...c.task, description: 42 },
        {
          ...c.task,
          status: 'blocked',
          reason: {
            kind: null,
            text: 'Reason',
            actorMembershipId: c.membershipId,
            recordedAt: c.task.updatedAt,
          },
        },
        {
          ...c.task,
          completion: {
            actorMembershipId: c.membershipId,
            recordedAt: c.task.updatedAt,
          },
        },
        { ...c.task, extra: true },
      ]) {
        const id = randomUUID(),
          value = { ...bad, id };
        expect(
          (
            await fixture.pool.query(
              'SELECT ict_snapshot_valid($1::jsonb) AS valid',
              [JSON.stringify(value)],
            )
          ).rows,
        ).toEqual([{ valid: false }]);
        await expect(
          fixture.pool.query(
            'INSERT INTO internal_company_tasks(workspace_id,company_id,id,version,creator_membership_id,created_at,snapshot) VALUES($1,$2,$3,1,$4,$5,$6::jsonb)',
            [
              workspaceId,
              c.companyId,
              id,
              c.membershipId,
              c.task.createdAt,
              JSON.stringify(value),
            ],
          ),
        ).rejects.toMatchObject({
          code: '23514',
          constraint: 'ict_snapshot_check',
        });
      }
      for (const table of [
        'internal_company_tasks',
        'internal_company_task_history',
        'internal_company_task_commands',
        'internal_company_task_events',
      ]) {
        await expect(
          fixture.pool.query(`DELETE FROM ${table}`),
        ).rejects.toMatchObject({ code: '23514' });
        const column =
          table === 'internal_company_tasks' ? 'version' : 'recorded_at';
        await expect(
          fixture.pool.query(`UPDATE ${table} SET ${column}=${column}`),
        ).rejects.toMatchObject({ code: '23514' });
      }
      const id = randomUUID(),
        snapshot = { ...c.task, id };
      await expect(
        fixture.pool.query(
          'INSERT INTO internal_company_tasks(workspace_id,company_id,id,version,creator_membership_id,created_at,snapshot) VALUES($1,$2,$3,1,$4,$5,$6::jsonb)',
          [
            workspaceId,
            c.companyId,
            id,
            c.membershipId,
            c.task.createdAt,
            JSON.stringify(snapshot),
          ],
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'ict_head_coupling',
      });
      for (const capture of [null, 'v2', 'unknown'])
        await expect(
          fixture.pool.query(
            'UPDATE company_role_assignments SET permission_set_version=$2 WHERE id=$1',
            [c.assignmentId, capture],
          ),
        ).rejects.toMatchObject({ code: '23514' });
      expect(
        (
          await fixture.pool.query(
            'SELECT count(*)::integer AS n FROM internal_company_tasks',
          )
        ).rows,
      ).toEqual([{ n: 1 }]);
    });
    it('rejects cross-Workspace creator and assignee references independently of the REST boundary', async () => {
      const c = await prepare(),
        foreignWorkspace = randomUUID(),
        foreignMember = randomUUID(),
        foreignUser = randomUUID();
      await fixture.pool.query(
        'INSERT INTO workspaces(id,name) VALUES($1,$2)',
        [foreignWorkspace, 'Foreign DEMO'],
      );
      await fixture.pool.query(
        'INSERT INTO internal_users(id,external_provider,external_subject,display_name,email) VALUES($1,$2,$3,$4,$5)',
        [
          foreignUser,
          'deterministic-test',
          'foreign-user',
          'Foreign DEMO',
          'foreign@example.test',
        ],
      );
      await fixture.pool.query(
        'INSERT INTO workspace_memberships(id,workspace_id,internal_user_id) VALUES($1,$2,$3)',
        [foreignMember, foreignWorkspace, foreignUser],
      );
      for (const role of ['creator', 'assignee']) {
        const id = randomUUID(),
          snapshot = {
            ...c.task,
            id,
            ...(role === 'creator'
              ? { createdByMembershipId: foreignMember }
              : {
                  assignee: {
                    membershipId: foreignMember,
                    displayLabel: 'Foreign DEMO',
                  },
                }),
          };
        await expect(
          fixture.pool.query(
            'INSERT INTO internal_company_tasks(workspace_id,company_id,id,version,creator_membership_id,assignee_membership_id,created_at,snapshot) VALUES($1,$2,$3,1,$4,$5,$6,$7::jsonb)',
            [
              workspaceId,
              c.companyId,
              id,
              role === 'creator' ? foreignMember : c.membershipId,
              role === 'assignee' ? foreignMember : null,
              c.task.createdAt,
              JSON.stringify(snapshot),
            ],
          ),
        ).rejects.toMatchObject({
          code: '23503',
          constraint: role === 'creator' ? 'ict_creator_fk' : 'ict_assignee_fk',
        });
      }
    });
  },
);
