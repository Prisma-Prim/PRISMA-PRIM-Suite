import { enterClassicCompatibility } from './classic-compatibility';
import { expectValue, openSelect, selectOption } from './select-option';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  actorContextFixture,
  operationalHomeFixture,
  unassignedResponsibility,
} from './actor-context.fixture';
import type { TaskView } from '../src/project/task-response';

const company = { id: 'filter-company', displayName: 'PRISMA-PRIM' };
const client = {
  id: 'filter-client',
  displayName: 'Synthetic Client',
  relatedToActiveCompany: true,
};
const project = {
  id: 'filter-project',
  companyId: company.id,
  clientAccountId: client.id,
  clientDisplayName: client.displayName,
  title: 'Filtering preparation',
  status: 'preparatory',
  createdAt: '2026-09-19T00:00:00.000Z',
};
const attribution = {
  internalUserId: actorContextFixture.internalUserId,
  workspaceMembershipId: actorContextFixture.workspaceMembershipId,
  displayName: actorContextFixture.displayName,
};
const anaPop = {
  workspaceMembershipId: 'filter-membership-ana',
  displayLabel: 'Ana Pop',
};
const ionRadu = {
  workspaceMembershipId: 'filter-membership-ion',
  displayLabel: 'Ion Radu',
};

test('finds loaded Tasks locally and keeps detail state through authoritative status refreshes', async ({
  page,
}, testInfo) => {
  const tasks = taskFixtures();
  let listReads = 0;
  await interceptApplication(page, tasks, () => {
    listReads += 1;
  });

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?frame=prisme#projects');
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await selectOption(
    page.getByLabel('Active Company', { exact: true }),
    company.id,
  );
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Close navigation' }).click();
  await page.goto('/?frame=prisme#projects');
  await page
    .getByRole('button', {
      name: `${project.title} Client: ${project.clientDisplayName}`,
    })
    .click();

  const region = page.getByRole('region', { name: 'Tasks', exact: true });
  const navigation = region.getByRole('navigation', { name: 'Tasks' });
  // Filter controls live beside the list, so listed rows are read through the list items.
  const listed = navigation.getByRole('listitem').getByRole('button');
  const search = navigation.getByLabel('Search Tasks');
  const status = navigation.getByLabel('Task status');
  await expectValue(status, 'all');
  await expect(listed).toHaveText([
    'Collect preparation notes',
    'Archive preparation evidence',
    'Review archive notes',
  ]);
  expect(listReads).toBe(1);

  const responsible = navigation.getByLabel('Task responsible member');
  await expectValue(responsible, 'all');
  // The eligible-member query answers with no member, so these options come from the loaded rows.
  const responsibleChoices = await openSelect(responsible);
  await expect(responsibleChoices.getByRole('option')).toHaveText([
    'All',
    'Unassigned',
    'Ana Pop',
    'Ion Radu',
  ]);
  await responsible.press('Escape');
  await selectOption(responsible, { label: 'Unassigned' });
  await expect(listed).toHaveText(['Review archive notes']);
  await selectOption(responsible, { label: 'Ana Pop' });
  await expect(listed).toHaveText(['Collect preparation notes']);
  await selectOption(status, 'done');
  await expect(
    navigation.getByText('No Tasks match the current filters.'),
  ).toBeVisible();
  await selectOption(status, 'all');
  await search.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(responsible).toBeFocused();
  expect(
    await responsible.evaluate(
      (element) => getComputedStyle(element).outlineStyle,
    ),
  ).toBe('solid');
  expect(
    await responsible.evaluate(
      (element) => getComputedStyle(element).outlineColor,
    ),
  ).toBe('rgb(75, 54, 181)');
  await selectOption(responsible, { label: 'All' });
  expect(listReads).toBe(1);

  const dates = navigation.getByLabel('Task date filter');
  const dateChoices = await openSelect(dates);
  await expect(dateChoices.getByRole('option')).toHaveText([
    'All dates',
    'Without a date',
    'Date range',
  ]);
  await dates.press('Escape');
  await selectOption(dates, { label: 'Without a date' });
  await expect(listed).toHaveText(['Review archive notes']);
  // A Date range never keeps an undated Task, even while both bounds stay open.
  await selectOption(dates, { label: 'Date range' });
  await expect(listed).toHaveText([
    'Collect preparation notes',
    'Archive preparation evidence',
  ]);
  const from = navigation.getByLabel('Task date from');
  const through = navigation.getByLabel('Task date through');
  await from.fill('2026-10-05');
  await through.fill('2026-10-31');
  await expect(listed).toHaveText(['Collect preparation notes']);
  await through.fill('2026-09-30');
  await expect(navigation.getByRole('alert')).toHaveText(
    'Enter calendar dates with the from date on or before the through date. No date filter is applied until then.',
  );
  await expect(listed).toHaveText([
    'Collect preparation notes',
    'Archive preparation evidence',
    'Review archive notes',
  ]);
  // A real calendar control answers 30 February by clearing its value and reporting bad input, which
  // must not read as the open bound that would apply the remaining through date on its own.
  await from.fill('');
  await through.fill('2026-10-31');
  await expect(listed).toHaveText(['Collect preparation notes']);
  await from.focus();
  await from.pressSequentially('02302026');
  // The control keeps the entry visible while refusing to produce a date.
  expect(
    await from.evaluate(
      (element) =>
        element instanceof HTMLInputElement &&
        element.value === '' &&
        element.validity.badInput,
    ),
  ).toBe(true);
  // Tab walks the control's own month, day and year fields, so the reader is moved to another control
  // and focus is proved to have left the rejected entry.
  await expect(from).toBeFocused();
  await search.focus();
  await expect(search).toBeFocused();
  await expect(from).not.toBeFocused();
  await expect(navigation.getByRole('alert')).toHaveText(
    'Enter calendar dates with the from date on or before the through date. No date filter is applied until then.',
  );
  await expect(listed).toHaveText([
    'Collect preparation notes',
    'Archive preparation evidence',
    'Review archive notes',
  ]);
  await from.fill('2026-10-01');
  await expect(navigation.getByRole('alert')).toHaveCount(0);
  await expect(listed).toHaveText(['Collect preparation notes']);
  await from.fill('');

  await dates.focus();
  await page.keyboard.press('Tab');
  await expect(from).toBeFocused();
  expect(
    await from.evaluate((element) => getComputedStyle(element).outlineStyle),
  ).toBe('solid');
  expect(
    await from.evaluate((element) => getComputedStyle(element).outlineColor),
  ).toBe('rgb(75, 54, 181)');
  await navigation.getByRole('button', { name: 'Reset date filter' }).click();
  await expectValue(dates, 'all');
  await expect(navigation.getByLabel('Task date from')).toHaveCount(0);
  await expect(navigation.getByRole('alert')).toHaveCount(0);
  await expect(listed).toHaveText([
    'Collect preparation notes',
    'Archive preparation evidence',
    'Review archive notes',
  ]);
  expect(listReads).toBe(1);

  await search.focus();
  await expect(search).toBeFocused();
  expect(
    await search.evaluate((element) => getComputedStyle(element).outlineStyle),
  ).toBe('solid');
  expect(
    await search.evaluate((element) => getComputedStyle(element).outlineColor),
  ).toBe('rgb(75, 54, 181)');
  await search.fill('EVIDENCE');
  await expect(listed).toHaveText(['Archive preparation evidence']);
  await selectOption(status, 'todo');
  await expect(
    navigation.getByText('No Tasks match the current filters.'),
  ).toBeVisible();
  await expect(
    navigation.getByText('No manual Tasks for this Project yet.'),
  ).toHaveCount(0);
  expect(listReads).toBe(1);

  await selectOption(status, 'done');
  await navigation
    .getByRole('button', { name: 'Archive preparation evidence' })
    .click();
  await expect(
    region.getByRole('heading', { name: 'Archive preparation evidence' }),
  ).toBeVisible();
  await selectOption(status, 'todo');
  await expect(
    navigation.getByText('No Tasks match the current filters.'),
  ).toBeVisible();
  await expect(
    region.getByRole('heading', { name: 'Archive preparation evidence' }),
  ).toBeVisible();

  await search.fill('');
  await navigation
    .getByRole('button', { name: 'Collect preparation notes' })
    .click();
  const taskForm = region.locator('form');
  const taskAssignee = taskForm.getByLabel('Responsible member');
  const taskPriority = taskForm.getByLabel('Priority');
  const saveTask = taskForm.getByRole('button', {
    name: 'Save Task',
    exact: true,
  });
  await expect(taskAssignee).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  );
  await expect(taskPriority).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  );
  await expect(saveTask).toHaveCSS('background-color', 'rgb(100, 81, 232)');
  await expect(saveTask).toHaveCSS('color', 'rgb(255, 255, 255)');
  await taskAssignee.focus();
  expect(
    await taskAssignee.evaluate(
      (element) => getComputedStyle(element).outlineStyle,
    ),
  ).toBe('solid');
  expect(
    await taskAssignee.evaluate(
      (element) => getComputedStyle(element).outlineColor,
    ),
  ).toBe('rgb(75, 54, 181)');
  await region.getByLabel('Task title').fill('Unsaved preparation title');
  await search.fill('review archive');
  await expect(
    navigation.getByRole('button', { name: 'Collect preparation notes' }),
  ).toHaveCount(0);
  await expect(
    region.getByRole('heading', { name: 'Collect preparation notes' }),
  ).toBeVisible();
  await expectValue(
    region.getByLabel('Task title'),
    'Unsaved preparation title',
  );
  const readsBeforeTabs = listReads;
  await page
    .getByRole('tab', { name: 'Working Documents', exact: true })
    .click();
  await expect(
    page.getByRole('tabpanel', { name: 'Working Documents' }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Tasks', exact: true }).click();
  await expect(page.getByRole('tabpanel', { name: 'Tasks' })).toBeVisible();
  await expectValue(search, 'review archive');
  await expectValue(status, 'todo');
  await expectValue(
    region.getByLabel('Task title'),
    'Unsaved preparation title',
  );
  expect(listReads).toBe(readsBeforeTabs);

  await search.fill('');
  await region.getByLabel('Task title').fill('Collect preparation notes');
  const readsBeforeComplete = listReads;
  await region.getByRole('button', { name: 'Mark done' }).click();
  await expect(
    navigation.getByRole('button', { name: 'Collect preparation notes' }),
  ).toHaveCount(0);
  await expect(
    region.getByRole('heading', { name: 'Collect preparation notes' }),
  ).toBeVisible();
  await expect(
    region.getByRole('button', { name: 'Reopen Task' }),
  ).toBeVisible();
  expect(listReads).toBe(readsBeforeComplete + 1);

  const readsBeforeReopen = listReads;
  await region.getByRole('button', { name: 'Reopen Task' }).click();
  await expect(
    navigation.getByRole('button', { name: 'Collect preparation notes' }),
  ).toBeVisible();
  await expect(region.getByRole('button', { name: 'Mark done' })).toBeVisible();
  expect(listReads).toBe(readsBeforeReopen + 1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath(
      `task-filtering-prisme-${testInfo.project.name}.png`,
    ),
    fullPage: true,
  });

  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await enterClassicCompatibility(page);
  await expect(page.getByLabel('Search Tasks')).toBeVisible();
  await selectOption(page.getByLabel('Task status'), 'all');
  const classicNavigation = page.getByRole('navigation', { name: 'Tasks' });
  const classicListed = classicNavigation
    .getByRole('listitem')
    .getByRole('button');
  await expect(classicListed).toHaveText([
    'Collect preparation notes',
    'Archive preparation evidence',
    'Review archive notes',
  ]);
  await expect(
    classicNavigation.getByRole('button', { name: 'New Task' }),
  ).toBeVisible();
  await page.getByLabel('Search Tasks').focus();
  expect(
    await page
      .getByLabel('Search Tasks')
      .evaluate((element) => getComputedStyle(element).outlineStyle),
  ).toBe('solid');
  expect(
    await page
      .getByLabel('Search Tasks')
      .evaluate((element) => getComputedStyle(element).outlineColor),
  ).toBe('rgb(75, 54, 181)');

  const classicResponsible = page.getByLabel('Task responsible member');
  await expectValue(classicResponsible, 'all');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(classicResponsible).toBeFocused();
  expect(
    await classicResponsible.evaluate(
      (element) => getComputedStyle(element).outlineStyle,
    ),
  ).toBe('solid');
  expect(
    await classicResponsible.evaluate(
      (element) => getComputedStyle(element).outlineColor,
    ),
  ).toBe('rgb(75, 54, 181)');
  await selectOption(classicResponsible, { label: 'Unassigned' });
  await expect(classicListed).toHaveText(['Review archive notes']);
  await selectOption(classicResponsible, { label: 'All' });

  const classicDates = page.getByLabel('Task date filter');
  await expectValue(classicDates, 'all');
  await selectOption(classicDates, { label: 'Date range' });
  const classicFrom = page.getByLabel('Task date from');
  await classicDates.focus();
  await page.keyboard.press('Tab');
  await expect(classicFrom).toBeFocused();
  expect(
    await classicFrom.evaluate(
      (element) => getComputedStyle(element).outlineStyle,
    ),
  ).toBe('solid');
  expect(
    await classicFrom.evaluate(
      (element) => getComputedStyle(element).outlineColor,
    ),
  ).toBe('rgb(75, 54, 181)');
  await classicFrom.fill('2026-11-01');
  await expect(classicListed).toHaveText(['Archive preparation evidence']);
  await page.getByRole('button', { name: 'Reset date filter' }).click();
  await expectValue(classicDates, 'all');
  await expect(classicListed).toHaveText([
    'Collect preparation notes',
    'Archive preparation evidence',
    'Review archive notes',
  ]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath(
      `task-filtering-classic-${testInfo.project.name}.png`,
    ),
    fullPage: true,
  });
});

