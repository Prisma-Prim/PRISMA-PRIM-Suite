import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import { changeValue } from './test/select-option';
import {
  company,
  currentActor,
  currentOverview,
  id,
  project,
} from './mission-plan/current-work.fixture';
import {
  CurrentWorkLocaleProbe,
  deferred,
  installCurrentWorkApp,
  openCurrentWork,
  resetCurrentWorkApp,
  restoreCurrentWorkApp,
} from './mission-plan/current-work-app.test-support';
import { defaultTeamTaskFilters } from './project/team-tasks-response';
beforeEach(resetCurrentWorkApp);
afterEach(restoreCurrentWorkApp);
function navigate(name: string) {
  fireEvent.click(
    within(
      screen.getByRole('navigation', { name: 'Primary navigation' }),
    ).getByRole('link', { name }),
  );
}
function install() {
  const native = installCurrentWorkApp(),
    original = fetch;
  const state: {
    status: number;
    hold: ReturnType<typeof deferred> | null;
    reads: number;
    projectHold: ReturnType<typeof deferred> | null;
    projectPosts: { body: string; key: string | null }[];
    projectStatus: number;
  } = {
    status: 200,
    hold: null,
    reads: 0,
    projectHold: null,
    projectPosts: [],
    projectStatus: 503,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = new URL(String(input), window.location.origin);
      if (url.pathname === '/api/team-tasks') {
        state.reads++;
        if (state.hold) return state.hold.promise;
        const offset = Number(url.searchParams.get('offset'));
        return Response.json(
          {
            companyId: company.id,
            offset,
            pageSize: 25,
            hasNextPage: offset === 0,
            appliedFilters: defaultTeamTaskFilters,
            tasks: currentOverview()
              .overview.activities.slice(offset, offset + 25)
              .map((row) => ({
                ...row.task,
                project: {
                  id: project.id,
                  title: project.title,
                  clientDisplayName: project.clientDisplayName,
                },
              })),
          },
          { status: state.status },
        );
      }
      if (url.pathname === '/api/projects' && init.method === 'POST') {
        state.projectPosts.push({
          body: String(init.body),
          key: new Headers(init.headers).get('idempotency-key'),
        });
        return state.projectHold
          ? state.projectHold.promise
          : Response.json(
              state.projectStatus === 201
                ? {
                    ...project,
                    id: id(90),
                    title: 'Protected native Project literal',
                  }
                : {},
              { status: state.projectStatus },
            );
      }
      return original(input, init);
    }),
  );
  return { native, state };
}
async function team() {
  await screen.findByRole('navigation', { name: 'Primary navigation' });
  navigate('Team Tasks');
  const region = await screen.findByRole('region', { name: 'Team Tasks' });
  await within(region).findByRole('heading', { name: 'Current Task 1' });
  return region;
}
async function grant(bundle: string) {
  const access = await screen.findByRole('region', { name: 'Company access' });
  changeValue(within(access).getByLabelText('Workspace member'), id(9));
  changeValue(
    within(access).getByLabelText('Company', { exact: true }),
    company.id,
  );
  changeValue(within(access).getByLabelText('Access bundle'), bundle);
  fireEvent.click(within(access).getByRole('button', { name: 'Grant access' }));
  await waitFor(() =>
    expect(
      within(access).getByRole('button', { name: 'Grant access' }),
    ).toBeEnabled(),
  );
}
it.each(['pending', 'uncertain', 'confirmed'] as const)(
  'keeps connected native Task %s intent through workboard Apply/read failure and fresh return',
  async (mode) => {
    const { native, state } = install();
    render(
      <>
        <div role="group" aria-label="Locale test controls">
          <CurrentWorkLocaleProbe />
        </div>
        <App identity={deterministicBrowserIdentity()} />
      </>,
    );
    const localeControls = screen.getByRole('group', {
      name: 'Locale test controls',
    });
    await openCurrentWork();
    const tasks = await screen.findByRole('region', {
      name: 'Tasks',
    });
    const title = await within(tasks).findByLabelText('Task title');
    const form = title.closest('form');
    if (!form)
      throw new Error('The native Task form must contain its title field.');
    changeValue(title, 'Protected native Task exact Ж / é');
    const instructions = within(form).getByLabelText(
      'Task instructions (optional)',
    );
    changeValue(
      instructions,
      'Protected native instructions Ж / é / 😀\n  exact intent',
    );
    if (mode === 'pending') native.taskHold = deferred();
    if (mode === 'confirmed') native.taskStatus = 201;
    fireEvent.click(within(form).getByRole('button', { name: 'Create Task' }));
    await waitFor(() => expect(native.posts).toHaveLength(1));
    const panel = await team();
    state.status = 503;
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Apply criteria' }),
    );
    await within(panel).findByRole('alert');
    for (const locale of ['ro', 'ru', 'fr', 'en'])
      fireEvent.click(
        within(localeControls).getByRole('button', {
          name: 'Change to ' + locale,
        }),
      );
    if (mode !== 'confirmed') expect(title).toBeInTheDocument();
    expect(native.posts).toHaveLength(1);
    expect(JSON.parse(native.posts[0]?.body ?? '{}')).toMatchObject({
      description: 'Protected native instructions Ж / é / 😀\n  exact intent',
    });
    navigate('Projects');
    if (mode === 'confirmed') {
      expect(screen.getByText('Task change recorded.')).toBeInTheDocument();
      return;
    }
    expect(title).toHaveValue('Protected native Task exact Ж / é');
    expect(instructions).toHaveValue(
      'Protected native instructions Ж / é / 😀\n  exact intent',
    );
    if (native.taskHold) {
      await act(async () =>
        native.taskHold?.resolve(Response.json({}, { status: 503 })),
      );
      native.taskHold = undefined;
    }
    fireEvent.click(
      await within(tasks).findByRole('button', {
        name: 'Retry pending Task change',
      }),
    );
    await waitFor(() => expect(native.posts).toHaveLength(2));
    expect(native.posts[1]).toEqual(native.posts[0]);
  },
);
it.each(['pending', 'uncertain', 'confirmed'] as const)(
  'keeps connected native result %s target/version/body/key and confirmed outcome through workboard failure',
  async (mode) => {
    const { native, state } = install();
    render(<App identity={deterministicBrowserIdentity()} />);
    const current = await openCurrentWork();
    fireEvent.click(
      await within(current).findByRole('button', { name: 'Next activities' }),
    );
    fireEvent.click(
      within(current).getByRole('button', {
        name: 'Open current Task: Current Task 26',
      }),
    );
    const results = await screen.findByRole('region', {
        name: 'Declared Task result',
      }),
      draft = await within(results).findByLabelText('Result declaration');
    changeValue(draft, 'Protected exact result Ж / é');
    changeValue(
      within(results).getByRole('combobox', { name: 'Frozen mission Version' }),
      id(525),
    );
    if (mode === 'pending') native.resultHold = deferred();
    if (mode === 'confirmed') native.resultStatus = 201;
    fireEvent.click(
      within(results).getByRole('button', { name: 'Record result' }),
    );
    await waitFor(() => expect(native.resultPosts).toHaveLength(1));
    const panel = await team();
    state.status = 503;
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Refresh Team Tasks' }),
    );
    await within(panel).findByRole('alert');
    expect(draft).toBeInTheDocument();
    expect(native.resultPosts).toHaveLength(1);
    navigate('Projects');
    if (mode === 'confirmed') {
      expect(
        within(results).getByText('Result confirmed.'),
      ).toBeInTheDocument();
      return;
    }
    expect(draft).toHaveValue('Protected exact result Ж / é');
    if (native.resultHold) {
      await act(async () =>
        native.resultHold?.resolve(Response.json({}, { status: 503 })),
      );
      native.resultHold = undefined;
    }
    fireEvent.click(
      await within(results).findByRole('button', {
        name: 'Retry exact result command',
      }),
    );
    await waitFor(() => expect(native.resultPosts).toHaveLength(2));
    expect(native.resultPosts[1]).toEqual(native.resultPosts[0]);
  },
);
const recoveries = [
  'document-registrar',
  'document-content-reader',
  'task-result-recorder',
  'mission-result-reviewer',
  'mission-plan-user',
] as const;
it.each(
  recoveries.flatMap((bundle) =>
    ['company', 'workspace'].flatMap((phase) =>
      [200, 403].map((status) => ({ bundle, phase, status })),
    ),
  ),
)(
  'retires whole Actor $phase recovery$status across actual administrative $bundle revalidation with no stale shared effect',
  async ({ bundle, phase, status }) => {
    const { native, state } = install();
    render(<App identity={deterministicBrowserIdentity()} />);
    await openCurrentWork();
    const title = await screen.findByLabelText('Task title');
    changeValue(title, 'Connected native work during recovery');
    const instructions = screen.getByLabelText('Task instructions (optional)');
    changeValue(
      instructions,
      'Independent instructions during full Actor recovery\n  Ș / Я / 😀',
    );
    const panel = await team();
    const draft = within(panel).getByRole('combobox', { name: 'Task state' });
    const selected = deferred(),
      workspace = deferred();
    native.actorHoldCompany = selected;
    if (phase === 'workspace') native.actorHoldWorkspace = workspace;
    state.status = 403;
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Refresh Team Tasks' }),
    );
    await waitFor(() => expect(native.heldActorReads).toContain('company'));
    if (phase === 'workspace') {
      await act(async () =>
        selected.resolve(Response.json({}, { status: 403 })),
      );
      await waitFor(() => expect(native.heldActorReads).toContain('workspace'));
    }
    if (bundle === 'document-registrar') native.metadataId = id(90);
    if (bundle === 'document-content-reader') native.readerId = id(90);
    if (bundle === 'task-result-recorder') native.recorderId = id(90);
    if (bundle === 'mission-result-reviewer') native.reviewerId = id(90);
    if (bundle === 'mission-plan-user') native.planId = id(90);
    await grant(bundle);
    expect(draft).toBeInTheDocument();
    expect(title).toBeInTheDocument();
    expect(title).toHaveValue('Connected native work during recovery');
    expect(instructions).toBeInTheDocument();
    expect(instructions).toHaveValue(
      'Independent instructions during full Actor recovery\n  Ș / Я / 😀',
    );
    const before = {
      reads: state.reads,
      actors: native.actorReads,
      activity: native.activityReads,
    };
    const obsolete = currentActor();
    obsolete.displayName = 'Retired team recovery Actor';
    if (phase === 'workspace') delete obsolete.activeCompany;
    await act(async () => {
      (phase === 'company' ? selected : workspace).resolve(
        Response.json(status === 200 ? obsolete : {}, { status }),
      );
    });
    expect({
      reads: state.reads,
      actors: native.actorReads,
      activity: native.activityReads,
    }).toEqual(before);
    expect(screen.queryByText('Retired team recovery Actor')).toBeNull();
    expect(title).toBeInTheDocument();
    expect(draft).toBeInTheDocument();
    expect(instructions).toBeInTheDocument();
    expect(instructions).toHaveValue(
      'Independent instructions during full Actor recovery\n  Ș / Я / 😀',
    );
  },
);
it.each(['task', 'project', 'client'] as const)(
  'permanently retires held200/403 across consumed %s revoke/regrant with equal captures',
  async (kind) => {
    for (const status of [200, 403]) {
      const { native, state } = install();
      const mounted = render(<App identity={deterministicBrowserIdentity()} />);
      const panel = await team();
      state.hold = deferred();
      const held = state.hold;
      fireEvent.click(
        within(panel).getByRole('button', { name: 'Refresh Team Tasks' }),
      );
      await waitFor(() => expect(state.reads).toBe(2));
      state.hold = null;
      if (kind === 'task') native.taskRead = false;
      if (kind === 'project') native.projectRead = false;
      if (kind === 'client') native.clientRead = false;
      await grant(
        kind === 'task'
          ? 'task-manager'
          : kind === 'project'
            ? 'project'
            : 'director-client',
      );
      expect(panel).not.toBeInTheDocument();
      native.taskRead = true;
      native.projectRead = true;
      native.clientRead = true;
      await grant(
        kind === 'task'
          ? 'task-manager'
          : kind === 'project'
            ? 'project'
            : 'director-client',
      );
      navigate('Team Tasks');
      const fresh = await screen.findByRole('region', { name: 'Team Tasks' });
      await within(fresh).findByRole('heading', { name: 'Current Task 1' });
      const before = {
        reads: state.reads,
        actors: native.actorReads,
        activity: native.activityReads,
      };
      await act(async () =>
        held.resolve(
          Response.json(
            { companyId: company.id, tasks: [{ title: 'Retired content' }] },
            { status },
          ),
        ),
      );
      expect({
        reads: state.reads,
        actors: native.actorReads,
        activity: native.activityReads,
      }).toEqual(before);
      expect(screen.queryByText('Retired content')).toBeNull();
      mounted.unmount();
      localStorage.clear();
      sessionStorage.clear();
      window.history.replaceState(null, '', '/?frame=classic#projects');
    }
  },
);

