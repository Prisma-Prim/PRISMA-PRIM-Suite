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
afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});
describe('Independent Contract model opt-in administration', () => {
  it('grants and revokes Editor and Approver independently through existing administration', async () => {
    const grants = new Set<string>();
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
            assignments: [...grants].map((bundle) => ({
              id: `grant-${bundle}`,
              workspaceMembershipId: memberId,
              companyId,
              bundle,
              permissionSetVersion: 'v1',
              active: true,
            })),
          });
        const editor = path.includes('contract-model-editor');
        const bundle = editor
          ? 'Company Contract Model Editor'
          : 'Company Contract Model Approver';
        commands.push({
          path,
          method: options?.method ?? 'GET',
          key: new Headers(options?.headers).get('idempotency-key'),
        });
        if (options?.method === 'POST') grants.add(bundle);
        else grants.delete(bundle);
        return Response.json({
          id: 'grant',
          workspaceMembershipId: memberId,
          companyId,
          bundle,
          permissionSetVersion: 'v1',
          active: options?.method === 'POST',
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
    for (const bundle of ['contract-model-editor', 'contract-model-approver']) {
      selectOption(screen.getByLabelText('Access bundle'), bundle);
      fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));
      await screen.findByText('Access granted. Server state refreshed.');
    }
    expect(grants.size).toBe(2);
    selectOption(
      screen.getByLabelText('Access bundle'),
      'contract-model-editor',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));
    await screen.findByText('Access revoked. Server state refreshed.');
    expect(grants).toEqual(new Set(['Company Contract Model Approver']));
    expect(commands.map((item) => item.method)).toEqual([
      'POST',
      'POST',
      'DELETE',
    ]);
    expect(commands.every((item) => !!item.key)).toBe(true);
    expect(commands[2]?.path).toBe(
      `/api/company-contract-model-editor-assignments/${memberId}/${companyId}`,
    );
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
            bundle: 'Company Contract Model Editor',
            permissionSetVersion: 'v2',
            active: true,
          },
        ],
      }),
    ).toThrow('Unknown captured');
  });
});
