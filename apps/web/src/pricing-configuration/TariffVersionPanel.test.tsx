import { changeValue } from '../test/select-option';
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
import { formatApplicationDateTime } from '../presentation/date-time';
import { TariffVersionPanel } from './TariffVersionPanel';

// Every value is synthetic and illustrative: no real unit, price or tax.
const OFFERING_A = '10000000-0000-4000-8000-00000000000a';
const OFFERING_B = '10000000-0000-4000-8000-00000000000b';

const managerPermissions: NonNullable<
  NonNullable<ActorContext['activeCompany']>['pricingConfigurationPermissions']
> = [
  'commercial.offering.read',
  'commercial.pricing.configuration.read',
  'commercial.pricing.configuration.manage',
];

const actor: ActorContext = {
  internalUserId: 'user-1',
  workspaceMembershipId: 'membership-1',
  workspaceId: 'workspace-1',
  workspaceName: 'PRISMA Workspace',
  displayName: 'Iurie',
  email: 'iurie@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: 'company-1',
    displayName: 'PRISMA-PRIM',
    clientPermissions: [],
    pricingConfigurationPermissions: managerPermissions,
  },
};

const secondCompanyActor: ActorContext = {
  ...actor,
  activeCompany: {
    id: 'company-2',
    displayName: 'Second Company',
    clientPermissions: [],
    pricingConfigurationPermissions: managerPermissions,
  },
};

function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

// The browser time zone is process-wide. After each case the host zone is set
// back by name, which every platform honours, before the original environment
// returns: on Windows, unsetting TZ alone keeps the last zone.
const hostTimeZone = browserTimeZone();

function useBrowserTimeZone(zone: string) {
  vi.stubEnv('TZ', zone);
}

function restoreBrowserTimeZone() {
  vi.stubEnv('TZ', hostTimeZone);
  vi.unstubAllEnvs();
}

function offering(id: string, name: string, commercialLabel: string | null) {
  return {
    id,
    companyId: 'company-1',
    serviceDefinitionId: `${id}-definition`,
    serviceDefinition: { code: name.toUpperCase().replace(/ /gu, '-'), name },
    commercialLabel,
    availability: 'AVAILABLE',
    provenance: 'ILLUSTRATIVE',
    provisional: true,
    createdByWorkspaceMembershipId: 'membership-1',
    createdAt: '2026-04-01T08:00:00.000Z',
  };
}

const offeringA = offering(OFFERING_A, 'Illustrative service A', null);
const offeringB = offering(
  OFFERING_B,
  'Illustrative service B',
  'Illustrative label B',
);

function tariffVersion(
  versionNumber: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: chainVersionId(versionNumber),
    offeringId: OFFERING_A,
    versionNumber,
    unit: 'illustrative-unit',
    unitAmount: '123.4500',
    currency: 'EUR',
    taxRatePercent: '12.34',
    taxLabel: 'Illustrative tax',
    effectiveFrom: `2026-0${versionNumber + 4}-01T08:00:00.000Z`,
    effectiveTo: null,
    provenance: 'ILLUSTRATIVE',
    provisional: true,
    state: 'SCHEDULED',
    supersession: null,
    createdByWorkspaceMembershipId: 'membership-1',
    createdAt: '2026-04-01T08:00:00.000Z',
    ...overrides,
  };
}

function chainVersionId(versionNumber: number): string {
  return `00000000-0000-4000-8000-${String(versionNumber).padStart(12, '0')}`;
}

const v2 = tariffVersion(2, { unitAmount: '250.0000', currency: 'USD' });
const v3 = tariffVersion(3, { effectiveTo: '2026-12-01T00:00:00.000Z' });
const v1 = tariffVersion(1, {
  state: 'CURRENT',
  effectiveTo: '2027-01-01T00:00:00.000Z',
  supersession: {
    supersededByVersionId: v2.id,
    supersededAt: '2026-04-02T08:00:00.000Z',
    supersededFrom: v2.effectiveFrom,
  },
});
const v2TakenOver = {
  ...v2,
  supersession: {
    supersededByVersionId: v3.id,
    supersededAt: '2026-04-03T08:00:00.000Z',
    supersededFrom: v3.effectiveFrom,
  },
};

type Responder = (
  call: number,
  init: RequestInit | undefined,
  url: URL,
) => Response | Promise<Response>;

function requestUrl(input: RequestInfo | URL): URL {
  const url = typeof input === 'string' ? input : input.toString();
  return new URL(url, 'http://localhost');
}

function requestKey(input: RequestInfo | URL, init?: RequestInit): string {
  const url = typeof input === 'string' ? input : input.toString();
  return `${init?.method ?? 'GET'} ${url.replace(/\?.*$/u, '')}`;
}

