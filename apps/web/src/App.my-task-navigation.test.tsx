import { changeValue } from './test/select-option';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import type { ActorContext } from './access-types';
import { taskCopy } from './project/task.copy';

const companyA = { id: 'company-a', displayName: 'Company A' };
const companyB = { id: 'company-b', displayName: 'Company B' };
const atelier = { id: 'client-atelier', displayName: 'Atelier Demo SRL' };
const beta = { id: 'client-beta', displayName: 'Beta Demo SRL' };
const sharedTitle = 'Pregătire demo';
const project = (client: typeof atelier, id: string) => ({
  id,
  companyId: companyA.id,
  clientAccountId: client.id,
  clientDossierId: client.id,
  clientDisplayName: client.displayName,
  title: sharedTitle,
  status: 'preparatory',
  createdAt: '2026-09-19T08:00:00.000Z',
});
const atelierProject = project(atelier, 'project-atelier');
const betaProject = project(beta, 'project-beta');
const otherCompanyProject = {
  ...project(beta, 'project-other-company'),
  companyId: companyB.id,
  title: 'Other Company preparation',
};
const me = {
  workspaceMembershipId: 'membership-1',
  displayLabel: 'Coordinator · 1',
};
const colleague = {
  workspaceMembershipId: 'membership-2',
  displayLabel: 'Colleague · 2',
};
const attribution = {
  internalUserId: 'coordinator',
  workspaceMembershipId: me.workspaceMembershipId,
  displayName: 'Coordinator',
};
const taskTitle = 'Chestionar inițial';
const assignedTask = (
  owner: typeof atelierProject,
  id: string,
  due: string,
) => ({
  id,
  companyId: companyA.id,
  projectId: owner.id,
  clientAccountId: owner.clientAccountId,
  title: taskTitle,
  assignee: me,
  dueDate: due,
  priority: 'normal',
  status: 'todo',
  completion: null,
  version: 1,
  createdAt: '2026-09-19T09:00:00.000Z',
  updatedAt: '2026-09-19T09:00:00.000Z',
  createdBy: attribution,
});
const atelierTask = assignedTask(atelierProject, 'task-atelier', '2026-09-30');
const betaTask = assignedTask(betaProject, 'task-beta', '2026-10-05');
type TaskState = Record<string, unknown> & { id: string; projectId: string };
/** The Project title the My Tasks rows carry; Projects never presents it. */
const titleReadWithMyTasks = 'Pregătire demo, as listed in My Tasks';
const atelierRow = `${sharedTitle} Client: ${atelier.displayName}`;
const betaProjectRead = `GET /api/projects/${betaProject.id}`;
const atelierProjectRead = `GET /api/projects/${atelierProject.id}`;
const taskRead = (task: { id: string }) => `GET /api/tasks/${task.id}`;
const taskDraft = 'Collect the signed questionnaire';

function actorFor(companyId: string): ActorContext {
  return {
    internalUserId: attribution.internalUserId,
    workspaceMembershipId: me.workspaceMembershipId,
    workspaceId: 'workspace',
    workspaceName: 'Workspace',
    displayName: attribution.displayName,
    email: 'coordinator@example.test',
    active: true,
    workspacePermissions: [],
    activeCompany: {
      ...(companyId === companyB.id ? companyB : companyA),
      clientPermissions: ['client.read'],
      clientPermissionAssignmentId: 'client-grant',
      clientPermissionSetVersion: 'v2',
      projectPermissions: ['project.read'],
      taskPermissions: ['task.read', 'task.manage'],
      taskPermissionAssignmentId: 'task-grant',
      taskPermissionSetVersion: 'v1',
    },
  };
}

type ServerRequest = {
  route: string;
  companyId: string | null;
  signal: AbortSignal | undefined;
};

/**
 * Two Companies' synthetic server. Company A holds two same-titled Projects,
 * each with one same-titled Task assigned to the reader. My Tasks answers
 * from its own list, so a Task can change after the list was read. A held
 * route waits for an explicit release.
 */
