import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '../test/render-with-interface-locale';
import { selectOption, selectOptionByLabel } from '../test/select-option';
import type { ActorContext } from '../access-types';
import { CertificationWorkspace } from './CertificationWorkspace';
import {
  CERTIFICATE_TEXTS,
  FakeCertificationServer,
  NO_CONFLICT,
  actedFor,
  certificationActor,
  certificationDecision,
  certificationIdentity,
  certificationIds,
  dossierReview,
  reviewCriteria,
  stage1Report,
  stage2Report,
  stagePlan,
  teamMember,
} from './certification.test-fixture';

// Fictional people and organisations only.
const ACTING =
  'A person of the certification body performed this act; I record it on their behalf.';
const ACTING_VALIDATION =
  'Complete the act recorded on behalf of the certification body: the name and function of the person who acted (at most 200 characters each) and the date of the act. The signed form, when chosen, must be attached to this Case.';
const ACTING_ON_TEAM =
  'The person named as acting for the certification body is on the audit team. A member of the audit team cannot perform this act; check the name.';
const ATTESTED = 'Attested by the member who recorded it';
const REASON_REQUIRED =
  'State the reason for this correction (at most 2,000 characters).';
/** Each review criterion with the note the fixture records for it. */
const CRITERIA = [
  [
    'The requested scope and food chain category can be certified',
    'Scope note',
  ],
  ['A competent audit team is available', 'Team note'],
  [
    'A competent certification decision maker is available',
    'Decision maker note',
  ],
  ['Impartiality and other risks are acceptable', 'Risk note'],
] as const;
const CONSULTANCY = 'Provided no consultancy to the client';
const OTHER_DECLARATIONS = [
  'Was not employed by the client',
  'Has no involvement in the client’s management',
  'Committed to confidentiality',
];
const DOSSIER_ITEMS = [
  'Application',
  'Application review',
  'Audit duration',
  'Certification agreement',
  'Audit team approval',
  'Stage 1 audit plan',
  'Stage 1 audit report',
  'Stage 2 audit plan',
  'Stage 2 audit report',
  'Participant lists',
  'Nonconformity follow-up',
  'Team recommendation',
  'Certificate data agreed with the client',
];
const ANALYSIS = {
  note: 'The applicant named Advisory Demo; links with the team are being checked.',
  evidenceAttachmentIds: [],
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function renderWorkspace(actor: ActorContext) {
  return render(
    <CertificationWorkspace
      actor={actor}
      identity={certificationIdentity}
      projectId={certificationIds.project}
    />,
  );
}

/** A server whose current actor matches the rendered one. */
function serve(grants: {
  manager: boolean;
  approver?: boolean;
  auditor?: boolean;
}) {
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

function form(panel: string, name: string) {
  return within(region(panel)).getByRole('form', { name });
}

function group(container: HTMLElement, name: string) {
  return within(container).getByRole('group', { name });
}

function click(container: HTMLElement, name: string) {
  fireEvent.click(within(container).getByRole('button', { name }));
}

function choose(container: HTMLElement, name: string, option: string) {
  fireEvent.click(
    within(group(container, name)).getByRole('radio', { name: option }),
  );
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

/** Records an act on behalf of the certification body in its fieldset. */
function actFor(
  fieldset: HTMLElement,
  {
    name = 'Head of Body Demo',
    role = 'Head of the certification body',
    date = '2026-11-03',
    signedForm,
  }: { name?: string; role?: string; date?: string; signedForm?: string } = {},
) {
  const box = within(fieldset).getByRole('checkbox', { name: ACTING });
  if (box instanceof HTMLInputElement && !box.checked) fireEvent.click(box);
  change(within(fieldset).getByLabelText('Name of the person who acted'), name);
  change(within(fieldset).getByLabelText('Their function'), role);
  change(within(fieldset).getByLabelText('Date of the act'), date);
  if (signedForm)
    selectOptionByLabel(
      within(fieldset).getByLabelText('Signed form'),
      signedForm,
    );
}

/**
 * The fictional dairy's Case with the team approved (revision 8) and both
 * Stages reported without Findings (revision 16).
 */
function reportedCase(server: FakeCertificationServer, reference: string) {
  const caseId = server.seedApprovedTeam({
    orderReference: reference,
    leader: certificationIds.colleague,
  });
  const plan1 = server.attachAsColleague(
    caseId,
    server.addSource('Stage 1 plan'),
    'plan',
  );
  server.recordStageAsColleague(caseId, 'stage_1_plan', stagePlan(plan1));
  const report1 = server.attachAsColleague(
    caseId,
    server.addSource('Stage 1 report'),
    'report',
  );
  server.recordStageAsColleague(
    caseId,
    'stage_1_report',
    stage1Report(report1),
  );
  const plan2 = server.attachAsColleague(
    caseId,
    server.addSource('Stage 2 plan'),
    'plan',
  );
  server.recordStageAsColleague(
    caseId,
    'stage_2_plan',
    stagePlan(plan2, {
      startDate: '2026-11-20',
      endDate: '2026-11-21',
      onSiteDays: '2',
    }),
  );
  const report2 = server.attachAsColleague(
    caseId,
    server.addSource('Stage 2 report'),
    'report',
  );
  server.recordStageAsColleague(
    caseId,
    'stage_2_report',
    stage2Report(report2),
  );
  return caseId;
}

/** A recommended, reviewed and granted Case (revision 19), still open. */
function grantedCase(server: FakeCertificationServer, reference: string) {
  const caseId = reportedCase(server, reference);
  server.recordStepAsColleague(caseId, 'recommendation', {
    recommendation: 'grant',
    basis: 'No nonconformity; system effectively implemented.',
    recommendedOn: null,
  });
  server.recordStepAsColleague(caseId, 'dossier_review', dossierReview());
  server.recordStepAsColleague(caseId, 'decision', certificationDecision());
  return caseId;
}

describe('Certification acts on behalf of the certification body', () => {
  it('records the application review on behalf of the certification body with its signed form', async () => {
    const { server, actor } = serve({ manager: true });
    const caseId = server.seed({
      orderReference: 'CERT-ACT-REVIEW',
      application: true,
    });
    const signed = server.attachAsColleague(
      caseId,
      server.addSource('Signed review form'),
      'other',
    );
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-ACT-REVIEW');
    const review = screen.getByRole('form', { name: 'Record the review' });
    for (const [label, note] of CRITERIA) {
      const entry = group(review, label);
      fireEvent.click(within(entry).getByRole('radio', { name: 'Yes' }));
      change(within(entry).getByLabelText('Note'), note);
    }
    fireEvent.click(
      within(review).getByRole('radio', { name: 'Accept the application' }),
    );
    const acting = group(
      review,
      'Application review by the certification body',
    );
    // The member records in their own name until they say otherwise.
    expect(
      within(acting).getByRole('checkbox', { name: ACTING }),
    ).not.toBeChecked();
    expect(
      within(acting).queryByLabelText('Name of the person who acted'),
    ).not.toBeInTheDocument();
    fireEvent.click(within(acting).getByRole('checkbox', { name: ACTING }));
    click(review, 'Record the review');
    expect(
      await within(region('Application review')).findByText(ACTING_VALIDATION),
    ).toBeVisible();
    expect(server.mutations()).toEqual([]);

    actFor(acting, {
      signedForm: 'Signed review form — version 1 (signed-review-form.pdf)',
    });
    click(review, 'Record the review');
    await waitFor(() =>
      expect(
        definition(
          region('Application review'),
          'Reviewed on behalf of the certification body by',
        ),
      ).toBe(
        'Head of Body Demo — Head of the certification body · Nov 3, 2026 · Signed form: Signed review form — version 1 (signed-review-form.pdf)',
      ),
    );
    expect(server.mutations()).toEqual([
      expect.objectContaining({
        path: `/api/certification-cases/${caseId}/application-review`,
        body: {
          expectedRevision: 3,
          criteria: reviewCriteria('yes'),
          outcome: 'accepted',
          onBehalf: actedFor({ formAttachmentId: signed }),
        },
      }),
    ]);
    // The member who entered the review stays attributed on its version.
    expect(
      within(region('Application review')).getByText(/Recorded by: Ana Demo/u),
    ).toBeVisible();
  });

  it('fails closed on a signed form of an act that is not attached before it', async () => {
    const { server, actor } = serve({ manager: true });
    const caseId = server.seed({
      orderReference: 'CERT-ACT-UNATTACHED',
      accepted: true,
    });
    server.confirmDurationAsColleague(
      caseId,
      null,
      actedFor({ formAttachmentId: '11310000-0000-4000-8000-600000000099' }),
    );
    server.install();
    renderWorkspace(actor);
    fireEvent.click(
      await screen.findByRole('button', { name: 'CERT-ACT-UNATTACHED' }),
    );
    expect(
      await screen.findByText(
        'This read failed. Refresh before treating this page as current.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('region', { name: 'Audit duration' }),
    ).not.toBeInTheDocument();
  });

  it('shows a duration approved on behalf of the certification body and keeps it in a correction', async () => {
    const { server, actor } = serve({ manager: true });
    const caseId = server.seed({
      orderReference: 'CERT-ACT-DURATION',
      accepted: true,
    });
    server.confirmDurationAsColleague(caseId, null, actedFor());
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-ACT-DURATION');
    const duration = region('Audit duration');
    expect(
      definition(duration, 'Approved on behalf of the certification body by'),
    ).toBe('Head of Body Demo — Head of the certification body · Nov 3, 2026');
    expect(
      within(duration).getByText(/Recorded by: Boris Demo/u),
    ).toBeVisible();

    click(duration, 'Correct the audit duration');
    const inputs = within(duration).getByRole('form', {
      name: 'Duration inputs',
    });
    selectOption(within(inputs).getByLabelText('Primary subcategory'), 'CI');
    click(inputs, 'Compute the proposal');
    const confirm = await within(duration).findByRole('form', {
      name: 'Correct the audit duration',
    });
    const acting = group(
      confirm,
      'Duration approval by the certification body',
    );
    expect(
      within(acting).getByRole('checkbox', { name: ACTING }),
    ).toBeChecked();
    expect(
      within(acting).getByLabelText('Name of the person who acted'),
    ).toHaveValue('Head of Body Demo');
    change(within(acting).getByLabelText('Date of the act'), '2026-11-04');
    change(
      within(confirm).getByLabelText('Correction reason'),
      'The approval form is dated the next day.',
    );
    click(confirm, 'Record the correction');
    await waitFor(() =>
      expect(
        definition(
          region('Audit duration'),
          'Approved on behalf of the certification body by',
        ),
      ).toBe(
        'Head of Body Demo — Head of the certification body · Nov 4, 2026',
      ),
    );
    expect(server.mutations()).toEqual([
      expect.objectContaining({
        path: `/api/certification-cases/${caseId}/duration`,
        body: expect.objectContaining({
          reason: 'The approval form is dated the next day.',
          onBehalf: actedFor({ actedOn: '2026-11-04' }),
        }),
      }),
    ]);
  });

  it('records the Stage 2 report approval made on behalf of the certification body', async () => {
    const { server, actor } = serve({ manager: false, auditor: true });
    const caseId = server.seedApprovedTeam({
      orderReference: 'CERT-ACT-REPORT',
      leader: certificationIds.member,
    });
    const plan1 = server.attachAsColleague(
      caseId,
      server.addSource('Stage 1 plan'),
      'plan',
    );
    server.recordStageAsColleague(caseId, 'stage_1_plan', stagePlan(plan1));
    const report1 = server.attachAsColleague(
      caseId,
      server.addSource('Stage 1 report'),
      'report',
    );
    server.recordStageAsColleague(
      caseId,
      'stage_1_report',
      stage1Report(report1),
    );
    const plan2 = server.attachAsColleague(
      caseId,
      server.addSource('Stage 2 plan'),
      'plan',
    );
    server.recordStageAsColleague(
      caseId,
      'stage_2_plan',
      stagePlan(plan2, {
        startDate: '2026-11-20',
        endDate: '2026-11-21',
        onSiteDays: '2',
      }),
    );
    const report2 = server.attachAsColleague(
      caseId,
      server.addSource('Stage 2 report'),
      'report',
    );
    const approval = server.attachAsColleague(
      caseId,
      server.addSource('Signed approval form'),
      'other',
    );
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-ACT-REPORT');
    const reportForm = form('Stage 2 audit', 'Record the Stage 2 report');
    change(within(reportForm).getByLabelText('Report date'), '2026-11-21');
    change(
      within(reportForm).getByLabelText('Summary of the Stage 2 audit'),
      'Stage 2 completed as planned.',
    );
    selectOptionByLabel(
      within(reportForm).getByLabelText('Audit report PDF'),
      'Stage 2 report — version 1 (stage-2-report.pdf)',
    );
    const acting = group(
      reportForm,
      'Report approval by the certification body',
    );
    actFor(acting, { date: '2026-13-01' });
    click(reportForm, 'Record the Stage 2 report');
    expect(
      await within(region('Stage 2 audit')).findByText(ACTING_VALIDATION),
    ).toBeVisible();
    expect(server.mutations()).toEqual([]);
    actFor(acting, {
      date: '2026-11-22',
      signedForm: 'Signed approval form — version 1 (signed-approval-form.pdf)',
    });
    click(reportForm, 'Record the Stage 2 report');
    await waitFor(() =>
      expect(
        definition(
          region('Stage 2 audit'),
          'Report approved on behalf of the certification body by',
        ),
      ).toBe(
        'Head of Body Demo — Head of the certification body · Nov 22, 2026 · Signed form: Signed approval form — version 1 (signed-approval-form.pdf)',
      ),
    );
    expect(server.mutations()).toEqual([
      expect.objectContaining({
        path: `/api/certification-cases/${caseId}/stages/stage-2/report`,
        body: {
          expectedRevision: 16,
          ...stage2Report(report2, {
            certificationBodyApproval: actedFor({
              actedOn: '2026-11-22',
              formAttachmentId: approval,
            }),
          }),
        },
      }),
    ]);
  });

  it('records the dossier reviewer apart from the approver and requires the attestation', async () => {
    const { server, actor } = serve({ manager: false, approver: true });
    const caseId = reportedCase(server, 'CERT-ACT-DOSSIER');
    server.recordStepAsColleague(caseId, 'recommendation', {
      recommendation: 'grant',
      basis: 'No nonconformity; system effectively implemented.',
      recommendedOn: '2026-11-22',
    });
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-ACT-DOSSIER');
    expect(
      definition(region('Team recommendation'), 'Date of the recommendation'),
    ).toBe('Nov 22, 2026');
    const reviewForm = form('Dossier review', 'Record the dossier review');
    for (const item of DOSSIER_ITEMS)
      choose(
        reviewForm,
        item,
        item === 'Nonconformity follow-up' ? 'Not applicable' : 'Present',
      );
    change(
      within(reviewForm).getByLabelText('Conclusion of the review'),
      dossierReview().conclusion,
    );
    const attestation = within(reviewForm).getByRole('checkbox', {
      name: 'I attest that the dossier reviewer and the approver are not members of the audit team.',
    });
    expect(attestation).not.toBeChecked();
    // A person on the audit team cannot review for the certification body.
    actFor(group(reviewForm, 'Dossier reviewer for the certification body'), {
      name: ' ELENA  demo ',
      role: 'Dossier reviewer',
    });
    fireEvent.click(attestation);
    click(reviewForm, 'Record the review');
    expect(
      await within(region('Dossier review')).findByText(ACTING_ON_TEAM),
    ).toBeVisible();
    fireEvent.click(attestation);
    actFor(group(reviewForm, 'Dossier reviewer for the certification body'), {
      name: 'Reviewer Demo',
      role: 'Dossier reviewer',
    });
    click(reviewForm, 'Record the review');
    expect(
      await within(region('Dossier review')).findByText(
        'Confirm that the dossier reviewer and the approver are not members of the audit team.',
      ),
    ).toBeVisible();
    expect(server.mutations()).toEqual([]);

    fireEvent.click(attestation);
    click(reviewForm, 'Record the review');
    await waitFor(() =>
      expect(
        definition(
          region('Dossier review'),
          'Dossier reviewed on behalf of the certification body by',
        ),
      ).toBe('Reviewer Demo — Dossier reviewer · Nov 3, 2026'),
    );
    expect(server.mutations()).toEqual([
      expect.objectContaining({
        path: `/api/certification-cases/${caseId}/dossier-review`,
        body: {
          expectedRevision: 17,
          ...dossierReview(),
          reviewedBy: actedFor({
            actedBy: 'Reviewer Demo',
            actedByFunction: 'Dossier reviewer',
          }),
        },
      }),
    ]);
    const reviewed = region('Dossier review');
    expect(
      within(reviewed).queryByText(
        'Approved on behalf of the certification body by',
      ),
    ).not.toBeInTheDocument();
    expect(definition(reviewed, 'Independence from the audit team')).toBe(
      ATTESTED,
    );
  });

  it('explains an impartiality analysis the server requires', async () => {
    const { server, actor } = serve({ manager: true, approver: true });
    server.seed({ orderReference: 'CERT-ACT-REFUSALS', agreement: true });
    server.interceptions.push({
      match: (request) =>
        request.method === 'POST' && request.path.endsWith('/team'),
      respond: () =>
        Response.json(
          { code: 'CERTIFICATION_TEAM_ANALYSIS_REQUIRED' },
          { status: 400 },
        ),
    });
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-ACT-REFUSALS');
    const teamForm = form('Audit team', 'Propose the team');
    const first = group(teamForm, 'Member 1');
    change(within(first).getByLabelText('Name'), 'Elena Demo');
    selectOptionByLabel(
      within(first).getByLabelText('Role in the team'),
      'Team leader',
    );
    fireEvent.click(
      within(first).getByRole('checkbox', {
        name: 'Holds the client’s food chain category',
      }),
    );
    change(within(first).getByLabelText('Competence'), 'Lead auditor');
    for (const declaration of [CONSULTANCY, ...OTHER_DECLARATIONS])
      choose(first, declaration, 'Confirmed');
    click(teamForm, 'Propose the team');
    expect(
      await within(region('Audit team')).findByText(
        'Write the impartiality analysis (at most 4,000 characters, at most ten attachments of this Case). It is required when the application declares a consultant or when evidence is chosen.',
      ),
    ).toBeVisible();
    expect(server.mutations()).toHaveLength(1);
  });
});

describe('Certification impartiality declarations and analysis', () => {
  it('proposes a team with a declaration to verify and the analysis a declared consultant requires', async () => {
    const { server, actor } = serve({ manager: true });
    const caseId = server.seed({
      orderReference: 'CERT-ACT-ANALYSIS',
      agreement: true,
      facts: { consultant: { used: true, name: 'Advisory Demo' } },
    });
    const evidence = server.attachAsColleague(
      caseId,
      server.addSource('Consultant statement'),
      'evidence',
    );
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-ACT-ANALYSIS');
    const teamForm = form('Audit team', 'Propose the team');
    const first = group(teamForm, 'Member 1');
    // No declaration state is preselected.
    expect(within(first).queryAllByRole('radio', { checked: true })).toEqual(
      [],
    );
    change(within(first).getByLabelText('Name'), 'Auditor Demo');
    selectOptionByLabel(
      within(first).getByLabelText('Role in the team'),
      'Team leader',
    );
    fireEvent.click(
      within(first).getByRole('checkbox', {
        name: 'Holds the client’s food chain category',
      }),
    );
    change(
      within(first).getByLabelText('Competence'),
      'ISO 22000 lead auditor, category C',
    );
    expect(
      within(group(first, CONSULTANCY))
        .getAllByRole('radio')
        .map((radio) => radio.closest('label')?.textContent),
    ).toEqual(['Confirmed', 'Conflict', 'To verify']);
    choose(first, CONSULTANCY, 'To verify');
    for (const declaration of OTHER_DECLARATIONS)
      choose(first, declaration, 'Confirmed');
    click(teamForm, 'Propose the team');
    expect(
      await within(region('Audit team')).findByText(
        'Describe the conflict or what remains to verify (at most 1,000 characters) for every member with a declaration that is not confirmed.',
      ),
    ).toBeVisible();
    change(
      within(first).getByLabelText('Conflict or point to verify'),
      'Possible link with the named consultant.',
    );
    const analysis = group(teamForm, 'Impartiality analysis');
    expect(
      within(analysis).getByText(
        'Required: the application declared a consultant (Advisory Demo). Document how the links between the consultant and the team were analysed, with evidence attached to the Case.',
      ),
    ).toBeVisible();
    click(teamForm, 'Propose the team');
    expect(
      await within(region('Audit team')).findByText(
        'Write the impartiality analysis (at most 4,000 characters, at most ten attachments of this Case). It is required when the application declares a consultant or when evidence is chosen.',
      ),
    ).toBeVisible();
    expect(server.mutations()).toEqual([]);

    change(within(analysis).getByLabelText('Analysis'), ANALYSIS.note);
    fireEvent.click(
      within(analysis).getByRole('checkbox', {
        name: 'Consultant statement — version 1 (consultant-statement.pdf)',
      }),
    );
    click(teamForm, 'Propose the team');
    await waitFor(() =>
      expect(definition(region('Audit team'), 'Impartiality analysis')).toBe(
        ANALYSIS.note,
      ),
    );
    expect(server.mutations()).toEqual([
      expect.objectContaining({
        path: `/api/certification-cases/${caseId}/team`,
        body: {
          expectedRevision: 7,
          members: [
            teamMember({
              name: 'Auditor Demo',
              declarations: { ...NO_CONFLICT, noConsultancy: 'to_verify' },
              conflictNote: 'Possible link with the named consultant.',
            }),
          ],
          impartialityAnalysis: {
            note: ANALYSIS.note,
            evidenceAttachmentIds: [evidence],
          },
        },
      }),
    ]);
    const team = region('Audit team');
    expect(within(team).getByText('Declaration to verify')).toBeVisible();
    expect(definition(team, CONSULTANCY)).toBe('To verify');
    expect(definition(team, 'Evidence attached to the Case')).toBe(
      'Consultant statement — version 1 (consultant-statement.pdf)',
    );
  });

  it('keeps approval unavailable while a declaration is to verify and records a return on behalf of the certification body', async () => {
    const { server, actor } = serve({ manager: false, approver: true });
    const caseId = server.seed({
      orderReference: 'CERT-ACT-TO-VERIFY',
      agreement: true,
    });
    server.proposeTeamAsColleague(
      caseId,
      [
        teamMember({
          name: 'Auditor Demo',
          declarations: { ...NO_CONFLICT, noConsultancy: 'to_verify' },
          conflictNote: 'Possible link with the named consultant.',
        }),
      ],
      null,
      ANALYSIS,
    );
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-ACT-TO-VERIFY');
    const decision = form('Team decision', 'Record the decision');
    expect(
      within(decision).getByRole('radio', { name: 'Approve the team' }),
    ).toBeDisabled();
    expect(
      within(decision).getByText(
        'A declaration of this team is not confirmed (a conflict or a point to verify), so the team cannot be approved. Return it with a reason; it can be approved once a new version confirms every declaration.',
      ),
    ).toBeVisible();
    fireEvent.click(
      within(decision).getByRole('radio', { name: 'Return the team' }),
    );
    change(
      within(decision).getByLabelText('Reason for returning'),
      'Verify the link with the consultant first.',
    );
    const attestation = within(decision).getByRole('checkbox', {
      name: 'I attest that the person deciding on this team is not a member of the audit team.',
    });
    expect(attestation).not.toBeChecked();
    click(decision, 'Record the decision');
    expect(
      await within(region('Team decision')).findByText(
        'Confirm that the person deciding on the team is not a member of the audit team.',
      ),
    ).toBeVisible();
    // The person acting for the certification body is named on the team.
    const acting = group(decision, 'Team decision by the certification body');
    actFor(acting, { name: ' AUDITOR demo' });
    fireEvent.click(attestation);
    click(decision, 'Record the decision');
    expect(
      await within(region('Team decision')).findByText(ACTING_ON_TEAM),
    ).toBeVisible();
    expect(server.mutations()).toEqual([]);

    actFor(acting);
    click(decision, 'Record the decision');
    await waitFor(() =>
      expect(
        definition(
          region('Team decision'),
          'Decided on behalf of the certification body by',
        ),
      ).toBe(
        'Head of Body Demo — Head of the certification body · Nov 3, 2026',
      ),
    );
    expect(server.mutations()).toEqual([
      expect.objectContaining({
        path: `/api/certification-cases/${caseId}/team-decision`,
        body: {
          expectedRevision: 7,
          teamVersion: 1,
          decision: 'returned',
          reason: 'Verify the link with the consultant first.',
          onBehalf: actedFor(),
          independenceAttested: true,
        },
      }),
    ]);
    expect(
      definition(region('Team decision'), 'Independence from the audit team'),
    ).toBe(ATTESTED);
  });
});

describe('Certification Decision text correction', () => {
  it('corrects the decided texts from the latest values with a reason and keeps the outcome', async () => {
    const { server, actor } = serve({ manager: false, approver: true });
    const caseId = grantedCase(server, 'CERT-ACT-CORRECT');
    const dataForm = server.attachAsColleague(
      caseId,
      server.addSource('Certificate data form'),
      'certificate_data',
    );
    server.recordStepAsColleague(caseId, 'certificate_data', {
      texts: [CERTIFICATE_TEXTS[0]],
      agreedOn: '2026-11-06',
      agreementAttachmentId: dataForm,
    });
    server.interceptions.push({
      match: (request) =>
        request.method === 'POST' && request.path.endsWith('/decision'),
      respond: () =>
        Response.json(
          { code: 'CERTIFICATION_DECISION_OUTCOME_FIXED' },
          { status: 409 },
        ),
    });
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-ACT-CORRECT');
    click(region('Certification Decision'), 'Correct the decision texts');
    const correction = form(
      'Certification Decision',
      'Correct the decision texts',
    );
    // The outcome is shown, never offered; the values start from the latest.
    expect(within(correction).queryAllByRole('radio')).toEqual([]);
    expect(
      within(correction).getByText(
        'Decision: Certification granted. A correction keeps the decided outcome.',
      ),
    ).toBeVisible();
    expect(within(correction).getByLabelText('Decision maker')).toHaveValue(
      'Decision Maker Demo',
    );
    expect(
      within(group(correction, 'Certificate text 2')).getByLabelText(
        'Language',
      ),
    ).toHaveValue('en');
    click(correction, 'Remove Certificate text 2');
    click(correction, 'Record the correction');
    expect(
      await within(region('Certification Decision')).findByText(
        'Confirm that the decision maker is not a member of the audit team.',
      ),
    ).toBeVisible();
    fireEvent.click(
      within(correction).getByRole('checkbox', {
        name: 'I attest that the decision maker is not a member of the audit team.',
      }),
    );
    click(correction, 'Record the correction');
    expect(
      await within(region('Certification Decision')).findByText(
        REASON_REQUIRED,
      ),
    ).toBeVisible();
    expect(server.mutations()).toEqual([]);

    change(
      within(correction).getByLabelText('Correction reason'),
      'The English text is not part of the decision.',
    );
    click(correction, 'Record the correction');
    expect(
      await within(region('Certification Decision')).findByText(
        'A correction keeps the decided outcome; only its texts and references change. Reload the Case.',
      ),
    ).toBeVisible();
    expect(
      within(correction).getByRole('button', { name: 'Record the correction' }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Reload Case' }));
    const kept = await within(
      await screen.findByRole('region', { name: 'Certification Decision' }),
    ).findByRole('form', { name: 'Correct the decision texts' });
    click(kept, 'Record the correction');
    await waitFor(() =>
      expect(
        within(region('Certification Decision')).getByText(
          /Correction reason: The English text is not part of the decision\./u,
        ),
      ).toBeVisible(),
    );
    const sent = server.mutations();
    expect(sent).toHaveLength(2);
    expect(sent[0]?.body).toEqual(sent[1]?.body);
    expect(sent[1]).toEqual(
      expect.objectContaining({
        path: `/api/certification-cases/${caseId}/decision`,
        body: {
          expectedRevision: 21,
          reason: 'The English text is not part of the decision.',
          ...certificationDecision({ grantedTexts: [CERTIFICATE_TEXTS[0]] }),
        },
      }),
    );
    const decided = region('Certification Decision');
    expect(
      within(decided)
        .getAllByText('Language', { selector: 'dt' })
        .map((term) => term.nextElementSibling?.textContent),
    ).toEqual(['ro', 'ro', 'en']);
    expect(
      within(decided).getByText('Earlier versions of the decision (1)'),
    ).toBeInTheDocument();
    expect(timelineTitles().at(-1)).toBe(
      'Certification Decision — Certification granted (version 2)',
    );
    expect(definition(decided, 'Decision')).toBe('Certification granted');
  });

  it('offers a texts-only correction after issuance and preserves the broader independent correction of a refused decision', async () => {
    const { server, actor } = serve({ manager: false, approver: true });
    const certified = grantedCase(server, 'CERT-ACT-CERTIFIED');
    const dataForm = server.attachAsColleague(
      certified,
      server.addSource('Certificate data form'),
      'certificate_data',
    );
    server.recordStepAsColleague(certified, 'certificate_data', {
      texts: CERTIFICATE_TEXTS,
      agreedOn: '2026-11-06',
      agreementAttachmentId: dataForm,
    });
    const pdf = server.attachAsColleague(
      certified,
      server.addSource('Issued Certificate'),
      'certificate',
    );
    server.recordCertificateAsColleague(certified, {
      number: 'CERT-DEMO-001',
      attachmentId: pdf,
    });
    const refused = reportedCase(server, 'CERT-ACT-REFUSED');
    server.recordStepAsColleague(refused, 'recommendation', {
      recommendation: 'do_not_grant',
      basis: 'Major nonconformity not closed.',
      recommendedOn: null,
    });
    server.recordStepAsColleague(refused, 'dossier_review', dossierReview());
    server.recordStepAsColleague(
      refused,
      'decision',
      certificationDecision({ decision: 'refused', grantedTexts: null }),
    );
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-ACT-CERTIFIED');
    expect(
      within(region('Certification Decision')).getByRole('button', {
        name: 'Correct the decision texts',
      }),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Back to Certification Cases' }),
    );
    await openSeededCase('CERT-ACT-REFUSED');
    click(region('Certification Decision'), 'Correct the decision texts');
    const correction = form(
      'Certification Decision',
      'Correct the decision texts',
    );
    expect(within(correction).queryByRole('radio')).not.toBeInTheDocument();
    change(
      within(correction).getByLabelText('Decision maker'),
      'Corrected Independent Decider',
    );
    change(
      within(correction).getByLabelText('Correction reason'),
      'Correct the decider reference.',
    );
    fireEvent.click(
      within(correction).getByRole('checkbox', {
        name: 'I attest that the decision maker is not a member of the audit team.',
      }),
    );
    click(correction, 'Record the correction');
    await waitFor(() =>
      expect(
        definition(region('Certification Decision'), 'Decision maker'),
      ).toBe('Corrected Independent Decider'),
    );
    expect(definition(region('Certification Decision'), 'Decision')).toBe(
      'Certification refused',
    );
  });
});

describe('Certification business dates', () => {
  it('accepts an agreement signed today in the user’s time zone', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // Still Nov 6 in UTC, already Nov 7 in Romania.
    vi.setSystemTime(new Date('2026-11-06T23:30:00.000Z'));
    const { server, actor } = serve({ manager: true });
    const caseId = server.seed({
      orderReference: 'CERT-ACT-TODAY',
      duration: true,
    });
    const signed = server.attachAsColleague(
      caseId,
      server.addSource('Signed certification agreement'),
      'agreement',
    );
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-ACT-TODAY');
    const agreement = form('Certification agreement', 'Record the agreement');
    const signedOn = within(agreement).getByLabelText('Signed on');
    expect(signedOn).toHaveAttribute('max', '2026-11-07');
    change(signedOn, '2026-11-08');
    selectOptionByLabel(
      within(agreement).getByLabelText('Signed original'),
      'Signed certification agreement — version 1 (signed-certification-agreement.pdf)',
    );
    click(agreement, 'Record the agreement');
    expect(
      await within(region('Certification agreement')).findByText(
        'The agreement cannot be signed after today. Check the signature date.',
      ),
    ).toBeVisible();
    expect(server.mutations()).toEqual([]);
    change(signedOn, '2026-11-07');
    click(agreement, 'Record the agreement');
    await waitFor(() =>
      expect(definition(region('Certification agreement'), 'Signed on')).toBe(
        'Nov 7, 2026',
      ),
    );
    expect(server.mutations()).toEqual([
      expect.objectContaining({
        path: `/api/certification-cases/${caseId}/agreement`,
        body: {
          expectedRevision: 5,
          signedOn: '2026-11-07',
          attachmentId: signed,
        },
      }),
    ]);
  });
});
