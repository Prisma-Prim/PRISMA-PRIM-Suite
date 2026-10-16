import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActorContext } from '../access-types';
import { InterfaceLocaleProvider } from '../localization/interface-locale';
import { deterministicBrowserIdentity } from '../access-composition';
import { DocumentVersions } from './DocumentVersions';

const actor: ActorContext = {
  internalUserId: 'user',
  workspaceMembershipId: 'member',
  workspaceId: 'workspace',
  workspaceName: 'Workspace DEMO',
  displayName: 'PDF Member DEMO',
  email: 'pdf@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: 'company',
    displayName: 'Company DEMO',
    clientPermissions: ['client.read'],
    documentPermissionSetVersion: 'v3',
    documentPermissions: [
      'document.read',
      'document.register',
      'document.reference.read',
      'document.correct',
      'document.version.manage',
      'document.content.read',
      'document.content.upload',
    ],
    documentContentReaderAssignmentId: 'reader-assignment',
    documentContentReaderPermissionSetVersion: 'v1',
    documentContentUploaderAssignmentId: 'uploader-assignment',
    documentContentUploaderPermissionSetVersion: 'v1',
  },
};
const AT = '2026-10-16T12:00:00.000Z';
function versionRead(stored: boolean, size: number, revision = stored ? 2 : 1) {
  return {
    workingRevision: revision,
    mutable: true,
    versions: [
      {
        id: 'version',
        number: 1,
        status: 'draft',
        createdAt: AT,
        createdBy: { displayName: 'PDF Member DEMO' },
        representations: [
          {
            id: 'reference',
            kind: 'external-reference',
            verification: 'unverified',
            position: 1,
            form: 'other',
            primary: true,
            appendedAfterDesignation: false,
            addedAt: AT,
            addedBy: { displayName: 'PDF Member DEMO' },
            access: 'granted',
            url: 'https://example.test/questionnaire',
          },
        ],
        pdfContent: stored
          ? {
              state: 'stored',
              access: 'granted',
              representationId: 'pdf',
              revision,
              fileName: 'questionnaire.pdf',
              mediaType: 'application/pdf',
              size,
              sha256: 'a'.repeat(64),
              storedAt: AT,
              storedBy: { displayName: 'PDF Member DEMO' },
              scan: { outcome: 'clean', engine: 'ClamAV 1.4.3', scannedAt: AT },
            }
          : { state: 'absent' },
      },
    ],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});
