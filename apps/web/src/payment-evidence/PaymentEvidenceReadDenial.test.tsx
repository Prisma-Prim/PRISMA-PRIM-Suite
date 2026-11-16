import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import { afterEach, expect, it, vi } from 'vitest';
import type { ActorContext } from '../access-types';
import {
  deterministicBrowserIdentity,
  type BrowserIdentity,
} from '../access-composition';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import { readCurrentActor } from '../access/current-actor';
import {
  withCompanyGrants,
  withoutCompanyGrants,
} from '../access/company-grants.test-fixture';
import { changeValue } from '../test/select-option';
import { PaymentEvidenceSourcePanel } from './PaymentEvidenceSourcePanel';
import { paymentEvidenceAuthority } from './payment-evidence-authority';
import type {
  PaymentEvidenceSelection,
  PaymentEvidenceTarget,
} from './payment-evidence-types';
import {
  paymentEvidenceActor,
  paymentEvidenceDocument,
  paymentEvidenceIds as ids,
} from './payment-evidence.test-fixture';

const documentPath = `/api/documents/${ids.document}`;
const versionsPath = documentPath + '/versions';
const actorPath = '/api/access/current-actor';
const at = '2026-01-15T09:00:00.000Z';
const originalFileName = 'original-frozen.pdf';
type Action =
  'upload' | 'designation' | 'successor' | 'correction' | 'registration';
type Ancestor = 'detail' | 'versions' | 'inventory';
type Call = {
  path: string;
  url: string;
  method: string;
  body: BodyInit | null | undefined;
  key: string | null;
  signal: AbortSignal | null | undefined;
};
type HeldRead = { call: Call; resolve: (response: Response) => void };

function replaceGrant(
  bundle: 'company_payment_reader' | 'company_payment_recorder',
  assignmentId: string,
) {
  const actor = paymentEvidenceActor();
  actor.activeCompany.grants = withCompanyGrants(actor.activeCompany.grants, {
    bundle,
    version: 'v1',
    assignmentId,
  });
  return actor;
}
const actorA = paymentEvidenceActor();
const readerB = replaceGrant(
  'company_payment_reader',
  '30000000-0000-4000-8000-000000000001',
);
const readerC = replaceGrant(
  'company_payment_reader',
  '30000000-0000-4000-8000-000000000002',
);
const recorderB = replaceGrant(
  'company_payment_recorder',
  '30000000-0000-4000-8000-000000000003',
);

