import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import {
  deterministicBrowserIdentity,
  type BrowserIdentity,
} from './access-composition';
import { InterfaceLocaleSelect } from './localization/InterfaceLocaleSelect';
import {
  paymentEvidenceActor,
  paymentEvidenceDocument,
  paymentEvidenceIds as ids,
} from './payment-evidence/payment-evidence.test-fixture';
import { changeValue } from './test/select-option';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';

type Owner =
  'registration' | 'correction' | 'upload' | 'designation' | 'successor';
type Write = {
  path: string;
  method: string;
  body: BodyInit | null | undefined;
  key: string | null;
  signal: AbortSignal | null | undefined;
};
const owners: Owner[] = [
  'registration',
  'correction',
  'upload',
  'designation',
  'successor',
];
const otherCompany = {
  id: '20000000-0000-4000-8000-000000000001',
  displayName: 'Other fictional Company',
};
const retryLabel: Record<Owner, string> = {
  registration: 'Retry identical evidence registration',
  correction: 'Retry identical correction',
  upload: 'Retry the same PDF',
  designation: 'Retry the same Version change',
  successor: 'Retry the same Version change',
};
const instant = '2026-01-15T09:00:00.000Z';

/** Only HTTP/token responses are simulated; App, shell, host and every command owner are real. */
function installHttp(owner: Owner, holdVersions = false) {
  const originalActor = paymentEvidenceActor();
  let actor = originalActor;
  let companyWithdrawn = false;
  let actorReads = 0;
  const writes: Write[] = [];
  const writeReplies: Array<(response: Response) => void> = [];
  const versionReplies: Array<(response: Response) => void> = [];
  const document = {
    ...paymentEvidenceDocument(),
    workingRevision:
      owner === 'successor' ? 3 : owner === 'designation' ? 2 : 1,
    correction: owner === 'successor' ? 'read-only' : 'allowed',
    version: {
      id: ids.version,
      status: owner === 'successor' ? 'official' : 'draft',
      representation: null,
    },
  };
  const pdf = {
    state: 'stored',
    access: 'granted',
    representationId: '10000000-0000-4000-8000-000000000020',
    revision: 2,
    fileName: 'fictional-notice.pdf',
    mediaType: 'application/pdf',
    size: 42,
    sha256: 'c'.repeat(64),
    storedAt: instant,
    storedBy: { displayName: originalActor.displayName },
    scan: {
      outcome: 'clean',
      engine: 'Fictional scanner fixture',
      scannedAt: instant,
    },
  };
  const versions = {
    workingRevision: document.workingRevision,
    mutable: true,
    versions: [
      {
        id: ids.version,
        number: 1,
        status: document.version.status,
        createdAt: instant,
        createdBy: { displayName: originalActor.displayName },
        representations: [],
        pdfContent:
          owner === 'designation' || owner === 'successor'
            ? pdf
            : { state: 'absent' },
        ...(owner === 'successor'
          ? {
              designatedAt: instant,
              designatedBy: { displayName: originalActor.displayName },
              frozen: { title: document.title, purpose: document.purpose },
            }
          : {}),
      },
    ],
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input.toString(), 'http://localhost');
      const path = url.pathname;
      const method = init?.method ?? 'GET';
      if (method !== 'GET') {
        writes.push({
          path: path + url.search,
          method,
          body: init?.body,
          key: new Headers(init?.headers).get('idempotency-key'),
          signal: init?.signal,
        });
        // Deliberately return even after abort: the actual owner must suppress the late response.
        return new Promise<Response>((resolve) => writeReplies.push(resolve));
      }
      if (path === '/api/access/current-actor') {
        actorReads += 1;
        if (companyWithdrawn) {
          if (new Headers(init?.headers).has('x-company-context-id'))
            return Response.json({}, { status: 403 });
          const { activeCompany, ...workspaceActor } = originalActor;
          void activeCompany;
          return Response.json(workspaceActor);
        }
        return Response.json(actor);
      }
      if (path === '/api/companies')
        return Response.json(
          companyWithdrawn
            ? [otherCompany]
            : [originalActor.activeCompany, otherCompany],
        );
      if (path === '/api/activity-log') return Response.json({ events: [] });
      if (path === '/api/client-duplicate-reviews')
        return Response.json({ items: [], next_cursor: null });
      if (path === '/api/clients')
        return Response.json([
          {
            id: ids.client,
            displayName: 'Fictional original Client',
            relatedToActiveCompany: true,
          },
        ]);
      if (path === `/api/clients/${ids.client}`)
        return Response.json({
          id: ids.client,
          displayName: 'Fictional original Client',
          taxId: null,
          address: null,
          version: 1,
          relatedToActiveCompany: true,
        });
      if (path === `/api/clients/${ids.client}/legal-entities`)
        return Response.json({ clientVersion: 1, legalEntities: [] });
      if (path === '/api/documents') return Response.json([document]);
      if (path === `/api/documents/${ids.document}`)
        return Response.json(document);
      if (path === `/api/documents/${ids.document}/correction-history`)
        return Response.json({ corrections: [], nextBeforeRevision: null });
      if (path === `/api/documents/${ids.document}/versions`) {
        if (holdVersions)
          return new Promise<Response>((resolve) =>
            versionReplies.push(resolve),
          );
        return Response.json(versions);
      }
      if (
        path ===
        `/api/documents/${ids.document}/versions/${ids.version}/content/history`
      )
        return Response.json({
          uploads: [{ ...pdf, current: true }],
          nextBeforeRevision: null,
        });
      throw new Error(
        `Unexpected App HTTP ${method} ${url.pathname}${url.search}`,
      );
    }),
  );
  return {
    writes,
    get actorReads() {
      return actorReads;
    },
    get heldVersionCount() {
      return versionReplies.length;
    },
    async replyWrite(index: number, status = 502) {
      const reply = writeReplies[index];
      if (!reply) throw new Error('Expected a dispatched real command owner.');
      await act(async () => reply(Response.json({}, { status })));
    },
    async denyVersions() {
      holdVersions = false;
      const replies = versionReplies.splice(0);
      if (!replies.length)
        throw new Error('Expected an independently held native Version read.');
      await act(async () =>
        replies.forEach((reply) => reply(Response.json({}, { status: 403 }))),
      );
    },
    withdrawRecorder() {
      actor = {
        ...originalActor,
        activeCompany: {
          ...originalActor.activeCompany,
          paymentGrants: originalActor.activeCompany.paymentGrants.filter(
            (grant) => grant.bundle !== 'company_payment_recorder',
          ),
        },
      };
    },
    withdrawCompany() {
      companyWithdrawn = true;
    },
  };
}

