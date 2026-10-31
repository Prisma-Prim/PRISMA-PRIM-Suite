import { StrictMode } from 'react';
import { App } from '../App';
import { deterministicBrowserIdentity } from '../access-composition';
import { InterfaceLocaleSelect } from '../localization/InterfaceLocaleSelect';
import {
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from './render-with-interface-locale';
import { changeValue } from './select-option';
import {
  actor,
  companyId,
  clientId,
  project,
  projectId,
  installParentServer,
} from './mission-applicability-app-fixture';

export const nextActionActor = {
  ...actor,
  internalUserId: '50000000-0000-4000-8000-000000000001',
  workspaceMembershipId: '60000000-0000-4000-8000-000000000001',
  workspaceId: '70000000-0000-4000-8000-000000000001',
  workspacePermissions: ['client.manage', 'company.assignment.manage'],
  activeCompany: {
    ...actor.activeCompany,
    projectNextActionPermissions: ['project.next_action.update'],
    projectNextActionCoordinatorAssignmentId: 'next-action-coordinator',
    projectNextActionCoordinatorPermissionSetVersion: 'v1',
  },
};
export const nextActionPath = `/api/projects/${projectId}/next-action`;
export function emptyNextAction() {
  return {
    current: {
      format: 'project-next-action-v1',
      workspaceId: nextActionActor.workspaceId,
      companyId,
      projectId,
      originalClientAccountId: clientId,
      revision: 0,
      text: null,
      lastChange: null,
    },
    history: { entries: [], hasMore: false, nextBeforeRevision: null },
  };
}
export function firstNextAction(text = 'Held action DEMO') {
  const attribution = {
    internalUserId: nextActionActor.internalUserId,
    workspaceMembershipId: nextActionActor.workspaceMembershipId,
    displayName: 'Coordinator DEMO',
    occurredAt: '2026-10-30T13:00:00.000Z',
  };
  const current = {
    ...emptyNextAction().current,
    revision: 1,
    text,
    lastChange: attribution,
  };
  return {
    current,
    history: {
      entries: [
        {
          revision: 1,
          predecessorRevision: 0,
          before: null,
          after: text,
          attribution,
        },
      ],
      hasMore: false,
      nextBeforeRevision: null,
    },
  };
}
export function installNextActionPublication(
  fresh: unknown,
  override: Parameters<typeof installParentServer>[1],
  initial: unknown = nextActionActor,
) {
  let current = initial,
    granted = false,
    actorReads = 0,
    activityReads = 0,
    actionReads = 0;
  installParentServer(
    () => current,
    async (path, init, url) => {
      if (path === '/api/access/current-actor') actorReads++;
      if (path === '/api/activity-log') activityReads++;
      if (path === nextActionPath && init?.method !== 'POST') actionReads++;
      const response = await override(path, init, url);
      if (response) return response;
      if (path === nextActionPath) return Response.json(emptyNextAction());
      if (path === '/api/company-context-assignments/administration')
        return Response.json({
          members: [
            {
              workspaceMembershipId: nextActionActor.workspaceMembershipId,
              displayName: nextActionActor.displayName,
              email: nextActionActor.email,
            },
          ],
          companies: [{ id: companyId, displayName: 'Company DEMO' }],
          assignments: granted
            ? [
                {
                  id: 'admin-reviewer',
                  workspaceMembershipId: nextActionActor.workspaceMembershipId,
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
        current = fresh;
        granted = true;
        return Response.json(
          {
            id: 'admin-reviewer',
            workspaceMembershipId: nextActionActor.workspaceMembershipId,
            companyId,
            bundle: 'Company Mission Result Reviewer',
            permissionSetVersion: 'v1',
            active: true,
          },
          { status: 201 },
        );
      }
      return undefined;
    },
  );
  return { counts: () => ({ actorReads, activityReads, actionReads }) };
}
export async function openNextActionApp(
  identity = deterministicBrowserIdentity(),
) {
  const view = render(
    <StrictMode>
      <InterfaceLocaleSelect />
      <App identity={identity} />
    </StrictMode>,
  );
  const projects = await screen.findByRole('region', { name: 'Projects' });
  fireEvent.change(
    await within(projects).findByRole('textbox', { name: 'Project title' }),
    { target: { value: 'Independent parent Project draft DEMO' } },
  );
  fireEvent.click(
    await within(projects).findByRole('button', {
      name: new RegExp(project.title),
    }),
  );
  const panel = await screen.findByRole('region', {
      name: 'Project next action',
    }),
    editor = await within(panel).findByRole('textbox', { name: 'Next action' });
  await waitFor(() => expectEnabled(editor));
  return { view, projects, panel, editor, identity };
}
function expectEnabled(element: HTMLElement) {
  if (element.hasAttribute('disabled'))
    throw new Error('Waiting for native lifecycle read.');
}
export async function publishNextActionActor() {
  fireEvent.click(
    within(
      screen.getByRole('navigation', { name: 'Primary navigation' }),
    ).getByRole('link', { name: /Access/i }),
  );
  const access = await screen.findByRole('region', { name: 'Company access' });
  changeValue(
    await within(access).findByRole('combobox', { name: 'Workspace member' }),
    nextActionActor.workspaceMembershipId,
  );
  changeValue(
    within(access).getByRole('combobox', { name: 'Company' }),
    companyId,
  );
  changeValue(
    within(access).getByRole('combobox', { name: 'Access bundle' }),
    'mission-result-reviewer',
  );
  fireEvent.click(within(access).getByRole('button', { name: 'Grant access' }));
  await screen.findByText('Fresh parent Actor DEMO');
  fireEvent.click(
    within(
      screen.getByRole('navigation', { name: 'Primary navigation' }),
    ).getByRole('link', { name: 'Projects' }),
  );
}
