import {
  expect,
  test,
  type Page,
  type Route,
  type TestInfo,
} from '@playwright/test';
import type { ActorContext } from '../src/access-types';
import type { WorkingDocument } from '../src/documents/document-response';
import { actorContextFixture } from './actor-context.fixture';

const company = { id: 'company-project-documents', displayName: 'PRISMA-PRIM' };
const client = {
  id: 'client-project-documents',
  displayName: 'Synthetic Client',
  relatedToActiveCompany: true,
};
const project = {
  id: 'project-245',
  companyId: company.id,
  clientAccountId: client.id,
  clientDisplayName: client.displayName,
  title: 'ISO 9001 consulting preparation',
  status: 'preparatory',
  createdAt: '2026-09-19T00:00:00.000Z',
};
const workingDocument = {
  id: 'document-245',
  companyId: company.id,
  clientId: client.id,
  clientDisplayName: client.displayName,
  title: 'Preparation questionnaire',
  purpose: 'Prepare the Client interview',
  type: 'questionnaire',
  confidentiality: 'company-confidential',
  createdAt: '2026-09-19T00:00:00.000Z',
  workingRevision: 1,
  correction: 'allowed',
  version: {
    id: 'version-245',
    status: 'draft',
    representation: {
      id: 'representation-245',
      kind: 'external-reference',
      verification: 'unverified',
      access: 'granted',
      url: 'https://example.test/project-questionnaire',
    },
  },
} satisfies WorkingDocument;

// Existing local-demo identity and intercepted REST responses; no live Clerk,
// backend, database or external provider is exercised by these browser journeys.
async function installProjectDocumentsFixture(page: Page) {
  const state: {
    permissions: NonNullable<
      ActorContext['activeCompany']
    >['documentPermissions'];
    document: WorkingDocument;
    linked: boolean;
    mutable: boolean;
    revision: number;
    reads: number;
    commands: { body: unknown; key: string | undefined }[];
    write: (route: Route) => Promise<void>;
  } = {
    permissions: [
      'document.read',
      'document.reference.read',
      'document.project.manage',
    ],
    document: workingDocument,
    linked: false,
    mutable: true,
    revision: 0,
    reads: 0,
    commands: [],
    write: (route) => route.fulfill({ status: 500 }),
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
                  documentPermissions: state.permissions,
                },
              }
            : {}),
        },
      });
    if (path === '/api/companies') return route.fulfill({ json: [company] });
    if (path === '/api/clients') return route.fulfill({ json: [client] });
    if (path === '/api/activity-log')
      return route.fulfill({ json: { events: [] } });
    if (path === '/api/projects' || path === `/api/projects/${project.id}`) {
      expect(request.headers()['x-company-context-id']).toBe(company.id);
      return route.fulfill({
        json: path === '/api/projects' ? [project] : project,
      });
    }
    if (
      path === `/api/projects/${project.id}/documents` ||
      path === `/api/projects/${project.id}/eligible-documents`
    ) {
      expect(request.headers()['x-company-context-id']).toBe(company.id);
      state.reads += 1;
      if (!state.permissions?.includes('document.read'))
        return route.fulfill({ status: 403 });
      const eligible = path.endsWith('/eligible-documents');
      return route.fulfill({
        json: {
          mutable: state.mutable,
          documents:
            eligible !== state.linked
              ? [{ document: state.document, revision: state.revision }]
              : [],
        },
      });
    }
    if (path === `/api/documents/${workingDocument.id}/project-association`) {
      expect(request.method()).toBe('POST');
      expect(request.headers()['x-company-context-id']).toBe(company.id);
      state.commands.push({
        body: request.postDataJSON(),
        key: request.headers()['idempotency-key'],
      });
      return state.write(route);
    }
    if (path === '/api/documents')
      return route.fulfill({ json: [state.document] });
    return route.fulfill({ status: 404 });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  return state;
}

async function openProject(page: Page, testInfo: TestInfo) {
  await page.goto('/?frame=prisme#projects');
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByLabel('Active Company', { exact: true })
    .selectOption(company.id);
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Close navigation' }).click();
  await page.goto('/?frame=prisme#projects');
  await page
    .getByRole('button', {
      name: `${project.title} Client: ${project.clientDisplayName}`,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('heading', { name: project.title }),
  ).toBeVisible();
  await page
    .getByRole('tab', { name: 'Working Documents', exact: true })
    .click();
  const documents = page.getByRole('region', {
    name: 'Working Documents',
    exact: true,
  });
  await expect(documents).toHaveClass(/project-documents--prisme/);
  return documents;
}

async function capture(page: Page, testInfo: TestInfo, filename: string) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath(filename),
    fullPage: true,
  });
}

