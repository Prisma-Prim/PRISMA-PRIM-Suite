import { Blob as NodeBlob } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';
import { changeValue } from './test/select-option';
import {
  companyId,
  clientId,
  installParentServer,
} from './test/mission-applicability-app-fixture';
import {
  internalTaskActor,
  installInternalTaskApp,
  publishInternalActor,
} from './test/internal-task-app';
import {
  invoiceUiActor,
  invoiceUiIds as ids,
  invoiceUiDocument,
  invoiceUiVersions,
} from './documents/external-invoice.ui.test-fixture';

// Negative external HTTP/token/crypto/effect fixtures exercise the actual App and native client.
// The separately registered acceptance journey owns the actual positive Nest/PostgreSQL/browser proof.
const financialActor = {
  ...internalTaskActor,
  displayName: 'Financial Actor A',
  activeCompany: {
    ...internalTaskActor.activeCompany,
    ...invoiceUiActor.activeCompany,
    id: companyId,
    displayName: 'Company DEMO',
  },
};
const otherCompanyId = '10000000-0000-4000-8000-000000000099';
const representationId = '10000000-0000-4000-8000-000000000020';
const documentPath = '/api/documents/' + ids.document;
const pdfPath = `${documentPath}/versions/${ids.version}/content/${representationId}`;
const bytes = new TextEncoder().encode(
  '%PDF-1.4\nFictional external source only\n%%EOF\n',
);
const ordinaryTitle = 'Ordinary questionnaire draft DEMO';
const ordinaryReference = {
  id: 'ordinary-reference',
  kind: 'external-reference',
  verification: 'unverified',
  access: 'granted',
  url: 'https://example.test/ordinary',
};
const ordinaryDocument = {
  id: 'ordinary-document',
  companyId,
  clientId,
  clientDisplayName: 'Fictional Client',
  title: ordinaryTitle,
  purpose: 'Independent ordinary family work',
  type: 'questionnaire',
  confidentiality: 'company-confidential',
  createdAt: invoiceUiDocument.createdAt,
  workingRevision: 1,
  correction: 'allowed',
  version: {
    id: 'ordinary-version',
    status: 'draft',
    representation: ordinaryReference,
  },
};

type Stage = 'token' | 'response' | 'body' | 'hash' | 'object URL';
type Retirement =
  | 'navigation'
  | 'finance A→B→A'
  | 'family A→B→A'
  | 'Company A→B→A'
  | 'session A→B→A';
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('Blob', NodeBlob);
  window.history.replaceState(null, '', '/#documents');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});
function link(name: string) {
  return within(
    screen.getByRole('navigation', { name: 'Primary navigation' }),
  ).getByRole('link', { name });
}
async function openFinancial() {
  fireEvent.click(
    await screen.findByRole('button', {
      name: invoiceUiDocument.title,
    }),
  );
  await screen.findByRole('button', {
    name: 'Download Version 1 PDF',
  });
  await screen.findByText(
    invoiceUiDocument.externalInvoiceRelation.sourceDescription,
    { exact: true },
  );
}

const cases = [
  { stage: 'token', retirement: 'navigation', frame: 'prisme', status: 200 },
  { stage: 'token', retirement: 'navigation', frame: 'classic', status: 200 },
  { stage: 'response', retirement: 'navigation', frame: 'prisme', status: 401 },
  {
    stage: 'response',
    retirement: 'navigation',
    frame: 'classic',
    status: 403,
  },
  {
    stage: 'response',
    retirement: 'finance A→B→A',
    frame: 'prisme',
    status: 200,
  },
  {
    stage: 'response',
    retirement: 'family A→B→A',
    frame: 'classic',
    status: 403,
  },
  { stage: 'body', retirement: 'Company A→B→A', frame: 'prisme', status: 200 },
  { stage: 'body', retirement: 'Company A→B→A', frame: 'classic', status: 200 },
  { stage: 'hash', retirement: 'session A→B→A', frame: 'prisme', status: 200 },
  { stage: 'hash', retirement: 'session A→B→A', frame: 'classic', status: 200 },
  {
    stage: 'object URL',
    retirement: 'navigation',
    frame: 'prisme',
    status: 200,
  },
  {
    stage: 'object URL',
    retirement: 'navigation',
    frame: 'classic',
    status: 200,
  },
] satisfies Array<{
  stage: Stage;
  retirement: Retirement;
  frame: 'prisme' | 'classic';
  status: number;
}>;

