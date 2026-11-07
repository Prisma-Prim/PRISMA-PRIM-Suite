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
    expect(
      await screen.findByText(
        'The application is accepted. The next step, audit duration, is not available in this version yet.',
      ),
    ).toBeVisible();
    expect(server.mutations()[3]?.body).toEqual({
      expectedRevision: 3,
      criteria: reviewCriteria('yes'),
      outcome: 'accepted',
    });
    expect(
      screen.getByText(
        'The application can no longer be corrected: it has been reviewed.',
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
