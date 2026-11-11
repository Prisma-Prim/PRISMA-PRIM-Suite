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
import { useInterfaceLocale } from '../localization/interface-locale';
import { assertMessageCoverage } from '../localization/messages';
import { CertificationWorkspace } from './CertificationWorkspace';
import { consistencyMessages } from './certification-consistency.copy';
import {
  FakeCertificationServer,
  certificationActor,
  certificationIdentity,
  certificationIds,
  dossierReview,
  stage1Report,
  stage2Report,
  stagePlan,
} from './certification.test-fixture';

const REGION = 'Dossier consistency';
const colleague = {
  workspaceMembershipId: certificationIds.colleague,
  displayName: 'Boris Demo',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

/** Switches the interface language the way the shell's language menu does. */
function LocaleSwitch() {
  const { changeLocale } = useInterfaceLocale();
  return (
    <>
      {(['fr', 'ro', 'ru'] as const).map((locale) => (
        <button key={locale} type="button" onClick={() => changeLocale(locale)}>
          {`Locale ${locale}`}
        </button>
      ))}
    </>
  );
}

function renderWorkspace(actor: ActorContext) {
  return render(
    <>
      <LocaleSwitch />
      <CertificationWorkspace
        actor={actor}
        identity={certificationIdentity}
        projectId={certificationIds.project}
      />
    </>,
  );
}

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

async function openSeededCase(reference: string) {
  fireEvent.click(await screen.findByRole('button', { name: reference }));
  return screen.findByRole('heading', {
    name: `Certification Case ${reference}`,
  });
}

function region() {
  return screen.getByRole('region', { name: REGION });
}

function change(element: HTMLElement, value: string) {
  fireEvent.change(element, { target: { value } });
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

/** A rule Discrepancy as the server's Case read shows it. */
function ruleDiscrepancy(
  rule: 'R01' | 'R04' | 'R08',
  overrides: Record<string, unknown> = {},
) {
  const shapes = {
    R01: {
      subject: { kind: 'duration_proposal' },
      verdict: 'error',
      blocks: 'decision',
      left: {
        value: { kind: 'days', days: '3.5' },
        detail: null,
        source: {
          kind: 'step',
          step: 'application',
          version: 2,
          versionId: 'application-2',
          attachment: null,
        },
      },
      right: {
        value: { kind: 'days', days: '3' },
        detail: null,
        source: {
          kind: 'step',
          step: 'duration',
          version: 1,
          versionId: 'duration-1',
          attachment: null,
        },
      },
    },
    R04: {
      subject: { kind: 'stage_capacity', stage: 'stage_2' },
      verdict: 'to_clarify',
      blocks: null,
      left: {
        value: { kind: 'days', days: '2' },
        detail: null,
        source: {
          kind: 'step',
          step: 'stage_2_plan',
          version: 1,
          versionId: 'plan-2',
          attachment: {
            attachmentId: 'plan-attachment',
            documentId: 'plan-document',
            versionId: 'plan-version',
            versionNumber: 1,
            sourceTitle: 'Stage 2 audit plan',
          },
        },
      },
      right: {
        value: { kind: 'capacity', calendarDays: 1, auditors: 1 },
        detail: null,
        source: null,
      },
    },
    R08: {
      subject: { kind: 'dossier_item', item: 'certificate_data' },
      verdict: 'critical',
      blocks: 'decision',
      left: {
        value: { kind: 'state', state: 'present' },
        detail: null,
        source: null,
      },
      right: {
        value: { kind: 'state', state: 'not_recorded' },
        detail: null,
        source: null,
      },
    },
  } as const;
  return {
    id: `${rule}:${rule === 'R01' ? 'a' : rule === 'R04' ? 'b' : 'c'}${'0'.repeat(31)}`,
    origin: 'rule',
    rule,
    ...shapes[rule],
    openedRevision: 5,
    opened: { by: colleague, at: '2026-11-07T08:05:00.000Z' },
    endedRevision: null,
    status: 'open',
    resolution: null,
    ...overrides,
  };
}

function seededCase(
  server: FakeCertificationServer,
  reference: string,
  rules: ('R01' | 'R04' | 'R08')[],
) {
  const caseId = server.seed({ orderReference: reference, duration: true });
  for (const rule of rules)
    server.seedDiscrepancy(caseId, ruleDiscrepancy(rule));
  return caseId;
}

/**
 * A Case with both Stages reported and a grant recommended, whose team
 * leaves the approver independent; the dossier is not yet reviewed.
 */
function recommendedCase(server: FakeCertificationServer, reference: string) {
  const caseId = server.seedApprovedTeam({
    orderReference: reference,
    leader: null,
  });
  for (const [step, value] of [
    ['stage_1_plan', stagePlan],
    ['stage_1_report', stage1Report],
    ['stage_2_plan', stagePlan],
    ['stage_2_report', stage2Report],
  ] as const) {
    const attachment = server.attachAsColleague(
      caseId,
      server.addSource(`Fictional ${step}`),
      step.endsWith('plan') ? 'plan' : 'report',
    );
    server.recordStageAsColleague(
      caseId,
      step,
      step === 'stage_2_plan'
        ? stagePlan(attachment, {
            startDate: '2026-11-20',
            endDate: '2026-11-21',
            onSiteDays: '2',
          })
        : value(attachment),
    );
  }
  server.recordStepAsColleague(caseId, 'recommendation', {
    recommendation: 'grant',
    basis: 'Fictional basis.',
  });
  return caseId;
}

describe('Dossier consistency region', () => {
  it('shows the counts per verdict, both values with their sources and the act each Discrepancy blocks, or the empty state', async () => {
    const { server, actor } = serve({ manager: true });
    seededCase(server, 'CERT-CONSISTENCY', ['R01', 'R04']);
    server.seed({ orderReference: 'CERT-CLEAN', duration: true });
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-CONSISTENCY');
    const panel = region();
    expect(
      within(
        within(panel).getByRole('list', {
          name: 'Open Discrepancies by verdict',
        }),
      )
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['⛔ Critical: 0', '⚠ Error: 1', 'ℹ To clarify: 1']);
    expect(
      within(panel).getByText('Rule set dossier-consistency-2026-11'),
    ).toBeVisible();
    const r01 = within(panel).getByRole('listitem', {
      name: /^R01 — Audit duration against the current application/u,
    });
    expect(r01).toHaveTextContent('Compared');
    expect(r01).toHaveTextContent('Duration proposal');
    expect(r01).toHaveTextContent('3.5 auditor-days');
    expect(r01).toHaveTextContent('Source: Application, version 2');
    expect(r01).toHaveTextContent('3 auditor-days');
    expect(r01).toHaveTextContent('Source: Audit duration, version 1');
    expect(r01).toHaveTextContent('Blocks the Certification Decision.');
    expect(r01).toHaveTextContent('Open since Case revision 5 (Boris Demo,');
    const r04 = within(panel).getByRole('listitem', { name: /^R04 — / });
    expect(r04).toHaveTextContent('1 calendar day(s) × 1 auditor(s) on site');
    expect(r04).toHaveTextContent(
      'Source: Stage 2 plan, version 1 — Stage 2 audit plan, version 1',
    );
    expect(r04).toHaveTextContent('Blocks nothing; to clarify.');

    fireEvent.click(
      screen.getByRole('button', { name: 'Back to Certification Cases' }),
    );
    await openSeededCase('CERT-CLEAN');
    expect(
      within(region()).getByText(
        'No Discrepancy found by rule set dossier-consistency-2026-11.',
      ),
    ).toBeVisible();
  });

  it('lets the programme manager accept a Discrepancy to clarify with a reason and keeps it resolved after a reload', async () => {
    const { server, actor } = serve({ manager: true });
    const caseId = seededCase(server, 'CERT-ACCEPT', ['R04']);
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-ACCEPT');
    const r04 = within(region()).getByRole('listitem', { name: /^R04 — / });
    fireEvent.click(
      within(r04).getByRole('button', { name: 'Accept this Discrepancy' }),
    );
    const form = within(r04).getByRole('form', {
      name: 'Accept the Discrepancy',
    });
    fireEvent.click(
      within(form).getByRole('button', { name: 'Record the acceptance' }),
    );
    expect(
      await within(form).findByText(
        'State the reason (at most 2,000 characters).',
      ),
    ).toBeVisible();
    expect(server.mutations()).toHaveLength(0);
    change(
      within(form).getByLabelText('Reason'),
      'Fictional long audit day agreed with the client.',
    );
    fireEvent.click(
      within(form).getByRole('button', { name: 'Record the acceptance' }),
    );
    const resolved = () =>
      within(region()).getByRole('listitem', { name: /^R04 — / });
    await waitFor(() =>
      expect(resolved()).toHaveTextContent(
        'Reason: Fictional long audit day agreed with the client.',
      ),
    );
    expect(resolved()).toHaveTextContent('Accepted — Ana Demo,');
    expect(server.mutations()[0]?.body).toEqual({
      expectedRevision: 4,
      discrepancyId: ruleDiscrepancy('R04').id,
      resolution: 'accepted',
      reason: 'Fictional long audit day agreed with the client.',
    });
    expect(server.mutations()[0]?.path).toBe(
      `/api/certification-cases/${caseId}/discrepancy-resolutions`,
    );
    expect(within(region()).getByText('No Discrepancy is open.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Reload Case' }));
    await waitFor(() =>
      expect(
        within(region()).getByRole('heading', {
          name: 'Resolved Discrepancies',
        }),
      ).toBeVisible(),
    );
    expect(
      within(region()).getByRole('listitem', { name: /^R04 — / }),
    ).toHaveTextContent('Reason: Fictional long audit day agreed');
  });

  it('offers an error only to an approver outside the team and never the acceptance of a critical Discrepancy', async () => {
    const manager = serve({ manager: true });
    seededCase(manager.server, 'CERT-ERROR', ['R01', 'R08']);
    manager.server.install();
    const { unmount } = renderWorkspace(manager.actor);
    await openSeededCase('CERT-ERROR');
    const r01 = within(region()).getByRole('listitem', { name: /^R01 — / });
    expect(within(r01).queryByRole('button')).toBeNull();
    expect(r01).toHaveTextContent(
      'Only a certification approver outside the audit team accepts an error.',
    );
    const r08 = within(region()).getByRole('listitem', { name: /^R08 — / });
    expect(within(r08).queryByRole('button')).toBeNull();
    expect(r08).toHaveTextContent(
      'Only a correction of the records resolves a critical Discrepancy.',
    );
    expect(r08).toHaveTextContent('Dossier item: Certificate data');
    expect(r08).toHaveTextContent('answered present');
    expect(r08).toHaveTextContent('not recorded');
    unmount();
    vi.unstubAllGlobals();

    const approver = serve({ manager: false, approver: true });
    seededCase(approver.server, 'CERT-ERROR', ['R01', 'R08']);
    approver.server.install();
    renderWorkspace(approver.actor);
    await openSeededCase('CERT-ERROR');
    const offered = within(region()).getByRole('listitem', {
      name: /^R01 — /,
    });
    fireEvent.click(
      within(offered).getByRole('button', { name: 'Accept this Discrepancy' }),
    );
    change(
      within(offered).getByLabelText('Reason'),
      'Fictional: the certification body keeps 3 auditor-days.',
    );
    fireEvent.click(
      within(offered).getByRole('button', { name: 'Record the acceptance' }),
    );
    await waitFor(() =>
      expect(
        within(region())
          .getAllByRole('listitem', { name: /^R01 — / })
          .at(0),
      ).toHaveTextContent('Reason: Fictional: the certification body keeps'),
    );
    expect(
      within(
        within(region()).getByRole('listitem', { name: /^R08 — / }),
      ).queryByRole('button'),
    ).toBeNull();
  });

  it('lets the auditor on the team record a manual Discrepancy and the programme manager close it as corrected', async () => {
    const auditorActor = certificationActor({ manager: false, auditor: true });
    const managerActor = certificationActor({ manager: true });
    // One server; the member acting changes between the two sessions.
    let acting = auditorActor;
    const server = new FakeCertificationServer({ actor: () => acting });
    const caseId = server.seedApprovedTeam({
      orderReference: 'CERT-MANUAL',
      leader: certificationIds.member,
    });
    const draft = server.attachAsColleague(
      caseId,
      server.addSource('Editable Stage 2 report draft'),
      'other',
    );
    server.attachAsColleague(
      caseId,
      server.addSource('Signed Stage 2 report'),
      'report',
    );
    server.install();
    const { unmount } = renderWorkspace(auditorActor);
    await openSeededCase('CERT-MANUAL');
    fireEvent.click(
      within(region()).getByRole('button', {
        name: 'Record a manual Discrepancy',
      }),
    );
    const form = within(region()).getByRole('form', {
      name: 'Manual Discrepancy',
    });
    fireEvent.click(
      within(form).getByRole('button', {
        name: 'Record the manual Discrepancy',
      }),
    );
    expect(
      await within(form).findByText(/State the compared fields/u),
    ).toBeVisible();
    change(within(form).getByLabelText('Compared fields'), 'Stage type');
    fireEvent.click(within(form).getByRole('radio', { name: 'To clarify' }));
    const first = within(form).getByRole('group', {
      name: 'First stated value',
    });
    change(within(first).getByLabelText('Stated value'), 'Stage 1');
    selectOptionByLabel(
      within(first).getByLabelText('Document Version'),
      'Editable Stage 2 report draft, version 1',
    );
    change(
      within(first).getByLabelText('Location, for example a page'),
      'page 1',
    );
    const second = within(form).getByRole('group', {
      name: 'Second stated value',
    });
    change(within(second).getByLabelText('Stated value'), 'Stage 2');
    selectOptionByLabel(
      within(second).getByLabelText('Document Version'),
      'Signed Stage 2 report, version 1',
    );
    fireEvent.click(
      within(form).getByRole('button', {
        name: 'Record the manual Discrepancy',
      }),
    );
    const manual = await within(region()).findByRole('listitem', {
      name: /^Manual Discrepancy 1: Stage type/u,
    });
    expect(manual).toHaveTextContent('Stage 1 (page 1)');
    expect(manual).toHaveTextContent(
      'Source: Editable Stage 2 report draft, version 1',
    );
    expect(server.mutations().at(-1)?.body).toEqual({
      expectedRevision: 10,
      verdict: 'to_clarify',
      subject: 'Stage type',
      left: { value: 'Stage 1', attachmentId: draft, location: 'page 1' },
      right: {
        value: 'Stage 2',
        attachmentId: expect.any(String),
        location: null,
      },
      note: null,
    });
    // The auditor may record it but not resolve it.
    expect(within(manual).queryByRole('button')).toBeNull();
    unmount();

    acting = managerActor;
    renderWorkspace(managerActor);
    await openSeededCase('CERT-MANUAL');
    const listed = within(region()).getByRole('listitem', {
      name: /^Manual Discrepancy 1/u,
    });
    fireEvent.click(
      within(listed).getByRole('button', { name: 'Resolve as corrected' }),
    );
    const correction = within(listed).getByRole('form', {
      name: 'Close the manual Discrepancy as corrected',
    });
    change(
      within(correction).getByLabelText('Reason'),
      'The signed report states Stage 2.',
    );
    fireEvent.click(
      within(correction).getByRole('button', { name: 'Record the correction' }),
    );
    expect(
      await within(correction).findByText(
        'Select the record version or Document Version that corrects it, and state the reason.',
      ),
    ).toBeVisible();
    selectOptionByLabel(
      within(correction).getByLabelText(
        'Correcting record version or Document Version',
      ),
      'Signed Stage 2 report, version 1',
    );
    fireEvent.click(
      within(correction).getByRole('button', { name: 'Record the correction' }),
    );
    await waitFor(() =>
      expect(
        within(region()).getByRole('listitem', {
          name: /^Manual Discrepancy 1/u,
        }),
      ).toHaveTextContent(
        'Closed as corrected; correction: Signed Stage 2 report, version 1',
      ),
    );
  });

  it('retries an uncertain acceptance with the same key and waits for a reload when the Case changed', async () => {
    const { server, actor } = serve({ manager: true });
    seededCase(server, 'CERT-RETRY', ['R04']);
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-RETRY');
    const r04 = within(region()).getByRole('listitem', { name: /^R04 — / });
    fireEvent.click(
      within(r04).getByRole('button', { name: 'Accept this Discrepancy' }),
    );
    change(within(r04).getByLabelText('Reason'), 'Fictional reason.');
    server.interceptions.push({
      match: (request) => request.path.endsWith('/discrepancy-resolutions'),
      respond: () => Promise.reject(new TypeError('Network down')),
    });
    fireEvent.click(
      within(r04).getByRole('button', { name: 'Record the acceptance' }),
    );
    const retry = await within(r04).findByRole('button', {
      name: 'Retry unchanged save',
    });
    const firstKey = server.requests.at(-1)?.key;
    server.interceptions.push({
      match: (request) => request.path.endsWith('/discrepancy-resolutions'),
      respond: () => Response.json({ code: 'STALE_VERSION' }, { status: 409 }),
    });
    fireEvent.click(retry);
    expect(await within(region()).findByRole('alert')).toHaveTextContent(
      /reload/iu,
    );
    expect(server.requests.at(-1)?.key).toBe(firstKey);
    // Saving waits for the reload.
    const count = server.requests.length;
    fireEvent.click(
      within(r04).getByRole('button', { name: 'Record the acceptance' }),
    );
    expect(server.requests).toHaveLength(count);
  });

  it('marks only the blank reason of an acceptance invalid, and no field after a stale refusal', async () => {
    const { server, actor } = serve({ manager: true });
    seededCase(server, 'CERT-ACCEPT-FIELDS', ['R04']);
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-ACCEPT-FIELDS');
    const r04 = within(region()).getByRole('listitem', { name: /^R04 — / });
    fireEvent.click(
      within(r04).getByRole('button', { name: 'Accept this Discrepancy' }),
    );
    const form = within(r04).getByRole('form', {
      name: 'Accept the Discrepancy',
    });
    fireEvent.click(
      within(form).getByRole('button', { name: 'Record the acceptance' }),
    );
    expect(
      await within(form).findByText(
        'State the reason (at most 2,000 characters).',
      ),
    ).toBeVisible();
    expect(invalidFields(form)).toEqual(['Reason']);

    change(within(form).getByLabelText('Reason'), 'Fictional reason.');
    server.interceptions.push({
      match: (request) => request.path.endsWith('/discrepancy-resolutions'),
      respond: () => Response.json({ code: 'STALE_VERSION' }, { status: 409 }),
    });
    fireEvent.click(
      within(form).getByRole('button', { name: 'Record the acceptance' }),
    );
    expect(await within(region()).findByRole('alert')).toHaveTextContent(
      /reload/iu,
    );
    expect(invalidFields(form)).toEqual([]);
  });

  it('marks only the document left unchosen of a manual Discrepancy invalid, and no field after a stale refusal', async () => {
    const { server, actor } = serve({ manager: false, auditor: true });
    const caseId = server.seedApprovedTeam({
      orderReference: 'CERT-MANUAL-FIELDS',
      leader: certificationIds.member,
    });
    server.attachAsColleague(
      caseId,
      server.addSource('Editable Stage 2 report draft'),
      'other',
    );
    server.attachAsColleague(
      caseId,
      server.addSource('Signed Stage 2 report'),
      'report',
    );
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-MANUAL-FIELDS');
    fireEvent.click(
      within(region()).getByRole('button', {
        name: 'Record a manual Discrepancy',
      }),
    );
    const form = within(region()).getByRole('form', {
      name: 'Manual Discrepancy',
    });
    change(within(form).getByLabelText('Compared fields'), 'Stage type');
    fireEvent.click(within(form).getByRole('radio', { name: 'To clarify' }));
    const first = within(form).getByRole('group', {
      name: 'First stated value',
    });
    change(within(first).getByLabelText('Stated value'), 'Stage 1');
    selectOptionByLabel(
      within(first).getByLabelText('Document Version'),
      'Editable Stage 2 report draft, version 1',
    );
    const second = within(form).getByRole('group', {
      name: 'Second stated value',
    });
    change(within(second).getByLabelText('Stated value'), 'Stage 2');
    const record = () =>
      fireEvent.click(
        within(form).getByRole('button', {
          name: 'Record the manual Discrepancy',
        }),
      );
    record();
    expect(
      await within(form).findByText(/State the compared fields/u),
    ).toBeVisible();
    // The optional, empty locations and note stay valid.
    expect(invalidFields(form)).toEqual(['Document Version']);
    expect(invalidFields(second)).toEqual(['Document Version']);

    selectOptionByLabel(
      within(second).getByLabelText('Document Version'),
      'Signed Stage 2 report, version 1',
    );
    server.interceptions.push({
      match: (request) => request.path.endsWith('/discrepancies'),
      respond: () => Response.json({ code: 'STALE_VERSION' }, { status: 409 }),
    });
    record();
    expect(await within(region()).findByRole('alert')).toHaveTextContent(
      /reload/iu,
    );
    expect(invalidFields(form)).toEqual([]);
  });

  it('shows the reader the region without any command, and names the blocking Discrepancies among the decision preconditions', async () => {
    const reader = serve({ manager: false });
    seededCase(reader.server, 'CERT-READER', ['R01', 'R04']);
    reader.server.install();
    const { unmount } = renderWorkspace(reader.actor);
    await openSeededCase('CERT-READER');
    expect(within(region()).queryAllByRole('button')).toEqual([]);
    expect(within(region()).queryAllByRole('form')).toEqual([]);
    expect(
      within(region()).getByRole('listitem', { name: /^R01 — / }),
    ).toBeVisible();
    unmount();
    vi.unstubAllGlobals();

    const approver = serve({ manager: false, approver: true });
    const caseId = recommendedCase(approver.server, 'CERT-GATE');
    approver.server.recordStepAsColleague(
      caseId,
      'dossier_review',
      dossierReview(),
    );
    approver.server.seedDiscrepancy(caseId, ruleDiscrepancy('R01'));
    approver.server.install();
    renderWorkspace(approver.actor);
    await openSeededCase('CERT-GATE');
    const decision = screen.getByRole('region', {
      name: 'Certification Decision',
    });
    expect(
      within(decision).getByRole('list', {
        name: 'Unmet decision preconditions',
      }),
    ).toHaveTextContent(
      'A critical Discrepancy or an unaccepted error is open in the dossier consistency.',
    );
    expect(
      within(decision).getByRole('list', { name: 'Open Discrepancies' }),
    ).toHaveTextContent('R01 — Audit duration against the current application');
  });

  it('shows the unmet decision preconditions and the blocking Discrepancies once after a blocked submit, and announces them', async () => {
    const intro =
      'The Certification Decision cannot be recorded until these preconditions hold:';
    const { server, actor } = serve({ manager: false, approver: true });
    const caseId = recommendedCase(server, 'CERT-BLOCKED');
    server.seedDiscrepancy(caseId, ruleDiscrepancy('R01'));
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-BLOCKED');
    const decision = screen.getByRole('region', {
      name: 'Certification Decision',
    });
    const decisionForm = within(decision).getByRole('form', {
      name: 'Record the Certification Decision',
    });
    fireEvent.click(
      within(decisionForm).getByRole('radio', {
        name: 'Certification refused',
      }),
    );
    change(within(decisionForm).getByLabelText('Decision date'), '2026-11-06');
    change(
      within(decisionForm).getByLabelText('Decision maker'),
      'Decision Maker Demo',
    );
    change(
      within(decisionForm).getByLabelText('Function of the decision maker'),
      'Head of the certification body',
    );
    change(
      within(decisionForm).getByLabelText('Rationale'),
      'Fictional rationale.',
    );
    fireEvent.click(
      within(decisionForm).getByRole('checkbox', {
        name: 'I attest that the decision maker is not a member of the audit team.',
      }),
    );
    fireEvent.click(
      within(decisionForm).getByRole('button', { name: 'Record the decision' }),
    );

    // One sentence, one list of preconditions and one list of Discrepancies,
    // all in the announced alert.
    const blocked = await within(decision).findByRole('alert');
    expect(within(decision).getAllByText(intro)).toEqual([
      within(blocked).getByText(intro),
    ]);
    const lists = (name: string) =>
      within(decision).getAllByRole('list', { name });
    expect(lists('Unmet decision preconditions')).toEqual([
      within(blocked).getByRole('list', {
        name: 'Unmet decision preconditions',
      }),
    ]);
    expect(
      within(blocked)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'The dossier review is not recorded, or it lists a missing item.',
      'A critical Discrepancy or an unaccepted error is open in the dossier consistency.',
      'R01 — Audit duration against the current application',
    ]);
    expect(lists('Open Discrepancies')).toEqual([
      within(blocked).getByRole('list', { name: 'Open Discrepancies' }),
    ]);
    expect(server.mutations()).toEqual([]);

    // An edit answers the alert; the standing notice lists them once again.
    change(
      within(decisionForm).getByLabelText('Rationale'),
      'Fictional rationale, revised.',
    );
    expect(within(decision).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(decision).getAllByText(intro)).toHaveLength(1);
    expect(lists('Unmet decision preconditions')).toHaveLength(1);
    expect(lists('Open Discrepancies')).toHaveLength(1);
  });

  it('is available in Romanian, Russian, French and English', async () => {
    expect(() =>
      assertMessageCoverage('consistency', consistencyMessages),
    ).not.toThrow();
    const { server, actor } = serve({ manager: true });
    seededCase(server, 'CERT-LOCALE', ['R04']);
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-LOCALE');
    for (const [locale, title, verdict] of [
      ['fr', 'Cohérence du dossier', 'À clarifier'],
      ['ro', 'Coerența dosarului', 'De clarificat'],
      ['ru', 'Согласованность досье', 'Требует уточнения'],
    ] as const) {
      fireEvent.click(screen.getByRole('button', { name: `Locale ${locale}` }));
      const panel = await screen.findByRole('region', { name: title });
      expect(within(panel).getAllByText(verdict).length).toBeGreaterThan(0);
    }
  });
});
