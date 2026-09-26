import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import {
  browserIdentity,
  deferred,
} from '../production-shell/production-shell-context.test-fixtures';
import { OperationalHome } from './OperationalHome';
import { operationalHomeCopy } from './operational-home.copy';

const copy = operationalHomeCopy;
const company = { id: 'company-a', displayName: 'PRISMA-PRIM' };
const today = '2026-09-27';
const allSummaries = [
  { kind: 'active_clients', count: 3 },
  { kind: 'open_projects', count: 2 },
  { kind: 'overdue_tasks', count: 12345 },
];
const iso = {
  id: 'project-iso',
  title: 'ISO 9001 — GRUP Demo SA',
  clientDisplayName: 'GRUP Demo SA',
};
const attribution = {
  internalUserId: 'ana',
  workspaceMembershipId: 'membership-ana',
  displayName: 'Ana',
};
function overdueTask(
  id: string,
  title: string,
  dueDate: string,
  daysOverdue: number,
  changes: Record<string, unknown> = {},
) {
  return {
    id,
    companyId: company.id,
    projectId: iso.id,
    clientAccountId: 'client-grup',
    title,
    assignee: {
      workspaceMembershipId: 'membership-ana',
      displayLabel: 'Ana · 1',
    },
    dueDate,
    priority: 'normal',
    status: 'todo',
    completion: null,
    version: 1,
    createdAt: '2026-09-19T00:00:00.000Z',
    updatedAt: '2026-09-19T00:00:00.000Z',
    createdBy: attribution,
    project: iso,
    daysOverdue,
    ...changes,
  };
}
const collect = overdueTask(
  'task-collect',
  'Collect procedures',
  '2026-09-20',
  7,
);
const draft = overdueTask(
  'task-draft',
  'Draft quality manual',
  '2026-09-26',
  1,
  {
    assignee: null,
    status: 'blocked',
    version: 2,
    blockage: {
      reason: 'Waiting for the signed scope.',
      actor: attribution,
      occurredAt: '2026-09-24T10:00:00.000Z',
    },
  },
);

type Reply = () => Response | Promise<Response>;
type Call = { path: string; init: RequestInit | undefined };
/** Answers each path from its own queue; the last reply of a queue repeats. */
function stub(routes: Record<string, Reply[]>) {
  const calls: Call[] = [];
  const served = new Map<string, number>();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url, window.location.origin).pathname;
      calls.push({ path, init });
      const replies = routes[path];
      if (!replies) throw new Error(`Unexpected request to ${path}`);
      const index = served.get(path) ?? 0;
      served.set(path, index + 1);
      const reply = replies[Math.min(index, replies.length - 1)];
      if (!reply) throw new Error(`No reply for ${path}`);
      return reply();
    }),
  );
  return {
    count: (path: string) => calls.filter((call) => call.path === path).length,
    calls,
  };
}
const json =
  (value: unknown): Reply =>
  () =>
    Response.json(value);
const status =
  (code: number): Reply =>
  () =>
    new Response(null, { status: code });
const home = (summaries: unknown[] = allSummaries, changes = {}) =>
  json({ companyId: company.id, today, summaries, ...changes });
const overdueList = (tasks: unknown[], total = tasks.length, changes = {}) =>
  json({ companyId: company.id, today, total, tasks, ...changes });

function renderHome(
  props: Partial<Parameters<typeof OperationalHome>[0]> = {},
) {
  const callbacks = {
    onOpenClients: vi.fn(),
    onOpenProjects: vi.fn(),
    onOpenTask: vi.fn(),
  };
  const view = render(
    <OperationalHome
      company={company}
      identity={deterministicBrowserIdentity()}
      availableSummaries={{
        active_clients: true,
        open_projects: true,
        overdue_tasks: true,
      }}
      onRevalidateAuthority={async () => undefined}
      {...callbacks}
      {...props}
    />,
  );
  return { ...callbacks, ...view };
}
const region = () => screen.getByRole('region', { name: copy.title });
const card = (name: string) => screen.getByRole('button', { name });
const cardName = (kind: keyof typeof copy.summaries, count: string): string =>
  copy.cardName({
    label: copy.summaries[kind].label,
    count,
    destination: copy.summaries[kind].destination,
  });
