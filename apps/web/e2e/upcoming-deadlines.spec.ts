import { expect, test, type Locator, type Page } from '@playwright/test';

// Real App with HTTP boundary doubles; separate acceptance file owns live PG proof.
test.use({ timezoneId: 'America/New_York' });
const locales = [
  {
    code: 'ro',
    name: 'Română',
    title: 'Termenele mele apropiate',
    open: 'Afișați termenele mele apropiate',
    close: 'Închideți termenele mele apropiate',
    next: 'Pagina următoare',
    previous: 'Pagina anterioară',
    date: '27 sept. 2026',
  },
  {
    code: 'ru',
    name: 'Русский',
    title: 'Мои ближайшие сроки',
    open: 'Показать мои ближайшие сроки',
    close: 'Закрыть мои ближайшие сроки',
    next: 'Следующая страница',
    previous: 'Предыдущая страница',
    date: '27 сент. 2026 г.',
  },
  {
    code: 'fr',
    name: 'Français',
    title: 'Mes prochaines échéances',
    open: 'Afficher mes prochaines échéances',
    close: 'Fermer mes prochaines échéances',
    next: 'Page suivante',
    previous: 'Page précédente',
    date: '27 sept. 2026',
  },
  {
    code: 'en',
    name: 'English',
    title: 'My upcoming deadlines',
    open: 'Show my upcoming deadlines',
    close: 'Close my upcoming deadlines',
    next: 'Next page',
    previous: 'Previous page',
    date: 'Sep 27, 2026',
  },
];
const company = {
  id: 'upcoming-company',
  displayName: 'PRISMA-PRIM — Société / Компания / Știință',
};
const author = {
  internalUserId: 'ada-upcoming',
  workspaceMembershipId: 'upcoming-member',
  displayName: 'Ada Ionescu',
};
const project = {
  id: 'upcoming-project',
  companyId: company.id,
  clientAccountId: 'upcoming-client',
  clientDossierId: 'upcoming-client',
  clientDisplayName: 'Client {literal} — Știință / Клиент / Société',
  title: 'Preparation {literal} — documentation / Подготовка / Pregătire',
  status: 'preparatory',
  createdAt: '2026-09-19T08:00:00.000Z',
};
const title = (index: number) =>
  `Task ${String(index).padStart(2, '0')} — Literal / Sarcină / Задача / Tâche`;
