import { changeValue } from '../test/select-option';
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
import { useInterfaceLocale } from '../localization/interface-locale';
import { ProjectResponsible as ProjectResponsibleComponent } from './ProjectResponsible';
import type { ProjectStatus } from './project-lifecycle-response';

function ProjectResponsible({
  projectStatus = 'preparatory',
  ...props
}: Omit<Parameters<typeof ProjectResponsibleComponent>[0], 'projectStatus'> & {
  projectStatus?: ProjectStatus;
}) {
  return (
    <ProjectResponsibleComponent projectStatus={projectStatus} {...props} />
  );
}

const company = {
  id: 'company',
  displayName: 'PRISMA-PRIM',
  clientPermissions: ['client.read'],
  projectPermissions: ['project.read', 'project.create', 'project.update'],
} satisfies ActorContext['activeCompany'];
const actor: ActorContext = {
  internalUserId: 'ana',
  workspaceMembershipId: 'ana-membership',
  workspaceId: 'workspace',
  workspaceName: 'Workspace',
  displayName: 'Ana',
  email: 'ana@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: company,
};
const ion = { workspaceMembershipId: 'ion', displayLabel: 'Ion Popa · 3F' };
const maria = {
  workspaceMembershipId: 'maria',
  displayLabel: 'Maria Rusu · 9K',
};
const changedAt = '2026-09-24T10:00:00.000Z';
type State = {
  responsible: typeof ion | null;
  revision: number;
  lastChange: { actorDisplayName: string; occurredAt: string } | null;
  mutable: boolean;
};
const initial: State = {
  responsible: null,
  revision: 0,
  lastChange: null,
  mutable: true,
};
type Call = { url: string; method: string; key?: string; body?: unknown };

afterEach(() => vi.unstubAllGlobals());

/** A fetch-boundary stub serving one Project's responsibility. */
function server(
  options: {
    state?: State;
    members?: Array<typeof ion>;
    change?: (
      call: Call,
      state: State,
    ) => Response | Promise<Response> | undefined;
    read?: (state: State) => Response | Promise<Response> | undefined;
  } = {},
) {
  let state = options.state ?? initial;
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const headers = new Headers(init?.headers);
      const body: unknown =
        typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      const call: Call = {
        url,
        method,
        ...(headers.get('idempotency-key')
          ? { key: headers.get('idempotency-key') ?? '' }
          : {}),
        ...(body === undefined ? {} : { body }),
      };
      calls.push(call);
      if (url === '/api/projects/project/responsible' && method === 'GET')
        return (await options.read?.(state)) ?? Response.json(state);
      if (url === '/api/projects/project/eligible-responsible-members')
        return Response.json({ members: options.members ?? [ion, maria] });
      if (url === '/api/projects/project/responsible' && method === 'PUT') {
        const overridden = await options.change?.(call, state);
        if (overridden) return overridden;
        const requested =
          typeof body === 'object' &&
          body !== null &&
          'workspaceMembershipId' in body
            ? body.workspaceMembershipId
            : undefined;
        const responsible =
          [ion, maria].find(
            (member) => member.workspaceMembershipId === requested,
          ) ?? null;
        const changed =
          responsible?.workspaceMembershipId !==
          state.responsible?.workspaceMembershipId;
        if (changed)
          state = {
            ...state,
            responsible,
            revision: state.revision + 1,
            lastChange: { actorDisplayName: 'Ana', occurredAt: changedAt },
          };
        return Response.json({
          projectId: 'project',
          outcome: changed ? 'changed' : 'unchanged',
          revision: state.revision,
          responsible: state.responsible,
        });
      }
      return new Response(null, { status: 404 });
    }),
  );
  return { calls, puts: () => calls.filter((call) => call.method === 'PUT') };
}
function region() {
  return screen.getByRole('region', { name: 'Responsible member' });
}
function show(props: Partial<Parameters<typeof ProjectResponsible>[0]> = {}) {
  const identity = deterministicBrowserIdentity();
  const view = render(
    <>
      <LocaleSwitch />
      <ProjectResponsible
        actor={actor}
        identity={identity}
        projectId="project"
        {...props}
      />
    </>,
  );
  return { ...view, identity };
}
async function choose(member: typeof ion) {
  fireEvent.click(
    await within(region()).findByRole('button', { name: 'Change' }),
  );
  changeValue(
    await within(region()).findByLabelText('Choose the responsible member'),
    member.workspaceMembershipId,
  );
  fireEvent.click(within(region()).getByRole('button', { name: 'Save' }));
}

