import { changeValue } from './test/select-option';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import type { ActorContext } from './access-types';
import { pricingConfigurationCopy as copy } from './pricing-configuration/pricing-configuration.copy';

type ActiveCompany = NonNullable<ActorContext['activeCompany']>;
type Grants = Omit<Partial<ActiveCompany>, 'id' | 'displayName'>;
type RuleFixture = { scope: unknown; page: unknown };

const SCOPE = '/api/pricing-configuration/rule-scope';
const VERSIONS = '/api/pricing-configuration/rule-versions';
const companyA = { id: 'company-a', displayName: 'Company A' };
const companyB = { id: 'company-b', displayName: 'Company B' };
const companyC = { id: 'company-c', displayName: 'Company C' };

function pricingUser(assignmentId: string): Grants {
  return {
    pricingUserPermissions: [
      'commercial.offering.read',
      'commercial.pricing.configuration.read',
      'commercial.pricing.calculate',
      'commercial.pricing.snapshot.read',
    ],
    pricingUserPermissionAssignmentId: assignmentId,
    pricingUserPermissionSetVersion: 'v1',
  };
}

function configuration(assignmentId: string): Grants {
  return {
    pricingConfigurationPermissions: [
      'commercial.offering.read',
      'commercial.pricing.configuration.read',
      'commercial.pricing.configuration.manage',
    ],
    pricingConfigurationPermissionAssignmentId: assignmentId,
    pricingConfigurationPermissionSetVersion: 'v1',
  };
}

const catalogue: Grants = {
  serviceCataloguePermissions: [
    'service.definition.read',
    'service.definition.create',
    'commercial.offering.read',
    'commercial.offering.manage',
  ],
  serviceCataloguePermissionAssignmentId: 'catalogue-grant',
  serviceCataloguePermissionSetVersion: 'v1',
};

function actorIn(
  company: { id: string; displayName: string },
  ...grants: Grants[]
): ActorContext {
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
      ...company,
      clientPermissions: [],
      ...grants.reduce<Grants>(
        (merged, grant) => ({ ...merged, ...grant }),
        {},
      ),
    },
  };
}

function ruleVersion(
  id: string,
  versionNumber: number,
  label: string,
  state: 'CURRENT' | 'SCHEDULED',
  effectiveFrom: string,
) {
  return {
    id,
    versionNumber,
    label,
    effectiveFrom,
    effectiveTo: null,
    ruleShape: 'UNIT_PRICE_TIMES_QUANTITY',
    roundingMode: 'HALF_UP',
    roundingScale: 2,
    taxApplication: 'PER_LINE',
    provenance: 'ILLUSTRATIVE',
    provisional: true,
    state,
    supersession: null,
    createdByWorkspaceMembershipId: 'configuration-owner',
    createdAt: '2026-04-01T00:00:00.000Z',
  };
}

// A CURRENT version 1 and a scheduled head version 2, as a configuration
// owner published them.
function publishedRules(label: string): RuleFixture {
  const current = ruleVersion(
    `${label}-1`,
    1,
    `${label} rule A`,
    'CURRENT',
    '2026-04-01T00:00:00.000Z',
  );
  const scheduled = ruleVersion(
    `${label}-2`,
    2,
    `${label} rule B`,
    'SCHEDULED',
    '2026-05-01T00:00:00.000Z',
  );
  return {
    scope: { current, headVersionNumber: 2, provisional: true },
    page: { items: [scheduled, current], provisional: true },
  };
}

const noRules: RuleFixture = {
  scope: { current: null, headVersionNumber: null, provisional: true },
  page: { items: [], provisional: true },
};

interface ApiState {
  actors: Record<string, ActorContext>;
  rules: Record<string, RuleFixture>;
  // Companies whose configuration reads the server now refuses.
  refused: Set<string>;
  // A Company whose next scope read is held until the test releases it.
  held?: string;
}

interface RecordedRequest {
  path: string;
  companyId: string | null;
  method: string;
  signal: AbortSignal | undefined;
}

