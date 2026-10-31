import { StrictMode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from './test/render-with-interface-locale';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import {
  actor,
  companyId,
  clientId,
  project,
  projectId,
  installParentServer,
} from './test/mission-applicability-app-fixture';

const nextActionActor = {
  ...actor,
  internalUserId: '50000000-0000-4000-8000-000000000001',
  workspaceMembershipId: '60000000-0000-4000-8000-000000000001',
  workspaceId: '70000000-0000-4000-8000-000000000001',
  activeCompany: {
    ...actor.activeCompany,
    projectNextActionPermissions: ['project.next_action.update'],
    projectNextActionCoordinatorAssignmentId: 'next-action-coordinator',
    projectNextActionCoordinatorPermissionSetVersion: 'v1',
  },
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

it('opens the native next action from the actual App, preserves exact uncertain intent and separates its confirmation from current-read failure', async () => {
  const current = {
    format: 'project-next-action-v1',
    workspaceId: nextActionActor.workspaceId,
    companyId,
    projectId,
    originalClientAccountId: clientId,
    revision: 0,
    text: null,
    lastChange: null,
  };
  const record = {
    ...current,
    revision: 1,
    text: 'Waiting for Client documents.',
    lastChange: {
      internalUserId: nextActionActor.internalUserId,
      workspaceMembershipId: nextActionActor.workspaceMembershipId,
      displayName: 'Coordinator DEMO',
      occurredAt: '2026-10-30T13:00:00.000Z',
    },
  };
  const writes: Array<{ body: string | undefined; key: string | null }> = [];
  let confirmed = false;
  installParentServer(
    () => nextActionActor,
    async (path, init) => {
      if (!path.endsWith('/next-action')) return undefined;
      if (init?.method === 'POST') {
        writes.push({
          body: typeof init.body === 'string' ? init.body : undefined,
          key: new Headers(init.headers).get('idempotency-key'),
        });
        if (writes.length === 1) throw new TypeError('Synthetic lost reply');
        confirmed = true;
        return Response.json({
          format: 'project-next-action-command-v1',
          outcome: 'changed',
          record,
        });
      }
      return confirmed
        ? new Response(null, { status: 503 })
        : Response.json({
            current,
            history: { entries: [], hasMore: false, nextBeforeRevision: null },
          });
    },
  );
  render(
    <StrictMode>
      <App identity={deterministicBrowserIdentity()} />
    </StrictMode>,
  );
  const projects = await screen.findByRole('region', { name: 'Projects' });
  fireEvent.click(
    await within(projects).findByRole('button', {
      name: new RegExp(project.title),
    }),
  );
  const panel = await screen.findByRole('region', {
    name: 'Project next action',
  });
  const editor = await within(panel).findByRole('textbox', {
    name: 'Next action',
  });
  await waitFor(() => expect(editor).toBeEnabled());
  fireEvent.change(editor, {
    target: { value: '  Waiting for Client documents.  ' },
  });
  fireEvent.click(
    within(panel).getByRole('button', { name: 'Save next action' }),
  );
  expect(
    await within(panel).findByText(
      'The reply is uncertain. Confirm this exact action before starting another.',
    ),
  ).toBeTruthy();
  expect(editor).toBeDisabled();
  fireEvent.click(
    within(panel).getByRole('button', { name: 'Retry the same action' }),
  );
  expect(await within(panel).findByText('Next action saved.')).toBeTruthy();
  expect(
    await within(panel).findByText(
      'The current next action could not be refreshed.',
    ),
  ).toBeTruthy();
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual(writes[0]);
  expect(JSON.parse(writes[0]?.body ?? 'null')).toEqual({
    expectedRevision: 0,
    expectedLifecycleRevision: 0,
    text: 'Waiting for Client documents.',
  });
  expect(writes[0]?.key).toBeTruthy();
});
