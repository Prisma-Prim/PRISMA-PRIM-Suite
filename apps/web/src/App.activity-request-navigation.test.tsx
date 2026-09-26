import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import type { ActorContext } from './access-types';

const companyA = { id: 'company-a', displayName: 'Company A' };
const companyB = { id: 'company-b', displayName: 'Company B' };
const membershipId = 'membership-1';
const requestId = 'request-358';
const opportunityId = 'opportunity-358';
const subject = 'Pregătire audit demo';
const requestedAfterNextActionEdit =
  'The requested Client Request opens after the next-action edit is saved or cancelled.';

type Transport = {
  intakeAssignment: string | undefined;
  requestCreate: boolean;
  forbidDetail: boolean;
  detailReplies: Array<() => Promise<Response>>;
  detailReads: string[];
  mutations: string[];
};

function actorFor(companyId: string, state: Transport): ActorContext {
  return {
    internalUserId: 'user-1',
    workspaceMembershipId: membershipId,
    workspaceId: 'workspace-1',
    workspaceName: 'PRISMA Workspace',
    displayName: 'Ada Ionescu',
    email: 'ada@example.test',
    active: true,
    workspacePermissions: [],
    activeCompany: {
      ...(companyId === companyB.id ? companyB : companyA),
      clientPermissions: [],
      commercialActivityPermissions: ['commercial.activity.read'],
      ...(state.intakeAssignment
        ? {
            commercialIntakePermissions: [
              'commercial.request.read',
              ...(state.requestCreate
                ? (['commercial.request.create'] as const)
                : []),
              'commercial.opportunity.read',
              'commercial.opportunity.create',
              'commercial.opportunity.next_action.update',
            ],
            commercialIntakePermissionAssignmentId: state.intakeAssignment,
            commercialIntakePermissionSetVersion: 'v2',
          }
        : {}),
    },
  };
}

const actor = { internalUserId: 'user-1', displayName: 'Ada Ionescu' };
function commercialEvents(companyId: string) {
  return [
    {
      id: 'event-next-action',
      action: 'opportunity.next_action.updated',
      occurredAt: '2026-09-24T10:10:00.000Z',
      actor,
      target: {
        type: 'opportunity',
        opportunityId,
        clientRequestId: requestId,
        companyId,
      },
      metadata: {},
    },
    {
      id: 'event-project',
      action: 'project.created',
      occurredAt: '2026-09-24T10:07:00.000Z',
      actor,
      target: {
        type: 'project',
        projectId: 'project-1',
        projectTitle: 'Audit preparation',
        companyId,
      },
      metadata: {},
    },
    {
      id: 'event-opportunity',
      action: 'opportunity.created',
      occurredAt: '2026-09-24T10:05:00.000Z',
      actor,
      target: {
        type: 'opportunity',
        opportunityId,
        clientRequestId: requestId,
        companyId,
      },
      metadata: {},
    },
    {
      id: 'event-request',
      action: 'client_request.created',
      occurredAt: '2026-09-24T10:05:00.000Z',
      actor,
      target: { type: 'client_request', clientRequestId: requestId, companyId },
      metadata: {},
    },
  ];
}

function requestRow() {
  return {
    id: requestId,
    subject,
    capturedAt: '2026-09-24T10:05:00.000Z',
    initialOpportunity: {
      title: 'Audit readiness',
      nextAction: 'Call the director',
      responsibleActor: {
        workspaceMembershipId: membershipId,
        displayName: 'Ada Ionescu',
      },
    },
  };
}

function requestDetail() {
  return {
    id: requestId,
    companyId: companyA.id,
    sourceKind: 'MANUAL_TEXT',
    sourceLabel: null,
    reportedReceivedAt: null,
    subject,
    originalText: `Original source of ${subject}`,
    capturedByWorkspaceMembershipId: membershipId,
    capturedAt: '2026-09-24T10:05:00.000Z',
    version: 1,
    initialOpportunity: {
      id: opportunityId,
      title: 'Audit readiness',
      scope: null,
      nextAction: 'Call the director',
      status: 'OPEN',
      responsibleWorkspaceMembershipId: membershipId,
      responsibleActor: {
        workspaceMembershipId: membershipId,
        displayName: 'Ada Ionescu',
      },
      createdAt: '2026-09-24T10:05:00.000Z',
      version: 2,
    },
  };
}

