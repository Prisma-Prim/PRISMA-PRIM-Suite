import { expect, test } from '@playwright/test';
import { actorContextFixture } from './actor-context.fixture';
import {
  installDossierFixture,
  openDossier,
  correctionForm,
  correctionTrigger,
  captureDossier,
  navigateTo,
  changeFrame,
  dossierFixture,
  dossierCompany,
} from './prisme-dossier.fixture';

test('reads a shared dossier before deliberately correcting it in Prisme', async ({
  page,
}, testInfo) => {
  const state = await installDossierFixture(page);
  const dossier = dossierFixture();
  state.patch = (route) => {
    const request = route.request();
    const body: unknown = request.postDataJSON();
    expect(body).toEqual({
      expectedVersion: 1,
      displayName: 'Corrected Client',
      taxId: dossier.taxId,
      address: dossier.address,
      telephone: dossier.telephone,
      generalEmail: dossier.generalEmail,
      businessActivity: dossier.businessActivity,
      contacts: dossier.contacts,
    });
    expect(request.headers()['idempotency-key']).toBeTruthy();
    state.dossier = { ...dossier, displayName: 'Corrected Client', version: 2 };
    return route.fulfill({ json: state.dossier });
  };
  await page.goto('/?frame=prisme#clients');
  await page.getByRole('button', { name: 'Open dossier', exact: true }).focus();
  await page.keyboard.press('Enter');
  const detail = page.getByRole('region', {
    name: dossier.displayName,
    exact: true,
  });
  await expect(
    detail.getByRole('heading', { name: dossier.displayName, exact: true }),
  ).toBeFocused();
  await expect(detail.getByText('Version 1', { exact: true })).toBeVisible();
  await expect(
    detail.getByText(
      '14 Example Avenue, Building B, Chisinau, Republic of Moldova',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    detail
      .getByRole('region', { name: 'Contacts', exact: true })
      .getByText('Ana Ionescu', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('form', { name: 'Correct Client dossier' }),
  ).toBeHidden();
  await page.screenshot({
    path: testInfo.outputPath('dossier-reading-viewport.png'),
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath('dossier-reading.png'),
    fullPage: true,
  });
  await page.keyboard.press('Tab');
  const correction = page.getByRole('button', {
    name: 'Correct Client dossier',
    exact: true,
  });
  await expect(correction).toBeFocused();
  await page.keyboard.press('Enter');
  const form = page.getByRole('form', { name: 'Correct Client dossier' });
  await expect(form.getByLabel('Client display name')).toBeFocused();
  await page.screenshot({
    path: testInfo.outputPath('dossier-correction-viewport.png'),
  });
  for (const label of [
    'Client display name',
    'IDNO / tax code',
    'Address',
    'Telephone',
    'General email',
    'Business activity',
  ]) {
    await expect(form.getByLabel(label, { exact: true })).toBeVisible();
  }
  await form.getByLabel('Telephone', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath('dossier-fields-viewport.png'),
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath('dossier-correction.png'),
    fullPage: true,
  });
  await form.getByLabel('Client display name').fill('  Corrected Client  ');
  const previousListReads = state.listReads;
  const previousActivityReads = state.activityReads;
  await form.getByRole('button', { name: 'Save correction' }).click();
  await expect(page.getByText('Version 2', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Corrected Client', exact: true }),
  ).toHaveCount(2);
  await expect.poll(() => state.listReads).toBeGreaterThan(previousListReads);
  await expect
    .poll(() => state.activityReads)
    .toBeGreaterThan(previousActivityReads);
  await page.getByRole('button', { name: 'Close correction' }).click();
  await expect(correction).toBeFocused();
  await expect(form).toBeHidden();
  await expect(
    page.getByText('Client correction saved with attributable history.'),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);

  expect(state.historyReads).toBe(0);
  state.history = {
    corrections: [
      {
        id: 'correction-233',
        occurredAt: '2026-09-24T09:15:00.000Z',
        actor: { displayName: 'Ada Ionescu' },
        changes: {
          displayName: {
            before: dossier.displayName,
            after: 'Corrected Client',
          },
          contacts: {
            before: [],
            after: [{ name: 'Ana Demo', email: 'ana.demo@example.test' }],
          },
        },
      },
    ],
    nextCursor: null,
  };
  const historyToggle = page.getByRole('button', {
    name: 'Show correction history',
  });
  await expect(historyToggle).toHaveAttribute('aria-expanded', 'false');
  await historyToggle.click();
  const history = page.getByRole('region', {
    name: 'Correction history',
    exact: true,
  });
  const entry = history
    .getByRole('list', { name: 'Corrections, newest first' })
    .getByRole('listitem')
    .first();
  await expect(entry).toContainText('Corrected by Ada Ionescu');
  await expect(entry.locator('time')).toHaveAttribute(
    'datetime',
    '2026-09-24T09:15:00.000Z',
  );
  await expect(entry).toContainText(dossier.displayName);
  await expect(entry).toContainText('Corrected Client');
  await expect(
    entry
      .getByRole('group', { name: 'Before' })
      .getByText('No shared Contacts recorded.'),
  ).toBeVisible();
  await expect(
    entry.getByRole('group', { name: 'After' }).getByText('Ana Demo'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Show older corrections' }),
  ).toHaveCount(0);
  expect(state.historyReads).toBe(1);
  await entry.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath('dossier-correction-history-viewport.png'),
  });
  await captureDossier(page, testInfo, 'dossier-correction-history.png');
});

test('records Contact positions and decision roles and keeps them when another Contact changes', async ({
  page,
}, testInfo) => {
  const state = await installDossierFixture(page);
  state.patch = (route) => {
    const body: unknown = route.request().postDataJSON();
    if (typeof body !== 'object' || body === null || Array.isArray(body))
      throw new Error('Expected a correction object.');
    const { expectedVersion, ...fields } = Object.fromEntries(
      Object.entries(body),
    );
    state.dossier = {
      ...state.dossier,
      ...fields,
      version: Number(expectedVersion) + 1,
    };
    return route.fulfill({ json: state.dossier });
  };
  const longPosition =
    'Responsabil calitate, achiziții și relația cu organismele de certificare pentru toate filialele regionale';
  const [ana, ion] = dossierFixture().contacts;
  const anaWithRoles = {
    ...ana,
    position: 'Director general',
    decisionRoles: ['final_decision_maker', 'financial'],
  };
  const ionWithRoles = {
    ...ion,
    position: longPosition,
    decisionRoles: ['influencer', 'technical'],
  };
  await openDossier(page);
  await correctionTrigger(page).click();
  const form = correctionForm(page);
  const first = form.getByRole('group', { name: 'Contact 1', exact: true });
  await first.getByLabel('Contact position').fill('Director general');
  await first.getByRole('checkbox', { name: 'Final decision-maker' }).check();
  await first.getByRole('checkbox', { name: 'Financial' }).check();
  const second = form.getByRole('group', { name: 'Contact 2', exact: true });
  await second.getByLabel('Contact position').fill(longPosition);
  await second.getByRole('checkbox', { name: 'Technical' }).check();
  await second.getByRole('checkbox', { name: 'Influencer' }).check();
  await first.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath('dossier-contact-roles-editor-viewport.png'),
  });
  await form.getByRole('button', { name: 'Save correction' }).click();
  await expect(page.getByText('Version 2', { exact: true })).toBeVisible();
  expect(state.dossier.contacts).toEqual([anaWithRoles, ionWithRoles]);

  await page.reload();
  await page.getByRole('button', { name: 'Open dossier', exact: true }).click();
  await expect(page.getByText('Version 2', { exact: true })).toBeVisible();
  const contacts = page.getByRole('region', { name: 'Contacts', exact: true });
  const anaItem = contacts.getByRole('listitem').filter({ hasText: ana?.name });
  await expect(anaItem.getByText('Director general')).toBeVisible();
  await expect(
    anaItem.getByText('Decision roles: Final decision-maker, Financial'),
  ).toBeVisible();
  await expect(contacts.getByText(longPosition)).toBeVisible();
  await contacts.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath('dossier-contact-roles-viewport.png'),
  });
  await captureDossier(page, testInfo, 'dossier-contact-roles.png');

  await correctionTrigger(page).click();
  await expect(
    first.getByRole('checkbox', { name: 'Final decision-maker' }),
  ).toBeChecked();
  await expect(first.getByLabel('Contact position')).toHaveValue(
    'Director general',
  );
  await second.getByLabel('Contact telephone').fill('+373 60 555 667');
  await form.getByRole('button', { name: 'Save correction' }).click();
  await expect(page.getByText('Version 3', { exact: true })).toBeVisible();
  expect(state.dossier.contacts).toEqual([
    anaWithRoles,
    { ...ionWithRoles, telephone: '+373 60 555 667' },
  ]);
  await captureDossier(page, testInfo, 'dossier-contact-roles-editor.png');
});