it('keeps the responsible member readable and hides changes for a closed Project', async () => {
  server({
    state: {
      responsible: ion,
      revision: 1,
      lastChange: { actorDisplayName: 'Ana', occurredAt: changedAt },
      mutable: false,
    },
  });
  show({ projectStatus: 'cancelled' });
  expect(
    await within(region()).findByText(ion.displayLabel),
  ).toBeInTheDocument();
  expect(within(region()).queryByRole('button', { name: 'Change' })).toBeNull();
  expect(
    within(region()).getByRole('button', {
      name: 'Reload responsible member',
    }),
  ).toBeInTheDocument();
});

it('reads, changes, saves, replaces and clears the responsible member with attribution', async () => {
  const { calls, puts } = server();
  const onActivityRecorded = vi.fn();
  show({ onActivityRecorded });
  expect(
    await within(region()).findByText('No responsible member'),
  ).toBeInTheDocument();
  expect(within(region()).queryByText(/Last changed by/u)).toBeNull();
  // The selector is loaded only when a change is explicitly started.
  expect(calls.map((call) => call.url)).toEqual([
    '/api/projects/project/responsible',
  ]);
  await choose(ion);
  expect(
    await within(region()).findByText('Ion Popa · 3F', { selector: 'dd' }),
  ).toBeInTheDocument();
  expect(
    within(region()).getByText(/Last changed by Ana on/u),
  ).toBeInTheDocument();
  expect(
    within(region()).getByText('Responsible member saved.'),
  ).toBeInTheDocument();
  await choose(maria);
  expect(
    await within(region()).findByText('Maria Rusu · 9K', { selector: 'dd' }),
  ).toBeInTheDocument();
  fireEvent.click(within(region()).getByRole('button', { name: 'Change' }));
  fireEvent.click(
    await within(region()).findByRole('button', {
      name: 'Clear responsible member',
    }),
  );
  expect(
    await within(region()).findByText('No responsible member'),
  ).toBeInTheDocument();
  expect(puts().map((call) => call.body)).toEqual([
    { expectedRevision: 0, workspaceMembershipId: 'ion' },
    { expectedRevision: 1, workspaceMembershipId: 'maria' },
    { expectedRevision: 2, workspaceMembershipId: null },
  ]);
  const keys = puts().map((call) => call.key);
  expect(new Set(keys).size).toBe(3);
  await waitFor(() => expect(onActivityRecorded).toHaveBeenCalledTimes(3));
});

it('explains that the Project may stay without a responsible member when nobody is eligible', async () => {
  const { puts } = server({ members: [] });
  show();
  fireEvent.click(
    await within(region()).findByRole('button', { name: 'Change' }),
  );
  expect(
    await within(region()).findByText(
      'No member can currently be named responsible. The Project can stay without a responsible member.',
    ),
  ).toBeInTheDocument();
  expect(within(region()).queryByRole('combobox')).toBeNull();
  expect(within(region()).queryByRole('button', { name: 'Save' })).toBeNull();
  fireEvent.click(within(region()).getByRole('button', { name: 'Cancel' }));
  expect(
    within(region()).getByRole('button', { name: 'Change' }),
  ).toBeInTheDocument();
  expect(puts()).toEqual([]);
});

