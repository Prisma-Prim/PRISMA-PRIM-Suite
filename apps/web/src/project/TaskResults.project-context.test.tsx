import { afterEach, expect, it, vi } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '../test/render-with-interface-locale';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { selectOption } from '../test/select-option';
import { ProjectTasks } from './ProjectTasks';
import type { ProjectStatus } from './project-lifecycle-response';
import type { TaskView } from './task-response';

const actor: ActorContext = {
  internalUserId: 'owner',
  workspaceMembershipId: 'member',
  workspaceId: 'workspace',
  workspaceName: 'DEMO',
  displayName: 'Owner DEMO',
  email: 'owner@example.test',
  active: true,
  workspacePermissions: ['client.manage'],
  activeCompany: {
    id: 'company',
    displayName: 'Company DEMO',
    projectPermissions: ['project.read'],
    projectPermissionAssignmentId: 'projects',
    projectPermissionSetVersion: 'v2',
    taskPermissions: ['task.read', 'task.manage'],
    taskPermissionAssignmentId: 'tasks',
    taskPermissionSetVersion: 'v1',
    taskResultPermissions: ['task.result.record'],
    taskResultRecorderAssignmentId: 'recorder',
    taskResultRecorderPermissionSetVersion: 'v1',
    documentPermissions: [
      'document.read',
      'document.content.read',
      'document.mission_deliverable.access',
    ],
    documentPermissionSetVersion: 'v3',
    documentPermissionAssignmentId: 'documents',
    documentContentReaderAssignmentId: 'reader',
    documentContentReaderPermissionSetVersion: 'v1',
    missionDeliverableAccessAssignmentId: 'mission',
    missionDeliverableAccessPermissionSetVersion: 'v1',
  },
};
const attribution = {
  internalUserId: 'owner',
  workspaceMembershipId: 'member',
  displayName: 'Owner DEMO',
};
const reference = {
  documentId: 'document',
  versionId: 'version',
  versionNumber: 1,
  title: 'Output DEMO',
  status: 'official',
  representationId: 'pdf',
};
const declaration = {
  id: 'result',
  revision: 1,
  kind: 'recorded',
  declaration: 'Preserved output DEMO',
  actor: attribution,
  occurredAt: '2026-10-24T00:00:00.000Z',
  reference,
};
const identity = deterministicBrowserIdentity();
const readOnly =
  'Result history is read-only. New declarations require an open Task and Project and an active original Client relationship.';

