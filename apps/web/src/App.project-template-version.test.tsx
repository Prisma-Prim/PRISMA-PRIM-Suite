import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import { changeValue } from './test/select-option';
import { templateFixture } from './project/project-template.test-fixtures';
import { InterfaceLocaleSelect } from './localization/InterfaceLocaleSelect';

const companyId = '10000000-0000-4000-8000-000000000001';
const clientId = '20000000-0000-4000-8000-000000000001';
const actor = {
  internalUserId: 'owner',
  workspaceMembershipId: 'member',
  workspaceId: 'workspace',
  workspaceName: 'Workspace',
  displayName: 'Owner',
  email: 'owner@example.test',
  active: true,
  workspacePermissions: ['client.manage', 'company.manage'],
  activeCompany: {
    id: companyId,
    displayName: 'Company Demo',
    clientPermissions: [],
    projectPermissions: ['project.read', 'project.create'],
    taskPermissions: ['task.read', 'task.manage'],
    taskPermissionAssignmentId: 'task-grant',
    taskPermissionSetVersion: 'v1',
    projectTemplatePermissions: [
      'project.template.read',
      'project.template.instantiate',
    ],
    projectTemplatePermissionAssignmentId: 'template-grant',
    projectTemplatePermissionSetVersion: 'v1',
    projectTemplateConfigurationPermissions: [
      'project.template.version.create',
    ],
    projectTemplateConfigurationPermissionAssignmentId: 'configuration-grant',
    projectTemplateConfigurationPermissionSetVersion: 'v1',
  },
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/#projects');
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

it('publishes only the four previewed literal Task titles and keeps exact Version selection explicit in the real App', async () => {
  const changedTitle = 'Clarifier {nouveau} — Демо';
  let published = false;
  const writes: Array<{
    body: unknown;
    key: string | null;
    company: string | null;
  }> = [];
  const successor = {
    ...templateFixture,
    version: 2,
    stages: templateFixture.stages.map((stage) => ({
      ...stage,
      tasks: stage.tasks.map((task) => ({
        ...task,
        title: task.key === 'clarify_request' ? changedTitle : task.title,
      })),
    })),
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(input.toString(), window.location.origin).pathname;
      if (path === '/api/access/current-actor') return Response.json(actor);
      if (path === '/api/companies')
        return Response.json([{ id: companyId, displayName: 'Company Demo' }]);
      if (path === '/api/activity-log') return Response.json({ events: [] });
      if (path === '/api/operational-home')
        return Response.json({ companyId, today: '2026-10-18', summaries: [] });
      if (path === '/api/clients')
        return Response.json([
          { id: clientId, displayName: 'Original Client' },
        ]);
      if (path === '/api/projects') return Response.json([]);
      if (path === '/api/assigned-tasks') return Response.json({ tasks: [] });
      if (path === '/api/project-templates')
        return Response.json({
          templates: published
            ? [successor, templateFixture]
            : [templateFixture],
          headVersion: published ? 2 : 1,
          nextBeforeVersion: null,
        });
      if (
        path ===
          '/api/project-templates/CONSULTING_PREPARATION_ILLUSTRATIVE/versions' &&
        init?.method === 'POST'
      ) {
        const headers = new Headers(init.headers);
        const value: unknown = JSON.parse(
          typeof init.body === 'string' ? init.body : '{}',
        );
        writes.push({
          body: value,
          key: headers.get('idempotency-key'),
          company: headers.get('x-company-context-id'),
        });
        published = true;
        return Response.json(
          {
            versionId: '30000000-0000-4000-8000-000000000001',
            templateKey: templateFixture.templateKey,
            version: 2,
            sourceVersion: 1,
          },
          { status: 201 },
        );
      }
      return new Response(null, { status: 404 });
    }),
  );
  render(<App identity={deterministicBrowserIdentity()} />);
  const projects = await screen.findByRole('region', { name: 'Projects' });
  const selector = await within(projects).findByRole('combobox', {
    name: 'Project template',
  });
  changeValue(selector, 'CONSULTING_PREPARATION_ILLUSTRATIVE:1');
  expect(selector).toHaveAttribute(
    'data-value',
    'CONSULTING_PREPARATION_ILLUSTRATIVE:1',
  );
  const configuration = await screen.findByRole('region', {
    name: 'Template Versions',
  });
  const publish = within(configuration).getByRole('button', {
    name: 'Publish successor Version',
  });
  expect(publish).toBeDisabled();
  changeValue(
    within(configuration).getByRole('textbox', {
      name: 'Required Task 1 title',
    }),
    changedTitle,
  );
  expect(
    within(configuration).getByRole('list', { name: 'Successor preview' }),
  ).toHaveTextContent(changedTitle);
  expect(publish).toBeEnabled();
  fireEvent.click(publish);
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toEqual({
    body: {
      sourceVersion: 1,
      expectedHeadVersion: 1,
      taskTitles: {
        clarify_request: changedTitle,
        confirm_scope: 'Confirmer le périmètre',
        collect_questionnaire: 'Recueillir le questionnaire',
        prepare_plan: 'Préparer le plan',
      },
    },
    key: expect.any(String),
    company: companyId,
  });
  await within(configuration).findByText('Successor Version 2 published.');
  const refreshedSelector = await within(projects).findByRole('combobox', {
    name: 'Project template',
  });
  expect(refreshedSelector).toHaveAttribute(
    'data-value',
    'CONSULTING_PREPARATION_ILLUSTRATIVE:1',
  );
  changeValue(refreshedSelector, 'CONSULTING_PREPARATION_ILLUSTRATIVE:2');
  expect(refreshedSelector).toHaveAttribute(
    'data-value',
    'CONSULTING_PREPARATION_ILLUSTRATIVE:2',
  );
});

