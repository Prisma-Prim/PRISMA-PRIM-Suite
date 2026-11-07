import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CERTIFICATION_APPROVER,
  CERTIFICATION_OWNER,
  CERTIFICATION_READER,
  openCertificationFixture,
  record,
} from './certification.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;

const NO_CONFLICT = {
  noConsultancy: true,
  noEmployment: true,
  noManagementInvolvement: true,
  confidentiality: true,
};

function member(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Ana Demo',
    role: 'team_leader',
    workspaceMembershipId: null,
    holdsCategory: true,
    competenceNote: 'Qualified ISO 22000 lead auditor, category C',
    declarations: NO_CONFLICT,
    conflictNote: null,
    ...overrides,
  };
}

withPostgres('Certification Case audit team', { timeout: 60_000 }, () => {
  let fixture: Awaited<ReturnType<typeof openCertificationFixture>>;

  function propose(caseId: string, body: Record<string, unknown>) {
    return fixture.call(
      CERTIFICATION_OWNER,
      `/certification-cases/${caseId}/team`,
      { method: 'POST', body },
    );
  }
  function decide(
    caseId: string,
    body: Record<string, unknown>,
    subject:
      | typeof CERTIFICATION_APPROVER
      | typeof CERTIFICATION_OWNER = CERTIFICATION_APPROVER,
  ) {
    return fixture.call(
      subject,
      `/certification-cases/${caseId}/team-decision`,
      {
        method: 'POST',
        body,
      },
    );
  }

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    fixture = await openCertificationFixture({
      databaseUrl,
      namePrefix: 'certification1137',
      workspaceId: '00000000-0000-4000-8000-000000001137',
    });
  }, 240_000);

  afterAll(async () => {
    await fixture?.close();
  });

  it('proposes a team, lets an approver outside it return and then approve a new version', async () => {
    const caseId = await fixture.agreedCase();
    const leader = member({
      holdsCategory: false,
      workspaceMembershipId: fixture.membership(CERTIFICATION_READER),
    });
    const expert = member({
      name: 'Ion Demo',
      role: 'technical_expert',
      competenceNote: 'Dairy technologist',
    });
    const proposed = await fixture.created(
      await propose(caseId, { expectedRevision: 6, members: [leader, expert] }),
    );
    expect(proposed).toMatchObject({
      revision: 7,
      nextStep: 'team_decision',
      team: { version: 1, value: { members: [leader, expert] } },
    });
    const unchanged = await propose(caseId, {
      expectedRevision: 7,
      reason: 'Same team',
      members: [leader, expert],
    });
    expect(record(await unchanged.json()).code).toBe(
      'CERTIFICATION_CORRECTION_UNCHANGED',
    );
    const returned = await fixture.created(
      await decide(caseId, {
        expectedRevision: 7,
        teamVersion: 1,
        decision: 'returned',
        reason: 'Add an auditor for the second shift.',
      }),
    );
    expect(returned).toMatchObject({
      revision: 8,
      nextStep: 'team',
      teamDecision: {
        version: 1,
        value: { decision: 'returned', teamVersion: 1 },
      },
    });
    const auditor = member({
      name: 'Elena Demo',
      role: 'auditor',
      holdsCategory: false,
      competenceNote: 'ISO 22000 auditor',
    });
    await fixture.created(
      await propose(caseId, {
        expectedRevision: 8,
        reason: 'Auditor added as requested.',
        members: [leader, expert, auditor],
      }),
    );
    const stale = await decide(caseId, {
      expectedRevision: 9,
      teamVersion: 1,
      decision: 'approved',
    });
    expect(stale.status).toBe(409);
    const approved = await fixture.created(
      await decide(caseId, {
        expectedRevision: 9,
        teamVersion: 2,
        decision: 'approved',
      }),
    );
    expect(approved).toMatchObject({
      revision: 10,
      nextStep: 'stage_1_plan',
      team: { version: 2 },
      teamDecision: {
        version: 2,
        value: { decision: 'approved', teamVersion: 2 },
      },
    });
    expect(await fixture.eventCount(caseId)).toBe(10);
  });

  it('refuses compositions without one leader or without the category', async () => {
    const caseId = await fixture.agreedCase();
    for (const [members, code] of [
      [[member({ role: 'auditor' })], 'CERTIFICATION_TEAM_LEADER'],
      [
        [member(), member({ name: 'Second leader' })],
        'CERTIFICATION_TEAM_LEADER',
      ],
      [[member({ holdsCategory: false })], 'CERTIFICATION_TEAM_CATEGORY'],
      [
        [
          member({ holdsCategory: false }),
          member({ name: 'Auditor', role: 'auditor', holdsCategory: true }),
        ],
        'CERTIFICATION_TEAM_CATEGORY',
      ],
      [
        [member({ declarations: { ...NO_CONFLICT, noConsultancy: false } })],
        'CERTIFICATION_TEAM_CONFLICT_NOTE',
      ],
      [
        [
          member({
            workspaceMembershipId: '00000000-0000-4000-8000-000000000999',
          }),
        ],
        'CERTIFICATION_TEAM_MEMBER_UNKNOWN',
      ],
    ] as const) {
      const response = await propose(caseId, { expectedRevision: 6, members });
      expect(response.status).toBe(400);
      expect(record(await response.json()).code).toBe(code);
    }
    const unanswered = await propose(caseId, {
      expectedRevision: 6,
      members: [member({ declarations: { noConsultancy: true } })],
    });
    expect(unanswered.status).toBe(400);
    expect(await fixture.eventCount(caseId)).toBe(6);
  });

  it('refuses a later team version that links a member who decided on an earlier one', async () => {
    const caseId = await fixture.agreedCase();
    await fixture.created(
      await propose(caseId, { expectedRevision: 6, members: [member()] }),
    );
    await fixture.created(
      await decide(caseId, {
        expectedRevision: 7,
        teamVersion: 1,
        decision: 'approved',
      }),
    );
    const linked = await propose(caseId, {
      expectedRevision: 8,
      reason: 'An observer joins the team.',
      members: [
        member(),
        member({
          name: 'Former approver',
          role: 'observer',
          holdsCategory: false,
          workspaceMembershipId: fixture.membership(CERTIFICATION_APPROVER),
        }),
      ],
    });
    expect(linked.status).toBe(409);
    expect(record(await linked.json()).code).toBe('CERTIFICATION_INDEPENDENCE');
    expect(await fixture.eventCount(caseId)).toBe(8);
  });

  it('refuses an approver on the team, a declared conflict and a programme manager without the approver role', async () => {
    const caseId = await fixture.agreedCase();
    await fixture.created(
      await propose(caseId, {
        expectedRevision: 6,
        members: [
          member(),
          member({
            name: 'Approver on the team',
            role: 'observer',
            holdsCategory: false,
            workspaceMembershipId: fixture.membership(CERTIFICATION_APPROVER),
          }),
        ],
      }),
    );
    const independence = await decide(caseId, {
      expectedRevision: 7,
      teamVersion: 1,
      decision: 'approved',
    });
    expect(record(await independence.json()).code).toBe(
      'CERTIFICATION_INDEPENDENCE',
    );
    const programmeManager = await decide(
      caseId,
      { expectedRevision: 7, teamVersion: 1, decision: 'approved' },
      CERTIFICATION_OWNER,
    );
    expect(programmeManager.status).toBe(403);

    const conflicted = await fixture.agreedCase();
    await fixture.created(
      await propose(conflicted, {
        expectedRevision: 6,
        members: [
          member({
            declarations: { ...NO_CONFLICT, noConsultancy: false },
            conflictNote: 'Delivered a training to the client last year.',
          }),
        ],
      }),
    );
    const refused = await decide(conflicted, {
      expectedRevision: 7,
      teamVersion: 1,
      decision: 'approved',
    });
    expect(record(await refused.json()).code).toBe(
      'CERTIFICATION_TEAM_CONFLICT_DECLARED',
    );
    expect(
      await fixture.created(
        await decide(conflicted, {
          expectedRevision: 7,
          teamVersion: 1,
          decision: 'returned',
          reason: 'Replace the team leader: consultancy within two years.',
        }),
      ),
    ).toMatchObject({ nextStep: 'team' });
    // The same team may be resubmitted after a return, for a new decision.
    expect(
      await fixture.created(
        await propose(conflicted, {
          expectedRevision: 8,
          reason: 'The training ended more than two years ago.',
          members: [
            member({
              declarations: { ...NO_CONFLICT, noConsultancy: false },
              conflictNote: 'Delivered a training to the client last year.',
            }),
          ],
        }),
      ),
    ).toMatchObject({ nextStep: 'team_decision', team: { version: 2 } });
  });
});
