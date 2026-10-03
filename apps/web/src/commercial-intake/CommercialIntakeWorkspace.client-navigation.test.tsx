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
const associationEditor: ActorContext = {
  ...editor,
  activeCompany: {
    ...companyA,
    clientPermissions: ['client.read'],
    commercialIntakePermissions: [
      ...intakePermissions,
      'commercial.opportunity.next_action.update',
      'commercial.request.client.associate',
    ],
    commercialIntakePermissionSetVersion: 'v3',
  },
};

const sharedName = 'Shared display name';
const firstDossier = {
  clientDossierId: 'client-first',
  displayName: sharedName,
};
const secondDossier = {
  clientDossierId: 'client-second',
  displayName: sharedName,
};
const associationClient = {
  id: '11111111-1111-4111-8111-111111111111',
  displayName: 'Accessible Client',
};

function row(id: string, subject: string, clientDossierId?: string) {
  return {
    id,
    subject,
    capturedAt: '2026-09-20T10:00:00.000Z',
    ...(clientDossierId === undefined
      ? {}
      : { clientDossierId, clientDisplayName: sharedName }),
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
    clientAssociationStatus:
      clientReference === undefined ? 'absent' : 'visible',
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
  clientAuthorityRevision?: number;
  clientRestriction?: { clientDossierId: string; displayName: string };
  clientIdentityRevision?: number;
  onOpenClientDossier?: (clientDossierId: string) => void;
  requestedRequest?: { clientRequestId: string; requestId: number };
};

function renderNavigation(initial: NavigationProps, initialActor = reader) {
  const identity = deterministicBrowserIdentity();
  const ignore = () => undefined;
  let props = initial;
  let currentActor = initialActor;
  const element = () => (
    <CommercialIntakeWorkspace
      actor={currentActor}
      identity={identity}
      onCompanyContextRejected={ignore}
      onActorRevalidated={ignore}
      onWorkspaceAccessRejected={ignore}
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
    expect(
      await screen.findByText(copy.nextActionSaved, {
        selector: '[role="alert"]',
      }),
    ).toBeVisible();
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
    expect(
      await screen.findByText(copy.nextActionUncertain, {
        selector: '[role="alert"]',
      }),
    ).toBeVisible();

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

  it('holds Back and a requested Request through an in-flight and uncertain Client association retry', async () => {
    const pendingAssociation = deferred();
    const original = detail('request-unlinked', 'Unlinked follow-up');
    const associated = {
      ...original,
      version: 2,
      clientAssociationStatus: 'visible',
      clientReference: {
        originalClientId: associationClient.id,
        currentClientId: associationClient.id,
        displayName: associationClient.displayName,
      },
    };
    const associationPath =
      'POST /api/commercial-intake/requests/request-unlinked/client-association';
    const transport = stubRoutes({
      [`GET ${listPath}`]: [reply({ items: dossierRows() })],
      [`GET ${detailPath('request-unlinked')}`]: [reply(original)],
      [`GET ${detailPath('request-second')}`]: [
        reply(detail('request-second', 'Second Client follow-up')),
      ],
      'GET /api/clients/search?query=Accessible': [
        reply([
          {
            id: associationClient.id,
            displayName: associationClient.displayName,
            relatedToActiveCompany: true,
          },
        ]),
      ],
      [associationPath]: [
        pendingAssociation.responder,
        reply({
          receipt: {
            requestId: original.id,
            version: 2,
            outcome: 'associated',
          },
          request: associated,
        }),
      ],
    });
    const view = renderNavigation({}, associationEditor);
    await waitFor(() => expect(listedSubjects()).toHaveLength(4));
    openRow('Unlinked follow-up');
    await screen.findByRole('heading', { name: copy.associateClient });
    changeValue(screen.getByLabelText(copy.clientSearch), 'Accessible');
    fireEvent.click(screen.getByRole('button', { name: copy.searchClients }));
    changeValue(
      await screen.findByLabelText(copy.existingClient),
      associationClient.id,
    );
    fireEvent.click(
      screen.getByRole('button', { name: copy.confirmClientAssociation }),
    );

    const back = screen.getByRole('button', { name: copy.back });
    expect(
      await screen.findByText(copy.clientAssociationLoading),
    ).toBeVisible();
    expect(back).toBeDisabled();
    view.update({
      requestedRequest: {
        clientRequestId: 'request-second',
        requestId: 1,
      },
    });
    expect(
      screen.getByText(copy.requestedAfterClientAssociation),
    ).toBeVisible();
    expect(
      screen.getByText('Original source of Unlinked follow-up'),
    ).toBeVisible();

    await pendingAssociation.settle({}, 500);
    expect(
      await screen.findByText(copy.clientAssociationUncertain),
    ).toBeVisible();
    expect(back).toBeDisabled();
    expect(
      screen.getByText('Original source of Unlinked follow-up'),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: copy.retryClientAssociation }),
    );

    expect(
      await screen.findByText('Original source of Second Client follow-up'),
    ).toBeVisible();
    const [first, retry] = transport.calls(associationPath);
    expect(transport.calls(associationPath)).toHaveLength(2);
    expect(retry?.[1]?.body).toBe(first?.[1]?.body);
    expect(keyOf(retry?.[1])).toBeDefined();
    expect(keyOf(retry?.[1])).toBe(keyOf(first?.[1]));
    expect(transport.unexpected).toEqual([]);
  });

  it('adds no list dossier when association returns only the original Client reference', async () => {
    const original = detail('request-unlinked', 'Unlinked follow-up');
    const transport = stubRoutes({
      [`GET ${listPath}`]: [reply({ items: dossierRows() })],
      [`GET ${detailPath('request-unlinked')}`]: [reply(original)],
      'GET /api/clients/search?query=Accessible': [
        reply([
          {
            id: associationClient.id,
            displayName: associationClient.displayName,
            relatedToActiveCompany: true,
          },
        ]),
      ],
      'POST /api/commercial-intake/requests/request-unlinked/client-association':
        [
          reply({
            receipt: {
              requestId: original.id,
              version: 2,
              outcome: 'associated',
            },
            request: {
              ...original,
              version: 2,
              clientAssociationStatus: 'visible',
              clientReference: {
                originalClientId: associationClient.id,
                displayName: associationClient.displayName,
              },
            },
          }),
        ],
    });
    renderNavigation({ onOpenClientDossier: vi.fn() }, associationEditor);
    await waitFor(() => expect(listedSubjects()).toHaveLength(4));
    openRow('Unlinked follow-up');
    await screen.findByRole('heading', { name: copy.associateClient });
    changeValue(screen.getByLabelText(copy.clientSearch), 'Accessible');
    fireEvent.click(screen.getByRole('button', { name: copy.searchClients }));
    changeValue(
      await screen.findByLabelText(copy.existingClient),
      associationClient.id,
    );
    fireEvent.click(
      screen.getByRole('button', { name: copy.confirmClientAssociation }),
    );
    await screen.findByText(copy.clientAssociationSuccess, {
      selector: '[role="alert"]',
    });
    const back = screen.getByRole('button', { name: copy.back });
    await waitFor(() => expect(back).toBeEnabled());
    fireEvent.click(back);

    const rowItem = within(requestList())
      .getByRole('button', { name: /^Unlinked follow-up/u })
      .closest('li');
    expect(rowItem).not.toBeNull();
    expect(
      within(requiredElement(rowItem)).queryByRole('button', {
        name: copy.openClientDossier,
      }),
    ).not.toBeInTheDocument();
    expect(
      within(requiredElement(rowItem)).getByText(
        `${copy.client}: ${associationClient.displayName}`,
      ),
    ).toBeVisible();
    expect(transport.unexpected).toEqual([]);
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
          items: [row('request-b', 'Company B Request', 'client-b')],
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
    expect(listedSubjects()).toEqual(['Company B Request']);
    const companyBRow = within(requestList()).getByRole('listitem');
    const companyBDossierAction = within(companyBRow).getByRole('button', {
      name: copy.openClientDossier,
    });
    expect(
      screen.getAllByRole('button', { name: copy.openClientDossier }),
    ).toEqual([companyBDossierAction]);
    fireEvent.click(companyBDossierAction);
    expect(openDossier).toHaveBeenCalledExactlyOnceWith('client-b');
  });

  describe('after a Client identity change', () => {
    it('keeps the uncertain Opportunity payload, observed version and key while catching up a new association', async () => {
      const catchUp = deferred();
      const original = detail('request-unlinked', 'Unlinked follow-up');
      const transport = stubRoutes({
        [`GET ${listPath}`]: [
          reply({ items: dossierRows() }),
          reply({ items: dossierRows() }),
        ],
        [`GET ${detailPath('request-unlinked')}`]: [
          reply(original),
          catchUp.responder,
        ],
        [`POST ${nextActionPath('request-unlinked')}`]: [
          networkFailure(),
          networkFailure(),
        ],
      });
      const view = renderNavigation({}, associationEditor);
      await waitFor(() => expect(listedSubjects()).toHaveLength(4));
      openRow('Unlinked follow-up');
      fireEvent.click(
        await screen.findByRole('button', { name: copy.editNextAction }),
      );
      changeValue(
        screen.getByLabelText(copy.nextAction),
        'Confirm the audit window',
      );
      fireEvent.click(
        screen.getByRole('button', { name: copy.saveNextAction }),
      );
      await screen.findByText(copy.nextActionUncertain, {
        selector: '[role="alert"]',
      });

      view.update({ clientIdentityRevision: 1 });
      await catchUp.settle({
        ...original,
        version: 2,
        clientAssociationStatus: 'visible',
        clientReference: {
          originalClientId: 'client-first',
          currentClientId: 'client-second',
          displayName: 'Current associated Client',
        },
        initialOpportunity: {
          ...original.initialOpportunity,
          nextAction: 'Changed elsewhere',
          version: 3,
          responsibleWorkspaceMembershipId: 'membership-other',
          responsibleActor: {
            workspaceMembershipId: 'membership-other',
            displayName: 'Other actor',
          },
        },
      });

      expect(screen.getByText('Current associated Client')).toBeVisible();
      expect(
        screen.queryByRole('heading', { name: copy.associateClient }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(copy.noClientAssociated),
      ).not.toBeInTheDocument();
      expect(screen.getByText(original.originalText)).toBeVisible();
      expect(screen.getByText(`${copy.opportunityVersion}: 1`)).toBeVisible();
      expect(screen.getByText(`${copy.responsible}: Iurie`)).toBeVisible();
      expect(screen.queryByText('Other actor')).not.toBeInTheDocument();
      expect(screen.getByText(copy.nextActionUncertain)).toBeVisible();
      fireEvent.click(
        screen.getByRole('button', { name: copy.retryNextAction }),
      );
      await screen.findByText(copy.nextActionUncertain, {
        selector: '[role="alert"]',
      });

      const commands = transport.calls(
        `POST ${nextActionPath('request-unlinked')}`,
      );
      expect(commands).toHaveLength(2);
      const [first, retry] = commands;
      expect(first?.[1]?.body).toBe(
        JSON.stringify({
          expectedVersion: 1,
          nextAction: 'Confirm the audit window',
        }),
      );
      expect(retry?.[1]?.body).toBe(first?.[1]?.body);
      expect(keyOf(retry?.[1])).toBeDefined();
      expect(keyOf(retry?.[1])).toBe(keyOf(first?.[1]));
      expect(transport.unexpected).toEqual([]);
    });

    it.each(['visible', 'hidden'])(
      'catches up a newly %s association without replacing the Opportunity draft',
      async (projection) => {
        const catchUp = deferred();
        const original = detail('request-unlinked', 'Unlinked follow-up');
        const refreshed = {
          ...original,
          version: 2,
          clientAssociationStatus: projection,
          ...(projection === 'visible'
            ? {
                clientReference: {
                  originalClientId: 'client-first',
                  currentClientId: 'client-second',
                  displayName: 'Current associated Client',
                },
              }
            : {}),
          initialOpportunity: {
            ...original.initialOpportunity,
            nextAction: 'Changed elsewhere',
            version: 3,
            responsibleWorkspaceMembershipId: 'membership-other',
            responsibleActor: {
              workspaceMembershipId: 'membership-other',
              displayName: 'Other actor',
            },
          },
        };
        const transport = stubRoutes({
          [`GET ${listPath}`]: [
            reply({ items: dossierRows() }),
            reply({ items: dossierRows() }),
          ],
          [`GET ${detailPath('request-unlinked')}`]: [
            reply(original),
            catchUp.responder,
          ],
          [`POST ${nextActionPath('request-unlinked')}`]: [failure(409)],
        });
        const openDossier = vi.fn();
        const view = renderNavigation(
          { onOpenClientDossier: openDossier },
          associationEditor,
        );
        await waitFor(() => expect(listedSubjects()).toHaveLength(4));
        openRow('Unlinked follow-up');
        await screen.findByRole('heading', { name: copy.associateClient });
        fireEvent.click(
          screen.getByRole('button', { name: copy.editNextAction }),
        );
        changeValue(screen.getByLabelText(copy.nextAction), 'Keep my draft');

        view.update({ clientIdentityRevision: 1 });
        await catchUp.settle(refreshed);

        expect(
          screen.queryByRole('heading', { name: copy.associateClient }),
        ).not.toBeInTheDocument();
        expect(
          screen.queryByText(copy.noClientAssociated),
        ).not.toBeInTheDocument();
        expect(screen.getByText(original.originalText)).toBeVisible();
        expect(screen.getByText(`${copy.opportunityVersion}: 1`)).toBeVisible();
        expect(
          screen.getByText(`${copy.nextAction}: Follow up Unlinked follow-up`),
        ).toBeVisible();
        expect(screen.getByText(`${copy.responsible}: Iurie`)).toBeVisible();
        expect(screen.queryByText('Other actor')).not.toBeInTheDocument();
        expect(screen.getByLabelText(copy.nextAction)).toHaveValue(
          'Keep my draft',
        );
        if (projection === 'visible') {
          expect(screen.getByText('Current associated Client')).toBeVisible();
          clickReturnAction();
          expect(openDossier).toHaveBeenCalledExactlyOnceWith('client-second');
        } else {
          expect(screen.getByText(copy.clientAssociationHidden)).toBeVisible();
          expect(returnAction()).not.toBeInTheDocument();
        }
        fireEvent.click(
          screen.getByRole('button', { name: copy.saveNextAction }),
        );
        await screen.findByText(copy.nextActionConflict, {
          selector: '[role="alert"]',
        });
        expect(
          transport.calls(`POST ${nextActionPath('request-unlinked')}`)[0]?.[1]
            ?.body,
        ).toBe(
          JSON.stringify({ expectedVersion: 1, nextAction: 'Keep my draft' }),
        );
      },
    );

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

    it('removes a list dossier when the current identity projection is no longer returned', async () => {
      const refreshed = deferred();
      const openDossier = vi.fn();
      stubRoutes({
        [`GET ${listPath}`]: [
          reply({
            items: [
              row('request-first', 'First Client Request', 'client-first'),
            ],
          }),
          refreshed.responder,
        ],
      });
      const current = renderNavigation({ onOpenClientDossier: openDossier });
      await screen.findByText(`${copy.client}: ${sharedName}`);
      expect(returnAction()).toBeVisible();

      current.update({ clientIdentityRevision: 1 });
      expect(returnAction()).not.toBeInTheDocument();
      await refreshed.settle({
        items: [row('request-first', 'First Client Request')],
      });
      expect(listedSubjects()).toEqual(['First Client Request']);
      expect(returnAction()).not.toBeInTheDocument();
      expect(
        screen.queryByText(`${copy.client}: ${sharedName}`),
      ).not.toBeInTheDocument();
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
      expect(
        screen.getByText(copy.nextActionSaved, {
          selector: '[role="alert"]',
        }),
      ).toBeVisible();
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
      expect(
        await screen.findByText(copy.nextActionConflict, {
          selector: '[role="alert"]',
        }),
      ).toBeVisible();
      expect(
        transport.calls(`POST ${nextActionPath('request-first')}`)[0]?.[1]
          ?.body,
      ).toBe(JSON.stringify({ expectedVersion: 1, nextAction: 'Draft step' }));
      clickReturnAction();
      expect(openDossier).toHaveBeenCalledExactlyOnceWith('client-second');
    });
  });
});