it('offers clearing a recorded member who is no longer eligible', async () => {
  const { puts } = server({
    state: {
      responsible: ion,
      revision: 1,
      lastChange: { actorDisplayName: 'Ana', occurredAt: changedAt },
      mutable: true,
    },
    members: [maria],
  });
  show();
  expect(
    await within(region()).findByText('Ion Popa · 3F', { selector: 'dd' }),
  ).toBeInTheDocument();
  fireEvent.click(within(region()).getByRole('button', { name: 'Change' }));
  const selector = await within(region()).findByLabelText(
    'Choose the responsible member',
  );
  expect(selector).toHaveValue('');
  expect(
    within(selector).queryByRole('option', { name: 'Ion Popa · 3F' }),
  ).toBeNull();
  expect(within(region()).getByRole('button', { name: 'Save' })).toBeDisabled();
  fireEvent.click(
    within(region()).getByRole('button', { name: 'Clear responsible member' }),
  );
  expect(
    await within(region()).findByText('No responsible member'),
  ).toBeInTheDocument();
  expect(puts().map((call) => call.body)).toEqual([
    { expectedRevision: 1, workspaceMembershipId: null },
  ]);
});

it('requires an explicit reload after a conflict or a rejected member', async () => {
  let rejection: 409 | 400 = 409;
  const { calls } = server({
    change: () => new Response(null, { status: rejection }),
  });
  show();
  await choose(ion);
  expect(
    await within(region()).findByText(
      'The responsible member or your access changed. Reload before making another change.',
    ),
  ).toBeInTheDocument();
  expect(within(region()).queryByRole('button', { name: 'Change' })).toBeNull();
  fireEvent.click(
    within(region()).getByRole('button', { name: 'Reload responsible member' }),
  );
  rejection = 400;
  await choose(ion);
  expect(
    await within(region()).findByText(
      'The selected member can no longer be named responsible. Reload and choose again.',
    ),
  ).toBeInTheDocument();
  expect(
    calls.filter(
      (call) =>
        call.method === 'GET' &&
        call.url === '/api/projects/project/responsible',
    ),
  ).toHaveLength(2);
});

it('keeps the responsible draft and requires a Project reload when closure wins the command race', async () => {
  const onProjectChanged = vi.fn();
  server({
    change: () =>
      Response.json(
        {
          statusCode: 409,
          code: 'project_closed',
          message: 'This Project is closed. Its records are read-only.',
        },
        { status: 409 },
      ),
  });
  show({ onProjectChanged });
  await choose(ion);
  expect(
    await within(region()).findByText(
      'This Project was closed. Reload to see its current state.',
    ),
  ).toBeInTheDocument();
  expect(
    within(region()).getByLabelText('Choose the responsible member'),
  ).toHaveValue(ion.workspaceMembershipId);
  expect(within(region()).getByRole('button', { name: 'Save' })).toBeDisabled();
  fireEvent.click(
    within(region()).getByRole('button', { name: 'Reload responsible member' }),
  );
  expect(onProjectChanged).toHaveBeenCalledTimes(1);
});

it('explains that an active or on-hold Project keeps a responsible member and reports each read', async () => {
  const onResponsibleRead = vi.fn();
  const { puts } = server({
    state: {
      responsible: ion,
      revision: 1,
      lastChange: { actorDisplayName: 'Ana', occurredAt: changedAt },
      mutable: true,
    },
    change: (call) =>
      call.body !== null &&
      typeof call.body === 'object' &&
      'workspaceMembershipId' in call.body &&
      call.body.workspaceMembershipId === null
        ? Response.json(
            {
              statusCode: 409,
              code: 'project_responsible_required',
              message:
                'Choose a replacement instead of clearing the responsible member.',
            },
            { status: 409 },
          )
        : undefined,
  });
  show({ onResponsibleRead });
  expect(
    await within(region()).findByText('Ion Popa · 3F', { selector: 'dd' }),
  ).toBeInTheDocument();
  expect(onResponsibleRead).toHaveBeenLastCalledWith('project', ion);
  fireEvent.click(within(region()).getByRole('button', { name: 'Change' }));
  await within(region()).findByLabelText('Choose the responsible member');
  fireEvent.click(
    within(region()).getByRole('button', { name: 'Clear responsible member' }),
  );
  expect(
    await within(region()).findByText(
      'An active or on-hold Project needs a responsible member. Choose a replacement instead.',
    ),
  ).toBeInTheDocument();
  fireEvent.click(
    within(region()).getByRole('button', { name: 'Reload responsible member' }),
  );
  await choose(maria);
  await waitFor(() =>
    expect(onResponsibleRead).toHaveBeenLastCalledWith('project', maria),
  );
  expect(puts().map((call) => call.body)).toEqual([
    { expectedRevision: 1, workspaceMembershipId: null },
    { expectedRevision: 1, workspaceMembershipId: 'maria' },
  ]);
});

