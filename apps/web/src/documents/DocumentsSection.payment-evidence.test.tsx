import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import { afterEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import { SectionVisibility } from '../production-shell/section-visibility';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import { changeValue } from '../test/select-option';
import {
  paymentEvidenceActor,
  paymentEvidenceDocument,
  paymentEvidenceIds as ids,
} from '../payment-evidence/payment-evidence.test-fixture';
import { DocumentsSection } from './DocumentsSection';
import type { RequestedDocument } from './DocumentWorkspace';

const createdAt = '2026-01-15T09:00:00.000Z';
const actor = paymentEvidenceActor();
const identity = deterministicBrowserIdentity({
  authorization: 'Bearer documents-section-boundary',
});
function nativeDocument(documentId: string, versionId: string, title: string) {
  return {
    id: documentId,
    companyId: ids.company,
    clientId: ids.client,
    clientDossierId: ids.client,
    clientDisplayName: 'Fictional original Client',
    title,
    purpose: 'Ordinary native Document positive control',
    type: 'questionnaire',
    confidentiality: 'company-confidential',
    createdAt,
    workingRevision: 1,
    correction: 'allowed',
    version: {
      id: versionId,
      status: 'draft',
      representation: {
        id: '20000000-0000-4000-8000-000000000001',
        kind: 'external-reference',
        verification: 'unverified',
        access: 'granted',
        url: 'https://example.test/native-questionnaire',
      },
    },
  };
}
const first = nativeDocument(
  '20000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000003',
  'Ordinary Document A',
);
const second = nativeDocument(
  '20000000-0000-4000-8000-000000000004',
  '20000000-0000-4000-8000-000000000005',
  'Requested Document B',
);
const latest = nativeDocument(
  '20000000-0000-4000-8000-000000000006',
  '20000000-0000-4000-8000-000000000007',
  'Latest requested Document C',
);
const unrelated = {
  ...nativeDocument(
    '20000000-0000-4000-8000-000000000008',
    '20000000-0000-4000-8000-000000000009',
    'Another Client Document',
  ),
  clientId: '20000000-0000-4000-8000-000000000010',
  clientDossierId: '20000000-0000-4000-8000-000000000010',
  clientDisplayName: 'Another Client',
};
const nativeDocuments = [first, second, latest, unrelated];
const registration = paymentEvidenceDocument();
function nativeVersions(document: (typeof nativeDocuments)[number]) {
  return {
    workingRevision: document.workingRevision,
    mutable: true,
    versions: [
      {
        id: document.version.id,
        number: 1,
        status: 'draft',
        createdAt,
        createdBy: { displayName: actor.displayName },
        pdfContent: { state: 'absent' },
        representations: [
          {
            ...document.version.representation,
            position: 1,
            form: 'other',
            primary: true,
            appendedAfterDesignation: false,
            addedAt: createdAt,
            addedBy: { displayName: actor.displayName },
          },
        ],
      },
    ],
  };
}
type HttpCall = {
  path: string;
  method: string;
  body: BodyInit | null | undefined;
  key: string | null;
  signal: AbortSignal | null | undefined;
};

/** Fakes only the HTTP boundary; all host, selection and editor owners are real. */
function apiBoundary(sourceVersions?: unknown) {
  const calls: HttpCall[] = [];
  const writes: ((response: Response) => void)[] = [];
  const heldDetails = new Map<string, ((response: Response) => void)[]>();
  const heldIds = new Set<string>();
  let holdInventory = false;
  const inventories: ((response: Response) => void)[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(input.toString(), 'http://localhost').pathname;
      const method = init?.method ?? 'GET';
      calls.push({
        path,
        method,
        body: init?.body,
        key: new Headers(init?.headers).get('idempotency-key'),
        signal: init?.signal,
      });
      if (method === 'POST' && path === '/api/documents')
        return new Promise<Response>((resolve) => writes.push(resolve));
      if (method !== 'GET')
        throw new Error(`Unexpected native HTTP ${method} ${path}`);
      if (path === '/api/access/current-actor') return Response.json(actor);
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
      if (path === '/api/documents' && holdInventory)
        return new Promise<Response>((resolve) => inventories.push(resolve));
      if (path === '/api/documents')
        return Response.json([...nativeDocuments, registration]);
      if (path === `/api/documents/${ids.document}`)
        return Response.json(registration);
      if (path === `/api/documents/${ids.document}/versions` && sourceVersions)
        return Response.json(sourceVersions);
      if (path === `/api/documents/${ids.document}/versions`)
        return Response.json({
          workingRevision: 1,
          mutable: true,
          versions: [
            {
              id: ids.version,
              number: 1,
              status: 'draft',
              createdAt,
              createdBy: { displayName: actor.displayName },
              pdfContent: { state: 'absent' },
              representations: [],
            },
          ],
        });
      for (const document of nativeDocuments) {
        if (path === `/api/documents/${document.id}`) {
          if (heldIds.has(document.id))
            return new Promise<Response>((resolve) => {
              const waiting = heldDetails.get(document.id) ?? [];
              waiting.push(resolve);
              heldDetails.set(document.id, waiting);
            });
          return Response.json(document);
        }
        if (path === `/api/documents/${document.id}/versions`)
          return Response.json(nativeVersions(document));
      }
      throw new Error(`Unexpected native HTTP ${method} ${path}`);
    }),
  );
  return {
    calls,
    holdInventory() {
      holdInventory = true;
    },
    async releaseInventory() {
      holdInventory = false;
      if (!inventories.length)
        throw new Error('No native inventory is pending');
      await act(async () => {
        for (const resolve of inventories.splice(0))
          resolve(Response.json([...nativeDocuments, registration]));
      });
    },
    detailReads(documentId: string) {
      return calls.filter(
        (call) =>
          call.method === 'GET' && call.path === `/api/documents/${documentId}`,
      );
    },
    registrations() {
      return calls.filter(
        (call) => call.method === 'POST' && call.path === '/api/documents',
      );
    },
    async releaseRegistration(status = 201) {
      const resolve = writes.shift();
      if (!resolve) throw new Error('No actual registration HTTP is pending');
      await act(async () =>
        resolve(Response.json(status === 201 ? registration : {}, { status })),
      );
    },
    holdDetail(documentId: string) {
      heldIds.add(documentId);
    },
    async releaseDetail(document: (typeof nativeDocuments)[number]) {
      const resolve = heldDetails.get(document.id)?.shift();
      if (!resolve) throw new Error('No actual detail HTTP is pending');
      // Deliberately ignore the transport's aborted signal: the real UI must retire it.
      await act(async () => resolve(Response.json(document)));
    },
  };
}

