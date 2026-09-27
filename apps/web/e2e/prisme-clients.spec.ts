import { enterClassicCompatibility } from './classic-compatibility';
import { expectValue, selectOption } from './select-option';
import { expect, test } from '@playwright/test';
import {
  actorContextFixture,
  operationalHomeFixture,
} from './actor-context.fixture';

test('finds and deliberately reuses one Client across Companies in Prisme', async ({
  page,
}, testInfo) => {
  const companyA = { id: 'company-a', displayName: 'PRISMA-PRIM' };
  const companyB = { id: 'company-b', displayName: 'BIC' };
  const client = {
    id: 'client-231',
    displayName: 'Exemplu Client — Research and Certification Services',
    relatedToActiveCompany: true,
  };
  const related = new Set<string>();
  let searches = 0;
  await page.route('**/api/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const companyId = request.headers()['x-company-context-id'];
    const company = companyId === companyB.id ? companyB : companyA;
    if (url.pathname.endsWith('/access/current-actor'))
      return route.fulfill({
        json: {
          ...actorContextFixture,
          workspacePermissions: ['company.manage', 'client.manage'],
          ...(companyId
            ? {
                activeCompany: {
                  ...company,
                  clientPermissions:
                    company.id === companyB.id
                      ? ['client.read', 'client.create', 'client.update']
                      : [],
                  clientPermissionAssignmentId: `director-${company.id}`,
                  clientPermissionSetVersion: 'v1',
                },
              }
            : {}),
        },
      });
    if (url.pathname.endsWith('/companies'))
      return route.fulfill({ json: [companyA, companyB] });
    if (url.pathname.endsWith('/activity-log'))
      return route.fulfill({ json: { events: [] } });
    if (url.pathname.endsWith('/clients/search')) {
      searches += 1;
      expect(url.searchParams.get('query')).toBe('Exemplu');
      return route.fulfill({
        json: [{ ...client, relatedToActiveCompany: related.has(company.id) }],
      });
    }
    if (url.pathname.endsWith('/active-company-relationship')) {
      expect(request.method()).toBe('PUT');
      expect(url.pathname).toBe(
        `/api/clients/${client.id}/active-company-relationship`,
      );
      expect(companyId).toBe(companyB.id);
      related.add(companyB.id);
      return route.fulfill({ json: client });
    }
    if (url.pathname.endsWith(`/clients/${client.id}`))
      return route.fulfill({
        json: {
          ...client,
          taxId: null,
          address: null,
          telephone: null,
          generalEmail: null,
          businessActivity: null,
          contacts: [],
          version: 1,
          involvedCompanyDisplayNames: ['BIC', 'PRISMA-PRIM'],
        },
      });
    if (url.pathname.endsWith('/union-history'))
      return route.fulfill({ json: [] });
    if (url.pathname.endsWith('/clients')) {
      if (request.method() === 'POST') {
        expect(request.postData()).toBe(
          JSON.stringify({ displayName: client.displayName }),
        );
        expect(request.headers()['idempotency-key']).toBeTruthy();
        related.add(company.id);
        return route.fulfill({ status: 201, json: client });
      }
      return route.fulfill({ json: related.has(company.id) ? [client] : [] });
    }
    return route.fulfill({ status: 404 });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?frame=prisme#clients');
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await selectOption(
    page.getByLabel('Active Company', { exact: true }),
    companyA.id,
  );
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Close navigation' }).click();
  await expect(page.getByText('No Clients for PRISMA-PRIM yet.')).toBeVisible();
  await expect(page.getByLabel('Client display name')).toBeHidden();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath('clients-empty.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'New Client', exact: true }).click();
  await expect(page.getByLabel('Client display name')).toBeFocused();
  await expect(page.getByLabel('IDNO / tax code')).toHaveCount(0);
  await page.getByLabel('Client display name').fill(client.displayName);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath('clients-minimal-registration.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Create Client', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: client.displayName }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close registration' }).click();
  await expect(
    page.getByRole('button', { name: 'New Client', exact: true }),
  ).toBeFocused();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath('clients-directory.png'),
    fullPage: true,
  });
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await selectOption(
    page.getByLabel('Active Company', { exact: true }),
    companyB.id,
  );
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Close navigation' }).click();
  await expect(page.getByText('No Clients for BIC yet.')).toBeVisible();
  await page.getByLabel('Find a shared Client').fill('Exemplu');
  expect(searches).toBe(0);
  await page
    .getByRole('button', { name: 'Search Clients', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Add to BIC' })).toBeVisible();
  await expect(
    page.getByText('Not yet linked to BIC', { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath('clients-search.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Add to BIC' }).click();
  await expect(
    page.getByText('Available in BIC', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Open dossier', exact: true }).click();
  await expect(page.getByText('BIC, PRISMA-PRIM')).toBeVisible();
  await expect(
    page.getByRole('form', { name: 'Correct Client dossier' }),
  ).toBeHidden();
  await page
    .getByRole('button', { name: 'Correct Client dossier', exact: true })
    .click();
  await expect(
    page.getByRole('form', { name: 'Correct Client dossier' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath('clients-dossier-handoff.png'),
    fullPage: true,
  });
});

test('keeps a Client retry and pending command through disclosure, navigation and frame changes', async ({
  page,
}, testInfo) => {
  const company = { id: 'company-retry', displayName: 'PRISMA-PRIM' };
  const commands: { body: string | null; key: string | undefined }[] = [];
  let releaseCreate: (() => Promise<void>) | undefined;
  let created = false;
  const client = {
    id: 'client-retry',
    displayName: 'Uncertain Client',
    relatedToActiveCompany: true,
  };
  await page.route('**/api/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/access/current-actor'))
      return route.fulfill({
        json: {
          ...actorContextFixture,
          workspacePermissions: ['client.manage'],
          activeCompany: company,
        },
      });
    if (path.endsWith('/companies')) return route.fulfill({ json: [company] });
    if (path.endsWith('/activity-log'))
      return route.fulfill({ json: { events: [] } });
    if (path.endsWith('/operational-home'))
      return route.fulfill({
        json: operationalHomeFixture(company.id, {
          active_clients: created ? 1 : 0,
        }),
      });
    if (path.endsWith('/clients') && request.method() === 'POST') {
      commands.push({
        body: request.postData(),
        key: request.headers()['idempotency-key'],
      });
      if (commands.length === 1) return route.abort('failed');
      releaseCreate = async () => {
        created = true;
        await route.fulfill({ status: 201, json: client });
      };
      return;
    }
    if (path.endsWith('/clients'))
      return route.fulfill({ json: created ? [client] : [] });
    return route.fulfill({ status: 404 });
  });
  await page.goto('/?frame=prisme#clients');
  const trigger = page.getByRole('button', { name: 'New Client', exact: true });
  const name = page.getByLabel('Client display name');
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(name).toBeFocused();
  await name.fill(client.displayName);
  await page
    .getByRole('button', { name: 'Create Client', exact: true })
    .click();
  await expect(
    page.getByText(
      'The Client creation could not be confirmed. Retry the same details safely.',
    ),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath('clients-uncertain-create.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Close registration' }).click();
  await expect(trigger).toBeFocused();
  await expect(name).toBeHidden();
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'The Client creation could not be confirmed.' }),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath('clients-closed-uncertain-create.png'),
    fullPage: true,
  });
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Find a shared Client')).toBeFocused();
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: 'Overview', exact: true })
    .click();
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: 'Clients', exact: true })
    .click();
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await enterClassicCompatibility(page);
  await expectValue(name, client.displayName);
  await page.getByRole('button', { name: 'Try Prisme' }).click();
  await expect(name).toBeHidden();
  await trigger.click();
  await expectValue(name, client.displayName);
  await page
    .getByRole('button', { name: 'Create Client', exact: true })
    .click();
  await expect.poll(() => commands.length).toBe(2);
  expect(commands[0]?.key).toBeTruthy();
  expect(commands[1]).toEqual(commands[0]);
  await page.getByRole('button', { name: 'Close registration' }).click();
  await expect(page.getByRole('status')).toHaveText('Creating…');
  await trigger.click();
  await expect(
    page.getByRole('button', { name: 'Creating…', exact: true }),
  ).toBeDisabled();
  if (!releaseCreate) throw new Error('Expected the pending Client command');
  await releaseCreate();
  await expect(
    page.getByText('Client created and linked to the active Company.'),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: client.displayName }),
  ).toBeVisible();
  expect(commands).toHaveLength(2);
});

