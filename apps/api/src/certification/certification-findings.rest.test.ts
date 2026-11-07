import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CERTIFICATION_APPROVER,
  CERTIFICATION_AUDITOR,
  CERTIFICATION_OWNER,
  openCertificationFixture,
  record,
  text,
} from './certification.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;

type Subject =
  | typeof CERTIFICATION_OWNER
  | typeof CERTIFICATION_AUDITOR
  | typeof CERTIFICATION_APPROVER;

withPostgres(
  'Certification Case Findings and nonconformities',
  { timeout: 60_000 },
  () => {
    let fixture: Awaited<ReturnType<typeof openCertificationFixture>>;

    function post(
      subject: Subject,
      path: string,
      body: Record<string, unknown>,
    ) {
      return fixture.call(subject, path, { method: 'POST', body });
    }
    async function ok(
      subject: Subject,
      path: string,
      body: Record<string, unknown>,
    ) {
      return fixture.created(await post(subject, path, body));
    }
    function plan(attachmentId: string, startDate: string, onSiteDays: string) {
      return {
        startDate,
        endDate: startDate,
        onSiteDays,
        remoteDays: '0',
        objectives: 'Audit objectives',
        scope: 'Production of pasteurised milk',
        planAttachmentId: attachmentId,
        sentToClientOn: null,
        deviationNote: null,
      };
    }
    function findings(detail: Record<string, unknown>) {
      const list = detail.findings;
      if (!Array.isArray(list)) throw new Error('Expected findings.');
      return list.map(record);
    }
    /** Stage 1 planned on 2026-11-10 (revision 10). */
    async function stage1Planned() {
      const caseId = await fixture.approvedTeamCase();
      const plan1 = await fixture.attach(caseId, 'plan', 8);
      await ok(
        CERTIFICATION_OWNER,
        `/certification-cases/${caseId}/stages/stage-1/plan`,
        {
          expectedRevision: 9,
          ...plan(plan1, '2026-11-10', '1'),
        },
      );
      return caseId;
    }

    beforeAll(async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
      fixture = await openCertificationFixture({
        databaseUrl,
        namePrefix: 'certification1145',
        workspaceId: '00000000-0000-4000-8000-000000001145',
      });
    }, 240_000);

    afterAll(async () => {
      await fixture?.close();
    });

    it('follows a Stage 1 nonconformity to verification before Stage 2, then a major one before the recommendation', async () => {
      const caseId = await stage1Planned();
      const evidence1 = await fixture.attach(caseId, 'evidence', 10);
      const recorded = await ok(
        CERTIFICATION_AUDITOR,
        `/certification-cases/${caseId}/findings`,
        {
          expectedRevision: 11,
          stage: 'stage_1',
          classification: 'minor_nonconformity',
          clause: '8.5.1',
          area: 'Receiving of raw milk',
          statement: 'Hazard analysis does not cover allergens at receiving.',
          evidenceAttachmentIds: [evidence1],
        },
      );
      const [minor] = findings(recorded);
      expect(minor).toMatchObject({
        stage: 'stage_1',
        sequence: 1,
        classification: 'minor_nonconformity',
        status: 'awaiting_response',
        responseDueOn: '2026-11-24',
        limitOn: '2027-05-10',
        overdue: false,
      });
      const findingId = text(minor?.id);
      await ok(
        CERTIFICATION_AUDITOR,
        `/certification-cases/${caseId}/findings`,
        {
          expectedRevision: 12,
          stage: 'stage_1',
          classification: 'area_of_concern',
          clause: '7.5',
          area: 'Document control',
          statement: 'Obsolete forms still available at the line.',
          evidenceAttachmentIds: [],
        },
      );
      const report1 = await fixture.attach(caseId, 'report', 13);
      await ok(
        CERTIFICATION_AUDITOR,
        `/certification-cases/${caseId}/stages/stage-1/report`,
        {
          expectedRevision: 14,
          reportDate: '2026-11-10',
          documentReviewCompleted: true,
          conclusion: 'ready',
          conclusionNote: 'Ready once the nonconformity is eliminated.',
          reportAttachmentId: report1,
        },
      );
      const plan2 = await fixture.attach(caseId, 'plan', 15);
      const blocked = await post(
        CERTIFICATION_OWNER,
        `/certification-cases/${caseId}/stages/stage-2/plan`,
        { expectedRevision: 16, ...plan(plan2, '2026-11-20', '1.5') },
      );
      expect(record(await blocked.json()).code).toBe(
        'CERTIFICATION_STAGE_1_NONCONFORMITY_OPEN',
      );
      const path = `/certification-cases/${caseId}/findings/${findingId}`;
      const response = {
        correction: 'Allergen added to the receiving hazard analysis.',
        cause: 'Template omitted allergens.',
        correctiveAction: 'Template revised and staff trained.',
        receivedOn: '2026-11-12',
        plannedCompletionOn: null,
        evidenceAttachmentIds: [],
      };
      await ok(CERTIFICATION_AUDITOR, `${path}/response`, {
        expectedRevision: 16,
        ...response,
      });
      await ok(CERTIFICATION_AUDITOR, `${path}/plan-judgment`, {
        expectedRevision: 17,
        outcome: 'inadequate',
        note: 'Training record missing.',
      });
      await ok(CERTIFICATION_AUDITOR, `${path}/response`, {
        expectedRevision: 18,
        ...response,
        correctiveAction: 'Template revised; training recorded.',
      });
      await ok(CERTIFICATION_AUDITOR, `${path}/plan-judgment`, {
        expectedRevision: 19,
        outcome: 'adequate',
        note: 'Plan adequate.',
      });
      const verified = await ok(CERTIFICATION_AUDITOR, `${path}/verification`, {
        expectedRevision: 20,
        verifiedOn: '2026-11-14',
        method: 'document_review',
        outcome: 'effective',
        note: 'Revised analysis and training record reviewed.',
        evidenceAttachmentIds: [],
      });
      expect(findings(verified)[0]).toMatchObject({
        status: 'verified_effective',
      });
      await ok(
        CERTIFICATION_OWNER,
        `/certification-cases/${caseId}/stages/stage-2/plan`,
        {
          expectedRevision: 21,
          ...plan(plan2, '2026-11-20', '1.5'),
        },
      );
      const evidence2 = await fixture.attach(caseId, 'evidence', 22);
      const major = findings(
        await ok(
          CERTIFICATION_AUDITOR,
          `/certification-cases/${caseId}/findings`,
          {
            expectedRevision: 23,
            stage: 'stage_2',
            classification: 'major_nonconformity',
            clause: '8.5.4.3',
            area: 'Pasteurisation CCP',
            statement:
              'Critical limit deviations were not followed by corrective actions.',
            evidenceAttachmentIds: [evidence2],
          },
        ),
      ).find((finding) => finding.sequence === 3);
      const majorPath = `/certification-cases/${caseId}/findings/${text(major?.id)}`;
      const report2 = await fixture.attach(caseId, 'report', 24);
      expect(
        await ok(
          CERTIFICATION_AUDITOR,
          `/certification-cases/${caseId}/stages/stage-2/report`,
          {
            expectedRevision: 25,
            reportDate: '2026-11-20',
            summary: 'Stage 2 completed with one major nonconformity.',
            reportAttachmentId: report2,
          },
        ),
      ).toMatchObject({ nextStep: 'findings_follow_up' });
      await ok(CERTIFICATION_AUDITOR, `${majorPath}/response`, {
        expectedRevision: 26,
        ...response,
      });
      expect(
        await ok(CERTIFICATION_AUDITOR, `${majorPath}/plan-judgment`, {
          expectedRevision: 27,
          outcome: 'adequate',
          note: 'Plan adequate.',
        }),
      ).toMatchObject({ nextStep: 'findings_follow_up' });
      expect(
        await ok(CERTIFICATION_AUDITOR, `${majorPath}/verification`, {
          expectedRevision: 28,
          verifiedOn: '2026-12-01',
          method: 'on_site',
          outcome: 'effective',
          note: 'Records of corrective actions verified on site.',
          evidenceAttachmentIds: [evidence2],
        }),
      ).toMatchObject({ nextStep: 'recommendation' });
      expect(await fixture.eventCount(caseId)).toBe(29);
    });

    it('refuses unsupported classifications, missing or foreign evidence and out-of-order follow-up, and lets the approver reclassify', async () => {
      const caseId = await stage1Planned();
      const finding = {
        expectedRevision: 10,
        stage: 'stage_1',
        classification: 'major_nonconformity',
        clause: '8.2',
        area: 'Prerequisite programmes',
        statement: 'Cleaning records missing.',
        evidenceAttachmentIds: [],
      };
      const noEvidence = await post(
        CERTIFICATION_AUDITOR,
        `/certification-cases/${caseId}/findings`,
        finding,
      );
      expect(record(await noEvidence.json()).code).toBe(
        'CERTIFICATION_FINDING_EVIDENCE_REQUIRED',
      );
      const other = await stage1Planned();
      const foreign = await fixture.attach(other, 'evidence', 10);
      const foreignEvidence = await post(
        CERTIFICATION_AUDITOR,
        `/certification-cases/${caseId}/findings`,
        { ...finding, evidenceAttachmentIds: [foreign] },
      );
      expect(record(await foreignEvidence.json()).code).toBe(
        'CERTIFICATION_ATTACHMENT_ROLE',
      );
      const programmeManager = await post(
        CERTIFICATION_OWNER,
        `/certification-cases/${caseId}/findings`,
        { ...finding, classification: 'opportunity_for_improvement' },
      );
      expect(programmeManager.status).toBe(403);
      const opportunity = findings(
        await ok(
          CERTIFICATION_AUDITOR,
          `/certification-cases/${caseId}/findings`,
          {
            ...finding,
            classification: 'opportunity_for_improvement',
          },
        ),
      )[0];
      expect(opportunity).toMatchObject({
        status: 'no_action_required',
        responseDueOn: null,
      });
      const path = `/certification-cases/${caseId}/findings/${text(opportunity?.id)}`;
      const judgment = await post(
        CERTIFICATION_AUDITOR,
        `${path}/plan-judgment`,
        {
          expectedRevision: 11,
          outcome: 'adequate',
          note: 'n/a',
        },
      );
      expect(record(await judgment.json()).code).toBe(
        'CERTIFICATION_FINDING_NO_RESPONSE',
      );
      const withoutReason = await post(
        CERTIFICATION_APPROVER,
        `${path}/reclassification`,
        {
          expectedRevision: 11,
          classification: 'area_of_concern',
        },
      );
      expect(record(await withoutReason.json()).code).toBe(
        'CERTIFICATION_CORRECTION_REASON',
      );
      const reclassified = findings(
        await ok(CERTIFICATION_APPROVER, `${path}/reclassification`, {
          expectedRevision: 11,
          reason: 'A problem area rather than an improvement point.',
          classification: 'area_of_concern',
        }),
      )[0];
      expect(reclassified).toMatchObject({
        classification: 'area_of_concern',
        records: expect.arrayContaining([
          expect.objectContaining({
            kind: 'classification',
            version: 2,
            value: { classification: 'area_of_concern', by: 'approver' },
          }),
        ]),
      });
      const unknownUpdate = await post(
        CERTIFICATION_AUDITOR,
        `${path}/deletion`,
        {
          expectedRevision: 12,
        },
      );
      expect(unknownUpdate.status).toBe(404);
      expect(await fixture.eventCount(caseId)).toBe(12);
    });

    it('accepts an opportunity for improvement without clause or area, but not other Findings', async () => {
      const caseId = await stage1Planned();
      const base = {
        expectedRevision: 10,
        stage: 'stage_1',
        clause: null,
        area: null,
        statement: 'Consider digital temperature records.',
        evidenceAttachmentIds: [],
      };
      const opportunity = findings(
        await ok(
          CERTIFICATION_AUDITOR,
          `/certification-cases/${caseId}/findings`,
          {
            ...base,
            classification: 'opportunity_for_improvement',
          },
        ),
      )[0];
      expect(opportunity).toMatchObject({
        statement: { clause: null, area: null },
        status: 'no_action_required',
      });
      const concern = await post(
        CERTIFICATION_AUDITOR,
        `/certification-cases/${caseId}/findings`,
        { ...base, expectedRevision: 11, classification: 'area_of_concern' },
      );
      expect(record(await concern.json()).code).toBe(
        'CERTIFICATION_FINDING_CLAUSE_REQUIRED',
      );
    });
  },
);
