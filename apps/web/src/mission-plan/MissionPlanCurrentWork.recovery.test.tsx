import { StrictMode } from 'react';
import { flushSync } from 'react-dom';
import { afterEach, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import { deterministicBrowserIdentity } from '../access-composition';
import { MissionPlanCurrentWork } from './MissionPlanCurrentWork';
import {
  currentActor,
  currentOverview,
  id,
  project,
} from './current-work.fixture';
import { CurrentWorkLocaleProbe } from './current-work-app.test-support';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function held() {
  let resolve: (response: Response) => void = () => {
    throw new Error('Missing held response.');
  };
  const promise = new Promise<Response>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function network() {
  const state: {
    readStatus: number;
    selectedStatus: number;
    workspaceStatus: number;
    selected: ReturnType<typeof held> | undefined;
    workspace: ReturnType<typeof held> | undefined;
  } = {
    readStatus: 200,
    selectedStatus: 200,
    workspaceStatus: 200,
    selected: undefined,
    workspace: undefined,
  };
  const reads: AbortSignal[] = [];
  const recoveries: { phase: 'selected' | 'workspace'; signal: AbortSignal }[] =
    [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.signal) throw new Error('Missing request signal.');
      const path = new URL(String(input), window.location.origin).pathname;
      if (path.endsWith('/mission-plan/current-work')) {
        reads.push(init.signal);
        return state.readStatus === 200
          ? Response.json(currentOverview())
          : new Response(null, { status: state.readStatus });
      }
      if (path.endsWith('/access/current-actor')) {
        const phase = new Headers(init.headers).has('x-company-context-id')
          ? 'selected'
          : 'workspace';
        recoveries.push({ phase, signal: init.signal });
        const pending = state[phase];
        state[phase] = undefined;
        if (pending) return pending.promise; // Deliberately ignores abort.
        const status = state[`${phase}Status`];
        const actor = currentActor();
        if (phase === 'workspace') delete actor.activeCompany;
        return status === 200
          ? Response.json(actor)
          : new Response(null, { status });
      }
      throw new Error(`Unexpected recovery request: ${path}`);
    }),
  );
  return { state, reads, recoveries };
}

const phases = ['selected', 'workspace'] as const;
const changes = ['result', 'actor', 'identity', 'company', 'unmount'] as const;
it.each(
  phases.flatMap((phase) =>
    changes.flatMap((change) =>
      [200, 403].map((status) => ({ phase, change, status })),
    ),
  ),
)(
  'retires held $phase recovery$status through $change and permits a subsequent live recovery',
  async ({ phase, change, status }) => {
    const io = network();
    const actor = currentActor();
    const identity = deterministicBrowserIdentity();
    const onActorRevalidated = vi.fn();
    const onCompanyContextRejected = vi.fn();
    const onWorkspaceAccessRejected = vi.fn();
    const onOpenTask = vi.fn();
    const props = {
      actor,
      identity,
      projectId: project.id,
      clientAccountId: project.clientAccountId,
      onActorRevalidated,
      onCompanyContextRejected,
      onWorkspaceAccessRejected,
      onOpenTask,
    };
    const view = render(<MissionPlanCurrentWork {...props} />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Next activities' }),
    );
    expect(screen.getByText('Current declaration 26 Ж / é')).toBeVisible();
    const pending = held();
    io.state[phase] = pending;
    if (phase === 'workspace') io.state.selectedStatus = 403;
    io.state.readStatus = 403;
    fireEvent.click(
      screen.getByRole('button', { name: 'Refresh current work' }),
    );
    await waitFor(() => expect(io.recoveries.at(-1)?.phase).toBe(phase));
    const recovery = io.recoveries.at(-1);
    if (!recovery) throw new Error('Missing recovery.');
    expect(recovery.signal.aborted).toBe(false);
    expect(io.reads).not.toContain(recovery.signal);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Mission-plan access is no longer available.',
    );
    expect(screen.queryByRole('button')).toBeNull();

    io.state.readStatus = 200;
    io.state.selectedStatus = 200;
    const next = currentActor(change === 'company' ? id(2) : undefined);
    if (!next.activeCompany) throw new Error('Missing synthetic Company.');
    if (change === 'result')
      next.activeCompany.documentContentReaderAssignmentId = id(90);
    if (change === 'unmount') view.unmount();
    else {
      view.rerender(
        <MissionPlanCurrentWork
          {...props}
          actor={next}
          identity={
            change === 'identity' ? deterministicBrowserIdentity() : identity
          }
        />,
      );
      expect(recovery.signal.aborted).toBe(true);
      if (change === 'actor') {
        // Equal feature authority retires recovery, but never reopens denial.
        expect(screen.getByRole('alert')).toHaveTextContent(
          'Mission-plan access is no longer available.',
        );
      } else view.rerender(<MissionPlanCurrentWork {...props} />);
    }
    expect(recovery.signal.aborted).toBe(true);
    if (change !== 'actor' && change !== 'unmount')
      await screen.findByText('Current declaration 1 Ж / é');
    screen.queryByRole('button', { name: 'Refresh current work' })?.focus();
    const focused = document.activeElement;
    const before = { reads: io.reads.length, recovery: io.recoveries.length };
    const stale = currentActor();
    stale.displayName = 'Retired complete Actor';
    if (phase === 'workspace') delete stale.activeCompany;
    await act(async () =>
      pending.resolve(
        status === 200 ? Response.json(stale) : new Response(null, { status }),
      ),
    );
    expect(io.reads).toHaveLength(before.reads);
    expect(io.recoveries).toHaveLength(before.recovery);
    expect(onActorRevalidated).not.toHaveBeenCalled();
    expect(onCompanyContextRejected).not.toHaveBeenCalled();
    expect(onWorkspaceAccessRejected).not.toHaveBeenCalled();
    expect(onOpenTask).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(focused);

    if (change === 'unmount') render(<MissionPlanCurrentWork {...props} />);
    if (change === 'actor') {
      const restored = currentActor();
      if (!restored.activeCompany)
        throw new Error('Missing synthetic Company.');
      restored.activeCompany.documentContentReaderAssignmentId = id(91);
      view.rerender(<MissionPlanCurrentWork {...props} actor={restored} />);
    }
    // A genuine whole403 already removed the old page. The reopened child is fresh.
    await screen.findByText('Current declaration 1 Ж / é');
    expect(screen.queryByText('Current declaration 26 Ж / é')).toBeNull();
    io.state.readStatus = 403;
    fireEvent.click(
      screen.getByRole('button', { name: 'Refresh current work' }),
    );
    await waitFor(() =>
      expect(onActorRevalidated).toHaveBeenCalledExactlyOnceWith(
        currentActor(),
      ),
    );
  },
);