it('does not start recovery for an old403 after an unconsumed full Actor snapshot changed during its read', async () => {
  const { native, state } = install();
  render(<App identity={deterministicBrowserIdentity()} />);
  const panel = await team();
  state.hold = deferred();
  const held = state.hold;
  fireEvent.click(
    within(panel).getByRole('button', { name: 'Refresh Team Tasks' }),
  );
  await waitFor(() => expect(state.reads).toBe(2));
  state.hold = null;
  native.readerId = id(90);
  await grant('document-content-reader');
  const before = { actors: native.actorReads, activity: native.activityReads };
  await act(async () => held.resolve(Response.json({}, { status: 403 })));
  await within(panel).findByRole('alert');
  expect({ actors: native.actorReads, activity: native.activityReads }).toEqual(
    before,
  );
});

it.each(['pending', 'uncertain', 'confirmed'] as const)(
  'preserves connected native Project %s observation/body/key/outcome across workboard filters and failure',
  async (mode) => {
    const { state } = install();
    render(<App identity={deterministicBrowserIdentity()} />);
    const projects = await screen.findByRole('region', { name: 'Projects' });
    const title = await within(projects).findByLabelText('Project title');
    changeValue(title, 'Protected native Project literal');
    changeValue(
      within(projects).getByRole('combobox', { name: 'Client' }),
      project.clientAccountId,
    );
    if (mode === 'pending') state.projectHold = deferred();
    if (mode === 'confirmed') state.projectStatus = 201;
    fireEvent.click(
      within(projects).getByRole('button', { name: 'Create Project' }),
    );
    await waitFor(() => expect(state.projectPosts).toHaveLength(1));
    const panel = await team();
    state.status = 503;
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Apply criteria' }),
    );
    await within(panel).findByRole('alert');
    expect(state.projectPosts).toHaveLength(1);
    if (mode === 'confirmed') {
      expect(
        await within(projects).findByRole('heading', {
          name: 'Protected native Project literal',
        }),
      ).toBeInTheDocument();
      return;
    }
    expect(title).toBeInTheDocument();
    expect(title).toHaveValue('Protected native Project literal');
    if (state.projectHold) {
      await act(async () =>
        state.projectHold?.resolve(Response.json({}, { status: 503 })),
      );
      state.projectHold = null;
    }
    navigate('Projects');
    fireEvent.click(
      await within(projects).findByRole('button', { name: 'Create Project' }),
    );
    await waitFor(() => expect(state.projectPosts).toHaveLength(2));
    expect(state.projectPosts[1]).toEqual(state.projectPosts[0]);
  },
);
it.each([200, 403])(
  'retires held late%s through actual Company A→B→A and equal-Actor browser identity replacement',
  async (status) => {
    const { state, native } = install();
    const identity = deterministicBrowserIdentity();
    const mounted = render(<App identity={identity} />);
    const panel = await team();
    state.hold = deferred();
    const held = state.hold;
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Refresh Team Tasks' }),
    );
    await waitFor(() => expect(state.reads).toBe(2));
    state.hold = null;
    changeValue(
      screen.getByRole('combobox', { name: 'Active Company' }),
      id(2),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Active Company' }),
      ).toHaveAttribute('data-value', id(2)),
    );
    changeValue(
      screen.getByRole('combobox', { name: 'Active Company' }),
      company.id,
    );
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Active Company' }),
      ).toHaveAttribute('data-value', company.id),
    );
    mounted.rerender(<App identity={deterministicBrowserIdentity()} />);
    await screen.findByRole('region', { name: 'Team Tasks' });
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Active Company' }),
      ).toHaveAttribute('data-value', company.id),
    );
    const before = {
      reads: state.reads,
      actors: native.actorReads,
      activity: native.activityReads,
    };
    await act(async () =>
      held.resolve(
        Response.json(
          { tasks: [{ title: 'Retired Company/identity work' }] },
          { status },
        ),
      ),
    );
    expect({
      reads: state.reads,
      actors: native.actorReads,
      activity: native.activityReads,
    }).toEqual(before);
    expect(screen.queryByText('Retired Company/identity work')).toBeNull();
    expect(panel).not.toBeInTheDocument();
  },
);
it('retires held recovery when a newer deliberate workboard read succeeds under unchanged authority', async () => {
  const { native, state } = install();
  render(<App identity={deterministicBrowserIdentity()} />);
  const panel = await team();
  const held = deferred();
  native.actorHoldCompany = held;
  state.status = 403;
  fireEvent.click(
    within(panel).getByRole('button', { name: 'Refresh Team Tasks' }),
  );
  await waitFor(() => expect(native.heldActorReads).toContain('company'));
  state.status = 200;
  fireEvent.click(
    within(panel).getByRole('button', { name: 'Refresh Team Tasks' }),
  );
  await within(panel).findByRole('heading', { name: 'Current Task 1' });
  const before = { actors: native.actorReads, activity: native.activityReads };
  await act(async () => held.resolve(Response.json(currentActor())));
  expect({ actors: native.actorReads, activity: native.activityReads }).toEqual(
    before,
  );
});

