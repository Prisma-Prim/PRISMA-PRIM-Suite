import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CompanyContextAccess } from '../access/CompanyContextAccess';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
const actor: ActorContext = {
  internalUserId: 'owner',
  workspaceMembershipId: 'owner-membership',
  workspaceId: 'workspace',
  workspaceName: 'Workspace',
  displayName: 'Owner',
  email: 'owner@example.test',
  active: true,
  workspacePermissions: ['company.assignment.manage'],
};
const identity: BrowserIdentity = {
  loaded: true,
  signedIn: true,
  getToken: async () => 'token',
  rejectSession: async () => undefined,
  signOut: async () => undefined,
  signedOutView: null,
};
afterEach(() => vi.unstubAllGlobals());
it('explicitly grants and revokes the Document Registrar bundle through Company administration', async () => {
  let granted = false;
  const fetcher = vi.fn(async (url: string) => {
    if (url.endsWith('/administration'))
      return Response.json({
        members: [
          {
            workspaceMembershipId: 'member',
            displayName: 'Registrar',
            email: 'registrar@example.test',
          },
        ],
        companies: [{ id: 'company', displayName: 'PRISMA-PRIM' }],
        assignments: granted
          ? [
              {
                id: 'assignment',
                workspaceMembershipId: 'member',
                companyId: 'company',
                bundle: 'Company Document Registrar',
                permissionSetVersion: 'v1',
                active: true,
              },
            ]
          : [],
      });
    if (url.endsWith('/company-document-registrar-assignments')) {
      granted = true;
      return Response.json({}, { status: 201 });
    }
    if (
      url.endsWith('/company-document-registrar-assignments/member/company')
    ) {
      granted = false;
      return Response.json({});
    }
    return Response.json([]);
  });
  vi.stubGlobal('fetch', fetcher);
  render(<CompanyContextAccess actor={actor} identity={identity} />);
  fireEvent.change(await screen.findByLabelText('Workspace member'), {
    target: { value: 'member' },
  });
  fireEvent.change(screen.getByLabelText('Company', { exact: true }), {
    target: { value: 'company' },
  });
  fireEvent.change(screen.getByLabelText('Access bundle'), {
    target: { value: 'document-registrar' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));
  expect(
    await screen.findByText('Access granted. Server state refreshed.'),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(fetcher).toHaveBeenCalledWith(
      '/api/company-document-registrar-assignments',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          workspaceMembershipId: 'member',
          companyId: 'company',
        }),
      }),
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));
  expect(
    await screen.findByText('Access revoked. Server state refreshed.'),
  ).toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledWith(
    '/api/company-document-registrar-assignments/member/company',
    expect.objectContaining({ method: 'DELETE' }),
  );
});
