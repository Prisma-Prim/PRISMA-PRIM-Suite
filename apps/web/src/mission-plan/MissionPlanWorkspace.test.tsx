import { afterEach, expect, it, vi } from 'vitest';
import { act, fireEvent, waitFor, within } from '@testing-library/react';
import { render, screen } from '../test/render-with-interface-locale';
import { deterministicBrowserIdentity } from '../access-composition';
import { useInterfaceLocale } from '../localization/interface-locale';
import { MissionPlanWorkspace } from './MissionPlanWorkspace';
import {
  MissionPlanProjectCopy,
  MissionPlanProjectCreator,
} from './MissionPlanProject';
import {
  actor,
  source,
  scope,
  userGrant,
  configGrant,
  cataloguePage,
} from './mission-plan.fixture';
import { missionPlanAuthority } from './mission-plan-authority';
const identity = deterministicBrowserIdentity();
afterEach(() => vi.unstubAllGlobals());
function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
function fixture(command?: (init: RequestInit) => Promise<Response>) {
  const calls: { path: string; init: RequestInit }[] = [];
  const fetch = vi.fn(
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = new URL(input.toString(), window.location.origin);
      calls.push({ path: url.pathname + url.search, init });
      if (init.method === 'POST' && command) return command(init);
      if (url.pathname.endsWith('/versions/' + source.id))
        return response({ version: source });
      if (url.pathname.endsWith('/versions'))
        return response({ headVersionNumber: 1, items: [source] });
      return response(cataloguePage);
    },
  );
  vi.stubGlobal('fetch', fetch);
  return { fetch, calls };
}
function fill() {
  fireEvent.click(screen.getByRole('button', { name: 'New plan' }));
  for (const [label, value] of [
    ['Plan name', 'Literal plan'],
    ['Activity title', 'Task literal'],
    ['Planned action', ' Action\n🌍 '],
    ['Intended result', ' Result literal '],
  ])
    fireEvent.change(screen.getByLabelText(label, { exact: true }), {
      target: { value },
    });
}
function Locale() {
  const { changeLocale } = useInterfaceLocale();
  return (
    <>
      {(['ro', 'ru', 'fr', 'en'] as const).map((locale) => (
        <button key={locale} onClick={() => changeLocale(locale)}>
          {locale}
        </button>
      ))}
    </>
  );
}
it('publishes complete literal content and explicitly retries the same body/key after a lost response', async () => {
  const commands: RequestInit[] = [];
  fixture(async (init) => {
    commands.push(init);
    if (commands.length === 1) return response({}, 500);
    const raw: unknown = JSON.parse(String(init.body));
    if (
      !raw ||
      typeof raw !== 'object' ||
      !('title' in raw) ||
      !('activities' in raw)
    )
      throw new Error('Expected content');
    return response(
      { version: { ...source, title: raw.title, activities: raw.activities } },
      201,
    );
  });
  render(<MissionPlanWorkspace actor={actor} identity={identity} />);
  await screen.findByText('Synthetic reusable plan · Version 1');
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'Publish plan' }));
  await screen.findByText('Outcome uncertain. Retry the identical command.');
  expect(screen.getByLabelText('Plan name')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'New plan' })).toBeDisabled();
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry identical command' }),
  );
  await screen.findByText('Publication confirmed.');
  expect(commands).toHaveLength(2);
  expect(commands[0]?.body).toBe(commands[1]?.body);
  expect(new Headers(commands[0]?.headers).get('idempotency-key')).toBe(
    new Headers(commands[1]?.headers).get('idempotency-key'),
  );
});
it('adds, removes and reorders rows without changing their opaque identities', async () => {
  const bodies: unknown[] = [];
  fixture(async (init) => {
    bodies.push(JSON.parse(String(init.body)));
    return response({}, 400);
  });
  render(<MissionPlanWorkspace actor={actor} identity={identity} />);
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'Add activity' }));
  const titles = screen.getAllByLabelText('Activity title', { exact: true });
  const actions = screen.getAllByLabelText('Planned action', { exact: true });
  const results = screen.getAllByLabelText('Intended result', { exact: true });
  if (!titles[1] || !actions[1] || !results[1])
    throw new Error('Missing second row');
  fireEvent.change(titles[1], { target: { value: 'Second' } });
  fireEvent.change(actions[1], { target: { value: 'Second action' } });
  fireEvent.change(results[1], { target: { value: 'Second result' } });
  const firstId = titles[0]?.id,
    secondId = titles[1].id;
  fireEvent.click(screen.getByRole('button', { name: 'Move up 2' }));
  expect(
    screen
      .getAllByLabelText('Activity title', { exact: true })
      .map((e) => e.id),
  ).toEqual([secondId, firstId]);
  fireEvent.click(screen.getByRole('button', { name: 'Remove activity 2' }));
  fireEvent.click(screen.getByRole('button', { name: 'Publish plan' }));
  await waitFor(() => expect(bodies).toHaveLength(1));
  expect(bodies[0]).toMatchObject({
    activities: [
      {
        title: 'Second',
        activity: 'Second action',
        intendedResult: 'Second result',
      },
    ],
  });
});
it('retains the literal draft, focus and pending command across all four locales with no read or new command', async () => {
  const f = fixture(async () => response({}, 500));
  render(
    <>
      <Locale />
      <MissionPlanWorkspace actor={actor} identity={identity} />
    </>,
  );
  await screen.findByText('Synthetic reusable plan · Version 1');
  fill();
  const field = screen.getByLabelText('Planned action', { exact: true });
  field.focus();
  const baseline = f.calls.length;
  for (const locale of ['fr', 'ru', 'ro', 'en']) {
    fireEvent.click(screen.getByRole('button', { name: locale }));
    expect(field).toHaveValue(' Action\n🌍 ');
    expect(field).toHaveFocus();
    expect(f.calls).toHaveLength(baseline);
  }
  fireEvent.click(screen.getByRole('button', { name: 'Publish plan' }));
  await screen.findByText('Outcome uncertain. Retry the identical command.');
  const after = f.calls.length;
  for (const locale of ['fr', 'ru', 'ro', 'en'])
    fireEvent.click(screen.getByRole('button', { name: locale }));
  expect(f.calls).toHaveLength(after);
  expect(field).toBeDisabled();
  expect(field).toHaveValue(' Action\n🌍 ');
});
it.each([
  [400, {}, 'Enter titles and1–50 activities.'],
  [409, { code: 'STALE_VERSION' }, 'The head changed.'],
  [
    409,
    { code: 'IDEMPOTENCY_CONFLICT' },
    'This key belongs to another command.',
  ],
])(
  'distinguishes definite command refusal %s %j',
  async (status, body, message) => {
    if (typeof status !== 'number' || typeof message !== 'string')
      throw new Error('Invalid fixture');
    fixture(async () => response(body, status));
    render(<MissionPlanWorkspace actor={actor} identity={identity} />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Publish plan' }));
    await screen.findByText(
      new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );
    expect(
      screen.queryByRole('button', { name: 'Retry identical command' }),
    ).not.toBeInTheDocument();
  },
);
it.each(['foreign', 'incomplete', 'wrong-intent'])(
  'keeps a malformed %s publication success uncertain without Activity side effects',
  async (kind) => {
    const activity = vi.fn();
    fixture(async () =>
      response(
        {
          version: {
            ...source,
            ...(kind === 'foreign'
              ? { companyId: '10000000-0000-4000-8000-000000000999' }
              : kind === 'incomplete'
                ? { activities: [] }
                : {}),
          },
        },
        201,
      ),
    );
    render(
      <MissionPlanWorkspace
        actor={actor}
        identity={identity}
        onActivityRecorded={activity}
      />,
    );
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Publish plan' }));
    await screen.findByText('Outcome uncertain. Retry the identical command.');
    expect(activity).not.toHaveBeenCalled();
  },
);
it.each([200, 403])(
  'permanently retires late%s publication replies during a Company A→B→A round trip',
  async (status) => {
    let resolve: ((r: Response) => void) | undefined;
    const activity = vi.fn(),
      revalidated = vi.fn();
    fixture(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const view = render(
      <MissionPlanWorkspace
        actor={actor}
        identity={identity}
        onActivityRecorded={activity}
        onActorRevalidated={revalidated}
      />,
    );
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Publish plan' }));
    await waitFor(() => expect(resolve).toBeDefined());
    const other = {
      ...actor,
      activeCompany: {
        ...actor.activeCompany,
        id: '10000000-0000-4000-8000-000000000999',
        displayName: 'Other',
      },
    };
    view.rerender(
      <MissionPlanWorkspace
        actor={other}
        identity={identity}
        onActivityRecorded={activity}
        onActorRevalidated={revalidated}
      />,
    );
    view.rerender(
      <MissionPlanWorkspace
        actor={actor}
        identity={identity}
        onActivityRecorded={activity}
        onActorRevalidated={revalidated}
      />,
    );
    await act(async () => resolve?.(response({ version: source }, status)));
    expect(activity).not.toHaveBeenCalled();
    expect(revalidated).not.toHaveBeenCalled();
    expect(
      screen.queryByText('Publication confirmed.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Plan name')).not.toBeInTheDocument();
  },
);
it('preserves a configuration draft through an unrelated User capture change', () => {
  fixture();
  const view = render(
    <MissionPlanWorkspace actor={actor} identity={identity} />,
  );
  fill();
  view.rerender(
    <MissionPlanWorkspace
      actor={{
        ...actor,
        activeCompany: {
          ...actor.activeCompany,
          id: scope.companyId,
          displayName: 'Synthetic Company',
          missionPlanGrants: [
            configGrant,
            {
              ...userGrant,
              assignmentId: '40000000-0000-4000-8000-000000000999',
            },
          ],
        },
      }}
      identity={identity}
    />,
  );
  expect(screen.getByLabelText('Plan name')).toHaveValue('Literal plan');
});
it('validates known complete consumed captures and preserves the independent creation owner when configuration changes', () => {
  const native = actor.activeCompany;
  if (!native) throw new Error('Missing Company');
  const a = missionPlanAuthority(actor, 'create');
  expect(
    missionPlanAuthority(
      {
        ...actor,
        activeCompany: { ...native, missionPlanGrants: [userGrant] },
      },
      'create',
    )?.key,
  ).toBe(a?.key);
  for (const grant of [
    null,
    { ...userGrant, permissionSetVersion: 'v9' },
    { ...userGrant, permissions: ['project.mission_plan.read'] },
    { ...userGrant, assignmentId: 'x' },
  ])
    expect(
      missionPlanAuthority(
        { ...actor, activeCompany: { ...native, missionPlanGrants: [grant] } },
        'create',
      ),
    ).toBeNull();
  expect(
    missionPlanAuthority(
      {
        ...actor,
        activeCompany: { ...native, missionPlanGrants: [configGrant] },
      },
      'create',
    ),
  ).toBeNull();
});
it('opens the exact mapped native Task and keeps literal planning separate', async () => {
  const open = vi.fn(),
    projectId = '80000000-0000-4000-8000-000000000920',
    taskId = '90000000-0000-4000-8000-000000000920';
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      response({
        plan: {
          projectId,
          version: source,
          tasks: [
            { activityKey: source.activities[0]?.key, position: 0, taskId },
          ],
        },
      }),
    ),
  );
  render(
    <MissionPlanProjectCopy
      actor={actor}
      identity={identity}
      projectId={projectId}
      onOpenTask={open}
    />,
  );
  const region = screen.getByRole('region', { name: 'Preserved mission plan' });
  fireEvent.click(
    await within(region).findByRole('button', {
      name: 'Open Project Task: Synthetic first Task',
    }),
  );
  expect(open).toHaveBeenCalledExactlyOnceWith(taskId);
  expect(within(region).getByText('Literal expected result')).toBeVisible();
});

