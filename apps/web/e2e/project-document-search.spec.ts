import { enterClassicCompatibility } from './classic-compatibility';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import type { WorkingDocument } from '../src/documents/document-response';
import {
  actorContextFixture,
  preparatoryLifecycle,
  operationalHomeFixture,
  unassignedResponsibility,
} from './actor-context.fixture';

const company = { id: 'company-document-search', displayName: 'PRISMA-PRIM' };
const client = {
  id: 'client-document-search',
  displayName: 'Synthetic Client',
  relatedToActiveCompany: true,
};
const project = {
  id: 'project-304',
  companyId: company.id,
  clientAccountId: client.id,
  clientDisplayName: client.displayName,
  title: 'Document search preparation',
  status: 'preparatory',
  createdAt: '2026-09-19T00:00:00.000Z',
};

function workingDocument(
  id: string,
  title: string,
  purpose: string,
): WorkingDocument {
  return {
    id,
    companyId: company.id,
    clientId: client.id,
    clientDisplayName: client.displayName,
    title,
    purpose,
    type: 'questionnaire',
    confidentiality: 'company-confidential',
    createdAt: project.createdAt,
    workingRevision: 1,
    correction: 'allowed',
    version: {
      id: `version-${id}`,
      status: 'draft',
      representation: {
        id: `representation-${id}`,
        kind: 'external-reference',
        verification: 'unverified',
        access: 'granted',
        url: `https://example.test/${id}`,
      },
    },
  };
}

const siteVisit = workingDocument(
  'document-site-visit',
  'Preparation questionnaire site visit',
  'Prepare the on-site interview',
);
const remoteReview = workingDocument(
  'document-remote-review',
  'Preparation questionnaire remote review',
  'Prepare the remote Client interview',
);
const archive = workingDocument(
  'document-archive',
  'Preparation questionnaire archive',
  'Collect archived answers',
);
const eligibleDocuments = [siteVisit, remoteReview, archive];
const searchLabel = 'Search eligible working Documents';

// Existing local-demo identity and intercepted REST responses; no live Clerk,
// backend, database or external provider is exercised by this browser journey.
async function installDocumentSearchFixture(page: Page) {
  const state = {
    linked: new Set<string>(),
    revisions: new Map(eligibleDocuments.map((row) => [row.id, 0])),
    reads: 0,
    commands: [] as unknown[],
  };
  await page.route('**/api/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/access/current-actor')
      return route.fulfill({
        json: {
          ...actorContextFixture,
          workspacePermissions: [],
          ...(request.headers()['x-company-context-id']
            ? {
                activeCompany: {
                  ...company,
                  clientPermissions: ['client.read'],
                  projectPermissions: ['project.read'],
                  documentPermissions: [
                    'document.read',
                    'document.reference.read',
                    'document.project.manage',
                  ],
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
        }),
      });
    if (path === '/api/clients') return route.fulfill({ json: [client] });
    if (path === '/api/activity-log')
      return route.fulfill({ json: { events: [] } });
    if (path === '/api/projects') return route.fulfill({ json: [project] });
    if (path === `/api/projects/${project.id}`)
      return route.fulfill({ json: project });
    if (path === `/api/projects/${project.id}/responsible`)
      return route.fulfill({ json: unassignedResponsibility });
    if (path === `/api/projects/${project.id}/lifecycle`)
      return route.fulfill({ json: preparatoryLifecycle });
    if (
      path === `/api/projects/${project.id}/documents` ||
      path === `/api/projects/${project.id}/eligible-documents`
    ) {
      state.reads += 1;
      const eligible = path.endsWith('/eligible-documents');
      return route.fulfill({
        json: {
          mutable: true,
          documents: eligibleDocuments
            .filter((row) => state.linked.has(row.id) !== eligible)
            .map((row) => ({
              document: row,
              revision: state.revisions.get(row.id) ?? 0,
            })),
        },
      });
    }
    if (path.endsWith('/project-association')) {
      const documentId = path.split('/')[3] ?? '';
      const body: unknown = request.postDataJSON();
      state.commands.push(body);
      const revision = state.revisions.get(documentId);
      if (
        revision === undefined ||
        !body ||
        typeof body !== 'object' ||
        !('action' in body) ||
        (body.action !== 'link' && body.action !== 'unlink') ||
        !('expectedRevision' in body) ||
        body.expectedRevision !== revision
      )
        return route.fulfill({ status: 409 });
      if (body.action === 'link') state.linked.add(documentId);
      else state.linked.delete(documentId);
      state.revisions.set(documentId, revision + 1);
      return route.fulfill({
        json: {
          documentId,
          projectId: project.id,
          action: body.action,
          revision: revision + 1,
        },
      });
    }
    if (path === '/api/documents')
      return route.fulfill({ json: eligibleDocuments });
    return route.fulfill({ status: 404 });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  return state;
}

async function selectCompany(page: Page, testInfo: TestInfo) {
  await page.goto('/?frame=prisme#projects');
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByLabel('Active Company', { exact: true })
    .selectOption(company.id);
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Close navigation' }).click();
}

// The Classic frame also shows the Document registry section, so the Project
// panel is addressed through its own scoped markup in both frames.
async function openProjectDocuments(page: Page) {
  await page.goto('/?frame=prisme#projects');
  await page
    .getByRole('button', {
      name: `${project.title} Client: ${project.clientDisplayName}`,
      exact: true,
    })
    .click();
  await page
    .getByRole('tab', { name: 'Working Documents', exact: true })
    .click();
  const documents = page.locator('.project-documents');
  await expect(documents).toHaveAttribute('aria-label', 'Working Documents');
  await expect(documents).toHaveClass(/project-documents--prisme/);
  return documents;
}

async function capture(page: Page, testInfo: TestInfo, filename: string) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath(`${filename}-${testInfo.project.name}.png`),
    fullPage: true,
  });
}

