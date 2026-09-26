import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { PricingSnapshotPanel } from './PricingSnapshotPanel';

// All amounts and labels are synthetic and illustrative.
const OPPORTUNITY_A = '10000000-0000-4000-8000-000000000001';
const OPPORTUNITY_B = '10000000-0000-4000-8000-000000000002';
const OFFERING_A = '20000000-0000-4000-8000-000000000001';
const OFFERING_B = '20000000-0000-4000-8000-000000000002';

const actor: ActorContext = {
  internalUserId: 'user-1',
  workspaceMembershipId: 'membership-1',
  workspaceId: 'workspace-1',
  workspaceName: 'Workspace',
  displayName: 'Pricing user',
  email: 'pricing@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: 'company-1',
    displayName: 'PRISMA-PRIM',
    pricingUserPermissions: [
      'commercial.offering.read',
      'commercial.pricing.configuration.read',
      'commercial.pricing.calculate',
      'commercial.pricing.snapshot.read',
    ],
  },
};

const offerings = [
  {
    id: OFFERING_A,
    serviceDefinition: { code: 'SERVICE-A', name: 'Illustrative service A' },
    commercialLabel: null,
  },
  {
    id: OFFERING_B,
    serviceDefinition: { code: 'SERVICE-B', name: 'Illustrative service B' },
    commercialLabel: 'Illustrative label B',
  },
];

function tariff(offeringId: string, versionNumber: number, currency = 'EUR') {
  return {
    id: `${offeringId.slice(0, -1)}${versionNumber}`,
    offeringId,
    versionNumber,
    unit: 'illustrative-unit',
    unitAmount: offeringId === OFFERING_A ? '123.4500' : '0.0050',
    currency,
    taxRatePercent: offeringId === OFFERING_A ? '12.34' : '0.00',
    taxLabel: 'Illustrative tax',
  };
}

function snapshot(
  opportunityId = OPPORTUNITY_A,
  id = '30000000-0000-4000-8000-000000000001',
  total = '346.72',
) {
  return {
    id,
    opportunityId,
    clientRequestId: '40000000-0000-4000-8000-000000000001',
    clientReference: { displayName: 'Illustrative Client' },
    pricingRuleVersion: { id: 'rule-1', versionNumber: 3 },
    currency: 'EUR',
    lines: [
      {
        position: 1,
        serviceCode: 'SERVICE-A',
        serviceName: 'Illustrative service A',
        offeringId: OFFERING_A,
        commercialLabel: null,
        tariffVersionNumber: 4,
        unit: 'illustrative-unit',
        unitAmount: '123.4500',
        currency: 'EUR',
        taxRatePercent: '12.34',
        taxLabel: 'Illustrative tax',
        quantity: '2.5',
        rawLineAmount: '308.6250000',
        lineNet: '308.63',
        rawLineTax: '38.0849420',
        lineTax: '38.08',
      },
      {
        position: 2,
        serviceCode: 'SERVICE-B',
        serviceName: 'Illustrative service B',
        offeringId: OFFERING_B,
        commercialLabel: 'Illustrative label B',
        tariffVersionNumber: 2,
        unit: 'illustrative-unit',
        unitAmount: '0.0050',
        currency: 'EUR',
        taxRatePercent: '0.00',
        taxLabel: 'Illustrative tax',
        quantity: '1',
        rawLineAmount: '0.0050000',
        lineNet: '0.01',
        rawLineTax: '0.0000000',
        lineTax: '0.00',
      },
    ],
    subtotal: '308.64',
    taxTotal: '38.08',
    total,
    calculatedAt: '2026-09-26T10:00:00.000Z',
    committedAt: '2026-09-26T10:00:01.000Z',
    provenance: 'ILLUSTRATIVE',
    provisional: true,
  };
}

type Responder = (
  call: number,
  init: RequestInit | undefined,
  url: URL,
) => Response | Promise<Response>;

function key(input: RequestInfo | URL, init?: RequestInit): string {
  const value = typeof input === 'string' ? input : input.toString();
  return `${init?.method ?? 'GET'} ${value.replace(/\?.*$/u, '')}`;
}

