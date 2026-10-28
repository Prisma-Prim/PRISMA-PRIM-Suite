import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '../test/render-with-interface-locale';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { InterfaceLocaleSelect } from '../localization/InterfaceLocaleSelect';
import { assertMessageCoverage } from '../localization/messages';
import { selectOptionByLabel } from '../test/select-option';
import { UnassignedTasks } from './UnassignedTasks';
import { unassignedTasksMessages } from './unassigned-tasks.copy';
import type { UnassignedTask } from './unassigned-tasks-response';

const actor: ActorContext = {
  internalUserId: 'reader',
  workspaceMembershipId: 'member',
  workspaceId: 'workspace',
  workspaceName: 'Workspace',
  displayName: 'Ada',
  email: 'ada@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: 'company',
    displayName: 'PRISMA-PRIM',
    clientPermissions: ['client.read'],
    projectPermissions: ['project.read'],
    taskPermissions: ['task.read'],
    taskPermissionAssignmentId: 'read-grant',
    taskPermissionSetVersion: 'v1',
  },
};
function task(index: number): UnassignedTask {
  return {
    description: null,
    id: `task-${String(index).padStart(2, '0')}`,
    title: `Literal {Task} — Știință ${index}`,
    companyId: 'company',
    projectId: 'project',
    clientAccountId: 'original-client',
    assignee: null,
    dueDate: index < 25 ? '2099-01-01' : null,
    priority: 'important',
    status: 'todo',
    completion: null,
    version: 1,
    createdAt: '2026-09-19T00:00:00.000Z',
    updatedAt: '2026-09-19T00:00:00.000Z',
    createdBy: {
      internalUserId: 'reader',
      workspaceMembershipId: 'member',
      displayName: 'Ada',
    },
    project: {
      id: 'project',
      title: 'Literal {Project}',
      clientDisplayName: 'Original {Client}',
    },
  };
}
function page(offset: number, size: number) {
  return {
    companyId: 'company',
    offset,
    pageSize: 25,
    hasNextPage: offset + 25 < size,
    tasks: Array.from(
      { length: Math.min(25, Math.max(0, size - offset)) },
      (_, index) => task(offset + index),
    ),
  };
}
function server() {
  const state = {
    size: 27,
    status: 200,
    hold: false,
    transform: (value: ReturnType<typeof page>): unknown => value,
  };
  const calls: Array<{
    path: string;
    offset: number;
    method: string;
    signal: AbortSignal | null | undefined;
  }> = [];
  const held: Array<{
    answer: (response: Response) => void;
    response: Response;
    signal: AbortSignal | null | undefined;
  }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input.toString(), window.location.origin);
      const offset = Number(url.searchParams.get('offset'));
      calls.push({
        path: url.pathname,
        offset,
        method: init?.method ?? 'GET',
        signal: init?.signal,
      });
      if (url.pathname !== '/api/unassigned-tasks')
        throw new Error('Unexpected queue request');
      const response =
        state.status === 200
          ? Response.json(state.transform(page(offset, state.size)))
          : new Response(null, { status: state.status });
      if (state.hold)
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
    async release(index = 0) {
      const pending = held.splice(index, 1)[0];
      if (!pending) throw new Error('No held public response');
      await act(async () => pending.answer(pending.response));
    },
  };
}
const region = () => screen.getByRole('region', { name: 'Unassigned Tasks' });
const button = (name: string) => within(region()).getByRole('button', { name });
async function ready(index = 0) {
  return screen.findByRole('heading', { name: task(index).title });
}
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('uses explicit pages and refresh zero, exposes out-of-range recovery and never reads members or writes', async () => {
  const api = server();
  render(
    <UnassignedTasks actor={actor} identity={deterministicBrowserIdentity()} />,
  );
  await ready();
  expect(within(region()).getAllByRole('listitem')).toHaveLength(25);
  expect(button('Previous page')).toBeDisabled();
  fireEvent.click(button('Next page'));
  await ready(25);
  expect(within(region()).getAllByRole('listitem')).toHaveLength(2);
  expect(button('Next page')).toBeDisabled();
  fireEvent.click(button('Previous page'));
  await ready();
  api.state.size = 0;
  fireEvent.click(button('Next page'));
  await screen.findByText(
    'This page no longer contains Tasks. Go back or refresh the list.',
  );
  expect(button('Previous page')).toBeEnabled();
  expect(button('Next page')).toBeDisabled();
  expect(api.calls.map((call) => call.offset)).toEqual([0, 25, 0, 25]);
  fireEvent.click(button('Refresh Unassigned Tasks'));
  await screen.findByText('No readable open unassigned Tasks in this Company.');
  expect(api.calls.map((call) => call.offset)).toEqual([0, 25, 0, 25, 0]);
  expect(
    api.calls.every(
      (call) => call.method === 'GET' && call.path === '/api/unassigned-tasks',
    ),
  ).toBe(true);
});

