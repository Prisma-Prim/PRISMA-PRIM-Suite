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
import { CommercialIntakeWorkspace } from './CommercialIntakeWorkspace';
import { commercialIntakeCopy as copy } from './commercial-intake.copy';

const intakePermissions: NonNullable<
  NonNullable<ActorContext['activeCompany']>['commercialIntakePermissions']
> = [
  'commercial.request.read',
  'commercial.request.create',
  'commercial.opportunity.read',
  'commercial.opportunity.create',
];

function actorFor(
  company: { id: string; displayName: string },
  canUpdateNextAction = false,
): ActorContext {
  return {
    internalUserId: 'user-1',
    workspaceMembershipId: 'membership-1',
    workspaceId: 'workspace-1',
    workspaceName: 'PRISMA Workspace',
    displayName: 'Iurie',
    email: 'iurie@example.test',
    active: true,
    workspacePermissions: [],
    activeCompany: {
      ...company,
      clientPermissions: ['client.read'],
      commercialIntakePermissions: canUpdateNextAction
        ? [...intakePermissions, 'commercial.opportunity.next_action.update']
        : intakePermissions,
      commercialIntakePermissionSetVersion: canUpdateNextAction ? 'v2' : 'v1',
    },
  };
}

const companyA = { id: 'company-1', displayName: 'PRISMA-PRIM' };
const reader = actorFor(companyA);
const editor = actorFor(companyA, true);

const sharedName = 'Shared display name';
const firstDossier = {
  clientDossierId: 'client-first',
  displayName: sharedName,
};
const secondDossier = {
  clientDossierId: 'client-second',
  displayName: sharedName,
};

function row(id: string, subject: string, clientDossierId?: string) {
  return {
    id,
    subject,
    capturedAt: '2026-09-20T10:00:00.000Z',
    ...(clientDossierId === undefined ? {} : { clientDossierId }),
    initialOpportunity: {
      title: `${subject} Opportunity`,
      nextAction: `Follow up ${subject}`,
      responsibleActor: {
        workspaceMembershipId: 'membership-1',
        displayName: 'Iurie',
      },
    },
  };
}

/** Two same-named dossiers, a Request without a Client, in server order. */
function dossierRows(firstDossierId = firstDossier.clientDossierId) {
  return [
    row('request-unlinked', 'Unlinked follow-up'),
    row('request-second', 'Second Client follow-up', 'client-second'),
    row('request-first', 'First Client Request', firstDossierId),
    row('request-first-older', 'First Client follow-up', firstDossierId),
  ];
}

function detail(
  id: string,
  subject: string,
  clientReference?: {
    originalClientId: string;
    currentClientId?: string;
    displayName: string;
  },
  opportunity: { nextAction?: string; version?: number } = {},
) {
  return {
    id,
    companyId: companyA.id,
    sourceKind: 'MANUAL_TEXT',
    sourceLabel: null,
    reportedReceivedAt: null,
    subject,
    originalText: `Original source of ${subject}`,
    capturedByWorkspaceMembershipId: 'membership-1',
    capturedAt: '2026-09-20T10:00:00.000Z',
    version: 1,
    ...(clientReference === undefined ? {} : { clientReference }),
    initialOpportunity: {
      id: `opportunity-${id}`,
      title: `${subject} Opportunity`,
      scope: null,
      nextAction: opportunity.nextAction ?? `Follow up ${subject}`,
      status: 'OPEN',
      responsibleWorkspaceMembershipId: 'membership-1',
      responsibleActor: {
        workspaceMembershipId: 'membership-1',
        displayName: 'Iurie',
      },
      createdAt: '2026-09-20T10:00:00.000Z',
      version: opportunity.version ?? 1,
    },
  };
}

function firstDetail(currentClientId = firstDossier.clientDossierId) {
  return detail('request-first', 'First Client Request', {
    originalClientId: 'client-first',
    currentClientId,
    displayName: sharedName,
  });
}

const listPath = '/api/commercial-intake/requests?limit=25';
const detailPath = (id: string) => `/api/commercial-intake/requests/${id}`;
const nextActionPath = (id: string) =>
  `/api/commercial-intake/opportunities/opportunity-${id}/next-action`;

type Responder = () => Promise<Response>;

function reply(value: unknown, status = 200): Responder {
  return () => Promise.resolve(Response.json(value, { status }));
}
function failure(status: number): Responder {
  return () => Promise.resolve(new Response(null, { status }));
}
function networkFailure(): Responder {
  return () => Promise.reject(new TypeError('Failed to fetch'));
}
function deferred() {
  let resolve: (response: Response) => void = () => undefined;
  const promise = new Promise<Response>((settle) => {
    resolve = settle;
  });
  return {
    responder: (): Promise<Response> => promise,
    async settle(value: unknown, status = 200) {
      await act(async () => {
        resolve(Response.json(value, { status }));
        await new Promise((done) => setTimeout(done, 0));
      });
    },
  };
}