function deferredResponse() {
  let finish: (response: Response) => void = () => {
    throw new Error('Response gate is not initialized.');
  };
  const promise = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  return { promise, resolve: (response: Response) => finish(response) };
}
function task(projectId: string, id: string): TaskView {
  return {
    id,
    projectId,
    companyId: 'company',
    clientAccountId: 'client',
    title: id === 'task-a' ? 'Task A DEMO' : 'Task B DEMO',
    assignee: null,
    dueDate: null,
    priority: 'normal',
    version: 1,
    status: 'todo',
    completion: null,
    createdAt: '2026-10-24T00:00:00.000Z',
    updatedAt: '2026-10-24T00:00:00.000Z',
    createdBy: attribution,
  };
}
function transport(input: { exists?: boolean; pending?: boolean } = {}) {
  const download = deferredResponse();
  const command = deferredResponse();
  const state: {
    closed: boolean;
    exists: boolean;
    commands: RequestInit[];
    downloadSignal: RequestInit['signal'];
  } = {
    closed: false,
    exists: input.exists ?? false,
    commands: new Array<RequestInit>(),
    downloadSignal: undefined,
  };
  const fetcher = vi.fn(async (url: string, request?: RequestInit) => {
    if (url.includes('/content/')) {
      state.downloadSignal = request?.signal;
      return download.promise;
    }
    if (url.includes('/results')) {
      const taskId = url.includes('task-b') ? 'task-b' : 'task-a';
      const projectId = taskId === 'task-a' ? 'project-a' : 'project-b';
      if (request?.method === 'POST') {
        state.commands.push(request);
        state.exists = true;
        if (state.commands.length > 1)
          return Response.json(
            {
              action: 'recorded',
              taskId,
              resultId: 'result',
              resultRevision: 1,
            },
            { status: 201 },
          );
        return input.pending
          ? command.promise
          : new Response(null, { status: 503 });
      }
      if (url.endsWith('/eligible-versions'))
        return Response.json({
          taskId,
          mutable: !state.closed,
          versions: [reference],
        });
      return Response.json({
        taskId,
        projectId,
        taskTitle: 'Result target DEMO',
        taskVersion: state.closed ? 2 : 1,
        revision: state.exists && taskId === 'task-a' ? 1 : 0,
        mutable: !state.closed,
        current: state.exists && taskId === 'task-a' ? declaration : null,
      });
    }
    if (url.endsWith('/eligible-task-assignees'))
      return Response.json({ members: [] });
    if (url.endsWith('/history')) return Response.json({ events: [] });
    if (url === '/api/projects/project-a/tasks')
      return Response.json({
        mutable: true,
        tasks: [task('project-a', 'task-a')],
      });
    if (url === '/api/projects/project-b/tasks')
      return Response.json({
        mutable: true,
        tasks: [task('project-b', 'task-b')],
      });
    if (url === '/api/tasks/task-a')
      return Response.json({
        mutable: true,
        task: task('project-a', 'task-a'),
      });
    if (url === '/api/tasks/task-b')
      return Response.json({
        mutable: true,
        task: task('project-b', 'task-b'),
      });
    throw new Error(`Unexpected public request: ${url}`);
  });
  vi.stubGlobal('fetch', fetcher);
  return { state, command, download, fetcher };
}
function show(
  projectId = 'project-a',
  projectStatus: ProjectStatus = 'active',
) {
  return (
    <ProjectTasks
      actor={actor}
      identity={identity}
      projectId={projectId}
      projectStatus={projectStatus}
    />
  );
}
async function openTask(name = 'Task A DEMO') {
  fireEvent.click(await screen.findByRole('button', { name }));
  await screen.findByRole('heading', { name });
  await within(
    await screen.findByRole('region', { name: 'Declared Task result' }),
  ).findByText('Result target DEMO');
}
async function record() {
  await screen.findByText('No declared result.');
  fireEvent.change(screen.getByLabelText('Result declaration'), {
    target: { value: 'Result draft DEMO' },
  });
  selectOption(screen.getByLabelText('Frozen mission Version'), 'version');
  fireEvent.click(screen.getByRole('button', { name: 'Record result' }));
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('retires a hidden Project result draft and late PDF while preserving the ordinary Task cache', async () => {
  const fixture = transport({ exists: true });
  const create = vi.fn().mockReturnValue('blob:demo');
  vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const view = render(show());
  await openTask();
  fireEvent.change(screen.getByLabelText('Task title'), {
    target: { value: 'Ordinary Task draft DEMO' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Correct result' }));
  fireEvent.change(screen.getByLabelText('Result declaration'), {
    target: { value: 'Retired result draft DEMO' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Download exact PDF · Version 1' }),
  );
  await screen.findByText('Downloading exact PDF…');
  view.rerender(show('project-b'));
  await openTask('Task B DEMO');
  expect(fixture.state.downloadSignal?.aborted).toBe(true);
  expect(
    screen.queryByDisplayValue('Retired result draft DEMO'),
  ).not.toBeInTheDocument();
  fixture.download.resolve(
    new Response('%PDF-DEMO', {
      headers: { 'content-type': 'application/pdf' },
    }),
  );
  await waitFor(() =>
    expect(
      screen.queryByText('Downloading exact PDF…'),
    ).not.toBeInTheDocument(),
  );
  view.rerender(show());
  await screen.findByText('Preserved output DEMO');
  expect(
    within(screen.getByRole('region', { name: 'Tasks' })).getByLabelText(
      'Task title',
    ),
  ).toHaveValue('Ordinary Task draft DEMO');
  expect(create).not.toHaveBeenCalled();
  expect(
    screen.queryByDisplayValue('Retired result draft DEMO'),
  ).not.toBeInTheDocument();
});

it.each([false, true])(
  'retires a result command across Projects when pending=%s, including late success and exact-retry state',
  async (pending) => {
    const fixture = transport({ pending });
    const view = render(show());
    await openTask();
    await record();
    if (pending) await screen.findByText('Recording result…');
    else
      await screen.findByRole('button', { name: 'Retry exact result command' });
    view.rerender(show('project-b'));
    await openTask('Task B DEMO');
    fixture.command.resolve(
      Response.json(
        {
          action: 'recorded',
          taskId: 'task-a',
          resultId: 'result',
          resultRevision: 1,
        },
        { status: 201 },
      ),
    );
    await waitFor(() =>
      expect(screen.queryByText('Recording result…')).not.toBeInTheDocument(),
    );
    expect(screen.queryByText('Result confirmed.')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: 'Retry exact result command',
        hidden: true,
      }),
    ).not.toBeInTheDocument();
    view.rerender(show());
    await screen.findByText('Preserved output DEMO');
    expect(
      screen.queryByDisplayValue('Result draft DEMO'),
    ).not.toBeInTheDocument();
    expect(fixture.state.commands).toHaveLength(1);
  },
);

it.each([false, true])(
  'refreshes result read-only availability on observed Project closure with a cached Task when a result exists=%s',
  async (exists) => {
    const fixture = transport({ exists });
    const view = render(show());
    await openTask();
    await screen.findByRole('button', {
      name: exists ? 'Correct result' : 'Record result',
    });
    fixture.state.closed = true;
    view.rerender(show('project-a', 'completed'));
    await screen.findByText(readOnly);
    expect(
      screen.queryByRole('button', { name: 'Record result' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Correct result' }),
    ).not.toBeInTheDocument();
    expect(fixture.state.commands).toHaveLength(0);
  },
);

it('refreshes a closed Project result without discarding the exact uncertain historical receipt', async () => {
  const fixture = transport();
  const view = render(show());
  await openTask();
  await record();
  await screen.findByRole('button', { name: 'Retry exact result command' });
  fixture.state.closed = true;
  view.rerender(show('project-a', 'completed'));
  await screen.findByText(readOnly);
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry exact result command' }),
  );
  await screen.findByText('Result confirmed.');
  expect(fixture.state.commands).toHaveLength(2);
  const [first, retry] = fixture.state.commands;
  expect(retry?.body).toBe(first?.body);
  expect(new Headers(retry?.headers).get('idempotency-key')).toBe(
    new Headers(first?.headers).get('idempotency-key'),
  );
  expect(screen.getByText('Preserved output DEMO')).toBeVisible();
});
