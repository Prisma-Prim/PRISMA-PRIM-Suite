import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CERTIFICATION_AUDITOR,
  CERTIFICATION_OWNER,
  CERTIFICATION_READER,
  openCertificationFixture,
  record,
} from './certification.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;

function plan(
  planAttachmentId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    startDate: '2026-11-10',
    endDate: '2026-11-10',
    onSiteDays: '1',
    remoteDays: '0',
    objectives: 'Evaluate readiness of the food safety management system',
    scope: 'Production of pasteurised milk and yoghurt',
    planAttachmentId,
    sentToClientOn: '2026-11-03',
    deviationNote: null,
    ...overrides,
  };
}

withPostgres('Certification Case Stage 1 and Stage 2 Audits', { timeout: 60_000 }, () => {
  let fixture: Awaited<ReturnType<typeof openCertificationFixture>>;

  function post(
    subject:
      | typeof CERTIFICATION_OWNER
      | typeof CERTIFICATION_AUDITOR
      | typeof CERTIFICATION_READER,
    path: string,
    body: Record<string, unknown>,
  ) {
    return fixture.call(subject, path, { method: 'POST', body });
  }

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    fixture = await openCertificationFixture({
      databaseUrl,
      namePrefix: 'certification1138',
      workspaceId: '00000000-0000-4000-8000-000000001138',
    });
  }, 240_000);

  afterAll(async () => {
    await fixture?.close();
  });

  it('plans and reports both Stages, with a justified Stage 2 deviation', async () => {
    const caseId = await fixture.approvedTeamCase();
    const plan1 = await fixture.attach(caseId, 'plan', 8);
    expect(
      await fixture.created(
        await post(
          CERTIFICATION_OWNER,
          `/certification-cases/${caseId}/stages/stage-1/plan`,
          {
            expectedRevision: 9,
            ...plan(plan1),
          },
        ),
      ),
    ).toMatchObject({ revision: 10, nextStep: 'stage_1_report' });
    const report1 = await fixture.attach(caseId, 'report', 10);
    const participants1 = await fixture.attach(caseId, 'participant_list', 11);
    expect(
      await fixture.created(
        await post(
          CERTIFICATION_AUDITOR,
          `/certification-cases/${caseId}/stages/stage-1/report`,
          {
            expectedRevision: 12,
            reportDate: '2026-11-10',
            documentReviewCompleted: true,
            conclusion: 'ready',
            conclusionNote: 'Documented system implemented; ready for Stage 2.',
            reportAttachmentId: report1,
            participantListAttachmentId: participants1,
          },
        ),
      ),
    ).toMatchObject({ revision: 13, nextStep: 'stage_2_plan' });
    const plan2 = await fixture.attach(caseId, 'plan', 13);
    const undeclared = await post(
      CERTIFICATION_OWNER,
      `/certification-cases/${caseId}/stages/stage-2/plan`,
      {
        expectedRevision: 14,
        ...plan(plan2, {
          startDate: '2026-11-20',
          endDate: '2026-11-21',
          onSiteDays: '1.25',
        }),
      },
    );
    expect(record(await undeclared.json()).code).toBe(
      'CERTIFICATION_STAGE_DEVIATION_NOTE',
    );
    expect(
      await fixture.created(
        await post(
          CERTIFICATION_OWNER,
          `/certification-cases/${caseId}/stages/stage-2/plan`,
          {
            expectedRevision: 14,
            ...plan(plan2, {
              startDate: '2026-11-20',
              endDate: '2026-11-21',
              onSiteDays: '1.25',
              deviationNote: 'One production line idle during the audit.',
            }),
          },
        ),
      ),
    ).toMatchObject({ revision: 15, nextStep: 'stage_2_report' });
    const report2 = await fixture.attach(caseId, 'report', 15);
    const reported = await fixture.created(
      await post(
        CERTIFICATION_AUDITOR,
        `/certification-cases/${caseId}/stages/stage-2/report`,
        {
          expectedRevision: 16,
          reportDate: '2026-11-21',
          summary: 'Stage 2 completed as planned.',
          reportAttachmentId: report2,
          participantListAttachmentId: null,
          annexAttachmentId: null,
        },
      ),
    );
    expect(reported).toMatchObject({
      revision: 17,
      nextStep: 'recommendation',
      stages: [
        { step: 'stage_1_plan', version: 1 },
        { step: 'stage_1_report', version: 1, value: { conclusion: 'ready' } },
        { step: 'stage_2_plan', version: 1, value: { onSiteDays: '1.25' } },
        { step: 'stage_2_report', version: 1 },
      ],
    });
    expect(await fixture.eventCount(caseId)).toBe(17);
  });

  it('keeps Stage 2 closed after a not-ready Stage 1 until a corrected report', async () => {
    const caseId = await fixture.approvedTeamCase();
    const plan1 = await fixture.attach(caseId, 'plan', 8);
    await fixture.created(
      await post(
        CERTIFICATION_OWNER,
        `/certification-cases/${caseId}/stages/stage-1/plan`,
        {
          expectedRevision: 9,
          ...plan(plan1),
        },
      ),
    );
    const report1 = await fixture.attach(caseId, 'report', 10);
    const notReady = await fixture.created(
      await post(
        CERTIFICATION_AUDITOR,
        `/certification-cases/${caseId}/stages/stage-1/report`,
        {
          expectedRevision: 11,
          reportDate: '2026-11-10',
          documentReviewCompleted: true,
          conclusion: 'not_ready',
          conclusionNote: 'Hazard analysis incomplete.',
          reportAttachmentId: report1,
        },
      ),
    );
    expect(notReady).toMatchObject({ nextStep: 'stage_1_report' });
    const plan2 = await fixture.attach(caseId, 'plan', 12);
    const early = await post(
      CERTIFICATION_OWNER,
      `/certification-cases/${caseId}/stages/stage-2/plan`,
      {
        expectedRevision: 13,
        ...plan(plan2, {
          startDate: '2026-11-20',
          endDate: '2026-11-21',
          onSiteDays: '1.5',
        }),
      },
    );
    expect(record(await early.json()).code).toBe(
      'CERTIFICATION_STAGE_1_NOT_READY',
    );
    expect(
      await fixture.created(
        await post(
          CERTIFICATION_AUDITOR,
          `/certification-cases/${caseId}/stages/stage-1/report`,
          {
            expectedRevision: 13,
            reason: 'Hazard analysis completed and verified.',
            reportDate: '2026-11-14',
            documentReviewCompleted: true,
            conclusion: 'ready',
            conclusionNote: 'Ready after the completed hazard analysis.',
            reportAttachmentId: report1,
          },
        ),
      ),
    ).toMatchObject({ nextStep: 'stage_2_plan' });
  });

  it('refuses plans before team approval, wrong roles, incomplete document review and non-leaders', async () => {
    const unapproved = await fixture.agreedCase();
    const draft = await fixture.attach(unapproved, 'plan', 6);
    const beforeTeam = await post(
      CERTIFICATION_OWNER,
      `/certification-cases/${unapproved}/stages/stage-1/plan`,
      { expectedRevision: 7, ...plan(draft) },
    );
    expect(record(await beforeTeam.json()).code).toBe(
      'CERTIFICATION_TEAM_NOT_APPROVED',
    );
    const caseId = await fixture.approvedTeamCase();
    const notAPlan = await fixture.attach(caseId, 'report', 8);
    const wrongRole = await post(
      CERTIFICATION_OWNER,
      `/certification-cases/${caseId}/stages/stage-1/plan`,
      { expectedRevision: 9, ...plan(notAPlan) },
    );
    expect(record(await wrongRole.json()).code).toBe(
      'CERTIFICATION_ATTACHMENT_ROLE',
    );
    const plan1 = await fixture.attach(caseId, 'plan', 9);
    await fixture.created(
      await post(
        CERTIFICATION_OWNER,
        `/certification-cases/${caseId}/stages/stage-1/plan`,
        {
          expectedRevision: 10,
          ...plan(plan1),
        },
      ),
    );
    const report = {
      expectedRevision: 11,
      reportDate: '2026-11-10',
      documentReviewCompleted: true,
      conclusion: 'ready',
      conclusionNote: 'Ready.',
      reportAttachmentId: notAPlan,
    };
    const incomplete = await post(
      CERTIFICATION_AUDITOR,
      `/certification-cases/${caseId}/stages/stage-1/report`,
      { ...report, documentReviewCompleted: false },
    );
    expect(record(await incomplete.json()).code).toBe(
      'CERTIFICATION_DOCUMENT_REVIEW_INCOMPLETE',
    );
    const programmeManager = await post(
      CERTIFICATION_OWNER,
      `/certification-cases/${caseId}/stages/stage-1/report`,
      report,
    );
    expect(programmeManager.status).toBe(403);
    await fixture.grant(
      CERTIFICATION_READER,
      '/company-certification-auditor-assignments',
    );
    const notLeader = await post(
      CERTIFICATION_READER,
      `/certification-cases/${caseId}/stages/stage-1/report`,
      report,
    );
    expect(record(await notLeader.json()).code).toBe(
      'CERTIFICATION_NOT_TEAM_LEADER',
    );
    const unknownStage = await post(
      CERTIFICATION_OWNER,
      `/certification-cases/${caseId}/stages/stage-3/plan`,
      { expectedRevision: 11 },
    );
    expect(unknownStage.status).toBe(404);
    expect(await fixture.eventCount(caseId)).toBe(11);
  });
});
