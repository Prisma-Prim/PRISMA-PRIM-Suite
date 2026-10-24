import {
  fireEvent,
  render,
  screen,
} from '../test/render-with-interface-locale';
import { afterEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { selectOption } from '../test/select-option';
import { CompanyContextAccess } from './CompanyContextAccess';

const companyId = 'company';
const memberId = 'member';
const owner: ActorContext = {
  internalUserId: 'owner',
  workspaceMembershipId: 'owner-member',
  workspaceId: 'workspace',
  workspaceName: 'Workspace DEMO',
  displayName: 'Owner DEMO',
  email: 'owner@example.test',
  active: true,
  workspacePermissions: ['company.assignment.manage'],
};
afterEach(() => vi.unstubAllGlobals());
it.each([
  {
    role: 'Task result recorder',
    route: 'task-result-recorder',
    value: 'task-result-recorder',
    label: 'Company Task Result Recorder',
    option: 'Company Task Result Recorder',
  },
  {
    role: 'reader',
    route: 'document-content-reader',
    value: 'document-content-reader',
    label: 'Company Document Content Reader',
    option: 'Company confidential PDF reader',
  },
  {
    role: 'uploader',
    route: 'document-content-uploader',
    value: 'document-content-uploader',
    label: 'Company Document Content Uploader',
    option: 'Company confidential PDF uploader',
  },
  {
    role: 'mission family',
    route: 'mission-deliverable-access',
    value: 'mission-deliverable-access',
    label: 'Company Mission Deliverable Access',
    option: 'Company Mission Deliverable Access',
  },
])(
  'grants and revokes the independent captured-v1 PDF $role bundle through administration',
  async ({ route, value, label, option }) => {
    let active = false;
    const commands: Array<{
      path: string;
      method: string;
      key: string | null;
    }> = [];
    const assignment = () => ({
      id: 'assignment',
      companyId,
      workspaceMembershipId: memberId,
      active,
      bundle: label,
      permissionSetVersion: 'v1',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, request?: RequestInit) => {
        const path = String(input);
        const method = request?.method ?? 'GET';
        if (path === '/api/company-context-assignments/administration')
          return Response.json({
            members: [
              {
                workspaceMembershipId: memberId,
                displayName: 'PDF Member DEMO',
                email: 'member@example.test',
              },
            ],
            companies: [{ id: companyId, displayName: 'Company DEMO' }],
            assignments: active ? [assignment()] : [],
          });
        if (path.startsWith(`/api/company-${route}-assignments`)) {
          active = method === 'POST';
          commands.push({
            path,
            method,
            key: new Headers(request?.headers).get('idempotency-key'),
          });
          return Response.json(assignment(), { status: active ? 201 : 200 });
        }
        throw new Error(`Unexpected request: ${path}`);
      }),
    );
    render(
      <CompanyContextAccess
        actor={owner}
        identity={deterministicBrowserIdentity()}
      />,
    );
    await screen.findByLabelText('Workspace member');
    selectOption(screen.getByLabelText('Workspace member'), memberId);
    selectOption(screen.getByLabelText('Company', { exact: true }), companyId);
    selectOption(screen.getByLabelText('Access bundle'), value);
    expect(screen.getByLabelText('Access bundle')).toHaveTextContent(option);
    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));
    await screen.findByText('Access granted. Server state refreshed.');
    expect(screen.getByText(/Current server state:/u)).toHaveTextContent(
      'Granted — captured version v1',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));
    await screen.findByText('Access revoked. Server state refreshed.');
    expect(screen.getByText(/Current server state:/u)).toHaveTextContent(
      'Not granted',
    );
    expect(commands).toEqual([
      {
        path: `/api/company-${route}-assignments`,
        method: 'POST',
        key: expect.any(String),
      },
      {
        path: `/api/company-${route}-assignments/${memberId}/${companyId}`,
        method: 'DELETE',
        key: expect.any(String),
      },
    ]);
    expect(commands[0]?.key).not.toBe(commands[1]?.key);
  },
);
it.each([
  'Company Task Result Recorder',
  'Company Document Content Reader',
  'Company Document Content Uploader',
  'Company Mission Deliverable Access',
])('fails closed on unknown captured version for %s', async (bundle) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        members: [],
        companies: [],
        assignments: [
          {
            id: 'assignment',
            companyId,
            workspaceMembershipId: memberId,
            bundle,
            permissionSetVersion: 'v2',
            active: true,
          },
        ],
      }),
    ),
  );
  render(
    <CompanyContextAccess
      actor={owner}
      identity={deterministicBrowserIdentity()}
    />,
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'The access state could not be loaded or changed.',
  );
  expect(screen.queryByLabelText('Workspace member')).not.toBeInTheDocument();
});