test('finds one eligible working Document among similar rows and attaches it', async ({
  page,
}, testInfo) => {
  const state = await installDocumentSearchFixture(page);
  await selectCompany(page, testInfo);
  const documents = await openProjectDocuments(page);
  await expect(
    documents.getByText('No working Documents attached.'),
  ).toBeVisible();
  await documents
    .getByRole('button', { name: 'Attach working Document', exact: true })
    .click();
  await expect(documents.getByRole('heading', { level: 5 })).toHaveText([
    siteVisit.title,
    remoteReview.title,
    archive.title,
  ]);
  const readsAfterOpening = state.reads;

  const search = documents.getByLabel(searchLabel);
  await search.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(search).toBeFocused();
  expect(
    await search.evaluate((element) => getComputedStyle(element).outlineStyle),
  ).toBe('solid');
  expect(
    await search.evaluate((element) => getComputedStyle(element).outlineWidth),
  ).toBe('3px');

  await search.fill('  REMOTE  ');
  await expect(documents.getByRole('heading', { level: 5 })).toHaveText([
    remoteReview.title,
  ]);
  // The linked list keeps its own state; the query narrows the selector only.
  await expect(
    documents.getByText('No working Documents attached.'),
  ).toBeVisible();

  // Purpose is searchable; the external reference URL is not.
  await search.fill('archived');
  await expect(documents.getByRole('heading', { level: 5 })).toHaveText([
    archive.title,
  ]);
  await search.fill('example.test');
  await expect(
    documents.getByText('No eligible working Documents match this search.'),
  ).toBeVisible();
  await expect(
    documents.getByText(
      'No eligible working Documents for this original Client.',
    ),
  ).toHaveCount(0);
  await expect(
    documents.getByRole('button', { name: /^Attach Preparation/ }),
  ).toHaveCount(0);
  await capture(page, testInfo, 'project-document-search-no-match');

  await search.fill('');
  await expect(documents.getByRole('heading', { level: 5 })).toHaveText([
    siteVisit.title,
    remoteReview.title,
    archive.title,
  ]);
  expect(state.reads).toBe(readsAfterOpening);
  expect(state.commands).toHaveLength(0);

  await search.fill('site');
  await capture(page, testInfo, 'project-document-search-match');
  await documents
    .getByRole('button', { name: `Attach ${siteVisit.title}`, exact: true })
    .click();
  await expect(
    documents.getByRole('heading', { name: siteVisit.title, exact: true }),
  ).toBeVisible();
  await expect(
    documents.getByRole('button', {
      name: `Remove ${siteVisit.title}`,
      exact: true,
    }),
  ).toBeVisible();
  expect(state.commands).toEqual([
    { projectId: project.id, action: 'link', expectedRevision: 0 },
  ]);

  // Reopening the selector starts from an empty query over the remaining rows.
  await documents
    .getByRole('button', { name: 'Attach working Document', exact: true })
    .click();
  await expect(documents.getByLabel(searchLabel)).toHaveValue('');
  await expect(documents.getByRole('heading', { level: 5 })).toHaveText([
    siteVisit.title,
    remoteReview.title,
    archive.title,
  ]);
  await documents
    .getByRole('button', { name: 'Close Document selector' })
    .click();
  await expect(documents.getByLabel(searchLabel)).toHaveCount(0);
  await capture(page, testInfo, 'project-document-search-attached');

  await documents
    .getByRole('button', { name: `Remove ${siteVisit.title}`, exact: true })
    .click();
  await expect(
    documents.getByText('No working Documents attached.'),
  ).toBeVisible();
  expect(state.commands).toHaveLength(2);
});

test('keeps the eligible Document search usable in the Classic frame', async ({
  page,
}, testInfo) => {
  const state = await installDocumentSearchFixture(page);
  await selectCompany(page, testInfo);
  await openProjectDocuments(page);
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await enterClassicCompatibility(page);
  const documents = page.locator('.project-documents');
  await expect(documents).toHaveClass('project-documents');
  await documents
    .getByRole('button', { name: 'Attach working Document', exact: true })
    .click();

  const search = documents.getByLabel(searchLabel);
  await search.focus();
  await expect(search).toBeFocused();
  await page.keyboard.type('remote');
  await expect(documents.getByRole('heading', { level: 5 })).toHaveText([
    remoteReview.title,
  ]);
  await search.fill('');
  await expect(documents.getByRole('heading', { level: 5 })).toHaveText([
    siteVisit.title,
    remoteReview.title,
    archive.title,
  ]);
  expect(state.commands).toHaveLength(0);
  await capture(page, testInfo, 'project-document-search-classic');
});
