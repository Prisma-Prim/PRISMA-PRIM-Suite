import {
  fireEvent,
  render,
  screen,
} from '../test/render-with-interface-locale';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { selectOption } from '../test/select-option';
import { CompanyContextAccess } from './CompanyContextAccess';

const memberId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const companyId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ownerActor: ActorContext = {
  internalUserId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  workspaceMembershipId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  workspaceId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  workspaceName: 'PRISMA Workspace',
  displayName: 'Workspace Owner',
  email: 'owner@example.test',
  active: true,
  workspacePermissions: ['company.manage', 'company.assignment.manage'],
};
function administration(
  assignments: Array<{ bundle: string; permissionSetVersion: unknown }>,
) {
  return {
    members: [
      {
        workspaceMembershipId: memberId,
        displayName: 'Document Approver',
        email: 'approver@example.test',
      },
    ],
    companies: [{ id: companyId, displayName: 'PRISMA-PRIM' }],
    assignments: assignments.map((assignment, index) => ({
      id: `dddddddd-dddd-4ddd-8ddd-dddddddddd0${index}`,
      workspaceMembershipId: memberId,
      companyId,
      active: true,
      ...assignment,
    })),
  };
}
function chooseTargetsAndBundle(bundle: string) {
  selectOption(screen.getByLabelText('Workspace member'), memberId);
  selectOption(screen.getByLabelText('Company', { exact: true }), companyId);
  selectOption(screen.getByLabelText('Access bundle'), bundle);
}

describe('Company Document Approver administration', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('grants and revokes the captured Approver v1 like the Organizer', async () => {
    let active = false;
    const commands: { method: string; path: string; key: string | null }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, options?: RequestInit) => {
        if (path === '/api/company-context-assignments/administration')
          return Response.json(
            administration(
              active
                ? [
                    {
                      bundle: 'Company Document Approver',
                      permissionSetVersion: 'v1',
                    },
                  ]
                : [],
            ),
          );
        if (path.startsWith('/api/company-document-approver-assignments')) {
          commands.push({
            method: options?.method ?? 'GET',
            path,
            key: new Headers(options?.headers).get('idempotency-key'),
          });
          active = options?.method === 'POST';
          return Response.json(
            {
              id: 'approver-assignment',
              workspaceMembershipId: memberId,
              companyId,
              bundle: 'Company Document Approver',
              permissionSetVersion: 'v1',
              active,
            },
            { status: active ? 201 : 200 },
          );
        }
        return new Response(null, { status: 404 });
      }),
    );
    render(
      <CompanyContextAccess
        actor={ownerActor}
        identity={deterministicBrowserIdentity()}
      />,
    );
    await screen.findByLabelText('Workspace member');
    chooseTargetsAndBundle('document-approver');
    expect(screen.getByLabelText('Access bundle')).toHaveTextContent(
      'Company Document Approver',
    );
    expect(
      screen.getByText(
        /Company Document Approver v1 grants only the designation of a draft Document Version as official/u,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Current server state:/u)).toHaveTextContent(
      /^Current server state: Not granted$/u,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));
    await screen.findByText('Access granted. Server state refreshed.');
    expect(screen.getByText(/Current server state:/u)).toHaveTextContent(
      /^Current server state: Granted — captured version v1$/u,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));
    await screen.findByText('Access revoked. Server state refreshed.');
    expect(screen.getByText(/Current server state:/u)).toHaveTextContent(
      /^Current server state: Not granted$/u,
    );
    expect(commands).toEqual([
      {
        method: 'POST',
        path: '/api/company-document-approver-assignments',
        key: expect.any(String),
      },
      {
        method: 'DELETE',
        path: `/api/company-document-approver-assignments/${memberId}/${companyId}`,
        key: expect.any(String),
      },
    ]);
    expect(commands[0]?.key).not.toBe(commands[1]?.key);
  });

  it('recognizes Registrar v3 as a captured version', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          administration([
            {
              bundle: 'Company Document Registrar',
              permissionSetVersion: 'v3',
            },
          ]),
        ),
      ),
    );
    render(
      <CompanyContextAccess
        actor={ownerActor}
        identity={deterministicBrowserIdentity()}
      />,
    );
    await screen.findByLabelText('Workspace member');
    chooseTargetsAndBundle('document-registrar');
    expect(screen.getByText(/Current server state:/u)).toHaveTextContent(
      /^Current server state: Granted — captured version v3$/u,
    );
  });

  it.each([
    { bundle: 'Company Document Approver', permissionSetVersion: 'v2' },
    { bundle: 'Company Document Approver', permissionSetVersion: null },
    { bundle: 'Company Document Registrar', permissionSetVersion: 'v4' },
  ])('fails closed on $bundle $permissionSetVersion', async (assignment) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(administration([assignment]))),
    );
    render(
      <CompanyContextAccess
        actor={ownerActor}
        identity={deterministicBrowserIdentity()}
      />,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The access state could not be loaded or changed.',
    );
    expect(screen.queryByLabelText('Workspace member')).not.toBeInTheDocument();
  });
});
