import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import { deferred } from '../production-shell/production-shell-context.test-fixtures';
import { MyTasks } from './MyTasks';
import { taskCopy } from './task.copy';

const copy = taskCopy.myTasks;
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
    displayName: 'PRISMA-PRIM',
    projectPermissions: ['project.read'],
    taskPermissions: ['task.read'],
    taskPermissionAssignmentId: 'task-grant',
    taskPermissionSetVersion: 'v1',
  },
};
const atelier = {
  id: 'project-atelier',
  title: 'Pregătire demo',
  clientDisplayName: 'Atelier Demo SRL',
};
const beta = {
  ...atelier,
  id: 'project-beta',
  clientDisplayName: 'Beta Demo SRL',
};
function assigned(id: string, project: typeof atelier, dueDate: string) {
  return {
    id,
    companyId: 'company',
    projectId: project.id,
    clientAccountId: `${project.id}-client`,
    title: 'Chestionar inițial',
    assignee: { workspaceMembershipId: 'member', displayLabel: 'Owner · 1' },
    dueDate,
    priority: 'normal',
    status: 'todo',
    completion: null,
    version: 1,
    createdAt: '2026-09-19T00:00:00.000Z',
    updatedAt: '2026-09-19T00:00:00.000Z',
    createdBy: {
      internalUserId: 'owner',
      workspaceMembershipId: 'member',
      displayName: 'Owner',
    },
    project,
  };
}
const openName = (project: typeof atelier) =>
  copy.openTask({
    task: 'Chestionar inițial',
    project: project.title,
    client: project.clientDisplayName,
  });

function serve(reply: () => Response | Promise<Response>) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(url);
      return reply();
    }),
  );
  return calls;
}
function renderTasks(
  frame: 'classic' | 'prisme',
  onOpenTask?: (task: { projectId: string; taskId: string }) => void,
) {
  return render(
    <ApplicationPresentation value={frame}>
      <MyTasks
        actor={actor}
        identity={deterministicBrowserIdentity()}
        onOpenTask={onOpenTask}
      />
    </ApplicationPresentation>,
  );
}
afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

it.each(['classic', 'prisme'] as const)(
  'offers Open on every ready row, named by its Task and Project, and hands over that row’s exact identities in the %s frame',
  async (frame) => {
    const calls = serve(() =>
      Response.json({
        tasks: [
          assigned('task-atelier', atelier, '2026-09-30'),
          assigned('task-beta', beta, '2026-10-05'),
        ],
      }),
    );
    const onOpenTask = vi.fn();
    renderTasks(frame, onOpenTask);
    const list = await screen.findByRole('list', { name: copy.listLabel });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    const [atelierRow, betaRow] = rows;
    if (!atelierRow || !betaRow) throw new Error('Expected two rows.');
    expect(
      within(atelierRow).getByRole('button', { name: openName(atelier) }),
    ).toHaveTextContent(copy.open);
    const open = within(betaRow).getByRole('button', { name: openName(beta) });
    expect(open).toHaveTextContent(copy.open);
    expect(open).toHaveAttribute('type', 'button');

    fireEvent.click(open);
    expect(onOpenTask).toHaveBeenCalledTimes(1);
    expect(onOpenTask).toHaveBeenCalledWith({
      projectId: beta.id,
      taskId: 'task-beta',
    });
    // Opening neither re-reads nor changes the list.
    expect(calls).toEqual(['/api/assigned-tasks']);
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
  },
);

it('offers no Open action without the shell callback', async () => {
  serve(() =>
    Response.json({ tasks: [assigned('task-beta', beta, '2026-10-05')] }),
  );
  renderTasks('prisme');
  const list = await screen.findByRole('list', { name: copy.listLabel });
  expect(within(list).getAllByRole('listitem')).toHaveLength(1);
  expect(within(list).queryByRole('button')).not.toBeInTheDocument();
});

it.each([
  { state: 'loading', reply: () => deferred<Response>().promise },
  { state: 'denied', reply: () => new Response(null, { status: 403 }) },
  { state: 'error', reply: () => new Response(null, { status: 500 }) },
  { state: 'empty', reply: () => Response.json({ tasks: [] }) },
])('offers no Open action in the $state state', async ({ state, reply }) => {
  serve(reply);
  renderTasks('classic', vi.fn());
  await waitFor(() =>
    expect(
      screen.getByText(
        state === 'loading'
          ? copy.loading
          : state === 'denied'
            ? copy.denied
            : state === 'error'
              ? copy.error
              : copy.empty,
      ),
    ).toBeInTheDocument(),
  );
  expect(
    screen.queryByRole('button', { name: new RegExp(`^${copy.open}\\b`) }),
  ).not.toBeInTheDocument();
});