function stubApi(routes: Record<string, Responder>) {
  const calls = new Map<string, number>();
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const key = requestKey(input, init);
    const responder = routes[key];
    if (!responder) throw new Error(`Unexpected request ${key}`);
    const call = (calls.get(key) ?? 0) + 1;
    calls.set(key, call);
    return Promise.resolve(responder(call, init, requestUrl(input)));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const OFFERINGS = 'GET /api/commercial-catalogue/offerings';
const SCOPE = scopeKey(OFFERING_A);
const LIST = listKey(OFFERING_A);
const PUBLISH = publishKey(OFFERING_A);

function scopeKey(offeringId: string) {
  return `GET /api/pricing-configuration/offerings/${offeringId}/tariff-scope`;
}

function listKey(offeringId: string) {
  return `GET /api/pricing-configuration/offerings/${offeringId}/tariff-versions`;
}

function publishKey(offeringId: string) {
  return `POST /api/pricing-configuration/offerings/${offeringId}/tariff-versions`;
}

function offerings(items: unknown[] = [offeringA, offeringB]) {
  return () => Response.json({ items });
}

function scope(
  current: unknown,
  headVersionNumber: number | null,
  offeringId = OFFERING_A,
) {
  return Response.json({
    offeringId,
    current,
    headVersionNumber,
    provisional: true,
  });
}

function page(items: unknown[]) {
  return Response.json({ items, provisional: true });
}

function published(version: unknown, outcome = 'PUBLISHED') {
  return Response.json({ outcome, version }, { status: 201 });
}

// The API's named refusal of a key already recorded for different content.
function idempotencyConflict() {
  return Response.json(
    {
      code: 'IDEMPOTENCY_CONFLICT',
      message: 'Idempotency-Key was already used for another command.',
    },
    { status: 409 },
  );
}

const idempotencyConflictMessage =
  'Nothing was published with that request: its identifier had already been used for a different request. Your draft is kept and can be published again.';

function takeoverInstant(versionNumber: number): string {
  return new Date(Date.UTC(2027, 0, versionNumber, 8)).toISOString();
}

// One offering's chain, newest first as the API lists it. Each version takes
// over from its predecessor a day later; versions from `firstScheduled` on
// have not started yet.
function chain({
  count,
  firstScheduled,
}: {
  count: number;
  firstScheduled: number;
}) {
  return Array.from({ length: count }, (_, index) => {
    const versionNumber = count - index;
    return tariffVersion(versionNumber, {
      effectiveFrom: takeoverInstant(versionNumber),
      state:
        versionNumber >= firstScheduled
          ? 'SCHEDULED'
          : versionNumber === firstScheduled - 1
            ? 'CURRENT'
            : 'SUPERSEDED',
      supersession:
        versionNumber === count
          ? null
          : {
              supersededByVersionId: chainVersionId(versionNumber + 1),
              supersededAt: '2026-04-02T08:00:00.000Z',
              supersededFrom: takeoverInstant(versionNumber + 1),
            },
    });
  });
}

// Serves the list like the API: newest first, at most `limit` versions per
// page, and an opaque cursor naming the last version returned.
function history(versions: ReturnType<typeof chain>): Responder {
  return (_call, _init, url) => {
    const cursor = url.searchParams.get('cursor');
    const olderThan =
      cursor === null
        ? Number.POSITIVE_INFINITY
        : Number(cursor.replace('older-than-', ''));
    const remaining = versions.filter(
      (version) => version.versionNumber < olderThan,
    );
    const limit = Number(url.searchParams.get('limit'));
    const items = remaining.slice(0, limit);
    const last = items.at(-1);
    return Response.json({
      items,
      ...(remaining.length > limit && last
        ? { nextCursor: `older-than-${last.versionNumber}` }
        : {}),
      provisional: true,
    });
  };
}

function versionNames(list: HTMLElement): string[] {
  return within(list)
    .getAllByRole('listitem')
    .map((item) => within(item).getByText(/^Version \d+$/u).textContent);
}

function versionSequence(from: number, to: number): string[] {
  const step = from <= to ? 1 : -1;
  return Array.from(
    { length: Math.abs(to - from) + 1 },
    (_, index) => `Version ${from + index * step}`,
  );
}

function requestsTo(fetchMock: ReturnType<typeof stubApi>, key: string) {
  return fetchMock.mock.calls
    .filter(([input, init]) => requestKey(input, init) === key)
    .map(([input, init]) => ({
      body: typeof init?.body === 'string' ? parseJson(init.body) : undefined,
      key: new Headers(init?.headers).get('idempotency-key'),
      company: new Headers(init?.headers).get('x-company-context-id'),
      cursor: requestUrl(input).searchParams.get('cursor'),
    }));
}

function parseJson(text: string): unknown {
  return JSON.parse(text);
}

function renderPanel(props: { actor?: ActorContext } = {}) {
  return render(
    <TariffVersionPanel
      actor={props.actor ?? actor}
      identity={deterministicBrowserIdentity()}
      onCompanyContextRejected={vi.fn()}
    />,
  );
}

async function chooseOffering(offeringId = OFFERING_A) {
  changeValue(
    await screen.findByLabelText('Company Service Offering'),
    offeringId,
  );
}

type DraftInput = {
  unit?: string;
  unitAmount?: string;
  currency?: string;
  taxRatePercent?: string;
  taxLabel?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
};

const validDraft = {
  unit: 'illustrative-unit',
  unitAmount: '12.5',
  currency: 'EUR',
  taxRatePercent: '20',
  taxLabel: 'Illustrative tax',
  effectiveFrom: '2026-07-01T00:00',
};

function fillDraft(draft: DraftInput) {
  const fields: Array<[keyof DraftInput, () => HTMLElement]> = [
    ['unit', () => screen.getByLabelText('Unit')],
    ['unitAmount', () => screen.getByLabelText('Unit amount')],
    ['currency', () => screen.getByLabelText('Currency')],
    ['taxRatePercent', () => screen.getByLabelText('Tax rate percent')],
    ['taxLabel', () => screen.getByLabelText('Tax label')],
    ['effectiveFrom', effectiveFromField],
    ['effectiveTo', effectiveToField],
  ];
  for (const [name, field] of fields) {
    const value = draft[name];
    if (value !== undefined) changeValue(field(), value);
  }
}

function effectiveFromField() {
  return screen.getByLabelText(`Effective from (${browserTimeZone()})`);
}

function effectiveToField() {
  return screen.getByLabelText(
    `Effective until, optional (${browserTimeZone()})`,
  );
}

function publishButton() {
  return screen.getByRole('button', { name: 'Publish Tariff Version' });
}

function retryButton() {
  return screen.getByRole('button', { name: 'Retry Tariff publication' });
}

function reloadButton() {
  return screen.getByRole('button', { name: 'Reload Tariff Versions' });
}

// Submits the draft without its button, as a keyboard submission could.
function submitDraft() {
  const form = screen.getByLabelText('Unit').closest('form');
  if (!form) throw new Error('The publication form is missing.');
  fireEvent.submit(form);
}

function expectedBody(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    unit: 'illustrative-unit',
    unitAmount: '12.5',
    currency: 'EUR',
    taxRatePercent: '20',
    taxLabel: 'Illustrative tax',
    effectiveFrom: new Date('2026-07-01T00:00').toISOString(),
    expectedActiveVersionNumber: 1,
    ...overrides,
  };
}

