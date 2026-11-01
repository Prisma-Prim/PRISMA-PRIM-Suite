import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import type { ActorContext } from './access-types';
import { commercialIntakeCopy } from './commercial-intake/commercial-intake.copy';
import type { FollowUpCurrent } from './opportunity-follow-up/follow-up-contract';
import {
  buildClientRequest,
  requestListItemFor,
} from './test/commercial-intake-responses';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';
import { changeValue } from './test/select-option';

const company = {
  id: '10000000-0000-4000-8000-000000000001',
  displayName: 'Follow-up Company DEMO',
};
const membershipId = '20000000-0000-4000-8000-000000000001';
const coordinatorId = '30000000-0000-4000-8000-000000000001';
const requestId = '40000000-0000-4000-8000-000000000001';
const opportunityId = '50000000-0000-4000-8000-000000000001';
const datePath = `/api/commercial-intake/opportunities/${opportunityId}/follow-up`;
const assignmentPath =
  '/api/company-opportunity-follow-up-coordinator-assignments';
const discoveryPath = '/api/commercial-intake/opportunity-follow-ups';
const projectedClientName = 'Authorized optional Client projection DEMO';
const discoveryRow = {
  opportunityId,
  requestId,
  title: 'Independent planning case DEMO',
  followUpOn: '2026-11-25',
  recordedBy: {
    workspaceMembershipId: membershipId,
    displayLabel: 'Ada DEMO',
  },
  recordedAt: '2026-11-01T10:00:00.000Z',
};
const clientDiscoveryPage = {
  format: 'opportunity-follow-up.v1',
  through: '2026-11-25',
  items: [
    {
      ...discoveryRow,
      clientDisplayName: projectedClientName,
      clientDossierId: '60000000-0000-4000-8000-000000000099',
    },
  ],
  nextCursor: null,
};
const detail = {
  ...buildClientRequest({
    id: requestId,
    companyId: company.id,
    capturedByWorkspaceMembershipId: membershipId,
    originalText: 'Original native Request evidence DEMO',
    initialOpportunity: {
      id: opportunityId,
      title: 'Independent planning case DEMO',
      nextAction: 'Original native next action DEMO',
      responsibleActor: {
        workspaceMembershipId: membershipId,
        displayName: 'Ada DEMO',
      },
    },
  }),
  subject: 'Original Request DEMO',
};
const current = {
  format: 'opportunity-follow-up.v1',
  opportunityId,
  requestId,
  status: 'OPEN',
  opportunityVersion: 1,
  outcomeEpoch: `initial:${opportunityId}`,
  head: { state: 'UNRECORDED', revision: 0 },
  history: {
    format: 'opportunity-follow-up.v1',
    opportunityId,
    headRevision: 0,
    entries: [],
    nextCursor: null,
  },
} satisfies FollowUpCurrent;

type Capture =
  'complete' | 'absent' | 'unknown' | 'missing-native' | 'missing-token';
function actor(
  capture: Capture = 'complete',
  displayName = 'Original Actor DEMO',
): ActorContext {
  const nativeCompany = {
    ...company,
    clientPermissions: ['client.read'],
    clientPermissionAssignmentId: '60000000-0000-4000-8000-000000000001',
    clientPermissionSetVersion: 'v2',
    commercialIntakePermissions: [
      'commercial.request.read',
      'commercial.request.create',
      'commercial.opportunity.read',
      'commercial.opportunity.create',
      'commercial.opportunity.next_action.update',
    ],
    commercialIntakePermissionAssignmentId:
      '70000000-0000-4000-8000-000000000001',
    commercialIntakePermissionSetVersion: 'v2',
  } satisfies NonNullable<ActorContext['activeCompany']>;
  return {
    internalUserId: '80000000-0000-4000-8000-000000000001',
    workspaceId: '90000000-0000-4000-8000-000000000001',
    workspaceMembershipId: membershipId,
    workspaceName: 'Follow-up Workspace DEMO',
    displayName,
    email: 'ada@example.test',
    active: true,
    workspacePermissions: ['company.assignment.manage'],
    activeCompany:
      capture === 'absent'
        ? nativeCompany
        : {
            ...nativeCompany,
            commercialIntakePermissionAssignmentId:
              capture === 'missing-native'
                ? undefined
                : nativeCompany.commercialIntakePermissionAssignmentId,
            opportunityFollowUpPermissions: [
              'commercial.opportunity.follow_up.read',
              'commercial.opportunity.follow_up.manage',
            ],
            opportunityFollowUpCoordinatorAssignmentId: coordinatorId,
            opportunityFollowUpCoordinatorPermissionSetVersion:
              capture === 'unknown' ? 'v99' : 'v1',
            opportunityFollowUpReadCapture:
              capture === 'missing-token'
                ? undefined
                : `opportunity-follow-up-read.v1.${'a'.repeat(64)}`,
          },
  };
}

