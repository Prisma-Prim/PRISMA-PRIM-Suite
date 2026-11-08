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
  certificationActor,
  certificationIdentity,
  certificationIds,
  stage1Report,
  stage2Report,
  stagePlan,
  teamMember,
} from './certification.test-fixture';

const STAGE_1 = 'Stage 1 audit';
const STAGE_2 = 'Stage 2 audit';
const SAVED =
  'Saved. The confirmed result remains recorded even if a later refresh fails.';
const PLAN_VALIDATION =
  'Complete the plan: start and end dates, on-site auditor-days above zero and remote auditor-days with at most two decimals, the objectives and scope (at most 2,000 characters each) and the attached audit plan. The date sent to the client is optional.';
const DEVIATION_REQUIRED =
  'The on-site days differ from the confirmed duration: explain the deviation (at most 2,000 characters).';
const REPORT_VALIDATION =
  'Complete the report: the report date, the conclusion and its basis (at most 4,000 characters) and the attached audit report. The participant list is optional.';
const AWAITING_LEADER =
  'The leader of the approved audit team records this report while holding Company Certification Auditor.';
const STAGE_2_BEFORE_REPORT =
  'Stage 2 is planned after a Stage 1 report concluding that the client is ready.';
const STAGE_2_NOT_READY =
  'The Stage 1 report concludes that the client is not ready. Stage 2 can be planned once a corrected Stage 1 report concludes that the client is ready.';
const NOT_LEADER =
  'Only the leader of the approved audit team records this report. You are not linked to that team leader.';

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

function nextStep() {
  return definition(screen.getByRole('article'), 'Next step');
}

function timelineTitles() {
  return [...region('Timeline').querySelectorAll(':scope > ol > li')].map(
    (entry) => entry.querySelector('strong')?.textContent,
  );
}

function stepState(name: string) {
  const step = within(screen.getByRole('list', { name: 'Steps' }))
    .getByText(name)
    .closest('li');
  return step?.textContent?.replace(name, '').trim();
}

function form(stage: string, name: string) {
  return within(region(stage)).getByRole('form', { name });
}

function submit(container: HTMLElement, name: string) {
  fireEvent.click(within(container).getByRole('button', { name }));
}

type PlanInput = {
  start: string;
  end: string;
  onSite: string;
  remote: string;
  document: string;
  sent?: string;
};

function fillPlan(container: HTMLElement, input: PlanInput) {
  change(within(container).getByLabelText('Start date'), input.start);
  change(within(container).getByLabelText('End date'), input.end);
  change(
    within(container).getByLabelText('On-site auditor-days'),
    input.onSite,
  );
  change(within(container).getByLabelText('Remote auditor-days'), input.remote);
  change(
    within(container).getByLabelText('Objectives'),
    'Evaluate readiness of the food safety management system',
  );
  change(
    within(container).getByLabelText('Audit scope'),
    'Production of pasteurised milk and yoghurt',
  );
  selectOptionByLabel(
    within(container).getByLabelText('Audit plan PDF'),
    input.document,
  );
  if (input.sent !== undefined)
    change(
      within(container).getByLabelText('Sent to the client on'),
      input.sent,
    );
}

type ReportInput = {
  date: string;
  conclusion: 'Ready for Stage 2' | 'Not ready for Stage 2';
  note: string;
  report: string;
  participants?: string;
};

function fillStage1Report(container: HTMLElement, input: ReportInput) {
  change(within(container).getByLabelText('Report date'), input.date);
  fireEvent.click(
    within(
      within(container).getByRole('group', { name: 'Readiness for Stage 2' }),
    ).getByRole('radio', { name: input.conclusion }),
  );
  change(
    within(container).getByLabelText('Basis of the conclusion'),
    input.note,
  );
  selectOptionByLabel(
    within(container).getByLabelText('Audit report PDF'),
    input.report,
  );
  if (input.participants)
    selectOptionByLabel(
      within(container).getByLabelText('Participant list PDF'),
      input.participants,
    );
}

function confirmDocumentReview(container: HTMLElement) {
  fireEvent.click(
    within(container).getByRole('checkbox', {
      name: 'The document review is completed',
    }),
  );
}

/** The fictional dairy's planned Stage 1, reported by the colleague when asked. */
function planStage1(server: FakeCertificationServer, caseId: string) {
  const plan = server.attachAsColleague(
    caseId,
    server.addSource('Stage 1 plan'),
    'plan',
  );
  server.recordStageAsColleague(caseId, 'stage_1_plan', stagePlan(plan));
  return plan;
}

