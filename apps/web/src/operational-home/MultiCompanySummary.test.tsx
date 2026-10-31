import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '../test/render-with-interface-locale';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import { MultiCompanySummary } from './MultiCompanySummary';
import { assertMessageCoverage } from '../localization/messages';
import { multiCompanySummaryMessages } from './multi-company-summary.copy';
import { deferred } from '../production-shell/production-shell-context.test-fixtures';
import { InterfaceLocaleSelect } from '../localization/InterfaceLocaleSelect';
import { changeValue } from '../test/select-option';

const a = { id: 'company-a', displayName: 'PRISMA-PRIM' };
const b = { id: 'company-b', displayName: 'BIC' };
const c = { id: 'company-c', displayName: 'Context only' };
const e = { id: 'company-e', displayName: 'Empty readable' };
const companies = [a, b, c, e];

function actorFor(companyId: string): ActorContext {
  const company = companies.find((item) => item.id === companyId);
  return {
    internalUserId: 'ana',
    workspaceMembershipId: 'membership-ana',
    workspaceId: 'workspace',
    workspaceName: 'Workspace',
    displayName: 'Ana',
    email: 'ana@example.test',
    active: true,
    workspacePermissions: [],
    activeCompany: {
      id: companyId,
      displayName: company?.displayName ?? 'Unknown',
      clientPermissions: companyId === c.id ? [] : ['client.read'],
      clientPermissionAssignmentId: 'client-assignment',
      clientPermissionSetVersion: 'v1',
      projectPermissions: companyId === c.id ? [] : ['project.read'],
      taskPermissions: companyId === c.id ? [] : ['task.read'],
      taskPermissionAssignmentId: 'task-assignment',
      taskPermissionSetVersion: 'v1',
    },
  };
}
type Call = { path: string; companyId: string | null; method: string };
type Handler = (call: Call) => Response | Promise<Response>;
function server() {
  const calls: Call[] = [];
  const overrides = new Map<string, Handler>();
  const state = {
    companies: [...companies],
    actor: (companyId: string): unknown => actorFor(companyId),
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const call = {
        path: new URL(url, window.location.origin).pathname,
        companyId: new Headers(init?.headers).get('x-company-context-id'),
        method: init?.method ?? 'GET',
      };
      calls.push(call);
      const override = overrides.get(`${call.path}:${call.companyId ?? ''}`);
      if (override) return await override(call);
      if (call.path === '/api/companies') return Response.json(state.companies);
      if (call.path === '/api/access/current-actor' && call.companyId)
        return Response.json(state.actor(call.companyId));
      if (call.path === '/api/operational-home' && call.companyId) {
        const values =
          call.companyId === a.id
            ? [3, 2, 6]
            : call.companyId === b.id
              ? [2, 1, 1]
              : [0, 0, 0];
        return Response.json({
          companyId: call.companyId,
          today: call.companyId === b.id ? '2026-09-28' : '2026-09-27',
          summaries: [
            { kind: 'active_clients', count: values[0] },
            { kind: 'open_projects', count: values[1] },
            { kind: 'overdue_tasks', count: values[2] },
          ],
        });
      }
      return new Response(null, { status: 404 });
    }),
  );
  return { calls, overrides, state };
}
function identity(): BrowserIdentity {
  return {
    loaded: true,
    signedIn: true,
    getToken: async () => 'test-token',
    rejectSession: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
    signedOutView: null,
  };
}
function mount(actor = actorFor(a.id)) {
  const auth = identity();
  const onContinue = vi.fn(async () => 'not-opened' as const);
  const onCancelNavigation = vi.fn();
  const onWorkspaceAccessRejected = vi.fn();
  const view = render(
    <MultiCompanySummary
      actor={actor}
      identity={auth}
      onContinue={onContinue}
      onCancelNavigation={onCancelNavigation}
      onWorkspaceAccessRejected={onWorkspaceAccessRejected}
    />,
  );
  return {
    ...view,
    auth,
    onContinue,
    onCancelNavigation,
    onWorkspaceAccessRejected,
  };
}
async function open() {
  fireEvent.click(
    screen.getByRole('button', { name: 'All Companies summaries' }),
  );
  return await screen.findByRole('region', { name: 'All Companies summaries' });
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('multi-Company summaries through the HTTP boundary', () => {
  it('collects independent attributed summaries without selecting globally; Cancel performs no I/O', async () => {
    const api = server();
    const view = mount();
    expect(api.calls).toEqual([]);
    await open();
    const rowA = await screen.findByRole('region', { name: a.displayName });
    const rowB = await screen.findByRole('region', { name: b.displayName });
    const cardB = await within(rowB).findByRole('button', {
      name: /BIC: Active Clients: 2\./,
    });
    expect(
      within(rowA).getByRole('button', {
        name: /PRISMA-PRIM: Overdue Tasks: 6\./,
      }),
    ).toBeVisible();
    expect(
      await screen.findByRole('region', { name: e.displayName }),
    ).toBeVisible();
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: c.displayName }),
      ).not.toBeInTheDocument(),
    );
    expect(
      api.calls
        .filter((call) => call.path === '/api/operational-home')
        .map((call) => call.companyId),
    ).toEqual([a.id, b.id, e.id]);
    expect(within(rowA).getByText('Summary date: Sep 27, 2026')).toBeVisible();
    expect(within(rowB).getByText('Summary date: Sep 28, 2026')).toBeVisible();
    fireEvent.click(cardB);
    const dialog = screen.getByRole('dialog', {
      name: 'Open Company destination',
    });
    expect(dialog).toHaveTextContent('BIC');
    const before = [...api.calls];
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(api.calls).toEqual(before);
    expect(view.onContinue).not.toHaveBeenCalled();
    expect(cardB).toHaveFocus();
    fireEvent.click(cardB);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() =>
      expect(view.onContinue).toHaveBeenCalledWith({
        companyId: b.id,
        kind: 'active_clients',
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The destination was not opened.',
    );
    expect(api.calls.every((call) => call.method === 'GET')).toBe(true);
  });

  it('has complete required copy in all four interface locales', () => {
    expect(() =>
      assertMessageCoverage('multiCompanySummary', multiCompanySummaryMessages),
    ).not.toThrow();
  });

  it.each(['open_projects', 'overdue_tasks'])(
    'rejects an unreadable consumed %s summary even when the server returns a valid count',
    async (kind) => {
      const api = server();
      api.state.actor = (id) =>
        id === b.id
          ? {
              ...actorFor(id),
              activeCompany: {
                id,
                displayName: b.displayName,
                clientPermissions: ['client.read'],
                clientPermissionAssignmentId: 'client-only',
                clientPermissionSetVersion: 'v1',
              },
            }
          : actorFor(id);
      api.overrides.set(`/api/operational-home:${b.id}`, () =>
        Response.json({
          companyId: b.id,
          today: '2026-09-28',
          summaries: [{ kind, count: 777 }],
        }),
      );
      mount();
      await open();
      expect(
        await screen.findByRole('button', { name: 'Retry for BIC' }),
      ).toBeVisible();
      const row = screen.getByRole('region', { name: b.displayName });
      expect(within(row).queryByText('777')).not.toBeInTheDocument();
      expect(within(row).getAllByRole('button')).toHaveLength(1);
    },
  );

  it('bounds qualification/read pipelines at two and shows no summary placeholders before qualification', async () => {
    const api = server();
    const heldA = deferred<Response>();
    const heldB = deferred<Response>();
    api.overrides.set(`/api/access/current-actor:${a.id}`, () => heldA.promise);
    api.overrides.set(`/api/access/current-actor:${b.id}`, () => heldB.promise);
    mount();
    const region = await open();
    await waitFor(() =>
      expect(
        api.calls.filter((call) => call.path === '/api/access/current-actor'),
      ).toHaveLength(2),
    );
    expect(
      within(region).queryByText('Active Clients'),
    ).not.toBeInTheDocument();
    expect(
      api.calls.filter((call) => call.path === '/api/operational-home'),
    ).toHaveLength(0);
    await act(async () => {
      heldB.resolve(Response.json(actorFor(b.id)));
    });
    await waitFor(() =>
      expect(
        api.calls.some(
          (call) =>
            call.path === '/api/access/current-actor' &&
            call.companyId === e.id,
        ),
      ).toBe(true),
    );
    expect(
      await screen.findByRole('button', { name: /BIC: Active Clients: 2\./ }),
    ).toBeVisible();
    expect(
      within(screen.getByRole('region', { name: a.displayName })).queryByRole(
        'button',
      ),
    ).not.toBeInTheDocument();
    await act(async () => {
      heldA.resolve(Response.json(actorFor(a.id)));
    });
    expect(
      await screen.findByRole('button', {
        name: /PRISMA-PRIM: Active Clients: 3\./,
      }),
    ).toBeVisible();
  });

  it('retries only a failed Company and preserves healthy sibling nodes with current narrower permissions', async () => {
    const api = server();
    api.overrides.set(
      `/api/operational-home:${b.id}`,
      () => new Response(null, { status: 503 }),
    );
    mount();
    await open();
    const healthy = await screen.findByRole('button', {
      name: /PRISMA-PRIM: Active Clients: 3\./,
    });
    const retry = await screen.findByRole('button', { name: 'Retry for BIC' });
    await screen.findByRole('button', {
      name: /Empty readable: Active Clients: 0\./,
    });
    const before = api.calls.length;
    api.state.actor = (companyId) =>
      companyId === b.id
        ? {
            ...actorFor(companyId),
            activeCompany: {
              id: b.id,
              displayName: b.displayName,
              clientPermissions: ['client.read'],
              clientPermissionAssignmentId: 'client-only',
              clientPermissionSetVersion: 'v1',
            },
          }
        : actorFor(companyId);
    api.overrides.set(`/api/operational-home:${b.id}`, () =>
      Response.json({
        companyId: b.id,
        today: '2026-09-28',
        summaries: [{ kind: 'active_clients', count: 2 }],
      }),
    );
    fireEvent.click(retry);
    expect(
      await screen.findByRole('button', { name: /BIC: Active Clients: 2\./ }),
    ).toBeVisible();
    expect(
      api.calls.slice(before).map((call) => [call.path, call.companyId]),
    ).toEqual([
      ['/api/access/current-actor', b.id],
      ['/api/operational-home', b.id],
    ]);
    expect(
      screen.getByRole('button', { name: /PRISMA-PRIM: Active Clients: 3\./ }),
    ).toBe(healthy);
    const rowB = screen.getByRole('region', { name: b.displayName });
    expect(within(rowB).queryByText('Open Projects')).not.toBeInTheDocument();
    expect(within(rowB).queryByText('Overdue Tasks')).not.toBeInTheDocument();
  });

  it.each([200, 401, 403])(
    'discards an old %s response after explicit refresh, including all session effects',
    async (status) => {
      const api = server();
      const old = deferred<Response>();
      api.overrides.set(`/api/operational-home:${a.id}`, () => old.promise);
      const view = mount();
      await open();
      await screen.findByRole('button', { name: /BIC: Active Clients: 2\./ });
      api.overrides.delete(`/api/operational-home:${a.id}`);
      fireEvent.click(
        screen.getByRole('button', { name: 'Refresh All Companies summaries' }),
      );
      const current = await screen.findByRole('button', {
        name: /PRISMA-PRIM: Active Clients: 3\./,
      });
      await screen.findByRole('button', {
        name: /Empty readable: Active Clients: 0\./,
      });
      await act(async () => {
        old.resolve(
          status === 200
            ? Response.json({
                companyId: a.id,
                today: '2026-09-26',
                summaries: [{ kind: 'active_clients', count: 777 }],
              })
            : new Response(null, { status }),
        );
      });
      expect(view.auth.rejectSession).not.toHaveBeenCalled();
      expect(
        screen.getByRole('button', {
          name: /PRISMA-PRIM: Active Clients: 3\./,
        }),
      ).toBe(current);
      expect(screen.queryByText('777')).not.toBeInTheDocument();
    },
  );

  it.each([
    { name: 'foreign Workspace', change: { workspaceId: 'other-workspace' } },
    { name: 'foreign identity', change: { internalUserId: 'other-user' } },
    {
      name: 'foreign Membership',
      change: { workspaceMembershipId: 'other-membership' },
    },
    {
      name: 'wrong Company',
      change: {
        activeCompany: { id: 'guessed-company', displayName: 'Hidden' },
      },
    },
    {
      name: 'unknown Task capture',
      change: {
        activeCompany: {
          ...actorFor(b.id).activeCompany,
          taskPermissionSetVersion: 'future',
        },
      },
    },
  ])('refuses $name before business reads', async ({ change }) => {
    const api = server();
    api.state.actor = (companyId) =>
      companyId === b.id
        ? { ...actorFor(companyId), ...change }
        : actorFor(companyId);
    mount();
    await open();
    expect(
      await screen.findByRole('button', { name: 'Retry for BIC' }),
    ).toBeVisible();
    expect(
      api.calls.some(
        (call) =>
          call.path === '/api/operational-home' && call.companyId === b.id,
      ),
    ).toBe(false);
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
    expect(
      await screen.findByRole('button', {
        name: /PRISMA-PRIM: Active Clients: 3\./,
      }),
    ).toBeVisible();
  });

  it('removes a currently denied Company and revalidates discovery without clearing a healthy sibling', async () => {
    const api = server();
    api.overrides.set(
      `/api/access/current-actor:${b.id}`,
      () => new Response(null, { status: 403 }),
    );
    mount();
    await open();
    const healthy = await screen.findByRole('button', {
      name: /PRISMA-PRIM: Active Clients: 3\./,
    });
    await waitFor(() =>
      expect(
        api.calls.filter((call) => call.path === '/api/companies'),
      ).toHaveLength(2),
    );
    expect(
      screen.queryByRole('heading', { name: b.displayName }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /PRISMA-PRIM: Active Clients: 3\./ }),
    ).toBe(healthy);
    expect(
      api.calls.some(
        (call) =>
          call.path === '/api/operational-home' && call.companyId === b.id,
      ),
    ).toBe(false);
  });

  it('rejects a current unauthorized response once and retires the whole view', async () => {
    const api = server();
    api.overrides.set(
      `/api/access/current-actor:${b.id}`,
      () => new Response(null, { status: 401 }),
    );
    const view = mount();
    await open();
    await waitFor(() =>
      expect(view.auth.rejectSession).toHaveBeenCalledTimes(1),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Summaries are not available with your current access.',
    );
    expect(screen.queryByText('Active Clients')).not.toBeInTheDocument();
  });

  it.each([401, 403, 200, 503])(
    'rechecks unscoped Workspace authority after discovery403 and preserves its owner (%s)',
    async (status) => {
      const api = server();
      api.overrides.set(
        '/api/companies:',
        () => new Response(null, { status: 403 }),
      );
      api.overrides.set('/api/access/current-actor:', () =>
        status === 200
          ? Response.json(actorFor(a.id))
          : new Response(null, { status }),
      );
      const view = mount();
      await open();
      await waitFor(() =>
        expect(api.calls.map((call) => [call.path, call.companyId])).toEqual([
          ['/api/companies', null],
          ['/api/access/current-actor', null],
        ]),
      );
      await screen.findByRole('alert');
      expect(view.auth.rejectSession).toHaveBeenCalledTimes(
        status === 401 ? 1 : 0,
      );
      expect(view.onWorkspaceAccessRejected).toHaveBeenCalledTimes(
        status === 403 ? 1 : 0,
      );
      expect(
        screen.queryByRole('heading', { name: a.displayName }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent(
        status === 503
          ? 'Companies could not be loaded.'
          : 'Summaries are not available with your current access.',
      );
    },
  );

  it.each([401, 403])(
    'ignores a held Workspace %s recheck after close/reopen',
    async (status) => {
      const api = server();
      const old = deferred<Response>();
      api.overrides.set(
        '/api/companies:',
        () => new Response(null, { status: 403 }),
      );
      api.overrides.set('/api/access/current-actor:', () => old.promise);
      const view = mount();
      await open();
      await waitFor(() =>
        expect(
          api.calls.some(
            (call) =>
              call.path === '/api/access/current-actor' &&
              call.companyId === null,
          ),
        ).toBe(true),
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'Close All Companies summaries' }),
      );
      expect(
        screen.getByRole('button', { name: 'All Companies summaries' }),
      ).toHaveFocus();
      api.overrides.delete('/api/companies:');
      api.overrides.delete('/api/access/current-actor:');
      await open();
      const healthy = await screen.findByRole('button', {
        name: /PRISMA-PRIM: Active Clients: 3\./,
      });
      await act(async () => {
        old.resolve(new Response(null, { status }));
      });
      expect(view.auth.rejectSession).not.toHaveBeenCalled();
      expect(view.onWorkspaceAccessRejected).not.toHaveBeenCalled();
      expect(
        screen.getByRole('button', {
          name: /PRISMA-PRIM: Active Clients: 3\./,
        }),
      ).toBe(healthy);
    },
  );

  it('requalifies a denied owning read and reloads only the remaining permitted summaries', async () => {
    const api = server();
    let qualifications = 0;
    let reads = 0;
    api.overrides.set(`/api/access/current-actor:${b.id}`, () => {
      qualifications += 1;
      return Response.json(
        qualifications === 1
          ? actorFor(b.id)
          : {
              ...actorFor(b.id),
              activeCompany: {
                id: b.id,
                displayName: b.displayName,
                clientPermissions: ['client.read'],
                clientPermissionAssignmentId: 'client-only',
                clientPermissionSetVersion: 'v1',
              },
            },
      );
    });
    api.overrides.set(`/api/operational-home:${b.id}`, () => {
      reads += 1;
      return reads === 1
        ? new Response(null, { status: 403 })
        : Response.json({
            companyId: b.id,
            today: '2026-09-28',
            summaries: [{ kind: 'active_clients', count: 2 }],
          });
    });
    const view = mount();
    await open();
    const row = await screen.findByRole('region', { name: b.displayName });
    expect(
      await within(row).findByRole('button', {
        name: /BIC: Active Clients: 2\./,
      }),
    ).toBeVisible();
    expect(within(row).queryByText('Open Projects')).not.toBeInTheDocument();
    expect(within(row).queryByText('Overdue Tasks')).not.toBeInTheDocument();
    expect(qualifications).toBe(2);
    expect(reads).toBe(2);
    expect(view.onWorkspaceAccessRejected).not.toHaveBeenCalled();
    expect(view.auth.rejectSession).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'duplicate Company', value: [a, a] },
    {
      name: 'foreign Workspace',
      value: [{ ...a, workspaceId: 'other-workspace' }],
    },
    { name: 'inactive Company', value: [{ ...a, status: 'inactive' }] },
    { name: 'malformed list', value: { companies: [a] } },
  ])(
    'refuses $name discovery before qualification or business reads',
    async ({ value }) => {
      const api = server();
      api.overrides.set('/api/companies:', () => Response.json(value));
      mount();
      await open();
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Companies could not be loaded.',
      );
      expect(api.calls).toEqual([
        { path: '/api/companies', companyId: null, method: 'GET' },
      ]);
      expect(
        screen.queryByRole('heading', { name: a.displayName }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText('No Company summaries are available.'),
      ).not.toBeInTheDocument();
    },
  );

  it('uses a neutral genuine no-available-summaries state when qualification proves no reads', async () => {
    const api = server();
    api.state.actor = (id) => ({
      ...actorFor(id),
      activeCompany: { id, displayName: 'Context only' },
    });
    mount();
    await open();
    expect(
      await screen.findByText('No Company summaries are available.'),
    ).toBeVisible();
    expect(
      api.calls.some((call) => call.path === '/api/operational-home'),
    ).toBe(false);
    expect(
      screen.queryByRole('heading', { name: a.displayName }),
    ).not.toBeInTheDocument();
  });

  it.each([
    {
      name: 'foreign Company',
      value: {
        companyId: 'foreign',
        today: '2026-09-28',
        summaries: [{ kind: 'active_clients', count: 777 }],
      },
    },
    {
      name: 'invalid date',
      value: {
        companyId: b.id,
        today: '2026-02-30',
        summaries: [{ kind: 'active_clients', count: 777 }],
      },
    },
    {
      name: 'negative count',
      value: {
        companyId: b.id,
        today: '2026-09-28',
        summaries: [{ kind: 'active_clients', count: -1 }],
      },
    },
    {
      name: 'duplicate summary',
      value: {
        companyId: b.id,
        today: '2026-09-28',
        summaries: [
          { kind: 'active_clients', count: 777 },
          { kind: 'active_clients', count: 777 },
        ],
      },
    },
  ])(
    'refuses $name Home replies without partial counts or damage to healthy siblings',
    async ({ value }) => {
      const api = server();
      api.overrides.set(`/api/operational-home:${b.id}`, () =>
        Response.json(value),
      );
      mount();
      await open();
      expect(
        await screen.findByRole('button', { name: 'Retry for BIC' }),
      ).toBeVisible();
      const row = screen.getByRole('region', { name: b.displayName });
      expect(within(row).queryByText('Active Clients')).not.toBeInTheDocument();
      expect(within(row).queryByText('777')).not.toBeInTheDocument();
      expect(
        await screen.findByRole('button', {
          name: /PRISMA-PRIM: Active Clients: 3\./,
        }),
      ).toBeVisible();
    },
  );

  it('retires a pending destination on Close without causing another read or reopening after completion', async () => {
    const api = server();
    const pending = deferred<'not-opened'>();
    const view = mount();
    view.onContinue.mockImplementation(() => pending.promise);
    await open();
    fireEvent.click(
      await screen.findByRole('button', { name: /BIC: Active Clients: 2\./ }),
    );
    await screen.findByRole('button', {
      name: /Empty readable: Active Clients: 0\./,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    const before = [...api.calls];
    fireEvent.click(
      screen.getByRole('button', { name: 'Close All Companies summaries' }),
    );
    expect(
      screen.getByRole('button', { name: 'All Companies summaries' }),
    ).toHaveFocus();
    await act(async () => {
      pending.resolve('not-opened');
    });
    expect(
      screen.queryByRole('region', { name: 'All Companies summaries' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.calls).toEqual(before);
  });

  it('recovers focus locally when current visibility retirement removes the staged destination', async () => {
    const api = server();
    const held = deferred<Response>();
    api.overrides.set(`/api/access/current-actor:${a.id}`, () => held.promise);
    mount();
    await open();
    fireEvent.click(
      await screen.findByRole('button', { name: /BIC: Active Clients: 2\./ }),
    );
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading')).toHaveFocus();
    api.state.companies = [a, c, e];
    await act(async () => {
      held.resolve(new Response(null, { status: 403 }));
    });
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole('heading', { name: 'All Companies summaries' }),
    ).toHaveFocus();
    expect(
      screen.queryByRole('heading', { name: b.displayName }),
    ).not.toBeInTheDocument();
  });

  it('fails closed when denial recovery receives malformed discovery instead of restoring the denied Company', async () => {
    const api = server();
    let discoveries = 0;
    api.overrides.set('/api/companies:', () => {
      discoveries += 1;
      return Response.json(
        discoveries === 1
          ? companies
          : [{ ...b, workspaceId: 'foreign-workspace' }],
      );
    });
    api.overrides.set(
      `/api/access/current-actor:${b.id}`,
      () => new Response(null, { status: 403 }),
    );
    mount();
    await open();
    expect(
      await screen.findByText('Companies could not be loaded.'),
    ).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: b.displayName }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry for BIC' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Active Clients')).not.toBeInTheDocument();
  });

  it('retires equal-permission assignment replacement and ignores its held unauthorized reply', async () => {
    const api = server();
    const held = deferred<Response>();
    api.overrides.set(`/api/operational-home:${a.id}`, () => held.promise);
    const original = actorFor(a.id);
    const view = mount(original);
    await open();
    await screen.findByRole('button', { name: /BIC: Active Clients: 2\./ });
    view.rerender(
      <MultiCompanySummary
        actor={{
          ...original,
          activeCompany: {
            ...original.activeCompany,
            id: a.id,
            displayName: a.displayName,
            clientPermissionAssignmentId: 'replacement-same-permissions',
          },
        }}
        identity={view.auth}
        onContinue={view.onContinue}
        onCancelNavigation={view.onCancelNavigation}
        onWorkspaceAccessRejected={view.onWorkspaceAccessRejected}
      />,
    );
    expect(
      screen.queryByRole('region', { name: 'All Companies summaries' }),
    ).not.toBeInTheDocument();
    await act(async () => {
      held.resolve(new Response(null, { status: 401 }));
    });
    expect(view.auth.rejectSession).not.toHaveBeenCalled();
  });

  it('retires the view immediately for a replaced browser identity even before Actor projection changes', async () => {
    server();
    const original = actorFor(a.id);
    const view = mount(original);
    await open();
    await screen.findByRole('button', { name: /BIC: Active Clients: 2\./ });
    view.rerender(
      <MultiCompanySummary
        actor={original}
        identity={identity()}
        onContinue={view.onContinue}
        onCancelNavigation={view.onCancelNavigation}
        onWorkspaceAccessRejected={view.onWorkspaceAccessRejected}
      />,
    );
    expect(
      screen.queryByRole('region', { name: 'All Companies summaries' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'All Companies summaries' }),
    ).toBeEnabled();
  });

  it('cancels staged navigation with Escape without I/O and restores the exact action focus', async () => {
    const api = server();
    const view = mount();
    await open();
    const action = await screen.findByRole('button', {
      name: /BIC: Active Clients: 2\./,
    });
    fireEvent.click(action);
    await screen.findByRole('button', {
      name: /Empty readable: Active Clients: 0\./,
    });
    const before = [...api.calls];
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(action).toHaveFocus();
    expect(api.calls).toEqual(before);
    expect(view.onContinue).not.toHaveBeenCalled();
  });

  it('preserves literal row nodes and staged intent during four-locale changes with no I/O', async () => {
    const api = server();
    const auth = identity();
    const onContinue = vi.fn(async () => 'not-opened' as const);
    render(
      <>
        <InterfaceLocaleSelect />
        <input
          aria-label="Independent draft"
          defaultValue="Held native input"
        />
        <MultiCompanySummary
          actor={actorFor(a.id)}
          identity={auth}
          onContinue={onContinue}
          onCancelNavigation={() => undefined}
          onWorkspaceAccessRejected={() => undefined}
        />
      </>,
    );
    await open();
    const row = await screen.findByRole('region', { name: b.displayName });
    fireEvent.click(
      await within(row).findByRole('button', {
        name: /BIC: Active Clients: 2\./,
      }),
    );
    await screen.findByRole('button', {
      name: /Empty readable: Active Clients: 0\./,
    });
    const before = [...api.calls];
    const locales = [
      ['ro', 'Rezumatele tuturor Companiilor', 'Continuați', 'Anulați'],
      ['ru', 'Сводки всех Компаний', 'Продолжить', 'Отмена'],
      ['fr', 'Résumés de toutes les Entreprises', 'Continuer', 'Annuler'],
      ['en', 'All Companies summaries', 'Continue', 'Cancel'],
    ];
    for (const values of locales) {
      const [locale, title, continueLabel, cancelLabel] = values;
      if (!locale || !title || !continueLabel || !cancelLabel)
        throw new Error('Invalid locale fixture');
      changeValue(screen.getByRole('combobox'), locale);
      expect(screen.getByRole('region', { name: title })).toBeVisible();
      expect(screen.getByRole('region', { name: b.displayName })).toBe(row);
      expect(screen.getByRole('button', { name: continueLabel })).toBeVisible();
      expect(screen.getByRole('button', { name: cancelLabel })).toBeVisible();
      expect(
        screen.getByRole('textbox', { name: 'Independent draft' }),
      ).toHaveValue('Held native input');
      expect(api.calls).toEqual(before);
    }
  });
});