// Only the HTTP boundary is replaced: every actor, Company and configuration
// read answers from the state the test sets, as the API would.
function serve(state: ApiState) {
  const requests: RecordedRequest[] = [];
  let releaseHeld: (() => void) | undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(input.toString(), window.location.origin).pathname;
      const companyId = new Headers(init?.headers).get('x-company-context-id');
      requests.push({
        path,
        companyId,
        method: init?.method ?? 'GET',
        signal: init?.signal ?? undefined,
      });
      if (path === '/api/access/current-actor') {
        const actor = state.actors[companyId ?? companyA.id];
        return actor
          ? Response.json(actor)
          : Response.json({ message: 'Forbidden' }, { status: 403 });
      }
      if (path === '/api/companies')
        return Response.json([companyA, companyB, companyC]);
      if (path === '/api/activity-log') return Response.json({ events: [] });
      if (path === '/api/clients/search')
        return Response.json({ message: 'Forbidden' }, { status: 403 });
      if (path === SCOPE || path === VERSIONS) {
        const rules = companyId ? state.rules[companyId] : undefined;
        if (!companyId || !rules || state.refused.has(companyId))
          return Response.json({ message: 'Forbidden' }, { status: 403 });
        const body = path === SCOPE ? rules.scope : rules.page;
        if (path === SCOPE && state.held === companyId) {
          state.held = undefined;
          return new Promise<void>((resolve) => {
            releaseHeld = resolve;
          }).then(() => Response.json(body));
        }
        return Response.json(body);
      }
      return Response.json([]);
    }),
  );
  return {
    requests,
    release: () => {
      if (!releaseHeld) throw new Error('No held configuration read.');
      releaseHeld();
    },
  };
}

async function pricingSection(): Promise<HTMLElement> {
  return screen.findByRole('region', { name: 'Pricing Configuration' });
}