function respond(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

function installTransport(
  events: (companyId: string) => unknown[] = commercialEvents,
): Transport {
  const state: Transport = {
    intakeAssignment: 'intake-1',
    requestCreate: true,
    forbidDetail: false,
    detailReplies: [],
    detailReads: [],
    mutations: [],
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = input.toString();
      const companyContextId =
        new Headers(init?.headers).get('x-company-context-id') ?? companyA.id;
      if ((init?.method ?? 'GET') !== 'GET')
        state.mutations.push(`${init?.method} ${path}`);
      if (path.endsWith('/access/current-actor'))
        return respond(actorFor(companyContextId, state));
      if (path.endsWith('/companies')) return respond([companyA, companyB]);
      if (path.endsWith('/activity-log'))
        return respond({
          events: companyContextId === companyA.id ? events(companyA.id) : [],
        });
      if (path.includes('/commercial-intake/requests?'))
        return respond({
          items: companyContextId === companyA.id ? [requestRow()] : [],
        });
      if (path.endsWith(`/commercial-intake/requests/${requestId}`)) {
        state.detailReads.push(companyContextId);
        if (state.forbidDetail) return respond({}, 403);
        const reply = state.detailReplies.shift();
        return reply ? reply() : respond(requestDetail());
      }
      throw new Error('Unexpected API request: ' + path);
    }),
  );
  return state;
}

function deferredReply() {
  let resolve: (response: Response) => void = () => undefined;
  const promise = new Promise<Response>((settle) => {
    resolve = settle;
  });
  return {
    reply: () => promise,
    async settle(value: unknown) {
      await act(async () => {
        resolve(respond(value));
        await new Promise((done) => setTimeout(done, 0));
      });
    },
  };
}

function navigation() {
  return screen.getByRole('navigation', { name: 'Primary navigation' });
}
function navigateTo(label: string) {
  fireEvent.click(within(navigation()).getByRole('link', { name: label }));
}
function requestsRegion() {
  return screen.getByRole('region', { name: 'Client Requests' });
}
async function activityRow(description: string): Promise<HTMLElement> {
  const label = await screen.findByText(`Ada Ionescu ${description}`);
  const row = label.closest('li');
  if (!row) throw new Error(`Expected an Activity row for ${description}`);
  return row;
}
function openRequestIn(row: HTMLElement) {
  fireEvent.click(within(row).getByRole('button', { name: 'Open Request' }));
}
function selectCompany(companyId: string) {
  fireEvent.change(screen.getByLabelText('Active Company', { exact: true }), {
    target: { value: companyId },
  });
}

// jsdom implements neither scrolling nor motion media queries. The real
// scroll and frame behaviour is proven by the browser journey.
const scrollable: {
  scrollIntoView?: (options?: ScrollIntoViewOptions) => void;
} = Element.prototype;
const nativeScrollIntoView = scrollable.scrollIntoView;

