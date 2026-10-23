import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
} from '../localization/interface-locale';
import { InterfaceLocaleSelect } from '../localization/InterfaceLocaleSelect';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import { changeValue } from '../test/select-option';
import { ProjectWorkspace } from './ProjectWorkspace';
import {
  copiedPlanFixture,
  templateFixture,
} from './project-template.test-fixtures';
import {
  isLifecycleRead,
  preparatoryLifecycle,
} from './project-lifecycle.test-fixtures';

const companyId = '10000000-0000-4000-8000-000000000001';
const clientId = '20000000-0000-4000-8000-000000000001';
const projectId = '30000000-0000-4000-8000-000000000001';
const actor: ActorContext = {
  internalUserId: 'owner',
  workspaceMembershipId: 'member',
  workspaceId: 'workspace',
  workspaceName: 'Workspace',
  displayName: 'Owner',
  email: 'owner@example.test',
  active: true,
  workspacePermissions: ['client.manage'],
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
  },
};
const project = {
  id: projectId,
  companyId,
  clientAccountId: clientId,
  clientDisplayName: 'Client {original} — Демо',
  title: 'Préparation {originale} — Демо',
  status: 'preparatory',
  createdAt: '2026-10-16T12:00:00.000Z',
};
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});
function view(givenActor = actor, identity = deterministicBrowserIdentity()) {
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
  return render(workspaceElement(givenActor, identity));
}
function workspaceElement(
  givenActor: ActorContext,
  identity: ReturnType<typeof deterministicBrowserIdentity>,
) {
  return (
    <InterfaceLocaleProvider>
      <InterfaceLocaleSelect />
      <ApplicationPresentation.Provider value="prisme">
        <ProjectWorkspace actor={givenActor} identity={identity} />
      </ApplicationPresentation.Provider>
    </InterfaceLocaleProvider>
  );
}
function baseRead(url: string) {
  if (url === '/api/projects') return Response.json([]);
  if (url === '/api/clients')
    return Response.json([
      { id: clientId, displayName: project.clientDisplayName },
    ]);
  if (url === '/api/project-templates')
    return Response.json({ templates: [templateFixture] });
  if (url === `/api/projects/${projectId}/template`)
    return Response.json({ template: copiedPlanFixture });
  if (url === `/api/projects/${projectId}/tasks`)
    return Response.json({ mutable: true, tasks: [] });
  if (url === `/api/projects/${projectId}`) return Response.json(project);
  if (isLifecycleRead(url)) return Response.json(preparatoryLifecycle);
  return new Response(null, { status: 404 });
}

it('preserves the exact model creation command and entered business content through uncertainty and locale changes', async () => {
  const writes: Array<{
    path: string;
    body: string | undefined;
    key: string | null;
    company: string | null;
  }> = [];
  const reads: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        writes.push({
          path: url,
          body: typeof init.body === 'string' ? init.body : undefined,
          key: new Headers(init.headers).get('idempotency-key'),
          company: new Headers(init.headers).get('x-company-context-id'),
        });
        return writes.length === 1
          ? new Response(null, { status: 503 })
          : Response.json(project);
      }
      reads.push(url);
      return baseRead(url);
    }),
  );
  view();
  await screen.findByRole('textbox', { name: 'Project title' });
  const control = await screen.findByRole('combobox', {
    name: 'Project template',
  });
  changeValue(
    screen.getByRole('textbox', { name: 'Project title' }),
    project.title,
  );
  changeValue(screen.getByRole('combobox', { name: 'Client' }), clientId);
  changeValue(control, 'CONSULTING_PREPARATION_ILLUSTRATIVE:1');
  expect(
    screen.getByText(
      'Illustrative template. Creates four unassigned Tasks without due dates. Does not authorize a real engagement to start.',
    ),
  ).toBeVisible();
  fireEvent.click(
    screen.getByRole('button', { name: 'Create Project from template' }),
  );
  await screen.findByText(
    'The Project creation could not be confirmed. Retry the same details safely.',
  );
  expect(writes).toHaveLength(1);
  const initialBody: unknown = JSON.parse(writes[0]?.body ?? '{}');
  expect(initialBody).toEqual({
    title: project.title,
    clientAccountId: clientId,
    templateKey: 'CONSULTING_PREPARATION_ILLUSTRATIVE',
    templateVersion: 1,
  });
  expect(writes[0]?.key).toBeTruthy();
  expect(writes[0]?.company).toBe(companyId);
  const before = [...reads];
  changeValue(
    screen.getByRole('combobox', { name: 'Interface language' }),
    'fr',
  );
  expect(screen.getByRole('textbox', { name: 'Titre du Projet' })).toHaveValue(
    project.title,
  );
  expect(
    screen.getByRole('combobox', { name: 'Modèle de Projet' }),
  ).toHaveTextContent('Préparation d’une mission de conseil — Version 1');
  expect(
    screen.getByText(
      'La création du Projet n’a pas pu être confirmée. Réessayez avec les mêmes informations en toute sécurité.',
    ),
  ).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(reads).toEqual(before);
  fireEvent.click(
    screen.getByRole('button', { name: 'Créer le Projet depuis le modèle' }),
  );
  const plan = await screen.findByRole('region', {
    name: 'Plan copié depuis le modèle',
  });
  expect(
    await within(plan).findByText('Clarifier la demande — Obligatoire'),
  ).toBeVisible();
  expect(
    within(plan).getByText('Préparer le plan — Obligatoire'),
  ).toBeVisible();
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual(writes[0]);
  expect(screen.getByRole('heading', { name: project.title })).toBeVisible();
  expect(
    within(plan).queryByRole('button', { name: /advance|passage/i }),
  ).not.toBeInTheDocument();
});