describe('TariffVersionPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    restoreBrowserTimeZone();
  });

  it('lists the Company offerings and shows the chosen offering current version, scheduled successors, head and verbatim amounts with their markers', async () => {
    stubApi({
      [OFFERINGS]: offerings(),
      [SCOPE]: () => scope(v1, 3),
      [LIST]: () => page([v3, v2TakenOver, v1]),
    });
    renderPanel();
    expect(
      screen.getByText('Loading Company Service Offerings…'),
    ).toBeInTheDocument();
    const select = await screen.findByLabelText('Company Service Offering');
    fireEvent.click(select);
    expect(
      screen.getAllByRole('option').map((option) => option.textContent),
    ).toEqual([
      'Choose an offering',
      'Illustrative service A (ILLUSTRATIVE-SERVICE-A)',
      'Illustrative service B (ILLUSTRATIVE-SERVICE-B) — Illustrative label B',
    ]);
    fireEvent.click(select);
    expect(
      screen.getByText(/^Choose an offering to see and publish/u),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Illustrative tariffs: provisional records'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        `Instants are entered and shown in your browser time zone: ${browserTimeZone()}.`,
      ),
    ).toBeInTheDocument();

    await chooseOffering();
    const current = await screen.findByRole('region', {
      name: 'Current Tariff Version',
    });
    expect(within(current).getByText('Version 1')).toBeInTheDocument();
    expect(
      within(current).getByText('123.4500 EUR per illustrative-unit'),
    ).toBeInTheDocument();
    expect(current).toHaveTextContent(
      'Tax 12.34% (Illustrative tax), no fiscal validity',
    );
    expect(within(current).getByText('Illustrative')).toBeInTheDocument();
    expect(within(current).getByText('Provisional')).toBeInTheDocument();
    expect(
      within(current).getByText(formatApplicationDateTime(v1.effectiveFrom)),
    ).toHaveAttribute('datetime', v1.effectiveFrom);
    expect(
      within(current).getByText(
        'Head: version 3. A new publication follows this version.',
      ),
    ).toBeInTheDocument();

    const scheduled = screen.getByRole('list', {
      name: 'Scheduled Tariff successors',
    });
    const successors = within(scheduled).getAllByRole('listitem');
    expect(versionNames(scheduled)).toEqual(['Version 2', 'Version 3']);
    // Another currency of the closed set is shown as declared, never
    // converted or combined.
    expect(successors[0]).toHaveTextContent(
      '250.0000 USD per illustrative-unit',
    );
    expect(successors[0]).toHaveTextContent('Takes over from');
    expect(successors[0]).toHaveTextContent('Provisional');

    const versions = screen.getByRole('list', { name: 'Tariff Versions' });
    expect(
      within(versions)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      expect.stringMatching(/Version 3.*Scheduled.*Head.*123\.4500 EUR/su),
      expect.stringMatching(
        /Version 2.*Scheduled.*250\.0000 USD.*Taken over from/su,
      ),
      expect.stringMatching(
        /Version 1.*Current.*123\.4500 EUR.*Taken over from/su,
      ),
    ]);
    for (const item of within(versions).getAllByRole('listitem'))
      expect(item).toHaveTextContent(
        /no fiscal validity.*Illustrative.*Provisional/su,
      );
  });

  it('states when the Company has no offering, and when an offering has no version', async () => {
    stubApi({ [OFFERINGS]: offerings([]) });
    const view = renderPanel();
    expect(
      await screen.findByText(
        'No Company Service Offering is recorded for this Company yet. Tariff Versions are published per offering.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Company Service Offering'),
    ).not.toBeInTheDocument();
    view.unmount();

    stubApi({
      [OFFERINGS]: offerings(),
      [SCOPE]: () => scope(null, null),
      [LIST]: () => page([]),
    });
    renderPanel();
    await chooseOffering();
    expect(
      await screen.findByText(
        'No current version: no Tariff Version of this offering is current at this instant.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'No Tariff Version has been published for this offering yet.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('No Tariff Version has been published yet.'),
    ).toBeInTheDocument();
    expect(screen.getByText('No successor is scheduled.')).toBeInTheDocument();
    expect(
      screen.getByText('The new version will be the first for this offering.'),
    ).toBeInTheDocument();
  });

  it('publishes the exact entered values against the displayed offering head with an idempotency key, then reloads', async () => {
    const created = tariffVersion(2, {
      unitAmount: '12.5000',
      taxRatePercent: '20.00',
    });
    const fetchMock = stubApi({
      [OFFERINGS]: offerings(),
      [SCOPE]: (call) => (call === 1 ? scope(null, 1) : scope(null, 2)),
      [LIST]: (call) =>
        call === 1
          ? page([tariffVersion(1)])
          : page([created, tariffVersion(1)]),
      [PUBLISH]: () => published(created),
    });
    renderPanel();
    await chooseOffering();
    expect(
      await screen.findByText(
        'The new version will follow head version 1 of this offering.',
      ),
    ).toBeInTheDocument();
    // Amounts and rates are text, never number inputs; the currency is a
    // closed choice.
    for (const label of ['Unit amount', 'Tax rate percent'])
      expect(screen.getByLabelText(label)).toHaveAttribute('type', 'text');
    const currency = screen.getByLabelText('Currency');
    fireEvent.click(currency);
    expect(
      screen.getAllByRole('option').map((option) => option.textContent),
    ).toEqual(['Choose a currency', 'MDL', 'EUR', 'RON', 'USD']);
    fireEvent.click(currency);
    fillDraft({
      ...validDraft,
      unit: '  unit  ',
      taxLabel: 'Taxe ✓ 税',
      effectiveTo: '2026-12-31T18:00:15',
    });
    fireEvent.click(publishButton());

    expect(
      await screen.findByText('Tariff Version 2 published.'),
    ).toBeInTheDocument();
    expect(requestsTo(fetchMock, PUBLISH)).toEqual([
      {
        body: expectedBody({
          unit: '  unit  ',
          taxLabel: 'Taxe ✓ 税',
          effectiveTo: new Date('2026-12-31T18:00:15').toISOString(),
        }),
        key: expect.stringMatching(/^[0-9a-f-]{36}$/u),
        company: 'company-1',
        cursor: null,
      },
    ]);
    await waitFor(() => expect(requestsTo(fetchMock, SCOPE)).toHaveLength(2));
    expect(
      await screen.findByText(
        'The new version will follow head version 2 of this offering.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Unit amount')).toHaveValue('');
    expect(screen.getByLabelText('Currency')).toHaveValue('');
  });

  it('refuses each value outside its grammar before sending, keeping every entered value, and shows a named server refusal on its field', async () => {
    const fetchMock = stubApi({
      [OFFERINGS]: offerings(),
      [SCOPE]: () => scope(null, 1),
      [LIST]: () => page([tariffVersion(1)]),
      [PUBLISH]: () =>
        Response.json(
          {
            code: 'VALIDATION_ERROR',
            field: 'taxLabel',
            message: 'Remove the null character from the tax label.',
          },
          { status: 400 },
        ),
    });
    renderPanel();
    await chooseOffering();
    await screen.findByText(
      'The new version will follow head version 1 of this offering.',
    );
    const refusals: Array<[DraftInput, RegExp]> = [
      [{ unit: '   ' }, /^Enter a unit of 1 to 24 characters\.$/u],
      [{ unit: 'x'.repeat(25) }, /^Enter a unit of 1 to 24 characters\.$/u],
      ...[
        '00',
        '01',
        '00.50',
        '0',
        '0.0000',
        '1e2',
        ' 1',
        '1,5',
        '+1',
        '12.34567',
      ].map((unitAmount): [DraftInput, RegExp] => [
        { unitAmount },
        /^Enter a unit amount greater than zero/u,
      ]),
      [{ currency: '' }, /^Choose a currency/u],
      ...['100.01', '00', '01', '1e2', ' 5', '12.345'].map(
        (taxRatePercent): [DraftInput, RegExp] => [
          { taxRatePercent },
          /^Enter a tax rate from 0 to 100/u,
        ],
      ),
      [{ taxLabel: '' }, /^Enter a tax label of 1 to 60 characters\.$/u],
      [
        { taxLabel: 'x'.repeat(61) },
        /^Enter a tax label of 1 to 60 characters\.$/u,
      ],
      [{ effectiveFrom: '' }, /^Enter a start/u],
      [
        { effectiveTo: validDraft.effectiveFrom },
        /^Enter a start, and an optional end later than the start\.$/u,
      ],
    ];
    for (const [invalid, message] of refusals) {
      fillDraft({ ...validDraft, effectiveTo: '', ...invalid });
      fireEvent.click(publishButton());
      expect(screen.getByRole('alert')).toHaveTextContent(message);
      for (const [label, value] of Object.entries({
        'Unit amount': invalid.unitAmount ?? validDraft.unitAmount,
        'Tax rate percent': invalid.taxRatePercent ?? validDraft.taxRatePercent,
      }))
        expect(screen.getByLabelText(label)).toHaveValue(value);
    }
    expect(requestsTo(fetchMock, PUBLISH)).toEqual([]);

    // The zero rate and the upper bounds are valid.
    fillDraft({
      ...validDraft,
      unitAmount: '9999999.9999',
      taxRatePercent: '0',
      effectiveTo: '',
    });
    fireEvent.click(publishButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter a tax label of 1 to 60 characters.',
    );
    expect(requestsTo(fetchMock, PUBLISH).map(({ body }) => body)).toEqual([
      expectedBody({ unitAmount: '9999999.9999', taxRatePercent: '0' }),
    ]);
    expect(screen.getByLabelText('Unit amount')).toHaveValue('9999999.9999');
    expect(screen.getByLabelText('Tax label')).toHaveValue('Illustrative tax');
    expect(publishButton()).toBeEnabled();
  });

  it('refuses a start or an end that a spring clock change skips, and one an autumn change repeats, naming the field and zone and sending nothing', async () => {
    useBrowserTimeZone('Europe/Bucharest');
    const fetchMock = stubApi({
      [OFFERINGS]: offerings(),
      [SCOPE]: () => scope(null, null),
      [LIST]: () => page([]),
      [PUBLISH]: () => published(tariffVersion(1)),
    });
    renderPanel();
    await chooseOffering();
    await screen.findByText(
      'The new version will be the first for this offering.',
    );

    // On 28 March 2027 the Bucharest clocks move from 03:00 straight to
    // 04:00; on 31 October 2027 they go back from 04:00 to 03:00.
    for (const [draft, message] of [
      [
        { effectiveFrom: '2027-03-28T03:30' },
        'The start does not exist in Europe/Bucharest: a clock change skips that time. Choose a time outside the change.',
      ],
      [
        {
          effectiveFrom: '2027-03-28T02:59:59',
          effectiveTo: '2027-03-28T03:00',
        },
        'The end does not exist in Europe/Bucharest: a clock change skips that time. Choose a time outside the change.',
      ],
      [
        { effectiveFrom: '2027-10-31T03:59:59', effectiveTo: '' },
        'The start is ambiguous in Europe/Bucharest: a clock change repeats that time. Choose a time outside the change.',
      ],
      [
        {
          effectiveFrom: '2027-10-31T02:59:59',
          effectiveTo: '2027-10-31T03:30',
        },
        'The end is ambiguous in Europe/Bucharest: a clock change repeats that time. Choose a time outside the change.',
      ],
    ] as const) {
      fillDraft({ ...validDraft, ...draft });
      fireEvent.click(publishButton());
      expect(screen.getByRole('alert')).toHaveTextContent(message);
      // The kept reading, as the browser spells it back.
      expect(effectiveFromField()).toHaveProperty(
        'value',
        expect.stringContaining(draft.effectiveFrom),
      );
      expect(screen.getByLabelText('Unit amount')).toHaveValue('12.5');
    }
    expect(effectiveToField()).toHaveValue('2027-10-31T03:30');
    expect(requestsTo(fetchMock, PUBLISH)).toEqual([]);

    // The unique readings either side of the change are published.
    fillDraft({ effectiveTo: '2027-10-31T04:00' });
    fireEvent.click(publishButton());
    expect(
      await screen.findByText('Tariff Version 1 published.'),
    ).toBeInTheDocument();
    expect(requestsTo(fetchMock, PUBLISH).map(({ body }) => body)).toEqual([
      expectedBody({
        effectiveFrom: '2027-10-30T23:59:59.000Z',
        effectiveTo: '2027-10-31T02:00:00.000Z',
        expectedActiveVersionNumber: null,
      }),
    ]);
  });

  it('names the offering head on a stale conflict and reloads only when asked, keeping the draft', async () => {
    const fetchMock = stubApi({
      [OFFERINGS]: offerings(),
      [SCOPE]: (call) => (call === 1 ? scope(null, 1) : scope(null, 2)),
      [LIST]: (call) =>
        call === 1
          ? page([tariffVersion(1)])
          : page([tariffVersion(2), tariffVersion(1)]),
      [PUBLISH]: (call) =>
        call === 1
          ? Response.json(
              {
                code: 'STALE_ACTIVE_VERSION',
                message: 'Another Tariff Version is now the head.',
                headVersionNumber: 2,
              },
              { status: 409 },
            )
          : published(tariffVersion(3)),
    });
    renderPanel();
    await chooseOffering();
    await screen.findByText(
      'The new version will follow head version 1 of this offering.',
    );
    fillDraft(validDraft);
    fireEvent.click(publishButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The offering changed: version 2 is now the head. Reload before publishing again.',
    );
    expect(requestsTo(fetchMock, SCOPE)).toHaveLength(1);
    expect(screen.getByLabelText('Unit amount')).toHaveValue('12.5');
    fireEvent.click(reloadButton());
    expect(
      await screen.findByText(
        'The new version will follow head version 2 of this offering.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Unit amount')).toHaveValue('12.5');

    fireEvent.click(publishButton());
    await screen.findByText('Tariff Version 3 published.');
    const publications = requestsTo(fetchMock, PUBLISH);
    expect(publications.map(({ body }) => body)).toEqual([
      expectedBody(),
      expectedBody({ expectedActiveVersionNumber: 2 }),
    ]);
    expect(publications[0]?.key).not.toBe(publications[1]?.key);
  });

  it('keeps the offering, payload, expected head and key for an explicit retry after an uncertain outcome', async () => {
    // A network failure, a timeout, a gateway failure, the API's safe server
    // error, an unnamed refusal and a conflict the interface does not
    // recognize each leave the committed outcome unknown.
    const uncertainAnswers = [
      () => Promise.reject(new TypeError('network')),
      () =>
        Promise.reject(
          new DOMException('The operation timed out.', 'TimeoutError'),
        ),
      () => new Response('gateway', { status: 502 }),
      () =>
        Response.json(
          { statusCode: 500, message: 'Internal server error' },
          { status: 500 },
        ),
      () => Response.json({ code: 'UNRECOGNIZED_CONFLICT' }, { status: 409 }),
      () =>
        Response.json(
          { statusCode: 404, message: 'Not Found' },
          { status: 404 },
        ),
    ];
    const fetchMock = stubApi({
      [OFFERINGS]: offerings(),
      [SCOPE]: (call) => (call === 1 ? scope(null, 1) : scope(null, 2)),
      [LIST]: (call) =>
        call === 1
          ? page([tariffVersion(1)])
          : page([tariffVersion(2), tariffVersion(1)]),
      [PUBLISH]: (call) =>
        uncertainAnswers[call - 1]?.() ??
        published(tariffVersion(2), 'UNCHANGED'),
    });
    async function expectUncertain(attempt: number) {
      await waitFor(() =>
        expect(requestsTo(fetchMock, PUBLISH)).toHaveLength(attempt),
      );
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'The publication outcome is uncertain.',
      );
      // Neither success nor a no-change outcome is shown, and the draft stays.
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Unit amount')).toHaveValue('12.5');
      expect(publishButton()).toBeDisabled();
    }
    renderPanel();
    await chooseOffering();
    await screen.findByText(
      'The new version will follow head version 1 of this offering.',
    );
    fillDraft(validDraft);
    fireEvent.click(publishButton());
    await expectUncertain(1);
    // Reloading shows a newer head, yet the retry still carries the original
    // expectation and key so a committed first attempt is replayed.
    fireEvent.click(reloadButton());
    await screen.findByText(
      'The new version will follow head version 2 of this offering.',
    );
    for (let attempt = 2; attempt <= uncertainAnswers.length; attempt += 1) {
      fireEvent.click(retryButton());
      await expectUncertain(attempt);
    }
    fireEvent.click(retryButton());
    expect(
      await screen.findByText(
        'Tariff Version 2 already has this content. Nothing changed.',
      ),
    ).toBeInTheDocument();
    const attempts = requestsTo(fetchMock, PUBLISH);
    expect(attempts).toHaveLength(uncertainAnswers.length + 1);
    expect(new Set(attempts.map(({ key }) => key)).size).toBe(1);
    expect(attempts.map(({ body }) => body)).toEqual(
      attempts.map(() => expectedBody()),
    );
    expect(
      screen.queryByRole('button', { name: 'Retry Tariff publication' }),
    ).not.toBeInTheDocument();
  });

  it('holds an uncertain publication through an edited or invalid draft, a direct submission and a reload, then resolves it only with a definite idempotency conflict', async () => {
    const fetchMock = stubApi({
      [OFFERINGS]: offerings(),
      [SCOPE]: (call) => (call === 1 ? scope(null, 1) : scope(null, 2)),
      [LIST]: (call) =>
        call === 1
          ? page([tariffVersion(1)])
          : page([tariffVersion(2), tariffVersion(1)]),
      [PUBLISH]: (call) => {
        if (call === 1) return Promise.reject(new TypeError('network'));
        // The named conflict commits nothing, so repeating the same key could
        // only repeat it: the retry is answered, not left uncertain.
        if (call === 2) return idempotencyConflict();
        return published(tariffVersion(3));
      },
    });
    function expectHeldUncertain() {
      expect(requestsTo(fetchMock, PUBLISH)).toHaveLength(1);
      expect(screen.getByRole('alert')).toHaveTextContent(
        'The publication outcome is uncertain.',
      );
      expect(retryButton()).toBeEnabled();
      expect(publishButton()).toBeDisabled();
    }
    renderPanel();
    await chooseOffering();
    await screen.findByText(
      'The new version will follow head version 1 of this offering.',
    );
    fillDraft(validDraft);
    fireEvent.click(publishButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The publication outcome is uncertain.',
    );
    expectHeldUncertain();

    // No other publication replaces the unresolved one, whether the draft is
    // edited into new content or made invalid, and even when submitted.
    fillDraft({ unitAmount: '99', effectiveFrom: '2026-08-01T00:00' });
    fireEvent.click(publishButton());
    submitDraft();
    expectHeldUncertain();
    fillDraft({ unitAmount: '00' });
    submitDraft();
    expectHeldUncertain();
    expect(screen.getByLabelText('Unit amount')).toHaveValue('00');

    fireEvent.click(reloadButton());
    await screen.findByText(
      'The new version will follow head version 2 of this offering.',
    );
    expectHeldUncertain();

    fireEvent.click(retryButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      idempotencyConflictMessage,
    );
    expect(
      screen.queryByText(/^The publication outcome is uncertain\./u),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry Tariff publication' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Unit amount')).toHaveValue('00');
    expect(publishButton()).toBeEnabled();

    fillDraft({ unitAmount: '99' });
    fireEvent.click(publishButton());
    expect(
      await screen.findByText('Tariff Version 3 published.'),
    ).toBeInTheDocument();
    const attempts = requestsTo(fetchMock, PUBLISH);
    expect(attempts.map(({ body }) => body)).toEqual([
      expectedBody(),
      expectedBody(),
      expectedBody({
        unitAmount: '99',
        effectiveFrom: new Date('2026-08-01T00:00').toISOString(),
        expectedActiveVersionNumber: 2,
      }),
    ]);
    expect(attempts[1]?.key).toBe(attempts[0]?.key);
    expect(attempts[2]?.key).not.toBe(attempts[0]?.key);
  });

  it('resolves an uncertain publication with a named refusal of its field, keeping the draft, after which a new publication gets its own key', async () => {
    const fetchMock = stubApi({
      [OFFERINGS]: offerings(),
      [SCOPE]: () => scope(null, 1),
      [LIST]: () => page([tariffVersion(1)]),
      [PUBLISH]: (call) => {
        if (call === 1) return new Response('gateway', { status: 502 });
        // The first attempt did not commit, so the exact retry is decided
        // afresh and meets the back-dating rule.
        if (call === 2)
          return Response.json(
            {
              code: 'EFFECTIVE_FROM_PAST',
              field: 'effectiveFrom',
              message: 'Choose a start that is not earlier than now.',
            },
            { status: 400 },
          );
        return published(tariffVersion(2));
      },
    });
    renderPanel();
    await chooseOffering();
    await screen.findByText(
      'The new version will follow head version 1 of this offering.',
    );
    fillDraft(validDraft);
    fireEvent.click(publishButton());
    await screen.findByRole('button', { name: 'Retry Tariff publication' });

    fireEvent.click(retryButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Choose a start that is not earlier than now.',
    );
    expect(
      screen.queryByRole('button', { name: 'Retry Tariff publication' }),
    ).not.toBeInTheDocument();
    expect(effectiveFromField()).toHaveValue(validDraft.effectiveFrom);
    expect(publishButton()).toBeEnabled();

    fillDraft({ effectiveFrom: '2026-09-01T00:00' });
    fireEvent.click(publishButton());
    expect(
      await screen.findByText('Tariff Version 2 published.'),
    ).toBeInTheDocument();
    const attempts = requestsTo(fetchMock, PUBLISH);
    expect(attempts).toHaveLength(3);
    expect(attempts[1]).toEqual(attempts[0]);
    expect(attempts[2]?.key).not.toBe(attempts[0]?.key);
    expect(attempts[2]?.body).toEqual(
      expectedBody({
        effectiveFrom: new Date('2026-09-01T00:00').toISOString(),
      }),
    );
  });

  it('drops the draft, the key and an uncertain publication when another offering is chosen, and ignores the late reply', async () => {
    let resolveHeld: (response: Response) => void = () => undefined;
    const held = new Promise<Response>((resolve) => {
      resolveHeld = resolve;
    });
    const fetchMock = stubApi({
      [OFFERINGS]: offerings(),
      [SCOPE]: () => scope(null, null),
      [LIST]: () => page([]),
      [scopeKey(OFFERING_B)]: () => scope(null, null, OFFERING_B),
      [listKey(OFFERING_B)]: () => page([]),
      [PUBLISH]: (call) =>
        call === 1 ? Promise.reject(new TypeError('network')) : held,
      [publishKey(OFFERING_B)]: () =>
        published(tariffVersion(1, { offeringId: OFFERING_B })),
    });
    renderPanel();
    await chooseOffering();
    await screen.findByText(
      'The new version will be the first for this offering.',
    );
    fillDraft(validDraft);
    fireEvent.click(publishButton());
    await screen.findByRole('button', { name: 'Retry Tariff publication' });

    await chooseOffering(OFFERING_B);
    await waitFor(() => expect(publishButton()).toBeEnabled());
    expect(
      screen.queryByRole('button', { name: 'Retry Tariff publication' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/^The publication outcome is uncertain\./u),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Unit amount')).toHaveValue('');

    // A publication in flight for the first offering answers after the
    // switch: its reply is ignored.
    await chooseOffering(OFFERING_A);
    await screen.findByText(
      'The new version will be the first for this offering.',
    );
    fillDraft(validDraft);
    fireEvent.click(publishButton());
    await waitFor(() => expect(requestsTo(fetchMock, PUBLISH)).toHaveLength(2));
    await chooseOffering(OFFERING_B);
    await act(async () => {
      resolveHeld(published(tariffVersion(1)));
      await held;
    });
    expect(
      screen.queryByText('Tariff Version 1 published.'),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(publishButton()).toBeEnabled());

    fillDraft({ ...validDraft, currency: 'RON' });
    fireEvent.click(publishButton());
    await screen.findByText('Tariff Version 1 published.');
    const first = requestsTo(fetchMock, PUBLISH);
    const second = requestsTo(fetchMock, publishKey(OFFERING_B));
    expect(second).toHaveLength(1);
    expect(second[0]?.body).toEqual(
      expectedBody({ currency: 'RON', expectedActiveVersionNumber: null }),
    );
    expect(first.map(({ key }) => key)).not.toContain(second[0]?.key);
  });

  it('drops the offering, the draft and an uncertain publication when the Company changes, and ignores late replies', async () => {
    let resolveHeld: (response: Response) => void = () => undefined;
    const held = new Promise<Response>((resolve) => {
      resolveHeld = resolve;
    });
    const fetchMock = stubApi({
      [OFFERINGS]: offerings(),
      [SCOPE]: () => scope(null, null),
      [LIST]: () => page([]),
      [PUBLISH]: () => held,
    });
    const view = renderPanel();
    await chooseOffering();
    await screen.findByText(
      'The new version will be the first for this offering.',
    );
    fillDraft(validDraft);
    fireEvent.click(publishButton());
    await waitFor(() => expect(requestsTo(fetchMock, PUBLISH)).toHaveLength(1));

    view.rerender(
      <TariffVersionPanel
        actor={secondCompanyActor}
        identity={deterministicBrowserIdentity()}
        onCompanyContextRejected={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(requestsTo(fetchMock, OFFERINGS).at(-1)?.company).toBe(
        'company-2',
      ),
    );
    expect(
      await screen.findByLabelText('Company Service Offering'),
    ).toHaveValue('');
    expect(screen.queryByLabelText('Unit')).not.toBeInTheDocument();
    await act(async () => {
      resolveHeld(published(tariffVersion(1)));
      await held;
    });
    expect(
      screen.queryByText('Tariff Version 1 published.'),
    ).not.toBeInTheDocument();
    await chooseOffering();
    expect(await screen.findByLabelText('Unit')).toHaveValue('');
    await waitFor(() => expect(publishButton()).toBeEnabled());
  });

  it('shows the panel read-only to an actor whose configuration permissions carry no manage', async () => {
    stubApi({
      [OFFERINGS]: offerings(),
      [SCOPE]: () => scope(v1, 1),
      [LIST]: () => page([v1]),
    });
    renderPanel({
      actor: {
        ...actor,
        activeCompany: {
          id: 'company-1',
          displayName: 'PRISMA-PRIM',
          clientPermissions: [],
          pricingConfigurationPermissions: [
            'commercial.offering.read',
            'commercial.pricing.configuration.read',
          ],
        },
      },
    });
    await chooseOffering();
    expect(
      await screen.findByRole('list', { name: 'Tariff Versions' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Publish Tariff Version' }),
    ).not.toBeInTheDocument();
    for (const label of ['Unit', 'Unit amount', 'Currency', 'Tax rate percent'])
      expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
  });

  it('shows one denied state and clears the screen when access is refused', async () => {
    stubApi({
      [OFFERINGS]: offerings(),
      [SCOPE]: () => new Response(null, { status: 403 }),
      [LIST]: () => page([v1]),
      'GET /api/access/current-actor': () =>
        new Response(null, { status: 403 }),
    });
    renderPanel();
    await chooseOffering();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You do not have permission to access Tariff Versions.',
    );
    expect(
      screen.queryByLabelText('Company Service Offering'),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Unit')).not.toBeInTheDocument();
    expect(screen.queryByText(/123\.4500/u)).not.toBeInTheDocument();
  });

  it('lists every scheduled successor in takeover order across pages while the history keeps its first page', async () => {
    const fetchMock = stubApi({
      [OFFERINGS]: offerings(),
      [SCOPE]: () => scope(null, 27),
      [LIST]: history(chain({ count: 27, firstScheduled: 1 })),
    });
    renderPanel();
    await chooseOffering();
    const scheduled = await screen.findByRole('list', {
      name: 'Scheduled Tariff successors',
    });
    expect(versionNames(scheduled)).toEqual(versionSequence(1, 27));
    const current = screen.getByRole('region', {
      name: 'Current Tariff Version',
    });
    expect(current).toHaveTextContent(
      'No current version: no Tariff Version of this offering is current at this instant.',
    );
    expect(current).toHaveTextContent(
      'Head: version 27. A new publication follows this version.',
    );
    const versions = screen.getByRole('list', { name: 'Tariff Versions' });
    expect(versionNames(versions)).toEqual(versionSequence(27, 3));
    expect(requestsTo(fetchMock, LIST).map(({ cursor }) => cursor)).toEqual([
      null,
      'older-than-3',
    ]);
    fireEvent.click(
      screen.getByRole('button', { name: 'Show older Tariff Versions' }),
    );
    await waitFor(() =>
      expect(
        versionNames(screen.getByRole('list', { name: 'Tariff Versions' })),
      ).toEqual(versionSequence(27, 1)),
    );
  });

  it('never shows reads either side of a publication, rereads keeping the draft, and settles in a reloadable state after its bounded passes, keeping an uncertain publication', async () => {
    let releaseScope: () => void = () => undefined;
    const heldScope = new Promise<void>((resolve) => {
      releaseScope = resolve;
    });
    const v1TakenOverByV2 = tariffVersion(1, {
      supersession: {
        supersededByVersionId: v2.id,
        supersededAt: '2026-04-02T08:00:00.000Z',
        supersededFrom: v2.effectiveFrom,
      },
    });
    // The reload's scope read precedes another member's publication of
    // version 2 and its history read follows it; the next pass is held.
    const fetchMock = stubApi({
      [OFFERINGS]: offerings(),
      [SCOPE]: async (call) => {
        if (call <= 2) return scope(null, 1);
        if (call === 3) {
          await heldScope;
          return scope(null, 2);
        }
        // From the second reload on, every pass straddles a publication.
        return scope(null, call);
      },
      [LIST]: (call) =>
        call === 1
          ? page([tariffVersion(1)])
          : call <= 3
            ? page([v2, v1TakenOverByV2])
            : page(chain({ count: call + 1, firstScheduled: 1 })),
      [PUBLISH]: (call) =>
        call === 1
          ? Promise.reject(new TypeError('network'))
          : published(tariffVersion(2), 'UNCHANGED'),
    });
    renderPanel();
    await chooseOffering();
    await screen.findByText(
      'The new version will follow head version 1 of this offering.',
    );
    fillDraft(validDraft);

    fireEvent.click(reloadButton());
    await waitFor(() => expect(requestsTo(fetchMock, SCOPE)).toHaveLength(3));
    expect(requestsTo(fetchMock, LIST)).toHaveLength(2);
    expect(
      screen.getByText('Loading the current Tariff Version…'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Head: version/u)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('list', { name: 'Tariff Versions' }),
    ).not.toBeInTheDocument();
    expect(publishButton()).toBeDisabled();
    await act(async () => {
      releaseScope();
      await heldScope;
    });
    expect(
      await screen.findByText(
        'The new version will follow head version 2 of this offering.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Unit amount')).toHaveValue('12.5');
    fireEvent.click(publishButton());
    await screen.findByRole('button', { name: 'Retry Tariff publication' });

    fireEvent.click(reloadButton());
    expect(
      await screen.findByText(
        'Tariff Versions kept changing while loading. Reload to see the latest versions.',
      ),
    ).toHaveAttribute('role', 'alert');
    expect(requestsTo(fetchMock, SCOPE)).toHaveLength(6);
    expect(screen.queryByText(/^Head: version/u)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('list', { name: 'Scheduled Tariff successors' }),
    ).not.toBeInTheDocument();
    expect(publishButton()).toBeDisabled();
    expect(screen.getByLabelText('Unit amount')).toHaveValue('12.5');
    expect(reloadButton()).toBeEnabled();
    // The unresolved publication survives the view state and its retry
    // resends it unchanged.
    expect(
      screen.getByText(/^The publication outcome is uncertain\./u),
    ).toBeInTheDocument();
    fireEvent.click(retryButton());
    expect(
      await screen.findByText(
        'Tariff Version 2 already has this content. Nothing changed.',
      ),
    ).toBeInTheDocument();
    const attempts = requestsTo(fetchMock, PUBLISH);
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
    expect(attempts[0]?.body).toEqual(
      expectedBody({ expectedActiveVersionNumber: 2 }),
    );
  });

  it('refuses a reply that names another offering as a failed read', async () => {
    stubApi({
      [OFFERINGS]: offerings(),
      [SCOPE]: () => scope(null, 1, OFFERING_B),
      [LIST]: () => page([tariffVersion(1)]),
    });
    renderPanel();
    await chooseOffering();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Tariff Versions could not be loaded. Please try again.',
    );
    expect(screen.queryByText(/^Head: version/u)).not.toBeInTheDocument();
  });
});