/** Only native HTTP is faked. Detail, Versions, PDF and every command owner are real. */
function boundary(registration = false, initialOfficial = false) {
  const calls: Call[] = [];
  const heldReads: HeldRead[] = [];
  const writes: ((response: Response) => void)[] = [];
  const recoveries: ((response: Response) => void)[] = [];
  let heldPath: string | undefined;
  let revision = registration ? 1 : 2;
  let official = initialOfficial;
  let corrected = false;
  let uploaded = false;
  let payerAvailable = true;
  let failNextDocumentRead = false;
  function document() {
    const source = paymentEvidenceDocument();
    return {
      ...source,
      title: corrected ? 'Corrected literal notice' : source.title,
      workingRevision: revision,
      paymentEvidenceSource: {
        ...source.paymentEvidenceSource,
        payer: payerAvailable
          ? source.paymentEvidenceSource.payer
          : { kind: 'UNAVAILABLE' },
      },
      version: { ...source.version, status: official ? 'official' : 'draft' },
    };
  }
  function versions() {
    const source = document();
    return {
      workingRevision: revision,
      mutable: true,
      versions: [
        {
          id: ids.version,
          number: 1,
          status: official ? 'official' : 'draft',
          createdAt: at,
          createdBy: { displayName: 'Fictional Recorder' },
          ...(official
            ? {
                designatedAt: at,
                designatedBy: { displayName: 'Fictional Recorder' },
                frozen: { title: source.title, purpose: source.purpose },
              }
            : {}),
          representations: [],
          pdfContent: registration
            ? { state: 'absent' }
            : {
                state: 'stored',
                access: 'granted',
                representationId: uploaded
                  ? '30000000-0000-4000-8000-000000000005'
                  : '30000000-0000-4000-8000-000000000004',
                revision: uploaded ? 3 : 2,
                fileName: uploaded ? 'evidence-edit.pdf' : originalFileName,
                mediaType: 'application/pdf',
                size: 42,
                sha256: 'a'.repeat(64),
                storedAt: at,
                storedBy: { displayName: 'Fictional Recorder' },
                scan: {
                  outcome: 'clean',
                  engine: 'Synthetic clean scanner',
                  scannedAt: at,
                },
              },
        },
      ],
    };
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      const path = new URL(url, 'http://localhost').pathname;
      const call = {
        path,
        url,
        method: init?.method ?? 'GET',
        body: init?.body,
        key: new Headers(init?.headers).get('idempotency-key'),
        signal: init?.signal,
      };
      calls.push(call);
      if (call.method === 'POST' || call.method === 'PATCH')
        return new Promise<Response>((resolve) => writes.push(resolve));
      if (path === actorPath)
        return new Promise<Response>((resolve) => recoveries.push(resolve));
      if (
        call.method === 'GET' &&
        path === documentPath &&
        failNextDocumentRead
      ) {
        failNextDocumentRead = false;
        return new Response(null, { status: 500 });
      }
      if (path === heldPath)
        return new Promise<Response>((resolve) =>
          heldReads.push({ call, resolve }),
        );
      if (path === '/api/documents') return Response.json([document()]);
      if (path === documentPath) return Response.json(document());
      if (path === versionsPath) return Response.json(versions());
      if (path === '/api/clients')
        return Response.json([
          { id: ids.client, displayName: 'Fictional original Client' },
        ]);
      if (path === `/api/clients/${ids.client}`)
        return Response.json({
          id: ids.client,
          displayName: 'Fictional original Client',
          taxId: null,
          address: null,
        });
      if (path === `/api/clients/${ids.client}/legal-entities`)
        return Response.json({ clientVersion: 1, legalEntities: [] });
      throw new Error(`Unexpected native HTTP ${call.method} ${path}`);
    }),
  );
  return {
    calls,
    withholdPayer() {
      payerAvailable = false;
    },
    failNextDocumentRead() {
      failNextDocumentRead = true;
    },
    mutations: () =>
      calls.filter((call) => call.method === 'POST' || call.method === 'PATCH'),
    observeRevision(value: number) {
      revision = value;
    },
    hold(ancestor: Ancestor) {
      heldPath =
        ancestor === 'detail'
          ? documentPath
          : ancestor === 'versions'
            ? versionsPath
            : '/api/documents';
    },
    async requestedRead() {
      await waitFor(() => expect(heldReads.length).toBeGreaterThan(0));
    },
    async deny(status: 403 | 404) {
      heldPath = undefined;
      const pending = heldReads.splice(0);
      expect(pending.length).toBeGreaterThan(0);
      await act(async () => {
        for (const read of pending)
          read.resolve(new Response(null, { status }));
      });
    },
    async reload(status: 200 | 500) {
      heldPath = undefined;
      const pending = heldReads.splice(0);
      expect(pending.length).toBeGreaterThan(0);
      await act(async () => {
        for (const read of pending)
          read.resolve(
            status === 200
              ? Response.json(
                  read.call.path === versionsPath ? versions() : document(),
                )
              : new Response(null, { status }),
          );
      });
    },
    async actorRequested() {
      await waitFor(() => expect(recoveries.length).toBeGreaterThan(0));
    },
    async recover(actor: ActorContext) {
      const pending = recoveries.splice(0);
      expect(pending.length).toBeGreaterThan(0);
      await act(async () => {
        for (const resolve of pending) resolve(Response.json(actor));
      });
    },
    async uncertain() {
      const resolve = writes.shift();
      if (!resolve) throw new Error('Expected an actual dispatched command');
      await act(async () => resolve(new Response(null, { status: 502 })));
    },
    async conflict() {
      const resolve = writes.shift();
      if (!resolve) throw new Error('Expected an actual dispatched command');
      await act(async () => resolve(new Response(null, { status: 409 })));
    },
    async confirm(action: Action) {
      const resolve = writes.shift();
      if (!resolve) throw new Error('Expected an actual retry command');
      revision = action === 'registration' ? 1 : 3;
      official = action === 'designation';
      uploaded = action === 'upload';
      corrected = action === 'correction';
      const value =
        action === 'registration'
          ? document()
          : action === 'correction'
            ? { documentId: ids.document, revision, outcome: 'corrected' }
            : {
                documentId: ids.document,
                workingRevision: revision,
                versionId: ids.version,
                versionNumber: 1,
                ...(action === 'upload'
                  ? {
                      action: 'representation_added',
                      representationId: '30000000-0000-4000-8000-000000000005',
                      appendedAfterDesignation: false,
                    }
                  : {
                      action: 'designated_official',
                      supersededVersionNumber: null,
                    }),
              };
      await act(async () =>
        resolve(
          Response.json(value, {
            status:
              action === 'upload' || action === 'registration' ? 201 : 200,
          }),
        ),
      );
    },
    async releaseRetiredReads() {
      const retired = heldReads.filter((read) => read.call.signal?.aborted);
      expect(retired.length).toBeGreaterThan(0);
      for (const read of retired) heldReads.splice(heldReads.indexOf(read), 1);
      await act(async () => {
        for (const read of retired)
          read.resolve(
            Response.json({
              ...document(),
              title: 'Stale retired confidential title',
            }),
          );
      });
    },
  };
}

