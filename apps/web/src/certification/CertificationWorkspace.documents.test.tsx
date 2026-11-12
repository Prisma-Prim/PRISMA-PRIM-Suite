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
} from './certification.test-fixture';

const ARCHIVE = 'Document archive';
const AGREEMENT = 'Certification agreement';
const SIGNED = 'Signed certification agreement — version 1';
const SIGNED_REFERENCE = `${SIGNED} (signed-certification-agreement.pdf)`;

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
function serve(grants: { manager: boolean; documents: boolean }) {
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

/** Waits for an attachment heading in the document archive, which a reload re-renders. */
async function expectAttached(title: string) {
  await waitFor(() =>
    expect(
      within(region(ARCHIVE)).getByText(title, { selector: 'strong' }),
    ).toBeVisible(),
  );
}

function timelineTitles() {
  return [...region('Timeline').querySelectorAll(':scope > ol > li')].map(
    (entry) => entry.querySelector('strong')?.textContent,
  );
}

/**
 * A Case with a confirmed duration (revision 4), then a colleague's signed
 * agreement (5) and signed questionnaire with a note (6).
 */
function agreementCase(server: FakeCertificationServer, reference: string) {
  const caseId = server.seed({ orderReference: reference, duration: true });
  const signed = server.addSource('Signed certification agreement');
  const questionnaire = server.addSource('Signed application questionnaire');
  const agreementId = server.attachAsColleague(caseId, signed, 'agreement');
  server.attachAsColleague(
    caseId,
    questionnaire,
    'questionnaire',
    'Signed by the director.',
  );
  return { caseId, agreementId, signed };
}

/** Opens the attach form and waits for the eligible PDFs. */
async function openAttachForm() {
  fireEvent.click(
    within(region(ARCHIVE)).getByRole('button', { name: 'Attach a document' }),
  );
  const form = await within(region(ARCHIVE)).findByRole('form', {
    name: 'Attach a document',
  });
  await waitFor(() =>
    expect(
      within(form).queryByText('Loading the Client’s received PDFs…'),
    ).not.toBeInTheDocument(),
  );
  return form;
}

function agreementForm(name = 'Record the agreement') {
  return within(region(AGREEMENT)).getByRole('form', { name });
}

function fillAgreement(form: HTMLElement, signedOn: string) {
  change(within(form).getByLabelText('Signed on'), signedOn);
  selectOptionByLabel(
    within(form).getByLabelText('Signed original'),
    SIGNED_REFERENCE,
  );
}

function installDownload() {
  const saved: string[] = [];
  const created = vi.fn(() => 'blob:fictional-agreement');
  const revoked = vi.fn();
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(function (this: HTMLAnchorElement) {
      saved.push(this.download);
    });
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: created,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: revoked,
  });
  return { saved, created, revoked, click };
}

