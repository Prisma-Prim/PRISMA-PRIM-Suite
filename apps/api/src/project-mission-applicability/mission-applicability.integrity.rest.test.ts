import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createMissionDocumentFixture,
  json,
  record,
  text,
  type MissionDocumentFixture,
} from '../documents/mission-document.test-support.js';
import {
  demoProposal,
  observedApplicability,
  prepareApplicability,
} from './mission-applicability.test-support.js';
import { objects } from '../project-template/project-pilot-plan.test-support.js';

const url = process.env.TEST_DATABASE_URL;
const tables = [
  'mission_applicability_facts',
  'mission_applicability_streams',
  'mission_applicability_commands',
  'mission_applicability_events',
] as const;
describe.skipIf(!url)(
  'Applicability immutable native integrity behind public HTTP facts',
  () => {
    let fixture: MissionDocumentFixture;
    beforeAll(async () => {
      if (!url) throw new Error('PostgreSQL required');
      fixture = await createMissionDocumentFixture(url);
    });
    afterAll(async () => fixture?.close());
    async function prepare() {
      const c = await prepareApplicability(fixture);
      await fixture.grant(
        '/company-mission-applicability-coordinator-assignments',
      );
      const body = {
        ...(await observedApplicability(fixture, c.path, c.taskId)),
        ...demoProposal,
      };
      const response = await fixture.call(c.path, {
        method: 'POST',
        key: 'native-integrity-original-demo',
        body,
      });
      expect(response.status).toBe(201);
      const factId = text((await json(response)).factId);
      const projection = record(
          (await json(await fixture.call(c.path))).applicability,
        ),
        activity = objects(projection.activities).find(
          (row) => record(row.task).id === c.taskId,
        );
      if (!activity) throw new Error('Missing public native proposal');
      const intent = {
        ...record(record(activity.pendingProposal).intent),
        expectedApplicabilityRevision: 1,
        action: 'CORRECT_PROPOSAL',
        proposalId: factId,
        reason: 'Corrected native literal DEMO',
        correctionReason: 'Exact native successor DEMO',
      };
      const successor = {
        id: randomUUID(),
        revision: 2,
        predecessor_id: factId,
        activity_predecessor_id: factId,
        kind: 'PROPOSAL_CORRECTED',
        intent,
        occurred_at: new Date().toISOString(),
      };
      return { ...c, body, factId, intent, successor };
    }
    async function snapshot(clientId: string) {
      const rows: Record<string, unknown> = {};
      for (const table of tables)
        rows[table] = (
          await fixture.pool.query(
            `SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY to_jsonb(t)::text`,
          )
        ).rows;
      rows.client = (
        await fixture.pool.query(
          'SELECT version,updated_at FROM client_accounts WHERE id=$1',
          [clientId],
        )
      ).rows;
      return rows;
    }
    const insert =
      'INSERT INTO mission_applicability_facts SELECT (jsonb_populate_record(NULL::mission_applicability_facts,to_jsonb(f)||$2::jsonb)).* FROM mission_applicability_facts f WHERE f.id=$1 RETURNING id';

    it('rejects cross-scope/capture/source/Task/result links and forged predecessors or action variants before any partial audit can commit', async () => {
      const c = await prepare(),
        before = await snapshot(c.clientId),
        foreign = randomUUID();
      const cases: Array<[Record<string, unknown>, RegExp]> = [
        [{ workspace_id: foreign }, /Inactive applicability parent/u],
        [{ company_id: foreign }, /Inactive applicability parent/u],
        [{ project_id: foreign }, /query returned no rows/u],
        [{ client_account_id: foreign }, /Inactive original Client/u],
        [{ relationship_id: foreign }, /Invalid original relationship/u],
        [
          { task_id: foreign, intent: { ...c.intent, taskId: foreign } },
          /query returned no rows/u,
        ],
        [{ actor_internal_user_id: foreign }, /Inactive applicability parent/u],
        [{ actor_membership_id: foreign }, /Inactive applicability parent/u],
        [{ assignment_id: foreign }, /Invalid applicability capture/u],
        [{ permission_set_version: 'v2' }, /ma_facts_meaning_check/u],
        [
          { source_title: 'Forged criterion DEMO' },
          /Invalid preserved criterion/u,
        ],
        [{ position: 5 }, /Invalid preserved criterion/u],
        [
          { predecessor_id: foreign },
          /Invalid applicability stream predecessor/u,
        ],
        [{ activity_predecessor_id: foreign }, /Invalid activity predecessor/u],
        [{ kind: 'APPROVED' }, /Applicability observation mismatch/u],
        [
          { intent: { ...c.intent, unknown: 'forged' } },
          /Invalid applicability intent/u,
        ],
        [
          { intent: { ...c.intent, proposalId: foreign } },
          /Invalid exact pending proposal/u,
        ],
        [
          { task_version: 2, intent: { ...c.intent, expectedTaskVersion: 2 } },
          /Invalid applicability Task/u,
        ],
        [
          {
            result_id: foreign,
            result_revision: 1,
            intent: { ...c.intent, expectedResultRevision: 1 },
          },
          /Invalid applicability result/u,
        ],
        [
          {
            lifecycle_revision: 1,
            intent: { ...c.intent, expectedLifecycleRevision: 1 },
          },
          /Invalid applicability Project/u,
        ],
        [
          {
            revision: 2147483647,
            intent: { ...c.intent, expectedApplicabilityRevision: 2147483646 },
          },
          /Invalid applicability stream predecessor/u,
        ],
      ];
      for (const [patch, message] of cases)
        await expect(
          fixture.pool.query(insert, [
            c.factId,
            JSON.stringify({ ...c.successor, ...patch }),
          ]),
        ).rejects.toThrow(message);
      await expect(
        fixture.pool.query(insert, [
          c.factId,
          JSON.stringify({ ...c.successor, revision: 2147483648 }),
        ]),
      ).rejects.toMatchObject({ code: '22003' });
      expect(await snapshot(c.clientId)).toEqual(before);
    });

    it.each(tables)(
      'seals all existing %s rows against update and deletion',
      async (table) => {
        const c = await prepare(),
          before = await snapshot(c.clientId);
        const column =
          table === 'mission_applicability_streams'
            ? 'revision'
            : table === 'mission_applicability_facts'
              ? 'actor_display_name'
              : table === 'mission_applicability_events'
                ? 'action'
                : 'command';
        await expect(
          fixture.pool.query(`UPDATE ${table} SET ${column}=${column}`),
        ).rejects.toMatchObject({ code: '23514' });
        await expect(
          fixture.pool.query(`DELETE FROM ${table}`),
        ).rejects.toMatchObject({ code: '23514' });
        expect(await snapshot(c.clientId)).toEqual(before);
      },
    );

    it.each([
      'missing-all',
      'missing-event',
      'missing-receipt',
      'missing-fence',
    ] as const)(
      'refuses a genuine otherwise-valid successor at commit when coupled state is %s',
      async (missing) => {
        const c = await prepare(),
          before = await snapshot(c.clientId),
          connection = await fixture.pool.connect();
        try {
          await connection.query('BEGIN');
          const created = await connection.query(insert, [
              c.factId,
              JSON.stringify(c.successor),
            ]),
            id = text(record(created.rows[0]).id);
          await connection.query(
            'UPDATE mission_applicability_streams SET revision=2,fact_id=$1 WHERE project_id=$2',
            [id, c.projectId],
          );
          if (missing !== 'missing-all' && missing !== 'missing-event')
            await connection.query(
              'INSERT INTO mission_applicability_events SELECT (jsonb_populate_record(NULL::mission_applicability_events,to_jsonb(e)||$2::jsonb)).* FROM mission_applicability_events e WHERE fact_id=$1',
              [
                c.factId,
                JSON.stringify({
                  id: randomUUID(),
                  fact_id: id,
                  applicability_revision: 2,
                  action: 'project.mission_applicability.proposal_corrected',
                  occurred_at: c.successor.occurred_at,
                  metadata: { applicabilityRevision: 2 },
                }),
              ],
            );
          if (missing !== 'missing-all' && missing !== 'missing-receipt')
            await connection.query(
              'INSERT INTO mission_applicability_commands SELECT (jsonb_populate_record(NULL::mission_applicability_commands,to_jsonb(c)||$2::jsonb)).* FROM mission_applicability_commands c WHERE fact_id=$1',
              [
                c.factId,
                JSON.stringify({
                  idempotency_key: 'native-coupling-successor-demo',
                  fact_id: id,
                  applicability_revision: 2,
                  command: JSON.stringify({
                    companyId: c.companyId,
                    projectId: c.projectId,
                    ...c.intent,
                  }),
                }),
              ],
            );
          if (missing !== 'missing-fence')
            await connection.query(
              'UPDATE client_accounts SET version=version+1 WHERE id=$1',
              [c.clientId],
            );
          await expect(connection.query('COMMIT')).rejects.toMatchObject({
            code: '23514',
            constraint: 'ma_fact_seal',
          });
        } finally {
          await connection.query('ROLLBACK');
          connection.release();
        }
        expect(await snapshot(c.clientId)).toEqual(before);
      },
    );

    it('refuses forged coupled attribution/action/metadata, duplicate recorded receipts and stale unchanged intent', async () => {
      const c = await prepare(),
        before = await snapshot(c.clientId);
      for (const patch of [
        { actor_internal_user_id: randomUUID() },
        { action: 'project.mission_applicability.approved' },
        {
          metadata: {
            applicabilityRevision: 1,
            reason: 'MUST NEVER ENTER EVENT',
          },
        },
      ])
        await expect(
          fixture.pool.query(
            'INSERT INTO mission_applicability_events SELECT (jsonb_populate_record(NULL::mission_applicability_events,to_jsonb(e)||$1::jsonb)).* FROM mission_applicability_events e',
            [JSON.stringify({ id: randomUUID(), ...patch })],
          ),
        ).rejects.toMatchObject({ code: '23514' });
      await expect(
        fixture.pool.query(
          "INSERT INTO mission_applicability_commands SELECT (jsonb_populate_record(NULL::mission_applicability_commands,to_jsonb(c)||jsonb_build_object('idempotency_key','duplicate-recorded-demo'))).* FROM mission_applicability_commands c",
        ),
      ).rejects.toMatchObject({ code: '23505' });
      await expect(
        fixture.pool.query(
          "INSERT INTO mission_applicability_commands SELECT (jsonb_populate_record(NULL::mission_applicability_commands,to_jsonb(c)||jsonb_build_object('idempotency_key','stale-unchanged-demo','action','unchanged'))).* FROM mission_applicability_commands c",
        ),
      ).rejects.toMatchObject({ code: '23514' });
      expect(await snapshot(c.clientId)).toEqual(before);
    });
  },
);
