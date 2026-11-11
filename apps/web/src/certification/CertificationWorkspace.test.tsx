import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '../test/render-with-interface-locale';
import { selectOption } from '../test/select-option';
import { assertMessageCoverage } from '../localization/messages';
import type { ActorContext } from '../access-types';
import { CertificationWorkspace } from './CertificationWorkspace';
import { certificationMessages } from './certification.copy';
import {
  FakeCertificationServer,
  certificationActor,
  certificationIdentity,
  certificationIds,
  lactisFacts,
  reviewCriteria,
} from './certification.test-fixture';

const criteria = {
  scopeCertifiable:
    'The requested scope and food chain category can be certified',
  competentTeamAvailable: 'A competent audit team is available',
  competentDecisionMakerAvailable:
    'A competent certification decision maker is available',
  risksAcceptable: 'Impartiality and other risks are acceptable',
};
const notes = {
  scopeCertifiable: 'Scope note',
  competentTeamAvailable: 'Team note',
  competentDecisionMakerAvailable: 'Decision maker note',
  risksAcceptable: 'Risk note',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function renderWorkspace(
  actor: ActorContext = certificationActor({ manager: true }),
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

function change(element: HTMLElement, value: string) {
  fireEvent.change(element, { target: { value } });
}

function fillApplication(form: HTMLElement) {
  const field = (label: string) => within(form).getByLabelText(label);
  change(field('Declared legal name'), '  Lactis Demo SRL ');
  change(field('Declared address'), 'Str. Exemplu 1, Demo City');
  change(field('Site address'), 'Str. Exemplu 1, Demo City');
  change(field('Activity on the site'), 'Dairy plant');
  change(
    field('Requested scope'),
    'Production of pasteurised milk and yoghurt',
  );
  fireEvent.click(within(form).getByRole('checkbox', { name: 'CI' }));
  change(field('HACCP studies'), '2');
  change(field('Total headcount'), '40');
  // A decimal comma, as typed in the fr, ro and ru interfaces.
  change(field('Effective full-time equivalents'), '37,5');
  change(field('Shifts'), '2');
  change(field('Outsourced processes'), 'Laboratory testing');
  fireEvent.click(
    within(
      within(form).getByRole('group', {
        name: 'Did the client use a consultant?',
      }),
    ).getByRole('radio', { name: 'No' }),
  );
  change(field('Audit language 1'), 'ro');
  change(field('Preferred audit period'), 'Second quarter');
}

function answer(
  form: HTMLElement,
  criterion: keyof typeof criteria,
  choice: 'Yes' | 'No',
) {
  const group = within(form).getByRole('group', { name: criteria[criterion] });
  fireEvent.click(within(group).getByRole('radio', { name: choice }));
  change(within(group).getByLabelText('Note'), notes[criterion]);
}

/** Waits for visible text in one Case section; the timeline repeats values. */
async function expectInRegion(name: string, text: string | RegExp) {
  await waitFor(() =>
    expect(
      within(screen.getByRole('region', { name })).getByText(text),
    ).toBeVisible(),
  );
}

async function openSeededCase(reference: string) {
  fireEvent.click(await screen.findByRole('button', { name: reference }));
  return screen.findByRole('heading', {
    name: `Certification Case ${reference}`,
  });
}

function durationRegion() {
  return screen.getByRole('region', { name: 'Audit duration' });
}

function durationInputs() {
  return within(durationRegion()).getByRole('form', {
    name: 'Duration inputs',
  });
}

function computeProposal() {
  fireEvent.click(
    within(durationInputs()).getByRole('button', {
      name: 'Compute the proposal',
    }),
  );
}

/** The definition shown for a term, e.g. one proposal component. */
function definition(container: HTMLElement, term: string) {
  const [first] = within(container).getAllByText(term, { selector: 'dt' });
  return first?.nextElementSibling?.textContent;
}

function timelineTitles() {
  return [
    ...screen
      .getByRole('region', { name: 'Timeline' })
      .querySelectorAll(':scope > ol > li'),
  ].map((entry) => entry.querySelector('strong')?.textContent);
}

/** The dairy's proposal for CI, two studies, 37.5 FTE and no factor. */
const AS_PROPOSED = {
  initialOnSite: '3',
  stage1OnSite: '1',
  stage2OnSite: '2',
  surveillanceOnSite: '1',
  recertificationOnSite: '2',
};

describe('Certification Case workspace', () => {
  it('keeps every Certification message localized in en, fr, ro and ru', () => {
    expect(() =>
      assertMessageCoverage('certification', certificationMessages),
    ).not.toThrow();
  });

  it('opens a Case, records the application, corrects it with a reason and accepts the review', async () => {
    const server = new FakeCertificationServer();
    server.install();
    renderWorkspace();
    expect(
      await screen.findByText('No Certification Case is open in this Project.'),
    ).toBeVisible();

    fireEvent.click(
      screen.getByRole('button', { name: 'Open a Certification Case' }),
    );
    const entity = await screen.findByLabelText('Client legal entity');
    await waitFor(() => expect(entity).toBeEnabled());
    selectOption(entity, certificationIds.entity);
    change(screen.getByLabelText('Order reference'), ' CERT-0001/01 ');
    fireEvent.click(
      screen.getByRole('button', { name: 'Open Certification Case' }),
    );
    expect(
      await screen.findByRole('heading', {
        name: 'Certification Case CERT-0001/01',
      }),
    ).toBeVisible();
    expect(
      screen.getByText(
        'The review becomes available once the application is recorded.',
      ),
    ).toBeVisible();
    expect(server.mutations()[0]).toMatchObject({
      path: `/api/projects/${certificationIds.project}/certification-cases`,
      contentType: 'application/json',
      company: certificationIds.company,
      body: {
        clientLegalEntityId: certificationIds.entity,
        orderReference: 'CERT-0001/01',
      },
    });
    expect(server.mutations()[0]?.key).toBeTruthy();

    const record = screen.getByRole('form', { name: 'Record the application' });
    fillApplication(record);
    fireEvent.click(
      within(record).getByRole('button', { name: 'Record the application' }),
    );
    expect(
      await screen.findByRole('button', { name: 'Correct the application' }),
    ).toBeVisible();
    const caseId = [...server.cases.keys()][0];
    expect(server.mutations()[1]).toMatchObject({
      path: `/api/certification-cases/${caseId}/application`,
      body: { expectedRevision: 1, facts: lactisFacts() },
    });
    expect(server.mutations()[1]?.body).not.toHaveProperty('reason');

    fireEvent.click(
      screen.getByRole('button', { name: 'Correct the application' }),
    );
    const correction = screen.getByRole('form', {
      name: 'Correct the application',
    });
    expect(
      within(correction).getByLabelText('Declared legal name'),
    ).toHaveValue('Lactis Demo SRL');
    change(within(correction).getByLabelText('HACCP studies'), '3');
    fireEvent.click(
      within(correction).getByRole('button', { name: 'Record the correction' }),
    );
    expect(
      await screen.findByText(
        'State the reason for this correction (at most 2,000 characters).',
      ),
    ).toBeVisible();
    expect(server.mutations()).toHaveLength(2);
    change(
      within(correction).getByLabelText('Correction reason'),
      'The client declared three HACCP studies.',
    );
    fireEvent.click(
      within(correction).getByRole('button', { name: 'Record the correction' }),
    );
    await expectInRegion(
      'Application',
      /Correction reason: The client declared three/u,
    );
    expect(server.mutations()[2]?.body).toEqual({
      expectedRevision: 2,
      reason: 'The client declared three HACCP studies.',
      facts: lactisFacts({ haccpStudyCount: 3 }),
    });

    const review = screen.getByRole('form', { name: 'Record the review' });
    expect(within(review).queryAllByRole('radio', { checked: true })).toEqual(
      [],
    );
    for (const criterion of [
      'scopeCertifiable',
      'competentTeamAvailable',
      'competentDecisionMakerAvailable',
      'risksAcceptable',
    ] as const)
      answer(review, criterion, 'Yes');
    fireEvent.click(
      within(review).getByRole('radio', { name: 'Accept the application' }),
    );
    fireEvent.click(
      within(review).getByRole('button', { name: 'Record the review' }),
    );
    await expectInRegion(
      'Audit duration',
      'No audit duration is confirmed yet.',
    );
    expect(
      within(screen.getByRole('region', { name: 'Audit duration' })).getByRole(
        'form',
        { name: 'Duration inputs' },
      ),
    ).toBeVisible();
    expect(server.mutations()[3]?.body).toEqual({
      expectedRevision: 3,
      criteria: reviewCriteria('yes'),
      outcome: 'accepted',
    });
    // The accepted application stays correctable, with a reason, until the
    // decision: the dossier consistency check compares what changed.
    expect(
      within(screen.getByRole('region', { name: 'Application' })).getByRole(
        'button',
        { name: 'Correct the application' },
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('form', { name: 'Record the review' }),
    ).not.toBeInTheDocument();
    const timeline = [
      ...screen
        .getByRole('region', { name: 'Timeline' })
        .querySelectorAll(':scope > ol > li'),
    ];
    expect(
      timeline.map((entry) => entry.querySelector('strong')?.textContent),
    ).toEqual([
      'Application — version 1',
      'Application — version 2',
      'Application review — Accepted',
    ]);
    expect(timeline[1]).toHaveTextContent(
      'Correction reason: The client declared three HACCP studies.',
    );
    expect(new Set(server.mutations().map((request) => request.key)).size).toBe(
      4,
    );
  });

  it('rejects the application with a reason and closes the Case', async () => {
    const server = new FakeCertificationServer();
    const caseId = server.seed({
      orderReference: 'CERT-REJECT',
      application: true,
    });
    server.install();
    renderWorkspace();
    await openSeededCase('CERT-REJECT');
    const review = screen.getByRole('form', { name: 'Record the review' });
    answer(review, 'scopeCertifiable', 'Yes');
    answer(review, 'competentTeamAvailable', 'Yes');
    answer(review, 'competentDecisionMakerAvailable', 'Yes');
    answer(review, 'risksAcceptable', 'No');
    fireEvent.click(
      within(review).getByRole('radio', { name: 'Reject the application' }),
    );
    fireEvent.click(
      within(review).getByRole('button', { name: 'Record the review' }),
    );
    expect(
      await screen.findByText(/Answer every criterion yes or no with a note/u),
    ).toBeVisible();
    expect(server.mutations()).toEqual([]);
    change(
      within(review).getByLabelText('Reason given to the applicant'),
      'Impartiality risk cannot be mitigated.',
    );
    fireEvent.click(
      within(review).getByRole('button', { name: 'Record the review' }),
    );
    expect(
      await screen.findByText(
        'This Case is closed: the application was rejected. No further step can be recorded; a new application needs a new Case.',
      ),
    ).toBeVisible();
    expect(server.mutations()[0]).toMatchObject({
      path: `/api/certification-cases/${caseId}/application-review`,
      body: {
        expectedRevision: 2,
        outcome: 'rejected',
        rejectionReason: 'Impartiality risk cannot be mitigated.',
        criteria: {
          ...reviewCriteria('yes'),
          risksAcceptable: { answer: 'no', note: 'Risk note' },
        },
      },
    });
    await waitFor(() =>
      expect(
        screen.getAllByText('Closed — application rejected').length,
      ).toBeGreaterThanOrEqual(2),
    );
    expect(
      screen.queryByRole('button', { name: 'Correct the application' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('form', { name: 'Record the review' }),
    ).not.toBeInTheDocument();
  });

  it('refuses an acceptance with a "no" answer before any request, like the server', async () => {
    const server = new FakeCertificationServer();
    server.seed({ orderReference: 'CERT-GUARD', application: true });
    server.install();
    renderWorkspace();
    await openSeededCase('CERT-GUARD');
    const review = screen.getByRole('form', { name: 'Record the review' });
    answer(review, 'scopeCertifiable', 'Yes');
    answer(review, 'competentTeamAvailable', 'No');
    answer(review, 'competentDecisionMakerAvailable', 'Yes');
    answer(review, 'risksAcceptable', 'Yes');
    fireEvent.click(
      within(review).getByRole('radio', { name: 'Accept the application' }),
    );
    fireEvent.click(
      within(review).getByRole('button', { name: 'Record the review' }),
    );
    expect(
      await screen.findByText(
        'The application can be accepted only when every criterion is answered yes. Review the answers or reject the application with a reason.',
      ),
    ).toBeVisible();
    expect(server.mutations()).toEqual([]);

    // The server keeps the same rule for a request the guard did not stop.
    answer(review, 'competentTeamAvailable', 'Yes');
    server.interceptions.push({
      match: (request) => request.method === 'POST',
      respond: () =>
        Response.json(
          { code: 'CERTIFICATION_REVIEW_CRITERIA_NOT_MET' },
          { status: 400 },
        ),
    });
    fireEvent.click(
      within(review).getByRole('button', { name: 'Record the review' }),
    );
    await waitFor(() => expect(server.mutations()).toHaveLength(1));
    expect(
      await screen.findByText(/accepted only when every criterion/u),
    ).toBeVisible();
  });

  it('keeps the draft through a stale refusal, requires a reload and saves with a fresh key', async () => {
    const server = new FakeCertificationServer();
    const caseId = server.seed({
      orderReference: 'CERT-STALE',
      application: true,
    });
    server.install();
    renderWorkspace();
    await openSeededCase('CERT-STALE');
    fireEvent.click(
      screen.getByRole('button', { name: 'Correct the application' }),
    );
    const form = screen.getByRole('form', { name: 'Correct the application' });
    change(within(form).getByLabelText('Shifts'), '3');
    change(
      within(form).getByLabelText('Correction reason'),
      'A third shift starts in spring.',
    );
    server.correctAsColleague(caseId, 'Boris corrected the headcount.');
    fireEvent.click(
      within(form).getByRole('button', { name: 'Record the correction' }),
    );
    expect(
      await screen.findByText(
        'This Case changed since you opened it. Reload it before saving; your draft is kept.',
      ),
    ).toBeVisible();
    expect(
      within(form).getByRole('button', { name: 'Record the correction' }),
    ).toBeDisabled();
    expect(within(form).getByLabelText('Shifts')).toHaveValue('3');

    fireEvent.click(screen.getByRole('button', { name: 'Reload Case' }));
    await expectInRegion(
      'Application',
      /Correction reason: Boris corrected the headcount/u,
    );
    const kept = screen.getByRole('form', { name: 'Correct the application' });
    expect(within(kept).getByLabelText('Shifts')).toHaveValue('3');
    expect(within(kept).getByLabelText('Correction reason')).toHaveValue(
      'A third shift starts in spring.',
    );
    fireEvent.click(
      within(kept).getByRole('button', { name: 'Record the correction' }),
    );
    await expectInRegion(
      'Application',
      /Correction reason: A third shift starts/u,
    );
    const [stale, saved] = server.mutations();
    expect(stale?.body).toMatchObject({ expectedRevision: 2 });
    expect(saved?.body).toMatchObject({
      expectedRevision: 3,
      reason: 'A third shift starts in spring.',
      facts: { shiftCount: 3 },
    });
    expect(saved?.key).not.toBe(stale?.key);
  });

  it('retries an uncertain save with the same key and body', async () => {
    const server = new FakeCertificationServer();
    server.seed({ orderReference: 'CERT-RETRY' });
    server.install();
    renderWorkspace();
    await openSeededCase('CERT-RETRY');
    fillApplication(
      screen.getByRole('form', { name: 'Record the application' }),
    );
    server.interceptions.push({
      match: (request) => request.method === 'POST',
      respond: () => {
        throw new TypeError('Synthetic lost reply');
      },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Record the application' }),
    );
    expect(
      await screen.findByText(/The save could not be confirmed/u),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry unchanged save' }),
    );
    expect(
      await screen.findByRole('button', { name: 'Correct the application' }),
    ).toBeVisible();
    const [lost, retried] = server.mutations();
    expect(retried?.key).toBe(lost?.key);
    expect(retried?.body).toEqual(lost?.body);
  });

  it('keeps a confirmed save visible when the following refresh fails', async () => {
    const server = new FakeCertificationServer();
    const caseId = server.seed({ orderReference: 'CERT-REFRESH' });
    server.install();
    renderWorkspace();
    await openSeededCase('CERT-REFRESH');
    fillApplication(
      screen.getByRole('form', { name: 'Record the application' }),
    );
    server.interceptions.push({
      match: (request) =>
        request.method === 'GET' &&
        request.path === `/api/certification-cases/${caseId}`,
      respond: () => new Response(null, { status: 503 }),
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Record the application' }),
    );
    expect(
      await screen.findByText(
        'This read failed. Refresh before treating this page as current.',
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        'Saved. The confirmed result remains recorded even if a later refresh fails.',
      ),
    ).toBeVisible();
    expect(server.mutations()).toHaveLength(1);
  });

  it('refuses a duplicate order reference in plain language', async () => {
    const server = new FakeCertificationServer();
    server.seed({ orderReference: 'CERT-DUP' });
    server.install();
    renderWorkspace();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open a Certification Case' }),
    );
    const entity = await screen.findByLabelText('Client legal entity');
    await waitFor(() => expect(entity).toBeEnabled());
    selectOption(entity, certificationIds.entity);
    change(screen.getByLabelText('Order reference'), 'CERT-DUP');
    fireEvent.click(
      screen.getByRole('button', { name: 'Open Certification Case' }),
    );
    expect(
      await screen.findByText(
        'This order reference is already used in this Company. Enter another one.',
      ),
    ).toBeVisible();
    expect(server.cases.size).toBe(1);
  });

  it('explains a correction that changes no value and keeps the draft', async () => {
    const server = new FakeCertificationServer();
    server.seed({ orderReference: 'CERT-SAME', application: true });
    server.install();
    renderWorkspace();
    await openSeededCase('CERT-SAME');
    fireEvent.click(
      screen.getByRole('button', { name: 'Correct the application' }),
    );
    const form = screen.getByRole('form', { name: 'Correct the application' });
    change(within(form).getByLabelText('Correction reason'), 'Nothing new.');
    server.interceptions.push({
      match: (request) => request.method === 'POST',
      respond: () =>
        Response.json(
          { code: 'CERTIFICATION_CORRECTION_UNCHANGED' },
          { status: 409 },
        ),
    });
    fireEvent.click(
      within(form).getByRole('button', { name: 'Record the correction' }),
    );
    expect(
      await screen.findByText(
        'The correction changes no value. Change at least one value or cancel the correction.',
      ),
    ).toBeVisible();
    expect(
      within(form).getByRole('button', { name: 'Record the correction' }),
    ).toBeEnabled();
    expect(within(form).getByLabelText('Correction reason')).toHaveValue(
      'Nothing new.',
    );
  });

  it('shows a reader the Case without any mutation control', async () => {
    const server = new FakeCertificationServer({
      actor: () => certificationActor({ manager: false }),
    });
    server.seed({ orderReference: 'CERT-READ', application: true });
    server.install();
    renderWorkspace(certificationActor({ manager: false }));
    await openSeededCase('CERT-READ');
    await expectInRegion(
      'Application',
      'Production of pasteurised milk and yoghurt',
    );
    expect(
      screen.getByText(
        'You can consult this Case. Recording a step requires Company Certification Programme Manager.',
      ),
    ).toBeVisible();
    for (const name of [
      'Open a Certification Case',
      'Correct the application',
      'Record the review',
    ])
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(
      server.requests.some((request) =>
        request.path.endsWith('/certification-legal-entities'),
      ),
    ).toBe(false);
  });

  it('retires the Cases and revalidates authority when access is denied', async () => {
    const server = new FakeCertificationServer();
    server.seed({ orderReference: 'CERT-DENIED' });
    server.interceptions.push({
      match: (request) => request.path.endsWith('/certification-cases'),
      respond: () => new Response(null, { status: 403 }),
    });
    server.install();
    const onActorRevalidated = vi.fn();
    renderWorkspace(certificationActor({ manager: true }), {
      onActorRevalidated,
    });
    expect(
      await screen.findByText(
        'Certification access is unavailable. Your current authority is being checked.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'CERT-DENIED' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Open a Certification Case' }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(onActorRevalidated).toHaveBeenCalledOnce());
  });

  it('computes the duration proposal and confirms it unchanged without a justification', async () => {
    const server = new FakeCertificationServer();
    const caseId = server.seed({
      orderReference: 'CERT-DURATION',
      accepted: true,
    });
    server.install();
    renderWorkspace();
    await openSeededCase('CERT-DURATION');
    await expectInRegion(
      'Audit duration',
      'No audit duration is confirmed yet.',
    );
    const inputs = durationInputs();
    // One subcategory carries every declared study; no primary is preselected.
    expect(within(inputs).getByLabelText('HACCP studies in CI')).toHaveValue(
      '2',
    );
    expect(
      within(inputs).getByText(
        'Total: 2 of the 2 HACCP studies declared in the application.',
      ),
    ).toBeVisible();
    expect(within(inputs).getByLabelText('Interpreter')).toHaveValue('0');
    computeProposal();
    expect(
      await within(inputs).findByText(/^Choose the primary subcategory/u),
    ).toBeVisible();
    expect(server.proposalReads()).toEqual([]);

    selectOption(within(inputs).getByLabelText('Primary subcategory'), 'CI');
    computeProposal();
    const proposal = await within(durationRegion()).findByRole('region', {
      name: 'Proposal',
    });
    expect(definition(proposal, 'Basic time (TD)')).toBe('2');
    expect(definition(proposal, 'Additional HACCP studies (TH)')).toBe('0.5');
    expect(definition(proposal, 'Effective workforce (TFTE)')).toBe('0.5');
    expect(definition(proposal, 'Base duration (TD + TH + TFTE)')).toBe('3');
    expect(definition(proposal, 'Net adjustment')).toBe('0%');
    expect(definition(proposal, 'Initial audit in total')).toBe('3.6');
    expect(definition(proposal, 'Stage 1 on site')).toBe('1');
    expect(definition(proposal, 'Stage 2 on site')).toBe('2');
    expect(definition(proposal, 'Surveillance audit on site')).toBe('0.999');
    expect(definition(proposal, 'Surveillance audit in total')).toBe('1.1988');
    expect(definition(proposal, 'Recertification audit on site')).toBe('1.998');
    expect(definition(proposal, 'Rule version')).toBe('iso22000-basic-2026-11');
    expect(
      within(proposal).getByText(
        'The surveillance audit is below one auditor-day on site.',
      ),
    ).toBeVisible();
    expect(server.proposalReads()).toEqual([
      expect.objectContaining({
        method: 'POST',
        path: `/api/certification-cases/${caseId}/duration-proposal`,
        key: null,
        company: certificationIds.company,
        body: {
          primary: 'CI',
          haccpStudies: { CI: 2 },
          increases: {},
          reductions: {},
        },
      }),
    ]);

    const confirm = within(durationRegion()).getByRole('form', {
      name: 'Confirm the audit duration',
    });
    // Prefilled with the proposal rounded half up: 0.999 → 1, 1.998 → 2.
    expect(within(confirm).getByLabelText('Initial audit on site')).toHaveValue(
      '3',
    );
    expect(
      within(confirm).getByLabelText('Surveillance audit on site'),
    ).toHaveValue('1');
    expect(
      within(confirm).getByLabelText('Recertification audit on site'),
    ).toHaveValue('2');
    expect(within(confirm).getByText('Optional')).toBeVisible();
    expect(within(confirm).getByLabelText('Justification')).not.toBeRequired();
    fireEvent.click(
      within(confirm).getByRole('button', {
        name: 'Confirm the audit duration',
      }),
    );
    expect(
      await within(durationRegion()).findByRole('button', {
        name: 'Correct the audit duration',
      }),
    ).toBeVisible();
    expect(server.mutations()).toEqual([
      expect.objectContaining({
        path: `/api/certification-cases/${caseId}/duration`,
        body: {
          expectedRevision: 3,
          inputs: {
            primary: 'CI',
            haccpStudies: { CI: 2 },
            increases: {},
            reductions: {},
          },
          confirmed: AS_PROPOSED,
        },
      }),
    ]);
    expect(server.mutations()[0]?.key).toBeTruthy();
    expect(definition(durationRegion(), 'Initial audit on site')).toBe('3');
    expect(definition(durationRegion(), 'Justification')).toBe('Not provided');
    expect(definition(durationRegion(), 'Computation')).toBe(
      'Computed proposal',
    );
    // The confirmed duration opens the agreement step.
    await expectInRegion(
      'Certification agreement',
      'No certification agreement is recorded yet.',
    );
    expect(
      within(
        screen.getByRole('region', { name: 'Certification agreement' }),
      ).getByText(
        'No document is attached with the role Certification agreement yet. Attach the signed original in the dossier register first.',
      ),
    ).toBeVisible();
    expect(timelineTitles()).toEqual([
      'Application — version 1',
      'Application review — Accepted',
      'Audit duration — version 1',
    ]);
  });

  it('requires a justification for adjustment factors and recomputes outdated inputs', async () => {
    const server = new FakeCertificationServer();
    const caseId = server.seed({
      orderReference: 'CERT-FACTORS',
      accepted: true,
    });
    server.install();
    renderWorkspace();
    await openSeededCase('CERT-FACTORS');
    selectOption(
      within(durationInputs()).getByLabelText('Primary subcategory'),
      'CI',
    );
    change(within(durationInputs()).getByLabelText('Interpreter'), '10');
    computeProposal();
    const confirm = await within(durationRegion()).findByRole('form', {
      name: 'Confirm the audit duration',
    });
    expect(
      definition(
        within(durationRegion()).getByRole('region', { name: 'Proposal' }),
        'Net adjustment',
      ),
    ).toBe('10%');
    // 3 days × 110 % = 3.3; Stage 1 is a third rounded up to the quarter day.
    expect(within(confirm).getByLabelText('Initial audit on site')).toHaveValue(
      '3.3',
    );
    expect(within(confirm).getByLabelText('Stage 1 on site')).toHaveValue(
      '1.25',
    );
    expect(within(confirm).getByLabelText('Stage 2 on site')).toHaveValue(
      '2.05',
    );
    expect(
      within(confirm).getByText(
        'Required: factors are used, the duration is determined manually or a value differs from the rounded proposal.',
      ),
    ).toBeVisible();
    fireEvent.click(
      within(confirm).getByRole('button', {
        name: 'Confirm the audit duration',
      }),
    );
    expect(
      await within(durationRegion()).findByText(
        'Justify the factors used, a manual determination or any value other than the rounded proposal (at most 4,000 characters).',
      ),
    ).toBeVisible();
    expect(server.mutations()).toEqual([]);

    // Inputs edited after the computation make the proposal outdated.
    change(within(durationInputs()).getByLabelText('Interpreter'), '5');
    expect(
      within(durationRegion()).getByText(
        'The inputs changed since this proposal was computed. Compute it again before confirming.',
      ),
    ).toBeVisible();
    expect(
      within(durationRegion()).queryByRole('form', {
        name: 'Confirm the audit duration',
      }),
    ).not.toBeInTheDocument();
    change(within(durationInputs()).getByLabelText('Interpreter'), '10');
    const current = within(durationRegion()).getByRole('form', {
      name: 'Confirm the audit duration',
    });
    change(
      within(current).getByLabelText('Justification'),
      'An interpreter translates every interview.',
    );
    fireEvent.click(
      within(current).getByRole('button', {
        name: 'Confirm the audit duration',
      }),
    );
    expect(
      await within(durationRegion()).findByRole('button', {
        name: 'Correct the audit duration',
      }),
    ).toBeVisible();
    expect(server.mutations()[0]).toMatchObject({
      path: `/api/certification-cases/${caseId}/duration`,
      body: {
        expectedRevision: 3,
        inputs: { primary: 'CI', increases: { interpreter: 10 } },
        confirmed: {
          initialOnSite: '3.3',
          stage1OnSite: '1.25',
          stage2OnSite: '2.05',
          surveillanceOnSite: '1.1',
          recertificationOnSite: '2.2',
        },
        justification: 'An interpreter translates every interview.',
      },
    });
    expect(definition(durationRegion(), 'Increase factors (%)')).toBe(
      'Interpreter: 10%',
    );
    expect(definition(durationRegion(), 'Justification')).toBe(
      'An interpreter translates every interview.',
    );
  });

  it('guards the Stage sum and records adjusted values with a justification', async () => {
    const server = new FakeCertificationServer();
    server.seed({ orderReference: 'CERT-STAGES', accepted: true });
    server.install();
    renderWorkspace();
    await openSeededCase('CERT-STAGES');
    selectOption(
      within(durationInputs()).getByLabelText('Primary subcategory'),
      'CI',
    );
    computeProposal();
    const confirm = await within(durationRegion()).findByRole('form', {
      name: 'Confirm the audit duration',
    });
    change(within(confirm).getByLabelText('Stage 2 on site'), '1,5');
    // A value other than the rounded proposal needs a justification.
    expect(within(confirm).getByLabelText('Justification')).toBeRequired();
    change(
      within(confirm).getByLabelText('Justification'),
      'Stage 2 shortened: one production line is idle.',
    );
    fireEvent.click(
      within(confirm).getByRole('button', {
        name: 'Confirm the audit duration',
      }),
    );
    expect(
      await within(durationRegion()).findByText(
        'Stage 1 and Stage 2 on site must add up to the initial audit on site.',
      ),
    ).toBeVisible();
    expect(server.mutations()).toEqual([]);

    // The server keeps the same rule for a request the guard did not stop.
    change(within(confirm).getByLabelText('Initial audit on site'), '2,5');
    server.interceptions.push({
      match: (request) => request.path.endsWith('/duration'),
      respond: () =>
        Response.json(
          { code: 'CERTIFICATION_DURATION_STAGES_MISMATCH' },
          { status: 400 },
        ),
    });
    fireEvent.click(
      within(confirm).getByRole('button', {
        name: 'Confirm the audit duration',
      }),
    );
    await waitFor(() => expect(server.mutations()).toHaveLength(1));
    expect(
      await within(durationRegion()).findByText(
        'Stage 1 and Stage 2 on site must add up to the initial audit on site.',
      ),
    ).toBeVisible();
    fireEvent.click(
      within(confirm).getByRole('button', {
        name: 'Confirm the audit duration',
      }),
    );
    expect(
      await within(durationRegion()).findByRole('button', {
        name: 'Correct the audit duration',
      }),
    ).toBeVisible();
    const [refused, saved] = server.mutations();
    expect(saved?.body).toMatchObject({
      confirmed: { ...AS_PROPOSED, initialOnSite: '2.5', stage2OnSite: '1.5' },
      justification: 'Stage 2 shortened: one production line is idle.',
    });
    expect(saved?.key).not.toBe(refused?.key);
  });

  it('confirms a manual determination where the workforce bands overlap', async () => {
    const server = new FakeCertificationServer();
    server.seed({
      orderReference: 'CERT-MANUAL',
      accepted: true,
      facts: { effectiveFte: 1200, totalHeadcount: 1250, haccpStudyCount: 3 },
    });
    server.install();
    renderWorkspace();
    await openSeededCase('CERT-MANUAL');
    selectOption(
      within(durationInputs()).getByLabelText('Primary subcategory'),
      'CI',
    );
    computeProposal();
    expect(
      await within(durationRegion()).findByText(
        /workforce bands overlap, so no proposal is computed/u,
      ),
    ).toBeVisible();
    const confirm = within(durationRegion()).getByRole('form', {
      name: 'Confirm the audit duration',
    });
    expect(within(confirm).getByLabelText('Initial audit on site')).toHaveValue(
      '',
    );
    expect(within(confirm).getByLabelText('Justification')).toBeRequired();
    const values = {
      'Initial audit on site': '6.5',
      'Stage 1 on site': '2.25',
      'Stage 2 on site': '4.25',
      'Surveillance audit on site': '2.25',
      'Recertification audit on site': '4.5',
    };
    for (const [label, value] of Object.entries(values))
      change(within(confirm).getByLabelText(label), value);
    fireEvent.click(
      within(confirm).getByRole('button', {
        name: 'Confirm the audit duration',
      }),
    );
    expect(
      await within(durationRegion()).findByText(
        /^Justify the factors used, a manual determination/u,
      ),
    ).toBeVisible();
    expect(server.mutations()).toEqual([]);
    change(
      within(confirm).getByLabelText('Justification'),
      'Workforce band set by the certification body.',
    );
    fireEvent.click(
      within(confirm).getByRole('button', {
        name: 'Confirm the audit duration',
      }),
    );
    await waitFor(() =>
      expect(definition(durationRegion(), 'Computation')).toBe(
        'Manual determination: the workforce bands overlap',
      ),
    );
    expect(server.mutations()[0]?.body).toMatchObject({
      confirmed: {
        initialOnSite: '6.5',
        stage1OnSite: '2.25',
        stage2OnSite: '4.25',
        surveillanceOnSite: '2.25',
        recertificationOnSite: '4.5',
      },
      justification: 'Workforce band set by the certification body.',
    });
  });

  it('explains refused inputs in plain language and offers no confirmation', async () => {
    const server = new FakeCertificationServer();
    server.seed({
      orderReference: 'CERT-REFUSED',
      accepted: true,
      facts: { foodChainSubcategories: ['D', 'CI'], haccpStudyCount: 2 },
    });
    server.install();
    renderWorkspace();
    await openSeededCase('CERT-REFUSED');
    const inputs = durationInputs();
    // Several subcategories: the programme manager distributes the studies.
    expect(within(inputs).getByLabelText('HACCP studies in D')).toHaveValue('');
    change(within(inputs).getByLabelText('HACCP studies in D'), '2');
    change(within(inputs).getByLabelText('HACCP studies in CI'), '1');
    expect(
      within(inputs).getByText(
        'Total: 3 of the 2 HACCP studies declared in the application.',
      ),
    ).toBeVisible();
    selectOption(within(inputs).getByLabelText('Primary subcategory'), 'D');
    computeProposal();
    expect(
      await within(inputs).findByText(
        'The HACCP studies per subcategory must add up to the number declared in the application.',
      ),
    ).toBeVisible();
    expect(server.proposalReads()).toEqual([]);

    change(within(inputs).getByLabelText('HACCP studies in CI'), '0');
    change(within(inputs).getByLabelText('Management system maturity'), '15');
    computeProposal();
    const proposal = await within(durationRegion()).findByRole('region', {
      name: 'Proposal',
    });
    expect(
      within(proposal).getByText('No proposal can be computed:'),
    ).toBeVisible();
    expect(
      within(proposal).getByText(
        'Another subcategory of the application has a higher basic time. Choose it as the primary subcategory.',
      ),
    ).toBeVisible();
    expect(
      within(proposal).getByText('A reduction factor exceeds 10%.'),
    ).toBeVisible();
    expect(
      within(durationRegion()).queryByRole('form', {
        name: 'Confirm the audit duration',
      }),
    ).not.toBeInTheDocument();
    expect(server.proposalReads()[0]?.body).toEqual({
      primary: 'D',
      haccpStudies: { D: 2 },
      increases: {},
      reductions: { systemMaturity: 15 },
    });
    expect(server.mutations()).toEqual([]);
  });

  it('keeps the duration draft through a stale refusal and records it as a correction', async () => {
    const server = new FakeCertificationServer();
    const caseId = server.seed({
      orderReference: 'CERT-DURATION-STALE',
      accepted: true,
    });
    server.install();
    renderWorkspace();
    await openSeededCase('CERT-DURATION-STALE');
    selectOption(
      within(durationInputs()).getByLabelText('Primary subcategory'),
      'CI',
    );
    change(within(durationInputs()).getByLabelText('Interpreter'), '10');
    computeProposal();
    const confirm = await within(durationRegion()).findByRole('form', {
      name: 'Confirm the audit duration',
    });
    change(
      within(confirm).getByLabelText('Justification'),
      'An interpreter translates every interview.',
    );
    server.confirmDurationAsColleague(caseId);
    fireEvent.click(
      within(confirm).getByRole('button', {
        name: 'Confirm the audit duration',
      }),
    );
    expect(
      await within(durationRegion()).findByText(
        'This Case changed since you opened it. Reload it before saving; your draft is kept.',
      ),
    ).toBeVisible();
    expect(
      within(confirm).getByRole('button', {
        name: 'Confirm the audit duration',
      }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Reload Case' }));
    await expectInRegion('Audit duration', /Recorded by: Boris Demo/u);
    const correction = within(durationRegion()).getByRole('form', {
      name: 'Correct the audit duration',
    });
    expect(within(correction).getByLabelText('Justification')).toHaveValue(
      'An interpreter translates every interview.',
    );
    expect(
      within(correction).getByLabelText('Initial audit on site'),
    ).toHaveValue('3.3');
    expect(within(durationInputs()).getByLabelText('Interpreter')).toHaveValue(
      '10',
    );
    fireEvent.click(
      within(correction).getByRole('button', {
        name: 'Record the correction',
      }),
    );
    expect(
      await within(durationRegion()).findByText(
        'State the reason for this correction (at most 2,000 characters).',
      ),
    ).toBeVisible();
    change(
      within(correction).getByLabelText('Correction reason'),
      'The audit needs an interpreter.',
    );
    fireEvent.click(
      within(correction).getByRole('button', {
        name: 'Record the correction',
      }),
    );
    await expectInRegion(
      'Audit duration',
      /Correction reason: The audit needs an interpreter/u,
    );
    const [stale, saved] = server.mutations();
    expect(stale?.body).toMatchObject({ expectedRevision: 3 });
    expect(stale?.body).not.toHaveProperty('reason');
    expect(saved?.body).toMatchObject({
      expectedRevision: 4,
      reason: 'The audit needs an interpreter.',
      inputs: { increases: { interpreter: 10 } },
      justification: 'An interpreter translates every interview.',
    });
    expect(saved?.key).not.toBe(stale?.key);
    expect(timelineTitles().slice(-2)).toEqual([
      'Audit duration — version 1',
      'Audit duration — version 2',
    ]);
  });

  it('shows a reader the confirmed duration without any duration form', async () => {
    const server = new FakeCertificationServer({
      actor: () => certificationActor({ manager: false }),
    });
    server.seed({ orderReference: 'CERT-READ-DURATION', duration: true });
    server.install();
    renderWorkspace(certificationActor({ manager: false }));
    await openSeededCase('CERT-READ-DURATION');
    await expectInRegion('Audit duration', /Recorded by: Boris Demo/u);
    expect(definition(durationRegion(), 'Initial audit on site')).toBe('3');
    expect(definition(durationRegion(), 'Surveillance audit on site')).toBe(
      '1',
    );
    expect(definition(durationRegion(), 'Primary subcategory')).toBe('CI');
    expect(
      within(durationRegion()).queryByRole('form'),
    ).not.toBeInTheDocument();
    for (const name of [
      'Correct the audit duration',
      'Compute the proposal',
      'Confirm the audit duration',
    ])
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    expect(
      server.requests.filter((request) => request.method !== 'GET'),
    ).toEqual([]);
  });

  it('renders nothing without the Certification Reader grant', () => {
    const actor = certificationActor({ manager: true });
    const company = actor.activeCompany;
    if (!company) throw new Error('Company fixture required');
    const { container } = renderWorkspace({
      ...actor,
      activeCompany: {
        ...company,
        certificationReaderPermissionSetVersion: undefined,
      },
    });
    expect(container).toBeEmptyDOMElement();
  });
});
