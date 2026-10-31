import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  createMissionDocumentFixture,
  json,
  record,
  text,
  type MissionDocumentFixture,
} from '../documents/mission-document.test-support.js';
import {
  objects,
  legacyKey,
} from '../project-template/project-pilot-plan.test-support.js';
import {
  currentApplicability,
  demoProposal,
  observedApplicability,
  prepareApplicability,
} from './mission-applicability.test-support.js';

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)(
  'Applicability public validation, independent authority and bounded history',
  () => {
    let fixture: MissionDocumentFixture;
    beforeAll(async () => {
      if (!url) throw new Error('PostgreSQL required');
      fixture = await createMissionDocumentFixture(url);
    });
    afterAll(async () => fixture?.close());
    async function propose(
      path: string,
      taskId: string,
      patch: Record<string, unknown> = {},
      key?: string,
    ) {
      return fixture.call(path, {
        method: 'POST',
        key,
        body: {
          ...(await observedApplicability(fixture, path, taskId)),
          ...demoProposal,
          ...patch,
        },
      });
    }
    async function atomicState(clientId: string) {
      const state = await fixture.pool.query(
        'SELECT (SELECT count(*)::int FROM mission_applicability_facts) AS facts,(SELECT count(*)::int FROM mission_applicability_commands) AS receipts,(SELECT count(*)::int FROM mission_applicability_events) AS events,(SELECT version FROM client_accounts WHERE id=$1) AS client_version',
        [clientId],
      );
      return state.rows;
    }
    it('applies combined evidence privacy before revealing even an unsupported Project projection', async () => {
      const c = await prepareApplicability(fixture);
      const created = await fixture.call('/projects', {
        method: 'POST',
        body: {
          clientAccountId: c.clientId,
          title: 'Unsupported protected Project DEMO',
        },
      });
      expect(created.status).toBe(201);
      const path = `/projects/${text((await json(created)).id)}/mission-applicability`;
      expect(
        (
          await fixture.call(
            `/company-document-content-reader-assignments/${c.membershipId}/${c.companyId}`,
            { method: 'DELETE', company: null },
          )
        ).status,
      ).toBe(200);
      expect(await json(await fixture.call(path))).toEqual({
        applicability: { kind: 'unavailable' },
      });
      expect(
        await json(await fixture.call(path + '/history?beforeRevision=1')),
      ).toEqual({ history: { kind: 'unavailable' } });
      expect(
        (await fixture.call(`/projects/${c.projectId}/template`)).status,
      ).toBe(200);
      expect((await fixture.call(`/tasks/${c.taskId}`)).status).toBe(200);
    });
    it('keeps Coordinator, Approver, Reviewer, reads and captured grant administration independent, including replay after revocation', async () => {
      const c = await prepareApplicability(fixture),
        body = {
          ...(await observedApplicability(fixture, c.path, c.taskId)),
          ...demoProposal,
        };
      await fixture.grant('/company-mission-result-reviewer-assignments');
      expect(
        (await fixture.call(c.path, { method: 'POST', body })).status,
      ).toBe(403);
      const coordinator = await fixture.grant(
        '/company-mission-applicability-coordinator-assignments',
      );
      expect(coordinator).toMatchObject({
        bundle: 'Company Mission Applicability Coordinator',
        permissionSetVersion: 'v1',
        active: true,
      });
      let company = record(
        (await json(await fixture.call('/access/current-actor'))).activeCompany,
      );
      expect(company.missionApplicabilityProposalPermissions).toEqual([
        'project.mission_applicability.propose',
      ]);
      expect(company.missionApplicabilityDecisionPermissions).toBeUndefined();
      const proposal = await fixture.call(c.path, {
        method: 'POST',
        key: 'independent-proposal-demo',
        body,
      });
      expect(proposal.status).toBe(201);
      const receipt = await json(proposal);
      const decision = {
        ...(await observedApplicability(fixture, c.path, c.taskId)),
        action: 'DECIDE',
        proposalId: receipt.factId,
        outcome: 'REJECT',
        basis: 'DEMO explicit refusal',
      };
      expect(
        (await fixture.call(c.path, { method: 'POST', body: decision })).status,
      ).toBe(403);
      await fixture.grant(
        '/company-mission-applicability-approver-assignments',
      );
      company = record(
        (await json(await fixture.call('/access/current-actor'))).activeCompany,
      );
      expect(company.missionApplicabilityDecisionPermissions).toEqual([
        'project.mission_applicability.decide',
        'project.mission_applicability.restore',
      ]);
      expect(company.missionResultReviewPermissions).toEqual([
        'project.mission_result.review',
      ]);
      const rejected = await fixture.call(c.path, {
        method: 'POST',
        key: 'independent-decision-demo',
        body: decision,
      });
      expect(rejected.status).toBe(201);
      const conserved = await json(rejected);
      expect(
        (
          await fixture.call(
            `/company-mission-applicability-coordinator-assignments/${c.membershipId}/${c.companyId}`,
            { method: 'DELETE', company: null },
          )
        ).status,
      ).toBe(200);
      expect((await fixture.call(c.path)).status).toBe(200);
      expect((await fixture.call(c.path + '/history')).status).toBe(200);
      expect(
        (
          await fixture.call(c.path, {
            method: 'POST',
            key: 'independent-proposal-demo',
            body,
          })
        ).status,
      ).toBe(403);
      expect(
        await json(
          await fixture.call(c.path, {
            method: 'POST',
            key: 'independent-decision-demo',
            body: decision,
          }),
        ),
      ).toEqual(conserved);
      await fixture.grant(
        '/company-mission-applicability-coordinator-assignments',
      );
      const newCompany = record(
        (await json(await fixture.call('/access/current-actor'))).activeCompany,
      );
      expect(newCompany.missionApplicabilityCoordinatorAssignmentId).not.toBe(
        company.missionApplicabilityCoordinatorAssignmentId,
      );
      expect(
        await json(
          await fixture.call(c.path, {
            method: 'POST',
            key: 'independent-proposal-demo',
            body,
          }),
        ),
      ).toEqual(receipt);
    }, 20000);

    it.each([
      'mission-deliverable-access',
      'document-content-reader',
      'document-registrar',
    ])(
      'returns only protected-unavailable for independently denied %s even before any fact, keeping native source and Task reads usable',
      async (bundle) => {
        const c = await prepareApplicability(fixture);
        expect(
          (
            await fixture.call(
              `/company-${bundle}-assignments/${c.membershipId}/${c.companyId}`,
              { method: 'DELETE', company: null },
            )
          ).status,
        ).toBe(200);
        expect(await json(await fixture.call(c.path))).toEqual({
          applicability: { kind: 'unavailable' },
        });
        expect(
          await json(await fixture.call(c.path + '/history?beforeRevision=1')),
        ).toEqual({ history: { kind: 'unavailable' } });
        expect(
          (await fixture.call(`/projects/${c.projectId}/template`)).status,
        ).toBe(200);
        expect((await fixture.call(`/tasks/${c.taskId}`)).status).toBe(200);
      },
    );

    it('rejects closed grammar, malformed keys/routes/cursors and invalid Unicode without effects, preserving code points and interior line endings', async () => {
      const c = await prepareApplicability(fixture);
      await fixture.grant(
        '/company-mission-applicability-coordinator-assignments',
      );
      const body = {
          ...(await observedApplicability(fixture, c.path, c.taskId)),
          ...demoProposal,
        },
        before = await atomicState(c.clientId);
      for (const patch of [
        { action: 'WITHDRAW' },
        { action: null },
        { taskId: randomUUID() },
        { expectedTaskVersion: 0 },
        { expectedResultRevision: -1 },
        { expectedLifecycleRevision: 2147483648 },
        { expectedApplicabilityRevision: 0.1 },
        { reason: '' },
        { reason: '  ' },
        { reason: 'x'.repeat(1001) },
        { reason: '\uD800' },
        { reason: '\uDC00' },
        { reason: 'a\0b' },
        { scopeBasis: null },
        { scopeBasis: '🌍'.repeat(2001) },
        {
          agreement: {
            kind: 'PARTIES_AGREEMENT_REPORTED',
            basis: 'wrong variant',
          },
        },
        {
          agreement: {
            kind: 'NO_CONTRACTUAL_CHANGE_REPORTED',
            basis: 'DEMO',
            reference: 'unknown field',
          },
        },
        { unknown: 'forbidden' },
        { approvalId: randomUUID() },
      ]) {
        const response = await fixture.call(c.path, {
          method: 'POST',
          body: { ...body, ...patch },
        });
        expect(response.status).toBe('taskId' in patch ? 409 : 400);
      }
      expect(
        (await fixture.call(c.path, { method: 'POST', key: '   ', body }))
          .status,
      ).toBe(400);
      expect(
        (
          await fixture.call(c.path, {
            method: 'POST',
            key: 'k'.repeat(201),
            body,
          })
        ).status,
      ).toBe(400);
      expect(
        (await fixture.call('/projects/not-a-uuid/mission-applicability'))
          .status,
      ).toBe(400);
      for (const query of [
        'beforeRevision=0',
        'beforeRevision=01',
        'beforeRevision=-1',
        'beforeRevision=2147483648',
        'beforeRevision=abc',
        'unknown=1',
        'beforeRevision=1',
      ])
        expect((await fixture.call(c.path + '/history?' + query)).status).toBe(
          400,
        );
      expect(await atomicState(c.clientId)).toEqual(before);
      const exact = {
        ...body,
        reason: '\uFEFF' + '🌍'.repeat(1000) + '\u00A0',
        scopeBasis: ' \r\nDEMO\r\nЖ / é <script>literal</script>\n ',
      };
      const recorded = await fixture.call(c.path, {
        method: 'POST',
        body: exact,
      });
      expect(recorded.status).toBe(201);
      const history = record(
          (await json(await fixture.call(c.path + '/history'))).history,
        ),
        intent = record(objects(history.facts)[0]?.intent);
      expect(intent.reason).toBe('🌍'.repeat(1000));
      expect(intent.scopeBasis).toBe('DEMO\r\nЖ / é <script>literal</script>');
    }, 30000);

    it('stores only a fresh conserved receipt for allowed no-ops at current observations and refuses changed-key/stale/predecessor intent', async () => {
      const c = await prepareApplicability(fixture);
      await fixture.grant(
        '/company-mission-applicability-coordinator-assignments',
      );
      await fixture.grant(
        '/company-mission-applicability-approver-assignments',
      );
      const original = {
        ...(await observedApplicability(fixture, c.path, c.taskId)),
        ...demoProposal,
      };
      const firstResponse = await fixture.call(c.path, {
        method: 'POST',
        key: 'conserved-first-demo',
        body: original,
      });
      expect(firstResponse.status).toBe(201);
      const first = await json(firstResponse);
      const before = await atomicState(c.clientId);
      const unchanged = await propose(
        c.path,
        c.taskId,
        {},
        'conserved-new-key-demo',
      );
      expect(unchanged.status).toBe(201);
      expect(await json(unchanged)).toEqual({ ...first, action: 'unchanged' });
      const after = await atomicState(c.clientId);
      expect(record(after[0]).facts).toBe(record(before[0]).facts);
      expect(record(after[0]).events).toBe(record(before[0]).events);
      expect(record(after[0]).client_version).toBe(
        record(before[0]).client_version,
      );
      expect(record(after[0]).receipts).toBe(
        Number(record(before[0]).receipts) + 1,
      );
      for (const body of [
        { ...original, reason: 'Different intent DEMO' },
        { ...original, taskId: text(c.activities[0]?.taskId) },
        {
          ...(await observedApplicability(fixture, c.path, c.taskId)),
          action: 'RESTORE',
          approvalId: first.factId,
          basis: 'Changed action DEMO',
        },
      ])
        expect(
          (
            await fixture.call(c.path, {
              method: 'POST',
              key: 'conserved-first-demo',
              body,
            })
          ).status,
        ).toBe(409);
      expect(
        (await fixture.call(c.path, { method: 'POST', body: original })).status,
      ).toBe(409);
      const decision = {
        ...(await observedApplicability(fixture, c.path, c.taskId)),
        action: 'DECIDE',
        proposalId: first.factId,
        outcome: 'REJECT',
        basis: 'DEMO required work',
      };
      const decided = await fixture.call(c.path, {
        method: 'POST',
        body: decision,
      });
      expect(decided.status).toBe(201);
      const decisionReceipt = await json(decided);
      const otherTask = text(c.activities[0]?.taskId);
      expect((await propose(c.path, otherTask)).status).toBe(201);
      const repeated = await fixture.call(c.path, {
        method: 'POST',
        body: {
          ...decision,
          ...(await observedApplicability(fixture, c.path, c.taskId)),
        },
      });
      expect(repeated.status).toBe(201);
      expect(await json(repeated)).toEqual({
        ...decisionReceipt,
        action: 'unchanged',
      });
      expect(
        await json(
          await fixture.call(c.path, {
            method: 'POST',
            key: 'conserved-first-demo',
            body: original,
          }),
        ),
      ).toEqual(first);
    }, 30000);

    it('retains unconditional clarification when CT_AN13 is excluded, pages exactly twenty-five Project facts and preserves closure confirmation', async () => {
      const c = await prepareApplicability(fixture);
      await fixture.grant(
        '/company-mission-applicability-coordinator-assignments',
      );
      await fixture.grant(
        '/company-mission-applicability-approver-assignments',
      );
      await fixture.grant('/company-project-approver-assignments');
      const certificationTask = text(c.activities[12]?.taskId),
        body = {
          ...(await observedApplicability(fixture, c.path, certificationTask)),
          ...demoProposal,
          agreement: {
            kind: 'NO_CONTRACTUAL_CHANGE_REPORTED',
            basis: 'DEMO illustrative scope only',
          },
        };
      const proposed = await fixture.call(c.path, {
        method: 'POST',
        key: 'certification-proposal-demo',
        body,
      });
      expect(proposed.status).toBe(201);
      const proposalReceipt = await json(proposed);
      const approved = await fixture.call(c.path, {
        method: 'POST',
        body: {
          ...(await observedApplicability(fixture, c.path, certificationTask)),
          action: 'DECIDE',
          proposalId: proposalReceipt.factId,
          outcome: 'APPROVE',
          basis: 'DEMO reported scope',
        },
      });
      expect(approved.status).toBe(201);
      let current = await currentApplicability(fixture, c.path);
      expect(objects(current.activities)[12]?.applicability).toBe(
        'EXCLUDED_BY_APPROVER',
      );
      expect(current.clarification).toEqual({
        state: 'BUSINESS_CLARIFICATION_PENDING',
        questionId: 'MISSION-CLOSE-01',
      });
      for (let index = 0; index < 13; index++) {
        const response = await propose(c.path, c.taskId, {
          reason: `DEMO history cycle ${index}`,
        });
        expect(response.status).toBe(201);
        const receipt = await json(response);
        expect(
          (
            await fixture.call(c.path, {
              method: 'POST',
              body: {
                ...(await observedApplicability(fixture, c.path, c.taskId)),
                action: 'DECIDE',
                proposalId: receipt.factId,
                outcome: 'REJECT',
                basis: `DEMO preserve required ${index}`,
              },
            })
          ).status,
        ).toBe(201);
      }
      const page = record(
        (await json(await fixture.call(c.path + '/history'))).history,
      );
      expect(objects(page.facts).map((row) => row.revision)).toEqual(
        Array.from({ length: 25 }, (_, index) => 28 - index),
      );
      expect(page).toMatchObject({ hasMore: true, nextBeforeRevision: 4 });
      const older = record(
        (await json(await fixture.call(c.path + '/history?beforeRevision=4')))
          .history,
      );
      expect(objects(older.facts).map((row) => row.revision)).toEqual([
        3, 2, 1,
      ]);
      expect(older).toMatchObject({ hasMore: false, nextBeforeRevision: null });
      const closeBody = {
        action: 'cancel',
        expectedLifecycleRevision: 0,
        reason: 'DEMO historical read-only',
      };
      expect(
        (
          await fixture.call(`/projects/${c.projectId}/lifecycle-transitions`, {
            method: 'POST',
            body: closeBody,
          })
        ).status,
      ).toBe(409);
      for (const activity of c.activities)
        expect(
          (
            await fixture.call(`/tasks/${text(activity.taskId)}/cancel`, {
              method: 'POST',
              body: {
                expectedVersion: 1,
                reason: 'DEMO ordinary closure preparation',
              },
            })
          ).status,
        ).toBe(201);
      const closed = await fixture.call(
        `/projects/${c.projectId}/lifecycle-transitions`,
        { method: 'POST', body: closeBody },
      );
      expect(closed.status).toBe(200);
      current = await currentApplicability(fixture, c.path);
      expect(current.mutable).toBe(false);
      expect(
        await json(
          await fixture.call(c.path, {
            method: 'POST',
            key: 'certification-proposal-demo',
            body,
          }),
        ),
      ).toEqual(proposalReceipt);
      expect((await propose(c.path, c.taskId)).status).toBe(409);
      expect((await fixture.call(c.path + '/history')).status).toBe(200);
    }, 60000);

    it('returns unsupported for legitimate manual and legacy plans and preserves foreign-resource nondisclosure', async () => {
      const c = await prepareApplicability(fixture);
      const manual = await fixture.call('/projects', {
        method: 'POST',
        body: { clientAccountId: c.clientId, title: 'Manual unsupported DEMO' },
      });
      expect(manual.status).toBe(201);
      const manualId = text((await json(manual)).id);
      const legacy = await fixture.call('/projects/from-template', {
        method: 'POST',
        body: {
          clientAccountId: c.clientId,
          title: 'Legacy unsupported DEMO',
          templateKey: legacyKey,
          templateVersion: 1,
        },
      });
      expect(legacy.status).toBe(201);
      const legacyId = text((await json(legacy)).id);
      for (const projectId of [manualId, legacyId]) {
        expect(
          await json(
            await fixture.call(`/projects/${projectId}/mission-applicability`),
          ),
        ).toEqual({ applicability: null });
        expect(
          await json(
            await fixture.call(
              `/projects/${projectId}/mission-applicability/history`,
            ),
          ),
        ).toEqual({ history: null });
      }
      const foreign = await fixture.call(c.path, {
        identity: {
          subject: 'foreign-document-member',
          displayName: 'Foreign DEMO',
          email: 'foreign@example.test',
        },
      });
      expect(foreign.status).toBe(403);
      expect(await json(foreign)).not.toHaveProperty('applicability');
      expect(
        (await fixture.call(`/projects/${randomUUID()}/mission-applicability`))
          .status,
      ).toBe(404);
    }, 20000);

    it('normalizes UUID route and target representation before fingerprinting and conserves the original receipt across case-equivalent confirmation', async () => {
      const c = await prepareApplicability(fixture);
      await fixture.grant(
        '/company-mission-applicability-coordinator-assignments',
      );
      const body = {
        ...(await observedApplicability(fixture, c.path, c.taskId)),
        ...demoProposal,
        taskId: c.taskId.toUpperCase(),
      };
      const first = await fixture.call(
        c.path.replace(c.projectId, c.projectId.toUpperCase()),
        { method: 'POST', key: 'canonical-route-demo', body },
      );
      expect(first.status).toBe(201);
      const receipt = await json(first);
      expect(receipt.projectId).toBe(c.projectId);
      const confirmation = await fixture.call(c.path, {
        method: 'POST',
        key: 'canonical-route-demo',
        body: { ...body, taskId: c.taskId },
      });
      expect(confirmation.status).toBe(201);
      expect(await json(confirmation)).toEqual(receipt);
    });
  },
);
