import { expect, test, type Page, type Route } from '@playwright/test';
import {
  createClarteTasksApi,
  tasksDay,
  tasksProjects,
  tasksResultReference,
  tasksTitles,
} from '../src/clarte/tasks/clarte-tasks.test-fixture';
import { isPhoneLayout, openClarte } from './clarte.fixture';

/** Every API request is answered by the shared fictional Tasks API. */
async function serveTasks(page: Page) {
  const api = createClarteTasksApi();
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
    if ('pdf' in reply)
      return route.fulfill({
        status: reply.status,
        contentType: 'application/pdf',
        body: reply.pdf,
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

test('blocks a Task with a reason, declares another Task’s result and downloads its PDF, plans five Tasks together and creates an internal Task', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const api = await serveTasks(page);
  await openClarte(page, '/#my-tasks');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tasks');

  // My Tasks: the actor's open Tasks grouped by due date.
  const mine = page.getByRole('region', { name: 'My Tasks' });
  await expect(
    mine
      .getByRole('region', { name: /Past due/u })
      .getByRole('heading', { name: tasksTitles.questionnaire }),
  ).toBeVisible();
  await expect(
    mine.getByRole('heading', { name: tasksTitles.budget }),
  ).toBeAttached();
  await noHorizontalScroll(page);
  await screenshot(page, 'clarte-tasks-mine');

  // Block a Task with a reason from its side panel.
  await mine
    .getByRole('button', { name: tasksTitles.questionnaire, exact: true })
    .click();
  const blocked = page.getByRole('dialog', {
    name: tasksTitles.questionnaire,
  });
  await expect(
    blocked
      .getByRole('tabpanel', { name: 'Task', exact: true })
      .getByText('Critical', { exact: true }),
  ).toBeVisible();
  await noHorizontalScroll(page);
  await screenshot(page, 'clarte-tasks-panel');
  await blocked
    .getByRole('group', { name: 'Task actions' })
    .getByRole('button', { name: 'Mark blocked' })
    .click();
  await blocked
    .getByLabel('Blockage reason')
    .fill('Waiting for the supplier answers');
  await blocked.getByRole('button', { name: 'Save blockage' }).click();
  await expect(blocked.getByText('Task change recorded.')).toBeVisible();
  await blocked.getByRole('tab', { name: 'History', exact: true }).click();
  await expect(
    blocked
      .getByRole('tabpanel', { name: 'History', exact: true })
      .getByText('Reason: Waiting for the supplier answers'),
  ).toBeVisible();
  await blocked.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(
    mine.getByText('Waiting for the supplier answers'),
  ).toBeVisible();

  // Declare another Task's result and download its exact PDF.
  await mine
    .getByRole('button', { name: tasksTitles.checklist, exact: true })
    .click();
  const checklist = page.getByRole('dialog', { name: tasksTitles.checklist });
  await checklist.getByRole('tab', { name: 'Result', exact: true }).click();
  const result = checklist.getByRole('tabpanel', {
    name: 'Result',
    exact: true,
  });
  await expect(result.getByText('No declared result.')).toBeVisible();
  await result
    .getByLabel('Result declaration')
    .fill('Checklist prepared and shared with the auditor');
  await result
    .getByRole('combobox', { name: 'Frozen mission Version' })
    .click();
  await page
    .getByRole('option', { name: new RegExp(tasksResultReference.title, 'u') })
    .click();
  await result.getByRole('button', { name: 'Record result' }).click();
  await expect(result.getByText('Result confirmed.')).toBeVisible();
  const download = page.waitForEvent('download');
  await result
    .getByRole('button', { name: 'Download exact PDF · Version 2' })
    .click();
  expect((await download).suggestedFilename()).toBe('mission-version-2.pdf');

  // Plan five open Tasks of the Project together.
  await checklist.getByRole('tab', { name: 'Project', exact: true }).click();
  await checklist.getByRole('button', { name: 'Plan selected Tasks' }).click();
  const planning = checklist.getByRole('region', {
    name: 'Grouped Task planning',
  });
  const chosen = [
    tasksTitles.questionnaire,
    tasksTitles.checklist,
    tasksTitles.participants,
    tasksTitles.minutes,
    tasksTitles.calibration,
  ];
  for (const title of chosen)
    await planning.getByRole('checkbox', { name: title }).check();
  await expect(planning.getByText(/5 \/ 50/u)).toBeVisible();
  const due = tasksDay(20);
  for (const title of chosen)
    await planning.getByLabel(`Due date — ${title}`).fill(due);
  await noHorizontalScroll(page);
  await screenshot(page, 'clarte-tasks-planning');
  await planning
    .getByRole('button', { name: 'Save selected planning' })
    .click();
  await expect(planning.getByText('Selected planning saved.')).toBeVisible();
  expect(
    api.commands.find(({ path }) => path.endsWith('/tasks/planning'))?.path,
  ).toBe(`/projects/${tasksProjects.dairy.id}/tasks/planning`);
  await checklist.getByRole('button', { name: 'Close', exact: true }).click();

  // Team Tasks under the existing criteria.
  const views = page.getByRole('navigation', { name: 'Tasks views' });
  await views.getByRole('link', { name: 'Team Tasks' }).click();
  const team = page.getByRole('region', { name: 'Team Tasks' });
  await expect(
    team.getByRole('heading', { name: tasksTitles.agenda }),
  ).toBeVisible();
  await noHorizontalScroll(page);
  await screenshot(page, 'clarte-tasks-team');

  // Create an internal Task of the Company.
  await views.getByRole('link', { name: 'Internal Tasks' }).click();
  const internal = page.getByRole('region', { name: 'Internal Tasks' });
  await expect(
    internal.getByRole('heading', { name: 'Renew the training room booking' }),
  ).toBeVisible();
  await internal.getByRole('button', { name: 'Create internal Task' }).click();
  const create = page.getByRole('dialog', { name: 'Create internal Task' });
  await create
    .getByRole('textbox', { name: 'Task title' })
    .fill('Order the new archive boxes');
  await create
    .getByRole('form', { name: 'Create internal Task' })
    .getByRole('button', { name: 'Create internal Task' })
    .click();
  await expect(create.getByText('Internal Task saved.')).toBeVisible();
  await create.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(
    internal.getByRole('heading', { name: 'Order the new archive boxes' }),
  ).toBeVisible();
  await noHorizontalScroll(page);
  await screenshot(page, 'clarte-tasks-internal');
  test.info().annotations.push({
    type: 'unanswered reads',
    description: [...api.unhandled].sort().join(', '),
  });
});