test('keeps Director fields and ordered Contacts through validation and an opaque duplicate outcome', async ({
  page,
}, testInfo) => {
  const company = { id: 'company-director', displayName: 'PRISMA-PRIM' };
  let submissions = 0;
  let activityReads = 0;
  await page.route('**/api/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/access/current-actor'))
      return route.fulfill({
        json: {
          ...actorContextFixture,
          workspacePermissions: [],
          activeCompany: {
            ...company,
            clientPermissions: [
              'client.read',
              'client.create',
              'client.update',
            ],
            clientPermissionAssignmentId: 'director-231',
            clientPermissionSetVersion: 'v1',
          },
        },
      });
    if (path.endsWith('/companies')) return route.fulfill({ json: [company] });
    if (path.endsWith('/activity-log')) {
      activityReads += 1;
      return route.fulfill({ json: { events: [] } });
    }
    if (path.endsWith('/clients/search')) return route.fulfill({ json: [] });
    if (path.endsWith('/clients') && request.method() === 'POST') {
      submissions += 1;
      const body: unknown = request.postDataJSON();
      expect(body).toEqual({
        displayName: 'Director Client',
        taxId: 'TAX-231',
        address: '10 Example Street',
        telephone: '+373 60 111 222',
        generalEmail: 'office@example.test',
        businessActivity: 'Consulting',
        contacts: [
          { name: 'Ana', telephone: '+373 60 333 444' },
          { name: 'Ion', email: 'ion@example.test' },
        ],
      });
      return route.fulfill({
        status: 409,
        json: {
          code: 'possible_duplicate_review_required',
          duplicate_review_reference: 'private-review-reference',
        },
      });
    }
    if (path.endsWith('/clients')) return route.fulfill({ json: [] });
    return route.fulfill({ status: 404 });
  });
  await page.goto('/?frame=prisme#clients');
  await expect(
    page.getByText('Search by name among the active Company’s Clients.', {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByLabel('Find a shared Client').fill('Missing Client');
  await page
    .getByRole('button', { name: 'Search Clients', exact: true })
    .click();
  await expect(
    page.getByText('No shared Client matches this search.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /^Add to / })).toHaveCount(0);
  await page.getByRole('button', { name: 'New Client', exact: true }).click();
  await page
    .getByRole('button', { name: 'Create Client', exact: true })
    .click();
  await expect(page.getByLabel('Client display name')).toHaveAttribute(
    'aria-describedby',
    'client-create-validation',
  );
  await expect(
    page.getByText('Client display name is required.'),
  ).toBeVisible();
  await page.getByLabel('Client display name').fill('Director Client');
  await page.getByLabel('IDNO / tax code').fill('TAX-231');
  await page.getByLabel('Address', { exact: true }).fill('10 Example Street');
  await page.getByLabel('Telephone', { exact: true }).fill('+373 60 111 222');
  await page.getByLabel('General email').fill('office@example.test');
  await page.getByLabel('Business activity').fill('Consulting');
  await page.getByRole('button', { name: 'Add Contact', exact: true }).click();
  const first = page.getByRole('group', { name: 'Contact 1', exact: true });
  await first.getByLabel('Contact telephone').fill('+373 60 333 444');
  await page
    .getByRole('button', { name: 'Create Client', exact: true })
    .click();
  await expect(page.getByText('Each Contact must have a name.')).toBeVisible();
  await expect(first.getByLabel('Contact name')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(first.getByLabel('Contact name')).toHaveAttribute(
    'aria-describedby',
    'client-create-validation',
  );
  await expectValue(first.getByLabel('Contact telephone'), '+373 60 333 444');
  expect(submissions).toBe(0);
  await page.getByRole('button', { name: 'Close registration' }).click();
  await page.getByRole('button', { name: 'New Client', exact: true }).click();
  await expectValue(first.getByLabel('Contact telephone'), '+373 60 333 444');
  await first.getByLabel('Contact name').fill('Ana');
  await page.getByRole('button', { name: 'Add Contact', exact: true }).click();
  const second = page.getByRole('group', { name: 'Contact 2', exact: true });
  await second.getByLabel('Contact name').fill('Ion');
  await second.getByLabel('Contact email').fill('ion@example.test');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath('clients-enriched-registration.png'),
    fullPage: true,
  });
  const readsBeforeConflict = activityReads;
  await page
    .getByRole('button', { name: 'Create Client', exact: true })
    .click();
  await expect(
    page.getByText(
      'This Client may already exist. No Client was created or changed. An authorized reviewer can compare the records safely.',
    ),
  ).toBeVisible();
  await expect(page.getByText('private-review-reference')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Possible duplicate reviews' }),
  ).toHaveCount(0);
  await expectValue(second.getByLabel('Contact email'), 'ion@example.test');
  expect(submissions).toBe(1);
  expect(activityReads).toBe(readsBeforeConflict);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath('clients-opaque-duplicate.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Close registration' }).click();
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'This Client may already exist.' }),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath('clients-closed-opaque-duplicate.png'),
    fullPage: true,
  });
});

