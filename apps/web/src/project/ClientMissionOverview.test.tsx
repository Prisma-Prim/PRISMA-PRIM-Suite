import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '../test/render-with-interface-locale';
import { afterEach, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { deterministicBrowserIdentity } from '../access-composition';
import { InterfaceLocaleSelect } from '../localization/InterfaceLocaleSelect';
import { selectOptionByLabel } from '../test/select-option';
import type { ActorContext } from '../access-types';
import type { TaskView } from './task-response';
import type { ClientProjectPage } from './client-mission-response';
import { ClientMissionOverview } from './ClientMissionOverview';

const company: NonNullable<ActorContext['activeCompany']> = {
  id: 'company',
  displayName: 'PRISMA-PRIM',
  clientPermissions: ['client.read'],
  clientPermissionAssignmentId: 'client-capture',
  clientPermissionSetVersion: 'v2',
  projectPermissions: ['project.read'],
  projectPermissionAssignmentId: 'project-capture',
  projectPermissionSetVersion: 'v2',
  taskPermissions: ['task.read'],
  taskPermissionAssignmentId: 'task-capture',
  taskPermissionSetVersion: 'v1',
};
const actor: ActorContext = {
  internalUserId: 'reader',
  workspaceMembershipId: 'member',
  workspaceId: 'workspace',
  workspaceName: 'Workspace',
  displayName: 'Reader',
  email: 'reader@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: company,
};
const identity = deterministicBrowserIdentity();
function project(index = 0): ClientProjectPage['items'][number] {
  return {
    id: `project-${index}`,
    companyId: company.id,
    clientAccountId: 'original-client',
    clientDossierId: 'client',
    clientDisplayName: 'Literal Client',
    title: `Mission ${index}`,
    status: 'preparatory',
    createdAt: '2026-10-26T00:00:00.000Z',
    responsible: {
      workspaceMembershipId: 'coordinator',
      displayLabel: 'Recorded coordinator',
    },
  };
}
function task(index = 0, projectId = 'project-25'): TaskView {
  return {
    description: null,
    id: `task-${index}`,
    companyId: company.id,
    projectId,
    clientAccountId: 'original-client',
    title: `Literal Task ${index}`,
    status: 'todo',
    completion: null,
    priority: 'important',
    dueDate: index === 25 ? null : '2030-01-15',
    assignee: {
      workspaceMembershipId: 'assignee',
      displayLabel: 'Recorded assignee',
    },
    version: 1,
    createdAt: '2026-10-26T00:00:00.000Z',
    updatedAt: '2026-10-26T00:00:00.000Z',
    createdBy: {
      internalUserId: 'reader',
      workspaceMembershipId: 'member',
      displayName: 'Reader',
    },
  };
}
type Props = ComponentProps<typeof ClientMissionOverview>;
function props(overrides: Partial<Props> = {}): Props {
  return {
    actor,
    identity,
    clientDossierId: 'client',
    clientIdentityRevision: 0,
    onOpenProject: vi.fn(),
    onCompanyContextRejected: vi.fn(),
    onActorRevalidated: vi.fn(),
    ...overrides,
  };
}
function page(offset = 0, size = 26) {
  return {
    companyId: company.id,
    clientDossierId: 'client',
    offset,
    pageSize: 25,
    hasMore: offset + 25 < size,
    items: Array.from(
      { length: Math.min(25, Math.max(0, size - offset)) },
      (_, index) => project(offset + index),
    ),
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

function controlledServer() {
  const state = {
    size: 1,
    listStatus: 200,
    taskStatus: 200,
    holdList: false,
    holdTasks: false,
    page: (value: ReturnType<typeof page>): unknown => value,
    tasks: (): unknown => ({ mutable: true, tasks: [task(0, 'project-0')] }),
  };
  const calls: string[] = [];
  const held: Array<{
    answer: (value: Response) => void;
    response: Response;
    signal: AbortSignal | null | undefined;
  }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input.toString(), 'http://localhost');
      calls.push(url.pathname + url.search);
      expect(init?.method ?? 'GET').toBe('GET');
      if (url.pathname.endsWith('/access/current-actor'))
        return Response.json(actor);
      const isTasks = url.pathname.endsWith('/tasks');
      const scopeCompany = new Headers(init?.headers).get(
        'x-company-context-id',
      );
      if (!scopeCompany) throw new Error('Expected an explicit Company.');
      const scopeClient = url.searchParams.get('clientDossierId') ?? 'client';
      const body = page(Number(url.searchParams.get('offset')), state.size);
      const scoped = {
        ...body,
        companyId: scopeCompany,
        clientDossierId: scopeClient,
        items: body.items.map((row) => ({
          ...row,
          companyId: scopeCompany,
          clientDossierId: scopeClient,
        })),
      };
      const status = isTasks ? state.taskStatus : state.listStatus;
      const response =
        status === 200
          ? Response.json(isTasks ? state.tasks() : state.page(scoped))
          : new Response(null, { status });
      if (isTasks ? state.holdTasks : state.holdList)
        return new Promise<Response>((answer) =>
          held.push({ answer, response, signal: init?.signal }),
        );
      return response;
    }),
  );
  return {
    state,
    calls,
    held,
    async release() {
      const current = held.shift();
      if (!current) throw new Error('No held public read.');
      await act(async () => current.answer(current.response));
      return current;
    },
  };
}