function task(index: number) {
  return {
    id: `upcoming-task-${String(index).padStart(2, '0')}`,
    title: title(index),
    companyId: company.id,
    projectId: project.id,
    clientAccountId: project.clientAccountId,
    assignee: {
      workspaceMembershipId: author.workspaceMembershipId,
      displayLabel: 'Ada Ionescu',
    },
    dueDate: index === 25 ? '2026-10-04' : '2026-09-27',
    priority: 'important',
    status: 'todo',
    completion: null,
    version: 1,
    createdAt: '2026-09-19T09:00:00.000Z',
    updatedAt: '2026-09-19T09:00:00.000Z',
    createdBy: author,
    project: {
      id: project.id,
      title: project.title,
      clientDisplayName: project.clientDisplayName,
    },
  };
}
async function installServer(page: Page) {
  const requests: string[] = [];
  const pages: number[] = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    requests.push(`${request.method()} ${url.pathname}${url.search}`);
    let value: unknown;
    if (url.pathname === '/api/access/current-actor')
      value = {
        ...author,
        workspaceId: 'upcoming-workspace',
        workspaceName: 'Workspace',
        email: 'ada@example.test',
        active: true,
        workspacePermissions: [],
        activeCompany: {
          ...company,
          clientPermissions: ['client.read'],
          clientPermissionAssignmentId: 'client-grant',
          clientPermissionSetVersion: 'v1',
          projectPermissions: ['project.read'],
          taskPermissions: ['task.read'],
          taskPermissionAssignmentId: 'task-grant',
          taskPermissionSetVersion: 'v1',
        },
      };
    else if (url.pathname === '/api/companies') value = [company];
    else if (url.pathname === '/api/activity-log') value = { events: [] };
    else if (url.pathname === '/api/operational-home')
      value = {
        companyId: company.id,
        today: '2026-09-27',
        summaries: [{ kind: 'overdue_tasks', count: 0 }],
        attention: {
          matchingCount: 1,
          tasks: [{ ...task(0), rules: ['due_soon'], dueInDays: 0 }],
        },
      };
    else if (url.pathname === '/api/due-soon-tasks') {
      const offset = Number(url.searchParams.get('offset') ?? 0);
      pages.push(offset);
      value = {
        companyId: company.id,
        today: '2026-09-27',
        throughDate: '2026-10-04',
        total: 26,
        offset,
        pageSize: 25,
        tasks: Array.from(
          { length: Math.min(25, Math.max(0, 26 - offset)) },
          (_, index) => task(offset + index),
        ),
      };
    } else if (url.pathname === '/api/projects') value = [project];
    else if (url.pathname === `/api/projects/${project.id}`) value = project;
    else if (url.pathname === `/api/projects/${project.id}/tasks`)
      value = {
        mutable: true,
        tasks: Array.from({ length: 26 }, (_, index) => task(index)),
      };
    else if (url.pathname === `/api/tasks/upcoming-task-25`)
      value = { mutable: true, task: task(25) };
    else if (url.pathname.endsWith('/history')) value = { events: [] };
    else if (url.pathname.endsWith('/eligible-task-assignees'))
      value = { members: [] };
    else if (url.pathname === '/api/assigned-tasks') value = { tasks: [] };
    else if (url.pathname === '/api/clients') value = [];
    else {
      await route.fulfill({ status: 404, json: {} });
      return;
    }
    await route.fulfill({ status: 200, json: value });
  });
  return { requests, pages };
}
async function chooseLanguage(page: Page, name: string) {
  const selector = page.getByRole('combobox', {
    name: /^(?:Interface language|Limba interfeței|Язык интерфейса|Langue de l’interface)$/u,
  });
  await selector.focus();
  await selector.press('Enter');
  await page.getByRole('option', { name, exact: true }).click();
  await expect(selector).toBeFocused();
}
async function fit(page: Page, region: Locator) {
  await expect(region).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(
    await region.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
}
for (const frame of ['prisme', 'classic'])
  for (const locale of locales) {
    test(`browses all upcoming deadlines in ${locale.code} with ${frame} and preserves locale-only state`, async ({
      page,
    }, testInfo) => {
      await page.addInitScript(
        (code) => localStorage.setItem('prisma-prim.interface-locale', code),
        locale.code,
      );
      const api = await installServer(page);
      // Home's current-authority read must settle before checking its lazy action.
      await Promise.all([
        page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === '/api/operational-home',
        ),
        page.goto(frame === 'classic' ? '/?frame=classic' : '/'),
      ]);
      const trigger = page.getByRole('button', {
        name: locale.open,
        exact: true,
      });
      await expect(trigger).toBeVisible();
      expect(api.pages).toEqual([]);
      if (frame === 'prisme' && locale.code === 'en')
        await page.screenshot({
          path: testInfo.outputPath('upcoming-prisme-home-entry.png'),
          fullPage: true,
        });
      await trigger.focus();
      await trigger.press('Enter');
      const panel = page.getByRole('region', {
        name: `${locale.title} — ${company.displayName}`,
        exact: true,
      });
      await expect(panel.getByRole('listitem')).toHaveCount(25);
      await expect(panel.getByRole('heading', { level: 4 })).toBeFocused();
      await expect(panel.locator('time').first()).toHaveAttribute(
        'datetime',
        '2026-09-27',
      );
      await expect(panel.locator('time').first()).toHaveText(locale.date);
      await expect(panel).toContainText(project.title);
      await expect(panel).toContainText(project.clientDisplayName);
      await expect(
        panel.getByRole('button', { name: locale.previous, exact: true }),
      ).toBeDisabled();
      await fit(page, panel);
      await panel.screenshot({
        path: testInfo.outputPath(
          `upcoming-${frame}-${locale.code}-full-page.png`,
        ),
      });
      await panel
        .getByRole('button', { name: locale.next, exact: true })
        .focus();
      await page.keyboard.press('Enter');
      await expect(panel.getByRole('listitem')).toHaveCount(1);
      await expect(
        panel.getByRole('heading', { name: title(25), exact: true }),
      ).toBeVisible();
      await expect(
        panel.getByRole('button', { name: locale.next, exact: true }),
      ).toBeDisabled();
      await expect(
        panel.getByRole('button', { name: locale.previous, exact: true }),
      ).toBeEnabled();
      const last = await panel.getByRole('listitem').elementHandle();
      if (last === null) throw new Error('Expected last Task row');
      const before = api.requests.length;
      const previousUrl = page.url();
      const alternate = locale.code === 'fr' ? 'English' : 'Français';
      await chooseLanguage(page, alternate);
      await chooseLanguage(page, locale.name);
      expect(api.requests).toHaveLength(before);
      expect(api.pages).toEqual([0, 25]);
      expect(page.url()).toBe(previousUrl);
      expect(
        await panel
          .getByRole('listitem')
          .evaluate((element, original) => element === original, last),
      ).toBe(true);
      await fit(page, panel);
      await panel.screenshot({
        path: testInfo.outputPath(
          `upcoming-${frame}-${locale.code}-last-page.png`,
        ),
      });
      await panel
        .getByRole('button', { name: locale.close, exact: true })
        .focus();
      await page.keyboard.press('Enter');
      await expect(panel).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await trigger.press('Enter');
      await expect(panel.getByRole('listitem')).toHaveCount(25);
      await panel
        .getByRole('button', { name: locale.next, exact: true })
        .focus();
      await page.keyboard.press('Enter');
      await expect(panel.getByRole('listitem')).toHaveCount(1);
      await panel.getByRole('listitem').getByRole('button').click();
      await expect(
        page
          .locator('.project-tasks')
          .getByRole('heading', { name: title(25), exact: true }),
      ).toBeVisible();
      expect(page.url()).not.toContain(project.id);
      expect(page.url()).not.toContain('upcoming-task-25');
      expect(api.pages).toEqual([0, 25, 0, 25]);
      await fit(page, page.locator('.project-tasks'));
    });
  }
