import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import type { ActorContext } from './access-types';
import { withCompanyGrants } from './access/company-grants.test-fixture';
import {
  clarteAddendumSource,
  clarteContractSource,
  clarteDocumentPdf,
  clarteDocumentsActor,
  clarteDocumentsClient,
  clarteDocumentsProject,
  clarteInvoiceSource,
  clarteKnowledgeSource,
  clartePassageText,
  createClarteDocumentsApi,
  registeredDocumentId,
  seededDocumentIds,
} from './clarte/documents/clarte-documents.test-fixture';
import { renderInInterface } from './test/app-interface';
import {
  fireEvent,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';
import { changeValue, selectOptionByLabel } from './test/select-option';

type Api = ReturnType<typeof createClarteDocumentsApi>;

function serve(options: Parameters<typeof createClarteDocumentsApi>[0] = {}) {
  const api = createClarteDocumentsApi(options);
  const bodies: unknown[] = [];
  const reads: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input.toString(), window.location.origin);
      if (!init?.method || init.method === 'GET') reads.push(url.pathname);
      const body =
        typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      if (body !== undefined) bodies.push(body);
      const reply = api.reply({ method: init?.method ?? 'GET', url, body });
      if (reply.pdf)
        return new Response(reply.pdf, {
          status: reply.status,
          headers: { 'content-type': 'application/pdf' },
        });
      return Response.json(reply.json, { status: reply.status });
    }),
  );
  return { api, bodies, reads };
}

function openDocuments(hash = '#documents') {
  window.history.replaceState(null, '', `/${hash}`);
  renderInInterface(
    'clarte',
    <App identity={deterministicBrowserIdentity()} />,
  );
}

function register() {
  return screen.getByRole('region', { name: 'Working Documents' });
}

/** The register once the App and its first Documents read have settled. */
async function registerLoaded() {
  return screen.findByRole('region', { name: 'Working Documents' });
}

async function openDocument(title: string) {
  fireEvent.click(
    await within(await registerLoaded()).findByRole('button', { name: title }),
  );
  return screen.findByRole('dialog', { name: title });
}

function versionRow(panel: HTMLElement, number: number) {
  const row = within(panel)
    .getByRole('heading', { name: `Version ${number}` })
    .closest('li');
  if (!row) throw new Error(`Missing Version ${number}`);
  return row;
}

function showVersionDetails(panel: HTMLElement) {
  fireEvent.click(
    within(panel).getByRole('button', { name: 'Show version details' }),
  );
}

function writesTo(api: Api, suffix: string) {
  return api.writes.filter((write) => write.endsWith(suffix));
}

