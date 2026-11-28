import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import {
  createClarteTasksApi,
  tasksColleague,
  tasksDay,
  tasksId,
  tasksProjects,
  tasksResultReference,
  tasksTitles,
  type ClarteTasksApi,
  type TasksReply,
} from './clarte/tasks/clarte-tasks.test-fixture';
import { renderInInterface } from './test/app-interface';
import {
  fireEvent,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';
import { selectOption } from './test/select-option';

/** A reply, `lost` for a request whose response never arrives, or nothing to let the fictional API answer. */
type Override = (request: {
  method: string;
  path: string;
}) => TasksReply | 'lost' | undefined;

function serve(
  api: ClarteTasksApi = createClarteTasksApi(),
  override?: Override,
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input.toString(), window.location.origin);
      const method = init?.method ?? 'GET';
      const body =
        typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      const reply =
        override?.({ method, path: url.pathname }) ??
        api.reply({ method, url, body });
      if (reply === 'lost') throw new TypeError('Fictional response lost');
      if ('pdf' in reply)
        return new Response(reply.pdf, {
          headers: { 'content-type': 'application/pdf' },
        });
      return Response.json(reply.json, { status: reply.status });
    }),
  );
  return api;
}

function openTasks(view: string) {
  window.history.replaceState(null, '', `/#${view}`);
  renderInInterface(
    'clarte',
    <App identity={deterministicBrowserIdentity()} />,
  );
}

async function region(name: string) {
  return screen.findByRole('region', { name });
}

/** Opens a Task's side panel from its row title. */
async function openPanel(view: HTMLElement, title: string) {
  fireEvent.click(await within(view).findByRole('button', { name: title }));
  const panel = await screen.findByRole('dialog', { name: title });
  await within(panel).findByRole('tabpanel', { name: 'Task' });
  return panel;
}

