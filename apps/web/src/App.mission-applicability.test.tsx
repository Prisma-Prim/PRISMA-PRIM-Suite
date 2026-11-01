import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from './test/render-with-interface-locale';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import { preparatoryLifecycle } from './project/project-lifecycle.test-fixtures';
import {
  actor,
  companyId,
  projectId,
  clientId,
  project,
  plan,
  snapshot,
  installParentServer,
} from './test/mission-applicability-app-fixture';
import { changeValue } from './test/select-option';
import { waitFor } from './test/render-with-interface-locale';
import type { TaskView } from './project/task-response';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/#projects');
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

it('uses the actual App parent for a literal proposal, preserves independent Project draft and explicitly retries the exact uncertain command before confirmed refresh failure', async () => {
  const writes: Array<{ body: unknown; key: string | null }> = [];
  let confirmed = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(input.toString(), window.location.origin).pathname;
      if (path === '/api/access/current-actor') return Response.json(actor);
      if (path === '/api/companies')
        return Response.json([{ id: companyId, displayName: 'Company DEMO' }]);
      if (path === '/api/activity-log') return Response.json({ events: [] });
      if (path === '/api/operational-home')
        return Response.json({ companyId, today: '2026-10-29', summaries: [] });
      if (path === '/api/clients')
        return Response.json([
          { id: clientId, displayName: project.clientDisplayName },
        ]);
      if (path === '/api/projects') return Response.json([project]);
      if (path === `/api/projects/${projectId}`) return Response.json(project);
      if (path.endsWith('/lifecycle'))
        return Response.json(preparatoryLifecycle);
      if (path.endsWith('/template')) return Response.json({ template: plan });
      if (path === '/api/project-templates')
        return Response.json({
          templates: [],
          headVersion: 0,
          nextBeforeVersion: null,
        });
      if (path.endsWith('/tasks'))
        return Response.json({ mutable: true, tasks: [] });
      if (path.endsWith('/eligible-task-assignees'))
        return Response.json({ members: [] });
      if (path.endsWith('/mission-result-reviews'))
        return Response.json({ review: null });
      if (path.endsWith('/mission-readiness'))
        return Response.json({ assessment: null });
      if (path.endsWith('/mission-applicability/history'))
        return Response.json({
          history: {
            kind: 'available',
            facts: [],
            hasMore: false,
            nextBeforeRevision: null,
          },
        });
      if (path.endsWith('/mission-applicability')) {
        if (init?.method === 'POST') {
          const body: unknown = JSON.parse(
            typeof init.body === 'string' ? init.body : 'null',
          );
          writes.push({
            body,
            key: new Headers(init.headers).get('idempotency-key'),
          });
          if (writes.length === 1) throw new TypeError('Synthetic lost reply');
          confirmed = true;
          return Response.json(
            {
              action: 'recorded',
              projectId,
              factId: 'fact-proposal-demo',
              applicabilityRevision: 1,
            },
            { status: 201 },
          );
        }
        return confirmed
          ? new Response(null, { status: 503 })
          : Response.json(snapshot());
      }
      return new Response(null, { status: 404 });
    }),
  );
  render(
    <StrictMode>
      <App identity={deterministicBrowserIdentity()} />
    </StrictMode>,
  );
  const projects = await screen.findByRole('region', { name: 'Projects' });
  fireEvent.change(
    await within(projects).findByRole('textbox', { name: 'Project title' }),
    { target: { value: 'Independent native draft DEMO' } },
  );
  fireEvent.click(
    await within(projects).findByRole('button', {
      name: new RegExp(project.title),
    }),
  );
  const region = await screen.findByRole('region', {
    name: 'Mission activity applicability',
  });
  changeValue(
    await within(region).findByRole('combobox', { name: 'Source activity' }),
    '40000000-0000-4000-8000-000000000007',
  );
  fireEvent.change(
    within(region).getByRole('textbox', {
      name: 'Proposal reason (1–1000 characters)',
    }),
    {
      target: { value: ' DEMO literal\r\nЖ / é / 🌍 <script>plain</script> ' },
    },
  );
  fireEvent.change(
    within(region).getByRole('textbox', {
      name: 'Reported scope basis (1–2000 characters)',
    }),
    { target: { value: ' DEMO exact agreed case scope ' } },
  );
  fireEvent.change(
    within(region).getByRole('textbox', {
      name: 'Reported agreement basis (1–2000 characters)',
    }),
    { target: { value: ' DEMO no contractual change reported ' } },
  );
  fireEvent.click(
    within(region).getByRole('button', { name: 'Review exact proposal' }),
  );
  const reviewed = within(region).getByRole('region', {
    name: 'Facts reviewed for this command',
  });
  function reviewedValue(label: string) {
    const value = within(reviewed).getByText(label).nextElementSibling;
    if (!(value instanceof HTMLElement))
      throw new Error('Missing observed value');
    return value;
  }
  expect(reviewedValue('Ordinary Task and version')).toHaveTextContent(
    'Elaborarea documentației SMI',
  );
  expect(reviewedValue('Ordinary Task and version')).toHaveTextContent(
    'Version 1',
  );
  expect(reviewedValue('Declared result and revision')).toHaveTextContent(
    'No recorded result',
  );
  expect(reviewedValue('Declared result and revision')).toHaveTextContent(
    'Version 0',
  );
  expect(reviewedValue('Applicability stream version')).toHaveTextContent('0');
  expect(
    reviewedValue('Project state and lifecycle version'),
  ).toHaveTextContent('Version 0');
  fireEvent.click(
    within(region).getByRole('button', { name: 'Record proposal' }),
  );
  expect(
    await within(region).findByText(
      'The reply is uncertain. Retry the identical command to confirm its recorded outcome.',
    ),
  ).toBeInTheDocument();
  await act(async () =>
    fireEvent.click(
      within(region).getByRole('button', { name: 'Retry identical command' }),
    ),
  );
  expect(
    await within(region).findByText('Applicability fact confirmed.'),
  ).toBeInTheDocument();
  expect(
    await within(region).findByText(
      'Current applicability could not be loaded.',
    ),
  ).toBeInTheDocument();
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual(writes[0]);
  expect(writes[0]?.body).toMatchObject({
    action: 'PROPOSE',
    taskId: '40000000-0000-4000-8000-000000000007',
    expectedApplicabilityRevision: 0,
    expectedTaskVersion: 1,
    expectedResultRevision: 0,
    expectedLifecycleRevision: 0,
    reason: 'DEMO literal\nЖ / é / 🌍 <script>plain</script>',
    scopeBasis: 'DEMO exact agreed case scope',
    agreement: {
      kind: 'NO_CONTRACTUAL_CHANGE_REPORTED',
      basis: 'DEMO no contractual change reported',
    },
  });
  expect(
    within(projects).getByRole('textbox', { name: 'Project title' }),
  ).toHaveValue('Independent native draft DEMO');
});