function app(identity: BrowserIdentity) {
  return (
    <>
      <InterfaceLocaleSelect />
      <App identity={identity} />
    </>
  );
}
async function openSource() {
  fireEvent.click(
    await screen.findByRole('button', { name: 'Payment evidence' }),
  );
  await screen.findByRole('button', { name: 'Other Documents' });
}
async function startOwner(owner: Owner): Promise<{
  lockedControl: HTMLElement;
  file?: File;
}> {
  await openSource();
  if (owner === 'registration') {
    const form = screen.getByRole('form', {
      name: 'Register payment evidence',
    });
    const client = within(form).getByLabelText('Original Client');
    await waitFor(() => expect(client).not.toBeDisabled());
    changeValue(client, ids.client);
    const payer = within(form).getByLabelText('Exact payer');
    await waitFor(() => expect(payer).not.toBeDisabled());
    changeValue(payer, 'PRIMARY');
    const title = within(form).getByLabelText('Title');
    fireEvent.change(title, {
      target: { value: 'Navigation protected notice' },
    });
    fireEvent.change(within(form).getByLabelText('Purpose'), {
      target: { value: 'Preserve original source' },
    });
    fireEvent.change(within(form).getByLabelText('Declared source'), {
      target: { value: 'Fictional manual notice' },
    });
    fireEvent.click(
      within(form).getByRole('button', { name: 'Preserve evidence source' }),
    );
    return { lockedControl: title };
  }
  fireEvent.click(await screen.findByRole('button', { name: 'Open evidence' }));
  await screen.findByRole('heading', { name: 'Fictional notice' });
  if (owner === 'correction') {
    fireEvent.click(
      screen.getByRole('button', { name: 'Correct draft metadata' }),
    );
    const title = screen.getByLabelText('Title');
    fireEvent.change(title, {
      target: { value: 'Protected literal correction' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Save metadata correction' }),
    );
    return { lockedControl: title };
  }
  const version = await screen.findByRole('button', { name: 'Version 1' });
  if (owner === 'upload') {
    const input = await screen.findByLabelText('Choose the PDF file');
    const file = new File(
      ['%PDF-1.4 fictional interface boundary'],
      'fictional-notice.pdf',
      { type: 'application/pdf' },
    );
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Preserve PDF' }));
    return { lockedControl: input, file };
  }
  if (owner === 'designation') {
    fireEvent.click(
      screen.getByRole('button', { name: 'Designate as official' }),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Confirm official designation',
      }),
    );
  } else
    fireEvent.click(screen.getByRole('button', { name: 'Start new draft' }));
  return { lockedControl: version };
}

