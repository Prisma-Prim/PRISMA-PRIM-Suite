import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ActorContext } from '../access-types';
import { deterministicBrowserIdentity } from '../access-composition';
import {
  InterfaceLocaleProvider,
  useInterfaceLocale,
} from '../localization/interface-locale';
import { modelOfferActor, modelOfferFixture } from './model-offer.fixture';
import { OfferDecisionQueue } from './OfferDecisionQueue';
import { pendingOffer } from '../test/offer-quality-decision-fixture';

const company = modelOfferActor.activeCompany;
if (!company) throw new Error('Missing synthetic Company');
const actor: ActorContext = {
  ...modelOfferActor,
  activeCompany: {
    ...company,
    clientPermissions: [],
    commercialIntakePermissionAssignmentId: 'intake-911',
    commercialIntakePermissionSetVersion: 'v4',
    commercialIntakePermissions: [
      'commercial.request.read',
      'commercial.opportunity.read',
    ],
    offerApproverAssignmentId: 'approver-911',
    offerApproverPermissionSetVersion: 'v2',
    offerPermissions: [
      'commercial.offer.read',
      'commercial.offer.approve',
      'commercial.offer.model_based.approve',
    ],
  },
};
const offer = modelOfferFixture();
const item = {
  workspaceId: actor.workspaceId,
  companyId: company.id,
  offerId: offer.id,
  versionId: offer.version.id,
  opportunityId: offer.opportunityId,
  clientRequestId: '40000000-0000-4000-8000-000000000911',
  opportunityTitle: 'Exact pending Offer DEMO',
  illustrativeReference: 1,
  versionNumber: 1,
  provenance: 'COMPANY_MODEL_ESTIMATE',
  createdAt: '2026-10-24T09:00:00.000000Z',
};
const identity = deterministicBrowserIdentity();
function tree(current = actor) {
  return (
    <InterfaceLocaleProvider>
      <Locales />
      <OfferDecisionQueue
        actor={current}
        identity={identity}
        onCompanyContextRejected={() => undefined}
      />
    </InterfaceLocaleProvider>
  );
}
afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

function Locales() {
  const { changeLocale } = useInterfaceLocale();
  return (
    <>
      {(['ro', 'ru', 'fr', 'en'] as const).map((locale) => (
        <button key={locale} onClick={() => changeLocale(locale)}>
          {locale}
        </button>
      ))}
    </>
  );
}
function cohort() {
  return Array.from({ length: 25 }, (_, n) => {
    const suffix = (n + 1).toString(16).padStart(12, '0');
    return {
      ...item,
      versionId: `90000000-0000-4000-8000-${suffix}`,
      offerId: `80000000-0000-4000-8000-${suffix}`,
      opportunityId: `70000000-0000-4000-8000-${suffix}`,
      opportunityTitle: `Offer DEMO ${n + 1}`,
      illustrativeReference: n + 1,
    };
  });
}

it('reaches the next page, recovers an empty later page and preserves all locales without reads', async () => {
  window.localStorage.setItem('prisma-prim.interface-locale', 'en');
  const fetch = vi.fn(async (path: string) =>
    Response.json(
      path.includes('cursor=')
        ? { items: [] }
        : { items: cohort(), nextCursor: 'cGFnZTI' },
    ),
  );
  vi.stubGlobal('fetch', fetch);
  render(tree());
  await screen.findByText('Offer DEMO 25');
  for (const locale of ['ro', 'ru', 'fr', 'en'])
    fireEvent.click(screen.getByRole('button', { name: locale }));
  expect(fetch).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  await screen.findByText(
    'This page is now empty. Go back or refresh from the beginning.',
  );
  expect(fetch.mock.calls[1]?.[0]).toContain('?cursor=cGFnZTI');
  expect(screen.getByRole('button', { name: 'Previous page' })).toBeEnabled();
  fireEvent.click(
    screen.getByRole('button', { name: 'Refresh from beginning' }),
  );
  await screen.findByText('Offer DEMO 25');
  expect(fetch.mock.calls[2]?.[0]).not.toContain('?cursor=');
  expect(
    screen.getByRole('heading', {
      name: 'Offers awaiting an internal decision',
    }),
  ).toHaveFocus();
});

