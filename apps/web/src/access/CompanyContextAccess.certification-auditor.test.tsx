import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { InterfaceLocaleProvider } from '../localization/interface-locale';
import { selectOption } from '../test/select-option';
import { CompanyContextAccess } from './CompanyContextAccess';
import { companyAccessAdministrationResponse } from './company-access-administration-response';

const memberId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const companyId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const owner: ActorContext = {
  internalUserId: 'owner',
  workspaceMembershipId: 'owner-membership',
  workspaceId: 'workspace',
  workspaceName: 'Synthetic Workspace',
  displayName: 'Owner',
  email: 'owner@example.test',
  active: true,
  workspacePermissions: ['company.assignment.manage'],
};
const AUDITOR = 'Company Certification Auditor';

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('Company Certification Auditor administration', () => {
  it('states its prerequisites, then grants and revokes it through its own endpoint', async () => {
    let active = false;
    const commands: { path: string; method: string; key: string | null }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, options?: RequestInit) => {
        if (path === '/api/company-context-assignments/administration')
          return Response.json({
            members: [
              {
                workspaceMembershipId: memberId,
                displayName: 'Synthetic member',
                email: 'member@example.test',
              },
            ],
            companies: [{ id: companyId, displayName: 'Synthetic Company' }],
            assignments: active
              ? [
                  {
                    id: 'grant-auditor',
                    workspaceMembershipId: memberId,
                    companyId,
                    bundle: AUDITOR,
                    permissionSetVersion: 'v1',
                    active: true,
                  },
                ]
              : [],
          });
        commands.push({
          path,
          method: options?.method ?? 'GET',
          key: new Headers(options?.headers).get('idempotency-key'),
        });
        active = options?.method === 'POST';
        return Response.json({
          id: 'grant-auditor',
          workspaceMembershipId: memberId,
          companyId,
          bundle: AUDITOR,
          permissionSetVersion: 'v1',
          active,
        });
      }),
    );
    window.localStorage.setItem('prisma-prim.interface-locale', 'en');
    render(
      <InterfaceLocaleProvider>
        <CompanyContextAccess
          actor={owner}
          identity={deterministicBrowserIdentity()}
        />
      </InterfaceLocaleProvider>,
    );
    await screen.findByLabelText('Workspace member');
    selectOption(screen.getByLabelText('Workspace member'), memberId);
    selectOption(screen.getByLabelText('Company', { exact: true }), companyId);
    selectOption(
      screen.getByLabelText('Access bundle'),
      'certification-auditor',
    );
    expect(
      screen.getByText(
        'A Certification Auditor acts only while also holding Company Certification Reader in the same Company. Only the auditor linked to the leader of the approved audit team records the Stage reports.',
      ),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));
    await screen.findByText('Access granted. Server state refreshed.');
    fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));
    await screen.findByText('Access revoked. Server state refreshed.');
    expect(commands).toEqual([
      {
        path: '/api/company-certification-auditor-assignments',
        method: 'POST',
        key: expect.any(String),
      },
      {
        path: `/api/company-certification-auditor-assignments/${memberId}/${companyId}`,
        method: 'DELETE',
        key: expect.any(String),
      },
    ]);
  });

  it('fails closed when administration reports an unknown captured version', () => {
    expect(() =>
      companyAccessAdministrationResponse({
        members: [],
        companies: [],
        assignments: [
          {
            id: 'grant',
            workspaceMembershipId: memberId,
            companyId,
            bundle: AUDITOR,
            permissionSetVersion: 'v2',
            active: true,
          },
        ],
      }),
    ).toThrow('Unknown captured');
  });
});