it('offers configuration with catalogue read without Client, Task or Project-create access and issues no real-record or eligible-member requests', async () => {
  const configurationActor = {
    ...actor,
    workspacePermissions: [],
    activeCompany: {
      ...actor.activeCompany,
      projectPermissions: ['project.read'],
      taskPermissions: undefined,
      taskPermissionAssignmentId: undefined,
      taskPermissionSetVersion: undefined,
    },
  };
  const forbiddenReads: string[] = [];
  const publications: unknown[] = [];
  let published = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(input.toString(), window.location.origin).pathname;
      if (path === '/api/access/current-actor')
        return Response.json(configurationActor);
      if (path === '/api/companies')
        return Response.json([{ id: companyId, displayName: 'Company Demo' }]);
      if (path === '/api/activity-log') return Response.json({ events: [] });
      if (path === '/api/project-templates')
        return Response.json({
          templates: published
            ? catalogue(2, 'Configuration sans instances — Демо').templates
            : [templateFixture],
          headVersion: published ? 2 : 1,
          nextBeforeVersion: null,
        });
      if (
        path ===
          '/api/project-templates/CONSULTING_PREPARATION_ILLUSTRATIVE/versions' &&
        init?.method === 'POST'
      ) {
        const value: unknown = JSON.parse(
          typeof init.body === 'string' ? init.body : '{}',
        );
        publications.push(value);
        published = true;
        return Response.json(
          {
            versionId: '30000000-0000-4000-8000-000000000002',
            templateKey: templateFixture.templateKey,
            version: 2,
            sourceVersion: 1,
          },
          { status: 201 },
        );
      }
      forbiddenReads.push(path);
      return new Response(null, { status: 403 });
    }),
  );
  render(<App identity={deterministicBrowserIdentity()} />);
  const configuration = await screen.findByRole('region', {
    name: 'Template Versions',
  });
  const title = await within(configuration).findByRole('textbox', {
    name: 'Required Task 1 title',
  });
  expect(title).toHaveValue('Clarifier la demande');
  expect(
    screen.queryByRole('textbox', { name: 'Project title' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('region', { name: 'Tasks' }),
  ).not.toBeInTheDocument();
  changeValue(title, 'Configuration sans instances — Демо');
  fireEvent.click(
    within(configuration).getByRole('button', {
      name: 'Publish successor Version',
    }),
  );
  await within(configuration).findByText('Successor Version 2 published.');
  expect(publications).toHaveLength(1);
  expect(forbiddenReads).toEqual([]);
});