type HostProps = Parameters<typeof DocumentsSection>[0];
function show(initial: Partial<HostProps> = {}) {
  let props: HostProps = { actor, identity, legacyKey: 'legacy-A', ...initial };
  const ui = () => (
    <SectionVisibility value={true}>
      <ApplicationPresentation value="prisme">
        <DocumentsSection {...props} />
      </ApplicationPresentation>
    </SectionVisibility>
  );
  const view = render(ui());
  return {
    update(next: Partial<HostProps>) {
      props = { ...props, ...next };
      view.rerender(ui());
    },
  };
}
async function selectSource() {
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Payment evidence',
    }),
  );
  await screen.findByRole('form', {
    name: 'Register payment evidence',
  });
}
async function fillAndDispatchSource() {
  await waitFor(() =>
    expect(screen.getByLabelText('Original Client')).toBeEnabled(),
  );
  changeValue(screen.getByLabelText('Original Client'), ids.client);
  await waitFor(() =>
    expect(screen.getByLabelText('Exact payer')).toBeEnabled(),
  );
  changeValue(screen.getByLabelText('Exact payer'), 'PRIMARY');
  changeValue(screen.getByLabelText('Title'), registration.title);
  changeValue(screen.getByLabelText('Purpose'), registration.purpose);
  changeValue(
    screen.getByLabelText('Declared source'),
    registration.paymentEvidenceSource.sourceDescription,
  );
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Preserve evidence source',
    }),
  );
}
function intent(
  documentId: string,
  requestId: number,
  sourceSignal?: AbortSignal,
): RequestedDocument {
  return { documentId, requestId, focus: 'document', sourceSignal };
}
afterEach(() => vi.unstubAllGlobals());