it('pages matching Projects then reads only the deliberately selected Project and opens its exact Task', async () => {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input.toString(), 'http://localhost');
      calls.push(url.pathname + url.search);
      if (url.pathname === '/api/projects')
        return Response.json(page(Number(url.searchParams.get('offset'))));
      if (url.pathname === '/api/projects/project-25/tasks')
        return Response.json({
          mutable: true,
          tasks: Array.from({ length: 26 }, (_, index) => task(index)),
        });
      throw new Error('Unexpected public read.');
    }),
  );
  const input = props();
  render(<ClientMissionOverview {...input} />);
  await screen.findByRole('heading', { name: 'Mission 0' });
  expect(calls).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Next missions' }));
  await screen.findByRole('heading', { name: 'Mission 25' });
  expect(calls).toHaveLength(2);
  fireEvent.click(
    screen.getByRole('button', { name: 'View Tasks: Mission 25' }),
  );
  const preview = await screen.findByRole('region', {
    name: 'Tasks for: Mission 25',
  });
  expect(await within(preview).findByText('Literal Task 0')).toBeVisible();
  expect(within(preview).getAllByText('Recorded assignee')).toHaveLength(25);
  expect(
    within(preview).queryByText('Literal Task 25'),
  ).not.toBeInTheDocument();
  fireEvent.click(within(preview).getByRole('button', { name: 'Next Tasks' }));
  expect(within(preview).getByText('Literal Task 25')).toBeVisible();
  expect(within(preview).getByText('No due date')).toBeVisible();
  expect(calls).toHaveLength(3);
  fireEvent.click(
    within(preview).getByRole('button', { name: 'Open Task: Literal Task 25' }),
  );
  expect(input.onOpenProject).toHaveBeenCalledWith(
    { projectId: 'project-25', taskId: 'task-25', focus: 'task' },
    expect.any(AbortSignal),
  );
});

it('distinguishes a failed scoped read from an empty result and retries the same restriction', async () => {
  const server = controlledServer();
  server.state.listStatus = 500;
  render(<ClientMissionOverview {...props()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Client missions could not be loaded.',
  );
  expect(
    screen.queryByText('No Projects for this Client in this Company.'),
  ).not.toBeInTheDocument();
  server.state.listStatus = 200;
  server.state.size = 0;
  fireEvent.click(screen.getByRole('button', { name: 'Retry this page' }));
  expect(
    await screen.findByText('No Projects for this Client in this Company.'),
  ).toBeVisible();
  expect(server.calls).toEqual([
    '/api/projects?clientDossierId=client&offset=0',
    '/api/projects?clientDossierId=client&offset=0',
  ]);
});

it('offers back or refresh on an out-of-range page without traversing automatically', async () => {
  const server = controlledServer();
  server.state.size = 26;
  render(<ClientMissionOverview {...props()} />);
  await screen.findByRole('heading', { name: 'Mission 0' });
  server.state.size = 1;
  fireEvent.click(screen.getByRole('button', { name: 'Next missions' }));
  expect(
    await screen.findByText('No Projects on this page. Go back or refresh.'),
  ).toBeVisible();
  expect(server.calls).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Previous missions' }));
  expect(
    await screen.findByRole('heading', { name: 'Mission 0' }),
  ).toBeVisible();
});

it.each([
  'foreign Company',
  'foreign dossier',
  'duplicate Projects',
  'unknown state',
])('refuses a %s page instead of rendering protected rows', async (kind) => {
  const server = controlledServer();
  server.state.page = (value) => {
    if (kind === 'foreign Company') return { ...value, companyId: 'other' };
    if (kind === 'foreign dossier')
      return {
        ...value,
        items: value.items.map((row) => ({ ...row, clientDossierId: 'other' })),
      };
    if (kind === 'duplicate Projects')
      return { ...value, items: [project(), project()] };
    return { ...value, items: [{ ...project(), status: 'unrecognized' }] };
  };
  render(<ClientMissionOverview {...props()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Client missions could not be loaded.',
  );
  expect(
    screen.queryByRole('heading', { name: 'Mission 0' }),
  ).not.toBeInTheDocument();
});

it('does not request or offer Task facts without independent Task access', async () => {
  const server = controlledServer();
  render(
    <ClientMissionOverview
      {...props({
        actor: { ...actor, activeCompany: { ...company, taskPermissions: [] } },
      })}
    />,
  );
  await screen.findByRole('heading', { name: 'Mission 0' });
  expect(
    screen.queryByRole('button', { name: 'View Tasks: Mission 0' }),
  ).not.toBeInTheDocument();
  expect(server.calls).toHaveLength(1);
});

it('retires only a denied Task preview while retaining Project facts', async () => {
  const server = controlledServer();
  server.state.taskStatus = 403;
  const input = props();
  render(<ClientMissionOverview {...input} />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'View Tasks: Mission 0' }),
  );
  const preview = await screen.findByRole('region', {
    name: 'Tasks for: Mission 0',
  });
  expect(await within(preview).findByRole('alert')).toHaveTextContent(
    'Task, Project and Client read access are required',
  );
  expect(screen.getByRole('heading', { name: 'Mission 0' })).toBeVisible();
  expect(input.onCompanyContextRejected).not.toHaveBeenCalled();
  expect(input.onActorRevalidated).toHaveBeenCalledWith(actor);
});