function configurationOnlyActor() {
  return {
    ...actor,
    workspacePermissions: [],
    activeCompany: {
      ...actor.activeCompany,
      projectPermissions: ['project.read'],
      taskPermissions: undefined,
      taskPermissionAssignmentId: undefined,
      taskPermissionSetVersion: undefined,
    },
  };
}
function catalogue(version = 1, title = 'Clarifier la demande') {
  return {
    templates: [
      {
        ...templateFixture,
        version,
        stages: templateFixture.stages.map((stage) => ({
          ...stage,
          tasks: stage.tasks.map((task) => ({
            ...task,
            title: task.key === 'clarify_request' ? title : task.title,
          })),
        })),
      },
    ],
    headVersion: version,
    nextBeforeVersion: null,
  };
}
function receipt(version = 2) {
  return Response.json(
    {
      versionId: '30000000-0000-4000-8000-000000000001',
      templateKey: templateFixture.templateKey,
      version,
      sourceVersion: version - 1,
    },
    { status: 201 },
  );
}
function mockConfigurationHttp(
  override: (
    path: string,
    init?: RequestInit,
  ) => Response | Promise<Response> | undefined,
) {
  const reads: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(input.toString(), window.location.origin).pathname;
      if (!init?.method || init.method === 'GET') reads.push(path);
      const overridden = override(path, init);
      if (overridden !== undefined) return overridden;
      if (path === '/api/access/current-actor')
        return Response.json(configurationOnlyActor());
      if (path === '/api/companies')
        return Response.json([{ id: companyId, displayName: 'Company Demo' }]);
      if (path === '/api/activity-log') return Response.json({ events: [] });
      if (path === '/api/project-templates') return Response.json(catalogue());
      return new Response(null, { status: 404 });
    }),
  );
  return reads;
}

it('keeps literal drafts and frozen uncertain command bytes, key and source across all four locales without locale-only requests', async () => {
  const writes: Array<{
    body: BodyInit | null | undefined;
    key: string | null;
  }> = [];
  let acknowledged = false;
  const reads = mockConfigurationHttp((path, init) => {
    if (path.endsWith('/versions') && init?.method === 'POST') {
      writes.push({
        body: init.body,
        key: new Headers(init.headers).get('idempotency-key'),
      });
      if (writes.length === 1) return new Response(null, { status: 503 });
      acknowledged = true;
      return receipt();
    }
    if (path === '/api/project-templates' && acknowledged)
      return Response.json(catalogue(2, 'Préserver {le littéral} — Демо'));
    return undefined;
  });
  render(
    <>
      <InterfaceLocaleSelect />
      <App identity={deterministicBrowserIdentity()} />
    </>,
  );
  const region = await screen.findByRole('region', {
    name: 'Template Versions',
  });
  const field = await within(region).findByRole('textbox', {
    name: 'Required Task 1 title',
  });
  const publish = within(region).getByRole('button', {
    name: 'Publish successor Version',
  });
  changeValue(field, '  Clarifier la demande  ');
  expect(publish).toBeDisabled();
  changeValue(field, '   ');
  expect(publish).toBeDisabled();
  expect(within(region).getByRole('alert')).toHaveTextContent(
    'Each of the four Task titles',
  );
  const literal = '  Préserver {le littéral} — Демо  ';
  changeValue(field, literal);
  fireEvent.click(publish);
  await within(region).findByRole('button', {
    name: 'Retry exact publication',
  });
  expect(field).toHaveValue(literal);
  expect(field).toBeDisabled();
  expect(
    within(region).getByRole('button', {
      name: 'Reload current Template head',
    }),
  ).toBeDisabled();
  const readCount = reads.length;
  for (const [locale, label, retry] of [
    ['fr', 'Titre de la Tâche requise 1', 'Réessayer la publication exacte'],
    ['ru', 'Название обязательной Задачи 1', 'Повторить точную публикацию'],
    ['ro', 'Titlul Sarcinii obligatorii 1', 'Reîncercați publicarea exactă'],
    ['en', 'Required Task 1 title', 'Retry exact publication'],
  ]) {
    if (!locale || !label || !retry)
      throw new Error('Missing locale expectation.');
    changeValue(
      screen.getByRole('combobox', {
        name: /Interface language|Langue de l’interface|Язык интерфейса|Limba interfeței/,
      }),
      locale,
    );
    expect(screen.getByRole('textbox', { name: label })).toHaveValue(literal);
    expect(screen.getByRole('textbox', { name: label })).toBeDisabled();
    expect(screen.getByRole('button', { name: retry })).toBeEnabled();
    expect(reads).toHaveLength(readCount);
    expect(writes).toHaveLength(1);
  }
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry exact publication' }),
  );
  await screen.findByText('Successor Version 2 published.');
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual(writes[0]);
  expect(writes[0]?.key).toBeTruthy();
  const command: unknown = JSON.parse(
    typeof writes[0]?.body === 'string' ? writes[0].body : '{}',
  );
  expect(command).toMatchObject({
    sourceVersion: 1,
    expectedHeadVersion: 1,
    taskTitles: { clarify_request: literal.trim() },
  });
});