it.each([
  { items: [{ ...item, companyId: 'foreign' }] },
  { items: [{ ...item, workspaceId: 'foreign' }] },
  { items: [item, item] },
  { items: [{ ...item, provenance: 'APPROVED_ESTIMATE_INTERNAL_DRAFT' }] },
  { items: [{ ...item, provenance: 'FUTURE' }] },
  { items: [{ ...item, versionNumber: 0 }] },
  { items: [{ ...item, createdAt: '2026-02-30T09:00:00.000000Z' }] },
  { items: [{ ...item, offerId: '' }] },
  { items: [item], nextCursor: 'illegal continuation' },
  { items: Array.from({ length: 26 }, () => item) },
  { items: null },
])(
  'displays no partial data or navigation for malformed/foreign response %#',
  async (body) => {
    window.localStorage.setItem('prisma-prim.interface-locale', 'en');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(body)),
    );
    render(tree());
    expect(
      await screen.findByText('The pending Offers could not be loaded.'),
    ).toBeVisible();
    expect(screen.queryByText(item.opportunityTitle)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Review Offer/ }),
    ).not.toBeInTheDocument();
  },
);

it('preserves PostgreSQL microsecond ordering instead of inventing a millisecond UUID tie', async () => {
  window.localStorage.setItem('prisma-prim.interface-locale', 'en');
  const [a, b] = cohort();
  if (!a || !b) throw new Error('Missing cohort');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        items: [
          { ...b, createdAt: '2026-10-24T09:00:00.000001Z' },
          { ...a, createdAt: '2026-10-24T09:00:00.000002Z' },
        ],
      }),
    ),
  );
  render(tree());
  expect(await screen.findByText(a.opportunityTitle)).toBeVisible();
  expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
    expect.stringContaining(b.opportunityTitle),
    expect.stringContaining(a.opportunityTitle),
  ]);
});

it.each(['offer', 'opportunity', 'Company', 'version'])(
  'refuses a mismatched exact %s response without falling back to a head',
  async (kind) => {
    window.localStorage.setItem('prisma-prim.interface-locale', 'en');
    const wrong = {
      ...offer,
      ...(kind === 'offer'
        ? { id: '50000000-0000-4000-8000-000000000911' }
        : {}),
      ...(kind === 'opportunity'
        ? { opportunityId: '50000000-0000-4000-8000-000000000911' }
        : {}),
      ...(kind === 'Company'
        ? { companyId: '50000000-0000-4000-8000-000000000911' }
        : {}),
      version: {
        ...offer.version,
        ...(kind === 'version'
          ? { id: '50000000-0000-4000-8000-000000000911' }
          : {}),
      },
    };
    const fetch = vi.fn(async (path: string) =>
      Response.json(
        path.includes('/offer-decision-queue')
          ? { items: [item] }
          : { offer: wrong },
      ),
    );
    vi.stubGlobal('fetch', fetch);
    render(tree());
    await screen.findByText(item.opportunityTitle);
    fireEvent.click(
      screen.getByRole('button', { name: 'Review Offer 1, version 1' }),
    );
    expect(
      await screen.findByText('The Offer could not be loaded. Try again.'),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Approve this version' }),
    ).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  },
);

