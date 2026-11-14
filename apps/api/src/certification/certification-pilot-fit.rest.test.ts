import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CERTIFICATION_APPROVER,
  CERTIFICATION_AUDITOR,
  CERTIFICATION_OWNER,
  allCriteria,
  openCertificationFixture,
  record,
} from './certification.test-support.js';
import { certificateReleaseCommands } from './certification-release.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;

type Subject =
  | typeof CERTIFICATION_OWNER
  | typeof CERTIFICATION_AUDITOR
  | typeof CERTIFICATION_APPROVER;

const CONFIRMED = {
  noConsultancy: 'confirmed',
  noEmployment: 'confirmed',
  noManagementInvolvement: 'confirmed',
  confidentiality: 'confirmed',
};

function leader(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Auditor Demo',
    role: 'team_leader',
    workspaceMembershipId: null,
    holdsCategory: true,
    competenceNote: 'ISO 22000 lead auditor, category C',
    declarations: CONFIRMED,
    conflictNote: null,
    ...overrides,
  };
}

function onBehalf(
  actedBy: string,
  formAttachmentId: string | null = null,
  actedOn = '2026-11-03',
) {
  return {
    actedBy,
    actedByFunction: 'Head of the certification body',
    actedOn,
    formAttachmentId,
  };
}

/** A stored act as an earlier application version wrote it, before the attestation. */
function withoutAttestation(payload: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => key !== 'independenceAttested'),
  );
}

/** The fixture clock reads 2026-11-07T08:00Z: today is already 2026-11-07 everywhere, 2026-11-08 nowhere. */
const LATEST_BUSINESS_DATE = '2026-11-07';
const FUTURE = '2026-11-08';