function installServer() {
  const tasks = new Map<string, TaskState>([
    [atelierTask.id, atelierTask],
    [betaTask.id, betaTask],
  ]);
  let assigned: TaskState[] = [atelierTask, betaTask];
  const requests: ServerRequest[] = [];
  const holding = new Set<string>();
  const held: Array<ServerRequest & { answer: (response: Response) => void }> =
    [];
  function created(task: typeof atelierTask) {
    return {
      id: `${task.id}-created`,
      action: 'task.created',
      occurredAt: task.createdAt,
      actor: attribution,
      target: {
        type: 'task',
        taskId: task.id,
        taskTitle: task.title,
        companyId: companyA.id,
      },
      metadata: {
        version: 1,
        initial: {
          title: task.title,
          assignee: task.assignee,
          dueDate: task.dueDate,
        },
      },
    };
  }
  function answer({ route, companyId }: ServerRequest): Response {
    const inB = companyId === companyB.id;
    if (route === 'GET /api/access/current-actor')
      return Response.json(actorFor(companyId ?? companyA.id));
    if (route === 'GET /api/companies')
      return Response.json([companyA, companyB]);
    if (route === 'GET /api/activity-log') return Response.json({ events: [] });
    if (route === 'GET /api/assigned-tasks')
      return Response.json({
        tasks: inB
          ? []
          : assigned.map((task) => {
              const owner =
                task.projectId === atelierProject.id
                  ? atelierProject
                  : betaProject;
              return {
                ...task,
                project: {
                  id: owner.id,
                  title: titleReadWithMyTasks,
                  clientDisplayName: owner.clientDisplayName,
                },
              };
            }),
      });
    if (route === 'GET /api/clients')
      return Response.json(
        (inB ? [] : [atelier, beta]).map((client) => ({
          ...client,
          relatedToActiveCompany: true,
        })),
      );
    if (route === 'GET /api/projects')
      return Response.json(
        inB ? [otherCompanyProject] : [atelierProject, betaProject],
      );
    if (inB) return new Response(null, { status: 404 });
    for (const owner of [atelierProject, betaProject]) {
      const path = `/api/projects/${owner.id}`;
      if (route === `GET ${path}`) return Response.json(owner);
      if (route === `GET ${path}/tasks`)
        return Response.json({
          mutable: true,
          tasks: [...tasks.values()].filter(
            (task) => task.projectId === owner.id,
          ),
        });
      if (route === `GET ${path}/eligible-task-assignees`)
        return Response.json({ members: [me] });
    }
    for (const original of [atelierTask, betaTask]) {
      if (route === taskRead(original))
        return Response.json({ mutable: true, task: tasks.get(original.id) });
      if (route === `${taskRead(original)}/history`)
        return Response.json({ events: [created(original)] });
    }
    return new Response(null, { status: 404 });
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input.toString(), window.location.origin);
      const request: ServerRequest = {
        route: `${init?.method ?? 'GET'} ${url.pathname}`,
        companyId: new Headers(init?.headers).get('x-company-context-id'),
        signal: init?.signal ?? undefined,
      };
      requests.push(request);
      if (!holding.has(request.route)) return answer(request);
      return new Promise<Response>((resolve) => {
        held.push({ ...request, answer: resolve });
      });
    }),
  );
  function heldRequest(route: string) {
    const found = held.find((candidate) => candidate.route === route);
    if (!found) throw new Error(`Nothing is held for ${route}`);
    return found;
  }
  return {
    /** The Task changes on the server after My Tasks listed it. */
    change(task: TaskState, stillAssigned: boolean) {
      tasks.set(task.id, task);
      assigned = assigned.filter(
        (candidate) => stillAssigned || candidate.id !== task.id,
      );
    },
    hold: (route: string) => holding.add(route),
    serve: (route: string) => holding.delete(route),
    count: (route: string) =>
      requests.filter((request) => request.route === route).length,
    commands: () =>
      requests.filter((request) => !request.route.startsWith('GET ')),
    requested: (route: string) => waitFor(() => heldRequest(route)),
    async release(route: string) {
      const request = await waitFor(() => heldRequest(route));
      held.splice(held.indexOf(request), 1);
      await act(async () => {
        request.answer(answer(request));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    },
  };
}

function navigateTo(label: string) {
  fireEvent.click(
    within(
      screen.getByRole('navigation', { name: 'Primary navigation' }),
    ).getByRole('link', { name: label }),
  );
}
const projectsRegion = () => screen.getByRole('region', { name: 'Projects' });
const myTasksRegion = () =>
  screen.getByRole('region', { name: taskCopy.myTasks.title });
const projectDetail = () =>
  within(projectsRegion()).queryByRole('article', { name: sharedTitle });
/** The Tasks panel of the opened Project; other Projects' panels are hidden. */
const visibleTasks = () =>
  within(projectsRegion()).getByRole('region', { name: 'Tasks' });
const taskTitleField = () =>
  within(visibleTasks()).getByLabelText('Task title');
const openName = (client: typeof atelier) =>
  taskCopy.myTasks.openTask({
    task: taskTitle,
    project: titleReadWithMyTasks,
    client: client.displayName,
  });
/** The Open action of the My Tasks row due on that date. */
async function openAction(task: typeof atelierTask) {
  const client = task.projectId === atelierProject.id ? atelier : beta;
  return waitFor(() => {
    const row = within(myTasksRegion())
      .getAllByRole('listitem')
      .find((item) => item.querySelector(`time[datetime="${task.dueDate}"]`));
    if (!row) throw new Error(`Expected the My Tasks row due ${task.dueDate}.`);
    return within(row).getByRole('button', { name: openName(client) });
  });
}
async function openedProject(client: typeof atelier) {
  return waitFor(() => {
    const detail = projectDetail();
    if (!detail) throw new Error('Expected an opened Project detail.');
    expect(
      within(detail).getByText(`Client: ${client.displayName}`),
    ).toBeVisible();
    return detail;
  });
}
/** Waits until the opened Tasks panel shows that Task's detail. */
function openedTask(task: { dueDate: string }) {
  return waitFor(() => {
    const tasks = visibleTasks();
    expect(
      within(tasks).getByRole('heading', { name: taskTitle }),
    ).toBeVisible();
    expect(
      within(tasks).getByText(task.dueDate, { selector: 'dd' }),
    ).toBeVisible();
    return tasks;
  });
}
/** Waits for a Project row of the currently mounted Projects owner. */
const projectRow = (row: string) =>
  waitFor(() => within(projectsRegion()).getByRole('button', { name: row }));
async function chooseProjectRow(row: string) {
  fireEvent.click(await projectRow(row));
}
async function selectCompany(companyId: string) {
  const selector = () =>
    screen.getByLabelText('Active Company', { exact: true });
  changeValue(selector(), companyId);
  await waitFor(() => {
    expect(selector()).toHaveValue(companyId);
    expect(selector()).toBeEnabled();
  });
}
const frames = () =>
  act(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });

