import { changeValue } from '../test/select-option';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '../test/render-with-interface-locale';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { ProjectWorkspace } from './ProjectWorkspace';
import type { ProjectNavigationRequest } from './use-project-navigation';
import {
  isLifecycleRead,
  preparatoryLifecycle,
} from './project-lifecycle.test-fixtures';
import { taskCopy } from './task.copy';

const company = {
  id: 'company',
  displayName: 'PRISMA-PRIM',
  projectPermissions: ['project.read', 'project.create'],
  taskPermissions: ['task.read', 'task.manage'],
  taskPermissionAssignmentId: 'task-grant',
  taskPermissionSetVersion: 'v1',
} satisfies ActorContext['activeCompany'];
const actor: ActorContext = {
  internalUserId: 'owner',
  workspaceMembershipId: 'member',
  workspaceId: 'workspace',
  workspaceName: 'Workspace',
  displayName: 'Owner',
  email: 'owner@example.test',
  active: true,
  workspacePermissions: ['client.manage'],
  activeCompany: company,
};
const atelier = { id: 'client-atelier', displayName: 'Atelier Demo SRL' };
const beta = { id: 'client-beta', displayName: 'Beta Demo SRL' };
const sharedTitle = 'Pregătire demo';
const project = (client: typeof atelier, id: string) => ({
  id,
  companyId: company.id,
  clientAccountId: client.id,
  clientDossierId: client.id,
  clientDisplayName: client.displayName,
  title: sharedTitle,
  status: 'preparatory',
  createdAt: '2026-09-19T08:00:00.000Z',
});
const atelierProject = project(atelier, 'project-atelier');
const betaProject = project(beta, 'project-beta');
const registeredProject = {
  ...project(beta, 'project-registered'),
  title: 'Registered preparation',
};
const me = { workspaceMembershipId: 'member', displayLabel: 'Owner · 1' };
const attribution = {
  internalUserId: 'owner',
  workspaceMembershipId: me.workspaceMembershipId,
  displayName: 'Owner',
};
const taskOf = (
  owner: typeof atelierProject,
  id: string,
  title: string,
  dueDate: string,
) => ({
  id,
  companyId: company.id,
  projectId: owner.id,
  clientAccountId: owner.clientAccountId,
  title,
  assignee: me,
  dueDate,
  priority: 'normal',
  status: 'todo',
  completion: null,
  version: 1,
  createdAt: '2026-09-19T09:00:00.000Z',
  updatedAt: '2026-09-19T09:00:00.000Z',
  createdBy: attribution,
});
type TaskRow = ReturnType<typeof taskOf>;
const taskOne = taskOf(
  betaProject,
  'task-one',
  'Collect preparation notes',
  '2026-09-28',
);
const taskTwo = taskOf(
  betaProject,
  'task-two',
  'Chestionar inițial',
  '2026-10-05',
);
const atelierTask = taskOf(
  atelierProject,
  'task-atelier',
  'Chestionar inițial',
  '2026-09-30',
);
const dueDateLabels = new Map([
  ['2026-09-28', 'Sep 28, 2026'],
  ['2026-09-30', 'Sep 30, 2026'],
  ['2026-10-05', 'Oct 5, 2026'],
]);
const atelierRow = `${sharedTitle} Client: ${atelier.displayName}`;
const betaRow = `${sharedTitle} Client: ${beta.displayName}`;
const betaProjectRead = `GET /api/projects/${betaProject.id}`;
const betaTasksRead = `${betaProjectRead}/tasks`;
const taskRead = (task: TaskRow) => `GET /api/tasks/${task.id}`;
const taskEdit = (task: TaskRow) => `PATCH /api/tasks/${task.id}`;
const taskMove = (task: TaskRow) => `POST /api/tasks/${task.id}/status`;
const deniedMessage =
  'Project access and Client read access are required for this Company.';
const loadOrSaveError =
  'The Project could not be loaded or saved. Please try again.';