const overdueCard = (count = '12,345') => cardName('overdue_tasks', count);
const panel = () =>
  screen.getByRole('region', {
    name: copy.overdue.title({ company: company.displayName }),
  });

let language: string;
beforeEach(() => {
  language = document.documentElement.lang;
  document.documentElement.lang = 'en-US';
});
afterEach(() => {
  document.documentElement.lang = language;
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('Company summary', () => {
  it('exposes no counts when refreshed destinations remain unavailable after authority revalidation', async () => {
    const revalidation = deferred<void>();
    const onRevalidateAuthority = vi.fn(() => revalidation.promise);
    stub({ '/api/operational-home': [home()] });
    renderHome({
      availableSummaries: {
        active_clients: true,
        open_projects: false,
        overdue_tasks: false,
      },
      onRevalidateAuthority,
    });
    await waitFor(() => expect(onRevalidateAuthority).toHaveBeenCalledOnce());
    expect(region()).toHaveTextContent(copy.loading);
    expect(within(region()).queryByRole('list')).toBeNull();
    revalidation.resolve();
    expect(await within(region()).findByRole('alert')).toHaveTextContent(
      copy.error,
    );
    expect(within(region()).queryByRole('list')).toBeNull();
  });

  it('shows loading, then each server count as a card with its exact label, definition and destination', async () => {
    const reply = deferred<Response>();
    const server = stub({ '/api/operational-home': [() => reply.promise] });
    renderHome();
    expect(region()).toHaveTextContent(copy.loading);
    expect(screen.queryByRole('button', { name: /: \d/ })).toBeNull();
    reply.resolve(
      Response.json({ companyId: company.id, today, summaries: allSummaries }),
    );

    const clients = await screen.findByRole('button', {
      name: cardName('active_clients', '3'),
    });
    expect(clients).toHaveAccessibleDescription(
      'Clients with an active relationship with PRISMA-PRIM',
    );
    expect(card(cardName('open_projects', '2'))).toHaveAccessibleDescription(
      'Projects you can open that are not closed',
    );
    expect(card(overdueCard())).toHaveAccessibleDescription(
      'Open Tasks due before 2026-09-27 in Projects you can open',
    );
    expect(overdueCard()).toBe('Overdue Tasks: 12,345. Show the overdue Tasks');
    const cards = within(region()).getAllByRole('listitem');
    expect(cards.map((item) => item.textContent)).toEqual([
      'Active Clients3Clients with an active relationship with PRISMA-PRIM',
      'Open Projects2Projects you can open that are not closed',
      'Overdue Tasks12,345Open Tasks due before 2026-09-27 in Projects you can open',
    ]);
    expect(region()).toHaveTextContent(
      'Counted on 2026-09-27 from the records you can open in PRISMA-PRIM.',
    );
    expect(server.calls).toHaveLength(1);
    expect(server.calls[0]?.init?.method ?? 'GET').toBe('GET');
    expect(server.calls[0]?.init?.headers).toMatchObject({
      'x-company-context-id': company.id,
    });
    // The overdue list is read only when its panel opens.
    expect(server.count('/api/overdue-tasks')).toBe(0);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows only the returned summaries and no region when none is returned', async () => {
    stub({
      '/api/operational-home': [home([{ kind: 'active_clients', count: 0 }])],
    });
    const { unmount } = renderHome();
    await screen.findByRole('button', {
      name: cardName('active_clients', '0'),
    });
    expect(within(region()).getAllByRole('button')).toHaveLength(2);
    expect(screen.queryByText(copy.summaries.open_projects.label)).toBeNull();
    expect(screen.queryByText(copy.summaries.overdue_tasks.label)).toBeNull();
    unmount();

    stub({ '/api/operational-home': [home([])] });
    const { container } = renderHome();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('opens each destination through its callback, also for a zero count', async () => {
    stub({
      '/api/operational-home': [
        home([
          { kind: 'active_clients', count: 0 },
          { kind: 'open_projects', count: 0 },
        ]),
      ],
    });
    const { onOpenClients, onOpenProjects } = renderHome();
    fireEvent.click(
      await screen.findByRole('button', {
        name: cardName('active_clients', '0'),
      }),
    );
    expect(onOpenClients).toHaveBeenCalledOnce();
    fireEvent.click(card(cardName('open_projects', '0')));
    expect(onOpenProjects).toHaveBeenCalledOnce();
  });

  it('shows an error with Retry and never zeros, then the counts read by Retry', async () => {
    const server = stub({
      '/api/operational-home': [status(500), home()],
    });
    renderHome();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The Company summary could not be loaded. No counts are shown.',
    );
    expect(region()).not.toHaveTextContent(/\b0\b/);
    expect(screen.queryByRole('list')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: copy.retry }));
    await screen.findByRole('button', { name: overdueCard() });
    expect(server.count('/api/operational-home')).toBe(2);
  });

  it('shows the denied state without counts and rejects a session the server no longer accepts', async () => {
    stub({ '/api/operational-home': [status(403)] });
    const { unmount } = renderHome();
    expect(
      await within(region()).findByText(
        'The Company summary is not available with your current access.',
      ),
    ).toBeVisible();
    expect(screen.queryByRole('list')).toBeNull();
    unmount();

    stub({ '/api/operational-home': [status(401)] });
    const identity = browserIdentity();
    renderHome({ identity });
    await within(region()).findByText(copy.denied);
    expect(identity.rejectSession).toHaveBeenCalledOnce();
  });

  it.each([
    ['a malformed body', json([])],
    ['a missing summaries list', json({ companyId: company.id, today })],
    ['another Company', home(allSummaries, { companyId: 'company-b' })],
    ['an invalid date', home(allSummaries, { today: '2026-02-30' })],
    ['an unknown kind', home([{ kind: 'money_to_collect', count: 1 }])],
    [
      'a duplicate kind',
      home([
        { kind: 'active_clients', count: 1 },
        { kind: 'active_clients', count: 2 },
      ]),
    ],
    [
      'an unordered kind',
      home([
        { kind: 'open_projects', count: 1 },
        { kind: 'active_clients', count: 2 },
      ]),
    ],
    ['a negative count', home([{ kind: 'active_clients', count: -1 }])],
    ['a fractional count', home([{ kind: 'active_clients', count: 1.5 }])],
  ])('fails closed on %s', async (_case, reply) => {
    stub({ '/api/operational-home': [reply] });
    renderHome();
    expect(await screen.findByRole('alert')).toHaveTextContent(copy.error);
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('re-reads on Refresh and never renders a reply that arrives after unmount', async () => {
    const late = deferred<Response>();
    const server = stub({
      '/api/operational-home': [
        home([{ kind: 'active_clients', count: 3 }]),
        home([{ kind: 'active_clients', count: 4 }]),
        () => late.promise,
      ],
    });
    const { unmount } = renderHome();
    await screen.findByRole('button', {
      name: cardName('active_clients', '3'),
    });
    fireEvent.click(screen.getByRole('button', { name: copy.refresh }));
    await screen.findByRole('button', {
      name: cardName('active_clients', '4'),
    });
    fireEvent.click(screen.getByRole('button', { name: copy.refresh }));
    expect(region()).toHaveTextContent(copy.loading);
    await waitFor(() => expect(server.count('/api/operational-home')).toBe(3));
    unmount();
    await act(async () => {
      late.resolve(
        Response.json({
          companyId: company.id,
          today,
          summaries: allSummaries,
        }),
      );
      await late.promise;
    });
    expect(screen.queryByRole('region')).toBeNull();
    expect(server.count('/api/operational-home')).toBe(3);
  });
});

describe('Overdue Tasks panel', () => {
  it('reads the list only when opened, moves focus into it and returns focus to the card on Close', async () => {
    const server = stub({
      '/api/operational-home': [home()],
      '/api/overdue-tasks': [overdueList([collect, draft], 2)],
    });
    const { onOpenTask } = renderHome();
    const overdue = await screen.findByRole('button', { name: overdueCard() });
    expect(server.count('/api/overdue-tasks')).toBe(0);
    fireEvent.click(overdue);

    const heading = await within(panel()).findByRole('heading', {
      name: 'Overdue Tasks in PRISMA-PRIM',
    });
    await waitFor(() => expect(heading).toHaveFocus());
    const list = await within(panel()).findByRole('list', {
      name: copy.overdue.listLabel,
    });
    const rows = within(list).getAllByRole('listitem');
    const [first, second] = rows;
    if (!first || !second) throw new Error('Expected two overdue rows.');
    expect(
      rows.map((row) => [
        within(row).getByRole('heading').textContent,
        ...within(row)
          .getAllByRole('definition')
          .map((value) => value.textContent),
      ]),
    ).toEqual([
      [
        'Collect procedures',
        '2026-09-20',
        'Ana · 1',
        'ISO 9001 — GRUP Demo SA',
        'GRUP Demo SA',
      ],
      [
        'Draft quality manual',
        '2026-09-26',
        'Unassigned',
        'ISO 9001 — GRUP Demo SA',
        'GRUP Demo SA',
      ],
    ]);
    expect(first).toHaveTextContent('To do');
    expect(first).toHaveTextContent('Overdue by 7 days');
    expect(second).toHaveTextContent('Blocked');
    expect(second).toHaveTextContent('Overdue by 1 day');
    expect(within(first).getByText('2026-09-20')).toHaveAttribute(
      'datetime',
      '2026-09-20',
    );
    expect(server.calls.at(-1)?.init?.headers).toMatchObject({
      'x-company-context-id': company.id,
    });

    fireEvent.click(
      within(second).getByRole('button', {
        name: 'Open Draft quality manual in ISO 9001 — GRUP Demo SA (GRUP Demo SA)',
      }),
    );
    expect(onOpenTask).toHaveBeenCalledWith({
      projectId: iso.id,
      taskId: 'task-draft',
    });

    fireEvent.click(
      within(panel()).getByRole('button', { name: copy.overdue.closeName }),
    );
    expect(
      screen.queryByRole('region', {
        name: copy.overdue.title({ company: company.displayName }),
      }),
    ).toBeNull();
    expect(card(overdueCard())).toHaveFocus();
    expect(server.count('/api/overdue-tasks')).toBe(1);
  });

  it('states the truncation, the empty list, the error with Retry and the denial', async () => {
    const hundred = Array.from({ length: 100 }, (_, index) =>
      overdueTask(`task-${index}`, `Notes ${index}`, '2026-09-19', 8),
    );
    const server = stub({
      '/api/operational-home': [home()],
      '/api/overdue-tasks': [
        overdueList(hundred, 101),
        overdueList([]),
        status(500),
        overdueList([collect]),
        status(403),
      ],
    });
    renderHome();
    const open = async () => {
      fireEvent.click(
        await screen.findByRole('button', { name: overdueCard() }),
      );
      return panel();
    };
    const close = () =>
      fireEvent.click(
        within(panel()).getByRole('button', { name: copy.overdue.closeName }),
      );

    expect(
      await within(await open()).findByText(
        'Showing the 100 oldest of 101 overdue Tasks.',
      ),
    ).toBeVisible();
    expect(within(panel()).getAllByRole('listitem')).toHaveLength(100);
    close();

    expect(
      await within(await open()).findByText(
        'No overdue Tasks in the Projects you can open in PRISMA-PRIM.',
      ),
    ).toBeVisible();
    close();

    expect(await within(await open()).findByRole('alert')).toHaveTextContent(
      copy.overdue.error,
    );
    fireEvent.click(
      within(panel()).getByRole('button', { name: copy.overdue.retry }),
    );
    expect(
      await within(panel()).findByRole('heading', {
        name: 'Collect procedures',
      }),
    ).toBeVisible();
    close();

    expect(
      await within(await open()).findByText(copy.overdue.denied),
    ).toBeVisible();
    expect(within(panel()).queryByRole('list')).toBeNull();
    expect(server.count('/api/overdue-tasks')).toBe(5);
  });

  it.each([
    ['another Company', overdueList([collect], 1, { companyId: 'company-b' })],
    [
      'a done Task',
      overdueList([
        {
          ...collect,
          status: 'done',
          completion: {
            actor: attribution,
            occurredAt: '2026-09-24T10:00:00.000Z',
          },
        },
      ]),
    ],
    ['a Task due today', overdueList([{ ...collect, dueDate: today }])],
    ['an undated Task', overdueList([{ ...collect, dueDate: null }])],
    ['a zero day count', overdueList([{ ...collect, daysOverdue: 0 }])],
    [
      'an inconsistent positive day count',
      overdueList([{ ...collect, daysOverdue: 1 }]),
    ],
    ['more rows than the total', overdueList([collect, draft], 1)],
  ])('fails closed on %s', async (_case, reply) => {
    stub({ '/api/operational-home': [home()], '/api/overdue-tasks': [reply] });
    renderHome();
    fireEvent.click(await screen.findByRole('button', { name: overdueCard() }));
    expect(await within(panel()).findByRole('alert')).toHaveTextContent(
      copy.overdue.error,
    );
    expect(within(panel()).queryByRole('list')).toBeNull();
  });

  it('closes the panel when a later read no longer returns the overdue count', async () => {
    stub({
      '/api/operational-home': [
        home(),
        home([{ kind: 'active_clients', count: 3 }]),
        home(),
      ],
      '/api/overdue-tasks': [overdueList([collect])],
    });
    renderHome();
    fireEvent.click(await screen.findByRole('button', { name: overdueCard() }));
    await within(panel()).findByRole('heading', { name: 'Collect procedures' });
    fireEvent.click(screen.getByRole('button', { name: copy.refresh }));
    await screen.findByRole('button', {
      name: cardName('active_clients', '3'),
    });
    expect(
      screen.queryByRole('region', {
        name: copy.overdue.title({ company: company.displayName }),
      }),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: copy.refresh }));
    await screen.findByRole('button', { name: overdueCard() });
    expect(
      screen.queryByRole('region', {
        name: copy.overdue.title({ company: company.displayName }),
      }),
    ).toBeNull();
  });

  it('re-reads an open panel with the summary on Refresh and offers no Open without a Task intent', async () => {
    const server = stub({
      '/api/operational-home': [home()],
      '/api/overdue-tasks': [overdueList([collect]), overdueList([draft])],
    });
    renderHome({ onOpenTask: undefined });
    fireEvent.click(await screen.findByRole('button', { name: overdueCard() }));
    await within(panel()).findByRole('heading', { name: 'Collect procedures' });
    expect(
      within(panel()).queryByRole('button', { name: /^Open / }),
    ).toBeNull();
    const refresh = screen.getByRole('button', { name: copy.refresh });
    refresh.focus();
    fireEvent.click(refresh);
    // The panel closes with the counts while they reload, then reads again.
    expect(
      await screen.findByRole('heading', { name: 'Draft quality manual' }),
    ).toBeVisible();
    expect(within(panel()).queryByText('Collect procedures')).toBeNull();
    expect(refresh).toHaveFocus();
    expect(server.count('/api/operational-home')).toBe(2);
    expect(server.count('/api/overdue-tasks')).toBe(2);
  });
});