it('clears an unavailable later page and retries the same offset before explicit refresh', async () => {
  const api = server();
  render(
    <UnassignedTasks actor={actor} identity={deterministicBrowserIdentity()} />,
  );
  await ready();
  api.state.status = 503;
  fireEvent.click(button('Next page'));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'The list could not be loaded. No Tasks are shown.',
  );
  expect(
    screen.queryByRole('heading', { name: task(0).title }),
  ).not.toBeInTheDocument();
  api.state.status = 200;
  fireEvent.click(button('Retry Unassigned Tasks'));
  await ready(25);
  expect(api.calls.map((call) => call.offset)).toEqual([0, 25, 25]);
});

it('handles a denied read separately without exposing prior rows or eligible members', async () => {
  const api = server();
  render(
    <UnassignedTasks actor={actor} identity={deterministicBrowserIdentity()} />,
  );
  await ready();
  api.state.status = 403;
  fireEvent.click(button('Refresh Unassigned Tasks'));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Unassigned Tasks are unavailable with your current access.',
  );
  expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  expect(button('Next page')).toBeDisabled();
});

it('rejects an expired session and exposes no queue rows', async () => {
  const api = server();
  api.state.status = 401;
  const identity = {
    ...deterministicBrowserIdentity(),
    rejectSession: vi.fn(async () => undefined),
  };
  render(<UnassignedTasks actor={actor} identity={identity} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('current access');
  expect(identity.rejectSession).toHaveBeenCalledOnce();
  expect(screen.queryAllByRole('listitem')).toHaveLength(0);
});

it.each([
  [
    'foreign Company',
    (value: ReturnType<typeof page>) => ({ ...value, companyId: 'foreign' }),
  ],
  [
    'foreign nested Project',
    (value: ReturnType<typeof page>) => ({
      ...value,
      tasks: [{ ...task(0), project: { ...task(0).project, id: 'foreign' } }],
    }),
  ],
  [
    'assigned Task',
    (value: ReturnType<typeof page>) => ({
      ...value,
      tasks: [
        {
          ...task(0),
          assignee: { workspaceMembershipId: 'other', displayLabel: 'Other' },
        },
      ],
    }),
  ],
  [
    'closed Task',
    (value: ReturnType<typeof page>) => ({
      ...value,
      tasks: [
        {
          ...task(0),
          status: 'cancelled',
          cancellation: {
            reason: 'Withdrawn',
            actor: task(0).createdBy,
            occurredAt: task(0).createdAt,
          },
        },
      ],
    }),
  ],
  [
    'duplicate Task',
    (value: ReturnType<typeof page>) => ({
      ...value,
      tasks: [task(0), task(0)],
    }),
  ],
  [
    'wrong page',
    (value: ReturnType<typeof page>) => ({ ...value, offset: 25 }),
  ],
  [
    'oversized page',
    (value: ReturnType<typeof page>) => ({
      ...value,
      tasks: Array.from({ length: 26 }, (_, index) => task(index)),
    }),
  ],
  [
    'short page with continuation',
    (value: ReturnType<typeof page>) => ({ ...value, hasNextPage: true }),
  ],
  [
    'wrong order',
    (value: ReturnType<typeof page>) => ({
      ...value,
      tasks: [task(25), task(0)],
    }),
  ],
] satisfies Array<[string, (value: ReturnType<typeof page>) => unknown]>)(
  'refuses the entire malformed page for %s',
  async (_description, transform) => {
    const api = server();
    api.state.size = 1;
    api.state.transform = transform;
    render(
      <UnassignedTasks
        actor={actor}
        identity={deterministicBrowserIdentity()}
      />,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The list response could not be verified. No Tasks are shown.',
    );
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(button('Next page')).toBeDisabled();
  },
);

it('keeps the latest explicit read and suppresses an older reply after refresh', async () => {
  const api = server();
  api.state.hold = true;
  api.state.size = 1;
  render(
    <UnassignedTasks actor={actor} identity={deterministicBrowserIdentity()} />,
  );
  await waitFor(() => expect(api.held).toHaveLength(1));
  api.state.transform = (value) => ({
    ...value,
    tasks: [{ ...task(0), title: 'Current authoritative row' }],
  });
  fireEvent.click(button('Refresh Unassigned Tasks'));
  await waitFor(() => expect(api.held).toHaveLength(2));
  expect(api.held[0]?.signal?.aborted).toBe(true);
  await api.release(1);
  await screen.findByRole('heading', { name: 'Current authoritative row' });
  await api.release();
  expect(
    screen.queryByRole('heading', { name: task(0).title }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'Current authoritative row' }),
  ).toBeVisible();
});