/**
 * Answers each `METHOD path` from its own queue, so the order in which the
 * workspace starts independent reads does not matter to the test.
 */
function stubRoutes(routes: Record<string, Responder[]>) {
  const unexpected: string[] = [];
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${input.toString()}`;
      const next = routes[key]?.shift();
      if (!next) {
        unexpected.push(key);
        return new Response(null, { status: 599 });
      }
      return next();
    },
  );
  vi.stubGlobal('fetch', fetchMock);
  return {
    fetchMock,
    unexpected,
    calls: (key: string) =>
      fetchMock.mock.calls.filter(
        ([input, init]) =>
          `${init?.method ?? 'GET'} ${input.toString()}` === key,
      ),
  };
}

type NavigationProps = {
  clientRestriction?: { clientDossierId: string; displayName: string };
  clientIdentityRevision?: number;
  onOpenClientDossier?: (clientDossierId: string) => void;
};

function renderNavigation(initial: NavigationProps, initialActor = reader) {
  const identity = deterministicBrowserIdentity();
  let props = initial;
  let currentActor = initialActor;
  const element = () => (
    <CommercialIntakeWorkspace
      actor={currentActor}
      identity={identity}
      onCompanyContextRejected={() => undefined}
      {...props}
    />
  );
  const view = render(element());
  return {
    update(next: NavigationProps) {
      props = { ...props, ...next };
      view.rerender(element());
    },
    selectActor(nextActor: ActorContext) {
      currentActor = nextActor;
      view.rerender(element());
    },
    unmount: () => view.unmount(),
  };
}

function requestList(): HTMLElement {
  return screen.getByRole('list', { name: copy.list });
}
function listedSubjects(): string[] {
  const list = screen.queryByRole('list', { name: copy.list });
  if (!list) return [];
  return within(list)
    .queryAllByRole('listitem')
    .map((item) => item.querySelector('strong')?.textContent ?? '');
}
function restriction(): HTMLElement | null {
  return screen.queryByRole('group', {
    name: copy.restrictionLabel(sharedName),
  });
}
function filterInput(): HTMLElement {
  return screen.getByLabelText(copy.filterLabel);
}
function openRow(subject: string) {
  fireEvent.click(
    within(requestList()).getByRole('button', {
      name: new RegExp(`^${subject}`, 'u'),
    }),
  );
}
function returnAction(): HTMLElement | null {
  return screen.queryByRole('button', { name: copy.openClientDossier });
}
function requiredElement(element: HTMLElement | null): HTMLElement {
  if (!element) throw new Error('Expected the element to be rendered.');
  return element;
}
function clickReturnAction() {
  fireEvent.click(requiredElement(returnAction()));
}
function keyOf(init: RequestInit | undefined): string | undefined {
  const headers = init?.headers;
  if (!headers || headers instanceof Headers || Array.isArray(headers))
    return undefined;
  return headers['idempotency-key'];
}

describe('CommercialIntakeWorkspace Client dossier navigation', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('restricts the loaded Requests by exact dossier identity and restores every row in server order', async () => {
    const transport = stubRoutes({
      [`GET ${listPath}`]: [reply({ items: dossierRows() })],
    });
    renderNavigation({ clientRestriction: firstDossier });

    await waitFor(() =>
      expect(listedSubjects()).toEqual([
        'First Client Request',
        'First Client follow-up',
      ]),
    );
    const scope = restriction();
    expect(scope).toBeVisible();
    expect(
      within(requiredElement(scope)).getByText(copy.restrictionHelp),
    ).toBeVisible();

    fireEvent.click(
      screen.getByRole('button', { name: copy.restrictionClear }),
    );
    expect(listedSubjects()).toEqual([
      'Unlinked follow-up',
      'Second Client follow-up',
      'First Client Request',
      'First Client follow-up',
    ]);
    expect(restriction()).not.toBeInTheDocument();
    expect(filterInput()).toHaveFocus();
    expect(transport.fetchMock).toHaveBeenCalledOnce();
  });

  it('establishes, replaces and clears the restriction as the shell requests without mixing same-named Clients', async () => {
    stubRoutes({ [`GET ${listPath}`]: [reply({ items: dossierRows() })] });
    const view = renderNavigation({});
    await waitFor(() => expect(listedSubjects()).toHaveLength(4));
    expect(restriction()).not.toBeInTheDocument();

    view.update({ clientRestriction: firstDossier });
    expect(listedSubjects()).toEqual([
      'First Client Request',
      'First Client follow-up',
    ]);
    view.update({ clientRestriction: secondDossier });
    expect(listedSubjects()).toEqual(['Second Client follow-up']);
    expect(restriction()).toBeVisible();

    fireEvent.click(
      screen.getByRole('button', { name: copy.restrictionClear }),
    );
    expect(listedSubjects()).toHaveLength(4);
    // A repeated request from the shell establishes the restriction again.
    view.update({ clientRestriction: { ...secondDossier } });
    expect(listedSubjects()).toEqual(['Second Client follow-up']);
    view.update({ clientRestriction: undefined });
    expect(listedSubjects()).toHaveLength(4);
    expect(restriction()).not.toBeInTheDocument();
  });

  it('composes the restriction with the text filter, and clearing one keeps the other', async () => {
    stubRoutes({ [`GET ${listPath}`]: [reply({ items: dossierRows() })] });
    renderNavigation({ clientRestriction: firstDossier });
    await waitFor(() => expect(listedSubjects()).toHaveLength(2));

    changeValue(filterInput(), 'follow-up');
    expect(listedSubjects()).toEqual(['First Client follow-up']);
    fireEvent.click(screen.getByRole('button', { name: copy.filterClear }));
    expect(listedSubjects()).toEqual([
      'First Client Request',
      'First Client follow-up',
    ]);
    expect(restriction()).toBeVisible();

    changeValue(filterInput(), 'follow-up');
    fireEvent.click(
      screen.getByRole('button', { name: copy.restrictionClear }),
    );
    expect(filterInput()).toHaveValue('follow-up');
    expect(listedSubjects()).toEqual([
      'Unlinked follow-up',
      'Second Client follow-up',
      'First Client follow-up',
    ]);
  });

  it('reports no loaded Request for the Client and keeps older Requests reachable for the restriction', async () => {
    const newest = Array.from({ length: 25 }, (_, index) =>
      row(`request-${index}`, `Unrelated Request ${index}`),
    );
    stubRoutes({
      [`GET ${listPath}`]: [reply({ items: newest, nextCursor: 'cursor-2' })],
      [`GET ${listPath}&cursor=cursor-2`]: [
        reply({
          items: [
            row('request-older', 'Older first Client Request', 'client-first'),
          ],
        }),
      ],
    });
    renderNavigation({ clientRestriction: firstDossier });

    expect(
      await screen.findByText(copy.restrictionNoMatch(sharedName)),
    ).toBeVisible();
    expect(listedSubjects()).toEqual([]);
    expect(screen.queryByText(copy.filterNoMatch)).not.toBeInTheDocument();
    expect(
      screen.queryByText(copy.empty('PRISMA-PRIM')),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: copy.showOlder }));
    await waitFor(() =>
      expect(listedSubjects()).toEqual(['Older first Client Request']),
    );
    expect(
      screen.queryByText(copy.restrictionNoMatch(sharedName)),
    ).not.toBeInTheDocument();
  });

  it('separates an older-page failure and a genuinely empty list from no restricted match', async () => {
    const newest = Array.from({ length: 25 }, (_, index) =>
      row(`request-${index}`, `Unrelated Request ${index}`),
    );
    stubRoutes({
      [`GET ${listPath}`]: [
        reply({ items: newest, nextCursor: 'cursor-2' }),
        reply({ items: [] }),
      ],
      [`GET ${listPath}&cursor=cursor-2`]: [failure(500)],
    });
    const first = renderNavigation({ clientRestriction: firstDossier });
    await screen.findByText(copy.restrictionNoMatch(sharedName));
    fireEvent.click(screen.getByRole('button', { name: copy.showOlder }));

    expect(await screen.findByRole('alert')).toHaveTextContent(copy.olderError);
    expect(screen.getByText(copy.restrictionNoMatch(sharedName))).toBeVisible();
    expect(screen.getByRole('button', { name: copy.showOlder })).toBeEnabled();
    first.unmount();

    renderNavigation({ clientRestriction: firstDossier });
    expect(await screen.findByText(copy.empty('PRISMA-PRIM'))).toBeVisible();
    expect(
      screen.queryByText(copy.restrictionNoMatch(sharedName)),
    ).not.toBeInTheDocument();
  });

  it('keeps the restriction and the text filter while a detail is opened and closed', async () => {
    stubRoutes({
      [`GET ${listPath}`]: [reply({ items: dossierRows() })],
      [`GET ${detailPath('request-first-older')}`]: [
        reply(detail('request-first-older', 'First Client follow-up')),
      ],
    });
    renderNavigation({ clientRestriction: firstDossier });
    await waitFor(() => expect(listedSubjects()).toHaveLength(2));
    changeValue(filterInput(), 'follow-up');
    openRow('First Client follow-up');
    expect(
      await screen.findByText('Original source of First Client follow-up'),
    ).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: copy.back }));
    expect(filterInput()).toHaveValue('follow-up');
    expect(restriction()).toBeVisible();
    expect(listedSubjects()).toEqual(['First Client follow-up']);
  });

  it('opens the dossier from the latest settled detail by its current identity only', async () => {
    const openDossier = vi.fn();
    stubRoutes({
      [`GET ${listPath}`]: [reply({ items: dossierRows() })],
      [`GET ${detailPath('request-first')}`]: [
        reply(
          detail('request-first', 'First Client Request', {
            originalClientId: 'client-original',
            currentClientId: 'client-first',
            displayName: sharedName,
          }),
        ),
      ],
      [`GET ${detailPath('request-second')}`]: [
        reply(
          detail('request-second', 'Second Client follow-up', {
            originalClientId: 'client-second',
            displayName: sharedName,
          }),
        ),
      ],
    });
    const view = renderNavigation({ onOpenClientDossier: openDossier });
    await waitFor(() => expect(listedSubjects()).toHaveLength(4));

    openRow('First Client Request');
    await screen.findByText('Original source of First Client Request');
    clickReturnAction();
    expect(openDossier).toHaveBeenCalledExactlyOnceWith('client-first');

    view.update({ onOpenClientDossier: undefined });
    expect(returnAction()).not.toBeInTheDocument();
    view.update({ onOpenClientDossier: openDossier });
    fireEvent.click(screen.getByRole('button', { name: copy.back }));

    // An original reference alone is never a navigation target.
    openRow('Second Client follow-up');
    await screen.findByText('Original source of Second Client follow-up');
    expect(screen.getByText(sharedName)).toBeVisible();
    expect(returnAction()).not.toBeInTheDocument();
  });

  it('retires a plain detail and its pending read when a new restriction arrives, in both response orders', async () => {
    const lateDetail = deferred();
    stubRoutes({
      [`GET ${listPath}`]: [reply({ items: dossierRows() })],
      [`GET ${detailPath('request-unlinked')}`]: [
        lateDetail.responder,
        reply(detail('request-unlinked', 'Unlinked follow-up')),
      ],
    });
    const view = renderNavigation({});
    await waitFor(() => expect(listedSubjects()).toHaveLength(4));

    // The restriction arrives before the detail response.
    openRow('Unlinked follow-up');
    view.update({ clientRestriction: firstDossier });
    expect(listedSubjects()).toEqual([
      'First Client Request',
      'First Client follow-up',
    ]);
    await lateDetail.settle(detail('request-unlinked', 'Unlinked follow-up'));
    expect(
      screen.queryByText('Original source of Unlinked follow-up'),
    ).not.toBeInTheDocument();
    expect(listedSubjects()).toHaveLength(2);
    expect(
      within(requestList()).getByRole('button', {
        name: /^First Client Request/u,
      }),
    ).toBeEnabled();

    // The detail response arrives before the restriction.
    fireEvent.click(
      screen.getByRole('button', { name: copy.restrictionClear }),
    );
    openRow('Unlinked follow-up');
    await screen.findByText('Original source of Unlinked follow-up');
    view.update({ clientRestriction: { ...secondDossier } });
    expect(
      screen.queryByText('Original source of Unlinked follow-up'),
    ).not.toBeInTheDocument();
    expect(listedSubjects()).toEqual(['Second Client follow-up']);
  });

  it('keeps a next-action draft through a new restriction and keeps its row restricted after saving', async () => {
    const transport = stubRoutes({
      [`GET ${listPath}`]: [
        reply({ items: dossierRows() }),
        reply({ items: dossierRows() }),
      ],
      [`GET ${detailPath('request-first')}`]: [reply(firstDetail())],
      [`POST ${nextActionPath('request-first')}`]: [
        reply({
          receipt: {
            opportunityId: 'opportunity-request-first',
            nextAction: 'Book the audit call',
            version: 2,
            outcome: 'updated',
          },
          request: detail('request-first', 'First Client Request', undefined, {
            nextAction: 'Book the audit call',
            version: 2,
          }),
        }),
      ],
    });
    const view = renderNavigation({}, editor);
    await waitFor(() => expect(listedSubjects()).toHaveLength(4));
    openRow('First Client Request');
    fireEvent.click(
      await screen.findByRole('button', { name: copy.editNextAction }),
    );
    changeValue(screen.getByLabelText(copy.nextAction), 'Book the audit call');

    view.update({ clientRestriction: firstDossier });
    expect(screen.getByLabelText(copy.nextAction)).toHaveValue(
      'Book the audit call',
    );
    fireEvent.click(screen.getByRole('button', { name: copy.saveNextAction }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      copy.nextActionSaved,
    );
    expect(transport.calls(`POST ${nextActionPath('request-first')}`)).toEqual([
      [
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            expectedVersion: 1,
            nextAction: 'Book the audit call',
          }),
        }),
      ],
    ]);
    await waitFor(() =>
      expect(transport.calls(`GET ${listPath}`)).toHaveLength(2),
    );

    fireEvent.click(screen.getByRole('button', { name: copy.back }));
    expect(listedSubjects()).toEqual([
      'First Client Request',
      'First Client follow-up',
    ]);
    expect(restriction()).toBeVisible();
  });

  it('keeps the uncertain next-action payload, observed version and key across restriction changes', async () => {
    const transport = stubRoutes({
      [`GET ${listPath}`]: [reply({ items: dossierRows() })],
      [`GET ${detailPath('request-first')}`]: [reply(firstDetail())],
      [`POST ${nextActionPath('request-first')}`]: [
        networkFailure(),
        networkFailure(),
      ],
    });
    const view = renderNavigation({}, editor);
    await waitFor(() => expect(listedSubjects()).toHaveLength(4));
    openRow('First Client Request');
    fireEvent.click(
      await screen.findByRole('button', { name: copy.editNextAction }),
    );
    changeValue(
      screen.getByLabelText(copy.nextAction),
      'Confirm the audit window',
    );
    fireEvent.click(screen.getByRole('button', { name: copy.saveNextAction }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      copy.nextActionUncertain,
    );

    view.update({ clientRestriction: firstDossier });
    view.update({ clientRestriction: { ...secondDossier } });
    view.update({ clientRestriction: undefined });
    fireEvent.click(screen.getByRole('button', { name: copy.retryNextAction }));
    await waitFor(() =>
      expect(
        transport.calls(`POST ${nextActionPath('request-first')}`),
      ).toHaveLength(2),
    );
    const [first, retry] = transport.calls(
      `POST ${nextActionPath('request-first')}`,
    );
    expect(retry?.[1]?.body).toBe(
      JSON.stringify({
        expectedVersion: 1,
        nextAction: 'Confirm the audit window',
      }),
    );
    expect(keyOf(retry?.[1])).toBeDefined();
    expect(keyOf(retry?.[1])).toBe(keyOf(first?.[1]));
  });

  it('keeps post-create behaviour and restricts the new Request only by its settled list identity', async () => {
    stubRoutes({
      [`GET ${listPath}`]: [
        reply({ items: dossierRows() }),
        reply({
          items: [
            row('request-new', 'New first Client Request', 'client-first'),
            ...dossierRows(),
          ],
        }),
      ],
      'POST /api/commercial-intake/requests': [
        reply(
          detail('request-new', 'New first Client Request', {
            originalClientId: 'client-first',
            currentClientId: 'client-first',
            displayName: sharedName,
          }),
          201,
        ),
      ],
    });
    renderNavigation({ clientRestriction: firstDossier });
    await waitFor(() => expect(listedSubjects()).toHaveLength(2));
    changeValue(
      screen.getByLabelText(copy.originalText),
      'Exact original text',
    );
    changeValue(
      screen.getByLabelText(copy.opportunityTitle),
      'Qualify the request',
    );
    changeValue(screen.getByLabelText(copy.nextAction), 'Call back');
    fireEvent.click(screen.getByRole('button', { name: copy.capture }));

    expect(
      await screen.findByText('Original source of New first Client Request'),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: copy.back }));
    await waitFor(() =>
      expect(listedSubjects()).toEqual([
        'New first Client Request',
        'First Client Request',
        'First Client follow-up',
      ]),
    );
    expect(restriction()).toBeVisible();
  });

  it('keeps an uncertain create payload and key across restriction changes', async () => {
    const transport = stubRoutes({
      [`GET ${listPath}`]: [reply({ items: dossierRows() })],
      'POST /api/commercial-intake/requests': [
        networkFailure(),
        networkFailure(),
      ],
    });
    const view = renderNavigation({});
    await waitFor(() => expect(listedSubjects()).toHaveLength(4));
    changeValue(
      screen.getByLabelText(copy.originalText),
      'Exact original text',
    );
    changeValue(
      screen.getByLabelText(copy.opportunityTitle),
      'Qualify the request',
    );
    changeValue(screen.getByLabelText(copy.nextAction), 'Call back');
    fireEvent.click(screen.getByRole('button', { name: copy.capture }));
    expect(await screen.findByRole('alert')).toHaveTextContent(copy.error);

    view.update({ clientRestriction: firstDossier });
    fireEvent.click(
      screen.getByRole('button', { name: copy.restrictionClear }),
    );
    view.update({ clientRestriction: { ...secondDossier } });
    expect(screen.getByLabelText(copy.originalText)).toHaveValue(
      'Exact original text',
    );
    fireEvent.click(screen.getByRole('button', { name: copy.capture }));
    await waitFor(() =>
      expect(
        transport.calls('POST /api/commercial-intake/requests'),
      ).toHaveLength(2),
    );
    const [first, retry] = transport.calls(
      'POST /api/commercial-intake/requests',
    );
    expect(retry?.[1]?.body).toBe(first?.[1]?.body);
    expect(keyOf(retry?.[1])).toBeDefined();
    expect(keyOf(retry?.[1])).toBe(keyOf(first?.[1]));
  });

  it('clears the restriction and ignores a late detail reply when the active Company changes', async () => {
    const lateDetail = deferred();
    stubRoutes({
      [`GET ${listPath}`]: [
        reply({ items: dossierRows() }),
        reply({
          items: [row('request-b', 'Company B Request', 'client-first')],
        }),
      ],
      [`GET ${detailPath('request-first')}`]: [lateDetail.responder],
    });
    const openDossier = vi.fn();
    const view = renderNavigation({
      clientRestriction: firstDossier,
      onOpenClientDossier: openDossier,
    });
    await waitFor(() => expect(listedSubjects()).toHaveLength(2));
    openRow('First Client Request');

    view.selectActor(actorFor({ id: 'company-2', displayName: 'BIC' }));
    await waitFor(() =>
      expect(listedSubjects()).toEqual(['Company B Request']),
    );
    expect(restriction()).not.toBeInTheDocument();
    await lateDetail.settle(firstDetail());
    expect(
      screen.queryByText('Original source of First Client Request'),
    ).not.toBeInTheDocument();
    expect(returnAction()).not.toBeInTheDocument();
    expect(listedSubjects()).toEqual(['Company B Request']);
  });

  describe('after a Client identity change', () => {
    it('rereads the loaded rows and compares only rows read under the current identity', async () => {
      const refreshed = deferred();
      const transport = stubRoutes({
        [`GET ${listPath}`]: [
          reply({ items: dossierRows() }),
          refreshed.responder,
        ],
      });
      const view = renderNavigation({ clientRestriction: secondDossier });
      await waitFor(() =>
        expect(listedSubjects()).toEqual(['Second Client follow-up']),
      );

      view.update({ clientIdentityRevision: 1 });
      expect(listedSubjects()).toEqual([]);
      expect(screen.getByText(copy.loading)).toBeVisible();
      await refreshed.settle({ items: dossierRows('client-second') });
      expect(listedSubjects()).toEqual([
        'Second Client follow-up',
        'First Client Request',
        'First Client follow-up',
      ]);
      expect(transport.calls(`GET ${listPath}`)).toHaveLength(2);
    });

    for (const order of ['stale first', 'current first'] as const)
      it(`never compares a list read started before the change (${order})`, async () => {
        const stale = deferred();
        const current = deferred();
        stubRoutes({
          [`GET ${listPath}`]: [stale.responder, current.responder],
        });
        const view = renderNavigation({ clientRestriction: firstDossier });
        view.update({ clientIdentityRevision: 1 });

        if (order === 'stale first') {
          await stale.settle({ items: dossierRows() });
          expect(listedSubjects()).toEqual([]);
          await current.settle({ items: dossierRows('client-second') });
        } else {
          await current.settle({ items: dossierRows('client-second') });
          await stale.settle({ items: dossierRows() });
        }
        expect(listedSubjects()).toEqual([]);
        expect(
          screen.getByText(copy.restrictionNoMatch(sharedName)),
        ).toBeVisible();
        fireEvent.click(
          screen.getByRole('button', { name: copy.restrictionClear }),
        );
        expect(listedSubjects()).toHaveLength(4);
      });

    for (const order of ['older page first', 'refresh first'] as const)
      it(`never appends an older page read before the change (${order})`, async () => {
        const olderPage = deferred();
        const refreshed = deferred();
        const newest = Array.from({ length: 25 }, (_, index) =>
          row(`request-${index}`, `Unrelated Request ${index}`),
        );
        stubRoutes({
          [`GET ${listPath}`]: [
            reply({ items: newest, nextCursor: 'cursor-2' }),
            refreshed.responder,
          ],
          [`GET ${listPath}&cursor=cursor-2`]: [olderPage.responder],
        });
        const view = renderNavigation({ clientRestriction: firstDossier });
        await screen.findByText(copy.restrictionNoMatch(sharedName));
        fireEvent.click(screen.getByRole('button', { name: copy.showOlder }));
        view.update({ clientIdentityRevision: 1 });

        const stalePage = {
          items: [row('request-older', 'Older superseded row', 'client-first')],
        };
        if (order === 'older page first') {
          await olderPage.settle(stalePage);
          await refreshed.settle({ items: newest });
        } else {
          await refreshed.settle({ items: newest });
          await olderPage.settle(stalePage);
        }
        expect(listedSubjects()).toEqual([]);
        fireEvent.click(
          screen.getByRole('button', { name: copy.restrictionClear }),
        );
        expect(listedSubjects()).toHaveLength(25);
        expect(listedSubjects()).not.toContain('Older superseded row');
      });

    it('offers the retry instead of superseded rows when the refresh fails', async () => {
      stubRoutes({
        [`GET ${listPath}`]: [
          reply({ items: dossierRows() }),
          failure(500),
          reply({ items: dossierRows('client-second') }),
        ],
      });
      const view = renderNavigation({ clientRestriction: firstDossier });
      await waitFor(() => expect(listedSubjects()).toHaveLength(2));

      view.update({ clientIdentityRevision: 1 });
      expect(await screen.findByRole('alert')).toHaveTextContent(copy.error);
      expect(listedSubjects()).toEqual([]);
      fireEvent.click(screen.getByRole('button', { name: copy.retry }));
      expect(
        await screen.findByText(copy.restrictionNoMatch(sharedName)),
      ).toBeVisible();
      expect(listedSubjects()).toEqual([]);
    });

    it('withholds the return target of an open detail until a current read settles it', async () => {
      const openDossier = vi.fn();
      const catchUp = deferred();
      stubRoutes({
        [`GET ${listPath}`]: [
          reply({ items: dossierRows() }),
          reply({ items: dossierRows('client-second') }),
        ],
        [`GET ${detailPath('request-first')}`]: [
          reply(firstDetail()),
          catchUp.responder,
        ],
      });
      const view = renderNavigation({ onOpenClientDossier: openDossier });
      await waitFor(() => expect(listedSubjects()).toHaveLength(4));
      openRow('First Client Request');
      await waitFor(() => expect(returnAction()).toBeVisible());

      view.update({ clientIdentityRevision: 1 });
      expect(returnAction()).not.toBeInTheDocument();
      expect(
        screen.getByText('Original source of First Client Request'),
      ).toBeVisible();
      await catchUp.settle(firstDetail('client-second'));
      clickReturnAction();
      expect(openDossier).toHaveBeenCalledExactlyOnceWith('client-second');
    });

    it('keeps the return target withheld when the current read fails or is unavailable', async () => {
      stubRoutes({
        [`GET ${listPath}`]: [
          reply({ items: dossierRows() }),
          reply({ items: dossierRows() }),
          reply({ items: dossierRows() }),
        ],
        [`GET ${detailPath('request-first')}`]: [
          reply(firstDetail()),
          failure(500),
          failure(404),
        ],
      });
      const view = renderNavigation({ onOpenClientDossier: vi.fn() });
      await waitFor(() => expect(listedSubjects()).toHaveLength(4));
      openRow('First Client Request');
      await waitFor(() => expect(returnAction()).toBeVisible());

      view.update({ clientIdentityRevision: 1 });
      await waitFor(() =>
        expect(
          screen.getByText('Original source of First Client Request'),
        ).toBeVisible(),
      );
      await act(async () => {
        await new Promise((done) => setTimeout(done, 0));
      });
      expect(returnAction()).not.toBeInTheDocument();
      view.update({ clientIdentityRevision: 2 });
      await act(async () => {
        await new Promise((done) => setTimeout(done, 0));
      });
      expect(returnAction()).not.toBeInTheDocument();
      expect(
        screen.getByText('Original source of First Client Request'),
      ).toBeVisible();
    });

    for (const order of ['detail first', 'change first'] as const)
      it(`does not install a stale target from a detail read started before the change (${order})`, async () => {
        const openDossier = vi.fn();
        const opened = deferred();
        const catchUp = deferred();
        stubRoutes({
          [`GET ${listPath}`]: [
            reply({ items: dossierRows() }),
            reply({ items: dossierRows('client-second') }),
          ],
          [`GET ${detailPath('request-first')}`]: [
            opened.responder,
            catchUp.responder,
          ],
        });
        const view = renderNavigation({ onOpenClientDossier: openDossier });
        await waitFor(() => expect(listedSubjects()).toHaveLength(4));
        openRow('First Client Request');

        if (order === 'detail first') {
          await opened.settle(firstDetail());
          expect(returnAction()).toBeVisible();
          view.update({ clientIdentityRevision: 1 });
        } else {
          view.update({ clientIdentityRevision: 1 });
          await opened.settle(firstDetail());
        }
        expect(
          screen.getByText('Original source of First Client Request'),
        ).toBeVisible();
        expect(returnAction()).not.toBeInTheDocument();
        await catchUp.settle(firstDetail('client-second'));
        clickReturnAction();
        expect(openDossier).toHaveBeenCalledExactlyOnceWith('client-second');
      });

    it('withholds the target of a create confirmed after the change', async () => {
      const openDossier = vi.fn();
      const created = deferred();
      const catchUp = deferred();
      stubRoutes({
        [`GET ${listPath}`]: [
          reply({ items: [] }),
          reply({ items: [] }),
          reply({ items: dossierRows('client-second') }),
        ],
        'POST /api/commercial-intake/requests': [created.responder],
        [`GET ${detailPath('request-first')}`]: [catchUp.responder],
      });
      const view = renderNavigation({ onOpenClientDossier: openDossier });
      await screen.findByText(copy.empty('PRISMA-PRIM'));
      changeValue(
        screen.getByLabelText(copy.originalText),
        'Exact original text',
      );
      changeValue(
        screen.getByLabelText(copy.opportunityTitle),
        'Qualify the request',
      );
      changeValue(screen.getByLabelText(copy.nextAction), 'Call back');
      fireEvent.click(screen.getByRole('button', { name: copy.capture }));
      view.update({ clientIdentityRevision: 1 });

      await created.settle(firstDetail(), 201);
      expect(
        screen.getByText('Original source of First Client Request'),
      ).toBeVisible();
      expect(returnAction()).not.toBeInTheDocument();
      await catchUp.settle(firstDetail('client-second'));
      clickReturnAction();
      expect(openDossier).toHaveBeenCalledExactlyOnceWith('client-second');
    });

    it('withholds the target of a next-action save confirmed after the change', async () => {
      const openDossier = vi.fn();
      const saved = deferred();
      const catchUp = deferred();
      stubRoutes({
        [`GET ${listPath}`]: [
          reply({ items: dossierRows() }),
          reply({ items: dossierRows('client-second') }),
          reply({ items: dossierRows('client-second') }),
        ],
        [`GET ${detailPath('request-first')}`]: [
          reply(firstDetail()),
          catchUp.responder,
        ],
        [`POST ${nextActionPath('request-first')}`]: [saved.responder],
      });
      const view = renderNavigation(
        { onOpenClientDossier: openDossier },
        editor,
      );
      await waitFor(() => expect(listedSubjects()).toHaveLength(4));
      openRow('First Client Request');
      fireEvent.click(
        await screen.findByRole('button', { name: copy.editNextAction }),
      );
      changeValue(
        screen.getByLabelText(copy.nextAction),
        'Book the audit call',
      );
      fireEvent.click(
        screen.getByRole('button', { name: copy.saveNextAction }),
      );
      view.update({ clientIdentityRevision: 1 });

      await saved.settle({
        receipt: {
          opportunityId: 'opportunity-request-first',
          nextAction: 'Book the audit call',
          version: 2,
          outcome: 'updated',
        },
        request: {
          ...firstDetail(),
          initialOpportunity: {
            ...firstDetail().initialOpportunity,
            nextAction: 'Book the audit call',
            version: 2,
          },
        },
      });
      expect(screen.getByRole('alert')).toHaveTextContent(copy.nextActionSaved);
      expect(returnAction()).not.toBeInTheDocument();
      await catchUp.settle(firstDetail('client-second'));
      clickReturnAction();
      expect(openDossier).toHaveBeenCalledExactlyOnceWith('client-second');
    });

    it('keeps a next-action draft and its observed version through the current read', async () => {
      const openDossier = vi.fn();
      const transport = stubRoutes({
        [`GET ${listPath}`]: [
          reply({ items: dossierRows() }),
          reply({ items: dossierRows('client-second') }),
          reply({ items: dossierRows('client-second') }),
        ],
        [`GET ${detailPath('request-first')}`]: [
          reply(firstDetail()),
          reply({
            ...firstDetail('client-second'),
            initialOpportunity: {
              ...firstDetail().initialOpportunity,
              nextAction: 'Changed elsewhere',
              version: 3,
            },
          }),
        ],
        [`POST ${nextActionPath('request-first')}`]: [failure(409)],
      });
      const view = renderNavigation(
        { onOpenClientDossier: openDossier },
        editor,
      );
      await waitFor(() => expect(listedSubjects()).toHaveLength(4));
      openRow('First Client Request');
      fireEvent.click(
        await screen.findByRole('button', { name: copy.editNextAction }),
      );
      changeValue(screen.getByLabelText(copy.nextAction), 'Draft step');

      view.update({ clientIdentityRevision: 1 });
      await waitFor(() => expect(returnAction()).toBeVisible());
      expect(screen.getByLabelText(copy.nextAction)).toHaveValue('Draft step');
      expect(screen.getByText(`${copy.opportunityVersion}: 1`)).toBeVisible();
      fireEvent.click(
        screen.getByRole('button', { name: copy.saveNextAction }),
      );
      expect(await screen.findByRole('alert')).toHaveTextContent(
        copy.nextActionConflict,
      );
      expect(
        transport.calls(`POST ${nextActionPath('request-first')}`)[0]?.[1]
          ?.body,
      ).toBe(JSON.stringify({ expectedVersion: 1, nextAction: 'Draft step' }));
      clickReturnAction();
      expect(openDossier).toHaveBeenCalledExactlyOnceWith('client-second');
    });
  });
});