const downloads: string[] = [];
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  downloads.length = 0;
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = vi.fn(() => 'blob:fictional-download');
      static revokeObjectURL = vi.fn();
    },
  );
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloads.push(this.download || this.href);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('Clarté Documents register', () => {
  it('uses the register and knowledge-base labels in the Documents navigation', async () => {
    serve();
    openDocuments();
    const views = await screen.findByRole('navigation', {
      name: 'Documents views',
    });
    expect(within(views).getByRole('link', { name: 'Register' })).toBeVisible();
    expect(
      within(views).getByRole('link', { name: 'Knowledge base' }),
    ).toBeVisible();
  });

  it('shows the recorded age in the register and keeps the exact date available', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-27T10:01:00Z'));
    serve();
    openDocuments();
    const button = await within(await registerLoaded()).findByRole('button', {
      name: 'Fictional initial assessment questionnaire',
    });
    const row = button.closest('li');
    if (!row) throw new Error('Missing Document row');
    const recorded = within(row).getByText('1 hour ago');
    expect(recorded).toHaveAttribute('datetime', '2026-11-27T09:01:00.000Z');
    expect(recorded).toHaveAttribute('title', expect.stringContaining('2026'));
  });

  it('shows the version references directly from the Document navigation', async () => {
    serve();
    openDocuments();
    const panel = await openDocument(
      'Fictional initial assessment questionnaire',
    );
    fireEvent.click(
      within(
        within(panel).getByRole('navigation', { name: 'Document sections' }),
      ).getByRole('button', { name: 'References' }),
    );
    expect(
      await within(panel).findByRole('list', {
        name: /references.*version 1/i,
      }),
    ).toBeVisible();
  });

  it('designates an official Version from the Document side panel', async () => {
    const { api } = serve();
    openDocuments();
    const panel = await openDocument(
      'Fictional initial assessment questionnaire',
    );
    const versions = within(panel).getByRole('region', { name: 'Versions' });
    showVersionDetails(panel);

    fireEvent.click(
      await within(versions).findByRole('button', { name: 'Start new draft' }),
    );
    await within(versions).findByText('Version 2 was started as a draft.');
    fireEvent.click(
      within(versionRow(panel, 2)).getByRole('button', {
        name: 'Designate as official',
      }),
    );
    fireEvent.click(
      within(versions).getByRole('button', {
        name: 'Confirm official designation',
      }),
    );

    await within(versions).findByText('Version 2 is now official.');
    expect(
      within(versionRow(panel, 1)).getByText('Superseded by Version 2'),
    ).toBeInTheDocument();
    expect(
      writesTo(
        api,
        `${seededDocumentIds.questionnaire}-v2/official-designation`,
      ),
    ).toHaveLength(1);
  });

  it('adds and removes a reference on a draft and adds an irreversible one to the official Version', async () => {
    const { api, bodies } = serve();
    openDocuments();
    const panel = await openDocument(
      'Fictional initial assessment questionnaire',
    );
    const versions = within(panel).getByRole('region', { name: 'Versions' });
    showVersionDetails(panel);
    fireEvent.click(
      await within(versions).findByRole('button', { name: 'Start new draft' }),
    );
    await within(versions).findByText('Version 2 was started as a draft.');

    const draft = versionRow(panel, 2);
    fireEvent.change(within(draft).getByLabelText('HTTPS URL'), {
      target: { value: 'https://example.test/fictional/annex.pdf' },
    });
    fireEvent.click(
      within(draft).getByRole('button', { name: 'Add reference' }),
    );
    await within(versions).findByText('A reference was added to Version 2.');
    const added = await within(versionRow(panel, 2)).findByText(
      'https://example.test/fictional/annex.pdf',
    );
    const addedReference = added.closest('li');
    if (!addedReference) throw new Error('Missing added reference');
    fireEvent.click(
      within(addedReference).getByRole('button', { name: 'Remove' }),
    );
    await within(versions).findByText(
      'A draft reference was removed from Version 2.',
    );

    fireEvent.click(
      within(versionRow(panel, 2)).getByRole('button', {
        name: 'Designate as official',
      }),
    );
    fireEvent.click(
      within(versions).getByRole('button', {
        name: 'Confirm official designation',
      }),
    );
    await within(versions).findByText('Version 2 is now official.');
    const official = versionRow(panel, 2);
    fireEvent.change(within(official).getByLabelText('HTTPS URL'), {
      target: { value: 'https://example.test/fictional/signed.pdf' },
    });
    fireEvent.click(
      within(official).getByRole('button', {
        name: 'Add reference to official Version',
      }),
    );
    fireEvent.click(
      within(versions).getByRole('button', {
        name: 'Add irreversible reference',
      }),
    );
    await within(versions).findByText('A reference was added to Version 2.');

    expect(writesTo(api, '/representations')).toHaveLength(2);
    expect(writesTo(api, '/removal')).toHaveLength(1);
    expect(bodies).toContainEqual(
      expect.objectContaining({
        url: 'https://example.test/fictional/signed.pdf',
      }),
    );
  });

  it('records an external work reference, lists and filters it and opens its details', async () => {
    const { bodies } = serve();
    openDocuments();
    const list = await within(await registerLoaded()).findByRole('list', {
      name: 'Working Documents',
    });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);

    fireEvent.click(
      within(register()).getByRole('button', { name: 'Register a Document' }),
    );
    const form = screen.getByRole('dialog', { name: 'Register a Document' });
    changeValue(
      within(form).getByLabelText('Client'),
      clarteDocumentsClient.id,
    );
    fireEvent.change(within(form).getByLabelText('Title'), {
      target: { value: 'Fictional supplier questionnaire' },
    });
    fireEvent.change(within(form).getByLabelText('Purpose'), {
      target: { value: 'Collect fictional supplier answers' },
    });
    fireEvent.change(within(form).getByLabelText('External HTTPS link'), {
      target: { value: 'https://example.test/fictional/supplier.docx' },
    });
    fireEvent.click(
      within(form).getByRole('button', { name: 'Register working reference' }),
    );

    const panel = await screen.findByRole('dialog', {
      name: 'Fictional supplier questionnaire',
    });
    expect(
      screen.queryByRole('dialog', { name: 'Register a Document' }),
    ).toBeNull();
    expect(
      within(panel).getByText('Collect fictional supplier answers'),
    ).toBeInTheDocument();
    expect(
      within(panel).getByRole('link', { name: 'Open external reference' }),
    ).toHaveAttribute('href', 'https://example.test/fictional/supplier.docx');
    expect(bodies).toContainEqual({
      clientId: clarteDocumentsClient.id,
      title: 'Fictional supplier questionnaire',
      purpose: 'Collect fictional supplier answers',
      url: 'https://example.test/fictional/supplier.docx',
    });
    fireEvent.click(within(panel).getByRole('button', { name: 'Close' }));
    expect(
      screen.queryByRole('dialog', {
        name: 'Fictional supplier questionnaire',
      }),
    ).toBeNull();

    fireEvent.click(
      within(register()).getByRole('button', {
        name: 'Questionnaire reference, 2',
      }),
    );
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    fireEvent.change(
      within(register()).getByLabelText('Filter working Documents'),
      {
        target: { value: 'supplier' },
      },
    );
    expect(
      within(list).getByRole('button', {
        name: 'Fictional supplier questionnaire',
      }),
    ).toBeInTheDocument();
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    fireEvent.change(
      within(register()).getByLabelText('Filter working Documents'),
      {
        target: { value: 'nothing fictional matches' },
      },
    );
    expect(
      within(register()).getByText(
        'No loaded working Documents match this filter.',
      ),
    ).toBeInTheDocument();
  });

  it('corrects a reference and reads its correction history', async () => {
    const { api } = serve();
    openDocuments();
    const panel = await openDocument('Fictional stage 1 audit report');
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Edit reference' }),
    );
    expect(within(panel).getByRole('button', { name: 'Close' })).toBeDisabled();
    fireEvent.change(within(panel).getByLabelText('Purpose'), {
      target: { value: 'Preserve the corrected fictional mission output' },
    });
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Save correction' }),
    );
    await within(panel).findByText('Correction saved.');
    expect(
      within(panel).getByText(
        'Preserve the corrected fictional mission output',
      ),
    ).toBeInTheDocument();
    expect(writesTo(api, seededDocumentIds.report)).toEqual([
      `PATCH /api/documents/${seededDocumentIds.report}`,
    ]);

    fireEvent.click(
      within(panel).getByRole('button', {
        name: 'Show reference correction history',
      }),
    );
    const history = await within(panel).findByRole('list', {
      name: 'Reference corrections, newest first',
    });
    expect(history).toHaveTextContent('Preserve the fictional mission output');
    expect(history).toHaveTextContent(
      'Preserve the corrected fictional mission output',
    );
    expect(history).toHaveTextContent('Corrected by Ada Ionescu');
  });

  it('keeps a PDF on a draft Version, downloads it and reads its PDF history', async () => {
    const { api } = serve();
    openDocuments();
    const panel = await openDocument('Fictional stage 1 audit report');
    showVersionDetails(panel);
    await within(panel).findByRole('heading', { name: 'Version 1' });
    const draft = versionRow(panel, 1);
    const file = new File([clarteDocumentPdf], 'fictional-report.pdf', {
      type: 'application/pdf',
    });
    fireEvent.change(within(draft).getByLabelText('Choose the PDF file'), {
      target: { files: [file] },
    });
    fireEvent.click(
      within(draft).getByRole('button', { name: 'Preserve PDF' }),
    );
    await within(panel).findByText('fictional-report.pdf');

    fireEvent.click(
      within(versionRow(panel, 1)).getByRole('button', {
        name: 'Download Version 1 PDF',
      }),
    );
    await waitFor(() => expect(downloads).toHaveLength(1));
    fireEvent.click(
      within(versionRow(panel, 1)).getByRole('button', { name: 'PDF history' }),
    );
    const history = await within(panel).findByRole('list', {
      name: 'PDF history',
    });
    expect(within(history).getAllByRole('listitem')).toHaveLength(1);
    expect(history).toHaveTextContent('Current PDF');
    expect(
      writesTo(api, `${seededDocumentIds.report}-v1/content`),
    ).toHaveLength(1);
  });

  it('records a received Contract PDF linked to its exact Contract version', async () => {
    const { bodies } = serve();
    openDocuments();
    fireEvent.click(
      await within(await registerLoaded()).findByRole('button', {
        name: 'Register a Document',
      }),
    );
    const form = screen.getByRole('dialog', { name: 'Register a Document' });
    changeValue(
      within(form).getByLabelText('Document family'),
      'received-contract',
    );
    const picker = await within(form).findByLabelText('Exact Contract Version');
    await waitFor(() => expect(picker).not.toBeDisabled());
    changeValue(picker, clarteContractSource.contractVersionId);
    fireEvent.change(within(form).getByLabelText('Title'), {
      target: { value: 'Fictional signed Contract CTR-29 v2' },
    });
    fireEvent.change(within(form).getByLabelText('Purpose'), {
      target: { value: 'Keep the fictional signed original' },
    });
    fireEvent.change(within(form).getByLabelText('Declared source'), {
      target: { value: 'Fictional courier delivery' },
    });
    fireEvent.click(
      within(form).getByRole('button', {
        name: 'Register received Contract PDF',
      }),
    );

    const panel = await screen.findByRole('dialog', {
      name: 'Fictional signed Contract CTR-29 v2',
    });
    expect(
      await within(panel).findByText('Fictional courier delivery'),
    ).toBeInTheDocument();
    expect(bodies).toContainEqual(
      expect.objectContaining({
        type: 'received-contract',
        contractVersionId: clarteContractSource.contractVersionId,
      }),
    );
    expect(registeredDocumentId(1)).toBeTruthy();
  });

  it('offers the received Addendum and external Invoice registrations with their exact Contract sources', async () => {
    const holder: ActorContext = clarteDocumentsActor();
    const company = holder.activeCompany;
    if (!company) throw new Error('Missing fixture Company');
    const actor: ActorContext = {
      ...holder,
      workspacePermissions: ['client.manage'],
      activeCompany: {
        ...company,
        receivedAddendumClientReadCapture:
          'received-addendum-client-read.v1.' + 'a'.repeat(64),
        grants: withCompanyGrants(
          company.grants,
          {
            bundle: 'company_received_addendum_access',
            version: 'v1',
            assignmentId: '00000000-0000-4000-8000-000000001920',
          },
          {
            bundle: 'company_external_invoice_access',
            version: 'v1',
            assignmentId: '00000000-0000-4000-8000-000000001921',
          },
          {
            bundle: 'company_invoice_recorder',
            version: 'v1',
            assignmentId: '00000000-0000-4000-8000-000000001922',
          },
        ),
      },
    };
    serve({ actor });
    openDocuments();
    fireEvent.click(
      await within(await registerLoaded()).findByRole('button', {
        name: 'Register a Document',
      }),
    );
    const form = screen.getByRole('dialog', { name: 'Register a Document' });

    selectOptionByLabel(
      within(form).getByLabelText('Document family'),
      'Received Addendum PDF',
    );
    const parent = await within(form).findByLabelText(
      'Exact executed parent Contract Version',
    );
    await waitFor(() => expect(parent).not.toBeDisabled());
    changeValue(parent, clarteAddendumSource.parentContractVersionId);
    expect(
      within(form).getByRole('button', {
        name: 'Register received Addendum PDF',
      }),
    ).toBeInTheDocument();

    selectOptionByLabel(
      within(form).getByLabelText('Document family'),
      'External invoice PDF',
    );
    const declared = await within(form).findByLabelText(
      'Exact declared Contract Version and receiving party',
    );
    await waitFor(() => expect(declared).not.toBeDisabled());
    changeValue(declared, clarteInvoiceSource.contractVersionId);
    expect(
      within(form).getByRole('button', {
        name: 'Register external invoice PDF',
      }),
    ).toBeInTheDocument();
  });

  it('associates working Documents with a Project, removes one and opens another', async () => {
    const { api } = serve();
    openDocuments();
    fireEvent.click(
      await within(await registerLoaded()).findByRole('button', {
        name: 'Documents of a Project',
      }),
    );
    const organizer = screen.getByRole('dialog', {
      name: 'Documents of a Project',
    });
    changeValue(
      await within(organizer).findByLabelText('Project'),
      clarteDocumentsProject.id,
    );
    const linked = await within(organizer).findByRole('region', {
      name: 'Working Documents',
    });
    await within(linked).findByRole('heading', {
      name: 'Fictional initial assessment questionnaire',
    });
    fireEvent.click(
      within(linked).getByRole('button', { name: 'Attach working Document' }),
    );
    fireEvent.click(
      await within(linked).findByRole('button', {
        name: 'Attach Fictional stage 1 audit report',
      }),
    );
    await within(linked).findByRole('heading', {
      name: 'Fictional stage 1 audit report',
    });
    fireEvent.click(
      within(linked).getByRole('button', {
        name: 'Remove Fictional initial assessment questionnaire',
      }),
    );
    await waitFor(() =>
      expect(
        within(linked).queryByRole('heading', {
          name: 'Fictional initial assessment questionnaire',
        }),
      ).toBeNull(),
    );
    expect(writesTo(api, '/project-association')).toEqual([
      `POST /api/documents/${seededDocumentIds.report}/project-association`,
      `POST /api/documents/${seededDocumentIds.questionnaire}/project-association`,
    ]);

    fireEvent.click(
      within(linked).getByRole('button', { name: 'Open Document' }),
    );
    const panel = await screen.findByRole('dialog', {
      name: 'Fictional stage 1 audit report',
    });
    expect(
      within(panel).getByText(clarteDocumentsProject.title),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('dialog', { name: 'Documents of a Project' }),
    ).toBeNull();
  });

  it('opens Project association from the Document details and shows the confirmed link', async () => {
    const { bodies } = serve();
    openDocuments();
    const panel = await openDocument('Fictional stage 1 audit report');
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Associate with a Project' }),
    );
    const organizer = screen.getByRole('dialog', {
      name: 'Associate with a Project',
    });
    changeValue(
      await within(organizer).findByLabelText('Project'),
      clarteDocumentsProject.id,
    );
    const linked = await within(organizer).findByRole('region', {
      name: 'Working Documents',
    });
    fireEvent.click(
      await within(linked).findByRole('button', {
        name: 'Attach working Document',
      }),
    );
    fireEvent.click(
      await within(linked).findByRole('button', {
        name: 'Attach Fictional stage 1 audit report',
      }),
    );
    await within(linked).findByRole('heading', {
      name: 'Fictional stage 1 audit report',
    });
    expect(bodies).toContainEqual({
      projectId: clarteDocumentsProject.id,
      action: 'link',
      expectedRevision: 3,
    });
    fireEvent.click(within(organizer).getByRole('button', { name: 'Close' }));
    expect(
      await within(panel).findByText(clarteDocumentsProject.title),
    ).toBeVisible();
  });

  it('shows the empty register when nothing is registered yet', async () => {
    serve({ documents: 'none' });
    openDocuments();
    expect(
      await within(await registerLoaded()).findByText(
        'No working references registered yet.',
      ),
    ).toBeInTheDocument();
  });

  it.each([
    {
      status: 500,
      message: 'Working references could not be loaded or saved. Please retry.',
    },
    {
      status: 403,
      message: 'You do not have access to working Documents in this Company.',
    },
  ])(
    'says so when the register read answers $status',
    async ({ status, message }) => {
      serve({ listStatus: status });
      openDocuments();
      expect(
        await within(await registerLoaded()).findByRole('alert'),
      ).toHaveTextContent(message);
    },
  );
});

