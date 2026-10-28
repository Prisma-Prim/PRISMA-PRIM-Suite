import { expect, test, type Locator, type Page } from '@playwright/test';
import { selectOption, expectValue } from './select-option';
import {
  actorContextFixture,
  operationalHomeFixture,
  preparatoryLifecycle,
  unassignedResponsibility,
} from './actor-context.fixture';
import type { TaskEvent, TaskView } from '../src/project/task-response';

const languages = [
  {
    code: 'ro',
    title: 'Sarcini',
    titleLabel: 'Titlul Sarcinii',
    create: 'Creați Sarcina',
    save: 'Salvați Sarcina',
    search: 'Căutați Sarcini',
    status: 'Starea Sarcinii',
    assigneeFilter: 'Responsabilul Sarcinii',
    dateFilter: 'Filtrul de dată al Sarcinilor',
    from: 'Data Sarcinii de la',
    through: 'Data Sarcinii până la',
    assignee: 'Responsabil',
    due: 'Termen',
    priority: 'Prioritate',
    critical: 'Critică',
    unassigned: 'Neatribuită',
    noDate: 'Fără termen',
    block: 'Marcați blocată',
    reason: 'Motivul blocării',
    saveReason: 'Salvați blocarea',
    reasonError: 'Introduceți un motiv de 1–500 de caractere.',
    progress: 'Marcați în desfășurare',
    complete: 'Marcați încheiată',
    reopen: 'Redeschideți Sarcina',
    reload: 'Reîncărcați Sarcina',
    history: 'Istoricul Sarcinii',
    created: 'Sarcină creată',
    edited: 'Sarcină editată',
    statusChanged: 'Stare schimbată',
    completed: 'Încheiere declarată',
    reopened: 'Sarcină redeschisă',
    uncertain:
      'Rezultatul nu este confirmat. Reîncercați aceeași modificare pentru a recupera în siguranță rezultatul înregistrat.',
    retry: 'Reîncercați modificarea în așteptare a Sarcinii',
    warning:
      'Sarcini de pregătire manuală. Fiecare stare consemnează o declarație; nu autorizează începerea unei misiuni reale.',
    noMatch: 'Nicio Sarcină nu corespunde filtrelor curente.',
    date: '31 dec. 99',
  },
  {
    code: 'ru',
    title: 'Задачи',
    titleLabel: 'Название Задачи',
    create: 'Создать Задачу',
    save: 'Сохранить Задачу',
    search: 'Поиск Задач',
    status: 'Состояние Задачи',
    assigneeFilter: 'Ответственный за Задачу',
    dateFilter: 'Фильтр дат Задач',
    from: 'Дата Задачи с',
    through: 'Дата Задачи по',
    assignee: 'Ответственный',
    due: 'Срок',
    priority: 'Приоритет',
    critical: 'Критический',
    unassigned: 'Без ответственного',
    noDate: 'Без срока',
    block: 'Заблокировать',
    reason: 'Причина блокировки',
    saveReason: 'Сохранить блокировку',
    reasonError: 'Введите причину длиной 1–500 символов.',
    progress: 'Отметить в работе',
    complete: 'Отметить выполненной',
    reopen: 'Открыть Задачу повторно',
    reload: 'Перезагрузить Задачу',
    history: 'История Задачи',
    created: 'Задача создана',
    edited: 'Задача изменена',
    statusChanged: 'Состояние изменено',
    completed: 'Выполнение объявлено',
    reopened: 'Задача открыта повторно',
    uncertain:
      'Результат не подтверждён. Повторите то же изменение, чтобы безопасно получить зарегистрированный результат.',
    retry: 'Повторить ожидающее изменение Задачи',
    warning:
      'Задачи ручной подготовки. Каждое состояние фиксирует заявление; оно не разрешает начинать реальную работу.',
    noMatch: 'Нет Задач, соответствующих текущим фильтрам.',
    date: '31 дек. 99 г.',
  },
  {
    code: 'fr',
    title: 'Tâches',
    titleLabel: 'Titre de la Tâche',
    create: 'Créer la Tâche',
    save: 'Enregistrer la Tâche',
    search: 'Rechercher des Tâches',
    status: 'État de la Tâche',
    assigneeFilter: 'Responsable de la Tâche',
    dateFilter: 'Filtre de date des Tâches',
    from: 'Date de la Tâche à partir du',
    through: 'Date de la Tâche jusqu’au',
    assignee: 'Responsable',
    due: 'Échéance',
    priority: 'Priorité',
    critical: 'Critique',
    unassigned: 'Non attribuée',
    noDate: 'Sans échéance',
    block: 'Marquer bloquée',
    reason: 'Motif du blocage',
    saveReason: 'Enregistrer le blocage',
    reasonError: 'Saisissez un motif de 1 à 500 caractères.',
    progress: 'Marquer en cours',
    complete: 'Marquer terminée',
    reopen: 'Rouvrir la Tâche',
    reload: 'Recharger la Tâche',
    history: 'Historique de la Tâche',
    created: 'Tâche créée',
    edited: 'Tâche modifiée',
    statusChanged: 'État modifié',
    completed: 'Achèvement déclaré',
    reopened: 'Tâche rouverte',
    uncertain:
      'Le résultat n’est pas confirmé. Réessayez la même modification pour retrouver son résultat enregistré en toute sécurité.',
    retry: 'Réessayer la modification de Tâche en attente',
    warning:
      'Tâches de préparation manuelle. Chaque état consigne une déclaration ; il n’autorise pas le démarrage d’une mission réelle.',
    noMatch: 'Aucune Tâche ne correspond aux filtres actuels.',
    date: '31 déc. 99',
  },
  {
    code: 'en',
    title: 'Tasks',
    titleLabel: 'Task title',
    create: 'Create Task',
    save: 'Save Task',
    search: 'Search Tasks',
    status: 'Task status',
    assigneeFilter: 'Task responsible member',
    dateFilter: 'Task date filter',
    from: 'Task date from',
    through: 'Task date through',
    assignee: 'Responsible member',
    due: 'Due date',
    priority: 'Priority',
    critical: 'Critical',
    unassigned: 'Unassigned',
    noDate: 'No due date',
    block: 'Mark blocked',
    reason: 'Blockage reason',
    saveReason: 'Save blockage',
    reasonError: 'Enter a reason of 1–500 characters.',
    progress: 'Mark in progress',
    complete: 'Mark done',
    reopen: 'Reopen Task',
    reload: 'Reload Task',
    history: 'Task history',
    created: 'Task created',
    edited: 'Task edited',
    statusChanged: 'Status changed',
    completed: 'Completion declared',
    reopened: 'Task reopened',
    uncertain:
      'The result is not confirmed. Retry the same change to safely recover its recorded result.',
    retry: 'Retry pending Task change',
    warning:
      'Manual preparation Tasks. Each state records a declaration; it does not authorize a real engagement to start.',
    noMatch: 'No Tasks match the current filters.',
    date: 'Dec 31, 99',
  },
] as const;

