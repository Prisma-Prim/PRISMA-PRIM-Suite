import { grantOf } from '../access/company-grants';
import { Blob as NodeBlob } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { useState } from 'react';
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
import {
  deterministicBrowserIdentity,
  type BrowserIdentity,
} from '../access-composition';
import { DocumentVersions } from './DocumentVersions';
import { documentGrants } from './document-grants.test-fixture';
import {
  withCompanyGrants,
  withoutCompanyGrants,
} from '../access/company-grants.test-fixture';

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

    grants: withCompanyGrants(
      documentGrants(
        [
          'document.read',
          'document.register',
          'document.reference.read',
          'document.correct',
          'document.version.manage',
          'document.content.read',
          'document.content.upload',
        ],
        {
          company_document_content_reader: 'reader-assignment',
          company_document_content_uploader: 'uploader-assignment',
        },
      ),
      {
        bundle: 'company_director_client_access',
        version: 'v1',
        assignmentId:
          grantOf(
            {
              grants: documentGrants(
                [
                  'document.read',
                  'document.register',
                  'document.reference.read',
                  'document.correct',
                  'document.version.manage',
                  'document.content.read',
                  'document.content.upload',
                ],
                {
                  company_document_content_reader: 'reader-assignment',
                  company_document_content_uploader: 'uploader-assignment',
                },
              ),
            },
            'company_director_client_access',
          )?.assignmentId ?? 'fixture-client-access',
      },
    ),
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});
describe('Stored questionnaire PDF through Document Versions', () => {
  it('withholds protected PDF metadata immediately when Reader authority changes before the replacement read completes', async () => {
    const pending: { complete?: (value: Response) => void } = {};
    const waiting = new Promise<Response>((resolve) => {
      pending.complete = resolve;
    });
    let reads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) !== '/api/documents/document/versions')
          throw new Error('Unexpected protected Document request');
        reads += 1;
        return reads === 1 ? Response.json(versionRead(true, 20)) : waiting;
      }),
    );
    const identity = deterministicBrowserIdentity();
    function view(currentActor: ActorContext) {
      return (
        <InterfaceLocaleProvider>
          <DocumentVersions
            actor={currentActor}
            identity={identity}
            documentId="document"
            workingRevision={2}
            onRefresh={() => undefined}
          />
        </InterfaceLocaleProvider>
      );
    }
    const rendered = render(view(actor));
    await screen.findByText('questionnaire.pdf');
    const company = actor.activeCompany;
    if (!company) throw new Error('Expected the native Reader Company');
    rendered.rerender(
      view({
        ...actor,
        activeCompany: {
          ...company,
          grants: withoutCompanyGrants(
            company.grants,
            'company_document_content_reader',
          ),
        },
      }),
    );
    await waitFor(() => expect(reads).toBe(2));
    try {
      expect(screen.queryByText('questionnaire.pdf')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Descarcă PDF-ul Versiunii 1' }),
      ).not.toBeInTheDocument();
    } finally {
      await act(async () => {
        if (!pending.complete)
          throw new Error('Expected the replacement Versions read');
        const read = versionRead(true, 20);
        pending.complete(
          Response.json({
            ...read,
            versions: read.versions.map((version) => ({
              ...version,
              pdfContent: { state: 'stored', access: 'denied' },
            })),
          }),
        );
        await waiting;
      });
    }
  });
  it('finishes an immutable download and retains its confirmed upload while the fresh Versions read fails', async () => {
    const bytes = new TextEncoder().encode('%PDF-1.4\nDEMO\n%%EOF\n');
    const replacement = new File(
      ['%PDF-1.4\nDEMO B\n%%EOF\n'],
      'replacement.pdf',
      {
        type: 'application/pdf',
      },
    );
    vi.stubGlobal('Blob', NodeBlob);
    vi.stubGlobal('crypto', webcrypto);
    const originalURL = URL;
    const created = vi.fn(() => 'blob:original');
    vi.stubGlobal(
      'URL',
      class extends originalURL {
        static createObjectURL = created;
        static revokeObjectURL = vi.fn();
      },
    );
    const downloaded: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloaded.push(this.download);
    });
    const pending: { complete?: (value: Response) => void } = {};
    const original = new Promise<Response>((resolve) => {
      pending.complete = resolve;
    });
    let downloadStarted = false;
    let reads = 0;
    let writes = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, request?: RequestInit) => {
        const path = String(input);
        if (path === '/api/documents/document/versions') {
          reads += 1;
          if (reads > 1) return new Response(null, { status: 503 });
          const read = versionRead(true, bytes.length);
          return Response.json({
            ...read,
            versions: read.versions.map((version) => ({
              ...version,
              pdfContent: {
                ...version.pdfContent,
                sha256:
                  'c7f9f3b4275952b9ffc96ecdc4966176f09c2fe7e150ff32e8b9f2fc69e8644f',
              },
            })),
          });
        }
        if (path.endsWith('/content/pdf')) {
          downloadStarted = true;
          return original;
        }
        if (path.includes('/content?') && request?.method === 'POST') {
          writes += 1;
          return Response.json(
            {
              action: 'representation_added',
              documentId: 'document',
              versionId: 'version',
              versionNumber: 1,
              workingRevision: 3,
              representationId: 'replacement',
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
          workingRevision={2}
          onRefresh={() => undefined}
        />
      </InterfaceLocaleProvider>,
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Descarcă PDF-ul Versiunii 1',
      }),
    );
    await waitFor(() => expect(downloadStarted).toBe(true));
    fireEvent.change(screen.getByLabelText('Alege fișierul PDF'), {
      target: { files: [replacement] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Păstrează PDF-ul' }));
    await screen.findByRole('alert');
    await act(async () => {
      if (!pending.complete)
        throw new Error('Expected the held original PDF response');
      pending.complete(
        new Response(bytes, {
          headers: {
            'content-type': 'application/pdf',
            'content-length': String(bytes.length),
          },
        }),
      );
      await original;
    });
    await waitFor(() => expect(downloaded).toEqual(['questionnaire.pdf']));
    expect(created).toHaveBeenCalledTimes(1);
    expect(screen.getByText('PDF-ul a fost păstrat.')).toBeVisible();
    expect(
      screen.queryByLabelText('Alege fișierul PDF'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Reîncearcă același PDF' }),
    ).not.toBeInTheDocument();
    expect(writes).toBe(1);
  });
  it('keeps the Reader available after a refused upload revalidates the loss of Uploader only', async () => {
    const company = actor.activeCompany;
    if (!company) throw new Error('Expected the PDF Company');
    const replacement: ActorContext = {
      ...actor,
      activeCompany: {
        ...company,
        grants: withoutCompanyGrants(
          company.grants,
          'company_document_content_uploader',
        ),
      },
    };
    const revalidated = vi.fn();
    const file = new File(['%PDF-1.4\nDEMO\n%%EOF\n'], 'replacement.pdf', {
      type: 'application/pdf',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, request?: RequestInit) => {
        const path = String(input);
        if (path === '/api/documents/document/versions')
          return Response.json(versionRead(true, file.size));
        if (path.includes('/content?') && request?.method === 'POST')
          return new Response(null, { status: 403 });
        if (path.startsWith('/api/access/current-actor'))
          return Response.json(replacement);
        throw new Error(`Unexpected public PDF request: ${path}`);
      }),
    );
    const identity = deterministicBrowserIdentity();
    function CurrentDocument() {
      const [current, setCurrent] = useState(actor);
      return (
        <InterfaceLocaleProvider>
          <DocumentVersions
            actor={current}
            identity={identity}
            documentId="document"
            workingRevision={2}
            onRefresh={() => undefined}
            onActorRevalidated={(next) => {
              revalidated(next);
              setCurrent(next);
            }}
          />
        </InterfaceLocaleProvider>
      );
    }
    render(<CurrentDocument />);
    fireEvent.change(await screen.findByLabelText('Alege fișierul PDF'), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Păstrează PDF-ul' }));
    await waitFor(() => expect(revalidated).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByLabelText('Alege fișierul PDF'),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole('button', {
        name: 'Descarcă PDF-ul Versiunii 1',
      }),
    ).toBeEnabled();
    expect(screen.getByText('questionnaire.pdf')).toBeVisible();
  });
  it('keeps an ordinary Reader download alive across an unrelated Uploader replacement', async () => {
    const bytes = new TextEncoder().encode('%PDF-1.4\nDEMO\n%%EOF\n');
    vi.stubGlobal('Blob', NodeBlob);
    vi.stubGlobal('crypto', webcrypto);
    const originalURL = URL;
    const created = vi.fn(() => 'blob:questionnaire');
    const revoked = vi.fn();
    vi.stubGlobal(
      'URL',
      class extends originalURL {
        static createObjectURL = created;
        static revokeObjectURL = revoked;
      },
    );
    const clicked = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const pending: { complete?: (value: Response) => void } = {};
    const response = new Promise<Response>((resolve) => {
      pending.complete = resolve;
    });
    let downloadStarted = false;
    let versionReads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);
        if (path === '/api/documents/document/versions') {
          versionReads += 1;
          const read = versionRead(true, bytes.length);
          return Response.json({
            ...read,
            versions: read.versions.map((version) => ({
              ...version,
              pdfContent: {
                ...version.pdfContent,
                sha256:
                  'c7f9f3b4275952b9ffc96ecdc4966176f09c2fe7e150ff32e8b9f2fc69e8644f',
              },
            })),
          });
        }
        if (path.endsWith('/content/pdf')) {
          downloadStarted = true;
          return response;
        }
        throw new Error(`Unexpected request: ${path}`);
      }),
    );
    const identity = deterministicBrowserIdentity();
    function view(currentActor: ActorContext) {
      return (
        <InterfaceLocaleProvider>
          <DocumentVersions
            actor={currentActor}
            identity={identity}
            documentId="document"
            workingRevision={2}
            onRefresh={() => undefined}
          />
        </InterfaceLocaleProvider>
      );
    }
    const rendered = render(view(actor));
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Descarcă PDF-ul Versiunii 1',
      }),
    );
    await waitFor(() => expect(downloadStarted).toBe(true));
    const company = actor.activeCompany;
    if (!company) throw new Error('Expected test Company');
    rendered.rerender(
      view({
        ...actor,
        activeCompany: {
          ...company,
          grants: withCompanyGrants(company.grants, {
            bundle: 'company_document_content_uploader',
            version: 'v1',
            assignmentId: 'new-uploader',
          }),
        },
      }),
    );
    await act(async () => {
      pending.complete?.(
        new Response(bytes, {
          headers: {
            'content-type': 'application/pdf',
            'content-length': String(bytes.length),
          },
        }),
      );
      await response;
    });
    await waitFor(() => expect(clicked).toHaveBeenCalledTimes(1));
    expect(created).toHaveBeenCalledTimes(1);
    expect(revoked).toHaveBeenCalledWith('blob:questionnaire');
    expect(versionReads).toBe(1);
  });
  it('retires an ordinary PDF upload before dispatch when its identity changes during token lookup', async () => {
    const file = new File(['%PDF-1.4\nDEMO\n%%EOF\n'], 'questionnaire.pdf', {
      type: 'application/pdf',
    });
    const token: { resolve?: (value: string) => void } = {};
    const waiting = new Promise<string>((resolve) => {
      token.resolve = resolve;
    });
    let tokenRequests = 0;
    const firstIdentity = {
      ...deterministicBrowserIdentity(),
      getToken: () => {
        tokenRequests += 1;
        return tokenRequests === 2 ? waiting : Promise.resolve('first');
      },
    };
    const replacementIdentity = deterministicBrowserIdentity();
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
          return new Response(null, { status: 503 });
        }
        throw new Error(`Unexpected request: ${path}`);
      }),
    );
    function view(identity: BrowserIdentity) {
      return (
        <InterfaceLocaleProvider>
          <DocumentVersions
            actor={actor}
            identity={identity}
            documentId="document"
            workingRevision={1}
            onRefresh={onRefresh}
          />
        </InterfaceLocaleProvider>
      );
    }
    const rendered = render(view(firstIdentity));
    fireEvent.change(await screen.findByLabelText('Alege fișierul PDF'), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Păstrează PDF-ul' }));
    await waitFor(() => expect(tokenRequests).toBe(2));
    rendered.rerender(view(replacementIdentity));
    await act(async () => {
      token.resolve?.('retired-identity-token');
      await waiting;
    });
    expect(writes).toEqual([]);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Păstrează PDF-ul' }),
    ).toBeDisabled();
  });
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
  it('reports a documented scanner outage as unavailable and permits a new intention', async () => {
    const original = new File(
      ['%PDF-1.4\nDEMO A\n%%EOF\n'],
      'questionnaire-a.pdf',
      { type: 'application/pdf' },
    );
    const replacement = new File(
      ['%PDF-1.4\nDEMO B\n%%EOF\n'],
      'questionnaire-b.pdf',
      { type: 'application/pdf' },
    );
    const writes: Array<{ path: string; request: RequestInit | undefined }> =
      [];
    let stored = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, request?: RequestInit) => {
        const path = String(input);
        if (path === '/api/documents/document/versions')
          return Response.json(versionRead(stored, replacement.size));
        if (path.includes('/content?') && request?.method === 'POST') {
          writes.push({ path, request });
          if (writes.length === 1)
            return Response.json(
              {
                code: 'document_pdf_scanner_unavailable',
                message: 'Scanning is unavailable.',
              },
              { status: 503 },
            );
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
    fireEvent.change(input, { target: { files: [original] } });
    fireEvent.click(screen.getByRole('button', { name: 'Păstrează PDF-ul' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Scanarea nu este disponibilă. PDF-ul nu a fost păstrat. Încearcă din nou când scanarea este disponibilă.',
    );
    expect(
      screen.queryByRole('button', { name: 'Reîncearcă același PDF' }),
    ).not.toBeInTheDocument();
    expect(input).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Păstrează PDF-ul' }),
    ).toBeEnabled();
    expect(writes).toHaveLength(1);
    expect(stored).toBe(false);
    fireEvent.change(input, { target: { files: [replacement] } });
    fireEvent.click(screen.getByRole('button', { name: 'Păstrează PDF-ul' }));
    await screen.findByRole('button', { name: 'Descarcă PDF-ul Versiunii 1' });
    expect(writes).toHaveLength(2);
    expect(writes[0]?.request?.body).toBe(original);
    expect(writes[1]?.request?.body).toBe(replacement);
    expect(
      new Headers(writes[1]?.request?.headers).get('idempotency-key'),
    ).not.toBe(new Headers(writes[0]?.request?.headers).get('idempotency-key'));
  });
  it.each([
    {
      status: 503,
      body: { message: 'Confirmation unavailable after commit.' },
    },
    {
      status: 503,
      body: { code: 'unrecognized_outage', message: 'Unknown outcome.' },
    },
    {
      status: 500,
      body: {
        code: 'document_pdf_scanner_unavailable',
        message: 'Not the documented response.',
      },
    },
  ])(
    'keeps unclassified server failures uncertain with an exact retry: %j',
    async (failure) => {
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
              return Response.json(failure.body, { status: failure.status });
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
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Rezultatul încărcării este incert.',
      );
      expect(screen.getByLabelText('Alege fișierul PDF')).toBeDisabled();
      fireEvent.click(
        await screen.findByRole('button', { name: 'Reîncearcă același PDF' }),
      );
      await screen.findByRole('button', {
        name: 'Descarcă PDF-ul Versiunii 1',
      });
      expect(writes).toHaveLength(2);
      expect(writes[1]?.path).toBe(writes[0]?.path);
      expect(writes[1]?.request?.body).toBe(file);
      expect(writes[0]?.request?.body).toBe(file);
      expect(
        new Headers(writes[1]?.request?.headers).get('idempotency-key'),
      ).toBe(new Headers(writes[0]?.request?.headers).get('idempotency-key'));
    },
  );
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
          grants: withCompanyGrants(actor.activeCompany?.grants, {
            bundle: 'company_document_content_reader',
            version: 'v1',
            assignmentId: 'replacement-reader-assignment',
          }),
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
        grants: withCompanyGrants(company.grants, {
          bundle: 'company_document_content_reader',
          version: 'v1',
          assignmentId: 'new-reader-assignment',
        }),
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