function stubApi(routes: Record<string, Responder>) {
  const counts = new Map<string, number>();
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const requestKey = key(input, init);
      const responder = routes[requestKey];
      if (!responder) throw new Error(`Unexpected request ${requestKey}`);
      const count = (counts.get(requestKey) ?? 0) + 1;
      counts.set(requestKey, count);
      return responder(
        count,
        init,
        new URL(
          typeof input === 'string' ? input : input.toString(),
          'http://localhost',
        ),
      );
    },
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function baseRoutes(opportunityId = OPPORTUNITY_A): Record<string, Responder> {
  return {
    'GET /api/pricing-configuration/rule-scope': () =>
      Response.json({ current: { id: 'rule-1', versionNumber: 3 } }),
    'GET /api/commercial-catalogue/offerings': () =>
      Response.json({ items: offerings }),
    [`GET /api/pricing-configuration/offerings/${OFFERING_A}/tariff-scope`]:
      () =>
        Response.json({
          offeringId: OFFERING_A,
          current: tariff(OFFERING_A, 4),
        }),
    [`GET /api/pricing-configuration/offerings/${OFFERING_B}/tariff-scope`]:
      () =>
        Response.json({
          offeringId: OFFERING_B,
          current: tariff(OFFERING_B, 2),
        }),
    [`GET ${snapshotPath(opportunityId)}`]: () => Response.json({ items: [] }),
  };
}

function snapshotPath(opportunityId: string): string {
  return `/api/pricing/opportunities/${opportunityId}/snapshots`;
}

function renderPanel(opportunityId = OPPORTUNITY_A, value = actor) {
  return render(
    <PricingSnapshotPanel
      actor={value}
      identity={deterministicBrowserIdentity()}
      opportunityId={opportunityId}
      onCompanyContextRejected={vi.fn()}
    />,
  );
}

async function selectWorkedExample(): Promise<void> {
  for (const [label, quantity] of [
    ['Illustrative service A', '2.5'],
    ['Illustrative label B', '1'],
  ] as const) {
    const checkbox = await screen.findByLabelText(label);
    const offering = checkbox.closest('fieldset');
    if (!offering) throw new Error('Expected the offering quantity group.');
    fireEvent.click(checkbox);
    fireEvent.change(within(offering).getByLabelText('Quantity'), {
      target: { value: quantity },
    });
  }
}

function postCalls(
  fetchMock: ReturnType<typeof stubApi>,
  opportunityId = OPPORTUNITY_A,
) {
  return fetchMock.mock.calls
    .filter(
      ([input, init]) =>
        key(input, init) === `POST ${snapshotPath(opportunityId)}`,
    )
    .map(([, init]) => ({
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      idempotencyKey: new Headers(init?.headers).get('idempotency-key'),
    }));
}

