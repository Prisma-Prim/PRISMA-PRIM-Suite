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
  useInterfaceLocale,
  InterfaceLocaleProvider,
} from '../localization/interface-locale';
import {
  modelContractActor,
  modelContractFixture,
} from './model-contract.fixture';
import { contractLocaleRecord } from '../test/contract-localization-fixture';
import { ContractDecisionQueue } from './ContractDecisionQueue';

const company = modelContractActor.activeCompany;
if (!company) throw new Error('Missing synthetic Company');
const actor: ActorContext = {
  ...modelContractActor,
  workspacePermissions: [],
  activeCompany: {
    ...company,
    clientPermissions: [],
    contractPermissionAssignmentId: undefined,
    contractPermissionSetVersion: undefined,
    contractApproverAssignmentId: 'contract-approver-915',
    contractApproverPermissionSetVersion: 'v2',
    contractPermissions: [
      'commercial.contract.read',
      'commercial.contract.approve',
      'commercial.contract.model_based.approve',
    ],
    offerPermissionAssignmentId: 'source-offer-reader-915',
    offerPermissionSetVersion: 'v1',
    offerApproverAssignmentId: undefined,
    offerApproverPermissionSetVersion: undefined,
    offerPermissions: ['commercial.offer.read'],
    commercialIntakePermissionAssignmentId: 'intake-915',
    commercialIntakePermissionSetVersion: 'v4',
    commercialIntakePermissions: [
      'commercial.request.read',
      'commercial.opportunity.read',
    ],
  },
};
const contract = modelContractFixture();
const item = {
  workspaceId: actor.workspaceId,
  companyId: company.id,
  contractId: contract.id,
  versionId: contract.version.id,
  opportunityId: contract.opportunityId,
  clientRequestId: contract.clientRequestId,
  opportunityTitle: 'Exact pending Contract DEMO',
  illustrativeReference: 1,
  versionNumber: 1,
  kind: 'CONTRACT',
  provenance: 'COMPANY_MODEL_OFFER',
  createdAt: '2026-10-24T09:00:00.000000Z',
};
const identity = deterministicBrowserIdentity();
function tree(current = actor) {
  return (
    <InterfaceLocaleProvider>
      <Locales />
      <ContractDecisionQueue
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

it('opens the exact selected model Contract in its native checks owner without Client or source configuration reads', async () => {
  window.localStorage.setItem('prisma-prim.interface-locale', 'en');
  const exact = `/api/contracts/opportunities/${item.opportunityId}/versions/${item.versionId}`;
  const fetch = vi.fn(async (path: string) => {
    if (path === '/api/contract-decision-queue')
      return Response.json({ items: [item] });
    if (path === exact) return Response.json({ contract });
    throw new Error('Unexpected queue continuation GET: ' + path);
  });
  vi.stubGlobal('fetch', fetch);
  render(tree());
  await screen.findByText(item.opportunityTitle);
  fireEvent.click(
    screen.getByRole('button', { name: 'Review Contract 1, version 1' }),
  );
  await screen.findByRole('button', {
    name: 'Run Contract Quality Checks',
  });
  await screen.findByText('Literal case requisites ☀️');
  await waitFor(() =>
    expect(fetch.mock.calls.map(([path]) => path)).toEqual([
      '/api/contract-decision-queue',
      exact,
    ]),
  );
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
      contractId: `80000000-0000-4000-8000-${suffix}`,
      opportunityId: `70000000-0000-4000-8000-${suffix}`,
      opportunityTitle: `Contract DEMO ${n + 1}`,
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
  await screen.findByText('Contract DEMO 25');
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
  await screen.findByText('Contract DEMO 25');
  expect(fetch.mock.calls[2]?.[0]).not.toContain('?cursor=');
  expect(
    screen.getByRole('heading', {
      name: 'Contracts awaiting an internal decision',
    }),
  ).toHaveFocus();
});

it.each([
  { items: [{ ...item, companyId: 'foreign' }] },
  { items: [{ ...item, workspaceId: 'foreign' }] },
  { items: [item, item] },
  { items: [{ ...item, provenance: 'APPROVED_ESTIMATE_INTERNAL_DRAFT' }] },
  { items: [{ ...item, provenance: 'FUTURE' }] },
  { items: [{ ...item, kind: 'FUTURE' }] },
  { items: [{ ...item, kind: 'PRECONTRACT' }] },
  { items: [{ ...item, createdAt: '0000-10-24T09:00:00.000000Z' }] },
  { items: [{ ...item, versionNumber: 0 }] },
  { items: [{ ...item, createdAt: '2026-02-30T09:00:00.000000Z' }] },
  { items: [{ ...item, contractId: '' }] },
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
      await screen.findByText('The pending agreements could not be loaded.'),
    ).toBeVisible();
    expect(screen.queryByText(item.opportunityTitle)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Review Contract/ }),
    ).not.toBeInTheDocument();
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
        <ContractDecisionQueue
          actor={actor}
          identity={identity}
          onCompanyContextRejected={rejected}
        />
      </InterfaceLocaleProvider>,
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    rendered.rerender(
      <InterfaceLocaleProvider>
        <ContractDecisionQueue
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
    await screen.findByText('No agreement versions awaiting your decision.');
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
  await screen.findByText('Contract DEMO 25');
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  await screen.findByText('The pending agreements could not be loaded.');
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
      contractApproverPermissionSetVersion: 'v1',
      contractPermissions: [
        'commercial.contract.read',
        'commercial.contract.approve',
      ],
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
    'contractApproverPermissionSetVersion',
    'future',
  );
  rendered.rerender(tree(unknown));
  expect(screen.queryByText(item.opportunityTitle)).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it.each(['id', 'opportunityId', 'companyId', 'version'])(
  'refuses an exact native model Contract with mismatched %s and never falls back to the head',
  async (field) => {
    window.localStorage.setItem('prisma-prim.interface-locale', 'en');
    const foreign = '50000000-0000-4000-8000-000000000915';
    const wrong = {
      ...contract,
      ...(field === 'version'
        ? { version: { ...contract.version, id: foreign } }
        : { [field]: foreign }),
    };
    const fetch = vi.fn(async (path: string) =>
      Response.json(
        path === '/api/contract-decision-queue'
          ? { items: [item] }
          : { contract: wrong },
      ),
    );
    vi.stubGlobal('fetch', fetch);
    render(tree());
    await screen.findByText(item.opportunityTitle);
    fireEvent.click(
      screen.getByRole('button', { name: 'Review Contract 1, version 1' }),
    );
    await waitFor(() => expect(screen.getByRole('alert')).toBeVisible());
    expect(
      screen.queryByText('Literal case requisites ☀️'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Run Contract Quality Checks' }),
    ).not.toBeInTheDocument();
    expect(fetch.mock.calls.map(([path]) => path)).toEqual([
      '/api/contract-decision-queue',
      `/api/contracts/opportunities/${item.opportunityId}/versions/${item.versionId}`,
    ]);
  },
);

it.each(['PRECONTRACT', 'ADDENDUM'] as const)(
  'labels %s distinctly and opens its exact native agreement path',
  async (kind) => {
    window.localStorage.setItem('prisma-prim.interface-locale', 'en');
    const base = contractLocaleRecord();
    const row = { ...item, kind, provenance: 'ILLUSTRATIVE' };
    const frozen = {
      ...base,
      id: item.contractId,
      companyId: item.companyId,
      opportunityId: item.opportunityId,
      kind,
      ...(kind === 'ADDENDUM'
        ? {
            origin: null,
            sourceOfferId: null,
            sourceOfferVersionId: null,
            sourceOffer: null,
            parentContractId: 'parent-915',
            addendumOrdinal: 3,
            parent: {
              id: 'parent-915',
              kind: 'CONTRACT',
              illustrativeReference: 9,
              versionNumber: 1,
              revision: 3,
            },
          }
        : {}),
      version: {
        ...base.version,
        id: item.versionId,
        changeSummary: kind === 'ADDENDUM' ? 'Synthetic exact amendment' : null,
        preliminaryWork:
          kind === 'PRECONTRACT'
            ? {
                scope: 'Synthetic initial scope',
                financialConditions: 'Synthetic bounded cost',
                limits: 'Synthetic temporary limit',
              }
            : null,
      },
    };
    const exact = `/api/contracts/opportunities/${item.opportunityId}/agreements/${item.contractId}/versions/${item.versionId}`;
    const fetch = vi.fn(async (path: string) => {
      if (path === '/api/contract-decision-queue')
        return Response.json({ items: [row] });
      if (path === exact) return Response.json({ contract: frozen });
      if (path === exact.slice(0, exact.lastIndexOf('/')))
        return Response.json({ items: [frozen.version], nextCursor: null });
      throw new Error('Unexpected native agreement GET ' + path);
    });
    vi.stubGlobal('fetch', fetch);
    render(tree());
    await screen.findByText(item.opportunityTitle);
    fireEvent.click(
      screen.getByRole('button', {
        name: `Review ${kind === 'PRECONTRACT' ? 'Precontract' : 'Addendum'} 1, version 1`,
      }),
    );
    await screen.findByText(
      kind === 'PRECONTRACT'
        ? 'Synthetic initial scope'
        : 'Synthetic exact amendment',
    );
    expect(fetch.mock.calls.map(([path]) => path)).toEqual([
      '/api/contract-decision-queue',
      exact,
      exact.slice(0, exact.lastIndexOf('/')),
    ]);
  },
);

it.each([200, 403])(
  'retires consumed capture and session requests before a late %s can act',
  async (status) => {
    window.localStorage.setItem('prisma-prim.interface-locale', 'en');
    let release: (response: Response) => void = () => {
      throw new Error('No pending request');
    };
    const held = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const fetch = vi
      .fn()
      .mockImplementationOnce(() => held)
      .mockImplementation(async () => Response.json({ items: [] }));
    vi.stubGlobal('fetch', fetch);
    const rejected = vi.fn(),
      revalidated = vi.fn();
    const c = actor.activeCompany;
    if (!c) throw new Error('Missing Company');
    const draw = (current: ActorContext, session = identity) => (
      <InterfaceLocaleProvider>
        <ContractDecisionQueue
          actor={current}
          identity={session}
          onCompanyContextRejected={rejected}
          onActorRevalidated={revalidated}
        />
      </InterfaceLocaleProvider>
    );
    const rendered = render(draw(actor));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    rendered.rerender(
      draw({
        ...actor,
        activeCompany: {
          ...c,
          contractApproverAssignmentId: 'replacement-915',
        },
      }),
    );
    await screen.findByText('No agreement versions awaiting your decision.');
    rendered.rerender(draw(actor, deterministicBrowserIdentity()));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    await act(async () =>
      release(
        status === 403
          ? Response.json({ code: 'COMPANY_CONTEXT_REJECTED' }, { status: 403 })
          : Response.json({ items: [item] }),
      ),
    );
    expect(rejected).not.toHaveBeenCalled();
    expect(revalidated).not.toHaveBeenCalled();
    expect(screen.queryByText(item.opportunityTitle)).not.toBeInTheDocument();
  },
);
