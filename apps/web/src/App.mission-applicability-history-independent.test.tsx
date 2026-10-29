import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  waitFor,
  within,
} from './test/render-with-interface-locale';
import { changeValue } from './test/select-option';
import { openDistantHistory } from './test/mission-applicability-history-app';
import {
  actor,
  companyId,
  projectId,
  clientId,
  project,
  plan,
} from './test/mission-applicability-app-fixture';
import type { TaskView } from './project/task-response';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/#projects');
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

it.each(['draft', 'pending', 'uncertain', 'confirmed'] as const)(
  'preserves actual native Task %s and independent Project draft through reference transport failure and all locales',
  async (phase) => {
    const tasks: TaskView[] = plan.activities.map((row) => ({
      id: row.taskId,
      companyId,
      projectId,
      clientAccountId: clientId,
      title: row.title,
      description: null,
      assignee: null,
      dueDate: null,
      priority: 'normal',
      version: 1,
      createdAt: project.createdAt,
      updatedAt: project.createdAt,
      createdBy: {
        internalUserId: actor.internalUserId,
        workspaceMembershipId: actor.workspaceMembershipId,
        displayName: actor.displayName,
      },
      status: 'todo',
      completion: null,
    }));
    const base = tasks[0];
    if (!base) throw new Error('Expected preserved Task fixture');
    const createdTask: TaskView = {
      ...base,
      id: '40000000-0000-4000-8000-000000000099',
      title: 'Independent native Task DEMO',
    };
    let created = false;
    let release: ((value: Response) => void) | undefined;
    const writes: Array<{ body: RequestInit['body']; key: string | null }> = [];
    const { panel, projects, inspect } = await openDistantHistory({
      override: async (path, init, url) => {
        if (path === `/api/projects/${projectId}/tasks`) {
          if (init?.method === 'POST') {
            writes.push({
              body: init.body,
              key: new Headers(init.headers).get('idempotency-key'),
            });
            if (phase === 'pending')
              return new Promise<Response>((resolve) => {
                release = resolve;
              });
            created = true;
            if (phase === 'uncertain' && writes.length === 1)
              throw new TypeError('Synthetic committed native reply loss');
            return Response.json(createdTask, { status: 201 });
          }
          return Response.json({
            mutable: true,
            tasks: created ? [...tasks, createdTask] : tasks,
          });
        }
        if (path === `/api/tasks/${createdTask.id}`)
          return Response.json({ mutable: true, task: createdTask });
        if (path === `/api/tasks/${createdTask.id}/history`)
          return Response.json({ events: [] });
        if (path.endsWith('/results/eligible-versions'))
          return Response.json({
            taskId: createdTask.id,
            mutable: true,
            versions: [],
          });
        if (path.endsWith('/results/history'))
          return Response.json({
            taskId: createdTask.id,
            declarations: [],
            hasMore: false,
            nextBeforeRevision: null,
          });
        if (path.endsWith('/results'))
          return Response.json({
            taskId: createdTask.id,
            projectId,
            taskTitle: createdTask.title,
            taskVersion: 1,
            revision: 0,
            mutable: true,
            current: null,
          });
        if (path.endsWith('/mission-applicability/history') && url.search)
          return new Response(null, { status: 503 });
        return undefined;
      },
    });
    const projectDraft = within(projects).getByRole('textbox', {
      name: 'Project title',
    });
    fireEvent.change(projectDraft, {
      target: { value: 'Independent Project literal DEMO' },
    });
    const taskRegion = await within(projects).findByRole('region', {
      name: 'Tasks',
    });
    const taskDraft = await within(taskRegion).findByRole('textbox', {
      name: 'Task title',
    });
    await waitFor(() => expect(taskDraft).toBeEnabled());
    fireEvent.change(taskDraft, { target: { value: createdTask.title } });
    if (phase !== 'draft')
      fireEvent.click(
        within(taskRegion).getByRole('button', { name: 'Create Task' }),
      );
    if (phase === 'pending')
      await waitFor(() => expect(release).toBeTypeOf('function'));
    if (phase === 'uncertain')
      await within(taskRegion).findByText(
        'The result is not confirmed. Retry the same change to safely recover its recorded result.',
      );
    if (phase === 'confirmed')
      await within(taskRegion).findByText('Task change recorded.');
    const before = writes.map((write) => ({ ...write }));
    inspect.focus();
    fireEvent.click(inspect);
    const inspection = await within(panel).findByRole('region', {
      name: 'Referenced applicability fact',
    });
    await within(inspection).findByText(
      'The referenced fact could not be loaded. Retry the same history page.',
    );
    for (const locale of ['ro', 'ru', 'fr', 'en']) {
      const control = document.getElementById('interface-locale');
      if (!control) throw new Error('Expected native locale control');
      changeValue(control, locale);
    }
    await act(async () => {
      await Promise.resolve();
    });
    expect(projectDraft).toHaveValue('Independent Project literal DEMO');
    expect(taskDraft).toHaveValue(createdTask.title);
    expect(writes).toEqual(before);
    if (phase === 'pending') {
      expect(taskDraft).toBeDisabled();
      const respond = release;
      if (!respond) throw new Error('Expected held native Task command');
      created = true;
      await act(async () => {
        respond(Response.json(createdTask, { status: 201 }));
      });
      await within(taskRegion).findByText('Task change recorded.');
    }
    if (phase === 'uncertain') {
      fireEvent.click(
        within(taskRegion).getByRole('button', {
          name: 'Retry pending Task change',
        }),
      );
      await within(taskRegion).findByText('Task change recorded.');
      expect(writes).toHaveLength(2);
      expect(writes[1]).toEqual(writes[0]);
    }
    expect(projectDraft).toHaveValue('Independent Project literal DEMO');
    expect(inspection).toBeVisible();
  },
);
