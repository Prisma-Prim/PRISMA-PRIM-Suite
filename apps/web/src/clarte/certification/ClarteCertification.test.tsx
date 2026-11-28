import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fireEvent,
  screen,
  waitFor,
  within,
} from '../../test/render-with-interface-locale';
import { renderInInterface } from '../../test/app-interface';
import { selectOption, selectOptionByLabel } from '../../test/select-option';
import type { ActorContext } from '../../access-types';
import { CertificationWorkspace } from '../../certification/CertificationWorkspace';
import {
  FakeCertificationServer,
  certificationActor,
  certificationIdentity,
  certificationIds,
  lactisFacts,
  stagePlan,
  teamMember,
} from '../../certification/certification.test-fixture';
import { assertEveryLocalizedCatalogCovered } from '../../test/localized-catalog-coverage';
import * as clarteCertificationCopy from './clarte-certification.copy';

const PROJECT_TITLE = 'Fictional dairy certification';
const STEP_NAMES = [
  'Application',
  'Application review',
  'Audit duration',
  'Certification agreement',
  'Audit team',
  'Stage 1 audit',
  'Stage 2 audit',
  'Nonconformity follow-up',
  'Team recommendation',
  'Certificate data',
  'Dossier review',
  'Certification Decision',
  'Certificate',
];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  localStorage.clear();
});

/** A server whose current actor matches the rendered one. */
function serve(grants: Parameters<typeof certificationActor>[0]) {
  const actor = certificationActor(grants);
  const server = new FakeCertificationServer({ actor: () => actor });
  return { server, actor };
}

/** The Project's Certification tab as Clarté shows it. */
function renderClarte(
  actor: ActorContext,
  callbacks: { onActorRevalidated?: (actor: ActorContext) => void } = {},
) {
  return renderInInterface(
    'clarte',
    <CertificationWorkspace
      actor={actor}
      identity={certificationIdentity}
      projectId={certificationIds.project}
      projectTitle={PROJECT_TITLE}
      {...callbacks}
    />,
  );
}

function change(element: HTMLElement, value: string) {
  fireEvent.change(element, { target: { value } });
}

function region(name: string) {
  return screen.getByRole('region', { name });
}

async function openCase(reference: string) {
  fireEvent.click(await screen.findByRole('button', { name: reference }));
  return screen.findByRole('heading', {
    name: `Certification Case ${reference}`,
  });
}

function stepsRail() {
  return screen.getByRole('navigation', {
    name: 'Steps of the Certification Case',
  });
}

/** A step's button in the rail; its name ends with its status. */
function stepButton(name: string) {
  const list = within(stepsRail()).getByRole('list', { name: 'Steps' });
  const button = within(list)
    .getAllByRole('button')
    .find((candidate) => candidate.querySelector('b')?.textContent === name);
  if (!button) throw new Error(`Missing step ${name}`);
  return button;
}

function stepStatus(name: string) {
  return stepButton(name).querySelector('.clarte-visually-hidden')?.textContent;
}

function chooseStep(name: string) {
  fireEvent.click(stepButton(name));
}

function chooseRegister(name: string) {
  fireEvent.click(
    within(
      within(stepsRail()).getByRole('list', { name: 'Case registers' }),
    ).getByRole('button', { name }),
  );
}

/** The definition shown for a term in a container. */
function definition(container: HTMLElement, term: string) {
  const [first] = within(container).getAllByText(term, { selector: 'dt' });
  return first?.nextElementSibling?.textContent;
}