it.each(['Company', 'membership', 'Task authority', 'identity'] as const)(
  'retires a held reply after genuine %s replacement',
  async (change) => {
    const api = server();
    api.state.hold = true;
    api.state.size = 1;
    const identity = deterministicBrowserIdentity();
    const view = render(<UnassignedTasks actor={actor} identity={identity} />);
    await waitFor(() => expect(api.held).toHaveLength(1));
    const updated: ActorContext =
      change === 'Company'
        ? { ...actor, activeCompany: undefined }
        : change === 'membership'
          ? { ...actor, workspaceMembershipId: 'replacement' }
          : change === 'Task authority'
            ? {
                ...actor,
                activeCompany: {
                  ...actor.activeCompany,
                  id: 'company',
                  displayName: 'PRISMA-PRIM',
                  taskPermissions: [],
                },
              }
            : actor;
    api.state.transform = (value) => ({
      ...value,
      tasks: [{ ...task(0), title: 'Replacement row' }],
    });
    view.rerender(
      <UnassignedTasks
        actor={updated}
        identity={
          change === 'identity' ? deterministicBrowserIdentity() : identity
        }
      />,
    );
    await waitFor(() => expect(api.held[0]?.signal?.aborted).toBe(true));
    await api.release();
    expect(
      screen.queryByRole('heading', { name: task(0).title }),
    ).not.toBeInTheDocument();
    if (change === 'membership' || change === 'identity') {
      await waitFor(() => expect(api.held).toHaveLength(1));
      await api.release();
      await screen.findByRole('heading', { name: 'Replacement row' });
    } else
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'current access',
      );
  },
);

it('preserves the second page, literal content, focused language control and pending read across all four locales without writes', async () => {
  assertMessageCoverage('unassignedTasks', unassignedTasksMessages);
  const api = server();
  render(
    <>
      <InterfaceLocaleSelect />
      <UnassignedTasks
        actor={actor}
        identity={deterministicBrowserIdentity()}
      />
    </>,
  );
  await ready();
  fireEvent.click(button('Next page'));
  await ready(25);
  const picker = screen.getByRole('combobox');
  for (const locale of [
    { name: 'Română', title: 'Sarcini neatribuite' },
    { name: 'Русский', title: 'Неназначенные Задачи' },
    { name: 'Français', title: 'Tâches non attribuées' },
    { name: 'English', title: 'Unassigned Tasks' },
  ]) {
    picker.focus();
    selectOptionByLabel(picker, locale.name);
    expect(picker).toHaveFocus();
    const list = screen.getByRole('region', { name: locale.title });
    expect(
      within(list).getByRole('heading', { name: task(25).title }),
    ).toBeVisible();
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(api.calls.map((call) => call.offset)).toEqual([0, 25]);
  }
  api.state.hold = true;
  fireEvent.click(button('Refresh Unassigned Tasks'));
  await waitFor(() => expect(api.held).toHaveLength(1));
  selectOptionByLabel(picker, 'Français');
  selectOptionByLabel(picker, 'English');
  expect(api.held[0]?.signal?.aborted).toBe(false);
  expect(api.calls.map((call) => call.offset)).toEqual([0, 25, 0]);
  await api.release();
  await ready();
  expect(api.calls.every((call) => call.method === 'GET')).toBe(true);
});
