import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import type { ActorContext } from './access-types';
import {
  buildClientRequest,
  requestListItemFor,
} from './test/commercial-intake-responses';
import {
  modelContractActor,
  modelContractFixture,
} from './contract/model-contract.fixture';
import {
  modelOfferFixture,
  modelOfferEconomicFixture,
  selectedModelFixture,
} from './offer/model-offer.fixture';
import {
  approvedSigningContract,
  reportedSigningFixture,
} from './contract/reported-signing.fixture';
import {
  pdfReply,
  malformedPdfBytes,
} from './commercial-pdf/commercial-pdf.test-fixture';
import type { CommercialPdfTarget } from './commercial-pdf/commercial-pdf-response';

const companyId = modelOfferFixture().companyId,
  opportunityId = modelOfferFixture().opportunityId;
const identity = deterministicBrowserIdentity();
const scrollable: {
  scrollIntoView?: (options?: ScrollIntoViewOptions) => void;
} = Element.prototype;
const nativeScroll = scrollable.scrollIntoView;
function companyOf(actor: ActorContext) {
  const company = actor.activeCompany;
  if (!company) throw new Error('Expected the synthetic PDF Company.');
  return company;
}
function actor(): ActorContext {
  return {
    ...modelContractActor,
    activeCompany: {
      ...modelContractActor.activeCompany,
      id: companyId,
      displayName: 'Synthetic PDF Company',
      commercialIntakePermissionAssignmentId: 'intake-965',
      commercialIntakePermissionSetVersion: 'v1',
      commercialIntakePermissions: [
        'commercial.request.read',
        'commercial.request.create',
        'commercial.opportunity.read',
        'commercial.opportunity.create',
      ],
      commercialActivityPermissions: ['commercial.activity.read'],
    },
  };
}
const detail = buildClientRequest({
  id: 'request-pdf-965',
  companyId,
  subject: 'Exact PDF Request',
  clientAssociationStatus: 'visible',
  clientReference: {
    originalClientId: 'client-pdf-965',
    currentClientId: 'client-pdf-965',
    displayName: 'Synthetic PDF Client',
  },
  initialOpportunity: { id: opportunityId },
});
function offerAt(number: 1 | 2) {
  const first = modelOfferFixture();
  return number === 1
    ? first
    : {
        ...first,
        revision: 2,
        version: {
          ...first.version,
          id: '90000000-0000-4000-8000-000000000965',
          versionNumber: 2,
          predecessorVersionId: first.version.id,
        },
      };
}
function target(kind: 'offer' | 'contract'): CommercialPdfTarget {
  const offer = modelOfferFixture(),
    contract = modelContractFixture(),
    source = kind === 'offer' ? offer : contract;
  const identity = {
    workspaceId: modelContractActor.workspaceId,
    companyId,
    opportunityId,
    rootId: source.id,
    reference: source.illustrativeReference,
    versionId: source.version.id,
    versionNumber: source.version.versionNumber,
    language: 'ro',
    createdAt: source.version.createdAt,
    sourceRendererVersion: 1,
    sourceHtmlSha256: source.version.representation.sha256,
  } satisfies Omit<
    CommercialPdfTarget,
    'kind' | 'provenance' | 'sourceRendererCode'
  >;
  return kind === 'offer'
    ? {
        ...identity,
        kind,
        provenance: 'COMPANY_MODEL_ESTIMATE',
        sourceRendererCode: 'OFFER_COMPANY_CONSULTING_RO',
      }
    : {
        ...identity,
        kind,
        provenance: 'COMPANY_MODEL_OFFER',
        sourceRendererCode: 'COMPANY_CONSULTING_CONTRACT_RO',
      };
}

function deferred() {
  let resolve: (response: Response) => void = () => undefined;
  const promise = new Promise<Response>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}
