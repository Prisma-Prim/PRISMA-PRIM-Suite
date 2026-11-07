import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CERTIFICATION_APPROVER,
  CERTIFICATION_AUDITOR,
  CERTIFICATION_OWNER,
  openCertificationFixture,
  record,
} from './certification.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;

type Subject =
  | typeof CERTIFICATION_OWNER
  | typeof CERTIFICATION_AUDITOR
  | typeof CERTIFICATION_APPROVER;

const TEXTS = [
  {
    language: 'ro',
    holderName: 'Lactis Demo SRL',
    address: 'Str. Exemplu 1, Demo City',
    scope: 'Producerea laptelui pasteurizat (exemplu)',
  },
  {
    language: 'en',
    holderName: 'Lactis Demo LLC',
    address: '1 Example Street, Demo City',
    scope: 'Production of pasteurised milk (example)',
  },
];

const ITEMS = [
  'application',
  'application_review',
  'duration',
  'agreement',
  'team_approval',
  'stage_1_plan',
  'stage_1_report',
  'stage_2_plan',
  'stage_2_report',
  'participant_lists',
  'findings_follow_up',
  'recommendation',
  'certificate_data',
];

function review(missing?: string) {
  return {
    items: Object.fromEntries(
      ITEMS.map((item) => [
        item,
        item === missing
          ? { answer: 'missing', note: 'Signed list not received.' }
          : {
              answer:
                item === 'findings_follow_up' ? 'not_applicable' : 'present',
              note: null,
            },
      ]),
    ),
    conclusion: 'Dossier complete; recommendation supported.',
    independenceAttested: true,
  };
}