it('loads and opens team work under the actual StrictMode root, then permanently retires a later consumed owner', async () => {
  const { native, state } = install();
  const mounted = render(<App identity={deterministicBrowserIdentity()} />, {
    reactStrictMode: true,
  });
  const panel = await team();
  fireEvent.click(
    within(panel).getByRole('button', { name: /^Open Current Task 1 in / }),
  );
  const projects = await screen.findByRole('region', { name: 'Projects' });
  await within(projects).findByDisplayValue('Current Task 1');
  await within(projects).findByRole('region', { name: 'Task history' });
  navigate('Team Tasks');
  await within(panel).findByRole('heading', { name: 'Current Task 1' });
  state.hold = deferred();
  const held = state.hold;
  const reads = state.reads;
  fireEvent.click(
    within(panel).getByRole('button', { name: 'Refresh Team Tasks' }),
  );
  await waitFor(() => expect(state.reads).toBe(reads + 1));
  state.hold = null;
  native.taskRead = false;
  await grant('task-manager');
  expect(panel).not.toBeInTheDocument();
  native.taskRead = true;
  await grant('task-manager');
  navigate('Team Tasks');
  const fresh = await screen.findByRole('region', { name: 'Team Tasks' });
  await within(fresh).findByRole('heading', { name: 'Current Task 1' });
  const before = {
    reads: state.reads,
    actors: native.actorReads,
    activity: native.activityReads,
  };
  await act(async () =>
    held.resolve(
      Response.json({
        companyId: company.id,
        offset: 0,
        pageSize: 25,
        hasNextPage: false,
        appliedFilters: defaultTeamTaskFilters,
        tasks: [{ title: 'Retired StrictMode content' }],
      }),
    ),
  );
  expect(screen.queryByText('Retired StrictMode content')).toBeNull();
  expect({
    reads: state.reads,
    actors: native.actorReads,
    activity: native.activityReads,
  }).toEqual(before);
  expect(within(fresh).queryByRole('alert')).toBeNull();
  mounted.unmount();
});