it.each(['transport', 'malformed'])(
  'explicitly retries the same exact Version after %s failure',
  async (kind) => {
    let reads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const path = new URL(input.toString(), window.location.origin).pathname;
        if (path.endsWith('/versions/' + source.id)) {
          reads++;
          return reads === 1
            ? kind === 'transport'
              ? response({}, 503)
              : response({ version: { ...source, activities: [] } })
            : response({ version: source });
        }
        return response(cataloguePage);
      }),
    );
    render(<MissionPlanWorkspace actor={actor} identity={identity} />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open Version: Synthetic reusable plan',
      }),
    );
    await screen.findByText('Plans unavailable. Retry.');
    fireEvent.click(screen.getByRole('button', { name: 'Reload Version' }));
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open Version: Synthetic reusable plan · Version 1',
      }),
    );
    expect(await screen.findByText('Literal expected result')).toBeVisible();
    expect(reads).toBe(2);
  },
);

it('retires a denied creation source immediately and forwards current actor while preserving independent manual work', async () => {
  const revalidated = vi.fn(),
    created = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const path = new URL(input.toString(), window.location.origin).pathname;
      if (path === '/api/access/current-actor')
        return response({
          ...actor,
          activeCompany: {
            ...actor.activeCompany,
            missionPlanGrants: [configGrant],
          },
        });
      if (init.method === 'POST') return response({}, 403);
      if (path.endsWith('/versions/' + source.id))
        return response({ version: source });
      return response(cataloguePage);
    }),
  );
  const { selectOption } = await import('../test/select-option');
  render(
    <>
      <input
        aria-label="Independent manual draft"
        defaultValue="Keep native work"
      />
      <MissionPlanProjectCreator
        actor={actor}
        identity={identity}
        clients={[
          {
            id: '80000000-0000-4000-8000-000000000920',
            displayName: 'Synthetic Client',
          },
        ]}
        onCreated={created}
        onActorRevalidated={revalidated}
      />
    </>,
  );
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Open Version: Synthetic reusable plan',
    }),
  );
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Open Version: Synthetic reusable plan · Version 1',
    }),
  );
  fireEvent.change(screen.getByLabelText('New Project title'), {
    target: { value: 'Denied Project' },
  });
  selectOption(
    screen.getByRole('combobox', { name: 'New Project Client' }),
    '80000000-0000-4000-8000-000000000920',
  );
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Create Project with selected activities',
    }),
  );
  await screen.findByText('Mission-plan access is no longer available.');
  expect(screen.queryByText('Literal expected result')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', {
      name: 'Create Project with selected activities',
    }),
  ).not.toBeInTheDocument();
  await waitFor(() => expect(revalidated).toHaveBeenCalledOnce());
  expect(created).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Independent manual draft')).toHaveValue(
    'Keep native work',
  );
});