test('attaches, retries unchanged, reloads, opens and removes a working Project Document', async ({
  page,
}, testInfo) => {
  const state = await installProjectDocumentsFixture(page);
  state.write = (route) => {
    const action = state.commands.length <= 2 ? 'link' : 'unlink';
    expect(route.request().postDataJSON()).toEqual({
      projectId: project.id,
      action,
      expectedRevision: action === 'link' ? 0 : 1,
    });
    expect(route.request().headers()['idempotency-key']).toBeTruthy();
    if (state.commands.length === 3) return route.fulfill({ status: 409 });
    state.linked = action === 'link';
    state.revision = action === 'link' ? 1 : 2;
    // The first link commits but its response fails; replay confirms that same
    // command, while the subsequent GET supplies the current association.
    if (state.commands.length === 1) return route.fulfill({ status: 500 });
    return route.fulfill({
      json: {
        documentId: workingDocument.id,
        projectId: project.id,
        action,
        revision: state.revision,
      },
    });
  };
  const documents = await openProject(page, testInfo);
  await expect(
    documents.getByText('No working Documents attached.'),
  ).toBeVisible();
  await expect(
    documents.getByText(
      'Draft questionnaires with unverified external references. Attachments are working material, not accepted evidence or permission to start work.',
    ),
  ).toBeVisible();
  const attach = documents.getByRole('button', {
    name: 'Attach working Document',
    exact: true,
  });
  await attach.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(attach).toBeFocused();
  expect(
    await attach.evaluate((element) => getComputedStyle(element).outlineStyle),
  ).toBe('solid');
  expect(
    await attach.evaluate((element) => getComputedStyle(element).outlineColor),
  ).toBe('rgb(121, 98, 237)');
  await capture(page, testInfo, 'project-documents-empty.png');
  await attach.click();
  await expect(documents.getByText(workingDocument.purpose)).toBeVisible();
  await capture(page, testInfo, 'project-documents-selector.png');
  await documents
    .getByRole('button', {
      name: `Attach ${workingDocument.title}`,
      exact: true,
    })
    .click();
  await expect(
    documents.getByText(
      'The result is uncertain. Retry this same command or reload before choosing another action.',
    ),
  ).toBeVisible();
  await expect(
    documents.getByRole('button', {
      name: `Attach ${workingDocument.title}`,
      exact: true,
    }),
  ).toBeDisabled();
  expect(state.commands).toHaveLength(1);
  await capture(page, testInfo, 'project-documents-uncertain.png');
  await documents
    .getByRole('button', { name: 'Retry unchanged command' })
    .click();
  await expect(
    documents.getByRole('link', { name: 'Open external reference' }),
  ).toBeVisible();
  expect(state.commands).toHaveLength(2);
  expect(state.commands[1]).toEqual(state.commands[0]);

  await page.reload();
  await page
    .getByRole('button', {
      name: `${project.title} Client: ${project.clientDisplayName}`,
      exact: true,
    })
    .click();
  await page
    .getByRole('tab', { name: 'Working Documents', exact: true })
    .click();
  state.document = {
    ...state.document,
    title: 'Corrected preparation questionnaire',
    purpose: 'Prepare the corrected Client interview',
    workingRevision: 2,
    version: {
      ...state.document.version,
      representation: {
        ...state.document.version.representation,
        url: 'https://example.test/corrected-project-questionnaire',
      },
    },
  };
  await documents
    .getByRole('button', { name: 'Reload working Documents' })
    .click();
  await expect(
    documents.getByRole('heading', { name: state.document.title }),
  ).toBeVisible();
  await expect(
    documents.getByRole('button', {
      name: `Remove ${state.document.title}`,
      exact: true,
    }),
  ).toBeVisible();
  const reference = documents.getByRole('link', {
    name: 'Open external reference',
  });
  await expect(reference).toHaveAttribute(
    'href',
    state.document.version.representation.url,
  );
  await expect(reference).toHaveAttribute('target', '_blank');
  await expect(reference).toHaveAttribute('rel', 'noopener noreferrer');
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
  });
  await capture(page, testInfo, 'project-documents-reopened.png');
  await page
    .context()
    .route(state.document.version.representation.url, (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<title>Synthetic questionnaire</title>',
      }),
    );
  const [externalReference] = await Promise.all([
    page.waitForEvent('popup'),
    reference.click(),
  ]);
  await expect(externalReference).toHaveURL(
    state.document.version.representation.url,
  );
  expect(await externalReference.evaluate(() => window.opener)).toBeNull();
  await externalReference.close();
  const remove = documents.getByRole('button', {
    name: `Remove ${state.document.title}`,
    exact: true,
  });
  await remove.click();
  await expect(documents.getByRole('status')).toHaveText(
    'The association changed or this command is no longer valid. Reload before choosing another action.',
  );
  await expect(remove).toBeDisabled();
  await documents
    .getByRole('button', { name: 'Reload working Documents' })
    .click();
  await expect(remove).toBeEnabled();
  await remove.click();
  await expect(
    documents.getByText('No working Documents attached.'),
  ).toBeVisible();
  await expect(documents.getByRole('link')).toHaveCount(0);
  expect(state.commands).toHaveLength(4);
  expect(state.commands[2]?.key).not.toBe(state.commands[0]?.key);
  expect(state.commands[3]?.key).not.toBe(state.commands[2]?.key);
  await capture(page, testInfo, 'project-documents-removed.png');
  await page.reload();
  await page
    .getByRole('button', {
      name: `${project.title} Client: ${project.clientDisplayName}`,
      exact: true,
    })
    .click();
  await page
    .getByRole('tab', { name: 'Working Documents', exact: true })
    .click();
  await expect(
    documents.getByText('No working Documents attached.'),
  ).toBeVisible();
  await documents
    .getByRole('button', { name: 'Attach working Document', exact: true })
    .click();
  await expect(
    documents.getByRole('heading', { name: state.document.title }),
  ).toBeVisible();
});