function installTransport() {
  const mutations: string[] = [];
  const pdf: {
    kind: 'offer' | 'contract';
    resolve: (response: Response) => void;
    signal: AbortSignal | null | undefined;
    url: string;
  }[] = [];
  const quality: {
    resolve: (response: Response) => void;
    body: BodyInit | null | undefined;
    key: string | null;
  }[] = [];
  const preparations: {
    resolve: (response: Response) => void;
    body: BodyInit | null | undefined;
    key: string | null;
  }[] = [];
  const actorSignals: (AbortSignal | null | undefined)[] = [];
  const state: {
    quality: typeof quality;
    preparations: typeof preparations;
    actorSignals: typeof actorSignals;
    nextOfferRead: Promise<Response> | null;
    nextContractRead: Promise<Response> | null;
    signed: boolean;
    documentDenied: boolean;
    denyNextOfferVersion: boolean;
    nextActorRead: Promise<Response> | null;
    actor: ActorContext;
    head: 1 | 2;
    denyHistory: boolean;
    actorReads: number;
    mutations: typeof mutations;
    pdf: typeof pdf;
  } = {
    quality,
    preparations,
    actorSignals,
    nextOfferRead: null,
    nextContractRead: null,
    signed: false,
    documentDenied: false,
    denyNextOfferVersion: false,
    nextActorRead: null,
    actor: actor(),
    head: 1,
    denyHistory: false,
    actorReads: 0,
    mutations,
    pdf,
  };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(input.toString(), 'http://localhost'),
      path = url.pathname;
    if ((init?.method ?? 'GET') !== 'GET') state.mutations.push(path);
    if (path.endsWith('/from-approved-model') && init?.method === 'POST')
      return new Promise<Response>((resolve) =>
        state.preparations.push({
          resolve,
          body: init.body,
          key: new Headers(init.headers).get('idempotency-key'),
        }),
      );
    if (path.endsWith('/for-offer'))
      return Response.json({ selection: selectedModelFixture });
    if (path.endsWith('/quality-checks') && init?.method === 'POST')
      return new Promise<Response>((resolve) =>
        state.quality.push({
          resolve,
          body: init.body,
          key: new Headers(init.headers).get('idempotency-key'),
        }),
      );
    if (path.endsWith('/pdf'))
      return new Promise<Response>((resolve) =>
        state.pdf.push({
          kind: path.includes('/offers/') ? 'offer' : 'contract',
          resolve,
          signal: init?.signal,
          url: url.href,
        }),
      );
    if (path.endsWith('/access/current-actor')) {
      state.actorReads += 1;
      state.actorSignals.push(init?.signal);
      return state.nextActorRead ?? Response.json(state.actor);
    }
    if (path.endsWith('/companies'))
      return Response.json([
        { id: companyId, displayName: 'Synthetic PDF Company' },
      ]);
    if (path.endsWith('/activity-log'))
      return Response.json({
        events: [
          {
            id: 'pdf-offer-event',
            action: 'offer.created',
            occurredAt: '2026-10-24T09:00:00.000Z',
            actor: {
              internalUserId: state.actor.internalUserId,
              displayName: 'PDF reader',
            },
            target: {
              type: 'offer_version',
              clientRequestId: detail.id,
              opportunityId,
              companyId,
              illustrativeReference: modelOfferFixture().illustrativeReference,
              offerVersionId: modelOfferFixture().version.id,
              versionNumber: 1,
            },
            metadata: {},
          },
        ],
      });
    if (path.endsWith('/operational-home'))
      return Response.json({ companyId, today: '2026-10-24', summaries: [] });
    if (path.endsWith('/commercial-intake/requests'))
      return Response.json({ items: [requestListItemFor(detail)] });
    if (path.endsWith('/commercial-intake/requests/' + detail.id))
      return Response.json(detail);
    if (path.includes('/contracts/')) {
      if (path.endsWith('/versions')) {
        if (state.denyHistory) {
          state.denyHistory = false;
          return new Response(null, { status: 403 });
        }
        return Response.json({ items: [], nextCursor: null });
      }
      if (state.nextContractRead) {
        const response = state.nextContractRead;
        state.nextContractRead = null;
        return response;
      }
      if (state.signed) {
        if (
          !state.actor.workspacePermissions.includes('client.manage') &&
          !companyOf(state.actor).clientPermissions?.includes('client.read')
        )
          return new Response(null, { status: 403 });
        const approved = approvedSigningContract(),
          signature = reportedSigningFixture();
        return Response.json({
          contract: {
            ...approved,
            revision: 3,
            version: {
              ...approved.version,
              executionState: 'EXECUTED',
              signature: {
                ...signature,
                pdf: state.documentDenied
                  ? { access: 'denied' }
                  : signature.pdf,
              },
            },
          },
        });
      }
      return Response.json({ contract: modelContractFixture() });
    }
    if (
      path === `/api/offers/opportunities/${opportunityId}` &&
      state.nextOfferRead
    )
      return state.nextOfferRead;
    if (path.includes('/offers/')) {
      if (state.denyNextOfferVersion && !path.endsWith('/versions')) {
        state.denyNextOfferVersion = false;
        return new Response(null, { status: 403 });
      }
      if (path.endsWith('/versions'))
        return Response.json({
          versions: [1, 2].map((n) => ({
            id:
              n === 1
                ? modelOfferFixture().version.id
                : '90000000-0000-4000-8000-000000000965',
            versionNumber: n,
            createdAt: modelOfferFixture().version.createdAt,
            supersededByVersionId:
              n === 1 ? '90000000-0000-4000-8000-000000000965' : null,
          })),
          nextCursor: null,
        });
      if (path.endsWith('/snapshots'))
        return Response.json({ items: [], nextCursor: null });
      return Response.json({
        offer: offerAt(
          path.endsWith('/90000000-0000-4000-8000-000000000965')
            ? 2
            : path.endsWith('/' + modelOfferFixture().version.id)
              ? 1
              : state.head,
        ),
      });
    }
    if (path.includes('/profitability-estimates'))
      return Response.json({
        items: [
          {
            ...modelOfferEconomicFixture(),
            workspaceId: modelContractActor.workspaceId,
          },
        ],
        latestVersionNumber: 1,
      });
    if (path.endsWith('/legal-entities'))
      return Response.json({ clientVersion: 1, legalEntities: [] });
    if (path.endsWith('/clients'))
      return Response.json({ items: [], nextCursor: null });
    throw new Error('Unexpected PDF App read: ' + path);
  });
  return state;
}
function control(kind: 'offer' | 'contract') {
  const element =
    document.querySelector(`.commercial-pdf-action[data-kind="${kind}"]`) ??
    document.querySelector(`.commercial-pdf-held[data-kind="${kind}"]`);
  if (!(element instanceof HTMLElement))
    throw new Error('Missing selected PDF control: ' + kind);
  return within(element);
}
async function open() {
  render(<App identity={identity} />);
  const label = await screen.findByText('Exact PDF Request', { exact: true });
  const button = label.closest('button');
  if (!button) throw new Error('Missing Request opening action.');
  fireEvent.click(button);
  await waitFor(() =>
    expect(
      control('offer').getByRole('button', {
        name: 'Download non-official PDF',
      }),
    ).toBeEnabled(),
  );
  await waitFor(() =>
    expect(
      control('contract').getByRole('button', {
        name: 'Download non-official PDF',
      }),
    ).toBeEnabled(),
  );
}
async function revalidate(
  state: ReturnType<typeof installTransport>,
  next: ActorContext,
) {
  const before = state.actorReads;
  state.actor = next;
  state.denyHistory = true;
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Contract Version history',
    }),
  );
  await waitFor(() => expect(state.actorReads).toBeGreaterThan(before));
}
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/#requests');
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('matchMedia', (media: string) => ({
    media,
    matches: true,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => true,
  }));
  scrollable.scrollIntoView = vi.fn();
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:app-965');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  scrollable.scrollIntoView = nativeScroll;
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

