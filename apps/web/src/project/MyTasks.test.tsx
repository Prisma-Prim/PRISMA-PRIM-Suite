import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '../test/render-with-interface-locale';
import { afterEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import {
  browserIdentity,
  deferred,
} from '../production-shell/production-shell-context.test-fixtures';
import { MyTasks } from './MyTasks';
import { taskCopy } from './task.copy';

const copy = taskCopy.myTasks;
const company = {
  id: 'company',
  displayName: 'PRISMA-PRIM',
  projectPermissions: ['project.read'],
  taskPermissions: ['task.read'],
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
const iso = {
  id: 'project-iso',
  title: 'ISO preparation',
  clientDisplayName: 'Synthetic Client',
};
const audit = {
  id: 'project-audit',
  title: 'Audit preparation',
  clientDisplayName: 'Second Synthetic Client',
};
const attribution = {
  internalUserId: 'owner',
  workspaceMembershipId: 'member',
  displayName: 'Owner',
};
function assigned(
  id: string,
  title: string,
  dueDate: string | null,
  project = iso,
  companyId = 'company',
) {
  return {
    id,
    companyId,
    projectId: project.id,
    clientAccountId: `${project.id}-client`,
    title,
    assignee: { workspaceMembershipId: 'member', displayLabel: 'Owner · 1' },
    dueDate,
    priority: 'normal',
    status: 'todo',
    completion: null,
    version: 1,
    createdAt: '2026-09-19T00:00:00.000Z',
    updatedAt: '2026-09-19T00:00:00.000Z',
    createdBy: attribution,
    project,
  };
}
const september = assigned('september', 'September notes', '2026-09-30', audit);
const october = assigned('october', 'October notes', '2026-10-05');
const undated = assigned('undated', 'Undated notes', null);

type Reply = Response | Promise<Response>;
function stub(...replies: Array<() => Reply>) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchStub = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const reply = replies[Math.min(calls.length, replies.length) - 1];
    if (!reply) throw new Error('Unexpected request');
    return reply();
  });
  vi.stubGlobal('fetch', fetchStub);
  return calls;
}
function page(tasks: unknown[]) {
  return () => Response.json({ tasks });
}
function status(code: number) {
  return () => new Response(null, { status: code });
}
function rows(): string[][] {
  const list = screen.getByRole('list', { name: copy.listLabel });
  return within(list)
    .getAllByRole('listitem')
    .map((item) => [
      within(item).getByRole('heading').textContent ?? '',
      ...within(item)
        .getAllByRole('definition')
        .map((value) => value.textContent ?? ''),
    ]);
}
function region() {
  return screen.getByRole('region', { name: copy.title });
}
afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

it.each(['classic', 'prisme'] as const)(
  'shows loading, then the server-ordered open Tasks with their date, Project and Client in the %s frame',
  async (frame) => {
    const reply = deferred<Response>();
    const calls = stub(() => reply.promise);
    render(
      <ApplicationPresentation value={frame}>
        <MyTasks actor={actor} identity={deterministicBrowserIdentity()} />
      </ApplicationPresentation>,
    );
    expect(await screen.findByRole('status')).toHaveTextContent(copy.loading);
    expect(region()).toHaveClass(
      frame === 'prisme' ? 'my-tasks my-tasks--prisme' : 'my-tasks',
      { exact: true },
    );
    reply.resolve(
      Response.json({
        tasks: [
          assigned('early', 'Early notes', '0099-12-31'),
          september,
          october,
          undated,
        ],
      }),
    );
    await screen.findByRole('list', { name: copy.listLabel });
    expect(rows()).toEqual([
      [
        'Early notes',
        'ISO preparation',
        'Synthetic Client',
        'Dec 31, 99',
        'Normal',
      ],
      [
        'September notes',
        'Audit preparation',
        'Second Synthetic Client',
        'Sep 30, 2026',
        'Normal',
      ],
      [
        'October notes',
        'ISO preparation',
        'Synthetic Client',
        'Oct 5, 2026',
        'Normal',
      ],
      [
        'Undated notes',
        'ISO preparation',
        'Synthetic Client',
        'No due date',
        'Normal',
      ],
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('/api/assigned-tasks');
    expect(calls[0]?.init?.method ?? 'GET').toBe('GET');
    expect(calls[0]?.init?.headers).toMatchObject({
      'x-company-context-id': 'company',
    });
    expect(region()).not.toHaveTextContent(
      /\b(overdue|urgent|late)\b|\b\d+\s+(open\s+)?tasks?\b/i,
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /done|complete|edit/i }),
    ).not.toBeInTheDocument();
  },
);