// jsdom does not implement scrolling; the browser specs prove the real scroll.
const scrollable: {
  scrollIntoView?: (options?: ScrollIntoViewOptions) => void;
} = Element.prototype;
const nativeScrollIntoView = scrollable.scrollIntoView;

describe('Opening an assigned Task from My Tasks through App', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    scrollable.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    scrollable.scrollIntoView = nativeScrollIntoView;
    window.history.replaceState(null, '', '/');
  });

  it('opens the exact Project and Task of a same-titled row by their own reads and keeps another Project’s Task draft', async () => {
    window.history.replaceState(null, '', '/?frame=prisme#projects');
    const server = installServer();
    render(<App identity={deterministicBrowserIdentity()} />);
    await chooseProjectRow(atelierRow);
    await openedProject(atelier);
    fireEvent.click(
      await waitFor(() =>
        within(visibleTasks()).getByRole('button', { name: taskTitle }),
      ),
    );
    await openedTask(atelierTask);
    changeValue(taskTitleField(), taskDraft);

    navigateTo(taskCopy.myTasks.title);
    const open = await openAction(betaTask);
    expect(open).toHaveTextContent(taskCopy.myTasks.open);
    fireEvent.click(open);

    // The Projects section is shown and focused; later replies keep focus.
    await frames();
    expect(document.activeElement).toBe(projectsRegion());
    expect(projectsRegion()).toBeVisible();
    await openedProject(beta);
    const tasks = await openedTask(betaTask);
    expect(document.activeElement).toBe(projectsRegion());
    expect(taskTitleField()).toHaveValue(taskTitle);
    expect(
      within(tasks).getByRole('region', { name: taskCopy.history }),
    ).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Tasks' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    // One fresh Project read and one completed Task open cycle; My Tasks is
    // not re-read and nothing is sent.
    expect(server.count(betaProjectRead)).toBe(1);
    expect(server.count(`${betaProjectRead}/tasks`)).toBe(1);
    expect(server.count(taskRead(betaTask))).toBe(1);
    expect(server.count(`${taskRead(betaTask)}/history`)).toBe(1);
    expect(server.count(`${betaProjectRead}/eligible-task-assignees`)).toBe(1);
    expect(server.count('GET /api/assigned-tasks')).toBe(1);
    expect(server.commands()).toEqual([]);
    // Nothing identifies the target outside its owners' reads.
    expect(
      within(projectsRegion()).queryByText(titleReadWithMyTasks, {
        exact: false,
      }),
    ).not.toBeInTheDocument();
    for (const id of [betaProject.id, betaTask.id]) {
      expect(window.location.href).not.toContain(id);
      expect(JSON.stringify(window.history.state ?? null)).not.toContain(id);
      expect(document.body.textContent).not.toContain(id);
    }

    await chooseProjectRow(atelierRow);
    await openedTask(atelierTask);
    expect(taskTitleField()).toHaveValue(taskDraft);
    expect(server.count(taskRead(atelierTask))).toBe(1);
  });

  it.each([
    {
      change: 'completed',
      current: {
        ...betaTask,
        status: 'done',
        completion: {
          actor: attribution,
          occurredAt: '2026-09-24T10:00:00.000Z',
        },
        version: 2,
      },
      shows: (tasks: HTMLElement) => {
        expect(
          within(tasks).getByText(/Completion declared by Coordinator/),
        ).toBeVisible();
        expect(
          within(tasks).getByRole('button', { name: taskCopy.moves.reopen }),
        ).toBeVisible();
      },
    },
    {
      change: 'reassigned',
      current: { ...betaTask, assignee: colleague, version: 2 },
      shows: (tasks: HTMLElement) =>
        expect(
          within(tasks).getByText(colleague.displayLabel, { selector: 'dd' }),
        ).toBeVisible(),
    },
  ])(
    'opens a Task $change since My Tasks was read in its current state, leaving My Tasks unchanged until Refresh',
    async ({ current, shows }) => {
      window.history.replaceState(null, '', '/?frame=classic');
      const server = installServer();
      render(<App identity={deterministicBrowserIdentity()} />);
      const open = await openAction(betaTask);
      server.change(current, false);

      fireEvent.click(open);
      await openedProject(beta);
      shows(await openedTask(betaTask));
      expect(within(myTasksRegion()).getAllByRole('listitem')).toHaveLength(2);
      expect(server.count('GET /api/assigned-tasks')).toBe(1);

      fireEvent.click(
        within(myTasksRegion()).getByRole('button', {
          name: taskCopy.myTasks.refresh,
        }),
      );
      await waitFor(() =>
        expect(within(myTasksRegion()).getAllByRole('listitem')).toHaveLength(
          1,
        ),
      );
      expect(server.count('GET /api/assigned-tasks')).toBe(2);
      expect(server.commands()).toEqual([]);
    },
  );

  // A Task read already under way stays in its own Project's hidden panel,
  // exactly as after choosing that Project and Task by hand.
  it.each([
    {
      held: 'its Project read',
      route: atelierProjectRead,
      earlierAborted: true,
      atelierTaskReads: 0,
    },
    {
      held: 'its Task read',
      route: taskRead(atelierTask),
      earlierAborted: false,
      atelierTaskReads: 1,
    },
  ])(
    'renders only the latest of two quick activations when the earlier one waits on $held',
    async ({ route, earlierAborted, atelierTaskReads }) => {
      window.history.replaceState(null, '', '/?frame=classic');
      const server = installServer();
      render(<App identity={deterministicBrowserIdentity()} />);
      server.hold(route);
      fireEvent.click(await openAction(atelierTask));
      const earlier = await server.requested(route);

      fireEvent.click(await openAction(betaTask));
      await openedProject(beta);
      await openedTask(betaTask);
      expect(earlier.signal?.aborted).toBe(earlierAborted);
      await server.release(route);

      await openedProject(beta);
      const tasks = await openedTask(betaTask);
      expect(
        within(tasks).queryByText(atelierTask.dueDate, { selector: 'dd' }),
      ).not.toBeInTheDocument();
      expect(screen.getAllByRole('article')).toHaveLength(1);
      expect(server.count(taskRead(atelierTask))).toBe(atelierTaskReads);
      expect(server.count(taskRead(betaTask))).toBe(1);
    },
  );

  it.each([
    { held: 'its Project read', route: betaProjectRead, taskReads: 0 },
    { held: 'its Task read', route: taskRead(betaTask), taskReads: 1 },
  ])(
    'retires an activation waiting on $held when the Company changes, and never replays it on return',
    async ({ route, taskReads }) => {
      window.history.replaceState(null, '', '/?frame=classic');
      const server = installServer();
      render(<App identity={deterministicBrowserIdentity()} />);
      server.hold(route);
      fireEvent.click(await openAction(betaTask));
      await server.requested(route);

      await selectCompany(companyB.id);
      await projectRow(
        `${otherCompanyProject.title} Client: ${beta.displayName}`,
      );
      await selectCompany(companyA.id);
      await projectRow(atelierRow);
      server.serve(route);
      await server.release(route);
      await act(
        async () => await new Promise((resolve) => setTimeout(resolve)),
      );

      expect(projectDetail()).not.toBeInTheDocument();
      expect(
        within(projectsRegion()).queryByRole('heading', { name: taskTitle }),
      ).not.toBeInTheDocument();
      expect(server.count(betaProjectRead)).toBe(1);
      expect(server.count(taskRead(betaTask))).toBe(taskReads);
    },
  );
});
