import {
  expect,
  test,
  type Locator,
  type Page,
  type Route,
  type TestInfo,
} from '@playwright/test';
import type { ActorContext } from '../src/access-types';
import type {
  WorkingDocument,
  WorkingDocumentDetail,
} from '../src/documents/document-response';
import {
  actorContextFixture,
  operationalHomeFixture,
  unassignedResponsibility,
} from './actor-context.fixture';

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
    /** Other readable Documents, listed before the linkable one. */
    others: WorkingDocument[];
    detailReads: string[];
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
    others: [],
    detailReads: [],
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
    if (path === '/api/projects' || path === `/api/projects/${project.id}`) {
      expect(request.headers()['x-company-context-id']).toBe(company.id);
      return route.fulfill({
        json: path === '/api/projects' ? [project] : project,
      });
    }
    if (path === `/api/projects/${project.id}/responsible`)
      return route.fulfill({ json: unassignedResponsibility });
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
    const other = state.others.find(
      (document) => path === `/api/documents/${document.id}`,
    );
    if (other) {
      state.detailReads.push(other.id);
      return route.fulfill({
        json: {
          ...other,
          projectAssociation: { state: 'unlinked' },
        } satisfies WorkingDocumentDetail,
      });
    }
    if (path === `/api/documents/${workingDocument.id}`) {
      expect(request.method()).toBe('GET');
      expect(request.headers()['x-company-context-id']).toBe(company.id);
      state.detailReads.push(workingDocument.id);
      if (!state.permissions?.includes('document.read'))
        return route.fulfill({ status: 403 });
      return route.fulfill({
        json: {
          ...state.document,
          projectAssociation: state.linked
            ? {
                state: 'linked',
                project: { id: project.id, title: project.title },
              }
            : { state: 'unlinked' },
        } satisfies WorkingDocumentDetail,
      });
    }
    if (path === '/api/documents')
      return route.fulfill({ json: [...state.others, state.document] });
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

async function navigate(
  page: Page,
  testInfo: TestInfo,
  section: 'Projects' | 'Working Documents',
) {
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: section, exact: true })
    .click();
}

async function openWorkingDocument(page: Page, testInfo: TestInfo) {
  await navigate(page, testInfo, 'Working Documents');
  const workspace = page.getByRole('region', {
    name: 'Working Documents',
    exact: true,
  });
  await expect(workspace).toHaveClass(/working-documents--prisme/);
  await workspace
    .getByRole('button', { name: workingDocument.title, exact: true })
    .click();
  const detail = workspace.getByRole('article');
  await expect(
    detail.getByRole('heading', { name: workingDocument.title }),
  ).toBeVisible();
  return detail;
}

