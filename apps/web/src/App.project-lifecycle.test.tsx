import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import type { ActorContext } from './access-types';
import type { ProjectLifecycle } from './project/project-lifecycle-response';
import { preparatoryLifecycle } from './project/project-lifecycle.test-fixtures';

const company = {
  id: 'company-1',
  displayName: 'PRISMA-PRIM',
  projectPermissions: ['project.read', 'project.create'],
  clientPermissions: ['client.read'],
  projectApproverPermissions: ['project.lifecycle.transition', 'project.close'],
  projectApproverPermissionAssignmentId: 'approver-assignment',
  projectApproverPermissionSetVersion: 'v1',
} satisfies ActorContext['activeCompany'];
const approver: ActorContext = {
  internalUserId: 'user-1',
  workspaceMembershipId: 'membership-1',
  workspaceId: 'workspace-1',
  workspaceName: 'PRISMA Workspace',
  displayName: 'Aprobator Demo',
  email: 'aprobator@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: company,
};
const project = {
  id: 'project-1',
  companyId: company.id,
  clientAccountId: 'client-1',
  clientDisplayName: 'GRUP Demo SA',
  title: 'ISO 9001 — GRUP Demo SA',
  status: 'active',
  createdAt: '2026-09-19T08:00:00.000Z',
};
const ana = { workspaceMembershipId: 'ana', displayLabel: 'Ana · 3F' };
const actor = {
  internalUserId: approver.internalUserId,
  displayName: 'Aprobator Demo',
};
const target = {
  type: 'project',
  projectId: project.id,
  projectTitle: project.title,
  companyId: company.id,
};
const lifecycleEvent = (id: string, metadata: unknown, minute: number) => ({
  id,
  action: 'project.lifecycle.changed',
  occurredAt: `2026-09-26T10:${String(minute).padStart(2, '0')}:00.000Z`,
  actor,
  target,
  metadata,
});
const assignmentEvent = (action: string, minute: number) => ({
  id: action,
  action,
  occurredAt: `2026-09-26T09:${String(minute).padStart(2, '0')}:00.000Z`,
  actor,
  target: {
    type: 'company_role_assignment',
    assignmentId: 'approver-assignment',
    companyId: company.id,
    companyDisplayName: company.displayName,
    workspaceMembershipId: approver.workspaceMembershipId,
    internalUserId: approver.internalUserId,
    internalUserDisplayName: 'Aprobator Demo',
  },
  metadata: { bundle: 'Company Project Approver' },
});
const activeLifecycle: ProjectLifecycle = {
  status: 'active',
  lifecycleRevision: 1,
  mutable: true,
  start: {
    declaredAt: '2026-09-26T10:00:00.000Z',
    declaredBy: { displayName: 'Aprobator Demo' },
    declaration: {
      approvedOffer: 'present',
      contractOrPrecontract: 'present',
      projectPlan: 'present',
      initialDocuments: 'present',
      deadlines: 'present',
      financialConditions: 'present',
      risks: 'present',
    },
    exception: null,
  },
  transitions: [
    {
      action: 'activate',
      lifecycleRevision: 1,
      from: 'preparatory',
      to: 'active',
      occurredAt: '2026-09-26T10:00:00.000Z',
      actor: { displayName: 'Aprobator Demo' },
      withStartException: false,
    },
  ],
};

function serve(options: { events?: unknown[] } = {}) {
  let current: { status: string; lifecycle: ProjectLifecycle } = {
    status: 'active',
    lifecycle: activeLifecycle,
  };
  const paths: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(input.toString(), window.location.origin).pathname;
      paths.push(`${init?.method ?? 'GET'} ${path}`);
      if (path === '/api/access/current-actor') return Response.json(approver);
      if (path === '/api/activity-log')
        return Response.json({ events: options.events ?? [] });
      if (path === '/api/projects')
        return Response.json([{ ...project, status: current.status }]);
      if (path === `/api/projects/${project.id}`)
        return Response.json({ ...project, status: current.status });
      if (path === `/api/projects/${project.id}/lifecycle`)
        return Response.json(current.lifecycle);
      if (path === `/api/projects/${project.id}/responsible`)
        return Response.json({
          responsible: ana,
          revision: 1,
          lastChange: {
            actorDisplayName: 'Ana',
            occurredAt: '2026-09-25T10:00:00.000Z',
          },
          mutable: true,
        });
      if (path === `/api/projects/${project.id}/lifecycle-transitions`) {
        current = {
          status: 'on_hold',
          lifecycle: {
            ...activeLifecycle,
            status: 'on_hold',
            lifecycleRevision: 2,
            transitions: [
              {
                action: 'hold',
                lifecycleRevision: 2,
                from: 'active',
                to: 'on_hold',
                occurredAt: '2026-09-26T10:05:00.000Z',
                actor: { displayName: 'Aprobator Demo' },
                reason: 'Client asked to pause.',
              },
              ...activeLifecycle.transitions,
            ],
          },
        };
        return Response.json({
          projectId: project.id,
          action: 'hold',
          from: 'active',
          to: 'on_hold',
          lifecycleRevision: 2,
        });
      }
      return Response.json([]);
    }),
  );
  return paths;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

