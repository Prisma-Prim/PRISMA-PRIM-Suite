import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createMissionDocumentFixture,
  json,
  record,
  text,
  type MissionDocumentFixture,
} from '../documents/mission-document.test-support.js';
import { objects } from '../project-template/project-pilot-plan.test-support.js';
import {
  currentApplicability,
  demoProposal,
  observedApplicability,
  prepareApplicability,
} from './mission-applicability.test-support.js';

const url = process.env.TEST_DATABASE_URL;
const coordinatorB = {
  subject: 'mission-collaborator',
  displayName: 'Second Coordinator DEMO',
  email: 'second-coordinator@example.test',
};
describe.skipIf(!url)('Cross-Coordinator exact pending corrections', () => {
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
    const actorB = await json(
      await fixture.call('/access/current-actor', {
        identity: coordinatorB,
        company: null,
      }),
    );
    const memberB = text(actorB.workspaceMembershipId);
    for (const bundle of [
      'context',
      'director-client',
      'project',
      'task-manager',
      'project-template-user',
      'document-registrar',
      'mission-deliverable-access',
      'document-content-reader',
    ])
      expect(
        (
          await fixture.call(`/company-${bundle}-assignments`, {
            method: 'POST',
            company: null,
            body: { companyId: c.companyId, workspaceMembershipId: memberB },
          })
        ).status,
      ).toBe(201);
    const proposal = {
      ...(await observedApplicability(fixture, c.path, c.taskId)),
      ...demoProposal,
      agreement: {
        kind: 'NO_CONTRACTUAL_CHANGE_REPORTED',
        basis: 'DEMO unchanged reported undertaking',
      },
    };
    const response = await fixture.call(c.path, {
      method: 'POST',
      key: 'coordinator-a-proposal-demo',
      body: proposal,
    });
    expect(response.status).toBe(201);
    const receiptA = await json(response);
    const current = await currentApplicability(fixture, c.path);
    const row = objects(current.activities).find(
      (activity) => record(activity.task).id === c.taskId,
    );
    if (!row) throw new Error('Missing mapped activity');
    const correction = {
      ...record(record(row.pendingProposal).intent),
      ...(await observedApplicability(fixture, c.path, c.taskId)),
      action: 'CORRECT_PROPOSAL',
      proposalId: receiptA.factId,
      correctionReason: 'DEMO review confirms the same complete scope',
    };
    return {
      ...c,
      memberB,
      actorB,
      proposal,
      normalizedProposal: record(record(row.pendingProposal).intent),
      receiptA,
      correction,
    };
  }

  async function grantCoordinatorB(companyId: string, memberB: string) {
    const response = await fixture.call(
      '/company-mission-applicability-coordinator-assignments',
      {
        method: 'POST',
        company: null,
        body: { companyId, workspaceMembershipId: memberB },
      },
    );
    expect(response.status).toBe(201);
    return json(response);
  }
  async function snapshot(clientId: string) {
    const state: Record<string, unknown> = {};
    for (const table of [
      'mission_applicability_facts',
      'mission_applicability_streams',
      'mission_applicability_events',
    ])
      state[table] = (
        await fixture.pool.query(
          `SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY to_jsonb(t)::text`,
        )
      ).rows;
    state.client = (
      await fixture.pool.query(
        'SELECT version,updated_at FROM client_accounts WHERE id=$1',
        [clientId],
      )
    ).rows;
    return state;
  }

  it("conserves another Coordinator's exact pending content with only one caller-owned unchanged receipt and exact replay", async () => {
    const c = await prepare();
    expect(
      (
        await fixture.call(c.path, {
          method: 'POST',
          identity: coordinatorB,
          body: c.correction,
        })
      ).status,
    ).toBe(403);
    await grantCoordinatorB(c.companyId, c.memberB);
    const before = await snapshot(c.clientId);
    const history = await json(await fixture.call(c.path + '/history'));
    const options = {
      method: 'POST',
      identity: coordinatorB,
      key: 'coordinator-b-identical-correction-demo',
      body: c.correction,
    };
    const response = await fixture.call(c.path, options);
    expect(response.status).toBe(201);
    const receiptB = { ...c.receiptA, action: 'unchanged' };
    expect(await json(response)).toEqual(receiptB);
    expect(await snapshot(c.clientId)).toEqual(before);
    expect(
      await json(
        await fixture.call(c.path + '/history', { identity: coordinatorB }),
      ),
    ).toEqual(history);
    const receipts = await fixture.pool.query(
      'SELECT actor_membership_id,action,fact_id,applicability_revision FROM mission_applicability_commands WHERE actor_membership_id=$1',
      [c.memberB],
    );
    expect(receipts.rows).toEqual([
      {
        actor_membership_id: c.memberB,
        action: 'unchanged',
        fact_id: c.receiptA.factId,
        applicability_revision: 1,
      },
    ]);
    expect(await json(await fixture.call(c.path, options))).toEqual(receiptB);
    expect(await snapshot(c.clientId)).toEqual(before);
    expect(
      (
        await fixture.pool.query(
          'SELECT count(*)::int AS count FROM mission_applicability_commands',
        )
      ).rows,
    ).toEqual([{ count: 2 }]);
  });

  it('attributes a material correction to its new Coordinator, rejects stale or superseded targets and preserves the earlier unchanged receipt', async () => {
    const c = await prepare();
    await grantCoordinatorB(c.companyId, c.memberB);
    const history = await json(await fixture.call(c.path + '/history'));
    const options = {
      method: 'POST',
      identity: coordinatorB,
      key: 'b-conserved-before-material-demo',
      body: c.correction,
    };
    const receiptB = { ...c.receiptA, action: 'unchanged' };
    const unchanged = await fixture.call(c.path, options);
    expect(unchanged.status).toBe(201);
    expect(await json(unchanged)).toEqual(receiptB);
    const captureB = record(
      (
        await json(
          await fixture.call('/access/current-actor', {
            identity: coordinatorB,
          }),
        )
      ).activeCompany,
    );
    const changed = await fixture.call(c.path, {
      ...options,
      key: 'coordinator-b-material-correction-demo',
      body: {
        ...c.correction,
        reason: 'DEMO genuinely changed complete reason',
      },
    });
    expect(changed.status).toBe(201);
    const material = await json(changed);
    expect(material).toMatchObject({
      action: 'recorded',
      applicabilityRevision: 2,
    });
    expect(material.factId).not.toBe(c.receiptA.factId);
    const facts = objects(
      record((await json(await fixture.call(c.path + '/history'))).history)
        .facts,
    );
    expect(facts[1]).toEqual(objects(record(history.history).facts)[0]);
    expect(facts[0]).toMatchObject({
      kind: 'PROPOSAL_CORRECTED',
      activityPredecessorId: c.receiptA.factId,
      actor: {
        workspaceMembershipId: c.memberB,
        internalUserId: c.actorB.internalUserId,
      },
      capture: {
        assignmentId: captureB.missionApplicabilityCoordinatorAssignmentId,
        permissionSetVersion: 'v1',
      },
    });
    const afterMaterial = await snapshot(c.clientId);
    expect(await json(await fixture.call(c.path, options))).toEqual(receiptB);
    for (const body of [
      c.correction,
      {
        ...c.correction,
        ...(await observedApplicability(fixture, c.path, c.taskId)),
      },
    ])
      expect(
        (
          await fixture.call(c.path, {
            method: 'POST',
            identity: coordinatorB,
            body,
          })
        ).status,
      ).toBe(409);
    expect(await snapshot(c.clientId)).toEqual(afterMaterial);
  });

  const cloneReceipt =
    'INSERT INTO mission_applicability_commands SELECT (jsonb_populate_record(NULL::mission_applicability_commands,to_jsonb(c)||$3::jsonb)).* FROM mission_applicability_commands c WHERE actor_membership_id=$1 AND idempotency_key=$2 RETURNING actor_membership_id,fact_id,action';

  it('admits only exact current cross-Coordinator correction receipts while sealing original recorded and event attribution', async () => {
    const c = await prepare();
    await grantCoordinatorB(c.companyId, c.memberB);
    const response = await fixture.call(c.path, {
      method: 'POST',
      identity: coordinatorB,
      key: 'native-b-correction-demo',
      body: c.correction,
    });
    expect(response.status).toBe(201);
    expect(await json(response)).toEqual({
      ...c.receiptA,
      action: 'unchanged',
    });
    const before = await snapshot(c.clientId);
    const connection = await fixture.pool.connect();
    try {
      await connection.query('BEGIN');
      const positive = await connection.query(cloneReceipt, [
        c.memberB,
        'native-b-correction-demo',
        JSON.stringify({
          idempotency_key: 'native-current-correction-positive-demo',
        }),
      ]);
      expect(positive.rows).toEqual([
        {
          actor_membership_id: c.memberB,
          fact_id: c.receiptA.factId,
          action: 'unchanged',
        },
      ]);
    } finally {
      await connection.query('ROLLBACK');
      connection.release();
    }
    await expect(
      fixture.pool.query(cloneReceipt, [
        c.membershipId,
        'coordinator-a-proposal-demo',
        JSON.stringify({
          actor_membership_id: c.memberB,
          idempotency_key: 'forged-b-recorded-demo',
        }),
      ]),
    ).rejects.toThrow(/Applicability audit actor mismatch/u);
    await expect(
      fixture.pool.query(
        'INSERT INTO mission_applicability_events SELECT (jsonb_populate_record(NULL::mission_applicability_events,to_jsonb(e)||$1::jsonb)).* FROM mission_applicability_events e',
        [
          JSON.stringify({
            actor_membership_id: c.memberB,
            actor_internal_user_id: c.actorB.internalUserId,
          }),
        ],
      ),
    ).rejects.toThrow(/Applicability audit actor mismatch/u);
    for (const patch of [
      { reason: 'DEMO content is now different' },
      { proposalId: '00000000-0000-4000-8000-000000000999' },
      { expectedApplicabilityRevision: 0 },
      { unexpected: 'DEMO unknown payload' },
    ])
      await expect(
        fixture.pool.query(cloneReceipt, [
          c.memberB,
          'native-b-correction-demo',
          JSON.stringify({
            idempotency_key: 'forged-b-correction-demo',
            command: JSON.stringify({
              companyId: c.companyId,
              projectId: c.projectId,
              ...c.correction,
              ...patch,
            }),
          }),
        ]),
      ).rejects.toMatchObject({ code: '23514' });
    expect(
      (
        await fixture.call(
          `/company-mission-applicability-coordinator-assignments/${c.memberB}/${c.companyId}`,
          { method: 'DELETE', company: null },
        )
      ).status,
    ).toBe(200);
    await expect(
      fixture.pool.query(cloneReceipt, [
        c.memberB,
        'native-b-correction-demo',
        JSON.stringify({ idempotency_key: 'revoked-b-correction-demo' }),
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    expect(
      (
        await fixture.call(c.path, {
          method: 'POST',
          identity: coordinatorB,
          key: 'native-b-correction-demo',
          body: c.correction,
        })
      ).status,
    ).toBe(403);
    expect(await snapshot(c.clientId)).toEqual(before);
    expect(
      (
        await fixture.pool.query(
          'SELECT count(*)::int AS count FROM mission_applicability_commands',
        )
      ).rows,
    ).toEqual([{ count: 2 }]);
  });

  it.each(['PROPOSE', 'DECIDE', 'RESTORE'] as const)(
    'keeps %s unchanged limited to its original actor',
    async (action) => {
      const c = await prepare();
      await grantCoordinatorB(c.companyId, c.memberB);
      let body: Record<string, unknown> = c.normalizedProposal;
      let originalKey = 'coordinator-a-proposal-demo';
      if (action !== 'PROPOSE') {
        await fixture.grant(
          '/company-mission-applicability-approver-assignments',
        );
        expect(
          (
            await fixture.call(
              '/company-mission-applicability-approver-assignments',
              {
                method: 'POST',
                company: null,
                body: {
                  companyId: c.companyId,
                  workspaceMembershipId: c.memberB,
                },
              },
            )
          ).status,
        ).toBe(201);
        const decision = {
          ...(await observedApplicability(fixture, c.path, c.taskId)),
          action: 'DECIDE',
          proposalId: c.receiptA.factId,
          outcome: 'APPROVE',
          basis: 'DEMO exact decision by first actor',
        };
        const approved = await fixture.call(c.path, {
          method: 'POST',
          key: 'actor-a-decision-demo',
          body: decision,
        });
        expect(approved.status).toBe(201);
        body = decision;
        originalKey = 'actor-a-decision-demo';
        if (action === 'RESTORE') {
          const approval = await json(approved);
          body = {
            ...(await observedApplicability(fixture, c.path, c.taskId)),
            action: 'RESTORE',
            approvalId: approval.factId,
            basis: 'DEMO exact restoration by first actor',
          };
          originalKey = 'actor-a-restore-demo';
          expect(
            (
              await fixture.call(c.path, {
                method: 'POST',
                key: originalKey,
                body,
              })
            ).status,
          ).toBe(201);
        }
      }
      body = {
        ...body,
        ...(await observedApplicability(fixture, c.path, c.taskId)),
      };
      const before = await snapshot(c.clientId);
      expect(
        (
          await fixture.call(c.path, {
            method: 'POST',
            identity: coordinatorB,
            body,
          })
        ).status,
      ).toBe(409);
      await expect(
        fixture.pool.query(cloneReceipt, [
          c.membershipId,
          originalKey,
          JSON.stringify({
            actor_membership_id: c.memberB,
            idempotency_key: 'forged-other-actor-unchanged-demo',
            action: 'unchanged',
            command: JSON.stringify({
              companyId: c.companyId,
              projectId: c.projectId,
              ...body,
            }),
          }),
        ]),
      ).rejects.toThrow(/Applicability audit actor mismatch/u);
      expect(await snapshot(c.clientId)).toEqual(before);
    },
  );
});
