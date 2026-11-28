import { changeValue } from './test/select-option';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { appInterfaces, renderInInterface } from './test/app-interface';
import type { InterfacePreference as AppInterface } from './clarte/interface-preference';
import { companyGrants } from './access/company-grants.test-fixture';
import { deterministicBrowserIdentity } from './access-composition';
import type { ActorContext } from './access-types';
import {
  buildClientRequest,
  requestListItemFor,
} from './test/commercial-intake-responses';
import { dealDetailFor, dealSummaryFor } from './test/deal-responses';

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

      grants:
        state.intakeAssignment && state.requestCreate
          ? companyGrants({
              bundle: 'company_commercial_intake',
              version: 'v2',
              assignmentId: state.intakeAssignment,
            })
          : companyGrants(),
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
  return requestListItemFor(requestDetail());
}

function requestDetail() {
  return buildClientRequest({
    id: requestId,
    companyId: companyA.id,
    subject,
    originalText: `Original source of ${subject}`,
    capturedByWorkspaceMembershipId: membershipId,
    capturedAt: '2026-09-24T10:05:00.000Z',
    initialOpportunity: {
      id: opportunityId,
      title: 'Audit readiness',
      nextAction: 'Call the director',
      responsibleActor: {
        workspaceMembershipId: membershipId,
        displayName: 'Ada Ionescu',
      },
      version: 2,
    },
  });
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
      // Clarté shows the Requests as deals and opens each in its deal page.
      if (path.includes('/deals?'))
        return respond({
          items:
            companyContextId === companyA.id
              ? [dealSummaryFor(requestDetail())]
              : [],
        });
      if (path.endsWith(`/deals/${opportunityId}`)) {
        if (state.forbidDetail) return respond({}, 403);
        return respond(dealDetailFor(requestDetail()));
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
type Section = 'Activity Log' | 'Client Requests';
/**
 * The menu link that opens a section: the section itself in the current
 * interface; in Clarté, the entry that holds it (Deals holds only the
 * Requests, and the Settings console lists the Activity Log).
 */
function queryMenuLink(appInterface: AppInterface, section: Section) {
  const name =
    appInterface === 'current'
      ? section
      : section === 'Client Requests'
        ? 'Deals'
        : 'Settings';
  return within(navigation()).queryByRole('link', { name });
}
function menuLink(appInterface: AppInterface, section: Section) {
  const link = queryMenuLink(appInterface, section);
  if (!link) throw new Error('Expected the menu link of ' + section + '.');
  return link;
}
function navigateTo(appInterface: AppInterface, section: Section) {
  fireEvent.click(menuLink(appInterface, section));
  if (appInterface === 'clarte' && section === 'Activity Log')
    fireEvent.click(
      within(
        screen.getByRole('navigation', { name: 'Settings sections' }),
      ).getByRole('link', { name: section }),
    );
}
/**
 * Where the Requests show: their own section in the current interface; in
 * Clarté, the Deals screen that lists them and opens each deal's page.
 */
function requestsRegion(appInterface: AppInterface) {
  if (appInterface === 'current')
    return screen.getByRole('region', { name: 'Client Requests' });
  const deals = document.getElementById('requests');
  if (!(deals instanceof HTMLElement)) throw new Error('Expected the Deals.');
  return deals;
}
/** The opened Request takes focus: its section, or its deal page's heading. */
async function expectOpenedRequestFocused(appInterface: AppInterface) {
  await waitFor(() =>
    expect(
      appInterface === 'current'
        ? requestsRegion(appInterface)
        : within(requestsRegion(appInterface)).getByRole('heading', {
            level: 2,
            name: requestDetail().initialOpportunity.title,
          }),
    ).toHaveFocus(),
  );
}
/** The listed Request: its row in the current interface, its deal's row in Clarté. */
function findListedRequest(appInterface: AppInterface) {
  return screen.findByRole('button', {
    name:
      appInterface === 'current'
        ? new RegExp(`^${subject}`, 'u')
        : requestDetail().initialOpportunity.title,
  });
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
  changeValue(
    screen.getByLabelText('Active Company', { exact: true }),
    companyId,
  );
}

// jsdom implements neither scrolling nor motion media queries. The real
// scroll and frame behaviour is proven by the browser journey.
const scrollable: {
  scrollIntoView?: (options?: ScrollIntoViewOptions) => void;
} = Element.prototype;
const nativeScrollIntoView = scrollable.scrollIntoView;

describe.each(appInterfaces)(
  'opening the Request from its commercial Activity event in the %s interface',
  (appInterface) => {
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
      window.history.replaceState(null, '', '/#activity');
    });
    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
      scrollable.scrollIntoView = nativeScrollIntoView;
      window.history.replaceState(null, '', '/');
    });

    it('opens the Request of a next-action event with exactly one detail read', async () => {
      window.history.replaceState(null, '', '/#activity');
      const transport = installTransport();
      renderInInterface(
        appInterface,
        <App identity={deterministicBrowserIdentity()} />,
      );

      const row = await activityRow('updated an Opportunity next action');
      expect(
        within(row).getByRole('button', { name: 'Open Request' }),
      ).toHaveTextContent(/^Open Request$/u);
      openRequestIn(row);

      expect(
        await within(requestsRegion(appInterface)).findByText(
          `Original source of ${subject}`,
        ),
      ).toBeVisible();
      expect(window.location.hash).toBe('#requests');
      await expectOpenedRequestFocused(appInterface);
      // Clarté's deal page first reads the Request to find its Opportunity;
      // its Request stage then reads it once, as the current section does.
      expect(transport.detailReads).toEqual(
        appInterface === 'current' ? [companyA.id] : [companyA.id, companyA.id],
      );
      expect(transport.mutations).toEqual([]);
    });

    it('opens the same Request from its creation events, reading it fresh each time', async () => {
      const transport = installTransport();
      renderInInterface(
        appInterface,
        <App identity={deterministicBrowserIdentity()} />,
      );

      openRequestIn(await activityRow('captured a Client Request'));
      await within(requestsRegion(appInterface)).findByText(
        `Original source of ${subject}`,
      );
      navigateTo(appInterface, 'Activity Log');
      openRequestIn(await activityRow('created an initial Opportunity'));
      await waitFor(() => expect(transport.detailReads).toHaveLength(2));
      expect(
        await within(requestsRegion(appInterface)).findByText(
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
        ...commercialEvents(companyId).filter(
          ({ id }) => id === 'event-project',
        ),
      ]);
      renderInInterface(
        appInterface,
        <App identity={deterministicBrowserIdentity()} />,
      );

      const withoutRequest = await activityRow(
        'updated an Opportunity next action',
      );
      expect(
        within(withoutRequest).getByText(
          `Target: Opportunity: ${opportunityId}`,
        ),
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
        renderInInterface(
          appInterface,
          <App identity={deterministicBrowserIdentity()} />,
        );

        expect(
          await screen.findByText(
            'We could not load the Activity Log. Please try again.',
          ),
        ).toBeVisible();
        expect(menuLink(appInterface, 'Client Requests')).toBeVisible();
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
      renderInInterface(
        appInterface,
        <App identity={deterministicBrowserIdentity()} />,
      );

      await activityRow('updated an Opportunity next action');
      expect(
        queryMenuLink(appInterface, 'Client Requests'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Open Request' }),
      ).not.toBeInTheDocument();
    });

    // Clarté's deal page does not yet hold a requested deal behind an open
    // editor; #1558 owns that, and this test then runs in Clarté too.
    it.skipIf(appInterface === 'clarte')(
      'holds the requested Request behind an open next-action edit and opens it on cancel',
      async () => {
        const transport = installTransport();
        window.history.replaceState(null, '', '/#requests');
        renderInInterface(
          appInterface,
          <App identity={deterministicBrowserIdentity()} />,
        );
        await screen.findByRole('region', { name: 'Client Requests' });
        fireEvent.click(
          await within(requestsRegion(appInterface)).findByRole('button', {
            name: new RegExp(`^${subject}`, 'u'),
          }),
        );
        fireEvent.click(
          await within(requestsRegion(appInterface)).findByRole('button', {
            name: 'Edit next action',
          }),
        );
        changeValue(
          within(requestsRegion(appInterface)).getByLabelText('Next action'),
          'Book the audit window',
        );

        navigateTo(appInterface, 'Activity Log');
        openRequestIn(await activityRow('updated an Opportunity next action'));
        expect(window.location.hash).toBe('#requests');
        expect(
          within(requestsRegion(appInterface)).getByText(
            requestedAfterNextActionEdit,
            {
              selector: '[role="status"]',
            },
          ),
        ).toBeVisible();
        expect(
          within(requestsRegion(appInterface)).getByLabelText('Next action'),
        ).toHaveValue('Book the audit window');
        expect(transport.detailReads).toHaveLength(1);

        fireEvent.click(
          within(requestsRegion(appInterface)).getByRole('button', {
            name: 'Cancel',
          }),
        );
        await waitFor(() => expect(transport.detailReads).toHaveLength(2));
        expect(
          await within(requestsRegion(appInterface)).findByRole('button', {
            name: 'Edit next action',
          }),
        ).toBeVisible();
        expect(
          within(requestsRegion(appInterface)).queryByText(
            requestedAfterNextActionEdit,
            {
              selector: '[role="status"]',
            },
          ),
        ).not.toBeInTheDocument();
        expect(transport.mutations).toEqual([]);
      },
    );

    it('retires the request on a Company switch and never replays it after the Requests workspace remounts', async () => {
      const transport = installTransport();
      const late = deferredReply();
      transport.detailReplies.push(late.reply);
      renderInInterface(
        appInterface,
        <App identity={deterministicBrowserIdentity()} />,
      );

      openRequestIn(await activityRow('updated an Opportunity next action'));
      await waitFor(() => expect(transport.detailReads).toHaveLength(1));
      selectCompany(companyB.id);
      await screen.findByText(
        'No activity has been recorded in this workspace yet.',
      );
      await late.settle(requestDetail());
      navigateTo(appInterface, 'Client Requests');
      expect(
        await within(requestsRegion(appInterface)).findByText(
          appInterface === 'current'
            ? 'No Client Requests for Company B yet.'
            : 'No deal yet.',
        ),
      ).toBeVisible();

      selectCompany(companyA.id);
      // The remounted workspace of Company A lists its Request.
      await findListedRequest(appInterface);
      expect(
        within(requestsRegion(appInterface)).queryByText(
          `Original source of ${subject}`,
        ),
      ).not.toBeInTheDocument();
      expect(transport.detailReads).toEqual([companyA.id]);
    });

    it('retires the request when the Requests section is lost and never replays it after a regrant', async () => {
      const transport = installTransport();
      renderInInterface(
        appInterface,
        <App identity={deterministicBrowserIdentity()} />,
      );
      await activityRow('updated an Opportunity next action');

      // The detail read is rejected and revalidation confirms the lost bundle.
      transport.forbidDetail = true;
      transport.intakeAssignment = undefined;
      openRequestIn(await activityRow('updated an Opportunity next action'));
      await waitFor(() =>
        expect(
          queryMenuLink(appInterface, 'Client Requests'),
        ).not.toBeInTheDocument(),
      );
      expect(
        screen.queryByRole('button', { name: 'Open Request' }),
      ).not.toBeInTheDocument();

      transport.forbidDetail = false;
      transport.intakeAssignment = 'intake-2';
      selectCompany(companyB.id);
      await waitFor(() =>
        expect(menuLink(appInterface, 'Client Requests')).toBeVisible(),
      );
      selectCompany(companyA.id);
      if (appInterface === 'current')
        await screen.findByText('Company: Company A');
      navigateTo(appInterface, 'Client Requests');
      await findListedRequest(appInterface);
      expect(
        within(requestsRegion(appInterface)).queryByText(
          `Original source of ${subject}`,
        ),
      ).not.toBeInTheDocument();
      expect(transport.detailReads).toEqual([companyA.id]);
    });
  },
);