test('preserves uncertain corrections and pending saves across closing, navigation and frames', async ({
  page,
}, testInfo) => {
  const state = await installDossierFixture(page);
  await openDossier(page);
  await correctionTrigger(page).click();
  const form = correctionForm(page);
  await form
    .getByLabel('Telephone', { exact: true })
    .fill('  +373 60 999 888  ');
  await form.getByRole('button', { name: 'Save correction' }).click();
  await expect(
    page.getByText('The correction could not be saved. Retry safely.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close correction' }).click();
  await expect(correctionTrigger(page)).toBeFocused();
  await expect(form).toBeHidden();
  await captureDossier(page, testInfo, 'dossier-closed-error.png');
  await page.keyboard.press('Tab');
  await expect(page.locator('#client-correction :focus')).toHaveCount(0);
  await navigateTo(page, 'Overview');
  await navigateTo(page, 'Clients');
  await changeFrame(page, 'Use classic frame');
  await expect(form.getByLabel('Telephone', { exact: true })).toHaveValue(
    '  +373 60 999 888  ',
  );
  await changeFrame(page, 'Try Prisme');
  await expect(form).toBeHidden();
  await correctionTrigger(page).click();
  await form.getByRole('button', { name: 'Save correction' }).click();
  await expect.poll(() => state.commands.length).toBe(2);
  expect(state.commands[0]?.key).toBeTruthy();
  expect(state.commands[1]).toEqual(state.commands[0]);
  await expect(
    page.getByText('The correction could not be saved. Retry safely.'),
  ).toBeVisible();
  await form.getByLabel('Telephone', { exact: true }).fill('+373 60 000 111');
  let release: (() => Promise<void>) | undefined;
  state.patch = (route) => {
    release = async () => {
      state.dossier = {
        ...state.dossier,
        telephone: '+373 60 000 111',
        version: 2,
      };
      await route.fulfill({ json: state.dossier });
    };
  };
  await form.getByRole('button', { name: 'Save correction' }).click();
  await expect.poll(() => state.commands.length).toBe(3);
  expect(state.commands[2]?.key).not.toBe(state.commands[1]?.key);
  await page.getByRole('button', { name: 'Close correction' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Saving…' }),
  ).toBeVisible();
  await captureDossier(page, testInfo, 'dossier-closed-pending.png');
  await correctionTrigger(page).click();
  await expect(form.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  await page.getByRole('button', { name: 'Close correction' }).click();
  if (!release) throw new Error('Expected a pending correction');
  await release();
  await expect(page.getByText('Version 2', { exact: true })).toBeVisible();
  await expect(form).toBeHidden();
  await expect(
    page.getByText('Client correction saved with attributable history.'),
  ).toBeVisible();
  await expect(correctionTrigger(page)).toBeFocused();
  expect(state.commands).toHaveLength(3);
});

test('keeps closed pending and error feedback in view without moving focus or scrolling on a late response', async ({
  page,
}, testInfo) => {
  const state = await installDossierFixture(page);
  let release: (() => Promise<void>) | undefined;
  state.patch = (route) => {
    release = () => route.abort('failed');
  };
  await openDossier(page);
  await correctionTrigger(page).click();
  const form = correctionForm(page);
  await form.getByLabel('Telephone', { exact: true }).fill('Pending telephone');
  await form.getByRole('button', { name: 'Save correction' }).click();
  await expect.poll(() => state.commands.length).toBe(1);
  await page.getByRole('button', { name: 'Close correction' }).click();
  await expect(correctionTrigger(page)).toBeFocused();
  const pending = page.getByRole('status').filter({ hasText: 'Saving…' });
  await expect(pending).toBeInViewport({ ratio: 1 });
  await page.screenshot({
    path: testInfo.outputPath('dossier-closed-pending-viewport.png'),
  });
  const position = await page.evaluate(() => window.scrollY);
  if (!release) throw new Error('Expected a pending correction');
  await release();
  const error = page
    .getByRole('alert')
    .filter({ hasText: 'The correction could not be saved. Retry safely.' });
  await expect(error).toHaveCount(1);
  await expect(error).toBeInViewport({ ratio: 1 });
  await expect(correctionTrigger(page)).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(position);
  await page.screenshot({
    path: testInfo.outputPath('dossier-closed-error-viewport.png'),
  });

  await correctionTrigger(page).click();
  await form.getByRole('button', { name: 'Save correction' }).click();
  await expect.poll(() => state.commands.length).toBe(2);
  await navigateTo(page, 'Overview');
  const hiddenPosition = await page.evaluate(() => window.scrollY);
  const hiddenFocus = await page.evaluate(
    () => document.activeElement?.outerHTML,
  );
  await release();
  await expect(error).toBeHidden();
  expect(await page.evaluate(() => window.scrollY)).toBe(hiddenPosition);
  expect(await page.evaluate(() => document.activeElement?.outerHTML)).toBe(
    hiddenFocus,
  );
});

test('keeps a stale draft until an explicit reload replaces it and its retry command', async ({
  page,
}, testInfo) => {
  const state = await installDossierFixture(page);
  state.patch = (route) =>
    route.fulfill({ status: 409, json: { code: 'stale_client_version' } });
  await openDossier(page);
  await correctionTrigger(page).click();
  const form = correctionForm(page);
  await form.getByLabel('Telephone', { exact: true }).fill('Unsaved telephone');
  await form.getByRole('button', { name: 'Save correction' }).click();
  await expect(
    page.getByText(/changed before your correction was saved/),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close correction' }).click();
  await expect(
    page.getByRole('button', { name: 'Reload dossier' }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: /changed before your correction was saved/ }),
  ).toBeInViewport({ ratio: 1 });
  await expect(
    page.getByRole('button', { name: 'Reload dossier' }),
  ).toBeInViewport({ ratio: 1 });
  await page.screenshot({
    path: testInfo.outputPath('dossier-closed-stale-viewport.png'),
  });
  await captureDossier(page, testInfo, 'dossier-closed-stale.png');
  await correctionTrigger(page).click();
  await expect(form.getByLabel('Telephone', { exact: true })).toHaveValue(
    'Unsaved telephone',
  );
  expect(state.dossierReads).toBe(1);
  state.dossier = {
    ...state.dossier,
    version: 4,
    telephone: 'Server telephone',
  };
  await page.getByRole('button', { name: 'Reload dossier' }).click();
  await expect(page.getByText('Version 4', { exact: true })).toBeVisible();
  await expect(form.getByLabel('Telephone', { exact: true })).toHaveValue(
    'Server telephone',
  );
  expect(state.dossierReads).toBe(2);
  state.patch = (route) => route.abort('failed');
  await form.getByLabel('Telephone', { exact: true }).fill('Fresh correction');
  await form.getByRole('button', { name: 'Save correction' }).click();
  await expect.poll(() => state.commands.length).toBe(2);
  expect(state.commands[1]?.key).not.toBe(state.commands[0]?.key);
  const command: unknown = JSON.parse(state.commands[1]?.body ?? 'null');
  expect(command).toMatchObject({
    expectedVersion: 4,
    telephone: 'Fresh correction',
  });
});

test('retains invalid Contacts, an unchanged validation outcome and opaque duplicate feedback', async ({
  page,
}, testInfo) => {
  const state = await installDossierFixture(page);
  state.actor = {
    ...state.actor,
    activeCompany: {
      ...dossierCompany,
      clientPermissionAssignmentId: 'director-v2',
      clientPermissionSetVersion: 'v2',
      clientPermissions: [
        'client.read',
        'client.create',
        'client.update',
        'client.duplicate.resolve',
      ],
    },
  };
  state.patch = (route) =>
    route.fulfill({
      status: 400,
      json: {
        message: 'The Client correction must change at least one field.',
      },
    });
  await openDossier(page);
  await correctionTrigger(page).click();
  const form = correctionForm(page);
  await form.getByRole('button', { name: 'Save correction' }).click();
  await expect(
    page.getByText('The Client correction must change at least one field.'),
  ).toBeVisible();
  await expect(form).toHaveAttribute(
    'aria-describedby',
    'client-correction-validation',
  );
  await expect(
    page.getByText('Client correction saved with attributable history.'),
  ).toHaveCount(0);
  await form.getByRole('button', { name: 'Add Contact' }).click();
  const third = form.getByRole('group', { name: 'Contact 3', exact: true });
  await third.getByLabel('Contact email').fill('third.contact@example.test');
  await form.getByRole('button', { name: 'Save correction' }).click();
  await expect(third.getByLabel('Contact name')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(third.getByLabel('Contact name')).toHaveAttribute(
    'aria-describedby',
    'client-correction-validation',
  );
  expect(state.commands).toHaveLength(1);
  await page.getByRole('button', { name: 'Close correction' }).click();
  await expect(page.getByText('Each Contact must have a name.')).toBeVisible();
  await captureDossier(page, testInfo, 'dossier-closed-validation.png');
  await correctionTrigger(page).click();
  await expect(third.getByLabel('Contact email')).toHaveValue(
    'third.contact@example.test',
  );
  await third.getByLabel('Contact name').fill('  Third Contact  ');
  const reviews = state.reviewReads;
  const activities = state.activityReads;
  state.patch = (route) => {
    const body: unknown = route.request().postDataJSON();
    expect(body).toMatchObject({
      contacts: [
        ...dossierFixture().contacts,
        { name: 'Third Contact', email: 'third.contact@example.test' },
      ],
    });
    return route.fulfill({
      status: 409,
      json: {
        code: 'possible_duplicate_review_required',
        duplicate_review_reference: 'hidden-233-reference',
      },
    });
  };
  await form.getByRole('button', { name: 'Save correction' }).click();
  await expect(page.getByText(/This Client may already exist/)).toBeVisible();
  await expect.poll(() => state.reviewReads).toBeGreaterThan(reviews);
  expect(state.activityReads).toBe(activities);
  await page.getByRole('button', { name: 'Close correction' }).click();
  await expect(page.getByText('hidden-233-reference')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Reload dossier' }),
  ).toHaveCount(0);
  await captureDossier(page, testInfo, 'dossier-closed-duplicate.png');
});

test('shows missing values and empty Contacts without fabricated data', async ({
  page,
}, testInfo) => {
  const state = await installDossierFixture(page);
  state.dossier = {
    ...state.dossier,
    taxId: null,
    address: null,
    telephone: null,
    generalEmail: null,
    businessActivity: null,
    contacts: [],
  };
  await openDossier(page);
  const details = page.getByRole('region', {
    name: 'Shared details',
    exact: true,
  });
  await expect(details.getByText('Not provided', { exact: true })).toHaveCount(
    5,
  );
  await expect(page.getByText('No shared Contacts recorded.')).toBeVisible();
  await captureDossier(page, testInfo, 'dossier-missing-values.png');
});

for (const outcome of [
  {
    status: 404,
    message: 'The Client dossier is not available in this Company.',
  },
  {
    status: 503,
    message: 'We could not load this Client dossier. Please try again.',
  },
  { status: 403, message: 'Your access to this workspace is inactive.' },
]) {
  test(`keeps dossier loading and ${outcome.status} outcomes distinct`, async ({
    page,
  }) => {
    const state = await installDossierFixture(page);
    let release: (() => Promise<void>) | undefined;
    state.read = (route) => {
      release = () => route.fulfill({ status: outcome.status, json: {} });
    };
    await page.goto('/?frame=prisme#clients');
    await page.getByRole('button', { name: 'Open dossier' }).click();
    await expect(page.getByText('Loading Client dossier…')).toBeVisible();
    if (!release) throw new Error('Expected a dossier read');
    if (outcome.status === 403) state.actorStatus = 403;
    await release();
    await expect(page.getByText(outcome.message)).toBeVisible();
    await expect(correctionTrigger(page)).toHaveCount(0);
    await expect(page.getByText('TAX-233', { exact: true })).toHaveCount(0);
  });
}

test('never grants the minimal Workspace Owner enriched dossier access', async ({
  page,
}) => {
  const state = await installDossierFixture(page);
  state.actor = {
    ...actorContextFixture,
    workspacePermissions: ['client.manage'],
    activeCompany: dossierCompany,
  };
  await page.goto('/?frame=prisme#clients');
  await expect(
    page.getByRole('heading', { name: state.dossier.displayName }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open dossier' })).toHaveCount(
    0,
  );
  await expect(correctionTrigger(page)).toHaveCount(0);
  expect(state.dossierReads).toBe(0);
});

test('removes a correction and its data when Director authority is revoked', async ({
  page,
}) => {
  const state = await installDossierFixture(page);
  await openDossier(page);
  await correctionTrigger(page).click();
  await correctionForm(page)
    .getByLabel('Telephone', { exact: true })
    .fill('Private draft');
  state.actor = {
    ...actorContextFixture,
    workspacePermissions: ['client.manage'],
    activeCompany: dossierCompany,
  };
  state.patch = (route) => route.fulfill({ status: 403, json: {} });
  await correctionForm(page)
    .getByRole('button', { name: 'Save correction' })
    .click();
  await expect(page.getByRole('button', { name: 'Open dossier' })).toHaveCount(
    0,
  );
  await expect(page.getByText('TAX-233', { exact: true })).toHaveCount(0);
  await expect(page.locator('input[value="Private draft"]')).toHaveCount(0);
  await changeFrame(page, 'Use classic frame');
  await expect(correctionForm(page)).toHaveCount(0);
});

test('does not steal focus when a dossier arrives after navigation or presentation changes', async ({
  page,
}) => {
  const state = await installDossierFixture(page);
  let release: (() => Promise<void>) | undefined;
  state.read = (route) => {
    release = () => route.fulfill({ json: state.dossier });
  };
  await page.goto('/?frame=prisme#clients');
  await page.getByRole('button', { name: 'Open dossier' }).click();
  await expect(page.getByText('Loading Client dossier…')).toBeVisible();
  await navigateTo(page, 'Overview');
  if (!release) throw new Error('Expected a delayed dossier');
  await release();
  await expect(page.getByText('Version 1', { exact: true })).toBeHidden();
  await expect(page.locator('#client-dossier-title')).not.toBeFocused();
  await changeFrame(page, 'Use classic frame');
  await changeFrame(page, 'Try Prisme');
  await expect(page.locator('#client-dossier-title')).not.toBeFocused();
  await navigateTo(page, 'Clients');
  await expect(page.locator('#client-dossier-title')).not.toBeFocused();
  await page.getByRole('button', { name: 'Open dossier' }).click();
  await expect(page.locator('#client-dossier-title')).toBeFocused();
  await correctionTrigger(page).click();
  await changeFrame(page, 'Use classic frame');
  await changeFrame(page, 'Try Prisme');
  await expect(
    correctionForm(page).getByLabel('Client display name'),
  ).not.toBeFocused();
});