async function expectNavigationHeld(lockedControl: HTMLElement) {
  expect(lockedControl).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Other Documents' }),
  ).toBeDisabled();
  fireEvent.click(
    within(
      screen.getByRole('navigation', { name: 'Primary navigation' }),
    ).getByRole('link', { name: 'Clients' }),
  );
  await waitFor(() => expect(window.location.hash).toBe('#documents'));
  expect(
    screen.getByRole('combobox', { name: 'Active Company' }),
  ).toBeDisabled();
  expect(lockedControl.isConnected).toBe(true);
  act(() => {
    const attempted = new URL(window.location.href);
    attempted.hash = 'clients';
    window.history.pushState(window.history.state, '', attempted);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await waitFor(() => expect(window.location.hash).toBe('#documents'));
  expect(lockedControl.isConnected).toBe(true);
  expect(lockedControl).toBeDisabled();
}

const scrollable: {
  scrollIntoView?: (options?: ScrollIntoViewOptions) => void;
} = Element.prototype;
const originalScroll = scrollable.scrollIntoView;
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/?frame=prisme#documents');
  scrollable.scrollIntoView = vi.fn();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(
      (query: string) =>
        ({
          matches: true,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(() => false),
        }) satisfies MediaQueryList,
    ),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  scrollable.scrollIntoView = originalScroll;
  window.history.replaceState(null, '', '/');
});

