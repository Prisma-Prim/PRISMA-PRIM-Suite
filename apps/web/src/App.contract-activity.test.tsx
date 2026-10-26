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
const requestId = 'request-593';
const opportunityId = 'opportunity-593';
const subject = 'Contract history Request';
const actor = { internalUserId: 'user-1', displayName: 'Ada Ionescu' };
const owner = { opportunityId, clientRequestId: requestId, companyId };
const contractVersion = (contractVersionId: string, versionNumber: number) => ({
  type: 'contract_version',
  contractId: 'contract-one',
  contractVersionId,
  kind: 'CONTRACT',
  illustrativeReference: 4,
  versionNumber,
  ...owner,
});
const addendumVersion = {
  type: 'contract_version',
  contractId: 'addendum-one',
  contractVersionId: 'addendum-version-one',
  kind: 'ADDENDUM',
  illustrativeReference: 5,
  versionNumber: 1,
  ...owner,
};

const contractEvents = [
  {
    id: 'event-addendum',
    action: 'contract.created',
    occurredAt: '2026-09-28T10:09:00.000Z',
    actor,
    target: addendumVersion,
    metadata: {},
  },
  {
    id: 'event-link',
    action: 'contract_project.linked',
    occurredAt: '2026-09-28T10:08:00.000Z',
    actor,
    target: contractVersion('version-two', 2),
    metadata: {
      created: true,
      project: { projectId: 'project-one', projectTitle: 'Synthetic Project' },
    },
  },
  {
    id: 'event-signature',
    action: 'contract_version.signature_recorded',
    occurredAt: '2026-09-28T10:07:00.000Z',
    actor,
    target: contractVersion('version-two', 2),
    metadata: { evidenceKind: 'SIMULATED' },
  },
  {
    id: 'event-rejection',
    action: 'contract_version.rejected',
    occurredAt: '2026-09-28T10:05:00.000Z',
    actor,
    target: contractVersion('version-one', 1),
    metadata: {},
  },
  {
    id: 'event-contract',
    action: 'contract.created',
    occurredAt: '2026-09-28T10:03:00.000Z',
    actor,
    // Version 2 now succeeds it, yet the creation still concerns version 1.
    target: contractVersion('version-one', 1),
    metadata: {},
  },
];

type Transport = { contractReads: string[]; versionReadStatus: number };

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
      contractPermissions: [
        'commercial.contract.read',
        'commercial.contract.approve',
        'commercial.contract.signature.record',
      ],
      contractApproverAssignmentId: 'approver-1',
      contractApproverPermissionSetVersion: 'v1',
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
    initialOpportunity: { id: opportunityId, title: 'Contract history' },
  });
}