describe('Clarté Knowledge view', () => {
  it('verifies the exact passage before downloading its PDF directly from a result', async () => {
    const { reads } = serve();
    openDocuments('#knowledge-evidence');
    fireEvent.change(
      await screen.findByRole('textbox', { name: 'Literal search' }),
      {
        target: { value: 'accredited laboratory' },
      },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Search passages' }));
    const passages = await screen.findByRole('region', {
      name: 'Passages found',
    });
    fireEvent.click(
      within(passages).getByRole('button', {
        name: 'Download exact source PDF',
      }),
    );
    await waitFor(() => expect(downloads).toEqual(['knowledge-source.pdf']));
    const { sourceId, documentId, documentVersionId, representationId } =
      clarteKnowledgeSource;
    expect(
      reads.filter(
        (path) => path.includes(sourceId) || path.includes(documentId),
      ),
    ).toEqual([
      `/api/knowledge/evidence/sources/${sourceId}/passages/section%204.2`,
      `/api/documents/${documentId}/versions/${documentVersionId}/content/${representationId}`,
    ]);
  });

  it('searches a literal passage, reopens its exact cited version and downloads its verified source PDF', async () => {
    serve();
    openDocuments('#knowledge-evidence');
    const view = await screen.findByRole('region', {
      name: 'Knowledge base',
    });
    const inventory = await within(view).findByRole('region', {
      name: 'Current sources',
    });
    expect(inventory).toHaveTextContent(clarteKnowledgeSource.title);

    fireEvent.change(
      within(view).getByRole('textbox', { name: 'Literal search' }),
      {
        target: { value: 'accredited laboratory' },
      },
    );
    fireEvent.click(
      within(view).getByRole('button', { name: 'Search passages' }),
    );
    const passages = await within(view).findByRole('region', {
      name: 'Passages found',
    });
    expect(passages).toHaveTextContent(clartePassageText);
    fireEvent.click(
      within(passages).getByRole('button', { name: 'Open passage' }),
    );

    const citation = await within(view).findByRole('article', {
      name: clarteKnowledgeSource.title,
    });
    const passage = within(citation).getByText(clartePassageText);
    const locator = within(citation).getByText('Locator');
    expect(passage.compareDocumentPosition(locator)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    fireEvent.click(
      within(citation).getByRole('button', {
        name: 'Reopen this cited version — ' + clarteKnowledgeSource.title,
      }),
    );
    await within(view).findByText('Historical evidence');
    fireEvent.click(
      within(
        within(view).getByRole('article', {
          name: clarteKnowledgeSource.title,
        }),
      ).getByRole('button', { name: 'Download exact source PDF' }),
    );
    await waitFor(() => expect(downloads).toEqual(['knowledge-source.pdf']));
  });

  it('refuses a literal search longer than 200 characters', async () => {
    serve();
    openDocuments('#knowledge-evidence');
    const view = await screen.findByRole('region', {
      name: 'Knowledge base',
    });
    fireEvent.change(
      within(view).getByRole('textbox', { name: 'Literal search' }),
      {
        target: { value: 'x'.repeat(201) },
      },
    );
    fireEvent.click(
      within(view).getByRole('button', { name: 'Search passages' }),
    );
    expect(await within(view).findByRole('alert')).toHaveTextContent(
      'Enter 1–200 characters of nonblank literal text.',
    );
  });
});
