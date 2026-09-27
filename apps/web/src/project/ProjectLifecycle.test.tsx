import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { ProjectLifecycle } from './ProjectLifecycle';
import type {
  ProjectLifecycle as LifecycleValue,
  StartDeclaration,
} from './project-lifecycle-response';
import { preparatoryLifecycle } from './project-lifecycle.test-fixtures';

const reader = {
  id: 'company',
  displayName: 'PRISMA-PRIM',
  clientPermissions: ['client.read'],
  projectPermissions: ['project.read', 'project.create'],
} satisfies ActorContext['activeCompany'];
const approverCompany = {
  ...reader,
  projectApproverPermissions: ['project.lifecycle.transition', 'project.close'],
  projectApproverPermissionAssignmentId: 'approver-assignment',
  projectApproverPermissionSetVersion: 'v1',
} satisfies ActorContext['activeCompany'];
const approver: ActorContext = {
  internalUserId: 'aprobator',
  workspaceMembershipId: 'aprobator-membership',
  workspaceId: 'workspace',
  workspaceName: 'Workspace',
  displayName: 'Aprobator Demo',
  email: 'aprobator@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: approverCompany,
};
const ion: ActorContext = { ...approver, activeCompany: reader };
const ana = {
  workspaceMembershipId: 'ana',
  displayLabel: 'Ana Ionescu-Vasilescu · 3F',
};
const maria = { workspaceMembershipId: 'maria', displayLabel: 'Maria · 9K' };
const at = '2026-09-26T10:00:00.000Z';
const allPresent: StartDeclaration = {
  approvedOffer: 'present',
  contractOrPrecontract: 'present',
  projectPlan: 'present',
  initialDocuments: 'present',
  deadlines: 'present',
  financialConditions: 'present',
  risks: 'present',
};
const exceptionReason =
  'Work starts on the preliminary agreement; the Offer and Contract are being finalized.';
const itemLabels = [
  'Approved Offer',
  'Contract or precontract',
  'Project plan',
  'Initial documents',
  'Deadlines',
  'Financial conditions',
  'Relevant risks',
];
type Call = { url: string; method: string; key?: string; body?: unknown };
type Answer = Response | Promise<Response> | undefined;

afterEach(() => vi.unstubAllGlobals());

/** A fetch boundary applying the section 23 transitions to one Project. */
function server(
  options: {
    state?: LifecycleValue;
    members?: (typeof ana)[];
    read?: (state: LifecycleValue) => Answer;
    command?: (call: Call) => Answer;
  } = {},
) {
  let state: LifecycleValue = options.state ?? preparatoryLifecycle;
  const calls: Call[] = [];
  const signals: (AbortSignal | undefined | null)[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const key = new Headers(init?.headers).get('idempotency-key');
      const body: unknown =
        typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      const call: Call = {
        url,
        method,
        ...(key ? { key } : {}),
        ...(body === undefined ? {} : { body }),
      };
      calls.push(call);
      if (url === '/api/projects/project/lifecycle')
        return (await options.read?.(state)) ?? Response.json(state);
      if (url === '/api/projects/project/eligible-start-exception-members')
        return Response.json({ members: options.members ?? [maria, ana] });
      if (url === '/api/projects/project/lifecycle-transitions') {
        signals.push(init?.signal);
        const overridden = await options.command?.(call);
        if (overridden) return overridden;
        state = apply(state, body);
        const [last] = state.transitions;
        return Response.json({
          projectId: 'project',
          action: last?.action,
          from: last?.from,
          to: last?.to,
          lifecycleRevision: state.lifecycleRevision,
        });
      }
      return new Response(null, { status: 404 });
    }),
  );
  return {
    calls,
    signals,
    commands: () =>
      calls.filter(
        (call) => call.url === '/api/projects/project/lifecycle-transitions',
      ),
  };
}

