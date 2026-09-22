import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';

const COMPANY_ID = '00000000-0000-4000-8000-000000000313';
const REQUEST_ID = '00000000-0000-4000-8000-000000000314';
const OPPORTUNITY_ID = '00000000-0000-4000-8000-000000000315';

const reader = {
  internalUserId: 'user-1',
  workspaceMembershipId: 'membership-1',
  workspaceId: 'workspace-1',
  workspaceName: 'PRISMA Workspace',
  displayName: 'Ada Ionescu',
  email: 'ada@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: COMPANY_ID,
    displayName: 'PRISMA-PRIM',
    clientPermissions: [],
    commercialIntakePermissions: [
      'commercial.request.read',
      'commercial.request.create',
      'commercial.opportunity.read',
      'commercial.opportunity.create',
    ],
    commercialActivityPermissions: ['commercial.activity.read'],
  },
};

const commercialEvents = [
  {
    id: 'event-2',
    action: 'opportunity.created',
    occurredAt: '2026-09-21T10:05:00.000Z',
    actor: { internalUserId: 'user-1', displayName: 'Ada Ionescu' },
    target: {
      type: 'opportunity',
      opportunityId: OPPORTUNITY_ID,
      clientRequestId: REQUEST_ID,
      companyId: COMPANY_ID,
    },
    metadata: {},
  },
  {
    id: 'event-1',
    action: 'client_request.created',
    occurredAt: '2026-09-21T10:05:00.000Z',
    actor: { internalUserId: 'user-1', displayName: 'Ada Ionescu' },
    target: {
      type: 'client_request',
      clientRequestId: REQUEST_ID,
      companyId: COMPANY_ID,
    },
    metadata: {},
  },
];

function stubTransport(events: unknown[]): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = input.toString();
      const body = url.endsWith('/access/current-actor')
        ? reader
        : url.endsWith('/activity-log')
          ? { events }
          : [];
      return Promise.resolve(
        new Response(JSON.stringify(body), { status: 200 }),
      );
    }),
  );
}

describe('commercial history in the Activity Log', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/?frame=classic');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.history.replaceState(null, '', '/');
  });

  it('shows the projected commercial events with actor, action and target', async () => {
    stubTransport(commercialEvents);

    render(<App identity={deterministicBrowserIdentity()} />);

    expect(
      await screen.findByText('Ada Ionescu created an initial Opportunity'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Ada Ionescu captured a Client Request'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`Target: Client Request: ${REQUEST_ID}`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`Target: Opportunity: ${OPPORTUNITY_ID}`),
    ).toBeInTheDocument();
  });

  it('shows the existing empty state when the authorized Company has no event', async () => {
    stubTransport([]);

    render(<App identity={deterministicBrowserIdentity()} />);

    expect(
      await screen.findByText(
        'No activity has been recorded in this workspace yet.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Client Request:/)).not.toBeInTheDocument();
  });
});