function show(registration = false) {
  let actor: ActorContext = actorA;
  const originalIdentity = deterministicBrowserIdentity({
    authorization: 'Bearer read-denial-boundary',
  });
  let identity: BrowserIdentity = originalIdentity;
  let selection: PaymentEvidenceSelection = registration
    ? { kind: 'register', generation: 1 }
    : { kind: 'document', documentId: ids.document, generation: 1 };
  function updateActor(next: ActorContext) {
    actor = next;
    view?.rerender(ui());
  }
  function select(target: PaymentEvidenceTarget) {
    selection = { ...target, generation: selection.generation + 1 };
    view?.rerender(ui());
  }
  const recovered = vi.fn(updateActor);
  const protectedWork = vi.fn();
  const ui = () => (
    <PaymentEvidenceSourcePanel
      actor={actor}
      identity={identity}
      selection={selection}
      onSelect={select}
      onProtectedWorkChange={protectedWork}
      onActorRevalidated={recovered}
    />
  );
  const view = render(ui());
  return {
    actor: updateActor,
    recovered,
    async refreshActor() {
      const api = await createAuthenticatedApiClient(identity);
      const result = await readCurrentActor({
        api,
        companyContextId: ids.company,
      });
      if (result.status !== 'ok')
        throw new Error('Expected valid native Actor recovery');
      updateActor(result.value);
    },
    retire(owner: 'key' | 'identity' | 'selection') {
      if (owner === 'key') {
        updateActor(recorderB);
        updateActor(actorA);
      } else if (owner === 'identity') {
        identity = { ...originalIdentity };
        view?.rerender(ui());
        identity = originalIdentity;
        view?.rerender(ui());
      } else {
        select({ kind: 'document', documentId: ids.document });
        select({ kind: 'document', documentId: ids.document });
      }
    },
  };
}
async function positiveDocument(freshCommands = true) {
  await screen.findByRole('heading', { name: 'Fictional notice' });
  await screen.findByRole('button', { name: 'Version 1' });
  await screen.findByText(originalFileName, { exact: true });
  if (freshCommands) {
    await waitFor(() =>
      expect(screen.getByLabelText('Choose the PDF file')).toBeEnabled(),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: 'Designate as official',
        }),
      ).toBeEnabled(),
    );
  }
}
const retryNames = {
  upload: 'Retry the same PDF',
  designation: 'Retry the same Version change',
  successor: 'Retry the same Version change',
  correction: 'Retry identical correction',
  registration: 'Retry identical evidence registration',
};
async function dispatch(
  action: Action,
  activate: (button: HTMLElement) => void = (button) => fireEvent.click(button),
) {
  if (action === 'registration') {
    await waitFor(() =>
      expect(screen.getByLabelText('Original Client')).toBeEnabled(),
    );
    changeValue(screen.getByLabelText('Original Client'), ids.client);
    await waitFor(() =>
      expect(screen.getByLabelText('Exact payer')).toBeEnabled(),
    );
    changeValue(screen.getByLabelText('Exact payer'), 'PRIMARY');
    changeValue(screen.getByLabelText('Title'), 'Fictional notice');
    changeValue(screen.getByLabelText('Purpose'), 'Preserve original source');
    changeValue(
      screen.getByLabelText('Declared source'),
      'Fictional manual notice',
    );
    activate(
      screen.getByRole('button', {
        name: 'Preserve evidence source',
      }),
    );
  } else if (action === 'upload') {
    const file = new File(
      ['%PDF-1.4\nExact owned upload bytes\n%%EOF'],
      'evidence-edit.pdf',
      { type: 'application/pdf' },
    );
    fireEvent.change(screen.getByLabelText('Choose the PDF file'), {
      target: { files: [file] },
    });
    activate(screen.getByRole('button', { name: 'Preserve PDF' }));
    return file;
  } else if (action === 'successor') {
    activate(screen.getByRole('button', { name: 'Start new draft' }));
  } else if (action === 'designation') {
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Designate as official',
      }),
    );
    activate(
      await screen.findByRole('button', {
        name: 'Confirm official designation',
      }),
    );
  } else {
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Correct draft metadata',
      }),
    );
    changeValue(screen.getByLabelText('Title'), 'Corrected literal notice');
    activate(
      screen.getByRole('button', {
        name: 'Save metadata correction',
      }),
    );
  }
}
function noFreshCommands(ancestor: Exclude<Ancestor, 'inventory'>) {
  for (const name of [
    ...(ancestor === 'detail' ? ['Correct draft metadata'] : []),
    'Designate as official',
    'Start new draft',
    'Preserve PDF',
  ]) {
    for (const button of screen.queryAllByRole('button', { name }))
      expect(button).toBeDisabled();
  }
  for (const input of screen.queryAllByLabelText('Choose the PDF file'))
    expect(input).toBeDisabled();
}
afterEach(() => vi.unstubAllGlobals());
it.each([
  'registration',
  'correction',
  'upload',
  'designation',
  'successor',
] as const)(
  'admits one $0 command through two activations of its rendered submit control',
  async (action) => {
    const api = boundary(action === 'registration', action === 'successor');
    show(action === 'registration');
    if (action !== 'registration')
      await positiveDocument(action !== 'successor');
    await dispatch(action, (button) => {
      act(() => {
        button.click();
        button.click();
      });
    });
    await waitFor(() => expect(api.mutations().length).toBeGreaterThan(0));
    const dispatched = api.mutations().length;
    try {
      expect(dispatched).toBe(1);
    } finally {
      for (let index = 0; index < dispatched; index++) await api.uncertain();
    }
  },
);

