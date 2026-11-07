import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CERTIFICATION_APPROVER,
  CERTIFICATION_AUDITOR,
  CERTIFICATION_OWNER,
  allCriteria,
  applicationFacts,
  openCertificationFixture,
  record,
} from './certification.test-support.js';

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

function onBehalf(actedBy: string, formAttachmentId: string | null = null) {
  return {
    actedBy,
    actedByFunction: 'Head of the certification body',
    actedOn: '2026-11-03',
    formAttachmentId,
  };
}

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

    it('refuses an identical correction of a version recorded before the newer fields existed', async () => {
      const caseId = await fixture.caseWithApplication();
      await fixture.storeAsEarlierRelease(caseId, 'application', (payload) => {
        const earlier = { ...payload };
        delete earlier.submittedOn;
        return earlier;
      });
      const events = await fixture.eventCount(caseId);
      const sameFacts = await post(
        CERTIFICATION_OWNER,
        `/certification-cases/${caseId}/application`,
        {
          expectedRevision: 2,
          reason: 'Same facts',
          facts: applicationFacts(),
        },
      );
      expect(record(await sameFacts.json()).code).toBe(
        'CERTIFICATION_CORRECTION_UNCHANGED',
      );
      expect(await fixture.eventCount(caseId)).toBe(events);

      const teamCase = await fixture.agreedCase();
      const base = `/certification-cases/${teamCase}`;
      await ok(CERTIFICATION_OWNER, `${base}/team`, {
        expectedRevision: 6,
        members: [leader()],
      });
      await fixture.storeAsEarlierRelease(teamCase, 'team', (payload) => {
        const earlier = { ...payload };
        delete earlier.impartialityAnalysis;
        const members = Array.isArray(payload.members) ? payload.members : [];
        return {
          ...earlier,
          members: members.map((member) => ({
            ...record(member),
            declarations: {
              noConsultancy: true,
              noEmployment: true,
              noManagementInvolvement: true,
              confidentiality: true,
            },
          })),
        };
      });
      const teamEvents = await fixture.eventCount(teamCase);
      const sameTeam = await post(CERTIFICATION_OWNER, `${base}/team`, {
        expectedRevision: 7,
        reason: 'Same team',
        members: [leader()],
      });
      expect(record(await sameTeam.json()).code).toBe(
        'CERTIFICATION_CORRECTION_UNCHANGED',
      );
      expect(await fixture.eventCount(teamCase)).toBe(teamEvents);
    });
  },
);
