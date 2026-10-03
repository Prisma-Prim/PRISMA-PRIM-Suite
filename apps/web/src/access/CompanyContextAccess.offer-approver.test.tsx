import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { selectOption } from '../test/select-option';
import { CompanyContextAccess } from './CompanyContextAccess';

const membershipId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const companyId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const actor: ActorContext = {
  internalUserId: 'owner',
  workspaceMembershipId: 'owner-member',
  workspaceId: 'workspace',
  workspaceName: 'Synthetic Workspace',
  displayName: 'Owner',
  email: 'owner@example.test',
  active: true,
  workspacePermissions: ['company.assignment.manage'],
};
function administration(active: boolean, version: unknown = 'v1') {
  return {
    members: [
      {
        workspaceMembershipId: membershipId,
        displayName: 'Synthetic approver',
        email: 'approver@example.test',
      },
    ],
    companies: [{ id: companyId, displayName: 'Synthetic Company' }],
    assignments: active
      ? [
          {
            id: 'assignment',
            workspaceMembershipId: membershipId,
            companyId,
            bundle: 'Company Offer Approver',
            permissionSetVersion: version,
            active: true,
          },
        ]
      : [],
  };
}
afterEach(() => vi.unstubAllGlobals());
describe('Company Offer Approver administration', () => {
  it('explicitly grants and revokes captured v1 with separate command keys', async () => {
    let active = false;
    const commands: Array<{ method: string; key: string | null }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, init?: RequestInit) => {
        if (path.endsWith('/administration'))
          return Response.json(administration(active));
        if (path.startsWith('/api/company-offer-approver-assignments')) {
          const method = init?.method ?? 'GET';
          commands.push({
            method,
            key: new Headers(init?.headers).get('idempotency-key'),
          });
          active = method === 'POST';
          return Response.json(
            {
              id: 'assignment',
              workspaceMembershipId: membershipId,
              companyId,
              bundle: 'Company Offer Approver',
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
        actor={actor}
        identity={deterministicBrowserIdentity()}
      />,
    );
    await screen.findByLabelText('Workspace member');
    selectOption(screen.getByLabelText('Workspace member'), membershipId);
    selectOption(screen.getByLabelText('Company', { exact: true }), companyId);
    selectOption(screen.getByLabelText('Access bundle'), 'offer-approver');
    expect(
      screen.getByText(
        /Company Offer Approver v1 grants Offer read and decisions only/u,
      ),
    ).toBeInTheDocument();
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
    expect(commands.map((command) => command.method)).toEqual([
      'POST',
      'DELETE',
    ]);
    expect(commands[0]?.key).toBeTruthy();
    expect(commands[0]?.key).not.toBe(commands[1]?.key);
  });
  it.each([null, 'v2', 'unknown'])(
    'fails closed for captured version %s',
    async (version) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => Response.json(administration(true, version))),
      );
      render(
        <CompanyContextAccess
          actor={actor}
          identity={deterministicBrowserIdentity()}
        />,
      );
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'The access state could not be loaded or changed.',
      );
      expect(
        screen.queryByLabelText('Workspace member'),
      ).not.toBeInTheDocument();
    },
  );
});
