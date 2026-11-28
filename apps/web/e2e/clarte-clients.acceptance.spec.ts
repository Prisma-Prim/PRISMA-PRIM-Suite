import { expect, test, type Page, type Route } from '@playwright/test';
import {
  bakeryClient,
  createClarteClientsApi,
  orchardClient,
  orchardProject,
  orchardRequest,
  registeredClient,
  sharedClient,
} from '../src/clarte/clients/clarte-clients.test-fixture';
import { isPhoneLayout, openClarte } from './clarte.fixture';

/** Every API request is answered by the shared fictional Clients API. */
async function serveClients(page: Page) {
  const api = createClarteClientsApi();
  await page.route('**/api/**', async (route: Route) => {
    const request = route.request();
    const contentType = request.headers()['content-type'] ?? '';
    const reply = api.reply({
      method: request.method(),
      url: new URL(request.url()),
      body: contentType.startsWith('application/json')
        ? request.postDataJSON()
        : undefined,
      companyId: request.headers()['x-company-context-id'] ?? null,
    });
    return route.fulfill({ status: reply.status, json: reply.json });
  });
  return api;
}

async function screenshot(page: Page, name: string) {
  const width = isPhoneLayout(page) ? '390' : '1440';
  await page.screenshot({
    path: test.info().outputPath(`${name}-${width}.png`),
    fullPage: false,
  });
}

async function noHorizontalScroll(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

function card(page: Page, displayName: string) {
  return page
    .getByRole('region', { name: 'Clients in PRISMA-PRIM' })
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: displayName }) });
}

async function showView(page: Page, view: string) {
  await page
    .getByRole('tablist', { name: 'Client dossier sections' })
    .getByRole('tab', { name: view, exact: true })
    .click();
}

async function chooseSource(page: Page, field: string, source: string) {
  await page.getByRole('combobox', { name: field, exact: true }).click();
  await page.getByRole('option', { name: source }).click();
}

