import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { WorkingDocument } from '../src/documents/document-response';
import {
  DOCUMENT_VERSIONS_PATH,
  draftVersionsOf,
} from './document-versions.fixture';
import { actorContextFixture } from './actor-context.fixture';

const company = {
  id: 'registration-time-company',
  displayName: 'PRISMA-PRIM',
};
const firstDocument = {
  id: 'registration-time-first',
  companyId: company.id,
  clientId: 'registration-time-client-first',
  clientDisplayName: 'Synthetic Client',
  title: 'Initial assessment questionnaire',
  purpose: 'Prepare the assessment',
  type: 'questionnaire',
  confidentiality: 'company-confidential',
  createdAt: '2026-09-19T12:00:00.000Z',
  workingRevision: 1,
  correction: 'allowed',
  version: {
    id: 'registration-time-version-first',
    status: 'draft',
    representation: {
      id: 'registration-time-representation-first',
      kind: 'external-reference',
      verification: 'unverified',
      access: 'granted',
      url: 'https://example.test/initial-questionnaire',
    },
  },
} satisfies WorkingDocument;
const secondDocument = {
  ...firstDocument,
  id: 'registration-time-second',
  clientId: 'registration-time-client-second',
  clientDisplayName: 'Alpha Advisory International Consulting',
  title: 'Supplier evidence checklist for the annual review',
  createdAt: '2026-09-21T06:30:00.000Z',
  version: {
    ...firstDocument.version,
    id: 'registration-time-version-second',
    representation: {
      ...firstDocument.version.representation,
      id: 'registration-time-representation-second',
      url: 'https://example.test/supplier-evidence',
    },
  },
} satisfies WorkingDocument;

test('shows the registration time of listed and opened Working Documents', async ({
  page,
}, testInfo) => {
  const mutationRequests: string[] = [];
  await interceptApplication(page, mutationRequests);
  const applicationDateTime = (value: string) =>
    page.evaluate(
      (persisted) =>
        new Intl.DateTimeFormat(
          document.documentElement.lang || navigator.language,
          { dateStyle: 'medium', timeStyle: 'short' },
        ).format(new Date(persisted)),
      value,
    );

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?frame=prisme#documents');
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByLabel('Active Company', { exact: true })
    .selectOption(company.id);
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Close navigation' }).click();

  const workspace = page.getByRole('region', { name: 'Working Documents' });
  await expect(
    workspace.getByRole('button', { name: firstDocument.title }),
  ).toBeVisible();
  await expect(workspace.getByRole('term')).toHaveText([
    'Registration time',
    'Registration time',
  ]);
  await expect(workspace.getByRole('definition')).toHaveText([
    await applicationDateTime(firstDocument.createdAt),
    await applicationDateTime(secondDocument.createdAt),
  ]);
  expect(
    await workspace
      .locator('li time')
      .evaluateAll((elements) =>
        elements.map((element) => element.getAttribute('datetime')),
      ),
  ).toEqual([firstDocument.createdAt, secondDocument.createdAt]);
  expect(
    await workspace
      .getByRole('definition')
      .last()
      .evaluate(
        (element) => element.getBoundingClientRect().right <= window.innerWidth,
      ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath(
      `working-document-registration-time-list-prisme-${testInfo.project.name}.png`,
    ),
    fullPage: true,
  });

  await workspace.getByRole('button', { name: secondDocument.title }).click();
  const detail = workspace.locator('article');
  await expect(
    detail.getByRole('heading', { name: secondDocument.title }),
  ).toBeVisible();
  await expect(detail.getByRole('term')).toHaveText('Registration time');
  await expect(detail.getByRole('definition')).toHaveText(
    await applicationDateTime(secondDocument.createdAt),
  );
  await expect(detail.getByRole('definition').locator('time')).toHaveAttribute(
    'datetime',
    secondDocument.createdAt,
  );
  expect(
    await detail
      .getByRole('definition')
      .evaluate(
        (element) => element.getBoundingClientRect().right <= window.innerWidth,
      ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath(
      `working-document-registration-time-detail-prisme-${testInfo.project.name}.png`,
    ),
    fullPage: true,
  });

  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Use classic frame' }).click();
  const classicDetail = page.locator('#documents article');
  await expect(
    classicDetail.getByRole('heading', { name: secondDocument.title }),
  ).toBeVisible();
  await expect(classicDetail.getByRole('term')).toHaveText('Registration time');
  await expect(classicDetail.getByRole('definition')).toHaveText(
    await applicationDateTime(secondDocument.createdAt),
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath(
      `working-document-registration-time-classic-${testInfo.project.name}.png`,
    ),
    fullPage: true,
  });
  expect(mutationRequests).toEqual([]);
});

async function interceptApplication(page: Page, mutationRequests: string[]) {
  await page.route('**/api/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const companyId = request.headers()['x-company-context-id'];
    if (request.method() !== 'GET') mutationRequests.push(path);
    if (path === '/api/access/current-actor')
      return route.fulfill({
        json: {
          ...actorContextFixture,
          workspacePermissions: [],
          ...(companyId === company.id
            ? {
                activeCompany: {
                  ...company,
                  clientPermissions: ['client.read'],
                  documentPermissions: [
                    'document.read',
                    'document.reference.read',
                  ],
                },
              }
            : {}),
        },
      });
    if (path === '/api/companies') return route.fulfill({ json: [company] });
    if (path === '/api/clients') return route.fulfill({ json: [] });
    if (path === '/api/activity-log')
      return route.fulfill({ json: { events: [] } });
    if (path === '/api/documents')
      return route.fulfill({ json: [firstDocument, secondDocument] });
    if (path.startsWith('/api/documents/')) {
      const opened = [firstDocument, secondDocument].find(
        (candidate) => candidate.id === path.split('/')[3],
      );
      if (opened && DOCUMENT_VERSIONS_PATH.test(path))
        return route.fulfill({ json: draftVersionsOf(opened) });
      return opened
        ? route.fulfill({ json: opened })
        : route.fulfill({ status: 404 });
    }
    return route.fulfill({ status: 404 });
  });
}