it.each(['inventory', 'versions'] as const)(
  'does not publish an older Actor recovery from %s after a newer content denial commits under the same evidence read capture',
  async (ancestor) => {
    const api = boundary();
    const view = show();
    await positiveDocument();
    api.hold(ancestor);
    view.actor(readerB);
    await api.requestedRead();
    await api.deny(403);
    await api.actorRequested();
    const newerActor = {
      ...readerB,
      activeCompany: {
        ...readerB.activeCompany,
        grants: withoutCompanyGrants(
          readerB.activeCompany.grants,
          'company_document_content_reader',
        ),
      },
    };
    expect(paymentEvidenceAuthority(newerActor)?.readKey).toBe(
      paymentEvidenceAuthority(readerB)?.readKey,
    );
    expect(paymentEvidenceAuthority(newerActor)?.contentReadKey).toBeNull();
    let released = false;
    try {
      view.actor(newerActor);
      expect(screen.queryByText(originalFileName)).not.toBeInTheDocument();
      released = true;
      await api.recover(readerB);
      expect(view.recovered).not.toHaveBeenCalled();
      expect(screen.queryByText(originalFileName)).not.toBeInTheDocument();
    } finally {
      if (!released) await api.recover(newerActor);
    }
  },
);

it.each(['inventory', 'versions', 'detail'] as const)(
  'does not start recovery for an old %s refusal delivered after a newer Actor commits',
  async (ancestor) => {
    const api = boundary();
    const view = show();
    await positiveDocument();
    api.hold(ancestor);
    view.actor(readerB);
    await api.requestedRead();
    const newerActor = {
      ...readerB,
      activeCompany: {
        ...readerB.activeCompany,
        grants: withoutCompanyGrants(
          readerB.activeCompany.grants,
          'company_document_content_reader',
        ),
      },
    };
    const recoveries = () =>
      api.calls.filter((call) => call.path === actorPath);
    await act(async () => view.actor(newerActor));
    try {
      await api.deny(403);
      expect(recoveries()).toHaveLength(0);
      expect(view.recovered).not.toHaveBeenCalled();
    } finally {
      if (recoveries().length) await api.recover(newerActor);
    }
  },
);