it('keeps the ordinary manual creation payload unchanged when no model is selected', async () => {
  const writes: Array<{ path: string; body: unknown }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const parsed: unknown = JSON.parse(
          typeof init.body === 'string' ? init.body : '{}',
        );
        writes.push({ path: url, body: parsed });
        return Response.json(project);
      }
      return baseRead(url);
    }),
  );
  view();
  await screen.findByRole('combobox', { name: 'Project template' });
  changeValue(
    screen.getByRole('textbox', { name: 'Project title' }),
    project.title,
  );
  changeValue(screen.getByRole('combobox', { name: 'Client' }), clientId);
  fireEvent.click(screen.getByRole('button', { name: 'Create Project' }));
  await waitFor(() =>
    expect(writes).toEqual([
      {
        path: '/api/projects',
        body: { title: project.title, clientAccountId: clientId },
      },
    ]),
  );
});

it('preserves an independently authorized manual creation draft and its exact uncertain retry when only the Template grant is replaced', async () => {
  const writes: Array<{ path: string; body: unknown; key: string | null }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const body: unknown = JSON.parse(
          typeof init.body === 'string' ? init.body : '{}',
        );
        writes.push({
          path: url,
          body,
          key: new Headers(init.headers).get('idempotency-key'),
        });
        return writes.length === 1
          ? new Response(null, { status: 503 })
          : Response.json(project);
      }
      return baseRead(url);
    }),
  );
  const identity = deterministicBrowserIdentity();
  const mounted = view(actor, identity);
  await screen.findByRole('combobox', { name: 'Project template' });
  changeValue(
    screen.getByRole('textbox', { name: 'Project title' }),
    project.title,
  );
  changeValue(screen.getByRole('combobox', { name: 'Client' }), clientId);
  fireEvent.click(screen.getByRole('button', { name: 'Create Project' }));
  await screen.findByText(
    'The Project could not be loaded or saved. Please try again.',
  );
  expect(writes).toHaveLength(1);

  mounted.rerender(workspaceElement(replacedTemplateGrant(), identity));
  await screen.findByRole('combobox', { name: 'Project template' });
  expect(screen.getByRole('textbox', { name: 'Project title' })).toHaveValue(
    project.title,
  );
  expect(screen.getByRole('combobox', { name: 'Client' })).toHaveTextContent(
    project.clientDisplayName,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Create Project' }));
  await screen.findByRole('heading', { name: project.title });
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual(writes[0]);
  expect(writes[0]).toMatchObject({
    path: '/api/projects',
    body: { title: project.title, clientAccountId: clientId },
  });
});