it.each(['Company', 'Project', 'original Client', 'duplicate Task'])(
  'refuses Task facts with mismatched %s',
  async (kind) => {
    const server = controlledServer();
    server.state.tasks = () => ({
      mutable: true,
      tasks:
        kind === 'duplicate Task'
          ? [task(0, 'project-0'), task(0, 'project-0')]
          : [
              {
                ...task(0, 'project-0'),
                ...(kind === 'Company'
                  ? { companyId: 'other' }
                  : kind === 'Project'
                    ? { projectId: 'other' }
                    : { clientAccountId: 'other' }),
              },
            ],
    });
    render(<ClientMissionOverview {...props()} />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'View Tasks: Mission 0' }),
    );
    const preview = await screen.findByRole('region', {
      name: 'Tasks for: Mission 0',
    });
    expect(await within(preview).findByRole('alert')).toHaveTextContent(
      'Tasks could not be loaded.',
    );
    expect(
      within(preview).queryByText('Literal Task 0'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mission 0' })).toBeVisible();
  },
);

it.each(
  [200, 403].flatMap((status) =>
    [
      'Company',
      'actor',
      'Client',
      'identity revision',
      'session',
      'Project capture',
    ].map((change) => ({ status, change })),
  ),
)(
  'ignores a retired list reply with status $status after $change changes',
  async ({ status, change }) => {
    const server = controlledServer();
    server.state.holdList = true;
    server.state.listStatus = status;
    server.state.page = (value) => ({
      ...value,
      items: value.items.map((row) => ({
        ...row,
        title: 'Obsolete protected Project',
      })),
    });
    const input = props();
    const view = render(<ClientMissionOverview {...input} />);
    await waitFor(() => expect(server.held).toHaveLength(1));
    server.state.holdList = false;
    server.state.listStatus = 200;
    server.state.page = (value) => value;
    const updated: Partial<Props> =
      change === 'Company'
        ? {
            actor: {
              ...actor,
              activeCompany: { ...company, id: 'new-company' },
            },
          }
        : change === 'actor'
          ? {
              actor: {
                ...actor,
                internalUserId: 'new-user',
                workspaceMembershipId: 'new-member',
              },
            }
          : change === 'Client'
            ? { clientDossierId: 'new-client' }
            : change === 'identity revision'
              ? { clientIdentityRevision: 1 }
              : change === 'session'
                ? { identity: deterministicBrowserIdentity() }
                : {
                    actor: {
                      ...actor,
                      activeCompany: {
                        ...company,
                        projectPermissionAssignmentId: 'new-project-capture',
                      },
                    },
                  };
    view.rerender(<ClientMissionOverview {...input} {...updated} />);
    await screen.findByRole('heading', { name: 'Mission 0' });
    const old = await server.release();
    expect(old.signal?.aborted).toBe(true);
    expect(
      screen.queryByText('Obsolete protected Project'),
    ).not.toBeInTheDocument();
    expect(input.onActorRevalidated).not.toHaveBeenCalled();
    expect(input.onCompanyContextRejected).not.toHaveBeenCalled();
  },
);