it.each(
  ['task', 'project', 'client'].flatMap((kind) =>
    [200, 403].map((status) => ({ kind, status })),
  ),
)(
  'permanently retires a cold native Task read with late$status after actual $kind revoke/regrant under root StrictMode',
  async ({ kind, status }) => {
    const { native } = install();
    const transport = fetch;
    const held = deferred();
    let taskReads = 0;
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
        const path = new URL(String(input), window.location.origin).pathname;
        if (path === `/api/tasks/${id(200)}`) {
          taskReads++;
          signal = init.signal ?? undefined;
          return held.promise;
        }
        return transport(input, init);
      }),
    );
    render(<App identity={deterministicBrowserIdentity()} />, {
      reactStrictMode: true,
    });
    const panel = await team();
    fireEvent.click(
      within(panel).getByRole('button', { name: /^Open Current Task 1 in / }),
    );
    await waitFor(() => expect(taskReads).toBe(1));
    if (kind === 'task') native.taskRead = false;
    if (kind === 'project') native.projectRead = false;
    if (kind === 'client') native.clientRead = false;
    const bundle =
      kind === 'task'
        ? 'task-manager'
        : kind === 'project'
          ? 'project'
          : 'director-client';
    await grant(bundle);
    expect(signal?.aborted).toBe(true);
    native.taskRead = true;
    native.projectRead = true;
    native.clientRead = true;
    await grant(bundle);
    navigate('Projects');
    const projects = await screen.findByRole('region', { name: 'Projects' });
    const target = currentOverview().overview.activities[0];
    if (!target) throw new Error('Missing first Task fixture');
    await act(async () =>
      held.resolve(
        Response.json(
          status === 200 ? { mutable: true, task: target.task } : {},
          { status },
        ),
      ),
    );
    expect(taskReads).toBe(1);
    expect(
      within(projects).queryByRole('heading', { name: 'Current Task 1' }),
    ).toBeNull();
    expect(within(projects).queryByDisplayValue('Current Task 1')).toBeNull();
    expect(native.posts).toEqual([]);
    expect(native.resultPosts).toEqual([]);
  },
);

