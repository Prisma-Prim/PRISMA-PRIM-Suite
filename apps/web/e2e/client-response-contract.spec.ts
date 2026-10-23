import { expect, test } from '@playwright/test';
import {
  actorContextFixture,
  operationalHomeFixture,
} from './actor-context.fixture';

test('rejects the whole malformed Client list and recovers on a deliberate reload', async ({
  page,
}, testInfo) => {
  const company = {
    id: 'company-response-contract',
    displayName: 'PRISMA-PRIM',
  };
  const client = {
    id: 'valid-client',
    displayName: 'Literal Client SRL',
    relatedToActiveCompany: true,
  };
  const malformedClient = {
    id: 'malformed-client',
    displayName: 'Malformed Client',
    relatedToActiveCompany: 'false',
  };
  let recovering = false;

  await page.route('**/api/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/access/current-actor'))
      return route.fulfill({
        json: {
          ...actorContextFixture,
          workspacePermissions: ['client.manage'],
          activeCompany: {
            ...company,
            clientPermissions: ['client.read', 'client.create'],
            clientPermissionAssignmentId: 'client-reader-response-contract',
            clientPermissionSetVersion: 'v1',
          },
        },
      });
    if (path.endsWith('/companies')) return route.fulfill({ json: [company] });
    if (path.endsWith('/activity-log'))
      return route.fulfill({ json: { events: [] } });
    if (path.endsWith('/operational-home'))
      return route.fulfill({
        json: operationalHomeFixture(company.id, { active_clients: 1 }),
      });
    if (path === '/api/clients' && request.method() === 'GET')
      return route.fulfill({
        json: recovering
          ? [{ ...client, futureMetadata: { source: 'additive-field' } }]
          : [client, malformedClient],
      });
    return route.fulfill({ status: 404 });
  });

  await page.goto('/?frame=prisme#clients');
  const clients = page.getByRole('region', { name: 'Clients', exact: true });
  const listError = clients.getByRole('alert').filter({
    hasText: 'We could not load Clients. Please try again.',
  });
  await expect(listError).toBeVisible();
  await expect(
    clients.getByRole('heading', { name: client.displayName, exact: true }),
  ).toHaveCount(0);
  await expect(
    clients.getByRole('heading', {
      name: malformedClient.displayName,
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    clients.getByRole('button', { name: 'Open dossier', exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath('client-list-malformed-response.png'),
    fullPage: true,
  });

  // The existing list error has no Retry control; reload is the explicit retry.
  recovering = true;
  await page.reload();

  await expect(
    clients.getByRole('heading', { name: client.displayName, exact: true }),
  ).toBeVisible();
  await expect(listError).toHaveCount(0);
  await expect(
    clients.getByRole('heading', {
      name: malformedClient.displayName,
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    clients.getByText('Available in PRISMA-PRIM', { exact: true }),
  ).toBeVisible();
  await expect(
    clients.getByRole('button', { name: 'Open dossier', exact: true }),
  ).toBeEnabled();
  await expect(
    clients.getByRole('button', { name: 'Search Clients', exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath('client-list-valid-additive-response.png'),
    fullPage: true,
  });

  await clients
    .getByRole('button', { name: 'New Client', exact: true })
    .click();
  await expect(clients.getByLabel('Client display name')).toBeFocused();
  await expect(
    clients.getByRole('button', { name: 'Create Client', exact: true }),
  ).toBeEnabled();
  await clients.getByRole('button', { name: 'Close registration' }).click();
  await expect(
    clients.getByRole('button', { name: 'New Client', exact: true }),
  ).toBeFocused();
});
