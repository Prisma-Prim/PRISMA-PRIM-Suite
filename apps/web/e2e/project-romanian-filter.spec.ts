import { expect, test, type Page } from '@playwright/test';
import { selectOption } from './select-option';
import {
  actorContextFixture,
  operationalHomeFixture,
  preparatoryLifecycle,
  unassignedResponsibility,
} from './actor-context.fixture';

// Public App journey with intercepted HTTP; not live PostgreSQL/Clerk evidence.
test('finds literal Romanian Projects locally across all interface languages', async ({
  page,
}, testInfo) => {
  const company = { id: 'romanian-filter-company', displayName: 'PRISMA-PRIM' };
  const clients = [
    { id: 'plain-client', displayName: 'Client demonstrativ' },
    { id: 'romanian-client', displayName: 'Ștefan Ţară' },
  ];
  const first = {
    id: 'romanian-title',
    companyId: company.id,
    clientAccountId: clients[0].id,
    clientDisplayName: clients[0].displayName,
    title: 'Pregătire Ștefan — plan pentru echipă',
    status: 'preparatory',
    createdAt: '2026-10-20T08:00:00.000Z',
  };
  const second = {
    ...first,
    id: 'romanian-client-project',
    clientAccountId: clients[1].id,
    clientDisplayName: clients[1].displayName,
    title: 'Cadrage de la mission',
  };
  const projects = [
    first,
    second,
    {
      ...first,
      id: 'closed-romanian',
      title: 'Ștefan închis',
      status: 'completed',
    },
    { ...first, id: 'russian-i', title: 'Проект и' },
    { ...first, id: 'russian-short-i', title: 'Проект й' },
  ];
  const requests: string[] = [];
  await page.route('**/api/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    requests.push(`${request.method()} ${path}`);
    if (path === '/api/access/current-actor')
      return route.fulfill({
        json: {
          ...actorContextFixture,
          workspacePermissions: ['client.manage'],
          ...(request.headers()['x-company-context-id']
            ? {
                activeCompany: {
                  ...company,
                  projectPermissions: ['project.read', 'project.create'],
                },
              }
            : {}),
        },
      });
    if (path === '/api/companies') return route.fulfill({ json: [company] });
    if (path === '/api/clients') return route.fulfill({ json: clients });
    if (path === '/api/projects') return route.fulfill({ json: projects });
    if (path === `/api/projects/${first.id}`)
      return route.fulfill({ json: first });
    if (path.endsWith('/responsible'))
      return route.fulfill({ json: unassignedResponsibility });
    if (path.endsWith('/lifecycle'))
      return route.fulfill({ json: preparatoryLifecycle });
    if (path === '/api/activity-log')
      return route.fulfill({ json: { events: [] } });
    if (path === '/api/operational-home')
      return route.fulfill({
        json: operationalHomeFixture(company.id, {
          active_clients: 2,
          open_projects: 4,
          overdue_tasks: 0,
        }),
      });
    return route.fulfill({ status: 404 });
  });

  await page.goto('/#projects');
  await navigation(page, testInfo.project.name, 'open');
  await selectOption(
    page.getByLabel('Active Company', { exact: true }),
    company.id,
  );
  await navigation(page, testInfo.project.name, 'close');
  await page.goto('/#projects');
  const workspace = page.locator('#projects');
  const list = workspace.getByRole('list');
  await expect(list.getByRole('button')).toHaveCount(4);
  const search = workspace.getByRole('searchbox');
  await search.fill('  STEFAN  ');
  await expect(list.getByRole('button')).toHaveCount(2);
  await expect(list.getByRole('button').nth(0)).toContainText(first.title);
  await expect(list.getByRole('button').nth(1)).toContainText(second.title);
  const afterLoad = [...requests];

  for (const locale of ['ro', 'ru', 'fr', 'en']) {
    await navigation(page, testInfo.project.name, 'open');
    const picker = page.locator('#interface-locale');
    await picker.focus();
    await picker.press('Home');
    for (
      let step = 0;
      step < ['ro', 'ru', 'fr', 'en'].indexOf(locale);
      step += 1
    )
      await picker.press('ArrowDown');
    await picker.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await navigation(page, testInfo.project.name, 'close');
    await expect(search).toHaveValue('  STEFAN  ');
    await expect(list.getByRole('button')).toHaveCount(2);
    await expect(list.getByRole('button').nth(0)).toContainText(first.title);
    await expect(list.getByRole('button').nth(1)).toContainText(
      clients[1].displayName,
    );
    expect(requests).toEqual(afterLoad);

    const closed = workspace.getByRole('checkbox');
    await closed.focus();
    await closed.press('Space');
    await expect(closed).toBeChecked();
    await expect(list.getByRole('button')).toHaveCount(3);
    await expect(closed).toBeFocused();
    await page.screenshot({
      path: testInfo.outputPath(`romanian-project-filter-${locale}.png`),
      fullPage: true,
    });
    await closed.press('Space');
    await expect(closed).not.toBeChecked();
    await expect(list.getByRole('button')).toHaveCount(2);
    await expect(search).toHaveValue('  STEFAN  ');
    expect(requests).toEqual(afterLoad);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await closed.evaluate((node) => getComputedStyle(node).outlineStyle),
    ).not.toBe('none');
  }

  await search.fill('И');
  await expect(list.getByRole('button')).toHaveCount(1);
  await expect(list.getByRole('button')).toContainText('Проект и');
  await search.fill('и\u0306');
  await expect(list.getByRole('button')).toHaveCount(1);
  await expect(list.getByRole('button')).toContainText('Проект й');
  await search.fill('');
  await expect(list.getByRole('button')).toHaveCount(4);
  expect(requests).toEqual(afterLoad);
  await list.getByRole('button').first().click();
  await expect(
    workspace.getByRole('heading', { name: first.title, exact: true }),
  ).toBeVisible();
  expect(
    requests.filter((request) => request === `GET /api/projects/${first.id}`),
  ).toHaveLength(1);
  expect(requests.every((request) => request.startsWith('GET '))).toBe(true);
});

async function navigation(
  page: Page,
  projectName: string,
  action: 'open' | 'close',
) {
  if (projectName !== 'narrow') return;
  await page
    .getByRole('button', {
      name:
        action === 'open'
          ? /Deschideți navigarea|Открыть навигацию|Ouvrir la navigation|Open navigation/u
          : /Închideți navigarea|Закрыть навигацию|Fermer la navigation|Close navigation/u,
    })
    .click();
}
