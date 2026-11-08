import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '../test/render-with-interface-locale';
import { selectOptionByLabel, selectOptionLabels } from '../test/select-option';
import type { ActorContext } from '../access-types';
import { CertificationWorkspace } from './CertificationWorkspace';
import {
  FakeCertificationServer,
  NO_CONFLICT,
  certificationActor,
  certificationIdentity,
  certificationIds,
  teamMember,
} from './certification.test-fixture';

const TEAM = 'Audit team';
const DECISION = 'Team decision';
const DECLARATIONS = [
  'Provided no consultancy to the client',
  'Was not employed by the client',
  'Has no involvement in the client’s management',
  'Committed to confidentiality',
];
const CATEGORY = 'Holds the client’s food chain category';
const ATTESTATION =
  'I attest that the person deciding on this team is not a member of the audit team.';
const CONFLICT_NOTE = 'Conflict or point to verify';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function renderWorkspace(
  actor: ActorContext,
  callbacks: { onActorRevalidated?: (actor: ActorContext) => void } = {},
) {
  return render(
    <CertificationWorkspace
      actor={actor}
      identity={certificationIdentity}
      projectId={certificationIds.project}
      {...callbacks}
    />,
  );
}

/** A server whose current actor matches the rendered one. */
function serve(grants: { manager: boolean; approver?: boolean }) {
  const actor = certificationActor(grants);
  const server = new FakeCertificationServer({ actor: () => actor });
  return { server, actor };
}

function change(element: HTMLElement, value: string) {
  fireEvent.change(element, { target: { value } });
}

async function openSeededCase(reference: string) {
  fireEvent.click(await screen.findByRole('button', { name: reference }));
  return screen.findByRole('heading', {
    name: `Certification Case ${reference}`,
  });
}

function region(name: string) {
  return screen.getByRole('region', { name });
}

/** The definition shown for a term in a container. */
function definition(container: HTMLElement, term: string) {
  const [first] = within(container).getAllByText(term, { selector: 'dt' });
  return first?.nextElementSibling?.textContent;
}

function timelineTitles() {
  return [...region('Timeline').querySelectorAll(':scope > ol > li')].map(
    (entry) => entry.querySelector('strong')?.textContent,
  );
}

function teamForm(name = 'Propose the team') {
  return within(region(TEAM)).getByRole('form', { name });
}

function member(form: HTMLElement, number: number) {
  return within(form).getByRole('group', { name: `Member ${number}` });
}

/** An impartiality declaration state, as its radio is labelled. */
type Answer = 'Confirmed' | 'Conflict' | 'To verify';

type MemberInput = {
  name: string;
  role: string;
  link?: string;
  holdsCategory?: boolean;
  competence: string;
  answers?: readonly Answer[];
};

/** Types one member as a person would; the category box starts unchecked. */
function fillMember(group: HTMLElement, input: MemberInput) {
  change(within(group).getByLabelText('Name'), input.name);
  selectOptionByLabel(
    within(group).getByLabelText('Role in the team'),
    input.role,
  );
  if (input.link)
    selectOptionByLabel(
      within(group).getByLabelText('Workspace member'),
      input.link,
    );
  const category = within(group).getByRole('checkbox', { name: CATEGORY });
  if (
    category instanceof HTMLInputElement &&
    category.checked !== (input.holdsCategory ?? false)
  )
    fireEvent.click(category);
  change(within(group).getByLabelText('Competence'), input.competence);
  answer(
    group,
    input.answers ?? ['Confirmed', 'Confirmed', 'Confirmed', 'Confirmed'],
  );
}

function answer(group: HTMLElement, answers: readonly Answer[]) {
  DECLARATIONS.forEach((declaration, index) => {
    const choice = answers[index];
    if (!choice) return;
    fireEvent.click(
      within(within(group).getByRole('group', { name: declaration })).getByRole(
        'radio',
        { name: choice },
      ),
    );
  });
}