function clientAuthority(
  readable: boolean,
  assignmentId = 'client-grant-1',
): ActorContext {
  const company = editor.activeCompany;
  if (!company) throw new Error('Expected active Company');
  return {
    ...editor,
    activeCompany: {
      ...company,
      clientPermissions: readable ? ['client.read'] : [],
      clientPermissionAssignmentId: assignmentId,
      clientPermissionSetVersion: 'v2',
      opportunityManagerPermissions: ['commercial.opportunity.assign'],
      opportunityManagerPermissionAssignmentId: 'manager-1',
      opportunityManagerPermissionSetVersion: 'v1',
    },
  };
}
function freshDetail() {
  const request = firstDetail('current-client');
  return {
    ...request,
    clientReference: {
      ...request.clientReference,
      displayName: 'Fresh authorized Client',
    },
  };
}
function hiddenDetail() {
  return {
    ...firstDetail(),
    clientAssociationStatus: 'hidden',
    clientReference: undefined,
  };
}

describe('Commercial Intake current Client projection authority', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(['loss', 'replacement'])(
    'hides loaded detail immediately on %s and preserves the Opportunity draft through revalidation',
    async (change) => {
      const fresh = deferred();
      const api = stubRoutes({
        ['GET ' + listPath]: [
          reply({ items: dossierRows() }),
          reply({ items: [] }),
        ],
        ['GET ' + detailPath('request-first')]: [
          reply(firstDetail()),
          fresh.responder,
        ],
      });
      const view = renderNavigation(
        { onOpenClientDossier: vi.fn() },
        clientAuthority(true),
      );
      await waitFor(() => expect(listedSubjects()).toHaveLength(4));
      openRow('First Client Request');
      fireEvent.click(
        await screen.findByRole('button', { name: copy.editNextAction }),
      );
      changeValue(
        screen.getByLabelText(copy.nextAction),
        'Protected Opportunity draft',
      );
      view.selectActor(
        clientAuthority(change === 'replacement', 'client-grant-2'),
      );
      expect(screen.queryByText(sharedName)).not.toBeInTheDocument();
      expect(screen.getByText(copy.clientAssociationHidden)).toBeVisible();
      expect(returnAction()).not.toBeInTheDocument();
      expect(screen.getByLabelText(copy.nextAction)).toHaveValue(
        'Protected Opportunity draft',
      );
      await fresh.settle(
        change === 'replacement' ? freshDetail() : hiddenDetail(),
      );
      expect(screen.getByLabelText(copy.nextAction)).toHaveValue(
        'Protected Opportunity draft',
      );
      expect(
        screen.getByText('Original source of First Client Request'),
      ).toBeVisible();
      if (change === 'replacement')
        expect(screen.getByText('Fresh authorized Client')).toBeVisible();
      else expect(screen.queryByText(sharedName)).not.toBeInTheDocument();
      expect(api.unexpected).toEqual([]);
    },
  );

  it.each(['old first', 'current first'])(
    'ignores a late list after loss and regrant of the same assignment (%s)',
    async (order) => {
      const old = deferred();
      const current = deferred();
      const api = stubRoutes({
        ['GET ' + listPath]: [
          old.responder,
          reply({ items: [] }),
          current.responder,
        ],
      });
      const view = renderNavigation(
        { onOpenClientDossier: vi.fn() },
        clientAuthority(true),
      );
      await waitFor(() => expect(api.calls('GET ' + listPath)).toHaveLength(1));
      view.selectActor(clientAuthority(false));
      await waitFor(() => expect(api.calls('GET ' + listPath)).toHaveLength(2));
      view.selectActor(clientAuthority(true));
      await waitFor(() => expect(api.calls('GET ' + listPath)).toHaveLength(3));
      const freshRows = {
        items: [
          {
            ...row('request-first', 'First Client Request', 'current-client'),
            clientDisplayName: 'Fresh authorized Client',
          },
        ],
      };
      if (order === 'current first') await current.settle(freshRows);
      await old.settle({ items: dossierRows() });
      expect(
        screen.queryByText(new RegExp(sharedName)),
      ).not.toBeInTheDocument();
      if (order === 'old first') await current.settle(freshRows);
      expect(
        screen.getByText(new RegExp('Fresh authorized Client')),
      ).toBeVisible();
      expect(listedSubjects()).toEqual(['First Client Request']);
      expect(api.unexpected).toEqual([]);
    },
  );

  it('keeps a late ordinary detail projection hidden after loss and regrant until the current server read', async () => {
    const old = deferred();
    const current = deferred();
    const api = stubRoutes({
      ['GET ' + listPath]: [
        reply({ items: dossierRows() }),
        reply({ items: [] }),
        reply({ items: [] }),
      ],
      ['GET ' + detailPath('request-first')]: [
        old.responder,
        current.responder,
      ],
    });
    const view = renderNavigation(
      { onOpenClientDossier: vi.fn() },
      clientAuthority(true),
    );
    await waitFor(() => expect(listedSubjects()).toHaveLength(4));
    openRow('First Client Request');
    await waitFor(() =>
      expect(api.calls('GET ' + detailPath('request-first'))).toHaveLength(1),
    );
    view.selectActor(clientAuthority(false));
    view.selectActor(clientAuthority(true));
    await old.settle(firstDetail());
    expect(
      screen.getByText('Original source of First Client Request'),
    ).toBeVisible();
    expect(screen.queryByText(sharedName)).not.toBeInTheDocument();
    expect(returnAction()).not.toBeInTheDocument();
    await current.settle(freshDetail());
    expect(screen.getByText('Fresh authorized Client')).toBeVisible();
    expect(api.unexpected).toEqual([]);
  });

  it.each(['next-action', 'responsible'])(
    'settles a late %s business result without restoring its old Client projection',
    async (command) => {
      const saved = deferred();
      const firstRefresh = deferred();
      const path =
        command === 'next-action'
          ? nextActionPath('request-first')
          : '/api/commercial-intake/opportunities/opportunity-request-first/responsible';
      const api = stubRoutes({
        ['GET ' + listPath]: [
          reply({ items: dossierRows() }),
          reply({ items: [] }),
          reply({ items: [] }),
        ],
        ['GET ' + detailPath('request-first')]: [
          reply(firstDetail()),
          firstRefresh.responder,
        ],
        ['GET /api/commercial-intake/opportunities/opportunity-request-first/eligible-responsible-actors']:
          [
            reply({
              members: [
                {
                  workspaceMembershipId: 'membership-2',
                  displayLabel: 'Second member',
                },
              ],
            }),
          ],
        ['POST ' + path]: [saved.responder],
      });
      const view = renderNavigation(
        { onOpenClientDossier: vi.fn() },
        clientAuthority(true),
      );
      await waitFor(() => expect(listedSubjects()).toHaveLength(4));
      openRow('First Client Request');
      if (command === 'next-action') {
        fireEvent.click(
          await screen.findByRole('button', { name: copy.editNextAction }),
        );
        changeValue(screen.getByLabelText(copy.nextAction), 'Saved new action');
        fireEvent.click(
          screen.getByRole('button', { name: copy.saveNextAction }),
        );
      } else {
        fireEvent.click(
          await screen.findByRole('button', { name: copy.changeResponsible }),
        );
        changeValue(
          await screen.findByLabelText(copy.responsibleChoice),
          'membership-2',
        );
        fireEvent.click(
          screen.getByRole('button', { name: copy.saveResponsible }),
        );
      }
      await waitFor(() => expect(api.calls('POST ' + path)).toHaveLength(1));
      view.selectActor(clientAuthority(true, 'client-grant-2'));
      await firstRefresh.settle(freshDetail());
      const updated = {
        ...firstDetail(),
        initialOpportunity: {
          ...firstDetail().initialOpportunity,
          nextAction: 'Saved new action',
          version: 2,
        },
      };
      await saved.settle({
        receipt: {
          opportunityId: updated.initialOpportunity.id,
          version: 2,
          outcome: 'updated',
          nextAction: 'Saved new action',
          workspaceMembershipId: 'membership-1',
        },
        request: updated,
      });
      expect(screen.queryByText(sharedName)).not.toBeInTheDocument();
      expect(
        screen.getByText(copy.nextAction + ': Saved new action'),
      ).toBeVisible();
      expect(screen.getByText('Fresh authorized Client')).toBeVisible();
      expect(screen.getByText(copy.opportunityVersion + ': 2')).toBeVisible();
      expect(api.unexpected).toEqual([]);
    },
  );
});

