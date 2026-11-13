import { useInterfaceLocale } from '../localization/interface-locale';
import { assertMessageCoverage } from '../localization/messages';
import { revisionMessages } from './certification-revisions.copy';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '../test/render-with-interface-locale';
import { selectOptionByLabel } from '../test/select-option';
import { CertificationWorkspace } from './CertificationWorkspace';
import {
  FakeCertificationServer,
  certificationActor,
  certificationIdentity,
  certificationIds,
  CERTIFICATE_TEXTS,
  certificationDecision,
} from './certification.test-fixture';
import {
  seedIssuedCertificationCase,
  recordIssuedCaseCommand,
} from './certification-revisions.test-fixture';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const MARK = 'Does the PDF show the revision index and date?';
const ATTESTATION =
  'I attest that the person revising the Certificate is not a member of the audit team.';
function change(container: HTMLElement, label: string, value: string) {
  fireEvent.change(within(container).getByLabelText(label, { exact: true }), {
    target: { value },
  });
}

describe('Certificate revisions in the Workspace', () => {
  it('requires a deliberate visible-mark answer and records an unmarked revision without changing issuance', async () => {
    const actor = certificationActor({
      manager: true,
      approver: true,
      documents: true,
    });
    const server = new FakeCertificationServer({ actor: () => actor });
    const { attach } = seedIssuedCertificationCase(
      server,
      'CERT-REVISION-UNMARKED',
    );
    const corrected = attach('certificate', 'Corrected Certificate');
    server.install();
    render(
      <CertificationWorkspace
        actor={actor}
        identity={certificationIdentity}
        projectId={certificationIds.project}
      />,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'CERT-REVISION-UNMARKED' }),
    );
    const form = await screen.findByRole('form', {
      name: 'Record a Certificate revision',
    });
    expect(within(form).getByRole('group', { name: MARK })).toBeVisible();
    expect(within(form).queryAllByRole('radio', { checked: true })).toEqual([]);
    expect(
      within(form).queryByLabelText('Certificate number'),
    ).not.toBeInTheDocument();
    change(form, 'Revision date', '2026-11-07');
    change(
      form,
      'Revision reason',
      'Correct a misspelt English city in the PDF.',
    );
    selectOptionByLabel(
      within(form).getByLabelText('Corrected Certificate PDF'),
      'Corrected Certificate — version 1 (corrected-certificate.pdf)',
    );
    fireEvent.click(within(form).getByRole('checkbox', { name: ATTESTATION }));
    fireEvent.click(
      within(form).getByRole('button', { name: 'Record the revision' }),
    );
    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'Answer whether the PDF visibly shows its revision index and date.',
    );
    expect(server.mutations()).toEqual([]);
    fireEvent.click(
      within(form).getByRole('radio', { name: 'No, not marked' }),
    );
    fireEvent.click(
      within(form).getByRole('button', { name: 'Record the revision' }),
    );
    const revisions = await screen.findByRole('region', {
      name: 'Certificate revisions',
    });
    expect(
      await within(revisions).findByText(
        'Revision not marked on the Certificate',
      ),
    ).toBeVisible();
    expect(
      within(revisions).getByRole('heading', { name: 'Revision 1 — Current' }),
    ).toBeVisible();
    expect(
      within(revisions).getByRole('heading', {
        name: 'Issuance 0 — Superseded',
      }),
    ).toBeVisible();
    expect(server.mutations()[0]?.body).toEqual({
      expectedRevision: expect.any(Number),
      reason: 'Correct a misspelt English city in the PDF.',
      revisedOn: '2026-11-07',
      attachmentId: corrected,
      revisionMarked: false,
      independenceAttested: true,
      onBehalf: null,
    });
  });

  it('records the certification body person apart from the recording member and requires a separate independence attestation', async () => {
    const actor = certificationActor({ manager: true, approver: true });
    const server = new FakeCertificationServer({ actor: () => actor });
    const { attach } = seedIssuedCertificationCase(
      server,
      'CERT-REVISION-BODY',
    );
    attach('certificate', 'Corrected Certificate');
    const signed = attach('evidence', 'Signed revision form');
    server.install();
    render(
      <CertificationWorkspace
        actor={actor}
        identity={certificationIdentity}
        projectId={certificationIds.project}
      />,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'CERT-REVISION-BODY' }),
    );
    const form = await screen.findByRole('form', {
      name: 'Record a Certificate revision',
    });
    completeRevision(form, 'Corrected Certificate');
    const acting = within(form).getByRole('group', {
      name: 'Person revising for the certification body',
    });
    fireEvent.click(
      within(acting).getByRole('checkbox', {
        name: 'A person of the certification body performed this act; I record it on their behalf.',
      }),
    );
    change(acting, 'Name of the person who acted', 'Independent Head Demo');
    change(acting, 'Their function', 'Head of the certification body');
    change(acting, 'Date of the act', '2026-11-06');
    selectOptionByLabel(
      within(acting).getByLabelText('Signed form'),
      'Signed revision form — version 1 (signed-revision-form.pdf)',
    );
    fireEvent.click(within(form).getByRole('checkbox', { name: ATTESTATION }));
    fireEvent.click(
      within(form).getByRole('button', { name: 'Record the revision' }),
    );
    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'Confirm that the person revising the Certificate is outside the audit team.',
    );
    expect(server.mutations()).toEqual([]);
    fireEvent.click(within(form).getByRole('checkbox', { name: ATTESTATION }));
    fireEvent.click(
      within(form).getByRole('button', { name: 'Record the revision' }),
    );
    const history = await screen.findByRole('region', {
      name: 'Certificate revisions',
    });
    expect(
      await within(history).findByText(
        /Independent Head Demo — Head of the certification body/u,
      ),
    ).toHaveTextContent(
      'Signed form: Signed revision form — version 1 (signed-revision-form.pdf)',
    );
    expect(within(history).getByText(/Ana Demo/u)).toBeVisible();
    expect(server.mutations()[0]?.body).toMatchObject({
      independenceAttested: true,
      onBehalf: {
        actedBy: 'Independent Head Demo',
        actedByFunction: 'Head of the certification body',
        actedOn: '2026-11-06',
        formAttachmentId: signed,
      },
    });
  });

  it('keeps data-only and matching-decision corrections readable and requires a revision to apply the corrected texts', async () => {
    const actor = certificationActor({
      manager: true,
      approver: true,
      documents: true,
    });
    const server = new FakeCertificationServer({ actor: () => actor });
    const { attach } = seedIssuedCertificationCase(
      server,
      'CERT-REVISION-TEXTS',
    );
    attach('certificate', 'Corrected Certificate');
    server.install();
    render(
      <CertificationWorkspace
        actor={actor}
        identity={certificationIdentity}
        projectId={certificationIds.project}
      />,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'CERT-REVISION-TEXTS' }),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Correct the Certificate data',
      }),
    );
    const data = screen.getByRole('form', {
      name: 'Correct the Certificate data',
    });
    change(
      within(data).getByRole('group', { name: 'Certificate text 2' }),
      'Address',
      '1 Example Street, Corrected City',
    );
    change(data, 'Correction reason', 'Correct the English city.');
    fireEvent.click(
      within(data).getByRole('button', { name: 'Record the Certificate data' }),
    );
    let revisions = await screen.findByRole('region', {
      name: 'Certificate revisions',
    });
    expect(
      await within(revisions).findByText('Revision required'),
    ).toBeVisible();
    expect(
      within(revisions).getByRole('button', { name: 'Record the revision' }),
    ).toBeDisabled();
    expect(
      within(revisions).getByRole('heading', { name: 'Issuance 0 — Current' }),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Correct the decision texts' }),
    );
    const decision = screen.getByRole('form', {
      name: 'Correct the decision texts',
    });
    for (const label of [
      'Decision date',
      'Decision maker',
      'Function of the decision maker',
      'Rationale',
      'Additional information',
      'Signed decision form',
    ])
      expect(
        within(decision).queryByLabelText(label, { exact: true }),
      ).not.toBeInTheDocument();
    change(
      within(decision).getByRole('group', { name: 'Certificate text 2' }),
      'Address',
      '1 Example Street, Corrected City',
    );
    change(
      decision,
      'Correction reason',
      'Align the granted texts with the signed corrected data.',
    );
    fireEvent.click(
      within(decision).getByRole('checkbox', {
        name: 'I attest that the decision maker is not a member of the audit team.',
      }),
    );
    fireEvent.click(
      within(decision).getByRole('button', { name: 'Record the correction' }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('form', { name: 'Correct the decision texts' }),
      ).not.toBeInTheDocument(),
    );
    revisions = screen.getByRole('region', { name: 'Certificate revisions' });
    expect(within(revisions).getByText('Revision required')).toBeVisible();
    expect(
      within(revisions).getByRole('button', { name: 'Record the revision' }),
    ).toBeEnabled();
    const request = server
      .mutations()
      .find((entry) => entry.path.endsWith('/decision'));
    expect(request?.body).toEqual({
      expectedRevision: expect.any(Number),
      reason: 'Align the granted texts with the signed corrected data.',
      ...certificationDecision({
        grantedTexts: CERTIFICATE_TEXTS.map((text) =>
          text.language === 'en'
            ? { ...text, address: '1 Example Street, Corrected City' }
            : text,
        ),
      }),
    });
    const revisionForm = within(revisions).getByRole('form');
    completeRevision(revisionForm, 'Corrected Certificate');
    fireEvent.click(
      within(revisionForm).getByRole('button', { name: 'Record the revision' }),
    );
    revisions = await screen.findByRole('region', {
      name: 'Certificate revisions',
    });
    expect(
      await within(revisions).findByRole('heading', {
        name: 'Revision 1 — Current',
      }),
    ).toBeVisible();
    expect(
      within(revisions).queryByText('Revision required'),
    ).not.toBeInTheDocument();
    expect(
      within(revisions).getByText('1 Example Street, Corrected City'),
    ).toBeVisible();
    expect(
      server.mutations().filter((entry) => entry.path.endsWith('/certificate')),
    ).toEqual([]);
  });

  it.each(['texts', 'pdf'] as const)(
    'requires explicit restart and fresh answers when a concurrent %s correction changes the prepared revision context',
    async (kind) => {
      const actor = certificationActor({ manager: true, approver: true });
      const server = new FakeCertificationServer({ actor: () => actor });
      const { caseId, dataForm, attach } = seedIssuedCertificationCase(
        server,
        `CERT-CONTEXT-${kind}`,
      );
      attach('certificate', 'Corrected Certificate');
      const colleaguePdf = attach('certificate', 'Colleague Certificate');
      server.install();
      render(
        <CertificationWorkspace
          actor={actor}
          identity={certificationIdentity}
          projectId={certificationIds.project}
        />,
      );
      fireEvent.click(
        await screen.findByRole('button', { name: `CERT-CONTEXT-${kind}` }),
      );
      let form = await screen.findByRole('form', {
        name: 'Record a Certificate revision',
      });
      completeRevision(form, 'Corrected Certificate');
      if (kind === 'texts') {
        const texts = CERTIFICATE_TEXTS.map((text) => ({
          ...text,
          address: 'Updated city, example',
        }));
        await recordIssuedCaseCommand(server, caseId, 'certificate-data', {
          texts,
          agreedOn: '2026-11-06',
          agreementAttachmentId: dataForm,
          reason: 'Colleague corrected signed texts.',
        });
        await recordIssuedCaseCommand(server, caseId, 'decision', {
          ...certificationDecision({ grantedTexts: texts }),
          reason: 'Colleague aligned the granted texts.',
        });
      } else {
        await recordIssuedCaseCommand(server, caseId, 'certificate-revisions', {
          reason: 'Colleague corrected a printing defect.',
          revisedOn: '2026-11-07',
          attachmentId: colleaguePdf,
          revisionMarked: true,
          independenceAttested: true,
          onBehalf: null,
        });
      }
      fireEvent.click(
        within(form).getByRole('button', { name: 'Record the revision' }),
      );
      expect(await within(form).findByRole('alert')).toHaveTextContent(
        'Reload it before saving; your draft is kept.',
      );
      fireEvent.click(screen.getByRole('button', { name: 'Reload Case' }));
      form = await screen.findByRole('form', {
        name: 'Record a Certificate revision',
      });
      expect(
        await within(form).findByRole('button', {
          name: 'Start revision again from current texts',
        }),
      ).toBeVisible();
      expect(within(form).getByLabelText('Revision reason')).toHaveValue(
        'Correct the printed city.',
      );
      expect(
        within(form).getByRole('radio', { name: 'Yes, visibly marked' }),
      ).toBeChecked();
      expect(
        within(form).getByRole('checkbox', { name: ATTESTATION }),
      ).toBeChecked();
      expect(
        within(form).getByRole('button', { name: 'Record the revision' }),
      ).toBeDisabled();
      fireEvent.click(
        within(form).getByRole('button', {
          name: 'Start revision again from current texts',
        }),
      );
      expect(within(form).getByLabelText('Revision reason')).toHaveValue('');
      expect(within(form).queryAllByRole('radio', { checked: true })).toEqual(
        [],
      );
      expect(
        within(form).getByRole('checkbox', { name: ATTESTATION }),
      ).not.toBeChecked();
    },
  );

  it('shows a reader the current and superseded exact PDFs, separate transmission and unmarked warning in all four languages', async () => {
    assertMessageCoverage('Certificate revisions', revisionMessages);
    let actor = certificationActor({
      manager: true,
      approver: true,
      documents: true,
    });
    const server = new FakeCertificationServer({ actor: () => actor });
    const { caseId, originalPdf, attach } = seedIssuedCertificationCase(
      server,
      'CERT-REVISION-READER',
    );
    const firstPdf = attach('certificate', 'First corrected Certificate');
    const secondPdf = attach('certificate', 'Second corrected Certificate');
    await recordIssuedCaseCommand(server, caseId, 'certificate-revisions', {
      reason: 'Corrected printing.',
      revisedOn: '2026-11-07',
      attachmentId: firstPdf,
      revisionMarked: false,
      independenceAttested: true,
    });
    const exchange = {
      direction: 'sent',
      itemKind: 'certificate',
      counterpart: { kind: 'client', name: 'Lactis Demo SRL' },
      businessDate: '2026-11-07',
      channel: 'courier',
    };
    await recordIssuedCaseCommand(server, caseId, 'exchanges', {
      ...exchange,
      attachmentIds: [originalPdf],
      reference: 'ISSUANCE-DELIVERY',
    });
    await recordIssuedCaseCommand(server, caseId, 'exchanges', {
      ...exchange,
      attachmentIds: [firstPdf],
      reference: 'REVISION-1-DELIVERY',
    });
    await recordIssuedCaseCommand(server, caseId, 'certificate-revisions', {
      reason: 'Corrected another printing defect.',
      revisedOn: '2026-11-07',
      attachmentId: secondPdf,
      revisionMarked: true,
      independenceAttested: true,
    });
    await recordIssuedCaseCommand(server, caseId, 'exchanges', {
      ...exchange,
      attachmentIds: [firstPdf, secondPdf],
      reference: 'BUNDLED-DELIVERY',
    });
    actor = certificationActor({
      manager: false,
      approver: false,
      documents: true,
    });
    server.install();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:fictional-revision'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
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
      await screen.findByRole('button', { name: 'CERT-REVISION-READER' }),
    );
    let region = await screen.findByRole('region', {
      name: 'Certificate revisions',
    });
    const card = (heading: string) => {
      const element = within(region)
        .getByRole('heading', { name: heading })
        .closest('li');
      if (!element) throw new Error('Expected a revision history item.');
      return within(element);
    };
    expect(
      card('Issuance 0 — Superseded').getByText(/ISSUANCE-DELIVERY/u),
    ).toBeVisible();
    expect(
      card('Revision 1 — Superseded').getByText(/REVISION-1-DELIVERY/u),
    ).toBeVisible();
    expect(
      card('Revision 2 — Current').getByText(
        'Transmission not recorded for this revision',
      ),
    ).toBeVisible();
    expect(
      within(region).queryByText(/BUNDLED-DELIVERY/u),
    ).not.toBeInTheDocument();
    for (const [index, attachmentId] of [
      [0, originalPdf],
      [1, firstPdf],
      [2, secondPdf],
    ] as const) {
      fireEvent.click(
        within(region).getByRole('button', {
          name: `Open PDF for revision ${index}`,
        }),
      );
      await waitFor(() => expect(click).toHaveBeenCalledTimes(index + 1));
      expect(server.requests.at(-1)).toMatchObject({
        method: 'GET',
        path: `/api/certification-cases/${caseId}/documents/${attachmentId}/content`,
        company: certificationIds.company,
      });
    }
    for (const [locale, title, warning] of [
      [
        'fr',
        'Révisions du certificat',
        'Révision non indiquée sur le certificat',
      ],
      [
        'ro',
        'Revizuirile certificatului',
        'Revizuirea nu este marcată pe certificat',
      ],
      [
        'ru',
        'Исправления сертификата',
        'Исправление не обозначено на сертификате',
      ],
      ['en', 'Certificate revisions', 'Revision not marked on the Certificate'],
    ]) {
      fireEvent.click(screen.getByRole('button', { name: `Locale ${locale}` }));
      region = await screen.findByRole('region', { name: title });
      expect(within(region).getByText(warning)).toBeVisible();
      expect(within(region).queryByRole('form')).not.toBeInTheDocument();
      expect(within(region).getAllByRole('button')).toHaveLength(3);
      expect(
        screen.queryByRole('button', { name: 'Correct the decision texts' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Correct the Certificate data' }),
      ).not.toBeInTheDocument();
    }
  });

  it('retains typed inputs after stale reload and retries an uncertain revision with the same key and body', async () => {
    const actor = certificationActor({ manager: true, approver: true });
    const server = new FakeCertificationServer({ actor: () => actor });
    const { attach } = seedIssuedCertificationCase(
      server,
      'CERT-REVISION-RETRY',
    );
    attach('certificate', 'Corrected Certificate');
    server.install();
    render(
      <CertificationWorkspace
        actor={actor}
        identity={certificationIdentity}
        projectId={certificationIds.project}
      />,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'CERT-REVISION-RETRY' }),
    );
    let form = await screen.findByRole('form', {
      name: 'Record a Certificate revision',
    });
    completeRevision(form, 'Corrected Certificate');
    server.interceptions.push({
      match: (request) => request.path.endsWith('/certificate-revisions'),
      respond: () => Response.json({ code: 'STALE_VERSION' }, { status: 409 }),
    });
    fireEvent.click(
      within(form).getByRole('button', { name: 'Record the revision' }),
    );
    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'Reload it before saving; your draft is kept.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reload Case' }));
    form = await screen.findByRole('form', {
      name: 'Record a Certificate revision',
    });
    expect(within(form).getByLabelText('Revision reason')).toHaveValue(
      'Correct the printed city.',
    );
    expect(
      within(form).getByRole('radio', { name: 'Yes, visibly marked' }),
    ).toBeChecked();
    server.interceptions.push({
      match: (request) => request.path.endsWith('/certificate-revisions'),
      respond: () => Promise.reject(new TypeError('Fictional lost response')),
    });
    fireEvent.click(
      within(form).getByRole('button', { name: 'Record the revision' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Retry unchanged save' }),
    );
    await screen.findByRole('heading', { name: 'Revision 1 — Current' });
    const posts = server.requests.filter((request) =>
      request.path.endsWith('/certificate-revisions'),
    );
    expect(posts).toHaveLength(3);
    expect(posts[1]?.key).toBe(posts[2]?.key);
    expect(posts[1]?.body).toEqual(posts[2]?.body);
  });
});

function completeRevision(form: HTMLElement, title: string) {
  change(form, 'Revision date', '2026-11-07');
  change(form, 'Revision reason', 'Correct the printed city.');
  selectOptionByLabel(
    within(form).getByLabelText('Corrected Certificate PDF'),
    `${title} — version 1 (corrected-certificate.pdf)`,
  );
  fireEvent.click(
    within(form).getByRole('radio', { name: 'Yes, visibly marked' }),
  );
  fireEvent.click(within(form).getByRole('checkbox', { name: ATTESTATION }));
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