it('keeps a ready later page and exact Task continuation through optional-result A→B→A', async () => {
  const io = network();
  const actor = currentActor();
  const props = {
    actor,
    identity: deterministicBrowserIdentity(),
    projectId: project.id,
    clientAccountId: project.clientAccountId,
    onOpenTask: vi.fn(),
  };
  const view = render(<MissionPlanCurrentWork {...props} />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Next activities' }),
  );
  const button = screen.getByRole('button', {
    name: 'Open current Task: Current Task 26',
  });
  const next = currentActor();
  if (!next.activeCompany) throw new Error('Missing synthetic Company.');
  next.activeCompany.documentContentReaderAssignmentId = id(90);
  view.rerender(<MissionPlanCurrentWork {...props} actor={next} />);
  view.rerender(<MissionPlanCurrentWork {...props} />);
  await screen.findByText('Current declaration 26 Ж / é');
  expect(screen.getByText('Activities 26–26 of 26')).toBeVisible();
  expect(button).toBeInTheDocument();
  fireEvent.click(button);
  expect(props.onOpenTask).toHaveBeenCalledExactlyOnceWith(id(225));
  fireEvent.click(
    screen.getByRole('button', { name: 'Return to fresh current work' }),
  );
  await screen.findByText('Current declaration 26 Ж / é');
  await waitFor(() =>
    expect(
      screen.getByRole('button', {
        name: 'Open current Task: Current Task 26',
      }),
    ).toHaveFocus(),
  );
  expect(io.recoveries).toHaveLength(0);
});

it.each(['selected', 'workspace', 'workspace-denied'] as const)(
  'keeps live %s recovery usable after StrictMode setup and cleanup',
  async (outcome) => {
    const io = network();
    const onActorRevalidated = vi.fn();
    const onCompanyContextRejected = vi.fn();
    const onWorkspaceAccessRejected = vi.fn();
    render(
      <StrictMode>
        <MissionPlanCurrentWork
          actor={currentActor()}
          identity={deterministicBrowserIdentity()}
          projectId={project.id}
          clientAccountId={project.clientAccountId}
          onOpenTask={vi.fn()}
          onActorRevalidated={onActorRevalidated}
          onCompanyContextRejected={onCompanyContextRejected}
          onWorkspaceAccessRejected={onWorkspaceAccessRejected}
        />
      </StrictMode>,
    );
    await screen.findByText('Current declaration 1 Ж / é');
    io.state.readStatus = 403;
    if (outcome !== 'selected') io.state.selectedStatus = 403;
    if (outcome === 'workspace-denied') io.state.workspaceStatus = 403;
    fireEvent.click(
      screen.getByRole('button', { name: 'Refresh current work' }),
    );
    if (outcome === 'workspace-denied') {
      await waitFor(() =>
        expect(onWorkspaceAccessRejected).toHaveBeenCalledTimes(1),
      );
      expect(onActorRevalidated).not.toHaveBeenCalled();
      expect(onCompanyContextRejected).not.toHaveBeenCalled();
    } else {
      const expected = currentActor();
      if (outcome === 'workspace') delete expected.activeCompany;
      await waitFor(() =>
        expect(onActorRevalidated).toHaveBeenCalledExactlyOnceWith(expected),
      );
      if (outcome === 'workspace')
        expect(onCompanyContextRejected).toHaveBeenCalledExactlyOnceWith(id(1));
      else expect(onCompanyContextRejected).not.toHaveBeenCalled();
      expect(onWorkspaceAccessRejected).not.toHaveBeenCalled();
    }
    expect(io.recoveries.map((request) => request.phase)).toEqual(
      outcome === 'selected' ? ['selected'] : ['selected', 'workspace'],
    );
  },
);

