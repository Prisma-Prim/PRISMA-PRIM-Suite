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
import { formatApplicationDateTime } from '../presentation/date-time';
import { PricingConfigurationWorkspace } from './PricingConfigurationWorkspace';

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
    pricingConfigurationPermissions: [
      'commercial.offering.read',
      'commercial.pricing.configuration.read',
      'commercial.pricing.configuration.manage',
    ],
  },
};

const secondCompanyActor: ActorContext = {
  ...actor,
  activeCompany: {
    id: 'company-2',
    displayName: 'Second Company',
    clientPermissions: [],
    pricingConfigurationPermissions: [
      'commercial.offering.read',
      'commercial.pricing.configuration.read',
      'commercial.pricing.configuration.manage',
    ],
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

function ruleVersion(
  versionNumber: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: `00000000-0000-4000-8000-00000000000${versionNumber}`,
    versionNumber,
    label: `Illustrative rule ${versionNumber}`,
    effectiveFrom: `2026-0${versionNumber + 4}-01T08:00:00.000Z`,
    effectiveTo: null,
    ruleShape: 'UNIT_PRICE_TIMES_QUANTITY',
    roundingMode: 'HALF_UP',
    roundingScale: 2,
    taxApplication: 'PER_LINE',
    provenance: 'ILLUSTRATIVE',
    provisional: true,
    state: 'SCHEDULED',
    supersession: null,
    createdByWorkspaceMembershipId: 'membership-1',
    createdAt: '2026-04-01T08:00:00.000Z',
    ...overrides,
  };
}

const v2 = ruleVersion(2);
const v3 = ruleVersion(3, { effectiveTo: '2026-12-01T00:00:00.000Z' });
const v1 = ruleVersion(1, {
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

const SCOPE = 'GET /api/pricing-configuration/rule-scope';
const LIST = 'GET /api/pricing-configuration/rule-versions';
const PUBLISH = 'POST /api/pricing-configuration/rule-versions';

function scope(current: unknown, headVersionNumber: number | null) {
  return Response.json({ current, headVersionNumber, provisional: true });
}

function page(items: unknown[]) {
  return Response.json({ items, provisional: true });
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

function chainVersionId(versionNumber: number): string {
  return `00000000-0000-4000-8000-${String(versionNumber).padStart(12, '0')}`;
}

// One Company's chain, newest first as the API lists it. Each version takes
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
    return ruleVersion(versionNumber, {
      id: chainVersionId(versionNumber),
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

function listCursors(fetchMock: ReturnType<typeof stubApi>) {
  return fetchMock.mock.calls
    .filter(([input, init]) => requestKey(input, init) === LIST)
    .map(([input]) => requestUrl(input).searchParams.get('cursor'));
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

function scheduledList() {
  return screen.getByRole('list', { name: 'Scheduled successors' });
}

function historyList() {
  return screen.getByRole('list', { name: 'Pricing Rule Versions' });
}

function requestsTo(fetchMock: ReturnType<typeof stubApi>, key: string) {
  return fetchMock.mock.calls
    .filter(([input, init]) => requestKey(input, init) === key)
    .map(([, init]) => ({
      body: typeof init?.body === 'string' ? parseJson(init.body) : undefined,
      key: new Headers(init?.headers).get('idempotency-key'),
      company: new Headers(init?.headers).get('x-company-context-id'),
    }));
}

function parseJson(text: string): unknown {
  return JSON.parse(text);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function renderWorkspace(props: { actor?: ActorContext } = {}) {
  return render(
    <PricingConfigurationWorkspace
      actor={props.actor ?? actor}
      identity={deterministicBrowserIdentity()}
      onCompanyContextRejected={vi.fn()}
    />,
  );
}

function fillDraft(draft: {
  label?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
}) {
  if (draft.label !== undefined)
    fireEvent.change(screen.getByLabelText('Label'), {
      target: { value: draft.label },
    });
  if (draft.effectiveFrom !== undefined)
    fireEvent.change(effectiveFromField(), {
      target: { value: draft.effectiveFrom },
    });
  if (draft.effectiveTo !== undefined)
    fireEvent.change(effectiveToField(), {
      target: { value: draft.effectiveTo },
    });
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
  return screen.getByRole('button', { name: 'Publish version' });
}

function retryButton() {
  return screen.getByRole('button', { name: 'Retry publication' });
}

// Submits the draft without its button, as a keyboard submission could.
function submitDraft() {
  const form = screen.getByLabelText('Label').closest('form');
  if (!form) throw new Error('The publication form is missing.');
  fireEvent.submit(form);
}

describe('PricingConfigurationWorkspace', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    restoreBrowserTimeZone();
  });

  it('shows the current version and its window, the scheduled successors in takeover order, the head and the permanent marker', async () => {
    stubApi({
      [SCOPE]: () => scope(v1, 3),
      [LIST]: () => page([v3, v2TakenOver, v1]),
    });
    renderWorkspace();
    expect(
      screen.getByText('Loading the current Pricing Rule Version…'),
    ).toBeInTheDocument();

    const current = await screen.findByRole('region', {
      name: 'Current Pricing Rule Version',
    });
    expect(within(current).getByText('Version 1')).toBeInTheDocument();
    expect(
      within(current).getByText('Illustrative rule 1'),
    ).toBeInTheDocument();
    expect(
      within(current).getByText(formatApplicationDateTime(v1.effectiveFrom)),
    ).toHaveAttribute('datetime', v1.effectiveFrom);
    expect(
      within(current).getByText(
        formatApplicationDateTime('2027-01-01T00:00:00.000Z'),
      ),
    ).toBeInTheDocument();
    expect(within(current).getByText('Illustrative')).toBeInTheDocument();
    expect(
      within(current).getByText(
        'Head: version 3. A new publication follows this version.',
      ),
    ).toBeInTheDocument();

    const scheduled = screen.getByRole('list', {
      name: 'Scheduled successors',
    });
    const successors = within(scheduled).getAllByRole('listitem');
    expect(successors.map((item) => item.textContent)).toEqual([
      expect.stringContaining('Version 2'),
      expect.stringContaining('Version 3'),
    ]);
    expect(
      within(successors[0] ?? scheduled).getByText(
        formatApplicationDateTime(v2.effectiveFrom),
      ),
    ).toBeInTheDocument();
    expect(successors[0]).toHaveTextContent('Takes over from');

    const versions = screen.getByRole('list', {
      name: 'Pricing Rule Versions',
    });
    const items = within(versions).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringMatching(/Version 3.*Scheduled.*Head/su),
      expect.stringMatching(/Version 2.*Scheduled.*Taken over from/su),
      expect.stringMatching(/Version 1.*Current.*Taken over from/su),
    ]);
    expect(
      screen.getByText('Illustrative configuration: provisional records'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        `Instants are entered and shown in your browser time zone: ${browserTimeZone()}.`,
      ),
    ).toBeInTheDocument();
  });

  it('states explicitly that no version is current and none has been published', async () => {
    stubApi({ [SCOPE]: () => scope(null, null), [LIST]: () => page([]) });
    renderWorkspace();

    expect(
      await screen.findByText(
        'No current version: no Pricing Rule Version is current at this instant.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'No Pricing Rule Version has been published for this Company yet.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('No successor is scheduled.')).toBeInTheDocument();
    expect(
      screen.getByText('The new version will be the first for this Company.'),
    ).toBeInTheDocument();
  });

  it('publishes explicit instants against the displayed head with an idempotency key, then reloads', async () => {
    const published = ruleVersion(2, {
      label: 'Illustrative rule B',
      effectiveFrom: new Date('2026-06-01T09:30').toISOString(),
      effectiveTo: new Date('2026-12-31T18:00:15').toISOString(),
    });
    const fetchMock = stubApi({
      [SCOPE]: (call) => (call === 1 ? scope(null, 1) : scope(null, 2)),
      [LIST]: (call) =>
        call === 1 ? page([ruleVersion(1)]) : page([published, ruleVersion(1)]),
      [PUBLISH]: () =>
        Response.json(
          { outcome: 'PUBLISHED', version: published },
          { status: 201 },
        ),
    });
    renderWorkspace();
    expect(
      await screen.findByText('The new version will follow head version 1.'),
    ).toBeInTheDocument();
    fillDraft({
      label: 'Illustrative rule B',
      effectiveFrom: '2026-06-01T09:30',
      effectiveTo: '2026-12-31T18:00:15',
    });
    fireEvent.click(publishButton());

    expect(await screen.findByText('Version 2 published.')).toBeInTheDocument();
    expect(requestsTo(fetchMock, PUBLISH)).toEqual([
      {
        body: {
          label: 'Illustrative rule B',
          effectiveFrom: new Date('2026-06-01T09:30').toISOString(),
          effectiveTo: new Date('2026-12-31T18:00:15').toISOString(),
          expectedActiveVersionNumber: 1,
        },
        key: expect.stringMatching(/^[0-9a-f-]{36}$/u),
        company: 'company-1',
      },
    ]);
    await waitFor(() => expect(requestsTo(fetchMock, SCOPE)).toHaveLength(2));
    expect(
      await screen.findByText('The new version will follow head version 2.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Label')).toHaveValue('');
  });

  it('keeps entered values after client and server validation and sends nothing invalid', async () => {
    const fetchMock = stubApi({
      [SCOPE]: () => scope(null, null),
      [LIST]: () => page([]),
      [PUBLISH]: () =>
        Response.json(
          {
            code: 'EFFECTIVE_FROM_PAST',
            field: 'effectiveFrom',
            message: 'Choose a start that is not earlier than now.',
          },
          { status: 400 },
        ),
    });
    renderWorkspace();
    await screen.findByText(
      'The new version will be the first for this Company.',
    );
    fillDraft({
      label: '   ',
      effectiveFrom: '2026-06-01T09:30',
      effectiveTo: '2026-06-01T09:30',
    });
    fireEvent.click(publishButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter a label of 1 to 120 characters, a start, and an optional end later than the start.',
    );
    fillDraft({ label: '😀'.repeat(121), effectiveTo: '' });
    fireEvent.click(publishButton());
    expect(requestsTo(fetchMock, PUBLISH)).toEqual([]);

    fillDraft({ label: '😀'.repeat(120) });
    fireEvent.click(publishButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Choose a start that is not earlier than now.',
    );
    expect(requestsTo(fetchMock, PUBLISH)).toHaveLength(1);
    expect(screen.getByLabelText('Label')).toHaveValue('😀'.repeat(120));
    expect(effectiveFromField()).toHaveValue('2026-06-01T09:30');
  });

  it('refuses a start or an end that a spring clock change skips in the browser time zone, keeping the draft and publishing nothing', async () => {
    useBrowserTimeZone('Europe/Bucharest');
    const fetchMock = stubApi({
      [SCOPE]: () => scope(null, null),
      [LIST]: () => page([]),
      [PUBLISH]: () =>
        Response.json(
          { outcome: 'PUBLISHED', version: ruleVersion(1) },
          { status: 201 },
        ),
    });
    renderWorkspace();
    await screen.findByText(
      'The new version will be the first for this Company.',
    );

    // On 28 March 2027 the Bucharest clocks move from 03:00 straight to
    // 04:00, so no instant reads 03:00 to 03:59:59 there.
    for (const effectiveFrom of [
      '2027-03-28T03:00',
      '2027-03-28T03:59:59',
      '2027-03-28T03:30',
    ]) {
      fillDraft({ label: 'Spring rule', effectiveFrom });
      fireEvent.click(publishButton());
      expect(screen.getByRole('alert')).toHaveTextContent(
        'The start does not exist in Europe/Bucharest: a clock change skips that time. Choose a time outside the change.',
      );
    }
    expect(screen.getByLabelText('Label')).toHaveValue('Spring rule');
    expect(effectiveFromField()).toHaveValue('2027-03-28T03:30');

    fillDraft({
      effectiveFrom: '2027-03-28T02:59:59',
      effectiveTo: '2027-03-28T03:00',
    });
    fireEvent.click(publishButton());
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The end does not exist in Europe/Bucharest: a clock change skips that time. Choose a time outside the change.',
    );
    expect(effectiveToField()).toHaveValue('2027-03-28T03:00');
    expect(requestsTo(fetchMock, PUBLISH)).toEqual([]);

    // The readings either side of the change are unique, one second apart,
    // and the kept label and start are published with the corrected end.
    fillDraft({ effectiveTo: '2027-03-28T04:00' });
    fireEvent.click(publishButton());
    expect(await screen.findByText('Version 1 published.')).toBeInTheDocument();
    expect(requestsTo(fetchMock, PUBLISH).map(({ body }) => body)).toEqual([
      {
        label: 'Spring rule',
        effectiveFrom: '2027-03-28T00:59:59.000Z',
        effectiveTo: '2027-03-28T01:00:00.000Z',
        expectedActiveVersionNumber: null,
      },
    ]);
  });

  it('refuses a start or an end that an autumn clock change repeats in the browser time zone, without choosing either occurrence', async () => {
    useBrowserTimeZone('Europe/Bucharest');
    const fetchMock = stubApi({
      [SCOPE]: () => scope(null, null),
      [LIST]: () => page([]),
      [PUBLISH]: () =>
        Response.json(
          { outcome: 'PUBLISHED', version: ruleVersion(1) },
          { status: 201 },
        ),
    });
    renderWorkspace();
    await screen.findByText(
      'The new version will be the first for this Company.',
    );

    // On 31 October 2027 the Bucharest clocks go back from 04:00 to 03:00,
    // so each reading from 03:00 to 03:59:59 names two instants there.
    for (const effectiveFrom of [
      '2027-10-31T03:00',
      '2027-10-31T03:59:59',
      '2027-10-31T03:30',
    ]) {
      fillDraft({ label: 'Autumn rule', effectiveFrom });
      fireEvent.click(publishButton());
      expect(screen.getByRole('alert')).toHaveTextContent(
        'The start is ambiguous in Europe/Bucharest: a clock change repeats that time. Choose a time outside the change.',
      );
    }
    expect(screen.getByLabelText('Label')).toHaveValue('Autumn rule');
    expect(effectiveFromField()).toHaveValue('2027-10-31T03:30');

    fillDraft({
      effectiveFrom: '2027-10-31T02:59:59',
      effectiveTo: '2027-10-31T03:30',
    });
    fireEvent.click(publishButton());
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The end is ambiguous in Europe/Bucharest: a clock change repeats that time. Choose a time outside the change.',
    );
    expect(effectiveToField()).toHaveValue('2027-10-31T03:30');
    expect(requestsTo(fetchMock, PUBLISH)).toEqual([]);

    // The readings either side of the change are unique, and the kept label
    // and start are published with the corrected end.
    fillDraft({ effectiveTo: '2027-10-31T04:00' });
    fireEvent.click(publishButton());
    expect(await screen.findByText('Version 1 published.')).toBeInTheDocument();
    expect(requestsTo(fetchMock, PUBLISH).map(({ body }) => body)).toEqual([
      {
        label: 'Autumn rule',
        effectiveFrom: '2027-10-30T23:59:59.000Z',
        effectiveTo: '2027-10-31T02:00:00.000Z',
        expectedActiveVersionNumber: null,
      },
    ]);
  });

  it('publishes the same readings unchanged when the browser time zone is UTC', async () => {
    useBrowserTimeZone('UTC');
    const fetchMock = stubApi({
      [SCOPE]: () => scope(null, null),
      [LIST]: () => page([]),
      [PUBLISH]: () =>
        Response.json(
          { outcome: 'PUBLISHED', version: ruleVersion(1) },
          { status: 201 },
        ),
    });
    renderWorkspace();
    await screen.findByText(
      'The new version will be the first for this Company.',
    );
    expect(
      screen.getByText(
        'Instants are entered and shown in your browser time zone: UTC.',
      ),
    ).toBeInTheDocument();

    fillDraft({
      label: 'UTC rule',
      effectiveFrom: '2027-03-28T03:30',
      effectiveTo: '2027-10-31T03:30',
    });
    fireEvent.click(publishButton());
    expect(await screen.findByText('Version 1 published.')).toBeInTheDocument();
    expect(requestsTo(fetchMock, PUBLISH).map(({ body }) => body)).toEqual([
      {
        label: 'UTC rule',
        effectiveFrom: '2027-03-28T03:30:00.000Z',
        effectiveTo: '2027-10-31T03:30:00.000Z',
        expectedActiveVersionNumber: null,
      },
    ]);
  });

  it('names the new head on a stale conflict and reloads only when asked, keeping the draft', async () => {
    const fetchMock = stubApi({
      [SCOPE]: (call) => (call === 1 ? scope(null, 1) : scope(null, 2)),
      [LIST]: (call) =>
        call === 1
          ? page([ruleVersion(1)])
          : page([ruleVersion(2), ruleVersion(1)]),
      [PUBLISH]: (call) =>
        call === 1
          ? Response.json(
              {
                code: 'STALE_ACTIVE_VERSION',
                message: 'Another Pricing Rule Version is now the head.',
                headVersionNumber: 2,
              },
              { status: 409 },
            )
          : Response.json(
              { outcome: 'PUBLISHED', version: ruleVersion(3) },
              { status: 201 },
            ),
    });
    renderWorkspace();
    await screen.findByText('The new version will follow head version 1.');
    fillDraft({ label: 'Second tab rule', effectiveFrom: '2026-07-01T00:00' });
    fireEvent.click(publishButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The configuration changed: version 2 is now the head. Reload before publishing again.',
    );
    expect(requestsTo(fetchMock, SCOPE)).toHaveLength(1);
    expect(screen.getByLabelText('Label')).toHaveValue('Second tab rule');
    fireEvent.click(
      screen.getByRole('button', { name: 'Reload Pricing Rule Versions' }),
    );
    expect(
      await screen.findByText('The new version will follow head version 2.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Label')).toHaveValue('Second tab rule');

    fireEvent.click(publishButton());
    await screen.findByText('Version 3 published.');
    const publications = requestsTo(fetchMock, PUBLISH);
    expect(
      publications.map(({ body }) =>
        isRecord(body) ? body.expectedActiveVersionNumber : undefined,
      ),
    ).toEqual([1, 2]);
    expect(publications[0]?.key).not.toBe(publications[1]?.key);
  });

  it('keeps the payload, expected head and key for an explicit retry after an uncertain outcome', async () => {
    // A network failure, a timeout, a gateway failure, the API's safe server
    // error and a conflict the interface does not recognize each leave the
    // committed outcome unknown.
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
    ];
    const fetchMock = stubApi({
      [SCOPE]: (call) => (call === 1 ? scope(null, 1) : scope(null, 2)),
      [LIST]: (call) =>
        call === 1
          ? page([ruleVersion(1)])
          : page([ruleVersion(2), ruleVersion(1)]),
      [PUBLISH]: (call) =>
        uncertainAnswers[call - 1]?.() ??
        Response.json(
          { outcome: 'UNCHANGED', version: ruleVersion(2) },
          { status: 201 },
        ),
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
      expect(screen.getByLabelText('Label')).toHaveValue('Uncertain rule');
    }
    renderWorkspace();
    await screen.findByText('The new version will follow head version 1.');
    fillDraft({ label: 'Uncertain rule', effectiveFrom: '2026-07-01T00:00' });
    fireEvent.click(publishButton());
    await expectUncertain(1);
    // Reloading shows a newer head, yet the retry still carries the original
    // expectation and key so a committed first attempt is replayed.
    fireEvent.click(
      screen.getByRole('button', { name: 'Reload Pricing Rule Versions' }),
    );
    await screen.findByText('The new version will follow head version 2.');
    for (let attempt = 2; attempt <= uncertainAnswers.length; attempt += 1) {
      fireEvent.click(
        screen.getByRole('button', { name: 'Retry publication' }),
      );
      await expectUncertain(attempt);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Retry publication' }));
    expect(
      await screen.findByText(
        'Version 2 already has this content. Nothing changed.',
      ),
    ).toBeInTheDocument();
    const attempts = requestsTo(fetchMock, PUBLISH);
    expect(attempts).toHaveLength(uncertainAnswers.length + 1);
    expect(new Set(attempts.map(({ key }) => key)).size).toBe(1);
    expect(attempts.map(({ body }) => body)).toEqual(
      attempts.map(() => ({
        label: 'Uncertain rule',
        effectiveFrom: new Date('2026-07-01T00:00').toISOString(),
        expectedActiveVersionNumber: 1,
      })),
    );
    expect(
      screen.queryByRole('button', { name: 'Retry publication' }),
    ).not.toBeInTheDocument();
  });

  it('holds an uncertain publication for its explicit retry: an edited or invalid draft and a reload neither replace nor hide it', async () => {
    const fetchMock = stubApi({
      [SCOPE]: (call) => (call === 1 ? scope(null, 1) : scope(null, 2)),
      [LIST]: (call) =>
        call === 1
          ? page([ruleVersion(1)])
          : page([ruleVersion(2), ruleVersion(1)]),
      [PUBLISH]: (call) =>
        call === 1
          ? Promise.reject(new TypeError('network'))
          : Response.json(
              { outcome: 'PUBLISHED', version: ruleVersion(2) },
              { status: 201 },
            ),
    });
    function expectHeldUncertain() {
      expect(requestsTo(fetchMock, PUBLISH)).toHaveLength(1);
      expect(screen.getByRole('alert')).toHaveTextContent(
        'The publication outcome is uncertain.',
      );
      expect(retryButton()).toBeEnabled();
      expect(publishButton()).toBeDisabled();
    }
    renderWorkspace();
    await screen.findByText('The new version will follow head version 1.');
    fillDraft({ label: 'Uncertain rule', effectiveFrom: '2026-07-01T00:00' });
    fireEvent.click(publishButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The publication outcome is uncertain.',
    );
    expectHeldUncertain();

    // No other publication replaces the unresolved one, whether the draft is
    // edited into new content or made invalid, and even when submitted.
    fillDraft({ label: 'Edited rule', effectiveFrom: '2026-08-01T00:00' });
    fireEvent.click(publishButton());
    submitDraft();
    expectHeldUncertain();
    fillDraft({ label: '   ' });
    submitDraft();
    expectHeldUncertain();
    expect(screen.getByLabelText('Label')).toHaveValue('   ');

    fireEvent.click(
      screen.getByRole('button', { name: 'Reload Pricing Rule Versions' }),
    );
    await screen.findByText('The new version will follow head version 2.');
    expectHeldUncertain();

    fireEvent.click(retryButton());
    expect(await screen.findByText('Version 2 published.')).toBeInTheDocument();
    const attempts = requestsTo(fetchMock, PUBLISH);
    expect(attempts).toHaveLength(2);
    expect(attempts[0]?.body).toEqual({
      label: 'Uncertain rule',
      effectiveFrom: new Date('2026-07-01T00:00').toISOString(),
      expectedActiveVersionNumber: 1,
    });
    expect(attempts[1]).toEqual(attempts[0]);
    expect(
      screen.queryByRole('button', { name: 'Retry publication' }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(publishButton()).toBeEnabled());
  });

  it('resolves an uncertain publication only with a definite answer, after which a new publication gets its own key', async () => {
    const fetchMock = stubApi({
      [SCOPE]: (call) => (call === 1 ? scope(null, 1) : scope(null, 2)),
      [LIST]: (call) =>
        call === 1
          ? page([ruleVersion(1)])
          : page([ruleVersion(2), ruleVersion(1)]),
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
        return Response.json(
          { outcome: 'PUBLISHED', version: ruleVersion(2) },
          { status: 201 },
        );
      },
    });
    renderWorkspace();
    await screen.findByText('The new version will follow head version 1.');
    fillDraft({ label: 'Late rule', effectiveFrom: '2026-07-01T00:00' });
    fireEvent.click(publishButton());
    await screen.findByRole('button', { name: 'Retry publication' });

    fireEvent.click(retryButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Choose a start that is not earlier than now.',
    );
    expect(
      screen.queryByText(/^The publication outcome is uncertain\./u),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry publication' }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Label')).toHaveValue('Late rule');
    expect(publishButton()).toBeEnabled();

    fillDraft({ effectiveFrom: '2026-09-01T00:00' });
    fireEvent.click(publishButton());
    expect(await screen.findByText('Version 2 published.')).toBeInTheDocument();
    const attempts = requestsTo(fetchMock, PUBLISH);
    expect(attempts.map(({ body }) => body)).toEqual([
      {
        label: 'Late rule',
        effectiveFrom: new Date('2026-07-01T00:00').toISOString(),
        expectedActiveVersionNumber: 1,
      },
      {
        label: 'Late rule',
        effectiveFrom: new Date('2026-07-01T00:00').toISOString(),
        expectedActiveVersionNumber: 1,
      },
      {
        label: 'Late rule',
        effectiveFrom: new Date('2026-09-01T00:00').toISOString(),
        expectedActiveVersionNumber: 1,
      },
    ]);
    expect(attempts[1]?.key).toBe(attempts[0]?.key);
    expect(attempts[2]?.key).not.toBe(attempts[0]?.key);
  });

  it('resolves an uncertain publication answered by an idempotency conflict as definite, keeping the draft, after which a new publication gets its own key', async () => {
    const fetchMock = stubApi({
      [SCOPE]: (call) => (call === 1 ? scope(null, 1) : scope(null, 2)),
      [LIST]: (call) =>
        call === 1
          ? page([ruleVersion(1)])
          : page([ruleVersion(2), ruleVersion(1)]),
      [PUBLISH]: (call) => {
        if (call === 1) return Promise.reject(new TypeError('network'));
        // The named conflict commits nothing, so repeating the same key could
        // only repeat it: the retry is answered, not left uncertain.
        if (call === 2) return idempotencyConflict();
        return Response.json(
          { outcome: 'PUBLISHED', version: ruleVersion(2) },
          { status: 201 },
        );
      },
    });
    renderWorkspace();
    await screen.findByText('The new version will follow head version 1.');
    fillDraft({ label: 'Conflicted rule', effectiveFrom: '2026-07-01T00:00' });
    fireEvent.click(publishButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The publication outcome is uncertain.',
    );
    expect(publishButton()).toBeDisabled();

    fireEvent.click(retryButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      idempotencyConflictMessage,
    );
    expect(
      screen.queryByText(/^The publication outcome is uncertain\./u),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry publication' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Label')).toHaveValue('Conflicted rule');
    expect(effectiveFromField()).toHaveValue('2026-07-01T00:00');
    expect(publishButton()).toBeEnabled();

    fireEvent.click(publishButton());
    expect(await screen.findByText('Version 2 published.')).toBeInTheDocument();
    const attempts = requestsTo(fetchMock, PUBLISH);
    expect(attempts).toHaveLength(3);
    expect(attempts.map(({ body }) => body)).toEqual(
      attempts.map(() => ({
        label: 'Conflicted rule',
        effectiveFrom: new Date('2026-07-01T00:00').toISOString(),
        expectedActiveVersionNumber: 1,
      })),
    );
    expect(attempts[1]?.key).toBe(attempts[0]?.key);
    expect(attempts[2]?.key).not.toBe(attempts[0]?.key);
  });

  it('answers a first publication refused by an idempotency conflict without entering the uncertain state', async () => {
    const fetchMock = stubApi({
      [SCOPE]: (call) => (call === 1 ? scope(null, null) : scope(null, 1)),
      [LIST]: (call) => (call === 1 ? page([]) : page([ruleVersion(1)])),
      [PUBLISH]: (call) =>
        call === 1
          ? idempotencyConflict()
          : Response.json(
              { outcome: 'PUBLISHED', version: ruleVersion(1) },
              { status: 201 },
            ),
    });
    renderWorkspace();
    await screen.findByText(
      'The new version will be the first for this Company.',
    );
    fillDraft({ label: 'Conflicted rule', effectiveFrom: '2026-07-01T00:00' });
    fireEvent.click(publishButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      idempotencyConflictMessage,
    );
    expect(
      screen.queryByText(/^The publication outcome is uncertain\./u),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry publication' }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Label')).toHaveValue('Conflicted rule');
    expect(publishButton()).toBeEnabled();

    fireEvent.click(publishButton());
    expect(await screen.findByText('Version 1 published.')).toBeInTheDocument();
    const attempts = requestsTo(fetchMock, PUBLISH);
    expect(attempts).toHaveLength(2);
    expect(attempts[1]?.body).toEqual(attempts[0]?.body);
    expect(attempts[1]?.key).not.toBe(attempts[0]?.key);
  });

  it('forgets an uncertain publication when the Company changes', async () => {
    const fetchMock = stubApi({
      [SCOPE]: () => scope(null, null),
      [LIST]: () => page([]),
      [PUBLISH]: (call) =>
        call === 1
          ? Promise.reject(new TypeError('network'))
          : Response.json(
              { outcome: 'PUBLISHED', version: ruleVersion(1) },
              { status: 201 },
            ),
    });
    const view = renderWorkspace();
    await screen.findByText(
      'The new version will be the first for this Company.',
    );
    fillDraft({
      label: 'Draft for the first Company',
      effectiveFrom: '2026-07-01T00:00',
    });
    fireEvent.click(publishButton());
    await screen.findByRole('button', { name: 'Retry publication' });

    view.rerender(
      <PricingConfigurationWorkspace
        actor={secondCompanyActor}
        identity={deterministicBrowserIdentity()}
        onCompanyContextRejected={vi.fn()}
      />,
    );
    await waitFor(() => expect(publishButton()).toBeEnabled());
    expect(
      screen.queryByRole('button', { name: 'Retry publication' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/^The publication outcome is uncertain\./u),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Label')).toHaveValue('');

    fillDraft({
      label: 'Draft for the second Company',
      effectiveFrom: '2026-07-01T00:00',
    });
    fireEvent.click(publishButton());
    await screen.findByText('Version 1 published.');
    const attempts = requestsTo(fetchMock, PUBLISH);
    expect(attempts.map(({ company }) => company)).toEqual([
      'company-1',
      'company-2',
    ]);
    expect(attempts[1]?.key).not.toBe(attempts[0]?.key);
  });

  it('offers publication only with the configuration manage permission', async () => {
    stubApi({ [SCOPE]: () => scope(v1, 1), [LIST]: () => page([v1]) });
    renderWorkspace({
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
    expect(
      await screen.findByRole('list', { name: 'Pricing Rule Versions' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Publish version' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Label')).not.toBeInTheDocument();
  });

  it('shows one denied state and clears the screen when access is refused', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(null, { status: 403 }))),
    );
    renderWorkspace();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You do not have permission to access Pricing Configuration.',
    );
    expect(screen.queryByLabelText('Label')).not.toBeInTheDocument();
    expect(screen.queryByText('Illustrative rule 1')).not.toBeInTheDocument();
  });

  it('clears the draft and ignores late replies after the Company changes', async () => {
    let resolveFirst: (response: Response) => void = () => undefined;
    const held = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const fetchMock = stubApi({
      [SCOPE]: (call) => (call === 1 ? scope(null, null) : scope(null, null)),
      [LIST]: (call) => (call === 1 ? page([]) : page([])),
      [PUBLISH]: () => held,
    });
    const view = renderWorkspace();
    await screen.findByText(
      'The new version will be the first for this Company.',
    );
    fillDraft({
      label: 'Draft for the first Company',
      effectiveFrom: '2026-07-01T00:00',
    });
    fireEvent.click(publishButton());
    await waitFor(() => expect(requestsTo(fetchMock, PUBLISH)).toHaveLength(1));

    view.rerender(
      <PricingConfigurationWorkspace
        actor={secondCompanyActor}
        identity={deterministicBrowserIdentity()}
        onCompanyContextRejected={vi.fn()}
      />,
    );
    await waitFor(() => expect(requestsTo(fetchMock, SCOPE)).toHaveLength(2));
    expect(requestsTo(fetchMock, SCOPE).at(-1)?.company).toBe('company-2');
    await screen.findByText(
      'The new version will be the first for this Company.',
    );
    expect(screen.getByLabelText('Label')).toHaveValue('');
    await act(async () => {
      resolveFirst(
        Response.json(
          { outcome: 'PUBLISHED', version: ruleVersion(1) },
          { status: 201 },
        ),
      );
      await held;
    });
    expect(screen.queryByText('Version 1 published.')).not.toBeInTheDocument();
    expect(publishButton()).toBeEnabled();
  });

  it('lists every scheduled successor in takeover order when they span several pages, while the history keeps its first page', async () => {
    stubApi({
      [SCOPE]: () => scope(null, 27),
      [LIST]: history(chain({ count: 27, firstScheduled: 1 })),
    });
    renderWorkspace();

    const scheduled = await screen.findByRole('list', {
      name: 'Scheduled successors',
    });
    expect(versionNames(scheduled)).toEqual(versionSequence(1, 27));
    const [earliest] = within(scheduled).getAllByRole('listitem');
    expect(
      within(earliest ?? scheduled).getByText(
        formatApplicationDateTime(takeoverInstant(1)),
      ),
    ).toHaveAttribute('datetime', takeoverInstant(1));
    expect(earliest).toHaveTextContent('Takes over from');

    const current = screen.getByRole('region', {
      name: 'Current Pricing Rule Version',
    });
    expect(
      within(current).getByText(
        'No current version: no Pricing Rule Version is current at this instant.',
      ),
    ).toBeInTheDocument();
    expect(
      within(current).getByText(
        'Head: version 27. A new publication follows this version.',
      ),
    ).toBeInTheDocument();
    expect(versionNames(historyList())).toEqual(versionSequence(27, 3));
    expect(
      screen.getByRole('button', { name: 'Show older versions' }),
    ).toBeInTheDocument();
  });

  it('stops collecting successors at the first version already in effect and keeps paging the history on request', async () => {
    const versions = chain({ count: 60, firstScheduled: 34 });
    const fetchMock = stubApi({
      [SCOPE]: () =>
        scope(
          versions.find((version) => version.state === 'CURRENT'),
          60,
        ),
      [LIST]: history(versions),
    });
    renderWorkspace();

    const scheduled = await screen.findByRole('list', {
      name: 'Scheduled successors',
    });
    expect(versionNames(scheduled)).toEqual(versionSequence(34, 60));
    const current = screen.getByRole('region', {
      name: 'Current Pricing Rule Version',
    });
    expect(within(current).getByText('Version 33')).toBeInTheDocument();
    expect(
      within(current).getByText(
        'Head: version 60. A new publication follows this version.',
      ),
    ).toBeInTheDocument();
    // The second page already reaches the version in effect, so no older
    // page is read until the history asks for it.
    expect(listCursors(fetchMock)).toEqual([null, 'older-than-36']);

    expect(versionNames(historyList())).toEqual(versionSequence(60, 36));
    fireEvent.click(
      screen.getByRole('button', { name: 'Show older versions' }),
    );
    await waitFor(() =>
      expect(versionNames(historyList())).toEqual(versionSequence(60, 11)),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Show older versions' }),
    );
    await waitFor(() =>
      expect(versionNames(historyList())).toEqual(versionSequence(60, 1)),
    );
    expect(
      screen.queryByRole('button', { name: 'Show older versions' }),
    ).not.toBeInTheDocument();
    expect(versionNames(scheduledList())).toEqual(versionSequence(34, 60));
  });

  it('never presents a partial schedule when a page of successors fails or does not advance, and completes it on reload', async () => {
    const versions = chain({ count: 27, firstScheduled: 1 });
    const served = history(versions);
    const fetchMock = stubApi({
      [SCOPE]: () => scope(null, 27),
      [LIST]: (call, init, url) =>
        call === 2
          ? new Response(null, { status: 500 })
          : call === 4
            ? Response.json({
                items: versions.slice(0, 25),
                nextCursor: 'older-than-3',
                provisional: true,
              })
            : served(call, init, url),
    });
    renderWorkspace();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Pricing Rule Versions could not be loaded. Please try again.',
    );
    expect(
      screen.queryByRole('list', { name: 'Scheduled successors' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('No successor is scheduled.'),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Reload Pricing Rule Versions' }),
    );
    await waitFor(() => expect(listCursors(fetchMock)).toHaveLength(4));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Pricing Rule Versions could not be loaded. Please try again.',
    );
    expect(
      screen.queryByRole('list', { name: 'Scheduled successors' }),
    ).not.toBeInTheDocument();
    expect(listCursors(fetchMock)).toHaveLength(4);

    fireEvent.click(
      screen.getByRole('button', { name: 'Reload Pricing Rule Versions' }),
    );
    expect(
      versionNames(
        await screen.findByRole('list', { name: 'Scheduled successors' }),
      ),
    ).toEqual(versionSequence(1, 27));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the denied state when a later page of successors is refused', async () => {
    const served = history(chain({ count: 27, firstScheduled: 1 }));
    stubApi({
      [SCOPE]: () => scope(null, 27),
      [LIST]: (call, init, url) =>
        call === 1
          ? served(call, init, url)
          : new Response(null, { status: 403 }),
      'GET /api/access/current-actor': () =>
        new Response(null, { status: 403 }),
    });
    renderWorkspace();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You do not have permission to access Pricing Configuration.',
    );
    expect(
      screen.queryByRole('list', { name: 'Scheduled successors' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Version 1')).not.toBeInTheDocument();
  });

  it('ignores a late page of successors after the Company changes', async () => {
    let releaseFirstCompany: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      releaseFirstCompany = resolve;
    });
    const firstCompany = history(chain({ count: 27, firstScheduled: 1 }));
    const fetchMock = stubApi({
      [SCOPE]: (call) => (call === 1 ? scope(null, 27) : scope(null, null)),
      [LIST]: async (call, init, url) => {
        if (call === 1) return firstCompany(call, init, url);
        if (call === 2) {
          await held;
          return firstCompany(call, init, url);
        }
        return page([]);
      },
    });
    const view = renderWorkspace();
    await waitFor(() =>
      expect(listCursors(fetchMock)).toEqual([null, 'older-than-3']),
    );
    expect(
      screen.getByText('Loading the current Pricing Rule Version…'),
    ).toBeInTheDocument();

    view.rerender(
      <PricingConfigurationWorkspace
        actor={secondCompanyActor}
        identity={deterministicBrowserIdentity()}
        onCompanyContextRejected={vi.fn()}
      />,
    );
    expect(
      await screen.findByText('No successor is scheduled.'),
    ).toBeInTheDocument();
    await act(async () => {
      releaseFirstCompany();
      await held;
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByText('No successor is scheduled.')).toBeInTheDocument();
    expect(
      screen.getByText(
        'No Pricing Rule Version has been published for this Company yet.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Version 1')).not.toBeInTheDocument();
    expect(requestsTo(fetchMock, LIST).map(({ company }) => company)).toEqual([
      'company-1',
      'company-1',
      'company-2',
    ]);
  });

  it('never shows a head and a history read either side of a publication, and reads both again keeping the draft', async () => {
    let releaseScope: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      releaseScope = resolve;
    });
    const v1TakenOverByV2 = ruleVersion(1, {
      supersession: {
        supersededByVersionId: v2.id,
        supersededAt: '2026-04-02T08:00:00.000Z',
        supersededFrom: v2.effectiveFrom,
      },
    });
    const fetchMock = stubApi({
      // The reload's scope read precedes another member's publication of
      // version 2 and its history read follows it. The next pass is held.
      [SCOPE]: async (call) => {
        if (call <= 2) return scope(null, 1);
        await held;
        return scope(null, 2);
      },
      [LIST]: (call) =>
        call === 1 ? page([ruleVersion(1)]) : page([v2, v1TakenOverByV2]),
    });
    renderWorkspace();
    await screen.findByText('The new version will follow head version 1.');
    // Reads that agree are made once.
    expect(requestsTo(fetchMock, SCOPE)).toHaveLength(1);
    expect(requestsTo(fetchMock, LIST)).toHaveLength(1);
    fillDraft({ label: 'Kept draft', effectiveFrom: '2026-07-01T00:00' });

    fireEvent.click(
      screen.getByRole('button', { name: 'Reload Pricing Rule Versions' }),
    );
    await waitFor(() => expect(requestsTo(fetchMock, SCOPE)).toHaveLength(3));
    expect(requestsTo(fetchMock, LIST)).toHaveLength(2);
    expect(
      screen.getByText('Loading the current Pricing Rule Version…'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Loading Pricing Rule Versions…'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Head: version/u)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('list', { name: 'Pricing Rule Versions' }),
    ).not.toBeInTheDocument();
    expect(publishButton()).toBeDisabled();

    await act(async () => {
      releaseScope();
      await held;
    });
    expect(
      await screen.findByText('The new version will follow head version 2.'),
    ).toBeInTheDocument();
    expect(versionNames(historyList())).toEqual(['Version 2', 'Version 1']);
    expect(versionNames(scheduledList())).toEqual(['Version 1', 'Version 2']);
    expect(requestsTo(fetchMock, SCOPE)).toHaveLength(3);
    expect(requestsTo(fetchMock, LIST)).toHaveLength(3);
    expect(screen.getByLabelText('Label')).toHaveValue('Kept draft');
  });

  it('reads again when a start passes between the scope and the history reads', async () => {
    const v2Started = { ...v2, state: 'CURRENT' };
    const v1TakenOver = { ...v1, state: 'SUPERSEDED' };
    const fetchMock = stubApi({
      [SCOPE]: (call) => (call === 1 ? scope(v1, 2) : scope(v2Started, 2)),
      [LIST]: () => page([v2Started, v1TakenOver]),
    });
    renderWorkspace();

    expect(
      await screen.findByText('No successor is scheduled.'),
    ).toBeInTheDocument();
    const current = screen.getByRole('region', {
      name: 'Current Pricing Rule Version',
    });
    expect(within(current).getByText('Version 2')).toBeInTheDocument();
    expect(within(current).queryByText('Version 1')).not.toBeInTheDocument();
    expect(requestsTo(fetchMock, SCOPE)).toHaveLength(2);
    expect(requestsTo(fetchMock, LIST)).toHaveLength(2);
  });

  it('settles in an explicit reloadable state when every bounded pass straddles a publication, keeping the draft and an uncertain publication', async () => {
    // During the first reload, another member publishes between each scope
    // read and its history read; the churn has stopped by the next reload.
    const churning = (call: number) => call >= 2 && call <= 4;
    const fetchMock = stubApi({
      [SCOPE]: (call) => scope(null, call),
      [LIST]: (call) =>
        page(
          chain({ count: churning(call) ? call + 1 : call, firstScheduled: 1 }),
        ),
      [PUBLISH]: (call) =>
        call === 1
          ? Promise.reject(new TypeError('network'))
          : Response.json(
              { outcome: 'UNCHANGED', version: ruleVersion(1) },
              { status: 201 },
            ),
    });
    renderWorkspace();
    await screen.findByText('The new version will follow head version 1.');
    fillDraft({ label: 'Churn rule', effectiveFrom: '2026-07-01T00:00' });
    fireEvent.click(publishButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The publication outcome is uncertain.',
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Reload Pricing Rule Versions' }),
    );
    expect(
      await screen.findByText(
        'Pricing Rule Versions kept changing while loading. Reload to see the latest versions.',
      ),
    ).toHaveAttribute('role', 'alert');
    expect(requestsTo(fetchMock, SCOPE)).toHaveLength(4);
    expect(requestsTo(fetchMock, LIST)).toHaveLength(4);
    expect(screen.queryByText(/^Head: version/u)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('list', { name: 'Pricing Rule Versions' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('list', { name: 'Scheduled successors' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('No successor is scheduled.'),
    ).not.toBeInTheDocument();
    expect(publishButton()).toBeDisabled();
    expect(screen.getByLabelText('Label')).toHaveValue('Churn rule');
    expect(
      screen.getByText(/^The publication outcome is uncertain\./u),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Reload Pricing Rule Versions' }),
    );
    expect(
      await screen.findByText('The new version will follow head version 5.'),
    ).toBeInTheDocument();
    expect(requestsTo(fetchMock, SCOPE)).toHaveLength(5);
    expect(requestsTo(fetchMock, LIST)).toHaveLength(5);

    fireEvent.click(screen.getByRole('button', { name: 'Retry publication' }));
    expect(
      await screen.findByText(
        'Version 1 already has this content. Nothing changed.',
      ),
    ).toBeInTheDocument();
    const attempts = requestsTo(fetchMock, PUBLISH);
    expect(attempts).toHaveLength(2);
    expect(attempts[1]?.key).toBe(attempts[0]?.key);
    expect(attempts.map(({ body }) => body)).toEqual(
      attempts.map(() => ({
        label: 'Churn rule',
        effectiveFrom: new Date('2026-07-01T00:00').toISOString(),
        expectedActiveVersionNumber: 1,
      })),
    );
  });
});
