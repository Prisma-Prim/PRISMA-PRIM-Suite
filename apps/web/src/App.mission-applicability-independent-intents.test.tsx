import { StrictMode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';
import { changeValue } from './test/select-option';
import {
  actor,
  companyId,
  clientId,
  projectId,
  project,
  plan,
  snapshot,
  installParentServer,
} from './test/mission-applicability-app-fixture';
import { App } from './App';
import { InterfaceLocaleSelect } from './localization/InterfaceLocaleSelect';
import { deterministicBrowserIdentity } from './access-composition';
import type { TaskView } from './project/task-response';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/#projects');
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: true,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});
async function recordIndependentApplicability(panel: HTMLElement) {
  fireEvent.change(
    within(panel).getByRole('textbox', {
      name: 'Proposal reason (1–1000 characters)',
    }),
    { target: { value: 'Independent applicability proposal DEMO' } },
  );
  fireEvent.change(
    within(panel).getByRole('textbox', {
      name: 'Reported scope basis (1–2000 characters)',
    }),
    { target: { value: 'Explicit scope DEMO' } },
  );
  fireEvent.change(
    within(panel).getByRole('textbox', {
      name: 'Reported agreement basis (1–2000 characters)',
    }),
    { target: { value: 'No contractual change reported DEMO' } },
  );
  fireEvent.click(
    within(panel).getByRole('button', { name: 'Review exact proposal' }),
  );
  fireEvent.click(
    within(panel).getByRole('button', { name: 'Record proposal' }),
  );
  await within(panel).findByText('Applicability fact confirmed.');
  await within(panel).findByText('Current applicability could not be loaded.');
}
async function presentationRoundtrip(protectedReads: () => number) {
  await act(async () => {
    await Promise.resolve();
  });
  const before = protectedReads();
  for (const locale of ['ro', 'ru', 'fr', 'en']) {
    const control = document.getElementById('interface-locale');
    if (!control) throw new Error('Missing native locale control');
    changeValue(control, locale);
  }
  await act(async () => {
    await Promise.resolve();
  });
  expect(protectedReads()).toBe(before);
  await act(async () => {
    const url = new URL(window.location.href);
    url.searchParams.set('frame', 'classic');
    window.history.pushState(null, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Try Prisme' }));
  const navigation = screen.getByRole('navigation', {
    name: 'Primary navigation',
  });
  fireEvent.click(within(navigation).getByRole('link', { name: 'Overview' }));
  fireEvent.click(
    within(
      screen.getByRole('navigation', { name: 'Primary navigation' }),
    ).getByRole('link', { name: 'Projects' }),
  );
}
function nativeTasks(): TaskView[] {
  return plan.activities.map((row) => ({
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
}

it.each(['draft', 'pending', 'uncertain', 'confirmed'] as const)(
  'preserves actual native Task creation %s and Project draft while applicability records independently, fails its refresh and changes all locales/frames',
  async (phase) => {
    const tasks = nativeTasks(),
      base = tasks[0];
    if (!base) throw new Error('Missing native Task');
    const createdTask: TaskView = {
      ...base,
      id: '40000000-0000-4000-8000-000000000099',
      title: 'Independent ordinary Task DEMO',
    };
    const writes: Array<{ body: string | undefined; key: string | null }> = [];
    let created = false,
      applicabilityRecorded = false,
      finish: ((response: Response) => void) | undefined;
    const protectedRequests: string[] = [];
    installParentServer(
      () => actor,
      async (path, init) => {
        if (/current-actor|\/projects|\/tasks/u.test(path))
          protectedRequests.push(path);
        if (path === `/api/projects/${projectId}/tasks`) {
          if (init?.method === 'POST') {
            writes.push({
              body: typeof init.body === 'string' ? init.body : undefined,
              key: new Headers(init.headers).get('idempotency-key'),
            });
            if (phase === 'pending' && writes.length === 1)
              return new Promise((resolve) => {
                finish = resolve;
              });
            created = true;
            if (phase === 'uncertain' && writes.length === 1)
              throw new TypeError(
                'Synthetic native Task reply loss after commit',
              );
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
        if (path === `/api/projects/${projectId}/mission-applicability`) {
          if (init?.method === 'POST') {
            applicabilityRecorded = true;
            return Response.json(
              {
                action: 'recorded',
                projectId,
                factId: 'independent-fact-demo',
                applicabilityRevision: 1,
              },
              { status: 201 },
            );
          }
          return applicabilityRecorded
            ? new Response(null, { status: 503 })
            : Response.json(snapshot());
        }
        return undefined;
      },
    );
    render(
      <StrictMode>
        <InterfaceLocaleSelect />
        <App identity={deterministicBrowserIdentity()} />
      </StrictMode>,
    );
    const projects = await screen.findByRole('region', { name: 'Projects' });
    fireEvent.change(
      await within(projects).findByRole('textbox', { name: 'Project title' }),
      { target: { value: 'Independent Project draft DEMO' } },
    );
    fireEvent.click(
      await within(projects).findByRole('button', {
        name: new RegExp(project.title),
      }),
    );
    const taskRegion = await within(projects).findByRole('region', {
        name: 'Tasks',
      }),
      title = await within(taskRegion).findByRole('textbox', {
        name: 'Task title',
      });
    await waitFor(() => expect(title).toBeEnabled());
    fireEvent.change(title, { target: { value: createdTask.title } });
    if (phase !== 'draft')
      fireEvent.click(
        within(taskRegion).getByRole('button', { name: 'Create Task' }),
      );
    if (phase === 'pending')
      await waitFor(() => expect(finish).toBeTypeOf('function'));
    if (phase === 'uncertain')
      await within(taskRegion).findByText(
        'The result is not confirmed. Retry the same change to safely recover its recorded result.',
      );
    if (phase === 'confirmed')
      await within(taskRegion).findByText('Task change recorded.');
    const panel = await screen.findByRole('region', {
      name: 'Mission activity applicability',
    });
    await within(panel).findByRole('combobox', { name: 'Source activity' });
    await recordIndependentApplicability(panel);
    const before = writes.map((write) => ({ ...write }));
    await presentationRoundtrip(() => protectedRequests.length);
    expect(
      within(projects).getByRole('textbox', { name: 'Project title' }),
    ).toHaveValue('Independent Project draft DEMO');
    expect(
      within(taskRegion).getByRole('textbox', { name: 'Task title' }),
    ).toHaveValue(createdTask.title);
    expect(writes).toEqual(before);
    if (phase === 'pending') {
      expect(
        within(taskRegion).getByRole('textbox', { name: 'Task title' }),
      ).toBeDisabled();
      created = true;
      await act(async () => {
        finish?.(Response.json(createdTask, { status: 201 }));
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
  },
  20_000,
);

it.each(['draft', 'pending', 'uncertain', 'confirmed'] as const)(
  'preserves actual native Project registration %s with exact retry through source navigation, all locales/frames and independent applicability failure',
  async (phase) => {
    const createdProject = {
      ...project,
      id: '30000000-0000-4000-8000-000000000099',
      title: 'Independent created Project DEMO',
    };
    const writes: Array<{ body: string | undefined; key: string | null }> = [];
    let created = false,
      applicabilityRecorded = false,
      finish: ((response: Response) => void) | undefined;
    const protectedRequests: string[] = [];
    installParentServer(
      () => actor,
      async (path, init) => {
        if (/current-actor|\/projects|\/tasks/u.test(path))
          protectedRequests.push(path);
        if (path === '/api/projects') {
          if (init?.method === 'POST') {
            writes.push({
              body: typeof init.body === 'string' ? init.body : undefined,
              key: new Headers(init.headers).get('idempotency-key'),
            });
            if (phase === 'pending' && writes.length === 1)
              return new Promise((resolve) => {
                finish = resolve;
              });
            created = true;
            if (phase === 'uncertain' && writes.length === 1)
              throw new TypeError(
                'Synthetic native Project reply loss after commit',
              );
            return Response.json(createdProject, { status: 201 });
          }
          return Response.json(created ? [project, createdProject] : [project]);
        }
        if (path === `/api/projects/${createdProject.id}`)
          return Response.json(createdProject);
        if (path === `/api/projects/${createdProject.id}/template`)
          return Response.json({ template: null });
        if (path === `/api/projects/${projectId}/mission-applicability`) {
          if (init?.method === 'POST') {
            applicabilityRecorded = true;
            return Response.json(
              {
                action: 'recorded',
                projectId,
                factId: 'independent-project-fact-demo',
                applicabilityRevision: 1,
              },
              { status: 201 },
            );
          }
          return applicabilityRecorded
            ? new Response(null, { status: 503 })
            : Response.json(snapshot());
        }
        return undefined;
      },
    );
    render(
      <StrictMode>
        <InterfaceLocaleSelect />
        <App identity={deterministicBrowserIdentity()} />
      </StrictMode>,
    );
    const projects = await screen.findByRole('region', { name: 'Projects' });
    const title = await within(projects).findByRole('textbox', {
      name: 'Project title',
    });
    fireEvent.change(title, { target: { value: createdProject.title } });
    changeValue(
      within(projects).getByRole('combobox', { name: 'Client' }),
      clientId,
    );
    if (phase !== 'draft')
      fireEvent.click(
        within(projects).getByRole('button', { name: 'Create Project' }),
      );
    if (phase === 'pending')
      await waitFor(() => expect(finish).toBeTypeOf('function'));
    if (phase === 'uncertain')
      await within(projects).findByText(
        'The Project could not be loaded or saved. Please try again.',
      );
    if (phase === 'confirmed')
      await within(projects).findByRole('article', {
        name: createdProject.title,
      });
    const before = writes.map((write) => ({ ...write }));
    await presentationRoundtrip(() => protectedRequests.length);
    expect(writes).toEqual(before);
    if (phase === 'pending') {
      expect(
        within(projects).getByRole('textbox', { name: 'Project title' }),
      ).toHaveValue(createdProject.title);
      expect(
        within(projects).getByRole('button', { name: 'Create Project' }),
      ).toBeDisabled();
      created = true;
      await act(async () => {
        finish?.(Response.json(createdProject, { status: 201 }));
      });
      await within(projects).findByRole('article', {
        name: createdProject.title,
      });
    } else {
      fireEvent.click(
        await within(projects).findByRole('button', {
          name: new RegExp(project.title),
        }),
      );
      const panel = await screen.findByRole('region', {
        name: 'Mission activity applicability',
      });
      await within(panel).findByRole('combobox', { name: 'Source activity' });
      await recordIndependentApplicability(panel);
      fireEvent.change(
        within(projects).getByRole('searchbox', { name: 'Find Projects' }),
        { target: { value: 'Independent' } },
      );
      fireEvent.change(
        within(projects).getByRole('searchbox', { name: 'Find Projects' }),
        { target: { value: '' } },
      );
      if (phase === 'uncertain') {
        expect(
          within(projects).getByRole('textbox', { name: 'Project title' }),
        ).toHaveValue(createdProject.title);
        fireEvent.click(
          within(projects).getByRole('button', { name: 'Create Project' }),
        );
        await within(projects).findByRole('article', {
          name: createdProject.title,
        });
        expect(writes).toHaveLength(2);
        expect(writes[1]).toEqual(writes[0]);
      }
      if (phase === 'draft')
        expect(
          within(projects).getByRole('textbox', { name: 'Project title' }),
        ).toHaveValue(createdProject.title);
      if (phase === 'confirmed') {
        fireEvent.click(
          await within(projects).findByRole('button', {
            name: new RegExp(createdProject.title),
          }),
        );
        await within(projects).findByRole('article', {
          name: createdProject.title,
        });
        expect(writes).toHaveLength(1);
      }
    }
  },
  20_000,
);
