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
  FakeCertificationServer,
  certificationActor,
  certificationIdentity,
  certificationIds,
  findingStatement,
  nonconformityResponse,
  stage1Report,
  stage2Report,
  stagePlan,
} from './certification.test-fixture';

const STAGE_1_FINDINGS = 'Stage 1 Findings';
const STAGE_2_FINDINGS = 'Stage 2 Findings';
const EVIDENCE = 'Receiving records — version 1 (receiving-records.pdf)';
const SAVED =
  'Saved. The confirmed result remains recorded even if a later refresh fails.';
const FINDING_VALIDATION =
  'Complete the Finding: choose a classification and write the statement (at most 4,000 characters). The clause takes at most 40 characters and the process or area at most 300; cite at most ten evidence PDFs of this Case.';
const CLAUSE_REQUIRED =
  'State the requirement clause and the process or area. Only an opportunity for improvement may omit them.';
const EVIDENCE_REQUIRED =
  'A nonconformity cites at least one exact evidence PDF attached to this Case.';
const NOT_LEADER =
  'Only the leader of the approved audit team records Findings and their follow-up. You are not linked to that team leader.';
const INDEPENDENCE =
  'You cannot reclassify Findings: you are linked to a member of the audit team. An approver who is not on the team reclassifies.';
const STAGE_2_HELD =
  'Stage 2 is planned once every Stage 1 nonconformity is verified effective. Follow up the open Stage 1 nonconformities first.';
const HOLDS_VERIFICATION = 'Holds the next step until verified effective.';
const FOLLOW_UP_PENDING =
  'Both Stages are reported. Before the team recommendation, every major nonconformity and every Stage 1 nonconformity is verified effective, and every other minor nonconformity has a plan judged adequate.';

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
  documents?: boolean;
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

function nextStep() {
  const [caseArticle] = screen.getAllByRole('article');
  if (!caseArticle) throw new Error('Expected the Case.');
  return definition(caseArticle, 'Next step');
}

function stepState(name: string) {
  const step = within(screen.getByRole('list', { name: 'Steps' }))
    .getByText(name)
    .closest('li');
  return step?.textContent?.replace(name, '').trim();
}

function timelineTitles() {
  return [...region('Timeline').querySelectorAll(':scope > ol > li')].map(
    (entry) => entry.querySelector('strong')?.textContent,
  );
}

/** One Finding of a Stage panel, by the start of its heading. */
function finding(panel: string, sequence: number) {
  return within(region(panel)).getByRole('listitem', {
    name: new RegExp(`^Finding ${String(sequence)} — `, 'u'),
  });
}

