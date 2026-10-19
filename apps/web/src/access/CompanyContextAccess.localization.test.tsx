import { act, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
} from '../localization/interface-locale';
import { InterfaceLocaleSelect } from '../localization/InterfaceLocaleSelect';
import { selectOption } from '../test/select-option';
import { CompanyContextAccess } from './CompanyContextAccess';

const memberId = '11111111-1111-4111-8111-111111111111';
const otherMemberId = '11111111-1111-4111-8111-111111111112';
const companyId = '22222222-2222-4222-8222-222222222221';
const otherCompanyId = '22222222-2222-4222-8222-222222222222';
const memberName =
  'Ana {originală} / Борис {имя} — Équipe de conseil au nom volontairement très long';
const email = 'ana+literal@example.test';
const memberLabel = `${memberName} — ${email}`;
const companyName =
  'PRISMA {origine} / Компания — Entité opérationnelle au nom volontairement très long';

const actor: ActorContext = {
  internalUserId: '00000000-0000-4000-8000-000000000001',
  workspaceMembershipId: '00000000-0000-4000-8000-000000000002',
  workspaceId: '00000000-0000-4000-8000-000000000003',
  workspaceName: 'Workspace {original} / Пространство',
  displayName: 'Authorized administrator',
  email: 'administrator@example.test',
  active: true,
  workspacePermissions: ['company.assignment.manage'],
};

afterEach(() => vi.unstubAllGlobals());