describe('Stored questionnaire PDF through Document Versions', () => {
  it('offers Romanian upload and reopens the preserved file after a confirmed upload', async () => {
    const file = new File(['%PDF-1.4\nDEMO\n%%EOF\n'], 'questionnaire.pdf', {
      type: 'application/pdf',
    });
    const writes: Array<{ path: string; request: RequestInit | undefined }> =
      [];
    let stored = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, request?: RequestInit) => {
        const path = String(input);
        if (
          path === '/api/documents/document/versions' &&
          (request?.method ?? 'GET') === 'GET'
        )
          return Response.json(versionRead(stored, file.size));
        if (
          path.startsWith(
            '/api/documents/document/versions/version/content?',
          ) &&
          request?.method === 'POST'
        ) {
          writes.push({ path, request });
          stored = true;
          return Response.json(
            {
              action: 'representation_added',
              documentId: 'document',
              versionId: 'version',
              versionNumber: 1,
              workingRevision: 2,
              representationId: 'pdf',
              appendedAfterDesignation: false,
            },
            { status: 201 },
          );
        }
        throw new Error(`Unexpected request: ${path}`);
      }),
    );
    render(
      <InterfaceLocaleProvider>
        <DocumentVersions
          actor={actor}
          identity={deterministicBrowserIdentity()}
          documentId="document"
          workingRevision={1}
          onRefresh={() => undefined}
        />
      </InterfaceLocaleProvider>,
    );
    const input = await screen.findByLabelText('Alege fișierul PDF');
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Păstrează PDF-ul' }));
    await screen.findByRole('button', { name: 'Descarcă PDF-ul Versiunii 1' });
    expect(screen.getByText('questionnaire.pdf')).toBeVisible();
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]?.request?.body).toBe(file);
    expect(writes[0]?.path).toBe(
      '/api/documents/document/versions/version/content?expectedRevision=1&fileName=questionnaire.pdf',
    );
    expect(
      new Headers(writes[0]?.request?.headers).get('idempotency-key'),
    ).toMatch(/\S/u);
  });
  it('retries an uncertain upload with the exact original file, URL and idempotency key', async () => {
    const file = new File(['%PDF-1.4\nDEMO\n%%EOF\n'], 'questionnaire.pdf', {
      type: 'application/pdf',
    });
    const writes: Array<{ path: string; request: RequestInit | undefined }> =
      [];
    let stored = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, request?: RequestInit) => {
        const path = String(input);
        if (path === '/api/documents/document/versions')
          return Response.json(versionRead(stored, file.size));
        if (path.includes('/content?') && request?.method === 'POST') {
          writes.push({ path, request });
          stored = true;
          if (writes.length === 1)
            throw new Error('Lost response after commit');
          return Response.json(
            {
              action: 'representation_added',
              documentId: 'document',
              versionId: 'version',
              versionNumber: 1,
              workingRevision: 2,
              representationId: 'pdf',
              appendedAfterDesignation: false,
            },
            { status: 201 },
          );
        }
        throw new Error(`Unexpected request: ${path}`);
      }),
    );
    render(
      <InterfaceLocaleProvider>
        <DocumentVersions
          actor={actor}
          identity={deterministicBrowserIdentity()}
          documentId="document"
          workingRevision={1}
          onRefresh={() => undefined}
        />
      </InterfaceLocaleProvider>,
    );
    fireEvent.change(await screen.findByLabelText('Alege fișierul PDF'), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Păstrează PDF-ul' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reîncearcă același PDF' }),
    );
    await screen.findByRole('button', { name: 'Descarcă PDF-ul Versiunii 1' });
    expect(writes).toHaveLength(2);
    expect(writes[1]?.path).toBe(writes[0]?.path);
    expect(writes[0]?.request?.body).toBe(file);
    expect(writes[1]?.request?.body).toBe(file);
    expect(
      new Headers(writes[1]?.request?.headers).get('idempotency-key'),
    ).toBe(new Headers(writes[0]?.request?.headers).get('idempotency-key'));
  });
  it('does not dispatch a PDF intention when its owner retires while obtaining the token', async () => {
    const file = new File(['%PDF-1.4\nDEMO\n%%EOF\n'], 'questionnaire.pdf', {
      type: 'application/pdf',
    });
    const pending: { complete?: (token: string) => void } = {};
    const waiting = new Promise<string>((resolve) => {
      pending.complete = resolve;
    });
    let tokenRequests = 0;
    const identity = {
      ...deterministicBrowserIdentity(),
      getToken: () => {
        tokenRequests += 1;
        return tokenRequests === 2
          ? waiting
          : Promise.resolve('synthetic-token');
      },
    };
    const writes: string[] = [];
    const onRefresh = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, request?: RequestInit) => {
        const path = String(input);
        if (path === '/api/documents/document/versions')
          return Response.json(versionRead(false, file.size));
        if (path.includes('/content?') && request?.method === 'POST') {
          writes.push(path);
          return Response.json(
            {
              action: 'representation_added',
              documentId: 'document',
              versionId: 'version',
              versionNumber: 1,
              workingRevision: 2,
              representationId: 'pdf',
              appendedAfterDesignation: false,
            },
            { status: 201 },
          );
        }
        throw new Error(`Unexpected request: ${path}`);
      }),
    );
    function view(currentActor: ActorContext) {
      return (
        <InterfaceLocaleProvider>
          <DocumentVersions
            actor={currentActor}
            identity={identity}
            documentId="document"
            workingRevision={1}
            onRefresh={onRefresh}
          />
        </InterfaceLocaleProvider>
      );
    }
    const rendered = render(view(actor));
    const previousInput = await screen.findByLabelText('Alege fișierul PDF');
    fireEvent.change(previousInput, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Păstrează PDF-ul' }));
    await waitFor(() => expect(tokenRequests).toBe(2));
    rendered.rerender(
      view({
        ...actor,
        activeCompany: {
          ...actor.activeCompany,
          id: 'company',
          displayName: 'Company DEMO',
          documentContentReaderAssignmentId: 'replacement-reader-assignment',
        },
      }),
    );
    await waitFor(() => expect(previousInput).not.toBeInTheDocument());
    await act(async () => {
      pending.complete?.('synthetic-late-token');
      await waiting;
    });
    expect(writes).toEqual([]);
    expect(onRefresh).not.toHaveBeenCalled();
    await screen.findByLabelText('Alege fișierul PDF');
    expect(
      screen.getByRole('button', { name: 'Păstrează PDF-ul' }),
    ).toBeDisabled();
    expect(
      screen.queryByText('PDF-ul a fost păstrat.'),
    ).not.toBeInTheDocument();
  });
  it('retires a pending upload when the captured Reader assignment changes even with identical permission bits', async () => {
    const file = new File(['%PDF-1.4\nDEMO\n%%EOF\n'], 'questionnaire.pdf', {
      type: 'application/pdf',
    });
    const pending: { complete?: (response: Response) => void } = {};
    const waiting = new Promise<Response>((resolve) => {
      pending.complete = resolve;
    });
    let submitted = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, request?: RequestInit) => {
        const path = String(input);
        if (path === '/api/documents/document/versions')
          return Response.json(versionRead(false, file.size));
        if (path.includes('/content?') && request?.method === 'POST') {
          submitted = true;
          return waiting;
        }
        throw new Error(`Unexpected request: ${path}`);
      }),
    );
    const identity = deterministicBrowserIdentity();
    const onRefresh = vi.fn();
    const view = render(
      <InterfaceLocaleProvider>
        <DocumentVersions
          actor={actor}
          identity={identity}
          documentId="document"
          workingRevision={1}
          onRefresh={onRefresh}
        />
      </InterfaceLocaleProvider>,
    );
    fireEvent.change(await screen.findByLabelText('Alege fișierul PDF'), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Păstrează PDF-ul' }));
    await waitFor(() => expect(submitted).toBe(true));
    const company = actor.activeCompany;
    if (!company) throw new Error('Expected test Company.');
    const regranted: ActorContext = {
      ...actor,
      activeCompany: {
        ...company,
        documentContentReaderAssignmentId: 'new-reader-assignment',
      },
    };
    view.rerender(
      <InterfaceLocaleProvider>
        <DocumentVersions
          actor={regranted}
          identity={identity}
          documentId="document"
          workingRevision={1}
          onRefresh={onRefresh}
        />
      </InterfaceLocaleProvider>,
    );
    await screen.findByLabelText('Alege fișierul PDF');
    await act(async () => {
      pending.complete?.(
        Response.json(
          {
            action: 'representation_added',
            documentId: 'document',
            versionId: 'version',
            versionNumber: 1,
            workingRevision: 2,
            representationId: 'pdf',
            appendedAfterDesignation: false,
          },
          { status: 201 },
        ),
      );
      await waiting;
    });
    expect(onRefresh).not.toHaveBeenCalled();
    expect(
      screen.queryByText('PDF-ul a fost păstrat.'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Descarcă PDF-ul Versiunii 1' }),
    ).not.toBeInTheDocument();
  });

  it('explains a malware scan refusal without claiming preservation or hiding it as a filename error', async () => {
    const file = new File(['%PDF-1.4\nDEMO\n%%EOF\n'], 'questionnaire.pdf', {
      type: 'application/pdf',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, request?: RequestInit) => {
        const path = String(input);
        if (path === '/api/documents/document/versions')
          return Response.json(versionRead(false, file.size));
        if (path.includes('/content?') && request?.method === 'POST')
          return Response.json(
            {
              code: 'document_pdf_unsafe',
              message: 'The questionnaire PDF failed the malware scan.',
            },
            { status: 400 },
          );
        throw new Error(`Unexpected request: ${path}`);
      }),
    );
    render(
      <InterfaceLocaleProvider>
        <DocumentVersions
          actor={actor}
          identity={deterministicBrowserIdentity()}
          documentId="document"
          workingRevision={1}
          onRefresh={() => undefined}
        />
      </InterfaceLocaleProvider>,
    );
    fireEvent.change(await screen.findByLabelText('Alege fișierul PDF'), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Păstrează PDF-ul' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'PDF-ul nu a trecut verificarea antivirus. Alege un alt fișier.',
    );
    expect(
      screen.queryByText('PDF-ul a fost păstrat.'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Descarcă PDF-ul Versiunii 1' }),
    ).not.toBeInTheDocument();
  });
  it('waits for the fresh Versions read after a confirmed upload before allowing a replacement intention', async () => {
    const file = new File(['%PDF-1.4\nDEMO\n%%EOF\n'], 'questionnaire.pdf', {
      type: 'application/pdf',
    });
    const pending: { complete?: (response: Response) => void } = {};
    const waiting = new Promise<Response>((resolve) => {
      pending.complete = resolve;
    });
    let reads = 0;
    const paths: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, request?: RequestInit) => {
        const path = String(input);
        if (path === '/api/documents/document/versions') {
          reads += 1;
          if (reads === 2) return waiting;
          return Response.json(
            versionRead(paths.length > 0, file.size, paths.length + 1),
          );
        }
        if (path.includes('/content?') && request?.method === 'POST') {
          paths.push(path);
          return Response.json(
            {
              action: 'representation_added',
              documentId: 'document',
              versionId: 'version',
              versionNumber: 1,
              workingRevision: paths.length + 1,
              representationId: 'pdf',
              appendedAfterDesignation: false,
            },
            { status: 201 },
          );
        }
        throw new Error(`Unexpected request: ${path}`);
      }),
    );
    render(
      <InterfaceLocaleProvider>
        <DocumentVersions
          actor={actor}
          identity={deterministicBrowserIdentity()}
          documentId="document"
          workingRevision={1}
          onRefresh={() => undefined}
        />
      </InterfaceLocaleProvider>,
    );
    fireEvent.change(await screen.findByLabelText('Alege fișierul PDF'), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Păstrează PDF-ul' }));
    await waitFor(() => expect(reads).toBe(2));
    try {
      expect(
        screen.queryByLabelText('Alege fișierul PDF'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Păstrează PDF-ul' }),
      ).not.toBeInTheDocument();
    } finally {
      await act(async () => {
        pending.complete?.(Response.json(versionRead(true, file.size, 2)));
        await waiting;
      });
    }
    const input = await screen.findByLabelText('Alege fișierul PDF');
    expect(
      screen.getByRole('button', { name: 'Păstrează PDF-ul' }),
    ).toBeDisabled();
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Păstrează PDF-ul' }));
    await waitFor(() => expect(paths).toHaveLength(2));
    expect(paths).toEqual([
      '/api/documents/document/versions/version/content?expectedRevision=1&fileName=questionnaire.pdf',
      '/api/documents/document/versions/version/content?expectedRevision=2&fileName=questionnaire.pdf',
    ]);
    await screen.findByRole('button', { name: 'Descarcă PDF-ul Versiunii 1' });
  });
  it('waits for the fresh Versions read after a conflict before allowing a new PDF intention', async () => {
    const file = new File(['%PDF-1.4\nDEMO\n%%EOF\n'], 'questionnaire.pdf', {
      type: 'application/pdf',
    });
    const pending: { complete?: (response: Response) => void } = {};
    const waiting = new Promise<Response>((resolve) => {
      pending.complete = resolve;
    });
    let reads = 0;
    const paths: string[] = [];
    let stored = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, request?: RequestInit) => {
        const path = String(input);
        if (path === '/api/documents/document/versions') {
          reads += 1;
          if (reads === 2) return waiting;
          return Response.json(versionRead(stored, file.size, stored ? 4 : 1));
        }
        if (path.includes('/content?') && request?.method === 'POST') {
          paths.push(path);
          if (paths.length === 1)
            return Response.json(
              { code: 'document_working_revision_conflict' },
              { status: 409 },
            );
          stored = true;
          return Response.json(
            {
              action: 'representation_added',
              documentId: 'document',
              versionId: 'version',
              versionNumber: 1,
              workingRevision: 4,
              representationId: 'pdf',
              appendedAfterDesignation: false,
            },
            { status: 201 },
          );
        }
        throw new Error(`Unexpected request: ${path}`);
      }),
    );
    render(
      <InterfaceLocaleProvider>
        <DocumentVersions
          actor={actor}
          identity={deterministicBrowserIdentity()}
          documentId="document"
          workingRevision={1}
          onRefresh={() => undefined}
        />
      </InterfaceLocaleProvider>,
    );
    fireEvent.change(await screen.findByLabelText('Alege fișierul PDF'), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Păstrează PDF-ul' }));
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Reîncarcă Documentul și Versiunile',
      }),
    );
    await waitFor(() => expect(reads).toBe(2));
    try {
      expect(
        screen.queryByLabelText('Alege fișierul PDF'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Păstrează PDF-ul' }),
      ).not.toBeInTheDocument();
    } finally {
      await act(async () => {
        pending.complete?.(Response.json(versionRead(false, file.size, 3)));
        await waiting;
      });
    }
    const input = await screen.findByLabelText('Alege fișierul PDF');
    expect(
      screen.getByRole('button', { name: 'Păstrează PDF-ul' }),
    ).toBeDisabled();
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Păstrează PDF-ul' }));
    await screen.findByRole('button', { name: 'Descarcă PDF-ul Versiunii 1' });
    expect(paths).toEqual([
      '/api/documents/document/versions/version/content?expectedRevision=1&fileName=questionnaire.pdf',
      '/api/documents/document/versions/version/content?expectedRevision=3&fileName=questionnaire.pdf',
    ]);
  });
});
