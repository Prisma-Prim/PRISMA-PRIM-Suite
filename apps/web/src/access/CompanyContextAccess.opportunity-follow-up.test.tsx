import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
} from '../localization/interface-locale';
import { selectOption } from '../test/select-option';
import { CompanyContextAccess } from './CompanyContextAccess';
import {
  assignmentAdministration,
  assignmentAdministrator,
  assignmentBundleCases,
  assignmentCompanyId,
  assignmentLocaleCases,
  assignmentMemberId,
} from './company-assignment-localization.test-fixtures';
import { companyAccessAdministrationResponse } from './company-access-administration-response';

const bundle = assignmentBundleCases.find(
  (candidate) => candidate.value === 'opportunity-follow-up-coordinator',
);
if (!bundle) throw new Error('Missing coordinator fixture');
const administrationPath = '/api/company-context-assignments/administration';
const assignmentPath =
  '/api/company-opportunity-follow-up-coordinator-assignments';

afterEach(() => vi.unstubAllGlobals());

it.each(assignmentLocaleCases)(
  'grants and revokes the independent coordinator in $locale with exact native administration transport',
  async (locale) => {
    let active = false;
    const commands: {
      path: string;
      method: string;
      body: BodyInit | null | undefined;
      key: string | null;
    }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
        const path = String(input);
        if (path === administrationPath)
          return Response.json(
            assignmentAdministration({ activeBundles: active ? [bundle] : [] }),
          );
        commands.push({
          path,
          method: options?.method ?? 'GET',
          body: options?.body,
          key: new Headers(options?.headers).get('idempotency-key'),
        });
        active = options?.method === 'POST';
        return Response.json({}, { status: active ? 201 : 200 });
      }),
    );
    localStorage.setItem(interfaceLocaleStorageKey, locale.locale);
    render(
      <InterfaceLocaleProvider>
        <CompanyContextAccess
          actor={assignmentAdministrator}
          identity={{
            loaded: true,
            signedIn: true,
            getToken: async () => null,
            rejectSession: async () => undefined,
            signOut: async () => undefined,
            signedOutView: null,
          }}
        />
      </InterfaceLocaleProvider>,
    );
    const member = await screen.findByRole('combobox', { name: locale.member });
    selectOption(member, assignmentMemberId);
    selectOption(
      screen.getByRole('combobox', { name: locale.company }),
      assignmentCompanyId,
    );
    const control = screen.getByRole('combobox', { name: locale.bundle });
    selectOption(control, bundle.value);
    expect(control).toHaveTextContent(bundle.labels[locale.locale]);
    fireEvent.click(screen.getByRole('button', { name: locale.grant }));
    await screen.findByText(locale.granted);
    expect(screen.getByRole('button', { name: locale.revoke })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: locale.revoke }));
    await screen.findByText(locale.revoked);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: locale.grant })).toBeEnabled(),
    );
    expect(commands).toEqual([
      {
        path: assignmentPath,
        method: 'POST',
        body: JSON.stringify({
          workspaceMembershipId: assignmentMemberId,
          companyId: assignmentCompanyId,
        }),
        key: expect.any(String),
      },
      {
        path: `${assignmentPath}/${assignmentMemberId}/${assignmentCompanyId}`,
        method: 'DELETE',
        body: undefined,
        key: expect.any(String),
      },
    ]);
    expect(commands[0]?.key).not.toBe(commands[1]?.key);
  },
);

it('refuses unknown coordinator capture versions in administration', () => {
  const administration = assignmentAdministration({ activeBundles: [bundle] });
  expect(
    companyAccessAdministrationResponse(administration).assignments[0],
  ).toMatchObject({
    bundle: 'Company Opportunity Follow-up Coordinator',
    permissionSetVersion: 'v1',
  });
  for (const permissionSetVersion of [null, 'v2', 'future'])
    expect(() =>
      companyAccessAdministrationResponse({
        ...administration,
        assignments: administration.assignments.map((assignment) => ({
          ...assignment,
          permissionSetVersion,
        })),
      }),
    ).toThrow('Unknown captured Company access version.');
});