it.each(['Client only', 'Project only'])(
  'exposes no mission facts or request with %s authority',
  async (kind) => {
    const server = controlledServer();
    render(
      <ClientMissionOverview
        {...props({
          actor: {
            ...actor,
            activeCompany: {
              ...company,
              ...(kind === 'Client only'
                ? { projectPermissions: [] }
                : { clientPermissions: [] }),
            },
          },
        })}
      />,
    );
    expect(
      screen.queryByRole('region', { name: 'Client missions' }),
    ).not.toBeInTheDocument();
    expect(server.calls).toEqual([]);
  },
);

it('renews opening lifetime only after a validated scoped retry', async () => {
  const server = controlledServer();
  const input = props();
  render(<ClientMissionOverview {...input} />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Open Project: Mission 0' }),
  );
  const first = vi.mocked(input.onOpenProject).mock.calls[0];
  if (!first) throw new Error('Missing opening.');
  expect(first[1].aborted).toBe(false);
  server.state.listStatus = 404;
  fireEvent.click(
    screen.getByRole('button', { name: 'Refresh missions from beginning' }),
  );
  await screen.findByRole('alert');
  expect(first[1].aborted).toBe(true);
  server.state.listStatus = 200;
  fireEvent.click(screen.getByRole('button', { name: 'Retry this page' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Open Project: Mission 0' }),
  );
  const next = vi.mocked(input.onOpenProject).mock.calls[1];
  if (!next) throw new Error('Missing renewed opening.');
  expect(next[1]).not.toBe(first[1]);
  expect(next[1].aborted).toBe(false);
  expect(first[1].aborted).toBe(true);
});

it('localizes presentation without reloading literal Project or selected Task facts', async () => {
  const server = controlledServer();
  render(
    <>
      <InterfaceLocaleSelect />
      <ClientMissionOverview {...props()} />
    </>,
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'View Tasks: Mission 0' }),
  );
  await screen.findByText('Literal Task 0');
  const reads = server.calls.length;
  for (const [label, title] of [
    ['Français', 'Missions du client'],
    ['Română', 'Misiunile Clientului'],
    ['Русский', 'Работы клиента'],
    ['English', 'Client missions'],
  ]) {
    await selectOptionByLabel(screen.getByRole('combobox'), label);
    expect(screen.getByRole('heading', { name: title })).toBeVisible();
    expect(screen.getByText('Literal Task 0')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Mission 0' })).toBeVisible();
  }
  expect(server.calls).toHaveLength(reads);
});

it.each([200, 403])(
  'ignores a retired Task preview status %s after Client identity retirement',
  async (status) => {
    const server = controlledServer();
    const input = props();
    const view = render(<ClientMissionOverview {...input} />);
    server.state.holdTasks = true;
    server.state.taskStatus = status;
    fireEvent.click(
      await screen.findByRole('button', { name: 'View Tasks: Mission 0' }),
    );
    await waitFor(() => expect(server.held).toHaveLength(1));
    view.rerender(
      <ClientMissionOverview {...input} clientIdentityRevision={1} />,
    );
    await screen.findByRole('heading', { name: 'Mission 0' });
    const old = await server.release();
    expect(old.signal?.aborted).toBe(true);
    expect(screen.queryByText('Literal Task 0')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Tasks for: Mission 0' }),
    ).not.toBeInTheDocument();
    expect(input.onActorRevalidated).not.toHaveBeenCalled();
  },
);

it('retires Task capture data independently and never resurrects its old reply after regrant', async () => {
  const server = controlledServer();
  const input = props();
  const view = render(<ClientMissionOverview {...input} />);
  server.state.holdTasks = true;
  fireEvent.click(
    await screen.findByRole('button', { name: 'View Tasks: Mission 0' }),
  );
  await waitFor(() => expect(server.held).toHaveLength(1));
  view.rerender(
    <ClientMissionOverview
      {...input}
      actor={{ ...actor, activeCompany: { ...company, taskPermissions: [] } }}
    />,
  );
  expect(screen.getByRole('heading', { name: 'Mission 0' })).toBeVisible();
  expect(
    screen.queryByRole('region', { name: 'Tasks for: Mission 0' }),
  ).not.toBeInTheDocument();
  server.state.holdTasks = false;
  server.state.tasks = () => ({ mutable: false, tasks: [] });
  view.rerender(
    <ClientMissionOverview
      {...input}
      actor={{
        ...actor,
        activeCompany: {
          ...company,
          taskPermissionAssignmentId: 'new-task-capture',
        },
      }}
    />,
  );
  expect(
    await screen.findByText('No manual Tasks for this Project yet.'),
  ).toBeVisible();
  const old = await server.release();
  expect(old.signal?.aborted).toBe(true);
  expect(screen.queryByText('Literal Task 0')).not.toBeInTheDocument();
  expect(
    server.calls.filter((path) => path.includes('?clientDossierId=')),
  ).toHaveLength(1);
});
