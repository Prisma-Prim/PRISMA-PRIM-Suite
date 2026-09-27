import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import type { ActorContext } from './access-types';
import { pricingConfigurationCopy } from './pricing-configuration/pricing-configuration.copy';
import { tariffVersionCopy } from './pricing-configuration/tariff-version.copy';
import { selectOption } from './test/select-option';

const company = {
  id: 'company-1',
  displayName: 'PRISMA-PRIM',
  clientPermissions: [],
  pricingConfigurationPermissions: [
    'commercial.offering.read',
    'commercial.pricing.configuration.read',
    'commercial.pricing.configuration.manage',
  ],
  pricingConfigurationPermissionAssignmentId: 'configuration-grant',
  pricingConfigurationPermissionSetVersion: 'v1',
} satisfies ActorContext['activeCompany'];
const actor: ActorContext = {
  internalUserId: 'user-1',
  workspaceMembershipId: 'membership-1',
  workspaceId: 'workspace-1',
  workspaceName: 'PRISMA Workspace',
  displayName: 'Ada Ionescu',
  email: 'ada@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: company,
};
const OFFERING_ID = '10000000-0000-4000-8000-00000000000a';
const catalogueOnly: ActorContext = {
  ...actor,
  activeCompany: {
    id: 'company-1',
    displayName: 'PRISMA-PRIM',
    clientPermissions: [],
    serviceCataloguePermissions: [
      'service.definition.read',
      'service.definition.create',
      'commercial.offering.read',
      'commercial.offering.manage',
    ],
    serviceCataloguePermissionAssignmentId: 'catalogue-grant',
    serviceCataloguePermissionSetVersion: 'v1',
  },
};

function serve(current: ActorContext) {
  const paths: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(input.toString(), window.location.origin).pathname;
      paths.push(path);
      if (path === '/api/access/current-actor') return Response.json(current);
      if (path === '/api/activity-log') return Response.json({ events: [] });
      if (path === '/api/pricing-configuration/rule-scope')
        return Response.json({
          current: null,
          headVersionNumber: null,
          provisional: true,
        });
      if (path === '/api/pricing-configuration/rule-versions')
        return Response.json({ items: [], provisional: true });
      if (path === '/api/commercial-catalogue/offerings')
        return Response.json({
          items: [
            {
              id: OFFERING_ID,
              serviceDefinition: {
                code: 'SERVICE-A',
                name: 'Illustrative service A',
              },
              commercialLabel: null,
            },
          ],
        });
      if (
        path ===
        `/api/pricing-configuration/offerings/${OFFERING_ID}/tariff-scope`
      )
        return Response.json({
          offeringId: OFFERING_ID,
          current: null,
          headVersionNumber: null,
          provisional: true,
        });
      if (
        path ===
        `/api/pricing-configuration/offerings/${OFFERING_ID}/tariff-versions`
      )
        return Response.json({ items: [], provisional: true });
      return Response.json([]);
    }),
  );
  return paths;
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

it('offers the configuration screen in both frames to a configuration reader', async () => {
  const paths = serve(actor);
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
  const prisme = screen.getByRole('region', { name: 'Pricing Configuration' });
  expect(
    await within(prisme).findByText(
      pricingConfigurationCopy.illustrativeMarker,
    ),
  ).toBeVisible();
  expect(
    await within(prisme).findByText(pricingConfigurationCopy.noCurrent),
  ).toBeVisible();
  expect(paths).toContain('/api/pricing-configuration/rule-scope');
  // The Tariff panel sits beside the Pricing Rule screen, separate from it.
  const tariffs = within(prisme.parentElement ?? document.body).getByRole(
    'region',
    { name: tariffVersionCopy.title },
  );
  expect(prisme).not.toContainElement(tariffs);
  expect(
    await within(tariffs).findByText(tariffVersionCopy.illustrativeMarker),
  ).toBeVisible();
  selectOption(
    await within(tariffs).findByLabelText(tariffVersionCopy.offering),
    OFFERING_ID,
  );
  expect(
    await within(tariffs).findByText(tariffVersionCopy.noCurrent),
  ).toBeVisible();
  expect(paths).toContain(
    `/api/pricing-configuration/offerings/${OFFERING_ID}/tariff-scope`,
  );
  view.unmount();

  window.history.replaceState(null, '', '/?frame=classic');
  render(<App identity={deterministicBrowserIdentity()} />);
  const classic = await screen.findByRole('region', {
    name: 'Pricing Configuration',
  });
  expect(
    await within(classic).findByText(
      pricingConfigurationCopy.illustrativeMarker,
    ),
  ).toBeInTheDocument();
  expect(
    await within(
      await screen.findByRole('region', { name: tariffVersionCopy.title }),
    ).findByText(tariffVersionCopy.illustrativeMarker),
  ).toBeInTheDocument();
});

it('offers no configuration screen to a Catalogue-only member', async () => {
  const paths = serve(catalogueOnly);
  window.history.replaceState(null, '', '/?frame=prisme#pricing');
  render(<App identity={deterministicBrowserIdentity()} />);
  const navigation = await screen.findByRole('navigation', {
    name: 'Primary navigation',
  });
  expect(
    await within(navigation).findByRole('link', { name: 'Service Catalogue' }),
  ).toBeInTheDocument();
  expect(
    within(navigation).queryByRole('link', { name: 'Pricing Configuration' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('region', { name: 'Pricing Configuration' }),
  ).not.toBeInTheDocument();
  expect(paths).not.toContain('/api/pricing-configuration/rule-scope');
  expect(
    screen.queryByRole('region', { name: tariffVersionCopy.title }),
  ).not.toBeInTheDocument();
  expect(paths.filter((path) => path.includes('/tariff-'))).toEqual([]);
});