test('registers a Client, works through one dossier, unites two Clients and undoes it, then opens the Client’s deals', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const api = await serveClients(page);
  await openClarte(page, '/#clients');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Clients');
  await expect(card(page, orchardClient.displayName)).toBeVisible();
  await expect(card(page, bakeryClient.displayName)).toBeVisible();
  await noHorizontalScroll(page);
  await screenshot(page, 'directory');

  // Register a Client with a Contact in the side panel.
  await page.getByRole('button', { name: 'New Client' }).click();
  const registration = page.getByRole('dialog', { name: 'Register a Client' });
  await registration
    .getByLabel('Client display name')
    .fill(registeredClient.displayName);
  await registration.getByLabel('IDNO / tax code').fill('1018600099887');
  await registration.getByRole('button', { name: 'Add Contact' }).click();
  await registration
    .getByRole('group', { name: 'Contact 1' })
    .getByLabel('Contact name')
    .fill('Elena Gavriliță');
  await screenshot(page, 'registration');
  await registration.getByRole('button', { name: 'Create Client' }).click();
  await expect(
    page.getByText('Client created and linked to the active Company.'),
  ).toBeVisible();
  await expect(registration).toBeHidden();
  await expect(card(page, registeredClient.displayName)).toBeVisible();

  // Find a shared Client of the Workspace and add it to the Company.
  await page
    .getByRole('searchbox', { name: 'Find a shared Client' })
    .fill('Prut');
  await page.getByRole('button', { name: 'Search Clients' }).click();
  const results = page.getByRole('region', { name: 'Search results' });
  await results.getByRole('button', { name: 'Add to PRISMA-PRIM' }).click();
  await expect(
    results.getByRole('listitem').filter({ hasText: sharedClient.displayName }),
  ).toContainText('Available in PRISMA-PRIM');
  await page.getByRole('button', { name: 'Back to Company Clients' }).click();
  await expect(card(page, sharedClient.displayName)).toBeVisible();

  // One dossier: identity, legal entities and status, then its views.
  await card(page, orchardClient.displayName)
    .getByRole('button', { name: 'Open dossier' })
    .click();
  const dossier = page.getByRole('region', { name: orchardClient.displayName });
  await expect(
    dossier.getByRole('heading', { level: 2, name: orchardClient.displayName }),
  ).toBeFocused();
  await expect(dossier.getByText('1 legal entity or branch')).toBeVisible();
  await expect(
    dossier.getByRole('region', { name: 'Shared details' }),
  ).toContainText('1018600012345');
  await expect(
    dossier.getByRole('region', { name: 'Client missions' }),
  ).toContainText(orchardProject.title);
  await noHorizontalScroll(page);
  await screenshot(page, 'dossier');

  await showView(page, 'Contacts');
  await expect(dossier.getByRole('region', { name: 'Contacts' })).toContainText(
    'Final decision-maker',
  );
  await screenshot(page, 'contacts');

  await showView(page, 'Legal entities and branches');
  const entities = dossier.getByRole('region', {
    name: 'Legal entities and branches',
  });
  await entities
    .getByRole('button', { name: 'Add legal entity or branch' })
    .click();
  const entity = entities.getByRole('form', {
    name: 'Add a legal entity or branch',
  });
  await entity
    .getByLabel('Exact legal name')
    .fill('Codru Orchards SRL — Soroca branch');
  await entity.getByRole('button', { name: 'Save legal entity' }).click();
  await expect(
    entities.getByText('Legal entity or branch recorded.'),
  ).toBeVisible();
  await expect(dossier.getByText('2 legal entities or branches')).toBeVisible();

  // Correct the shared record from its side panel.
  await dossier.getByRole('button', { name: 'Correct Client dossier' }).click();
  const correction = page.getByRole('form', { name: 'Correct Client dossier' });
  await correction.getByLabel('Telephone').fill('+373 235 20 199');
  await correction.getByRole('button', { name: 'Save correction' }).click();
  await expect(
    correction.getByText('Client correction saved with attributable history.'),
  ).toBeVisible();
  await correction.getByRole('button', { name: 'Close correction' }).click();

  // History: corrections, then a supervised union and its reversal.
  await showView(page, 'History');
  await dossier
    .getByRole('button', { name: 'Show correction history' })
    .click();
  await expect(dossier.getByText('str. Livezilor 10, Orhei')).toBeVisible();
  await dossier
    .getByRole('button', { name: 'Review existing duplicates' })
    .click();
  const union = page.getByRole('form', { name: 'Confirm union' });
  const canonicalSource = `Source 2 · ${bakeryClient.displayName}`;
  for (const field of [
    'Canonical Client dossier',
    'Client display name',
    'IDNO / tax code',
    'Address',
    'Telephone',
    'General email',
    'Business activity',
  ])
    await chooseSource(page, field, canonicalSource);
  await union
    .getByLabel('Reason for this union')
    .fill('Same legal identity, registered twice.');
  for (const checkbox of await union.getByRole('checkbox').all())
    await checkbox.check();
  await union
    .getByRole('heading', { level: 4 })
    .first()
    .scrollIntoViewIfNeeded();
  await screenshot(page, 'merge');
  await union.getByRole('button', { name: 'Confirm union' }).click();
  const canonical = page.getByRole('region', {
    name: bakeryClient.displayName,
  });
  await expect(
    page.getByText(
      'Union confirmed. The canonical dossier is now available in the affected Companies.',
    ),
  ).toBeVisible();
  await showView(page, 'History');
  await canonical.getByRole('button', { name: 'Union history' }).click();
  await canonical
    .getByRole('button', { name: 'View authorized union details' })
    .click();
  await canonical
    .getByRole('button', { name: 'Open canonical Client dossier' })
    .click();
  await expect(
    canonical.getByRole('region', { name: 'Shared details' }),
  ).toBeVisible();
  await showView(page, 'History');
  await canonical.getByRole('button', { name: 'Union history' }).click();
  await canonical
    .getByRole('button', { name: 'View authorized union details' })
    .click();
  const reversal = canonical.getByRole('form', { name: 'Reverse union' });
  await reversal
    .getByLabel('Reason for reversal')
    .fill('Registered as two Clients on purpose.');
  await reversal.getByRole('checkbox').check();
  await reversal.getByRole('button', { name: 'Reverse union' }).click();
  await expect(canonical.getByText(/^Union reversed\./u)).toBeVisible();

  // Back to the Client: its deals only, then every deal again.
  await page.getByRole('button', { name: 'Back to Clients' }).click();
  await card(page, orchardClient.displayName)
    .getByRole('button', { name: 'Open dossier' })
    .click();
  await showView(page, 'Deals');
  await expect(
    dossier.getByRole('region', { name: 'Commercial affairs' }),
  ).toContainText(orchardRequest.subject);
  await dossier.getByRole('button', { name: 'Open Client Requests' }).click();
  await expect(page).toHaveURL(/#requests$/u);
  await expect(
    page.getByText(`Deals of the Client ${orchardClient.displayName}`),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Show all deals' }).click();
  await expect(
    page.getByText(`Deals of the Client ${orchardClient.displayName}`),
  ).toBeHidden();

  expect(api.writes).toEqual([
    'POST /api/clients',
    `PUT /api/clients/${sharedClient.id}/active-company-relationship`,
    `POST /api/clients/${orchardClient.id}/legal-entities`,
    `PATCH /api/clients/${orchardClient.id}`,
    `POST /api/clients/${orchardClient.id}/union-reviews`,
    'POST /api/client-union-reviews/00000000-0000-4000-8000-000000004951/confirm',
    'POST /api/client-union-operations/00000000-0000-4000-8000-000000004951/reversal',
  ]);
});