it('keeps a correction confirmed with read-only recovery when its first source refresh is unavailable', async () => {
  const api = boundary();
  show();
  await positiveDocument();
  await dispatch('correction');
  await waitFor(() => expect(api.mutations()).toHaveLength(1));
  api.failNextDocumentRead();
  await api.confirm('correction');
  await screen.findByText('Metadata correction confirmed.');
  await screen.findByText(
    'The save was confirmed, but the evidence could not be refreshed. Retry only the read.',
  );
  expect(api.mutations()).toHaveLength(1);
  reloadEvidence();
  await screen.findByRole('heading', { name: 'Corrected literal notice' });
  expect(api.mutations()).toHaveLength(1);
});

it('refreshes a server-withheld payer projection independently of otherwise authorized evidence and PDF work', async () => {
  const api = boundary();
  show();
  await positiveDocument();
  await screen.findByRole('region', { name: /^Exact payer$/u });
  api.withholdPayer();
  reloadEvidence();
  await screen.findByText(
    'The frozen payer is unavailable with your current access.',
  );
  expect(
    screen.queryByRole('region', { name: /^Exact payer$/u }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'Fictional notice' }),
  ).toBeVisible();
  await screen.findByText(originalFileName, { exact: true });
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Designate as official' }),
    ).toBeEnabled(),
  );
  expect(
    screen.getByRole('button', { name: 'Download Version 1 PDF' }),
  ).toBeEnabled();
  expect(api.mutations()).toHaveLength(0);
});

it('preserves authorized evidence projections without duplicate reads when only the Actor display label changes', async () => {
  const api = boundary();
  const view = show();
  await positiveDocument();
  const requests = api.calls.map(({ method, path }) => ({ method, path }));
  await act(async () => {
    view.actor({ ...actorA, displayName: 'Updated member label' });
  });
  expect(screen.getByText('Updated member label')).toBeVisible();
  expect(screen.getByText(originalFileName, { exact: true })).toBeVisible();
  expect(api.calls.map(({ method, path }) => ({ method, path }))).toEqual(
    requests,
  );
  expect(view.recovered).not.toHaveBeenCalled();
});

it('withholds the old evidence inventory while a replacement read capture is still awaiting its native reply', async () => {
  const api = boundary();
  const view = show();
  await positiveDocument();
  expect(screen.getByRole('button', { name: 'Open evidence' })).toBeVisible();
  api.hold('inventory');
  view.actor(readerB);
  await api.requestedRead();
  try {
    expect(
      screen.queryByRole('button', { name: 'Open evidence' }),
    ).not.toBeInTheDocument();
  } finally {
    await api.reload(500);
  }
});

