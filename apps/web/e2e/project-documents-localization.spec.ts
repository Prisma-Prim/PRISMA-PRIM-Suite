import { selectOption } from './select-option';
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
  preparatoryLifecycle,
  operationalHomeFixture,
  unassignedResponsibility,
} from './actor-context.fixture';
import {
  DOCUMENT_VERSIONS_PATH,
  draftVersionsOf,
} from './document-versions.fixture';

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
  title: 'Pregătire {proiect} — Проект',
  status: 'preparatory',
  createdAt: '2026-09-19T00:00:00.000Z',
};
const workingDocument = {
  id: 'document-245',
  companyId: company.id,
  clientId: client.id,
  clientDisplayName: client.displayName,
  title: 'Chestionar {inițial} — Проверка',
  purpose: 'Interviu вторичный — préparer l’entretien',
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
    requests: string[];
    /** Other readable Documents, listed before the linkable one. */
    others: WorkingDocument[];
    detailReads: string[];
    commands: {
      url: string;
      company: string | undefined;
      rawBody: string | null;
      body: unknown;
      key: string | undefined;
    }[];
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
    requests: [],
    others: [],
    detailReads: [],
    commands: [],
    write: (route) => route.fulfill({ status: 500 }),
  };
  await page.route('**/api/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    state.requests.push(`${request.method()} ${path}`);
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
    if (path === `/api/projects/${project.id}/lifecycle`)
      return route.fulfill({ json: preparatoryLifecycle });
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
          documents: eligible
            ? state.linked
              ? []
              : [
                  ...state.others.map((document) => ({
                    document,
                    revision: 0,
                  })),
                  { document: state.document, revision: state.revision },
                ]
            : state.linked
              ? [{ document: state.document, revision: state.revision }]
              : [],
        },
      });
    }
    if (path === `/api/documents/${workingDocument.id}/project-association`) {
      expect(request.method()).toBe('POST');
      expect(request.headers()['x-company-context-id']).toBe(company.id);
      state.commands.push({
        url: request.url(),
        company: request.headers()['x-company-context-id'],
        rawBody: request.postData(),
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
    const versionsOf = [...state.others, state.document].find(
      (document) => DOCUMENT_VERSIONS_PATH.exec(path)?.[1] === document.id,
    );
    if (versionsOf) return route.fulfill({ json: draftVersionsOf(versionsOf) });
    return route.fulfill({ status: 404 });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  return state;
}

const locales = [
  {
    code: 'ro',
    name: 'Română',
    label: 'Limba interfeței',
    title: 'Documente de lucru',
    choose: 'Asociați un Document de lucru',
    search: 'Căutați Documente de lucru eligibile',
    attach: 'Asociați',
    remove: 'Eliminați asocierea cu',
    retry: 'Reîncercați comanda neschimbată',
    open: 'Deschideți referința externă',
    openDocument: 'Deschideți Documentul',
    confirmed: 'Comandă confirmată. Lista de mai jos se actualizează separat.',
    empty: 'Nu există Documente de lucru asociate.',
    projects: 'Proiecte',
    navigation: 'Navigare principală',
    openNavigation: 'Deschideți navigarea',
  },
  {
    code: 'ru',
    name: 'Русский',
    label: 'Язык интерфейса',
    title: 'Рабочие Документы',
    choose: 'Прикрепить рабочий Документ',
    search: 'Поиск подходящих рабочих Документов',
    attach: 'Прикрепить',
    remove: 'Убрать связь с',
    retry: 'Повторить неизменённую команду',
    open: 'Открыть внешнюю ссылку',
    openDocument: 'Открыть Документ',
    confirmed: 'Команда подтверждена. Список ниже обновляется отдельно.',
    empty: 'Нет связанных рабочих Документов.',
    projects: 'Проекты',
    navigation: 'Основная навигация',
    openNavigation: 'Открыть навигацию',
  },
  {
    code: 'fr',
    name: 'Français',
    label: 'Langue de l’interface',
    title: 'Documents de travail',
    choose: 'Associer un Document de travail',
    search: 'Rechercher des Documents de travail admissibles',
    attach: 'Associer',
    remove: 'Retirer l’association avec',
    retry: 'Réessayer la commande inchangée',
    open: 'Ouvrir la référence externe',
    openDocument: 'Ouvrir le Document',
    confirmed:
      'Commande confirmée. La liste ci-dessous est actualisée séparément.',
    empty: 'Aucun Document de travail associé.',
    projects: 'Projets',
    navigation: 'Navigation principale',
    openNavigation: 'Ouvrir la navigation',
  },
  {
    code: 'en',
    name: 'English',
    label: 'Interface language',
    title: 'Working Documents',
    choose: 'Attach working Document',
    search: 'Search eligible working Documents',
    attach: 'Attach',
    remove: 'Remove',
    retry: 'Retry unchanged command',
    open: 'Open external reference',
    openDocument: 'Open Document',
    confirmed: 'Command confirmed. The list below is refreshed separately.',
    empty: 'No working Documents attached.',
    projects: 'Projects',
    navigation: 'Primary navigation',
    openNavigation: 'Open navigation',
  },
];

async function capture(
  page: Page,
  testInfo: TestInfo,
  name: string,
  owner: Locator,
) {
  await expect(owner).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await owner.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath(name), fullPage: true });
}

