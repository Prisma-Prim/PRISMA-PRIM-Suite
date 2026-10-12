import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import type { ActorContext } from './access-types';
import {
  buildClientRequest,
  requestListItemFor,
} from './test/commercial-intake-responses';

const companyId = 'company-a';
const requestId = 'request-592';
const opportunityId = 'opportunity-592';
const subject = 'Offer history Request';
const actor = { internalUserId: 'user-1', displayName: 'Ada Ionescu' };
const offerReference = {
  illustrativeReference: 7,
  opportunityId,
  clientRequestId: requestId,
  companyId,
};
const version = (offerVersionId: string, versionNumber: number) => ({
  type: 'offer_version',
  offerVersionId,
  versionNumber,
  ...offerReference,
});

const offerEvents = [
  {
    id: 'event-response',
    action: 'offer_version.client_response_recorded',
    occurredAt: '2026-09-28T10:06:00.000Z',
    actor,
    target: version('version-two', 2),
    metadata: { outcome: 'ACCEPTED', evidenceKind: 'SIMULATED' },
  },
  {
    id: 'event-transmission',
    action: 'offer_version.transmission_recorded',
    occurredAt: '2026-09-28T10:05:00.000Z',
    actor,
    target: version('version-one', 1),
    metadata: { channel: 'SIMULATED' },
  },
  {
    id: 'event-approval',
    action: 'offer_version.approved',
    occurredAt: '2026-09-28T10:04:00.000Z',
    actor,
    target: version('version-one', 1),
    metadata: {},
  },
  {
    id: 'event-offer',
    action: 'offer.created',
    occurredAt: '2026-09-28T10:03:00.000Z',
    actor,
    target: { type: 'offer', ...offerReference },
    metadata: {},
  },
];

type Transport = {
  offerReads: string[];
  versionReadStatus: number;
  mutations: string[];
};

function reader(): ActorContext {
  return {
    internalUserId: 'user-1',
    workspaceMembershipId: 'membership-1',
    workspaceId: 'workspace-1',
    workspaceName: 'PRISMA Workspace',
    displayName: 'Ada Ionescu',
    email: 'ada@example.test',
    active: true,
    workspacePermissions: [],
    activeCompany: {
      id: companyId,
      displayName: 'Company A',
      clientPermissions: [],
      commercialActivityPermissions: ['commercial.activity.read'],
      commercialIntakePermissions: [
        'commercial.request.read',
        'commercial.request.create',
        'commercial.opportunity.read',
        'commercial.opportunity.create',
      ],
      commercialIntakePermissionAssignmentId: 'intake-1',
      commercialIntakePermissionSetVersion: 'v1',
      offerPermissions: [
        'commercial.offer.read',
        'commercial.offer.approve',
        'commercial.offer.response.record',
      ],
      offerApproverAssignmentId: 'approver-1',
      offerApproverPermissionSetVersion: 'v1',
    },
  };
}

function requestDetail() {
  return buildClientRequest({
    id: requestId,
    companyId,
    subject,
    originalText: `Original source of ${subject}`,
    capturedByWorkspaceMembershipId: 'membership-1',
    initialOpportunity: { id: opportunityId, title: 'Offer history' },
  });
}

/** An Offer whose version 1 was superseded by version 2. */
function offerAt(versionNumber: 1 | 2) {
  const id = versionNumber === 1 ? 'version-one' : 'version-two';
  return {
    id: 'offer-one',
    illustrativeReference: 7,
    revision: 4,
    version: {
      id,
      qualityRuleSet: 'OFFER_QUALITY_ILLUSTRATIVE',
      qualityRuleSetVersion: 1,
      latestQualityRun: null,
      versionNumber,
      predecessorVersionId: versionNumber === 1 ? null : 'version-one',
      supersededByVersionId: versionNumber === 1 ? 'version-two' : null,
      supersededAt: versionNumber === 1 ? '2026-09-28T10:05:30.000Z' : null,
      differences: [],
      pricingSnapshotId: 'snapshot-one',
      pricingSnapshot: {
        id: 'snapshot-one',
        currency: 'EUR',
        total: '345.00',
        committedAt: '2026-09-27T09:00:00.000Z',
      },
      recipient: {
        kind: 'PRIMARY',
        legalName: 'Primary Client',
        taxId: null,
        legalAddress: null,
      },
      issuingCompanyLabel: 'Company A',
      validityDays: 30,
      validUntil: '2026-10-27T09:00:00.000Z',
      scopeNote: null,
      commercialConditions: `Conditions of version ${versionNumber}`,
      decisionState: 'PENDING',
      decision: null,
      transmissionState: 'NOT_TRANSMITTED',
      clientResponseState: 'NONE',
      clientResponse: null,
      validityElapsed: false,
      provenance: 'ILLUSTRATIVE',
      provisional: true,
      representation: {
        templateCode: 'OFFER_ILLUSTRATIVE',
        templateVersion: 1,
        html: '<!doctype html><html lang="en"><body><h1>Illustrative Offer</h1></body></html>',
        sha256:
          '1161a98c95f65605a37e3c82383cd044335e9be41e00ce8a8559dd553db0c865',
      },
    },
  };
}