it.each(['classic', 'prisme'])(
  'mounts the Lifecycle section above the responsible member and refreshes the detail status and the list row together in %s',
  async (frame) => {
    const paths = serve();
    window.history.replaceState(null, '', `/?frame=${frame}#projects`);
    render(<App identity={deterministicBrowserIdentity()} />);
    const projects = await screen.findByRole('region', { name: 'Projects' });
    const row = await within(projects).findByRole('button', {
      name: `${project.title} Client: ${project.clientDisplayName}`,
    });
    const listItem = row.closest('li');
    if (!listItem) throw new Error('The Project row is not a list item.');
    expect(within(listItem).getByText('Active')).toBeInTheDocument();
    fireEvent.click(row);
    const detail = await within(projects).findByRole('article', {
      name: project.title,
    });
    const lifecycle = within(detail).getByRole('region', { name: 'Lifecycle' });
    const responsible = within(detail).getByRole('region', {
      name: 'Responsible member',
    });
    expect(
      lifecycle.compareDocumentPosition(responsible) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Only a preparatory Project repeats the preparation notice.
    expect(
      within(detail).queryByText(
        'Preparation only. This record does not authorize work to start.',
      ),
    ).toBeNull();
    fireEvent.click(
      await within(lifecycle).findByRole('button', { name: 'Put on hold' }),
    );
    fireEvent.change(within(lifecycle).getByLabelText('Hold reason'), {
      target: { value: 'Client asked to pause.' },
    });
    fireEvent.click(
      within(lifecycle).getByRole('button', { name: 'Put Project on hold' }),
    );
    await within(lifecycle).findByRole('button', { name: 'Resume Project' });
    expect(await within(listItem).findByText('On hold')).toBeInTheDocument();
    expect(within(detail).getAllByText('On hold')).toHaveLength(2);
    expect(paths).toContain(`GET /api/projects/${project.id}`);
  },
);

it('labels lifecycle and Approver events from centralized copy and omits an event with malformed metadata', async () => {
  serve({
    events: [
      lifecycleEvent(
        'cancelled',
        { lifecycleRevision: 5, from: 'on_hold', to: 'cancelled' },
        9,
      ),
      lifecycleEvent(
        'completed',
        { lifecycleRevision: 4, from: 'active', to: 'completed' },
        8,
      ),
      lifecycleEvent(
        'malformed',
        { lifecycleRevision: 4, from: 'preparatory', to: 'on_hold' },
        7,
      ),
      lifecycleEvent(
        'reason-leak',
        {
          lifecycleRevision: 3,
          from: 'active',
          to: 'on_hold',
          reason: 'x',
        },
        6,
      ),
      lifecycleEvent(
        'resumed',
        { lifecycleRevision: 3, from: 'on_hold', to: 'active' },
        5,
      ),
      lifecycleEvent(
        'held',
        { lifecycleRevision: 2, from: 'active', to: 'on_hold' },
        4,
      ),
      lifecycleEvent(
        'activated-with-exception',
        {
          lifecycleRevision: 1,
          from: 'preparatory',
          to: 'active',
          withStartException: true,
        },
        3,
      ),
      lifecycleEvent(
        'activated',
        {
          lifecycleRevision: 1,
          from: 'preparatory',
          to: 'active',
          withStartException: false,
        },
        2,
      ),
      assignmentEvent('company_project_approver_assignment.revoked', 1),
      assignmentEvent('company_project_approver_assignment.granted', 0),
    ],
  });
  window.history.replaceState(null, '', '/?frame=classic#activity');
  render(<App identity={deterministicBrowserIdentity()} />);
  const activity = await screen.findByRole('region', { name: 'Activity Log' });
  const items = await within(activity).findAllByRole('listitem');
  expect(
    items.map((item) => item.querySelector('strong')?.textContent),
  ).toEqual([
    'Aprobator Demo cancelled a Project',
    'Aprobator Demo completed a Project',
    'Aprobator Demo resumed a Project',
    'Aprobator Demo put a Project on hold',
    'Aprobator Demo activated a Project with a start exception',
    'Aprobator Demo activated a Project',
    'Aprobator Demo revoked Company Project Approver',
    'Aprobator Demo granted Company Project Approver',
  ]);
  expect(items[0]).toHaveTextContent(`Target: Project: ${project.title}`);
});

it('keeps a Project with a preparatory status labelled and its notice beside the registration form', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(input.toString(), window.location.origin).pathname;
      if (path === '/api/access/current-actor') return Response.json(approver);
      if (path === '/api/activity-log') return Response.json({ events: [] });
      if (path === '/api/projects')
        return Response.json([{ ...project, status: 'preparatory' }]);
      if (path === '/api/clients')
        return Response.json([{ id: 'client-1', displayName: 'GRUP Demo SA' }]);
      if (path === `/api/projects/${project.id}/lifecycle`)
        return Response.json(preparatoryLifecycle);
      return Response.json([]);
    }),
  );
  window.history.replaceState(null, '', '/?frame=classic#projects');
  render(<App identity={deterministicBrowserIdentity()} />);
  const projects = await screen.findByRole('region', { name: 'Projects' });
  const row = await within(projects).findByRole('button', {
    name: `${project.title} Client: ${project.clientDisplayName}`,
  });
  expect(row.closest('li')).toHaveTextContent('Preparatory');
  expect(
    within(projects).getByText(
      'Preparation only. This record does not authorize work to start.',
    ).parentElement?.tagName,
  ).toBe('FORM');
});