for (const locale of locales) {
  test(`localizes the complete Project association journey in ${locale.code} without changing query or retry identity`, async ({
    page,
  }, testInfo) => {
    const state = await installProjectDocumentsFixture(page);
    const homonym = {
      ...workingDocument,
      id: 'document-homonym-692',
      purpose: 'A different interview to exclude',
    } satisfies WorkingDocument;
    state.others = [homonym];
    state.write = (route) => {
      const attempt = state.commands.length;
      const action = attempt <= 2 ? 'link' : 'unlink';
      expect(route.request().postDataJSON()).toEqual({
        projectId: project.id,
        action,
        expectedRevision: action === 'link' ? 0 : 1,
      });
      state.linked = action === 'link';
      state.revision = state.linked ? 1 : 2;
      if (attempt === 1) return route.fulfill({ status: 500 });
      return route.fulfill({
        json: {
          documentId: workingDocument.id,
          projectId: project.id,
          action,
          revision: state.revision,
        },
      });
    };
    await page.goto('/?frame=prisme#projects');
    if (testInfo.project.name === 'narrow')
      await page
        .getByRole('button', { name: 'Open navigation', exact: true })
        .click();
    await selectOption(
      page.getByLabel('Active Company', { exact: true }),
      company.id,
    );
    if (testInfo.project.name === 'narrow')
      await page
        .getByRole('button', { name: 'Close navigation', exact: true })
        .click();
    await page
      .getByRole('button', {
        name: `${project.title} Client: ${project.clientDisplayName}`,
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('heading', { name: project.title, exact: true }),
    ).toBeVisible();
    await page
      .getByRole('tab', { name: 'Working Documents', exact: true })
      .click();
    const owner = page.locator('.project-documents');
    await expect(
      owner.getByText('No working Documents attached.', { exact: true }),
    ).toBeVisible();
    await owner
      .getByRole('button', { name: 'Attach working Document', exact: true })
      .click();
    const input = owner.getByRole('searchbox', {
      name: 'Search eligible working Documents',
      exact: true,
    });
    await input.fill('  INTERVIU вторичный  ');
    const originalInput = await input.elementHandle();
    if (!originalInput)
      throw new Error('The rendered selector must own its input');
    await expect(owner.getByText(homonym.purpose, { exact: true })).toHaveCount(
      0,
    );
    await expect(
      owner.getByText(workingDocument.purpose, { exact: true }),
    ).toBeVisible();
    const beforeLocale = state.requests.length;
    await selectOption(page.getByLabel('Interface language', { exact: true }), {
      label: locale.name,
    });
    await expect(page.locator('html')).toHaveAttribute('lang', locale.code);
    await expect(
      page.getByRole('tab', { name: locale.title, exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    const localizedInput = owner.getByRole('searchbox', {
      name: locale.search,
      exact: true,
    });
    expect(
      await localizedInput.evaluate(
        (node, original) => node === original,
        originalInput,
      ),
    ).toBe(true);
    await expect(localizedInput).toHaveValue('  INTERVIU вторичный  ');
    expect(state.requests).toHaveLength(beforeLocale);
    await capture(
      page,
      testInfo,
      `project-documents-${locale.code}-query.png`,
      owner,
    );
    const attach = owner.getByRole('button', {
      name: `${locale.attach} ${workingDocument.title}`,
      exact: true,
    });
    await attach.focus();
    await page.keyboard.press('Enter');
    await expect(
      owner.getByRole('button', { name: locale.retry, exact: true }),
    ).toBeVisible();
    expect(state.commands).toHaveLength(1);
    const alternate = locale.code === 'en' ? locales[2] : locales[3];
    if (!alternate) throw new Error('The alternate locale must be specified');
    const beforeSwitch = state.requests.length;
    await selectOption(page.getByLabel(locale.label, { exact: true }), {
      label: alternate.name,
    });
    await expect(
      owner.getByRole('button', { name: alternate.retry, exact: true }),
    ).toBeVisible();
    const unchangedInput = owner.getByRole('searchbox', {
      name: alternate.search,
      exact: true,
    });
    expect(
      await unchangedInput.evaluate(
        (node, original) => node === original,
        originalInput,
      ),
    ).toBe(true);
    await expect(unchangedInput).toHaveValue('  INTERVIU вторичный  ');
    expect(state.requests).toHaveLength(beforeSwitch);
    await expect(
      owner.getByRole('button', {
        name: `${alternate.attach} ${workingDocument.title}`,
        exact: true,
      }),
    ).toBeDisabled();
    await capture(
      page,
      testInfo,
      `project-documents-${locale.code}-uncertain.png`,
      owner,
    );
    await owner
      .getByRole('button', { name: alternate.retry, exact: true })
      .click();
    await expect(
      owner.getByRole('link', { name: alternate.open, exact: true }),
    ).toBeVisible();
    await expect(
      owner.getByText(alternate.confirmed, { exact: true }),
    ).toBeVisible();
    expect(state.commands).toHaveLength(2);
    expect(state.commands[1]).toEqual(state.commands[0]);
    expect(state.commands[0]).toMatchObject({
      company: company.id,
      body: { projectId: project.id, action: 'link', expectedRevision: 0 },
    });
    expect(state.commands[0]?.key).toBeTruthy();
    await selectOption(page.getByLabel(alternate.label, { exact: true }), {
      label: locale.name,
    });
    const reference = owner.getByRole('link', {
      name: locale.open,
      exact: true,
    });
    await expect(reference).toHaveAttribute(
      'href',
      workingDocument.version.representation.url,
    );
    await expect(reference).toHaveAttribute('target', '_blank');
    await expect(reference).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(
      owner.getByText(locale.confirmed, { exact: true }),
    ).toBeVisible();
    await capture(
      page,
      testInfo,
      `project-documents-${locale.code}-confirmed.png`,
      owner,
    );
    // The existing destination owns a fresh read; equal titles never choose an id.
    const open = owner.getByRole('button', {
      name: locale.openDocument,
      exact: true,
    });
    await open.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#documents')).toBeFocused();
    const detail = page.locator('.working-documents').getByRole('article');
    await expect(
      detail.getByText(workingDocument.purpose, { exact: true }),
    ).toBeVisible();
    await expect(
      detail.getByText(homonym.purpose, { exact: true }),
    ).toHaveCount(0);
    expect(state.detailReads).toEqual([workingDocument.id]);
    expect(page.url()).not.toContain(workingDocument.id);
    expect(
      JSON.stringify(await page.evaluate(() => history.state)),
    ).not.toContain(workingDocument.id);
    if (testInfo.project.name === 'narrow')
      await page
        .getByRole('button', { name: locale.openNavigation, exact: true })
        .click();
    await page
      .getByRole('navigation', { name: locale.navigation, exact: true })
      .getByRole('link', { name: locale.projects, exact: true })
      .click();
    await expect(
      page.getByRole('tab', { name: locale.title, exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(
      owner.getByRole('heading', { name: workingDocument.title, exact: true }),
    ).toBeVisible();
    await owner
      .getByRole('button', {
        name: `${locale.remove} ${workingDocument.title}`,
        exact: true,
      })
      .click();
    await expect(owner.getByText(locale.empty, { exact: true })).toBeVisible();
    expect(state.commands).toHaveLength(3);
    expect(state.commands[2]?.body).toEqual({
      projectId: project.id,
      action: 'unlink',
      expectedRevision: 1,
    });
    expect(state.commands[2]?.key).not.toEqual(state.commands[0]?.key);
    await capture(
      page,
      testInfo,
      `project-documents-${locale.code}-removed.png`,
      owner,
    );
    await originalInput.dispose();
  });
}