withPostgres(
  'Certification acts on behalf of the certification body',
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

    beforeAll(async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
      fixture = await openCertificationFixture({
        databaseUrl,
        namePrefix: 'certification1152',
        workspaceId: '00000000-0000-4000-8000-000000001152',
      });
    }, 240_000);

    afterAll(async () => {
      await fixture?.close();
    });

    it('records the application date and the review made on behalf of the certification body with its signed form', async () => {
      const caseId = await fixture.caseWithApplication();
      const form = await fixture.attach(caseId, 'other', 2);
      const unknownForm = await post(
        CERTIFICATION_OWNER,
        `/certification-cases/${caseId}/application-review`,
        {
          expectedRevision: 3,
          criteria: allCriteria(),
          outcome: 'accepted',
          onBehalf: onBehalf(
            'Quality Manager Demo',
            '00000000-0000-4000-8000-000000000001',
          ),
        },
      );
      expect(record(await unknownForm.json()).code).toBe(
        'CERTIFICATION_ATTACHMENT_ROLE',
      );
      const reviewed = await ok(
        CERTIFICATION_OWNER,
        `/certification-cases/${caseId}/application-review`,
        {
          expectedRevision: 3,
          criteria: allCriteria(),
          outcome: 'accepted',
          onBehalf: onBehalf('Quality Manager Demo', form),
        },
      );
      expect(reviewed).toMatchObject({
        applicationReview: {
          value: {
            outcome: 'accepted',
            onBehalf: onBehalf('Quality Manager Demo', form),
          },
        },
      });
    });

    it('requires an impartiality analysis after a declared consultant and keeps a declaration to verify from approval', async () => {
      const caseId = await fixture.agreedCase({
        consultant: { used: true, name: 'Advisory Demo' },
      });
      const base = `/certification-cases/${caseId}`;
      const withoutAnalysis = await post(CERTIFICATION_OWNER, `${base}/team`, {
        expectedRevision: 6,
        members: [leader()],
      });
      expect(record(await withoutAnalysis.json()).code).toBe(
        'CERTIFICATION_TEAM_ANALYSIS_REQUIRED',
      );
      const analysis = {
        note: 'The applicant named a consultant; links with the team are being checked.',
        evidenceAttachmentIds: [],
      };
      const proposed = await ok(CERTIFICATION_OWNER, `${base}/team`, {
        expectedRevision: 6,
        impartialityAnalysis: analysis,
        members: [
          leader({
            declarations: { ...CONFIRMED, noConsultancy: 'to_verify' },
            conflictNote: 'Possible link with the named consultant.',
          }),
        ],
      });
      expect(proposed).toMatchObject({
        team: {
          value: {
            impartialityAnalysis: analysis,
            members: [{ declarations: { noConsultancy: 'to_verify' } }],
          },
        },
      });
      const toVerify = await post(
        CERTIFICATION_APPROVER,
        `${base}/team-decision`,
        {
          expectedRevision: 7,
          teamVersion: 1,
          decision: 'approved',
          independenceAttested: true,
        },
      );
      expect(record(await toVerify.json()).code).toBe(
        'CERTIFICATION_TEAM_CONFLICT_DECLARED',
      );
      await ok(CERTIFICATION_OWNER, `${base}/team`, {
        expectedRevision: 7,
        reason: 'No link found: the consultant has no relation with the team.',
        impartialityAnalysis: {
          ...analysis,
          note: 'Checked: no link between the consultant and the team.',
        },
        members: [leader()],
      });
      const unattested = await post(
        CERTIFICATION_APPROVER,
        `${base}/team-decision`,
        {
          expectedRevision: 8,
          teamVersion: 2,
          decision: 'approved',
        },
      );
      expect(record(await unattested.json()).code).toBe(
        'CERTIFICATION_INDEPENDENCE_ATTESTATION',
      );
      const namedOnTeam = await post(
        CERTIFICATION_APPROVER,
        `${base}/team-decision`,
        {
          expectedRevision: 8,
          teamVersion: 2,
          decision: 'approved',
          independenceAttested: true,
          onBehalf: onBehalf(' AUDITOR demo'),
        },
      );
      expect(record(await namedOnTeam.json()).code).toBe(
        'CERTIFICATION_INDEPENDENCE',
      );
      expect(
        await ok(CERTIFICATION_APPROVER, `${base}/team-decision`, {
          expectedRevision: 8,
          teamVersion: 2,
          decision: 'approved',
          independenceAttested: true,
          onBehalf: onBehalf('Head of Body Demo'),
        }),
      ).toMatchObject({
        nextStep: 'stage_1_plan',
        teamDecision: {
          value: {
            decision: 'approved',
            independenceAttested: true,
            onBehalf: onBehalf('Head of Body Demo'),
          },
        },
      });
      const approverJoins = await post(CERTIFICATION_OWNER, `${base}/team`, {
        expectedRevision: 9,
        reason: 'The head of the body joins as an observer.',
        impartialityAnalysis: analysis,
        members: [
          leader(),
          leader({
            name: 'HEAD of body  Demo',
            role: 'observer',
            holdsCategory: false,
            competenceNote: 'Observer',
          }),
        ],
      });
      expect(record(await approverJoins.json()).code).toBe(
        'CERTIFICATION_INDEPENDENCE',
      );
      expect(await fixture.eventCount(caseId)).toBe(9);
    });

    it('refuses an act on behalf of the certification body dated after the latest business date', async () => {
      const caseId = await fixture.caseWithApplication();
      const base = `/certification-cases/${caseId}`;
      const review = (actedOn: string) => ({
        expectedRevision: 2,
        criteria: allCriteria(),
        outcome: 'accepted',
        onBehalf: onBehalf('Quality Manager Demo', null, actedOn),
      });
      const futureReview = await post(
        CERTIFICATION_OWNER,
        `${base}/application-review`,
        review(FUTURE),
      );
      expect(futureReview.status).toBe(409);
      expect(record(await futureReview.json()).code).toBe(
        'CERTIFICATION_ACT_IN_FUTURE',
      );
      expect(await fixture.eventCount(caseId)).toBe(2);
      expect(
        await ok(
          CERTIFICATION_OWNER,
          `${base}/application-review`,
          review(LATEST_BUSINESS_DATE),
        ),
      ).toMatchObject({
        revision: 3,
        applicationReview: {
          value: {
            onBehalf: onBehalf(
              'Quality Manager Demo',
              null,
              LATEST_BUSINESS_DATE,
            ),
          },
        },
      });
      const futureDuration = await post(
        CERTIFICATION_OWNER,
        `${base}/duration`,
        {
          expectedRevision: 3,
          inputs: {
            primary: 'CI',
            haccpStudies: { CI: 3 },
            increases: {},
            reductions: {},
          },
          confirmed: {
            initialOnSite: '4.5',
            stage1OnSite: '1.5',
            stage2OnSite: '3',
            surveillanceOnSite: '1.5',
            recertificationOnSite: '3',
          },
          onBehalf: onBehalf('Head of Body Demo', null, FUTURE),
        },
      );
      expect(futureDuration.status).toBe(409);
      expect(record(await futureDuration.json()).code).toBe(
        'CERTIFICATION_ACT_IN_FUTURE',
      );
      expect(await fixture.eventCount(caseId)).toBe(3);

      const teamCase = await fixture.agreedCase();
      const teamBase = `/certification-cases/${teamCase}`;
      await ok(CERTIFICATION_OWNER, `${teamBase}/team`, {
        expectedRevision: 6,
        members: [leader()],
      });
      const futureApproval = await post(
        CERTIFICATION_APPROVER,
        `${teamBase}/team-decision`,
        {
          expectedRevision: 7,
          teamVersion: 1,
          decision: 'approved',
          independenceAttested: true,
          onBehalf: onBehalf('Head of Body Demo', null, FUTURE),
        },
      );
      expect(futureApproval.status).toBe(409);
      expect(record(await futureApproval.json()).code).toBe(
        'CERTIFICATION_ACT_IN_FUTURE',
      );
      expect(await fixture.eventCount(teamCase)).toBe(7);
    });

    it('keeps the duration approval made on behalf of the certification body', async () => {
      const caseId = await fixture.acceptedCase();
      const confirmed = await ok(
        CERTIFICATION_OWNER,
        `/certification-cases/${caseId}/duration`,
        {
          expectedRevision: 3,
          inputs: {
            primary: 'CI',
            haccpStudies: { CI: 3 },
            increases: {},
            reductions: {},
          },
          confirmed: {
            initialOnSite: '4.5',
            stage1OnSite: '1.5',
            stage2OnSite: '3',
            surveillanceOnSite: '1.5',
            recertificationOnSite: '3',
          },
          onBehalf: onBehalf('Head of Body Demo'),
        },
      );
      expect(confirmed).toMatchObject({
        duration: { value: { onBehalf: onBehalf('Head of Body Demo') } },
      });
    });

    it.each([
      [
        'an audit team with first-format boolean declarations',
        'team',
        async () => {
          const caseId = await fixture.agreedCase();
          await ok(CERTIFICATION_OWNER, `/certification-cases/${caseId}/team`, {
            expectedRevision: 6,
            members: [leader()],
          });
          return caseId;
        },
        (payload: Record<string, unknown>) => ({
          ...payload,
          members: (Array.isArray(payload.members) ? payload.members : []).map(
            (member) => ({
              ...record(member),
              declarations: {
                noConsultancy: true,
                noEmployment: true,
                noManagementInvolvement: true,
                confidentiality: true,
              },
            }),
          ),
        }),
      ],
      [
        'a team decision without the independence attestation',
        'team_decision',
        () => fixture.approvedTeamCase(),
        withoutAttestation,
      ],
      [
        'a dossier review without the independence attestation',
        'dossier_review',
        () => certificateReleaseCommands(() => fixture).granted(),
        withoutAttestation,
      ],
    ] satisfies [
      string,
      string,
      () => Promise<string>,
      (payload: Record<string, unknown>) => Record<string, unknown>,
    ][])(
      'refuses to read %s, an earlier shape, instead of defaulting it',
      async (_name, step, recorded, earlier) => {
        const caseId = await recorded();
        const path = `/certification-cases/${caseId}`;
        expect((await fixture.call(CERTIFICATION_OWNER, path)).status).toBe(
          200,
        );
        await fixture.storeAsEarlierRelease(caseId, step, earlier);
        expect((await fixture.call(CERTIFICATION_OWNER, path)).status).toBe(
          500,
        );
      },
    );
  },
);