describe('Certification Stage 1 and Stage 2 audits', () => {
  it('plans Stage 1 against the confirmed duration, then corrects the plan with a reason', async () => {
    const { server, actor } = serve({ manager: true });
    const caseId = server.seedApprovedTeam({
      orderReference: 'CERT-STAGE-PLAN',
    });
    const plan = server.attachAsColleague(
      caseId,
      server.addSource('Stage 1 plan'),
      'plan',
    );
    server.attachAsColleague(
      caseId,
      server.addSource('Readiness report'),
      'report',
    );
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-STAGE-PLAN');
    expect(nextStep()).toBe('Stage 1 audit plan');
    expect(stepState('Stage 1 audit')).toBe('To record');
    const stage1 = region(STAGE_1);
    expect(
      within(stage1).getByText('No plan is recorded for this Stage yet.'),
    ).toBeVisible();
    expect(
      within(stage1).getByText(
        'The report is recorded once this Stage is planned.',
      ),
    ).toBeVisible();
    // Stage 2 appears once Stage 1 is planned.
    expect(
      screen.queryByRole('region', { name: STAGE_2 }),
    ).not.toBeInTheDocument();

    const planForm = form(STAGE_1, 'Record the Stage 1 plan');
    expect(
      within(planForm).getByText(
        'Confirmed duration on site for this Stage, in auditor-days: 1. Other on-site days need a note explaining the deviation.',
      ),
    ).toBeVisible();
    // Only PDFs attached as an audit plan are offered.
    expect(
      selectOptionLabels(within(planForm).getByLabelText('Audit plan PDF')),
    ).toEqual([
      'Select the attached audit plan',
      'Stage 1 plan — version 1 (stage-1-plan.pdf)',
    ]);
    submit(planForm, 'Record the Stage 1 plan');
    expect(await within(stage1).findByText(PLAN_VALIDATION)).toBeVisible();

    fillPlan(planForm, {
      start: '2026-11-10',
      end: '2026-11-09',
      onSite: '1.5',
      remote: '0.5',
      document: 'Stage 1 plan — version 1 (stage-1-plan.pdf)',
      sent: '2026-11-03',
    });
    submit(planForm, 'Record the Stage 1 plan');
    expect(
      await within(stage1).findByText(
        'A Stage ends on or after its start date. Check the dates.',
      ),
    ).toBeVisible();
    change(within(planForm).getByLabelText('End date'), '2026-11-11');
    expect(
      within(planForm).getByText(
        'Required because the on-site days differ from the confirmed duration.',
      ),
    ).toBeVisible();
    submit(planForm, 'Record the Stage 1 plan');
    expect(await within(stage1).findByText(DEVIATION_REQUIRED)).toBeVisible();
    expect(server.mutations()).toEqual([]);

    // Days equal to the confirmed duration hide the note, which is not sent.
    change(
      within(planForm).getByLabelText('Deviation from the confirmed duration'),
      'Unsent draft',
    );
    change(within(planForm).getByLabelText('On-site auditor-days'), '1.00');
    expect(
      within(planForm).queryByLabelText(
        'Deviation from the confirmed duration',
      ),
    ).not.toBeInTheDocument();
    submit(planForm, 'Record the Stage 1 plan');
    await waitFor(() =>
      expect(
        within(region(STAGE_1)).getByRole('button', {
          name: 'Correct the Stage 1 plan',
        }),
      ).toBeVisible(),
    );
    expect(server.mutations()).toEqual([
      expect.objectContaining({
        path: `/api/certification-cases/${caseId}/stages/stage-1/plan`,
        contentType: 'application/json',
        company: certificationIds.company,
        body: {
          expectedRevision: 10,
          startDate: '2026-11-10',
          endDate: '2026-11-11',
          onSiteDays: '1.00',
          remoteDays: '0.5',
          objectives: 'Evaluate readiness of the food safety management system',
          scope: 'Production of pasteurised milk and yoghurt',
          planAttachmentId: plan,
          sentToClientOn: '2026-11-03',
          deviationNote: null,
        },
      }),
    ]);
    expect(server.mutations()[0]?.key).toBeTruthy();
    expect(screen.getByText(SAVED)).toBeVisible();
    const planned = region(STAGE_1);
    expect(definition(planned, 'Start date')).toBe('Nov 10, 2026');
    expect(definition(planned, 'End date')).toBe('Nov 11, 2026');
    expect(definition(planned, 'On-site auditor-days')).toBe('1');
    expect(definition(planned, 'Remote auditor-days')).toBe('0.5');
    expect(definition(planned, 'Audit plan PDF')).toBe(
      'Stage 1 plan — version 1 (stage-1-plan.pdf)',
    );
    expect(definition(planned, 'Sent to the client on')).toBe('Nov 3, 2026');
    expect(definition(planned, 'Deviation from the confirmed duration')).toBe(
      'No deviation stated',
    );
    expect(nextStep()).toBe('Stage 1 audit report');
    expect(stepState('Stage 1 audit')).toBe('Planned — version 1');
    // A programme manager without the auditor role is told who reports.
    expect(within(planned).getByText(AWAITING_LEADER)).toBeVisible();
    expect(
      within(planned).queryByRole('form', {
        name: 'Record the Stage 1 report',
      }),
    ).not.toBeInTheDocument();
    expect(
      within(region(STAGE_2)).getByText(STAGE_2_BEFORE_REPORT),
    ).toBeVisible();
    expect(within(region(STAGE_2)).queryByRole('form')).not.toBeInTheDocument();

    fireEvent.click(
      within(planned).getByRole('button', { name: 'Correct the Stage 1 plan' }),
    );
    const correction = form(STAGE_1, 'Correct the Stage 1 plan');
    // The correction starts from the latest plan's exact values.
    expect(within(correction).getByLabelText('Start date')).toHaveValue(
      '2026-11-10',
    );
    expect(
      within(correction).getByLabelText('On-site auditor-days'),
    ).toHaveValue('1.00');
    change(within(correction).getByLabelText('On-site auditor-days'), '1.25');
    change(
      within(correction).getByLabelText(
        'Deviation from the confirmed duration',
      ),
      ' One production line idle during the audit. ',
    );
    submit(correction, 'Record the correction');
    expect(
      await within(region(STAGE_1)).findByText(
        'State the reason for this correction (at most 2,000 characters).',
      ),
    ).toBeVisible();
    change(
      within(correction).getByLabelText('Correction reason'),
      'The client idles one line.',
    );
    submit(correction, 'Record the correction');
    expect(
      await within(region(STAGE_1)).findByText(
        /Correction reason: The client idles one line\./u,
      ),
    ).toBeVisible();
    expect(server.mutations()[1]?.body).toEqual({
      expectedRevision: 11,
      reason: 'The client idles one line.',
      startDate: '2026-11-10',
      endDate: '2026-11-11',
      onSiteDays: '1.25',
      remoteDays: '0.5',
      objectives: 'Evaluate readiness of the food safety management system',
      scope: 'Production of pasteurised milk and yoghurt',
      planAttachmentId: plan,
      sentToClientOn: '2026-11-03',
      deviationNote: 'One production line idle during the audit.',
    });
    expect(
      definition(region(STAGE_1), 'Deviation from the confirmed duration'),
    ).toBe('One production line idle during the audit.');
    expect(timelineTitles().slice(-2)).toEqual([
      'Stage 1 plan — version 1',
      'Stage 1 plan — version 2',
    ]);
  });

  it('lets the team leader report Stage 1 not ready, then correct it to ready', async () => {
    const { server, actor } = serve({ manager: false, auditor: true });
    const caseId = server.seedApprovedTeam({
      orderReference: 'CERT-STAGE-REPORT',
      leader: certificationIds.member,
    });
    planStage1(server, caseId);
    const report = server.attachAsColleague(
      caseId,
      server.addSource('Stage 1 report'),
      'report',
    );
    const participants = server.attachAsColleague(
      caseId,
      server.addSource('Stage 1 participants'),
      'participant_list',
    );
    server.attachAsColleague(
      caseId,
      server.addSource('Laboratory evidence'),
      'evidence',
    );
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-STAGE-REPORT');
    // Only a programme manager plans.
    expect(
      screen.queryByRole('button', { name: 'Correct the Stage 1 plan' }),
    ).not.toBeInTheDocument();
    const reportForm = form(STAGE_1, 'Record the Stage 1 report');
    // Nothing is preselected: neither the review nor the conclusion.
    expect(
      within(reportForm).queryAllByRole('radio', { checked: true }),
    ).toEqual([]);
    expect(
      within(reportForm).getByRole('checkbox', {
        name: 'The document review is completed',
      }),
    ).not.toBeChecked();
    expect(
      selectOptionLabels(within(reportForm).getByLabelText('Audit report PDF')),
    ).toEqual([
      'Select the attached audit report',
      'Stage 1 report — version 1 (stage-1-report.pdf)',
    ]);
    submit(reportForm, 'Record the Stage 1 report');
    expect(
      await within(region(STAGE_1)).findByText(REPORT_VALIDATION),
    ).toBeVisible();

    fillStage1Report(reportForm, {
      date: '2026-11-09',
      conclusion: 'Not ready for Stage 2',
      note: 'Hazard analysis incomplete.',
      report: 'Stage 1 report — version 1 (stage-1-report.pdf)',
      participants:
        'Stage 1 participants — version 1 (stage-1-participants.pdf)',
    });
    submit(reportForm, 'Record the Stage 1 report');
    expect(
      await within(region(STAGE_1)).findByText(
        'Stage 1 includes the document review: confirm that it is completed before recording the report.',
      ),
    ).toBeVisible();
    confirmDocumentReview(reportForm);
    submit(reportForm, 'Record the Stage 1 report');
    expect(
      await within(region(STAGE_1)).findByText(
        'A report is dated on or after the start of its Stage. Check the report date.',
      ),
    ).toBeVisible();
    expect(server.mutations()).toEqual([]);

    change(within(reportForm).getByLabelText('Report date'), '2026-11-10');
    submit(reportForm, 'Record the Stage 1 report');
    await waitFor(() =>
      expect(
        within(region(STAGE_1)).getByRole('button', {
          name: 'Correct the Stage 1 report',
        }),
      ).toBeVisible(),
    );
    expect(server.mutations()).toEqual([
      expect.objectContaining({
        path: `/api/certification-cases/${caseId}/stages/stage-1/report`,
        body: {
          expectedRevision: 13,
          reportDate: '2026-11-10',
          documentReviewCompleted: true,
          conclusion: 'not_ready',
          conclusionNote: 'Hazard analysis incomplete.',
          reportAttachmentId: report,
          participantListAttachmentId: participants,
          certificationBodyApproval: null,
        },
      }),
    ]);
    const reported = region(STAGE_1);
    expect(definition(reported, 'Report date')).toBe('Nov 10, 2026');
    expect(definition(reported, 'Document review')).toBe('Completed');
    expect(definition(reported, 'Readiness for Stage 2')).toBe(
      'Not ready for Stage 2',
    );
    expect(definition(reported, 'Basis of the conclusion')).toBe(
      'Hazard analysis incomplete.',
    );
    expect(definition(reported, 'Participant list PDF')).toBe(
      'Stage 1 participants — version 1 (stage-1-participants.pdf)',
    );
    expect(nextStep()).toBe('Stage 1 audit report');
    expect(stepState('Stage 1 audit')).toBe('Not ready — report version 1');
    expect(within(region(STAGE_2)).getByText(STAGE_2_NOT_READY)).toBeVisible();

    fireEvent.click(
      within(reported).getByRole('button', {
        name: 'Correct the Stage 1 report',
      }),
    );
    const correction = form(STAGE_1, 'Correct the Stage 1 report');
    expect(
      within(correction).getByRole('radio', { name: 'Not ready for Stage 2' }),
    ).toBeChecked();
    expect(
      within(correction).getByRole('checkbox', {
        name: 'The document review is completed',
      }),
    ).toBeChecked();
    // A correction that changes nothing is refused in plain language.
    change(
      within(correction).getByLabelText('Correction reason'),
      'Same report',
    );
    submit(correction, 'Record the correction');
    expect(
      await within(region(STAGE_1)).findByText(
        'The correction changes no value. Change at least one value or cancel the correction.',
      ),
    ).toBeVisible();

    fireEvent.click(
      within(correction).getByRole('radio', { name: 'Ready for Stage 2' }),
    );
    change(
      within(correction).getByLabelText('Basis of the conclusion'),
      'Ready after the completed hazard analysis.',
    );
    change(within(correction).getByLabelText('Report date'), '2026-11-14');
    change(
      within(correction).getByLabelText('Correction reason'),
      'Hazard analysis completed and verified.',
    );
    submit(correction, 'Record the correction');
    await waitFor(() => expect(nextStep()).toBe('Stage 2 audit plan'));
    const [, unchanged, corrected] = server.mutations();
    expect(unchanged?.body).toMatchObject({
      expectedRevision: 14,
      reason: 'Same report',
      conclusion: 'not_ready',
    });
    expect(corrected?.body).toEqual({
      expectedRevision: 14,
      reason: 'Hazard analysis completed and verified.',
      reportDate: '2026-11-14',
      documentReviewCompleted: true,
      conclusion: 'ready',
      conclusionNote: 'Ready after the completed hazard analysis.',
      reportAttachmentId: report,
      participantListAttachmentId: participants,
      certificationBodyApproval: null,
    });
    expect(corrected?.key).not.toBe(unchanged?.key);
    expect(stepState('Stage 1 audit')).toBe('Ready — report version 2');
    expect(definition(region(STAGE_1), 'Readiness for Stage 2')).toBe(
      'Ready for Stage 2',
    );
    // An auditor does not plan: the programme manager plans Stage 2.
    expect(
      within(region(STAGE_2)).getByText(
        'A programme manager plans this Stage.',
      ),
    ).toBeVisible();
    expect(timelineTitles().slice(-2)).toEqual([
      'Stage 1 report — Not ready for Stage 2 (version 1)',
      'Stage 1 report — Ready for Stage 2 (version 2)',
    ]);
  });

  it('keeps Stage 2 closed until a Stage 1 report concludes ready, then plans it after that report', async () => {
    const { server, actor } = serve({ manager: true });
    const caseId = server.seedApprovedTeam({
      orderReference: 'CERT-STAGE-2',
    });
    planStage1(server, caseId);
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-STAGE-2');
    const waiting = region(STAGE_2);
    expect(
      within(waiting).getByText('No plan is recorded for this Stage yet.'),
    ).toBeVisible();
    expect(within(waiting).getByText(STAGE_2_BEFORE_REPORT)).toBeVisible();
    expect(within(waiting).queryByRole('form')).not.toBeInTheDocument();
    expect(stepState('Stage 2 audit')).toBe(
      'Waits for a Stage 1 report concluding ready',
    );

    const report = server.attachAsColleague(
      caseId,
      server.addSource('Stage 1 report'),
      'report',
    );
    server.recordStageAsColleague(
      caseId,
      'stage_1_report',
      stage1Report(report, {
        conclusion: 'not_ready',
        conclusionNote: 'Hazard analysis incomplete.',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reload Case' }));
    await waitFor(() =>
      expect(
        within(region(STAGE_2)).getByText(STAGE_2_NOT_READY),
      ).toBeVisible(),
    );
    expect(within(region(STAGE_2)).queryByRole('form')).not.toBeInTheDocument();

    server.recordStageAsColleague(
      caseId,
      'stage_1_report',
      stage1Report(report, { reportDate: '2026-11-14' }),
      'Hazard analysis completed and verified.',
    );
    const plan = server.attachAsColleague(
      caseId,
      server.addSource('Stage 2 plan'),
      'plan',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reload Case' }));
    const planForm = await waitFor(() =>
      form(STAGE_2, 'Record the Stage 2 plan'),
    );
    expect(
      within(planForm).getByText(
        'Confirmed duration on site for this Stage, in auditor-days: 2. Other on-site days need a note explaining the deviation.',
      ),
    ).toBeVisible();
    fillPlan(planForm, {
      start: '2026-11-14',
      end: '2026-11-15',
      onSite: '2.5',
      remote: '0',
      document: 'Stage 2 plan — version 1 (stage-2-plan.pdf)',
    });
    submit(planForm, 'Record the Stage 2 plan');
    expect(
      await within(region(STAGE_2)).findByText(
        'Stage 2 starts after the date of the Stage 1 report. Choose a later start date.',
      ),
    ).toBeVisible();
    change(within(planForm).getByLabelText('Start date'), '2026-11-20');
    change(within(planForm).getByLabelText('End date'), '2026-11-21');
    submit(planForm, 'Record the Stage 2 plan');
    expect(
      await within(region(STAGE_2)).findByText(DEVIATION_REQUIRED),
    ).toBeVisible();
    change(
      within(planForm).getByLabelText('Deviation from the confirmed duration'),
      'One production line idle during the audit.',
    );
    submit(planForm, 'Record the Stage 2 plan');
    await waitFor(() => expect(nextStep()).toBe('Stage 2 audit report'));
    expect(server.mutations()).toEqual([
      expect.objectContaining({
        path: `/api/certification-cases/${caseId}/stages/stage-2/plan`,
        body: {
          expectedRevision: 14,
          startDate: '2026-11-20',
          endDate: '2026-11-21',
          onSiteDays: '2.5',
          remoteDays: '0',
          objectives: 'Evaluate readiness of the food safety management system',
          scope: 'Production of pasteurised milk and yoghurt',
          planAttachmentId: plan,
          sentToClientOn: null,
          deviationNote: 'One production line idle during the audit.',
        },
      }),
    ]);
    const planned = region(STAGE_2);
    expect(definition(planned, 'Sent to the client on')).toBe('Not sent yet');
    expect(definition(planned, 'Deviation from the confirmed duration')).toBe(
      'One production line idle during the audit.',
    );
    expect(stepState('Stage 2 audit')).toBe('Planned — version 1');
    expect(within(planned).getByText(AWAITING_LEADER)).toBeVisible();
  });

  it('shows a reader every Stage record without any command', async () => {
    const { server, actor } = serve({ manager: false });
    const caseId = server.seedApprovedTeam({
      orderReference: 'CERT-STAGE-READ',
    });
    planStage1(server, caseId);
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
    const participants2 = server.attachAsColleague(
      caseId,
      server.addSource('Stage 2 participants'),
      'participant_list',
    );
    const annex = server.attachAsColleague(
      caseId,
      server.addSource('Laboratory results'),
      'evidence',
    );
    server.recordStageAsColleague(
      caseId,
      'stage_2_report',
      stage2Report(report2, {
        participantListAttachmentId: participants2,
        annexAttachmentId: annex,
      }),
    );
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-STAGE-READ');
    expect(nextStep()).toBe('Team recommendation');
    expect(
      screen.getByText(
        'Both Stages are reported and no nonconformity holds the Case. The leader of the approved audit team records the team recommendation.',
      ),
    ).toBeVisible();
    expect(stepState('Stage 1 audit')).toBe('Ready — report version 1');
    expect(stepState('Stage 2 audit')).toBe('Reported — version 1');
    const stage1 = region(STAGE_1);
    expect(definition(stage1, 'Readiness for Stage 2')).toBe(
      'Ready for Stage 2',
    );
    expect(definition(stage1, 'Participant list PDF')).toBe('None attached');
    const stage2 = region(STAGE_2);
    expect(definition(stage2, 'Start date')).toBe('Nov 20, 2026');
    expect(definition(stage2, 'Summary of the Stage 2 audit')).toBe(
      'Stage 2 completed as planned.',
    );
    expect(definition(stage2, 'Audit report PDF')).toBe(
      'Stage 2 report — version 1 (stage-2-report.pdf)',
    );
    expect(definition(stage2, 'Participant list PDF')).toBe(
      'Stage 2 participants — version 1 (stage-2-participants.pdf)',
    );
    expect(definition(stage2, 'Annex PDF')).toBe(
      'Laboratory results — version 1 (laboratory-results.pdf)',
    );
    expect(timelineTitles().slice(-4)).toEqual([
      'Stage 1 plan — version 1',
      'Stage 1 report — Ready for Stage 2 (version 1)',
      'Stage 2 plan — version 1',
      'Stage 2 report — version 1',
    ]);

    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    for (const name of [
      'Correct the Stage 1 plan',
      'Correct the Stage 1 report',
      'Correct the Stage 2 plan',
      'Correct the Stage 2 report',
    ])
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    expect(screen.queryByText(AWAITING_LEADER)).not.toBeInTheDocument();
    expect(server.requests.some((request) => request.method !== 'GET')).toBe(
      false,
    );
  });

  it('offers the report form only to the leader of the approved team holding the auditor role', async () => {
    const auditor = serve({ manager: false, auditor: true });
    const notLed = auditor.server.seedApprovedTeam({
      orderReference: 'CERT-STAGE-NOT-LEADER',
      leader: certificationIds.colleague,
    });
    planStage1(auditor.server, notLed);
    auditor.server.install();
    const view = renderWorkspace(auditor.actor);
    await openSeededCase('CERT-STAGE-NOT-LEADER');
    expect(within(region(STAGE_1)).getByText(NOT_LEADER)).toBeVisible();
    expect(within(region(STAGE_1)).queryByRole('form')).not.toBeInTheDocument();
    view.unmount();
    vi.unstubAllGlobals();

    // The leader without the auditor role is told what reporting requires.
    const leader = serve({ manager: true });
    const led = leader.server.seedApprovedTeam({
      orderReference: 'CERT-STAGE-LEADER-NO-ROLE',
      leader: certificationIds.member,
    });
    planStage1(leader.server, led);
    leader.server.install();
    renderWorkspace(leader.actor);
    await openSeededCase('CERT-STAGE-LEADER-NO-ROLE');
    expect(within(region(STAGE_1)).getByText(AWAITING_LEADER)).toBeVisible();
    expect(
      within(region(STAGE_1)).queryByRole('form', {
        name: 'Record the Stage 1 report',
      }),
    ).not.toBeInTheDocument();
  });

  it('explains that a new team version awaiting its decision blocks plans and reports', async () => {
    const { server, actor } = serve({ manager: true, auditor: true });
    const caseId = server.seedApprovedTeam({
      orderReference: 'CERT-STAGE-NEW-TEAM',
      leader: certificationIds.member,
    });
    planStage1(server, caseId);
    server.proposeTeamAsColleague(
      caseId,
      [
        teamMember({ workspaceMembershipId: certificationIds.member }),
        teamMember({
          name: 'Mara Demo',
          role: 'auditor',
          holdsCategory: false,
          competenceNote: 'ISO 22000 auditor',
        }),
      ],
      'Auditor replaced.',
    );
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-STAGE-NEW-TEAM');
    expect(nextStep()).toBe('Team decision');
    const stage1 = region(STAGE_1);
    expect(definition(stage1, 'On-site auditor-days')).toBe('1');
    expect(
      within(stage1).getByText(
        'The audit is planned once the latest audit team version is approved.',
      ),
    ).toBeVisible();
    expect(
      within(stage1).getByText(
        'The leader of the approved audit team records the reports; the latest team version is not approved.',
      ),
    ).toBeVisible();
    expect(within(stage1).queryByRole('form')).not.toBeInTheDocument();
    expect(
      within(stage1).queryByRole('button', {
        name: 'Correct the Stage 1 plan',
      }),
    ).not.toBeInTheDocument();
  });

  type Refused = {
    status: number;
    code: string;
    message: string;
    reload: boolean;
  };
  const planRefusals: Refused[] = [
    {
      status: 400,
      code: 'CERTIFICATION_STAGE_DATES',
      message: 'A Stage ends on or after its start date. Check the dates.',
      reload: false,
    },
    {
      status: 400,
      code: 'CERTIFICATION_STAGE_DEVIATION_NOTE',
      message:
        'The on-site days and the deviation note no longer match the confirmed duration. Reload the Case and check them.',
      reload: true,
    },
    {
      status: 409,
      code: 'CERTIFICATION_TEAM_NOT_APPROVED',
      message:
        'The audit is planned once the latest audit team version is approved.',
      reload: true,
    },
    {
      status: 409,
      code: 'CERTIFICATION_ATTACHMENT_ROLE',
      message:
        'A chosen PDF is not attached with the expected role. Reload the Case and choose again.',
      reload: true,
    },
    {
      status: 409,
      code: 'CERTIFICATION_CORRECTION_REASON',
      message:
        'A new plan version needs a reason and a first plan has none. Reload the Case before saving again.',
      reload: true,
    },
    {
      status: 409,
      code: 'CERTIFICATION_STAGE_1_NOT_READY',
      message: STAGE_2_NOT_READY,
      reload: true,
    },
  ];
  it.each(planRefusals)(
    'explains the plan refusal $status $code in plain language',
    async ({ status, code, message, reload }) => {
      const { server, actor } = serve({ manager: true });
      const caseId = server.seedApprovedTeam({
        orderReference: 'CERT-STAGE-PLAN-REFUSED',
      });
      server.attachAsColleague(
        caseId,
        server.addSource('Stage 1 plan'),
        'plan',
      );
      server.interceptions.push({
        match: (request) => request.path.endsWith('/stages/stage-1/plan'),
        respond: () => Response.json({ code }, { status }),
      });
      server.install();
      renderWorkspace(actor);
      await openSeededCase('CERT-STAGE-PLAN-REFUSED');
      const planForm = form(STAGE_1, 'Record the Stage 1 plan');
      fillPlan(planForm, {
        start: '2026-11-10',
        end: '2026-11-10',
        onSite: '1',
        remote: '0',
        document: 'Stage 1 plan — version 1 (stage-1-plan.pdf)',
      });
      submit(planForm, 'Record the Stage 1 plan');
      expect(await within(region(STAGE_1)).findByText(message)).toBeVisible();
      expect(server.mutations()).toHaveLength(1);
      const button = within(planForm).getByRole('button', {
        name: 'Record the Stage 1 plan',
      });
      if (reload) expect(button).toBeDisabled();
      else expect(button).toBeEnabled();
    },
  );

  const reportRefusals: Refused[] = [
    {
      status: 400,
      code: 'CERTIFICATION_DOCUMENT_REVIEW_INCOMPLETE',
      message:
        'Stage 1 includes the document review: confirm that it is completed before recording the report.',
      reload: false,
    },
    {
      status: 409,
      code: 'CERTIFICATION_STAGE_DATES',
      message:
        'A report is dated on or after the start of its Stage. Check the report date.',
      reload: false,
    },
    {
      status: 409,
      code: 'CERTIFICATION_NOT_TEAM_LEADER',
      message: NOT_LEADER,
      reload: true,
    },
    {
      status: 409,
      code: 'CERTIFICATION_STAGE_NOT_PLANNED',
      message: 'The report is recorded once this Stage is planned.',
      reload: true,
    },
    {
      status: 409,
      code: 'CERTIFICATION_CORRECTION_REASON',
      message:
        'A new report version needs a reason and a first report has none. Reload the Case before saving again.',
      reload: true,
    },
    {
      status: 409,
      code: 'CERTIFICATION_INDEPENDENCE',
      message:
        'The person named as acting for the certification body is on the audit team. A member of the audit team cannot perform this act; check the name.',
      reload: false,
    },
    {
      status: 409,
      code: 'CERTIFICATION_ACT_IN_FUTURE',
      message:
        'The act on behalf of the certification body cannot be dated after today. Check the date of the act.',
      reload: false,
    },
  ];
  it.each(reportRefusals)(
    'explains the report refusal $status $code in plain language',
    async ({ status, code, message, reload }) => {
      const { server, actor } = serve({ manager: false, auditor: true });
      const caseId = server.seedApprovedTeam({
        orderReference: 'CERT-STAGE-REPORT-REFUSED',
        leader: certificationIds.member,
      });
      planStage1(server, caseId);
      server.attachAsColleague(
        caseId,
        server.addSource('Stage 1 report'),
        'report',
      );
      server.interceptions.push({
        match: (request) => request.path.endsWith('/stages/stage-1/report'),
        respond: () => Response.json({ code }, { status }),
      });
      server.install();
      renderWorkspace(actor);
      await openSeededCase('CERT-STAGE-REPORT-REFUSED');
      const reportForm = form(STAGE_1, 'Record the Stage 1 report');
      fillStage1Report(reportForm, {
        date: '2026-11-10',
        conclusion: 'Ready for Stage 2',
        note: 'Ready.',
        report: 'Stage 1 report — version 1 (stage-1-report.pdf)',
      });
      confirmDocumentReview(reportForm);
      submit(reportForm, 'Record the Stage 1 report');
      expect(await within(region(STAGE_1)).findByText(message)).toBeVisible();
      expect(server.mutations()).toHaveLength(1);
      const button = within(reportForm).getByRole('button', {
        name: 'Record the Stage 1 report',
      });
      if (reload) expect(button).toBeDisabled();
      else expect(button).toBeEnabled();
    },
  );

  it('keeps the plan draft through a stale refusal and saves it after a reload', async () => {
    const { server, actor } = serve({ manager: true });
    const caseId = server.seedApprovedTeam({
      orderReference: 'CERT-STAGE-STALE',
    });
    server.attachAsColleague(caseId, server.addSource('Stage 1 plan'), 'plan');
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-STAGE-STALE');
    fillPlan(form(STAGE_1, 'Record the Stage 1 plan'), {
      start: '2026-11-10',
      end: '2026-11-10',
      onSite: '1',
      remote: '0',
      document: 'Stage 1 plan — version 1 (stage-1-plan.pdf)',
    });
    server.attachAsColleague(
      caseId,
      server.addSource('Readiness report'),
      'report',
    );
    submit(form(STAGE_1, 'Record the Stage 1 plan'), 'Record the Stage 1 plan');
    expect(
      await within(region(STAGE_1)).findByText(
        'This Case changed since you opened it. Reload it before saving; your draft is kept.',
      ),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Reload Case' }));
    await waitFor(() =>
      expect(
        within(form(STAGE_1, 'Record the Stage 1 plan')).getByRole('button', {
          name: 'Record the Stage 1 plan',
        }),
      ).toBeEnabled(),
    );
    expect(
      within(form(STAGE_1, 'Record the Stage 1 plan')).getByLabelText(
        'On-site auditor-days',
      ),
    ).toHaveValue('1');
    submit(form(STAGE_1, 'Record the Stage 1 plan'), 'Record the Stage 1 plan');
    await waitFor(() => expect(nextStep()).toBe('Stage 1 audit report'));
    const [stale, saved] = server.mutations();
    expect(stale?.body).toMatchObject({ expectedRevision: 9 });
    expect(saved?.body).toMatchObject({ expectedRevision: 10 });
    expect(saved?.key).not.toBe(stale?.key);
  });

  it('records the Stage 2 report with its optional annex', async () => {
    const { server, actor } = serve({ manager: false, auditor: true });
    const caseId = server.seedApprovedTeam({
      orderReference: 'CERT-STAGE-2-REPORT',
      leader: certificationIds.member,
    });
    planStage1(server, caseId);
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
    const annex = server.attachAsColleague(
      caseId,
      server.addSource('Laboratory results'),
      'evidence',
    );
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-STAGE-2-REPORT');
    const reportForm = form(STAGE_2, 'Record the Stage 2 report');
    expect(
      selectOptionLabels(within(reportForm).getByLabelText('Annex PDF')),
    ).toEqual([
      'No annex',
      'Stage 1 report — version 1 (stage-1-report.pdf)',
      'Stage 2 report — version 1 (stage-2-report.pdf)',
      'Laboratory results — version 1 (laboratory-results.pdf)',
    ]);
    submit(reportForm, 'Record the Stage 2 report');
    expect(
      await within(region(STAGE_2)).findByText(
        'Complete the report: the report date, the summary (at most 4,000 characters) and the attached audit report. The participant list and the annex are optional.',
      ),
    ).toBeVisible();
    change(within(reportForm).getByLabelText('Report date'), '2026-11-21');
    change(
      within(reportForm).getByLabelText('Summary of the Stage 2 audit'),
      ' Stage 2 completed as planned. ',
    );
    selectOptionByLabel(
      within(reportForm).getByLabelText('Audit report PDF'),
      'Stage 2 report — version 1 (stage-2-report.pdf)',
    );
    selectOptionByLabel(
      within(reportForm).getByLabelText('Annex PDF'),
      'Laboratory results — version 1 (laboratory-results.pdf)',
    );
    submit(reportForm, 'Record the Stage 2 report');
    await waitFor(() => expect(nextStep()).toBe('Team recommendation'));
    expect(server.mutations()).toEqual([
      expect.objectContaining({
        path: `/api/certification-cases/${caseId}/stages/stage-2/report`,
        body: {
          expectedRevision: 16,
          reportDate: '2026-11-21',
          summary: 'Stage 2 completed as planned.',
          reportAttachmentId: report2,
          participantListAttachmentId: null,
          annexAttachmentId: annex,
          certificationBodyApproval: null,
        },
      }),
    ]);
    expect(definition(region(STAGE_2), 'Annex PDF')).toBe(
      'Laboratory results — version 1 (laboratory-results.pdf)',
    );
    expect(timelineTitles().at(-1)).toBe('Stage 2 report — version 1');
  });

  it('fails closed on a Stage record whose PDF is not attached with its role', async () => {
    const { server, actor } = serve({ manager: true });
    const caseId = server.seedApprovedTeam({
      orderReference: 'CERT-STAGE-WRONG-ROLE',
    });
    const report = server.attachAsColleague(
      caseId,
      server.addSource('Readiness report'),
      'report',
    );
    server.recordStageAsColleague(caseId, 'stage_1_plan', stagePlan(report));
    server.install();
    renderWorkspace(actor);
    fireEvent.click(
      await screen.findByRole('button', { name: 'CERT-STAGE-WRONG-ROLE' }),
    );
    expect(
      await screen.findByText(
        'This read failed. Refresh before treating this page as current.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('region', { name: STAGE_1 }),
    ).not.toBeInTheDocument();
  });

  it('fails closed when the timeline lacks the latest Stage record', async () => {
    const { server, actor } = serve({ manager: true });
    const caseId = server.seedApprovedTeam({
      orderReference: 'CERT-STAGE-TIMELINE',
    });
    planStage1(server, caseId);
    const stored = server.cases.get(caseId);
    if (!stored) throw new Error('Expected the seeded Case.');
    server.interceptions.push({
      match: (request) => request.path.endsWith('/timeline'),
      respond: () =>
        Response.json({ caseId, entries: stored.steps.slice(0, -1) }),
    });
    server.install();
    renderWorkspace(actor);
    fireEvent.click(
      await screen.findByRole('button', { name: 'CERT-STAGE-TIMELINE' }),
    );
    expect(
      await screen.findByText(
        'This read failed. Refresh before treating this page as current.',
      ),
    ).toBeVisible();
  });

  it('retires the Case and rechecks authority when the auditor grant is refused', async () => {
    const actor = certificationActor({ manager: false, auditor: true });
    // The server no longer captures the auditor grant.
    const server = new FakeCertificationServer({
      actor: () => certificationActor({ manager: false }),
    });
    const caseId = server.seedApprovedTeam({
      orderReference: 'CERT-STAGE-DENIED',
      leader: certificationIds.member,
    });
    planStage1(server, caseId);
    server.attachAsColleague(
      caseId,
      server.addSource('Stage 1 report'),
      'report',
    );
    server.install();
    const onActorRevalidated = vi.fn();
    renderWorkspace(actor, { onActorRevalidated });
    await openSeededCase('CERT-STAGE-DENIED');
    const reportForm = form(STAGE_1, 'Record the Stage 1 report');
    fillStage1Report(reportForm, {
      date: '2026-11-10',
      conclusion: 'Ready for Stage 2',
      note: 'Ready.',
      report: 'Stage 1 report — version 1 (stage-1-report.pdf)',
    });
    confirmDocumentReview(reportForm);
    submit(reportForm, 'Record the Stage 1 report');
    expect(
      await screen.findByText(
        'Certification access is unavailable. Your current authority is being checked.',
      ),
    ).toBeVisible();
    await waitFor(() => expect(onActorRevalidated).toHaveBeenCalledOnce());
    expect(
      screen.queryByRole('heading', {
        name: 'Certification Case CERT-STAGE-DENIED',
      }),
    ).not.toBeInTheDocument();
  });
});