it.each([
  { ancestor: 'detail', action: 'upload', status: 403 },
  { ancestor: 'versions', action: 'upload', status: 404 },
  { ancestor: 'detail', action: 'designation', status: 404 },
  { ancestor: 'versions', action: 'designation', status: 403 },
  { ancestor: 'detail', action: 'correction', status: 403 },
  { ancestor: 'inventory', action: 'registration', status: 403 },
] as const)(
  'keeps the $action envelope through a live $ancestor $status refusal and Reader-only recovery',
  async ({ ancestor, action, status }) => {
    const api = boundary(action === 'registration');
    const view = show(action === 'registration');
    if (action !== 'registration') await positiveDocument();
    const ownedFile = await dispatch(action);
    await waitFor(() => expect(api.mutations()).toHaveLength(1));
    const original = api.mutations()[0];
    expect(original?.key).toMatch(/^[a-f0-9-]{36}$/u);
    if (action === 'upload') expect(original?.body).toBe(ownedFile);
    await api.uncertain();
    await screen.findByRole('button', {
      name: retryNames[action],
    });
    const before = paymentEvidenceAuthority(actorA);
    const after = paymentEvidenceAuthority(readerB);
    expect(after?.readKey).not.toBe(before?.readKey);
    for (const key of [
      'registerKey',
      'correctKey',
      'uploadKey',
      'designateKey',
    ] as const)
      expect(after?.[key]).toBe(before?.[key]);
    api.hold(ancestor);
    view.actor(readerB);
    await api.requestedRead();
    // Server Reader changed again; browser B remains current until native recovery returns C.
    await api.deny(status);
    const denied =
      ancestor === 'versions'
        ? 'Versions are not available with your current access.'
        : 'Payment evidence is unavailable with your current access.';
    await screen.findByText(denied, { exact: true });
    if (ancestor === 'detail') {
      expect(
        screen.queryByRole('heading', {
          name: 'Fictional notice',
        }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText('Fictional manual notice', { exact: true }),
      ).not.toBeInTheDocument();
    }
    if (ancestor === 'versions')
      expect(
        screen.queryByRole('button', { name: 'Version 1' }),
      ).not.toBeInTheDocument();
    if (ancestor !== 'inventory') noFreshCommands(ancestor);
    expect(original?.signal?.aborted).toBe(false);
    expect(
      screen.getByRole('button', { name: retryNames[action] }),
    ).toBeEnabled();
    const recovery = status === 404 ? view.refreshActor() : undefined;
    await api.actorRequested();
    await api.recover(readerC);
    await recovery;
    if (action !== 'registration') await positiveDocument(false);
    fireEvent.click(screen.getByRole('button', { name: retryNames[action] }));
    await waitFor(() => expect(api.mutations()).toHaveLength(2));
    const retried = api.mutations()[1];
    expect(retried?.url).toBe(original?.url);
    expect(retried?.body).toBe(original?.body);
    expect(retried?.key).toBe(original?.key);
    if (action === 'upload') expect(retried?.body).toBe(ownedFile);
    await api.confirm(action);
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: retryNames[action] }),
      ).not.toBeInTheDocument(),
    );
    expect(api.mutations()).toHaveLength(2);
  },
);

it('does not resurrect a retired Detail projection on read-capture A→B→A or grant fresh writes from a denied cached target', async () => {
  const api = boundary();
  const view = show();
  await positiveDocument();
  api.hold('detail');
  view.actor(readerB);
  await api.requestedRead();
  expect(
    screen.queryByRole('heading', { name: 'Fictional notice' }),
  ).not.toBeInTheDocument();
  view.actor(actorA);
  expect(
    screen.queryByRole('heading', { name: 'Fictional notice' }),
  ).not.toBeInTheDocument();
  await api.releaseRetiredReads();
  expect(
    screen.queryByText('Stale retired confidential title'),
  ).not.toBeInTheDocument();
  await api.deny(404);
  await screen.findByText(
    'Payment evidence is unavailable with your current access.',
    { exact: true },
  );
  noFreshCommands('detail');
  expect(api.mutations()).toHaveLength(0);
});

