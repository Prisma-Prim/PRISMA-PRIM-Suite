import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import type { ActorContext } from './access-types';

const company = {
  id: 'company-1',
  displayName: 'PRISMA-PRIM',
  projectPermissions: ['project.read', 'project.create'],
  clientPermissions: ['client.read'],
} satisfies ActorContext['activeCompany'];
const actor: ActorContext = {
  internalUserId: 'user-1',
  workspaceMembershipId: 'membership-1',
  workspaceId: 'workspace-1',
  workspaceName: 'PRISMA Workspace',
  displayName: 'Ana Popescu',
  email: 'ana@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: company,
};
const updater: ActorContext = {
  ...actor,
  activeCompany: {
    ...company,
    projectPermissions: ['project.read', 'project.create', 'project.update'],
  },
};
const project = {
  id: 'project-1',
  companyId: company.id,
  clientAccountId: 'client-1',
  clientDisplayName: 'Synthetic Client',
  title: 'ISO preparation',
  status: 'preparatory',
  createdAt: '2026-09-19T08:00:00.000Z',
};
const ion = { workspaceMembershipId: 'ion', displayLabel: 'Ion Popa · 3F' };
const target = {
  type: 'project',
  projectId: project.id,
  projectTitle: project.title,
  companyId: company.id,
};
const events = [
  {
    id: 'responsible-2',
    action: 'project.responsible.changed',
    occurredAt: '2026-09-24T11:00:00.000Z',
    actor: { internalUserId: actor.internalUserId, displayName: 'Ana Popescu' },
    target,
    metadata: { revision: 2, before: ion, after: null },
  },
  {
    id: 'responsible-1',
    action: 'project.responsible.changed',
    occurredAt: '2026-09-24T10:00:00.000Z',
    actor: { internalUserId: actor.internalUserId, displayName: 'Ana Popescu' },
    target,
    metadata: { revision: 1, before: null, after: ion },
  },
];

function serve(current: ActorContext) {
  const paths: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(input.toString(), window.location.origin).pathname;
      paths.push(path);
      if (path === '/api/access/current-actor') return Response.json(current);
      if (path === '/api/activity-log') return Response.json({ events });
      // The Company summary the Classic home mounts for this Project reader.
      if (path === '/api/operational-home')
        return Response.json({
          companyId: current.activeCompany?.id,
          today: '2026-09-27',
          summaries: [
            { kind: 'active_clients', count: 1 },
            { kind: 'open_projects', count: 1 },
          ],
        });
      if (path === '/api/projects') return Response.json([project]);
      if (path === `/api/projects/${project.id}`) return Response.json(project);
      if (path === `/api/projects/${project.id}/responsible`)
        return Response.json({
          responsible: ion,
          revision: 1,
          lastChange: {
            actorDisplayName: 'Ana Popescu',
            occurredAt: '2026-09-24T10:00:00.000Z',
          },
          mutable: true,
        });
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

it.each([
  ['a Project Access v1 reader', actor, false],
  ['a Project Access v2 holder', updater, true],
])(
  'shows the responsible member in Project detail to %s with change controls only for project.update',
  async (_, current, changeable) => {
    const paths = serve(current);
    window.history.replaceState(null, '', '/?frame=classic#projects');
    render(<App identity={deterministicBrowserIdentity()} />);
    const navigation = await screen.findByRole('navigation', {
      name: 'Primary navigation',
    });
    expect(
      within(navigation).getByRole('link', { name: 'Projects' }),
    ).toBeInTheDocument();
    const projects = await screen.findByRole('region', { name: 'Projects' });
    fireEvent.click(
      await within(projects).findByRole('button', {
        name: `${project.title} Client: ${project.clientDisplayName}`,
      }),
    );
    const detail = await within(projects).findByRole('article', {
      name: project.title,
    });
    const responsible = within(detail).getByRole('region', {
      name: 'Responsible member',
    });
    expect(
      await within(responsible).findByText(ion.displayLabel, {
        selector: 'dd',
      }),
    ).toBeInTheDocument();
    expect(
      within(responsible).getByText(/Last changed by Ana Popescu on/u),
    ).toBeInTheDocument();
    expect(
      within(responsible).queryByRole('button', { name: 'Change' }) !== null,
    ).toBe(changeable);
    expect(paths).not.toContain(
      `/api/projects/${project.id}/eligible-responsible-members`,
    );
  },
);

it('renders responsible-member changes in the Activity Log with their before and after members', async () => {
  serve(actor);
  window.history.replaceState(null, '', '/?frame=classic#activity');
  render(<App identity={deterministicBrowserIdentity()} />);
  const activity = await screen.findByRole('region', { name: 'Activity Log' });
  const [cleared, named] = await within(activity).findAllByRole('listitem');
  expect(cleared).toHaveTextContent(
    'Ana Popescu changed the responsible member of a Project',
  );
  expect(cleared).toHaveTextContent(
    'Target: Project: ISO preparation — from Ion Popa · 3F to No responsible member',
  );
  expect(named).toHaveTextContent(
    'Target: Project: ISO preparation — from No responsible member to Ion Popa · 3F',
  );
});
