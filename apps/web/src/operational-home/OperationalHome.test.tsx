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
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
} from '../localization/interface-locale';
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
type Call = { path: string; search: string; init: RequestInit | undefined };
/** Answers each path from its own queue; the last reply of a queue repeats. */
function stub(routes: Record<string, Reply[]>) {
  const calls: Call[] = [];
  const served = new Map<string, number>();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const parsed = new URL(url, window.location.origin);
      const path = parsed.pathname;
      calls.push({ path, search: parsed.search, init });
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
/** Public response fixtures: one complete, bounded page, never a full UI result. */
const pagingTasks = Array.from({ length: 107 }, (_, index) =>
  overdueTask(
    `page-${String(index + 1).padStart(3, '0')}`,
    `Paged note ${index + 1}`,
    '2026-09-19',
    8,
  ),
);
const requestedOffsets = (server: ReturnType<typeof stub>) =>
  server.calls
    .filter((call) => call.path === '/api/overdue-tasks')
    .map((call) => call.search);
const home = (summaries: unknown[] = allSummaries, changes = {}) =>
  json({ companyId: company.id, today, summaries, ...changes });
const overdueList = (tasks: unknown[], total = tasks.length, changes = {}) =>
  json({
    companyId: company.id,
    today,
    total,
    offset: 0,
    pageSize: 25,
    tasks,
    ...changes,
  });

function renderHome(
  props: Partial<Parameters<typeof OperationalHome>[0]> = {},
) {
  const callbacks = {
    onOpenClients: vi.fn(),
    onOpenProjects: vi.fn(),
    onOpenMyTasks: vi.fn(),
    onOpenTask: vi.fn(),
  };
  const view = render(
    <InterfaceLocaleProvider>
      <OperationalHome
        activity={{
          state: { status: 'ready', events: [] },
          activeCompanyId: company.id,
          onRefresh: async () => undefined,
          onOpenActivity: () => undefined,
          onOpenRequest: undefined,
        }}
        workspaceMembershipId={attribution.workspaceMembershipId}
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
      />
    </InterfaceLocaleProvider>,
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
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
  language = document.documentElement.lang;
  document.documentElement.lang = 'en-US';
});
afterEach(() => {
  document.documentElement.lang = language;
  localStorage.removeItem(interfaceLocaleStorageKey);
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
      'Open Tasks due before Sep 27, 2026 in Projects you can open',
    );
    expect(overdueCard()).toBe('Overdue Tasks: 12,345. Show the overdue Tasks');
    const cards = within(region()).getAllByRole('listitem');
    expect(cards.map((item) => item.textContent)).toEqual([
      'Active Clients3Clients with an active relationship with PRISMA-PRIM',
      'Open Projects2Projects you can open that are not closed',
      'Overdue Tasks12,345Open Tasks due before Sep 27, 2026 in Projects you can open',
    ]);
    expect(region()).toHaveTextContent(
      'Counted on Sep 27, 2026 from the records you can open in PRISMA-PRIM.',
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
    renderHome();
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: copy.title })).toBeNull(),
    );
    for (const summary of Object.values(copy.summaries)) {
      expect(screen.queryByText(summary.label)).toBeNull();
    }
    expect(
      screen.getByRole('region', { name: 'Recent changes' }),
    ).toHaveTextContent(
      'No dated events to show in the current Activity context.',
    );
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
  it('browses every one of 107 Tasks in bounded pages, then goes back and restarts', async () => {
    const server = stub({
      '/api/operational-home': [home([{ kind: 'overdue_tasks', count: 107 }])],
      '/api/overdue-tasks': [
        overdueList(pagingTasks.slice(0, 25), 107),
        overdueList(pagingTasks.slice(25, 50), 107, { offset: 25 }),
        overdueList(pagingTasks.slice(50, 75), 107, { offset: 50 }),
        overdueList(pagingTasks.slice(75, 100), 107, { offset: 75 }),
        overdueList(pagingTasks.slice(100), 107, { offset: 100 }),
        overdueList(pagingTasks.slice(75, 100), 107, { offset: 75 }),
        overdueList(pagingTasks.slice(0, 25), 107),
      ],
    });
    const { onOpenTask } = renderHome();
    fireEvent.click(
      await screen.findByRole('button', { name: overdueCard('107') }),
    );
    const seen: Array<string | null> = [];
    // Literal expected boundaries are independent of the returned page metadata.
    for (const expected of [
      { first: 1, last: 25, size: 25 },
      { first: 26, last: 50, size: 25 },
      { first: 51, last: 75, size: 25 },
      { first: 76, last: 100, size: 25 },
      { first: 101, last: 107, size: 7 },
    ]) {
      await within(panel()).findByText(
        `Overdue Tasks ${expected.first}–${expected.last} of 107.`,
      );
      const list = within(panel()).getByRole('list', {
        name: copy.overdue.listLabel,
      });
      expect(within(list).getAllByRole('listitem')).toHaveLength(expected.size);
      const headings = within(list).getAllByRole('heading');
      expect(headings[0]).toHaveTextContent(`Paged note ${expected.first}`);
      expect(headings.at(-1)).toHaveTextContent(`Paged note ${expected.last}`);
      seen.push(...headings.map((heading) => heading.textContent));
      const next = within(panel()).getByRole('button', { name: 'Next page' });
      if (expected.first === 1) {
        const previous = within(panel()).getByRole('button', {
          name: 'Previous page',
        });
        expect(previous).toBeDisabled();
        fireEvent.click(previous);
        expect(requestedOffsets(server)).toEqual(['?offset=0']);
      }
      if (expected.last < 107) fireEvent.click(next);
      else {
        expect(next).toBeDisabled();
        fireEvent.click(next);
        expect(server.count('/api/overdue-tasks')).toBe(5);
      }
    }
    expect(seen).toEqual(pagingTasks.map((task) => task.title));
    expect(new Set(seen).size).toBe(107);
    fireEvent.click(
      within(panel()).getByRole('button', {
        name: 'Open Paged note 107 in ISO 9001 — GRUP Demo SA (GRUP Demo SA)',
      }),
    );
    expect(onOpenTask).toHaveBeenCalledOnce();
    expect(onOpenTask).toHaveBeenCalledWith({
      projectId: iso.id,
      taskId: 'page-107',
    });
    fireEvent.click(
      within(panel()).getByRole('button', { name: 'Previous page' }),
    );
    await within(panel()).findByText('Overdue Tasks 76–100 of 107.');
    expect(
      within(panel()).queryByRole('heading', { name: 'Paged note 107' }),
    ).toBeNull();
    fireEvent.click(
      within(panel()).getByRole('button', { name: 'Refresh from the start' }),
    );
    await within(panel()).findByText('Overdue Tasks 1–25 of 107.');
    expect(
      within(panel()).getByRole('button', { name: 'Previous page' }),
    ).toBeDisabled();
    expect(requestedOffsets(server)).toEqual([
      '?offset=0',
      '?offset=25',
      '?offset=50',
      '?offset=75',
      '?offset=100',
      '?offset=75',
      '?offset=0',
    ]);
    expect(card(overdueCard('107'))).toBeVisible();
    expect(server.count('/api/operational-home')).toBe(1);
  });

  it('clears old rows and count after a later-page failure, then retries the same page', async () => {
    const server = stub({
      '/api/operational-home': [home([{ kind: 'overdue_tasks', count: 26 }])],
      '/api/overdue-tasks': [
        overdueList(pagingTasks.slice(0, 25), 26),
        status(500),
        overdueList(pagingTasks.slice(25, 26), 26, { offset: 25 }),
      ],
    });
    renderHome();
    fireEvent.click(
      await screen.findByRole('button', { name: overdueCard('26') }),
    );
    await within(panel()).findByText('Overdue Tasks 1–25 of 26.');
    fireEvent.click(within(panel()).getByRole('button', { name: 'Next page' }));
    expect(await within(panel()).findByRole('alert')).toHaveTextContent(
      copy.overdue.error,
    );
    expect(within(panel()).queryByRole('list')).toBeNull();
    expect(within(panel()).queryByText('Overdue Tasks 1–25 of 26.')).toBeNull();
    expect(
      within(panel()).queryByRole('heading', { name: 'Paged note 1' }),
    ).toBeNull();
    fireEvent.click(
      within(panel()).getByRole('button', { name: copy.overdue.retry }),
    );
    await within(panel()).findByRole('heading', { name: 'Paged note 26' });
    expect(panel()).toHaveTextContent('Overdue Tasks 26–26 of 26.');
    expect(
      within(panel()).getByRole('button', { name: 'Next page' }),
    ).toBeDisabled();
    expect(requestedOffsets(server)).toEqual([
      '?offset=0',
      '?offset=25',
      '?offset=25',
    ]);
  });

  it.each([
    { label: 'remaining Tasks before this offset', total: 25 },
    { label: 'no remaining overdue Tasks', total: 0 },
  ])(
    'distinguishes an empty later page with $label and explicitly restarts',
    async ({ total }) => {
      const firstAfterChange = total === 0 ? [] : pagingTasks.slice(0, 25);
      const server = stub({
        '/api/operational-home': [home([{ kind: 'overdue_tasks', count: 26 }])],
        '/api/overdue-tasks': [
          overdueList(pagingTasks.slice(0, 25), 26),
          overdueList([], total, { offset: 25 }),
          overdueList(firstAfterChange, total),
        ],
      });
      renderHome();
      fireEvent.click(
        await screen.findByRole('button', { name: overdueCard('26') }),
      );
      await within(panel()).findByText('Overdue Tasks 1–25 of 26.');
      fireEvent.click(
        within(panel()).getByRole('button', { name: 'Next page' }),
      );
      const state =
        total === 0
          ? copy.overdue.empty({ company: company.displayName })
          : 'This page no longer contains Tasks. There are now 25 overdue Tasks; return to the start.';
      await within(panel()).findByText(state);
      expect(within(panel()).queryByRole('list')).toBeNull();
      expect(
        within(panel()).getByRole('button', { name: 'Next page' }),
      ).toBeDisabled();
      if (total > 0)
        expect(
          within(panel()).queryByText(
            copy.overdue.empty({ company: company.displayName }),
          ),
        ).toBeNull();
      fireEvent.click(
        within(panel()).getByRole('button', {
          name: total === 0 ? 'Refresh from the start' : 'Return to the start',
        }),
      );
      if (total === 0)
        await within(panel()).findByText(
          copy.overdue.empty({ company: company.displayName }),
        );
      else await within(panel()).findByText('Overdue Tasks 1–25 of 25.');
      await waitFor(() =>
        expect(requestedOffsets(server)).toEqual([
          '?offset=0',
          '?offset=25',
          '?offset=0',
        ]),
      );
      expect(
        within(panel()).getByRole('button', { name: 'Previous page' }),
      ).toBeDisabled();
    },
  );

  it('ignores a held older page after a newer explicit restart without moving focus', async () => {
    const late = deferred<Response>();
    const server = stub({
      '/api/operational-home': [home([{ kind: 'overdue_tasks', count: 26 }])],
      '/api/overdue-tasks': [
        overdueList(pagingTasks.slice(0, 25), 26),
        () => late.promise,
        overdueList([collect]),
      ],
    });
    renderHome();
    fireEvent.click(
      await screen.findByRole('button', { name: overdueCard('26') }),
    );
    await within(panel()).findByText('Overdue Tasks 1–25 of 26.');
    fireEvent.click(within(panel()).getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(server.count('/api/overdue-tasks')).toBe(2));
    const refresh = within(panel()).getByRole('button', {
      name: 'Refresh from the start',
    });
    refresh.focus();
    try {
      fireEvent.click(refresh);
      const current = await within(panel()).findByRole('heading', {
        name: collect.title,
      });
      expect(panel()).toHaveTextContent('Overdue Tasks 1–1 of 1.');
      expect(refresh).toHaveFocus();
      await act(async () => {
        late.resolve(
          Response.json({
            companyId: company.id,
            today,
            total: 26,
            offset: 25,
            pageSize: 25,
            tasks: pagingTasks.slice(25, 26),
          }),
        );
        await late.promise;
      });
      expect(
        within(panel()).getByRole('heading', { name: collect.title }),
      ).toBe(current);
      expect(
        within(panel()).queryByRole('heading', { name: 'Paged note 26' }),
      ).toBeNull();
      expect(panel()).toHaveTextContent('Overdue Tasks 1–1 of 1.');
      expect(refresh).toHaveFocus();
      expect(requestedOffsets(server)).toEqual([
        '?offset=0',
        '?offset=25',
        '?offset=0',
      ]);
    } finally {
      late.resolve(
        Response.json({
          companyId: company.id,
          today,
          total: 26,
          offset: 25,
          pageSize: 25,
          tasks: pagingTasks.slice(25, 26),
        }),
      );
    }
  });

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
        'Sep 20, 2026',
        'Ana · 1',
        'ISO 9001 — GRUP Demo SA',
        'GRUP Demo SA',
      ],
      [
        'Draft quality manual',
        'Sep 26, 2026',
        'Unassigned',
        'ISO 9001 — GRUP Demo SA',
        'GRUP Demo SA',
      ],
    ]);
    expect(first).toHaveTextContent('To do');
    expect(first).toHaveTextContent('Overdue by 7 days');
    expect(second).toHaveTextContent('Blocked');
    expect(second).toHaveTextContent('Overdue by 1 day');
    expect(within(first).getByText('Sep 20, 2026')).toHaveAttribute(
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

  it('states the bounded page and whole count, the empty list, the error with Retry and the denial', async () => {
    const firstPage = Array.from({ length: 25 }, (_, index) =>
      overdueTask(`task-${index}`, `Notes ${index}`, '2026-09-19', 8),
    );
    const server = stub({
      '/api/operational-home': [home()],
      '/api/overdue-tasks': [
        overdueList(firstPage, 107),
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
      await within(await open()).findByText('Overdue Tasks 1–25 of 107.'),
    ).toBeVisible();
    expect(within(panel()).getAllByRole('listitem')).toHaveLength(25);
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
    ['a missing offset', overdueList([collect], 1, { offset: undefined })],
    ['a missing page size', overdueList([collect], 1, { pageSize: undefined })],
    ['a different page size', overdueList([collect], 1, { pageSize: 100 })],
    [
      'a complete page for another offset',
      overdueList(pagingTasks.slice(25, 50), 50, { offset: 25 }),
    ],
    ['an incomplete page for the total', overdueList([collect], 26)],
    ['a negative total', overdueList([], -1)],
    ['an unsafe total', overdueList([], Number.MAX_SAFE_INTEGER + 1)],
    ['more than one page of rows', overdueList(pagingTasks.slice(0, 26), 26)],
    ['duplicate Task identities', overdueList([collect, collect], 2)],
    ['an inversion of due dates', overdueList([draft, collect], 2)],
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