async function expectReadOnlyRules(
  section: HTMLElement,
  label: string,
): Promise<void> {
  expect(
    await within(section).findByText(copy.illustrativeMarker),
  ).toBeInTheDocument();
  const current = await within(section).findByRole('region', {
    name: copy.currentTitle,
  });
  expect(current).toHaveTextContent(`${label} rule A`);
  expect(within(section).getByText(copy.head(2))).toBeInTheDocument();
  const scheduled = within(section).getByRole('list', {
    name: copy.scheduledTitle,
  });
  expect(within(scheduled).getAllByRole('listitem')).toHaveLength(1);
  expect(scheduled).toHaveTextContent(`${copy.versionName(2)}${label} rule B`);
  expect(
    within(
      within(section).getByRole('list', { name: copy.versionsList }),
    ).getAllByRole('listitem'),
  ).toHaveLength(2);
  expect(within(section).queryByText(copy.publishTitle)).toBeNull();
  expect(
    within(section).queryByRole('button', { name: copy.publish }),
  ).toBeNull();
  expect(within(section).queryByLabelText(copy.label)).toBeNull();
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
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

it('shows a Pricing User alone the configuration read-only in both frames', async () => {
  const api = serve({
    actors: { [companyA.id]: actorIn(companyA, pricingUser('pricing-user-a')) },
    rules: { [companyA.id]: publishedRules('Company A') },
    refused: new Set(),
  });
  window.history.replaceState(null, '', '/?frame=prisme#pricing');
  const view = render(<App identity={deterministicBrowserIdentity()} />);
  const navigation = await screen.findByRole('navigation', {
    name: 'Primary navigation',
  });
  expect(
    await within(navigation).findByRole('link', {
      name: 'Pricing Configuration',
    }),
  ).toHaveAttribute('aria-current', 'page');
  await expectReadOnlyRules(await pricingSection(), 'Company A');
  // Pricing User opens no catalogue or Commercial Intake screen.
  for (const name of ['Service Catalogue', 'Client Requests'])
    expect(within(navigation).queryByRole('link', { name })).toBeNull();
  view.unmount();

  window.history.replaceState(null, '', '/?frame=classic');
  render(<App identity={deterministicBrowserIdentity()} />);
  await expectReadOnlyRules(await pricingSection(), 'Company A');
  expect(api.requests.filter((request) => request.method !== 'GET')).toEqual(
    [],
  );
});

it('offers publication only when Configuration also grants it, and no section to a Catalogue-only member', async () => {
  serve({
    actors: {
      [companyA.id]: actorIn(
        companyA,
        pricingUser('pricing-user-a'),
        configuration('configuration-a'),
      ),
    },
    rules: { [companyA.id]: publishedRules('Company A') },
    refused: new Set(),
  });
  window.history.replaceState(null, '', '/?frame=prisme#pricing');
  const both = render(<App identity={deterministicBrowserIdentity()} />);
  const section = await pricingSection();
  expect(
    await within(section).findByRole('button', { name: copy.publish }),
  ).toBeInTheDocument();
  expect(within(section).getByLabelText(copy.label)).toBeInTheDocument();
  both.unmount();

  const api = serve({
    actors: { [companyA.id]: actorIn(companyA, catalogue) },
    rules: { [companyA.id]: publishedRules('Company A') },
    refused: new Set(),
  });
  render(<App identity={deterministicBrowserIdentity()} />);
  const navigation = await screen.findByRole('navigation', {
    name: 'Primary navigation',
  });
  expect(
    await within(navigation).findByRole('link', { name: 'Service Catalogue' }),
  ).toBeInTheDocument();
  expect(
    within(navigation).queryByRole('link', { name: 'Pricing Configuration' }),
  ).toBeNull();
  expect(
    screen.queryByRole('region', { name: 'Pricing Configuration' }),
  ).toBeNull();
  expect(api.requests.map((request) => request.path)).not.toContain(SCOPE);
});

it('revalidates the actor after a refused read and removes the section with its configuration', async () => {
  const state: ApiState = {
    actors: { [companyA.id]: actorIn(companyA, pricingUser('pricing-user-a')) },
    rules: { [companyA.id]: publishedRules('Company A') },
    refused: new Set(),
  };
  const api = serve(state);
  window.history.replaceState(null, '', '/?frame=classic');
  render(<App identity={deterministicBrowserIdentity()} />);
  const section = await pricingSection();
  await expectReadOnlyRules(section, 'Company A');

  // The administrator revokes Pricing User; the next read is refused.
  state.actors[companyA.id] = actorIn(companyA);
  state.refused.add(companyA.id);
  const actorReads = api.requests.filter(
    (request) => request.path === '/api/access/current-actor',
  ).length;
  fireEvent.click(within(section).getByRole('button', { name: copy.reload }));

  await waitFor(() =>
    expect(
      screen.queryByRole('region', { name: 'Pricing Configuration' }),
    ).toBeNull(),
  );
  expect(
    api.requests.filter(
      (request) =>
        request.path === '/api/access/current-actor' &&
        request.companyId === companyA.id,
    ).length,
  ).toBeGreaterThan(0);
  expect(
    api.requests.filter(
      (request) => request.path === '/api/access/current-actor',
    ).length,
  ).toBeGreaterThan(actorReads);
  expect(screen.queryByText('Company A rule A')).toBeNull();
  expect(screen.queryByText('Company A rule B')).toBeNull();
  expect(screen.queryByText(copy.illustrativeMarker)).toBeNull();
});

it('ignores a late reply of the previous Company and hides the section in a Company without the bundle', async () => {
  const state: ApiState = {
    actors: {
      [companyA.id]: actorIn(companyA, pricingUser('pricing-user-a')),
      [companyB.id]: actorIn(companyB),
      [companyC.id]: actorIn(companyC, pricingUser('pricing-user-c')),
    },
    rules: {
      [companyA.id]: publishedRules('Company A'),
      [companyC.id]: noRules,
    },
    refused: new Set(),
    held: companyA.id,
  };
  const api = serve(state);
  window.history.replaceState(null, '', '/?frame=classic');
  render(<App identity={deterministicBrowserIdentity()} />);
  await pricingSection();
  await waitFor(() =>
    expect(
      api.requests.some(
        (request) =>
          request.path === SCOPE && request.companyId === companyA.id,
      ),
    ).toBe(true),
  );
  const heldRead = api.requests.find(
    (request) => request.path === SCOPE && request.companyId === companyA.id,
  );

  changeValue(
    screen.getByLabelText('Active Company', { exact: true }),
    companyC.id,
  );
  await screen.findByText(copy.noCurrent);
  const section = await pricingSection();
  expect(section).toHaveTextContent(companyC.displayName);
  expect(heldRead?.signal?.aborted).toBe(true);
  await act(async () => {
    api.release();
  });
  expect(within(section).getByText(copy.noCurrent)).toBeInTheDocument();
  expect(screen.queryByText('Company A rule A')).toBeNull();
  expect(screen.queryByText(copy.head(2))).toBeNull();

  changeValue(
    screen.getByLabelText('Active Company', { exact: true }),
    companyB.id,
  );
  await waitFor(() =>
    expect(
      screen.queryByRole('region', { name: 'Pricing Configuration' }),
    ).toBeNull(),
  );
});

it('remounts the whole section when Pricing User is granted, granted again or revoked', async () => {
  const clientReader: Grants = { clientPermissions: ['client.read'] };
  const state: ApiState = {
    actors: {
      [companyA.id]: actorIn(
        companyA,
        configuration('configuration-a'),
        clientReader,
      ),
    },
    rules: { [companyA.id]: publishedRules('Company A') },
    refused: new Set(),
  };
  serve(state);
  window.history.replaceState(null, '', '/?frame=classic');
  render(<App identity={deterministicBrowserIdentity()} />);
  const revalidateAccess = () => {
    changeValue(screen.getByLabelText('Find a shared Client'), 'Example');
    fireEvent.click(screen.getByRole('button', { name: 'Search Clients' }));
  };

  // Revalidating an unchanged actor keeps the mounted section and its draft.
  const kept = within(await pricingSection()).getByLabelText(copy.label);
  changeValue(kept, 'Kept draft');
  const actorReads = () =>
    vi
      .mocked(fetch)
      .mock.calls.filter(([input]) =>
        input.toString().endsWith('/access/current-actor'),
      ).length;
  const readsBefore = actorReads();
  // A real refused search revalidates the actor without replacing the Company.
  revalidateAccess();
  await waitFor(() => expect(actorReads()).toBeGreaterThan(readsBefore));
  expect(within(await pricingSection()).getByLabelText(copy.label)).toHaveValue(
    'Kept draft',
  );

  for (const grants of [
    [configuration('configuration-a'), pricingUser('pricing-user-1')],
    [configuration('configuration-a'), pricingUser('pricing-user-2')],
    [configuration('configuration-a')],
  ]) {
    const draft = within(await pricingSection()).getByLabelText(copy.label);
    changeValue(draft, 'Unsent draft');
    expect(draft).toHaveValue('Unsent draft');

    state.actors[companyA.id] = actorIn(companyA, ...grants, clientReader);
    const readsBeforeChange = actorReads();
    revalidateAccess();
    await waitFor(() =>
      expect(actorReads()).toBeGreaterThan(readsBeforeChange),
    );
    await waitFor(() =>
      expect(
        within(
          screen.getByRole('region', { name: 'Pricing Configuration' }),
        ).getByLabelText(copy.label),
      ).toHaveValue(''),
    );
  }
});

it.each([
  ['company_pricing_user_assignment.granted', 'granted Company Pricing User'],
  ['company_pricing_user_assignment.revoked', 'revoked Company Pricing User'],
] as const)(
  'labels the %s lifecycle event in the Activity view',
  async (action, label) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const path = new URL(input.toString(), window.location.origin).pathname;
        if (path === '/api/activity-log')
          return Response.json({
            events: [
              {
                id: `event-${action}`,
                action,
                occurredAt: '2026-08-15T10:30:00.000Z',
                actor: {
                  internalUserId: 'owner-1',
                  displayName: 'Workspace Owner',
                },
                target: {
                  type: 'company_role_assignment',
                  assignmentId: 'assignment-1',
                  internalUserId: 'member-1',
                  internalUserDisplayName: 'Workspace Member',
                  workspaceMembershipId: 'membership-1',
                  companyId: 'company-1',
                  companyDisplayName: 'North Star Consulting',
                },
                metadata: { bundle: 'Company Pricing User' },
              },
            ],
          });
        if (path === '/api/access/current-actor')
          return Response.json({
            internalUserId: 'owner-1',
            workspaceMembershipId: 'owner-membership',
            workspaceId: 'workspace-1',
            workspaceName: 'PRISMA Workspace',
            displayName: 'Workspace Owner',
            email: 'owner@example.test',
            active: true,
            workspacePermissions: ['company.manage'],
          });
        return Response.json([]);
      }),
    );
    render(<App identity={deterministicBrowserIdentity()} />);
    expect(
      await screen.findByText(`Workspace Owner ${label}`),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Target: Workspace Member — North Star Consulting'),
    ).toBeInTheDocument();
  },
);
