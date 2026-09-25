import { expect, test, type Page } from '@playwright/test';
import type { ClientContact } from '../src/client/ClientContactEditor';
import {
  captureDossier,
  correctionForm,
  correctionTrigger,
  dossierFixture,
  installDossierFixture,
} from './prisme-dossier.fixture';

const anaPreferences =
  'Română sau engleză; email preferat, telefon doar pentru urgențe.\nLuni–joi 09:00–12:00; vineri după 14:00.\nReferință: https://example.test/preferinte-contact-program-de-lucru-extins';
const ionPreferences = 'Romanian; video calls\nweekday mornings';

function contactsRegion(page: Page) {
  return page.getByRole('region', { name: 'Contacts', exact: true });
}

async function openVersion(
  page: Page,
  frame: 'prisme' | 'classic',
  version: number,
) {
  await page.goto(`/?frame=${frame}#clients`);
  await page.getByRole('button', { name: 'Open dossier', exact: true }).click();
  await expect(
    page.getByText(`Version ${version}`, { exact: true }),
  ).toBeVisible();
}

test('records Contact communication preferences in Prisme and keeps them after reload and other edits', async ({
  page,
}, testInfo) => {
  const state = await installDossierFixture(page);
  const [ana, ion] = dossierFixture().contacts;
  if (!ana || !ion) throw new Error('Expected two fixture Contacts.');
  state.dossier = {
    ...state.dossier,
    contacts: [{ ...ana, communicationPreferences: anaPreferences }, ion],
  };
  const expectedSaves: ClientContact[][] = [
    [
      { ...ana, communicationPreferences: anaPreferences },
      { ...ion, communicationPreferences: ionPreferences },
    ],
    [
      {
        ...ana,
        telephone: '+373 60 333 445',
        communicationPreferences: anaPreferences,
      },
      { ...ion, communicationPreferences: ionPreferences },
    ],
  ];
  state.patch = (route) => {
    const contacts = expectedSaves.shift();
    if (!contacts) throw new Error('Unexpected Client correction.');
    const body: unknown = route.request().postDataJSON();
    expect(body).toHaveProperty('expectedVersion', state.dossier.version);
    expect(body).toHaveProperty('contacts', contacts);
    state.dossier = {
      ...state.dossier,
      contacts,
      version: state.dossier.version + 1,
    };
    return route.fulfill({ json: state.dossier });
  };

  await openVersion(page, 'prisme', 1);
  const anaPreferencesText = contactsRegion(page).getByText(
    /^Communication preferences: Română/u,
  );
  await expect(anaPreferencesText).toBeVisible();
  await expect(anaPreferencesText).toHaveText(
    `Communication preferences: ${anaPreferences}`,
  );
  expect(
    await anaPreferencesText.evaluate(
      (element) => element.getBoundingClientRect().height,
    ),
  ).toBeGreaterThan(40);
  await expect(contactsRegion(page).getByRole('link')).toHaveCount(0);
  await captureDossier(page, testInfo, 'contact-preferences-reading.png');

  await correctionTrigger(page).click();
  const form = correctionForm(page);
  const second = form.getByRole('group', { name: 'Contact 2', exact: true });
  await second.getByRole('checkbox', { name: 'Blocker', exact: true }).focus();
  await page.keyboard.press('Tab');
  const ionField = second.getByLabel('Contact communication preferences', {
    exact: true,
  });
  await expect(ionField).toBeFocused();
  await expect(ionField).toHaveAccessibleDescription(
    /^Practical preferences only/u,
  );
  await page.keyboard.type('  Romanian; video calls');
  await page.keyboard.press('Enter');
  await page.keyboard.type('weekday mornings  ');
  await ionField.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath('contact-preferences-editor-viewport.png'),
  });
  await captureDossier(page, testInfo, 'contact-preferences-editor.png');
  await form.getByRole('button', { name: 'Save correction' }).click();
  await expect(page.getByText('Version 2', { exact: true })).toBeVisible();

  await page.reload();
  await openVersion(page, 'prisme', 2);
  await expect(
    contactsRegion(page).getByText(
      `Communication preferences: ${ionPreferences}`,
    ),
  ).toBeVisible();
  await correctionTrigger(page).click();
  await expect(
    form
      .getByRole('group', { name: 'Contact 1', exact: true })
      .getByLabel('Contact communication preferences', { exact: true }),
  ).toHaveValue(anaPreferences);
  await form
    .getByRole('group', { name: 'Contact 1', exact: true })
    .getByLabel('Contact telephone', { exact: true })
    .fill('+373 60 333 445');
  await form.getByRole('button', { name: 'Save correction' }).click();
  await expect(page.getByText('Version 3', { exact: true })).toBeVisible();
  expect(expectedSaves).toHaveLength(0);
  await page.getByRole('button', { name: 'Close correction' }).click();
  await captureDossier(page, testInfo, 'contact-preferences-after-edit.png');
});

test('shows the Classic preference field, help and too-long draft without overflow', async ({
  page,
}, testInfo) => {
  const state = await installDossierFixture(page);
  const [ana, ion] = dossierFixture().contacts;
  if (!ana || !ion) throw new Error('Expected two fixture Contacts.');
  state.dossier = {
    ...state.dossier,
    contacts: [{ ...ana, communicationPreferences: anaPreferences }, ion],
  };
  await openVersion(page, 'classic', 1);
  await expect(
    contactsRegion(page).getByText(/^Communication preferences: Română/u),
  ).toBeVisible();
  const form = correctionForm(page);
  const field = form
    .getByRole('group', { name: 'Contact 2', exact: true })
    .getByLabel('Contact communication preferences', { exact: true });
  await field.fill('x'.repeat(1_001));
  await form.getByRole('button', { name: 'Save correction' }).click();
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(field).toHaveAccessibleDescription(
    /Communication preferences must be 1000 characters or fewer\.$/u,
  );
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'Communication preferences must be 1000' }),
  ).toBeVisible();
  expect(state.commands).toHaveLength(0);
  await field.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath('contact-preferences-classic-viewport.png'),
  });
  await captureDossier(page, testInfo, 'contact-preferences-classic.png');
});