it.each(['selected', 'workspace', 'workspace-denied'] as const)(
  'uses the latest %s callbacks across locale changes without new I/O',
  async (outcome) => {
    const io = network();
    const old = {
      onActorRevalidated: vi.fn(),
      onCompanyContextRejected: vi.fn(),
      onWorkspaceAccessRejected: vi.fn(),
    };
    const latest = {
      onActorRevalidated: vi.fn(),
      onCompanyContextRejected: vi.fn(),
      onWorkspaceAccessRejected: vi.fn(),
    };
    const props = {
      actor: currentActor(),
      identity: deterministicBrowserIdentity(),
      projectId: project.id,
      clientAccountId: project.clientAccountId,
      onOpenTask: vi.fn(),
    };
    const view = render(
      <>
        <CurrentWorkLocaleProbe />
        <MissionPlanCurrentWork {...props} {...old} />
      </>,
    );
    await screen.findByText('Current declaration 1 Ж / é');
    const phase = outcome === 'selected' ? 'selected' : 'workspace';
    const pending = held();
    io.state[phase] = pending;
    io.state.readStatus = 403;
    if (phase === 'workspace') io.state.selectedStatus = 403;
    fireEvent.click(
      screen.getByRole('button', { name: 'Refresh current work' }),
    );
    await waitFor(() => expect(io.recoveries.at(-1)?.phase).toBe(phase));
    const before = { reads: io.reads.length, recoveries: io.recoveries.length };
    view.rerender(
      <>
        <CurrentWorkLocaleProbe />
        <MissionPlanCurrentWork {...props} {...latest} />
      </>,
    );
    for (const locale of ['ro', 'ru', 'fr', 'en'])
      fireEvent.click(
        screen.getByRole('button', { name: `Change to ${locale}` }),
      );
    expect(io.reads).toHaveLength(before.reads);
    expect(io.recoveries).toHaveLength(before.recoveries);
    const actor = currentActor();
    if (phase === 'workspace') delete actor.activeCompany;
    await act(async () =>
      pending.resolve(
        outcome === 'workspace-denied'
          ? new Response(null, { status: 403 })
          : Response.json(actor),
      ),
    );
    expect(old.onActorRevalidated).not.toHaveBeenCalled();
    expect(old.onCompanyContextRejected).not.toHaveBeenCalled();
    expect(old.onWorkspaceAccessRejected).not.toHaveBeenCalled();
    if (outcome === 'workspace-denied')
      expect(latest.onWorkspaceAccessRejected).toHaveBeenCalledTimes(1);
    else {
      expect(latest.onActorRevalidated).toHaveBeenCalledExactlyOnceWith(actor);
      if (phase === 'workspace')
        expect(latest.onCompanyContextRejected).toHaveBeenCalledExactlyOnceWith(
          id(1),
        );
    }
    expect(io.reads).toHaveLength(before.reads);
    expect(io.recoveries).toHaveLength(before.recoveries);
  },
);

it('rechecks Actor publication when Company rejection synchronously replaces the complete Actor', async () => {
  const io = network();
  const props = {
    actor: currentActor(),
    identity: deterministicBrowserIdentity(),
    projectId: project.id,
    clientAccountId: project.clientAccountId,
    onOpenTask: vi.fn(),
    onActorRevalidated: vi.fn(),
  };
  const view = render(<MissionPlanCurrentWork {...props} />);
  const onCompanyContextRejected = vi.fn(() =>
    flushSync(() =>
      view.rerender(
        <MissionPlanCurrentWork
          {...props}
          actor={{ ...props.actor, displayName: 'New current snapshot' }}
        />,
      ),
    ),
  );
  view.rerender(
    <MissionPlanCurrentWork
      {...props}
      onCompanyContextRejected={onCompanyContextRejected}
    />,
  );
  await screen.findByText('Current declaration 1 Ж / é');
  const pending = held();
  io.state.selected = pending;
  io.state.readStatus = 403;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh current work' }));
  await waitFor(() => expect(io.recoveries).toHaveLength(1));
  const obsolete = currentActor();
  delete obsolete.activeCompany;
  await act(async () => pending.resolve(Response.json(obsolete)));
  expect(onCompanyContextRejected).toHaveBeenCalledExactlyOnceWith(id(1));
  expect(props.onActorRevalidated).not.toHaveBeenCalled();
  expect(io.recoveries[0]?.signal.aborted).toBe(true);
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Mission-plan access is no longer available.',
  );
});