/** A rejected version 1 superseded by version 2 of the main Contract. */
function contractAt(versionNumber: 1 | 2) {
  const id = versionNumber === 1 ? 'version-one' : 'version-two';
  return {
    id: 'contract-one',
    companyId,
    opportunityId,
    kind: 'CONTRACT',
    origin: 'ACCEPTED_OFFER',
    sourceOfferId: 'offer-one',
    sourceOfferVersionId: 'accepted-version',
    sourceOffer: { illustrativeReference: 7, versionNumber: 1 },
    revision: 3,
    illustrativeReference: 4,
    provisional: true,
    precontract: null,
    addenda: [],
    linkedProjects: [],
    version: {
      id,
      versionNumber,
      createdContractRevision: versionNumber === 1 ? 1 : 3,
      predecessorVersionId: versionNumber === 1 ? null : 'version-one',
      supersededByVersionId: versionNumber === 1 ? 'version-two' : null,
      recipient: {
        kind: 'PRIMARY',
        legalName: 'Synthetic recorded party',
        taxId: 'SYNTHETIC',
        legalAddress: 'Example Street',
      },
      qualityRuleSet: 'CONTRACT_QUALITY_ILLUSTRATIVE',
      qualityRuleSetVersion: 1,
      issuingCompanyLabel: 'Company A',
      scopeNote: 'Synthetic accepted scope',
      commercialConditions: 'Accepted conditions',
      termStartsOn: null,
      termEndsOn: null,
      specialConditions: `Conditions of version ${versionNumber}`,
      latestQualityRun: null,
      decisionState: 'PENDING',
      decision: null,
      signature: null,
      executionState: 'NOT_EXECUTED',
      provenance: 'ILLUSTRATIVE',
      provisional: true,
      pricingSnapshotId: 'snapshot-one',
      pricingSnapshot: {
        id: 'snapshot-one',
        currency: 'EUR',
        subtotal: '300.00',
        taxTotal: '45.00',
        total: '345.00',
        lines: [
          {
            serviceName: 'Illustrative service',
            quantity: '1',
            lineNet: '300.00',
            lineTax: '45.00',
          },
        ],
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

function installTransport(): Transport {
  const state: Transport = { contractReads: [], versionReadStatus: 200 };
  const contractPath = `/contracts/opportunities/${opportunityId}`;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(input.toString(), 'http://localhost').pathname;
      if ((init?.method ?? 'GET') !== 'GET')
        throw new Error(`Unexpected mutation: ${path}`);
      if (path.endsWith('/access/current-actor')) return respond(reader());
      if (path.endsWith('/companies'))
        return respond([{ id: companyId, displayName: 'Company A' }]);
      if (path.endsWith('/activity-log'))
        return respond({ events: contractEvents });
      if (path.endsWith('/commercial-intake/requests'))
        return respond({ items: [requestListItemFor(requestDetail())] });
      if (path.endsWith(`/commercial-intake/requests/${requestId}`))
        return respond(requestDetail());
      if (path.includes(contractPath)) {
        const read = path.slice(
          path.indexOf(contractPath) + contractPath.length,
        );
        if (read.endsWith('/versions') || read.includes('/quality-checks'))
          return respond({ items: [], nextCursor: null });
        state.contractReads.push(read || 'head');
        if (read === '/versions/version-one')
          return state.versionReadStatus === 200
            ? respond({ contract: contractAt(1) })
            : respond({}, state.versionReadStatus);
        if (read === '/agreements/addendum-one/versions/addendum-version-one')
          return respond({}, 404);
        if (read === '')
          return respond({ contract: contractAt(2), precontract: null });
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

function contractRegion() {
  return screen.getByRole('region', { name: 'Contract' });
}

// jsdom implements neither scrolling nor motion media queries.
const scrollable: {
  scrollIntoView?: (options?: ScrollIntoViewOptions) => void;
} = Element.prototype;
const nativeScrollIntoView = scrollable.scrollIntoView;

describe('Contract history in the Activity Log', () => {
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

  it('names each Contract event by kind, reference, exact version, simulated marker and linked Project only', async () => {
    installTransport();
    render(<App identity={deterministicBrowserIdentity()} />);

    const link = await activityRow('linked a Project to an agreement');
    expect(link).toHaveTextContent(
      'Target: Illustrative Contract 4 · version 2 — Created Project: Synthetic Project',
    );
    expect(
      within(link).getByRole('button', { name: 'Open agreement version' }),
    ).toBeInTheDocument();
    expect(
      await activityRow('recorded the signature of an agreement version'),
    ).toHaveTextContent(
      'Target: Illustrative Contract 4 · version 2 · Simulated',
    );
    const rejection = await activityRow('rejected an agreement version');
    expect(rejection).toHaveTextContent(
      'Target: Illustrative Contract 4 · version 1',
    );
    expect(rejection).not.toHaveTextContent('Simulated');
    const [addendum, contract] = await screen.findAllByText(
      'Ada Ionescu created an illustrative agreement',
    );
    expect(addendum?.closest('li')).toHaveTextContent(
      'Target: Illustrative Addendum 5 · version 1',
    );
    expect(contract?.closest('li')).toHaveTextContent(
      'Target: Illustrative Contract 4 · version 1',
    );
  });

  it('opens the Request detail with the exact superseded Contract Version selected', async () => {
    const transport = installTransport();
    render(<App identity={deterministicBrowserIdentity()} />);

    fireEvent.click(
      within(await activityRow('rejected an agreement version')).getByRole(
        'button',
        { name: 'Open agreement version' },
      ),
    );

    expect(
      await screen.findByText(`Original source of ${subject}`),
    ).toBeVisible();
    await waitFor(() =>
      expect(
        within(contractRegion()).getByText('Conditions of version 1'),
      ).toBeVisible(),
    );
    expect(
      within(contractRegion()).getByText(
        'Historical version — preserved; no further decision or signature.',
      ),
    ).toBeVisible();
    expect(transport.contractReads).toEqual(['/versions/version-one']);
  });

  it('opens an Addendum as its own agreement and shows the existing unavailable state when it cannot be read', async () => {
    const transport = installTransport();
    render(<App identity={deterministicBrowserIdentity()} />);

    const [addendum] = await screen.findAllByText(
      'Ada Ionescu created an illustrative agreement',
    );
    const row = addendum?.closest('li');
    if (!(row instanceof HTMLElement)) throw new Error('Expected a row.');
    fireEvent.click(
      within(row).getByRole('button', { name: 'Open agreement version' }),
    );

    expect(
      await screen.findByText('The Contract could not be loaded. Try again.'),
    ).toBeVisible();
    expect(transport.contractReads).toEqual([
      '/agreements/addendum-one/versions/addendum-version-one',
    ]);
  });

  it('never shows another version when the exact version is no longer readable', async () => {
    const transport = installTransport();
    transport.versionReadStatus = 404;
    render(<App identity={deterministicBrowserIdentity()} />);

    fireEvent.click(
      within(await activityRow('rejected an agreement version')).getByRole(
        'button',
        { name: 'Open agreement version' },
      ),
    );

    expect(
      await screen.findByText('The Contract could not be loaded. Try again.'),
    ).toBeVisible();
    await waitFor(() =>
      expect(transport.contractReads).toEqual(['/versions/version-one']),
    );
    expect(screen.queryByText('Conditions of version 1')).toBeNull();
    expect(screen.queryByText('Conditions of version 2')).toBeNull();
  });
});