/** Shows one part of a Task's side panel through its tab. */
function showPart(
  panel: HTMLElement,
  name: 'Task' | 'Result' | 'History' | 'Project',
) {
  fireEvent.click(within(panel).getByRole('tab', { name }));
  return within(panel).getByRole('tabpanel', { name });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(
      (query: string) =>
        ({
          matches: false,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(() => false),
        }) satisfies MediaQueryList,
    ),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('Clarté Tasks', () => {
  it('blocks a Task with a reason from its side panel and shows the recorded blockage and history', async () => {
    const api = serve();
    openTasks('my-tasks');
    const view = await region('My Tasks');
    const panel = await openPanel(view, tasksTitles.questionnaire);
    // The panel names the Task's Project and Client in its header and Project part.
    expect(
      within(panel).getAllByText(
        `${tasksProjects.dairy.title} · ${tasksProjects.dairy.client.displayName}`,
      ),
    ).toHaveLength(2);

    const actions = within(panel).getByRole('group', { name: 'Task actions' });
    fireEvent.click(
      within(actions).getByRole('button', { name: 'Mark blocked' }),
    );
    fireEvent.change(within(panel).getByLabelText('Blockage reason'), {
      target: { value: '  Waiting for the supplier answers  ' },
    });
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Save blockage' }),
    );

    expect(
      await within(panel).findByText('Task change recorded.'),
    ).toBeVisible();
    const task = within(panel).getByRole('tabpanel', { name: 'Task' });
    await within(task).findByText('Waiting for the supplier answers');
    expect(within(task).getByText(/Blocked by Ada Ionescu/u)).toBeVisible();
    const history = showPart(panel, 'History');
    expect(within(history).getByText('Status changed')).toBeVisible();
    expect(
      within(history).getByText('Reason: Waiting for the supplier answers'),
    ).toBeVisible();
    expect(api.commands).toEqual([
      {
        method: 'POST',
        path: `/tasks/${tasksId('questionnaire')}/status`,
        body: {
          expectedVersion: 1,
          status: 'blocked',
          reason: 'Waiting for the supplier answers',
        },
      },
    ]);
    // The list behind the panel reads again and shows the blocked Task.
    fireEvent.click(within(panel).getByRole('button', { name: 'Close' }));
    expect(
      await within(view).findByText('Waiting for the supplier answers'),
    ).toBeVisible();
  });

  it('shows My Tasks by due date and opens a Task in its Project', async () => {
    serve();
    openTasks('my-tasks');
    const view = await region('My Tasks');
    const pastDue = await within(view).findByRole('region', {
      name: /Past due/u,
    });
    expect(
      within(pastDue).getByRole('heading', {
        name: tasksTitles.questionnaire,
      }),
    ).toBeVisible();
    expect(within(pastDue).getByText('Critical')).toBeVisible();
    const today = within(view).getByRole('region', { name: /Due today/u });
    expect(
      within(today).getByRole('heading', { name: tasksTitles.checklist }),
    ).toBeVisible();
    const undated = within(view).getByRole('region', { name: /No due date/u });
    expect(
      within(undated).getByRole('heading', { name: tasksTitles.budget }),
    ).toBeVisible();
    // Only the actor's own open Tasks.
    expect(within(view).queryByText(tasksTitles.records)).toBeNull();
    expect(within(view).queryByText(tasksTitles.participants)).toBeNull();

    fireEvent.click(
      within(view).getByRole('button', {
        name: `Open ${tasksTitles.checklist} in ${tasksProjects.dairy.title} (${tasksProjects.dairy.client.displayName})`,
      }),
    );
    await waitFor(() => expect(window.location.hash).toBe('#projects'));
  });

  it('lists Unassigned and Blocked Tasks with their reason, owner and due date, and Team Tasks under the applied criteria', async () => {
    serve();
    openTasks('unassigned-tasks');
    const unassigned = await region('Unassigned Tasks');
    expect(
      await within(unassigned).findByRole('heading', {
        name: tasksTitles.participants,
      }),
    ).toBeVisible();
    expect(
      within(unassigned).getByRole('heading', { name: tasksTitles.minutes }),
    ).toBeVisible();
    expect(
      within(unassigned).getByRole('button', { name: 'Next page' }),
    ).toBeDisabled();

    const views = screen.getByRole('navigation', { name: 'Tasks views' });
    fireEvent.click(within(views).getByRole('link', { name: 'Blocked Tasks' }));
    const blocked = await region('Blocked Tasks');
    expect(
      await within(blocked).findByRole('heading', {
        name: tasksTitles.records,
      }),
    ).toBeVisible();
    expect(
      within(blocked).getByText('Waiting for the signed attendance sheets'),
    ).toBeVisible();
    expect(within(blocked).getByText(tasksColleague.displayName)).toBeVisible();
    expect(within(blocked).getByText(/Blocked by Ion Rusu/u)).toBeVisible();

    fireEvent.click(within(views).getByRole('link', { name: 'Team Tasks' }));
    const team = await region('Team Tasks');
    await within(team).findByRole('heading', { name: tasksTitles.agenda });
    selectOption(within(team).getByLabelText('Responsibility'), 'unassigned');
    fireEvent.click(
      within(team).getByRole('button', { name: 'Apply criteria' }),
    );
    await waitFor(() =>
      expect(
        within(team).queryByRole('heading', { name: tasksTitles.agenda }),
      ).toBeNull(),
    );
    expect(
      within(team).getByRole('heading', { name: tasksTitles.participants }),
    ).toBeVisible();
    expect(within(team).getByLabelText('Applied criteria')).toHaveTextContent(
      'Open · Unassigned',
    );
  });

  it('edits a Task, reads its history and creates a Task in its Project from the side panel', async () => {
    const api = serve();
    openTasks('my-tasks');
    const view = await region('My Tasks');
    const panel = await openPanel(view, tasksTitles.calibration);
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Edit the Task' }),
    );
    const title = await within(panel).findByRole('textbox', {
      name: 'Task title',
    });
    await waitFor(() => expect(title).toBeEnabled());
    fireEvent.change(title, {
      target: { value: 'Check every calibration certificate' },
    });
    fireEvent.click(within(panel).getByRole('button', { name: 'Save Task' }));
    expect(
      await within(panel).findByText('Task change recorded.'),
    ).toBeVisible();
    const history = showPart(panel, 'History');
    expect(await within(history).findByText('Task edited')).toBeVisible();
    expect(
      within(history).getByText(`After: Check every calibration certificate`),
    ).toBeVisible();

    fireEvent.click(
      within(showPart(panel, 'Project')).getByRole('button', {
        name: 'New Task in this Project',
      }),
    );
    const create = await within(panel).findByRole('region', {
      name: 'Create a Task',
    });
    const newTitle = within(create).getByRole('textbox', {
      name: 'Task title',
    });
    await waitFor(() => expect(newTitle).toBeEnabled());
    fireEvent.change(newTitle, {
      target: { value: 'Book the closing meeting room' },
    });
    fireEvent.click(
      within(create).getByRole('button', { name: 'Create Task' }),
    );
    expect(
      await screen.findByRole('dialog', {
        name: 'Book the closing meeting room',
      }),
    ).toBeVisible();
    expect(api.commands.map(({ method, path }) => `${method} ${path}`)).toEqual(
      [
        `PATCH /tasks/${tasksId('calibration')}`,
        `POST /projects/${tasksProjects.dairy.id}/tasks`,
      ],
    );
    expect(api.commands[1]?.body).toMatchObject({
      title: 'Book the closing meeting room',
      assigneeMembershipId: null,
      dueDate: null,
      priority: 'normal',
    });
  });

  it('declares and corrects a Task result and downloads its exact PDF', async () => {
    const api = serve();
    const created: Blob[] = [];
    URL.createObjectURL = vi.fn((blob: Blob) => {
      created.push(blob);
      return 'blob:fictional-result';
    });
    URL.revokeObjectURL = vi.fn();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    openTasks('my-tasks');
    const view = await region('My Tasks');
    const panel = await openPanel(view, tasksTitles.checklist);
    const result = showPart(panel, 'Result');
    expect(
      await within(result).findByText('No declared result.'),
    ).toBeVisible();
    fireEvent.change(within(result).getByLabelText('Result declaration'), {
      target: { value: 'Checklist prepared and shared' },
    });
    selectOption(
      within(result).getByLabelText('Frozen mission Version'),
      tasksResultReference.versionId,
    );
    fireEvent.click(
      within(result).getByRole('button', { name: 'Record result' }),
    );
    expect(await within(result).findByText('Result confirmed.')).toBeVisible();
    expect(
      await within(result).findByText('Checklist prepared and shared', {
        selector: 'p',
      }),
    ).toBeVisible();

    fireEvent.click(
      within(result).getByRole('button', { name: 'Correct result' }),
    );
    fireEvent.change(within(result).getByLabelText('Result declaration'), {
      target: { value: 'Checklist prepared, shared and signed' },
    });
    fireEvent.change(within(result).getByLabelText('Correction reason'), {
      target: { value: 'The signature was missing' },
    });
    fireEvent.click(
      within(result).getByRole('button', { name: 'Save correction' }),
    );
    expect(await within(result).findByText('Result revision 2')).toBeVisible();
    expect(
      within(result).getByText('Checklist prepared, shared and signed', {
        selector: 'p',
      }),
    ).toBeVisible();
    expect(
      within(result).getByText(/The signature was missing/u),
    ).toBeVisible();

    fireEvent.click(
      within(result).getByRole('button', {
        name: 'Download exact PDF · Version 2',
      }),
    );
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(created).toHaveLength(1);
    expect(await created[0]?.text()).toBe('%PDF-1.4 fictional stage 1 report');
    expect(api.commands.map(({ method, path }) => `${method} ${path}`)).toEqual(
      [
        `POST /tasks/${tasksId('checklist')}/results`,
        `POST /tasks/${tasksId('checklist')}/results/corrections`,
      ],
    );
  });

  it('plans five open Tasks of a Project together', async () => {
    const api = serve();
    openTasks('my-tasks');
    const view = await region('My Tasks');
    const panel = await openPanel(view, tasksTitles.questionnaire);
    fireEvent.click(
      within(showPart(panel, 'Project')).getByRole('button', {
        name: 'Plan selected Tasks',
      }),
    );
    const planning = await within(panel).findByRole('region', {
      name: 'Grouped Task planning',
    });
    const chosen = [
      tasksTitles.questionnaire,
      tasksTitles.checklist,
      tasksTitles.participants,
      tasksTitles.minutes,
      tasksTitles.calibration,
    ];
    for (const title of chosen)
      fireEvent.click(
        await within(planning).findByRole('checkbox', { name: title }),
      );
    expect(within(planning).getByText(/5 \/ 50/u)).toBeVisible();
    const due = tasksDay(20);
    for (const title of chosen)
      fireEvent.change(within(planning).getByLabelText(`Due date — ${title}`), {
        target: { value: due },
      });
    fireEvent.click(
      within(planning).getByRole('button', { name: 'Save selected planning' }),
    );
    expect(
      await within(planning).findByText('Selected planning saved.'),
    ).toBeVisible();
    const command = api.commands.find(({ path }) =>
      path.endsWith('/tasks/planning'),
    );
    expect(command?.path).toBe(
      `/projects/${tasksProjects.dairy.id}/tasks/planning`,
    );
    expect(command?.body).toMatchObject({
      tasks: chosen.map((title) => ({
        taskId: tasksId(
          Object.keys(tasksTitles).find((key) => tasksTitles[key] === title) ??
            '',
        ),
        dueDate: due,
      })),
    });
    expect(api.task('participants')?.dueDate).toBe(due);
  });

  it('creates, filters and opens internal Tasks with their history', async () => {
    const api = serve();
    openTasks('internal-tasks');
    const view = await region('Internal Tasks');
    expect(
      await within(view).findByRole('heading', {
        name: 'Renew the training room booking',
      }),
    ).toBeVisible();
    fireEvent.click(
      within(view).getByRole('button', { name: 'Create internal Task' }),
    );
    const create = await screen.findByRole('dialog', {
      name: 'Create internal Task',
    });
    const form = within(create).getByRole('form', {
      name: 'Create internal Task',
    });
    fireEvent.change(
      within(form).getByRole('textbox', { name: 'Task title' }),
      {
        target: { value: 'Order the new archive boxes' },
      },
    );
    fireEvent.click(
      within(form).getByRole('button', { name: 'Create internal Task' }),
    );
    expect(
      await within(create).findByText('Internal Task saved.'),
    ).toBeVisible();
    fireEvent.click(within(create).getByRole('button', { name: 'Close' }));
    expect(
      await within(view).findByRole('heading', {
        name: 'Order the new archive boxes',
      }),
    ).toBeVisible();
    expect(api.commands).toEqual([
      expect.objectContaining({
        method: 'POST',
        path: '/company-internal-tasks',
      }),
    ]);

    selectOption(within(view).getByLabelText('Status'), 'in_progress');
    await waitFor(() =>
      expect(
        within(view).queryByRole('heading', {
          name: 'Renew the training room booking',
        }),
      ).toBeNull(),
    );
    fireEvent.click(
      within(view).getByRole('button', { name: 'Update the 2027 price list' }),
    );
    const detail = await screen.findByRole('dialog', {
      name: 'Update the 2027 price list',
    });
    expect(
      await within(detail).findByRole('heading', {
        name: 'Internal Task history',
      }),
    ).toBeVisible();
    expect(
      within(detail).getByRole('form', { name: 'Save internal Task' }),
    ).toBeVisible();
    expect(
      within(detail).getByRole('form', { name: 'Record state' }),
    ).toBeVisible();
  });

  it('keeps an uncertain Task command in the open panel until its exact retry confirms it', async () => {
    let lose = true;
    const api = createClarteTasksApi();
    const sent: unknown[] = [];
    serve(api, ({ method, path }) => {
      if (method === 'POST' && path.endsWith('/complete') && lose) {
        lose = false;
        return 'lost';
      }
      return undefined;
    });
    const fetcher = vi.mocked(fetch);
    openTasks('my-tasks');
    const view = await region('My Tasks');
    const panel = await openPanel(view, tasksTitles.procedure);
    fireEvent.click(within(panel).getByRole('button', { name: 'Mark done' }));
    const retry = await within(panel).findByRole('button', {
      name: 'Retry pending Task change',
    });
    expect(within(panel).getByRole('button', { name: 'Close' })).toBeDisabled();
    fireEvent.keyDown(panel, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: tasksTitles.procedure })).toBe(
      panel,
    );
    // Leaving for the Project would close the panel and drop the retry.
    expect(
      within(showPart(panel, 'Project')).getByRole('button', {
        name: 'Open in its Project',
      }),
    ).toBeDisabled();
    fireEvent.click(retry);
    expect(
      await within(panel).findByText('Task change recorded.'),
    ).toBeVisible();
    for (const [input, init] of fetcher.mock.calls)
      if (init?.method === 'POST' && String(input).endsWith('/complete'))
        sent.push({
          body: init.body,
          key: new Headers(init.headers).get('idempotency-key'),
        });
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual(sent[0]);
    expect(api.task('procedure')?.status).toBe('done');
    expect(within(panel).getByRole('button', { name: 'Close' })).toBeEnabled();
  });

  it('keeps an uncertain result command in the open panel and its Task in place', async () => {
    let lose = true;
    const api = createClarteTasksApi();
    serve(api, ({ method, path }) => {
      if (method === 'POST' && path.endsWith('/results') && lose) {
        lose = false;
        return 'lost';
      }
      return undefined;
    });
    openTasks('my-tasks');
    const view = await region('My Tasks');
    const panel = await openPanel(view, tasksTitles.checklist);
    const result = showPart(panel, 'Result');
    await within(result).findByText('No declared result.');
    fireEvent.change(within(result).getByLabelText('Result declaration'), {
      target: { value: 'Checklist prepared' },
    });
    selectOption(
      within(result).getByLabelText('Frozen mission Version'),
      tasksResultReference.versionId,
    );
    fireEvent.click(
      within(result).getByRole('button', { name: 'Record result' }),
    );
    const retry = await within(result).findByRole('button', {
      name: 'Retry exact result command',
    });
    expect(within(panel).getByRole('button', { name: 'Close' })).toBeDisabled();
    const project = showPart(panel, 'Project');
    expect(
      within(project).getByRole('button', { name: 'Open in its Project' }),
    ).toBeDisabled();
    expect(
      within(project).getByRole('button', {
        name: 'New Task in this Project',
      }),
    ).toBeDisabled();
    fireEvent.click(within(panel).getByRole('tab', { name: 'Result' }));
    fireEvent.click(retry);
    expect(await within(result).findByText('Result confirmed.')).toBeVisible();
    await waitFor(() =>
      expect(
        within(panel).getByRole('button', { name: 'Close' }),
      ).toBeEnabled(),
    );
    const keys = vi
      .mocked(fetch)
      .mock.calls.filter(
        ([input, init]) =>
          init?.method === 'POST' && String(input).endsWith('/results'),
      )
      .map(([, init]) => new Headers(init?.headers).get('idempotency-key'));
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
    expect(api.commands).toHaveLength(1);
  });

  it('returns from the create form to the Task it was opened from', async () => {
    serve();
    openTasks('my-tasks');
    const view = await region('My Tasks');
    const panel = await openPanel(view, tasksTitles.calibration);
    fireEvent.click(
      within(showPart(panel, 'Project')).getByRole('button', {
        name: 'New Task in this Project',
      }),
    );
    const create = await within(panel).findByRole('region', {
      name: 'Create a Task',
    });
    fireEvent.click(
      within(create).getByRole('button', { name: 'Back to the Task' }),
    );
    expect(
      await screen.findByRole('dialog', { name: tasksTitles.calibration }),
    ).toBe(panel);
    expect(
      await within(panel).findByRole('tab', { name: 'Task' }),
    ).toBeVisible();
    fireEvent.click(within(panel).getByRole('tab', { name: 'History' }));
    expect(
      await within(
        within(panel).getByRole('tabpanel', { name: 'History' }),
      ).findByText('Task created'),
    ).toBeVisible();
  });

  it('keeps an uncertain internal Task creation in its open panel until its exact retry confirms it', async () => {
    let lose = true;
    serve(createClarteTasksApi(), ({ method, path }) => {
      if (method === 'POST' && path === '/api/company-internal-tasks' && lose) {
        lose = false;
        return 'lost';
      }
      return undefined;
    });
    const fetcher = vi.mocked(fetch);
    openTasks('internal-tasks');
    const view = await region('Internal Tasks');
    await within(view).findByRole('heading', {
      name: 'Renew the training room booking',
    });
    fireEvent.click(
      within(view).getByRole('button', { name: 'Create internal Task' }),
    );
    const create = await screen.findByRole('dialog', {
      name: 'Create internal Task',
    });
    const form = within(create).getByRole('form', {
      name: 'Create internal Task',
    });
    fireEvent.change(
      within(form).getByRole('textbox', { name: 'Task title' }),
      { target: { value: 'Order the new archive boxes' } },
    );
    fireEvent.click(
      within(form).getByRole('button', { name: 'Create internal Task' }),
    );
    const retry = await within(create).findByRole('button', {
      name: 'Retry the same command',
    });
    expect(
      within(create).getByRole('button', { name: 'Close' }),
    ).toBeDisabled();
    fireEvent.keyDown(create, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Create internal Task' })).toBe(
      create,
    );
    fireEvent.click(retry);
    expect(
      await within(create).findByText('Internal Task saved.'),
    ).toBeVisible();
    const keys = fetcher.mock.calls
      .filter(
        ([input, init]) =>
          init?.method === 'POST' &&
          String(input).endsWith('/api/company-internal-tasks'),
      )
      .map(([, init]) => new Headers(init?.headers).get('idempotency-key'));
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
    await waitFor(() =>
      expect(
        within(create).getByRole('button', { name: 'Close' }),
      ).toBeEnabled(),
    );
  });

  it('states loading, empty and failed reads of the views', async () => {
    let failBlocked = true;
    serve(createClarteTasksApi(), ({ method, path }) => {
      if (method === 'GET' && path === '/api/unassigned-tasks')
        return {
          status: 200,
          json: {
            companyId: '00000000-0000-4000-8000-000000001542',
            offset: 0,
            pageSize: 25,
            hasNextPage: false,
            tasks: [],
          },
        };
      if (method === 'GET' && path === '/api/blocked-tasks' && failBlocked)
        return { status: 503, json: {} };
      return undefined;
    });
    openTasks('unassigned-tasks');
    const unassigned = await region('Unassigned Tasks');
    expect(
      await within(unassigned).findByText(
        'No readable open unassigned Tasks in this Company.',
      ),
    ).toBeVisible();

    const views = screen.getByRole('navigation', { name: 'Tasks views' });
    fireEvent.click(within(views).getByRole('link', { name: 'Blocked Tasks' }));
    const blocked = await region('Blocked Tasks');
    const failure = await within(blocked).findByRole('alert');
    failBlocked = false;
    fireEvent.click(within(failure).getByRole('button'));
    expect(
      await within(blocked).findByRole('heading', {
        name: tasksTitles.records,
      }),
    ).toBeVisible();
  });
});