it.each([200, 403])(
  'keeps an already started admin selected-Actor HTTP %s recovery inert after actual App acceptance of a recovery-only newer Actor',
  async (status) => {
    const administrator = {
      ...actor,
      workspacePermissions: ['client.manage', 'company.assignment.manage'],
    };
    const oldActor = {
      ...administrator,
      activeCompany: {
        ...actor.activeCompany,
        missionResultReviewPermissions: ['project.mission_result.review'],
        missionResultReviewerAssignmentId: 'reviewer-old-capture',
        missionResultReviewerPermissionSetVersion: 'v1',
      },
    };
    const freshActor = {
      ...oldActor,
      displayName: 'Fresh Actor DEMO',
      activeCompany: {
        ...oldActor.activeCompany,
        missionResultReviewerAssignmentId: 'reviewer-current-capture',
      },
    };
    let currentActor: unknown = administrator,
      granted = false,
      holdNextActor = false,
      readDenied = false,
      finishRecovery: ((response: Response) => void) | undefined,
      activityReads = 0;
    installParentServer(
      () => currentActor,
      async (path, init) => {
        if (path === '/api/activity-log') {
          activityReads++;
          return Response.json({ events: [] });
        }
        if (path === '/api/access/current-actor' && holdNextActor) {
          holdNextActor = false;
          return new Promise((resolve) => {
            finishRecovery = resolve;
          });
        }
        if (path === '/api/company-context-assignments/administration')
          return Response.json({
            members: [
              {
                workspaceMembershipId: actor.workspaceMembershipId,
                displayName: actor.displayName,
                email: actor.email,
              },
            ],
            companies: [{ id: companyId, displayName: 'Company DEMO' }],
            assignments: granted
              ? [
                  {
                    id: 'reviewer-old-capture',
                    workspaceMembershipId: actor.workspaceMembershipId,
                    companyId,
                    bundle: 'Company Mission Result Reviewer',
                    permissionSetVersion: 'v1',
                    active: true,
                  },
                ]
              : [],
          });
        if (
          path === '/api/company-mission-result-reviewer-assignments' &&
          init?.method === 'POST'
        ) {
          granted = true;
          holdNextActor = true;
          return Response.json(
            {
              id: 'reviewer-old-capture',
              workspaceMembershipId: actor.workspaceMembershipId,
              companyId,
              bundle: 'Company Mission Result Reviewer',
              permissionSetVersion: 'v1',
              active: true,
            },
            { status: 201 },
          );
        }
        if (path.endsWith('/mission-applicability') && readDenied) {
          readDenied = false;
          return new Response(null, { status: 403 });
        }
        return undefined;
      },
    );
    render(
      <StrictMode>
        <App identity={deterministicBrowserIdentity()} />
      </StrictMode>,
    );
    const projects = await screen.findByRole('region', { name: 'Projects' });
    fireEvent.change(
      await within(projects).findByRole('textbox', { name: 'Project title' }),
      { target: { value: 'Independent parent draft DEMO' } },
    );
    fireEvent.click(
      await within(projects).findByRole('button', {
        name: new RegExp(project.title),
      }),
    );
    const applicability = await screen.findByRole('region', {
      name: 'Mission activity applicability',
    });
    await within(applicability).findByRole('combobox', {
      name: 'Source activity',
    });
    fireEvent.click(
      screen
        .getByRole('navigation', { name: 'Primary navigation' })
        .querySelector('a[href="#access"]') ??
        screen.getByRole('link', { name: /Access/i }),
    );
    const access = await screen.findByRole('region', {
      name: 'Company access',
    });
    changeValue(
      await within(access).findByRole('combobox', { name: 'Workspace member' }),
      actor.workspaceMembershipId,
    );
    changeValue(
      within(access).getByRole('combobox', { name: 'Company' }),
      companyId,
    );
    changeValue(
      within(access).getByRole('combobox', { name: 'Access bundle' }),
      'mission-result-reviewer',
    );
    fireEvent.click(
      within(access).getByRole('button', { name: 'Grant access' }),
    );
    await waitFor(() => expect(finishRecovery).toBeTypeOf('function'));
    currentActor = freshActor;
    readDenied = true;
    fireEvent.click(
      within(
        screen.getByRole('navigation', { name: 'Primary navigation' }),
      ).getByRole('link', { name: 'Projects' }),
    );
    fireEvent.click(
      within(applicability).getByRole('button', {
        name: 'Reload current applicability',
      }),
    );
    expect(await screen.findByText('Fresh Actor DEMO')).toBeInTheDocument();
    const readsBefore = activityReads;
    await act(async () => {
      finishRecovery?.(
        status === 200
          ? Response.json(oldActor)
          : new Response(null, { status }),
      );
    });
    expect(screen.getByText('Fresh Actor DEMO')).toBeInTheDocument();
    expect(activityReads).toBe(readsBefore);
    expect(
      within(projects).getByRole('textbox', { name: 'Project title' }),
    ).toHaveValue('Independent parent draft DEMO');
  },
  20000,
);

