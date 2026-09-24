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

const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

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
  init?: RequestInit,
) => Response | Promise<Response>;

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
    return Promise.resolve(responder(call, init));
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
    fireEvent.change(screen.getByLabelText(`Effective from (${zone})`), {
      target: { value: draft.effectiveFrom },
    });
  if (draft.effectiveTo !== undefined)
    fireEvent.change(
      screen.getByLabelText(`Effective until, optional (${zone})`),
      { target: { value: draft.effectiveTo } },
    );
}

function publishButton() {
  return screen.getByRole('button', { name: 'Publish version' });
}

describe('PricingConfigurationWorkspace', () => {
  afterEach(() => vi.unstubAllGlobals());

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
        `Instants are entered and shown in your browser time zone: ${zone}.`,
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
    expect(screen.getByLabelText(`Effective from (${zone})`)).toHaveValue(
      '2026-06-01T09:30',
    );
  });

  it('names the new head on a stale conflict and reloads only when asked, keeping the draft', async () => {
    const fetchMock = stubApi({
      [SCOPE]: (call) => (call === 1 ? scope(null, 1) : scope(null, 2)),
      [LIST]: () => page([]),
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
    const fetchMock = stubApi({
      [SCOPE]: (call) => (call === 1 ? scope(null, 1) : scope(null, 2)),
      [LIST]: () => page([]),
      [PUBLISH]: (call) =>
        call === 1
          ? Promise.reject(new TypeError('network'))
          : call === 2
            ? new Response('gateway', { status: 502 })
            : Response.json(
                { outcome: 'UNCHANGED', version: ruleVersion(2) },
                { status: 201 },
              ),
    });
    renderWorkspace();
    await screen.findByText('The new version will follow head version 1.');
    fillDraft({ label: 'Uncertain rule', effectiveFrom: '2026-07-01T00:00' });
    fireEvent.click(publishButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The publication outcome is uncertain.',
    );
    // Reloading shows a newer head, yet the retry still carries the original
    // expectation and key so a committed first attempt is replayed.
    fireEvent.click(
      screen.getByRole('button', { name: 'Reload Pricing Rule Versions' }),
    );
    await screen.findByText('The new version will follow head version 2.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry publication' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The publication outcome is uncertain.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry publication' }));
    expect(
      await screen.findByText(
        'Version 2 already has this content. Nothing changed.',
      ),
    ).toBeInTheDocument();
    const attempts = requestsTo(fetchMock, PUBLISH);
    expect(attempts).toHaveLength(3);
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
});
