import { afterEach, expect, it, vi } from 'vitest';
import {
  fireEvent,
  act,
  render,
  screen,
  waitFor,
  within,
} from '../test/render-with-interface-locale';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { ProjectTasks } from './ProjectTasks';
import type { TaskView } from './task-response';
import { assertMessageCoverage } from '../localization/messages';
import {
  interfaceLocales,
  useInterfaceLocale,
} from '../localization/interface-locale';
import { taskPlanningMessages } from './task-planning.copy';

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
    id: 'company',
    displayName: 'Company DEMO',
    projectPermissions: ['project.read'],
    taskPermissions: ['task.read', 'task.manage'],
    taskPermissionAssignmentId: 'task-grant',
    taskPermissionSetVersion: 'v1',
  },
};
const attribution = {
  internalUserId: 'owner',
  workspaceMembershipId: 'member',
  displayName: 'Owner',
};
function task(id: string): TaskView {
  return {
    id,
    companyId: 'company',
    projectId: 'project',
    clientAccountId: 'client',
    title: `Activity ${id} DEMO`,
    assignee: null,
    dueDate: null,
    priority: 'normal',
    status: 'todo',
    completion: null,
    version: 1,
    createdAt: '2026-10-28T00:00:00.000Z',
    updatedAt: '2026-10-28T00:00:00.000Z',
    createdBy: attribution,
  };
}
afterEach(() => vi.unstubAllGlobals());

it('opens grouped planning through native Project Tasks and saves only deliberately selected responsibility and date edits', async () => {
  let tasks = [task('first'), task('second')];
  const writes: { path: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options?: RequestInit) => {
      const path = new URL(url, window.location.href).pathname;
      if (options?.method === 'POST') {
        writes.push({ path, body: JSON.parse(String(options.body)) });
        tasks = tasks.map((row) =>
          row.id === 'first'
            ? { ...row, dueDate: '2026-11-02', version: 2 }
            : row,
        );
        return new Response(
          JSON.stringify({
            schema: 'task-planning/v1',
            projectId: 'project',
            tasks: [tasks[0]],
          }),
          { status: 201 },
        );
      }
      if (path.endsWith('/eligible-task-assignees'))
        return Response.json({ members: [] });
      if (path.endsWith('/tasks'))
        return Response.json({ mutable: true, tasks });
      return new Response(null, { status: 404 });
    }),
  );
  render(
    <ProjectTasks
      actor={actor}
      identity={deterministicBrowserIdentity()}
      projectId="project"
      projectStatus="preparatory"
    />,
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Plan selected Tasks' }),
  );
  const region = screen.getByRole('region', { name: 'Grouped Task planning' });
  const select = await within(region).findByRole('checkbox', {
    name: 'Activity first DEMO',
  });
  fireEvent.click(select);
  fireEvent.change(
    within(region).getByLabelText('Due date — Activity first DEMO'),
    { target: { value: '2026-11-02' } },
  );
  fireEvent.click(
    within(region).getByRole('button', { name: 'Save selected planning' }),
  );
  await waitFor(() =>
    expect(
      within(region).getByText('Selected planning saved.'),
    ).toBeInTheDocument(),
  );
  expect(writes).toEqual([
    {
      path: '/api/projects/project/tasks/planning',
      body: {
        tasks: [
          {
            taskId: 'first',
            expectedVersion: 1,
            assigneeMembershipId: null,
            dueDate: '2026-11-02',
          },
        ],
      },
    },
  ]);
  expect(tasks[1]).toEqual(task('second'));
});