it('preserves the selected Project and independently authorized Task draft when the Template grant is revoked', async () => {
  let respondToTasks: ((response: Response) => void) | undefined;
  const tasksReply = new Promise<Response>((resolve) => {
    respondToTasks = resolve;
  });
  const readTasks = vi.fn(() => tasksReply);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/projects') return Response.json([project]);
      if (url === `/api/projects/${projectId}/tasks`) return readTasks();
      if (url.endsWith('/eligible-task-assignees'))
        return Response.json({ members: [] });
      return baseRead(url);
    }),
  );
  const identity = deterministicBrowserIdentity();
  const mounted = view(actor, identity);
  fireEvent.click(
    await screen.findByRole('button', {
      name: `${project.title} Client: ${project.clientDisplayName}`,
    }),
  );
  const opened = await screen.findByRole('article', { name: project.title });
  await screen.findByRole('region', { name: 'Plan copied from template' });
  const tasks = await screen.findByRole('region', { name: 'Tasks' });
  await waitFor(() => expect(readTasks).toHaveBeenCalledOnce());
  expect(
    within(tasks).queryByRole('textbox', { name: 'Task title' }),
  ).not.toBeInTheDocument();
  await act(async () => {
    if (!respondToTasks) throw new Error('The Task read was not held.');
    respondToTasks(Response.json({ mutable: true, tasks: [] }));
    await tasksReply;
  });
  const taskTitle = await within(tasks).findByRole('textbox', {
    name: 'Task title',
  });
  changeValue(taskTitle, 'Keep this independently authorized Task draft');

  mounted.rerender(workspaceElement(withoutTemplateGrant(), identity));
  expect(screen.getByRole('article', { name: project.title })).toBe(opened);
  expect(taskTitle).toHaveValue(
    'Keep this independently authorized Task draft',
  );
  expect(taskTitle).toBeInTheDocument();
  expect(
    screen.queryByRole('combobox', { name: 'Project template' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('region', { name: 'Plan copied from template' }),
  ).not.toBeInTheDocument();
});

it('retires Template selection and an in-flight Template reply when its captured grant changes', async () => {
  let respond: ((response: Response) => void) | undefined;
  const reply = new Promise<Response>((resolve) => {
    respond = resolve;
  });
  let pendingSignal: AbortSignal | null | undefined;
  const writes: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        writes.push(url);
        pendingSignal = init.signal;
        return reply;
      }
      return baseRead(url);
    }),
  );
  const identity = deterministicBrowserIdentity();
  const mounted = view(actor, identity);
  const selector = await screen.findByRole('combobox', {
    name: 'Project template',
  });
  changeValue(
    screen.getByRole('textbox', { name: 'Project title' }),
    project.title,
  );
  changeValue(screen.getByRole('combobox', { name: 'Client' }), clientId);
  changeValue(selector, 'CONSULTING_PREPARATION_ILLUSTRATIVE:1');
  fireEvent.click(
    screen.getByRole('button', { name: 'Create Project from template' }),
  );
  await waitFor(() => expect(writes).toEqual(['/api/projects/from-template']));

  mounted.rerender(workspaceElement(replacedTemplateGrant(), identity));
  expect(pendingSignal?.aborted).toBe(true);
  expect(
    await screen.findByRole('combobox', { name: 'Project template' }),
  ).toHaveTextContent('No template — manual preparation');
  function releaseReply() {
    if (!respond) throw new Error('The Template response was not held.');
    respond(Response.json(project));
  }
  await act(async () => {
    releaseReply();
    await reply;
  });
  expect(
    screen.queryByRole('heading', { name: project.title }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('region', { name: 'Plan copied from template' }),
  ).not.toBeInTheDocument();
  expect(writes).toHaveLength(1);
});