it.each([
  { action: 'upload', owner: 'key' },
  { action: 'upload', owner: 'identity' },
  { action: 'upload', owner: 'selection' },
  { action: 'designation', owner: 'key' },
  { action: 'designation', owner: 'identity' },
  { action: 'designation', owner: 'selection' },
] as const)(
  'retires its $action envelope irreversibly when its own $owner changes A→B→A',
  async ({ action, owner }) => {
    const api = boundary();
    const view = show();
    await positiveDocument();
    await dispatch(action);
    await waitFor(() => expect(api.mutations()).toHaveLength(1));
    const original = api.mutations()[0];
    view.retire(owner);
    expect(original?.signal?.aborted).toBe(true);
    await api.uncertain();
    await positiveDocument();
    expect(
      screen.queryByRole('button', { name: retryNames[action] }),
    ).not.toBeInTheDocument();
    if (action === 'upload') {
      expect(screen.getByLabelText('Choose the PDF file')).toHaveValue('');
      expect(
        screen.getByRole('button', { name: 'Preserve PDF' }),
      ).toBeDisabled();
    }
    expect(api.mutations()).toHaveLength(1);
  },
);

const freshCommandNames = {
  correction: 'Correct draft metadata',
  upload: 'Preserve PDF',
  designation: 'Designate as official',
  successor: 'Start new draft',
};
function expectDefiniteConflict(action: keyof typeof freshCommandNames) {
  const button = screen.queryByRole('button', {
    name: freshCommandNames[action],
  });
  if (button) expect(button).toBeDisabled();
  expect(
    screen.getByText(
      action === 'correction'
        ? 'The Document changed. Reload it before continuing.'
        : action === 'upload'
          ? 'This Document changed. Reload it before trying again.'
          : 'This Document changed. Reload the Document and its Versions before trying again.',
    ),
  ).toBeVisible();
}
function reloadEvidence() {
  const button = screen.getAllByRole('button', { name: 'Reload evidence' })[0];
  if (!button) throw new Error('Expected the native explicit evidence reload');
  fireEvent.click(button);
}
it.each([
  { action: 'correction', revision: 2 },
  { action: 'upload', revision: 3 },
  { action: 'designation', revision: 2 },
  { action: 'successor', revision: 3 },
] as const)(
  'recovers a definite $action conflict only after explicit successful native reload, with revision $revision',
  async ({ action, revision }) => {
    const api = boundary(false, action === 'successor');
    const view = show();
    await positiveDocument(action !== 'successor');
    if (action === 'successor')
      expect(
        screen.getByRole('button', { name: 'Start new draft' }),
      ).toBeEnabled();
    await dispatch(action);
    await waitFor(() => expect(api.mutations()).toHaveLength(1));
    const original = api.mutations()[0];
    await api.conflict();
    expectDefiniteConflict(action);

    // A passive current read/revision update is not deliberate conflict recovery.
    api.observeRevision(revision);
    view.actor(readerB);
    await positiveDocument(false);
    expectDefiniteConflict(action);
    expect(api.mutations()).toHaveLength(1);

    api.hold('detail');
    reloadEvidence();
    await api.requestedRead();
    expectDefiniteConflict(action);
    await api.reload(500);
    expectDefiniteConflict(action);
    expect(api.mutations()).toHaveLength(1);

    // Detail success is sufficient for correction. Version owners need their own read.
    api.hold('versions');
    reloadEvidence();
    await api.requestedRead();
    if (action !== 'correction') expectDefiniteConflict(action);
    await api.reload(500);
    if (action !== 'correction') expectDefiniteConflict(action);
    api.hold('versions');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Retry loading Versions' }),
    );
    await api.requestedRead();
    if (action !== 'correction') expectDefiniteConflict(action);
    await api.reload(200);
    await waitFor(() =>
      expect(
        action === 'upload'
          ? screen.getByLabelText('Choose the PDF file')
          : screen.getByRole('button', { name: freshCommandNames[action] }),
      ).toBeEnabled(),
    );
    expect(api.mutations()).toHaveLength(1);
    if (action === 'upload')
      expect(
        screen.getByRole('button', { name: 'Preserve PDF' }),
      ).toBeDisabled();

    await dispatch(action);
    await waitFor(() => expect(api.mutations()).toHaveLength(2));
    const next = api.mutations()[1];
    expect(next?.key).not.toBe(original?.key);
    if (action === 'upload')
      expect(next?.url).toContain(`expectedRevision=${revision}`);
    else {
      if (typeof next?.body !== 'string')
        throw new Error('Expected native JSON intent');
      expect(JSON.parse(next.body)).toMatchObject({
        expectedRevision: revision,
      });
    }
    await api.conflict();
  },
);