it('translates canonical Director Client v2 from English to Romanian without replacing selected controls, focus or authority work', async () => {
  const getToken = vi.fn(async () => null);
  const rejectSession = vi.fn(async () => undefined);
  const signOut = vi.fn(async () => undefined);
  const identity: BrowserIdentity = {
    loaded: true,
    signedIn: true,
    getToken,
    rejectSession,
    signOut,
    signedOutView: null,
  };
  const callbacks = {
    onActorRevalidated: vi.fn(async () => undefined),
    onCompanyContextRejected: vi.fn(async () => undefined),
    onActivityRecorded: vi.fn(async () => undefined),
    onClientAuthorityChanged: vi.fn(async () => undefined),
    onWorkspaceAccessRejected: vi.fn(async () => undefined),
  };
  const requests: Array<{
    path: string;
    method: string;
    body: BodyInit | null | undefined;
  }> = [];
  const fetch = vi.fn(
    async (input: RequestInfo | URL, options?: RequestInit) => {
      const path = String(input);
      requests.push({
        path,
        method: options?.method ?? 'GET',
        body: options?.body,
      });
      if (path !== '/api/company-context-assignments/administration')
        throw new Error(`Unexpected HTTP request: ${path}`);
      return Response.json({
        members: [
          { workspaceMembershipId: memberId, displayName: memberName, email },
          {
            workspaceMembershipId: otherMemberId,
            displayName: memberName,
            email,
          },
        ],
        companies: [
          { id: companyId, displayName: companyName },
          { id: otherCompanyId, displayName: companyName },
        ],
        assignments: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            workspaceMembershipId: memberId,
            companyId,
            bundle: 'Company Director Client Access',
            permissionSetVersion: 'v2',
            active: true,
          },
        ],
      });
    },
  );
  vi.stubGlobal('fetch', fetch);
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
  render(
    <InterfaceLocaleProvider>
      <InterfaceLocaleSelect />
      <CompanyContextAccess actor={actor} identity={identity} {...callbacks} />
    </InterfaceLocaleProvider>,
  );

  const member = await screen.findByRole('combobox', {
    name: 'Workspace member',
  });
  const company = screen.getByRole('combobox', {
    name: 'Company',
  });
  const bundle = screen.getByRole('combobox', { name: 'Access bundle' });
  selectOption(member, memberId);
  selectOption(company, companyId);
  selectOption(bundle, 'director-client');
  const grant = screen.getByRole('button', { name: 'Grant access' });
  const revoke = screen.getByRole('button', { name: 'Revoke access' });
  const state = screen.getByRole('status');

  expect(screen.getByRole('heading', { name: 'Company access' })).toBeVisible();
  expect(member).toHaveTextContent(memberLabel);
  expect(member).toHaveTextContent('Reference 10DGNSXLJLXOXC3RMYV4E8SNL');
  expect(company).toHaveTextContent(companyName);
  expect(company).toHaveTextContent('Reference 20QXBLV736I61189QVFXEPZJ5');
  expect(bundle).toHaveTextContent('Company Director Client Access');
  expect(state).toHaveTextContent(
    'Current server state: Granted — captured version v2',
  );
  expect(
    screen.getByText(
      'The version is captured when access is granted. A later version applies only after this access is revoked and granted again.',
    ),
  ).toBeVisible();
  expect(grant).toBeDisabled();
  expect(revoke).toBeEnabled();
  expect(requests).toEqual([
    {
      path: '/api/company-context-assignments/administration',
      method: 'GET',
      body: undefined,
    },
  ]);
  expect(getToken).toHaveBeenCalledOnce();
  for (const callback of Object.values(callbacks))
    expect(callback).not.toHaveBeenCalled();

  const locale = screen.getByRole('combobox', { name: 'Interface language' });
  locale.focus();
  expect(locale).toHaveFocus();
  selectOption(locale, 'ro');
  await act(async () => undefined);

  // These invariants precede the missing-translation assertion so the first
  // RED proves a localization defect at the existing public component seam.
  expect(document.documentElement.lang).toBe('ro');
  expect(localStorage.getItem(interfaceLocaleStorageKey)).toBe('ro');
  expect(screen.getByRole('combobox', { name: 'Limba interfeței' })).toBe(
    locale,
  );
  expect(locale).toHaveFocus();
  for (const control of [member, company, bundle]) {
    expect(screen.getAllByRole('combobox')).toContain(control);
    expect(control).toBeEnabled();
  }
  expect(screen.getByRole('status')).toBe(state);
  expect(member).toHaveTextContent(memberLabel);
  expect(member).toHaveTextContent('10DGNSXLJLXOXC3RMYV4E8SNL');
  expect(company).toHaveTextContent(companyName);
  expect(company).toHaveTextContent('20QXBLV736I61189QVFXEPZJ5');
  expect(state).toHaveTextContent('v2');
  expect(grant).toBeInTheDocument();
  expect(revoke).toBeInTheDocument();
  expect(grant).toBeDisabled();
  expect(revoke).toBeEnabled();
  expect(fetch).toHaveBeenCalledOnce();
  expect(getToken).toHaveBeenCalledOnce();
  expect(requests.filter((request) => request.method !== 'GET')).toEqual([]);
  expect(rejectSession).not.toHaveBeenCalled();
  expect(signOut).not.toHaveBeenCalled();
  for (const callback of Object.values(callbacks))
    expect(callback).not.toHaveBeenCalled();

  // Independent expected copy: no future catalog or translation helper imports.
  expect(
    screen.getByRole('heading', { name: 'Acces la companie' }),
  ).toBeVisible();
  expect(
    screen.getByRole('combobox', { name: 'Membru al spațiului de lucru' }),
  ).toBe(member);
  expect(screen.getByRole('combobox', { name: 'Companie' })).toBe(company);
  expect(screen.getByRole('combobox', { name: 'Pachet de acces' })).toBe(
    bundle,
  );
  expect(screen.getByRole('button', { name: 'Acordă acces' })).toBe(grant);
  expect(screen.getByRole('button', { name: 'Revocă acces' })).toBe(revoke);
  expect(state).toHaveTextContent(
    'Starea curentă a serverului: Acordat — versiunea capturată v2',
  );
  expect(
    within(screen.getByRole('region', { name: 'Acces la companie' })).getByText(
      'Versiunea este capturată la acordarea accesului. O versiune ulterioară se aplică numai după revocarea și acordarea din nou a acestui acces.',
    ),
  ).toBeVisible();
});