it('requires explicit reload after a stale head and never rebases or automatically republishes the captured intention', async () => {
  let head = 1;
  const writes: unknown[] = [];
  const reads = mockConfigurationHttp((path, init) => {
    if (path === '/api/project-templates')
      return Response.json(
        catalogue(
          head,
          head === 1 ? 'Clarifier la demande' : 'Another published literal',
        ),
      );
    if (path.endsWith('/versions') && init?.method === 'POST') {
      writes.push(JSON.parse(typeof init.body === 'string' ? init.body : '{}'));
      head = 2;
      return Response.json(
        { code: 'template_publication_stale_head' },
        { status: 409 },
      );
    }
    return undefined;
  });
  render(<App identity={deterministicBrowserIdentity()} />);
  const region = await screen.findByRole('region', {
    name: 'Template Versions',
  });
  const field = await within(region).findByRole('textbox', {
    name: 'Required Task 1 title',
  });
  changeValue(field, 'Keep this stale literal');
  const before = reads.length;
  fireEvent.click(
    within(region).getByRole('button', { name: 'Publish successor Version' }),
  );
  await within(region).findByText(
    'The Template head changed. Explicitly reload before publishing again.',
  );
  expect(field).toHaveValue('Keep this stale literal');
  expect(field).toBeDisabled();
  expect(reads).toHaveLength(before);
  expect(writes).toHaveLength(1);
  fireEvent.click(
    within(region).getByRole('button', {
      name: 'Reload current Template head',
    }),
  );
  await waitFor(() =>
    expect(
      within(region).getByRole('textbox', { name: 'Required Task 1 title' }),
    ).toHaveValue('Another published literal'),
  );
  expect(within(region).getByText(/Source Version 2/)).toBeInTheDocument();
  expect(writes).toHaveLength(1);
});

it('suppresses a late successful publication acknowledgement after the real App session is replaced', async () => {
  let resolvePublication: ((response: Response) => void) | undefined;
  const writes: string[] = [];
  mockConfigurationHttp((path, init) => {
    if (path.endsWith('/versions') && init?.method === 'POST') {
      writes.push(path);
      return new Promise<Response>((resolve) => {
        resolvePublication = resolve;
      });
    }
    return undefined;
  });
  const identity = deterministicBrowserIdentity();
  const app = render(<App identity={identity} />);
  const region = await screen.findByRole('region', {
    name: 'Template Versions',
  });
  changeValue(
    await within(region).findByRole('textbox', {
      name: 'Required Task 1 title',
    }),
    'Retired session literal',
  );
  fireEvent.click(
    within(region).getByRole('button', { name: 'Publish successor Version' }),
  );
  await waitFor(() => expect(writes).toHaveLength(1));
  app.rerender(
    <App
      identity={{
        ...identity,
        signedIn: false,
        signedOutView: <p>Session retired</p>,
      }}
    />,
  );
  await screen.findByText('Session retired');
  if (!resolvePublication) throw new Error('Expected pending public command.');
  const completePublication = resolvePublication;
  await act(async () => {
    completePublication(receipt());
  });
  await waitFor(() =>
    expect(
      screen.queryByText('Successor Version 2 published.'),
    ).not.toBeInTheDocument(),
  );
  expect(screen.queryByText('Retired session literal')).not.toBeInTheDocument();
});