function projectionOwner(
  displayName = 'Stable Client projection Owner DEMO',
): ActorContext {
  return {
    ...actor('complete', displayName),
    workspacePermissions: [
      'company.assignment.manage',
      'company.manage',
      'client.manage',
    ],
  };
}

function deferredResponse() {
  let settle: (response: Response) => void = () => undefined;
  const promise = new Promise<Response>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

function installTransport(initial: ActorContext) {
  let currentActor = initial;
  let assigned = true;
  let assignedObservation = false;
  let denyDate = false;
  let heldActor: ReturnType<typeof deferredResponse> | undefined;
  let holdNextActor = false;
  let recoverySignal: AbortSignal | null | undefined;
  let heldDiscovery: ReturnType<typeof deferredResponse> | undefined;
  let discoverySignal: AbortSignal | null | undefined;
  const calls: string[] = [];
  const nativeReads: string[] = [];
  const dateReads: string[] = [];
  const unexpected: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const method = init?.method ?? 'GET';
      calls.push(`${method} ${path}`);
      if (path === '/api/access/current-actor') {
        if (holdNextActor && heldActor) {
          holdNextActor = false;
          recoverySignal = init?.signal;
          return heldActor.promise;
        }
        return Response.json(currentActor);
      }
      if (path === '/api/companies') return Response.json([company]);
      if (path === '/api/activity-log') return Response.json({ events: [] });
      if (path === '/api/clients') return Response.json([]);
      if (path.startsWith(`${discoveryPath}?`)) {
        if (heldDiscovery) {
          const held = heldDiscovery;
          heldDiscovery = undefined;
          discoverySignal = init?.signal;
          return held.promise;
        }
        return Response.json({
          ...clientDiscoveryPage,
          items:
            currentActor.workspacePermissions.includes('client.manage') ||
            currentActor.activeCompany?.clientPermissions?.includes(
              'client.read',
            )
              ? clientDiscoveryPage.items
              : [discoveryRow],
        });
      }
      if (path === '/api/company-context-assignments/administration')
        return Response.json({
          members: [
            {
              workspaceMembershipId: membershipId,
              displayName: 'Ada DEMO',
              email: 'ada@example.test',
            },
          ],
          companies: [company],
          assignments: [
            ...(assigned
              ? [
                  {
                    id: coordinatorId,
                    workspaceMembershipId: membershipId,
                    companyId: company.id,
                    bundle: 'Company Opportunity Follow-up Coordinator',
                    permissionSetVersion: 'v1',
                    active: true,
                  },
                ]
              : []),
            ...(assignedObservation
              ? [
                  {
                    id: '60000000-0000-4000-8000-000000000088',
                    workspaceMembershipId: membershipId,
                    companyId: company.id,
                    bundle: 'Company Ideas Reader',
                    permissionSetVersion: 'v1',
                    active: true,
                  },
                ]
              : []),
          ],
        });
      if (
        path === '/api/company-ideas-reader-assignments' &&
        method === 'POST'
      ) {
        assignedObservation = true;
        return Response.json({}, { status: 201 });
      }
      if (
        path ===
          `/api/company-ideas-reader-assignments/${membershipId}/${company.id}` &&
        method === 'DELETE'
      ) {
        assignedObservation = false;
        return Response.json({});
      }
      if (
        path === `${assignmentPath}/${membershipId}/${company.id}` &&
        method === 'DELETE'
      ) {
        assigned = false;
        return Response.json({});
      }
      if (path === assignmentPath && method === 'POST') {
        assigned = true;
        return Response.json({}, { status: 201 });
      }
      if (path.includes('/api/commercial-intake/requests?')) {
        nativeReads.push(path);
        return Response.json({ items: [requestListItemFor(detail)] });
      }
      if (path === `/api/commercial-intake/requests/${requestId}`) {
        nativeReads.push(path);
        return Response.json(detail);
      }
      if (path === datePath && method === 'GET') {
        dateReads.push(path);
        if (denyDate) {
          denyDate = false;
          holdNextActor = true;
          return new Response(null, { status: 403 });
        }
        return Response.json(current);
      }
      unexpected.push(`${method} ${path}`);
      return Response.json({}, { status: 599 });
    }),
  );
  return {
    calls,
    nativeReads,
    dateReads,
    unexpected,
    setActor(value: ActorContext) {
      currentActor = value;
    },
    holdDeniedDateRecovery() {
      denyDate = true;
      const deferred = deferredResponse();
      heldActor = deferred;
      return { deferred, signal: () => recoverySignal };
    },
    holdNextDiscovery() {
      const deferred = deferredResponse();
      heldDiscovery = deferred;
      return { deferred, signal: () => discoverySignal };
    },
  };
}

