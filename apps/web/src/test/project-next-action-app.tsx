import { StrictMode } from 'react';
import { App } from '../App';
import { deterministicBrowserIdentity } from '../access-composition';
import { InterfaceLocaleSelect } from '../localization/InterfaceLocaleSelect';
import {
  fireEvent,
  screen,
  within,
  waitFor,
} from './render-with-interface-locale';
import type { InterfacePreference } from '../clarte/interface-preference';
import { renderInInterface } from './app-interface';
import { projectDetailSection } from './project-interface';
import { changeValue } from './select-option';
import {
  actor,
  companyId,
  clientId,
  project,
  projectId,
  installParentServer,
} from './mission-applicability-app-fixture';
import { withCompanyGrants } from '../access/company-grants.test-fixture';

export const nextActionActor = {
  ...actor,
  internalUserId: '50000000-0000-4000-8000-000000000001',
  workspaceMembershipId: '60000000-0000-4000-8000-000000000001',
  workspaceId: '70000000-0000-4000-8000-000000000001',
  workspacePermissions: ['client.manage', 'company.assignment.manage'],
  activeCompany: {
    ...actor.activeCompany,
    grants: withCompanyGrants(actor.activeCompany.grants, {
      bundle: 'company_project_next_action_coordinator',
      version: 'v1',
      assignmentId: 'next-action-coordinator',
    }),
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
/**
 * Renders App in `appInterface`, leaves an independent Project registration
 * draft, opens the fixture Project and its next action: inline in the
 * current interface, in the mission space's panel in Clarté.
 */
export async function openNextActionApp(
  identity = deterministicBrowserIdentity(),
  appInterface: InterfacePreference = 'current',
) {
  const view = renderInInterface(
    appInterface,
    <StrictMode>
      <InterfaceLocaleSelect />
      <App identity={identity} />
    </StrictMode>,
  );
  const projects = await screen.findByRole('region', { name: 'Projects' });
  if (appInterface === 'clarte')
    fireEvent.click(
      await within(projects).findByRole('button', {
        name: 'Preparatory Project',
      }),
    );
  fireEvent.change(
    await within(projects).findByRole('textbox', { name: 'Project title' }),
    { target: { value: 'Independent parent Project draft DEMO' } },
  );
  // The Clarté draft stays in the Projects session while its panel is closed.
  if (appInterface === 'clarte')
    fireEvent.click(
      within(
        screen.getByRole('dialog', { name: 'New preparatory Project' }),
      ).getByRole('button', { name: 'Close' }),
    );
  fireEvent.click(
    await within(projects).findByRole('button', {
      name: new RegExp(project.title),
    }),
  );
  const detail = await within(projects).findByRole('article', {
    name: project.title,
  });
  const panel = await waitFor(() =>
      projectDetailSection(appInterface, detail, 'Project next action'),
    ),
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
