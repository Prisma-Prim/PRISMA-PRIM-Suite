import { expect, test } from '@playwright/test';
import { actorContextFixture } from './actor-context.fixture';

test('registers and reopens a Company preparatory Project after reload', async ({
  page,
}, testInfo) => {
  const company = { id: 'company-projects', displayName: 'PRISMA-PRIM' };
  const client = {
    id: 'client-projects',
    displayName: 'Synthetic Client',
    relatedToActiveCompany: true,
  };
  const project = {
    id: 'project-238',
    companyId: company.id,
    clientAccountId: client.id,
    clientDisplayName: client.displayName,
    title: 'ISO 9001 consulting preparation',
    status: 'preparatory',
    createdAt: '2026-09-19T00:00:00.000Z',
  };
  let registered = false;
  let denied = false;
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
                  clientPermissions: [],
                  projectPermissions: ['project.read', 'project.create'],
                },
              }
            : {}),
        },
      });
    if (path === '/api/companies') return route.fulfill({ json: [company] });
    if (path === '/api/activity-log')
      return route.fulfill({
        json: {
          events:
            registered && !denied
              ? [
                  {
                    id: 'project-event',
                    action: 'project.created',
                    occurredAt: project.createdAt,
                    actor: {
                      internalUserId: actorContextFixture.internalUserId,
                      displayName: actorContextFixture.displayName,
                    },
                    target: {
                      type: 'project',
                      projectId: project.id,
                      companyId: company.id,
                    },
                    metadata: {},
                  },
                ]
              : [],
        },
      });
    if (path === '/api/clients') return route.fulfill({ json: [client] });
    if (path.startsWith('/api/projects')) {
      if (denied) return route.fulfill({ status: 403 });
      expect(request.headers()['x-company-context-id']).toBe(company.id);
      if (request.method() === 'POST') {
        expect(request.postDataJSON()).toEqual({
          title: project.title,
          clientAccountId: client.id,
        });
        expect(request.headers()['idempotency-key']).toBeTruthy();
        registered = true;
        return route.fulfill({ status: 201, json: project });
      }
      return route.fulfill({
        json:
          path === '/api/projects' ? (registered ? [project] : []) : project,
      });
    }
    return route.fulfill({ status: 404 });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?frame=prisme#projects');
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByLabel('Active Company', { exact: true })
    .selectOption(company.id);
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Close navigation' }).click();
  await page.goto('/?frame=prisme#projects');
  await expect(
    page.getByText('No preparatory Projects for this Company yet.'),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('projects-empty.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Create Project', exact: true })
    .click();
  await expect(page.getByRole('alert')).toHaveText(
    'Enter a title of 1–200 characters and select a Client.',
  );
  await page.getByLabel('Project title').fill(project.title);
  await page.getByLabel('Client', { exact: true }).selectOption(client.id);
  await page
    .getByRole('button', { name: 'Create Project', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: project.title }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: project.title }).click();
  await expect(
    page.getByRole('heading', { name: project.title }),
  ).toBeVisible();
  await expect(page.getByText(`Client: ${client.displayName}`)).toBeVisible();
  await expect(
    page.getByText(
      'Preparation only. This record does not authorize work to start.',
    ),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('projects-reopened.png'),
    fullPage: true,
  });
  await page.goto('/?frame=prisme#activity');
  await expect(
    page.getByText(
      `${actorContextFixture.displayName} created a preparatory Project`,
    ),
  ).toBeVisible();
  await expect(page.getByText(`Target: ${project.id}`)).toBeVisible();
  await page.goto('/?frame=prisme#projects');
  await page.getByRole('button', { name: project.title }).click();
  denied = true;
  await page.getByRole('button', { name: 'Reload Projects' }).click();
  await expect(
    page.getByRole('alert').filter({
      hasText:
        /^Project access and Client read access are required for this Company\.$/,
    }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: project.title })).toHaveCount(
    0,
  );
  await page.screenshot({
    path: testInfo.outputPath('projects-denied.png'),
    fullPage: true,
  });
});