function apply(state: LifecycleValue, body: unknown): LifecycleValue {
  if (typeof body !== 'object' || body === null || !('action' in body))
    throw new Error('Unexpected command');
  const lifecycleRevision = state.lifecycleRevision + 1;
  const actor = { displayName: 'Aprobator Demo' };
  const base = { lifecycleRevision, occurredAt: at, actor };
  switch (body.action) {
    case 'activate': {
      const exception =
        'startException' in body &&
        typeof body.startException === 'object' &&
        body.startException !== null &&
        'reason' in body.startException &&
        typeof body.startException.reason === 'string'
          ? {
              reason: body.startException.reason,
              completionResponsible: ana,
              completionDueDate: '2026-10-15',
            }
          : null;
      return {
        ...state,
        status: 'active',
        lifecycleRevision,
        start: {
          declaredAt: at,
          declaredBy: actor,
          declaration: exception
            ? {
                ...allPresent,
                approvedOffer: 'missing',
                contractOrPrecontract: 'missing',
                financialConditions: 'missing',
              }
            : allPresent,
          exception,
        },
        transitions: [
          {
            ...base,
            action: 'activate',
            from: 'preparatory',
            to: 'active',
            withStartException: exception !== null,
          },
          ...state.transitions,
        ],
      };
    }
    case 'hold':
      return {
        ...state,
        status: 'on_hold',
        lifecycleRevision,
        transitions: [
          {
            ...base,
            action: 'hold',
            from: 'active',
            to: 'on_hold',
            reason:
              'reason' in body && typeof body.reason === 'string'
                ? body.reason
                : '',
          },
          ...state.transitions,
        ],
      };
    case 'resume':
      return {
        ...state,
        status: 'active',
        lifecycleRevision,
        transitions: [
          { ...base, action: 'resume', from: 'on_hold', to: 'active' },
          ...state.transitions,
        ],
      };
    default:
      throw new Error('Unexpected action');
  }
}

function section() {
  return screen.getByRole('region', { name: 'Lifecycle' });
}
function show(props: Partial<Parameters<typeof ProjectLifecycle>[0]> = {}) {
  const identity = deterministicBrowserIdentity();
  const onProjectChanged = vi.fn(async () => undefined);
  const onActivityRecorded = vi.fn(async () => undefined);
  const view = render(
    <ProjectLifecycle
      actor={approver}
      identity={identity}
      projectId="project"
      responsible={ana}
      onProjectChanged={onProjectChanged}
      onActivityRecorded={onActivityRecorded}
      {...props}
    />,
  );
  return { ...view, identity, onProjectChanged, onActivityRecorded };
}
function choose(item: string, value: 'Present' | 'Missing') {
  const group = within(section()).getByRole('group', { name: item });
  fireEvent.click(within(group).getByRole('radio', { name: value }));
}
const activeLifecycle: LifecycleValue = apply(preparatoryLifecycle, {
  action: 'activate',
  expectedLifecycleRevision: 0,
});

it('shows a preparatory Project to a reader with its status and no action', async () => {
  server();
  show({ actor: ion });
  expect(
    await within(section()).findByText(
      'No lifecycle change has been recorded.',
    ),
  ).toBeInTheDocument();
  expect(within(section()).getByText('Preparatory')).toBeInTheDocument();
  expect(
    within(section()).queryByRole('button', { name: 'Activate Project' }),
  ).toBeNull();
  expect(
    within(section()).queryByText('Start declaration — declared, not verified'),
  ).toBeNull();
});

