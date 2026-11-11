import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '../test/render-with-interface-locale';
import { selectOptionByLabel } from '../test/select-option';
import type { ActorContext } from '../access-types';
import { CertificationWorkspace } from './CertificationWorkspace';
import {
  CERTIFICATE_TEXTS,
  FakeCertificationServer,
  certificationActor,
  certificationDecision,
  certificationIdentity,
  certificationIds,
  dossierReview,
  stage1Report,
  stage2Report,
  stagePlan,
} from './certification.test-fixture';

const RECOMMENDATION = 'Team recommendation';
const DOSSIER = 'Dossier review';
const DECISION = 'Certification Decision';
const DATA = 'Certificate data agreed with the client';
const CERTIFICATE = 'Certificate';
const SAVED =
  'Saved. The confirmed result remains recorded even if a later refresh fails.';
const REASON_REQUIRED =
  'State the reason for this correction (at most 2,000 characters).';
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
const DECISION_FORM = 'Decision form — version 1 (decision-form.pdf)';
const DOSSIER_ATTESTATION =
  'I attest that the dossier reviewer and the approver are not members of the audit team.';
const DATA_FORM =
  'Certificate data form — version 1 (certificate-data-form.pdf)';
const CERTIFICATE_PDF =
  'Issued Certificate — version 1 (issued-certificate.pdf)';
const DOSSIER_INCOMPLETE =
  'The dossier review is not recorded, or it lists a missing item.';
const GRANT_AGAINST =
  'Certification cannot be granted against a team recommendation that is not to grant.';
const CERTIFIED_NOTE =
  'This Case is certified: its Certificate is recorded. Every record is now read-only.';
const DECISION_VALIDATION =
  'Complete the decision: choose the outcome and state the decision date, the decision maker and function (at most 200 characters each) and the rationale (at most 4,000 characters). A grant states one to four Certificate texts, one per language, each with the holder name, address and scope.';
const STALE =
  'This Case changed since you opened it. Reload it before saving; your draft is kept.';
const REFUSED_NOTE =
  'This Case is closed: certification was refused. Every record is now read-only; a new application needs a new Case.';

