import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import type { ActorContext } from './access-types';
import { changeValue } from './test/select-option';
import {
  isLifecycleRead,
  preparatoryLifecycle,
} from './project/project-lifecycle.test-fixtures';
import {
  copiedPlanFixture,
  templateFixture,
} from './project/project-template.test-fixtures';

const companyId = '10000000-0000-4000-8000-000000000001';
const clientId = '20000000-0000-4000-8000-000000000001';
const projectId = '30000000-0000-4000-8000-000000000001';
const company = {
  id: companyId,
  displayName: 'Company Demo',
  clientPermissions: [],
  projectPermissions: ['project.read', 'project.create'],
  taskPermissions: ['task.read', 'task.manage'],
  taskPermissionAssignmentId: 'task-grant',
  taskPermissionSetVersion: 'v1',
} satisfies NonNullable<ActorContext['activeCompany']>;
const ordinaryActor: ActorContext = {
  internalUserId: 'owner',
  workspaceMembershipId: 'member',
  workspaceId: 'workspace',
  workspaceName: 'Workspace',
  displayName: 'Owner',
  email: 'owner@example.test',
  active: true,
  workspacePermissions: ['client.manage', 'company.manage'],
  activeCompany: company,
};
const templateActor: ActorContext = {
  ...ordinaryActor,
  activeCompany: {
    ...company,
    projectStagePermissions: ['project.stage.advance'],
    projectStagePermissionAssignmentId: 'stage-grant',
    projectStagePermissionSetVersion: 'v1',
    projectTemplatePermissions: [
      'project.template.read',
      'project.template.instantiate',
    ],
    projectTemplatePermissionAssignmentId: 'template-grant',
    projectTemplatePermissionSetVersion: 'v1',
  },
};
const project = {
  id: projectId,
  companyId,
  clientAccountId: clientId,
  clientDisplayName: 'Independent Client',
  title: 'Independent preparation',
  status: 'preparatory',
  createdAt: '2026-10-16T12:00:00.000Z',
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/#projects');
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

it.each(['Template', 'Stage'] as const)(
  'preserves ordinary Project and Task work when a real App actor revalidation changes only dedicated %s authority',
  async (authority) => {
    const revalidatedActor: ActorContext =
      authority === 'Template'
        ? ordinaryActor
        : {
            ...templateActor,
            activeCompany: {
              ...company,
              projectTemplatePermissions: [
                'project.template.read',
                'project.template.instantiate',
              ],
              projectTemplatePermissionAssignmentId: 'template-grant',
              projectTemplatePermissionSetVersion: 'v1',
            },
          };
    let currentActor = templateActor;
    let returnedUpdatedActor = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(input.toString(), window.location.origin).pathname;
        if (path === '/api/access/current-actor') {
          if (currentActor === revalidatedActor) returnedUpdatedActor = true;
          return Response.json(currentActor);
        }
        if (path === '/api/companies' && init?.method === 'POST') {
          // A failed public operation revalidates the selected Company actor.
          // No administration mutation or Client-authority callback is involved.
          currentActor = revalidatedActor;
          return new Response(null, { status: 403 });
        }
        if (path === '/api/companies')
          return Response.json([
            { id: companyId, displayName: company.displayName },
          ]);
        if (path === '/api/activity-log') return Response.json({ events: [] });
        if (path === '/api/operational-home')
          return Response.json({
            companyId,
            today: '2026-10-16',
            summaries: [
              { kind: 'active_clients', count: 1 },
              { kind: 'open_projects', count: 1 },
              { kind: 'overdue_tasks', count: 0 },
            ],
          });
        if (path === '/api/clients')
          return Response.json([
            { id: clientId, displayName: project.clientDisplayName },
          ]);
        if (path === '/api/projects') return Response.json([project]);
        if (path === `/api/projects/${projectId}`)
          return Response.json(project);
        if (path === '/api/project-templates')
          return Response.json({ templates: [templateFixture] });
        if (path === `/api/projects/${projectId}/template`)
          return Response.json({ template: copiedPlanFixture });
        if (path === `/api/projects/${projectId}/stage-progress`)
          return Response.json({
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
              gate:
                currentActor === revalidatedActor
                  ? 'advance_authority_required'
                  : 'ready',
              canAdvance: currentActor !== revalidatedActor,
              transitions: [],
            },
          });
        if (path === `/api/projects/${projectId}/tasks`)
          return Response.json({ mutable: true, tasks: [] });
        if (path === `/api/projects/${projectId}/eligible-task-assignees`)
          return Response.json({ members: [] });
        if (path === '/api/assigned-tasks') return Response.json({ tasks: [] });
        if (isLifecycleRead(path)) return Response.json(preparatoryLifecycle);
        return new Response(null, { status: 404 });
      }),
    );
    render(<App identity={deterministicBrowserIdentity()} />);
    const projects = await screen.findByRole('region', { name: 'Projects' });
    fireEvent.click(
      await within(projects).findByRole('button', {
        name: `${project.title} Client: ${project.clientDisplayName}`,
      }),
    );
    const opened = await within(projects).findByRole('article', {
      name: project.title,
    });
    await within(opened).findByRole('region', {
      name: 'Plan copied from template',
    });
    const tasks = await within(projects).findByRole('region', {
      name: 'Tasks',
    });
    const taskTitle = await within(tasks).findByRole('textbox', {
      name: 'Task title',
    });
    changeValue(taskTitle, 'Preserve this independent Task draft');
    changeValue(
      within(projects).getByRole('textbox', {
        name: 'Project title',
      }),
      'Preserve this manual Project draft',
    );
    changeValue(
      within(projects).getByRole('combobox', { name: 'Client' }),
      clientId,
    );

    const navigation = screen.getByRole('navigation', {
      name: 'Primary navigation',
    });
    fireEvent.click(
      within(navigation).getByRole('link', { name: 'Companies' }),
    );
    const registration = await screen.findByRole('region', {
      name: 'Provider Company',
    });
    changeValue(
      within(registration).getByRole('textbox', {
        name: 'Company display name',
      }),
      'Attempted Company',
    );
    fireEvent.click(
      within(registration).getByRole('button', { name: 'Register Company' }),
    );
    await within(registration).findByText(
      'You do not have permission to register or view Companies in this Workspace.',
    );
    await waitFor(() => expect(returnedUpdatedActor).toBe(true));

    fireEvent.click(within(navigation).getByRole('link', { name: 'Projects' }));
    const retainedProjects = screen.getByRole('region', { name: 'Projects' });
    expect(
      within(retainedProjects).getByRole('article', { name: project.title }),
    ).toBe(opened);
    expect(taskTitle).toBeInTheDocument();
    expect(taskTitle).toHaveValue('Preserve this independent Task draft');
    expect(
      within(retainedProjects).getByRole('textbox', {
        name: 'Project title',
      }),
    ).toHaveValue('Preserve this manual Project draft');
    expect(
      within(retainedProjects).getByRole('combobox', {
        name: 'Client',
      }),
    ).toHaveTextContent(project.clientDisplayName);
    if (authority === 'Template') {
      expect(
        within(retainedProjects).queryByRole('combobox', {
          name: 'Project template',
        }),
      ).not.toBeInTheDocument();
      expect(
        within(retainedProjects).queryByRole('region', {
          name: 'Plan copied from template',
        }),
      ).not.toBeInTheDocument();
    } else {
      expect(
        within(retainedProjects).getByRole('region', {
          name: 'Plan copied from template',
        }),
      ).toBeInTheDocument();
      await within(retainedProjects).findByText(
        'Explicit stage-advance access is required.',
      );
      expect(
        within(retainedProjects).getByRole('button', {
          name: 'Advance to Préparation',
        }),
      ).toBeDisabled();
    }
  },
);