it('labels each row with its priority as text while keeping the server date order', async () => {
  stub(
    page([
      { ...september, priority: 'normal' },
      { ...october, priority: 'critical' },
      { ...undated, priority: 'important' },
    ]),
  );
  render(<MyTasks actor={actor} identity={deterministicBrowserIdentity()} />);
  await screen.findByRole('list', { name: copy.listLabel });
  // A critical Task due later stays below a normal Task due earlier.
  expect(rows()).toEqual([
    [
      'September notes',
      'Audit preparation',
      'Second Synthetic Client',
      'Sep 30, 2026',
      'Normal',
    ],
    [
      'October notes',
      'ISO preparation',
      'Synthetic Client',
      'Oct 5, 2026',
      'Critical',
    ],
    [
      'Undated notes',
      'ISO preparation',
      'Synthetic Client',
      'No due date',
      'Important',
    ],
  ]);
  const list = screen.getByRole('list', { name: copy.listLabel });
  expect(
    within(list)
      .getAllByRole('term')
      .filter((term) => term.textContent === taskCopy.priority),
  ).toHaveLength(3);
  expect(region()).not.toHaveTextContent(
    /\b(overdue|urgent|late)\b|\b\d+\s+(open\s+|critical\s+|important\s+)?tasks?\b/i,
  );
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
});

it('shows each open row with its execution state and priority and no count, badge or ranking', async () => {
  stub(
    page([
      { ...september, status: 'in_progress', priority: 'important' },
      {
        ...october,
        priority: 'critical',
        status: 'blocked',
        version: 2,
        blockage: {
          reason: 'Waiting for the signed questionnaire',
          actor: attribution,
          occurredAt: '2026-09-24T10:00:00.000Z',
        },
      },
      undated,
    ]),
  );
  render(<MyTasks actor={actor} identity={deterministicBrowserIdentity()} />);
  const list = await screen.findByRole('list', { name: copy.listLabel });
  expect(rows().map(([title]) => title)).toEqual([
    'September notes',
    'October notes',
    'Undated notes',
  ]);
  const [started, blocked, open] = within(list).getAllByRole('listitem');
  expect(started).toHaveTextContent('In progress');
  expect(blocked).toHaveTextContent('Blocked');
  expect(open).toHaveTextContent('To do');
  // A blocked critical Task keeps the server's date order.
  expect(rows().map((row) => row.at(-1))).toEqual([
    'Important',
    'Critical',
    'Normal',
  ]);
  expect(region()).not.toHaveTextContent(
    /\b(overdue|urgent|late)\b|\b\d+\s+(open\s+|blocked\s+|critical\s+|important\s+)?tasks?\b/i,
  );
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
});