it('suppresses the held App focus frame after a team Open loses only consumed Task authority', async () => {
  const { native } = install();
  render(<App identity={deterministicBrowserIdentity()} />);
  const panel = await team();
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  const nativeScrollIntoView = Element.prototype.scrollIntoView;
  const scroll = vi.fn();
  Element.prototype.scrollIntoView = scroll;
  try {
    fireEvent.click(
      within(panel).getByRole('button', { name: /^Open Current Task 1 in / }),
    );
    const projects = await screen.findByRole('region', { name: 'Projects' });
    await within(projects).findByDisplayValue('Current Task 1');
    expect(frames.length).toBeGreaterThan(0);
    native.taskRead = false;
    await grant('task-manager');
    expect(panel).not.toBeInTheDocument();
    expect(projects).toBeInTheDocument();
    expect(window.location.hash).toBe('#projects');
    const independent = screen.getByRole('combobox', {
      name: 'Active Company',
    });
    independent.focus();
    expect(independent).toHaveFocus();
    scroll.mockClear();
    await act(async () => {
      for (const frame of frames.splice(0)) frame(performance.now());
    });
    expect(independent).toHaveFocus();
    expect(scroll).not.toHaveBeenCalled();
  } finally {
    Element.prototype.scrollIntoView = nativeScrollIntoView;
  }
});