describe('opening the Request from its commercial Activity event', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    scrollable.scrollIntoView = vi.fn();
    vi.stubGlobal(
      'matchMedia',
      vi.fn(
        (query: string) =>
          ({
            matches: true,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(() => false),
          }) satisfies MediaQueryList,
      ),
    );
    window.history.replaceState(null, '', '/?frame=prisme#activity');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    scrollable.scrollIntoView = nativeScrollIntoView;
    window.history.replaceState(null, '', '/');
  });

  it.each(['prisme', 'classic'])(
    'opens the Request of a next-action event with exactly one detail read (%s)',
    async (frame) => {
      window.history.replaceState(null, '', `/?frame=${frame}#activity`);
      const transport = installTransport();
      render(<App identity={deterministicBrowserIdentity()} />);

      const row = await activityRow('updated an Opportunity next action');
      expect(
        within(row).getByRole('button', { name: 'Open Request' }),
      ).toHaveTextContent(/^Open Request$/u);
      openRequestIn(row);

      expect(
        await within(requestsRegion()).findByText(
          `Original source of ${subject}`,
        ),
      ).toBeVisible();
      expect(window.location.hash).toBe('#requests');
      await waitFor(() => expect(requestsRegion()).toHaveFocus());
      expect(transport.detailReads).toEqual([companyA.id]);
      expect(transport.mutations).toEqual([]);
    },
  );

  it('opens the same Request from its creation events, reading it fresh each time', async () => {
    const transport = installTransport();
    render(<App identity={deterministicBrowserIdentity()} />);

    openRequestIn(await activityRow('captured a Client Request'));
    await within(requestsRegion()).findByText(`Original source of ${subject}`);
    navigateTo('Activity Log');
    openRequestIn(await activityRow('created an initial Opportunity'));
    await waitFor(() => expect(transport.detailReads).toHaveLength(2));
    expect(
      await within(requestsRegion()).findByText(
        `Original source of ${subject}`,
      ),
    ).toBeVisible();
    expect(transport.mutations).toEqual([]);
  });

  it('offers the action only for a readable Request of the active Company', async () => {
    installTransport((companyId) => [
      {
        id: 'event-without-request',
        action: 'opportunity.next_action.updated',
        occurredAt: '2026-09-24T10:10:00.000Z',
        actor,
        target: { type: 'opportunity', opportunityId, companyId },
        metadata: {},
      },
      {
        id: 'event-other-company',
        action: 'client_request.created',
        occurredAt: '2026-09-24T10:06:00.000Z',
        actor,
        target: {
          type: 'client_request',
          clientRequestId: requestId,
          companyId: companyB.id,
        },
        metadata: {},
      },
      ...commercialEvents(companyId).filter(({ id }) => id === 'event-project'),
    ]);
    render(<App identity={deterministicBrowserIdentity()} />);

    const withoutRequest = await activityRow(
      'updated an Opportunity next action',
    );
    expect(
      within(withoutRequest).getByText(`Target: Opportunity: ${opportunityId}`),
    ).toBeVisible();
    expect(
      screen.getByText('Target: Project: Audit preparation'),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Open Request' }),
    ).not.toBeInTheDocument();
  });

  it.each<[string, (companyId: string) => unknown]>([
    [
      'a non-string Request id',
      (companyId) => ({
        id: 'event-numeric-request',
        action: 'client_request.created',
        occurredAt: '2026-09-24T10:11:00.000Z',
        actor,
        target: { type: 'client_request', clientRequestId: 358, companyId },
        metadata: {},
      }),
    ],
    [
      'a Request target under another action',
      (companyId) => ({
        id: 'event-project-request',
        action: 'project.created',
        occurredAt: '2026-09-24T10:11:00.000Z',
        actor,
        target: {
          type: 'client_request',
          clientRequestId: requestId,
          companyId,
        },
        metadata: {},
      }),
    ],
    [
      'an Opportunity event that names a Request target',
      (companyId) => ({
        id: 'event-mismatched-request',
        action: 'opportunity.next_action.updated',
        occurredAt: '2026-09-24T10:11:00.000Z',
        actor,
        target: {
          type: 'client_request',
          clientRequestId: requestId,
          companyId,
        },
        metadata: {},
      }),
    ],
  ])(
    'offers no action and reads nothing when a successful Activity payload has %s',
    async (_case, malformed) => {
      const transport = installTransport((companyId) => [
        ...commercialEvents(companyId),
        malformed(companyId),
      ]);
      render(<App identity={deterministicBrowserIdentity()} />);

      expect(
        await screen.findByText(
          'We could not load the Activity Log. Please try again.',
        ),
      ).toBeVisible();
      expect(
        within(navigation()).getByRole('link', { name: 'Client Requests' }),
      ).toBeVisible();
      expect(
        screen.queryByRole('button', { name: 'Open Request' }),
      ).not.toBeInTheDocument();
      expect(transport.detailReads).toEqual([]);
      expect(transport.mutations).toEqual([]);
    },
  );

  it('offers no action when the Requests section is not offered', async () => {
    const transport = installTransport();
    transport.requestCreate = false;
    render(<App identity={deterministicBrowserIdentity()} />);

    await activityRow('updated an Opportunity next action');
    expect(
      within(navigation()).queryByRole('link', { name: 'Client Requests' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Open Request' }),
    ).not.toBeInTheDocument();
  });

  it('holds the requested Request behind an open next-action edit and opens it on cancel', async () => {
    const transport = installTransport();
    window.history.replaceState(null, '', '/?frame=prisme#requests');
    render(<App identity={deterministicBrowserIdentity()} />);
    await screen.findByRole('region', { name: 'Client Requests' });
    fireEvent.click(
      await within(requestsRegion()).findByRole('button', {
        name: new RegExp(`^${subject}`, 'u'),
      }),
    );
    fireEvent.click(
      await within(requestsRegion()).findByRole('button', {
        name: 'Edit next action',
      }),
    );
    fireEvent.change(within(requestsRegion()).getByLabelText('Next action'), {
      target: { value: 'Book the audit window' },
    });

    navigateTo('Activity Log');
    openRequestIn(await activityRow('updated an Opportunity next action'));
    expect(window.location.hash).toBe('#requests');
    expect(
      within(requestsRegion()).getByText(requestedAfterNextActionEdit, {
        selector: '[role="status"]',
      }),
    ).toBeVisible();
    expect(within(requestsRegion()).getByLabelText('Next action')).toHaveValue(
      'Book the audit window',
    );
    expect(transport.detailReads).toHaveLength(1);

    fireEvent.click(
      within(requestsRegion()).getByRole('button', { name: 'Cancel' }),
    );
    await waitFor(() => expect(transport.detailReads).toHaveLength(2));
    expect(
      await within(requestsRegion()).findByRole('button', {
        name: 'Edit next action',
      }),
    ).toBeVisible();
    expect(
      within(requestsRegion()).queryByText(requestedAfterNextActionEdit, {
        selector: '[role="status"]',
      }),
    ).not.toBeInTheDocument();
    expect(transport.mutations).toEqual([]);
  });

  it('retires the request on a Company switch and never replays it after the Requests workspace remounts', async () => {
    const transport = installTransport();
    const late = deferredReply();
    transport.detailReplies.push(late.reply);
    render(<App identity={deterministicBrowserIdentity()} />);

    openRequestIn(await activityRow('updated an Opportunity next action'));
    await waitFor(() => expect(transport.detailReads).toHaveLength(1));
    selectCompany(companyB.id);
    await screen.findByText(
      'No activity has been recorded in this workspace yet.',
    );
    await late.settle(requestDetail());
    navigateTo('Client Requests');
    expect(
      await within(requestsRegion()).findByText(
        'No Client Requests for Company B yet.',
      ),
    ).toBeVisible();

    selectCompany(companyA.id);
    // The remounted workspace of Company A lists its Request.
    await screen.findByRole('button', { name: new RegExp(`^${subject}`, 'u') });
    expect(
      within(requestsRegion()).queryByText(`Original source of ${subject}`),
    ).not.toBeInTheDocument();
    expect(transport.detailReads).toEqual([companyA.id]);
  });

  it('retires the request when the Requests section is lost and never replays it after a regrant', async () => {
    const transport = installTransport();
    render(<App identity={deterministicBrowserIdentity()} />);
    await activityRow('updated an Opportunity next action');

    // The detail read is rejected and revalidation confirms the lost bundle.
    transport.forbidDetail = true;
    transport.intakeAssignment = undefined;
    openRequestIn(await activityRow('updated an Opportunity next action'));
    await waitFor(() =>
      expect(
        within(navigation()).queryByRole('link', { name: 'Client Requests' }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('button', { name: 'Open Request' }),
    ).not.toBeInTheDocument();

    transport.forbidDetail = false;
    transport.intakeAssignment = 'intake-2';
    selectCompany(companyB.id);
    await waitFor(() =>
      expect(
        within(navigation()).getByRole('link', { name: 'Client Requests' }),
      ).toBeVisible(),
    );
    selectCompany(companyA.id);
    await screen.findByText('Company: Company A');
    navigateTo('Client Requests');
    await screen.findByRole('button', { name: new RegExp(`^${subject}`, 'u') });
    expect(
      within(requestsRegion()).queryByText(`Original source of ${subject}`),
    ).not.toBeInTheDocument();
    expect(transport.detailReads).toEqual([companyA.id]);
  });
});
