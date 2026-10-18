import { afterEach, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '../test/render-with-interface-locale';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { ProjectStage } from './ProjectStage';
import { copiedPlanFixture } from './project-template.test-fixtures';

const projectId = '30000000-0000-4000-8000-000000000001';
const actor: ActorContext = {
  internalUserId: 'owner',
  workspaceMembershipId: 'member',
  workspaceId: 'workspace',
  workspaceName: 'Workspace',
  displayName: 'Owner',
  email: 'owner@example.test',
  active: true,
  workspacePermissions: ['client.manage'],
  activeCompany: {
    id: 'company',
    displayName: 'Company',
    projectPermissions: ['project.read'],
    taskPermissions: ['task.read'],
    taskPermissionAssignmentId: 'task',
    taskPermissionSetVersion: 'v1',
    projectTemplatePermissions: ['project.template.read'],
    projectTemplatePermissionAssignmentId: 'template',
    projectTemplatePermissionSetVersion: 'v1',
    projectStagePermissions: ['project.stage.advance'],
    projectStagePermissionAssignmentId: 'stage',
    projectStagePermissionSetVersion: 'v1',
  },
};
function progress(gate = 'ready') {
  return {
    progress: {
      currentStageKey: 'scoping',
      currentStageTitle: 'Cadrage',
      stageRevision: 0,
      nextStage: { key: 'preparation', title: 'Préparation' },
      requiredTasks: copiedPlanFixture.stages[0].tasks.map((task) => ({
        ...task,
        status: 'done',
        version: 2,
      })),
      gate,
      canAdvance: gate === 'ready',
      transitions: [],
    },
  };
}
afterEach(() => vi.unstubAllGlobals());

it('permits a Task reader without Task manage to request advance and clears cached progress on a dedicated command denial', async () => {
  const requests: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(new URL(input.toString(), window.location.origin).pathname);
      return init?.method === 'POST'
        ? new Response(null, { status: 403 })
        : Response.json(progress());
    }),
  );
  render(
    <ProjectStage
      actor={actor}
      identity={deterministicBrowserIdentity()}
      projectId={projectId}
    />,
  );
  const advance = await screen.findByRole('button', {
    name: 'Advance to Préparation',
  });
  expect(advance).toBeEnabled();
  fireEvent.click(advance);
  await screen.findByText(
    'Stage progress is unavailable. Independent Project and Task work remains available under its own permissions.',
  );
  expect(screen.queryByText('Cadrage')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('heading', { name: 'Stage history' }),
  ).not.toBeInTheDocument();
  expect(requests).toContain(`/api/projects/${projectId}/stage-advance`);
});

it('requires an explicit reload after a stale revision and keeps a confirmed transition distinct from refresh failure', async () => {
  let writes = 0;
  let reads = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        writes += 1;
        return writes === 1
          ? new Response(null, { status: 409 })
          : Response.json(
              {
                projectId,
                transitionId: '40000000-0000-4000-8000-000000000001',
                stageRevision: 1,
                fromStageKey: 'scoping',
                toStageKey: 'preparation',
              },
              { status: 201 },
            );
      }
      reads += 1;
      return reads > 2
        ? new Response(null, { status: 503 })
        : Response.json(progress());
    }),
  );
  render(
    <ProjectStage
      actor={actor}
      identity={deterministicBrowserIdentity()}
      projectId={projectId}
    />,
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Advance to Préparation' }),
  );
  await screen.findByText(
    'Stage progress changed or this intent conflicts. Reload before choosing another action.',
  );
  expect(
    screen.getByRole('button', { name: 'Advance to Préparation' }),
  ).toBeDisabled();
  fireEvent.click(
    screen.getByRole('button', { name: 'Reload stage progress' }),
  );
  const advance = await screen.findByRole('button', {
    name: 'Advance to Préparation',
  });
  await waitFor(() => expect(advance).toBeEnabled());
  fireEvent.click(advance);
  await screen.findByText(
    'Stage advance confirmed. Current progress could not be refreshed. Reload to see it.',
  );
  expect(
    screen.queryByRole('button', { name: 'Retry stage advance' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Advance to Préparation' }),
  ).toBeDisabled();
  expect(writes).toBe(2);
});

it.each(['company', 'session', 'dedicated'] as const)(
  'suppresses an old pending command after %s authority changes',
  async (boundary) => {
    let release: ((response: Response) => void) | undefined;
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    let retired = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') return pending;
        return retired
          ? new Response(null, { status: 403 })
          : Response.json(progress());
      }),
    );
    const identity = deterministicBrowserIdentity();
    const view = render(
      <ProjectStage actor={actor} identity={identity} projectId={projectId} />,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Advance to Préparation' }),
    );
    await screen.findByText('Confirming stage advance…');
    retired = true;
    const changed: ActorContext = {
      ...actor,
      activeCompany: {
        ...actor.activeCompany,
        id: boundary === 'company' ? 'other-company' : 'company',
        displayName: 'Company',
        projectStagePermissionAssignmentId:
          boundary === 'dedicated' ? 'replacement-stage' : 'stage',
      },
    };
    view.rerender(
      <ProjectStage
        actor={changed}
        identity={
          boundary === 'session' ? deterministicBrowserIdentity() : identity
        }
        projectId={projectId}
      />,
    );
    await screen.findByText(
      'Stage progress is unavailable. Independent Project and Task work remains available under its own permissions.',
    );
    await act(async () => {
      if (!release) throw new Error('Missing held transport reply.');
      release(
        Response.json(
          {
            projectId,
            transitionId: '40000000-0000-4000-8000-000000000001',
            stageRevision: 1,
            fromStageKey: 'scoping',
            toStageKey: 'preparation',
          },
          { status: 201 },
        ),
      );
    });
    const stage = screen.getByRole('region', { name: 'Project stage' });
    expect(
      within(stage).queryByText(
        'Stage advance confirmed. The Project lifecycle is unchanged.',
      ),
    ).not.toBeInTheDocument();
    expect(within(stage).queryByText('Cadrage')).not.toBeInTheDocument();
  },
);

it('rejects malformed gate facts and preserves only a readonly progress read without the dedicated grant', async () => {
  let invalid = true;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json(
        invalid
          ? {
              progress: {
                ...progress().progress,
                canAdvance: true,
                gate: 'required_tasks_incomplete',
              },
            }
          : progress('advance_authority_required'),
      ),
    ),
  );
  const readonly: ActorContext = {
    ...actor,
    activeCompany: {
      ...actor.activeCompany,
      id: 'company',
      displayName: 'Company',
      projectStagePermissions: [],
      projectStagePermissionAssignmentId: undefined,
      projectStagePermissionSetVersion: undefined,
    },
  };
  render(
    <ProjectStage
      actor={readonly}
      identity={deterministicBrowserIdentity()}
      projectId={projectId}
    />,
  );
  await screen.findByText('Stage progress could not be loaded.');
  expect(screen.queryByText('Cadrage')).not.toBeInTheDocument();
  invalid = false;
  fireEvent.click(
    screen.getByRole('button', { name: 'Reload stage progress' }),
  );
  await screen.findByText('Explicit stage-advance access is required.');
  expect(
    screen.getByRole('button', { name: 'Advance to Préparation' }),
  ).toBeDisabled();
  expect(
    screen.getByRole('heading', { name: 'Stage history' }),
  ).toBeInTheDocument();
});