describe('Commercial Intake projection boundary preserves unrelated work', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('preserves an exact uncertain Opportunity retry across Client read loss, regrant and an identity change', async () => {
    const api = stubRoutes({
      ['GET ' + listPath]: [
        reply({ items: dossierRows() }),
        reply({ items: [] }),
        reply({ items: [] }),
        reply({ items: [] }),
      ],
      ['GET ' + detailPath('request-first')]: [
        reply(firstDetail()),
        reply(hiddenDetail()),
        reply(hiddenDetail()),
        reply(freshDetail()),
      ],
      ['POST ' + nextActionPath('request-first')]: [failure(503), failure(503)],
    });
    const view = renderNavigation({}, clientAuthority(true));
    await waitFor(() => expect(listedSubjects()).toHaveLength(4));
    openRow('First Client Request');
    fireEvent.click(
      await screen.findByRole('button', { name: copy.editNextAction }),
    );
    changeValue(
      screen.getByLabelText(copy.nextAction),
      'Exact protected retry',
    );
    fireEvent.click(screen.getByRole('button', { name: copy.saveNextAction }));
    await screen.findByText(copy.nextActionUncertain);
    view.selectActor(clientAuthority(false));
    await screen.findByText(copy.clientAssociationHidden);
    view.update({ clientIdentityRevision: 1 });
    view.selectActor(clientAuthority(true));
    await screen.findByText('Fresh authorized Client');
    expect(screen.getByLabelText(copy.nextAction)).toHaveValue(
      'Exact protected retry',
    );
    fireEvent.click(screen.getByRole('button', { name: copy.retryNextAction }));
    await waitFor(() =>
      expect(api.calls('POST ' + nextActionPath('request-first'))).toHaveLength(
        2,
      ),
    );
    const calls = api.calls('POST ' + nextActionPath('request-first'));
    expect(calls[1]?.[1]?.body).toBe(calls[0]?.[1]?.body);
    expect(keyOf(calls[1]?.[1])).toBe(keyOf(calls[0]?.[1]));
    expect(calls[1]?.[1]?.body).toBe(
      JSON.stringify({
        expectedVersion: 1,
        nextAction: 'Exact protected retry',
      }),
    );
    expect(api.unexpected).toEqual([]);
  });

  it.each([true, false])(
    'retires only capture work containing a Client on authority loss (has Client: %s)',
    async (hasClient) => {
      const saved = deferred();
      const api = stubRoutes({
        ['GET ' + listPath]: [
          reply({ items: [] }),
          reply({ items: [] }),
          reply({ items: [] }),
        ],
        ['GET /api/clients/search?query=Shared']: [
          reply([
            {
              id: 'client-first',
              displayName: sharedName,
              relatedToActiveCompany: true,
            },
          ]),
        ],
        ['POST /api/commercial-intake/requests']: [saved.responder],
        ['GET ' + detailPath('request-first')]: [reply(hiddenDetail())],
      });
      const view = renderNavigation({}, clientAuthority(true));
      await screen.findByText(copy.empty('PRISMA-PRIM'));
      changeValue(
        screen.getByLabelText(copy.originalText),
        'Preserved original source',
      );
      changeValue(
        screen.getByLabelText(copy.sourceLabel),
        'Preserved source label',
      );
      changeValue(
        screen.getByLabelText(copy.opportunityTitle),
        'Preserved Opportunity',
      );
      changeValue(
        screen.getByLabelText(copy.nextAction),
        'Preserved next action',
      );
      if (hasClient) {
        changeValue(screen.getByLabelText(copy.clientSearch), 'Shared');
        fireEvent.click(
          screen.getByRole('button', { name: copy.searchClients }),
        );
        changeValue(
          await screen.findByLabelText(copy.existingClient),
          'client-first',
        );
      }
      fireEvent.click(screen.getByRole('button', { name: copy.capture }));
      await waitFor(() =>
        expect(api.calls('POST /api/commercial-intake/requests')).toHaveLength(
          1,
        ),
      );
      view.selectActor(clientAuthority(false));
      expect(
        api.calls('POST /api/commercial-intake/requests')[0]?.[1]?.signal
          ?.aborted,
      ).toBe(hasClient);
      expect(screen.getByLabelText(copy.originalText)).toHaveValue(
        'Preserved original source',
      );
      expect(screen.getByLabelText(copy.sourceLabel)).toHaveValue(
        'Preserved source label',
      );
      expect(
        screen.queryByLabelText(copy.existingClient),
      ).not.toBeInTheDocument();
      await saved.settle(firstDetail(), 201);
      expect(screen.queryByText(sharedName)).not.toBeInTheDocument();
      if (hasClient)
        expect(screen.getByLabelText(copy.originalText)).toHaveValue(
          'Preserved original source',
        );
      else
        expect(
          screen.getByText('Original source of First Client Request'),
        ).toBeVisible();
      expect(api.unexpected).toEqual([]);
    },
  );

  it('withdraws loaded Pricing and Offer Client projections and suppresses their late reads when Client authority changes', async () => {
    const currentRequest = deferred();
    const currentPricing = deferred();
    const currentOffer = deferred();
    const snapshot = {
      id: 'snapshot-1',
      opportunityId: 'opportunity-request-first',
      clientRequestId: 'request-first',
      clientReference: { displayName: 'Cached Snapshot Client' },
      calculatedByWorkspaceMembershipId: 'membership-1',
      pricingRuleVersion: { id: 'rule-1', versionNumber: 1 },
      currency: 'EUR',
      lines: [],
      subtotal: '0.00',
      taxTotal: '0.00',
      total: '0.00',
      calculatedAt: '2026-09-20T10:00:00.000Z',
      committedAt: '2026-09-20T10:00:00.000Z',
      provenance: 'ILLUSTRATIVE',
      provisional: true,
    };
    const fullActor = clientAuthority(true);
    const company = fullActor.activeCompany;
    if (!company) throw new Error('Expected active Company');
    const panelsActor: ActorContext = {
      ...fullActor,
      activeCompany: {
        ...company,
        pricingUserPermissions: [
          'commercial.offering.read',
          'commercial.pricing.configuration.read',
          'commercial.pricing.calculate',
          'commercial.pricing.snapshot.read',
        ],
        offerPermissions: ['commercial.offer.read', 'commercial.offer.prepare'],
      },
    };
    const snapshots =
      '/api/pricing/opportunities/opportunity-request-first/snapshots?limit=25';
    const api = stubRoutes({
      ['GET ' + listPath]: [
        reply({ items: dossierRows() }),
        reply({ items: [] }),
      ],
      ['GET ' + detailPath('request-first')]: [
        reply(firstDetail()),
        currentRequest.responder,
      ],
      ['GET /api/pricing-configuration/rule-scope']: [
        reply({ current: null }),
        reply({ current: null }),
      ],
      ['GET /api/commercial-catalogue/offerings?limit=50']: [
        reply({ items: [] }),
        reply({ items: [] }),
      ],
      ['GET /api/pricing/opportunities/opportunity-request-first/snapshots/snapshot-1']:
        [reply(snapshot)],
      ['GET ' + snapshots]: [
        reply({ items: [snapshot] }),
        reply({ items: [snapshot] }),
        currentPricing.responder,
      ],
      ['GET /api/offers/opportunities/opportunity-request-first']: [
        reply({ offer: null }),
        currentOffer.responder,
      ],
      ['GET /api/clients/client-first/legal-entities']: [
        reply({ clientVersion: 1, legalEntities: [] }),
      ],
    });
    const view = renderNavigation({}, panelsActor);
    await waitFor(() => expect(listedSubjects()).toHaveLength(4));
    openRow('First Client Request');
    fireEvent.click(
      await screen.findByRole('button', { name: /^Reopen snapshot:/u }),
    );
    await screen.findByText('Client: Cached Snapshot Client');
    expect(
      await screen.findByRole('combobox', { name: 'Legal recipient' }),
    ).toHaveTextContent(sharedName);
    view.selectActor({
      ...panelsActor,
      activeCompany: {
        ...panelsActor.activeCompany,
        id: company.id,
        displayName: company.displayName,
        clientPermissions: [],
      },
    });
    expect(
      screen.queryByText('Client: Cached Snapshot Client'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: 'Legal recipient' }),
    ).not.toBeInTheDocument();
    await currentRequest.settle(hiddenDetail());
    await currentPricing.settle({
      items: [{ ...snapshot, clientReference: undefined }],
    });
    await currentOffer.settle({ offer: null });
    expect(
      screen.queryByText('Client: Cached Snapshot Client'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(sharedName)).not.toBeInTheDocument();
    expect(api.unexpected).toEqual([]);
  });
});