it.each(cases)(
  'keeps the held financial $stage HTTP$status inert after actual App $retirement in $frame',
  async ({ stage, retirement, frame, status }) => {
    window.history.replaceState(null, '', `/?frame=${frame}#documents`);
    const digest = await webcrypto.subtle.digest('SHA-256', bytes);
    const sha256 = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
    const saved = {
      ...invoiceUiDocument,
      companyId,
      clientId,
      workingRevision: 2,
    };
    const nativeVersions = {
      ...invoiceUiVersions,
      workingRevision: 2,
      versions: invoiceUiVersions.versions.map((version) => ({
        ...version,
        pdfContent: {
          state: 'stored',
          access: 'granted',
          representationId,
          revision: 2,
          fileName: 'fictional-original.pdf',
          mediaType: 'application/pdf',
          size: bytes.length,
          sha256,
          storedAt: invoiceUiDocument.createdAt,
          storedBy: { displayName: 'Fictional recorder' },
          scan: {
            outcome: 'clean',
            engine: 'ClamAV synthetic wire',
            scannedAt: invoiceUiDocument.createdAt,
          },
        },
      })),
    };
    let current = financialActor,
      relatedDenied = false,
      armed = false,
      reached = false;
    let release: (() => void) | undefined;
    const nativeRequests: string[] = [],
      actorRequests: string[] = [];
    const rejected = vi.fn(async () => undefined),
      created = vi.fn(() => 'blob:financial-retired-source'),
      revoked = vi.fn();
    const clicked = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const NativeURL = URL;
    vi.stubGlobal(
      'URL',
      class extends NativeURL {
        static createObjectURL = created;
        static revokeObjectURL = revoked;
      },
    );
    const originalDigest = webcrypto.subtle.digest.bind(webcrypto.subtle);
    if (stage === 'hash')
      vi.spyOn(webcrypto.subtle, 'digest').mockImplementation(
        (algorithm, input) => {
          if (!armed) return originalDigest(algorithm, input);
          armed = false;
          reached = true;
          return new Promise<ArrayBuffer>((resolve) => {
            release = () => resolve(digest);
          });
        },
      );
    installParentServer(
      () => current,
      async (path, init) => {
        const selectedCompany = new Headers(init?.headers).get(
          'x-company-context-id',
        );
        if (path === '/api/access/current-actor') {
          actorRequests.push(selectedCompany ?? 'Workspace');
          return Response.json(
            selectedCompany === otherCompanyId
              ? {
                  ...financialActor,
                  displayName: 'Financial Company B Actor',
                  activeCompany: {
                    ...financialActor.activeCompany,
                    id: otherCompanyId,
                    displayName: 'Company B DEMO',
                  },
                }
              : current,
          );
        }
        if (path === '/api/companies')
          return Response.json([
            { id: companyId, displayName: 'Company DEMO' },
            { id: otherCompanyId, displayName: 'Company B DEMO' },
          ]);
        if (
          selectedCompany === otherCompanyId &&
          ['/api/documents', '/api/clients', '/api/projects'].includes(path)
        )
          return Response.json([]);
        if (path === pdfPath) {
          nativeRequests.push(path);
          if (stage === 'response' && armed) {
            armed = false;
            reached = true;
            return new Promise<Response>((resolve) => {
              release = () =>
                resolve(
                  status === 200
                    ? new Response(bytes, {
                        headers: { 'content-type': 'application/pdf' },
                      })
                    : new Response(null, { status }),
                );
            });
          }
          if (stage === 'body' && armed) {
            armed = false;
            let pushed = false;
            return new Response(
              new ReadableStream<Uint8Array>({
                pull(controller) {
                  if (pushed) return;
                  reached = true;
                  release = () => {
                    pushed = true;
                    try {
                      controller.enqueue(bytes);
                      controller.close();
                    } catch {
                      /* A cancelled external stream has no later delivery. */
                    }
                  };
                },
              }),
              { headers: { 'content-type': 'application/pdf' } },
            );
          }
          return new Response(bytes, {
            headers: { 'content-type': 'application/pdf' },
          });
        }
        if (path === '/api/documents') return Response.json([saved]);
        if (path === documentPath)
          return Response.json(
            relatedDenied
              ? { ...saved, externalInvoiceRelation: { access: 'denied' } }
              : saved,
          );
        if (path === documentPath + '/versions')
          return Response.json(nativeVersions);
        return undefined;
      },
    );
    let holdToken = false;
    const identity = {
      ...deterministicBrowserIdentity(),
      rejectSession: rejected,
      getToken: () => {
        if (!holdToken) return Promise.resolve('fixture-token');
        holdToken = false;
        reached = true;
        return new Promise<string>((resolve) => {
          release = () => resolve('old-token');
        });
      },
    };
    const rendered = render(<App identity={identity} />);
    await openFinancial();
    let focus: HTMLElement | undefined;
    function focusProjectDraft() {
      const projects = screen.getByRole('region', { name: 'Projects' });
      focus = within(projects).getByRole('textbox', { name: 'Project title' });
      fireEvent.change(focus, {
        target: { value: 'Independent Project draft survives' },
      });
      focus.focus();
    }
    async function navigateAway() {
      fireEvent.click(link('Projects'));
      // Classic uses a real native anchor; observe its hashchange before releasing old work.
      await waitFor(() => expect(window.location.hash).toBe('#projects'));
      await waitFor(() =>
        expect(
          screen.queryByRole('heading', { name: invoiceUiDocument.title }),
        ).not.toBeInTheDocument(),
      );
      focusProjectDraft();
    }
    if (stage === 'object URL')
      created.mockImplementation(() => {
        // A synchronous effect boundary uses the real App history-navigation listener.
        reached = true;
        act(() => {
          const url = new URL(window.location.href);
          url.hash = '#projects';
          window.history.pushState(window.history.state, '', url);
          window.dispatchEvent(new PopStateEvent('popstate'));
        });
        focusProjectDraft();
        return 'blob:financial-retired-source';
      });
    armed = true;
    holdToken = stage === 'token';
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Download Version 1 PDF',
      }),
    );
    await waitFor(() => expect(reached).toBe(true));
    if (stage !== 'object URL') {
      if (retirement === 'navigation') await navigateAway();
      else if (retirement === 'session A→B→A') {
        const beforeSession = actorRequests.length;
        rendered.rerender(
          <App
            identity={{
              ...deterministicBrowserIdentity(),
              rejectSession: vi.fn(async () => undefined),
            }}
          />,
        );
        await waitFor(() =>
          expect(actorRequests.length).toBeGreaterThan(beforeSession),
        );
        await screen.findByRole('button', {
          name: invoiceUiDocument.title,
        });
        rendered.rerender(<App identity={identity} />);
        await openFinancial();
        focus = screen.getByLabelText('Choose the PDF file');
        focus.focus();
      } else if (retirement === 'Company A→B→A') {
        changeValue(
          screen.getByRole('combobox', { name: 'Active Company' }),
          otherCompanyId,
        );
        await waitFor(() =>
          expect(
            screen.getByRole('combobox', { name: 'Active Company' }),
          ).toHaveAttribute('data-value', otherCompanyId),
        );
        await screen.findByText('Financial Company B Actor');
        changeValue(
          screen.getByRole('combobox', { name: 'Active Company' }),
          companyId,
        );
        await openFinancial();
        focus = screen.getByLabelText('Choose the PDF file');
        focus.focus();
      } else {
        const bundle =
          retirement === 'finance A→B→A'
            ? 'company_invoice_recorder'
            : 'company_external_invoice_access';
        current = {
          ...financialActor,
          displayName: 'Financial capture B',
          activeCompany: {
            ...financialActor.activeCompany,
            externalInvoiceGrants: [
              {
                bundle: 'company_invoice_recorder',
                assignmentId:
                  bundle === 'company_invoice_recorder'
                    ? ids.replacement
                    : ids.recorder,
                permissionSetVersion: 'v1',
              },
              {
                bundle: 'company_external_invoice_access',
                assignmentId:
                  bundle === 'company_external_invoice_access'
                    ? ids.replacement
                    : ids.family,
                permissionSetVersion: 'v1',
              },
            ],
          },
        };
        relatedDenied = true;
        fireEvent.click(
          screen.getByRole('button', {
            name: 'Reload declared invoice source',
          }),
        );
        await screen.findByText('Financial capture B');
        relatedDenied = false;
        await openFinancial();
        current = {
          ...financialActor,
          displayName: 'Financial capture A restored',
        };
        relatedDenied = true;
        fireEvent.click(
          screen.getByRole('button', {
            name: 'Reload declared invoice source',
          }),
        );
        await screen.findByText('Financial capture A restored');
        relatedDenied = false;
        await openFinancial();
        focus = screen.getByLabelText('Choose the PDF file');
        focus.focus();
      }
    }
    const before = {
      native: nativeRequests.length,
      actor: actorRequests.length,
    };
    await act(async () => {
      release?.();
    });
    expect(nativeRequests).toHaveLength(stage === 'token' ? 0 : 1);
    expect({
      native: nativeRequests.length,
      actor: actorRequests.length,
    }).toEqual(before);
    expect(rejected).not.toHaveBeenCalled();
    expect(clicked).not.toHaveBeenCalled();
    expect(created).toHaveBeenCalledTimes(stage === 'object URL' ? 1 : 0);
    expect(revoked).toHaveBeenCalledTimes(stage === 'object URL' ? 1 : 0);
    expect(focus).toHaveFocus();
    if (retirement === 'navigation') {
      expect(focus).toHaveValue('Independent Project draft survives');
      expect(
        screen.queryByRole('heading', { name: invoiceUiDocument.title }),
      ).not.toBeInTheDocument();
    }
  },
);