it.each([true, false])(
  'recovers independent Project and Task access after a server Template denial, with projection refreshed during recovery: %s',
  async (refreshDuringRecovery) => {
    let respondToCommand: ((response: Response) => void) | undefined;
    const commandReply = new Promise<Response>((resolve) => {
      respondToCommand = resolve;
    });
    let respondToProjects: ((response: Response) => void) | undefined;
    const projectsReply = new Promise<Response>((resolve) => {
      respondToProjects = resolve;
    });
    const writes: Array<{ path: string; body: unknown; key: string | null }> =
      [];
    let projectReads = 0;
    let templateDenied = false;
    let recoverySignal: AbortSignal | null | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          writes.push({
            path: url,
            body: init.body,
            key: new Headers(init.headers).get('idempotency-key'),
          });
          return writes.length === 1 ? commandReply : Response.json(project);
        }
        if (url === '/api/projects') {
          projectReads += 1;
          if (!templateDenied) return Response.json([project]);
          recoverySignal = init?.signal;
          return projectsReply;
        }
        if (url.endsWith('/eligible-task-assignees'))
          return Response.json({ members: [] });
        return baseRead(url);
      }),
    );
    const identity = deterministicBrowserIdentity();
    const mounted = view(actor, identity);
    await screen.findByRole('button', {
      name: `${project.title} Client: ${project.clientDisplayName}`,
    });
    const selector = await screen.findByRole('combobox', {
      name: 'Project template',
    });
    changeValue(
      screen.getByRole('textbox', { name: 'Project title' }),
      'Denied Template intention',
    );
    changeValue(screen.getByRole('combobox', { name: 'Client' }), clientId);
    changeValue(selector, 'CONSULTING_PREPARATION_ILLUSTRATIVE:1');
    fireEvent.click(
      screen.getByRole('button', { name: 'Create Project from template' }),
    );
    await waitFor(() => expect(writes).toHaveLength(1));
    await act(async () => {
      if (!respondToCommand)
        throw new Error('The Template command was not held.');
      templateDenied = true;
      respondToCommand(new Response(null, { status: 403 }));
      await commandReply;
    });
    await screen.findByText('Explicit Project template access is required.');
    await waitFor(() => expect(projectReads).toBe(2));
    expect(
      screen.queryByRole('button', {
        name: `${project.title} Client: ${project.clientDisplayName}`,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Create Project' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: 'Project template' }),
    ).not.toBeInTheDocument();
    if (refreshDuringRecovery)
      mounted.rerender(workspaceElement(withoutTemplateGrant(), identity));
    expect(recoverySignal?.aborted).toBe(false);
    await act(async () => {
      if (!respondToProjects)
        throw new Error('The Project recovery read was not held.');
      respondToProjects(Response.json([project]));
      await projectsReply;
    });
    const open = await screen.findByRole('button', {
      name: `${project.title} Client: ${project.clientDisplayName}`,
    });
    expect(open).toBeEnabled();
    expect(
      screen.queryByRole('combobox', { name: 'Project template' }),
    ).not.toBeInTheDocument();
    if (!refreshDuringRecovery)
      mounted.rerender(workspaceElement(withoutTemplateGrant(), identity));
    expect(
      screen.getByRole('button', { name: 'Create Project' }),
    ).toBeEnabled();
    expect(screen.getByRole('textbox', { name: 'Project title' })).toHaveValue(
      'Denied Template intention',
    );
    fireEvent.click(open);
    const tasks = await screen.findByRole('region', { name: 'Tasks' });
    const taskTitle = await within(tasks).findByRole('textbox', {
      name: 'Task title',
    });
    changeValue(taskTitle, 'Independent Task draft');
    expect(taskTitle).toHaveValue('Independent Task draft');
    fireEvent.click(screen.getByRole('button', { name: 'Create Project' }));
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[0]?.path).toBe('/api/projects/from-template');
    expect(writes[1]?.path).toBe('/api/projects');
    expect(writes[1]?.body).toBe(
      JSON.stringify({
        title: 'Denied Template intention',
        clientAccountId: clientId,
      }),
    );
    expect(writes[1]?.key).toBeTruthy();
    expect(writes[1]?.key).not.toBe(writes[0]?.key);
    expect(projectReads).toBe(2);
  },
);