describe('Clarté Tasks in every interface language', () => {
  it.each([
    ['Română', 'Sarcini', 'Termen depășit', 'Sarcina', 'Istoric'],
    ['Русский', 'Задачи', 'Срок прошёл', 'Задача', 'История'],
    ['Français', 'Tâches', 'Échéance dépassée', 'Tâche', 'Historique'],
    ['English', 'Tasks', 'Past due', 'Task', 'History'],
  ])(
    'shows My Tasks and a Task panel in %s',
    async (language, title, pastDue, taskPart, historyPart) => {
      serve();
      openTasks('my-tasks');
      const view = await region('My Tasks');
      await within(view).findByRole('heading', {
        name: tasksTitles.questionnaire,
      });
      fireEvent.click(screen.getByRole('button', { name: 'User menu' }));
      fireEvent.click(screen.getByRole('radio', { name: language }));
      expect(
        await screen.findByRole('heading', { level: 1, name: title }),
      ).toBeVisible();
      expect(
        screen.getByRole('heading', {
          level: 2,
          name: new RegExp(pastDue, 'u'),
        }),
      ).toBeVisible();
      fireEvent.click(
        screen.getByRole('button', { name: tasksTitles.questionnaire }),
      );
      const panel = await screen.findByRole('dialog', {
        name: tasksTitles.questionnaire,
      });
      expect(
        await within(panel).findByRole('tab', { name: taskPart }),
      ).toHaveAttribute('aria-selected', 'true');
      expect(
        within(panel).getByRole('tab', { name: historyPart }),
      ).toBeVisible();
    },
  );
});