type ServerRequest = {
  route: string;
  key: string | null;
  body: string | undefined;
  signal: AbortSignal | undefined;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * One Company's Project and Task server. Two same-titled Projects each hold a
 * Task titled "Chestionar inițial"; Beta also holds a second Task. A held
 * route waits for an explicit release; a one-time reply replaces one answer.
 */
function taskServer() {
  const tasks = new Map<string, TaskRow>(
    [taskOne, taskTwo, atelierTask].map((task) => [task.id, task]),
  );
  const requests: ServerRequest[] = [];
  const holding = new Set<string>();
  const held: Array<ServerRequest & { answer: (response: Response) => void }> =
    [];
  const replies = new Map<string, () => Response>();
  function answer(request: ServerRequest): Response {
    const { route } = request;
    const reply = replies.get(route);
    if (reply) {
      replies.delete(route);
      return reply();
    }
    if (route === 'GET /api/clients') return Response.json([atelier, beta]);
    if (route === 'GET /api/projects')
      return Response.json([atelierProject, betaProject]);
    if (route === 'POST /api/projects')
      return Response.json(registeredProject, { status: 201 });
    for (const owner of [atelierProject, betaProject, registeredProject]) {
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
    for (const task of tasks.values()) {
      if (route === taskRead(task))
        return Response.json({ mutable: true, task });
      if (route === `${taskRead(task)}/history`)
        return Response.json({
          events: [
            {
              id: `${task.id}-created`,
              action: 'task.created',
              occurredAt: task.createdAt,
              actor: attribution,
              target: {
                type: 'task',
                taskId: task.id,
                taskTitle: task.title,
                companyId: company.id,
              },
              metadata: {
                version: 1,
                initial: {
                  title: task.title,
                  assignee: task.assignee,
                  dueDate: task.dueDate,
                },
              },
            },
          ],
        });
      if (route === taskEdit(task)) {
        const body: unknown = JSON.parse(request.body ?? '{}');
        const edited = {
          ...task,
          title:
            isRecord(body) && typeof body.title === 'string'
              ? body.title
              : task.title,
          version: task.version + 1,
        };
        tasks.set(task.id, edited);
        return Response.json(edited);
      }
      if (route === taskMove(task)) {
        const body: unknown = JSON.parse(request.body ?? '{}');
        const moved = {
          ...task,
          status:
            isRecord(body) && typeof body.status === 'string'
              ? body.status
              : task.status,
          version: task.version + 1,
        };
        tasks.set(task.id, moved);
        return Response.json(moved);
      }
    }
    if (route.startsWith('GET ') && isLifecycleRead(route.slice(4)))
      return Response.json(preparatoryLifecycle);
    return new Response(null, { status: 404 });
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const request: ServerRequest = {
        route: `${init?.method ?? 'GET'} ${url}`,
        key: new Headers(init?.headers).get('idempotency-key'),
        body: typeof init?.body === 'string' ? init.body : undefined,
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
    /** Another member changed the Task after it was read here. */
    revise(task: TaskRow, changes: Partial<TaskRow>) {
      tasks.set(task.id, { ...task, ...changes });
    },
    replyOnce: (route: string, reply: () => Response) =>
      replies.set(route, reply),
    hold: (route: string) => holding.add(route),
    serve: (route: string) => holding.delete(route),
    count: (route: string) =>
      requests.filter((request) => request.route === route).length,
    requests: (route: string) =>
      requests.filter((request) => request.route === route),
    requested: (route: string) => waitFor(() => heldRequest(route)),
    async release(route: string, response?: Response) {
      const request = await waitFor(() => heldRequest(route));
      held.splice(held.indexOf(request), 1);
      await act(async () => {
        request.answer(response ?? answer(request));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      return request;
    },
  };
}

function renderWorkspace(strict = false) {
  let identity = deterministicBrowserIdentity();
  let currentActor = actor;
  let revision = 0;
  let current: ProjectNavigationRequest | undefined;
  const workspace = () => (
    <ProjectWorkspace
      actor={currentActor}
      identity={identity}
      clientIdentityRevision={revision}
      navigation={current}
    />
  );
  const view = render(workspace(), { reactStrictMode: strict });
  return {
    request(
      owner: typeof atelierProject,
      task: TaskRow,
      requestId: number,
      sourceSignal?: AbortSignal,
    ) {
      current = {
        kind: 'project',
        projectId: owner.id,
        taskId: task.id,
        requestId,
        sourceSignal,
        focus: sourceSignal ? 'task' : undefined,
      };
      view.rerender(workspace());
    },
    rerenderSameRequest() {
      current = current ? { ...current } : undefined;
      view.rerender(workspace());
    },
    replaceActor(next: ActorContext) {
      currentActor = next;
      view.rerender(workspace());
    },
    replaceIdentity() {
      identity = deterministicBrowserIdentity();
      view.rerender(workspace());
    },
    /** A confirmed Client union or reversal elsewhere in the shell. */
    changeClientIdentities() {
      revision += 1;
      view.rerender(workspace());
    },
  };
}
const openedDetail = () => screen.queryByRole('article', { name: sharedTitle });
const detailClient = () =>
  openedDetail()?.querySelector('.project-detail-client')?.textContent ?? null;
/** The Tasks panel of the opened Project; other Projects' panels are hidden. */
const tasksPanel = () => screen.getByRole('region', { name: taskCopy.title });
const settle = () =>
  act(async () => await new Promise((resolve) => setTimeout(resolve)));
/** Waits until the opened Tasks panel shows that Task's detail. */
function openedTask(task: { title: string; dueDate: string }) {
  const dueDateLabel = dueDateLabels.get(task.dueDate);
  if (dueDateLabel === undefined)
    throw new Error(`No expected date label for fixture ${task.dueDate}.`);
  return waitFor(() => {
    const tasks = tasksPanel();
    expect(
      within(tasks).getByRole('heading', { name: task.title }),
    ).toBeVisible();
    const dueDate = tasks.querySelector(
      `.task-facts time[datetime="${task.dueDate}"]`,
    );
    expect(dueDate).toBeVisible();
    expect(dueDate?.textContent).toBe(dueDateLabel);
    return tasks;
  });
}
/** Chooses the Project row, then the Task row, by hand. */
async function chooseTask(row: string, task: TaskRow) {
  fireEvent.click(await screen.findByRole('button', { name: row }));
  fireEvent.click(
    await waitFor(() =>
      within(tasksPanel()).getByRole('button', { name: task.title }),
    ),
  );
  return openedTask(task);
}
async function startRegistration(server: ReturnType<typeof taskServer>) {
  await screen.findByRole('button', { name: betaRow });
  changeValue(screen.getByLabelText('Project title'), registeredProject.title);
  changeValue(screen.getByLabelText('Client'), beta.id);
  server.hold('POST /api/projects');
  fireEvent.click(screen.getByRole('button', { name: 'Create Project' }));
  return server.requested('POST /api/projects');
}

describe('Requested Task opens', () => {
  it.each([200, 403])(
    'retires the inline Task read before an abort-ignoring late %s reply',
    async (status) => {
      const server = taskServer();
      const workspace = renderWorkspace();
      await screen.findByRole('button', { name: betaRow });
      const source = new AbortController();
      server.hold(taskRead(taskTwo));
      workspace.request(betaProject, taskTwo, 1, source.signal);
      const held = await server.requested(taskRead(taskTwo));
      await act(async () => source.abort());
      expect(held.signal?.aborted).toBe(true);
      await server.release(
        taskRead(taskTwo),
        status === 200
          ? Response.json({ mutable: true, task: taskTwo })
          : new Response(null, { status }),
      );
      expect(
        within(tasksPanel()).queryByRole('heading', { name: taskTwo.title }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: betaRow })).toBeInTheDocument();
      expect(screen.queryByText(taskCopy.denied)).not.toBeInTheDocument();
    },
  );

  it('abandons an inline Task queued behind a command while preserving its exact uncertain retry', async () => {
    const server = taskServer();
    const workspace = renderWorkspace();
    const tasks = await chooseTask(betaRow, taskOne);
    changeValue(
      within(tasks).getByLabelText('Task title'),
      'Corrected preparation notes',
    );
    server.hold(taskEdit(taskOne));
    fireEvent.click(within(tasks).getByRole('button', { name: 'Save Task' }));
    const command = await server.requested(taskEdit(taskOne));
    const source = new AbortController();
    workspace.request(betaProject, taskTwo, 1, source.signal);
    await waitFor(() => expect(server.count(betaProjectRead)).toBe(2));
    await settle();
    await act(async () => source.abort());
    expect(command.signal?.aborted).toBe(false);
    await server.release(
      taskEdit(taskOne),
      new Response(null, { status: 500 }),
    );
    const retry = await within(tasksPanel()).findByRole('button', {
      name: taskCopy.retry,
    });
    expect(server.count(taskRead(taskTwo))).toBe(0);
    fireEvent.click(retry);
    await waitFor(() => expect(server.count(taskEdit(taskOne))).toBe(2));
    const [first, retried] = server.requests(taskEdit(taskOne));
    expect(first?.key).toBeTruthy();
    expect(retried?.key).toBe(first?.key);
    expect(retried?.body).toBe(first?.body);
  });

  it.each([
    { visit: 'never opened', prepare: async () => undefined, reads: 1 },
    {
      visit: 'opened before',
      prepare: async () => {
        fireEvent.click(screen.getByRole('button', { name: betaRow }));
        await waitFor(() =>
          within(tasksPanel()).getByRole('button', { name: taskOne.title }),
        );
        fireEvent.click(screen.getByRole('button', { name: atelierRow }));
        await waitFor(() =>
          expect(detailClient()).toBe(`Client: ${atelier.displayName}`),
        );
      },
      reads: 2,
    },
  ])(
    'reads a Project $visit first, then opens the Task in one completed cycle',
    async ({ prepare, reads }) => {
      const server = taskServer();
      const workspace = renderWorkspace();
      await screen.findByRole('button', { name: betaRow });
      await prepare();
      server.hold(betaProjectRead);

      workspace.request(betaProject, taskTwo, 1);
      await server.requested(betaProjectRead);
      await settle();
      expect(server.count(betaTasksRead)).toBe(reads - 1);
      expect(server.count(taskRead(taskTwo))).toBe(0);
      await server.release(betaProjectRead);

      const tasks = await openedTask(taskTwo);
      expect(detailClient()).toBe(`Client: ${beta.displayName}`);
      expect(within(tasks).getByLabelText('Task title')).toHaveValue(
        taskTwo.title,
      );
      expect(
        within(tasks).getByRole('region', { name: taskCopy.history }),
      ).toBeVisible();
      expect(server.count(betaProjectRead)).toBe(reads);
      expect(server.count(betaTasksRead)).toBe(reads);
      expect(server.count(taskRead(taskTwo))).toBe(1);
      expect(server.count(`${taskRead(taskTwo)}/history`)).toBe(1);
      expect(server.count(`${betaProjectRead}/eligible-task-assignees`)).toBe(
        reads,
      );
      expect(server.count(taskRead(atelierTask))).toBe(0);
    },
  );

  it.each([
    { reply: 'forbidden', status: 403, message: deniedMessage },
    { reply: 'not found', status: 404, message: loadOrSaveError },
    { reply: 'failed', status: 500, message: loadOrSaveError },
  ])(
    'reads and selects no Task when the Project read is $reply',
    async ({ status, message }) => {
      const server = taskServer();
      const workspace = renderWorkspace();
      await screen.findByRole('button', { name: betaRow });
      server.hold(betaProjectRead);

      workspace.request(betaProject, taskTwo, 1);
      await server.release(betaProjectRead, new Response(null, { status }));
      await settle();

      expect(screen.getByRole('alert')).toHaveTextContent(message);
      expect(openedDetail()).not.toBeInTheDocument();
      expect(
        screen.queryByRole('region', { name: taskCopy.title }),
      ).not.toBeInTheDocument();
      expect(server.count(betaTasksRead)).toBe(0);
      expect(server.count(taskRead(taskTwo))).toBe(0);
    },
  );

  it.each(['Project', 'Company'])(
    'refuses an exact opening response for another %s before selecting any detail',
    async (mismatch) => {
      const server = taskServer();
      const workspace = renderWorkspace();
      await screen.findByRole('button', { name: betaRow });
      server.replyOnce(betaProjectRead, () =>
        Response.json(
          mismatch === 'Project'
            ? atelierProject
            : { ...betaProject, companyId: 'other-company' },
        ),
      );

      workspace.request(betaProject, taskTwo, 1);
      expect(await screen.findByRole('alert')).toHaveTextContent(
        loadOrSaveError,
      );
      expect(openedDetail()).not.toBeInTheDocument();
      await settle();

      expect(server.count(taskRead(taskTwo))).toBe(0);
      expect(server.count(taskRead(atelierTask))).toBe(0);
      expect(
        screen.queryByRole('heading', { name: taskTwo.title }),
      ).not.toBeInTheDocument();
    },
  );

  it('keeps an already opened inline Task independent while its eligible-member lookup is still pending', async () => {
    const server = taskServer();
    const workspace = renderWorkspace();
    await screen.findByRole('button', { name: betaRow });
    const members = 'GET /api/projects/project-beta/eligible-task-assignees';
    server.hold(members);
    const source = new AbortController();
    workspace.request(betaProject, taskTwo, 1, source.signal);
    const detail = await openedTask(taskTwo);
    const auxiliary = await server.requested(members);
    const heading = within(detail).getByRole('heading', {
      name: taskTwo.title,
    });
    await waitFor(() => expect(heading).toHaveFocus());
    await act(async () => source.abort());
    expect(heading).toBeVisible();
    expect(heading).toHaveFocus();
    expect(auxiliary.signal?.aborted).toBe(false);
    await server.release(members);
    expect(heading).toBeVisible();
  });

  it.each([
    { reply: 'missing', status: 404, message: taskCopy.missing },
    { reply: 'denied', status: 403, message: taskCopy.denied },
  ])(
    'shows the existing $reply state for the requested Task',
    async ({ status, message }) => {
      const server = taskServer();
      const workspace = renderWorkspace();
      await screen.findByRole('button', { name: betaRow });
      server.replyOnce(taskRead(taskTwo), () => new Response(null, { status }));

      workspace.request(betaProject, taskTwo, 1);
      const tasks = await waitFor(() => {
        const panel = tasksPanel();
        expect(within(panel).getByText(message)).toBeVisible();
        return panel;
      });
      expect(
        within(tasks).queryByRole('heading', { name: taskTwo.title }),
      ).not.toBeInTheDocument();
      expect(
        within(tasks).queryByRole('region', { name: taskCopy.history }),
      ).not.toBeInTheDocument();
      expect(
        within(tasks).queryByRole('button', {
          name: /Save Task|Mark done|Reopen Task/,
        }),
      ).not.toBeInTheDocument();
    },
  );

  it.each([false, true])(
    'waits for a pending Task command and the read of its result, never aborting it, then opens with root StrictMode=%s',
    async (strict) => {
      const server = taskServer();
      const workspace = renderWorkspace(strict);
      const tasks = await chooseTask(betaRow, taskOne);
      changeValue(
        within(tasks).getByLabelText('Task title'),
        'Corrected preparation notes',
      );
      server.hold(taskEdit(taskOne));
      fireEvent.click(within(tasks).getByRole('button', { name: 'Save Task' }));
      const command = await server.requested(taskEdit(taskOne));

      workspace.request(betaProject, taskTwo, 1);
      await waitFor(() =>
        expect(detailClient()).toBe(`Client: ${beta.displayName}`),
      );
      await settle();
      expect(command.signal?.aborted).toBe(false);
      expect(server.count(taskRead(taskTwo))).toBe(0);

      // The confirmed command's result is read before the requested Task opens.
      server.hold(taskRead(taskOne));
      await server.release(taskEdit(taskOne));
      await server.requested(taskRead(taskOne));
      await settle();
      expect(server.count(taskRead(taskTwo))).toBe(0);
      await server.release(taskRead(taskOne));

      const opened = await openedTask(taskTwo);
      expect(within(opened).getByLabelText('Task title')).toHaveValue(
        taskTwo.title,
      );
      expect(
        within(opened).getByRole('button', { name: 'Save Task' }),
      ).toBeEnabled();
      expect(server.count(taskEdit(taskOne))).toBe(1);
      expect(server.count(taskRead(taskTwo))).toBe(1);
    },
  );

  it('keeps a requested Task waiting on a pending command across a Client identity refresh of its Project', async () => {
    const server = taskServer();
    const workspace = renderWorkspace();
    const tasks = await chooseTask(betaRow, taskOne);
    changeValue(
      within(tasks).getByLabelText('Task title'),
      'Corrected preparation notes',
    );
    server.hold(taskEdit(taskOne));
    fireEvent.click(within(tasks).getByRole('button', { name: 'Save Task' }));
    await server.requested(taskEdit(taskOne));
    workspace.request(betaProject, taskTwo, 1);
    await waitFor(() => expect(server.count(betaProjectRead)).toBe(2));
    await waitFor(() =>
      expect(detailClient()).toBe(`Client: ${beta.displayName}`),
    );

    workspace.changeClientIdentities();
    await waitFor(() => expect(server.count(betaProjectRead)).toBe(3));
    await settle();
    expect(server.count(taskRead(taskTwo))).toBe(0);
    await server.release(taskEdit(taskOne));

    await openedTask(taskTwo);
    expect(server.count(taskRead(taskTwo))).toBe(1);
  });

  it.each([false, true])(
    'keeps an uncertain command’s payload and key for an unchanged retry with root StrictMode=%s',
    async (strict) => {
      const server = taskServer();
      const workspace = renderWorkspace(strict);
      const tasks = await chooseTask(betaRow, taskOne);
      changeValue(
        within(tasks).getByLabelText('Task title'),
        'Corrected preparation notes',
      );
      server.replyOnce(
        taskEdit(taskOne),
        () => new Response(null, { status: 500 }),
      );
      fireEvent.click(within(tasks).getByRole('button', { name: 'Save Task' }));
      await within(tasks).findByRole('button', { name: taskCopy.retry });

      workspace.request(betaProject, taskTwo, 1);
      const opened = await openedTask(taskTwo);
      expect(within(opened).getByText(taskCopy.uncertain)).toBeVisible();
      expect(
        within(opened).getByRole('button', { name: 'Save Task' }),
      ).toBeDisabled();

      fireEvent.click(
        within(opened).getByRole('button', { name: taskCopy.retry }),
      );
      await waitFor(() => expect(server.count(taskEdit(taskOne))).toBe(2));
      const [first, retried] = server.requests(taskEdit(taskOne));
      expect(first?.key).toBeTruthy();
      expect(retried?.key).toBe(first?.key);
      expect(retried?.body).toBe(first?.body);
      expect(first?.body).toBe(
        JSON.stringify({
          expectedVersion: 1,
          title: 'Corrected preparation notes',
        }),
      );
      // The recovered command shows its own Task; the request is not replayed.
      await openedTask({ ...taskOne, title: 'Corrected preparation notes' });
      await settle();
      expect(server.count(taskRead(taskTwo))).toBe(1);
    },
  );

  it.each([
    { outcome: 'confirmed while the requested Task waits', uncertain: false },
    {
      outcome:
        'recovered by an unchanged retry after the requested Task opened',
      uncertain: true,
    },
  ])(
    'keeps a Task’s unsaved title through its own status move $outcome, then saves it at the moved version',
    async ({ uncertain }) => {
      const server = taskServer();
      const workspace = renderWorkspace();
      const tasks = await chooseTask(betaRow, taskOne);
      changeValue(
        within(tasks).getByLabelText('Task title'),
        'Corrected preparation notes',
      );
      if (uncertain)
        server.replyOnce(
          taskMove(taskOne),
          () => new Response(null, { status: 500 }),
        );
      else server.hold(taskMove(taskOne));
      fireEvent.click(
        within(tasks).getByRole('button', { name: 'Mark in progress' }),
      );

      if (uncertain) {
        await within(tasks).findByRole('button', { name: taskCopy.retry });
        workspace.request(betaProject, taskTwo, 1);
        const opened = await openedTask(taskTwo);
        fireEvent.click(
          within(opened).getByRole('button', { name: taskCopy.retry }),
        );
      } else {
        await server.requested(taskMove(taskOne));
        workspace.request(betaProject, taskTwo, 1);
        await settle();
        expect(server.count(taskRead(taskTwo))).toBe(0);
        await server.release(taskMove(taskOne));
        await openedTask(taskTwo);
      }
      const row = await waitFor(() => {
        const button = within(tasksPanel()).getByRole('button', {
          name: taskOne.title,
        });
        expect(button).toBeEnabled();
        return button;
      });
      fireEvent.click(row);
      const returned = await waitFor(() => {
        const panel = tasksPanel();
        expect(
          within(panel).getByText(taskCopy.states.in_progress, {
            selector: 'p.task-status',
          }),
        ).toBeVisible();
        expect(within(panel).getByLabelText('Task title')).toHaveValue(
          'Corrected preparation notes',
        );
        expect(
          within(panel).getByRole('button', { name: 'Save Task' }),
        ).toBeEnabled();
        return panel;
      });
      const [move, ...retried] = server.requests(taskMove(taskOne));
      expect(move?.body).toBe(
        JSON.stringify({ expectedVersion: 1, status: 'in_progress' }),
      );
      expect(retried).toHaveLength(uncertain ? 1 : 0);
      for (const retry of retried) {
        expect(retry.key).toBe(move?.key);
        expect(retry.body).toBe(move?.body);
      }

      fireEvent.click(
        within(returned).getByRole('button', { name: 'Save Task' }),
      );
      await openedTask({ ...taskOne, title: 'Corrected preparation notes' });
      expect(
        server.requests(taskEdit(taskOne)).map((request) => request.body),
      ).toEqual([
        JSON.stringify({
          expectedVersion: 2,
          title: 'Corrected preparation notes',
        }),
      ]);
    },
  );

  it.each([
    {
      version: 'the same',
      revised: undefined,
      shown: { ...taskTwo, title: 'Draft for the questionnaire' },
    },
    {
      version: 'a newer',
      revised: { title: 'Chestionar inițial revizuit', version: 2 },
      shown: { ...taskTwo, title: 'Chestionar inițial revizuit' },
    },
  ])(
    'applies the saved-draft rule to the requested Task under $version version and keeps the create draft',
    async ({ revised, shown }) => {
      const server = taskServer();
      const workspace = renderWorkspace();
      const tasks = await chooseTask(betaRow, taskTwo);
      changeValue(
        within(tasks).getByLabelText('Task title'),
        'Draft for the questionnaire',
      );
      fireEvent.click(within(tasks).getByRole('button', { name: 'New Task' }));
      const creation = await waitFor(() => {
        const panel = tasksPanel();
        within(panel).getByRole('button', { name: 'Create Task' });
        return panel;
      });
      changeValue(
        within(creation).getByLabelText('Task title'),
        'Create draft',
      );
      fireEvent.click(
        within(creation).getByRole('button', { name: taskOne.title }),
      );
      await openedTask(taskOne);
      if (revised) server.revise(taskTwo, revised);

      workspace.request(betaProject, taskTwo, 1);
      const opened = await waitFor(() => {
        const panel = tasksPanel();
        expect(within(panel).getByLabelText('Task title')).toHaveValue(
          shown.title,
        );
        const dueDate = panel.querySelector(
          `.task-facts time[datetime="${shown.dueDate}"]`,
        );
        expect(dueDate).toBeVisible();
        expect(dueDate?.textContent).toBe('Oct 5, 2026');
        return panel;
      });
      fireEvent.click(within(opened).getByRole('button', { name: 'New Task' }));
      await waitFor(() =>
        expect(within(tasksPanel()).getByLabelText('Task title')).toHaveValue(
          'Create draft',
        ),
      );
    },
  );

  it('leaves the Task list filters unchanged and shows the requested detail although they hide its row', async () => {
    taskServer();
    const workspace = renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: betaRow }));
    const search = await waitFor(() =>
      within(tasksPanel()).getByRole('searchbox', { name: 'Search Tasks' }),
    );
    changeValue(search, 'notes');

    workspace.request(betaProject, taskTwo, 1);
    const opened = await openedTask(taskTwo);
    expect(
      within(opened).getByRole('searchbox', { name: 'Search Tasks' }),
    ).toHaveValue('notes');
    expect(
      within(opened).getByRole('button', { name: taskOne.title }),
    ).toBeInTheDocument();
    expect(
      within(opened).queryByRole('button', { name: taskTwo.title }),
    ).not.toBeInTheDocument();
  });

  it.each([false, true])(
    'lets a newer request supersede a Task open still reading, so its late reply never renders with root StrictMode=%s',
    async (strict) => {
      const server = taskServer();
      const workspace = renderWorkspace(strict);
      await screen.findByRole('button', { name: betaRow });
      server.hold(taskRead(taskOne));
      workspace.request(betaProject, taskOne, 1);
      const earlier = await server.requested(taskRead(taskOne));

      workspace.request(betaProject, taskTwo, 2);
      await openedTask(taskTwo);
      expect(earlier.signal?.aborted).toBe(true);
      await server.release(taskRead(taskOne));

      const tasks = await openedTask(taskTwo);
      expect(
        within(tasks).queryByRole('heading', { name: taskOne.title }),
      ).not.toBeInTheDocument();
      expect(server.count(betaProjectRead)).toBe(2);
    },
  );

  it('waits with the Project open behind a pending registration, then opens the Task', async () => {
    const server = taskServer();
    const workspace = renderWorkspace();
    const registration = await startRegistration(server);

    workspace.request(atelierProject, atelierTask, 1);
    await settle();
    expect(server.count(`GET /api/projects/${atelierProject.id}`)).toBe(0);
    expect(server.count(taskRead(atelierTask))).toBe(0);
    expect(registration.signal?.aborted).toBe(false);

    await server.release('POST /api/projects');
    await openedTask(atelierTask);
    expect(detailClient()).toBe(`Client: ${atelier.displayName}`);
    expect(server.count(taskRead(atelierTask))).toBe(1);
  });

  it('opens each request once and never replays it when an authority change remounts the Tasks', async () => {
    const server = taskServer();
    const workspace = renderWorkspace();
    workspace.request(betaProject, taskTwo, 1);
    await openedTask(taskTwo);
    workspace.rerenderSameRequest();
    await settle();
    expect(server.count(taskRead(taskTwo))).toBe(1);

    workspace.replaceActor({
      ...actor,
      activeCompany: { ...company, taskPermissionAssignmentId: 'replacement' },
    });
    await waitFor(() => expect(server.count(betaTasksRead)).toBe(2));
    await settle();

    expect(server.count(taskRead(taskTwo))).toBe(1);
    expect(
      within(tasksPanel()).queryByRole('heading', { name: taskTwo.title }),
    ).not.toBeInTheDocument();
  });

  it.each([false, true])(
    'drops a Task open still reading when the identity is replaced, and never replays it with root StrictMode=%s',
    async (strict) => {
      const server = taskServer();
      const workspace = renderWorkspace(strict);
      await screen.findByRole('button', { name: betaRow });
      server.hold(taskRead(taskTwo));
      workspace.request(betaProject, taskTwo, 1);
      const earlier = await server.requested(taskRead(taskTwo));

      workspace.replaceIdentity();
      await waitFor(() => expect(openedDetail()).not.toBeInTheDocument());
      await screen.findByRole('button', { name: betaRow });
      expect(earlier.signal?.aborted).toBe(true);
      server.serve(taskRead(taskTwo));
      await server.release(taskRead(taskTwo));
      workspace.rerenderSameRequest();
      await settle();

      expect(openedDetail()).not.toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { name: taskTwo.title }),
      ).not.toBeInTheDocument();
      expect(server.count(betaProjectRead)).toBe(1);
      expect(server.count(taskRead(taskTwo))).toBe(1);
    },
  );
});