it.each([
  {
    name: 'Project or Company denial',
    status: 403,
    message:
      'Project access and Client read access are required for this Company.',
  },
  { name: 'lost session', status: 401, message: null },
  {
    name: 'unavailable Project read',
    status: 503,
    message: 'The Project could not be loaded or saved. Please try again.',
  },
  {
    name: 'malformed Project read',
    status: 200,
    message: 'The Project could not be loaded or saved. Please try again.',
  },
])(
  'withholds stale Project data after Template denial when revalidation reports $name',
  async ({ status, message }) => {
    let denied = false;
    const reads: string[] = [];
    const writes: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          writes.push(url);
          denied = true;
          return new Response(null, { status: 403 });
        }
        reads.push(url);
        if (url === '/api/projects')
          return !denied
            ? Response.json([project])
            : status === 200
              ? Response.json([{ id: projectId }])
              : new Response(null, { status });
        return baseRead(url);
      }),
    );
    const rejectSession = vi.fn();
    const identity = { ...deterministicBrowserIdentity(), rejectSession };
    const mounted = view(actor, identity);
    await screen.findByRole('button', {
      name: `${project.title} Client: ${project.clientDisplayName}`,
    });
    const selector = await screen.findByRole('combobox', {
      name: 'Project template',
    });
    changeValue(
      screen.getByRole('textbox', { name: 'Project title' }),
      'Rejected Template intention',
    );
    changeValue(screen.getByRole('combobox', { name: 'Client' }), clientId);
    changeValue(selector, 'CONSULTING_PREPARATION_ILLUSTRATIVE:1');
    fireEvent.click(
      screen.getByRole('button', { name: 'Create Project from template' }),
    );
    if (message) await screen.findByText(message);
    else await waitFor(() => expect(rejectSession).toHaveBeenCalledOnce());
    expect(reads.filter((path) => path === '/api/projects')).toHaveLength(2);
    expect(reads.filter((path) => path === '/api/clients')).toHaveLength(1);
    expect(writes).toEqual(['/api/projects/from-template']);
    mounted.rerender(workspaceElement(withoutTemplateGrant(), identity));
    expect(
      screen.queryByRole('button', {
        name: `${project.title} Client: ${project.clientDisplayName}`,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: 'Project title' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Tasks' }),
    ).not.toBeInTheDocument();
    if (status !== 401) expect(rejectSession).not.toHaveBeenCalled();
  },
);

it.each(['Company', 'identity'])(
  'discards held Project recovery after the %s changes',
  async (boundary) => {
    let respond: ((response: Response) => void) | undefined;
    const reply = new Promise<Response>((resolve) => {
      respond = resolve;
    });
    let templateDenied = false;
    let switched = false;
    let recoverySignal: AbortSignal | null | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          templateDenied = true;
          return new Response(null, { status: 403 });
        }
        if (url === '/api/projects') {
          if (switched) return Response.json([]);
          if (!templateDenied) return Response.json([project]);
          recoverySignal = init?.signal;
          return reply;
        }
        return baseRead(url);
      }),
    );
    const identity = deterministicBrowserIdentity();
    const mounted = view(actor, identity);
    await screen.findByRole('button', {
      name: `${project.title} Client: ${project.clientDisplayName}`,
    });
    const selector = await screen.findByRole('combobox', {
      name: 'Project template',
    });
    changeValue(
      screen.getByRole('textbox', { name: 'Project title' }),
      'Old Company intention',
    );
    changeValue(screen.getByRole('combobox', { name: 'Client' }), clientId);
    changeValue(selector, 'CONSULTING_PREPARATION_ILLUSTRATIVE:1');
    fireEvent.click(
      screen.getByRole('button', { name: 'Create Project from template' }),
    );
    await screen.findByText('Explicit Project template access is required.');
    await waitFor(() => expect(recoverySignal).toBeDefined());
    const company = actor.activeCompany;
    if (!company) throw new Error('The fixture requires an active Company.');
    switched = true;
    const nextActor =
      boundary === 'Company'
        ? {
            ...actor,
            activeCompany: {
              ...company,
              id: 'other-company',
              displayName: 'Other Company',
            },
          }
        : actor;
    mounted.rerender(
      workspaceElement(
        nextActor,
        boundary === 'identity' ? deterministicBrowserIdentity() : identity,
      ),
    );
    expect(recoverySignal?.aborted).toBe(true);
    await screen.findByText('No Projects for this Company yet.');
    await act(async () => {
      if (!respond) throw new Error('The recovery response was not held.');
      respond(Response.json([project]));
      await reply;
    });
    expect(
      screen.queryByRole('button', {
        name: `${project.title} Client: ${project.clientDisplayName}`,
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Project title' })).toHaveValue(
      '',
    );
    expect(
      screen.queryByRole('article', { name: project.title }),
    ).not.toBeInTheDocument();
  },
);

function replacedTemplateGrant(): ActorContext {
  const company = actor.activeCompany;
  if (!company) throw new Error('The fixture requires an active Company.');
  return {
    ...actor,
    activeCompany: {
      ...company,
      projectTemplatePermissionAssignmentId: 'replacement-template-grant',
    },
  };
}

function withoutTemplateGrant(): ActorContext {
  return {
    ...actor,
    activeCompany: {
      id: companyId,
      displayName: 'Company Demo',
      clientPermissions: [],
      projectPermissions: ['project.read', 'project.create'],
      taskPermissions: ['task.read', 'task.manage'],
      taskPermissionAssignmentId: 'task-grant',
      taskPermissionSetVersion: 'v1',
    },
  };
}