function historyTitles(item: HTMLElement) {
  const history = item.querySelector('details');
  return [...(history?.querySelectorAll(':scope > ol > li') ?? [])].map(
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

function fillResponse(
  container: HTMLElement,
  input: { correctiveAction: string; plannedCompletion?: string },
) {
  change(
    within(container).getByLabelText('Correction'),
    'Allergen added to the receiving hazard analysis.',
  );
  change(
    within(container).getByLabelText('Cause'),
    'The template omitted allergens.',
  );
  change(
    within(container).getByLabelText('Corrective action'),
    input.correctiveAction,
  );
  change(within(container).getByLabelText('Received on'), '2026-11-12');
  if (input.plannedCompletion)
    change(
      within(container).getByLabelText('Planned completion'),
      input.plannedCompletion,
    );
}

function judge(container: HTMLElement, outcome: string, note: string) {
  choose(container, 'Adequacy of the plan', outcome);
  change(within(container).getByLabelText('Basis of the judgment'), note);
}

/**
 * The fictional dairy's Case with the team approved (revision 8), Stage 1
 * planned on 2026-11-10 (10) and a receiving record attached as evidence (11).
 */
function stage1Planned(
  server: FakeCertificationServer,
  {
    reference,
    leader,
    plan: planOverrides = {},
  }: {
    reference: string;
    leader: string | null;
    plan?: Record<string, unknown>;
  },
) {
  const caseId = server.seedApprovedTeam({ orderReference: reference, leader });
  const plan = server.attachAsColleague(
    caseId,
    server.addSource('Stage 1 plan'),
    'plan',
  );
  server.recordStageAsColleague(
    caseId,
    'stage_1_plan',
    stagePlan(plan, planOverrides),
  );
  const evidence = server.attachAsColleague(
    caseId,
    server.addSource('Receiving records'),
    'evidence',
  );
  return { caseId, evidence };
}

/** Stage 1 reported ready, Stage 2 planned on 2026-11-20 and 21. */
function stage2Planned(server: FakeCertificationServer, caseId: string) {
  const report = server.attachAsColleague(
    caseId,
    server.addSource('Stage 1 report'),
    'report',
  );
  server.recordStageAsColleague(caseId, 'stage_1_report', stage1Report(report));
  const plan = server.attachAsColleague(
    caseId,
    server.addSource('Stage 2 plan'),
    'plan',
  );
  server.recordStageAsColleague(
    caseId,
    'stage_2_plan',
    stagePlan(plan, {
      startDate: '2026-11-20',
      endDate: '2026-11-21',
      onSiteDays: '2',
    }),
  );
}

function reportStage2(server: FakeCertificationServer, caseId: string) {
  const report = server.attachAsColleague(
    caseId,
    server.addSource('Stage 2 report'),
    'report',
  );
  server.recordStageAsColleague(caseId, 'stage_2_report', stage2Report(report));
}

describe('Certification Findings and nonconformity follow-up', () => {
  it('records a Stage 1 nonconformity with its evidence and follows it to a verified effective correction', async () => {
    const { server, actor } = serve({ manager: false, auditor: true });
    const { caseId, evidence } = stage1Planned(server, {
      reference: 'CERT-FINDING-FOLLOW',
      leader: certificationIds.member,
    });
    const report = server.attachAsColleague(
      caseId,
      server.addSource('Stage 1 report'),
      'report',
    );
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-FINDING-FOLLOW');
    const panel = region(STAGE_1_FINDINGS);
    expect(
      within(panel).getByText('No Finding is recorded for this Stage.'),
    ).toBeVisible();
    click(panel, 'Record a Stage 1 Finding');
    const recordForm = form(STAGE_1_FINDINGS, 'Record a Stage 1 Finding');
    // Nothing is preselected and only the evidence PDFs are offered.
    expect(
      within(recordForm).queryAllByRole('radio', { checked: true }),
    ).toEqual([]);
    expect(
      within(within(recordForm).getByRole('group', { name: 'Classification' }))
        .getAllByRole('radio')
        .map((radio) => radio.closest('label')?.textContent),
    ).toEqual([
      'Major nonconformity',
      'Minor nonconformity',
      'Opportunity for improvement',
      'Area of concern',
    ]);
    expect(
      within(
        within(recordForm).getByRole('group', { name: 'Evidence' }),
      ).getAllByRole('checkbox'),
    ).toHaveLength(1);
    expect(
      within(recordForm).getByRole('checkbox', { name: EVIDENCE }),
    ).not.toBeChecked();
    click(recordForm, 'Record the Finding');
    expect(await within(panel).findByText(FINDING_VALIDATION)).toBeVisible();

    choose(recordForm, 'Classification', 'Minor nonconformity');
    change(
      within(recordForm).getByLabelText('Statement'),
      ' Hazard analysis does not cover allergens at receiving. ',
    );
    click(recordForm, 'Record the Finding');
    expect(await within(panel).findByText(CLAUSE_REQUIRED)).toBeVisible();
    change(within(recordForm).getByLabelText('Requirement clause'), '8.5.1');
    change(
      within(recordForm).getByLabelText('Process or area'),
      'Receiving of raw milk',
    );
    click(recordForm, 'Record the Finding');
    expect(await within(panel).findByText(EVIDENCE_REQUIRED)).toBeVisible();
    expect(server.mutations()).toEqual([]);

    fireEvent.click(
      within(recordForm).getByRole('checkbox', { name: EVIDENCE }),
    );
    click(recordForm, 'Record the Finding');
    await waitFor(() =>
      expect(finding(STAGE_1_FINDINGS, 1)).toHaveAccessibleName(
        'Finding 1 — Minor nonconformity',
      ),
    );
    expect(server.mutations()).toEqual([
      expect.objectContaining({
        path: `/api/certification-cases/${caseId}/findings`,
        contentType: 'application/json',
        company: certificationIds.company,
        body: {
          expectedRevision: 12,
          stage: 'stage_1',
          classification: 'minor_nonconformity',
          clause: '8.5.1',
          area: 'Receiving of raw milk',
          statement: 'Hazard analysis does not cover allergens at receiving.',
          evidenceAttachmentIds: [evidence],
        },
      }),
    ]);
    expect(server.mutations()[0]?.key).toBeTruthy();
    expect(screen.getByText(SAVED)).toBeVisible();
    let item = finding(STAGE_1_FINDINGS, 1);
    expect(definition(item, 'Classification')).toBe('Minor nonconformity');
    expect(definition(item, 'Requirement clause')).toBe('8.5.1');
    expect(definition(item, 'Process or area')).toBe('Receiving of raw milk');
    expect(definition(item, 'Statement')).toBe(
      'Hazard analysis does not cover allergens at receiving.',
    );
    expect(definition(item, 'Evidence')).toBe(EVIDENCE);
    expect(definition(item, 'Follow-up')).toBe(
      'Awaiting the client’s response',
    );
    // The server's dates: the Stage's last day plus 14 days and six months.
    expect(definition(item, 'Response due on')).toBe('Nov 24, 2026');
    expect(definition(item, 'Six-month limit')).toBe('May 10, 2027');
    expect(within(item).getByText(HOLDS_VERIFICATION)).toBeVisible();
    // The leader reports Stage 1 ready: Stage 2 waits for the verification.
    server.recordStageAsColleague(
      caseId,
      'stage_1_report',
      stage1Report(report),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reload Case' }));
    await waitFor(() =>
      expect(
        within(region('Stage 2 audit')).getByText(STAGE_2_HELD),
      ).toBeVisible(),
    );
    expect(nextStep()).toBe('Stage 2 audit plan');

    item = finding(STAGE_1_FINDINGS, 1);
    click(item, 'Record the client’s response to Finding 1');
    let responseForm = form(
      STAGE_1_FINDINGS,
      'Record the client’s response to Finding 1',
    );
    click(responseForm, 'Record the response');
    expect(
      await within(item).findByText(
        'Complete the response: the correction, the cause and the corrective action (at most 4,000 characters each) and the date it was received. The planned completion date and the evidence are optional.',
      ),
    ).toBeVisible();
    fillResponse(responseForm, {
      correctiveAction: 'Template revised and staff trained.',
    });
    click(responseForm, 'Record the response');
    await waitFor(() =>
      expect(definition(finding(STAGE_1_FINDINGS, 1), 'Follow-up')).toBe(
        'Plan to judge',
      ),
    );

    item = finding(STAGE_1_FINDINGS, 1);
    click(item, 'Judge the plan of Finding 1');
    let judgment = form(STAGE_1_FINDINGS, 'Judge the plan of Finding 1');
    expect(within(judgment).queryAllByRole('radio', { checked: true })).toEqual(
      [],
    );
    click(judgment, 'Record the judgment');
    expect(
      await within(item).findByText(
        'Choose whether the plan is adequate and state the basis of the judgment (at most 2,000 characters).',
      ),
    ).toBeVisible();
    judge(judgment, 'Not adequate', 'Training record missing.');
    click(judgment, 'Record the judgment');
    await waitFor(() =>
      expect(definition(finding(STAGE_1_FINDINGS, 1), 'Follow-up')).toBe(
        'Plan not adequate — a new response is expected',
      ),
    );

    item = finding(STAGE_1_FINDINGS, 1);
    expect(
      within(item).queryByRole('button', {
        name: 'Judge the plan of Finding 1',
      }),
    ).not.toBeInTheDocument();
    click(item, 'Record the client’s response to Finding 1');
    responseForm = form(
      STAGE_1_FINDINGS,
      'Record the client’s response to Finding 1',
    );
    fillResponse(responseForm, {
      correctiveAction: 'Template revised; training recorded.',
      plannedCompletion: '2026-11-30',
    });
    fireEvent.click(
      within(responseForm).getByRole('checkbox', { name: EVIDENCE }),
    );
    click(responseForm, 'Record the response');
    await waitFor(() =>
      expect(definition(finding(STAGE_1_FINDINGS, 1), 'Follow-up')).toBe(
        'Plan to judge',
      ),
    );
    click(finding(STAGE_1_FINDINGS, 1), 'Judge the plan of Finding 1');
    judgment = form(STAGE_1_FINDINGS, 'Judge the plan of Finding 1');
    judge(judgment, 'Adequate', 'Plan adequate.');
    click(judgment, 'Record the judgment');
    await waitFor(() =>
      expect(definition(finding(STAGE_1_FINDINGS, 1), 'Follow-up')).toBe(
        'Plan adequate — implementation to verify',
      ),
    );

    item = finding(STAGE_1_FINDINGS, 1);
    click(item, 'Verify the implementation of Finding 1');
    const verification = form(
      STAGE_1_FINDINGS,
      'Verify the implementation of Finding 1',
    );
    expect(
      within(verification).queryAllByRole('radio', { checked: true }),
    ).toEqual([]);
    click(verification, 'Record the verification');
    expect(
      await within(item).findByText(
        'Complete the verification: its date, method and outcome, and the note (at most 2,000 characters). The evidence is optional.',
      ),
    ).toBeVisible();
    change(within(verification).getByLabelText('Verified on'), '2026-11-14');
    choose(verification, 'Verification method', 'Document review');
    choose(verification, 'Effectiveness', 'Effective');
    change(
      within(verification).getByLabelText('Verification note'),
      'Revised analysis and training record reviewed.',
    );
    click(verification, 'Record the verification');
    await waitFor(() =>
      expect(definition(finding(STAGE_1_FINDINGS, 1), 'Follow-up')).toBe(
        'Verified effective',
      ),
    );

    const path = (update: string) =>
      `/api/certification-cases/${caseId}/findings/${
        server.cases.get(caseId)?.findings[0]?.id ?? ''
      }/${update}`;
    expect(
      server.mutations().map((request) => [request.path, request.body]),
    ).toEqual([
      [`/api/certification-cases/${caseId}/findings`, expect.anything()],
      [
        path('response'),
        {
          expectedRevision: 14,
          correction: 'Allergen added to the receiving hazard analysis.',
          cause: 'The template omitted allergens.',
          correctiveAction: 'Template revised and staff trained.',
          receivedOn: '2026-11-12',
          plannedCompletionOn: null,
          evidenceAttachmentIds: [],
        },
      ],
      [
        path('plan-judgment'),
        {
          expectedRevision: 15,
          outcome: 'inadequate',
          note: 'Training record missing.',
        },
      ],
      [
        path('response'),
        {
          expectedRevision: 16,
          correction: 'Allergen added to the receiving hazard analysis.',
          cause: 'The template omitted allergens.',
          correctiveAction: 'Template revised; training recorded.',
          receivedOn: '2026-11-12',
          plannedCompletionOn: '2026-11-30',
          evidenceAttachmentIds: [evidence],
        },
      ],
      [
        path('plan-judgment'),
        { expectedRevision: 17, outcome: 'adequate', note: 'Plan adequate.' },
      ],
      [
        path('verification'),
        {
          expectedRevision: 18,
          verifiedOn: '2026-11-14',
          method: 'document_review',
          outcome: 'effective',
          note: 'Revised analysis and training record reviewed.',
          evidenceAttachmentIds: [],
        },
      ],
    ]);
    item = finding(STAGE_1_FINDINGS, 1);
    expect(
      within(item).queryByText(HOLDS_VERIFICATION),
    ).not.toBeInTheDocument();
    expect(
      within(item).queryByRole('button', {
        name: 'Record the client’s response to Finding 1',
      }),
    ).not.toBeInTheDocument();
    expect(historyTitles(item)).toEqual([
      'Statement — version 1',
      'Classification — Minor nonconformity, by the team leader (version 1)',
      'Client’s response — version 1',
      'Plan judgment — Not adequate (version 1)',
      'Client’s response — version 2',
      'Plan judgment — Adequate (version 2)',
      'Verification — Effective (version 1)',
    ]);
    // Stage 2 is no longer held; a programme manager plans it.
    expect(
      within(region('Stage 2 audit')).queryByText(STAGE_2_HELD),
    ).not.toBeInTheDocument();
    expect(
      within(region('Stage 2 audit')).getByText(
        'A programme manager plans this Stage.',
      ),
    ).toBeVisible();
    expect(timelineTitles().slice(-7)).toEqual([
      'Finding 1 recorded — Minor nonconformity (Stage 1)',
      'Stage 1 report — Ready for Stage 2 (version 1)',
      'Finding 1 — client’s response recorded (version 1)',
      'Finding 1 — plan judged: Not adequate (version 1)',
      'Finding 1 — client’s response recorded (version 2)',
      'Finding 1 — plan judged: Adequate (version 2)',
      'Finding 1 — verification: Effective (version 1)',
    ]);
  });

  it('records a Stage 2 opportunity for improvement without clause or area while a major nonconformity holds the recommendation', async () => {
    const { server, actor } = serve({ manager: false, auditor: true });
    const { caseId, evidence } = stage1Planned(server, {
      reference: 'CERT-FINDING-STAGE-2',
      leader: certificationIds.member,
    });
    stage2Planned(server, caseId);
    const major = server.recordFindingAsColleague(caseId, {
      stage: 'stage_2',
      classification: 'major_nonconformity',
      statement: findingStatement({
        clause: '8.5.4.3',
        area: 'Pasteurisation CCP',
        statement:
          'Critical limit deviations were not followed by corrective actions.',
        evidenceAttachmentIds: [evidence],
      }),
    });
    reportStage2(server, caseId);
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-FINDING-STAGE-2');
    expect(nextStep()).toBe('Nonconformity follow-up');
    expect(screen.getByText(FOLLOW_UP_PENDING)).toBeVisible();
    expect(stepState('Nonconformity follow-up')).toBe('Open — 1 to follow up');
    // Stage 1 Findings close once Stage 2 is planned.
    expect(
      within(region(STAGE_1_FINDINGS)).getByText(
        'Stage 1 Findings are recorded before Stage 2 is planned.',
      ),
    ).toBeVisible();
    expect(
      within(region(STAGE_1_FINDINGS)).queryByRole('button', {
        name: 'Record a Stage 1 Finding',
      }),
    ).not.toBeInTheDocument();
    let held = finding(STAGE_2_FINDINGS, 1);
    expect(held).toHaveAccessibleName('Finding 1 — Major nonconformity');
    expect(definition(held, 'Response due on')).toBe('Dec 5, 2026');
    expect(definition(held, 'Six-month limit')).toBe('May 21, 2027');

    click(region(STAGE_2_FINDINGS), 'Record a Stage 2 Finding');
    const recordForm = form(STAGE_2_FINDINGS, 'Record a Stage 2 Finding');
    // An area of concern belongs to Stage 1 only.
    expect(
      within(recordForm)
        .getAllByRole('radio')
        .map((radio) => radio.closest('label')?.textContent),
    ).toEqual([
      'Major nonconformity',
      'Minor nonconformity',
      'Opportunity for improvement',
    ]);
    choose(recordForm, 'Classification', 'Opportunity for improvement');
    change(
      within(recordForm).getByLabelText('Statement'),
      'Consider digital temperature records.',
    );
    click(recordForm, 'Record the Finding');
    await waitFor(() =>
      expect(finding(STAGE_2_FINDINGS, 2)).toHaveAccessibleName(
        'Finding 2 — Opportunity for improvement',
      ),
    );
    expect(server.mutations()[0]?.body).toEqual({
      expectedRevision: 18,
      stage: 'stage_2',
      classification: 'opportunity_for_improvement',
      clause: null,
      area: null,
      statement: 'Consider digital temperature records.',
      evidenceAttachmentIds: [],
    });
    let opportunity = finding(STAGE_2_FINDINGS, 2);
    expect(definition(opportunity, 'Requirement clause')).toBe('Not stated');
    expect(definition(opportunity, 'Process or area')).toBe('Not stated');
    expect(definition(opportunity, 'Evidence')).toBe('No evidence cited');
    expect(definition(opportunity, 'Follow-up')).toBe('No follow-up required');
    expect(
      within(opportunity).queryByText('Response due on', { selector: 'dt' }),
    ).not.toBeInTheDocument();
    expect(
      within(opportunity).queryByRole('button', {
        name: 'Record the client’s response to Finding 2',
      }),
    ).not.toBeInTheDocument();

    // A statement correction starts from the recorded values and states its reason.
    click(opportunity, 'Correct the statement of Finding 2');
    const correction = form(
      STAGE_2_FINDINGS,
      'Correct the statement of Finding 2',
    );
    expect(within(correction).getByLabelText('Statement')).toHaveValue(
      'Consider digital temperature records.',
    );
    change(
      within(correction).getByLabelText('Statement'),
      'Consider digital temperature records at receiving.',
    );
    click(correction, 'Record the correction');
    expect(
      await within(opportunity).findByText(
        'State the reason for this correction (at most 2,000 characters).',
      ),
    ).toBeVisible();
    change(
      within(correction).getByLabelText('Correction reason'),
      'Scope of the opportunity stated.',
    );
    click(correction, 'Record the correction');
    await waitFor(() =>
      expect(definition(finding(STAGE_2_FINDINGS, 2), 'Statement')).toBe(
        'Consider digital temperature records at receiving.',
      ),
    );

    // The team leader may not make it a nonconformity without clause and area.
    opportunity = finding(STAGE_2_FINDINGS, 2);
    click(opportunity, 'Change the classification of Finding 2');
    const unclaused = form(
      STAGE_2_FINDINGS,
      'Change the classification of Finding 2',
    );
    choose(unclaused, 'New classification', 'Minor nonconformity');
    change(
      within(unclaused).getByLabelText('Reason for the new classification'),
      'A requirement is not met.',
    );
    click(unclaused, 'Record the classification');
    expect(await within(opportunity).findByText(CLAUSE_REQUIRED)).toBeVisible();
    click(unclaused, 'Cancel');

    held = finding(STAGE_2_FINDINGS, 1);
    click(held, 'Change the classification of Finding 1');
    const downgrade = form(
      STAGE_2_FINDINGS,
      'Change the classification of Finding 1',
    );
    choose(downgrade, 'New classification', 'Minor nonconformity');
    change(
      within(downgrade).getByLabelText('Reason for the new classification'),
      'Deviations were isolated and corrected on the day.',
    );
    click(downgrade, 'Record the classification');
    await waitFor(() =>
      expect(finding(STAGE_2_FINDINGS, 1)).toHaveAccessibleName(
        'Finding 1 — Minor nonconformity',
      ),
    );
    const [, corrected, reclassified] = server.mutations();
    expect(corrected).toMatchObject({
      path: `/api/certification-cases/${caseId}/findings/${server.cases.get(caseId)?.findings[1]?.id ?? ''}/correction`,
      body: {
        expectedRevision: 19,
        reason: 'Scope of the opportunity stated.',
        clause: null,
        area: null,
        statement: 'Consider digital temperature records at receiving.',
        evidenceAttachmentIds: [],
      },
    });
    expect(reclassified).toMatchObject({
      path: `/api/certification-cases/${caseId}/findings/${major}/classification`,
      body: {
        expectedRevision: 20,
        reason: 'Deviations were isolated and corrected on the day.',
        classification: 'minor_nonconformity',
      },
    });
    held = finding(STAGE_2_FINDINGS, 1);
    // A minor Stage 2 nonconformity has no six-month limit.
    expect(
      within(held).queryByText('Six-month limit', { selector: 'dt' }),
    ).not.toBeInTheDocument();
    expect(
      within(held).getByText(
        'Holds the next step until its plan is judged adequate.',
      ),
    ).toBeVisible();
    expect(nextStep()).toBe('Nonconformity follow-up');
    expect(timelineTitles().slice(-3)).toEqual([
      'Finding 2 recorded — Opportunity for improvement (Stage 2)',
      'Finding 2 — statement corrected (version 2)',
      'Finding 1 reclassified — Minor nonconformity, by the team leader (version 2)',
    ]);
  });

  it('lets an approver outside the team reclassify a Finding with a reason, and not an approver on the team', async () => {
    const outside = serve({ manager: false, approver: true });
    const { caseId } = stage1Planned(outside.server, {
      reference: 'CERT-FINDING-RECLASSIFY',
      leader: certificationIds.colleague,
    });
    const recorded = outside.server.recordFindingAsColleague(caseId, {
      stage: 'stage_1',
      classification: 'opportunity_for_improvement',
      statement: findingStatement({
        clause: '7.5',
        area: 'Document control',
        statement: 'Obsolete forms still available at the line.',
      }),
    });
    outside.server.install();
    const view = renderWorkspace(outside.actor);
    await openSeededCase('CERT-FINDING-RECLASSIFY');
    const panel = region(STAGE_1_FINDINGS);
    expect(
      within(panel).queryByRole('button', { name: 'Record a Stage 1 Finding' }),
    ).not.toBeInTheDocument();
    let item = finding(STAGE_1_FINDINGS, 1);
    // An approver reclassifies; the follow-up belongs to the team leader.
    expect(
      within(item)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Reclassify Finding 1']);
    click(item, 'Reclassify Finding 1');
    const reclassify = form(STAGE_1_FINDINGS, 'Reclassify Finding 1');
    expect(
      within(reclassify).getByText(
        'As an approver who is not on the audit team, choose the new classification and state the reason. The earlier classification stays in the history.',
      ),
    ).toBeVisible();
    expect(
      within(reclassify).queryAllByRole('radio', { checked: true }),
    ).toEqual([]);
    click(reclassify, 'Record the classification');
    expect(
      await within(item).findByText(
        'Choose the new classification and state the reason (at most 2,000 characters).',
      ),
    ).toBeVisible();
    choose(reclassify, 'New classification', 'Opportunity for improvement');
    change(
      within(reclassify).getByLabelText('Reason for the new classification'),
      'A problem area rather than an improvement point.',
    );
    click(reclassify, 'Record the classification');
    expect(
      await within(item).findByText(
        'This is already the classification of the Finding. Choose another one or cancel.',
      ),
    ).toBeVisible();
    choose(reclassify, 'New classification', 'Area of concern');
    click(reclassify, 'Record the classification');
    await waitFor(() =>
      expect(finding(STAGE_1_FINDINGS, 1)).toHaveAccessibleName(
        'Finding 1 — Area of concern',
      ),
    );
    expect(outside.server.mutations()).toEqual([
      expect.objectContaining({
        path: `/api/certification-cases/${caseId}/findings/${recorded}/reclassification`,
        body: {
          expectedRevision: 12,
          reason: 'A problem area rather than an improvement point.',
          classification: 'area_of_concern',
        },
      }),
    ]);
    item = finding(STAGE_1_FINDINGS, 1);
    expect(historyTitles(item)).toEqual([
      'Statement — version 1',
      'Classification — Opportunity for improvement, by the team leader (version 1)',
      'Classification — Area of concern, by the approver (version 2)',
    ]);
    expect(
      within(item).getByText(
        /Correction reason: A problem area rather than an improvement point\./u,
      ),
    ).toBeInTheDocument();
    expect(timelineTitles().at(-1)).toBe(
      'Finding 1 reclassified — Area of concern, by the approver (version 2)',
    );
    view.unmount();
    vi.unstubAllGlobals();

    // An approver linked to the team leader cannot reclassify.
    const member = serve({ manager: false, approver: true });
    const memberCase = stage1Planned(member.server, {
      reference: 'CERT-FINDING-ON-TEAM',
      leader: certificationIds.member,
    });
    member.server.recordFindingAsColleague(memberCase.caseId, {
      stage: 'stage_1',
      classification: 'opportunity_for_improvement',
    });
    member.server.install();
    renderWorkspace(member.actor);
    await openSeededCase('CERT-FINDING-ON-TEAM');
    expect(
      within(region(STAGE_1_FINDINGS)).getByText(INDEPENDENCE),
    ).toBeVisible();
    expect(
      within(finding(STAGE_1_FINDINGS, 1)).queryByRole('button'),
    ).not.toBeInTheDocument();
  });

  it('tells an auditor who does not lead the approved team that only its leader records Findings', async () => {
    const { server, actor } = serve({ manager: false, auditor: true });
    const { caseId, evidence } = stage1Planned(server, {
      reference: 'CERT-FINDING-NOT-LEADER',
      leader: certificationIds.colleague,
    });
    server.recordFindingAsColleague(caseId, {
      stage: 'stage_1',
      classification: 'minor_nonconformity',
      statement: findingStatement({ evidenceAttachmentIds: [evidence] }),
    });
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-FINDING-NOT-LEADER');
    const panel = region(STAGE_1_FINDINGS);
    expect(within(panel).getByText(NOT_LEADER)).toBeVisible();
    expect(within(panel).queryByRole('button')).not.toBeInTheDocument();
    expect(within(panel).queryByRole('form')).not.toBeInTheDocument();
  });

  it('shows a reader every Finding, its exact evidence, dates and history without any command', async () => {
    const { server, actor } = serve({ manager: false, documents: true });
    // Stage 1 in January: its six-month limit passed before today.
    const { caseId, evidence } = stage1Planned(server, {
      reference: 'CERT-FINDING-READ',
      leader: certificationIds.colleague,
      plan: { startDate: '2026-01-15', endDate: '2026-01-15' },
    });
    const minor = server.recordFindingAsColleague(caseId, {
      stage: 'stage_1',
      classification: 'minor_nonconformity',
      statement: findingStatement({ evidenceAttachmentIds: [evidence] }),
    });
    server.recordFindingUpdateAsColleague(
      caseId,
      minor,
      'response',
      nonconformityResponse({ evidenceAttachmentIds: [evidence] }),
    );
    server.recordFindingUpdateAsColleague(caseId, minor, 'plan_judgment', {
      outcome: 'inadequate',
      note: 'Training record missing.',
    });
    server.recordFindingUpdateAsColleague(
      caseId,
      minor,
      'statement',
      findingStatement({
        statement: 'Hazard analysis omits allergens at receiving.',
        evidenceAttachmentIds: [evidence],
      }),
      'Wording aligned with the report.',
    );
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-FINDING-READ');
    const item = finding(STAGE_1_FINDINGS, 1);
    expect(definition(item, 'Statement')).toBe(
      'Hazard analysis omits allergens at receiving.',
    );
    expect(definition(item, 'Follow-up')).toBe(
      'Plan not adequate — a new response is expected',
    );
    expect(definition(item, 'Response due on')).toBe('Jan 29, 2026');
    expect(definition(item, 'Six-month limit')).toBe('Jul 15, 2026 Overdue');
    expect(
      within(item).getByText(
        'The six-month limit has passed without a verification that the nonconformity is eliminated.',
      ),
    ).toBeVisible();
    // The exact evidence opens through the register's download.
    expect(
      within(item).getAllByRole('button', {
        name: 'Download Receiving records — version 1',
      }),
    ).toHaveLength(1);
    expect(historyTitles(item)).toEqual([
      'Statement — version 1',
      'Classification — Minor nonconformity, by the team leader (version 1)',
      'Client’s response — version 1',
      'Plan judgment — Not adequate (version 1)',
      'Statement — version 2',
    ]);
    expect(timelineTitles().slice(-4)).toEqual([
      'Finding 1 recorded — Minor nonconformity (Stage 1)',
      'Finding 1 — client’s response recorded (version 1)',
      'Finding 1 — plan judged: Not adequate (version 1)',
      'Finding 1 — statement corrected (version 2)',
    ]);
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(
      screen
        .queryAllByRole('button', {
          name: /^(Record|Correct|Change|Reclassify|Judge|Verify)\b/u,
        })
        .map((button) => button.textContent),
    ).toEqual([]);
    expect(server.requests.some((request) => request.method !== 'GET')).toBe(
      false,
    );
  });

  type Refused = {
    status: number;
    code: string;
    message: string;
    reload: boolean;
  };
  const recordRefusals: Refused[] = [
    {
      status: 400,
      code: 'CERTIFICATION_FINDING_EVIDENCE_REQUIRED',
      message: EVIDENCE_REQUIRED,
      reload: false,
    },
    {
      status: 400,
      code: 'CERTIFICATION_FINDING_CLAUSE_REQUIRED',
      message: CLAUSE_REQUIRED,
      reload: false,
    },
    {
      status: 400,
      code: 'CERTIFICATION_FINDING_CLASSIFICATION_STAGE',
      message:
        'An area of concern is recorded at Stage 1 only. Choose another classification.',
      reload: false,
    },
    {
      status: 409,
      code: 'CERTIFICATION_ATTACHMENT_ROLE',
      message:
        'A cited evidence PDF is not attached to this Case. Reload the Case and choose again.',
      reload: true,
    },
    {
      status: 409,
      code: 'CERTIFICATION_NOT_TEAM_LEADER',
      message: NOT_LEADER,
      reload: true,
    },
    {
      status: 409,
      code: 'CERTIFICATION_STAGE_CLOSED',
      message: 'Stage 1 Findings are recorded before Stage 2 is planned.',
      reload: true,
    },
    {
      status: 409,
      code: 'CERTIFICATION_STAGE_NOT_PLANNED',
      message:
        'Findings are recorded once this Stage is planned. Reload the Case.',
      reload: true,
    },
    {
      status: 409,
      code: 'CERTIFICATION_CORRECTION_REASON',
      message:
        'This change needs a reason, and a new Finding has none. Reload the Case before saving again.',
      reload: true,
    },
  ];
  it.each(recordRefusals)(
    'explains the Finding refusal $status $code in plain language',
    async ({ status, code, message, reload }) => {
      const { server, actor } = serve({ manager: false, auditor: true });
      const { caseId } = stage1Planned(server, {
        reference: 'CERT-FINDING-REFUSED',
        leader: certificationIds.member,
      });
      server.interceptions.push({
        match: (request) =>
          request.path === `/api/certification-cases/${caseId}/findings`,
        respond: () => Response.json({ code }, { status }),
      });
      server.install();
      renderWorkspace(actor);
      await openSeededCase('CERT-FINDING-REFUSED');
      click(region(STAGE_1_FINDINGS), 'Record a Stage 1 Finding');
      const recordForm = form(STAGE_1_FINDINGS, 'Record a Stage 1 Finding');
      choose(recordForm, 'Classification', 'Opportunity for improvement');
      change(
        within(recordForm).getByLabelText('Statement'),
        'Consider digital temperature records.',
      );
      click(recordForm, 'Record the Finding');
      expect(
        await within(region(STAGE_1_FINDINGS)).findByText(message),
      ).toBeVisible();
      expect(server.mutations()).toHaveLength(1);
      const button = within(recordForm).getByRole('button', {
        name: 'Record the Finding',
      });
      if (reload) expect(button).toBeDisabled();
      else expect(button).toBeEnabled();
    },
  );

  type FollowUpRefusal = {
    update: string;
    code: string;
    message: string;
    prepare: (
      server: FakeCertificationServer,
      caseId: string,
      findingId: string,
    ) => void;
    open: string;
    fill: (container: HTMLElement) => void;
    submit: string;
  };
  const followUpRefusals: FollowUpRefusal[] = [
    {
      update: 'response',
      code: 'CERTIFICATION_FINDING_NOT_OPEN',
      message:
        'Only an open nonconformity receives a response. Reload the Case.',
      prepare: () => undefined,
      open: 'Record the client’s response to Finding 1',
      fill: (container) =>
        fillResponse(container, {
          correctiveAction: 'Template revised and staff trained.',
        }),
      submit: 'Record the response',
    },
    {
      update: 'plan-judgment',
      code: 'CERTIFICATION_FINDING_NO_RESPONSE',
      message:
        'The plan is judged once the client’s response is recorded. Reload the Case.',
      prepare: (server, caseId, findingId) =>
        server.recordFindingUpdateAsColleague(
          caseId,
          findingId,
          'response',
          nonconformityResponse(),
        ),
      open: 'Judge the plan of Finding 1',
      fill: (container) => judge(container, 'Adequate', 'Plan adequate.'),
      submit: 'Record the judgment',
    },
    {
      update: 'verification',
      code: 'CERTIFICATION_FINDING_PLAN_NOT_ADEQUATE',
      message:
        'The implementation is verified once the plan is judged adequate. Reload the Case.',
      prepare: (server, caseId, findingId) => {
        server.recordFindingUpdateAsColleague(
          caseId,
          findingId,
          'response',
          nonconformityResponse(),
        );
        server.recordFindingUpdateAsColleague(
          caseId,
          findingId,
          'plan_judgment',
          { outcome: 'adequate', note: 'Plan adequate.' },
        );
      },
      open: 'Verify the implementation of Finding 1',
      fill: (container) => {
        change(within(container).getByLabelText('Verified on'), '2026-11-14');
        choose(container, 'Verification method', 'On site');
        choose(container, 'Effectiveness', 'Not effective');
        change(
          within(container).getByLabelText('Verification note'),
          'Records still incomplete.',
        );
      },
      submit: 'Record the verification',
    },
    {
      update: 'correction',
      code: 'CERTIFICATION_CORRECTION_UNCHANGED',
      message:
        'The correction changes no value. Change at least one value or cancel the correction.',
      prepare: () => undefined,
      open: 'Correct the statement of Finding 1',
      fill: (container) =>
        change(
          within(container).getByLabelText('Correction reason'),
          'Same statement',
        ),
      submit: 'Record the correction',
    },
  ];
  it.each(followUpRefusals)(
    'explains the follow-up refusal $code in plain language',
    async ({ update, code, message, prepare, open, fill, submit }) => {
      const { server, actor } = serve({ manager: false, auditor: true });
      const { caseId, evidence } = stage1Planned(server, {
        reference: 'CERT-FOLLOW-UP-REFUSED',
        leader: certificationIds.member,
      });
      const findingId = server.recordFindingAsColleague(caseId, {
        stage: 'stage_1',
        classification: 'minor_nonconformity',
        statement: findingStatement({ evidenceAttachmentIds: [evidence] }),
      });
      prepare(server, caseId, findingId);
      server.interceptions.push({
        match: (request) => request.path.endsWith(`/${update}`),
        respond: () => Response.json({ code }, { status: 409 }),
      });
      server.install();
      renderWorkspace(actor);
      await openSeededCase('CERT-FOLLOW-UP-REFUSED');
      const item = finding(STAGE_1_FINDINGS, 1);
      click(item, open);
      const opened = form(STAGE_1_FINDINGS, open);
      fill(opened);
      click(opened, submit);
      expect(await within(item).findByText(message)).toBeVisible();
      expect(server.mutations()).toEqual([
        expect.objectContaining({
          path: `/api/certification-cases/${caseId}/findings/${findingId}/${update}`,
        }),
      ]);
    },
  );

  it('explains that an approver on the team cannot reclassify when the server refuses it', async () => {
    const { server, actor } = serve({ manager: false, approver: true });
    const { caseId } = stage1Planned(server, {
      reference: 'CERT-FINDING-INDEPENDENCE',
      leader: certificationIds.colleague,
    });
    server.recordFindingAsColleague(caseId, {
      stage: 'stage_1',
      classification: 'opportunity_for_improvement',
    });
    server.interceptions.push({
      match: (request) => request.path.endsWith('/reclassification'),
      respond: () =>
        Response.json({ code: 'CERTIFICATION_INDEPENDENCE' }, { status: 409 }),
    });
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-FINDING-INDEPENDENCE');
    const item = finding(STAGE_1_FINDINGS, 1);
    click(item, 'Reclassify Finding 1');
    const reclassify = form(STAGE_1_FINDINGS, 'Reclassify Finding 1');
    choose(reclassify, 'New classification', 'Area of concern');
    change(
      within(reclassify).getByLabelText('Reason for the new classification'),
      'A problem area rather than an improvement point.',
    );
    click(reclassify, 'Record the classification');
    expect(await within(item).findByText(INDEPENDENCE)).toBeVisible();
    expect(server.mutations()).toHaveLength(1);
    expect(
      within(reclassify).getByRole('button', {
        name: 'Record the classification',
      }),
    ).toBeDisabled();
  });

  it('holds the Stage 2 plan while a Stage 1 nonconformity is open, and explains the server refusal', async () => {
    const { server, actor } = serve({ manager: true });
    const { caseId, evidence } = stage1Planned(server, {
      reference: 'CERT-FINDING-HOLDS-STAGE-2',
      leader: certificationIds.colleague,
    });
    const report = server.attachAsColleague(
      caseId,
      server.addSource('Stage 1 report'),
      'report',
    );
    server.recordStageAsColleague(
      caseId,
      'stage_1_report',
      stage1Report(report),
    );
    server.attachAsColleague(caseId, server.addSource('Stage 2 plan'), 'plan');
    const minor = server.recordFindingAsColleague(caseId, {
      stage: 'stage_1',
      classification: 'minor_nonconformity',
      statement: findingStatement({ evidenceAttachmentIds: [evidence] }),
    });
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-FINDING-HOLDS-STAGE-2');
    expect(
      within(region('Stage 2 audit')).getByText(STAGE_2_HELD),
    ).toBeVisible();
    expect(
      within(region('Stage 2 audit')).queryByRole('form'),
    ).not.toBeInTheDocument();

    // Verified effective by the leader: the plan form opens.
    server.recordFindingUpdateAsColleague(
      caseId,
      minor,
      'response',
      nonconformityResponse(),
    );
    server.recordFindingUpdateAsColleague(caseId, minor, 'plan_judgment', {
      outcome: 'adequate',
      note: 'Plan adequate.',
    });
    server.recordFindingUpdateAsColleague(caseId, minor, 'verification', {
      verifiedOn: '2026-11-14',
      method: 'document_review',
      outcome: 'effective',
      note: 'Revised analysis reviewed.',
      evidenceAttachmentIds: [],
    });
    server.interceptions.push({
      match: (request) => request.path.endsWith('/stages/stage-2/plan'),
      respond: () =>
        Response.json(
          { code: 'CERTIFICATION_STAGE_1_NONCONFORMITY_OPEN' },
          { status: 409 },
        ),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reload Case' }));
    const planForm = await waitFor(() =>
      within(region('Stage 2 audit')).getByRole('form', {
        name: 'Record the Stage 2 plan',
      }),
    );
    change(within(planForm).getByLabelText('Start date'), '2026-11-20');
    change(within(planForm).getByLabelText('End date'), '2026-11-20');
    change(within(planForm).getByLabelText('On-site auditor-days'), '2');
    change(within(planForm).getByLabelText('Remote auditor-days'), '0');
    change(
      within(planForm).getByLabelText('Objectives'),
      'Certification audit',
    );
    change(within(planForm).getByLabelText('Audit scope'), 'Dairy products');
    selectOptionByLabel(
      within(planForm).getByLabelText('Audit plan PDF'),
      'Stage 2 plan — version 1 (stage-2-plan.pdf)',
    );
    click(planForm, 'Record the Stage 2 plan');
    expect(
      await within(region('Stage 2 audit')).findByText(STAGE_2_HELD),
    ).toBeVisible();
    expect(
      within(planForm).getByRole('button', { name: 'Record the Stage 2 plan' }),
    ).toBeDisabled();
  });

  it.each([
    ['an attachment', '/documents'],
    ['a step version', '/timeline'],
  ])(
    'fails closed on %s at the revision of a Finding record',
    async (_name, read) => {
      const { server, actor } = serve({ manager: false });
      const { caseId, evidence } = stage1Planned(server, {
        reference: 'CERT-FINDING-REVISION',
        leader: certificationIds.colleague,
      });
      server.recordFindingAsColleague(caseId, {
        stage: 'stage_1',
        classification: 'minor_nonconformity',
        statement: findingStatement({ evidenceAttachmentIds: [evidence] }),
      });
      const stored = server.cases.get(caseId);
      const [attached] = stored?.attachments.slice(-1) ?? [];
      if (!stored || !attached) throw new Error('Expected the seeded Case.');
      // The Finding is recorded at revision 12, after the evidence at 11.
      server.interceptions.push({
        match: (request) =>
          request.path === `/api/certification-cases/${caseId}${read}`,
        respond: () =>
          read === '/documents'
            ? Response.json({
                caseId,
                items: [
                  ...stored.attachments,
                  {
                    ...attached,
                    id: '11310000-0000-4000-8000-600000000099',
                    documentId: '11310000-0000-4000-8000-300000000099',
                    representationId: '11310000-0000-4000-8000-500000000099',
                    caseRevision: 12,
                  },
                ],
              })
            : Response.json({
                caseId,
                entries: stored.steps.map((step, index, steps) =>
                  index === steps.length - 1
                    ? { ...step, caseRevision: 12 }
                    : step,
                ),
              }),
      });
      server.install();
      renderWorkspace(actor);
      fireEvent.click(
        await screen.findByRole('button', { name: 'CERT-FINDING-REVISION' }),
      );
      expect(
        await screen.findByText(
          'This read failed. Refresh before treating this page as current.',
        ),
      ).toBeVisible();
    },
  );

  it('fails closed on a Finding whose evidence the register does not hold', async () => {
    const { server, actor } = serve({ manager: false });
    const { caseId, evidence } = stage1Planned(server, {
      reference: 'CERT-FINDING-MISSING-EVIDENCE',
      leader: certificationIds.colleague,
    });
    server.recordFindingAsColleague(caseId, {
      stage: 'stage_1',
      classification: 'minor_nonconformity',
      statement: findingStatement({ evidenceAttachmentIds: [evidence] }),
    });
    const stored = server.cases.get(caseId);
    if (!stored) throw new Error('Expected the seeded Case.');
    server.interceptions.push({
      match: (request) =>
        request.path === `/api/certification-cases/${caseId}/documents`,
      respond: () =>
        Response.json({
          caseId,
          items: stored.attachments.filter((item) => item.id !== evidence),
        }),
    });
    server.install();
    renderWorkspace(actor);
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'CERT-FINDING-MISSING-EVIDENCE',
      }),
    );
    expect(
      await screen.findByText(
        'This read failed. Refresh before treating this page as current.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('region', { name: STAGE_1_FINDINGS }),
    ).not.toBeInTheDocument();
  });
});