it('opens an ordinary Document, then routes one new native intent out of Source without replay on remount', async () => {
  const api = apiBoundary();
  const view = show();
  fireEvent.click(await screen.findByRole('button', { name: first.title }));
  await screen.findByRole('heading', { name: first.title });
  expect(api.detailReads(first.id)).toHaveLength(1);
  await selectSource();
  const requested = intent(second.id, 1);
  view.update({ requestedDocument: requested });
  const heading = await screen.findByRole('heading', {
    name: second.title,
  });
  await waitFor(() => expect(heading).toHaveFocus());
  expect(api.detailReads(second.id)).toHaveLength(1);
  expect(
    screen.queryByRole('form', {
      name: 'Register payment evidence',
    }),
  ).not.toBeInTheDocument();
  view.update({ requestedDocument: { ...requested } });
  await selectSource();
  fireEvent.click(screen.getByRole('button', { name: 'Other Documents' }));
  await screen.findByRole('button', { name: first.title });
  expect(api.detailReads(second.id)).toHaveLength(1);
  expect(
    screen.queryByRole('heading', { name: second.title }),
  ).not.toBeInTheDocument();
});

it.each(['active', 'source-aborted'] as const)(
  'waits for native inventory readiness before focusing an %s opening',
  async (state) => {
    const api = apiBoundary();
    const view = show();
    await selectSource();
    await screen.findByRole('button', { name: 'Open evidence' });
    api.holdInventory();
    const source = new AbortController();
    view.update({ requestedDocument: intent(second.id, 1, source.signal) });
    await waitFor(() => expect(api.detailReads(second.id)).toHaveLength(1));
    await act(async () => {});
    // Run the native focus frame while the real detail is still behind its
    // pending inventory. Later readiness must retain, or retire, that focus debt.
    await act(async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    });
    expect(
      screen.queryByRole('heading', { name: second.title }),
    ).not.toBeInTheDocument();
    if (state === 'source-aborted') await act(async () => source.abort());
    await api.releaseInventory();
    const heading = await screen.findByRole('heading', { name: second.title });
    if (state === 'active') await waitFor(() => expect(heading).toHaveFocus());
    else expect(heading).not.toHaveFocus();
    expect(api.detailReads(second.id)).toHaveLength(1);
  },
);

it('keeps a protected Source command and identical uncertain retry until the latest native intent can open once', async () => {
  const api = apiBoundary();
  const view = show();
  await screen.findByRole('button', { name: first.title });
  await selectSource();
  await fillAndDispatchSource();
  await waitFor(() => expect(api.registrations()).toHaveLength(1));
  const original = api.registrations()[0];
  if (!original || typeof original.body !== 'string')
    throw new Error('Missing dispatched JSON command');
  expect(JSON.parse(original.body)).toEqual({
    type: 'payment-evidence',
    clientId: ids.client,
    payer: { kind: 'PRIMARY' },
    title: registration.title,
    purpose: registration.purpose,
    sourceDescription: registration.paymentEvidenceSource.sourceDescription,
    receivedOn: null,
  });
  expect(original.key).toMatch(/^[0-9a-f-]{36}$/u);
  view.update({ requestedDocument: intent(second.id, 1) });
  view.update({ requestedDocument: intent(latest.id, 2) });
  expect(
    screen.getByRole('button', { name: 'Other Documents' }),
  ).toBeDisabled();
  expect(screen.getByLabelText('Title')).toHaveValue(registration.title);
  expect(original.signal?.aborted).toBe(false);
  expect(api.detailReads(second.id)).toHaveLength(0);
  expect(api.detailReads(latest.id)).toHaveLength(0);
  await api.releaseRegistration(502);
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Retry identical evidence registration',
    }),
  );
  await waitFor(() => expect(api.registrations()).toHaveLength(2));
  const retry = api.registrations()[1];
  expect(retry?.body).toBe(original.body);
  expect(retry?.key).toBe(original.key);
  expect(retry?.signal?.aborted).toBe(false);
  expect(api.detailReads(latest.id)).toHaveLength(0);
  await api.releaseRegistration();
  await screen.findByRole('heading', { name: latest.title });
  expect(api.detailReads(latest.id)).toHaveLength(1);
  expect(api.detailReads(second.id)).toHaveLength(0);
  expect(api.registrations()).toHaveLength(2);
  view.update({
    requestedDocument: intent(latest.id, 2),
    legacyKey: 'legacy-B',
  });
  await screen.findByRole('button', { name: first.title });
  view.update({ legacyKey: 'legacy-A' });
  await screen.findByRole('button', { name: first.title });
  expect(api.detailReads(latest.id)).toHaveLength(1);
});