it('activates with a start exception through an inline form with field-level validation and no preselected item', async () => {
  const boundary = server();
  const { onProjectChanged, onActivityRecorded } = show();
  fireEvent.click(
    await within(section()).findByRole('button', { name: 'Activate Project' }),
  );
  for (const label of itemLabels) {
    const group = within(section()).getByRole('group', { name: label });
    for (const radio of within(group).getAllByRole('radio'))
      expect(radio).not.toBeChecked();
  }
  expect(
    within(section()).queryByLabelText('Start exception reason'),
  ).toBeNull();
  fireEvent.click(within(section()).getByRole('button', { name: 'Activate' }));
  expect(
    within(section()).getAllByText('Choose Present or Missing for this item.'),
  ).toHaveLength(7);
  expect(boundary.commands()).toEqual([]);

  for (const label of itemLabels) choose(label, 'Present');
  expect(
    within(section()).queryByLabelText('Start exception reason'),
  ).toBeNull();
  for (const label of [
    'Approved Offer',
    'Contract or precontract',
    'Financial conditions',
  ])
    choose(label, 'Missing');
  const responsibleSelect =
    await within(section()).findByLabelText('To be completed by');
  // The Project's responsible member is preselected when eligible.
  expect(responsibleSelect).toHaveAttribute(
    'data-value',
    ana.workspaceMembershipId,
  );
  expect(responsibleSelect).toHaveTextContent(ana.displayLabel);
  fireEvent.click(within(section()).getByRole('button', { name: 'Activate' }));
  expect(
    within(section()).getByText('Enter a reason of 1–500 characters.'),
  ).toBeInTheDocument();
  expect(
    within(section()).getByText('Enter a valid completion deadline.'),
  ).toBeInTheDocument();
  expect(boundary.commands()).toEqual([]);

  fireEvent.change(within(section()).getByLabelText('Start exception reason'), {
    target: { value: `  ${exceptionReason}  ` },
  });
  fireEvent.change(within(section()).getByLabelText('Completion deadline'), {
    target: { value: '2026-10-15' },
  });
  fireEvent.click(within(section()).getByRole('button', { name: 'Activate' }));

  expect(
    await within(section()).findByText(
      'Start declaration — declared, not verified',
    ),
  ).toBeInTheDocument();
  expect(boundary.commands()).toEqual([
    {
      url: '/api/projects/project/lifecycle-transitions',
      method: 'POST',
      key: expect.any(String),
      body: {
        action: 'activate',
        expectedLifecycleRevision: 0,
        declaration: {
          ...allPresent,
          approvedOffer: 'missing',
          contractOrPrecontract: 'missing',
          financialConditions: 'missing',
        },
        startException: {
          reason: exceptionReason,
          completionMembershipId: ana.workspaceMembershipId,
          completionDueDate: '2026-10-15',
        },
      },
    },
  ]);
  const ready = section();
  expect(within(ready).getAllByText('Active')).not.toHaveLength(0);
  const declaration = within(ready).getByText('Approved Offer').closest('div');
  expect(declaration).toHaveTextContent('Approved OfferMissing');
  expect(
    within(ready).getByText('Project plan').closest('div'),
  ).toHaveTextContent('Project planPresent');
  expect(ready).toHaveTextContent(`Reason: ${exceptionReason}`);
  expect(ready).toHaveTextContent(
    `To be completed by ${ana.displayLabel} by 2026-10-15`,
  );
  expect(
    within(within(ready).getByRole('list')).getByText(
      'Activated with a start exception',
    ),
  ).toBeInTheDocument();
  expect(
    within(ready).getByRole('button', { name: 'Put on hold' }),
  ).toBeInTheDocument();
  expect(onProjectChanged).toHaveBeenCalledTimes(1);
  expect(onActivityRecorded).toHaveBeenCalledTimes(1);
});

it('disables activation without a responsible member and explains why', async () => {
  server();
  show({ responsible: null });
  const activate = await within(section()).findByRole('button', {
    name: 'Activate Project',
  });
  expect(activate).toBeDisabled();
  expect(activate).toHaveAccessibleDescription(
    'Name a responsible member before activating this Project.',
  );
});