function fillApplication(form: HTMLElement) {
  const field = (label: string) => within(form).getByLabelText(label);
  change(field('Declared legal name'), 'Lactis Demo SRL');
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
  change(field('Effective full-time equivalents'), '37.5');
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

const CRITERIA = [
  'The requested scope and food chain category can be certified',
  'A competent audit team is available',
  'A competent certification decision maker is available',
  'Impartiality and other risks are acceptable',
];

function answerReview(form: HTMLElement, last: 'Yes' | 'No') {
  CRITERIA.forEach((criterion, index) => {
    const group = within(form).getByRole('group', { name: criterion });
    fireEvent.click(
      within(group).getByRole('radio', {
        name: index === CRITERIA.length - 1 ? last : 'Yes',
      }),
    );
    change(within(group).getByLabelText('Note'), `Note ${index + 1}`);
  });
}

function decide(choice: 'Approve the team' | 'Return the team', reason = '') {
  const form = within(region('Team decision')).getByRole('form', {
    name: 'Record the decision',
  });
  fireEvent.click(within(form).getByRole('radio', { name: choice }));
  if (reason)
    change(within(form).getByLabelText('Reason for returning'), reason);
  fireEvent.click(
    within(form).getByRole('checkbox', {
      name: 'I attest that the person deciding on this team is not a member of the audit team.',
    }),
  );
  fireEvent.click(
    within(form).getByRole('button', { name: 'Record the decision' }),
  );
}

function fillPlan(
  form: HTMLElement,
  input: { start: string; end: string; onSite: string; document: string },
) {
  change(within(form).getByLabelText('Start date'), input.start);
  change(within(form).getByLabelText('End date'), input.end);
  change(within(form).getByLabelText('On-site auditor-days'), input.onSite);
  change(within(form).getByLabelText('Remote auditor-days'), '0');
  change(
    within(form).getByLabelText('Objectives'),
    'Evaluate readiness of the food safety management system',
  );
  change(
    within(form).getByLabelText('Audit scope'),
    'Production of pasteurised milk and yoghurt',
  );
  selectOptionByLabel(
    within(form).getByLabelText('Audit plan PDF'),
    input.document,
  );
}

function installDownload() {
  const saved: string[] = [];
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(function (this: HTMLAnchorElement) {
      saved.push(this.download);
    });
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:fictional-register'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  });
  return { saved, click };
}

describe('Certification Case page in Clarté', () => {
  it('has every text of the Case page in the four interface languages', () => {
    expect(
      assertEveryLocalizedCatalogCovered({
        './clarte-certification.copy.ts': clarteCertificationCopy,
      }),
    ).toEqual(['clarte-certification.copy.ts#clarteCertificationMessages']);
  });

  it('lists, refreshes and opens the Cases, then shows the ordered steps with their status (EX-201, EX-235)', async () => {
    const { server, actor } = serve({ manager: true });
    server.seed({ orderReference: 'CERT-LIST-A', accepted: true });
    server.seed({ orderReference: 'CERT-LIST-B' });
    server.install();
    renderClarte(actor);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading Certification Cases…',
    );
    const cases = await screen.findByRole('region', {
      name: 'Certification Cases of this Project',
    });
    expect(
      await within(cases).findByRole('button', { name: 'CERT-LIST-A' }),
    ).toBeVisible();
    expect(
      within(cases).getByRole('button', { name: 'CERT-LIST-B' }),
    ).toBeVisible();
    expect(within(cases).getByText('Cases: 2')).toBeVisible();

    const listReads = () =>
      server.requests.filter((request) =>
        request.path.endsWith('/certification-cases'),
      ).length;
    expect(listReads()).toBe(1);
    fireEvent.click(
      within(cases).getByRole('button', {
        name: 'Refresh Certification Cases',
      }),
    );
    await waitFor(() => expect(listReads()).toBe(2));

    const heading = await openCase('CERT-LIST-A');
    // The list entry that opened the Case is gone: its heading takes focus.
    await waitFor(() => expect(heading).toHaveFocus());
    expect(
      screen.queryByRole('region', {
        name: 'Certification Cases of this Project',
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        `Lactis Demo SRL · ISO 22000:2018 · Initial certification · Project: ${PROJECT_TITLE}`,
      ),
    ).toBeVisible();
    expect(screen.getByText('Step 3 of 13')).toBeVisible();

    // The ordered steps of the existing case timeline, each with its status.
    const names = within(
      within(stepsRail()).getByRole('list', { name: 'Steps' }),
    )
      .getAllByRole('button')
      .map((button) => button.querySelector('b')?.textContent);
    expect(names).toEqual(STEP_NAMES);
    expect(STEP_NAMES.map(stepStatus)).toEqual([
      'Done',
      'Done',
      'Current step',
      ...STEP_NAMES.slice(3).map(() => 'Upcoming'),
    ]);
    // The Case opens on its current step, one step at a time.
    expect(stepButton('Audit duration')).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(
      within(region('Audit duration')).getByRole('form', {
        name: 'Duration inputs',
      }),
    ).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Application' })).toBeNull();

    chooseStep('Application');
    expect(stepButton('Application')).toHaveAttribute('aria-current', 'true');
    expect(
      within(region('Application')).getByText(
        'Production of pasteurised milk and yoghurt',
      ),
    ).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Audit duration' })).toBeNull();

    // A step not open yet says what it waits for.
    chooseStep('Stage 1 audit');
    expect(
      screen.getByText('This step opens once the earlier steps are recorded.'),
    ).toBeVisible();

    chooseRegister('Timeline');
    const timeline = region('Timeline');
    expect(
      [...timeline.querySelectorAll(':scope > ol > li')].map(
        (entry) => entry.querySelector('strong')?.textContent,
      ),
    ).toEqual(['Application — version 1', 'Application review — Accepted']);

    fireEvent.click(
      screen.getByRole('button', { name: 'Back to Certification Cases' }),
    );
    expect(
      await screen.findByRole('button', { name: 'CERT-LIST-B' }),
    ).toBeVisible();
    expect(server.mutations()).toEqual([]);
  });

  it('opens a new initial ISO 22000:2018 Case for a Client legal entity (EX-202)', async () => {
    const { server, actor } = serve({ manager: true });
    server.install();
    renderClarte(actor);
    expect(
      await screen.findByText('No Certification Case is open in this Project.'),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Open a Certification Case' }),
    );
    const panel = screen.getByRole('dialog', {
      name: 'Open a Certification Case',
    });
    const form = within(panel).getByRole('form', {
      name: 'Open a Certification Case',
    });
    const entity = within(form).getByLabelText('Client legal entity');
    await waitFor(() => expect(entity).toBeEnabled());
    selectOption(entity, certificationIds.entity);
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Open Certification Case' }),
    );
    await waitFor(() =>
      expect(within(form).getByLabelText('Order reference')).toHaveAttribute(
        'aria-invalid',
        'true',
      ),
    );
    expect(server.mutations()).toEqual([]);
    change(within(form).getByLabelText('Order reference'), ' CERT-NEW/01 ');
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Open Certification Case' }),
    );
    expect(
      await screen.findByRole('heading', {
        name: 'Certification Case CERT-NEW/01',
      }),
    ).toBeVisible();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(server.mutations()).toEqual([
      expect.objectContaining({
        path: `/api/projects/${certificationIds.project}/certification-cases`,
        company: certificationIds.company,
        body: {
          clientLegalEntityId: certificationIds.entity,
          orderReference: 'CERT-NEW/01',
        },
      }),
    ]);
    expect(server.mutations()[0]?.key).toBeTruthy();
    expect(stepStatus('Application')).toBe('Current step');
    expect(
      screen.getByRole('form', { name: 'Record the application' }),
    ).toBeVisible();
  });

  it('records the application, then corrects it with a reason as a new version (EX-203, EX-204)', async () => {
    const { server, actor } = serve({ manager: true });
    const caseId = server.seed({ orderReference: 'CERT-APPLY' });
    server.install();
    renderClarte(actor);
    await openCase('CERT-APPLY');
    const record = screen.getByRole('form', { name: 'Record the application' });
    fillApplication(record);
    fireEvent.click(
      within(record).getByRole('button', { name: 'Record the application' }),
    );
    // The page stays on the step it recorded; the next step becomes current.
    expect(
      await screen.findByRole('button', { name: 'Correct the application' }),
    ).toBeVisible();
    expect(stepButton('Application')).toHaveAttribute('aria-current', 'true');
    expect(stepStatus('Application')).toBe('Done');
    expect(stepStatus('Application review')).toBe('Current step');
    expect(server.mutations()[0]).toMatchObject({
      path: `/api/certification-cases/${caseId}/application`,
      body: { expectedRevision: 1, facts: lactisFacts() },
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Correct the application' }),
    );
    const correction = screen.getByRole('form', {
      name: 'Correct the application',
    });
    change(within(correction).getByLabelText('HACCP studies'), '3');
    change(
      within(correction).getByLabelText('Correction reason'),
      'The client declared three HACCP studies.',
    );
    fireEvent.click(
      within(correction).getByRole('button', { name: 'Record the correction' }),
    );
    expect(
      await within(region('Application')).findByText(
        /Correction reason: The client declared three/u,
      ),
    ).toBeVisible();
    expect(server.mutations()[1]?.body).toEqual({
      expectedRevision: 2,
      reason: 'The client declared three HACCP studies.',
      facts: lactisFacts({ haccpStudyCount: 3 }),
    });
    expect(
      within(stepButton('Application')).getByText('Recorded — version 2'),
    ).toBeVisible();
  });

  it('prefills the application from a human-verified dossier analysis without recording it (EX-205)', async () => {
    const { server, actor } = serve({ manager: true, documents: true });
    const caseId = server.seed({ orderReference: 'CERT-PREFILL' });
    const runId = '15380000-0000-4000-8000-000000000001';
    const quote = 'Firma Fictivă SRL';
    server.interceptions.push({
      match: (request) => request.path.endsWith('/dossier-analysis'),
      respond: () =>
        Response.json({
          runs: [
            {
              id: runId,
              snapshotHash: 'a'.repeat(64),
              createdAt: '2026-11-18T08:00:00Z',
              stale: false,
            },
          ],
          runsNextCursor: null,
        }),
    });
    const preview = {
      format: 'CERTIFICATION_APPLICATION_DRAFT/1',
      target: { caseId, projectId: certificationIds.project, revision: 1 },
      run: { id: runId, snapshotHash: 'a'.repeat(64) },
      candidates: [
        {
          field: 'declaredLegalName',
          value: quote,
          proposalValue: quote,
          suggestionId: '15380000-0000-4000-8000-000000000002',
          reviewRevision: 1,
          reviewer: 'Fictional Reviewer',
          reviewedAt: '2026-11-18T08:00:00Z',
          citations: [
            {
              sourceId: '15380000-0000-4000-8000-000000000003',
              documentVersionId: '15380000-0000-4000-8000-000000000004',
              locator: 'word/document.xml:p:1',
              documentTitle: 'Fictional reviewed source',
              fileName: 'fictiv.docx',
              versionNumber: 1,
              start: 0,
              end: quote.length,
              quote,
              passageSha256: 'b'.repeat(64),
            },
          ],
        },
      ],
    };
    for (let read = 0; read < 2; read++)
      server.interceptions.push({
        match: (request) => request.path.endsWith('/certification-draft'),
        respond: () => Response.json(preview),
      });
    server.install();
    renderClarte(actor);
    await openCase('CERT-PREFILL');
    const form = screen.getByRole('form', { name: 'Record the application' });
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Prepare from reviewed analysis',
      }),
    );
    selectOption(await screen.findByLabelText('Analysis run'), runId);
    fireEvent.click(
      screen.getByRole('button', { name: 'Preview reviewed values' }),
    );
    fireEvent.click(
      await screen.findByRole('checkbox', {
        name: `Use Declared legal name: ${quote}`,
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Insert selected values into draft' }),
    );
    expect(
      await screen.findByText(
        'Selected values inserted. Check and edit the draft before saving.',
      ),
    ).toBeVisible();
    expect(within(form).getByLabelText('Declared legal name')).toHaveValue(
      quote,
    );
    expect(server.mutations()).toEqual([]);
  });

  it('reviews the application against its four criteria and accepts it, or rejects it with a reason (EX-206)', async () => {
    const { server, actor } = serve({ manager: true });
    const accepted = server.seed({
      orderReference: 'CERT-REVIEW',
      application: true,
    });
    const rejected = server.seed({
      orderReference: 'CERT-REVIEW-NO',
      application: true,
    });
    server.install();
    renderClarte(actor);
    await openCase('CERT-REVIEW');
    expect(stepButton('Application review')).toHaveAttribute(
      'aria-current',
      'true',
    );
    const review = screen.getByRole('form', { name: 'Record the review' });
    answerReview(review, 'Yes');
    fireEvent.click(
      within(review).getByRole('radio', { name: 'Accept the application' }),
    );
    fireEvent.click(
      within(review).getByRole('button', { name: 'Record the review' }),
    );
    await waitFor(() =>
      expect(stepStatus('Audit duration')).toBe('Current step'),
    );
    expect(server.mutations()[0]).toMatchObject({
      path: `/api/certification-cases/${accepted}/application-review`,
      body: {
        expectedRevision: 2,
        outcome: 'accepted',
        criteria: {
          scopeCertifiable: { answer: 'yes', note: 'Note 1' },
          risksAcceptable: { answer: 'yes', note: 'Note 4' },
        },
      },
    });
    expect(definition(region('Application review'), 'Outcome')).toBe(
      'Accepted',
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Back to Certification Cases' }),
    );
    await openCase('CERT-REVIEW-NO');
    const refusal = screen.getByRole('form', { name: 'Record the review' });
    answerReview(refusal, 'No');
    fireEvent.click(
      within(refusal).getByRole('radio', { name: 'Reject the application' }),
    );
    change(
      within(refusal).getByLabelText('Reason given to the applicant'),
      'Impartiality risk cannot be mitigated.',
    );
    fireEvent.click(
      within(refusal).getByRole('button', { name: 'Record the review' }),
    );
    expect(
      await screen.findByText(
        'This Case is closed: the application was rejected. No further step can be recorded; a new application needs a new Case.',
      ),
    ).toBeVisible();
    expect(server.mutations()[1]).toMatchObject({
      path: `/api/certification-cases/${rejected}/application-review`,
      body: {
        outcome: 'rejected',
        rejectionReason: 'Impartiality risk cannot be mitigated.',
      },
    });
    // A closed Case marks what was recorded done and the rest never reached.
    expect(STEP_NAMES.map(stepStatus)).toEqual([
      'Done',
      'Done',
      ...STEP_NAMES.slice(2).map(() => 'Not reached'),
    ]);
  });

  it('computes the duration proposal, confirms it, then corrects it with a reason (EX-207, EX-208)', async () => {
    const { server, actor } = serve({ manager: true });
    const caseId = server.seed({
      orderReference: 'CERT-DURATION',
      accepted: true,
    });
    server.install();
    renderClarte(actor);
    await openCase('CERT-DURATION');
    const inputs = within(region('Audit duration')).getByRole('form', {
      name: 'Duration inputs',
    });
    selectOption(within(inputs).getByLabelText('Primary subcategory'), 'CI');
    fireEvent.click(
      within(inputs).getByRole('button', { name: 'Compute the proposal' }),
    );
    const proposal = await within(region('Audit duration')).findByRole(
      'region',
      { name: 'Proposal' },
    );
    expect(definition(proposal, 'Initial audit in total')).toBe('3.6');
    expect(server.proposalReads()).toEqual([
      expect.objectContaining({
        path: `/api/certification-cases/${caseId}/duration-proposal`,
        key: null,
      }),
    ]);
    const confirm = within(region('Audit duration')).getByRole('form', {
      name: 'Confirm the audit duration',
    });
    fireEvent.click(
      within(confirm).getByRole('button', {
        name: 'Confirm the audit duration',
      }),
    );
    fireEvent.click(
      await within(region('Audit duration')).findByRole('button', {
        name: 'Correct the audit duration',
      }),
    );
    expect(stepStatus('Audit duration')).toBe('Done');
    // A correction starts from the recorded inputs and a fresh proposal.
    fireEvent.click(
      within(
        within(region('Audit duration')).getByRole('form', {
          name: 'Duration inputs',
        }),
      ).getByRole('button', { name: 'Compute the proposal' }),
    );
    const correction = await within(region('Audit duration')).findByRole(
      'form',
      { name: 'Correct the audit duration' },
    );
    change(within(correction).getByLabelText('Initial audit on site'), '3.5');
    change(within(correction).getByLabelText('Stage 2 on site'), '2.5');
    change(
      within(correction).getByLabelText('Justification'),
      'A second production line is audited on site.',
    );
    change(
      within(correction).getByLabelText('Correction reason'),
      'The second line was added to the scope.',
    );
    fireEvent.click(
      within(correction).getByRole('button', { name: 'Record the correction' }),
    );
    expect(
      await within(region('Audit duration')).findByText(
        /Correction reason: The second line was added/u,
      ),
    ).toBeVisible();
    const [confirmed, corrected] = server.mutations();
    expect(confirmed).toMatchObject({
      path: `/api/certification-cases/${caseId}/duration`,
      body: { expectedRevision: 3, inputs: { primary: 'CI' } },
    });
    expect(confirmed?.body).not.toHaveProperty('reason');
    expect(corrected).toMatchObject({
      path: `/api/certification-cases/${caseId}/duration`,
      body: {
        expectedRevision: 4,
        reason: 'The second line was added to the scope.',
        justification: 'A second production line is audited on site.',
        confirmed: { initialOnSite: '3.5', stage2OnSite: '2.5' },
      },
    });
  });

  it('records the certification agreement on its signed original, then corrects it (EX-209)', async () => {
    const { server, actor } = serve({ manager: true });
    const caseId = server.seed({
      orderReference: 'CERT-AGREEMENT',
      duration: true,
    });
    const signed = server.attachAsColleague(
      caseId,
      server.addSource('Signed certification agreement'),
      'agreement',
    );
    server.install();
    renderClarte(actor);
    await openCase('CERT-AGREEMENT');
    const agreement = region('Certification agreement');
    const form = within(agreement).getByRole('form', {
      name: 'Record the agreement',
    });
    change(within(form).getByLabelText('Signed on'), '2026-11-02');
    selectOptionByLabel(
      within(form).getByLabelText('Signed original'),
      'Signed certification agreement — version 1 (signed-certification-agreement.pdf)',
    );
    fireEvent.click(
      within(form).getByRole('button', { name: 'Record the agreement' }),
    );
    fireEvent.click(
      await within(region('Certification agreement')).findByRole('button', {
        name: 'Correct the agreement',
      }),
    );
    const correction = within(region('Certification agreement')).getByRole(
      'form',
      { name: 'Correct the agreement' },
    );
    change(within(correction).getByLabelText('Signed on'), '2026-11-03');
    change(
      within(correction).getByLabelText('Correction reason'),
      'The client signed on the third.',
    );
    fireEvent.click(
      within(correction).getByRole('button', { name: 'Record the correction' }),
    );
    expect(
      await within(region('Certification agreement')).findByText(
        /Correction reason: The client signed on the third\./u,
      ),
    ).toBeVisible();
    expect(server.mutations()).toEqual([
      expect.objectContaining({
        path: `/api/certification-cases/${caseId}/agreement`,
        body: {
          expectedRevision: 5,
          signedOn: '2026-11-02',
          attachmentId: signed,
        },
      }),
      expect.objectContaining({
        path: `/api/certification-cases/${caseId}/agreement`,
        body: {
          expectedRevision: 6,
          reason: 'The client signed on the third.',
          signedOn: '2026-11-03',
          attachmentId: signed,
        },
      }),
    ]);
    expect(stepStatus('Certification agreement')).toBe('Done');
    expect(stepStatus('Audit team')).toBe('Current step');
  });

  it('searches eligible internal auditors and proposes the audit team (EX-213, EX-214)', async () => {
    const { server, actor } = serve({ manager: true });
    const caseId = server.seed({
      orderReference: 'CERT-TEAM',
      agreement: true,
    });
    const auditorId = '15380000-0000-4000-8000-000000000011';
    server.teamCandidates.push(
      {
        workspaceMembershipId: auditorId,
        displayLabel: 'Ion Fictional Auditor',
      },
      {
        workspaceMembershipId: '15380000-0000-4000-8000-000000000012',
        displayLabel: 'Vera Fictional Auditor',
      },
    );
    server.install();
    renderClarte(actor);
    await openCase('CERT-TEAM');
    expect(stepButton('Audit team')).toHaveAttribute('aria-current', 'true');
    change(await screen.findByLabelText('Auditor name'), 'Ion');
    fireEvent.click(screen.getByRole('button', { name: 'Find auditors' }));
    await waitFor(() =>
      expect(
        server.requests.some(
          (request) =>
            request.path ===
              `/api/certification-cases/${caseId}/team-candidates` &&
            new URLSearchParams(request.search).get('search') === 'Ion',
        ),
      ).toBe(true),
    );
    const form = within(region('Audit team')).getByRole('form', {
      name: 'Propose the team',
    });
    const leader = within(form).getByRole('group', { name: 'Member 1' });
    change(within(leader).getByLabelText('Name'), 'Ion Fictional Auditor');
    selectOptionByLabel(
      within(leader).getByLabelText('Role in the team'),
      'Team leader',
    );
    selectOptionByLabel(
      within(leader).getByLabelText('Workspace member'),
      'Ion Fictional Auditor',
    );
    fireEvent.click(
      within(leader).getByRole('checkbox', {
        name: 'Holds the client’s food chain category',
      }),
    );
    change(
      within(leader).getByLabelText('Competence'),
      'Qualified ISO 22000 lead auditor, category C.',
    );
    for (const declaration of [
      'Provided no consultancy to the client',
      'Was not employed by the client',
      'Has no involvement in the client’s management',
      'Committed to confidentiality',
    ])
      fireEvent.click(
        within(
          within(leader).getByRole('group', { name: declaration }),
        ).getByRole('radio', { name: 'Confirmed' }),
      );
    fireEvent.click(
      within(form).getByRole('button', { name: 'Propose the team' }),
    );
    await waitFor(() =>
      expect(within(region('Audit team')).queryByRole('form')).toBeNull(),
    );
    expect(
      server.mutations().find((request) => request.path.endsWith('/team')),
    ).toMatchObject({
      path: `/api/certification-cases/${caseId}/team`,
      body: {
        members: [
          {
            name: 'Ion Fictional Auditor',
            role: 'team_leader',
            workspaceMembershipId: auditorId,
          },
        ],
      },
    });
    expect(
      within(stepButton('Audit team')).getByText(/version 1/u),
    ).toBeVisible();
    expect(stepStatus('Audit team')).toBe('Current step');
  });

  it('lets an approver outside the team return it with a reason, then approve the next version (EX-215)', async () => {
    const { server, actor } = serve({ manager: false, approver: true });
    const caseId = server.seed({
      orderReference: 'CERT-TEAM-DECISION',
      agreement: true,
    });
    const members = [
      teamMember({ holdsCategory: false }),
      teamMember({
        name: 'Ion Demo',
        role: 'technical_expert',
        competenceNote: 'Dairy technologist',
      }),
    ];
    server.proposeTeamAsColleague(caseId, members);
    server.install();
    renderClarte(actor);
    await openCase('CERT-TEAM-DECISION');
    decide('Return the team', 'Add an auditor for the second shift.');
    await waitFor(() =>
      expect(definition(region('Team decision'), 'Decision')).toBe('Returned'),
    );
    server.proposeTeamAsColleague(
      caseId,
      members,
      'An auditor for the second shift joins.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reload Case' }));
    await waitFor(() =>
      expect(
        within(region('Team decision')).getByRole('form', {
          name: 'Record the decision',
        }),
      ).toBeVisible(),
    );
    decide('Approve the team');
    await waitFor(() =>
      expect(stepStatus('Stage 1 audit')).toBe('Current step'),
    );
    expect(stepStatus('Audit team')).toBe('Done');
    expect(server.mutations()).toEqual([
      expect.objectContaining({
        path: `/api/certification-cases/${caseId}/team-decision`,
        body: expect.objectContaining({
          teamVersion: 1,
          decision: 'returned',
          reason: 'Add an auditor for the second shift.',
        }),
      }),
      expect.objectContaining({
        path: `/api/certification-cases/${caseId}/team-decision`,
        body: expect.objectContaining({ teamVersion: 2, decision: 'approved' }),
      }),
    ]);
  });

  it('records the Stage 1 plan and its report, then the Stage 2 plan and report (EX-216, EX-217)', async () => {
    const { server, actor } = serve({ manager: true, auditor: true });
    const caseId = server.seedApprovedTeam({
      orderReference: 'CERT-STAGES',
      leader: certificationIds.member,
    });
    const plan1 = server.attachAsColleague(
      caseId,
      server.addSource('Stage 1 plan'),
      'plan',
    );
    const report1 = server.attachAsColleague(
      caseId,
      server.addSource('Stage 1 report'),
      'report',
    );
    server.install();
    renderClarte(actor);
    await openCase('CERT-STAGES');
    expect(stepButton('Stage 1 audit')).toHaveAttribute('aria-current', 'true');
    const planForm = within(region('Audit plan')).getByRole('form', {
      name: 'Record the Stage 1 plan',
    });
    fillPlan(planForm, {
      start: '2026-11-10',
      end: '2026-11-10',
      onSite: '1',
      document: 'Stage 1 plan — version 1 (stage-1-plan.pdf)',
    });
    fireEvent.click(
      within(planForm).getByRole('button', { name: 'Record the Stage 1 plan' }),
    );
    const reportForm = await within(region('Audit report')).findByRole('form', {
      name: 'Record the Stage 1 report',
    });
    change(within(reportForm).getByLabelText('Report date'), '2026-11-10');
    fireEvent.click(
      within(
        within(reportForm).getByRole('group', {
          name: 'Readiness for Stage 2',
        }),
      ).getByRole('radio', { name: 'Ready for Stage 2' }),
    );
    change(
      within(reportForm).getByLabelText('Basis of the conclusion'),
      'Documented system implemented.',
    );
    selectOptionByLabel(
      within(reportForm).getByLabelText('Audit report PDF'),
      'Stage 1 report — version 1 (stage-1-report.pdf)',
    );
    fireEvent.click(
      within(reportForm).getByRole('checkbox', {
        name: 'The document review is completed',
      }),
    );
    fireEvent.click(
      within(reportForm).getByRole('button', {
        name: 'Record the Stage 1 report',
      }),
    );
    await waitFor(() =>
      expect(stepStatus('Stage 2 audit')).toBe('Current step'),
    );
    expect(stepStatus('Stage 1 audit')).toBe('Done');
    expect(
      within(region('Audit report')).getByRole('button', {
        name: 'Correct the Stage 1 report',
      }),
    ).toBeVisible();

    const plan2 = server.attachAsColleague(
      caseId,
      server.addSource('Stage 2 plan'),
      'plan',
    );
    const report2 = server.attachAsColleague(
      caseId,
      server.addSource('Stage 2 report'),
      'report',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reload Case' }));
    await screen.findByRole('heading', {
      name: 'Certification Case CERT-STAGES',
    });
    chooseStep('Stage 2 audit');
    const plan2Form = within(region('Audit plan')).getByRole('form', {
      name: 'Record the Stage 2 plan',
    });
    fillPlan(plan2Form, {
      start: '2026-11-20',
      end: '2026-11-21',
      onSite: '2',
      document: 'Stage 2 plan — version 1 (stage-2-plan.pdf)',
    });
    fireEvent.click(
      within(plan2Form).getByRole('button', {
        name: 'Record the Stage 2 plan',
      }),
    );
    const report2Form = await within(region('Audit report')).findByRole(
      'form',
      { name: 'Record the Stage 2 report' },
    );
    change(within(report2Form).getByLabelText('Report date'), '2026-11-21');
    change(
      within(report2Form).getByLabelText('Summary of the Stage 2 audit'),
      'Stage 2 completed as planned.',
    );
    selectOptionByLabel(
      within(report2Form).getByLabelText('Audit report PDF'),
      'Stage 2 report — version 1 (stage-2-report.pdf)',
    );
    fireEvent.click(
      within(report2Form).getByRole('button', {
        name: 'Record the Stage 2 report',
      }),
    );
    await waitFor(() => expect(stepStatus('Stage 2 audit')).toBe('Done'));
    expect(stepStatus('Nonconformity follow-up')).toBe('Done');
    expect(stepStatus('Team recommendation')).toBe('Current step');
    expect(server.mutations().map((request) => request.path)).toEqual([
      `/api/certification-cases/${caseId}/stages/stage-1/plan`,
      `/api/certification-cases/${caseId}/stages/stage-1/report`,
      `/api/certification-cases/${caseId}/stages/stage-2/plan`,
      `/api/certification-cases/${caseId}/stages/stage-2/report`,
    ]);
    expect(server.mutations()[0]?.body).toMatchObject({
      planAttachmentId: plan1,
      onSiteDays: '1',
    });
    expect(server.mutations()[1]?.body).toMatchObject({
      conclusion: 'ready',
      reportAttachmentId: report1,
    });
    expect(server.mutations()[2]?.body).toMatchObject({
      planAttachmentId: plan2,
      startDate: '2026-11-20',
    });
    expect(server.mutations()[3]?.body).toMatchObject({
      summary: 'Stage 2 completed as planned.',
      reportAttachmentId: report2,
    });
  });

  it('corrects a recorded Stage 1 plan with a reason (EX-216)', async () => {
    const { server, actor } = serve({ manager: true });
    const caseId = server.seedApprovedTeam({ orderReference: 'CERT-PLAN-FIX' });
    const plan = server.attachAsColleague(
      caseId,
      server.addSource('Stage 1 plan'),
      'plan',
    );
    server.recordStageAsColleague(caseId, 'stage_1_plan', stagePlan(plan));
    server.install();
    renderClarte(actor);
    await openCase('CERT-PLAN-FIX');
    fireEvent.click(
      within(region('Audit plan')).getByRole('button', {
        name: 'Correct the Stage 1 plan',
      }),
    );
    const form = within(region('Audit plan')).getByRole('form', {
      name: 'Correct the Stage 1 plan',
    });
    change(within(form).getByLabelText('End date'), '2026-11-11');
    change(
      within(form).getByLabelText('Correction reason'),
      'The client asked for a second day.',
    );
    fireEvent.click(
      within(form).getByRole('button', { name: 'Record the correction' }),
    );
    expect(
      await within(region('Audit plan')).findByText(
        /Correction reason: The client asked for a second day\./u,
      ),
    ).toBeVisible();
    expect(server.mutations()[0]).toMatchObject({
      path: `/api/certification-cases/${caseId}/stages/stage-1/plan`,
      body: {
        reason: 'The client asked for a second day.',
        endDate: '2026-11-11',
      },
    });
  });

  it('downloads the dossier register PDF in the interface language from the page header (EX-212)', async () => {
    const { server, actor } = serve({ manager: false });
    const caseId = server.seed({
      orderReference: 'CERT-REGISTER',
      duration: true,
    });
    server.install();
    const download = installDownload();
    renderClarte(actor);
    await openCase('CERT-REGISTER');
    expect(
      screen.getByText(
        'You can consult this Case. Recording a step requires Company Certification Programme Manager.',
      ),
    ).toBeVisible();
    expect(screen.queryByRole('form')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Download the dossier register (PDF)',
      }),
    );
    await waitFor(() => expect(download.click).toHaveBeenCalledOnce());
    expect(download.saved).toEqual([
      `certification-case-register-${caseId.slice(0, 8)}.pdf`,
    ]);
    expect(
      server.requests.filter((request) => request.path.endsWith('/register')),
    ).toEqual([
      expect.objectContaining({
        method: 'GET',
        path: `/api/certification-cases/${caseId}/register`,
        search: '?language=en',
      }),
    ]);
    expect(server.requests.some((request) => request.method !== 'GET')).toBe(
      false,
    );
  });

  it('says when the Cases are refused or unavailable, and offers a reader no command', async () => {
    const denied = serve({ manager: true });
    denied.server.seed({ orderReference: 'CERT-DENIED' });
    denied.server.interceptions.push({
      match: (request) => request.path.endsWith('/certification-cases'),
      respond: () => new Response(null, { status: 403 }),
    });
    denied.server.install();
    const onActorRevalidated = vi.fn();
    const first = renderClarte(denied.actor, { onActorRevalidated });
    expect(
      await screen.findByText(
        'Certification access is unavailable. Your current authority is being checked.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Open a Certification Case' }),
    ).toBeNull();
    await waitFor(() => expect(onActorRevalidated).toHaveBeenCalledOnce());
    first.unmount();
    vi.unstubAllGlobals();

    const failing = serve({ manager: false });
    failing.server.interceptions.push({
      match: (request) => request.path.endsWith('/certification-cases'),
      respond: () => new Response(null, { status: 500 }),
    });
    failing.server.seed({ orderReference: 'CERT-LATER', application: true });
    failing.server.install();
    renderClarte(failing.actor);
    expect(
      await screen.findByText(
        'This read failed. Refresh before treating this page as current.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Open a Certification Case' }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Refresh Certification Cases' }),
    );
    await openCase('CERT-LATER');
    expect(screen.queryByRole('form')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Correct the application' }),
    ).toBeNull();
  });

  it('renders nothing without the Certification Reader grant', () => {
    const actor = certificationActor({ manager: false });
    const withoutReader: ActorContext = {
      ...actor,
      activeCompany: actor.activeCompany
        ? {
            ...actor.activeCompany,
            grants: actor.activeCompany.grants.filter(
              (grant) => !grant.bundle.startsWith('company_certification'),
            ),
          }
        : undefined,
    };
    const { container } = renderClarte(withoutReader);
    expect(container).toBeEmptyDOMElement();
  });
});