it('preserves the ordinary questionnaire PDF file/key attempt through unrelated financial capture replacement in the actual App', async () => {
  const writes: Array<{
    body: BodyInit | null | undefined;
    key: string | null;
  }> = [];
  const nativeVersions = {
    workingRevision: 1,
    mutable: true,
    versions: [
      {
        id: 'ordinary-version',
        number: 1,
        status: 'draft',
        createdAt: invoiceUiDocument.createdAt,
        createdBy: { displayName: 'Fictional native author' },
        representations: [
          {
            ...ordinaryReference,
            position: 1,
            form: 'other',
            primary: true,
            appendedAfterDesignation: false,
            addedAt: invoiceUiDocument.createdAt,
            addedBy: { displayName: 'Fictional native author' },
          },
        ],
        pdfContent: { state: 'absent' },
      },
    ],
  };
  const server = installInternalTaskApp(async (path, init) => {
    if (
      path ===
        '/api/documents/ordinary-document/versions/ordinary-version/content' &&
      init?.method === 'POST'
    ) {
      writes.push({
        body: init.body,
        key: new Headers(init.headers).get('idempotency-key'),
      });
      if (writes.length === 1) return new Response(null, { status: 503 });
      return Response.json(
        {
          documentId: 'ordinary-document',
          versionId: 'ordinary-version',
          versionNumber: 1,
          workingRevision: 2,
          action: 'representation_added',
          representationId: 'ordinary-pdf',
          appendedAfterDesignation: false,
        },
        { status: 201 },
      );
    }
    if (path === '/api/documents') return Response.json([ordinaryDocument]);
    if (path === '/api/documents/ordinary-document')
      return Response.json(ordinaryDocument);
    if (path === '/api/documents/ordinary-document/versions')
      return Response.json(nativeVersions);
    return undefined;
  }, financialActor);
  server.setNextActor({
    ...financialActor,
    displayName: 'Financially changed Actor',
    activeCompany: {
      ...financialActor.activeCompany,
      externalInvoiceGrants: [],
    },
  });
  render(<App identity={deterministicBrowserIdentity()} />);
  fireEvent.click(await screen.findByRole('button', { name: ordinaryTitle }));
  const file = new File(
    ['%PDF-1.4\nOrdinary DEMO\n%%EOF\n'],
    'ordinary-kept.pdf',
    { type: 'application/pdf' },
  );
  fireEvent.change(await screen.findByLabelText('Choose the PDF file'), {
    target: { files: [file] },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Preserve PDF' }));
  await screen.findByRole('button', {
    name: 'Retry the same PDF',
  });
  await publishInternalActor('grant', 'mission-result-reviewer');
  await screen.findByText('Financially changed Actor');
  fireEvent.click(link('Working Documents'));
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Retry the same PDF',
    }),
  );
  await waitFor(() => expect(writes).toHaveLength(2));
  expect(writes[1]).toEqual(writes[0]);
  expect(writes[1]?.body).toBe(file);
});