function taskFixtures(): TaskView[] {
  const base: TaskView = {
    id: 'collect-task',
    companyId: company.id,
    projectId: project.id,
    clientAccountId: client.id,
    title: 'Collect preparation notes',
    assignee: null,
    dueDate: null,
    priority: 'normal',
    status: 'todo',
    completion: null,
    version: 1,
    createdAt: project.createdAt,
    updatedAt: project.createdAt,
    createdBy: attribution,
  };
  return [
    { ...base, assignee: anaPop, dueDate: '2026-10-05' },
    {
      ...base,
      id: 'archive-task',
      title: 'Archive preparation evidence',
      status: 'done',
      completion: { actor: attribution, occurredAt: project.createdAt },
      assignee: ionRadu,
      dueDate: '2026-11-20',
    },
    { ...base, id: 'review-task', title: 'Review archive notes' },
  ];
}

async function interceptApplication(
  page: Page,
  tasks: TaskView[],
  onListRead: () => void,
) {
  await page.route('**/api/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/access/current-actor')
      return route.fulfill({
        json: {
          ...actorContextFixture,
          workspacePermissions: ['company.manage', 'client.manage'],
          ...(request.headers()['x-company-context-id']
            ? {
                activeCompany: {
                  ...company,
                  projectPermissions: ['project.read'],
                  taskPermissions: ['task.read', 'task.manage'],
                  taskPermissionAssignmentId: 'task-filter-grant',
                  taskPermissionSetVersion: 'v1',
                },
              }
            : {}),
        },
      });
    if (path === '/api/companies') return route.fulfill({ json: [company] });
    if (path === '/api/operational-home')
      return route.fulfill({
        json: operationalHomeFixture(company.id, {
          active_clients: 1,
          open_projects: 1,
          overdue_tasks: 0,
        }),
      });
    if (path === '/api/clients') return route.fulfill({ json: [client] });
    if (path === '/api/activity-log')
      return route.fulfill({ json: { events: [] } });
    if (path === '/api/projects') return route.fulfill({ json: [project] });
    if (path === `/api/projects/${project.id}`)
      return route.fulfill({ json: project });
    if (path === `/api/projects/${project.id}/eligible-task-assignees`)
      return route.fulfill({ json: { members: [] } });
    if (path === `/api/projects/${project.id}/responsible`)
      return route.fulfill({ json: unassignedResponsibility });
    if (path === `/api/projects/${project.id}/tasks`) {
      onListRead();
      return route.fulfill({ json: { mutable: true, tasks } });
    }
    if (path === `/api/projects/${project.id}/documents`)
      return route.fulfill({ json: { mutable: true, documents: [] } });
    if (path === '/api/documents') return route.fulfill({ json: [] });
    if (path.endsWith('/history'))
      return route.fulfill({ json: { events: [] } });
    const taskId = path.split('/')[3];
    const taskIndex = tasks.findIndex((task) => task.id === taskId);
    const task = tasks[taskIndex];
    if (!task) return route.fulfill({ status: 404 });
    if (request.method() === 'POST') {
      const done = path.endsWith('/complete');
      const reopened = path.endsWith('/reopen');
      if (!done && !reopened) return route.fulfill({ status: 405 });
      const updated: TaskView = done
        ? {
            ...task,
            status: 'done',
            completion: {
              actor: attribution,
              occurredAt: project.createdAt,
            },
            version: task.version + 1,
          }
        : {
            ...task,
            status: 'todo',
            completion: null,
            version: task.version + 1,
          };
      tasks[taskIndex] = updated;
      return route.fulfill({ json: updated });
    }
    return route.fulfill({ json: { mutable: true, task } });
  });
}