function navigate(label: string) {
  fireEvent.click(
    within(
      screen.getByRole('navigation', { name: 'Primary navigation' }),
    ).getByRole('link', { name: label }),
  );
}
async function openRequest() {
  const identity = deterministicBrowserIdentity();
  const rendered = render(<App identity={identity} />);
  const open = await screen.findByRole('button', {
    name: /^Original Request DEMO/u,
  });
  await act(async () => {
    fireEvent.click(open);
  });
  await screen.findByRole('article', { name: detail.subject });
  return { ...rendered, identity };
}
async function publishAssignment(
  operation: 'grant' | 'revoke',
  targetMember = membershipId,
  bundle = 'opportunity-follow-up-coordinator',
) {
  navigate('Team & access');
  const access = await screen.findByRole('region', { name: 'Company access' });
  changeValue(within(access).getByLabelText('Workspace member'), targetMember);
  changeValue(
    within(access).getByLabelText('Company', { exact: true }),
    company.id,
  );
  changeValue(within(access).getByLabelText('Access bundle'), bundle);
  fireEvent.click(
    within(access).getByRole('button', {
      name: operation === 'grant' ? 'Grant access' : 'Revoke access',
    }),
  );
  await screen.findByText(
    operation === 'grant'
      ? 'Access granted. Server state refreshed.'
      : 'Access revoked. Server state refreshed.',
  );
  navigate('Client Requests');
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
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
  window.history.replaceState(null, '', '/?frame=prisme#requests');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('Opportunity follow-up through the actual App', () => {
  it.each(['date', 'native'])(
    'retires optional Client pages and ignored-abort replies while preserving an independent %s draft',
    async (editor) => {
      const server = installTransport(projectionOwner());
      await openRequest();
      await screen.findByText('No follow-up declaration.');
      changeValue(
        screen.getByLabelText('Through chosen date, inclusive'),
        '2026-11-25',
      );
      fireEvent.click(screen.getByRole('button', { name: 'Find follow-ups' }));
      await screen.findByText(projectedClientName);
      const held = server.holdNextDiscovery();
      fireEvent.click(screen.getByRole('button', { name: 'Find follow-ups' }));
      await waitFor(() => expect(held.signal()).toBeDefined());
      const label =
        editor === 'date'
          ? 'Follow-up date (optional)'
          : commercialIntakeCopy.nextAction;
      fireEvent.click(
        screen.getByRole('button', {
          name:
            editor === 'date'
              ? 'Record follow-up'
              : commercialIntakeCopy.editNextAction,
        }),
      );
      const draft = screen.getByLabelText(label);
      const draftValue =
        editor === 'date' ? '2026-11-26' : 'Independent native draft DEMO';
      changeValue(draft, draftValue);
      const dateReads = [...server.dateReads];
      const replacement = projectionOwner('New Client capture Actor DEMO');
      if (!replacement.activeCompany)
        throw new Error('Expected replacement Company');
      const clientReplacement = {
        ...replacement,
        activeCompany: {
          ...replacement.activeCompany,
          clientPermissionAssignmentId: '60000000-0000-4000-8000-000000000002',
        },
      };
      // An external Client capture change is observed by the current member's
      // unrelated administration refresh. Date authority stays identical.
      server.setActor(clientReplacement);
      await publishAssignment('grant', membershipId, 'ideas-reader');
      expect(screen.getByText('New Client capture Actor DEMO')).toBeVisible();
      expect(screen.getByLabelText(label)).toBe(draft);
      expect(draft).toHaveValue(draftValue);
      expect(
        screen.getByLabelText('Through chosen date, inclusive'),
      ).toHaveValue('');
      expect(held.signal()?.aborted).toBe(true);
      await act(async () => {
        held.deferred.settle(Response.json(clientDiscoveryPage));
        await held.deferred.promise;
      });
      expect(screen.queryByText(projectedClientName)).not.toBeInTheDocument();
      expect(screen.getByLabelText(label)).toBe(draft);
      server.setActor({
        ...clientReplacement,
        displayName: 'Client capture revoked Actor DEMO',
        activeCompany: {
          ...clientReplacement.activeCompany,
          clientPermissions: [],
          clientPermissionAssignmentId: undefined,
          clientPermissionSetVersion: undefined,
        },
      });
      await publishAssignment('revoke', membershipId, 'ideas-reader');
      expect(
        screen.getByText('Client capture revoked Actor DEMO'),
      ).toBeVisible();
      expect(screen.getByLabelText(label)).toBe(draft);
      expect(draft).toHaveValue(draftValue);
      expect(server.dateReads).toEqual(dateReads);
      expect(server.unexpected).toEqual([]);
    },
  );

  it.each<Capture>(['absent', 'unknown', 'missing-native', 'missing-token'])(
    'leaves native Request reading unchanged and fetches no follow-up under %s captures',
    async (capture) => {
      const server = installTransport(actor(capture));
      const rendered = await openRequest();
      expect(
        screen.queryByRole('heading', { name: 'Opportunity follow-up' }),
      ).not.toBeInTheDocument();
      expect(server.dateReads).toEqual([]);
      expect(
        server.nativeReads.filter((path) => path.includes('/requests?')),
      ).toHaveLength(1);
      expect(
        server.nativeReads.filter((path) => path.endsWith(requestId)),
      ).toHaveLength(1);
      const before = [...server.nativeReads];
      await act(async () => {
        rendered.rerender(<App identity={rendered.identity} />);
      });
      expect(server.nativeReads).toEqual(before);
      expect(server.unexpected).toEqual([]);
    },
  );

  it('exposes the captured feature and arbitrates one editor in both native and follow-up directions', async () => {
    const server = installTransport(actor());
    await openRequest();
    await screen.findByText('No follow-up declaration.');
    expect(server.dateReads).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Record follow-up' }));
    expect(
      screen.getByRole('button', { name: commercialIntakeCopy.editNextAction }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: commercialIntakeCopy.editNextAction }),
    );
    expect(
      screen.queryByLabelText(commercialIntakeCopy.nextAction),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Follow-up date (optional)')).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Abandon this intent' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: commercialIntakeCopy.editNextAction }),
    );
    const native = screen.getByLabelText(commercialIntakeCopy.nextAction);
    changeValue(native, 'Independent native editor DEMO');
    expect(
      screen.getByRole('button', { name: 'Record follow-up' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Record follow-up' }));
    expect(
      screen.queryByLabelText('Follow-up date (optional)'),
    ).not.toBeInTheDocument();
    expect(native).toHaveValue('Independent native editor DEMO');
    fireEvent.click(
      screen.getByRole('button', {
        name: commercialIntakeCopy.cancelNextAction,
      }),
    );
    expect(
      screen.getByRole('button', { name: 'Record follow-up' }),
    ).toBeEnabled();
    expect(server.unexpected).toEqual([]);
  });

  it('retires only follow-up authority while preserving the same valid native text editor', async () => {
    const server = installTransport(actor());
    await openRequest();
    await screen.findByText('No follow-up declaration.');
    fireEvent.click(
      screen.getByRole('button', { name: commercialIntakeCopy.editNextAction }),
    );
    const native = screen.getByLabelText(commercialIntakeCopy.nextAction);
    changeValue(native, 'Keep this native text intent DEMO');
    const nativeReads = [...server.nativeReads];
    server.setActor(actor('absent', 'Fresh revoked Actor DEMO'));
    await publishAssignment('revoke');
    expect(
      screen.queryByRole('heading', { name: 'Opportunity follow-up' }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText(commercialIntakeCopy.nextAction)).toBe(native);
    expect(native).toHaveValue('Keep this native text intent DEMO');
    expect(
      screen.getByRole('button', { name: commercialIntakeCopy.saveNextAction }),
    ).toBeEnabled();
    expect(server.nativeReads).toEqual(nativeReads);
    expect(server.unexpected).toEqual([]);
  });

  it('rejects an older full-Actor recovery after an equal-permission capture replacement and preserves the new follow-up editor', async () => {
    const original = actor();
    const server = installTransport(original);
    await openRequest();
    await screen.findByText('No follow-up declaration.');
    const held = server.holdDeniedDateRecovery();
    fireEvent.click(screen.getByRole('button', { name: 'Reload follow-up' }));
    await waitFor(() => expect(held.signal()).toBeDefined());
    fireEvent.click(
      screen.getByRole('button', { name: commercialIntakeCopy.editNextAction }),
    );
    const native = screen.getByLabelText(commercialIntakeCopy.nextAction);
    changeValue(native, 'Preserved behind recovery DEMO');
    server.setActor(actor('absent', 'Revoked Actor DEMO'));
    await publishAssignment('revoke');
    expect(held.signal()?.aborted).toBe(true);
    const replacement = actor('complete', 'Newer accepted Actor DEMO');
    if (!replacement.activeCompany)
      throw new Error('Expected replacement Company');
    server.setActor({
      ...replacement,
      activeCompany: {
        ...replacement.activeCompany,
        opportunityFollowUpCoordinatorAssignmentId:
          '30000000-0000-4000-8000-000000000002',
        opportunityFollowUpReadCapture: `opportunity-follow-up-read.v1.${'b'.repeat(64)}`,
      },
    });
    await publishAssignment('grant');
    await screen.findByText('No follow-up declaration.');
    expect(screen.getByLabelText(commercialIntakeCopy.nextAction)).toBe(native);
    expect(native).toHaveValue('Preserved behind recovery DEMO');
    fireEvent.click(
      screen.getByRole('button', {
        name: commercialIntakeCopy.cancelNextAction,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Record follow-up' }));
    const freshDate = screen.getByLabelText('Follow-up date (optional)');
    changeValue(freshDate, '2026-11-25');
    const before = [...server.calls];
    await act(async () => {
      held.deferred.settle(Response.json(original));
      await held.deferred.promise;
    });
    expect(screen.getByText('Newer accepted Actor DEMO')).toBeVisible();
    expect(screen.getByLabelText('Follow-up date (optional)')).toBe(freshDate);
    expect(freshDate).toHaveValue('2026-11-25');
    expect(server.calls).toEqual(before);
    expect(server.unexpected).toEqual([]);
  });
});