describe('PricingSnapshotPanel', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('calculates the worked example, keeps exact strings, and reopens the saved snapshot through the API', async () => {
    const saved = snapshot();
    const fetchMock = stubApi({
      ...baseRoutes(),
      [`POST ${snapshotPath(OPPORTUNITY_A)}`]: () =>
        Response.json(saved, { status: 201 }),
      [`GET ${snapshotPath(OPPORTUNITY_A)}/${saved.id}`]: () =>
        Response.json(saved),
    });
    renderPanel();
    await selectWorkedExample();
    const form = screen
      .getByRole('button', { name: 'Calculate and save' })
      .closest('form');
    if (!form) throw new Error('Expected the calculation form.');
    // Keyboard submission uses the same path as the visible button.
    fireEvent.submit(form);
    expect(await screen.findByText('346.72 EUR')).toBeInTheDocument();
    expect(
      screen.getAllByText('Illustrative and provisional').length,
    ).toBeGreaterThan(1);
    expect(screen.getByText('308.64 EUR')).toBeInTheDocument();
    expect(screen.getByText('38.08 EUR')).toBeInTheDocument();
    expect(postCalls(fetchMock)).toEqual([
      {
        body: {
          pricingRuleVersionNumber: 3,
          lines: [
            { offeringId: OFFERING_A, tariffVersionNumber: 4, quantity: '2.5' },
            { offeringId: OFFERING_B, tariffVersionNumber: 2, quantity: '1' },
          ],
        },
        idempotencyKey: expect.any(String),
      },
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Close snapshot' }));
    fireEvent.click(screen.getByRole('button', { name: /Reopen snapshot/u }));
    expect(
      await screen.findByText(/Client:\s*Illustrative Client/u),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`${snapshotPath(OPPORTUNITY_A)}/${saved.id}`),
      expect.anything(),
    );
  });

  it('keeps quantities attached to their offerings when the catalogue returns newest first', async () => {
    const fetchMock = stubApi({
      ...baseRoutes(),
      'GET /api/commercial-catalogue/offerings': () =>
        Response.json({ items: [...offerings].reverse() }),
      [`POST ${snapshotPath(OPPORTUNITY_A)}`]: () =>
        Response.json(snapshot(), { status: 201 }),
    });
    renderPanel();
    await selectWorkedExample();
    fireEvent.click(screen.getByRole('button', { name: 'Calculate and save' }));
    await screen.findByText('346.72 EUR');
    expect(postCalls(fetchMock)).toEqual([
      {
        body: {
          pricingRuleVersionNumber: 3,
          lines: [
            { offeringId: OFFERING_B, tariffVersionNumber: 2, quantity: '1' },
            { offeringId: OFFERING_A, tariffVersionNumber: 4, quantity: '2.5' },
          ],
        },
        idempotencyKey: expect.any(String),
      },
    ]);
  });

  it('keeps the exact payload and key while an outcome is uncertain and retries only that command', async () => {
    const saved = snapshot();
    const fetchMock = stubApi({
      ...baseRoutes(),
      [`POST ${snapshotPath(OPPORTUNITY_A)}`]: (call) => {
        if (call === 1) throw new TypeError('network interrupted');
        return Response.json(saved, { status: 201 });
      },
    });
    renderPanel();
    await selectWorkedExample();
    fireEvent.click(screen.getByRole('button', { name: 'Calculate and save' }));
    expect(
      await screen.findByText(/outcome is uncertain/u),
    ).toBeInTheDocument();
    expect(screen.getAllByLabelText('Quantity')[0]).toHaveValue('2.5');
    expect(screen.getAllByLabelText('Quantity')[0]).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry the same calculation' }),
    );
    expect(await screen.findByText('346.72 EUR')).toBeInTheDocument();
    const calls = postCalls(fetchMock);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual(calls[0]);
  });

  it('releases an uncertain command after a certain refusal while preserving the draft', async () => {
    const fetchMock = stubApi({
      ...baseRoutes(),
      [`POST ${snapshotPath(OPPORTUNITY_A)}`]: (call) => {
        if (call === 1) throw new TypeError('network interrupted');
        return Response.json({ code: 'STALE_TARIFF_VERSION' }, { status: 409 });
      },
    });
    renderPanel();
    await selectWorkedExample();
    fireEvent.click(screen.getByRole('button', { name: 'Calculate and save' }));
    expect(
      await screen.findByText(/outcome is uncertain/u),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry the same calculation' }),
    );
    expect(
      await screen.findByText(/Configuration changed/u),
    ).toBeInTheDocument();
    expect(screen.getAllByLabelText('Quantity')[0]).toHaveValue('2.5');
    expect(screen.getAllByLabelText('Quantity')[0]).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Calculate and save' }),
    ).toBeEnabled();
    const calls = postCalls(fetchMock);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual(calls[0]);
  });

  it('moves a timed-out command to uncertain immediately, ignores its late response and retries identically', async () => {
    const saved = snapshot();
    let resolveLate: ((response: Response) => void) | undefined;
    const late = new Promise<Response>((resolve) => {
      resolveLate = resolve;
    });
    const fetchMock = stubApi({
      ...baseRoutes(),
      [`POST ${snapshotPath(OPPORTUNITY_A)}`]: (call) =>
        call === 1 ? late : Response.json(saved, { status: 201 }),
    });
    renderPanel();
    await selectWorkedExample();
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Calculate and save' }));
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    vi.useRealTimers();
    expect(
      await screen.findByText(/outcome is uncertain/u),
    ).toBeInTheDocument();
    resolveLate?.(Response.json(snapshot(OPPORTUNITY_A, saved.id, '999.99')));
    await act(async () => Promise.resolve());
    expect(screen.queryByText('999.99 EUR')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry the same calculation' }),
    );
    expect(await screen.findByText('346.72 EUR')).toBeInTheDocument();
    const calls = postCalls(fetchMock);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual(calls[0]);
  });

  it('preserves correctable values and names validation, stale, not-effective, mixed-currency and idempotency conflicts', async () => {
    const responses = [
      Response.json({ message: 'Invalid quantity.' }, { status: 400 }),
      Response.json({ code: 'STALE_TARIFF_VERSION' }, { status: 409 }),
      Response.json({ code: 'TARIFF_NOT_EFFECTIVE' }, { status: 409 }),
      Response.json({ code: 'MIXED_CURRENCY' }, { status: 409 }),
      Response.json({ code: 'IDEMPOTENCY_CONFLICT' }, { status: 409 }),
    ];
    stubApi({
      ...baseRoutes(),
      [`POST ${snapshotPath(OPPORTUNITY_A)}`]: (call) => {
        const response = responses.at(call - 1);
        if (!response) throw new Error('Unexpected calculation request.');
        return response;
      },
    });
    renderPanel();
    await selectWorkedExample();
    const expected = [
      [/Correct the highlighted/u, false],
      [/Configuration changed/u, true],
      [/no longer effective/u, false],
      [/one currency/u, false],
      [/no longer matches/u, false],
    ] as const;
    for (const [message, reload] of expected) {
      fireEvent.click(
        screen.getByRole('button', { name: 'Calculate and save' }),
      );
      expect(await screen.findByText(message)).toBeInTheDocument();
      const quantity = screen.getAllByLabelText('Quantity').at(0);
      if (!quantity) throw new Error('Expected a quantity input.');
      expect(quantity).toHaveValue('2.5');
      if (reload) {
        fireEvent.click(screen.getByRole('button', { name: 'Reload pricing' }));
        await waitFor(() => {
          const reloadedQuantity = screen.getAllByLabelText('Quantity').at(0);
          if (!reloadedQuantity) throw new Error('Expected a quantity input.');
          expect(reloadedQuantity).toHaveValue('2.5');
        });
      }
    }
  });

  it('shows denied and empty states without inventing priceable values', async () => {
    if (!actor.activeCompany) throw new Error('Expected an active Company.');
    const deniedActor: ActorContext = {
      ...actor,
      activeCompany: { ...actor.activeCompany, pricingUserPermissions: [] },
    };
    const { unmount } = renderPanel(OPPORTUNITY_A, deniedActor);
    expect(
      await screen.findByText(/Pricing access is not available/u),
    ).toBeInTheDocument();
    unmount();
    stubApi({
      ...baseRoutes(),
      'GET /api/pricing-configuration/rule-scope': () =>
        Response.json({ current: null }),
    });
    renderPanel();
    expect(
      await screen.findByText(/No Pricing Rule Version/u),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Calculate and save' }),
    ).not.toBeInTheDocument();
  });

  it.each([
    { mode: 'when the transport honors abort', honorsAbort: true },
    { mode: 'when the transport returns a late reply', honorsAbort: false },
  ])(
    'ignores an obsolete older page after reload and keeps the reloaded list cursor $mode',
    async ({ honorsAbort }) => {
      const initial = snapshot(
        OPPORTUNITY_A,
        '30000000-0000-4000-8000-000000000011',
        '11.11',
      );
      const reloaded = snapshot(
        OPPORTUNITY_A,
        '30000000-0000-4000-8000-000000000012',
        '22.22',
      );
      const obsolete = snapshot(
        OPPORTUNITY_A,
        '30000000-0000-4000-8000-000000000013',
        '33.33',
      );
      const freshOlder = snapshot(
        OPPORTUNITY_A,
        '30000000-0000-4000-8000-000000000014',
        '44.44',
      );
      let resolveObsolete: ((response: Response) => void) | undefined;
      let rejectObsolete: ((reason: DOMException) => void) | undefined;
      const obsoletePage = new Promise<Response>((resolve, reject) => {
        resolveObsolete = resolve;
        rejectObsolete = reject;
      });
      const requestedCursors: string[] = [];
      let firstPageCalls = 0;
      stubApi({
        ...baseRoutes(),
        [`GET ${snapshotPath(OPPORTUNITY_A)}`]: (_call, _init, url) => {
          const cursor = url.searchParams.get('cursor');
          if (cursor) {
            requestedCursors.push(cursor);
            if (cursor === 'obsolete-cursor') {
              if (honorsAbort)
                _init?.signal?.addEventListener(
                  'abort',
                  () =>
                    rejectObsolete?.(new DOMException('Aborted', 'AbortError')),
                  { once: true },
                );
              return obsoletePage;
            }
            if (cursor === 'fresh-cursor')
              return Response.json({ items: [freshOlder] });
            throw new Error(`Unexpected snapshot cursor ${cursor}`);
          }
          firstPageCalls += 1;
          return Response.json(
            firstPageCalls === 1
              ? { items: [initial], nextCursor: 'obsolete-cursor' }
              : { items: [reloaded], nextCursor: 'fresh-cursor' },
          );
        },
        [`POST ${snapshotPath(OPPORTUNITY_A)}`]: () =>
          Response.json({ code: 'STALE_TARIFF_VERSION' }, { status: 409 }),
      });

      renderPanel();
      expect(
        await screen.findByRole('button', { name: /11\.11 EUR/u }),
      ).toBeInTheDocument();
      fireEvent.click(
        screen.getByRole('button', { name: 'Load older snapshots' }),
      );
      await waitFor(() =>
        expect(requestedCursors).toEqual(['obsolete-cursor']),
      );

      await selectWorkedExample();
      fireEvent.click(
        screen.getByRole('button', { name: 'Calculate and save' }),
      );
      expect(
        await screen.findByText(/Configuration changed/u),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Reload pricing' }));
      expect(
        await screen.findByRole('button', { name: /22\.22 EUR/u }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /11\.11 EUR/u }),
      ).not.toBeInTheDocument();

      resolveObsolete?.(
        Response.json({ items: [obsolete], nextCursor: 'wrong-cursor' }),
      );
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(
        screen.queryByRole('button', { name: /33\.33 EUR/u }),
      ).not.toBeInTheDocument();

      fireEvent.click(
        screen.getByRole('button', { name: 'Load older snapshots' }),
      );
      await waitFor(() =>
        expect(requestedCursors).toEqual(['obsolete-cursor', 'fresh-cursor']),
      );
      expect(
        await screen.findByRole('button', { name: /44\.44 EUR/u }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /22\.22 EUR/u }),
      ).toBeInTheDocument();
    },
  );

  it('shows pricing as unavailable for a malformed calculation timestamp', async () => {
    stubApi({
      ...baseRoutes(),
      [`GET ${snapshotPath(OPPORTUNITY_A)}`]: () =>
        Response.json({
          items: [
            {
              ...snapshot(),
              calculatedAt: 'not-a-canonical-instant',
            },
          ],
        }),
    });

    renderPanel();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Pricing could not be loaded. Try again.',
    );
  });

  it('ignores an old Opportunity reply after the mounted target changes', async () => {
    let resolveOld: ((response: Response) => void) | undefined;
    const oldPage = new Promise<Response>((resolve) => {
      resolveOld = resolve;
    });
    const snapshotB = snapshot(
      OPPORTUNITY_B,
      '30000000-0000-4000-8000-000000000002',
      '99.99',
    );
    stubApi({
      ...baseRoutes(),
      [`GET ${snapshotPath(OPPORTUNITY_A)}`]: () => oldPage,
      [`GET ${snapshotPath(OPPORTUNITY_B)}`]: () =>
        Response.json({ items: [snapshotB] }),
    });
    const rendered = renderPanel();
    rendered.rerender(
      <PricingSnapshotPanel
        actor={actor}
        identity={deterministicBrowserIdentity()}
        opportunityId={OPPORTUNITY_B}
        onCompanyContextRejected={vi.fn()}
      />,
    );
    expect(
      await screen.findByRole('button', { name: /99\.99 EUR/u }),
    ).toBeInTheDocument();
    resolveOld?.(Response.json({ items: [snapshot()] }));
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /346\.72 EUR/u }),
      ).not.toBeInTheDocument(),
    );
  });
});