it('puts an active Project on hold with a required reason and resumes it after an explicit confirmation', async () => {
  const boundary = server({ state: activeLifecycle });
  show();
  fireEvent.click(
    await within(section()).findByRole('button', { name: 'Put on hold' }),
  );
  fireEvent.click(
    within(section()).getByRole('button', { name: 'Put Project on hold' }),
  );
  expect(
    within(section()).getByText('Enter a reason of 1–500 characters.'),
  ).toBeInTheDocument();
  expect(boundary.commands()).toEqual([]);
  const reason = 'Client asked to pause until the audit date is confirmed.';
  fireEvent.change(within(section()).getByLabelText('Hold reason'), {
    target: { value: reason },
  });
  fireEvent.click(
    within(section()).getByRole('button', { name: 'Put Project on hold' }),
  );
  const resume = await within(section()).findByRole('button', {
    name: 'Resume Project',
  });
  expect(within(section()).getAllByText('On hold')).not.toHaveLength(0);
  expect(section()).toHaveTextContent(`Hold reason${reason}`);
  fireEvent.click(resume);
  expect(boundary.commands()).toHaveLength(1);
  expect(
    within(section()).getByText(
      'Resume this Project? Its Tasks, Documents and responsible member stay unchanged.',
    ),
  ).toBeInTheDocument();
  fireEvent.click(
    within(section()).getByRole('button', { name: 'Confirm resumption' }),
  );
  await within(section()).findByRole('button', { name: 'Put on hold' });
  expect(boundary.commands().map((call) => call.body)).toEqual([
    { action: 'hold', expectedLifecycleRevision: 1, reason },
    { action: 'resume', expectedLifecycleRevision: 2 },
  ]);
  const history = within(section()).getByRole('list');
  expect(
    within(history)
      .getAllByRole('listitem')
      .map((item) => item.querySelector('strong')?.textContent),
  ).toEqual(['Resumed', 'Put on hold', 'Activated']);
  expect(history).toHaveTextContent(`Reason: ${reason}`);
});

it('keeps an uncertain command for an unchanged retry and never aborts the submitted write', async () => {
  let failures = 1;
  const boundary = server({
    state: activeLifecycle,
    command: () =>
      failures-- > 0 ? new Response(null, { status: 502 }) : undefined,
  });
  show();
  fireEvent.click(
    await within(section()).findByRole('button', { name: 'Put on hold' }),
  );
  fireEvent.change(within(section()).getByLabelText('Hold reason'), {
    target: { value: 'Pause' },
  });
  fireEvent.click(
    within(section()).getByRole('button', { name: 'Put Project on hold' }),
  );
  expect(
    await within(section()).findByText(
      'The change is not confirmed. Retry the same change to safely recover its recorded result.',
    ),
  ).toBeInTheDocument();
  fireEvent.click(
    within(section()).getByRole('button', { name: 'Retry lifecycle change' }),
  );
  await within(section()).findByRole('button', { name: 'Resume Project' });
  const [first, retried] = boundary.commands();
  expect(retried).toEqual(first);
  expect(boundary.signals).toEqual([undefined, undefined]);
});

it.each([
  [
    'project_lifecycle_conflict',
    'The Project lifecycle changed. Reload the Project before choosing another action.',
  ],
  [
    'project_lifecycle_transition_invalid',
    'This lifecycle change is no longer available. Reload the Project before choosing another action.',
  ],
  [
    'project_responsible_required',
    'This Project has no responsible member. Name a responsible member before activating it.',
  ],
])(
  'explains a %s refusal and reloads the Project and the lifecycle explicitly',
  async (code, message) => {
    let refused = true;
    const boundary = server({
      command: () =>
        refused
          ? Response.json(
              { statusCode: 409, code, message: 'Refused.' },
              { status: 409 },
            )
          : undefined,
    });
    const { onProjectChanged } = show();
    fireEvent.click(
      await within(section()).findByRole('button', {
        name: 'Activate Project',
      }),
    );
    for (const label of itemLabels) choose(label, 'Present');
    fireEvent.click(
      within(section()).getByRole('button', { name: 'Activate' }),
    );
    expect(await within(section()).findByText(message)).toBeInTheDocument();
    expect(
      within(section()).queryByRole('button', { name: 'Activate Project' }),
    ).toBeNull();
    refused = false;
    const readsBefore = boundary.calls.filter((call) =>
      call.url.endsWith('/lifecycle'),
    ).length;
    fireEvent.click(
      within(section()).getByRole('button', { name: 'Reload Project' }),
    );
    await within(section()).findByRole('button', { name: 'Activate Project' });
    expect(onProjectChanged).toHaveBeenCalledTimes(1);
    expect(
      boundary.calls.filter((call) => call.url.endsWith('/lifecycle')),
    ).toHaveLength(readsBefore + 1);
    expect(within(section()).queryByText(message)).toBeNull();
  },
);