it.each(
  (['draft', 'pending', 'uncertain', 'confirmed'] as const).flatMap((phase) =>
    (['risk', 'next-action', 'internal-task'] as const).map((grant) => ({
      phase,
      grant,
    })),
  ),
)(
  'preserves independent native Task/result/Project $phase work through unrelated $grant grant publication and sibling Project navigation',
  async ({ phase, grant }) => {
    const recorder = {
      ...actor,
      workspacePermissions: ['client.manage', 'company.assignment.manage'],
      activeCompany: {
        ...actor.activeCompany,
        taskResultPermissions: ['task.result.record'],
        taskResultRecorderAssignmentId: 'result-recorder-demo',
        taskResultRecorderPermissionSetVersion: 'v1',
      },
    };
    const attribution = {
        internalUserId: actor.internalUserId,
        workspaceMembershipId: actor.workspaceMembershipId,
        displayName: actor.displayName,
      },
      instant = '2026-10-29T00:00:00.000Z';
    const tasks = plan.activities.map((row) => {
      const base = {
        id: row.taskId,
        companyId,
        projectId,
        clientAccountId: clientId,
        title: row.title,
        description: null,
        assignee: null,
        dueDate: null,
        priority: 'normal' as const,
        version: 1,
        createdAt: instant,
        updatedAt: instant,
        createdBy: attribution,
      };
      return { ...base, status: 'todo' as const, completion: null };
    }) satisfies TaskView[];
    const task = tasks[0];
    if (!task) throw new Error('Expected native Task');
    const sibling = {
      ...project,
      id: '30000000-0000-4000-8000-000000000002',
      title: 'Sibling Project DEMO',
    };
    const reference = {
      documentId: 'document-demo',
      versionId: 'version-demo',
      versionNumber: 1,
      title: 'Independent frozen output DEMO',
      status: 'official',
      representationId: 'pdf-demo',
    };
    const declaration = {
      id: 'result-demo',
      revision: 1,
      kind: 'recorded',
      declaration: 'Independent result intent DEMO',
      actor: attribution,
      occurredAt: instant,
      reference,
    };
    const writes: Array<{ body: unknown; key: string | null }> = [];
    let recorded = false,
      finish: ((response: Response) => void) | undefined;
    const receipt = {
      action: 'recorded',
      taskId: task.id,
      resultId: 'result-demo',
      resultRevision: 1,
    };
    let currentActor: unknown = recorder,
      granted = false;
    const publishedAssignment = {
      id: 'independent-assignment-demo',
      workspaceMembershipId: actor.workspaceMembershipId,
      companyId,
      bundle:
        grant === 'risk'
          ? 'Company Operational Risk Reader'
          : grant === 'internal-task'
            ? 'Company Internal Task Manager'
            : 'Company Project Next Action Coordinator',
      permissionSetVersion: 'v1',
      active: true,
    };
    installParentServer(
      () => currentActor,
      async (path, init) => {
        if (path === '/api/company-context-assignments/administration')
          return Response.json({
            members: [
              {
                workspaceMembershipId: actor.workspaceMembershipId,
                displayName: actor.displayName,
                email: actor.email,
              },
            ],
            companies: [{ id: companyId, displayName: 'Company DEMO' }],
            assignments: granted ? [publishedAssignment] : [],
          });
        if (
          path ===
            (grant === 'risk'
              ? '/api/company-operational-risk-reader-assignments'
              : grant === 'internal-task'
                ? '/api/company-internal-task-manager-assignments'
                : '/api/company-project-next-action-coordinator-assignments') &&
          init?.method === 'POST'
        ) {
          granted = true;
          currentActor = {
            ...recorder,
            displayName: 'Fresh independent Actor DEMO',
            activeCompany: {
              ...recorder.activeCompany,
              ...(grant === 'risk'
                ? {
                    operationalRiskPermissions: ['risk.read'],
                    operationalRiskReaderAssignmentId: publishedAssignment.id,
                    operationalRiskReaderPermissionSetVersion: 'v1',
                  }
                : grant === 'internal-task'
                  ? {
                      internalTaskPermissions: [
                        'internal_task.read',
                        'internal_task.manage',
                      ],
                      internalTaskManagerAssignmentId: publishedAssignment.id,
                      internalTaskManagerPermissionSetVersion: 'v1',
                    }
                  : {
                      projectNextActionPermissions: [
                        'project.next_action.update',
                      ],
                      projectNextActionCoordinatorAssignmentId:
                        publishedAssignment.id,
                      projectNextActionCoordinatorPermissionSetVersion: 'v1',
                    }),
            },
          };
          return Response.json(publishedAssignment, { status: 201 });
        }
        if (path === '/api/projects') return Response.json([project, sibling]);
        if (path === `/api/projects/${sibling.id}`)
          return Response.json(sibling);
        if (path === `/api/projects/${sibling.id}/template`)
          return Response.json({ template: null });
        if (path === `/api/projects/${projectId}/tasks`)
          return Response.json({ mutable: true, tasks });
        if (path === `/api/tasks/${task.id}`)
          return Response.json({ mutable: true, task });
        if (path === `/api/tasks/${task.id}/history`)
          return Response.json({ events: [] });
        if (path === `/api/tasks/${task.id}/results/eligible-versions`)
          return Response.json({
            taskId: task.id,
            mutable: true,
            versions: [reference],
          });
        if (path === `/api/tasks/${task.id}/results/history`)
          return Response.json({
            taskId: task.id,
            declarations: recorded ? [declaration] : [],
            hasMore: false,
            nextBeforeRevision: null,
          });
        if (path === `/api/tasks/${task.id}/results`) {
          if (init?.method === 'POST') {
            const body: unknown = JSON.parse(
              typeof init.body === 'string' ? init.body : 'null',
            );
            writes.push({
              body,
              key: new Headers(init.headers).get('idempotency-key'),
            });
            if (phase === 'pending' && writes.length === 1)
              return new Promise((resolve) => {
                finish = resolve;
              });
            recorded = true;
            if (phase === 'uncertain' && writes.length === 1)
              throw new TypeError('Synthetic result reply lost after commit');
            return Response.json(receipt, { status: 201 });
          }
          return Response.json({
            taskId: task.id,
            projectId,
            taskTitle: task.title,
            taskVersion: 1,
            revision: recorded ? 1 : 0,
            mutable: true,
            current: recorded ? declaration : null,
          });
        }
        return undefined;
      },
    );
    render(
      <StrictMode>
        <App identity={deterministicBrowserIdentity()} />
      </StrictMode>,
    );
    const projects = await screen.findByRole('region', { name: 'Projects' });
    fireEvent.change(
      await within(projects).findByRole('textbox', { name: 'Project title' }),
      { target: { value: 'Independent Project draft DEMO' } },
    );
    fireEvent.click(
      await within(projects).findByRole('button', {
        name: new RegExp(project.title),
      }),
    );
    fireEvent.click(await screen.findByRole('button', { name: task.title }));
    const title = await screen.findByRole('textbox', { name: 'Task title' });
    await waitFor(() => expect(title).toBeEnabled());
    fireEvent.change(title, {
      target: { value: 'Independent Task draft DEMO' },
    });
    const result = await screen.findByRole('region', {
      name: 'Declared Task result',
    });
    fireEvent.change(
      await within(result).findByRole('textbox', {
        name: 'Result declaration',
      }),
      { target: { value: declaration.declaration } },
    );
    changeValue(
      within(result).getByRole('combobox', { name: 'Frozen mission Version' }),
      reference.versionId,
    );
    if (phase !== 'draft')
      fireEvent.click(
        within(result).getByRole('button', { name: 'Record result' }),
      );
    if (phase === 'pending')
      await waitFor(() => expect(finish).toBeTypeOf('function'));
    if (phase === 'uncertain')
      await within(result).findByRole('button', {
        name: 'Retry exact result command',
      });
    if (phase === 'confirmed')
      await within(result).findByText('Result confirmed.');
    try {
      fireEvent.click(
        within(
          screen.getByRole('navigation', { name: 'Primary navigation' }),
        ).getByRole('link', { name: /Access/i }),
      );
      const access = await screen.findByRole('region', {
        name: 'Company access',
      });
      changeValue(
        await within(access).findByRole('combobox', {
          name: 'Workspace member',
        }),
        actor.workspaceMembershipId,
      );
      changeValue(
        within(access).getByRole('combobox', { name: 'Company' }),
        companyId,
      );
      changeValue(
        within(access).getByRole('combobox', { name: 'Access bundle' }),
        grant === 'risk'
          ? 'operational-risk-reader'
          : grant === 'internal-task'
            ? 'internal-task-manager'
            : 'project-next-action-coordinator',
      );
      fireEvent.click(
        within(access).getByRole('button', { name: 'Grant access' }),
      );
      await screen.findByText('Fresh independent Actor DEMO');
      fireEvent.click(
        within(
          screen.getByRole('navigation', { name: 'Primary navigation' }),
        ).getByRole('link', { name: 'Projects' }),
      );
      fireEvent.click(
        within(projects).getByRole('button', {
          name: new RegExp(sibling.title),
        }),
      );
      await within(projects).findByRole('heading', { name: sibling.title });
      fireEvent.click(
        within(projects).getByRole('button', {
          name: new RegExp(project.title),
        }),
      );
      await within(projects).findByRole('heading', { name: project.title });
      const resumed = await screen.findByRole('region', {
        name: 'Declared Task result',
      });
      if (phase === 'draft')
        expect(
          await within(resumed).findByRole('textbox', {
            name: 'Result declaration',
          }),
        ).toHaveValue(declaration.declaration);
      if (phase === 'pending') {
        expect(
          within(resumed).getByText('Recording result…'),
        ).toBeInTheDocument();
        recorded = true;
        await act(async () =>
          finish?.(Response.json(receipt, { status: 201 })),
        );
        expect(
          await within(resumed).findByText('Result confirmed.'),
        ).toBeInTheDocument();
      }
      if (phase === 'uncertain') {
        await act(async () =>
          fireEvent.click(
            within(resumed).getByRole('button', {
              name: 'Retry exact result command',
            }),
          ),
        );
        expect(
          await within(resumed).findByText('Result confirmed.'),
        ).toBeInTheDocument();
        expect(writes[1]).toEqual(writes[0]);
      }
      if (phase === 'confirmed')
        expect(
          within(resumed).getByText('Result confirmed.'),
        ).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'Task title' })).toHaveValue(
        'Independent Task draft DEMO',
      );
      expect(
        within(projects).getByRole('textbox', { name: 'Project title' }),
      ).toHaveValue('Independent Project draft DEMO');
    } finally {
      finish?.(Response.json(receipt, { status: 201 }));
    }
  },
  20000,
);