it('keeps the exact PDF across an actual App edit-authority remount while the old Offer owner still resets its uncertain command and rereads', async () => {
  const state = installTransport(),
    click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'Run Quality Checks' }));
  await waitFor(() => expect(state.quality).toHaveLength(1));
  await act(async () =>
    state.quality[0].resolve(new Response(null, { status: 503 })),
  );
  expect(
    await screen.findByRole('button', {
      name: 'Retry the same Quality Checks',
    }),
  ).toBeEnabled();
  fireEvent.click(
    control('offer').getByRole('button', { name: 'Download non-official PDF' }),
  );
  await waitFor(() => expect(state.pdf).toHaveLength(1));
  // Editing grant removal keeps the owner read; the existing key must still remount the editor.
  state.head = 2;
  await revalidate(state, {
    ...state.actor,
    activeCompany: {
      ...companyOf(state.actor),
      offerPermissions: ['commercial.offer.read'],
      profitabilityContributorPermissionAssignmentId: undefined,
      profitabilityContributorPermissions: [],
    },
  });
  await waitFor(() =>
    expect(
      control('offer').getByText(/Selected exact HTML: Offer .*v2/),
    ).toBeInTheDocument(),
  );
  expect(
    control('offer').getByText(/Exact PDF target: Offer .*v1/),
  ).toBeInTheDocument();
  expect(state.pdf[0].signal?.aborted).toBe(false);
  await act(async () => state.pdf[0].resolve(await pdfReply(target('offer'))));
  await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
  expect(
    screen.queryByRole('button', {
      name: 'Retry the same Quality Checks',
    }),
  ).not.toBeInTheDocument();
  expect(state.quality).toHaveLength(1);
  expect(state.mutations).toHaveLength(1);
});
it('retires only Offer PDF on explicit history navigation while its sibling Contract PDF completes', async () => {
  const state = installTransport(),
    saved: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    saved.push(this.download);
  });
  await open();
  for (const kind of ['offer', 'contract'] as const)
    fireEvent.click(
      control(kind).getByRole('button', { name: 'Download non-official PDF' }),
    );
  await waitFor(() => expect(state.pdf).toHaveLength(2));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Open version 2' }),
  );
  for (const request of state.pdf)
    await act(async () =>
      request.resolve(await pdfReply(target(request.kind))),
    );
  await waitFor(() =>
    expect(saved).toEqual([
      `contract-${target('contract').reference}-v1-non-official-ro.pdf`,
    ]),
  );
  expect(state.pdf.find((p) => p.kind === 'offer')?.signal?.aborted).toBe(true);
});
it.each([200, 403])(
  'permanently retires a held HTTP %s across consumed-read revoke/regrant in the actual App',
  async (status) => {
    const state = installTransport(),
      click = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => undefined);
    await open();
    fireEvent.click(
      control('offer').getByRole('button', {
        name: 'Download non-official PDF',
      }),
    );
    await waitFor(() => expect(state.pdf).toHaveLength(1));
    const original = state.actor;
    await revalidate(state, {
      ...original,
      activeCompany: { ...companyOf(original), offerPermissions: [] },
    });
    await waitFor(() =>
      expect(
        document.querySelector('.commercial-pdf-action[data-kind="offer"]'),
      ).toBeNull(),
    );
    expect(state.pdf[0].signal?.aborted).toBe(true);
    await revalidate(state, original);
    await waitFor(() =>
      expect(
        control('offer').getByRole('button', {
          name: 'Download non-official PDF',
        }),
      ).toBeEnabled(),
    );
    const before = state.actorReads;
    await act(async () =>
      state.pdf[0].resolve(
        status === 200
          ? await pdfReply(target('offer'))
          : new Response(null, { status: 403 }),
      ),
    );
    expect(click).not.toHaveBeenCalled();
    expect(state.actorReads).toBe(before);
  },
);

