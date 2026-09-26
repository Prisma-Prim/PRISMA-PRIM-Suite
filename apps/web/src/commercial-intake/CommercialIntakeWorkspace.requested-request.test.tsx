import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const rows = [
  row('request-open', 'Opened Request'),
  row('request-requested', 'Requested Request'),
  row('request-dossier', 'Dossier Request', 'client-first'),
];

function detail(
  id: string,
  subject: string,
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

const listPath = '/api/commercial-intake/requests?limit=25';
const detailPath = (id: string) => `/api/commercial-intake/requests/${id}`;
const nextActionPath = (id: string) =>
  `/api/commercial-intake/opportunities/opportunity-${id}/next-action`;
const capturePath = 'POST /api/commercial-intake/requests';
const openedDetail = () => detail('request-open', 'Opened Request');
const requestedDetail = () => detail('request-requested', 'Requested Request');
const requested = (
  requestId: number,
  clientRequestId = 'request-requested',
) => ({
  clientRequestId,
  requestId,
});

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

/** Answers each `METHOD path` from its own queue. */
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
  const keys = () =>
    fetchMock.mock.calls.map(
      ([input, init]) => `${init?.method ?? 'GET'} ${input.toString()}`,
    );
  const calls = (key: string) =>
    fetchMock.mock.calls.filter((_, index) => keys()[index] === key);
  return { unexpected, calls, keys };
}

type WorkspaceProps = {
  requestedRequest?: { clientRequestId: string; requestId: number };
  clientRestriction?: { clientDossierId: string; displayName: string };
};

function renderWorkspace(initialActor: ActorContext = reader) {
  const identity = deterministicBrowserIdentity();
  let props: WorkspaceProps = {};
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
    update(next: WorkspaceProps) {
      props = { ...props, ...next };
      view.rerender(element());
    },
    selectActor(nextActor: ActorContext) {
      currentActor = nextActor;
      view.rerender(element());
    },
  };
}

function listedSubjects(): string[] {
  const list = screen.queryByRole('list', { name: copy.list });
  if (!list) return [];
  return within(list)
    .queryAllByRole('listitem')
    .map((item) => item.querySelector('strong')?.textContent ?? '');
}
function openRow(subject: string) {
  fireEvent.click(
    within(screen.getByRole('list', { name: copy.list })).getByRole('button', {
      name: new RegExp(`^${subject}`, 'u'),
    }),
  );
}
function heldNotice(): HTMLElement | null {
  const notices: string[] = [
    copy.requestedAfterCapture,
    copy.requestedAfterNextActionEdit,
  ];
  return (
    screen
      .queryAllByRole('status')
      .find((status) => notices.includes(status.textContent ?? '')) ?? null
  );
}
function keyOf(init: RequestInit | undefined): string | undefined {
  const headers = init?.headers;
  if (!headers || headers instanceof Headers || Array.isArray(headers))
    return undefined;
  return headers['idempotency-key'];
}
function fillCapture() {
  fireEvent.change(screen.getByLabelText(copy.originalText), {
    target: { value: 'Exact original text' },
  });
  fireEvent.change(screen.getByLabelText(copy.opportunityTitle), {
    target: { value: 'Qualify the request' },
  });
  fireEvent.change(screen.getByLabelText(copy.nextAction), {
    target: { value: 'Call back' },
  });
}
function expectCaptureDraft() {
  expect(screen.getByLabelText(copy.originalText)).toHaveValue(
    'Exact original text',
  );
  expect(screen.getByLabelText(copy.opportunityTitle)).toHaveValue(
    'Qualify the request',
  );
  expect(screen.getByLabelText(copy.nextAction)).toHaveValue('Call back');
}
async function chooseClient() {
  fireEvent.change(screen.getByLabelText(copy.clientSearch), {
    target: { value: 'Synthetic' },
  });
  fireEvent.click(screen.getByRole('button', { name: copy.searchClients }));
  fireEvent.change(await screen.findByLabelText(copy.existingClient), {
    target: { value: 'client-1' },
  });
}
const clientSearchPath = 'GET /api/clients/search?query=Synthetic';
const clientChoices = () =>
  reply([
    {
      id: 'client-1',
      displayName: 'Synthetic Client',
      relatedToActiveCompany: true,
    },
  ]);