withPostgres(
  'Certification Case decision and Certificate',
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
    /** Both Stages reported without Findings (revision 16). */
    async function reportedCase(
      approval: Record<string, unknown> | null = null,
    ) {
      const caseId = await fixture.approvedTeamCase();
      const base = `/certification-cases/${caseId}`;
      await ok(CERTIFICATION_OWNER, `${base}/stages/stage-1/plan`, {
        expectedRevision: 9,
        ...plan(await fixture.attach(caseId, 'plan', 8), '2026-10-01', '1'),
      });
      await ok(CERTIFICATION_AUDITOR, `${base}/stages/stage-1/report`, {
        expectedRevision: 11,
        reportDate: '2026-10-01',
        documentReviewCompleted: true,
        conclusion: 'ready',
        conclusionNote: 'Ready.',
        reportAttachmentId: await fixture.attach(caseId, 'report', 10),
      });
      await ok(CERTIFICATION_OWNER, `${base}/stages/stage-2/plan`, {
        expectedRevision: 13,
        ...plan(await fixture.attach(caseId, 'plan', 12), '2026-10-20', '1.5'),
      });
      await ok(CERTIFICATION_AUDITOR, `${base}/stages/stage-2/report`, {
        expectedRevision: 15,
        reportDate: '2026-10-21',
        summary: 'Stage 2 completed.',
        reportAttachmentId: await fixture.attach(caseId, 'report', 14),
        certificationBodyApproval: approval,
      });
      return caseId;
    }
    async function recommendedCase(recommendation = 'grant') {
      const caseId = await reportedCase();
      await ok(
        CERTIFICATION_AUDITOR,
        `/certification-cases/${caseId}/recommendation`,
        {
          expectedRevision: 16,
          recommendation,
          basis: 'No nonconformity; system effectively implemented.',
        },
      );
      return caseId;
    }
    function decision(
      expectedRevision: number,
      overrides: Record<string, unknown> = {},
    ) {
      return {
        expectedRevision,
        decision: 'granted',
        decidedOn: '2026-11-06',
        decidedBy: 'Decision Maker Demo',
        decidedByFunction: 'Head of the certification body',
        decisionFormAttachmentId: null,
        independenceAttested: true,
        grantedTexts: TEXTS,
        rationale: 'Recommendation accepted after the dossier review.',
        additionalInformation: null,
        ...overrides,
      };
    }

    beforeAll(async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
      fixture = await openCertificationFixture({
        databaseUrl,
        namePrefix: 'certification1146',
        workspaceId: '00000000-0000-4000-8000-000000001146',
      });
    }, 240_000);

    afterAll(async () => {
      await fixture?.close();
    });

    it('decides and records the Certificate with its computed validity', async () => {
      const caseId = await recommendedCase();
      const base = `/certification-cases/${caseId}`;
      expect(
        await ok(CERTIFICATION_APPROVER, `${base}/dossier-review`, {
          expectedRevision: 17,
          ...review(),
        }),
      ).toMatchObject({ revision: 18, nextStep: 'decision' });
      expect(
        await ok(CERTIFICATION_APPROVER, `${base}/decision`, decision(18)),
      ).toMatchObject({
        revision: 19,
        nextStep: 'certificate_data',
        decision: { value: { decision: 'granted', decidedOn: '2026-11-06' } },
      });
      // What the decision relied on is frozen once it is recorded.
      const evidence = await fixture.attach(caseId, 'evidence', 19);
      const lateFinding = await post(
        CERTIFICATION_AUDITOR,
        `${base}/findings`,
        {
          expectedRevision: 20,
          stage: 'stage_2',
          classification: 'major_nonconformity',
          clause: '8.5.1',
          area: 'Receiving',
          statement: 'Found after the decision.',
          evidenceAttachmentIds: [evidence],
        },
      );
      expect(lateFinding.status).toBe(409);
      expect(record(await lateFinding.json()).code).toBe(
        'CERTIFICATION_DECIDED',
      );
      const lateReport = await post(
        CERTIFICATION_AUDITOR,
        `${base}/stages/stage-2/report`,
        {
          expectedRevision: 20,
          reason: 'Changed after the decision.',
          reportDate: '2026-10-21',
          summary: 'Stage 2 completed, revised.',
          reportAttachmentId: evidence,
        },
      );
      expect(record(await lateReport.json()).code).toBe(
        'CERTIFICATION_DECIDED',
      );
      const form = await fixture.attach(caseId, 'certificate_data', 20);
      expect(
        await ok(CERTIFICATION_OWNER, `${base}/certificate-data`, {
          expectedRevision: 21,
          texts: TEXTS,
          agreedOn: '2026-10-21',
          agreementAttachmentId: form,
        }),
      ).toMatchObject({ revision: 22, nextStep: 'certificate' });
      const pdf = await fixture.attach(caseId, 'certificate', 22);
      const certified = await ok(
        CERTIFICATION_APPROVER,
        `${base}/certificate`,
        {
          expectedRevision: 23,
          number: 'DEMO-0001',
          attachmentId: pdf,
          signedBy: 'Decision Maker Demo',
          signedByFunction: 'Head of the certification body',
          independenceAttested: true,
        },
      );
      expect(certified).toMatchObject({
        status: 'certified',
        nextStep: null,
        certificate: {
          number: 'DEMO-0001',
          validFrom: '2026-11-06',
          validUntil: '2029-11-05',
          firstSurveillanceBy: '2027-11-06',
          texts: TEXTS,
          signedBy: 'Decision Maker Demo',
        },
      });
      expect(await fixture.eventCount(caseId)).toBe(24);
      const second = await post(
        CERTIFICATION_APPROVER,
        `${base}/decision`,
        decision(24),
      );
      expect(second.status).toBe(409);
      const other = await recommendedCase();
      const otherBase = `/certification-cases/${other}`;
      await ok(CERTIFICATION_APPROVER, `${otherBase}/dossier-review`, {
        expectedRevision: 17,
        ...review(),
      });
      await ok(CERTIFICATION_APPROVER, `${otherBase}/decision`, decision(18));
      const otherForm = await fixture.attach(other, 'certificate_data', 19);
      await ok(CERTIFICATION_OWNER, `${otherBase}/certificate-data`, {
        expectedRevision: 20,
        texts: [{ ...TEXTS[1], scope: 'Production of milk' }],
        agreedOn: '2026-10-21',
        agreementAttachmentId: otherForm,
      });
      const otherPdf = await fixture.attach(other, 'certificate', 21);
      const certificate = {
        number: 'DEMO-0001',
        attachmentId: otherPdf,
        signedBy: null,
        signedByFunction: null,
        independenceAttested: true,
      };
      const differs = await post(
        CERTIFICATION_APPROVER,
        `${otherBase}/certificate`,
        { expectedRevision: 22, ...certificate },
      );
      expect(record(await differs.json()).code).toBe(
        'CERTIFICATION_CERTIFICATE_DATA_DIFFERS',
      );
      const unattested = await post(
        CERTIFICATION_APPROVER,
        `${otherBase}/certificate`,
        { expectedRevision: 22, ...certificate, independenceAttested: false },
      );
      expect(record(await unattested.json()).code).toBe(
        'CERTIFICATION_INDEPENDENCE_ATTESTATION',
      );
      await ok(CERTIFICATION_OWNER, `${otherBase}/certificate-data`, {
        expectedRevision: 22,
        reason: 'Texts aligned with the decision.',
        texts: TEXTS,
        agreedOn: '2026-10-22',
        agreementAttachmentId: otherForm,
      });
      const duplicate = await post(
        CERTIFICATION_APPROVER,
        `${otherBase}/certificate`,
        { expectedRevision: 23, ...certificate },
      );
      expect(record(await duplicate.json()).code).toBe(
        'CERTIFICATION_CERTIFICATE_NUMBER_TAKEN',
      );
    });

    it('keeps every team member, past ones included, apart from the review and the decision', async () => {
      function member(name: string, role: string, membership: string | null) {
        return {
          name,
          role,
          workspaceMembershipId: membership,
          holdsCategory: role === 'team_leader',
          competenceNote: 'ISO 22000 auditor',
          declarations: {
            noConsultancy: 'confirmed',
            noEmployment: 'confirmed',
            noManagementInvolvement: 'confirmed',
            confidentiality: 'confirmed',
          },
          conflictNote: null,
        };
      }
      const leader = member(
        'Auditor Demo',
        'team_leader',
        fixture.membership(CERTIFICATION_AUDITOR),
      );
      const caseId = await recommendedCase();
      const base = `/certification-cases/${caseId}`;
      // A technical expert joins (version 2), then leaves (version 3).
      await ok(CERTIFICATION_OWNER, `${base}/team`, {
        expectedRevision: 17,
        reason: 'A technical expert joins.',
        members: [leader, member('Expert Demo', 'technical_expert', null)],
      });
      await ok(CERTIFICATION_APPROVER, `${base}/team-decision`, {
        expectedRevision: 18,
        teamVersion: 2,
        decision: 'approved',
        independenceAttested: true,
      });
      await ok(CERTIFICATION_OWNER, `${base}/team`, {
        expectedRevision: 19,
        reason: 'The technical expert leaves.',
        members: [leader],
      });
      await ok(CERTIFICATION_APPROVER, `${base}/team-decision`, {
        expectedRevision: 20,
        teamVersion: 3,
        decision: 'approved',
        independenceAttested: true,
      });
      await ok(CERTIFICATION_APPROVER, `${base}/dossier-review`, {
        expectedRevision: 21,
        ...review(),
      });
      const formerMember = await post(
        CERTIFICATION_APPROVER,
        `${base}/decision`,
        decision(22, { decidedBy: 'Expert Demo' }),
      );
      expect(record(await formerMember.json()).code).toBe(
        'CERTIFICATION_INDEPENDENCE',
      );
      const reviewerJoins = await post(CERTIFICATION_OWNER, `${base}/team`, {
        expectedRevision: 22,
        reason: 'The dossier reviewer joins as an observer.',
        members: [
          leader,
          member(
            'Reviewer Demo',
            'observer',
            fixture.membership(CERTIFICATION_APPROVER),
          ),
        ],
      });
      expect(record(await reviewerJoins.json()).code).toBe(
        'CERTIFICATION_INDEPENDENCE',
      );
      expect(await fixture.eventCount(caseId)).toBe(22);
    });

    it('keeps the Stage 2 report approval made on behalf of the certification body', async () => {
      const approval = {
        actedBy: 'Head of Body Demo',
        actedByFunction: 'Head of the certification body',
        actedOn: '2026-10-22',
        formAttachmentId: null,
      };
      const caseId = await reportedCase(approval);
      const view = record(
        await (
          await fixture.call(
            CERTIFICATION_OWNER,
            `/certification-cases/${caseId}`,
            { method: 'GET' },
          )
        ).json(),
      );
      expect(view).toMatchObject({
        stages: expect.arrayContaining([
          expect.objectContaining({
            step: 'stage_2_report',
            value: expect.objectContaining({
              certificationBodyApproval: approval,
            }),
          }),
        ]),
      });
    });

    it('corrects the decided texts with a reason and keeps the decided outcome', async () => {
      const caseId = await recommendedCase();
      const base = `/certification-cases/${caseId}`;
      await ok(CERTIFICATION_APPROVER, `${base}/dossier-review`, {
        expectedRevision: 17,
        ...review(),
      });
      await ok(CERTIFICATION_APPROVER, `${base}/decision`, decision(18));
      const corrected = decision(19, {
        grantedTexts: [TEXTS[0]],
        decidedOn: '2026-11-07',
      });
      const unexplained = await post(
        CERTIFICATION_APPROVER,
        `${base}/decision`,
        corrected,
      );
      expect(record(await unexplained.json()).code).toBe(
        'CERTIFICATION_CORRECTION_REASON',
      );
      expect(
        await ok(CERTIFICATION_APPROVER, `${base}/decision`, {
          ...corrected,
          reason: 'The English text is not part of the decision.',
        }),
      ).toMatchObject({
        revision: 20,
        nextStep: 'certificate_data',
        decision: {
          version: 2,
          value: { decision: 'granted', grantedTexts: [TEXTS[0]] },
        },
      });
      const reversed = await post(CERTIFICATION_APPROVER, `${base}/decision`, {
        ...decision(20, { decision: 'refused', grantedTexts: null }),
        reason: 'Outcome changed.',
      });
      expect(reversed.status).toBe(409);
      expect(record(await reversed.json()).code).toBe(
        'CERTIFICATION_DECISION_OUTCOME_FIXED',
      );
      expect(await fixture.eventCount(caseId)).toBe(20);
    });

    it('refuses a decision with unmet preconditions, against the recommendation or by a team member', async () => {
      const caseId = await recommendedCase();
      const base = `/certification-cases/${caseId}`;
      const unchanged = await post(
        CERTIFICATION_AUDITOR,
        `${base}/recommendation`,
        {
          expectedRevision: 17,
          reason: 'Same recommendation',
          recommendation: 'grant',
          basis: 'No nonconformity; system effectively implemented.',
        },
      );
      expect(record(await unchanged.json()).code).toBe(
        'CERTIFICATION_CORRECTION_UNCHANGED',
      );
      const early = await post(
        CERTIFICATION_APPROVER,
        `${base}/decision`,
        decision(17),
      );
      const earlyBody = record(await early.json());
      expect(earlyBody.code).toBe('CERTIFICATION_DECISION_PRECONDITIONS');
      expect(earlyBody.failures).toEqual(['DOSSIER_REVIEW_INCOMPLETE']);
      await ok(CERTIFICATION_APPROVER, `${base}/dossier-review`, {
        expectedRevision: 17,
        ...review('participant_lists'),
      });
      const incomplete = await post(
        CERTIFICATION_APPROVER,
        `${base}/decision`,
        decision(18, { decidedOn: '2026-12-31' }),
      );
      expect(record(await incomplete.json()).failures).toEqual([
        'DOSSIER_REVIEW_INCOMPLETE',
        'DECISION_IN_FUTURE',
      ]);
      const namedOnTeam = await post(
        CERTIFICATION_APPROVER,
        `${base}/decision`,
        decision(18, { decidedBy: '  auditor   DEMO ' }),
      );
      expect(record(await namedOnTeam.json()).code).toBe(
        'CERTIFICATION_INDEPENDENCE',
      );
      const notAForm = await fixture.attach(caseId, 'report', 18);
      const wrongForm = await post(
        CERTIFICATION_APPROVER,
        `${base}/decision`,
        decision(19, { decisionFormAttachmentId: notAForm }),
      );
      expect(record(await wrongForm.json()).code).toBe(
        'CERTIFICATION_ATTACHMENT_ROLE',
      );
      await fixture.grant(
        CERTIFICATION_AUDITOR,
        '/company-certification-approver-assignments',
      );
      const teamMember = await post(
        CERTIFICATION_AUDITOR,
        `${base}/decision`,
        decision(19),
      );
      expect(record(await teamMember.json()).code).toBe(
        'CERTIFICATION_INDEPENDENCE',
      );

      const negative = await recommendedCase('do_not_grant');
      const negativeBase = `/certification-cases/${negative}`;
      await ok(CERTIFICATION_APPROVER, `${negativeBase}/dossier-review`, {
        expectedRevision: 17,
        ...review(),
      });
      const against = await post(
        CERTIFICATION_APPROVER,
        `${negativeBase}/decision`,
        decision(18),
      );
      expect(record(await against.json()).failures).toEqual([
        'GRANT_AGAINST_RECOMMENDATION',
      ]);
      const refused = await ok(
        CERTIFICATION_APPROVER,
        `${negativeBase}/decision`,
        decision(18, {
          decision: 'refused',
          grantedTexts: null,
          rationale: 'Recommendation not to grant accepted.',
        }),
      );
      expect(refused).toMatchObject({ status: 'refused', nextStep: null });
      const closed = await post(
        CERTIFICATION_OWNER,
        `${negativeBase}/certificate-data`,
        {
          expectedRevision: 19,
          texts: TEXTS,
          agreedOn: '2026-10-21',
          agreementAttachmentId: '00000000-0000-4000-8000-000000000001',
        },
      );
      expect(record(await closed.json()).code).toBe(
        'CERTIFICATION_CASE_CLOSED',
      );
      const unreported = await fixture.approvedTeamCase();
      const tooEarly = await post(
        CERTIFICATION_AUDITOR,
        `/certification-cases/${unreported}/recommendation`,
        { expectedRevision: 8, recommendation: 'grant', basis: 'Too early.' },
      );
      expect(record(await tooEarly.json()).code).toBe(
        'CERTIFICATION_STAGE_2_NOT_REPORTED',
      );
    });
  },
);