for (const language of languages) {
  test(`manages the complete Project Task journey in ${language.code} with literal drafts, exact retry and current-language late feedback`, async ({
    page,
  }, testInfo) => {
    const narrow = testInfo.project.name === 'narrow';
    const fixture = await installTasks(page);
    await page.goto('/#projects');
    if (narrow)
      await page.getByRole('button', { name: 'Open navigation' }).click();
    await selectOption(
      page.getByRole('combobox', { name: 'Active Company', exact: true }),
      'task-company',
    );
    if (narrow)
      await page.getByRole('button', { name: 'Close navigation' }).click();
    if (narrow)
      await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.getByRole('link', { name: 'Projects', exact: true }).click();
    await page
      .getByRole('button', {
        name: 'Pregătire {literal} — Projet Client: Client {original} — Клиент',
        exact: true,
      })
      .click();
    const tasks = page.locator('.project-tasks').filter({ visible: true });
    await expect(
      tasks.getByRole('button', { name: 'Create Task', exact: true }),
    ).toBeEnabled();
    const count = fixture.requests.length;
    await switchLanguage(page, language.code);
    expect(fixture.requests).toHaveLength(count);
    await expect(
      page.getByRole('tab', { name: language.title, exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(tasks.getByText(language.warning)).toBeVisible();
    // Find and filter the real list before creating an optional unassigned, undated Task.
    await tasks
      .getByRole('searchbox', { name: language.search, exact: true })
      .fill('absent {literal}');
    await expect(tasks.getByText(language.noMatch)).toBeVisible();
    await tasks
      .getByRole('searchbox', { name: language.search, exact: true })
      .fill('');
    await tasks
      .getByRole('textbox', { name: language.titleLabel, exact: true })
      .fill(fixture.originalTitle);
    const create = tasks.getByRole('button', {
      name: language.create,
      exact: true,
    });
    await create.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(create).toBeFocused();
    await expectVisibleFocus(create);
    await page.keyboard.press('Enter');
    await expect(
      tasks.getByRole('heading', { name: fixture.originalTitle, exact: true }),
    ).toBeVisible();
    await expect(
      tasks
        .locator('.task-facts > div')
        .filter({ has: page.getByText(language.assignee, { exact: true }) })
        .getByRole('definition'),
    ).toHaveText(language.unassigned);
    await expect(
      tasks
        .locator('.task-facts > div')
        .filter({ has: page.getByText(language.due, { exact: true }) })
        .getByRole('definition'),
    ).toHaveText(language.noDate);
    await tasks
      .getByRole('textbox', { name: language.titleLabel, exact: true })
      .fill(fixture.editedTitle);
    await selectOption(
      tasks
        .locator('form')
        .getByRole('combobox', { name: language.assignee, exact: true }),
      fixture.member.workspaceMembershipId,
    );
    await tasks.getByLabel(language.due, { exact: true }).fill('0099-12-31');
    await selectOption(
      tasks
        .locator('form')
        .getByRole('combobox', { name: language.priority, exact: true }),
      'critical',
    );
    await tasks
      .getByRole('searchbox', { name: language.search, exact: true })
      .fill('Chestionar');
    await selectOption(
      tasks.getByRole('combobox', { name: language.status, exact: true }),
      'todo',
    );
    await selectOption(
      tasks.getByRole('combobox', { name: language.dateFilter, exact: true }),
      'range',
    );
    await tasks.getByLabel(language.from, { exact: true }).fill('0001-01-01');
    await tasks
      .getByLabel(language.through, { exact: true })
      .fill('9999-12-31');
    const beforeDraftSwitch = fixture.requests.length;
    const alternate = language.code === 'fr' ? languages[1] : languages[2];
    await switchLanguage(page, alternate.code);
    await expect(
      tasks.getByRole('textbox', { name: alternate.titleLabel, exact: true }),
    ).toHaveValue(fixture.editedTitle);
    await expect(tasks.getByLabel(alternate.due, { exact: true })).toHaveValue(
      '0099-12-31',
    );
    await expectValue(
      tasks
        .locator('form')
        .getByRole('combobox', { name: alternate.assignee, exact: true }),
      fixture.member.workspaceMembershipId,
    );
    await expectValue(
      tasks
        .locator('form')
        .getByRole('combobox', { name: alternate.priority, exact: true }),
      'critical',
    );
    await expect(
      tasks.getByRole('searchbox', { name: alternate.search, exact: true }),
    ).toHaveValue('Chestionar');
    await expect(tasks.getByLabel(alternate.from, { exact: true })).toHaveValue(
      '0001-01-01',
    );
    await expect(
      tasks.getByLabel(alternate.through, { exact: true }),
    ).toHaveValue('9999-12-31');
    expect(fixture.requests).toHaveLength(beforeDraftSwitch);
    await switchLanguage(page, language.code);
    expect(fixture.requests).toHaveLength(beforeDraftSwitch);
    await tasks
      .getByRole('button', { name: language.save, exact: true })
      .click();
    await expect(
      tasks.getByRole('heading', { name: fixture.editedTitle, exact: true }),
    ).toBeVisible();
    await expect(tasks.locator('.task-facts time')).toHaveAttribute(
      'datetime',
      '0099-12-31',
    );
    await expect(tasks.locator('.task-facts time')).toHaveText(language.date);
    await expect(tasks.locator('.task-facts')).toContainText(
      fixture.member.displayLabel,
    );
    await expect(tasks.locator('.task-facts')).toContainText(language.critical);
    await tasks
      .getByRole('button', { name: language.block, exact: true })
      .click();
    const saveReason = tasks.getByRole('button', {
      name: language.saveReason,
      exact: true,
    });
    await saveReason.focus();
    await page.keyboard.press('Enter');
    const reason = tasks.getByRole('textbox', {
      name: language.reason,
      exact: true,
    });
    await expect(reason).toHaveAttribute('aria-invalid', 'true');
    await expect(reason).toHaveAccessibleDescription(language.reasonError);
    const validationCount = fixture.requests.length;
    await switchLanguage(page, alternate.code);
    await expect(
      tasks.getByRole('textbox', { name: alternate.reason, exact: true }),
    ).toHaveAccessibleDescription(alternate.reasonError);
    expect(fixture.requests).toHaveLength(validationCount);
    await tasks
      .getByRole('textbox', { name: alternate.reason, exact: true })
      .fill(fixture.reason);
    await switchLanguage(page, language.code);
    await expect(
      tasks.getByRole('textbox', { name: language.reason, exact: true }),
    ).toHaveValue(fixture.reason);
    expect(fixture.requests).toHaveLength(validationCount);
    await tasks
      .getByRole('button', { name: language.saveReason, exact: true })
      .click();
    await expect
      .poll(
        () =>
          fixture.commands.filter((command) => command.path.endsWith('/status'))
            .length,
      )
      .toBe(1);
    const pendingCount = fixture.requests.length;
    await switchLanguage(page, alternate.code);
    expect(fixture.requests).toHaveLength(pendingCount);
    fixture.finishBlockedResponse();
    await expect(tasks.getByText(alternate.uncertain)).toBeVisible();
    await switchLanguage(page, language.code);
    await expect(tasks.getByText(language.uncertain)).toBeVisible();
    expect(fixture.requests).toHaveLength(pendingCount);
    await tasks.scrollIntoViewIfNeeded();
    await tasks.screenshot({
      path: testInfo.outputPath(
        `project-tasks-${language.code}-${testInfo.project.name}-uncertain.png`,
      ),
    });
    await strictFit(page, tasks);
    await tasks
      .getByRole('button', { name: language.retry, exact: true })
      .click();
    await expect(tasks.locator('.task-facts--declaration')).toContainText(
      fixture.reason,
    );
    await expect(
      tasks.getByRole('button', { name: language.progress, exact: true }),
    ).toBeEnabled();
    const blockCommands = fixture.commands.filter((command) =>
      command.path.endsWith('/status'),
    );
    expect(blockCommands).toHaveLength(2);
    expect(blockCommands[1]).toEqual(blockCommands[0]);
    expect(blockCommands[0]).toMatchObject({
      method: 'POST',
      company: 'task-company',
      body: JSON.stringify({
        expectedVersion: 2,
        status: 'blocked',
        reason: fixture.reason,
      }),
    });
    await tasks
      .getByRole('button', { name: language.progress, exact: true })
      .click();
    const resumedLabels = {
      ro: 'În desfășurare',
      ru: 'В работе',
      fr: 'En cours',
      en: 'In progress',
    };
    await expect(tasks.locator('.task-panel > .task-status')).toHaveText(
      resumedLabels[language.code],
    );
    await expect(
      tasks.getByRole('button', { name: language.complete, exact: true }),
    ).toBeEnabled();
    await tasks
      .getByRole('button', { name: language.complete, exact: true })
      .click();
    await expect(
      tasks.getByRole('button', { name: language.reopen, exact: true }),
    ).toBeEnabled();
    await expect(
      tasks.getByRole('textbox', { name: language.titleLabel, exact: true }),
    ).toHaveCount(0);
    await tasks
      .getByRole('button', { name: language.reopen, exact: true })
      .click();
    await expect(
      tasks.getByRole('button', { name: language.save, exact: true }),
    ).toBeEnabled();
    const readsBeforeReload = fixture.requests.filter(
      (request) => request === 'GET /api/tasks/localized-task',
    ).length;
    await tasks
      .getByRole('button', { name: language.reload, exact: true })
      .click();
    await expect
      .poll(
        () =>
          fixture.requests.filter(
            (request) => request === 'GET /api/tasks/localized-task',
          ).length,
      )
      .toBe(readsBeforeReload + 1);
    await expect(
      tasks.getByRole('button', { name: language.save, exact: true }),
    ).toBeEnabled();
    const history = tasks.getByRole('region', {
      name: language.history,
      exact: true,
    });
    for (const label of [
      language.created,
      language.edited,
      language.completed,
      language.reopened,
    ])
      await expect(history.getByText(label, { exact: true })).toBeVisible();
    await expect(
      history.getByText(language.statusChanged, { exact: true }),
    ).toHaveCount(2);
    await expect(history).toContainText(fixture.originalTitle);
    await expect(history).toContainText(fixture.editedTitle);
    await expect(history).toContainText(fixture.reason);
    await expect(history).toContainText(fixture.member.displayLabel);
    await expect(history).toContainText(actorContextFixture.displayName);
    expect(fixture.events.map((event) => event.action)).toEqual([
      'task.created',
      'task.updated',
      'task.status.changed',
      'task.status.changed',
      'task.completed',
      'task.reopened',
    ]);
    expect(
      fixture.events.filter(
        (event) =>
          event.action === 'task.status.changed' &&
          event.metadata.after === 'blocked',
      ),
    ).toHaveLength(1);
    expect(
      fixture.requests.filter(
        (request) =>
          /^(POST|PATCH|PUT|DELETE) /u.test(request) &&
          !request.includes('/tasks'),
      ),
    ).toEqual([]);
    await expect(page.locator('.project-lifecycle')).toContainText(
      language.code === 'ro'
        ? 'În pregătire'
        : language.code === 'ru'
          ? 'Подготовительный'
          : language.code === 'fr'
            ? 'Préparatoire'
            : 'Preparatory',
    );
    await tasks.scrollIntoViewIfNeeded();
    await tasks.screenshot({
      path: testInfo.outputPath(
        `project-tasks-${language.code}-${testInfo.project.name}-history.png`,
      ),
    });
    await strictFit(page, tasks);
  });
}

async function switchLanguage(page: Page, code: string) {
  const control = page.locator('#interface-locale');
  await control.focus();
  await page.keyboard.press('Enter');
  await page
    .getByRole('listbox')
    .getByRole('option')
    .filter({
      hasText:
        code === 'ro'
          ? 'Română'
          : code === 'ru'
            ? 'Русский'
            : code === 'fr'
              ? 'Français'
              : 'English',
    })
    .click();
  await expect(control).toHaveAttribute('data-value', code);
}
async function expectVisibleFocus(control: Locator) {
  expect(
    await control.evaluate((element) => {
      const style = getComputedStyle(element);
      return (
        element.matches(':focus-visible') &&
        style.outlineStyle !== 'none' &&
        parseFloat(style.outlineWidth) > 0
      );
    }),
  ).toBe(true);
}
async function strictFit(page: Page, tasks: Locator) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(
    await tasks.evaluate((element) =>
      Array.from(
        element.querySelectorAll<HTMLElement>(
          '.task-layout, .task-panel, .task-filters, .task-facts, .task-history, form, .shared-select__trigger',
        ),
      ).every((child) => child.scrollWidth <= child.clientWidth + 1),
    ),
  ).toBe(true);
}

type ObservedCommand = {
  path: string;
  method: string;
  company: string | undefined;
  key: string | undefined;
  body: string | null;
};
async function installTasks(page: Page) {
  const company = { id: 'task-company', displayName: 'PRISMA-PRIM' };
  const client = {
    id: 'task-client',
    displayName: 'Client {original} — Клиент',
    relatedToActiveCompany: true,
  };
  const project = {
    id: 'task-project',
    companyId: company.id,
    clientAccountId: client.id,
    clientDisplayName: client.displayName,
    title: 'Pregătire {literal} — Projet',
    status: 'preparatory',
    createdAt: '2026-10-18T12:00:00.000Z',
  };
  const attribution = {
    internalUserId: actorContextFixture.internalUserId,
    workspaceMembershipId: actorContextFixture.workspaceMembershipId,
    displayName: actorContextFixture.displayName,
  };
  const member = {
    workspaceMembershipId: 'eligible-member',
    displayLabel: 'Responsabil {literal} — Ответственный aux libellés longs',
  };
  const originalTitle =
    'Chestionar {inițial} — Проверка des documents de préparation';
  const editedTitle =
    'Chestionar {corectat} — Проверка des documents de préparation';
  const reason =
    'Așteptăm {literal} — Причина : confirmation détaillée du périmètre de la préparation';
  const seed: TaskView = {
    description: null,
    id: 'seed-task',
    companyId: company.id,
    projectId: project.id,
    clientAccountId: client.id,
    title: 'Existing Task {literal}',
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
  let current: TaskView | null = null;
  const events: TaskEvent[] = [];
  const receipts = new Map<string, TaskView>();
  const requests: string[] = [];
  const commands: ObservedCommand[] = [];
  let finishBlockedResponse = () => {};
  const blockedResponse = new Promise<void>((resolve) => {
    finishBlockedResponse = resolve;
  });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    requests.push(`${request.method()} ${path}`);
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
                  taskPermissionAssignmentId: 'task-manager-grant',
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
      return route.fulfill({ json: { events } });
    if (path === '/api/projects') return route.fulfill({ json: [project] });
    if (path === `/api/projects/${project.id}`)
      return route.fulfill({ json: project });
    if (path.endsWith('/responsible'))
      return route.fulfill({ json: unassignedResponsibility });
    if (path.endsWith('/lifecycle'))
      return route.fulfill({ json: preparatoryLifecycle });
    if (path.endsWith('/eligible-task-assignees'))
      return route.fulfill({ json: { members: [member] } });
    if (!path.includes('/tasks')) return route.fulfill({ status: 403 });
    expect(request.headers()['x-company-context-id']).toBe(company.id);
    if (request.method() === 'POST' || request.method() === 'PATCH') {
      const key = request.headers()['idempotency-key'];
      expect(key).toBeTruthy();
      if (!key) throw new Error('Missing Task command identity');
      commands.push({
        path,
        method: request.method(),
        company: request.headers()['x-company-context-id'],
        key,
        body: request.postData(),
      });
      const receipt = receipts.get(key);
      if (receipt) return route.fulfill({ json: receipt });
      const body: unknown = request.postDataJSON();
      if (!isRecord(body)) throw new Error('Expected canonical Task command');
      const target = {
        type: 'task',
        taskId: 'localized-task',
        taskTitle:
          typeof body.title === 'string'
            ? body.title
            : (current?.title ?? originalTitle),
        companyId: company.id,
      } as const;
      const base = {
        id: `event-${events.length + 1}`,
        actor: attribution,
        occurredAt: project.createdAt,
        target,
      };
      if (!current) {
        expect(body).toEqual({
          title: originalTitle,
          assigneeMembershipId: null,
          dueDate: null,
          priority: 'normal',
        });
        current = { ...seed, id: 'localized-task', title: originalTitle };
        events.push({
          ...base,
          action: 'task.created',
          metadata: {
            version: 1,
            initial: {
              title: originalTitle,
              assignee: null,
              dueDate: null,
              priority: 'normal',
            },
          },
        });
      } else if (request.method() === 'PATCH') {
        expect(body).toEqual({
          expectedVersion: 1,
          title: editedTitle,
          assigneeMembershipId: member.workspaceMembershipId,
          dueDate: '0099-12-31',
          priority: 'critical',
        });
        current = {
          ...current,
          title: editedTitle,
          assignee: member,
          dueDate: '0099-12-31',
          priority: 'critical',
          version: 2,
        };
        events.push({
          ...base,
          action: 'task.updated',
          metadata: {
            version: 2,
            changes: {
              title: { before: originalTitle, after: editedTitle },
              assignee: { before: null, after: member },
              dueDate: { before: null, after: '0099-12-31' },
              priority: { before: 'normal', after: 'critical' },
            },
          },
        });
      } else if (path.endsWith('/status')) {
        if (current.status !== 'todo' && current.status !== 'blocked')
          throw new Error('Unexpected status source');
        const before = current.status;
        const version = current.version + 1;
        if (body.status === 'blocked') {
          expect(body).toEqual({
            expectedVersion: 2,
            status: 'blocked',
            reason,
          });
          current = {
            ...current,
            status: 'blocked',
            completion: null,
            blockage: {
              actor: attribution,
              occurredAt: project.createdAt,
              reason,
            },
            version,
          };
          events.push({
            ...base,
            action: 'task.status.changed',
            metadata: { version, before, after: 'blocked', reason },
          });
          receipts.set(key, current);
          await blockedResponse;
          return route.abort('connectionfailed');
        }
        expect(body).toEqual({ expectedVersion: 3, status: 'in_progress' });
        current = {
          ...current,
          status: 'in_progress',
          completion: null,
          version,
        };
        events.push({
          ...base,
          action: 'task.status.changed',
          metadata: { version, before, after: 'in_progress', reason: null },
        });
      } else if (path.endsWith('/complete')) {
        if (current.status !== 'in_progress')
          throw new Error('Expected resumed Task');
        expect(body).toEqual({ expectedVersion: 4 });
        current = {
          ...current,
          status: 'done',
          completion: { actor: attribution, occurredAt: project.createdAt },
          version: 5,
        };
        events.push({
          ...base,
          action: 'task.completed',
          metadata: { version: 5, before: 'in_progress', after: 'done' },
        });
      } else {
        expect(path).toBe('/api/tasks/localized-task/reopen');
        expect(body).toEqual({ expectedVersion: 5 });
        current = { ...current, status: 'todo', completion: null, version: 6 };
        events.push({
          ...base,
          action: 'task.reopened',
          metadata: { version: 6, before: 'done', after: 'todo' },
        });
      }
      receipts.set(key, current);
      return route.fulfill({ json: current });
    }
    if (path === `/api/projects/${project.id}/tasks`)
      return route.fulfill({
        json: { mutable: true, tasks: current ? [seed, current] : [seed] },
      });
    if (path.endsWith('/history')) return route.fulfill({ json: { events } });
    return route.fulfill({ json: { mutable: true, task: current } });
  });
  return {
    member,
    originalTitle,
    editedTitle,
    reason,
    requests,
    commands,
    events,
    finishBlockedResponse,
  };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