test('shows permitted metadata without URL access or mutation controls', async ({
  page,
}, testInfo) => {
  const state = await installProjectDocumentsFixture(page);
  state.permissions = ['document.read'];
  state.linked = true;
  state.revision = 1;
  state.document = {
    ...workingDocument,
    version: {
      ...workingDocument.version,
      representation: {
        id: workingDocument.version.representation.id,
        kind: 'external-reference',
        verification: 'unverified',
        access: 'denied',
      },
    },
  };
  const documents = await openProject(page, testInfo);
  await expect(
    documents.getByRole('heading', { name: workingDocument.title }),
  ).toBeVisible();
  await expect(documents.getByText(workingDocument.purpose)).toBeVisible();
  await expect(
    documents.getByText('External reference access is not granted.'),
  ).toBeVisible();
  await expect(documents.getByRole('link')).toHaveCount(0);
  await expect(
    documents.getByRole('button', { name: /Attach|Remove/ }),
  ).toHaveCount(0);
  await expect(
    page.locator(`a[href="${workingDocument.version.representation.url}"]`),
  ).toHaveCount(0);
  expect(state.commands).toHaveLength(0);
  await capture(page, testInfo, 'project-documents-metadata-only.png');
});

test('does not expose Document metadata or request links with only Project Organizer permission', async ({
  page,
}, testInfo) => {
  const state = await installProjectDocumentsFixture(page);
  state.permissions = ['document.project.manage'];
  state.linked = true;
  const documents = await openProject(page, testInfo);
  await expect(documents.getByRole('alert')).toHaveText(
    'Project, Document and Client read access are required to view these Documents.',
  );
  await expect(documents.getByText(workingDocument.title)).toHaveCount(0);
  await expect(documents.getByText(workingDocument.purpose)).toHaveCount(0);
  await expect(documents.getByRole('list')).toHaveCount(0);
  await expect(documents.getByRole('link')).toHaveCount(0);
  await expect(
    documents.getByRole('button', { name: /Attach|Remove/ }),
  ).toHaveCount(0);
  expect(state.reads).toBe(0);
  expect(state.commands).toHaveLength(0);
  await capture(page, testInfo, 'project-documents-denied.png');
});

test('keeps a superseded original Client attachment readable and read-only', async ({
  page,
}, testInfo) => {
  const state = await installProjectDocumentsFixture(page);
  state.linked = true;
  state.revision = 1;
  state.mutable = false;
  const documents = await openProject(page, testInfo);
  await expect(
    documents.getByRole('heading', { name: workingDocument.title }),
  ).toBeVisible();
  await expect(
    documents.getByText(
      'The original Client is no longer active. Existing attachments are read-only.',
    ),
  ).toBeVisible();
  await expect(
    documents.getByRole('link', { name: 'Open external reference' }),
  ).toHaveAttribute('href', workingDocument.version.representation.url);
  await expect(
    documents.getByRole('button', { name: /Attach|Remove/ }),
  ).toHaveCount(0);
  expect(state.commands).toHaveLength(0);
  await capture(page, testInfo, 'project-documents-read-only.png');
});