it('retires Company-specific drafts and ignores a late source response after an explicit Company switch', async () => {
  const secondCompany = '10000000-0000-4000-8000-000000000002';
  let sourceCalls = 0;
  let resolveOldSource: ((response: Response) => void) | undefined;
  mockConfigurationHttp((path, init) => {
    const selected = new Headers(init?.headers).get('x-company-context-id');
    if (path === '/api/companies')
      return Response.json([
        { id: companyId, displayName: 'Company Demo' },
        { id: secondCompany, displayName: 'Second Company' },
      ]);
    if (path === '/api/access/current-actor') {
      const current = configurationOnlyActor();
      return Response.json({
        ...current,
        activeCompany: {
          ...current.activeCompany,
          id: selected || companyId,
          displayName:
            selected === secondCompany ? 'Second Company' : 'Company Demo',
        },
      });
    }
    if (path === '/api/project-templates') {
      sourceCalls++;
      if (selected === secondCompany)
        return Response.json(catalogue(2, 'Second Company private successor'));
      if (sourceCalls > 1)
        return new Promise<Response>((resolve) => {
          resolveOldSource = resolve;
        });
      return Response.json(catalogue());
    }
    return undefined;
  });
  render(<App identity={deterministicBrowserIdentity()} />);
  const configuration = await screen.findByRole('region', {
    name: 'Template Versions',
  });
  changeValue(
    await within(configuration).findByRole('textbox', {
      name: 'Required Task 1 title',
    }),
    'Private original Company draft',
  );
  fireEvent.click(
    within(configuration).getByRole('button', {
      name: 'Reload current Template head',
    }),
  );
  await waitFor(() => expect(resolveOldSource).toBeDefined());
  changeValue(
    screen.getByRole('combobox', { name: 'Active Company' }),
    secondCompany,
  );
  await waitFor(() =>
    expect(
      screen.getByRole('textbox', { name: 'Required Task 1 title' }),
    ).toHaveValue('Second Company private successor'),
  );
  if (!resolveOldSource)
    throw new Error('Expected held original Company source.');
  const completeOldSource = resolveOldSource;
  await act(async () => {
    completeOldSource(
      Response.json(catalogue(2, 'Late unauthorized Company literal')),
    );
  });
  await waitFor(() =>
    expect(
      screen.getByRole('textbox', { name: 'Required Task 1 title' }),
    ).toHaveValue('Second Company private successor'),
  );
  expect(
    screen.queryByText('Late unauthorized Company literal'),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByDisplayValue('Private original Company draft'),
  ).not.toBeInTheDocument();
});

it('retires Configuration and its private draft when publication revalidation confirms Workspace membership loss', async () => {
  let suspended = false;
  mockConfigurationHttp((path, init) => {
    if (path === '/api/access/current-actor' && suspended)
      return new Response(null, { status: 403 });
    if (path.endsWith('/versions') && init?.method === 'POST') {
      suspended = true;
      return new Response(null, { status: 403 });
    }
    return undefined;
  });
  render(<App identity={deterministicBrowserIdentity()} />);
  const region = await screen.findByRole('region', {
    name: 'Template Versions',
  });
  changeValue(
    await within(region).findByRole('textbox', {
      name: 'Required Task 1 title',
    }),
    'Private draft before suspension',
  );
  fireEvent.click(
    within(region).getByRole('button', { name: 'Publish successor Version' }),
  );
  await screen.findByText('Your access to this workspace is inactive.');
  expect(
    screen.queryByRole('region', { name: 'Template Versions' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByDisplayValue('Private draft before suspension'),
  ).not.toBeInTheDocument();
});