it.each([
  [
    'done',
    {
      ...october,
      status: 'done',
      completion: {
        actor: attribution,
        occurredAt: '2026-09-24T10:00:00.000Z',
      },
    },
  ],
  [
    'cancelled',
    {
      ...october,
      status: 'cancelled',
      cancellation: {
        reason: 'Duplicate of another Task',
        actor: attribution,
        occurredAt: '2026-09-24T10:00:00.000Z',
      },
    },
  ],
])('fails closed when the read returns a %s Task', async (_state, closed) => {
  stub(page([september, closed]));
  render(<MyTasks actor={actor} identity={deterministicBrowserIdentity()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent(copy.error);
  expect(
    screen.queryByRole('list', { name: copy.listLabel }),
  ).not.toBeInTheDocument();
});

it('shows the explicit empty state', async () => {
  stub(page([]));
  render(<MyTasks actor={actor} identity={deterministicBrowserIdentity()} />);
  expect(await screen.findByText(copy.empty)).toBeInTheDocument();
  expect(
    screen.queryByRole('list', { name: copy.listLabel }),
  ).not.toBeInTheDocument();
});

it('shows the denied state without rows when the server refuses the read', async () => {
  stub(status(403));
  render(<MyTasks actor={actor} identity={deterministicBrowserIdentity()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent(copy.denied);
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
});

it('rejects the session and shows no rows when the identity is no longer accepted', async () => {
  stub(status(401));
  const identity = browserIdentity();
  render(<MyTasks actor={actor} identity={identity} />);
  expect(await screen.findByRole('alert')).toHaveTextContent(copy.denied);
  expect(identity.rejectSession).toHaveBeenCalledOnce();
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
});

it.each([
  ['no active Company', { ...actor, activeCompany: undefined }],
  [
    'no task.read',
    { ...actor, activeCompany: { ...company, taskPermissions: [] } },
  ],
  [
    'no captured Task Manager assignment',
    {
      ...actor,
      activeCompany: { ...company, taskPermissionAssignmentId: undefined },
    },
  ],
  [
    'an unsupported Task permission version',
    {
      ...actor,
      activeCompany: { ...company, taskPermissionSetVersion: undefined },
    },
  ],
  [
    'no project.read',
    { ...actor, activeCompany: { ...company, projectPermissions: [] } },
  ],
  ['no Client read', { ...actor, workspacePermissions: [] }],
] satisfies Array<[string, ActorContext]>)(
  'denies without a request for %s',
  async (_case, denied) => {
    const calls = stub(page([october]));
    render(
      <MyTasks actor={denied} identity={deterministicBrowserIdentity()} />,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(copy.denied);
    expect(calls).toHaveLength(0);
  },
);

it('reads Client authority from Company client.read as well as client.manage', async () => {
  stub(page([october]));
  render(
    <MyTasks
      actor={{
        ...actor,
        workspacePermissions: [],
        activeCompany: { ...company, clientPermissions: ['client.read'] },
      }}
      identity={deterministicBrowserIdentity()}
    />,
  );
  await screen.findByRole('list', { name: copy.listLabel });
  expect(rows()).toEqual([
    [
      'October notes',
      'ISO preparation',
      'Synthetic Client',
      'Oct 5, 2026',
      'Normal',
    ],
  ]);
});

it('shows an error with Retry and then the list read by Retry', async () => {
  const calls = stub(status(500), page([october]));
  render(<MyTasks actor={actor} identity={deterministicBrowserIdentity()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent(copy.error);
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: copy.retry }));
  await screen.findByRole('list', { name: copy.listLabel });
  expect(rows()).toEqual([
    [
      'October notes',
      'ISO preparation',
      'Synthetic Client',
      'Oct 5, 2026',
      'Normal',
    ],
  ]);
  expect(calls).toHaveLength(2);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it.each([
  ['a non-list envelope', { tasks: {} }],
  [
    'a done Task',
    {
      tasks: [
        {
          ...october,
          status: 'done',
          completion: {
            actor: attribution,
            occurredAt: '2026-09-20T00:00:00.000Z',
          },
        },
      ],
    },
  ],
  [
    'another member Task',
    {
      tasks: [
        {
          ...october,
          assignee: { workspaceMembershipId: 'colleague', displayLabel: 'C' },
        },
      ],
    },
  ],
  ['an unassigned Task', { tasks: [{ ...october, assignee: null }] }],
  [
    'another Company Task',
    { tasks: [assigned('other', 'Other notes', null, iso, 'other-company')] },
  ],
  [
    'a Project that does not own the Task',
    { tasks: [{ ...october, projectId: audit.id }] },
  ],
  [
    'a missing Client label',
    { tasks: [{ ...october, project: { id: iso.id, title: iso.title } }] },
  ],
  [
    'an impossible due date',
    { tasks: [{ ...october, dueDate: '2026-02-30' }] },
  ],
  ['an unknown priority', { tasks: [{ ...october, priority: 'Critical' }] }],
  [
    'a missing priority',
    {
      tasks: [
        Object.fromEntries(
          Object.entries(october).filter(([field]) => field !== 'priority'),
        ),
      ],
    },
  ],
])('fails closed without rows for %s', async (_case, body) => {
  stub(() => Response.json(body));
  render(<MyTasks actor={actor} identity={deterministicBrowserIdentity()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent(copy.error);
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
});

it('re-reads on Refresh so a completed Task disappears', async () => {
  const calls = stub(page([september, october]), page([october]));
  render(<MyTasks actor={actor} identity={deterministicBrowserIdentity()} />);
  await screen.findByRole('list', { name: copy.listLabel });
  fireEvent.click(screen.getByRole('button', { name: copy.refresh }));
  await waitFor(() =>
    expect(rows()).toEqual([
      [
        'October notes',
        'ISO preparation',
        'Synthetic Client',
        'Oct 5, 2026',
        'Normal',
      ],
    ]),
  );
  expect(calls).toHaveLength(2);
});

it.each(['newer first', 'older first'])(
  'lets a Refresh supersede an in-flight read so a late older reply never renders (%s)',
  async (order) => {
    const older = deferred<Response>();
    const newer = deferred<Response>();
    const calls = stub(
      () => older.promise,
      () => newer.promise,
    );
    render(<MyTasks actor={actor} identity={deterministicBrowserIdentity()} />);
    await waitFor(() => expect(calls).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: copy.refresh }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[0]?.init?.signal?.aborted).toBe(true);
    const stale = Response.json({ tasks: [september] });
    const current = Response.json({ tasks: [october] });
    if (order === 'newer first') {
      newer.resolve(current);
      await screen.findByRole('list', { name: copy.listLabel });
      older.resolve(stale);
    } else {
      older.resolve(stale);
      await Promise.resolve();
      expect(screen.getByRole('status')).toHaveTextContent(copy.loading);
      newer.resolve(current);
      await screen.findByRole('list', { name: copy.listLabel });
    }
    await new Promise((settle) => setTimeout(settle, 0));
    expect(rows()).toEqual([
      [
        'October notes',
        'ISO preparation',
        'Synthetic Client',
        'Oct 5, 2026',
        'Normal',
      ],
    ]);
  },
);

it.each(['Company', 'membership', 'identity', 'assignment', 'permission'])(
  'drops a pending reply after a %s change and never shows the earlier rows',
  async (change) => {
    const earlier = deferred<Response>();
    const later = deferred<Response>();
    const calls = stub(
      () => earlier.promise,
      () => later.promise,
    );
    const identity = deterministicBrowserIdentity();
    const view = render(<MyTasks actor={actor} identity={identity} />);
    await waitFor(() => expect(calls).toHaveLength(1));
    const changed: ActorContext =
      change === 'Company'
        ? {
            ...actor,
            activeCompany: {
              ...company,
              id: 'other-company',
              displayName: 'BIC',
            },
          }
        : change === 'membership'
          ? { ...actor, workspaceMembershipId: 'replacement' }
          : change === 'assignment'
            ? {
                ...actor,
                activeCompany: {
                  ...company,
                  taskPermissionAssignmentId: 'replacement',
                },
              }
            : change === 'permission'
              ? { ...actor, activeCompany: { ...company, taskPermissions: [] } }
              : actor;
    view.rerender(
      <MyTasks
        actor={changed}
        identity={
          change === 'identity' ? deterministicBrowserIdentity() : identity
        }
      />,
    );
    expect(calls[0]?.init?.signal?.aborted).toBe(true);
    earlier.resolve(Response.json({ tasks: [september] }));
    await new Promise((settle) => setTimeout(settle, 0));
    expect(screen.queryByText('September notes')).not.toBeInTheDocument();
    if (change === 'permission') {
      expect(screen.getByRole('alert')).toHaveTextContent(copy.denied);
      expect(calls).toHaveLength(1);
      return;
    }
    expect(calls).toHaveLength(2);
    if (change === 'Company')
      expect(calls[1]?.init?.headers).toMatchObject({
        'x-company-context-id': 'other-company',
      });
    const replacement =
      change === 'Company'
        ? assigned('bic', 'BIC notes', null, iso, 'other-company')
        : change === 'membership'
          ? {
              ...october,
              assignee: {
                workspaceMembershipId: 'replacement',
                displayLabel: 'Owner · 2',
              },
            }
          : october;
    later.resolve(Response.json({ tasks: [replacement] }));
    await screen.findByRole('list', { name: copy.listLabel });
    expect(rows()).toEqual([
      [
        replacement.title,
        'ISO preparation',
        'Synthetic Client',
        replacement.dueDate === null ? taskCopy.noDate : 'Oct 5, 2026',
        'Normal',
      ],
    ]);
    expect(screen.queryByText('September notes')).not.toBeInTheDocument();
  },
);

it('aborts the pending read on unmount', async () => {
  const reply = deferred<Response>();
  const calls = stub(() => reply.promise);
  const view = render(
    <MyTasks actor={actor} identity={deterministicBrowserIdentity()} />,
  );
  await waitFor(() => expect(calls).toHaveLength(1));
  view.unmount();
  expect(calls[0]?.init?.signal?.aborted).toBe(true);
  reply.resolve(Response.json({ tasks: [october] }));
});