it('never replays its initial or already-aborted native intent across Source and legacy A→B→A', async () => {
  const api = apiBoundary();
  const mounted = intent(second.id, 7);
  const view = show({ requestedDocument: mounted });
  await screen.findByRole('button', { name: first.title });
  expect(api.detailReads(second.id)).toHaveLength(0);
  await selectSource();
  view.update({ legacyKey: 'legacy-B' });
  view.update({ legacyKey: 'legacy-A' });
  expect(
    screen.getByRole('form', {
      name: 'Register payment evidence',
    }),
  ).toBeVisible();
  const source = new AbortController();
  source.abort();
  view.update({ requestedDocument: intent(latest.id, 8, source.signal) });
  fireEvent.click(screen.getByRole('button', { name: 'Other Documents' }));
  await screen.findByRole('button', { name: first.title });
  expect(api.detailReads(second.id)).toHaveLength(0);
  expect(api.detailReads(latest.id)).toHaveLength(0);
});

it.each(['shell-cleared', 'source-aborted'] as const)(
  'retires a %s native intent while preserving the pending Source command',
  async (retirement) => {
    const api = apiBoundary();
    const view = show();
    await selectSource();
    await fillAndDispatchSource();
    await waitFor(() => expect(api.registrations()).toHaveLength(1));
    const source = new AbortController();
    view.update({ requestedDocument: intent(second.id, 1, source.signal) });
    if (retirement === 'shell-cleared')
      view.update({ requestedDocument: undefined });
    else await act(async () => source.abort());
    expect(api.registrations()[0]?.signal?.aborted).toBe(false);
    await api.releaseRegistration();
    await screen.findByRole('heading', {
      name: registration.title,
    });
    expect(api.detailReads(second.id)).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Other Documents' }));
    await screen.findByRole('button', { name: first.title });
    view.update({ legacyKey: 'legacy-B' });
    await screen.findByRole('button', { name: first.title });
    view.update({ legacyKey: 'legacy-A' });
    await screen.findByRole('button', { name: first.title });
    expect(api.detailReads(second.id)).toHaveLength(0);
    expect(api.registrations()).toHaveLength(1);
  },
);

