import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from '../test/render-with-interface-locale';
import { useInterfaceLocale } from '../localization/interface-locale';
import { assertMessageCoverage } from '../localization/messages';
import { releaseMessages } from './certification-release.copy';
import { CertificationWorkspace } from './CertificationWorkspace';
import {
  FakeCertificationServer,
  CERTIFICATE_TEXTS,
  certificationDecision,
  dossierReview,
  stagePlan,
  stage1Report,
  stage2Report,
  certificationActor,
  certificationIdentity,
  certificationIds,
} from './certification.test-fixture';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function grantedCase(server: FakeCertificationServer, reference: string) {
  const caseId = server.seedApprovedTeam({
    orderReference: reference,
    leader: certificationIds.colleague,
  });
  const attach = (role: string, title: string) =>
    server.attachAsColleague(caseId, server.addSource(title), role);
  server.recordStageAsColleague(
    caseId,
    'stage_1_plan',
    stagePlan(attach('plan', 'Stage 1 plan')),
  );
  server.recordStageAsColleague(
    caseId,
    'stage_1_report',
    stage1Report(attach('report', 'Stage 1 report')),
  );
  server.recordStageAsColleague(
    caseId,
    'stage_2_plan',
    stagePlan(attach('plan', 'Stage 2 plan'), {
      startDate: '2026-11-04',
      endDate: '2026-11-05',
      onSiteDays: '2',
    }),
  );
  server.recordStageAsColleague(
    caseId,
    'stage_2_report',
    stage2Report(attach('report', 'Stage 2 report')),
  );
  server.recordStepAsColleague(caseId, 'recommendation', {
    recommendation: 'grant',
    basis: 'Fictional recommendation.',
  });
  server.recordStepAsColleague(caseId, 'certificate_data', {
    texts: CERTIFICATE_TEXTS,
    agreedOn: '2026-11-05',
    agreementAttachmentId: attach(
      'certificate_data',
      'Signed Certificate data',
    ),
  });
  server.recordStepAsColleague(caseId, 'dossier_review', dossierReview());
  server.recordStepAsColleague(caseId, 'decision', certificationDecision());
  return {
    caseId,
    draftPdf: attach('certificate_draft', 'Certificate draft'),
    issuedPdf: attach('certificate', 'Issued Certificate'),
  };
}
function LocaleSwitch() {
  const { changeLocale } = useInterfaceLocale();
  return (
    <>
      {(['fr', 'ro', 'ru', 'en'] as const).map((locale) => (
        <button
          key={locale}
          onClick={() => changeLocale(locale)}
        >{`Locale ${locale}`}</button>
      ))}
    </>
  );
}
function set(container: HTMLElement, label: string, value: string) {
  fireEvent.change(within(container).getByLabelText(label, { exact: true }), {
    target: { value },
  });
}
function releaseRegion() {
  return screen.getByRole('region', { name: 'Certificate release' });
}

