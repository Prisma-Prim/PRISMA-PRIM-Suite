import { StrictMode } from 'react';
import { App } from '../App';
import {
  deterministicBrowserIdentity,
  type BrowserIdentity,
} from '../access-composition';
import { InterfaceLocaleSelect } from '../localization/InterfaceLocaleSelect';
import {
  render,
  screen,
  fireEvent,
  within,
  waitFor,
} from './render-with-interface-locale';
import { changeValue } from './select-option';
import {
  installParentServer,
  companyId,
} from './mission-applicability-app-fixture';
import {
  nextActionActor,
  nextActionPath,
  emptyNextAction,
} from './project-next-action-app';
export const internalTaskId = '80000000-0000-4000-8000-000000001006';
export const internalTaskActor = {
  ...nextActionActor,
  activeCompany: {
    ...nextActionActor.activeCompany,
    internalTaskPermissions: ['internal_task.read', 'internal_task.manage'],
    internalTaskManagerAssignmentId: '90000000-0000-4000-8000-000000001006',
    internalTaskManagerPermissionSetVersion: 'v1',
  },
};
export function internalSnapshot(title = 'Internal inventory DEMO') {
  return {
    format: 'company-internal-task-v1',
    id: internalTaskId,
    workspaceId: internalTaskActor.workspaceId,
    companyId,
    version: 1,
    title,
    description: null,
    assignee: null,
    dueDate: null,
    priority: 'normal',
    status: 'todo',
    createdByMembershipId: internalTaskActor.workspaceMembershipId,
    createdAt: '2026-10-31T12:00:00.000Z',
    updatedAt: '2026-10-31T12:00:00.000Z',
    completion: null,
    reason: null,
  };
}
export function internalReceipt(title = 'Internal inventory DEMO') {
  const task = internalSnapshot(title);
  return {
    format: 'company-internal-task-command-v1',
    task,
    changed: true,
    history: {
      format: 'company-internal-task-history-v1',
      workspaceId: task.workspaceId,
      companyId,
      taskId: task.id,
      version: 1,
      kind: 'CREATE',
      actorMembershipId: task.createdByMembershipId,
      recordedAt: task.createdAt,
      before: null,
      after: task,
    },
  };
}
export function internalDetail(title = 'Internal inventory DEMO') {
  const receipt = internalReceipt(title);
  return {
    format: 'company-internal-task-detail-v1',
    task: receipt.task,
    history: [receipt.history],
    nextBeforeVersion: null,
  };
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected synthetic actor.');
  return Object.fromEntries(Object.entries(value));
}
export function installInternalTaskApp(
  override: Parameters<typeof installParentServer>[1] = async () => undefined,
  initial: unknown = internalTaskActor,
) {
  let current: unknown = initial,
    next: unknown = {
      ...internalTaskActor,
      displayName: 'Fresh internal Actor DEMO',
      activeCompany: {
        ...internalTaskActor.activeCompany,
        internalTaskManagerAssignmentId: '90000000-0000-4000-8000-000000001007',
      },
    },
    internalGranted = true,
    reviewGranted = false;
  const requests: Array<{
    path: string;
    method: string;
    body: BodyInit | null | undefined;
    key: string | null;
  }> = [];
  installParentServer(
    () => current,
    async (path, init, url) => {
      requests.push({
        path,
        method: init?.method ?? 'GET',
        body: init?.body,
        key: new Headers(init?.headers).get('idempotency-key'),
      });
      const response = await override(path, init, url);
      if (response) return response;
      if (path === nextActionPath) return Response.json(emptyNextAction());
      if (path === '/api/company-context-assignments/administration')
        return Response.json({
          members: [
            {
              workspaceMembershipId: internalTaskActor.workspaceMembershipId,
              displayName: internalTaskActor.displayName,
              email: internalTaskActor.email,
            },
          ],
          companies: [{ id: companyId, displayName: 'Company DEMO' }],
          assignments: [
            ...(internalGranted ? [assignment(true)] : []),
            ...(reviewGranted
              ? [assignment(true, 'Company Mission Result Reviewer')]
              : []),
          ],
        });
      if (path.startsWith('/api/company-internal-task-manager-assignments')) {
        internalGranted = init?.method === 'POST';
        if (internalGranted) current = next;
        else {
          const value = object(current),
            company = object(value.activeCompany);
          current = {
            ...value,
            activeCompany: {
              ...company,
              internalTaskPermissions: [],
              internalTaskManagerAssignmentId: undefined,
              internalTaskManagerPermissionSetVersion: undefined,
            },
          };
        }
        return Response.json(assignment(internalGranted), {
          status: internalGranted ? 201 : 200,
        });
      }
      if (
        path === '/api/company-mission-result-reviewer-assignments' &&
        init?.method === 'POST'
      ) {
        current = next;
        reviewGranted = true;
        return Response.json(
          assignment(true, 'Company Mission Result Reviewer'),
          { status: 201 },
        );
      }
      if (path === '/api/company-internal-tasks/eligible-assignees')
        return Response.json({
          format: 'company-internal-task-assignees-v1',
          members: [],
          nextAfterMembershipId: null,
        });
      if (path === '/api/company-internal-tasks' && init?.method !== 'POST')
        return Response.json({
          format: 'company-internal-task-page-v1',
          tasks: [internalSnapshot()],
          nextBeforeTaskId: null,
        });
      if (path === '/api/company-internal-tasks/' + internalTaskId)
        return Response.json(internalDetail());
      return undefined;
    },
  );
  function assignment(
    active: boolean,
    bundle = 'Company Internal Task Manager',
  ) {
    return {
      id: '90000000-0000-4000-8000-000000001006',
      workspaceMembershipId: internalTaskActor.workspaceMembershipId,
      companyId,
      bundle,
      permissionSetVersion: 'v1',
      active,
    };
  }
  return {
    requests,
    setNextActor(value: unknown) {
      next = value;
    },
    counts() {
      return {
        actor: requests.filter((r) => r.path === '/api/access/current-actor')
          .length,
        activity: requests.filter((r) => r.path === '/api/activity-log').length,
      };
    },
  };
}
export async function openInternalTaskApp(
  identity: BrowserIdentity = deterministicBrowserIdentity(),
) {
  const view = render(
    <StrictMode>
      <InterfaceLocaleSelect />
      <App identity={identity} />
    </StrictMode>,
  );
  const navigation = await screen.findByRole('navigation', {
    name: 'Primary navigation',
  });
  fireEvent.click(
    within(navigation).getByRole('link', { name: 'Internal Tasks' }),
  );
  const panel = await screen.findByRole('region', { name: 'Internal Tasks' });
  await within(panel).findByText(
    'No eligible member. Unassigned work remains available.',
  );
  const create = within(panel).getByRole('form', {
      name: 'Create internal Task',
    }),
    title = within(create).getByRole('textbox', { name: 'Task title' });
  return { view, panel, create, title, identity };
}
export async function publishInternalActor(
  operation: 'grant' | 'revoke' = 'grant',
  bundle = 'internal-task-manager',
) {
  fireEvent.click(
    within(
      screen.getByRole('navigation', { name: 'Primary navigation' }),
    ).getByRole('link', { name: /Access/i }),
  );
  const panel = await screen.findByRole('region', { name: 'Company access' });
  changeValue(
    await within(panel).findByRole('combobox', { name: 'Workspace member' }),
    internalTaskActor.workspaceMembershipId,
  );
  changeValue(
    within(panel).getByRole('combobox', { name: 'Company' }),
    companyId,
  );
  changeValue(
    within(panel).getByRole('combobox', { name: 'Access bundle' }),
    bundle,
  );
  const button = within(panel).getByRole('button', {
    name: operation === 'grant' ? 'Grant access' : 'Revoke access',
  });
  await waitFor(() => {
    if (button.hasAttribute('disabled'))
      throw new Error('Waiting for native administration.');
  });
  fireEvent.click(button);
  await within(panel).findByText(
    operation === 'grant'
      ? 'Access granted. Server state refreshed.'
      : 'Access revoked. Server state refreshed.',
  );
  return panel;
}