describe('Payment Source protection through the actual App navigation boundary', () => {
  it.each(owners)(
    'retains pending and uncertain %s through sidebar/history attempts and retries the exact envelope',
    async (owner) => {
      const api = installHttp(owner);
      const identity = {
        ...deterministicBrowserIdentity(),
        getToken: vi.fn(async () => 'fictional-token'),
      };
      render(app(identity));
      const { lockedControl, file } = await startOwner(owner);
      await waitFor(() => expect(api.writes).toHaveLength(1));
      const first = api.writes[0];
      if (!first) throw new Error('Expected the dispatched command.');
      expect(first.key).toBeTruthy();
      expect(first.signal?.aborted).toBe(false);
      if (file) expect(first.body).toBe(file);
      await expectNavigationHeld(lockedControl);
      expect(first.signal?.aborted).toBe(false);
      expect(api.writes).toHaveLength(1);
      await api.replyWrite(0);
      const retry = await screen.findByRole('button', {
        name: retryLabel[owner],
      });
      await expectNavigationHeld(lockedControl);
      retry.focus();
      const locale = document.getElementById('interface-locale');
      if (!locale)
        throw new Error('Expected the real interface locale control.');
      for (const value of ['ro', 'fr', 'ru', 'en']) {
        changeValue(locale, value);
        expect(lockedControl.isConnected).toBe(true);
        expect(lockedControl).toBeDisabled();
      }
      retry.focus();
      for (const frame of ['classic', 'prisme']) {
        act(() => {
          const url = new URL(window.location.href);
          url.searchParams.set('frame', frame);
          window.history.pushState(window.history.state, '', url);
          window.dispatchEvent(new PopStateEvent('popstate'));
        });
        expect(lockedControl.isConnected).toBe(true);
        expect(retry).toHaveFocus();
      }
      fireEvent.click(retry);
      await waitFor(() => expect(api.writes).toHaveLength(2));
      const repeated = api.writes[1];
      if (!repeated) throw new Error('Expected the identical retry.');
      expect({
        path: repeated.path,
        method: repeated.method,
        body: repeated.body,
        key: repeated.key,
      }).toEqual({
        path: first.path,
        method: first.method,
        body: first.body,
        key: first.key,
      });
      if (file) expect(repeated.body).toBe(file);
      expect(first.signal?.aborted).toBe(false);
      await api.replyWrite(1);
      expect(
        await screen.findByRole('button', { name: retryLabel[owner] }),
      ).toBeInTheDocument();
    },
  );

  it('retires a pending registration permanently after public App identity A→B→A', async () => {
    const api = installHttp('registration');
    const identity = deterministicBrowserIdentity();
    const view = render(app(identity));
    const { lockedControl } = await startOwner('registration');
    await waitFor(() => expect(api.writes).toHaveLength(1));
    const original = api.writes[0];
    if (!original) throw new Error('Expected the held registration.');
    view.rerender(app(deterministicBrowserIdentity()));
    await screen.findByRole('button', { name: 'Payment evidence' });
    view.rerender(app(identity));
    await screen.findByRole('button', { name: 'Payment evidence' });
    await waitFor(() => expect(original.signal?.aborted).toBe(true));
    expect(lockedControl.isConnected).toBe(false);
    await api.replyWrite(0);
    await openSource();
    expect(
      screen.queryByRole('button', { name: retryLabel.registration }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('');
    expect(api.writes).toHaveLength(1);
  });

  it.each(['Recorder', 'Company'])(
    'retires correction on authoritative %s withdrawal even while user navigation is protected',
    async (withdrawal) => {
      const api = installHttp('correction', true);
      render(app(deterministicBrowserIdentity()));
      const { lockedControl } = await startOwner('correction');
      await waitFor(() => expect(api.writes).toHaveLength(1));
      expect(api.heldVersionCount).toBeGreaterThan(0);
      const original = api.writes[0];
      if (!original) throw new Error('Expected the held correction.');
      expect(
        screen.getByRole('combobox', { name: 'Active Company' }),
      ).toBeDisabled();
      const previousActorReads = api.actorReads;
      if (withdrawal === 'Recorder') api.withdrawRecorder();
      else api.withdrawCompany();
      await api.denyVersions();
      await waitFor(() =>
        expect(api.actorReads).toBeGreaterThan(previousActorReads),
      );
      await waitFor(() => expect(original.signal?.aborted).toBe(true));
      expect(lockedControl.isConnected).toBe(false);
      await waitFor(() =>
        expect(
          screen.getByRole('combobox', { name: 'Active Company' }),
        ).not.toBeDisabled(),
      );
      await api.replyWrite(0);
      expect(
        screen.queryByRole('button', { name: retryLabel.correction }),
      ).not.toBeInTheDocument();
      expect(api.writes).toHaveLength(1);
    },
  );
});
