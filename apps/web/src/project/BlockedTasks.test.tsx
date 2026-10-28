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
import { BlockedTasks } from './BlockedTasks';
import { blockedTasksMessages } from './blocked-tasks.copy';
import type { BlockedTask } from './blocked-tasks-response';

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
function task(index: number): BlockedTask {
  return {
    id: `task-${String(index).padStart(2, '0')}`,
    title: `Literal {Task} — Știință ${index}`,
    companyId: 'company',
    projectId: 'project',
    clientAccountId: 'original-client',
    assignee:
      index % 2 === 0
        ? {
            workspaceMembershipId: 'other-member',
            displayLabel: 'Ion — Ответственный',
          }
        : null,
    dueDate: index < 25 ? '2099-01-01' : null,
    priority: 'important',
    status: 'blocked',
    completion: null,
    blockage: {
      reason: 'Literal <script>blocaj</script> — Не хватает ответа',
      actor: {
        internalUserId: 'reader',
        workspaceMembershipId: 'member',
        displayName: 'Ada',
      },
      occurredAt: '2026-10-28T00:00:00.000Z',
    },
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
      if (url.pathname !== '/api/blocked-tasks')
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
const region = () => screen.getByRole('region', { name: 'Blocked Tasks' });
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
    <BlockedTasks actor={actor} identity={deterministicBrowserIdentity()} />,
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
  fireEvent.click(button('Refresh Blocked Tasks'));
  await screen.findByText(
    'No current blocked Tasks are readable in this Company.',
  );
  expect(api.calls.map((call) => call.offset)).toEqual([0, 25, 0, 25, 0]);
  expect(
    api.calls.every(
      (call) => call.method === 'GET' && call.path === '/api/blocked-tasks',
    ),
  ).toBe(true);
});