it('publishes only displayed absence through an actual reader loading/error, preserving exact failed target and retiring on explicit navigation', async () => {
  const state = installTransport(),
    gate = deferred();
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => undefined);
  await open();
  fireEvent.click(
    control('offer').getByRole('button', { name: 'Download non-official PDF' }),
  );
  await waitFor(() => expect(state.pdf).toHaveLength(1));
  state.nextOfferRead = gate.promise;
  state.head = 2;
  await revalidate(state, {
    ...state.actor,
    activeCompany: {
      ...companyOf(state.actor),
      offerPermissions: ['commercial.offer.read'],
    },
  });
  await waitFor(() =>
    expect(
      control('offer').queryByRole('button', {
        name: 'Download non-official PDF',
      }),
    ).not.toBeInTheDocument(),
  );
  expect(
    control('offer').getByText(/Exact PDF target: Offer .*v1/),
  ).toBeInTheDocument();
  expect(state.pdf[0].signal?.aborted).toBe(false);
  await act(async () =>
    state.pdf[0].resolve(new Response(null, { status: 503 })),
  );
  expect(
    await control('offer').findByRole('button', {
      name: 'Retry non-official PDF',
    }),
  ).toBeEnabled();
  await act(async () => gate.resolve(new Response(null, { status: 500 })));
  expect(
    control('offer').queryByRole('button', {
      name: 'Download non-official PDF',
    }),
  ).not.toBeInTheDocument();
  state.nextOfferRead = null;
  const offerRegion = screen.getByRole('region', {
    name: 'Illustrative Offer',
  });
  fireEvent.click(
    await within(offerRegion).findByRole('button', {
      name: 'Retry',
    }),
  );
  await waitFor(() =>
    expect(
      control('offer').getByText(/Selected exact HTML: Offer .*v2/),
    ).toBeInTheDocument(),
  );
  expect(
    control('offer').getByText(/Exact PDF target: Offer .*v1/),
  ).toBeInTheDocument();
  const heldControl = document.querySelector(
    '.commercial-pdf-held[data-kind="offer"]',
  );
  if (!(heldControl instanceof HTMLElement))
    throw new Error('Missing held PDF retry.');
  fireEvent.click(
    within(heldControl).getByRole('button', { name: 'Retry non-official PDF' }),
  );
  await waitFor(() => expect(state.pdf).toHaveLength(2));
  expect(state.pdf[1].url).toBe(state.pdf[0].url);
  fireEvent.click(
    await within(
      document.querySelector('.offer-version-history') ?? document.body,
    ).findByRole('button', { name: 'Open version 1' }),
  );
  await act(async () => state.pdf[1].resolve(await pdfReply(target('offer'))));
  expect(click).not.toHaveBeenCalled();
});
it('preserves an actual uncertain quality command body/key while PDF completes, then retries only that command explicitly', async () => {
  const state = installTransport();
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => undefined);
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'Run Quality Checks' }));
  await waitFor(() => expect(state.quality).toHaveLength(1));
  fireEvent.click(
    control('offer').getByRole('button', { name: 'Download non-official PDF' }),
  );
  await waitFor(() => expect(state.pdf).toHaveLength(1));
  await act(async () =>
    state.quality[0].resolve(new Response(null, { status: 503 })),
  );
  const retry = await screen.findByRole('button', {
    name: 'Retry the same Quality Checks',
  });
  await act(async () => state.pdf[0].resolve(await pdfReply(target('offer'))));
  await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
  expect(retry).toBeEnabled();
  fireEvent.click(retry);
  await waitFor(() => expect(state.quality).toHaveLength(2));
  expect(state.quality[1].body).toBe(state.quality[0].body);
  expect(state.quality[1].key).toBe(state.quality[0].key);
  expect(state.pdf).toHaveLength(1);
});
it('allows the existing shell Access revalidation to complete after the PDF view unmounts', async () => {
  const state = installTransport(),
    gate = deferred();
  await open();
  fireEvent.click(
    control('offer').getByRole('button', { name: 'Download non-official PDF' }),
  );
  await waitFor(() => expect(state.pdf).toHaveLength(1));
  const before = state.actorReads;
  state.nextActorRead = gate.promise;
  await act(async () =>
    state.pdf[0].resolve(new Response(null, { status: 403 })),
  );
  await waitFor(() => expect(state.actorReads).toBe(before + 1));
  expect(state.actorSignals.at(-1)).toBeUndefined();
  fireEvent.click(screen.getByRole('button', { name: 'Back to Requests' }));
  await act(async () =>
    gate.resolve(
      Response.json({ ...state.actor, displayName: 'Revalidated PDF reader' }),
    ),
  );
  expect(
    (await screen.findAllByText('Revalidated PDF reader', { exact: true }))
      .length,
  ).toBeGreaterThan(0);
});

