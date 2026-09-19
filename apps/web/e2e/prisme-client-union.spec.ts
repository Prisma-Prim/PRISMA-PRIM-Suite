import { expect, test } from '@playwright/test';
import {
  captureUnion,
  chooseUnion,
  companyA,
  companyB,
  firstId,
  installUnionFixture,
  navigateUnion,
  openUnion,
  second,
  secondId,
  unionForm,
  unionPanel,
} from './prisme-client-union.fixture';

test('keeps the second canonical intention through uncertain retry, navigation and presentation changes', async ({
  page,
}, testInfo) => {
  const state = await installUnionFixture(page);
  state.confirm = (route) => {
    if (state.commands.length === 1) return route.fulfill({ status: 503 });
    state.united = true;
    return route.fulfill({
      status: 201,
      json: {
        outcome: 'united',
        canonicalClientId: secondId,
        projectionReference: 'confirmed-projection',
      },
    });
  };
  await openUnion(page);
  const heading = unionPanel(page).getByRole('heading', {
    name: 'Compare the two existing Clients',
  });
  await expect(heading).toBeFocused();
  for (const select of await unionForm(page).getByRole('combobox').all())
    await expect(select).toHaveValue('');
  await heading.evaluate((element) =>
    element.scrollIntoView({ block: 'start' }),
  );
  await captureUnion(page, testInfo, 'union-comparison');
  await unionPanel(page)
    .getByText('Source 2 · Contact 1', { exact: true })
    .scrollIntoViewIfNeeded();
  await captureUnion(page, testInfo, 'union-contact-provenance');
  await unionForm(page)
    .getByRole('button', { name: 'Confirm union', exact: true })
    .click();
  await expect(unionForm(page).getByRole('alert')).toHaveText(
    'Choose a canonical Client and a source for every field, give a reason and confirm both acknowledgements.',
  );
  expect(state.commands).toHaveLength(0);
  await captureUnion(page, testInfo, 'union-incomplete');
  await chooseUnion(page);
  const address = unionForm(page).getByRole('combobox', {
    name: 'Address',
    exact: true,
  });
  await expect(address).toHaveAccessibleDescription(
    'Value to retain from Source 2 ' + second.address,
  );
  await address.selectOption(firstId);
  await expect(address).toHaveAccessibleDescription(
    'Value to retain from Source 1 Not provided',
  );
  await address.selectOption(secondId);
  const email = unionForm(page).getByRole('combobox', {
    name: 'General email',
    exact: true,
  });
  await email.selectOption(firstId);
  await expect(email).toHaveAccessibleDescription(
    'Value to retain from Source 1 Not provided',
  );
  await address.evaluate((element) =>
    element.scrollIntoView({ block: 'start' }),
  );
  await captureUnion(page, testInfo, 'union-retained-values');
  await email.selectOption(secondId);
  const activityBefore = state.activityReads;
  const clientsBefore = state.clientReads;
  await unionForm(page)
    .getByRole('button', { name: 'Confirm union', exact: true })
    .click();
  await expect(unionForm(page).getByRole('alert')).toContainText(
    'No confirmation has been received.',
  );
  await captureUnion(page, testInfo, 'union-uncertain');
  await navigateUnion(page, 'Activity Log');
  await navigateUnion(page, 'Clients');
  const menu = page.getByRole('button', { name: 'Open navigation' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name: 'Use classic frame' }).click();
  await expect(
    unionForm(page).getByRole('combobox', {
      name: 'Canonical Client dossier',
      exact: true,
    }),
  ).toHaveValue(secondId);
  await page.getByRole('button', { name: 'Try Prisme' }).click();
  await expect(
    unionForm(page).getByRole('combobox', { name: 'Telephone', exact: true }),
  ).toHaveValue(firstId);
  await expect(unionForm(page).getByLabel('Reason for this union')).toHaveValue(
    'Reviewed both saved dossiers and all affected Companies.',
  );
  expect(state.commands).toHaveLength(1);
  await unionForm(page)
    .getByRole('button', { name: 'Confirm union', exact: true })
    .click();
  await expect(
    page.getByText(
      'Union confirmed. The canonical dossier is now available in the affected Companies.',
    ),
  ).toBeVisible();
  const canonical = page.getByRole('region', {
    name: second.displayName,
    exact: true,
  });
  await expect(canonical.getByText('Version 5', { exact: true })).toBeVisible();
  await expect(
    canonical
      .getByRole('region', { name: 'Contacts', exact: true })
      .getByText('Ana Ionescu', { exact: true }),
  ).toHaveCount(2);
  await expect(
    canonical
      .getByRole('region', { name: 'Contacts', exact: true })
      .getByText('Ion Popa', { exact: true }),
  ).toBeVisible();
  expect(state.commands).toHaveLength(2);
  expect(state.commands[1]).toEqual(state.commands[0]);
  expect(state.commands[0]?.key).toBeTruthy();
  expect(state.commands[0]?.company).toBe(companyA.id);
  expect(JSON.parse(state.commands[0]?.body ?? '{}')).toEqual({
    canonicalClientId: secondId,
    fields: {
      displayName: secondId,
      taxId: secondId,
      address: secondId,
      telephone: firstId,
      generalEmail: secondId,
      businessActivity: secondId,
    },
    reason: 'Reviewed both saved dossiers and all affected Companies.',
    reviewedDifferences: true,
    companyIds: [companyA.id, companyB.id],
  });
  expect(state.activityReads).toBeGreaterThan(activityBefore);
  expect(state.clientReads).toBeGreaterThan(clientsBefore);
  await page
    .getByText(
      'Union confirmed. The canonical dossier is now available in the affected Companies.',
    )
    .evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await captureUnion(page, testInfo, 'union-canonical-confirmed');
});