it.each([200, 403])(
  'suppresses late%s access revalidation after the retired owner changes Company A→B→A',
  async (status) => {
    let resolve: ((r: Response) => void) | undefined;
    const revalidated = vi.fn(),
      rejected = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
        const path = new URL(input.toString(), window.location.origin).pathname;
        if (path === '/api/access/current-actor')
          return new Promise<Response>((r) => {
            resolve = r;
          });
        if (init.method === 'POST') return response({}, 403);
        return response(cataloguePage);
      }),
    );
    const view = render(
      <MissionPlanWorkspace
        actor={actor}
        identity={identity}
        onActorRevalidated={revalidated}
        onCompanyContextRejected={rejected}
      />,
    );
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Publish plan' }));
    await screen.findByText('Mission-plan access is no longer available.');
    await waitFor(() => expect(resolve).toBeDefined());
    const other = {
      ...actor,
      activeCompany: {
        ...actor.activeCompany,
        id: '10000000-0000-4000-8000-000000000999',
        displayName: 'Other',
      },
    };
    view.rerender(
      <MissionPlanWorkspace
        actor={other}
        identity={identity}
        onActorRevalidated={revalidated}
        onCompanyContextRejected={rejected}
      />,
    );
    view.rerender(
      <MissionPlanWorkspace
        actor={actor}
        identity={identity}
        onActorRevalidated={revalidated}
        onCompanyContextRejected={rejected}
      />,
    );
    await act(async () => resolve?.(response(actor, status)));
    expect(revalidated).not.toHaveBeenCalled();
    expect(rejected).not.toHaveBeenCalled();
    expect(
      await screen.findByRole('button', { name: 'New plan' }),
    ).toBeEnabled();
  },
);