it.each([200, 403])(
  'retires an old Company read and ignores a late %s response before access callbacks',
  async (status) => {
    window.localStorage.setItem('prisma-prim.interface-locale', 'en');
    let release: (response: Response) => void = () => {
      throw new Error('No old request');
    };
    const held = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const fetch = vi
      .fn()
      .mockImplementationOnce(() => held)
      .mockImplementation(async () => Response.json({ items: [] }));
    const rejected = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const rendered = render(
      <InterfaceLocaleProvider>
        <OfferDecisionQueue
          actor={actor}
          identity={identity}
          onCompanyContextRejected={rejected}
        />
      </InterfaceLocaleProvider>,
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    rendered.rerender(
      <InterfaceLocaleProvider>
        <OfferDecisionQueue
          actor={{
            ...actor,
            activeCompany: {
              ...company,
              ...actor.activeCompany,
              id: '50000000-0000-4000-8000-000000000911',
            },
          }}
          identity={identity}
          onCompanyContextRejected={rejected}
        />
      </InterfaceLocaleProvider>,
    );
    await screen.findByText('No Offer versions awaiting your decision.');
    await act(async () =>
      release(
        status === 403
          ? Response.json({ code: 'COMPANY_CONTEXT_REJECTED' }, { status: 403 })
          : Response.json({ items: [item] }),
      ),
    );
    expect(rejected).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(2);
  },
);

it('protects pending/uncertain exact decisions across locale changes and refreshes only after identical retry', async () => {
  window.localStorage.setItem('prisma-prim.interface-locale', 'en');
  let fail: (error: Error) => void = () => {
    throw new Error('No pending decision');
  };
  const held = new Promise<Response>((_resolve, reject) => {
    fail = reject;
  });
  const attempts: { body: unknown; key: string | null }[] = [];
  let decided = false;
  const fetch = vi.fn(async (path: string, init?: RequestInit) => {
    if (path.includes('/offer-decision-queue'))
      return Response.json({ items: decided ? [] : [item] });
    if (path.endsWith('/versions'))
      return Response.json({ versions: [offer.version], nextCursor: null });
    if (init?.method === 'POST') {
      attempts.push({
        body: init.body,
        key: new Headers(init.headers).get('idempotency-key'),
      });
      if (attempts.length === 1) return held;
      decided = true;
      return Response.json(
        {
          id: '60000000-0000-4000-8000-000000000911',
          offerVersionId: item.versionId,
          offerRevision: 2,
          actorWorkspaceMembershipId: actor.workspaceMembershipId,
          decidedAt: '2026-10-24T10:00:00.000Z',
          state: 'REJECTED',
          reason: ' Literal rejection\n🌍 ',
        },
        { status: 201 },
      );
    }
    return Response.json({ offer });
  });
  vi.stubGlobal('fetch', fetch);
  render(tree());
  await screen.findByText(item.opportunityTitle);
  fireEvent.click(
    screen.getByRole('button', { name: 'Review Offer 1, version 1' }),
  );
  fireEvent.change(await screen.findByLabelText('Rejection reason'), {
    target: { value: ' Literal rejection\n🌍 ' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Reject this version' }));
  await waitFor(() => expect(attempts).toHaveLength(1));
  expect(
    screen.getByRole('button', { name: 'Back to pending Offers' }),
  ).toBeDisabled();
  fireEvent.click(
    screen.getByRole('button', { name: 'Back to pending Offers' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'fr' }));
  expect(
    screen.getByRole('button', { name: 'Retour aux offres en attente' }),
  ).toBeDisabled();
  await act(async () => fail(new Error('Synthetic lost confirmation')));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Réessayer la même décision' }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Retour aux offres en attente' }),
    ).toBeEnabled(),
  );
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);
  expect(fetch).toHaveBeenCalledTimes(5);
  fireEvent.click(
    screen.getByRole('button', { name: 'Retour aux offres en attente' }),
  );
  await screen.findByText(
    'Aucune version d’offre en attente de votre décision.',
  );
  expect(fetch).toHaveBeenCalledTimes(6);
});
it('discovers the pending Offer and opens its exact existing decision owner', async () => {
  window.localStorage.setItem('prisma-prim.interface-locale', 'en');
  const fetch = vi.fn(async (path: string) => {
    if (path.includes('/offer-decision-queue'))
      return Response.json({ items: [item] });
    if (path.endsWith('/versions'))
      return Response.json({ versions: [offer.version], nextCursor: null });
    if (path.endsWith(`/versions/${item.versionId}`))
      return Response.json({ offer });
    throw new Error('Unexpected request ' + path);
  });
  vi.stubGlobal('fetch', fetch);
  render(tree());
  expect(await screen.findByText(item.opportunityTitle)).toBeVisible();
  fireEvent.click(
    screen.getByRole('button', { name: 'Review Offer 1, version 1' }),
  );
  expect(
    await screen.findByText(offer.version.modelSource.content.serviceTitle),
  ).toBeVisible();
  await screen.findByRole('button', { name: 'Open version 1' });
  expect(fetch.mock.calls.map(([path]) => path)).toHaveLength(3);
  expect(fetch.mock.calls[1]?.[0]).toContain(
    `/offers/opportunities/${item.opportunityId}/versions/${item.versionId}`,
  );
});