it('preserves an uncertain change and retries it with the same body and key', async () => {
  let failures = 1;
  const { puts } = server({
    change: () => {
      if (failures === 0) return undefined;
      failures -= 1;
      throw new TypeError('Network failure');
    },
  });
  const onActivityRecorded = vi.fn();
  const onProjectChanged = vi.fn();
  show({ onActivityRecorded, onProjectChanged });
  await choose(ion);
  expect(
    await within(region()).findByText(
      'The change is not confirmed. Retry the same change to safely recover its recorded result.',
    ),
  ).toBeInTheDocument();
  expect(onProjectChanged).not.toHaveBeenCalled();
  const responsibleRegion = region();
  expect(
    within(responsibleRegion).queryByRole('button', { name: 'Change' }),
  ).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Passer en français' }));
  fireEvent.click(
    within(responsibleRegion).getByRole('button', {
      name: 'Réessayer la modification du membre responsable',
    }),
  );
  expect(
    await within(responsibleRegion).findByText('Ion Popa · 3F', {
      selector: 'dd',
    }),
  ).toBeInTheDocument();
  const [first, retried] = puts();
  expect(retried).toEqual(first);
  expect(first?.key).toEqual(expect.any(String));
  expect(onActivityRecorded).toHaveBeenCalledTimes(1);
  expect(onProjectChanged).toHaveBeenCalledTimes(1);
});

it.each(['throw', 'reject'] as const)(
  'keeps a confirmed responsibility receipt when its parent refresh fails with %s and its reread is unavailable',
  async (failure) => {
    const { puts } = server({
      read: (state) =>
        state.revision > 0 ? new Response(null, { status: 503 }) : undefined,
    });
    const onProjectChanged = vi.fn(() => {
      if (failure === 'throw') throw new Error('Parent refresh unavailable');
      return Promise.reject(new Error('Parent refresh unavailable'));
    });
    const onActivityRecorded = vi.fn();
    show({ onProjectChanged, onActivityRecorded });
    await choose(ion);
    await within(region()).findByText(
      'The responsible member could not be loaded.',
    );
    await waitFor(() => expect(onActivityRecorded).toHaveBeenCalledTimes(1));
    expect(onProjectChanged).toHaveBeenCalledTimes(1);
    expect(
      within(region()).getByText('Responsible member saved.'),
    ).toBeInTheDocument();
    expect(
      within(region()).queryByRole('button', {
        name: 'Retry responsible member change',
      }),
    ).toBeNull();
    expect(puts()).toHaveLength(1);
  },
);

it('preserves the responsible-member draft while the interface locale changes', async () => {
  const { puts } = server();
  show();
  fireEvent.click(
    await within(region()).findByRole('button', { name: 'Change' }),
  );
  changeValue(
    await within(region()).findByLabelText('Choose the responsible member'),
    maria.workspaceMembershipId,
  );
  const responsibleRegion = region();

  fireEvent.click(screen.getByRole('button', { name: 'Passer en français' }));

  expect(
    within(responsibleRegion).getByLabelText(
      'Choisissez le membre responsable',
    ),
  ).toHaveTextContent(maria.displayLabel);
  fireEvent.click(
    within(responsibleRegion).getByRole('button', { name: 'Enregistrer' }),
  );
  await within(responsibleRegion).findByText('Membre responsable enregistré.');
  expect(puts().map((call) => call.body)).toEqual([
    { expectedRevision: 0, workspaceMembershipId: maria.workspaceMembershipId },
  ]);
});