describe('Certificate release region', () => {
  it('shows all five release steps to a reader without commands', async () => {
    const actor = certificationActor({ manager: false });
    const server = new FakeCertificationServer({ actor: () => actor });
    server.seedApprovedTeam({
      orderReference: 'CERT-RELEASE-READER',
      leader: certificationIds.colleague,
    });
    server.install();
    render(
      <CertificationWorkspace
        actor={actor}
        identity={certificationIdentity}
        projectId={certificationIds.project}
      />,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'CERT-RELEASE-READER' }),
    );
    const region = await screen.findByRole('region', {
      name: 'Certificate release',
    });
    expect(
      within(region)
        .getAllByRole('heading')
        .slice(1)
        .map((heading) => heading.textContent),
    ).toEqual([
      'Draft',
      'Client opinion',
      'Approval',
      'Issuance',
      'Transmission',
    ]);
    expect(
      within(region).getByText('No Certificate draft is recorded.'),
    ).toBeVisible();
    expect(within(region).queryByRole('form')).not.toBeInTheDocument();
    expect(within(region).queryByRole('button')).not.toBeInTheDocument();
  });
  it('records an exact draft and its skip, requires explicit approval confirmations, and then offers issuance', async () => {
    const actor = certificationActor({ manager: true, approver: true });
    const server = new FakeCertificationServer({ actor: () => actor });
    const { draftPdf } = grantedCase(server, 'CERT-RELEASE-FLOW');
    server.install();
    render(
      <CertificationWorkspace
        actor={actor}
        identity={certificationIdentity}
        projectId={certificationIds.project}
      />,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'CERT-RELEASE-FLOW' }),
    );
    const draft = await screen.findByRole('form', {
      name: 'Record a Certificate draft',
    });
    set(draft, 'Certificate draft PDF', draftPdf);
    set(draft, 'Certificate number shown on the draft', 'DEMO-0001');
    set(draft, 'Draft date', '2026-11-06');
    fireEvent.click(
      within(draft).getByRole('button', { name: 'Record a Certificate draft' }),
    );
    const opinion = await screen.findByRole('form', {
      name: 'Record the client opinion or skip',
    });
    set(opinion, 'Opinion or skip date', '2026-11-06');
    set(opinion, 'Client opinion outcome', 'skipped');
    set(opinion, 'Reason for skipping the opinion', 'texts_already_agreed');
    fireEvent.click(
      within(opinion).getByRole('button', {
        name: 'Record the client opinion or skip',
      }),
    );
    const approval = await screen.findByRole('form', {
      name: 'Approve the Certificate draft',
    });
    expect(
      within(approval).queryAllByRole('checkbox', { checked: true }),
    ).toEqual([]);
    set(approval, 'Draft approval date', '2026-11-06');
    fireEvent.click(
      within(approval).getByRole('button', {
        name: 'Approve the Certificate draft',
      }),
    );
    expect(await within(approval).findByRole('alert')).toHaveTextContent(
      'Complete the required fields and every explicit confirmation.',
    );
    expect(server.mutations()).toHaveLength(2);
    for (const checkbox of within(approval)
      .getAllByRole('checkbox')
      .slice(0, 4))
      fireEvent.click(checkbox);
    fireEvent.click(
      within(approval).getByRole('button', {
        name: 'Approve the Certificate draft',
      }),
    );
    const issue = await screen.findByRole('form', {
      name: 'Record the issued Certificate',
    });
    expect(within(issue).getByLabelText('Certificate number')).toHaveValue(
      'DEMO-0001',
    );
    expect(within(issue).getByLabelText('Certificate number')).toHaveAttribute(
      'readonly',
    );
    expect(within(issue).getByLabelText('Issue date')).toHaveValue('');
    const requests = server.mutations();
    expect(requests.map((request) => request.path.split('/').at(-1))).toEqual([
      'certificate-draft',
      'client-opinion',
      'certificate-draft-approval',
    ]);
  });

  it('preserves the typed draft across a stale refusal and reload, and reuses the same key for an uncertain retry', async () => {
    const actor = certificationActor({ manager: true });
    const server = new FakeCertificationServer({ actor: () => actor });
    const { draftPdf } = grantedCase(server, 'CERT-RELEASE-RETRY');
    server.install();
    render(
      <CertificationWorkspace
        actor={actor}
        identity={certificationIdentity}
        projectId={certificationIds.project}
      />,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'CERT-RELEASE-RETRY' }),
    );
    let draft = await screen.findByRole('form', {
      name: 'Record a Certificate draft',
    });
    set(draft, 'Certificate draft PDF', draftPdf);
    set(draft, 'Certificate number shown on the draft', 'DEMO-0001');
    set(draft, 'Draft date', '2026-11-06');
    server.interceptions.push({
      match: (request) => request.path.endsWith('/certificate-draft'),
      respond: () => Response.json({ code: 'STALE_VERSION' }, { status: 409 }),
    });
    fireEvent.click(
      within(draft).getByRole('button', { name: 'Record a Certificate draft' }),
    );
    expect(await within(draft).findByRole('alert')).toHaveTextContent(
      'Reload it before saving; your draft is kept.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reload Case' }));
    draft = await screen.findByRole('form', {
      name: 'Record a Certificate draft',
    });
    expect(
      within(draft).getByLabelText('Certificate number shown on the draft'),
    ).toHaveValue('DEMO-0001');
    server.interceptions.push({
      match: (request) => request.path.endsWith('/certificate-draft'),
      respond: () => Promise.reject(new TypeError('Fictional transport loss')),
    });
    fireEvent.click(
      within(draft).getByRole('button', { name: 'Record a Certificate draft' }),
    );
    const retry = await within(releaseRegion()).findByRole('button', {
      name: 'Retry unchanged save',
    });
    fireEvent.click(retry);
    await waitFor(() =>
      expect(within(releaseRegion()).getByText(/DEMO-0001 ·/u)).toBeVisible(),
    );
    const posts = server.requests.filter((request) =>
      request.path.endsWith('/certificate-draft'),
    );
    expect(posts[1]?.key).toBe(posts[2]?.key);
    expect(posts[1]?.body).toEqual(posts[2]?.body);
  });

  it('localizes the five-step reader region in Romanian, Russian, French and English', async () => {
    assertMessageCoverage('certificate release', releaseMessages);
    const actor = certificationActor({ manager: false });
    const server = new FakeCertificationServer({ actor: () => actor });
    server.seedApprovedTeam({
      orderReference: 'CERT-RELEASE-LOCALES',
      leader: certificationIds.colleague,
    });
    server.install();
    render(
      <>
        <LocaleSwitch />
        <CertificationWorkspace
          actor={actor}
          identity={certificationIdentity}
          projectId={certificationIds.project}
        />
      </>,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'CERT-RELEASE-LOCALES' }),
    );
    for (const [locale, title] of [
      ['ro', 'Eliberarea certificatului'],
      ['ru', 'Выпуск сертификата'],
      ['fr', 'Émission du certificat'],
      ['en', 'Certificate release'],
    ]) {
      fireEvent.click(screen.getByRole('button', { name: `Locale ${locale}` }));
      const region = await screen.findByRole('region', { name: title });
      expect(within(region).queryByRole('form')).not.toBeInTheDocument();
      expect(within(region).queryByRole('button')).not.toBeInTheDocument();
      expect(within(region).getAllByRole('heading')).toHaveLength(6);
    }
  });
  it('never rebinds an edited PDF draft to a newer Certificate data version after reload', async () => {
    const actor = certificationActor({ manager: true });
    const server = new FakeCertificationServer({ actor: () => actor });
    const { caseId, draftPdf } = grantedCase(server, 'CERT-RELEASE-BOUND');
    server.install();
    render(
      <CertificationWorkspace
        actor={actor}
        identity={certificationIdentity}
        projectId={certificationIds.project}
      />,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'CERT-RELEASE-BOUND' }),
    );
    let form = await screen.findByRole('form', {
      name: 'Record a Certificate draft',
    });
    set(form, 'Certificate draft PDF', draftPdf);
    set(form, 'Certificate number shown on the draft', 'DEMO-0001');
    set(form, 'Draft date', '2026-11-06');
    const data = server.cases
      .get(caseId)
      ?.steps.filter((entry) => entry.step === 'certificate_data')
      .at(-1);
    if (!data) throw new Error('Expected the original Certificate data.');
    server.recordStepAsColleague(
      caseId,
      'certificate_data',
      data.value,
      'Reaffirmed the agreed texts.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reload Case' }));
    form = await screen.findByRole('form', {
      name: 'Record a Certificate draft',
    });
    expect(
      within(form).getByLabelText('Certificate number shown on the draft'),
    ).toHaveValue('DEMO-0001');
    expect(
      within(form).getByRole('button', { name: 'Record a Certificate draft' }),
    ).toBeDisabled();
    fireEvent.click(
      within(form).getByRole('button', {
        name: 'Start again for the current decision and draft',
      }),
    );
    expect(
      within(form).getByLabelText('Certificate number shown on the draft'),
    ).toHaveValue('');
    expect(server.mutations()).toEqual([]);
  });
  it('requires a fresh same-day approval after a corrected client opinion and never rebinds old confirmations', async () => {
    const actor = certificationActor({ manager: true, approver: true });
    const server = new FakeCertificationServer({ actor: () => actor });
    const { caseId, draftPdf } = grantedCase(server, 'CERT-OPINION-REAPPROVE');
    const stored = server.cases.get(caseId);
    if (!stored) throw new Error('Expected the granted Case.');
    const decision = stored.steps
      .filter((entry) => entry.step === 'decision')
      .at(-1);
    const data = stored.steps
      .filter((entry) => entry.step === 'certificate_data')
      .at(-1);
    if (!decision || !data)
      throw new Error('Expected the granted texts and agreed data.');
    server.recordStepAsColleague(caseId, 'certificate_draft', {
      attachmentId: draftPdf,
      number: 'DEMO-0001',
      decisionVersionId: decision.id,
      certificateDataVersionId: data.id,
      draftedOn: '2026-11-06',
    });
    const draft = stored.steps.at(-1);
    if (!draft) throw new Error('Expected the draft.');
    const originalOpinion = {
      draftVersionId: draft.id,
      businessDate: '2026-11-06',
      outcome: 'skipped',
      skipReason: 'no_answer',
      note: null,
    };
    server.recordStepAsColleague(caseId, 'client_opinion', originalOpinion);
    const originalApproval = {
      draftVersionId: draft.id,
      approvedOn: '2026-11-06',
      textsConfirmed: true,
      numberConfirmed: true,
      validityConfirmed: true,
      independenceAttested: true,
      onBehalf: null,
    };
    server.recordStepAsColleague(
      caseId,
      'certificate_draft_approval',
      originalApproval,
    );
    server.install();
    render(
      <CertificationWorkspace
        actor={actor}
        identity={certificationIdentity}
        projectId={certificationIds.project}
      />,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'CERT-OPINION-REAPPROVE' }),
    );
    expect(
      await screen.findByRole('form', {
        name: 'Record the issued Certificate',
      }),
    ).toBeVisible();
    const opinion = screen.getByRole('form', {
      name: 'Record the client opinion or skip',
    });
    set(opinion, 'Opinion or skip date', '2026-11-06');
    set(opinion, 'Client opinion outcome', 'skipped');
    set(opinion, 'Reason for skipping the opinion', 'texts_already_agreed');
    set(
      opinion,
      'Reason for the new version',
      'The client has now confirmed the texts.',
    );
    fireEvent.click(
      within(opinion).getByRole('button', {
        name: 'Record the client opinion or skip',
      }),
    );
    let approval = await screen.findByRole('form', {
      name: 'Approve the Certificate draft',
    });
    expect(
      screen.queryByRole('form', { name: 'Record the issued Certificate' }),
    ).not.toBeInTheDocument();
    expect(
      within(approval).queryAllByRole('checkbox', { checked: true }),
    ).toEqual([]);
    set(approval, 'Draft approval date', '2026-11-06');
    for (const name of [
      'I confirm that this draft states exactly the granted texts in every language.',
      'I confirm that this draft shows the recorded Certificate number.',
      'I confirm that this draft shows the validity computed from the decision date.',
      'I attest that the draft approver is not a member of the audit team.',
    ])
      fireEvent.click(within(approval).getByRole('checkbox', { name }));
    fireEvent.click(
      within(approval).getByRole('button', {
        name: 'Approve the Certificate draft',
      }),
    );
    expect(await within(approval).findByRole('alert')).toHaveTextContent(
      'A new version states its reason.',
    );
    expect(server.mutations()).toHaveLength(1);
    set(
      approval,
      'Reason for the new version',
      'Reviewed the corrected opinion on the same day.',
    );
    server.recordStepAsColleague(
      caseId,
      'client_opinion',
      originalOpinion,
      'Corrected the stated skip reason again.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reload Case' }));
    approval = await screen.findByRole('form', {
      name: 'Approve the Certificate draft',
    });
    expect(within(approval).getByLabelText('Draft approval date')).toHaveValue(
      '2026-11-06',
    );
    expect(
      within(approval).getByLabelText('Reason for the new version'),
    ).toHaveValue('Reviewed the corrected opinion on the same day.');
    expect(
      within(approval).getAllByRole('checkbox', { checked: true }),
    ).toHaveLength(4);
    expect(
      within(approval).getByRole('button', {
        name: 'Approve the Certificate draft',
      }),
    ).toBeDisabled();
    fireEvent.click(
      within(approval).getByRole('button', {
        name: 'Start again for the current decision and draft',
      }),
    );
    expect(
      within(approval).queryAllByRole('checkbox', { checked: true }),
    ).toEqual([]);
    set(approval, 'Draft approval date', '2026-11-06');
    set(
      approval,
      'Reason for the new version',
      'Reviewed the latest opinion on the same day.',
    );
    for (const name of [
      'I confirm that this draft states exactly the granted texts in every language.',
      'I confirm that this draft shows the recorded Certificate number.',
      'I confirm that this draft shows the validity computed from the decision date.',
      'I attest that the draft approver is not a member of the audit team.',
    ])
      fireEvent.click(within(approval).getByRole('checkbox', { name }));
    fireEvent.click(
      within(approval).getByRole('button', {
        name: 'Approve the Certificate draft',
      }),
    );
    expect(
      await screen.findByRole('form', {
        name: 'Record the issued Certificate',
      }),
    ).toBeVisible();
    expect(server.mutations()).toHaveLength(2);
    expect(server.mutations()[1]?.body).toEqual({
      expectedRevision: expect.any(Number),
      ...originalApproval,
      reason: 'Reviewed the latest opinion on the same day.',
    });
  });
});
