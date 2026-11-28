import { expect, test, type Page, type Route } from '@playwright/test';
import {
  createClarteMissionsApi,
  missionsClients,
  missionsMembers,
  missionsSeededProjects,
} from '../src/clarte/missions/clarte-missions.test-fixture';
import { pilotSourceFixture } from '../src/project/project-pilot-plan.test-fixtures';
import { isPhoneLayout, openClarte } from './clarte.fixture';
import { selectOption } from './select-option';

const [lumen] = missionsClients;
const [ana, ion] = missionsMembers;
const certification = 'Fictional ISO 9001 certification support';
const diagnosis = 'Fictional HACCP preparatory diagnosis';

/** Every API request is answered by the shared fictional Projects API. */
async function serveMissions(page: Page) {
  const api = createClarteMissionsApi();
  await page.route('**/api/**', async (route: Route) => {
    const request = route.request();
    const contentType = request.headers()['content-type'] ?? '';
    const reply = api.reply({
      method: request.method(),
      url: new URL(request.url()),
      body: contentType.startsWith('application/json')
        ? request.postDataJSON()
        : undefined,
    });
    if (reply.json === undefined)
      return route.fulfill({ status: reply.status });
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

function projectRow(page: Page, title: string) {
  return page
    .locator('section#projects')
    .getByRole('button', { name: new RegExp(`^${title} Client: `, 'u') });
}

test('lists Projects, creates one from a template, opens its mission space and runs the lifecycle, owner and next action', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const api = await serveMissions(page);
  await openClarte(page, '/#projects');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Missions and audits',
  );
  const missions = page.locator('section#projects');

  // The list: search, then the open-only view and back.
  await expect(projectRow(page, certification)).toBeVisible();
  await expect(projectRow(page, diagnosis)).toBeVisible();
  await missions
    .getByRole('searchbox', { name: 'Find Projects' })
    .fill('valea');
  await expect(projectRow(page, certification)).toBeHidden();
  await missions.getByRole('searchbox', { name: 'Find Projects' }).fill('');
  await missions.getByRole('button', { name: 'My open Projects' }).click();
  await expect(projectRow(page, diagnosis)).toBeHidden();
  await missions.getByRole('button', { name: 'All Projects' }).click();
  await expect(projectRow(page, diagnosis)).toBeVisible();
  await noHorizontalScroll(page);
  await screenshot(page, 'clarte-missions-list');

  // Create a Project from a template in its side panel.
  await missions.getByRole('button', { name: 'From a template' }).click();
  const creation = page.getByRole('dialog', {
    name: 'Create a Project from a template',
  });
  await selectOption(
    creation.getByRole('combobox', { name: 'Project template' }),
    {
      label: 'Préparation d’une mission de conseil — Version 1',
    },
  );
  await creation
    .getByLabel('Project title')
    .fill('Fictional ISO 22000 preparation');
  await selectOption(creation.getByRole('combobox', { name: 'Client' }), {
    label: lumen.displayName,
  });
  await creation
    .getByRole('button', { name: 'Create Project from template' })
    .click();
  const created = page.getByRole('article', {
    name: 'Fictional ISO 22000 preparation',
  });
  await expect(created.getByRole('tab', { name: 'Plan' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(created.getByText('Clarifier la demande')).toBeVisible();
  await created.getByRole('button', { name: 'Back to Projects' }).click();

  // The mission space of a running Project, on its copied plan.
  await projectRow(page, certification).click();
  const space = page.getByRole('article', { name: certification });
  await expect(space.getByRole('tab', { name: 'Plan' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const [first] = pilotSourceFixture.activities;
  await expect(space.getByText(first.intendedResult)).toBeVisible();
  await expect(space.getByText(`Owner: ${ana.displayLabel}`)).toBeVisible();
  await noHorizontalScroll(page);
  await screenshot(page, 'clarte-missions-space');
  await space
    .getByRole('button', { name: `Open linked Task — ${first.key}` })
    .click();
  await expect(space.getByRole('tab', { name: 'Tasks' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(
    missions.getByRole('heading', { name: first.title }),
  ).toBeVisible();
  await space.getByRole('button', { name: 'Back to Projects' }).click();

  // A preparatory Project: owner, start declaration, hold and resume.
  await projectRow(page, diagnosis).click();
  const prepared = page.getByRole('article', { name: diagnosis });

  // The next action and its history, before the lifecycle moves on.
  await prepared.getByRole('button', { name: 'Change' }).click();
  const next = page.getByRole('dialog', { name: 'Project next action' });
  const editor = next.getByRole('textbox', { name: 'Next action' });
  await expect(editor).toBeEnabled();
  await editor.fill('Send the questionnaire to the Client');
  await next.getByRole('button', { name: 'Save next action' }).click();
  await expect(next.getByText('Next action saved.')).toBeVisible();
  await expect(
    next.getByRole('region', { name: 'Next action history' }),
  ).toContainText('Send the questionnaire to the Client');
  await next.getByRole('button', { name: 'Close' }).click();
  await expect(
    prepared
      .getByRole('group', { name: 'Project next action' })
      .getByText('Send the questionnaire to the Client'),
  ).toBeVisible();

  // The owner, then the start declaration with an exception, hold and resume.
  await prepared.getByRole('button', { name: 'Owner' }).click();
  const owner = page.getByRole('dialog', { name: 'Project owner' });
  await owner.getByRole('button', { name: 'Change' }).click();
  await selectOption(
    owner.getByRole('combobox', { name: 'Choose the responsible member' }),
    { label: ana.displayLabel },
  );
  await owner.getByRole('button', { name: 'Save' }).click();
  await expect(owner.getByText('Responsible member saved.')).toBeVisible();
  await owner.getByRole('button', { name: 'Close' }).click();
  await expect(prepared.getByText(`Owner: ${ana.displayLabel}`)).toBeVisible();

  await prepared.getByRole('button', { name: 'Lifecycle' }).click();
  const lifecycle = page.getByRole('dialog', { name: 'Project lifecycle' });
  await lifecycle.getByRole('button', { name: 'Activate Project' }).click();
  const items = lifecycle.getByRole('group').filter({
    has: page.getByRole('radio', { name: 'Present' }),
  });
  await expect(items).toHaveCount(7);
  for (let index = 0; index < 7; index += 1)
    await items
      .nth(index)
      .getByText(index === 3 ? 'Missing' : 'Present', { exact: true })
      .click();
  await lifecycle
    .getByLabel('Start exception reason')
    .fill('Initial documents arrive next week.');
  await selectOption(
    lifecycle.getByRole('combobox', { name: 'To be completed by' }),
    { label: ion.displayLabel },
  );
  await lifecycle.getByLabel('Completion deadline').fill('2026-12-05');
  await screenshot(page, 'clarte-missions-activation');
  await lifecycle
    .getByRole('button', { name: 'Activate', exact: true })
    .click();
  await expect(lifecycle.getByText('Project lifecycle updated.')).toBeVisible();
  await lifecycle.getByRole('button', { name: 'Put on hold' }).click();
  await lifecycle
    .getByLabel('Hold reason')
    .fill('The Client postpones the visits.');
  await lifecycle.getByRole('button', { name: 'Put Project on hold' }).click();
  await expect(prepared.locator('header').getByText('On hold')).toBeVisible();
  await lifecycle.getByRole('button', { name: 'Resume Project' }).click();
  await lifecycle.getByRole('button', { name: 'Confirm resumption' }).click();
  await expect(
    lifecycle.getByRole('button', { name: 'Put on hold' }),
  ).toBeVisible();
  await lifecycle.getByRole('button', { name: 'Close' }).click();
  await expect(prepared.locator('header').getByText('Active')).toBeVisible();
  await noHorizontalScroll(page);
  await screenshot(page, 'clarte-missions-prepared');

  // Navigate to the Client dossier.
  await prepared.getByRole('button', { name: 'Open Client dossier' }).click();
  await expect(page).toHaveURL(/#clients$/u);
  const diagnosisPath = `/projects/${missionsSeededProjects.diagnosis}`;
  expect(api.writes).toEqual([
    'POST /projects/from-template',
    `POST ${diagnosisPath}/next-action`,
    `PUT ${diagnosisPath}/responsible`,
    `POST ${diagnosisPath}/lifecycle-transitions`,
    `POST ${diagnosisPath}/lifecycle-transitions`,
    `POST ${diagnosisPath}/lifecycle-transitions`,
  ]);
});