it('clears an unavailable later page and retries the same offset before explicit refresh', async () => {
  const api = server();
  render(
    <BlockedTasks actor={actor} identity={deterministicBrowserIdentity()} />,
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
  fireEvent.click(button('Retry Blocked Tasks'));
  await ready(25);
  expect(api.calls.map((call) => call.offset)).toEqual([0, 25, 25]);
});

it('handles a denied read separately without exposing prior rows or eligible members', async () => {
  const api = server();
  render(
    <BlockedTasks actor={actor} identity={deterministicBrowserIdentity()} />,
  );
  await ready();
  api.state.status = 403;
  fireEvent.click(button('Refresh Blocked Tasks'));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Blocked Tasks are unavailable with your current access.',
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
  render(<BlockedTasks actor={actor} identity={identity} />);
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
    'nonblocked Task',
    (value: ReturnType<typeof page>) => ({
      ...value,
      tasks: [
        {
          ...task(0),
          status: 'todo',
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
      <BlockedTasks actor={actor} identity={deterministicBrowserIdentity()} />,
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
    <BlockedTasks actor={actor} identity={deterministicBrowserIdentity()} />,
  );
  await waitFor(() => expect(api.held).toHaveLength(1));
  api.state.transform = (value) => ({
    ...value,
    tasks: [{ ...task(0), title: 'Current authoritative row' }],
  });
  fireEvent.click(button('Refresh Blocked Tasks'));
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
    const view = render(<BlockedTasks actor={actor} identity={identity} />);
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
      <BlockedTasks
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
  assertMessageCoverage('blockedTasks', blockedTasksMessages);
  const api = server();
  render(
    <>
      <InterfaceLocaleSelect />
      <BlockedTasks actor={actor} identity={deterministicBrowserIdentity()} />
    </>,
  );
  await ready();
  fireEvent.click(button('Next page'));
  await ready(25);
  const picker = screen.getByRole('combobox');
  for (const locale of [
    { name: 'Română', title: 'Sarcini blocate' },
    { name: 'Русский', title: 'Заблокированные Задачи' },
    { name: 'Français', title: 'Tâches bloquées' },
    { name: 'English', title: 'Blocked Tasks' },
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
  fireEvent.click(button('Refresh Blocked Tasks'));
  await waitFor(() => expect(api.held).toHaveLength(1));
  selectOptionByLabel(picker, 'Français');
  selectOptionByLabel(picker, 'English');
  expect(api.held[0]?.signal?.aborted).toBe(false);
  expect(api.calls.map((call) => call.offset)).toEqual([0, 25, 0]);
  await api.release();
  await ready();
  expect(api.calls.every((call) => call.method === 'GET')).toBe(true);
});

it.each([
  [
    'missing current reason',
    (row: BlockedTask) => ({ ...row, blockage: null }),
  ],
  [
    'invalid declaring actor',
    (row: BlockedTask) => ({
      ...row,
      blockage: { ...row.blockage, actor: {} },
    }),
  ],
  [
    'invalid declaration time',
    (row: BlockedTask) => ({
      ...row,
      blockage: { ...row.blockage, occurredAt: 'tomorrow' },
    }),
  ],
  [
    'invalid recorded assignee',
    (row: BlockedTask) => ({
      ...row,
      assignee: { workspaceMembershipId: 7, displayLabel: 'Invalid' },
    }),
  ],
  [
    'unknown native priority',
    (row: BlockedTask) => ({ ...row, priority: 'urgent' }),
  ],
] satisfies Array<[string, (row: BlockedTask) => unknown]>)(
  'withholds all rows for %s even after a valid first row',
  async (_name, invalid) => {
    const api = server();
    api.state.size = 2;
    api.state.transform = (value) => ({
      ...value,
      tasks: [task(0), invalid(task(1))],
    });
    render(
      <BlockedTasks actor={actor} identity={deterministicBrowserIdentity()} />,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'could not be verified',
    );
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  },
);

it('renders the full literal reason and native assignee/attribution, accepts additive metadata, and offers only exact native continuation', async () => {
  const api = server();
  api.state.size = 1;
  api.state.transform = (value) => ({
    ...value,
    additiveMetadata: 'compatible',
    tasks: value.tasks.map((row) => ({ ...row, extra: 'compatible' })),
  });
  const open = vi.fn();
  render(
    <BlockedTasks
      actor={actor}
      identity={deterministicBrowserIdentity()}
      onOpenTask={open}
    />,
  );
  await ready();
  expect(
    screen.getByText('Literal <script>blocaj</script> — Не хватает ответа'),
  ).toBeVisible();
  expect(screen.getByText('Ion — Ответственный')).toBeVisible();
  expect(region().querySelector('script')).toBeNull();
  fireEvent.click(
    within(region()).getByRole('button', { name: /^Open Literal/u }),
  );
  expect(open).toHaveBeenCalledWith({
    projectId: 'project',
    taskId: task(0).id,
  });
  expect(api.calls).toHaveLength(1);
  expect(
    api.calls.every(
      (call) => call.method === 'GET' && call.path === '/api/blocked-tasks',
    ),
  ).toBe(true);
});

it.each(
  ['Company', 'identity', 'Task authority'].flatMap((change) =>
    [200, 403].map((status) => ({ change, status })),
  ),
)(
  'permanently retires late$status across consumed $change A→B→A',
  async ({ change, status }) => {
    const api = server();
    api.state.hold = true;
    api.state.size = 1;
    api.state.status = status;
    const original = {
      ...deterministicBrowserIdentity(),
      rejectSession: vi.fn(async () => undefined),
    };
    const replacement = {
      ...deterministicBrowserIdentity(),
      rejectSession: vi.fn(async () => undefined),
    };
    const view = render(<BlockedTasks actor={actor} identity={original} />);
    await waitFor(() => expect(api.held).toHaveLength(1));
    const other: ActorContext =
      change === 'Company'
        ? { ...actor, activeCompany: undefined }
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
    view.rerender(
      <BlockedTasks
        actor={other}
        identity={change === 'identity' ? replacement : original}
      />,
    );
    await waitFor(() => expect(api.held[0]?.signal?.aborted).toBe(true));
    if (change === 'identity')
      await waitFor(() => expect(api.held).toHaveLength(2));
    api.state.hold = false;
    api.state.status = 200;
    api.state.transform = (value) => ({
      ...value,
      tasks: [{ ...task(0), title: 'Fresh after round trip' }],
    });
    view.rerender(<BlockedTasks actor={actor} identity={original} />);
    await screen.findByRole('heading', { name: 'Fresh after round trip' });
    while (api.held.length) await api.release();
    expect(
      screen.getByRole('heading', { name: 'Fresh after round trip' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: task(0).title }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(original.rejectSession).not.toHaveBeenCalled();
    expect(replacement.rejectSession).not.toHaveBeenCalled();
  },
);