test('keeps failures real and attachment pending independent from edited search', async ({
  page,
}, testInfo) => {
  const company = { id: 'company-states', displayName: 'BIC' };
  const client = {
    id: 'existing-client',
    displayName: 'Existing Workspace Client',
    relatedToActiveCompany: false,
  };
  let listReads = 0;
  let activityReads = 0;
  let searchReads = 0;
  let attached = false;
  let permitted = true;
  let releaseAttach: (() => Promise<void>) | undefined;
  await page.route('**/api/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/access/current-actor'))
      return route.fulfill({
        json: {
          ...actorContextFixture,
          workspacePermissions: permitted ? ['client.manage'] : [],
          activeCompany: company,
        },
      });
    if (path.endsWith('/companies')) return route.fulfill({ json: [company] });
    if (path.endsWith('/activity-log')) {
      activityReads += 1;
      return route.fulfill({ json: { events: [] } });
    }
    if (path.endsWith('/clients/search')) {
      searchReads += 1;
      if (!permitted) return route.fulfill({ status: 403 });
      return route.fulfill({
        json:
          searchReads === 1
            ? []
            : [{ ...client, relatedToActiveCompany: attached }],
      });
    }
    if (path.endsWith('/active-company-relationship')) {
      releaseAttach = async () => {
        attached = true;
        await route.fulfill({
          json: { ...client, relatedToActiveCompany: true },
        });
      };
      return;
    }
    if (path.endsWith('/clients')) {
      listReads += 1;
      return attached
        ? route.fulfill({ json: [{ ...client, relatedToActiveCompany: true }] })
        : route.fulfill({ status: 503 });
    }
    return route.fulfill({ status: 404 });
  });
  await page.goto('/?frame=prisme#clients');
  await expect(
    page.getByText('We could not load Clients. Please try again.'),
  ).toBeVisible();
  await expect(page.getByText('Existing Workspace Client')).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath('clients-load-error.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Search Clients', exact: true })
    .click();
  await expect(page.getByText('Enter a Client name to search.')).toBeVisible();
  await expect(page.getByLabel('Find a shared Client')).toHaveAttribute(
    'aria-describedby',
    'client-search-validation',
  );
  expect(searchReads).toBe(0);
  await page.getByLabel('Find a shared Client').fill('No match');
  await page
    .getByRole('button', { name: 'Search Clients', exact: true })
    .click();
  await expect(
    page.getByText('No shared Client matches this search.'),
  ).toBeVisible();
  await page.getByLabel('Find a shared Client').fill('Existing');
  await page
    .getByRole('button', { name: 'Search Clients', exact: true })
    .click();
  const readsBeforeAttachment = { list: listReads, activity: activityReads };
  await page.getByRole('button', { name: 'Add to BIC' }).click();
  await expect(
    page.getByRole('button', { name: 'Adding to BIC…' }),
  ).toBeDisabled();
  await page.getByLabel('Find a shared Client').fill('A different query');
  await expect(
    page.getByRole('button', { name: 'Search Clients', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Back to Company Clients' }),
  ).toBeDisabled();
  expect(searchReads).toBe(2);
  expect({ list: listReads, activity: activityReads }).toEqual(
    readsBeforeAttachment,
  );
  if (!releaseAttach) throw new Error('Expected a pending attachment');
  await releaseAttach();
  await expect(
    page.getByText('Available in BIC', { exact: true }),
  ).toBeVisible();
  await expect.poll(() => listReads).toBe(readsBeforeAttachment.list + 1);
  await expect
    .poll(() => activityReads)
    .toBe(readsBeforeAttachment.activity + 1);
  await expect(
    page.getByRole('button', { name: 'Open dossier', exact: true }),
  ).toHaveCount(0);
  permitted = false;
  await page
    .getByRole('button', { name: 'Search Clients', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Clients', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText('Existing Workspace Client')).toHaveCount(0);
});