it('shows a blocked copied stage then explicitly advances with an unchanged retry and reloads immutable history', async () => {
  const actor: ActorContext = {
    ...templateActor,
    activeCompany: {
      ...templateActor.activeCompany,
      ...company,
      projectTemplatePermissions: [
        'project.template.read',
        'project.template.instantiate',
      ],
      projectTemplatePermissionAssignmentId: 'template-grant',
      projectTemplatePermissionSetVersion: 'v1',
      projectStagePermissions: ['project.stage.advance'],
      projectStagePermissionAssignmentId: 'stage-grant',
      projectStagePermissionSetVersion: 'v1',
    },
  };
  let done = false;
  let advanced = false;
  const writes: {
    body: string | undefined;
    key: string | null;
    contentType: string | null;
  }[] = [];
  const requiredTasks = copiedPlanFixture.stages[0].tasks.map((task) => ({
    ...task,
    status: 'todo',
    version: 1,
  }));
  const transition = {
    projectId,
    transitionId: '40000000-0000-4000-8000-000000000001',
    stageRevision: 1,
    fromStageKey: 'scoping',
    fromStageTitle: 'Cadrage',
    toStageKey: 'preparation',
    toStageTitle: 'Préparation',
    occurredAt: '2026-10-18T12:00:00.000Z',
    actor: {
      internalUserId: 'owner',
      workspaceMembershipId: 'member',
      displayName: 'Owner',
    },
    requiredTasks: requiredTasks.map((task) => ({
      taskId: task.taskId,
      version: 2,
    })),
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(input.toString(), window.location.origin).pathname;
      if (path === '/api/access/current-actor') return Response.json(actor);
      if (path === '/api/companies')
        return Response.json([
          { id: companyId, displayName: company.displayName },
        ]);
      if (path === '/api/activity-log') return Response.json({ events: [] });
      if (path === '/api/operational-home')
        return Response.json({ companyId, today: '2026-10-18', summaries: [] });
      if (path === '/api/clients')
        return Response.json([
          { id: clientId, displayName: project.clientDisplayName },
        ]);
      if (path === '/api/projects') return Response.json([project]);
      if (path === `/api/projects/${projectId}`) return Response.json(project);
      if (path === '/api/project-templates')
        return Response.json({ templates: [templateFixture] });
      if (path === `/api/projects/${projectId}/template`)
        return Response.json({ template: copiedPlanFixture });
      if (path === `/api/projects/${projectId}/stage-progress`)
        return Response.json({
          progress: {
            currentStageKey: advanced ? 'preparation' : 'scoping',
            currentStageTitle: advanced ? 'Préparation' : 'Cadrage',
            stageRevision: advanced ? 1 : 0,
            nextStage: advanced
              ? null
              : { key: 'preparation', title: 'Préparation' },
            requiredTasks: advanced
              ? copiedPlanFixture.stages[1].tasks.map((task) => ({
                  ...task,
                  status: 'todo',
                  version: 1,
                }))
              : requiredTasks.map((task) => ({
                  ...task,
                  status: done ? 'done' : 'todo',
                  version: done ? 2 : 1,
                })),
            gate: advanced
              ? 'last_supported_stage'
              : done
                ? 'ready'
                : 'required_tasks_incomplete',
            canAdvance: done && !advanced,
            transitions: advanced ? [transition] : [],
          },
        });
      if (path === `/api/projects/${projectId}/stage-advance`) {
        writes.push({
          body: typeof init?.body === 'string' ? init.body : undefined,
          key: new Headers(init?.headers).get('idempotency-key'),
          contentType: new Headers(init?.headers).get('content-type'),
        });
        advanced = true;
        return writes.length === 1
          ? new Response(null, { status: 503 })
          : Response.json(
              {
                projectId,
                transitionId: transition.transitionId,
                stageRevision: 1,
                fromStageKey: 'scoping',
                toStageKey: 'preparation',
              },
              { status: 201 },
            );
      }
      if (path === `/api/projects/${projectId}/tasks`)
        return Response.json({ mutable: true, tasks: [] });
      if (path === `/api/projects/${projectId}/eligible-task-assignees`)
        return Response.json({ members: [] });
      if (isLifecycleRead(path)) return Response.json(preparatoryLifecycle);
      return new Response(null, { status: 404 });
    }),
  );
  render(<App identity={deterministicBrowserIdentity()} />);
  const projects = await screen.findByRole('region', { name: 'Projects' });
  fireEvent.click(
    await within(projects).findByRole('button', {
      name: `${project.title} Client: ${project.clientDisplayName}`,
    }),
  );
  const stage = await within(projects).findByRole('region', {
    name: 'Project stage',
  });
  await within(stage).findByText(
    'Complete both required Tasks before advancing. Cancelled Tasks do not satisfy this gate.',
  );
  expect(
    within(stage).getByRole('button', { name: 'Advance to Préparation' }),
  ).toBeDisabled();
  done = true;
  fireEvent.click(
    within(stage).getByRole('button', { name: 'Reload stage progress' }),
  );
  const advance = await within(stage).findByRole('button', {
    name: 'Advance to Préparation',
  });
  await waitFor(() => expect(advance).toBeEnabled());
  fireEvent.click(advance);
  await within(stage).findByText(
    'The stage change could not be confirmed. Retry the exact same intent explicitly.',
  );
  fireEvent.click(
    within(stage).getByRole('button', { name: 'Retry stage advance' }),
  );
  await within(stage).findByText(
    'Last supported stage. No further transition is available.',
  );
  expect(writes).toHaveLength(2);
  expect(writes[0]?.contentType).toBe('application/json');
  expect(writes[1]).toEqual(writes[0]);
  expect(writes[0]?.body).toBe(
    JSON.stringify({
      expectedStageKey: 'scoping',
      expectedStageRevision: 0,
      targetStageKey: 'preparation',
    }),
  );
  expect(within(stage).getByText('Owner')).toBeInTheDocument();
  expect(
    within(stage).getByRole('heading', { name: 'Stage history' }),
  ).toBeInTheDocument();
});