it('retries the failed current page rather than silently restarting pagination', async () => {
  window.localStorage.setItem('prisma-prim.interface-locale', 'en');
  let laterCalls = 0;
  const fetch = vi.fn(async (path: string) => {
    if (!path.includes('cursor='))
      return Response.json({ items: cohort(), nextCursor: 'cGFnZTI' });
    laterCalls++;
    return laterCalls === 1
      ? Response.json({ message: 'Synthetic unavailable' }, { status: 503 })
      : Response.json({ items: [item] });
  });
  vi.stubGlobal('fetch', fetch);
  render(tree());
  await screen.findByText('Offer DEMO 25');
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  await screen.findByText('The pending Offers could not be loaded.');
  fireEvent.click(screen.getByRole('button', { name: 'Retry this page' }));
  expect(await screen.findByText(item.opportunityTitle)).toBeVisible();
  expect(fetch.mock.calls[2]?.[0]).toContain('cursor=cGFnZTI');
  expect(screen.getByText('Page 2')).toBeVisible();
});

it('keeps old captured approvers useful and fails closed on unknown captures without I/O', async () => {
  window.localStorage.setItem('prisma-prim.interface-locale', 'en');
  const base = actor.activeCompany;
  if (!base) throw new Error('Missing Company');
  const legacy: ActorContext = {
    ...actor,
    activeCompany: {
      ...base,
      offerApproverPermissionSetVersion: 'v1',
      offerPermissions: ['commercial.offer.read', 'commercial.offer.approve'],
    },
  };
  const fetch = vi.fn(async () =>
    Response.json({ items: [{ ...item, provenance: 'ILLUSTRATIVE' }] }),
  );
  vi.stubGlobal('fetch', fetch);
  const rendered = render(tree(legacy));
  await screen.findByText(item.opportunityTitle);
  const unknown = {
    ...legacy,
    activeCompany: {
      ...legacy.activeCompany,
      id: company.id,
      displayName: company.displayName,
    },
  };
  Reflect.set(
    unknown.activeCompany,
    'offerApproverPermissionSetVersion',
    'future',
  );
  rendered.rerender(tree(unknown));
  expect(screen.queryByText(item.opportunityTitle)).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it.each(['companyId', 'id'])(
  'also checks exact illustrative %s identity before exposing frozen content',
  async (field) => {
    window.localStorage.setItem('prisma-prim.interface-locale', 'en');
    const frozen = {
      ...pendingOffer({
        offerId: item.offerId,
        versionId: item.versionId,
        latestRun: false,
      }),
      companyId: item.companyId,
      opportunityId: item.opportunityId,
      [field]: '50000000-0000-4000-8000-000000000911',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string) =>
        Response.json(
          path.includes('/offer-decision-queue')
            ? { items: [{ ...item, provenance: 'ILLUSTRATIVE' }] }
            : { offer: frozen },
        ),
      ),
    );
    render(tree());
    await screen.findByText(item.opportunityTitle);
    fireEvent.click(
      screen.getByRole('button', { name: 'Review Offer 1, version 1' }),
    );
    expect(
      await screen.findByText('The Offer could not be loaded. Try again.'),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Approve this version' }),
    ).not.toBeInTheDocument();
  },
);

it('rejects year zero in untrusted pending metadata without displaying any row', async () => {
  window.localStorage.setItem('prisma-prim.interface-locale', 'en');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        items: [{ ...item, createdAt: '0000-10-24T09:00:00.000000Z' }],
      }),
    ),
  );
  render(tree());
  expect(
    await screen.findByText('The pending Offers could not be loaded.'),
  ).toBeVisible();
  expect(screen.queryByText(item.opportunityTitle)).not.toBeInTheDocument();
});
