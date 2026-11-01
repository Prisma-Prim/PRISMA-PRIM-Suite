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
import {
  assertMessageCoverage,
  resolveMessage,
} from '../localization/messages';
import { externalInvoiceAssignmentMessages } from './external-invoice-assignment.copy';
import { companyAccessAdministrationResponse } from './company-access-administration-response';

const memberId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const companyId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const owner: ActorContext = {
  internalUserId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  workspaceMembershipId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  workspaceId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  workspaceName: 'Synthetic Workspace',
  displayName: 'Synthetic Owner',
  email: 'owner@example.test',
  active: true,
  workspacePermissions: ['company.manage', 'company.assignment.manage'],
};
const bundles = [
  { value: 'invoice-reader', label: 'Company Invoice Reader' },
  { value: 'invoice-recorder', label: 'Company Invoice Recorder' },
  {
    value: 'external-invoice-access',
    label: 'Company External Invoice Access',
  },
];
afterEach(() => vi.unstubAllGlobals());
describe('External invoice explicit admin bundles', () => {
  it.each(bundles)(
    'grants and revokes only the captured v1 $label through native administration',
    async (bundle) => {
      let active = false;
      const commands: Array<{
        method: string;
        path: string;
        key: string | null;
        body: unknown;
      }> = [];
      const assignment = () => ({
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        workspaceMembershipId: memberId,
        companyId,
        bundle: bundle.label,
        permissionSetVersion: 'v1',
        active,
      });
      vi.stubGlobal(
        'fetch',
        vi.fn(async (path: string, options?: RequestInit) => {
          if (path === '/api/company-context-assignments/administration')
            return Response.json({
              members: [
                {
                  workspaceMembershipId: memberId,
                  displayName: 'Synthetic Recorder',
                  email: 'recorder@example.test',
                },
              ],
              companies: [{ id: companyId, displayName: 'Synthetic Company' }],
              assignments: active ? [assignment()] : [],
            });
          if (path.startsWith(`/api/company-${bundle.value}-assignments`)) {
            commands.push({
              method: options?.method ?? 'GET',
              path,
              key: new Headers(options?.headers).get('idempotency-key'),
              body: options?.body ? JSON.parse(String(options.body)) : null,
            });
            active = options?.method === 'POST';
            return Response.json(assignment(), { status: active ? 201 : 200 });
          }
          return new Response(null, { status: 404 });
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
      selectOption(
        screen.getByLabelText('Company', { exact: true }),
        companyId,
      );
      selectOption(screen.getByLabelText('Access bundle'), bundle.value);
      expect(screen.getByText(/Explicit v1 assignment/u)).toBeInTheDocument();
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
          method: 'POST',
          path: `/api/company-${bundle.value}-assignments`,
          key: expect.any(String),
          body: { workspaceMembershipId: memberId, companyId },
        },
        {
          method: 'DELETE',
          path: `/api/company-${bundle.value}-assignments/${memberId}/${companyId}`,
          key: expect.any(String),
          body: null,
        },
      ]);
    },
  );
  it('localizes all three bundle meanings and their six safe Activity labels in all four interface locales', () => {
    assertMessageCoverage(
      'externalInvoiceAssignments',
      externalInvoiceAssignmentMessages,
    );
    for (const locale of ['ro', 'ru', 'fr', 'en'] satisfies Array<
      'ro' | 'ru' | 'fr' | 'en'
    >) {
      const labels = [
        'readerBundle',
        'recorderBundle',
        'familyBundle',
      ] satisfies Array<'readerBundle' | 'recorderBundle' | 'familyBundle'>;
      expect(
        new Set(
          labels.map((key) =>
            resolveMessage(externalInvoiceAssignmentMessages, locale, key),
          ),
        ).size,
      ).toBe(3);
    }
  });
  it.each(bundles)(
    'rejects unknown or absent captured versions for $label',
    (bundle) => {
      const base = {
        id: 'assignment',
        workspaceMembershipId: memberId,
        companyId,
        bundle: bundle.label,
        active: true,
      };
      expect(
        companyAccessAdministrationResponse({
          members: [],
          companies: [],
          assignments: [{ ...base, permissionSetVersion: 'v1' }],
        }).assignments,
      ).toHaveLength(1);
      for (const permissionSetVersion of [undefined, null, 'v2', 'v99'])
        expect(() =>
          companyAccessAdministrationResponse({
            members: [],
            companies: [],
            assignments: [{ ...base, permissionSetVersion }],
          }),
        ).toThrow('Unknown captured Company access version.');
    },
  );
});
