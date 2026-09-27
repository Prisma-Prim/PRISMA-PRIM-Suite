import { expect, test, type Page } from '@playwright/test';
import { selectOption } from './select-option';
import {
  actorContextFixture,
  operationalHomeFixture,
  preparatoryLifecycle,
} from './actor-context.fixture';
import type { ProjectLifecycle } from '../src/project/project-lifecycle-response';

const member = {
  workspaceMembershipId: 'project-localization-member',
  displayLabel: 'Ana Șerbănescu {QA} · 3F',
};
const company = {
  id: 'project-localization-company',
  displayName: 'PRISMA-PRIM',
};
const client = {
  id: 'project-localization-client',
  displayName: 'Client Ștefan {Est}',
  relatedToActiveCompany: true,
};
const project = {
  id: 'project-localization-project',
  companyId: company.id,
  clientAccountId: client.id,
  clientDisplayName: client.displayName,
  title: 'Project {literal} — ISO 9001',
  status: 'preparatory' as const,
  createdAt: '2026-09-27T10:00:00.000Z',
};
const exceptionReason = 'Awaiting {signed} Offer from Client Ștefan';
const holdReason = 'Pause {client-requested}';
const completionNote = 'Delivered {unchanged} business content';

test('localizes the complete Project-owned journey and preserves exact retries', async ({
  page,
}, testInfo) => {
  let registered = false;
  let responsibility: {
    responsible: typeof member | null;
    revision: number;
    lastChange: {
      actorDisplayName: string;
      occurredAt: string;
    } | null;
  } = {
    responsible: null,
    revision: 0,
    lastChange: null,
  };
  let lifecycle: ProjectLifecycle = preparatoryLifecycle;
  const registrationRequests: Array<{ body: string | null; key?: string }> = [];
  const responsibilityRequests: Array<{ body: unknown; key?: string }> = [];
  const lifecycleRequests: Array<{ body: unknown; key?: string }> = [];

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const companyContext = request.headers()['x-company-context-id'];
    const currentProject = { ...project, status: lifecycle.status };

    if (path === '/api/access/current-actor')
      return route.fulfill({
        json: {
          ...actorContextFixture,
          workspacePermissions: ['client.manage'],
          ...(companyContext
            ? {
                activeCompany: {
                  ...company,
                  projectPermissions: [
                    'project.read',
                    'project.create',
                    'project.update',
                  ],
                  projectApproverPermissions: [
                    'project.lifecycle.transition',
                    'project.close',
                  ],
                  projectApproverPermissionAssignmentId:
                    'project-localization-approver',
                  projectApproverPermissionSetVersion: 'v1',
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
          open_projects: registered ? 1 : 0,
          overdue_tasks: 0,
        }),
      });
    if (path === '/api/clients') return route.fulfill({ json: [client] });
    if (path === '/api/activity-log')
      return route.fulfill({ json: { events: [] } });
    if (path === '/api/projects' && request.method() === 'POST') {
      registrationRequests.push({
        body: request.postData(),
        ...(request.headers()['idempotency-key']
          ? { key: request.headers()['idempotency-key'] }
          : {}),
      });
      if (registrationRequests.length === 1)
        return route.fulfill({ status: 502 });
      registered = true;
      return route.fulfill({ status: 201, json: currentProject });
    }
    if (path === '/api/projects')
      return route.fulfill({ json: registered ? [currentProject] : [] });
    if (path === `/api/projects/${project.id}`)
      return route.fulfill({ json: currentProject });
    if (path === `/api/projects/${project.id}/responsible`) {
      if (request.method() === 'PUT') {
        const body: unknown = request.postDataJSON();
        responsibilityRequests.push({
          body,
          ...(request.headers()['idempotency-key']
            ? { key: request.headers()['idempotency-key'] }
            : {}),
        });
        responsibility = {
          responsible: member,
          revision: 1,
          lastChange: {
            actorDisplayName: actorContextFixture.displayName,
            occurredAt: '2026-09-27T10:05:00.000Z',
          },
        };
        return route.fulfill({
          json: {
            projectId: project.id,
            outcome: 'changed',
            revision: responsibility.revision,
            responsible: responsibility.responsible,
          },
        });
      }
      return route.fulfill({
        json: { ...responsibility, mutable: lifecycle.mutable },
      });
    }
    if (path === `/api/projects/${project.id}/eligible-responsible-members`)
      return route.fulfill({ json: { members: [member] } });
    if (path === `/api/projects/${project.id}/lifecycle`)
      return route.fulfill({ json: lifecycle });
    if (path === `/api/projects/${project.id}/eligible-start-exception-members`)
      return route.fulfill({ json: { members: [member] } });
    if (
      path === `/api/projects/${project.id}/lifecycle-transitions` &&
      request.method() === 'POST'
    ) {
      const body: unknown = request.postDataJSON();
      lifecycleRequests.push({
        body,
        ...(request.headers()['idempotency-key']
          ? { key: request.headers()['idempotency-key'] }
          : {}),
      });
      const receipt = applyTransition(body);
      return route.fulfill({ json: receipt });
    }
    if (path === `/api/projects/${project.id}/tasks`)
      return route.fulfill({
        json: { mutable: lifecycle.mutable, tasks: [] },
      });
    if (path === `/api/projects/${project.id}/documents`)
      return route.fulfill({
        json: { mutable: lifecycle.mutable, documents: [] },
      });
    if (path === '/api/documents') return route.fulfill({ json: [] });
    return route.fulfill({ status: 404 });
  });

  function applyTransition(body: unknown) {
    if (typeof body !== 'object' || body === null || !('action' in body))
      throw new Error('Unexpected Project lifecycle command');
    const action = body.action;
    const from = lifecycle.status;
    const lifecycleRevision = lifecycle.lifecycleRevision + 1;
    const occurredAt = `2026-09-27T10:1${lifecycleRevision}:00.000Z`;
    const actor = { displayName: actorContextFixture.displayName };
    if (action === 'activate') {
      lifecycle = {
        status: 'active',
        lifecycleRevision,
        mutable: true,
        start: {
          declaredAt: occurredAt,
          declaredBy: actor,
          declaration: {
            approvedOffer: 'missing',
            contractOrPrecontract: 'missing',
            projectPlan: 'present',
            initialDocuments: 'present',
            deadlines: 'present',
            financialConditions: 'present',
            risks: 'present',
          },
          exception: {
            reason: exceptionReason,
            completionResponsible: member,
            completionDueDate: '2026-10-15',
          },
        },
        transitions: [
          {
            action: 'activate',
            lifecycleRevision,
            from: 'preparatory',
            to: 'active',
            occurredAt,
            actor,
            withStartException: true,
          },
        ],
      };
    } else if (action === 'hold') {
      lifecycle = {
        ...lifecycle,
        status: 'on_hold',
        lifecycleRevision,
        transitions: [
          {
            action: 'hold',
            lifecycleRevision,
            from: 'active',
            to: 'on_hold',
            occurredAt,
            actor,
            reason: holdReason,
          },
          ...lifecycle.transitions,
        ],
      };
    } else if (action === 'resume') {
      lifecycle = {
        ...lifecycle,
        status: 'active',
        lifecycleRevision,
        transitions: [
          {
            action: 'resume',
            lifecycleRevision,
            from: 'on_hold',
            to: 'active',
            occurredAt,
            actor,
          },
          ...lifecycle.transitions,
        ],
      };
    } else if (action === 'complete') {
      lifecycle = {
        ...lifecycle,
        status: 'completed',
        lifecycleRevision,
        mutable: false,
        transitions: [
          {
            action: 'complete',
            lifecycleRevision,
            from: 'active',
            to: 'completed',
            occurredAt,
            actor,
            note: completionNote,
          },
          ...lifecycle.transitions,
        ],
      };
    } else throw new Error('Unexpected Project lifecycle action');
    return {
      projectId: project.id,
      action,
      from,
      to: lifecycle.status,
      lifecycleRevision,
    };
  }

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?frame=prisme#projects');
  await openNavigation(page, testInfo.project.name);
  await selectOption(
    page.getByLabel('Active Company', { exact: true }),
    company.id,
  );
  await closeNavigation(page, testInfo.project.name);
  await page.goto('/?frame=prisme#projects');

  const registration = page.locator('form.project-registration');
  await expectNoHorizontalOverflow(page);
  await registration.screenshot({
    path: testInfo.outputPath(
      `projects-localization-en-${testInfo.project.name}.png`,
    ),
  });
  await page.getByLabel('Project title').fill(`  ${project.title}  `);
  await selectOption(page.getByLabel('Client', { exact: true }), client.id);

  await changeLocale(page, testInfo.project.name, 'fr');
  await expect(page.getByLabel('Titre du Projet')).toHaveValue(
    `  ${project.title}  `,
  );
  await expect(page.getByLabel('Client', { exact: true })).toContainText(
    client.displayName,
  );
  await expectNoHorizontalOverflow(page);
  await registration.screenshot({
    path: testInfo.outputPath(
      `projects-localization-fr-${testInfo.project.name}.png`,
    ),
  });
  await page.getByRole('button', { name: 'Créer le Projet' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Le Projet n’a pas pu être chargé ou enregistré.',
  );

  await changeLocale(page, testInfo.project.name, 'ro');
  await expect(page.getByRole('alert')).toContainText(
    'Proiectul nu a putut fi încărcat sau salvat.',
  );
  await page.getByRole('button', { name: 'Creați Proiectul' }).click();
  const article = page.getByRole('article', { name: project.title });
  await expect(article).toBeVisible();
  expect(registrationRequests).toHaveLength(2);
  expect(registrationRequests[1]).toEqual(registrationRequests[0]);
  expect(registrationRequests[0]?.body).toBe(
    JSON.stringify({ title: project.title, clientAccountId: client.id }),
  );
  const projectRow = page
    .getByRole('list', { name: 'Proiecte' })
    .getByRole('listitem')
    .filter({ hasText: project.title });
  await projectRow.getByRole('button').click();
  await expect(article).toBeVisible();

  const displayedRegistration = await localizedDateTime(
    page,
    project.createdAt,
  );
  await expect(article).toContainText(displayedRegistration);
  await expectNoHorizontalOverflow(page);
  await article.locator('.project-detail-overview').screenshot({
    path: testInfo.outputPath(
      `projects-localization-ro-${testInfo.project.name}.png`,
    ),
  });

  const responsible = article.getByRole('region', {
    name: 'Membru responsabil',
  });
  await responsible.getByRole('button', { name: 'Modificați' }).click();
  await selectOption(
    responsible.getByLabel('Alegeți membrul responsabil'),
    member.workspaceMembershipId,
  );
  const saveResponsible = responsible.getByRole('button', { name: 'Salvați' });
  await saveResponsible.focus();
  await expect(saveResponsible).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(responsible).toContainText(member.displayLabel);
  expect(responsibilityRequests).toEqual([
    {
      body: {
        expectedRevision: 0,
        workspaceMembershipId: member.workspaceMembershipId,
      },
      key: expect.any(String),
    },
  ]);

  await changeLocale(page, testInfo.project.name, 'ru');
  const lifecycleSection = article.getByRole('region', {
    name: 'Жизненный цикл',
  });
  await lifecycleSection
    .getByRole('button', { name: 'Активировать Проект' })
    .click();
  const activation = lifecycleSection.getByRole('form', {
    name: 'Декларация запуска',
  });
  for (const item of [
    'Утверждённое Предложение',
    'Контракт или предварительный контракт',
  ])
    await activation
      .getByRole('group', { name: item })
      .getByRole('radio', { name: 'Отсутствует' })
      .check();
  for (const item of [
    'План Проекта',
    'Исходные Документы',
    'Сроки',
    'Финансовые условия',
    'Существенные риски',
  ])
    await activation
      .getByRole('group', { name: item })
      .getByRole('radio', { name: 'Есть' })
      .check();
  await activation
    .getByLabel('Причина исключения запуска')
    .fill(exceptionReason);
  await expect(activation.getByLabel('Должен завершить')).toContainText(
    member.displayLabel,
  );
  await activation.getByLabel('Срок завершения').fill('2026-10-15');
  await expectNoHorizontalOverflow(page);
  await lifecycleSection.screenshot({
    path: testInfo.outputPath(
      `projects-localization-ru-${testInfo.project.name}.png`,
    ),
  });
  const activate = activation.getByRole('button', { name: 'Активировать' });
  await activate.focus();
  await expect(activate).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(lifecycleSection).toContainText(
    await localizedDate(page, '2026-10-15'),
  );

  await lifecycleSection.getByRole('button', { name: 'Приостановить' }).click();
  await lifecycleSection.getByLabel('Причина приостановки').fill(holdReason);
  await lifecycleSection
    .getByRole('button', { name: 'Приостановить Проект' })
    .click();
  await lifecycleSection
    .getByRole('button', { name: 'Возобновить Проект' })
    .click();
  await lifecycleSection
    .getByRole('button', { name: 'Подтвердить возобновление' })
    .click();

  await changeLocale(page, testInfo.project.name, 'en');
  const englishLifecycle = article.getByRole('region', { name: 'Lifecycle' });
  await englishLifecycle
    .getByRole('button', { name: 'Complete Project' })
    .click();
  await englishLifecycle.getByLabel('Completion note').fill(completionNote);
  await englishLifecycle
    .getByRole('button', { name: 'Complete Project' })
    .click();
  await expect(article).toContainText(
    'This Project is completed. Its Tasks, Documents and responsible member are read-only; its history remains available.',
  );
  await page.getByLabel('Include closed Projects').check();

  expect(lifecycleRequests.map((request) => request.body)).toEqual([
    {
      action: 'activate',
      expectedLifecycleRevision: 0,
      declaration: {
        approvedOffer: 'missing',
        contractOrPrecontract: 'missing',
        projectPlan: 'present',
        initialDocuments: 'present',
        deadlines: 'present',
        financialConditions: 'present',
        risks: 'present',
      },
      startException: {
        reason: exceptionReason,
        completionMembershipId: member.workspaceMembershipId,
        completionDueDate: '2026-10-15',
      },
    },
    { action: 'hold', expectedLifecycleRevision: 1, reason: holdReason },
    { action: 'resume', expectedLifecycleRevision: 2 },
    {
      action: 'complete',
      expectedLifecycleRevision: 3,
      note: completionNote,
    },
  ]);
  expect(lifecycleRequests.every((request) => request.key)).toBe(true);
  await expectNoHorizontalOverflow(page);
});

async function changeLocale(page: Page, projectName: string, locale: string) {
  await openNavigation(page, projectName);
  await selectOption(
    page.getByLabel(
      /Limba interfeței|Язык интерфейса|Langue de l’interface|Interface language/u,
    ),
    locale,
  );
  await closeNavigation(page, projectName);
}

async function openNavigation(page: Page, projectName: string) {
  if (projectName !== 'narrow') return;
  await page
    .getByRole('button', {
      name: /Deschideți navigarea|Открыть навигацию|Ouvrir la navigation|Open navigation/u,
    })
    .click();
}

async function closeNavigation(page: Page, projectName: string) {
  if (projectName !== 'narrow') return;
  await page
    .getByRole('button', {
      name: /Închideți navigarea|Закрыть навигацию|Fermer la navigation|Close navigation/u,
    })
    .click();
}

async function localizedDateTime(page: Page, value: string) {
  return page.evaluate(
    (persisted) =>
      new Intl.DateTimeFormat(document.documentElement.lang, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(persisted)),
    value,
  );
}

async function localizedDate(page: Page, value: string) {
  return page.evaluate(
    (persisted) =>
      new Intl.DateTimeFormat(document.documentElement.lang, {
        dateStyle: 'medium',
        timeZone: 'UTC',
      }).format(new Date(persisted)),
    value,
  );
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}