it('retires an abort-ignoring late native read before returning through Source and legacy remounts', async () => {
  const api = apiBoundary();
  api.holdDetail(second.id);
  const view = show();
  await selectSource();
  const source = new AbortController();
  view.update({ requestedDocument: intent(second.id, 1, source.signal) });
  await waitFor(() => expect(api.detailReads(second.id)).toHaveLength(1));
  await act(async () => source.abort());
  expect(api.detailReads(second.id)[0]?.signal?.aborted).toBe(true);
  await selectSource();
  await api.releaseDetail(second);
  expect(
    screen.queryByRole('heading', { name: second.title }),
  ).not.toBeInTheDocument();
  view.update({ legacyKey: 'legacy-B' });
  view.update({ legacyKey: 'legacy-A' });
  expect(
    screen.getByRole('form', {
      name: 'Register payment evidence',
    }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Other Documents' }));
  await screen.findByRole('button', { name: first.title });
  expect(api.detailReads(second.id)).toHaveLength(1);
});

it('routes a fresh Client working-Documents filter to native inventory while payer-only removal stays in Source', async () => {
  const api = apiBoundary();
  const initialFilter = {
    clientDossierId: ids.client,
    displayName: 'Fictional original Client',
    requestId: 10,
  };
  const view = show({ clientFilter: initialFilter });
  await screen.findByRole('button', { name: first.title });
  await selectSource();
  view.update({
    actor: {
      ...actor,
      activeCompany: { ...actor.activeCompany, clientPermissions: [] },
    },
    clientFilter: undefined,
    legacyKey: 'legacy-B',
  });
  expect(
    screen.getByRole('form', {
      name: 'Register payment evidence',
    }),
  ).toBeVisible();
  expect(
    screen.getByText(
      'Company Client identity-read access is required to select and copy a new payer.',
    ),
  ).toBeVisible();
  view.update({ actor, legacyKey: 'legacy-A' });
  expect(
    screen.getByRole('form', {
      name: 'Register payment evidence',
    }),
  ).toBeVisible();
  const requestedFilter = { ...initialFilter, requestId: 11 };
  view.update({ clientFilter: requestedFilter });
  await screen.findByRole('button', { name: first.title });
  expect(
    screen.getByRole('searchbox', {
      name: 'Filter working Documents',
    }),
  ).toHaveValue(initialFilter.displayName);
  expect(
    screen.queryByRole('button', { name: unrelated.title }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('form', {
      name: 'Register payment evidence',
    }),
  ).not.toBeInTheDocument();
  expect(api.detailReads(first.id)).toHaveLength(0);
  await selectSource();
  view.update({ clientFilter: { ...requestedFilter } });
  expect(
    screen.getByRole('form', {
      name: 'Register payment evidence',
    }),
  ).toBeVisible();
});

it.each([true, false])(
  'opens a minimal Payment native target through the Source owner and keeps its exact superseded Version (present=%s)',
  async (present) => {
    const successor = '20000000-0000-4000-8000-000000000020';
    const version = (
      id: string,
      number: number,
      status: 'official' | 'superseded',
    ) => ({
      id,
      number,
      status,
      createdAt,
      createdBy: { displayName: actor.displayName },
      representations: [],
      pdfContent: { state: 'stored', access: 'denied' },
      designatedAt: createdAt,
      designatedBy: { displayName: actor.displayName },
      frozen: { title: registration.title, purpose: registration.purpose },
      ...(status === 'superseded'
        ? { supersededAt: createdAt, supersededByVersionNumber: 2 }
        : {}),
    });
    const api = apiBoundary({
      workingRevision: 6,
      mutable: true,
      versions: [
        version(successor, 2, 'official'),
        ...(present ? [version(ids.version, 1, 'superseded')] : []),
      ],
    });
    const view = show();
    await screen.findByRole('button', { name: first.title });
    view.update({
      requestedPaymentEvidence: {
        ...intent(ids.document, 1),
        paymentEvidenceVersionId: ids.version,
      },
    });
    await screen.findByRole('heading', { name: registration.title });
    if (present) {
      await screen.findByRole('heading', { name: 'Version 1 · Superseded' });
      expect(screen.getByRole('button', { name: 'Version 1' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByRole('button', { name: 'Version 2' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    } else {
      await screen.findByText(
        'The Versions could not be loaded. The Document remains available.',
      );
      expect(
        screen.queryByRole('heading', { name: 'Version 2 · Official' }),
      ).not.toBeInTheDocument();
    }
    // Metadata and payer projections have their existing independent Source owners.
    expect(api.detailReads(ids.document)).toHaveLength(2);
    expect(
      api.calls.filter((call) => call.path.includes('/content')),
    ).toHaveLength(0);
    expect(api.registrations()).toHaveLength(0);
  },
);