function deferred<T>() {
  let complete: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    complete = resolve;
  });
  return {
    promise,
    resolve(value: T) {
      if (!complete) throw new Error('Missing completion');
      complete(value);
    },
  };
}
function installHttp(
  options: {
    tasks?: TaskView[];
    mutable?: boolean;
    write?: (body: unknown, options: RequestInit) => Promise<Response>;
    listing?: () => Response;
    project?: () => Response;
  } = {},
) {
  const writes: { body: unknown; path: string; key: string | null }[] = [];
  const fetcher = vi.fn(async (url: string, init: RequestInit = {}) => {
    const path = new URL(url, window.location.href).pathname;
    if (init.method === 'POST') {
      const body: unknown = JSON.parse(String(init.body));
      writes.push({
        path,
        body,
        key: new Headers(init.headers).get('idempotency-key'),
      });
      return options.write
        ? options.write(body, init)
        : new Response(null, { status: 503 });
    }
    if (path.endsWith('/eligible-task-assignees'))
      return Response.json({ members: [] });
    if (path.endsWith('/tasks')) {
      if (options.listing) return options.listing();
      const companyId =
        new Headers(init.headers).get('x-company-context-id') ?? 'company';
      const projectId = path.split('/').at(-2) ?? 'project';
      return Response.json({
        mutable: options.mutable ?? true,
        tasks: (options.tasks ?? [task('first'), task('second')]).map(
          (row) => ({ ...row, companyId, projectId }),
        ),
      });
    }
    if (/\/projects\/[^/]+$/u.test(path))
      return options.project
        ? options.project()
        : Response.json({
            id: 'project',
            companyId: 'company',
            clientAccountId: 'client',
            clientDisplayName: 'Client DEMO',
            title: 'Project DEMO',
            status: 'preparatory',
            createdAt: '2026-10-28T00:00:00.000Z',
          });
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal('fetch', fetcher);
  return { fetcher, writes };
}
async function openPlanning() {
  fireEvent.click(
    await screen.findByRole('button', { name: 'Plan selected Tasks' }),
  );
  const region = screen.getByRole('region', { name: 'Grouped Task planning' });
  const checkbox = await within(region).findByRole('checkbox', {
    name: 'Activity first DEMO',
  });
  fireEvent.click(checkbox);
  return region;
}
function LocaleButtons() {
  const { changeLocale } = useInterfaceLocale();
  return (
    <div>
      {interfaceLocales.map((locale) => (
        <button key={locale} onClick={() => changeLocale(locale)}>
          {locale}
        </button>
      ))}
    </div>
  );
}

it.each(['lost', 'malformed'])(
  'retains an exact %s-reply attempt across close and locale changes, protects the independent native draft and distinguishes confirmed write from read failure',
  async (outcome) => {
    let committed = false,
      failReads = false;
    const receipt = {
      schema: 'task-planning/v1',
      projectId: 'project',
      tasks: [{ ...task('first'), version: 2, dueDate: '2026-11-02' }],
    };
    const http = installHttp({
      listing: () =>
        failReads
          ? new Response(null, { status: 503 })
          : Response.json({
              mutable: true,
              tasks: committed
                ? [...receipt.tasks, task('second')]
                : [task('first'), task('second')],
            }),
      write: async () => {
        if (!committed) {
          committed = true;
          return outcome === 'lost'
            ? new Response(null, { status: 503 })
            : Response.json({ schema: 'unsupported/v2' });
        }
        failReads = true;
        return Response.json(receipt, { status: 201 });
      },
    });
    render(
      <>
        <LocaleButtons />
        <ProjectTasks
          actor={actor}
          identity={deterministicBrowserIdentity()}
          projectId="project"
          projectStatus="preparatory"
        />
      </>,
    );
    const nativeTitle = await screen.findByRole('textbox', {
      name: 'Task title',
    });
    await waitFor(() => expect(nativeTitle).toBeEnabled());
    fireEvent.change(nativeTitle, {
      target: { value: 'Independent native draft DEMO' },
    });
    const region = await openPlanning();
    const date = within(region).getByLabelText(
      'Due date — Activity first DEMO',
    );
    fireEvent.change(date, { target: { value: '2026-11-02' } });
    date.focus();
    const calls = http.fetcher.mock.calls.length;
    assertMessageCoverage('task-planning', taskPlanningMessages);
    for (const locale of interfaceLocales) {
      fireEvent.click(screen.getByRole('button', { name: locale }));
      expect(region.querySelector('input[type=date]')).toBe(date);
      expect(date).toHaveFocus();
      expect(date).toHaveValue('2026-11-02');
      expect(http.fetcher).toHaveBeenCalledTimes(calls);
    }
    fireEvent.click(
      within(region).getByRole('button', { name: 'Save selected planning' }),
    );
    const retry = await within(region).findByRole('button', {
      name: 'Retry the same planning',
    });
    expect(nativeTitle).toBeDisabled();
    expect(date).toBeDisabled();
    const beforeClose = http.fetcher.mock.calls.length;
    fireEvent.click(
      screen.getByRole('button', { name: 'Close grouped planning' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Plan selected Tasks' }),
    );
    expect(http.fetcher).toHaveBeenCalledTimes(beforeClose);
    expect(date).toHaveValue('2026-11-02');
    fireEvent.click(retry);
    await within(region).findByText('Selected planning saved.');
    await within(region).findByRole('alert');
    expect(
      within(region).queryByRole('button', { name: 'Retry the same planning' }),
    ).not.toBeInTheDocument();
    expect(http.writes).toHaveLength(2);
    expect(http.writes[1]).toEqual(http.writes[0]);
    failReads = false;
    fireEvent.click(
      within(region).getByRole('button', { name: 'Reload planning' }),
    );
    await within(region).findByRole('checkbox', {
      name: 'Activity first DEMO',
    });
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Task title' })).toHaveValue(
        'Independent native draft DEMO',
      ),
    );
  },
);

it('requires explicit reload after a stale refusal and never substitutes refreshed versions into the rejected intent', async () => {
  let changed = false;
  const http = installHttp({
    listing: () =>
      Response.json({
        mutable: true,
        tasks: [{ ...task('first'), version: changed ? 2 : 1 }],
      }),
    write: async () => {
      changed = true;
      return new Response(null, { status: 409 });
    },
  });
  render(
    <ProjectTasks
      actor={actor}
      identity={deterministicBrowserIdentity()}
      projectId="project"
      projectStatus="preparatory"
    />,
  );
  const region = await openPlanning();
  fireEvent.click(
    within(region).getByRole('button', { name: 'Save selected planning' }),
  );
  await within(region).findByText(
    'A Task or its Project changed. Reload planning before choosing another action.',
  );
  expect(within(region).getByRole('checkbox')).toBeDisabled();
  expect(http.writes).toHaveLength(1);
  fireEvent.click(
    within(region).getByRole('button', { name: 'Reload planning' }),
  );
  await waitFor(() =>
    expect(within(region).getByRole('checkbox')).toBeEnabled(),
  );
  expect(within(region).getByRole('checkbox')).not.toBeChecked();
  expect(
    within(region).queryByText(
      'A Task or its Project changed. Reload planning before choosing another action.',
    ),
  ).not.toBeInTheDocument();
  expect(http.writes).toHaveLength(1);
});

it('bounds explicit selection to 50 and keeps closed Tasks out of the planning set', async () => {
  const tasks = Array.from({ length: 51 }, (_, index) => task(String(index)));
  const completed: TaskView = {
    ...task('closed'),
    status: 'done',
    completion: { actor: attribution, occurredAt: '2026-10-28T12:00:00Z' },
  };
  const http = installHttp({ tasks: [...tasks, completed] });
  render(
    <ProjectTasks
      actor={actor}
      identity={deterministicBrowserIdentity()}
      projectId="project"
      projectStatus="preparatory"
    />,
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Plan selected Tasks' }),
  );
  const region = screen.getByRole('region', { name: 'Grouped Task planning' });
  await within(region).findByRole('checkbox', { name: 'Activity 0 DEMO' });
  const checkboxes = within(region).getAllByRole('checkbox');
  expect(checkboxes).toHaveLength(51);
  act(() => {
    for (const checkbox of checkboxes.slice(0, 50)) fireEvent.click(checkbox);
  });
  expect(checkboxes[50]).toBeDisabled();
  expect(
    within(region).getAllByRole('checkbox', { checked: true }),
  ).toHaveLength(50);
  expect(
    within(region).queryByRole('checkbox', { name: 'Activity closed DEMO' }),
  ).not.toBeInTheDocument();
  expect(http.writes).toHaveLength(0);
});

it.each(['Company', 'session', 'grant'])(
  'permanently retires pending %s consumers across A→B→A and suppresses late success or denial effects',
  async (axis) => {
    for (const status of [201, 403]) {
      const waiting = deferred<Response>();
      const http = installHttp({ write: async () => waiting.promise });
      const identity = deterministicBrowserIdentity(),
        replacement = deterministicBrowserIdentity(),
        activity = vi.fn();
      const renderOwner = (alternate: boolean) => (
        <ProjectTasks
          actor={
            alternate && axis !== 'session'
              ? {
                  ...actor,
                  activeCompany: actor.activeCompany
                    ? {
                        ...actor.activeCompany,
                        ...(axis === 'Company'
                          ? { id: 'company-b' }
                          : {
                              taskPermissionAssignmentId: 'replacement-grant',
                            }),
                      }
                    : undefined,
                }
              : actor
          }
          identity={alternate && axis === 'session' ? replacement : identity}
          projectId={alternate && axis === 'Company' ? 'project-b' : 'project'}
          projectStatus="preparatory"
          onActivityRecorded={activity}
        />
      );
      const view = render(renderOwner(false));
      const region = await openPlanning();
      fireEvent.click(
        within(region).getByRole('button', { name: 'Save selected planning' }),
      );
      await waitFor(() => expect(http.writes).toHaveLength(1));
      view.rerender(renderOwner(true));
      view.rerender(renderOwner(false));
      await act(async () =>
        waiting.resolve(
          status === 201
            ? Response.json(
                {
                  schema: 'task-planning/v1',
                  projectId: 'project',
                  tasks: [task('first')],
                },
                { status },
              )
            : new Response(null, { status }),
        ),
      );
      await waitFor(() =>
        expect(
          screen.getByRole('textbox', { name: 'Task title' }),
        ).toBeEnabled(),
      );
      expect(
        screen.getByRole('button', { name: 'Plan selected Tasks' }),
      ).toHaveAttribute('aria-expanded', 'false');
      expect(
        screen.queryByText('Selected planning saved.'),
      ).not.toBeInTheDocument();
      expect(activity).not.toHaveBeenCalled();
      expect(http.writes).toHaveLength(1);
      view.unmount();
    }
  },
);

it.each(['empty', 'historical', 'closed'])(
  'shows explicit %s planning without enabling a mutation',
  async (state) => {
    const http = installHttp({
      tasks: state === 'empty' ? [] : [task('first')],
      mutable: state === 'empty',
    });
    render(
      <ProjectTasks
        actor={actor}
        identity={deterministicBrowserIdentity()}
        projectId="project"
        projectStatus={state === 'closed' ? 'cancelled' : 'preparatory'}
      />,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Plan selected Tasks' }),
    );
    const region = screen.getByRole('region', {
      name: 'Grouped Task planning',
    });
    if (state === 'empty') {
      await within(region).findByText('No open Tasks to plan.');
      expect(
        within(region).queryByRole('button', {
          name: 'Save selected planning',
        }),
      ).not.toBeInTheDocument();
    } else {
      await waitFor(() =>
        expect(within(region).getByRole('checkbox')).toBeDisabled(),
      );
      expect(
        within(region).getByRole('button', { name: 'Save selected planning' }),
      ).toBeDisabled();
      await within(region).findByText(
        state === 'closed'
          ? 'Read-only: this Project is closed. Task history remains available.'
          : 'Read-only: the original Client has been superseded. Task history remains available.',
      );
    }
    expect(http.writes).toHaveLength(0);
  },
);

it('recovers an initial planning read failure explicitly without issuing a write', async () => {
  let refused = true;
  const http = installHttp({
    listing: () =>
      refused
        ? new Response(null, { status: 503 })
        : Response.json({ mutable: true, tasks: [task('first')] }),
  });
  render(
    <ProjectTasks
      actor={actor}
      identity={deterministicBrowserIdentity()}
      projectId="project"
      projectStatus="preparatory"
    />,
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Plan selected Tasks' }),
  );
  const region = screen.getByRole('region', { name: 'Grouped Task planning' });
  await within(region).findByRole('alert');
  refused = false;
  fireEvent.click(
    within(region).getByRole('button', { name: 'Reload planning' }),
  );
  await within(region).findByRole('checkbox', { name: 'Activity first DEMO' });
  expect(http.writes).toHaveLength(0);
});

it('can confirm the exact uncertain historical attempt after the Project closes without allowing new planning', async () => {
  let committed = false;
  const http = installHttp({
    listing: () =>
      Response.json({ mutable: !committed, tasks: [task('first')] }),
    write: async () => {
      if (!committed) {
        committed = true;
        return new Response(null, { status: 503 });
      }
      return Response.json(
        {
          schema: 'task-planning/v1',
          projectId: 'project',
          tasks: [task('first')],
        },
        { status: 201 },
      );
    },
  });
  const identity = deterministicBrowserIdentity();
  const view = render(
    <ProjectTasks
      actor={actor}
      identity={identity}
      projectId="project"
      projectStatus="preparatory"
    />,
  );
  const region = await openPlanning();
  fireEvent.click(
    within(region).getByRole('button', { name: 'Save selected planning' }),
  );
  await within(region).findByRole('button', {
    name: 'Retry the same planning',
  });
  view.rerender(
    <ProjectTasks
      actor={actor}
      identity={identity}
      projectId="project"
      projectStatus="cancelled"
    />,
  );
  fireEvent.click(
    within(region).getByRole('button', { name: 'Retry the same planning' }),
  );
  await within(region).findByText('Selected planning saved.');
  await waitFor(() =>
    expect(within(region).getByRole('checkbox')).toBeDisabled(),
  );
  expect(http.writes).toHaveLength(2);
  expect(http.writes[1]).toEqual(http.writes[0]);
});

it.each([401, 403])(
  'handles current command refusal %i without presenting an uncertain retry or retaining authority',
  async (status) => {
    const http = installHttp({
      write: async () => new Response(null, { status }),
    });
    const rejectSession = vi.fn(async () => undefined);
    render(
      <ProjectTasks
        actor={actor}
        identity={{ ...deterministicBrowserIdentity(), rejectSession }}
        projectId="project"
        projectStatus="preparatory"
      />,
    );
    const region = await openPlanning();
    fireEvent.click(
      within(region).getByRole('button', { name: 'Save selected planning' }),
    );
    await screen.findByText(
      'Task, Project and Client read access are required for this Company.',
    );
    expect(
      screen.queryByRole('button', { name: 'Retry the same planning' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Plan selected Tasks' }),
    ).not.toBeInTheDocument();
    expect(http.writes).toHaveLength(1);
    expect(rejectSession).toHaveBeenCalledTimes(status === 401 ? 1 : 0);
  },
);

it('preserves the native draft and explicit recovery after a historical original-Client command refusal', async () => {
  let historical = false;
  const http = installHttp({
    listing: () =>
      Response.json({ mutable: !historical, tasks: [task('first')] }),
    write: async () => {
      historical = true;
      return new Response(null, { status: 404 });
    },
  });
  render(
    <ProjectTasks
      actor={actor}
      identity={deterministicBrowserIdentity()}
      projectId="project"
      projectStatus="preparatory"
    />,
  );
  const native = await screen.findByRole('textbox', { name: 'Task title' });
  await waitFor(() => expect(native).toBeEnabled());
  fireEvent.change(native, {
    target: { value: 'Independent draft survives a target refusal' },
  });
  const region = await openPlanning();
  fireEvent.click(
    within(region).getByRole('button', { name: 'Save selected planning' }),
  );
  await within(region).findByText(
    'A selected Task or its original Client is unavailable for new planning. Reload planning to check the current state.',
  );
  expect(native).toHaveValue('Independent draft survives a target refusal');
  expect(
    screen.queryByText(
      'Task, Project and Client read access are required for this Company.',
    ),
  ).not.toBeInTheDocument();
  fireEvent.click(
    within(region).getByRole('button', { name: 'Reload planning' }),
  );
  await within(region).findByText(
    'Read-only: the original Client has been superseded. Task history remains available.',
  );
  expect(within(region).getByRole('checkbox')).toBeDisabled();
  expect(http.writes).toHaveLength(1);
});

it.each(['closed', 'unavailable'])(
  'resolves a later %s Project from public current facts instead of guessing Client supersession',
  async (outcome) => {
    let mutable = true,
      refuseProject = outcome === 'unavailable';
    const http = installHttp({
      listing: () => Response.json({ mutable, tasks: [task('first')] }),
      project: () =>
        refuseProject
          ? new Response(null, { status: 503 })
          : Response.json({
              id: 'project',
              companyId: 'company',
              clientAccountId: 'client',
              clientDisplayName: 'Active original Client DEMO',
              title: 'Project DEMO',
              status: 'cancelled',
              createdAt: '2026-10-28T00:00:00.000Z',
            }),
    });
    const projectChanged = vi.fn(async () => undefined);
    // Deliberately keep the parent's cached status open while the server has moved on.
    render(
      <ProjectTasks
        actor={actor}
        identity={deterministicBrowserIdentity()}
        projectId="project"
        projectStatus="preparatory"
        onProjectChanged={projectChanged}
      />,
    );
    const region = await openPlanning();
    mutable = false;
    fireEvent.click(
      within(region).getByRole('button', { name: 'Reload planning' }),
    );
    if (refuseProject) {
      await within(region).findByRole('alert');
      expect(
        within(region).queryByText(
          'Read-only: the original Client has been superseded. Task history remains available.',
        ),
      ).not.toBeInTheDocument();
      refuseProject = false;
      fireEvent.click(
        within(region).getByRole('button', { name: 'Reload planning' }),
      );
    }
    await within(region).findByText(
      'Read-only: this Project is closed. Task history remains available.',
    );
    expect(
      within(region).queryByText(
        'Read-only: the original Client has been superseded. Task history remains available.',
      ),
    ).not.toBeInTheDocument();
    expect(within(region).getByRole('checkbox')).toBeDisabled();
    await waitFor(() => expect(projectChanged).toHaveBeenCalled());
    expect(http.writes).toHaveLength(0);
  },
);