it('explains read-only lifecycle under a superseded original Client and offers no action', async () => {
  server({ state: { ...activeLifecycle, mutable: false } });
  show();
  expect(
    await within(section()).findByText(
      'Read-only: the original Client has been superseded. The lifecycle remains visible.',
    ),
  ).toBeInTheDocument();
  expect(
    within(section()).queryByRole('button', { name: 'Put on hold' }),
  ).toBeNull();
});

it('reports a read error with a retry while the detail stays usable', async () => {
  let failed = true;
  server({
    read: () => (failed ? new Response(null, { status: 500 }) : undefined),
  });
  show();
  expect(
    await within(section()).findByText(
      'The Project lifecycle could not be loaded.',
    ),
  ).toBeInTheDocument();
  failed = false;
  fireEvent.click(
    within(section()).getByRole('button', { name: 'Reload lifecycle' }),
  );
  expect(
    await within(section()).findByText(
      'No lifecycle change has been recorded.',
    ),
  ).toBeInTheDocument();
});

it.each([403, 404])(
  'shows a safe unavailable state without values after a %s',
  async (status) => {
    server({ read: () => new Response(null, { status }) });
    show();
    expect(
      await within(section()).findByText(
        'The Project lifecycle is unavailable. Reload the Project list.',
      ),
    ).toBeInTheDocument();
    expect(within(section()).queryByText('Preparatory')).toBeNull();
    expect(
      within(section()).queryByRole('button', { name: 'Activate Project' }),
    ).toBeNull();
  },
);

it.each([
  { ...preparatoryLifecycle, status: 'archived' },
  { ...preparatoryLifecycle, lifecycleRevision: 1 },
  {
    ...activeLifecycle,
    start: {
      ...activeLifecycle.start,
      exception: null,
      declaration: { ...allPresent, risks: 'missing' },
    },
  },
  {
    ...activeLifecycle,
    transitions: [{ ...activeLifecycle.transitions[0], from: 'on_hold' }],
  },
])('fails closed on a malformed lifecycle: %j', async (malformed) => {
  server({ read: () => Response.json(malformed) });
  show();
  expect(
    await within(section()).findByText(
      'The Project lifecycle could not be loaded.',
    ),
  ).toBeInTheDocument();
});

it.each([
  [
    'the Approver assignment',
    {
      ...approver,
      activeCompany: {
        ...approverCompany,
        projectApproverPermissionAssignmentId: 'approver-assignment-2',
      },
    },
  ],
  [
    'the active Company',
    {
      ...approver,
      activeCompany: {
        ...approverCompany,
        id: 'company-2',
        displayName: 'BIC',
      },
    },
  ],
] satisfies [string, ActorContext][])(
  'never renders a lifecycle read that belongs to a previous actor context after a change of %s',
  async (_, changed) => {
    let release: (response: Response) => void = () => undefined;
    let held = true;
    server({
      read: (state) =>
        held
          ? new Promise<Response>((resolve) => {
              release = resolve;
            })
          : Response.json(state),
    });
    const view = show();
    expect(
      within(section()).getByText('Loading the Project lifecycle…'),
    ).toBeInTheDocument();
    held = false;
    view.rerender(
      <ProjectLifecycle
        actor={changed}
        identity={view.identity}
        projectId="project"
        responsible={ana}
      />,
    );
    await within(section()).findByRole('button', { name: 'Activate Project' });
    await act(async () => {
      release(Response.json(activeLifecycle));
    });
    await waitFor(() =>
      expect(
        within(section()).getByRole('button', { name: 'Activate Project' }),
      ).toBeInTheDocument(),
    );
    expect(within(section()).queryByText('Put on hold')).toBeNull();
  },
);