describe('Certification signed originals and agreement', () => {
  it('shows a reader the document archive, the recorded agreement and its version without any form', async () => {
    const { server, actor } = serve({ manager: false, documents: false });
    const { caseId, agreementId, signed } = agreementCase(
      server,
      'CERT-READ-DOSSIER',
    );
    server.recordAgreementAsColleague(caseId, '2026-11-02', agreementId);
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-READ-DOSSIER');

    const archive = region(ARCHIVE);
    const [first, second] = within(archive).getAllByRole('listitem');
    if (!first || !second) throw new Error('Expected two attachments.');
    expect(within(first).getByText(SIGNED)).toBeVisible();
    expect(definition(first, 'Role')).toBe('Certification agreement');
    expect(definition(first, 'File')).toBe(
      'signed-certification-agreement.pdf',
    );
    expect(definition(first, 'Size')).toBe(
      new Intl.NumberFormat('en', {
        style: 'unit',
        unit: 'byte',
        unitDisplay: 'short',
      }).format(signed.bytes.length),
    );
    // A shortened fingerprint, with the full value one disclosure away.
    expect(
      within(first).getByText(`${signed.sha256.slice(0, 12)}…`),
    ).toBeVisible();
    expect(within(first).getByText(signed.sha256)).toBeInTheDocument();
    expect(definition(first, 'Attached by')).toBe('Boris Demo');
    expect(definition(second, 'Role')).toBe('Application questionnaire');
    expect(definition(second, 'Note')).toBe('Signed by the director.');
    expect(
      within(archive).queryByRole('button', { name: /^Download/u }),
    ).not.toBeInTheDocument();
    expect(
      within(archive).getByText(
        'Opening the attached PDFs requires the right to read the content of this Client’s received audit sources (Documents).',
      ),
    ).toBeVisible();

    const agreement = region(AGREEMENT);
    expect(
      within(agreement).getByText(/Recorded by: Boris Demo/u),
    ).toBeVisible();
    expect(definition(agreement, 'Signed on')).toBe('Nov 2, 2026');
    expect(definition(agreement, 'Signed original')).toBe(SIGNED_REFERENCE);
    // The audit team follows the agreement; a reader sees no form there.
    expect(
      within(region('Audit team')).getByText('No audit team is proposed yet.'),
    ).toBeVisible();
    expect(timelineTitles().at(-1)).toBe('Certification agreement — version 1');

    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    for (const name of [
      'Attach a document',
      'Correct the agreement',
      'Record the agreement',
    ])
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    expect(server.requests.some((request) => request.method !== 'GET')).toBe(
      false,
    );
    expect(
      server.requests.some(
        (request) =>
          request.path.endsWith('/eligible-documents') ||
          request.path.endsWith('/content'),
      ),
    ).toBe(false);
  });

  it('downloads the exact attached PDF only when its size and fingerprint match', async () => {
    const { server, actor } = serve({ manager: false, documents: true });
    const { caseId, agreementId } = agreementCase(server, 'CERT-DOWNLOAD');
    server.install();
    const download = installDownload();
    renderWorkspace(actor);
    await openSeededCase('CERT-DOWNLOAD');
    fireEvent.click(
      within(region(ARCHIVE)).getByRole('button', {
        name: `Download ${SIGNED}`,
      }),
    );
    await waitFor(() => expect(download.click).toHaveBeenCalledOnce());
    expect(download.saved).toEqual(['signed-certification-agreement.pdf']);
    expect(download.revoked).toHaveBeenCalledWith('blob:fictional-agreement');
    expect(server.requests.at(-1)).toMatchObject({
      method: 'GET',
      path: `/api/certification-cases/${caseId}/documents/${agreementId}/content`,
      company: certificationIds.company,
    });

    // Bytes of the recorded size that do not match the fingerprint stay unsaved.
    server.interceptions.push({
      match: (request) => request.path.endsWith('/content'),
      respond: async () => {
        const original = await server
          .fetch(
            `/api/certification-cases/${caseId}/documents/${agreementId}/content`,
          )
          .then((response) => response.arrayBuffer());
        const tampered = new Uint8Array(original);
        tampered[tampered.length - 2] = 0x21;
        return new Response(tampered, {
          headers: { 'content-type': 'application/pdf' },
        });
      },
    });
    fireEvent.click(
      within(region(ARCHIVE)).getByRole('button', {
        name: `Download ${SIGNED}`,
      }),
    );
    expect(
      await within(region(ARCHIVE)).findByText(
        'The PDF could not be downloaded, or its bytes did not match the recorded fingerprint. Try again.',
      ),
    ).toBeVisible();
    expect(download.click).toHaveBeenCalledOnce();
  });

  it('attaches a received PDF with its role and note, then lists it', async () => {
    const { server, actor } = serve({ manager: true, documents: true });
    const caseId = server.seed({
      orderReference: 'CERT-ATTACH',
      accepted: true,
    });
    const questionnaire = server.addSource('Signed application questionnaire');
    server.addSource('Signed certification agreement');
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-ATTACH');
    expect(
      within(region(ARCHIVE)).getByText(
        'No document is attached to this Case yet.',
      ),
    ).toBeVisible();

    const form = await openAttachForm();
    const source = within(form).getByLabelText('Received PDF');
    await waitFor(() => expect(source).toBeEnabled());
    expect(selectOptionLabels(source)).toEqual([
      'Select a received PDF',
      SIGNED,
      'Signed application questionnaire — version 1',
    ]);
    fireEvent.click(
      within(form).getByRole('button', { name: 'Attach the document' }),
    );
    expect(
      await within(region(ARCHIVE)).findByText(
        'Choose a received PDF that is not attached yet and its role. A note has at most 1,000 characters.',
      ),
    ).toBeVisible();
    expect(server.mutations()).toEqual([]);

    selectOptionByLabel(source, 'Signed application questionnaire — version 1');
    fireEvent.click(
      within(form).getByRole('button', { name: 'Attach the document' }),
    );
    const role = within(form).getByLabelText('Role');
    await waitFor(() => expect(role).toHaveAttribute('aria-invalid', 'true'));
    expect([...form.querySelectorAll('[aria-invalid="true"]')]).toEqual([role]);
    selectOptionByLabel(
      within(form).getByLabelText('Role'),
      'Application questionnaire',
    );
    change(within(form).getByLabelText('Note'), '  Signed by the director. ');
    fireEvent.click(
      within(form).getByRole('button', { name: 'Attach the document' }),
    );
    await expectAttached('Signed application questionnaire — version 1');
    expect(server.mutations()).toEqual([
      expect.objectContaining({
        path: `/api/certification-cases/${caseId}/documents`,
        contentType: 'application/json',
        company: certificationIds.company,
        body: {
          expectedRevision: 3,
          role: 'questionnaire',
          documentId: questionnaire.documentId,
          versionId: questionnaire.versionId,
          representationId: questionnaire.representationId,
          note: 'Signed by the director.',
        },
      }),
    ]);
    expect(server.mutations()[0]?.key).toBeTruthy();
    expect(
      screen.getByText(
        'Saved. The confirmed result remains recorded even if a later refresh fails.',
      ),
    ).toBeVisible();
    expect(definition(region(ARCHIVE), 'Attached by')).toBe('Ana Demo');

    // The attached PDF stays listed for reference but cannot be chosen again.
    const again = await openAttachForm();
    const reopened = within(again).getByLabelText('Received PDF');
    await waitFor(() => expect(reopened).toBeEnabled());
    fireEvent.click(reopened);
    const attached = within(screen.getByRole('listbox')).getByRole('option', {
      name: 'Signed application questionnaire — version 1 (already attached)',
    });
    expect(attached).toBeDisabled();
  });

  it('keeps a valid attachment draft unmarked after a stale refusal', async () => {
    const { server, actor } = serve({ manager: true, documents: true });
    const caseId = server.seed({
      orderReference: 'CERT-ATTACH-STALE',
      accepted: true,
    });
    server.addSource('Signed application questionnaire');
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-ATTACH-STALE');
    const form = await openAttachForm();
    const source = within(form).getByLabelText('Received PDF');
    await waitFor(() => expect(source).toBeEnabled());
    selectOptionByLabel(source, 'Signed application questionnaire — version 1');
    selectOptionByLabel(
      within(form).getByLabelText('Role'),
      'Application questionnaire',
    );
    server.attachAsColleague(caseId, server.addSource('Audit plan'), 'plan');
    fireEvent.click(
      within(form).getByRole('button', { name: 'Attach the document' }),
    );
    expect(
      await within(region(ARCHIVE)).findByText(
        'This Case changed since you opened it. Reload it before saving; your draft is kept.',
      ),
    ).toBeVisible();
    expect(form.querySelectorAll('[aria-invalid="true"]')).toHaveLength(0);
    expect(
      within(form).getByRole('button', { name: 'Attach the document' }),
    ).toBeDisabled();
  });

  it('refuses a duplicate attachment in plain language until the Case is reloaded', async () => {
    const { server, actor } = serve({ manager: true, documents: true });
    server.seed({ orderReference: 'CERT-DUPLICATE', accepted: true });
    server.addSource('Signed certification agreement');
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-DUPLICATE');
    const form = await openAttachForm();
    const source = within(form).getByLabelText('Received PDF');
    await waitFor(() => expect(source).toBeEnabled());
    selectOptionByLabel(source, SIGNED);
    selectOptionByLabel(
      within(form).getByLabelText('Role'),
      'Certification agreement',
    );
    server.interceptions.push({
      match: (request) =>
        request.method === 'POST' && request.path.endsWith('/documents'),
      respond: () =>
        Response.json(
          { code: 'CERTIFICATION_DOCUMENT_ALREADY_ATTACHED' },
          { status: 409 },
        ),
    });
    const submit = within(form).getByRole('button', {
      name: 'Attach the document',
    });
    fireEvent.click(submit);
    expect(
      await within(region(ARCHIVE)).findByText(
        'This exact document version is already attached to the Case. Reload the Case and choose another document.',
      ),
    ).toBeVisible();
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Reload Case' }));
    await waitFor(() =>
      expect(
        within(region(ARCHIVE)).getByRole('button', {
          name: 'Attach the document',
        }),
      ).toBeEnabled(),
    );
    fireEvent.click(
      within(region(ARCHIVE)).getByRole('button', {
        name: 'Attach the document',
      }),
    );
    await expectAttached(SIGNED);
    const [refused, saved] = server.mutations();
    expect(saved?.body).toMatchObject({
      expectedRevision: 3,
      role: 'agreement',
    });
    expect(saved?.key).not.toBe(refused?.key);
  });

  it('points to the Documents workspace when no received PDF can be attached', async () => {
    const { server, actor } = serve({ manager: true, documents: true });
    server.seed({ orderReference: 'CERT-NO-SOURCE', accepted: true });
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-NO-SOURCE');
    const form = await openAttachForm();
    expect(
      within(form).getByText(
        'No received PDF of this Client can be attached yet. In the Documents workspace, register the signed original as a received audit source of this Client, upload its PDF and designate that version official. It then appears here.',
      ),
    ).toBeVisible();
    expect(within(form).getByLabelText('Received PDF')).toBeDisabled();
    expect(
      within(form).getByRole('button', { name: 'Attach the document' }),
    ).toBeDisabled();
    expect(server.mutations()).toEqual([]);
  });

  it('keeps the Case readable when a Document call is refused and rechecks authority', async () => {
    const { server, actor } = serve({ manager: true, documents: true });
    server.seed({ orderReference: 'CERT-DOCUMENT-DENIED', accepted: true });
    server.interceptions.push({
      match: (request) => request.path.endsWith('/eligible-documents'),
      respond: () => new Response(null, { status: 403 }),
    });
    server.install();
    const onActorRevalidated = vi.fn();
    renderWorkspace(actor, { onActorRevalidated });
    await openSeededCase('CERT-DOCUMENT-DENIED');
    const form = await openAttachForm();
    expect(
      within(form).getByText(
        'Your Document rights on this Client’s received PDFs could not be confirmed. They are being checked again; the Case stays available.',
      ),
    ).toBeVisible();
    await waitFor(() => expect(onActorRevalidated).toHaveBeenCalledOnce());
    expect(
      screen.getByRole('heading', {
        name: 'Certification Case CERT-DOCUMENT-DENIED',
      }),
    ).toBeVisible();
    expect(
      screen.queryByText(
        'Certification access is unavailable. Your current authority is being checked.',
      ),
    ).not.toBeInTheDocument();
  });

  it('records the agreement on a signed original, then corrects it with a reason', async () => {
    // Recording the agreement needs no Document right; attaching does.
    const { server, actor } = serve({ manager: true, documents: false });
    const { caseId, agreementId } = agreementCase(server, 'CERT-AGREEMENT');
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-AGREEMENT');
    expect(
      within(region(ARCHIVE)).getByText(
        'Attaching a document requires the right to read the content of this Client’s received audit sources (Documents).',
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Attach a document' }),
    ).not.toBeInTheDocument();
    expect(
      within(region(AGREEMENT)).getByText(
        'No certification agreement is recorded yet.',
      ),
    ).toBeVisible();

    const form = agreementForm();
    // Only attachments with the agreement role can be chosen.
    expect(
      selectOptionLabels(within(form).getByLabelText('Signed original')),
    ).toEqual(['Select the signed original', SIGNED_REFERENCE]);
    fireEvent.click(
      within(form).getByRole('button', { name: 'Record the agreement' }),
    );
    expect(
      await within(region(AGREEMENT)).findByText(
        'Enter the signature date and choose a document attached with the role Certification agreement.',
      ),
    ).toBeVisible();
    fillAgreement(form, '2999-12-31');
    fireEvent.click(
      within(form).getByRole('button', { name: 'Record the agreement' }),
    );
    expect(
      await within(region(AGREEMENT)).findByText(
        'The agreement cannot be signed after today. Check the signature date.',
      ),
    ).toBeVisible();
    expect([...form.querySelectorAll('[aria-invalid="true"]')]).toEqual([
      within(form).getByLabelText('Signed on'),
    ]);
    expect(server.mutations()).toEqual([]);

    change(within(form).getByLabelText('Signed on'), '2026-11-02');
    fireEvent.click(
      within(form).getByRole('button', { name: 'Record the agreement' }),
    );
    expect(
      await within(region(AGREEMENT)).findByRole('button', {
        name: 'Correct the agreement',
      }),
    ).toBeVisible();
    expect(server.mutations()).toEqual([
      expect.objectContaining({
        path: `/api/certification-cases/${caseId}/agreement`,
        body: {
          expectedRevision: 6,
          signedOn: '2026-11-02',
          attachmentId: agreementId,
        },
      }),
    ]);
    expect(server.mutations()[0]?.key).toBeTruthy();
    expect(definition(region(AGREEMENT), 'Signed on')).toBe('Nov 2, 2026');
    expect(definition(region(AGREEMENT), 'Signed original')).toBe(
      SIGNED_REFERENCE,
    );
    expect(
      within(region('Audit team')).getByRole('form', {
        name: 'Propose the team',
      }),
    ).toBeVisible();

    fireEvent.click(
      within(region(AGREEMENT)).getByRole('button', {
        name: 'Correct the agreement',
      }),
    );
    const correction = agreementForm('Correct the agreement');
    expect(within(correction).getByLabelText('Signed on')).toHaveValue(
      '2026-11-02',
    );
    change(within(correction).getByLabelText('Signed on'), '2026-11-03');
    fireEvent.click(
      within(correction).getByRole('button', { name: 'Record the correction' }),
    );
    expect(
      await within(region(AGREEMENT)).findByText(
        'State the reason for this correction (at most 2,000 characters).',
      ),
    ).toBeVisible();
    change(
      within(correction).getByLabelText('Correction reason'),
      'The client signed on the third.',
    );
    fireEvent.click(
      within(correction).getByRole('button', { name: 'Record the correction' }),
    );
    expect(
      await within(region(AGREEMENT)).findByText(
        /Correction reason: The client signed on the third\./u,
      ),
    ).toBeVisible();
    expect(server.mutations()[1]?.body).toEqual({
      expectedRevision: 7,
      reason: 'The client signed on the third.',
      signedOn: '2026-11-03',
      attachmentId: agreementId,
    });
    expect(timelineTitles().slice(-2)).toEqual([
      'Certification agreement — version 1',
      'Certification agreement — version 2',
    ]);
  });

  it.each([
    [
      'CERTIFICATION_AGREEMENT_IN_FUTURE',
      'The agreement cannot be signed after today. Check the signature date.',
      false,
    ],
    [
      'CERTIFICATION_AGREEMENT_DOCUMENT',
      'The chosen document is not attached with the role Certification agreement. Reload the Case and choose the signed original.',
      true,
    ],
    [
      'CERTIFICATION_DURATION_MISSING',
      'The agreement is recorded once the audit duration is confirmed. Reload the Case.',
      true,
    ],
    [
      'CERTIFICATION_CORRECTION_REASON',
      'A correction needs a reason and a first agreement has none. Reload the Case before saving again.',
      true,
    ],
  ])(
    'explains the agreement refusal %s in plain language',
    async (code, message, reload) => {
      const { server, actor } = serve({ manager: true, documents: false });
      agreementCase(server, 'CERT-AGREEMENT-REFUSED');
      server.interceptions.push({
        match: (request) => request.path.endsWith('/agreement'),
        respond: () => Response.json({ code }, { status: 409 }),
      });
      server.install();
      renderWorkspace(actor);
      await openSeededCase('CERT-AGREEMENT-REFUSED');
      const form = agreementForm();
      fillAgreement(form, '2026-11-02');
      const submit = within(form).getByRole('button', {
        name: 'Record the agreement',
      });
      fireEvent.click(submit);
      expect(await within(region(AGREEMENT)).findByText(message)).toBeVisible();
      expect(server.mutations()).toHaveLength(1);
      if (reload) expect(submit).toBeDisabled();
      else expect(submit).toBeEnabled();
    },
  );

  it('keeps the agreement draft through a stale refusal and saves it after a reload', async () => {
    const { server, actor } = serve({ manager: true, documents: false });
    const { caseId, agreementId } = agreementCase(
      server,
      'CERT-AGREEMENT-STALE',
    );
    server.install();
    renderWorkspace(actor);
    await openSeededCase('CERT-AGREEMENT-STALE');
    const form = agreementForm();
    fillAgreement(form, '2026-11-02');
    server.attachAsColleague(caseId, server.addSource('Audit plan'), 'plan');
    const submit = within(form).getByRole('button', {
      name: 'Record the agreement',
    });
    fireEvent.click(submit);
    expect(
      await within(region(AGREEMENT)).findByText(
        'This Case changed since you opened it. Reload it before saving; your draft is kept.',
      ),
    ).toBeVisible();
    expect(submit).toBeDisabled();
    expect(form.querySelectorAll('[aria-invalid="true"]')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Reload Case' }));
    await expectAttached('Audit plan — version 1');
    const kept = agreementForm();
    expect(within(kept).getByLabelText('Signed on')).toHaveValue('2026-11-02');
    expect(within(kept).getByLabelText('Signed original')).toHaveTextContent(
      SIGNED_REFERENCE,
    );
    fireEvent.click(
      within(kept).getByRole('button', { name: 'Record the agreement' }),
    );
    expect(
      await within(region(AGREEMENT)).findByRole('button', {
        name: 'Correct the agreement',
      }),
    ).toBeVisible();
    const [stale, saved] = server.mutations();
    expect(stale?.body).toMatchObject({ expectedRevision: 6 });
    expect(saved?.body).toEqual({
      expectedRevision: 7,
      signedOn: '2026-11-02',
      attachmentId: agreementId,
    });
    expect(saved?.key).not.toBe(stale?.key);
  });
});