function respond(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function installTransport(events: unknown[] = offerEvents): Transport {
  const state: Transport = {
    offerReads: [],
    versionReadStatus: 200,
    mutations: [],
  };
  const offerPath = `/offers/opportunities/${opportunityId}`;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(input.toString(), 'http://localhost').pathname;
      if ((init?.method ?? 'GET') !== 'GET')
        state.mutations.push(`${init?.method} ${path}`);
      if (path.endsWith('/access/current-actor')) return respond(reader());
      if (path.endsWith('/companies'))
        return respond([{ id: companyId, displayName: 'Company A' }]);
      if (path.endsWith('/activity-log')) return respond({ events });
      if (path.endsWith('/commercial-intake/requests'))
        return respond({ items: [requestListItemFor(requestDetail())] });
      if (path.endsWith(`/commercial-intake/requests/${requestId}`))
        return respond(requestDetail());
      if (path.endsWith(`${offerPath}/versions`))
        return respond({
          versions: [
            {
              id: 'version-two',
              versionNumber: 2,
              createdAt: '2026-09-28T10:05:30.000Z',
              supersededByVersionId: null,
            },
            {
              id: 'version-one',
              versionNumber: 1,
              createdAt: '2026-09-28T10:03:00.000Z',
              supersededByVersionId: 'version-two',
            },
          ],
          nextCursor: null,
        });
      if (path.includes(offerPath)) {
        const read = path.slice(path.indexOf(offerPath) + offerPath.length);
        state.offerReads.push(read || 'head');
        if (read === '/versions/version-one')
          return state.versionReadStatus === 200
            ? respond({ offer: offerAt(1) })
            : respond({}, state.versionReadStatus);
        if (read === '/versions/version-two' || read === '')
          return respond({ offer: offerAt(2) });
      }
      throw new Error('Unexpected API request: ' + path);
    }),
  );
  return state;
}

async function activityRow(description: string): Promise<HTMLElement> {
  const label = await screen.findByText(`Ada Ionescu ${description}`);
  const row = label.closest('li');
  if (!row) throw new Error(`Expected an Activity row for ${description}`);
  return row;
}

function offerRegion() {
  return screen.getByRole('region', { name: 'Illustrative Offer' });
}

// jsdom implements neither scrolling nor motion media queries.
const scrollable: {
  scrollIntoView?: (options?: ScrollIntoViewOptions) => void;
} = Element.prototype;
const nativeScrollIntoView = scrollable.scrollIntoView;

describe('Offer history in the Activity Log', () => {
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
    window.history.replaceState(null, '', '/?frame=classic#activity');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    scrollable.scrollIntoView = nativeScrollIntoView;
    window.history.replaceState(null, '', '/');
  });

  it('names each Offer event by reference, exact version, outcome and simulated marker only', async () => {
    installTransport();
    render(<App identity={deterministicBrowserIdentity()} />);

    const response = await activityRow(
      'recorded the Client response to an Offer Version (Accepted)',
    );
    expect(response).toHaveTextContent(
      'Target: Illustrative Offer 7 · version 2 · Simulated',
    );
    expect(
      within(response).getByRole('button', { name: 'Open Offer Version' }),
    ).toBeInTheDocument();
    expect(
      await activityRow('recorded the transmission of an Offer Version'),
    ).toHaveTextContent('Target: Illustrative Offer 7 · version 1 · Simulated');
    const approval = await activityRow('approved an Offer Version');
    expect(approval).toHaveTextContent(
      'Target: Illustrative Offer 7 · version 1',
    );
    expect(approval).not.toHaveTextContent('Simulated');
    const creation = await activityRow('created an illustrative Offer');
    expect(creation).toHaveTextContent('Target: Illustrative Offer 7');
    expect(
      within(creation).getByRole('button', { name: 'Open Offer' }),
    ).toBeInTheDocument();
  });

  it('opens the Request detail with the exact superseded Offer Version selected', async () => {
    const transport = installTransport();
    render(<App identity={deterministicBrowserIdentity()} />);

    fireEvent.click(
      within(
        await activityRow('recorded the transmission of an Offer Version'),
      ).getByRole('button', { name: 'Open Offer Version' }),
    );

    expect(
      await screen.findByText(`Original source of ${subject}`),
    ).toBeVisible();
    expect(
      await within(offerRegion()).findByText('Historical version · read only'),
    ).toBeVisible();
    expect(
      within(offerRegion()).getByText('Conditions of version 1'),
    ).toBeVisible();
    expect(transport.offerReads).toEqual(['/versions/version-one']);
    expect(transport.mutations).toEqual([]);
  });

  it('opens the Offer at its current version from its creation event', async () => {
    const transport = installTransport();
    render(<App identity={deterministicBrowserIdentity()} />);

    fireEvent.click(
      within(await activityRow('created an illustrative Offer')).getByRole(
        'button',
        { name: 'Open Offer' },
      ),
    );

    expect(
      await within(
        await screen.findByRole('region', {
          name: 'Illustrative Offer',
        }),
      ).findByText('Current version'),
    ).toBeVisible();
    expect(transport.offerReads).toEqual(['head']);
  });

  it('shows the existing unavailable state when the exact version is no longer readable', async () => {
    const transport = installTransport();
    transport.versionReadStatus = 404;
    render(<App identity={deterministicBrowserIdentity()} />);

    fireEvent.click(
      within(
        await activityRow('recorded the transmission of an Offer Version'),
      ).getByRole('button', { name: 'Open Offer Version' }),
    );

    expect(
      await screen.findByText('The Offer could not be loaded. Try again.'),
    ).toBeVisible();
    await waitFor(() =>
      expect(transport.offerReads).toEqual(['/versions/version-one']),
    );
    expect(screen.queryByText('Conditions of version 1')).toBeNull();
    expect(screen.queryByText('Conditions of version 2')).toBeNull();
  });
});