it('retires a held PDF before the actual Activity exact-Version continuation opens that Version', async () => {
  const state = installTransport();
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => undefined);
  await open();
  fireEvent.click(
    control('offer').getByRole('button', { name: 'Download non-official PDF' }),
  );
  await waitFor(() => expect(state.pdf).toHaveLength(1));
  const activityLink = document.querySelector(
    'nav[aria-label="Primary navigation"] a[href="#activity"]',
  );
  if (!(activityLink instanceof HTMLAnchorElement))
    throw new Error('Missing actual Activity navigation.');
  fireEvent.click(activityLink);
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Open Offer Version',
    }),
  );
  await waitFor(() => expect(state.pdf[0].signal?.aborted).toBe(true));
  await act(async () => state.pdf[0].resolve(await pdfReply(target('offer'))));
  expect(click).not.toHaveBeenCalled();
  expect(
    await control('offer').findByRole('button', {
      name: 'Download non-official PDF',
    }),
  ).toBeEnabled();
});

it('offers the inline PDF beside exact HTML and keeps its independent fallback available under the unchanged disabled Offer fieldset', async () => {
  const state = installTransport();
  await open();
  const details = document.querySelector('.model-offer-details');
  if (!(details instanceof HTMLElement))
    throw new Error('Missing selected model Offer details.');
  const html = within(details).getByRole('button', {
    name: 'Download exact Romanian HTML',
  });
  expect(
    within(details).getByRole('button', { name: 'Download non-official PDF' }),
  ).toBeEnabled();
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Prepare full Offer from approved model',
    }),
  );
  await waitFor(() => expect(html).toBeDisabled());
  const amount = await screen.findByLabelText(
    'Declared tax amount (same currency)',
  );
  fireEvent.change(screen.getByLabelText('Approved estimate version'), {
    target: {
      value: modelOfferFixture().version.priceSource.estimateVersionId,
    },
  });
  for (const [label, value] of [
    ['Declared tax amount (same currency)', '25.00'],
    ['Declared tax label', 'Literal tax'],
    [
      'Internal declaration basis',
      'Uncertain model declaration remains literal',
    ],
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  expect(amount).toHaveValue('25.00');
  fireEvent.click(
    screen.getByLabelText('Select this model version deliberately'),
  );
  fireEvent.click(
    screen.getByLabelText(
      'I confirm the approved amount is the net amount for this Offer version.',
    ),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Create non-official Offer' }),
  );
  await waitFor(() => expect(state.preparations).toHaveLength(1));

  expect(
    within(details).getByRole('button', { name: 'Download non-official PDF' }),
  ).toBeDisabled();
  const fallback = document.querySelector(
    '.commercial-pdf-action[data-kind="offer"][data-placement="fallback"]',
  );
  if (!(fallback instanceof HTMLElement))
    throw new Error('Missing independent PDF fallback.');
  fireEvent.click(
    within(fallback).getByRole('button', { name: 'Download non-official PDF' }),
  );
  await waitFor(() => expect(state.pdf).toHaveLength(1));
  await act(async () =>
    state.preparations[0].resolve(new Response(null, { status: 503 })),
  );
  const retry = await screen.findByRole('button', {
    name: 'Retry identical preparation',
  });
  const saved = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => undefined);
  await act(async () => state.pdf[0].resolve(await pdfReply(target('offer'))));
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  expect(html).toBeDisabled();
  expect(screen.getByLabelText('Internal declaration basis')).toHaveValue(
    'Uncertain model declaration remains literal',
  );
  fireEvent.click(retry);
  await waitFor(() => expect(state.preparations).toHaveLength(2));
  expect(state.preparations[1].body).toBe(state.preparations[0].body);
  expect(state.preparations[1].key).toBe(state.preparations[0].key);
});