function LocaleSwitch() {
  const { changeLocale } = useInterfaceLocale();
  return (
    <button type="button" onClick={() => changeLocale('fr')}>
      Passer en français
    </button>
  );
}

it('keeps the responsible member readable without change controls under a historical Client', async () => {
  const { calls } = server({
    state: {
      responsible: ion,
      revision: 1,
      lastChange: { actorDisplayName: 'Ana', occurredAt: changedAt },
      mutable: false,
    },
  });
  show();
  expect(
    await within(region()).findByText('Ion Popa · 3F', { selector: 'dd' }),
  ).toBeInTheDocument();
  expect(
    within(region()).getByText(
      'Read-only: the original Client has been superseded. The responsible member remains visible.',
    ),
  ).toBeInTheDocument();
  expect(within(region()).queryByRole('button', { name: 'Change' })).toBeNull();
  expect(calls.map((call) => call.url)).toEqual([
    '/api/projects/project/responsible',
  ]);
});

it('shows the responsible member without change controls to a Project Access v1 reader', async () => {
  const { calls } = server({
    state: {
      responsible: ion,
      revision: 1,
      lastChange: { actorDisplayName: 'Ana', occurredAt: changedAt },
      mutable: true,
    },
  });
  show({
    actor: {
      ...actor,
      activeCompany: {
        ...company,
        projectPermissions: ['project.read', 'project.create'],
      },
    },
  });
  expect(
    await within(region()).findByText('Ion Popa · 3F', { selector: 'dd' }),
  ).toBeInTheDocument();
  expect(
    within(region()).getByText(/Last changed by Ana on/u),
  ).toBeInTheDocument();
  expect(within(region()).queryByRole('button', { name: 'Change' })).toBeNull();
  expect(calls).toHaveLength(1);
});

it.each([
  [
    403,
    'Project and Client read access are required to see the responsible member.',
  ],
  [404, 'This Project could not be found. Reload the Project list.'],
  [500, 'The responsible member could not be loaded.'],
])('distinguishes a %s read', async (status, message) => {
  server({ read: () => new Response(null, { status }) });
  show();
  expect(await within(region()).findByRole('alert')).toHaveTextContent(message);
  expect(within(region()).queryByText('No responsible member')).toBeNull();
});

it('drops a draft and every late reply when the Company, membership or permission changes', async () => {
  const pending: Array<(response: Response) => void> = [];
  server();
  const { rerender, identity } = show();
  fireEvent.click(
    await within(region()).findByRole('button', { name: 'Change' }),
  );
  await within(region()).findByLabelText('Choose the responsible member');
  // Every later read stays pending until the test answers it.
  const { calls } = server({
    read: () =>
      new Promise<Response>((resolve) => {
        pending.push(resolve);
      }),
  });
  rerender(
    <ProjectResponsible
      actor={{
        ...actor,
        activeCompany: {
          ...company,
          projectPermissions: ['project.read', 'project.create'],
        },
      }}
      identity={identity}
      projectId="project"
    />,
  );
  expect(
    within(region()).queryByLabelText('Choose the responsible member'),
  ).toBeNull();
  expect(within(region()).getByRole('status')).toHaveTextContent(
    'Loading the responsible member…',
  );
  await waitFor(() => expect(pending).toHaveLength(1));
  rerender(
    <ProjectResponsible
      actor={{ ...actor, activeCompany: { ...company, id: 'other-company' } }}
      identity={identity}
      projectId="project"
    />,
  );
  await waitFor(() => expect(pending).toHaveLength(2));
  pending[1]?.(Response.json(initial));
  expect(
    await within(region()).findByText('No responsible member'),
  ).toBeInTheDocument();
  pending[0]?.(
    Response.json({
      responsible: maria,
      revision: 1,
      lastChange: { actorDisplayName: 'Ana', occurredAt: changedAt },
      mutable: true,
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(within(region()).queryByText('Maria Rusu · 9K')).toBeNull();
  expect(
    within(region()).getByText('No responsible member'),
  ).toBeInTheDocument();
  expect(calls.map((call) => call.method)).toEqual(['GET', 'GET']);
});