afterEach(() => {
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

/** The definition shown for a term in a container. */
function definition(container: HTMLElement, term: string) {
  const [first] = within(container).getAllByText(term, { selector: 'dt' });
  return first?.nextElementSibling?.textContent;
}

function caseDefinition(term: string) {
  const [caseArticle] = screen.getAllByRole('article');
  if (!caseArticle) throw new Error('Expected the Case.');
  return definition(caseArticle, term);
}

function stepState(name: string) {
  const step = within(screen.getByRole('list', { name: 'Steps' }))
    .getByText(name, { selector: 'strong' })
    .closest('li');
  return step?.textContent?.replace(name, '').trim();
}

function timelineTitles() {
  return [...region('Timeline').querySelectorAll(':scope > ol > li')].map(
    (entry) => entry.querySelector('strong')?.textContent,
  );
}

function click(container: HTMLElement, name: string) {
  fireEvent.click(within(container).getByRole('button', { name }));
}

function form(panel: string, name: string) {
  return within(region(panel)).getByRole('form', { name });
}

function choose(container: HTMLElement, group: string, option: string) {
  fireEvent.click(
    within(within(container).getByRole('group', { name: group })).getByRole(
      'radio',
      { name: option },
    ),
  );
}

function listed(container: HTMLElement, name: string) {
  return within(within(container).getByRole('list', { name }))
    .getAllByRole('listitem')
    .map((item) => item.textContent);
}

/** Fills one Certificate text of a form, by its position. */
function fillText(
  container: HTMLElement,
  position: number,
  text: (typeof CERTIFICATE_TEXTS)[number],
) {
  const group = within(container).getByRole('group', {
    name: `Certificate text ${String(position)}`,
  });
  change(within(group).getByLabelText('Language'), text.language);
  change(within(group).getByLabelText('Holder name'), text.holderName);
  change(within(group).getByLabelText('Address'), text.address);
  change(within(group).getByLabelText('Scope'), text.scope);
}

/** The decision's facts besides its outcome and texts. */
function fillDecision(
  container: HTMLElement,
  decidedBy = 'Decision Maker Demo',
) {
  change(within(container).getByLabelText('Decision date'), '2026-11-06');
  change(within(container).getByLabelText('Decision maker'), decidedBy);
  change(
    within(container).getByLabelText('Function of the decision maker'),
    'Head of the certification body',
  );
  change(
    within(container).getByLabelText('Rationale'),
    'Recommendation accepted after the dossier review.',
  );
}

/**
 * A complete grant with one Certificate text, attested, without the
 * optional additional information.
 */
function fillGrant(container: HTMLElement) {
  choose(container, 'Decision', 'Certification granted');
  fillText(container, 1, CERTIFICATE_TEXTS[0]);
  fillDecision(container);
  fireEvent.click(
    within(container).getByRole('checkbox', {
      name: 'I attest that the decision maker is not a member of the audit team.',
    }),
  );
}

/** The labels of the fields a form shows and announces invalid. */
function invalidFields(container: HTMLElement) {
  return [...container.querySelectorAll('[aria-invalid="true"]')].map(
    (field) =>
      field instanceof HTMLInputElement ||
      field instanceof HTMLTextAreaElement ||
      field instanceof HTMLButtonElement
        ? field.labels?.[0]?.textContent
        : field.id,
  );
}

/**
 * The fictional dairy's Case with the team approved (revision 8) and both
 * Stages reported without Findings (revision 16).
 */
function reportedCase(
  server: FakeCertificationServer,
  { reference, leader }: { reference: string; leader: string | null },
) {
  const caseId = server.seedApprovedTeam({ orderReference: reference, leader });
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

/** The decision form, Certificate data form and Certificate PDF (17–19). */
function attachClosingDocuments(
  server: FakeCertificationServer,
  caseId: string,
) {
  return {
    decisionForm: server.attachAsColleague(
      caseId,
      server.addSource('Decision form'),
      'decision_form',
    ),
    dataForm: server.attachAsColleague(
      caseId,
      server.addSource('Certificate data form'),
      'certificate_data',
    ),
    pdf: server.attachAsColleague(
      caseId,
      server.addSource('Issued Certificate'),
      'certificate',
    ),
  };
}

function recommend(
  server: FakeCertificationServer,
  caseId: string,
  recommendation = 'grant',
) {
  server.recordStepAsColleague(caseId, 'recommendation', {
    recommendation,
    basis: 'No nonconformity; system effectively implemented.',
  });
}

describe('Certification recommendation, decision and Certificate', () => {
  it('lets the team leader recommend, then correct the recommendation from its latest values with a reason', async () => {
    const { server, actor } = serve({ manager: false, auditor: true });
    const caseId = reportedCase(server, {
      reference: 'CERT-RECOMMEND',
      leader: certificationIds.member,
    });
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-RECOMMEND');
    expect(caseDefinition('Next step')).toBe('Team recommendation');
    const panel = region(RECOMMENDATION);
    expect(
      within(panel).getByText('No team recommendation is recorded yet.'),
    ).toBeVisible();
    let recordForm = form(RECOMMENDATION, 'Record the team recommendation');
    // Nothing is preselected.
    expect(
      within(recordForm).queryAllByRole('radio', { checked: true }),
    ).toEqual([]);
    expect(
      within(within(recordForm).getByRole('group', { name: 'Recommendation' }))
        .getAllByRole('radio')
        .map((radio) => radio.closest('label')?.textContent),
    ).toEqual([
      'Grant certification',
      'Do not grant certification',
      'Additional audit needed',
    ]);
    click(recordForm, 'Record the recommendation');
    expect(
      await within(panel).findByText(
        'Choose a recommendation and state its basis (at most 4,000 characters).',
      ),
    ).toBeVisible();
    expect(server.mutations()).toEqual([]);

    choose(recordForm, 'Recommendation', 'Grant certification');
    change(
      within(recordForm).getByLabelText('Basis of the recommendation'),
      ' No nonconformity; system effectively implemented. ',
    );
    click(recordForm, 'Record the recommendation');
    await waitFor(() =>
      expect(definition(region(RECOMMENDATION), 'Recommendation')).toBe(
        'Grant certification',
      ),
    );
    expect(server.mutations()).toEqual([
      expect.objectContaining({
        path: `/api/certification-cases/${caseId}/recommendation`,
        contentType: 'application/json',
        company: certificationIds.company,
        body: {
          expectedRevision: 16,
          recommendation: 'grant',
          basis: 'No nonconformity; system effectively implemented.',
          recommendedOn: null,
        },
      }),
    ]);
    expect(server.mutations()[0]?.key).toBeTruthy();
    expect(screen.getByText(SAVED)).toBeVisible();
    expect(caseDefinition('Next step')).toBe('Dossier review');
    expect(stepState('Team recommendation')).toBe(
      'Grant certification — version 1',
    );
    expect(stepState('Dossier review')).toBe('To record');
    // The dossier review belongs to an approver outside the team.
    expect(
      within(region(DOSSIER)).getByText(
        'An approver who is not on the audit team reviews the dossier.',
      ),
    ).toBeVisible();

    click(region(RECOMMENDATION), 'Correct the team recommendation');
    recordForm = form(RECOMMENDATION, 'Correct the team recommendation');
    // A correction starts from the latest values.
    expect(
      within(recordForm).getByRole('radio', { name: 'Grant certification' }),
    ).toBeChecked();
    expect(
      within(recordForm).getByLabelText('Basis of the recommendation'),
    ).toHaveValue('No nonconformity; system effectively implemented.');
    change(
      within(recordForm).getByLabelText('Basis of the recommendation'),
      'No nonconformity; the system is effectively implemented on both shifts.',
    );
    click(recordForm, 'Record the recommendation');
    expect(
      await within(region(RECOMMENDATION)).findByText(REASON_REQUIRED),
    ).toBeVisible();
    expect(server.mutations()).toHaveLength(1);
    change(
      within(recordForm).getByLabelText('Correction reason'),
      'Basis completed after the closing meeting.',
    );
    click(recordForm, 'Record the recommendation');
    await waitFor(() =>
      expect(
        definition(region(RECOMMENDATION), 'Basis of the recommendation'),
      ).toBe(
        'No nonconformity; the system is effectively implemented on both shifts.',
      ),
    );
    expect(server.mutations()[1]?.body).toEqual({
      expectedRevision: 17,
      reason: 'Basis completed after the closing meeting.',
      recommendation: 'grant',
      basis:
        'No nonconformity; the system is effectively implemented on both shifts.',
      recommendedOn: null,
    });
    expect(
      within(region(RECOMMENDATION)).getByText(
        /Correction reason: Basis completed after the closing meeting\./u,
      ),
    ).toBeVisible();
    expect(timelineTitles().slice(-2)).toEqual([
      'Team recommendation — Grant certification (version 1)',
      'Team recommendation — Grant certification (version 2)',
    ]);
  });

  it('reviews the dossier item by item and grants certification with its texts', async () => {
    const { server, actor } = serve({ manager: true, approver: true });
    const caseId = reportedCase(server, {
      reference: 'CERT-GRANT',
      leader: certificationIds.colleague,
    });
    const { decisionForm } = attachClosingDocuments(server, caseId);
    recommend(server, caseId);
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-GRANT');
    expect(caseDefinition('Next step')).toBe('Dossier review');

    // The dossier review: one explicit answer per item, nothing preselected.
    const reviewForm = form(DOSSIER, 'Record the dossier review');
    expect(
      within(reviewForm)
        .getAllByRole('group')
        .map((group) => group.querySelector('legend')?.textContent),
    ).toEqual([
      ...DOSSIER_ITEMS,
      'Dossier reviewer for the certification body',
      'Approver for the certification body',
    ]);
    expect(
      within(reviewForm).queryAllByRole('radio', { checked: true }),
    ).toEqual([]);
    for (const item of DOSSIER_ITEMS)
      choose(
        reviewForm,
        item,
        item === 'Nonconformity follow-up' ? 'Not applicable' : 'Present',
      );
    choose(reviewForm, 'Participant lists', 'Missing');
    change(
      within(reviewForm).getByLabelText('Conclusion of the review'),
      'Dossier complete; the recommendation is supported.',
    );
    click(reviewForm, 'Record the review');
    expect(
      await within(region(DOSSIER)).findByText(
        'Answer every dossier item, write a note for each missing item (at most 1,000 characters per note) and the conclusion (at most 4,000 characters).',
      ),
    ).toBeVisible();
    expect(server.mutations()).toEqual([]);
    choose(reviewForm, 'Participant lists', 'Present');
    fireEvent.click(
      within(reviewForm).getByRole('checkbox', { name: DOSSIER_ATTESTATION }),
    );
    click(reviewForm, 'Record the review');
    await waitFor(() =>
      expect(definition(region(DOSSIER), 'Result')).toBe(
        'Complete — no item missing',
      ),
    );
    expect(server.mutations()[0]).toEqual(
      expect.objectContaining({
        path: `/api/certification-cases/${caseId}/dossier-review`,
        body: { expectedRevision: 20, ...dossierReview() },
      }),
    );
    expect(definition(region(DOSSIER), 'Participant lists')).toBe('Present');
    expect(caseDefinition('Next step')).toBe('Certification Decision');

    // The decision: no outcome preselected and the attestation unchecked.
    const decisionPanel = region(DECISION);
    expect(
      within(decisionPanel).queryByRole('list', {
        name: 'Unmet decision preconditions',
      }),
    ).not.toBeInTheDocument();
    const decisionFormElement = form(
      DECISION,
      'Record the Certification Decision',
    );
    expect(
      within(decisionFormElement).queryAllByRole('radio', { checked: true }),
    ).toEqual([]);
    const attestation = within(decisionFormElement).getByRole('checkbox', {
      name: 'I attest that the decision maker is not a member of the audit team.',
    });
    expect(attestation).not.toBeChecked();
    expect(
      within(decisionFormElement).queryByRole('group', {
        name: 'Certificate texts granted',
      }),
    ).not.toBeInTheDocument();
    choose(decisionFormElement, 'Decision', 'Certification granted');
    fillText(decisionFormElement, 1, CERTIFICATE_TEXTS[0]);
    click(decisionFormElement, 'Add a Certificate language');
    fillText(decisionFormElement, 2, CERTIFICATE_TEXTS[1]);
    fillDecision(decisionFormElement);
    selectOptionByLabel(
      within(decisionFormElement).getByLabelText('Signed decision form'),
      DECISION_FORM,
    );
    click(decisionFormElement, 'Record the decision');
    expect(
      await within(decisionPanel).findByText(
        'Confirm that the decision maker is not a member of the audit team.',
      ),
    ).toBeVisible();
    expect(server.mutations()).toHaveLength(1);
    fireEvent.click(attestation);
    click(decisionFormElement, 'Record the decision');
    await waitFor(() =>
      expect(definition(region(DECISION), 'Decision')).toBe(
        'Certification granted',
      ),
    );
    expect(server.mutations()[1]).toEqual(
      expect.objectContaining({
        path: `/api/certification-cases/${caseId}/decision`,
        body: {
          expectedRevision: 21,
          ...certificationDecision({ decisionFormAttachmentId: decisionForm }),
        },
      }),
    );
    const decided = region(DECISION);
    expect(definition(decided, 'Decision date')).toBe('Nov 6, 2026');
    expect(definition(decided, 'Decision maker')).toBe('Decision Maker Demo');
    expect(definition(decided, 'Signed decision form')).toBe(DECISION_FORM);
    expect(definition(decided, 'Additional information used')).toBe(
      'Not provided',
    );
    expect(
      within(decided)
        .getAllByText('Language', { selector: 'dt' })
        .map((term) => term.nextElementSibling?.textContent),
    ).toEqual(['ro', 'en']);
    // While the Case is open, only its texts and references may be corrected.
    expect(within(decided).queryByRole('form')).not.toBeInTheDocument();
    expect(
      within(decided)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Correct the decision texts']);
    expect(caseDefinition('Status')).toBe('Open');
    expect(caseDefinition('Next step')).toBe(DATA);
    expect(timelineTitles().slice(-3)).toEqual([
      'Team recommendation — Grant certification (version 1)',
      'Dossier review — version 1',
      'Certification Decision — Certification granted',
    ]);
  });

  it('agrees the Certificate data with the client and records the Certificate with its validity', async () => {
    const { server, actor } = serve({ manager: true, approver: true });
    const caseId = reportedCase(server, {
      reference: 'CERT-ISSUE',
      leader: certificationIds.colleague,
    });
    const { dataForm, pdf } = attachClosingDocuments(server, caseId);
    recommend(server, caseId);
    server.recordStepAsColleague(caseId, 'dossier_review', dossierReview());
    server.recordStepAsColleague(caseId, 'decision', certificationDecision());
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-ISSUE');
    expect(caseDefinition('Next step')).toBe(DATA);
    expect(stepState('Certificate')).toBe(
      'Waits for the agreed Certificate data',
    );
    expect(
      within(region(CERTIFICATE)).getByText(
        'The Certificate is recorded once the Certificate data are agreed with the client.',
      ),
    ).toBeVisible();

    // The Certificate data agreed with the client.
    const dataFormElement = form(DATA, 'Record the Certificate data');
    // One text at least: the only text cannot be removed.
    expect(
      within(dataFormElement).queryByRole('button', { name: /^Remove/u }),
    ).not.toBeInTheDocument();
    fillText(dataFormElement, 1, CERTIFICATE_TEXTS[0]);
    click(dataFormElement, 'Add a Certificate language');
    click(dataFormElement, 'Add a Certificate language');
    expect(
      within(dataFormElement).getByRole('group', {
        name: 'Certificate text 3',
      }),
    ).toBeVisible();
    click(dataFormElement, 'Remove Certificate text 3');
    expect(
      within(dataFormElement).queryByRole('group', {
        name: 'Certificate text 3',
      }),
    ).not.toBeInTheDocument();
    fillText(dataFormElement, 2, CERTIFICATE_TEXTS[1]);
    change(within(dataFormElement).getByLabelText('Agreed on'), '2026-10-21');
    selectOptionByLabel(
      within(dataFormElement).getByLabelText('Signed Certificate data form'),
      DATA_FORM,
    );
    click(dataFormElement, 'Record the Certificate data');
    await waitFor(() => expect(caseDefinition('Next step')).toBe(CERTIFICATE));
    expect(server.mutations()[0]?.body).toEqual({
      expectedRevision: 22,
      texts: CERTIFICATE_TEXTS,
      agreedOn: '2026-10-21',
      agreementAttachmentId: dataForm,
    });
    expect(
      within(region(DATA)).queryByRole('list', {
        name: 'Differences from the decision',
      }),
    ).not.toBeInTheDocument();

    // The Certificate, with the validity the server computes.
    const certificateForm = form(CERTIFICATE, 'Record the issued Certificate');
    change(
      within(certificateForm).getByLabelText('Certificate number'),
      ' DEMO-0001 ',
    );
    selectOptionByLabel(
      within(certificateForm).getByLabelText('Certificate PDF'),
      CERTIFICATE_PDF,
    );
    change(
      within(certificateForm).getByLabelText('Signed by'),
      'Decision Maker Demo',
    );
    change(
      within(certificateForm).getByLabelText('Function of the signatory'),
      'Head of the certification body',
    );
    click(certificateForm, 'Record the Certificate');
    expect(
      await within(region(CERTIFICATE)).findByText(
        'Confirm that the signatory is not a member of the audit team.',
      ),
    ).toBeVisible();
    expect(server.mutations()).toHaveLength(1);
    fireEvent.click(
      within(certificateForm).getByRole('checkbox', {
        name: 'I attest that the signatory is not a member of the audit team.',
      }),
    );
    click(certificateForm, 'Record the Certificate');
    await waitFor(() => expect(caseDefinition('Status')).toBe('Certified'));
    expect(server.mutations()[1]?.body).toEqual({
      expectedRevision: 23,
      number: 'DEMO-0001',
      attachmentId: pdf,
      signedBy: 'Decision Maker Demo',
      signedByFunction: 'Head of the certification body',
      independenceAttested: true,
    });
    const certificate = region(CERTIFICATE);
    expect(definition(certificate, 'Certificate number')).toBe('DEMO-0001');
    expect(definition(certificate, 'Certificate PDF')).toBe(CERTIFICATE_PDF);
    expect(definition(certificate, 'Independence from the audit team')).toBe(
      'Attested by the member who recorded it',
    );
    expect(definition(certificate, 'Valid from')).toBe('Nov 6, 2026');
    expect(definition(certificate, 'Valid until')).toBe('Nov 5, 2029');
    expect(definition(certificate, 'First surveillance to start by')).toBe(
      'Nov 6, 2027',
    );
    expect(screen.getByText(CERTIFIED_NOTE)).toBeVisible();
    expect(caseDefinition('Next step')).toBe('None');
    expect(stepState('Certificate')).toBe('Recorded — DEMO-0001');
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(
      screen
        .queryAllByRole('button', { name: /^(Record|Correct|Add|Remove)\b/u })
        .map((button) => button.textContent),
    ).toEqual([]);
    expect(timelineTitles().slice(-5)).toEqual([
      'Team recommendation — Grant certification (version 1)',
      'Dossier review — version 1',
      'Certification Decision — Certification granted',
      'Certificate data — version 1',
      'Certificate DEMO-0001 recorded',
    ]);
  });

  it('refuses a grant against a negative recommendation, then records a refusal that closes the Case', async () => {
    const { server, actor } = serve({ manager: true, approver: true });
    const caseId = reportedCase(server, {
      reference: 'CERT-REFUSE',
      leader: certificationIds.colleague,
    });
    recommend(server, caseId, 'do_not_grant');
    server.recordStepAsColleague(caseId, 'dossier_review', dossierReview());
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-REFUSE');
    expect(definition(region(RECOMMENDATION), 'Recommendation')).toBe(
      'Do not grant certification',
    );
    const decisionFormElement = form(
      DECISION,
      'Record the Certification Decision',
    );
    choose(decisionFormElement, 'Decision', 'Certification granted');
    fillText(decisionFormElement, 1, CERTIFICATE_TEXTS[0]);
    fillDecision(decisionFormElement);
    fireEvent.click(
      within(decisionFormElement).getByRole('checkbox', {
        name: 'I attest that the decision maker is not a member of the audit team.',
      }),
    );
    click(decisionFormElement, 'Record the decision');
    const refusal = await within(region(DECISION)).findByRole('alert');
    expect(
      within(refusal).getByText(
        'The Certification Decision cannot be recorded until these preconditions hold:',
      ),
    ).toBeVisible();
    expect(listed(refusal, 'Unmet decision preconditions')).toEqual([
      GRANT_AGAINST,
    ]);
    expect(server.mutations()).toEqual([]);

    choose(decisionFormElement, 'Decision', 'Certification refused');
    expect(
      within(region(DECISION)).queryByRole('alert'),
    ).not.toBeInTheDocument();
    expect(
      within(decisionFormElement).queryByRole('group', {
        name: 'Certificate texts granted',
      }),
    ).not.toBeInTheDocument();
    change(
      within(decisionFormElement).getByLabelText('Rationale'),
      'Recommendation not to grant accepted.',
    );
    click(decisionFormElement, 'Record the decision');
    await waitFor(() =>
      expect(caseDefinition('Status')).toBe('Closed — certification refused'),
    );
    expect(server.mutations()[0]?.body).toEqual({
      expectedRevision: 18,
      ...certificationDecision({
        decision: 'refused',
        grantedTexts: null,
        rationale: 'Recommendation not to grant accepted.',
      }),
    });
    expect(definition(region(DECISION), 'Decision')).toBe(
      'Certification refused',
    );
    expect(screen.getByText(REFUSED_NOTE)).toBeVisible();
    expect(caseDefinition('Next step')).toBe('None');
    expect(stepState('Certificate data')).toBe(
      'Not applicable: the Case is closed',
    );
    expect(stepState('Certificate')).toBe('Not applicable: the Case is closed');
    // A refusal needs neither Certificate data nor a Certificate.
    expect(
      screen.queryByRole('region', { name: CERTIFICATE }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: DATA }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(
      screen
        .queryAllByRole('button', { name: /^(Record|Correct)\b/u })
        .map((button) => button.textContent),
    ).toEqual([]);
    expect(timelineTitles().at(-1)).toBe(
      'Certification Decision — Certification refused',
    );
  });

  it('lists the unmet decision preconditions from the read Case and from the server, and explains a decision maker on the team', async () => {
    const { server, actor } = serve({ manager: false, approver: true });
    const caseId = reportedCase(server, {
      reference: 'CERT-PRECONDITIONS',
      leader: certificationIds.colleague,
    });
    recommend(server, caseId);
    server.recordStepAsColleague(
      caseId,
      'dossier_review',
      dossierReview('participant_lists'),
    );
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-PRECONDITIONS');
    expect(definition(region(DOSSIER), 'Result')).toBe(
      'Incomplete — missing items: 1',
    );
    expect(definition(region(DOSSIER), 'Participant lists')).toBe(
      'Missing — Signed participant list not received.',
    );
    // Only the leader of the approved team recommends.
    expect(
      within(region(RECOMMENDATION)).queryByRole('button'),
    ).not.toBeInTheDocument();
    const decisionPanel = region(DECISION);
    expect(listed(decisionPanel, 'Unmet decision preconditions')).toEqual([
      DOSSIER_INCOMPLETE,
    ]);
    const decisionFormElement = form(
      DECISION,
      'Record the Certification Decision',
    );
    choose(decisionFormElement, 'Decision', 'Certification granted');
    fillText(decisionFormElement, 1, CERTIFICATE_TEXTS[0]);
    fillDecision(decisionFormElement, 'Elena Demo');
    fireEvent.click(
      within(decisionFormElement).getByRole('checkbox', {
        name: 'I attest that the decision maker is not a member of the audit team.',
      }),
    );
    click(decisionFormElement, 'Record the decision');
    const local = await within(decisionPanel).findByRole('alert');
    expect(listed(local, 'Unmet decision preconditions')).toEqual([
      DOSSIER_INCOMPLETE,
    ]);
    expect(server.mutations()).toEqual([]);

    // The approver corrects the review from its latest values, with a reason.
    click(region(DOSSIER), 'Correct the dossier review');
    const correction = form(DOSSIER, 'Correct the dossier review');
    const participants = within(correction).getByRole('group', {
      name: 'Participant lists',
    });
    expect(
      within(participants).getByRole('radio', { name: 'Missing' }),
    ).toBeChecked();
    expect(within(participants).getByLabelText('Note')).toHaveValue(
      'Signed participant list not received.',
    );
    choose(correction, 'Participant lists', 'Present');
    change(within(participants).getByLabelText('Note'), '');
    // The attestation is given again for every version.
    expect(
      within(correction).getByRole('checkbox', { name: DOSSIER_ATTESTATION }),
    ).not.toBeChecked();
    fireEvent.click(
      within(correction).getByRole('checkbox', { name: DOSSIER_ATTESTATION }),
    );
    click(correction, 'Record the review');
    expect(
      await within(region(DOSSIER)).findByText(REASON_REQUIRED),
    ).toBeVisible();
    change(
      within(correction).getByLabelText('Correction reason'),
      'Signed participant list received.',
    );
    click(correction, 'Record the review');
    await waitFor(() =>
      expect(definition(region(DOSSIER), 'Result')).toBe(
        'Complete — no item missing',
      ),
    );
    expect(server.mutations()[0]?.body).toEqual({
      expectedRevision: 18,
      reason: 'Signed participant list received.',
      ...dossierReview(),
    });
    expect(
      within(region(DECISION)).queryByRole('list', {
        name: 'Unmet decision preconditions',
      }),
    ).not.toBeInTheDocument();

    // The decision draft is kept: the server refuses a team member's name.
    click(
      form(DECISION, 'Record the Certification Decision'),
      'Record the decision',
    );
    expect(
      await within(region(DECISION)).findByText(
        'The decision maker cannot be a member of the audit team: you are linked to a member of one of its versions, or the decision maker named is on the approved team.',
      ),
    ).toBeVisible();
    expect(server.mutations()).toHaveLength(2);

    // The server's clock decides whether the decision date is in the future.
    const draft = form(DECISION, 'Record the Certification Decision');
    change(
      within(draft).getByLabelText('Decision maker'),
      'Decision Maker Demo',
    );
    change(within(draft).getByLabelText('Decision date'), '2099-12-31');
    click(draft, 'Record the decision');
    const refused = await within(region(DECISION)).findByRole('alert');
    expect(
      within(refused).getByText(
        'The server refused the decision: these preconditions do not hold.',
      ),
    ).toBeVisible();
    expect(listed(refused, 'Unmet decision preconditions')).toEqual([
      'The decision date is in the future.',
    ]);
    expect(server.mutations()).toHaveLength(3);
    change(within(draft).getByLabelText('Decision date'), '2026-11-06');
    expect(
      within(region(DECISION)).queryByRole('alert'),
    ).not.toBeInTheDocument();
    click(draft, 'Record the decision');
    await waitFor(() =>
      expect(definition(region(DECISION), 'Decision')).toBe(
        'Certification granted',
      ),
    );
    expect(caseDefinition('Next step')).toBe(DATA);
  });

  it('marks no decision field invalid when preconditions block the decision, and marks only the field left blank', async () => {
    const { server, actor } = serve({ manager: false, approver: true });
    const caseId = reportedCase(server, {
      reference: 'CERT-BLOCKED-FIELDS',
      leader: certificationIds.colleague,
    });
    recommend(server, caseId);
    server.recordStepAsColleague(
      caseId,
      'dossier_review',
      dossierReview('participant_lists'),
    );
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-BLOCKED-FIELDS');
    const decisionForm = form(DECISION, 'Record the Certification Decision');
    fillGrant(decisionForm);
    click(decisionForm, 'Record the decision');
    const blocked = await within(region(DECISION)).findByRole('alert');
    expect(listed(blocked, 'Unmet decision preconditions')).toEqual([
      DOSSIER_INCOMPLETE,
    ]);
    // The filled fields and the optional, empty one are valid.
    expect(invalidFields(decisionForm)).toEqual([]);

    change(within(decisionForm).getByLabelText('Rationale'), ' ');
    click(decisionForm, 'Record the decision');
    expect(
      await within(region(DECISION)).findByText(DECISION_VALIDATION),
    ).toBeVisible();
    expect(invalidFields(decisionForm)).toEqual(['Rationale']);
    expect(server.mutations()).toEqual([]);
  });

  it('marks no decision field invalid when the Case changed since it was opened', async () => {
    const { server, actor } = serve({ manager: false, approver: true });
    const caseId = reportedCase(server, {
      reference: 'CERT-STALE-FIELDS',
      leader: certificationIds.colleague,
    });
    recommend(server, caseId);
    server.recordStepAsColleague(caseId, 'dossier_review', dossierReview());
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-STALE-FIELDS');
    const decisionForm = form(DECISION, 'Record the Certification Decision');
    fillGrant(decisionForm);
    server.attachAsColleague(
      caseId,
      server.addSource('Decision form'),
      'decision_form',
    );
    click(decisionForm, 'Record the decision');
    expect(await within(region(DECISION)).findByText(STALE)).toBeVisible();
    expect(server.mutations()).toHaveLength(1);
    expect(invalidFields(decisionForm)).toEqual([]);
  });

  it('shows how the agreed Certificate data differ from the decision and holds the Certificate until they are corrected', async () => {
    const { server, actor } = serve({ manager: true, approver: true });
    const caseId = reportedCase(server, {
      reference: 'CERT-DIFFERS',
      leader: certificationIds.colleague,
    });
    const { dataForm } = attachClosingDocuments(server, caseId);
    recommend(server, caseId);
    server.recordStepAsColleague(caseId, 'dossier_review', dossierReview());
    server.recordStepAsColleague(caseId, 'decision', certificationDecision());
    const english = CERTIFICATE_TEXTS[1];
    server.recordStepAsColleague(caseId, 'certificate_data', {
      texts: [{ ...english, scope: 'Production of milk' }],
      agreedOn: '2026-10-21',
      agreementAttachmentId: dataForm,
    });
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-DIFFERS');
    expect(caseDefinition('Next step')).toBe(CERTIFICATE);
    expect(listed(region(DATA), 'Differences from the decision')).toEqual([
      'ro: granted by the decision, missing from the agreed data.',
      'en — Scope: granted “Production of pasteurised milk (example)”, agreed “Production of milk”.',
    ]);
    expect(
      within(region(CERTIFICATE)).getByText(
        'The Certificate is recorded once the agreed Certificate data state exactly what the decision grants. Correct the Certificate data first.',
      ),
    ).toBeVisible();
    expect(
      within(region(CERTIFICATE)).queryByRole('form'),
    ).not.toBeInTheDocument();

    click(region(DATA), 'Correct the Certificate data');
    const correction = form(DATA, 'Correct the Certificate data');
    const first = within(correction).getByRole('group', {
      name: 'Certificate text 1',
    });
    expect(within(first).getByLabelText('Language')).toHaveValue('en');
    expect(within(first).getByLabelText('Scope')).toHaveValue(
      'Production of milk',
    );
    expect(within(correction).getByLabelText('Agreed on')).toHaveValue(
      '2026-10-21',
    );
    change(within(first).getByLabelText('Scope'), english.scope);
    click(correction, 'Add a Certificate language');
    fillText(correction, 2, CERTIFICATE_TEXTS[0]);
    change(
      within(correction).getByLabelText('Correction reason'),
      'Texts aligned with the decision.',
    );
    click(correction, 'Record the Certificate data');
    await waitFor(() =>
      expect(
        within(region(DATA)).queryByRole('list', {
          name: 'Differences from the decision',
        }),
      ).not.toBeInTheDocument(),
    );
    expect(server.mutations()[0]?.body).toEqual({
      expectedRevision: 23,
      reason: 'Texts aligned with the decision.',
      texts: [english, CERTIFICATE_TEXTS[0]],
      agreedOn: '2026-10-21',
      agreementAttachmentId: dataForm,
    });
    expect(form(CERTIFICATE, 'Record the issued Certificate')).toBeVisible();
  });

  it('tells an approver on the audit team that an approver outside it reviews and decides', async () => {
    const { server, actor } = serve({
      manager: false,
      approver: true,
      auditor: true,
    });
    const caseId = reportedCase(server, {
      reference: 'CERT-ON-TEAM',
      leader: certificationIds.member,
    });
    recommend(server, caseId);
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-ON-TEAM');
    expect(
      within(region(DOSSIER)).getByText(
        'You cannot review this dossier: you are linked to a member of the audit team. An approver who is not on the team reviews it.',
      ),
    ).toBeVisible();
    expect(
      within(region(DECISION)).getByText(
        'You cannot record the Certification Decision: you are linked to a member of the audit team. An approver who is not on the team decides.',
      ),
    ).toBeVisible();
    expect(within(region(DOSSIER)).queryByRole('form')).not.toBeInTheDocument();
    expect(
      within(region(DECISION)).queryByRole('form'),
    ).not.toBeInTheDocument();
    // As the team leader, the actor may still correct the recommendation.
    expect(
      within(region(RECOMMENDATION)).getByRole('button', {
        name: 'Correct the team recommendation',
      }),
    ).toBeVisible();
  });

  it('names the attached PDFs the document archive, apart from the generated dossier register, on the Case page and in the dossier review form', async () => {
    const { server, actor } = serve({ manager: true, approver: true });
    const caseId = reportedCase(server, {
      reference: 'CERT-NAMES',
      leader: certificationIds.colleague,
    });
    recommend(server, caseId);
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-NAMES');

    // The attached signed PDFs and the generated PDF carry distinct names.
    expect(
      within(region('Document archive')).getByText('Stage 1 plan — version 1', {
        selector: 'strong',
      }),
    ).toBeVisible();
    expect(
      within(region('Dossier register PDF')).getByRole('button', {
        name: 'Download the dossier register (PDF)',
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole('region', { name: 'Dossier register' }),
    ).not.toBeInTheDocument();
    // The dossier review form names the archive it is distinct from.
    expect(
      within(form(DOSSIER, 'Record the dossier review')).getByText(
        'An approver who is not on the audit team answers every dossier item: present, missing or not applicable. Nothing is preselected; a missing item needs a note. This review is distinct from the document archive.',
      ),
    ).toBeVisible();
  });

  it('shows a reader the recorded recommendation, review, decision, data and Certificate without any command', async () => {
    const { server, actor } = serve({ manager: false });
    const caseId = reportedCase(server, {
      reference: 'CERT-READER',
      leader: certificationIds.colleague,
    });
    const { decisionForm, dataForm, pdf } = attachClosingDocuments(
      server,
      caseId,
    );
    recommend(server, caseId);
    server.recordStepAsColleague(caseId, 'dossier_review', dossierReview());
    server.recordStepAsColleague(
      caseId,
      'decision',
      certificationDecision({ decisionFormAttachmentId: decisionForm }),
    );
    server.recordStepAsColleague(caseId, 'certificate_data', {
      texts: CERTIFICATE_TEXTS,
      agreedOn: '2026-10-21',
      agreementAttachmentId: dataForm,
    });
    // Recorded before the Certificate stored its attestation.
    server.recordCertificateAsColleague(caseId, {
      number: 'DEMO-0002',
      attachmentId: pdf,
      independenceAttested: false,
    });
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-READER');
    expect(caseDefinition('Status')).toBe('Certified');
    expect(screen.getByText(CERTIFIED_NOTE)).toBeVisible();
    expect(definition(region(RECOMMENDATION), 'Recommendation')).toBe(
      'Grant certification',
    );
    expect(definition(region(DOSSIER), 'Result')).toBe(
      'Complete — no item missing',
    );
    expect(definition(region(DECISION), 'Signed decision form')).toBe(
      DECISION_FORM,
    );
    expect(definition(region(DATA), 'Signed Certificate data form')).toBe(
      DATA_FORM,
    );
    const certificate = region(CERTIFICATE);
    expect(definition(certificate, 'Certificate number')).toBe('DEMO-0002');
    expect(definition(certificate, 'Signed by')).toBe('Not provided');
    expect(definition(certificate, 'Independence from the audit team')).toBe(
      'Not attested: recorded before the attestation was stored',
    );
    expect(definition(certificate, 'Valid until')).toBe('Nov 5, 2029');
    expect(
      within(certificate).getByText(/^Recorded by: Boris Demo/u),
    ).toBeVisible();
    expect(stepState('Team recommendation')).toBe(
      'Grant certification — version 1',
    );
    expect(stepState('Dossier review')).toBe('Complete — version 1');
    expect(stepState('Certification Decision')).toBe('Certification granted');
    expect(stepState('Certificate data')).toBe('Recorded — version 1');
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(
      screen
        .queryAllByRole('button', { name: /^(Record|Correct|Add|Remove)\b/u })
        .map((button) => button.textContent),
    ).toEqual([]);
    expect(server.requests.some((request) => request.method !== 'GET')).toBe(
      false,
    );
  });

  it.each([
    ['a decision form', 'decision'],
    ['a Certificate data form', 'data'],
    ['a Certificate PDF', 'certificate'],
  ])(
    'fails closed on %s the register does not hold with its role',
    async (_name, wrong) => {
      const { server, actor } = serve({ manager: false });
      const caseId = reportedCase(server, {
        reference: 'CERT-WRONG-ROLE',
        leader: certificationIds.colleague,
      });
      const { decisionForm, dataForm, pdf } = attachClosingDocuments(
        server,
        caseId,
      );
      const report = server.attachAsColleague(
        caseId,
        server.addSource('Another report'),
        'report',
      );
      recommend(server, caseId);
      server.recordStepAsColleague(caseId, 'dossier_review', dossierReview());
      server.recordStepAsColleague(
        caseId,
        'decision',
        certificationDecision({
          decisionFormAttachmentId:
            wrong === 'decision' ? report : decisionForm,
        }),
      );
      server.recordStepAsColleague(caseId, 'certificate_data', {
        texts: CERTIFICATE_TEXTS,
        agreedOn: '2026-10-21',
        agreementAttachmentId: wrong === 'data' ? report : dataForm,
      });
      server.recordCertificateAsColleague(caseId, {
        number: 'DEMO-0003',
        attachmentId: wrong === 'certificate' ? report : pdf,
      });
      server.install();
      renderWorkspace(actor);
      fireEvent.click(
        await screen.findByRole('button', { name: 'CERT-WRONG-ROLE' }),
      );
      expect(
        await screen.findByText(
          'This read failed. Refresh before treating this page as current.',
        ),
      ).toBeVisible();
      expect(
        screen.queryByRole('region', { name: DECISION }),
      ).not.toBeInTheDocument();
    },
  );

  it.each(['recommendation', 'dossier_review', 'decision', 'certificate_data'])(
    'fails closed on a timeline that omits the recorded %s',
    async (omitted) => {
      const { server, actor } = serve({ manager: false });
      const caseId = reportedCase(server, {
        reference: 'CERT-TIMELINE-GAP',
        leader: certificationIds.colleague,
      });
      const { dataForm } = attachClosingDocuments(server, caseId);
      recommend(server, caseId);
      server.recordStepAsColleague(caseId, 'dossier_review', dossierReview());
      server.recordStepAsColleague(caseId, 'decision', certificationDecision());
      server.recordStepAsColleague(caseId, 'certificate_data', {
        texts: CERTIFICATE_TEXTS,
        agreedOn: '2026-10-21',
        agreementAttachmentId: dataForm,
      });
      const stored = server.cases.get(caseId);
      if (!stored) throw new Error('Expected the seeded Case.');
      server.interceptions.push({
        match: (request) =>
          request.path === `/api/certification-cases/${caseId}/timeline`,
        respond: () =>
          Response.json({
            caseId,
            entries: stored.steps.filter((entry) => entry.step !== omitted),
          }),
      });
      server.install();
      renderWorkspace(actor);
      fireEvent.click(
        await screen.findByRole('button', { name: 'CERT-TIMELINE-GAP' }),
      );
      expect(
        await screen.findByText(
          'This read failed. Refresh before treating this page as current.',
        ),
      ).toBeVisible();
    },
  );
});