it.each([
  {
    name: 'missing selection',
    status: 404,
    message:
      'The selected Client or Template Version is no longer available. Reload the choices before creating the Project.',
  },
  {
    name: 'invalid selection',
    status: 400,
    message:
      'Check the Project title, Client and Template Version before trying again.',
  },
  {
    name: 'conflicting creation key',
    status: 409,
    message:
      'This Project creation conflicts with the saved request or current selection. Reload before trying again.',
  },
])(
  'distinguishes Template creation $name from an uncertain committed write',
  async ({ status, message }) => {
    const writes: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          writes.push(url);
          return new Response(null, { status });
        }
        return baseRead(url);
      }),
    );
    view();
    const selector = await screen.findByRole('combobox', {
      name: 'Project template',
    });
    changeValue(
      screen.getByRole('textbox', { name: 'Project title' }),
      project.title,
    );
    changeValue(screen.getByRole('combobox', { name: 'Client' }), clientId);
    changeValue(selector, 'CONSULTING_PREPARATION_ILLUSTRATIVE:1');
    fireEvent.click(
      screen.getByRole('button', { name: 'Create Project from template' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('textbox', { name: 'Project title' })).toHaveValue(
      project.title,
    );
    expect(
      screen.queryByText(
        'The Project creation could not be confirmed. Retry the same details safely.',
      ),
    ).not.toBeInTheDocument();
    expect(writes).toEqual(['/api/projects/from-template']);
  },
);

it.each(['server failure', 'network failure', 'malformed confirmation'])(
  'preserves the exact Template retry after a %s',
  async (failure) => {
    const writes: Array<{ body: unknown; key: string | null }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          writes.push({
            body: init.body,
            key: new Headers(init.headers).get('idempotency-key'),
          });
          if (writes.length === 1) {
            if (failure === 'network failure')
              throw new TypeError('Synthetic lost response');
            return failure === 'server failure'
              ? new Response(null, { status: 500 })
              : Response.json({ id: projectId }, { status: 201 });
          }
          return Response.json(project);
        }
        return baseRead(url);
      }),
    );
    view();
    const selector = await screen.findByRole('combobox', {
      name: 'Project template',
    });
    changeValue(
      screen.getByRole('textbox', { name: 'Project title' }),
      project.title,
    );
    changeValue(screen.getByRole('combobox', { name: 'Client' }), clientId);
    changeValue(selector, 'CONSULTING_PREPARATION_ILLUSTRATIVE:1');
    fireEvent.click(
      screen.getByRole('button', { name: 'Create Project from template' }),
    );
    await screen.findByText(
      'The Project creation could not be confirmed. Retry the same details safely.',
    );
    expect(writes).toHaveLength(1);
    expect(writes[0]?.key).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Create Project from template' }),
    );
    await screen.findByRole('heading', { name: project.title });
    expect(writes).toHaveLength(2);
    expect(writes[1]).toEqual(writes[0]);
  },
);

it('reports unavailable preparation without claiming that an undispatched creation might have committed', async () => {
  let unavailable = false;
  const identity = {
    ...deterministicBrowserIdentity(),
    getToken: async () => {
      if (unavailable)
        throw new Error('Synthetic credential acquisition failure');
      return null;
    },
  };
  const writes: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        writes.push(url);
        return Response.json(project);
      }
      return baseRead(url);
    }),
  );
  view(actor, identity);
  const selector = await screen.findByRole('combobox', {
    name: 'Project template',
  });
  changeValue(
    screen.getByRole('textbox', { name: 'Project title' }),
    project.title,
  );
  changeValue(screen.getByRole('combobox', { name: 'Client' }), clientId);
  changeValue(selector, 'CONSULTING_PREPARATION_ILLUSTRATIVE:1');
  unavailable = true;
  fireEvent.click(
    screen.getByRole('button', { name: 'Create Project from template' }),
  );
  await screen.findByText(
    'Project creation is unavailable. Reload and try again.',
  );
  expect(writes).toHaveLength(0);
  expect(screen.getByRole('textbox', { name: 'Project title' })).toHaveValue(
    project.title,
  );
  unavailable = false;
  fireEvent.click(
    screen.getByRole('button', { name: 'Create Project from template' }),
  );
  await screen.findByRole('heading', { name: project.title });
  expect(writes).toEqual(['/api/projects/from-template']);
});