test('separates unavailable, recoverable load failure, authorized remediation and Contact capacity', async ({
  page,
}, testInfo) => {
  const state = await installUnionFixture(page);
  state.review = (route) => route.fulfill({ status: 404 });
  await openUnion(page);
  await expect(unionPanel(page).getByRole('alert')).toContainText(
    'This operation is unavailable.',
  );
  await captureUnion(page, testInfo, 'union-unavailable');
  expect(state.commands).toHaveLength(0);
  state.review = (route) => route.fulfill({ status: 503 });
  await unionPanel(page)
    .getByRole('button', { name: 'Review existing duplicates' })
    .click();
  await expect(unionPanel(page).getByRole('alert')).toContainText(
    'The request could not be completed.',
  );
  await captureUnion(page, testInfo, 'union-load-failure');
  state.review = (route) =>
    route.fulfill({
      status: 201,
      json: {
        outcome: 'multiple_duplicate_candidates_require_data_remediation',
      },
    });
  await unionPanel(page)
    .getByRole('button', { name: 'Review existing duplicates' })
    .click();
  await expect(unionPanel(page).getByRole('alert')).toContainText(
    'separate data remediation',
  );
  await expect(unionPanel(page).getByRole('form')).toHaveCount(0);
  await captureUnion(page, testInfo, 'union-remediation');
  state.review = undefined;
  state.comparison.clients[0].contacts = Array.from(
    { length: 26 },
    (_, index) => ({ name: 'Source one Contact ' + (index + 1) }),
  );
  state.comparison.clients[1].contacts = Array.from(
    { length: 25 },
    (_, index) => ({ name: 'Source two Contact ' + (index + 1) }),
  );
  await unionPanel(page)
    .getByRole('button', { name: 'Review existing duplicates' })
    .click();
  await expect(unionPanel(page).getByRole('alert')).toContainText(
    'exceeds 50 Contacts',
  );
  await expect(
    unionPanel(page).getByText(
      'Contact entries from both sources: 51. Maximum: 50.',
    ),
  ).toBeVisible();
  await expect(
    unionForm(page).getByRole('button', { name: 'Confirm union' }),
  ).toBeDisabled();
  await expect(unionPanel(page).getByText(/Source [12] · Contact/)).toHaveCount(
    51,
  );
  await unionPanel(page)
    .getByRole('alert')
    .evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await captureUnion(page, testInfo, 'union-capacity');
  expect(state.commands).toHaveLength(0);
});

test('separates a failed history read from any union confirmation', async ({
  page,
}, testInfo) => {
  const state = await installUnionFixture(page);
  await page.route('**/clients/*/union-history', (route) =>
    route.fulfill({ status: 503 }),
  );
  await openUnion(page);
  await chooseUnion(page);
  await unionPanel(page)
    .getByRole('button', { name: 'Union history', exact: true })
    .click();
  await expect(unionPanel(page).getByRole('alert')).toHaveText(
    'The request could not be completed. You can retry safely.',
  );
  await expect(
    unionForm(page).getByText('No confirmation has been received.', {
      exact: false,
    }),
  ).toHaveCount(0);
  await expect(
    unionForm(page).getByRole('combobox', {
      name: 'Canonical Client dossier',
      exact: true,
    }),
  ).toHaveValue(secondId);
  await expect(
    unionForm(page).getByRole('combobox', { name: 'Telephone', exact: true }),
  ).toHaveValue(firstId);
  await expect(unionForm(page).getByLabel('Reason for this union')).toHaveValue(
    'Reviewed both saved dossiers and all affected Companies.',
  );
  expect(state.commands).toHaveLength(0);
  await unionPanel(page)
    .getByRole('heading', { name: 'Governed Client union', exact: true })
    .evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await captureUnion(page, testInfo, 'union-read-failure');
});

test('keeps a confirmed command distinct from failed list and Activity Log refreshes', async ({
  page,
}, testInfo) => {
  const state = await installUnionFixture(page);
  state.refreshFails = true;
  await openUnion(page);
  await chooseUnion(page);
  await unionForm(page).getByRole('button', { name: 'Confirm union' }).click();
  const notice = page.getByText(
    'Union confirmed. The canonical dossier is now available in the affected Companies.',
  );
  await expect(notice).toBeVisible();
  await expect(unionForm(page)).toHaveCount(0);
  expect(state.commands).toHaveLength(1);
  await notice.evaluate((element) =>
    element.scrollIntoView({ block: 'center' }),
  );
  await captureUnion(page, testInfo, 'union-confirmed-refresh-failure');
});

test('does not move focus for a comparison completed while its section is hidden', async ({
  page,
}) => {
  const state = await installUnionFixture(page);
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  state.review = async (route) => {
    await pending;
    await route.fulfill({ status: 201, json: state.comparison });
  };
  await openUnion(page);
  await expect(unionPanel(page).getByRole('status')).toContainText('Loading');
  await navigateUnion(page, 'Activity Log');
  const focused = await page.locator(':focus').getAttribute('href');
  release();
  await expect(
    page.getByRole('heading', {
      name: 'Compare the two existing Clients',
      includeHidden: true,
    }),
  ).toBeAttached();
  expect(await page.locator(':focus').getAttribute('href')).toBe(focused);
  await navigateUnion(page, 'Clients');
  await expect(unionForm(page)).toBeVisible();
  await expect(
    unionPanel(page).getByRole('heading', {
      name: 'Compare the two existing Clients',
    }),
  ).not.toBeFocused();
});
