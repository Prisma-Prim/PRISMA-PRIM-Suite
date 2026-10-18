import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
} from '../localization/interface-locale';
import { changeValue } from '../test/select-option';
import { CompanyContextAccess } from './CompanyContextAccess';

const memberId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const companyId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const actor: ActorContext = {
  internalUserId: 'owner',
  workspaceMembershipId: 'owner-member',
  workspaceId: 'workspace',
  workspaceName: 'Workspace',
  displayName: 'Owner',
  email: 'owner@example.test',
  active: true,
  workspacePermissions: ['company.assignment.manage'],
};
function administration(active: boolean, version = 'v1') {
  return {
    members: [
      {
        workspaceMembershipId: memberId,
        displayName: 'Ada Member',
        email: 'ada@example.test',
      },
    ],
    companies: [{ id: companyId, displayName: 'Company {original}' }],
    assignments: active
      ? [
          {
            id: 'template-grant',
            workspaceMembershipId: memberId,
            companyId,
            active: true,
            bundle: 'Company Project Template User',
            permissionSetVersion: version,
          },
        ]
      : [],
  };
}
function view() {
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
  return render(
    <InterfaceLocaleProvider>
      <CompanyContextAccess
        actor={actor}
        identity={deterministicBrowserIdentity()}
      />
    </InterfaceLocaleProvider>,
  );
}
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

it('requires an administrator’s deliberate grant and revoke of the dedicated captured v1 without supplying other authority', async () => {
  let active = false;
  const writes: Array<{
    method: string;
    path: string;
    body: unknown;
    key: string | null;
  }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, options?: RequestInit) => {
      if (path === '/api/company-context-assignments/administration')
        return Response.json(administration(active));
      if (path.startsWith('/api/company-project-template-user-assignments')) {
        const body: unknown =
          typeof options?.body === 'string'
            ? JSON.parse(options.body)
            : undefined;
        writes.push({
          method: options?.method ?? 'GET',
          path,
          body,
          key: new Headers(options?.headers).get('idempotency-key'),
        });
        active = options?.method === 'POST';
        return Response.json(
          {
            id: 'template-grant',
            workspaceMembershipId: memberId,
            companyId,
            bundle: 'Company Project Template User',
            permissionSetVersion: 'v1',
            active,
          },
          { status: active ? 201 : 200 },
        );
      }
      return new Response(null, { status: 404 });
    }),
  );
  view();
  await screen.findByLabelText('Workspace member');
  expect(writes).toEqual([]);
  changeValue(screen.getByLabelText('Workspace member'), memberId);
  changeValue(screen.getByLabelText('Company'), companyId);
  changeValue(screen.getByLabelText('Access bundle'), 'project-template-user');
  expect(screen.getByLabelText('Access bundle')).toHaveTextContent(
    'Project template user',
  );
  expect(
    screen.getByText(
      'Grants template read and instantiation only. Company context, Client read, Project creation and Task management are granted separately. Grants no version publication, stage advancement or authority to start work.',
    ),
  ).toBeVisible();
  expect(screen.getByText(/Current server state:/)).toHaveTextContent(
    'Not granted',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));
  await screen.findByText('Access granted. Server state refreshed.');
  expect(screen.getByText(/Current server state:/)).toHaveTextContent(
    'Granted — captured version v1',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));
  await screen.findByText('Access revoked. Server state refreshed.');
  expect(screen.getByText(/Current server state:/)).toHaveTextContent(
    'Not granted',
  );
  expect(writes).toEqual([
    {
      method: 'POST',
      path: '/api/company-project-template-user-assignments',
      body: { workspaceMembershipId: memberId, companyId },
      key: expect.any(String),
    },
    {
      method: 'DELETE',
      path: `/api/company-project-template-user-assignments/${memberId}/${companyId}`,
      body: undefined,
      key: expect.any(String),
    },
  ]);
  expect(writes[0]?.key).not.toBe(writes[1]?.key);
});

it('assigns and revokes only the independent captured stage-advance bundle through the existing Company administrator', async () => {
  let active = false;
  const writes: { path: string; method: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, options?: RequestInit) => {
      if (path === '/api/company-context-assignments/administration') {
        const base = administration(active);
        return Response.json({
          ...base,
          assignments: base.assignments.map((assignment) => ({
            ...assignment,
            bundle: 'Company Project Stage Advancer',
          })),
        });
      }
      if (path.startsWith('/api/company-project-stage-advancer-assignments')) {
        const body: unknown =
          typeof options?.body === 'string'
            ? JSON.parse(options.body)
            : undefined;
        writes.push({ path, method: options?.method ?? 'GET', body });
        active = options?.method === 'POST';
        return Response.json(
          {
            id: 'stage-grant',
            workspaceMembershipId: memberId,
            companyId,
            active,
            bundle: 'Company Project Stage Advancer',
            permissionSetVersion: 'v1',
          },
          { status: active ? 201 : 200 },
        );
      }
      return new Response(null, { status: 404 });
    }),
  );
  view();
  await screen.findByLabelText('Workspace member');
  expect(writes).toEqual([]);
  changeValue(screen.getByLabelText('Workspace member'), memberId);
  changeValue(screen.getByLabelText('Company'), companyId);
  changeValue(screen.getByLabelText('Access bundle'), 'project-stage-advancer');
  expect(screen.getByLabelText('Access bundle')).toHaveTextContent(
    'Project Stage Advancer',
  );
  expect(
    screen.getByText(
      'Grants only deliberate stage advance. Company context, Template read, Project, Task and original Client read remain separate. Task management and lifecycle approval are not included.',
    ),
  ).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));
  await screen.findByText('Access granted. Server state refreshed.');
  expect(screen.getByText(/Current server state:/)).toHaveTextContent(
    'Granted — captured version v1',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));
  await screen.findByText('Access revoked. Server state refreshed.');
  expect(writes).toEqual([
    {
      path: '/api/company-project-stage-advancer-assignments',
      method: 'POST',
      body: { workspaceMembershipId: memberId, companyId },
    },
    {
      path: `/api/company-project-stage-advancer-assignments/${memberId}/${companyId}`,
      method: 'DELETE',
      body: undefined,
    },
  ]);
});