function submitTeam(form: HTMLElement, name = 'Propose the team') {
  fireEvent.click(within(form).getByRole('button', { name }));
}

function decisionForm() {
  return within(region(DECISION)).getByRole('form', {
    name: 'Record the decision',
  });
}

function decide(
  choice: 'Approve the team' | 'Return the team',
  reason?: string,
) {
  const form = decisionForm();
  fireEvent.click(within(form).getByRole('radio', { name: choice }));
  if (reason !== undefined)
    change(within(form).getByLabelText('Reason for returning'), reason);
  const attestation = within(form).getByRole('checkbox', {
    name: ATTESTATION,
  });
  if (attestation instanceof HTMLInputElement && !attestation.checked)
    fireEvent.click(attestation);
  fireEvent.click(
    within(form).getByRole('button', { name: 'Record the decision' }),
  );
}

/** A leader without the category and a technical expert who holds it. */
function proposedMembers() {
  return [
    teamMember({ holdsCategory: false }),
    teamMember({
      name: 'Ion Demo',
      role: 'technical_expert',
      competenceNote: 'Dairy technologist',
    }),
  ];
}

describe('Certification audit team and its approval', () => {
  it('shows a reader every team version and decision without any form', async () => {
    const { server, actor } = serve({ manager: false });
    const caseId = server.seed({
      orderReference: 'CERT-TEAM-READ',
      agreement: true,
    });
    const [leader, expert] = proposedMembers();
    server.proposeTeamAsColleague(caseId, [
      { ...leader, workspaceMembershipId: certificationIds.colleague },
      expert,
    ]);
    server.decideTeamAsColleague(
      caseId,
      'returned',
      'Add an auditor for the second shift.',
    );
    server.proposeTeamAsColleague(
      caseId,
      [
        { ...leader, workspaceMembershipId: certificationIds.colleague },
        expert,
        teamMember({
          name: 'Mara Demo',
          role: 'auditor',
          holdsCategory: false,
          competenceNote: 'ISO 22000 auditor',
        }),
      ],
      'Auditor added as requested.',
    );
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-TEAM-READ');

    const team = region(TEAM);
    expect(within(team).getByText(/Version 2/u)).toBeVisible();
    expect(
      within(team).getByText(
        /Correction reason: Auditor added as requested\./u,
      ),
    ).toBeVisible();
    expect(within(team).getByText('Awaiting a decision')).toBeVisible();
    const [first, , third] = within(team).getAllByRole('listitem');
    if (!first || !third) throw new Error('Expected three members.');
    expect(within(first).getByText('Elena Demo — Team leader')).toBeVisible();
    // The linked member is named from the people the Case shows.
    expect(definition(first, 'Workspace member')).toBe('Boris Demo');
    expect(definition(first, CATEGORY)).toBe('No');
    expect(definition(third, 'Workspace member')).toBe('Not linked');
    expect(definition(third, 'Competence')).toBe('ISO 22000 auditor');
    expect(definition(third, 'Committed to confidentiality')).toBe('Confirmed');

    const decision = region(DECISION);
    expect(definition(decision, 'Decision')).toBe('Returned');
    expect(definition(decision, 'Reason for returning')).toBe(
      'Add an auditor for the second shift.',
    );
    expect(
      within(decision).getByText(
        'This decision concerns team version 1. Version 2 awaits a decision.',
      ),
    ).toBeVisible();
    expect(
      within(decision).getByText(
        'An approver who is not on the team decides on this proposal.',
      ),
    ).toBeVisible();
    expect(
      within(screen.getByRole('list', { name: 'Steps' })).getByText(
        /To decide — version 2/u,
      ),
    ).toBeVisible();
    expect(timelineTitles().slice(-3)).toEqual([
      'Audit team — version 1',
      'Team decision — Returned (team version 1)',
      'Audit team — version 2',
    ]);

    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    for (const name of ['Propose a new team version', 'Record the decision'])
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    expect(server.requests.some((request) => request.method !== 'GET')).toBe(
      false,
    );
  });

  it('mirrors the composition rules before proposing the first team', async () => {
    const { server, actor } = serve({ manager: true });
    const caseId = server.seed({
      orderReference: 'CERT-TEAM-PROPOSE',
      agreement: true,
    });
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-TEAM-PROPOSE');
    expect(
      within(region(TEAM)).getByText('No audit team is proposed yet.'),
    ).toBeVisible();
    const form = teamForm();
    // Nothing about impartiality is preselected.
    expect(within(form).queryAllByRole('radio', { checked: true })).toEqual([]);

    submitTeam(form);
    expect(
      await within(region(TEAM)).findByText(
        'Complete every member: a name (at most 200 characters), a role, a competence note (at most 1,000 characters) and an answer to each declaration. A team has one to ten members.',
      ),
    ).toBeVisible();

    fillMember(member(form, 1), {
      name: 'Elena Demo',
      role: 'Auditor',
      holdsCategory: true,
      competence: 'ISO 22000 lead auditor, category C',
    });
    submitTeam(form);
    expect(
      await within(region(TEAM)).findByText(
        'A team has exactly one team leader. Check the roles.',
      ),
    ).toBeVisible();

    selectOptionByLabel(
      within(member(form, 1)).getByLabelText('Role in the team'),
      'Team leader',
    );
    fireEvent.click(
      within(member(form, 1)).getByRole('checkbox', { name: CATEGORY }),
    );
    submitTeam(form);
    expect(
      await within(region(TEAM)).findByText(
        'The team must hold the client’s category: the team leader holds it or, failing that, a technical expert who holds it joins the team. Observers do not count.',
      ),
    ).toBeVisible();

    fireEvent.click(within(form).getByRole('button', { name: 'Add a member' }));
    fillMember(member(form, 2), {
      name: 'Ion Demo',
      role: 'Technical expert',
      holdsCategory: true,
      competence: 'Dairy technologist',
      answers: ['Conflict', 'Confirmed', 'Confirmed', 'Confirmed'],
    });
    expect(
      within(member(form, 2)).getByText(
        'Required because a declaration is a conflict or still to verify: describe the conflict or what remains to verify. The team can be proposed, but it is approved only once every declaration is confirmed.',
      ),
    ).toBeVisible();
    submitTeam(form);
    expect(
      await within(region(TEAM)).findByText(
        'Describe the conflict or what remains to verify (at most 1,000 characters) for every member with a declaration that is not confirmed.',
      ),
    ).toBeVisible();
    expect(server.mutations()).toEqual([]);

    // Answering yes again hides the description, which is then not sent.
    change(
      within(member(form, 2)).getByLabelText(CONFLICT_NOTE),
      'Unsent draft',
    );
    answer(member(form, 2), ['Confirmed']);
    expect(
      within(member(form, 2)).queryByLabelText(CONFLICT_NOTE),
    ).not.toBeInTheDocument();
    // Only the people the Case shows can be linked, each to one member.
    const link = within(member(form, 1)).getByLabelText('Workspace member');
    expect(selectOptionLabels(link)).toEqual([
      'Not linked',
      'Ana Demo (you)',
      'Boris Demo',
    ]);
    selectOptionByLabel(link, 'Boris Demo');
    fireEvent.click(within(member(form, 2)).getByLabelText('Workspace member'));
    expect(
      within(screen.getByRole('listbox')).getByRole('option', {
        name: 'Boris Demo',
      }),
    ).toBeDisabled();
    fireEvent.click(within(member(form, 2)).getByLabelText('Workspace member'));

    submitTeam(form);
    await waitFor(() =>
      expect(
        within(region(TEAM)).getByRole('button', {
          name: 'Propose a new team version',
        }),
      ).toBeVisible(),
    );
    expect(server.mutations()).toEqual([
      expect.objectContaining({
        path: `/api/certification-cases/${caseId}/team`,
        contentType: 'application/json',
        company: certificationIds.company,
        body: {
          expectedRevision: 6,
          members: [
            {
              name: 'Elena Demo',
              role: 'team_leader',
              workspaceMembershipId: certificationIds.colleague,
              holdsCategory: false,
              competenceNote: 'ISO 22000 lead auditor, category C',
              declarations: NO_CONFLICT,
              conflictNote: null,
            },
            {
              name: 'Ion Demo',
              role: 'technical_expert',
              workspaceMembershipId: null,
              holdsCategory: true,
              competenceNote: 'Dairy technologist',
              declarations: NO_CONFLICT,
              conflictNote: null,
            },
          ],
        },
      }),
    ]);
    expect(server.mutations()[0]?.key).toBeTruthy();
    expect(
      screen.getByText(
        'Saved. The confirmed result remains recorded even if a later refresh fails.',
      ),
    ).toBeVisible();
    expect(within(region(TEAM)).getByText('Awaiting a decision')).toBeVisible();
    expect(definition(screen.getByRole('article'), 'Next step')).toBe(
      'Team decision',
    );
    // A programme manager without the approver role is told who decides.
    expect(
      within(region(DECISION)).getByText('No decision is recorded yet.'),
    ).toBeVisible();
    expect(
      within(region(DECISION)).getByText(
        'An approver who is not on the team decides on this proposal.',
      ),
    ).toBeVisible();
    expect(
      within(region(DECISION)).queryByRole('form'),
    ).not.toBeInTheDocument();
  });

  it.each([
    [
      400,
      'CERTIFICATION_TEAM_LEADER',
      'A team has exactly one team leader. Check the roles.',
      false,
    ],
    [
      400,
      'CERTIFICATION_TEAM_CATEGORY',
      'The team must hold the client’s category: the team leader holds it or, failing that, a technical expert who holds it joins the team. Observers do not count.',
      false,
    ],
    [
      400,
      'CERTIFICATION_TEAM_CONFLICT_NOTE',
      'Describe the conflict or what remains to verify (at most 1,000 characters) for every member with a declaration that is not confirmed.',
      false,
    ],
    [
      400,
      'CERTIFICATION_TEAM_MEMBER_UNKNOWN',
      'A linked Workspace member is no longer active. Change that link or leave it empty.',
      false,
    ],
    [
      409,
      'CERTIFICATION_AGREEMENT_MISSING',
      'The audit team is proposed once the certification agreement is recorded. Reload the Case.',
      true,
    ],
    [
      409,
      'CERTIFICATION_CORRECTION_REASON',
      'A new team version needs a reason and a first proposal has none. Reload the Case before saving again.',
      true,
    ],
    [
      409,
      'CERTIFICATION_INDEPENDENCE',
      'A person who approved this team, approved a Stage report, reviewed the dossier or recorded the decision, directly or on behalf of the certification body, cannot join the team. Remove that person or that link, reload the Case and propose again.',
      true,
    ],
  ] as const)(
    'explains the team refusal %i %s in plain language',
    async (status, code, message, reload) => {
      const { server, actor } = serve({ manager: true });
      server.seed({ orderReference: 'CERT-TEAM-REFUSED', agreement: true });
      server.interceptions.push({
        match: (request) =>
          request.method === 'POST' && request.path.endsWith('/team'),
        respond: () => Response.json({ code }, { status }),
      });
      server.install();
      renderWorkspace(actor);
      await openSeededCase('CERT-TEAM-REFUSED');
      const form = teamForm();
      fillMember(member(form, 1), {
        name: 'Elena Demo',
        role: 'Team leader',
        holdsCategory: true,
        competence: 'ISO 22000 lead auditor, category C',
      });
      submitTeam(form);
      expect(await within(region(TEAM)).findByText(message)).toBeVisible();
      expect(server.mutations()).toHaveLength(1);
      const submit = within(form).getByRole('button', {
        name: 'Propose the team',
      });
      if (reload) expect(submit).toBeDisabled();
      else expect(submit).toBeEnabled();
    },
  );

  it('proposes a new version with its reason after a return', async () => {
    const { server, actor } = serve({ manager: true });
    const caseId = server.seed({
      orderReference: 'CERT-TEAM-RETURNED',
      agreement: true,
    });
    server.proposeTeamAsColleague(caseId, proposedMembers());
    server.decideTeamAsColleague(
      caseId,
      'returned',
      'Add an auditor for the second shift.',
    );
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-TEAM-RETURNED');
    expect(within(region(TEAM)).getByText('Returned')).toBeVisible();
    expect(
      within(region(TEAM)).getByText(
        'An approver returned this team. Propose a new version that answers the reason given.',
      ),
    ).toBeVisible();
    expect(definition(screen.getByRole('article'), 'Next step')).toBe(
      'Audit team',
    );

    fireEvent.click(
      within(region(TEAM)).getByRole('button', {
        name: 'Propose a new team version',
      }),
    );
    const form = teamForm('Propose a new team version');
    // The new version starts from the latest team's exact values.
    expect(within(member(form, 1)).getByLabelText('Name')).toHaveValue(
      'Elena Demo',
    );
    expect(
      within(
        within(member(form, 2)).getByRole('group', { name: DECLARATIONS[0] }),
      ).getByRole('radio', { name: 'Confirmed' }),
    ).toBeChecked();
    fireEvent.click(within(form).getByRole('button', { name: 'Add a member' }));
    fillMember(member(form, 3), {
      name: 'Mara Demo',
      role: 'Auditor',
      competence: 'ISO 22000 auditor',
    });
    submitTeam(form, 'Record the correction');
    expect(
      await within(region(TEAM)).findByText(
        'State the reason for this correction (at most 2,000 characters).',
      ),
    ).toBeVisible();
    expect(server.mutations()).toEqual([]);

    change(
      within(form).getByLabelText('Correction reason'),
      'Auditor added for the second shift.',
    );
    submitTeam(form, 'Record the correction');
    expect(
      await within(region(TEAM)).findByText(
        /Correction reason: Auditor added for the second shift\./u,
      ),
    ).toBeVisible();
    const [saved] = server.mutations();
    expect(saved?.body).toMatchObject({
      expectedRevision: 8,
      reason: 'Auditor added for the second shift.',
    });
    expect(saved?.body).toHaveProperty('members.2', {
      name: 'Mara Demo',
      role: 'auditor',
      workspaceMembershipId: null,
      holdsCategory: false,
      competenceNote: 'ISO 22000 auditor',
      declarations: NO_CONFLICT,
      conflictNote: null,
    });
    expect(within(region(TEAM)).getByText('Awaiting a decision')).toBeVisible();
    expect(
      within(region(DECISION)).getByText(
        'This decision concerns team version 1. Version 2 awaits a decision.',
      ),
    ).toBeVisible();
    expect(timelineTitles().slice(-3)).toEqual([
      'Audit team — version 1',
      'Team decision — Returned (team version 1)',
      'Audit team — version 2',
    ]);
  });

  it('lets an approver outside the team approve it, then shows the Stage 1 plan next', async () => {
    const { server, actor } = serve({ manager: false, approver: true });
    const caseId = server.seed({
      orderReference: 'CERT-TEAM-APPROVE',
      agreement: true,
    });
    server.proposeTeamAsColleague(caseId, proposedMembers());
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-TEAM-APPROVE');
    // The approver decides; only a programme manager proposes the team.
    expect(within(region(TEAM)).queryByRole('form')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Propose a new team version' }),
    ).not.toBeInTheDocument();
    const form = decisionForm();
    expect(
      within(form).getByText(
        'Decide on team version 1: approve it, or return it to the programme manager with a reason.',
      ),
    ).toBeVisible();
    expect(within(form).queryAllByRole('radio', { checked: true })).toEqual([]);
    fireEvent.click(
      within(form).getByRole('button', { name: 'Record the decision' }),
    );
    expect(
      await within(region(DECISION)).findByText(
        'Choose a decision. Returning the team needs a reason (at most 2,000 characters).',
      ),
    ).toBeVisible();
    expect(server.mutations()).toEqual([]);

    decide('Approve the team');
    // The approved team opens Stage 1, which a programme manager plans.
    const stage1 = await screen.findByRole('region', { name: 'Stage 1 audit' });
    expect(
      within(stage1).getByText('No plan is recorded for this Stage yet.'),
    ).toBeVisible();
    expect(
      within(stage1).getByText('A programme manager plans this Stage.'),
    ).toBeVisible();
    expect(server.mutations()).toEqual([
      expect.objectContaining({
        path: `/api/certification-cases/${caseId}/team-decision`,
        company: certificationIds.company,
        body: {
          expectedRevision: 7,
          teamVersion: 1,
          decision: 'approved',
          independenceAttested: true,
        },
      }),
    ]);
    expect(server.mutations()[0]?.key).toBeTruthy();
    expect(definition(region(DECISION), 'Decision')).toBe('Approved');
    expect(within(region(TEAM)).getByText('Approved')).toBeVisible();
    expect(definition(screen.getByRole('article'), 'Next step')).toBe(
      'Stage 1 audit plan',
    );
    expect(
      within(screen.getByRole('list', { name: 'Steps' })).getByText(
        /Approved — version 1/u,
      ),
    ).toBeVisible();
    expect(
      within(region(DECISION)).queryByRole('form'),
    ).not.toBeInTheDocument();
  });

  it('returns the team with a reason', async () => {
    const { server, actor } = serve({ manager: false, approver: true });
    const caseId = server.seed({
      orderReference: 'CERT-TEAM-RETURN',
      agreement: true,
    });
    server.proposeTeamAsColleague(caseId, proposedMembers());
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-TEAM-RETURN');
    decide('Return the team', '  ');
    expect(
      await within(region(DECISION)).findByText(
        'Choose a decision. Returning the team needs a reason (at most 2,000 characters).',
      ),
    ).toBeVisible();
    decide('Return the team', ' Add an auditor for the second shift. ');
    await waitFor(() =>
      expect(definition(region(DECISION), 'Decision')).toBe('Returned'),
    );
    expect(server.mutations()).toEqual([
      expect.objectContaining({
        path: `/api/certification-cases/${caseId}/team-decision`,
        body: {
          expectedRevision: 7,
          teamVersion: 1,
          decision: 'returned',
          reason: 'Add an auditor for the second shift.',
          independenceAttested: true,
        },
      }),
    ]);
    expect(definition(screen.getByRole('article'), 'Next step')).toBe(
      'Audit team',
    );
  });

  it('explains why an approver linked to any team version cannot decide', async () => {
    const { server, actor } = serve({ manager: true, approver: true });
    const caseId = server.seed({
      orderReference: 'CERT-TEAM-INDEPENDENCE',
      agreement: true,
    });
    const [leader, expert] = proposedMembers();
    server.proposeTeamAsColleague(caseId, [
      leader,
      { ...expert, workspaceMembershipId: certificationIds.member },
    ]);
    server.decideTeamAsColleague(caseId, 'returned', 'Replace the expert.');
    // The latest version no longer links the approver; the earlier one did.
    server.proposeTeamAsColleague(
      caseId,
      proposedMembers(),
      'Expert replaced.',
    );
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-TEAM-INDEPENDENCE');
    expect(
      within(region(DECISION)).getByText(
        'You cannot decide on this team: you are linked to a member of one of its versions. An approver who is not on the team must decide.',
      ),
    ).toBeVisible();
    expect(
      within(region(DECISION)).queryByRole('form'),
    ).not.toBeInTheDocument();
    expect(server.mutations()).toEqual([]);
  });

  it('shows the server independence refusal in plain language until a reload', async () => {
    const { server, actor } = serve({ manager: false, approver: true });
    const caseId = server.seed({
      orderReference: 'CERT-TEAM-INDEPENDENCE-SERVER',
      agreement: true,
    });
    server.proposeTeamAsColleague(caseId, proposedMembers());
    server.interceptions.push({
      match: (request) => request.path.endsWith('/team-decision'),
      respond: () =>
        Response.json({ code: 'CERTIFICATION_INDEPENDENCE' }, { status: 409 }),
    });
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-TEAM-INDEPENDENCE-SERVER');
    decide('Approve the team');
    expect(
      await within(region(DECISION)).findByText(
        'You cannot decide on this team: you are linked to a member of one of its versions. An approver who is not on the team must decide.',
      ),
    ).toBeVisible();
    expect(
      within(decisionForm()).getByRole('button', {
        name: 'Record the decision',
      }),
    ).toBeDisabled();
  });

  it('refuses to approve a team with a declared conflict, before and at the server', async () => {
    const { server, actor } = serve({ manager: false, approver: true });
    const conflicted = server.seed({
      orderReference: 'CERT-TEAM-CONFLICT',
      agreement: true,
    });
    server.proposeTeamAsColleague(conflicted, [
      teamMember({
        declarations: { ...NO_CONFLICT, noConsultancy: false },
        conflictNote: 'Delivered a training to the client last year.',
      }),
    ]);
    const clean = server.seed({
      orderReference: 'CERT-TEAM-CONFLICT-SERVER',
      agreement: true,
    });
    server.proposeTeamAsColleague(clean, proposedMembers());
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-TEAM-CONFLICT');
    expect(within(region(TEAM)).getByText('Conflict declared')).toBeVisible();
    expect(definition(region(TEAM), CONFLICT_NOTE)).toBe(
      'Delivered a training to the client last year.',
    );
    const form = decisionForm();
    expect(
      within(form).getByText(
        'A declaration of this team is not confirmed (a conflict or a point to verify), so the team cannot be approved. Return it with a reason; it can be approved once a new version confirms every declaration.',
      ),
    ).toBeVisible();
    expect(
      within(form).getByRole('radio', { name: 'Approve the team' }),
    ).toBeDisabled();

    fireEvent.click(
      screen.getByRole('button', { name: 'Back to Certification Cases' }),
    );
    server.interceptions.push({
      match: (request) => request.path.endsWith('/team-decision'),
      respond: () =>
        Response.json(
          { code: 'CERTIFICATION_TEAM_CONFLICT_DECLARED' },
          { status: 409 },
        ),
    });
    await openSeededCase('CERT-TEAM-CONFLICT-SERVER');
    decide('Approve the team');
    expect(
      await within(region(DECISION)).findByText(
        'A team with a declaration that is not confirmed cannot be approved. Return it with a reason.',
      ),
    ).toBeVisible();
    decide('Return the team', 'Clarify the consultancy declaration.');
    await waitFor(() =>
      expect(definition(region(DECISION), 'Decision')).toBe('Returned'),
    );
    const [refused, saved] = server.mutations();
    expect(refused?.body).toMatchObject({ decision: 'approved' });
    expect(saved?.body).toMatchObject({
      expectedRevision: 7,
      decision: 'returned',
    });
    expect(saved?.key).not.toBe(refused?.key);
  });

  it('keeps the team draft through a stale refusal and saves it after a reload', async () => {
    const { server, actor } = serve({ manager: true });
    const caseId = server.seed({
      orderReference: 'CERT-TEAM-STALE',
      agreement: true,
    });
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-TEAM-STALE');
    const form = teamForm();
    fillMember(member(form, 1), {
      name: 'Elena Demo',
      role: 'Team leader',
      holdsCategory: true,
      competence: 'ISO 22000 lead auditor, category C',
    });
    server.attachAsColleague(caseId, server.addSource('Audit plan'), 'plan');
    submitTeam(form);
    expect(
      await within(region(TEAM)).findByText(
        'This Case changed since you opened it. Reload it before saving; your draft is kept.',
      ),
    ).toBeVisible();
    expect(
      within(form).getByRole('button', { name: 'Propose the team' }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Reload Case' }));
    await waitFor(() =>
      expect(
        within(teamForm()).getByRole('button', { name: 'Propose the team' }),
      ).toBeEnabled(),
    );
    expect(within(member(teamForm(), 1)).getByLabelText('Name')).toHaveValue(
      'Elena Demo',
    );
    submitTeam(teamForm());
    await waitFor(() =>
      expect(
        within(region(TEAM)).getByRole('button', {
          name: 'Propose a new team version',
        }),
      ).toBeVisible(),
    );
    const [stale, saved] = server.mutations();
    expect(stale?.body).toMatchObject({ expectedRevision: 6 });
    expect(saved?.body).toMatchObject({ expectedRevision: 7 });
    expect(saved?.key).not.toBe(stale?.key);
  });

  it('refuses a decision on an outdated team version until the Case is reloaded', async () => {
    const { server, actor } = serve({ manager: false, approver: true });
    const caseId = server.seed({
      orderReference: 'CERT-TEAM-DECISION-STALE',
      agreement: true,
    });
    server.proposeTeamAsColleague(caseId, proposedMembers());
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-TEAM-DECISION-STALE');
    server.proposeTeamAsColleague(
      caseId,
      proposedMembers(),
      'Competence notes completed.',
    );
    decide('Approve the team');
    expect(
      await within(region(DECISION)).findByText(
        'This Case changed since you opened it. Reload it before saving; your draft is kept.',
      ),
    ).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Reload Case' }));
    // The kept draft now decides on the version the reload shows.
    expect(
      await screen.findByText(
        'Decide on team version 2: approve it, or return it to the programme manager with a reason.',
      ),
    ).toBeVisible();
    fireEvent.click(
      within(decisionForm()).getByRole('button', {
        name: 'Record the decision',
      }),
    );
    await waitFor(() =>
      expect(definition(region(DECISION), 'Decision')).toBe('Approved'),
    );
    const [stale, saved] = server.mutations();
    expect(stale?.body).toEqual({
      expectedRevision: 7,
      teamVersion: 1,
      decision: 'approved',
      independenceAttested: true,
    });
    expect(saved?.body).toEqual({
      expectedRevision: 8,
      teamVersion: 2,
      decision: 'approved',
      independenceAttested: true,
    });
  });

  it('retires the Case and rechecks authority when the approver grant is refused', async () => {
    const actor = certificationActor({ manager: false, approver: true });
    // The server no longer captures the approver grant.
    const server = new FakeCertificationServer({
      actor: () => certificationActor({ manager: false }),
    });
    const caseId = server.seed({
      orderReference: 'CERT-TEAM-DENIED',
      agreement: true,
    });
    server.proposeTeamAsColleague(caseId, proposedMembers());
    server.install();
    const onActorRevalidated = vi.fn();
    renderWorkspace(actor, { onActorRevalidated });
    await openSeededCase('CERT-TEAM-DENIED');
    decide('Approve the team');
    expect(
      await screen.findByText(
        'Certification access is unavailable. Your current authority is being checked.',
      ),
    ).toBeVisible();
    await waitFor(() => expect(onActorRevalidated).toHaveBeenCalledOnce());
    expect(
      screen.queryByRole('heading', {
        name: 'Certification Case CERT-TEAM-DENIED',
      }),
    ).not.toBeInTheDocument();
  });
});