it.each([200, 403])(
  'permanently retires a held EXECUTED Contract PDF after consumed Client loss, absent reader, regrant and late %s',
  async (status) => {
    const state = installTransport(),
      gate = deferred();
    state.signed = true;
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    await open();
    fireEvent.click(
      control('contract').getByRole('button', {
        name: 'Download non-official PDF',
      }),
    );
    await waitFor(() => expect(state.pdf).toHaveLength(1));
    state.nextContractRead = gate.promise;
    const granted = state.actor;
    await revalidate(state, {
      ...granted,
      workspacePermissions: granted.workspacePermissions.filter(
        (p) => p !== 'client.manage',
      ),
      activeCompany: { ...companyOf(granted), clientPermissions: [] },
    });
    await waitFor(() => expect(state.pdf[0].signal?.aborted).toBe(true));
    expect(
      document.querySelector('.commercial-pdf-held[data-kind="contract"]'),
    ).toBeNull();
    await act(async () => gate.resolve(new Response(null, { status: 403 })));
    // An independent Offer Version read uses the owning shell's real Access revalidation.
    state.actor = granted;
    state.denyNextOfferVersion = true;
    const before = state.actorReads;
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open version 2' }),
    );
    await waitFor(() => expect(state.actorReads).toBeGreaterThan(before));
    await waitFor(() =>
      expect(
        control('contract').getByRole('button', {
          name: 'Download non-official PDF',
        }),
      ).toBeEnabled(),
    );
    const revalidated = state.actorReads;
    await act(async () =>
      state.pdf[0].resolve(
        status === 200
          ? await pdfReply(target('contract'))
          : new Response(null, { status: 403 }),
      ),
    );
    expect(click).not.toHaveBeenCalled();
    expect(state.actorReads).toBe(revalidated);
    expect(state.pdf[0].signal?.aborted).toBe(true);
  },
);
it.each(['offer', 'contract'] satisfies ('offer' | 'contract')[])(
  'keeps the unsigned %s PDF independent from unrelated Client authority loss',
  async (kind) => {
    const state = installTransport(),
      click = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => undefined);
    await open();
    fireEvent.click(
      control(kind).getByRole('button', { name: 'Download non-official PDF' }),
    );
    await waitFor(() => expect(state.pdf).toHaveLength(1));
    await revalidate(state, {
      ...state.actor,
      workspacePermissions: state.actor.workspacePermissions.filter(
        (p) => p !== 'client.manage',
      ),
      activeCompany: { ...companyOf(state.actor), clientPermissions: [] },
    });
    expect(state.pdf[0].signal?.aborted).toBe(false);
    await act(async () => state.pdf[0].resolve(await pdfReply(target(kind))));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
  },
);
it.each(['read', 'manage'])(
  'keeps an EXECUTED Contract PDF while Client %s remains independently sufficient',
  async (remaining) => {
    const state = installTransport(),
      click = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => undefined);
    state.signed = true;
    state.actor = {
      ...state.actor,
      workspacePermissions: [
        ...state.actor.workspacePermissions,
        'client.manage',
      ],
    };
    await open();
    fireEvent.click(
      control('contract').getByRole('button', {
        name: 'Download non-official PDF',
      }),
    );
    await waitFor(() => expect(state.pdf).toHaveLength(1));
    await revalidate(state, {
      ...state.actor,
      workspacePermissions:
        remaining === 'read'
          ? state.actor.workspacePermissions.filter(
              (p) => p !== 'client.manage',
            )
          : state.actor.workspacePermissions,
      activeCompany: {
        ...companyOf(state.actor),
        clientPermissions: remaining === 'manage' ? [] : ['client.read'],
      },
    });
    expect(state.pdf[0].signal?.aborted).toBe(false);
    await act(async () =>
      state.pdf[0].resolve(await pdfReply(target('contract'))),
    );
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
  },
);
it('keeps a generated EXECUTED Contract PDF independent of optional signing-Document access', async () => {
  const state = installTransport(),
    click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
  state.signed = true;
  state.actor = {
    ...state.actor,
    activeCompany: {
      ...companyOf(state.actor),
      documentPermissions: [
        'document.read',
        'document.content.read',
        'document.received_contract.access',
      ],
    },
  };
  await open();
  fireEvent.click(
    control('contract').getByRole('button', {
      name: 'Download non-official PDF',
    }),
  );
  await waitFor(() => expect(state.pdf).toHaveLength(1));
  state.documentDenied = true;
  await revalidate(state, {
    ...state.actor,
    activeCompany: { ...companyOf(state.actor), documentPermissions: [] },
  });
  expect(state.pdf[0].signal?.aborted).toBe(false);
  await act(async () =>
    state.pdf[0].resolve(await pdfReply(target('contract'))),
  );
  await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
});
it('does not offer a malformed coherent PDF reply from the actual App command', async () => {
  const state = installTransport(),
    click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
  await open();
  fireEvent.click(
    control('offer').getByRole('button', { name: 'Download non-official PDF' }),
  );
  await waitFor(() => expect(state.pdf).toHaveLength(1));
  await act(async () =>
    state.pdf[0].resolve(await pdfReply(target('offer'), malformedPdfBytes())),
  );
  await waitFor(() =>
    expect(
      control('offer').getByRole('button', { name: 'Retry non-official PDF' }),
    ).toBeEnabled(),
  );
  expect(click).not.toHaveBeenCalled();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it('clears an EXECUTED Contract failed exact retry after consumed Client loss while its reader disappears', async () => {
  const state = installTransport(),
    gate = deferred();
  state.signed = true;
  await open();
  fireEvent.click(
    control('contract').getByRole('button', {
      name: 'Download non-official PDF',
    }),
  );
  await waitFor(() => expect(state.pdf).toHaveLength(1));
  await act(async () =>
    state.pdf[0].resolve(new Response(null, { status: 503 })),
  );
  expect(
    await control('contract').findByRole('button', {
      name: 'Retry non-official PDF',
    }),
  ).toBeEnabled();
  state.nextContractRead = gate.promise;
  await revalidate(state, {
    ...state.actor,
    workspacePermissions: state.actor.workspacePermissions.filter(
      (permission) => permission !== 'client.manage',
    ),
    activeCompany: { ...companyOf(state.actor), clientPermissions: [] },
  });
  await waitFor(() =>
    expect(
      document.querySelector('.commercial-pdf-held[data-kind="contract"]'),
    ).toBeNull(),
  );
  await act(async () => gate.resolve(new Response(null, { status: 403 })));
  expect(state.pdf).toHaveLength(1);
});

it.each([false, true])(
  'refuses a ready EXECUTED selection while the local Actor lacks Client access, preserving held unsigned=%s',
  async (heldUnsigned) => {
    const state = installTransport(),
      actorReply = deferred();
    state.signed = !heldUnsigned;
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    await open();
    if (heldUnsigned) {
      fireEvent.click(
        control('contract').getByRole('button', {
          name: 'Download non-official PDF',
        }),
      );
      await waitFor(() => expect(state.pdf).toHaveLength(1));
    }
    const granted = state.actor;
    const denied: ActorContext = {
      ...granted,
      workspacePermissions: granted.workspacePermissions.filter(
        (permission) => permission !== 'client.manage',
      ),
      activeCompany: { ...companyOf(granted), clientPermissions: [] },
    };
    state.nextActorRead = actorReply.promise;
    await revalidate(state, denied);
    // The Actor response was captured before server-side regrant; the new exact reader
    // legitimately returns ready200 while that older local Actor still lacks Client.
    state.actor = granted;
    state.signed = true;
    state.nextActorRead = null;
    await act(async () => actorReply.resolve(Response.json(denied)));
    await waitFor(() =>
      expect(document.querySelector('.model-contract-panel')).not.toBeNull(),
    );
    expect(
      document.querySelector('.commercial-pdf-action[data-kind="contract"]'),
    ).toBeNull();
    if (heldUnsigned) {
      const held = document.querySelector(
        '.commercial-pdf-held[data-kind="contract"]',
      );
      if (!(held instanceof HTMLElement))
        throw new Error('Missing independent held unsigned PDF.');
      expect(within(held).getByRole('status')).toHaveTextContent(/Preparing/);
      expect(state.pdf[0].signal?.aborted).toBe(false);
      await act(async () =>
        state.pdf[0].resolve(await pdfReply(target('contract'))),
      );
      await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    } else {
      expect(state.pdf).toHaveLength(0);
      await revalidate(state, granted);
      await waitFor(() =>
        expect(
          control('contract').getByRole('button', {
            name: 'Download non-official PDF',
          }),
        ).toBeEnabled(),
      );
    }
  },
);
