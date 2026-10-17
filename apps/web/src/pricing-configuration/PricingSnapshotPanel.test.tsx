import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '../test/render-with-interface-locale';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { PricingSnapshotPanel } from './PricingSnapshotPanel';
import {
  InterfaceLocaleProvider,
  interfaceLocales,
  interfaceLocaleStorageKey,
  useInterfaceLocale,
} from '../localization/interface-locale';
import {
  assertMessageCoverage,
  resolveMessage,
} from '../localization/messages';
import { pricingSnapshotMessages } from './pricing-snapshot.copy';

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
    pricingAdjustmentPermissions: ['commercial.pricing.adjustment.apply'],
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
    calculatedByWorkspaceMembershipId: 'membership-calculator',
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
        adjustment: null,
        netReduction: '0.00',
        taxReduction: '0.00',
        adjustedLineNet: '308.63',
        adjustedRawLineTax: '38.0849420',
        adjustedLineTax: '38.08',
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
        adjustment: null,
        netReduction: '0.00',
        taxReduction: '0.00',
        adjustedLineNet: '0.01',
        adjustedRawLineTax: '0.0000000',
        adjustedLineTax: '0.00',
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

function adjustedSnapshot() {
  const value = snapshot();
  return {
    ...value,
    lines: [
      {
        ...value.lines[0],
        adjustment: {
          type: 'FIXED_NET_DISCOUNT',
          netReduction: '8.63',
          taxReduction: '1.06',
          reason: 'Exact synthetic adjustment reason',
          appliedByWorkspaceMembershipId: 'membership-adjuster',
          appliedAt: '2026-09-26T10:00:00.000Z',
        },
        netReduction: '8.63',
        taxReduction: '1.06',
        adjustedLineNet: '300.00',
        adjustedRawLineTax: '37.0200000',
        adjustedLineTax: '37.02',
      },
      {
        ...value.lines[1],
        adjustment: {
          type: 'FIXED_NET_DISCOUNT',
          netReduction: '0.01',
          taxReduction: '0.00',
          reason: 'Full synthetic line adjustment',
          appliedByWorkspaceMembershipId: 'membership-adjuster',
          appliedAt: '2026-09-26T10:00:00.000Z',
        },
        netReduction: '0.01',
        taxReduction: '0.00',
        adjustedLineNet: '0.00',
        adjustedRawLineTax: '0.0000000',
        adjustedLineTax: '0.00',
      },
    ],
    subtotal: '300.00',
    taxTotal: '37.02',
    total: '337.02',
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

function LocaleChoices() {
  const { changeLocale } = useInterfaceLocale();
  return interfaceLocales.map((locale) => (
    <button key={locale} type="button" onClick={() => changeLocale(locale)}>
      Use {locale}
    </button>
  ));
}

function renderLocalizedPanel(value = actor) {
  return render(
    <InterfaceLocaleProvider>
      <LocaleChoices />
      <PricingSnapshotPanel
        actor={value}
        identity={deterministicBrowserIdentity()}
        opportunityId={OPPORTUNITY_A}
        onCompanyContextRejected={vi.fn()}
      />
    </InterfaceLocaleProvider>,
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

async function enterFirstAdjustment(): Promise<void> {
  const firstOffering = (
    await screen.findByLabelText('Illustrative service A')
  ).closest('fieldset');
  if (!firstOffering) throw new Error('Expected the first offering group.');
  fireEvent.click(
    within(firstOffering).getByLabelText('Apply a fixed net discount'),
  );
  fireEvent.change(within(firstOffering).getByLabelText('Net reduction'), {
    target: { value: '8.63' },
  });
  fireEvent.change(within(firstOffering).getByLabelText('Adjustment reason'), {
    target: { value: 'Exact synthetic adjustment reason' },
  });
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

  it('localizes an entered adjustment and uncertain retry without changing draft, source versions or the exact command', async () => {
    const saved = adjustedSnapshot();
    const commands: {
      payload: BodyInit | null | undefined;
      key: string | null;
    }[] = [];
    const fetchMock = stubApi({
      ...baseRoutes(),
      [`POST ${snapshotPath(OPPORTUNITY_A)}`]: (call, init) => {
        commands.push({
          payload: init?.body,
          key: new Headers(init?.headers).get('idempotency-key'),
        });
        return call === 1
          ? Response.json({}, { status: 503 })
          : Response.json(saved, { status: 201 });
      },
    });
    const rejected = vi.fn();
    const revalidated = vi.fn();
    const workspaceRejected = vi.fn();
    localStorage.setItem(interfaceLocaleStorageKey, 'en');
    render(
      <InterfaceLocaleProvider>
        <LocaleChoices />
        <PricingSnapshotPanel
          actor={actor}
          identity={deterministicBrowserIdentity()}
          opportunityId={OPPORTUNITY_A}
          onCompanyContextRejected={rejected}
          onActorRevalidated={revalidated}
          onWorkspaceAccessRejected={workspaceRejected}
        />
      </InterfaceLocaleProvider>,
    );
    await selectWorkedExample();
    await enterFirstAdjustment();
    const literalReason = '  Motiv {literal} / Причина  ';
    fireEvent.change(screen.getByLabelText('Adjustment reason'), {
      target: { value: literalReason },
    });
    const reads = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Use fr' }));
    expect(
      screen.getByRole('heading', { name: 'Tarification illustrative' }),
    ).toBeInTheDocument();
    expect(screen.getAllByLabelText('Quantité')[0]).toHaveValue('2.5');
    expect(screen.getByLabelText('Réduction nette')).toHaveValue('8.63');
    expect(screen.getByLabelText('Motif de l’ajustement')).toHaveValue(
      literalReason,
    );
    expect(screen.getByText(/Version du tarif 4/u)).toHaveTextContent(
      '123,4500 EUR/illustrative-unit',
    );
    expect(fetchMock).toHaveBeenCalledTimes(reads);
    fireEvent.click(
      screen.getByRole('button', { name: 'Calculer et enregistrer' }),
    );
    await screen.findByText(
      'Le résultat est incertain. Réessayer renvoie exactement les mêmes valeurs et la même clé.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Use ru' }));
    expect(
      screen.getByText(
        'Результат неизвестен. Повторная попытка отправит те же значения и тот же ключ.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Причина корректировки')).toHaveValue(
      literalReason,
    );
    expect(screen.getByLabelText('Уменьшение нетто')).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(reads + 1);
    expect(rejected).not.toHaveBeenCalled();
    expect(revalidated).not.toHaveBeenCalled();
    expect(workspaceRejected).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Повторить тот же расчёт' }),
    );
    await screen.findByText('337,02 EUR');
    expect(commands).toHaveLength(2);
    expect(commands[0]?.key).toBeTruthy();
    expect(commands[1]).toEqual(commands[0]);
    expect(commands[0]?.payload).toBe(
      JSON.stringify({
        pricingRuleVersionNumber: 3,
        lines: [
          {
            offeringId: OFFERING_A,
            tariffVersionNumber: 4,
            quantity: '2.5',
            adjustment: {
              type: 'FIXED_NET_DISCOUNT',
              netReduction: '8.63',
              reason: literalReason,
            },
          },
          { offeringId: OFFERING_B, tariffVersionNumber: 2, quantity: '1' },
        ],
      }),
    );
  });

  it('retranslates validated server feedback on its submitted offering without rendering raw server prose', async () => {
    const fetchMock = stubApi({
      ...baseRoutes(),
      [`POST ${snapshotPath(OPPORTUNITY_A)}`]: () =>
        Response.json(
          {
            code: 'VALIDATION_ERROR',
            field: 'lines[0].adjustment.netReduction',
            message: 'Raw English server prose is not interface copy.',
          },
          { status: 400 },
        ),
    });
    renderLocalizedPanel();
    const selected = await screen.findByLabelText('Illustrative label B');
    const group = selected.closest('fieldset');
    if (!group) throw new Error('Expected the submitted offering group.');
    fireEvent.click(selected);
    fireEvent.change(within(group).getByLabelText('Quantity'), {
      target: { value: '1.000' },
    });
    fireEvent.click(within(group).getByLabelText('Apply a fixed net discount'));
    const reduction = within(group).getByLabelText('Net reduction');
    fireEvent.change(reduction, { target: { value: '999.00' } });
    const reason = within(group).getByLabelText('Adjustment reason');
    fireEvent.change(reason, {
      target: { value: '  Motiv literal / Причина  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Calculate and save' }));
    await screen.findByText(
      'Enter a net reduction no greater than the original line net.',
    );
    const reads = fetchMock.mock.calls.length;
    const association = reduction.getAttribute('aria-describedby');
    expect(association).toBeTruthy();
    for (const choice of [
      {
        locale: 'ro',
        text: 'Introduceți o reducere netă care nu depășește valoarea netă inițială a liniei.',
      },
      {
        locale: 'ru',
        text: 'Введите уменьшение нетто, не превышающее исходную сумму нетто строки.',
      },
      {
        locale: 'fr',
        text: 'Saisissez une réduction nette ne dépassant pas le net d’origine de la ligne.',
      },
      {
        locale: 'en',
        text: 'Enter a net reduction no greater than the original line net.',
      },
    ]) {
      fireEvent.click(
        screen.getByRole('button', { name: `Use ${choice.locale}` }),
      );
      expect(reduction).toHaveAccessibleDescription(choice.text);
      expect(reduction).toHaveAttribute('aria-describedby', association);
      expect(reduction).toHaveAttribute('aria-invalid', 'true');
      expect(reduction).toHaveValue('999.00');
      expect(reason).toHaveValue('  Motiv literal / Причина  ');
      expect(fetchMock).toHaveBeenCalledTimes(reads);
      expect(
        screen.queryByText('Raw English server prose is not interface copy.'),
      ).not.toBeInTheDocument();
    }
    fireEvent.change(reduction, { target: { value: '0.01' } });
    expect(reduction).not.toHaveAttribute('aria-describedby');
    expect(reduction).toHaveAttribute('aria-invalid', 'false');
    expect(postCalls(fetchMock)[0]?.body).toMatchObject({
      lines: [{ offeringId: OFFERING_B, quantity: '1.000' }],
    });
  });

  it('reopens historical adjustment amounts with exact precision and locale dates without reading successor tariffs', async () => {
    const historical = adjustedSnapshot();
    const saved = {
      ...historical,
      total: '9007199254740993.01',
      lines: historical.lines.map((line) => ({
        ...line,
        quantity: '2.500',
        unitAmount: '123.4500',
      })),
    };
    const fetchMock = stubApi({
      ...baseRoutes(),
      [`GET ${snapshotPath(OPPORTUNITY_A)}`]: () =>
        Response.json({ items: [saved] }),
      [`GET ${snapshotPath(OPPORTUNITY_A)}/${saved.id}`]: () =>
        Response.json(saved),
      [`GET /api/pricing-configuration/offerings/${OFFERING_A}/tariff-scope`]:
        () =>
          Response.json({
            offeringId: OFFERING_A,
            current: tariff(OFFERING_A, 9),
          }),
    });
    renderLocalizedPanel();
    fireEvent.click(
      await screen.findByRole('button', { name: /Reopen snapshot/u }),
    );
    // The panel shares the title with the detail, so scope by its explicit Close action.
    const opened = (
      await screen.findByRole('button', { name: 'Close snapshot' })
    ).closest('section');
    if (!opened) throw new Error('Expected the opened Snapshot.');
    const reads = fetchMock.mock.calls.length;
    for (const choice of [
      {
        locale: 'ro',
        amount: '9.007.199.254.740.993,01 EUR',
        quantity: '2,500 × 123,4500 EUR/illustrative-unit',
        date: '26 sept. 2026, 10:00',
      },
      {
        locale: 'ru',
        amount: '9\u00a0007\u00a0199\u00a0254\u00a0740\u00a0993,01 EUR',
        quantity: '2,500 × 123,4500 EUR/illustrative-unit',
        date: '26 сент. 2026 г., 10:00',
      },
      {
        locale: 'fr',
        amount: '9\u202f007\u202f199\u202f254\u202f740\u202f993,01 EUR',
        quantity: '2,500 × 123,4500 EUR/illustrative-unit',
        date: '26 sept. 2026, 10:00',
      },
      {
        locale: 'en',
        amount: '9,007,199,254,740,993.01 EUR',
        quantity: '2.500 × 123.4500 EUR/illustrative-unit',
        date: 'Sep 26, 2026, 10:00 AM',
      },
    ]) {
      fireEvent.click(
        screen.getByRole('button', { name: `Use ${choice.locale}` }),
      );
      expect(
        within(opened).getByText(
          (_, element) =>
            element?.tagName === 'STRONG' &&
            element.textContent === choice.amount,
        ),
      ).toBeInTheDocument();
      expect(
        within(opened).getAllByText(choice.quantity, { exact: true }),
      ).toHaveLength(2);
      expect(opened).toHaveTextContent(choice.date);
      expect(opened).toHaveTextContent('Exact synthetic adjustment reason');
      expect(opened).toHaveTextContent('membership-adjuster');
      expect(opened).toHaveTextContent('Illustrative Client');
      expect(opened).not.toHaveTextContent(/Tariff Version: 9/u);
      expect(fetchMock).toHaveBeenCalledTimes(reads);
    }
  });

  it('requires every Snapshot translation and falls back to Romanian for a missing locale entry', () => {
    expect(() =>
      assertMessageCoverage('pricingSnapshot', pricingSnapshotMessages),
    ).not.toThrow();
    const incomplete = {
      ...pricingSnapshotMessages,
      translations: { ...pricingSnapshotMessages.translations, fr: {} },
    };
    expect(resolveMessage(incomplete, 'fr', 'title')).toBe(
      'Tarificare ilustrativă',
    );
    expect(() => assertMessageCoverage('pricingSnapshot', incomplete)).toThrow(
      'Missing translation: pricingSnapshot.fr.title',
    );
  });

  it('retranslates failed older pages and pending or unavailable reopening without repeating a read', async () => {
    const saved = snapshot();
    let releaseDetail: ((response: Response) => void) | undefined;
    const pendingDetail = new Promise<Response>((resolve) => {
      releaseDetail = resolve;
    });
    const fetchMock = stubApi({
      ...baseRoutes(),
      [`GET ${snapshotPath(OPPORTUNITY_A)}`]: (_call, _init, url) =>
        url.searchParams.has('cursor')
          ? Response.json({}, { status: 503 })
          : Response.json({ items: [saved], nextCursor: 'same-older-page' }),
      [`GET ${snapshotPath(OPPORTUNITY_A)}/${saved.id}`]: () => pendingDetail,
    });
    const choices = [
      {
        locale: 'ro',
        olderError:
          'Instantaneele de tarifare mai vechi nu au putut fi încărcate. Reîncercați.',
        opening: 'Se deschide instantaneul de tarifare…',
        unavailable:
          'Acest instantaneu de tarifare nu a putut fi deschis. Reîncercați.',
        retry: 'Reîncearcă deschiderea instantaneului',
      },
      {
        locale: 'ru',
        olderError:
          'Не удалось загрузить более ранние снимки расчёта цены. Повторите попытку.',
        opening: 'Открывается снимок расчёта цены…',
        unavailable:
          'Не удалось открыть этот снимок расчёта цены. Повторите попытку.',
        retry: 'Повторить открытие снимка',
      },
      {
        locale: 'fr',
        olderError:
          'Impossible de charger les instantanés de tarification plus anciens. Réessayez.',
        opening: 'Ouverture de l’instantané de tarification…',
        unavailable:
          'Impossible d’ouvrir cet instantané de tarification. Réessayez.',
        retry: 'Réessayer d’ouvrir l’instantané',
      },
      {
        locale: 'en',
        olderError: 'Older Pricing Snapshots could not be loaded. Try again.',
        opening: 'Opening Pricing Snapshot…',
        unavailable: 'This Pricing Snapshot could not be opened. Try again.',
        retry: 'Retry opening snapshot',
      },
    ];
    renderLocalizedPanel();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Load older snapshots' }),
    );
    await screen.findByText(
      'Older Pricing Snapshots could not be loaded. Try again.',
    );
    let reads = fetchMock.mock.calls.length;
    for (const choice of choices) {
      fireEvent.click(
        screen.getByRole('button', { name: `Use ${choice.locale}` }),
      );
      expect(screen.getByText(choice.olderError)).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(reads);
    }
    fireEvent.click(screen.getByRole('button', { name: /^Reopen snapshot/u }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(
          ([input, init]) =>
            key(input, init) ===
            `GET ${snapshotPath(OPPORTUNITY_A)}/${saved.id}`,
        ),
      ).toHaveLength(1),
    );
    reads = fetchMock.mock.calls.length;
    for (const choice of choices) {
      fireEvent.click(
        screen.getByRole('button', { name: `Use ${choice.locale}` }),
      );
      expect(screen.getByText(choice.opening)).toHaveAttribute(
        'role',
        'status',
      );
      expect(fetchMock).toHaveBeenCalledTimes(reads);
    }
    await act(async () => releaseDetail?.(Response.json({}, { status: 404 })));
    for (const choice of choices) {
      fireEvent.click(
        screen.getByRole('button', { name: `Use ${choice.locale}` }),
      );
      expect(screen.getByText(choice.unavailable)).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: choice.retry }),
      ).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(reads);
    }
  });

  it.each([
    {
      locale: 'ro',
      calculate: 'Calculează și salvează',
      feedback: [
        'Corectați valorile evidențiate și reîncercați.',
        'Configurația s-a schimbat. Reîncărcați tarificarea înainte de un nou calcul.',
        'O versiune declarată nu mai este în vigoare. Reîncărcați tarificarea înainte de a reîncerca.',
        'Alegeți oferte de servicii care folosesc aceeași monedă.',
        'Această reîncercare nu mai corespunde calculului inițial.',
      ],
    },
    {
      locale: 'ru',
      calculate: 'Рассчитать и сохранить',
      feedback: [
        'Исправьте выделенные значения и повторите попытку.',
        'Конфигурация изменилась. Перезагрузите расчёт цены перед новым расчётом.',
        'Одна из указанных версий больше не действует. Перезагрузите расчёт цены перед повторной попыткой.',
        'Выберите предложения услуг в одной валюте.',
        'Эта повторная попытка больше не соответствует исходному расчёту.',
      ],
    },
    {
      locale: 'fr',
      calculate: 'Calculer et enregistrer',
      feedback: [
        'Corrigez les valeurs signalées et réessayez.',
        'La configuration a changé. Rechargez la tarification avant un nouveau calcul.',
        'Une version déclarée n’est plus en vigueur. Rechargez la tarification avant de réessayer.',
        'Choisissez des prestations utilisant une seule devise.',
        'Cette nouvelle tentative ne correspond plus au calcul d’origine.',
      ],
    },
    {
      locale: 'en',
      calculate: 'Calculate and save',
      feedback: [
        'Correct the highlighted values and try again.',
        'Configuration changed. Reload pricing before calculating again.',
        'One declared version is no longer effective. Reload pricing before trying again.',
        'Choose offerings that use one currency.',
        'This retry no longer matches the original calculation.',
      ],
    },
  ])(
    'presents validation and safe named conflicts in $locale with the original decimal draft',
    async ({ locale, calculate, feedback }) => {
      const outcomes = [
        { status: 400, code: 'VALIDATION_ERROR' },
        { status: 409, code: 'STALE_PRICING_RULE_VERSION' },
        { status: 409, code: 'PRICING_RULE_NOT_EFFECTIVE' },
        { status: 409, code: 'MIXED_CURRENCY' },
        { status: 409, code: 'IDEMPOTENCY_CONFLICT' },
      ];
      const fetchMock = stubApi({
        ...baseRoutes(),
        [`POST ${snapshotPath(OPPORTUNITY_A)}`]: (call) => {
          const outcome = outcomes[call - 1];
          if (!outcome) throw new Error('Unexpected calculation.');
          return Response.json(
            { code: outcome.code },
            { status: outcome.status },
          );
        },
      });
      renderLocalizedPanel();
      await selectWorkedExample();
      fireEvent.click(screen.getByRole('button', { name: `Use ${locale}` }));
      for (const expected of feedback) {
        fireEvent.click(screen.getByRole('button', { name: calculate }));
        expect(
          await screen.findByText(expected, { exact: true }),
        ).toBeInTheDocument();
        const count = fetchMock.mock.calls.length;
        fireEvent.click(screen.getByRole('button', { name: 'Use en' }));
        expect(screen.getAllByLabelText('Quantity')[0]).toHaveValue('2.5');
        fireEvent.click(screen.getByRole('button', { name: `Use ${locale}` }));
        expect(screen.getByText(expected, { exact: true })).toBeInTheDocument();
        expect(fetchMock).toHaveBeenCalledTimes(count);
      }
      expect(postCalls(fetchMock)).toHaveLength(5);
    },
  );

  it.each([
    {
      locale: 'ro',
      loading: 'Se încarcă tarificarea…',
      unavailable: 'Tarificarea nu a putut fi încărcată. Reîncercați.',
      retry: 'Reîncearcă același calcul',
      noRule:
        'Nicio versiune a regulii de tarifare nu este în vigoare în prezent.',
      noOfferings:
        'Nu există nicio ofertă de serviciu cu o versiune de tarif în vigoare.',
      denied:
        'Accesul la tarificare nu este disponibil pentru această Oportunitate.',
    },
    {
      locale: 'ru',
      loading: 'Загрузка расчёта цены…',
      unavailable: 'Не удалось загрузить расчёт цены. Повторите попытку.',
      retry: 'Повторить тот же расчёт',
      noRule: 'Сейчас нет действующей версии правила расчёта цены.',
      noOfferings: 'Нет предложений услуг с действующей версией тарифа.',
      denied: 'Расчёт цены недоступен для этой Возможности.',
    },
    {
      locale: 'fr',
      loading: 'Chargement de la tarification…',
      unavailable: 'Impossible de charger la tarification. Réessayez.',
      retry: 'Réessayer le même calcul',
      noRule:
        'Aucune version de règle de tarification n’est actuellement en vigueur.',
      noOfferings:
        'Aucune prestation avec une version de tarif en vigueur n’est disponible.',
      denied:
        'L’accès à la tarification n’est pas disponible pour cette Opportunité.',
    },
    {
      locale: 'en',
      loading: 'Loading pricing…',
      unavailable: 'Pricing could not be loaded. Try again.',
      retry: 'Retry the same calculation',
      noRule: 'No Pricing Rule Version is currently effective.',
      noOfferings: 'No offering with a current Tariff Version is available.',
      denied: 'Pricing access is not available for this Opportunity.',
    },
  ])(
    'renders loading, unavailable, empty configuration and denial in $locale',
    async (choice) => {
      let release: ((response: Response) => void) | undefined;
      const first = new Promise<Response>((resolve) => {
        release = resolve;
      });
      stubApi({
        ...baseRoutes(),
        'GET /api/pricing-configuration/rule-scope': (call) =>
          call === 1 ? first : Response.json({ current: null }),
      });
      const firstRender = renderLocalizedPanel();
      fireEvent.click(
        screen.getByRole('button', { name: `Use ${choice.locale}` }),
      );
      expect(screen.getByRole('status')).toHaveTextContent(choice.loading);
      await act(async () => release?.(Response.json({}, { status: 503 })));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        choice.unavailable,
      );
      fireEvent.click(screen.getByRole('button', { name: choice.retry }));
      expect(await screen.findByText(choice.noRule)).toBeInTheDocument();
      firstRender.unmount();
      stubApi({
        ...baseRoutes(),
        'GET /api/commercial-catalogue/offerings': () =>
          Response.json({ items: [] }),
      });
      const empty = renderLocalizedPanel();
      fireEvent.click(
        screen.getByRole('button', { name: `Use ${choice.locale}` }),
      );
      expect(await screen.findByText(choice.noOfferings)).toBeInTheDocument();
      empty.unmount();
      const deniedFetch = stubApi({});
      renderLocalizedPanel({
        ...actor,
        activeCompany: {
          ...actor.activeCompany,
          id: 'company-1',
          displayName: 'PRISMA-PRIM',
          pricingUserPermissions: [],
        },
      });
      fireEvent.click(
        screen.getByRole('button', { name: `Use ${choice.locale}` }),
      );
      expect(screen.getByRole('alert')).toHaveTextContent(choice.denied);
      expect(deniedFetch).not.toHaveBeenCalled();
    },
  );

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
    expect(
      screen.getByText(
        'Calculated by Workspace Membership: membership-calculator',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Calculated by Workspace Membership: membership-1/u),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`${snapshotPath(OPPORTUNITY_A)}/${saved.id}`),
      expect.anything(),
    );
  });

  it('submits and reopens the exact adjustment trace for an authorized actor', async () => {
    const saved = adjustedSnapshot();
    const fetchMock = stubApi({
      ...baseRoutes(),
      [`POST ${snapshotPath(OPPORTUNITY_A)}`]: () =>
        Response.json(saved, { status: 201 }),
      [`GET ${snapshotPath(OPPORTUNITY_A)}/${saved.id}`]: () =>
        Response.json(saved),
    });
    renderPanel();
    await selectWorkedExample();
    await enterFirstAdjustment();

    fireEvent.click(screen.getByRole('button', { name: 'Calculate and save' }));

    expect(await screen.findByText('337.02 EUR')).toBeInTheDocument();
    expect(postCalls(fetchMock)).toEqual([
      {
        body: {
          pricingRuleVersionNumber: 3,
          lines: [
            {
              offeringId: OFFERING_A,
              tariffVersionNumber: 4,
              quantity: '2.5',
              adjustment: {
                type: 'FIXED_NET_DISCOUNT',
                netReduction: '8.63',
                reason: 'Exact synthetic adjustment reason',
              },
            },
            { offeringId: OFFERING_B, tariffVersionNumber: 2, quantity: '1' },
          ],
        },
        idempotencyKey: expect.any(String),
      },
    ]);
    expect(
      screen.getByText('Original net and tax: 308.63 + 38.08 EUR'),
    ).toBeInTheDocument();
    expect(screen.getByText('Net reduction: 8.63 EUR')).toBeInTheDocument();
    expect(
      screen.getAllByText('Adjustment type: Fixed net discount'),
    ).toHaveLength(2);
    expect(screen.getByText('Tax reduction: 1.06 EUR')).toBeInTheDocument();
    expect(
      screen.getByText('Adjustment reason: Exact synthetic adjustment reason'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Adjusted net and tax: 300.00 + 37.02 EUR'),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(
        'Adjustment applied by Workspace Membership: membership-adjuster',
      ),
    ).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Close snapshot' }));
    fireEvent.click(screen.getByRole('button', { name: /Reopen snapshot/u }));
    expect(
      await screen.findByText(
        'Adjustment reason: Exact synthetic adjustment reason',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText('Adjustment type: Fixed net discount'),
    ).toHaveLength(2);
  });

  it('does not expose adjustment entry without the captured adjustment permission', async () => {
    if (!actor.activeCompany) throw new Error('Expected an active Company.');
    const pricingOnlyActor: ActorContext = {
      ...actor,
      activeCompany: {
        ...actor.activeCompany,
        pricingAdjustmentPermissions: [],
      },
    };
    stubApi(baseRoutes());
    renderPanel(OPPORTUNITY_A, pricingOnlyActor);

    fireEvent.click(await screen.findByLabelText('Illustrative service A'));

    expect(
      screen.queryByLabelText('Apply a fixed net discount'),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Net reduction')).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Adjustment reason'),
    ).not.toBeInTheDocument();
  });

  it('keeps invalid adjustment values for correction and does not submit them', async () => {
    const fetchMock = stubApi(baseRoutes());
    renderPanel();
    await selectWorkedExample();
    await enterFirstAdjustment();
    const reduction = screen.getByLabelText('Net reduction');
    const reason = screen.getByLabelText('Adjustment reason');
    fireEvent.change(reduction, { target: { value: '0.00' } });
    fireEvent.change(reason, { target: { value: '   ' } });

    fireEvent.click(screen.getByRole('button', { name: 'Calculate and save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Correct the highlighted values and try again.',
    );
    expect(reduction).toHaveValue('0.00');
    expect(reason).toHaveValue('   ');
    expect(reduction).toHaveAttribute('aria-invalid', 'true');
    expect(reason).toHaveAttribute('aria-invalid', 'true');
    expect(postCalls(fetchMock)).toHaveLength(0);
  });

  it.each([
    '',
    ' '.repeat(500),
    'x'.repeat(501),
    '\u{1F642}'.repeat(501),
    'before\u0000after',
    'before\uD800after',
    'before\uDC00after',
  ])('keeps invalid reason %# exact and blocks submission', async (value) => {
    const fetchMock = stubApi(baseRoutes());
    renderPanel();
    await selectWorkedExample();
    await enterFirstAdjustment();
    const reason = screen.getByLabelText('Adjustment reason');
    fireEvent.change(reason, { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: 'Calculate and save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Correct the highlighted values and try again.',
    );
    expect(reason).toHaveValue(value);
    expect(reason).toHaveAttribute('aria-invalid', 'true');
    expect(postCalls(fetchMock)).toHaveLength(0);
  });

  it.each([
    'x',
    'x'.repeat(500),
    '\u{1F642}'.repeat(500),
    ' \u{1F642}e\u0301 ',
  ])(
    'preserves valid reason %# through uncertain retry, creation and reopening',
    async (value) => {
      const saved = adjustedSnapshot();
      const firstLine = saved.lines[0];
      if (!firstLine?.adjustment) throw new Error('Expected an adjusted line.');
      firstLine.adjustment.reason = value;
      const fetchMock = stubApi({
        ...baseRoutes(),
        ['POST ' + snapshotPath(OPPORTUNITY_A)]: (call) => {
          if (call === 1) throw new TypeError('network interrupted');
          return Response.json(saved, { status: 201 });
        },
        ['GET ' + snapshotPath(OPPORTUNITY_A) + '/' + saved.id]: () =>
          Response.json(saved),
      });
      renderPanel();
      await selectWorkedExample();
      await enterFirstAdjustment();
      const reason = screen.getByLabelText('Adjustment reason');
      expect(reason).not.toHaveAttribute('maxlength');
      fireEvent.change(reason, { target: { value } });
      expect(reason).toHaveAttribute('aria-invalid', 'false');
      fireEvent.click(
        screen.getByRole('button', { name: 'Calculate and save' }),
      );
      await screen.findByText(/outcome is uncertain/u);
      expect(reason).toHaveValue(value);
      expect(reason).toBeDisabled();
      fireEvent.click(
        screen.getByRole('button', { name: 'Retry the same calculation' }),
      );
      await screen.findByText('337.02 EUR');
      const calls = postCalls(fetchMock);
      expect(calls).toHaveLength(2);
      expect(calls[1]).toEqual(calls[0]);
      expect(calls[0]).toMatchObject({
        body: {
          lines: [
            { adjustment: { reason: value } },
            { offeringId: OFFERING_B },
          ],
        },
      });
      const exactReasonText = 'Adjustment reason: ' + value;
      expect(
        screen.getByText(
          (_, element) => element?.textContent === exactReasonText,
        ),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Close snapshot' }));
      fireEvent.click(screen.getByRole('button', { name: /Reopen snapshot/u }));
      expect(
        await screen.findByText(
          (_, element) => element?.textContent === exactReasonText,
        ),
      ).toBeInTheDocument();
    },
  );

  it('starts a fresh unadjusted calculation for an Offer after an adjusted retry clears the draft', async () => {
    const fetchMock = stubApi({
      ...baseRoutes(),
      [`POST ${snapshotPath(OPPORTUNITY_A)}`]: (call) => {
        if (call === 1) throw new TypeError('network interrupted');
        return Response.json(call === 2 ? adjustedSnapshot() : snapshot(), {
          status: 201,
        });
      },
    });
    renderPanel();
    await selectWorkedExample();
    await enterFirstAdjustment();
    fireEvent.click(screen.getByRole('button', { name: 'Calculate and save' }));
    await screen.findByText(/outcome is uncertain/u);
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry the same calculation' }),
    );
    await screen.findByText('337.02 EUR');

    expect(screen.getByLabelText('Illustrative service A')).not.toBeChecked();
    expect(screen.getByLabelText('Illustrative label B')).not.toBeChecked();
    await selectWorkedExample();
    for (const checkbox of screen.getAllByLabelText(
      'Apply a fixed net discount',
    ))
      expect(checkbox).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Calculate and save' }));
    await waitFor(() => expect(postCalls(fetchMock)).toHaveLength(3));
    const calls = postCalls(fetchMock);
    expect(calls[1]).toEqual(calls[0]);
    expect(calls[2]).toMatchObject({
      body: {
        lines: [
          { offeringId: OFFERING_A, quantity: '2.5' },
          { offeringId: OFFERING_B, quantity: '1' },
        ],
      },
    });
    expect(JSON.stringify(calls[2]?.body)).not.toContain('adjustment');
    expect(await screen.findByText('346.72 EUR')).toBeInTheDocument();
  });

  it('keeps an excessive reduction and associates the server field error with it', async () => {
    const fetchMock = stubApi({
      ...baseRoutes(),
      [`POST ${snapshotPath(OPPORTUNITY_A)}`]: () =>
        Response.json(
          {
            code: 'VALIDATION_ERROR',
            field: 'lines[0].adjustment.netReduction',
            message:
              'Enter a net reduction no greater than the original line net.',
          },
          { status: 400 },
        ),
    });
    renderPanel();
    await selectWorkedExample();
    await enterFirstAdjustment();
    const reduction = screen.getByLabelText('Net reduction');
    fireEvent.change(reduction, { target: { value: '999.00' } });

    fireEvent.click(screen.getByRole('button', { name: 'Calculate and save' }));

    expect(
      await screen.findByText(
        'Enter a net reduction no greater than the original line net.',
      ),
    ).toBeInTheDocument();
    expect(reduction).toHaveValue('999.00');
    expect(reduction).toHaveAttribute('aria-invalid', 'true');
    expect(postCalls(fetchMock)).toEqual([
      expect.objectContaining({
        body: expect.objectContaining({
          lines: expect.arrayContaining([
            expect.objectContaining({
              adjustment: expect.objectContaining({
                netReduction: '999.00',
              }),
            }),
          ]),
        }),
      }),
    ]);
  });

  it('limits a calculation to 20 selected offerings and lets the user replace one', async () => {
    const manyOfferings = Array.from({ length: 21 }, (_, index) => {
      const number = index + 1;
      return {
        id: `20000000-0000-4000-8000-${String(number).padStart(12, '0')}`,
        serviceDefinition: {
          code: `SERVICE-${number}`,
          name: `Selectable service ${number}`,
        },
        commercialLabel: null,
      };
    });
    const routes: Record<string, Responder> = {
      ...baseRoutes(),
      'GET /api/commercial-catalogue/offerings': () =>
        Response.json({ items: manyOfferings }),
      [`POST ${snapshotPath(OPPORTUNITY_A)}`]: () =>
        Response.json(snapshot(), { status: 201 }),
    };
    for (const offering of manyOfferings) {
      routes[
        `GET /api/pricing-configuration/offerings/${offering.id}/tariff-scope`
      ] = () =>
        Response.json({
          offeringId: offering.id,
          current: tariff(offering.id, 1),
        });
    }
    const fetchMock = stubApi(routes);
    renderLocalizedPanel();

    for (let index = 0; index < 20; index += 1) {
      const checkbox = await screen.findByLabelText(
        `Selectable service ${index + 1}`,
      );
      const offering = checkbox.closest('fieldset');
      if (!offering) throw new Error('Expected the offering quantity group.');
      fireEvent.click(checkbox);
      fireEvent.change(within(offering).getByLabelText('Quantity'), {
        target: { value: String(index + 1) },
      });
    }

    const first = screen.getByLabelText('Selectable service 1');
    const twentyFirst = screen.getByLabelText('Selectable service 21');
    const reads = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Use fr' }));
    expect(twentyFirst).toHaveAccessibleDescription(
      '20 prestations sélectionnées. Désélectionnez-en une avant d’en choisir une autre.',
    );
    expect(fetchMock).toHaveBeenCalledTimes(reads);
    fireEvent.click(screen.getByRole('button', { name: 'Use en' }));
    expect(twentyFirst).toBeDisabled();
    expect(twentyFirst).toHaveAccessibleDescription(
      '20 offerings selected. Deselect one before choosing another.',
    );
    expect(
      screen.getByText(
        '20 offerings selected. Deselect one before choosing another.',
      ),
    ).toBeInTheDocument();

    fireEvent.click(first);
    expect(twentyFirst).toBeEnabled();
    const firstOffering = first.closest('fieldset');
    if (!firstOffering)
      throw new Error('Expected the first offering quantity group.');
    expect(within(firstOffering).getByLabelText('Quantity')).toHaveValue('1');
    fireEvent.click(twentyFirst);
    const lastOffering = twentyFirst.closest('fieldset');
    if (!lastOffering)
      throw new Error('Expected the last offering quantity group.');
    fireEvent.change(within(lastOffering).getByLabelText('Quantity'), {
      target: { value: '21' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Calculate and save' }));

    await waitFor(() => expect(postCalls(fetchMock)).toHaveLength(1));
    const [call] = postCalls(fetchMock);
    expect(call?.body).toEqual({
      pricingRuleVersionNumber: 3,
      lines: [
        ...manyOfferings.slice(1, 20).map((offering, index) => ({
          offeringId: offering.id,
          tariffVersionNumber: 1,
          quantity: String(index + 2),
        })),
        {
          offeringId: manyOfferings[20]?.id,
          tariffVersionNumber: 1,
          quantity: '21',
        },
      ],
    });
  });

  it('reopens a snapshot with its stored Tariff Version after an identical successor is published', async () => {
    const historical = snapshot();
    stubApi({
      ...baseRoutes(),
      [`GET /api/pricing-configuration/offerings/${OFFERING_A}/tariff-scope`]:
        () =>
          Response.json({
            offeringId: OFFERING_A,
            current: tariff(OFFERING_A, 5),
          }),
      [`GET ${snapshotPath(OPPORTUNITY_A)}`]: () =>
        Response.json({ items: [historical] }),
      [`GET ${snapshotPath(OPPORTUNITY_A)}/${historical.id}`]: () =>
        Response.json(historical),
    });

    renderPanel();
    fireEvent.click(
      await screen.findByRole('button', {
        name: /Reopen snapshot: 346\.72 EUR/u,
      }),
    );

    const closeButton = await screen.findByRole('button', {
      name: 'Close snapshot',
    });
    const detail = closeButton.closest('section');
    if (!detail) throw new Error('Expected the reopened snapshot detail');
    expect(within(detail).getByText('Tariff Version: 4')).toBeInTheDocument();
    expect(
      within(detail).queryByText('Tariff Version: 5'),
    ).not.toBeInTheDocument();
  });

  it.each([
    {
      failure: 'a network failure',
      response: () => {
        throw new TypeError('network interrupted');
      },
    },
    {
      failure: 'a server failure',
      response: () =>
        Response.json({ message: 'Unavailable' }, { status: 503 }),
    },
  ])(
    'reports $failure while reopening and retries the selected snapshot',
    async ({ response }) => {
      const historical = snapshot();
      const fetchMock = stubApi({
        ...baseRoutes(),
        [`GET ${snapshotPath(OPPORTUNITY_A)}`]: () =>
          Response.json({ items: [historical] }),
        [`GET ${snapshotPath(OPPORTUNITY_A)}/${historical.id}`]: (call) =>
          call === 1 ? response() : Response.json(historical),
      });

      renderPanel();
      fireEvent.click(
        await screen.findByRole('button', { name: /Reopen snapshot/u }),
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'This Pricing Snapshot could not be opened. Try again.',
      );
      expect(
        screen.queryByText(/Correct the highlighted values/u),
      ).not.toBeInTheDocument();
      fireEvent.click(
        screen.getByRole('button', { name: 'Retry opening snapshot' }),
      );

      expect(
        await screen.findByText(
          'Calculated by Workspace Membership: membership-calculator',
        ),
      ).toBeInTheDocument();
      expect(
        fetchMock.mock.calls.filter(
          ([input, init]) =>
            key(input, init) ===
            `GET ${snapshotPath(OPPORTUNITY_A)}/${historical.id}`,
        ),
      ).toHaveLength(2);
    },
  );

  it('uses the session-denial path when loading an older page is unauthorized', async () => {
    const historical = snapshot();
    const rejectSession = vi.fn(async () => undefined);
    stubApi({
      ...baseRoutes(),
      [`GET ${snapshotPath(OPPORTUNITY_A)}`]: (_call, _init, url) =>
        url.searchParams.has('cursor')
          ? Response.json({ message: 'Unauthorized' }, { status: 401 })
          : Response.json({ items: [historical], nextCursor: 'page-two' }),
    });
    render(
      <PricingSnapshotPanel
        actor={actor}
        identity={{ ...deterministicBrowserIdentity(), rejectSession }}
        opportunityId={OPPORTUNITY_A}
        onCompanyContextRejected={vi.fn()}
      />,
    );

    fireEvent.click(
      await screen.findByRole('button', { name: 'Load older snapshots' }),
    );

    await waitFor(() => expect(rejectSession).toHaveBeenCalledOnce());
    expect(
      await screen.findByText(/Pricing access is not available/u),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        'Older Pricing Snapshots could not be loaded. Try again.',
      ),
    ).not.toBeInTheDocument();
  });

  it.each([
    {
      scope: 'Opportunity',
      opportunityId: OPPORTUNITY_B,
      companyId: 'company-1',
    },
    { scope: 'Company', opportunityId: OPPORTUNITY_A, companyId: 'company-2' },
  ])(
    'ignores a late older-page failure after the selected $scope changes',
    async ({ opportunityId, companyId }) => {
      if (!actor.activeCompany) throw new Error('Expected an active Company.');
      const initial = snapshot(
        OPPORTUNITY_A,
        '30000000-0000-4000-8000-000000000031',
        '31.31',
      );
      const current = snapshot(
        opportunityId,
        '30000000-0000-4000-8000-000000000032',
        '32.32',
      );
      let resolveOlder: ((response: Response) => void) | undefined;
      const olderPage = new Promise<Response>((resolve) => {
        resolveOlder = resolve;
      });
      stubApi({
        ...baseRoutes(),
        [`GET ${snapshotPath(OPPORTUNITY_A)}`]: (_call, init, url) => {
          if (url.searchParams.has('cursor')) return olderPage;
          return new Headers(init?.headers).get('x-company-context-id') ===
            'company-2'
            ? Response.json({ items: [current] })
            : Response.json({ items: [initial], nextCursor: 'obsolete' });
        },
        [`GET ${snapshotPath(OPPORTUNITY_B)}`]: () =>
          Response.json({ items: [current] }),
      });
      const rendered = renderPanel();
      fireEvent.click(
        await screen.findByRole('button', { name: 'Load older snapshots' }),
      );

      rendered.rerender(
        <PricingSnapshotPanel
          actor={{
            ...actor,
            activeCompany: { ...actor.activeCompany, id: companyId },
          }}
          identity={deterministicBrowserIdentity()}
          opportunityId={opportunityId}
          onCompanyContextRejected={vi.fn()}
        />,
      );
      expect(
        await screen.findByRole('button', { name: /32\.32 EUR/u }),
      ).toBeInTheDocument();

      resolveOlder?.(
        Response.json({ message: 'Unavailable' }, { status: 503 }),
      );
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(
        screen.queryByText(
          'Older Pricing Snapshots could not be loaded. Try again.',
        ),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /32\.32 EUR/u }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /31\.31 EUR/u }),
      ).not.toBeInTheDocument();
    },
  );

  it.each([
    { mode: 'when the transport honors abort', honorsAbort: true },
    { mode: 'when the transport returns a late reply', honorsAbort: false },
  ])(
    'ignores an obsolete snapshot detail after the Opportunity changes $mode',
    async ({ honorsAbort }) => {
      const obsolete = {
        ...snapshot(OPPORTUNITY_A),
        calculatedByWorkspaceMembershipId: 'membership-obsolete',
      };
      const current = {
        ...snapshot(
          OPPORTUNITY_B,
          '30000000-0000-4000-8000-000000000002',
          '99.99',
        ),
        calculatedByWorkspaceMembershipId: 'membership-current',
      };
      let resolveObsolete: ((response: Response) => void) | undefined;
      let rejectObsolete: ((reason: DOMException) => void) | undefined;
      const obsoleteDetail = new Promise<Response>((resolve, reject) => {
        resolveObsolete = resolve;
        rejectObsolete = reject;
      });
      stubApi({
        ...baseRoutes(),
        [`GET ${snapshotPath(OPPORTUNITY_A)}`]: () =>
          Response.json({ items: [obsolete] }),
        [`GET ${snapshotPath(OPPORTUNITY_A)}/${obsolete.id}`]: (
          _call,
          init,
        ) => {
          if (honorsAbort)
            init?.signal?.addEventListener(
              'abort',
              () => rejectObsolete?.(new DOMException('Aborted', 'AbortError')),
              { once: true },
            );
          return obsoleteDetail;
        },
        [`GET ${snapshotPath(OPPORTUNITY_B)}`]: () =>
          Response.json({ items: [current] }),
      });

      const rendered = renderPanel();
      fireEvent.click(
        await screen.findByRole('button', { name: /346\.72 EUR/u }),
      );
      expect(
        await screen.findByText('Opening Pricing Snapshot…'),
      ).toBeInTheDocument();

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

      resolveObsolete?.(Response.json(obsolete));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(
        screen.queryByText(/membership-obsolete/u),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Close snapshot' }),
      ).not.toBeInTheDocument();
    },
  );

  it.each([
    {
      invalidActor: 'a missing calculator',
      detail: {
        ...snapshot(),
        calculatedByWorkspaceMembershipId: undefined,
      },
    },
    {
      invalidActor: 'a malformed calculator',
      detail: {
        ...snapshot(),
        calculatedByWorkspaceMembershipId: 42,
      },
    },
  ])(
    'fails safely when a reopened snapshot has $invalidActor',
    async ({ detail }) => {
      const historical = snapshot();
      stubApi({
        ...baseRoutes(),
        [`GET ${snapshotPath(OPPORTUNITY_A)}`]: () =>
          Response.json({ items: [historical] }),
        [`GET ${snapshotPath(OPPORTUNITY_A)}/${historical.id}`]: () =>
          Response.json(detail),
      });

      renderPanel();
      fireEvent.click(
        await screen.findByRole('button', { name: /Reopen snapshot/u }),
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'This Pricing Snapshot could not be opened. Try again.',
      );
      expect(
        screen.queryByText(/Calculated by Workspace Membership/u),
      ).not.toBeInTheDocument();
    },
  );

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
    await enterFirstAdjustment();
    fireEvent.click(screen.getByRole('button', { name: 'Calculate and save' }));
    expect(
      await screen.findByText(/outcome is uncertain/u),
    ).toBeInTheDocument();
    expect(screen.getAllByLabelText('Quantity')[0]).toHaveValue('2.5');
    expect(screen.getAllByLabelText('Quantity')[0]).toBeDisabled();
    expect(screen.getByLabelText('Net reduction')).toHaveValue('8.63');
    expect(screen.getByLabelText('Net reduction')).toBeDisabled();

    const reason = screen.getByRole('textbox', {
      name: 'Adjustment reason',
    });
    expect(reason).toHaveValue('Exact synthetic adjustment reason');
    expect(reason).toBeVisible();
    expect(reason).toBeDisabled();
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
    await enterFirstAdjustment();
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
    expect(screen.getByLabelText('Net reduction')).toHaveValue('8.63');
    expect(screen.getByLabelText('Net reduction')).toBeEnabled();
    const reason = screen.getByRole('textbox', {
      name: 'Adjustment reason',
    });
    expect(reason).toHaveValue('Exact synthetic adjustment reason');
    expect(reason).toBeEnabled();
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
    renderLocalizedPanel();
    await selectWorkedExample();
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Calculate and save' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use fr' }));
    expect(
      screen.getByRole('button', { name: 'Calcul en cours…' }),
    ).toBeDisabled();
    expect(screen.getAllByLabelText('Quantité')[0]).toHaveValue('2.5');
    fireEvent.click(screen.getByRole('button', { name: 'Use en' }));
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    vi.useRealTimers();
    expect(
      await screen.findByText(/outcome is uncertain/u),
    ).toBeInTheDocument();
    const requests = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Use ru' }));
    expect(
      screen.getByText(
        'Результат неизвестен. Повторная попытка отправит те же значения и тот же ключ.',
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByLabelText('Количество')[0]).toHaveValue('2.5');
    expect(screen.getAllByLabelText('Количество')[0]).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(requests);
    fireEvent.click(screen.getByRole('button', { name: 'Use en' }));
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
    {
      failure: 'a network failure',
      response: () => {
        throw new TypeError('network interrupted');
      },
    },
    {
      failure: 'a server failure',
      response: () =>
        Response.json({ message: 'Unavailable' }, { status: 503 }),
    },
    {
      failure: 'a malformed response',
      response: () => Response.json({ items: 'not-a-page' }),
    },
  ])(
    'reports $failure for an older page and retries the same cursor without changing the history',
    async ({ response }) => {
      const current = snapshot(
        OPPORTUNITY_A,
        '30000000-0000-4000-8000-000000000021',
        '21.21',
      );
      const older = snapshot(
        OPPORTUNITY_A,
        '30000000-0000-4000-8000-000000000022',
        '22.22',
      );
      const requestedCursors: string[] = [];
      const fetchMock = stubApi({
        ...baseRoutes(),
        [`GET ${snapshotPath(OPPORTUNITY_A)}`]: (call, _init, url) => {
          const cursor = url.searchParams.get('cursor');
          if (!cursor)
            return Response.json({ items: [current], nextCursor: 'page-two' });
          requestedCursors.push(cursor);
          return call === 2 ? response() : Response.json({ items: [older] });
        },
      });

      renderPanel();
      expect(
        await screen.findByRole('button', { name: /21\.21 EUR/u }),
      ).toBeInTheDocument();
      fireEvent.click(
        screen.getByRole('button', { name: 'Load older snapshots' }),
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Older Pricing Snapshots could not be loaded. Try again.',
      );
      expect(requestedCursors).toEqual(['page-two']);
      expect(
        screen.getByRole('button', { name: /21\.21 EUR/u }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /22\.22 EUR/u }),
      ).not.toBeInTheDocument();

      fireEvent.click(
        screen.getByRole('button', { name: 'Load older snapshots' }),
      );
      expect(
        await screen.findByRole('button', { name: /22\.22 EUR/u }),
      ).toBeInTheDocument();
      expect(requestedCursors).toEqual(['page-two', 'page-two']);
      expect(
        screen.queryByText(
          'Older Pricing Snapshots could not be loaded. Try again.',
        ),
      ).not.toBeInTheDocument();
      expect(
        fetchMock.mock.calls.filter(
          ([input, init]) =>
            key(input, init) === `GET ${snapshotPath(OPPORTUNITY_A)}`,
        ),
      ).toHaveLength(3);
    },
  );

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
      expect(
        screen.queryByText(
          'Older Pricing Snapshots could not be loaded. Try again.',
        ),
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