function projectRow(detail: Locator) {
  return detail.locator('dl').filter({ hasText: /^Project/ });
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

test('shows the current Project association on the opened Working Document', async ({
  page,
}, testInfo) => {
  const state = await installProjectDocumentsFixture(page);
  state.write = (route) => {
    const action = state.linked ? 'unlink' : 'link';
    expect(route.request().postDataJSON()).toEqual({
      projectId: project.id,
      action,
      expectedRevision: state.revision,
    });
    state.linked = action === 'link';
    state.revision += 1;
    return route.fulfill({
      json: {
        documentId: workingDocument.id,
        projectId: project.id,
        action,
        revision: state.revision,
      },
    });
  };
  const projectDocuments = await openProject(page, testInfo);
  await projectDocuments
    .getByRole('button', { name: 'Attach working Document', exact: true })
    .click();
  await projectDocuments
    .getByRole('button', {
      name: `Attach ${workingDocument.title}`,
      exact: true,
    })
    .click();
  const remove = projectDocuments.getByRole('button', {
    name: `Remove ${workingDocument.title}`,
    exact: true,
  });
  await expect(remove).toBeVisible();

  const linked = await openWorkingDocument(page, testInfo);
  await expect(projectRow(linked).getByRole('term')).toHaveText('Project');
  await expect(projectRow(linked).getByRole('definition')).toHaveText(
    project.title,
  );
  await capture(page, testInfo, 'working-document-project-linked.png');

  await linked.getByRole('button', { name: 'Back to references' }).click();
  await navigate(page, testInfo, 'Projects');
  await remove.click();
  await expect(
    projectDocuments.getByText('No working Documents attached.'),
  ).toBeVisible();

  // Each open reads the Document afresh; the removal needs no invalidation.
  const unlinked = await openWorkingDocument(page, testInfo);
  await expect(projectRow(unlinked).getByRole('definition')).toHaveText(
    'Not linked to a Project',
  );
  await expect(unlinked.getByText(project.title)).toHaveCount(0);
  expect(state.commands).toHaveLength(2);
  await capture(page, testInfo, 'working-document-project-unlinked.png');
});

for (const frame of ['classic', 'prisme'] as const)
  test(`${frame} opens the exact linked working Document from Project detail`, async ({
    page,
  }, testInfo) => {
    const state = await installProjectDocumentsFixture(page);
    state.linked = true;
    state.revision = 1;
    // Another readable Document shares the linked one's title.
    const homonym = {
      ...workingDocument,
      id: 'document-homonym-363',
      purpose: 'Prepare a different Client interview',
      createdAt: '2026-09-18T00:00:00.000Z',
    } satisfies WorkingDocument;
    state.others = [homonym];
    const narrow = frame === 'prisme' && testInfo.project.name === 'narrow';
    await page.goto(`/?frame=${frame}#projects`);
    if (narrow)
      await page.getByRole('button', { name: 'Open navigation' }).click();
    await page
      .getByLabel('Active Company', { exact: true })
      .selectOption(company.id);
    if (narrow)
      await page.getByRole('button', { name: 'Close navigation' }).click();
    await page.goto(`/?frame=${frame}#projects`);
    await page
      .getByRole('button', {
        name: `${project.title} Client: ${project.clientDisplayName}`,
        exact: true,
      })
      .click();
    if (frame === 'prisme')
      await page
        .getByRole('tab', { name: 'Working Documents', exact: true })
        .click();
    const projectDocuments = page.locator('.project-documents');
    const linkedRow = projectDocuments.getByRole('listitem').filter({
      has: page.getByRole('heading', {
        name: workingDocument.title,
        exact: true,
      }),
    });
    const openDocument = linkedRow.getByRole('button', {
      name: 'Open Document',
      exact: true,
    });
    await expect(openDocument).toBeVisible();
    await capture(page, testInfo, `project-document-open-${frame}-row.png`);

    // Keyboard activation moves focus to the Documents section.
    await openDocument.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#documents')).toBeFocused();
    const detail = page.locator('.working-documents').getByRole('article');
    await expect(
      detail.getByRole('heading', { name: workingDocument.title }),
    ).toBeVisible();
    await expect(
      detail.getByText(workingDocument.purpose, { exact: true }),
    ).toBeVisible();
    await expect(detail.getByText(homonym.purpose)).toHaveCount(0);
    await expect(detail.getByText('Registration time')).toBeVisible();
    await expect(projectRow(detail).getByRole('definition')).toHaveText(
      project.title,
    );
    expect(state.detailReads).toEqual([workingDocument.id]);
    expect(page.url()).not.toContain(workingDocument.id);
    expect(
      JSON.stringify(await page.evaluate(() => history.state)),
    ).not.toContain(workingDocument.id);
    expect(state.commands).toHaveLength(0);
    await capture(page, testInfo, `project-document-open-${frame}-detail.png`);

    // The Project detail and its linked row stay mounted for the return.
    if (frame === 'prisme') await navigate(page, testInfo, 'Projects');
    await expect(
      page.getByRole('heading', { name: project.title, exact: true }),
    ).toBeVisible();
    await expect(openDocument).toBeVisible();
  });

for (const frame of ['classic', 'prisme'] as const)
  test(`opens the linked Project of a superseded original Client from its Working Document in ${frame}`, async ({
    page,
  }, testInfo) => {
    const state = await installProjectDocumentsFixture(page);
    state.linked = true;
    state.revision = 1;
    state.mutable = false;
    const projectReads: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === `/api/projects/${project.id}`)
        projectReads.push(request.url());
    });
    const narrow = testInfo.project.name === 'narrow';
    await page.goto('/?frame=prisme#projects');
    if (narrow)
      await page.getByRole('button', { name: 'Open navigation' }).click();
    const activeCompany = page.getByLabel('Active Company', { exact: true });
    await activeCompany.selectOption(company.id);
    await expect(activeCompany).toBeEnabled();
    await expect(activeCompany.locator('option:checked')).toHaveText(
      company.displayName,
    );
    if (narrow)
      await page.getByRole('button', { name: 'Close navigation' }).click();
    await page.goto(`/?frame=${frame}#documents`);

    const workspace = page.locator('.working-documents');
    await workspace
      .getByRole('button', { name: workingDocument.title, exact: true })
      .click();
    const detail = workspace.getByRole('article');
    await expect(projectRow(detail).getByRole('definition')).toHaveText(
      project.title,
    );
    const openLinkedProject = detail.getByRole('button', {
      name: 'Open Project',
      exact: true,
    });
    await expect(openLinkedProject).toBeVisible();
    await capture(page, testInfo, `working-document-open-project-${frame}.png`);
    expect(projectReads).toHaveLength(0);

    await openLinkedProject.focus();
    await page.keyboard.press('Enter');

    const projects = page.locator('.project-workspace');
    await expect(projects).toBeFocused();
    await expect(page).toHaveURL(/#projects$/u);
    expect(page.url()).not.toContain(project.id);
    const opened = projects.getByRole('article', { name: project.title });
    await expect(opened).toBeVisible();
    await expect(
      opened.getByText(`Client: ${project.clientDisplayName}`),
    ).toBeVisible();
    await expect(projects).not.toContainText(project.id);
    if (frame === 'prisme') {
      await expect(
        projects.getByRole('tab', { name: 'Tasks', exact: true }),
      ).toHaveAttribute('aria-selected', 'true');
      await projects
        .getByRole('tab', { name: 'Working Documents', exact: true })
        .click();
    }
    const projectDocuments = projects.locator('.project-documents');
    await expect(
      projectDocuments.getByText(
        'The original Client is no longer active. Existing attachments are read-only.',
      ),
    ).toBeVisible();
    await expect(
      projectDocuments.getByRole('button', { name: /Attach|Remove/ }),
    ).toHaveCount(0);
    expect(projectReads).toHaveLength(1);
    expect(state.commands).toHaveLength(0);
    await capture(page, testInfo, `document-project-open-${frame}.png`);
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
  state.permissions = [
    'document.read',
    'document.reference.read',
    'document.project.manage',
    'document.correct',
  ];
  state.document = { ...workingDocument, correction: 'read-only' };
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

  // The opened Document stays readable, and its correction stays read-only.
  await documents
    .getByRole('button', { name: 'Open Document', exact: true })
    .click();
  const detail = page.locator('.working-documents').getByRole('article');
  await expect(detail.getByText(workingDocument.purpose)).toBeVisible();
  await expect(
    detail.getByRole('button', { name: 'Edit reference' }),
  ).toHaveCount(0);
  expect(state.commands).toHaveLength(0);
});