async function editOpenedRequest(draft: string) {
  openRow('Opened Request');
  fireEvent.click(
    await screen.findByRole('button', { name: copy.editNextAction }),
  );
  fireEvent.change(screen.getByLabelText(copy.nextAction), {
    target: { value: draft },
  });
}
async function settleEffects() {
  await act(async () => {
    await new Promise((done) => setTimeout(done, 0));
  });
}

describe('CommercialIntakeWorkspace requested Request', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it('opens the requested Request with one detail read and reads it fresh when requested again', async () => {
    const transport = stubRoutes({
      [`GET ${listPath}`]: [reply({ items: rows })],
      [`GET ${detailPath('request-requested')}`]: [
        reply(requestedDetail()),
        reply(requestedDetail()),
      ],
    });
    const view = renderWorkspace();
    await waitFor(() => expect(listedSubjects()).toHaveLength(3));

    view.update({ requestedRequest: requested(1) });
    expect(
      await screen.findByText('Original source of Requested Request'),
    ).toBeVisible();
    expect(
      transport.calls(`GET ${detailPath('request-requested')}`),
    ).toHaveLength(1);

    view.update({ requestedRequest: requested(2) });
    await waitFor(() =>
      expect(
        transport.calls(`GET ${detailPath('request-requested')}`),
      ).toHaveLength(2),
    );
    expect(
      await screen.findByText('Original source of Requested Request'),
    ).toBeVisible();
    expect(transport.unexpected).toEqual([]);
  });

  it('lets a newer request supersede an older one whose reply arrives late', async () => {
    const late = deferred();
    stubRoutes({
      [`GET ${listPath}`]: [reply({ items: rows })],
      [`GET ${detailPath('request-open')}`]: [late.responder],
      [`GET ${detailPath('request-requested')}`]: [reply(requestedDetail())],
    });
    const view = renderWorkspace();
    await waitFor(() => expect(listedSubjects()).toHaveLength(3));

    view.update({ requestedRequest: requested(1, 'request-open') });
    view.update({ requestedRequest: requested(2) });
    expect(
      await screen.findByText('Original source of Requested Request'),
    ).toBeVisible();
    await late.settle(openedDetail());
    expect(
      screen.queryByText('Original source of Opened Request'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Original source of Requested Request'),
    ).toBeVisible();
  });

  it.each([
    ['missing', failure(404)],
    ['failing', failure(500)],
    ['unreachable', networkFailure()],
  ])(
    'reports a %s requested Request like its row and keeps the list',
    async (_, outcome) => {
      stubRoutes({
        [`GET ${listPath}`]: [reply({ items: rows })],
        [`GET ${detailPath('request-requested')}`]: [outcome],
      });
      const view = renderWorkspace();
      await waitFor(() => expect(listedSubjects()).toHaveLength(3));

      view.update({ requestedRequest: requested(1) });
      expect(await screen.findByRole('alert')).toHaveTextContent(copy.error);
      expect(listedSubjects()).toHaveLength(3);
      expect(
        screen.queryByText('Original source of Requested Request'),
      ).not.toBeInTheDocument();
    },
  );

  it('shows the existing denied state when revalidation confirms the lost read', async () => {
    const actorRevalidated = vi.fn();
    stubRoutes({
      [`GET ${listPath}`]: [reply({ items: rows })],
      [`GET ${detailPath('request-requested')}`]: [failure(403)],
      'GET /api/access/current-actor': [reply(reader)],
    });
    const identity = deterministicBrowserIdentity();
    const view = render(
      <CommercialIntakeWorkspace
        actor={reader}
        identity={identity}
        onCompanyContextRejected={() => undefined}
        onActorRevalidated={actorRevalidated}
      />,
    );
    await waitFor(() => expect(listedSubjects()).toHaveLength(3));

    view.rerender(
      <CommercialIntakeWorkspace
        actor={reader}
        identity={identity}
        onCompanyContextRejected={() => undefined}
        onActorRevalidated={actorRevalidated}
        requestedRequest={requested(1)}
      />,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(copy.denied);
    expect(actorRevalidated).toHaveBeenCalledWith(reader);
    expect(listedSubjects()).toEqual([]);
  });

  it('rejects the session when the requested read is unauthenticated', async () => {
    stubRoutes({
      [`GET ${listPath}`]: [reply({ items: rows })],
      [`GET ${detailPath('request-requested')}`]: [failure(401)],
    });
    const view = renderWorkspace();
    await waitFor(() => expect(listedSubjects()).toHaveLength(3));

    view.update({ requestedRequest: requested(1) });
    await waitFor(() =>
      expect(sessionStorage.getItem('deterministic-auth-state')).toBe(
        'signed-out',
      ),
    );
    expect(
      screen.queryByText('Original source of Requested Request'),
    ).not.toBeInTheDocument();
  });

  it('waits for a pending capture without aborting it, then opens after its reads', async () => {
    const capture = deferred();
    const transport = stubRoutes({
      [`GET ${listPath}`]: [
        reply({ items: rows }),
        reply({ items: [row('request-new', 'New Request'), ...rows] }),
      ],
      [capturePath]: [capture.responder],
      [`GET ${detailPath('request-requested')}`]: [reply(requestedDetail())],
    });
    const view = renderWorkspace();
    await waitFor(() => expect(listedSubjects()).toHaveLength(3));
    fillCapture();
    fireEvent.click(screen.getByRole('button', { name: copy.capture }));
    await waitFor(() => expect(transport.calls(capturePath)).toHaveLength(1));

    view.update({ requestedRequest: requested(1) });
    expect(heldNotice()).toHaveTextContent(copy.requestedAfterCapture);
    const [[, captureInit]] = transport.calls(capturePath);
    expect(captureInit?.signal?.aborted).toBe(false);
    expect(
      transport.calls(`GET ${detailPath('request-requested')}`),
    ).toHaveLength(0);

    await capture.settle(detail('request-new', 'New Request'), 201);
    expect(
      await screen.findByText('Original source of Requested Request'),
    ).toBeVisible();
    // The capture's own list reload completed before the requested read.
    expect(transport.keys()).toEqual([
      `GET ${listPath}`,
      capturePath,
      `GET ${listPath}`,
      `GET ${detailPath('request-requested')}`,
    ]);
    expect(heldNotice()).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: copy.back }));
    expect(listedSubjects()).toContain('New Request');
    expect(transport.unexpected).toEqual([]);
  });

  it('holds a request behind an uncertain capture and opens it once the exact retry is confirmed', async () => {
    const transport = stubRoutes({
      [`GET ${listPath}`]: [
        reply({ items: rows }),
        reply({ items: [row('request-new', 'New Request'), ...rows] }),
      ],
      [capturePath]: [
        networkFailure(),
        reply(detail('request-new', 'New Request'), 201),
      ],
      [`GET ${detailPath('request-requested')}`]: [reply(requestedDetail())],
    });
    const view = renderWorkspace();
    await waitFor(() => expect(listedSubjects()).toHaveLength(3));
    fillCapture();
    fireEvent.click(screen.getByRole('button', { name: copy.capture }));
    expect(await screen.findByRole('alert')).toHaveTextContent(copy.error);

    view.update({ requestedRequest: requested(1) });
    await settleEffects();
    expect(heldNotice()).toHaveTextContent(copy.requestedAfterCapture);
    expect(screen.getByRole('alert')).toHaveTextContent(copy.error);
    expect(screen.getByLabelText(copy.originalText)).toHaveValue(
      'Exact original text',
    );
    expect(
      transport.calls(`GET ${detailPath('request-requested')}`),
    ).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: copy.capture }));
    expect(
      await screen.findByText('Original source of Requested Request'),
    ).toBeVisible();
    const [first, retry] = transport.calls(capturePath);
    expect(retry?.[1]?.body).toBe(first?.[1]?.body);
    expect(keyOf(retry?.[1])).toBeDefined();
    expect(keyOf(retry?.[1])).toBe(keyOf(first?.[1]));
    expect(transport.calls(`GET ${listPath}`)).toHaveLength(2);
  });

  it('lets a chosen row supersede a request held behind an uncertain capture', async () => {
    const transport = stubRoutes({
      [`GET ${listPath}`]: [reply({ items: rows })],
      [capturePath]: [networkFailure(), networkFailure()],
      [`GET ${detailPath('request-open')}`]: [reply(openedDetail())],
    });
    const view = renderWorkspace();
    await waitFor(() => expect(listedSubjects()).toHaveLength(3));
    fillCapture();
    fireEvent.click(screen.getByRole('button', { name: copy.capture }));
    expect(await screen.findByRole('alert')).toHaveTextContent(copy.error);
    view.update({ requestedRequest: requested(1) });
    await settleEffects();

    openRow('Opened Request');
    expect(
      await screen.findByText('Original source of Opened Request'),
    ).toBeVisible();
    expect(heldNotice()).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: copy.back }));
    expect(screen.getByLabelText(copy.originalText)).toHaveValue(
      'Exact original text',
    );
    fireEvent.click(screen.getByRole('button', { name: copy.capture }));
    await waitFor(() => expect(transport.calls(capturePath)).toHaveLength(2));
    const [first, retry] = transport.calls(capturePath);
    expect(keyOf(retry?.[1])).toBe(keyOf(first?.[1]));
    await settleEffects();
    expect(
      transport.calls(`GET ${detailPath('request-requested')}`),
    ).toHaveLength(0);
  });

  it.each([
    [
      'a validation rejection',
      400,
      {
        code: 'VALIDATION_ERROR',
        field: 'originalText',
        message: 'Original text is invalid.',
      },
    ],
    ['an unavailable Client', 404, { code: 'CLIENT_REFERENCE_UNAVAILABLE' }],
    ['an unavailable Client', 409, { code: 'CLIENT_REFERENCE_UNAVAILABLE' }],
  ])(
    'opens a request held behind a pending capture once %s (%i) confirms nothing was captured, keeping the draft',
    async (_, status, body) => {
      const capture = deferred();
      const transport = stubRoutes({
        [`GET ${listPath}`]: [reply({ items: rows })],
        [clientSearchPath]: [clientChoices()],
        [capturePath]: [capture.responder],
        [`GET ${detailPath('request-requested')}`]: [reply(requestedDetail())],
      });
      const view = renderWorkspace();
      await waitFor(() => expect(listedSubjects()).toHaveLength(3));
      fillCapture();
      await chooseClient();
      fireEvent.click(screen.getByRole('button', { name: copy.capture }));
      await waitFor(() => expect(transport.calls(capturePath)).toHaveLength(1));
      view.update({ requestedRequest: requested(1) });
      expect(heldNotice()).toHaveTextContent(copy.requestedAfterCapture);

      await capture.settle(body, status);
      expect(
        await screen.findByText('Original source of Requested Request'),
      ).toBeVisible();
      expect(heldNotice()).not.toBeInTheDocument();
      // Nothing was captured, so no list reload precedes the requested read.
      expect(transport.keys()).toEqual([
        `GET ${listPath}`,
        clientSearchPath,
        capturePath,
        `GET ${detailPath('request-requested')}`,
      ]);
      fireEvent.click(screen.getByRole('button', { name: copy.back }));
      expectCaptureDraft();
      expect(screen.getByLabelText(copy.existingClient)).toHaveValue(
        'client-1',
      );
      expect(transport.unexpected).toEqual([]);
    },
  );

  it('opens a request held behind an uncertain capture once its exact retry is rejected as invalid', async () => {
    const transport = stubRoutes({
      [`GET ${listPath}`]: [reply({ items: rows })],
      [capturePath]: [
        networkFailure(),
        reply(
          {
            code: 'VALIDATION_ERROR',
            field: 'originalText',
            message: 'Original text is invalid.',
          },
          400,
        ),
      ],
      [`GET ${detailPath('request-requested')}`]: [reply(requestedDetail())],
    });
    const view = renderWorkspace();
    await waitFor(() => expect(listedSubjects()).toHaveLength(3));
    fillCapture();
    fireEvent.click(screen.getByRole('button', { name: copy.capture }));
    expect(await screen.findByRole('alert')).toHaveTextContent(copy.error);
    view.update({ requestedRequest: requested(1) });
    await settleEffects();
    expect(heldNotice()).toHaveTextContent(copy.requestedAfterCapture);

    fireEvent.click(screen.getByRole('button', { name: copy.capture }));
    expect(
      await screen.findByText('Original source of Requested Request'),
    ).toBeVisible();
    const [first, retry] = transport.calls(capturePath);
    expect(retry?.[1]?.body).toBe(first?.[1]?.body);
    expect(keyOf(retry?.[1])).toBeDefined();
    expect(keyOf(retry?.[1])).toBe(keyOf(first?.[1]));
    expect(transport.calls(`GET ${listPath}`)).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: copy.back }));
    expectCaptureDraft();
    expect(transport.unexpected).toEqual([]);
  });

  it.each([
    ['a server failure', failure(500)],
    ['an unreadable success', reply({ id: 'request-new' }, 201)],
  ])(
    'keeps a request held after %s and retries the capture with the exact body and key',
    async (_, outcome) => {
      const transport = stubRoutes({
        [`GET ${listPath}`]: [
          reply({ items: rows }),
          reply({ items: [row('request-new', 'New Request'), ...rows] }),
        ],
        [capturePath]: [
          outcome,
          reply(detail('request-new', 'New Request'), 201),
        ],
        [`GET ${detailPath('request-requested')}`]: [reply(requestedDetail())],
      });
      const view = renderWorkspace();
      await waitFor(() => expect(listedSubjects()).toHaveLength(3));
      fillCapture();
      fireEvent.click(screen.getByRole('button', { name: copy.capture }));
      expect(await screen.findByRole('alert')).toHaveTextContent(copy.error);
      view.update({ requestedRequest: requested(1) });
      await settleEffects();
      expect(heldNotice()).toHaveTextContent(copy.requestedAfterCapture);
      expectCaptureDraft();
      expect(
        transport.calls(`GET ${detailPath('request-requested')}`),
      ).toHaveLength(0);

      fireEvent.click(screen.getByRole('button', { name: copy.capture }));
      expect(
        await screen.findByText('Original source of Requested Request'),
      ).toBeVisible();
      const [first, retry] = transport.calls(capturePath);
      expect(retry?.[1]?.body).toBe(first?.[1]?.body);
      expect(keyOf(retry?.[1])).toBeDefined();
      expect(keyOf(retry?.[1])).toBe(keyOf(first?.[1]));
      expect(transport.unexpected).toEqual([]);
    },
  );

  it('retires a request held behind a capture whose access is denied', async () => {
    const capture = deferred();
    const transport = stubRoutes({
      [`GET ${listPath}`]: [reply({ items: rows })],
      [capturePath]: [capture.responder],
      'GET /api/access/current-actor': [reply(reader)],
    });
    const view = renderWorkspace();
    await waitFor(() => expect(listedSubjects()).toHaveLength(3));
    fillCapture();
    fireEvent.click(screen.getByRole('button', { name: copy.capture }));
    await waitFor(() => expect(transport.calls(capturePath)).toHaveLength(1));
    view.update({ requestedRequest: requested(1) });
    expect(heldNotice()).toHaveTextContent(copy.requestedAfterCapture);

    await capture.settle({}, 403);
    expect(await screen.findByRole('alert')).toHaveTextContent(copy.denied);
    await settleEffects();
    expect(
      transport.calls(`GET ${detailPath('request-requested')}`),
    ).toHaveLength(0);
    expect(transport.unexpected).toEqual([]);
  });

  it('holds a request behind an open next-action edit, keeps the draft and opens it on cancel', async () => {
    const transport = stubRoutes({
      [`GET ${listPath}`]: [reply({ items: rows })],
      [`GET ${detailPath('request-open')}`]: [reply(openedDetail())],
      [`GET ${detailPath('request-requested')}`]: [reply(requestedDetail())],
    });
    const view = renderWorkspace(editor);
    await waitFor(() => expect(listedSubjects()).toHaveLength(3));
    await editOpenedRequest('Book the audit call');

    view.update({ requestedRequest: requested(1) });
    await settleEffects();
    expect(heldNotice()).toHaveTextContent(copy.requestedAfterNextActionEdit);
    expect(screen.getByLabelText(copy.nextAction)).toHaveValue(
      'Book the audit call',
    );
    expect(screen.getByText('Original source of Opened Request')).toBeVisible();
    expect(
      transport.calls(`GET ${detailPath('request-requested')}`),
    ).toHaveLength(0);

    fireEvent.click(
      screen.getByRole('button', { name: copy.cancelNextAction }),
    );
    expect(
      await screen.findByText('Original source of Requested Request'),
    ).toBeVisible();
    expect(heldNotice()).not.toBeInTheDocument();
    expect(
      transport.calls(`GET ${detailPath('request-requested')}`),
    ).toHaveLength(1);
  });

  it('holds a request behind a pending save without aborting it and opens after the saved result settles', async () => {
    const save = deferred();
    const transport = stubRoutes({
      [`GET ${listPath}`]: [reply({ items: rows }), reply({ items: rows })],
      [`GET ${detailPath('request-open')}`]: [reply(openedDetail())],
      [`POST ${nextActionPath('request-open')}`]: [save.responder],
      [`GET ${detailPath('request-requested')}`]: [reply(requestedDetail())],
    });
    const view = renderWorkspace(editor);
    await waitFor(() => expect(listedSubjects()).toHaveLength(3));
    await editOpenedRequest('Book the audit call');
    fireEvent.click(screen.getByRole('button', { name: copy.saveNextAction }));
    await waitFor(() =>
      expect(
        transport.calls(`POST ${nextActionPath('request-open')}`),
      ).toHaveLength(1),
    );

    view.update({ requestedRequest: requested(1) });
    // A newer activation supersedes the held one.
    view.update({ requestedRequest: requested(2) });
    expect(heldNotice()).toHaveTextContent(copy.requestedAfterNextActionEdit);
    const [[, saveInit]] = transport.calls(
      `POST ${nextActionPath('request-open')}`,
    );
    expect(saveInit?.signal?.aborted).toBe(false);

    await save.settle({
      receipt: {
        opportunityId: 'opportunity-request-open',
        nextAction: 'Book the audit call',
        version: 2,
        outcome: 'updated',
      },
      request: detail('request-open', 'Opened Request', {
        nextAction: 'Book the audit call',
        version: 2,
      }),
    });
    expect(
      await screen.findByText('Original source of Requested Request'),
    ).toBeVisible();
    // The save's own list reload completed before the requested read.
    expect(transport.keys()).toEqual([
      `GET ${listPath}`,
      `GET ${detailPath('request-open')}`,
      `POST ${nextActionPath('request-open')}`,
      `GET ${listPath}`,
      `GET ${detailPath('request-requested')}`,
    ]);
    expect(transport.unexpected).toEqual([]);
  });

  it('holds a request behind an uncertain save and keeps its payload, observed version and key', async () => {
    const transport = stubRoutes({
      [`GET ${listPath}`]: [reply({ items: rows }), reply({ items: rows })],
      [`GET ${detailPath('request-open')}`]: [reply(openedDetail())],
      [`POST ${nextActionPath('request-open')}`]: [
        networkFailure(),
        reply({
          receipt: {
            opportunityId: 'opportunity-request-open',
            nextAction: 'Confirm the audit window',
            version: 2,
            outcome: 'updated',
          },
          request: detail('request-open', 'Opened Request', {
            nextAction: 'Confirm the audit window',
            version: 2,
          }),
        }),
      ],
      [`GET ${detailPath('request-requested')}`]: [reply(requestedDetail())],
    });
    const view = renderWorkspace(editor);
    await waitFor(() => expect(listedSubjects()).toHaveLength(3));
    await editOpenedRequest('Confirm the audit window');
    fireEvent.click(screen.getByRole('button', { name: copy.saveNextAction }));
    expect(
      await screen.findByText(copy.nextActionUncertain, {
        selector: '[role="alert"]',
      }),
    ).toBeVisible();

    view.update({ requestedRequest: requested(1) });
    await settleEffects();
    expect(heldNotice()).toHaveTextContent(copy.requestedAfterNextActionEdit);
    expect(
      screen.getByText(copy.nextActionUncertain, {
        selector: '[role="alert"]',
      }),
    ).toBeVisible();
    expect(
      transport.calls(`GET ${detailPath('request-requested')}`),
    ).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: copy.retryNextAction }));
    expect(
      await screen.findByText('Original source of Requested Request'),
    ).toBeVisible();
    const [first, retry] = transport.calls(
      `POST ${nextActionPath('request-open')}`,
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

  it('composes with the dossier restriction, the text filter and the loaded pages', async () => {
    const transport = stubRoutes({
      [`GET ${listPath}`]: [reply({ items: rows })],
      [`GET ${detailPath('request-requested')}`]: [reply(requestedDetail())],
    });
    const view = renderWorkspace();
    view.update({ clientRestriction: firstDossier });
    await waitFor(() => expect(listedSubjects()).toEqual(['Dossier Request']));
    fireEvent.change(screen.getByLabelText(copy.filterLabel), {
      target: { value: 'Dossier' },
    });

    view.update({ requestedRequest: requested(1) });
    expect(
      await screen.findByText('Original source of Requested Request'),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: copy.back }));
    expect(listedSubjects()).toEqual(['Dossier Request']);
    expect(
      screen.getByRole('group', { name: copy.restrictionLabel(sharedName) }),
    ).toBeVisible();
    expect(screen.getByLabelText(copy.filterLabel)).toHaveValue('Dossier');
    expect(transport.calls(`GET ${listPath}`)).toHaveLength(1);
  });

  it('retires a held request and ignores a late reply when the active Company changes', async () => {
    const late = deferred();
    const transport = stubRoutes({
      [`GET ${listPath}`]: [
        reply({ items: rows }),
        reply({ items: [row('request-b', 'Company B Request')] }),
        reply({ items: rows }),
        reply({ items: [row('request-b', 'Company B Request')] }),
      ],
      [`GET ${detailPath('request-requested')}`]: [late.responder],
      [`GET ${detailPath('request-open')}`]: [reply(openedDetail())],
    });
    const view = renderWorkspace(editor);
    await waitFor(() => expect(listedSubjects()).toHaveLength(3));

    view.update({ requestedRequest: requested(1) });
    await waitFor(() =>
      expect(
        transport.calls(`GET ${detailPath('request-requested')}`),
      ).toHaveLength(1),
    );
    const companyB = actorFor({ id: 'company-2', displayName: 'BIC' }, true);
    view.selectActor(companyB);
    await waitFor(() =>
      expect(listedSubjects()).toEqual(['Company B Request']),
    );
    await late.settle(requestedDetail());
    expect(
      screen.queryByText('Original source of Requested Request'),
    ).not.toBeInTheDocument();

    // A request held behind an edit is retired with the Company as well.
    view.selectActor(editor);
    await waitFor(() => expect(listedSubjects()).toHaveLength(3));
    await editOpenedRequest('Book the audit call');
    view.update({ requestedRequest: requested(2) });
    view.selectActor(companyB);
    await waitFor(() =>
      expect(listedSubjects()).toEqual(['Company B Request']),
    );
    await settleEffects();
    expect(heldNotice()).not.toBeInTheDocument();
    expect(
      transport.calls(`GET ${detailPath('request-requested')}`),
    ).toHaveLength(1);
  });

  it('retires a held request the shell no longer requests', async () => {
    const transport = stubRoutes({
      [`GET ${listPath}`]: [reply({ items: rows })],
      [`GET ${detailPath('request-open')}`]: [reply(openedDetail())],
    });
    const view = renderWorkspace(editor);
    await waitFor(() => expect(listedSubjects()).toHaveLength(3));
    await editOpenedRequest('Book the audit call');
    view.update({ requestedRequest: requested(1) });
    await settleEffects();
    expect(heldNotice()).toBeVisible();

    view.update({ requestedRequest: undefined });
    expect(heldNotice()).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: copy.cancelNextAction }),
    );
    await settleEffects();
    expect(screen.getByText('Original source of Opened Request')).toBeVisible();
    expect(
      transport.calls(`GET ${detailPath('request-requested')}`),
    ).toHaveLength(0);
  });
});
