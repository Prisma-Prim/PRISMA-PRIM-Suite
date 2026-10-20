import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
} from '../localization/interface-locale';
import { selectOption } from '../test/select-option';
import { CompanyContextAccess } from './CompanyContextAccess';

const companyId = 'company-737';
const memberId = 'member-737';
const administrator: ActorContext = {
  internalUserId: 'owner',
  workspaceMembershipId: 'owner-member',
  workspaceId: 'workspace',
  workspaceName: 'Workspace DEMO',
  displayName: 'Owner DEMO',
  email: 'owner@example.test',
  active: true,
  workspacePermissions: ['company.assignment.manage'],
};
const legacy = {
  id: 'legacy-assignment',
  companyId,
  workspaceMembershipId: memberId,
  active: true,
  bundle: 'Company Director Client Access',
  permissionSetVersion: 'v2',
};
const labels = {
  reader: 'Company Complaints Reader',
  recorder: 'Company Complaints Recorder',
};
function administration(assignments: unknown[]) {
  return {
    members: [
      {
        workspaceMembershipId: memberId,
        displayName: 'Member DEMO',
        email: 'member@example.test',
      },
    ],
    companies: [{ id: companyId, displayName: 'Company DEMO' }],
    assignments,
  };
}
function present(locale = 'en') {
  localStorage.setItem(interfaceLocaleStorageKey, locale);
  return render(
    <InterfaceLocaleProvider>
      <CompanyContextAccess
        actor={administrator}
        identity={deterministicBrowserIdentity()}
      />
    </InterfaceLocaleProvider>,
  );
}
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

it('grants and revokes captured-v1 Complaint rights independently in a mixed existing administration page', async () => {
  const active = { reader: false, recorder: false };
  const commands: Array<{
    path: string;
    method: string;
    body: string | undefined;
    key: string | null;
  }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const assignments = () => [
        legacy,
        ...(['reader', 'recorder'] satisfies Array<keyof typeof active>)
          .filter((role) => active[role])
          .map((role) => ({
            id: `${role}-assignment`,
            companyId,
            workspaceMembershipId: memberId,
            active: true,
            bundle: labels[role],
            permissionSetVersion: 'v1',
          })),
      ];
      if (path === '/api/company-context-assignments/administration')
        return Response.json(administration(assignments()));
      for (const role of ['reader', 'recorder'] satisfies Array<
        keyof typeof active
      >) {
        const route = `/api/company-complaints-${role}-assignments`;
        if (path === route || path === `${route}/${memberId}/${companyId}`) {
          const method = init?.method ?? 'GET';
          if (method !== 'POST' && method !== 'DELETE')
            throw new Error('Unexpected administration command.');
          active[role] = method === 'POST';
          commands.push({
            path,
            method,
            body: typeof init?.body === 'string' ? init.body : undefined,
            key: new Headers(init?.headers).get('idempotency-key'),
          });
          return Response.json(
            {
              id: `${role}-assignment`,
              companyId,
              workspaceMembershipId: memberId,
              active: active[role],
              bundle: labels[role],
              permissionSetVersion: 'v1',
            },
            { status: method === 'POST' ? 201 : 200 },
          );
        }
      }
      throw new Error(`Unexpected request: ${path}`);
    }),
  );
  present();
  selectOption(await screen.findByLabelText('Workspace member'), memberId);
  selectOption(screen.getByLabelText('Company', { exact: true }), companyId);
  const choose = (role: 'reader' | 'recorder') =>
    selectOption(screen.getByLabelText('Access bundle'), `complaints-${role}`);
  async function expectGranted() {
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Grant access' }),
      ).toBeDisabled();
      expect(
        screen.getByRole('button', { name: 'Revoke access' }),
      ).toBeEnabled();
    });
    expect(screen.getByText(/Current server state:/u)).toHaveTextContent(
      'Granted — captured version v1',
    );
  }
  choose('reader');
  fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));
  await expectGranted();
  choose('recorder');
  expect(screen.getByText(/Current server state:/u)).toHaveTextContent(
    'Not granted',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));
  await expectGranted();
  choose('reader');
  fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Grant access' })).toBeEnabled(),
  );
  expect(screen.getByText(/Current server state:/u)).toHaveTextContent(
    'Not granted',
  );
  choose('recorder');
  expect(screen.getByText(/Current server state:/u)).toHaveTextContent(
    'Granted — captured version v1',
  );
  expect(screen.getByRole('button', { name: 'Revoke access' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Grant access' })).toBeEnabled(),
  );
  expect(screen.getByText(/Current server state:/u)).toHaveTextContent(
    'Not granted',
  );
  selectOption(screen.getByLabelText('Access bundle'), 'director-client');
  expect(screen.getByText(/Current server state:/u)).toHaveTextContent(
    'Granted — captured version v2',
  );
  expect(
    commands.map(({ path, method, body }) => ({ path, method, body })),
  ).toEqual([
    {
      path: '/api/company-complaints-reader-assignments',
      method: 'POST',
      body: JSON.stringify({ workspaceMembershipId: memberId, companyId }),
    },
    {
      path: '/api/company-complaints-recorder-assignments',
      method: 'POST',
      body: JSON.stringify({ workspaceMembershipId: memberId, companyId }),
    },
    {
      path: `/api/company-complaints-reader-assignments/${memberId}/${companyId}`,
      method: 'DELETE',
      body: undefined,
    },
    {
      path: `/api/company-complaints-recorder-assignments/${memberId}/${companyId}`,
      method: 'DELETE',
      body: undefined,
    },
  ]);
  expect(
    commands.every(
      (command) => typeof command.key === 'string' && command.key.length > 0,
    ),
  ).toBe(true);
  expect(new Set(commands.map((command) => command.key)).size).toBe(4);
  expect(active).toEqual({ reader: false, recorder: false });
});

it.each([
  {
    locale: 'en',
    bundle: 'Access bundle',
    reader: 'Company Complaints Reader',
    recorder: 'Company Complaints Recorder',
  },
  {
    locale: 'fr',
    bundle: 'Ensemble de droits',
    reader: 'Lecture des réclamations de la Compagnie',
    recorder: 'Enregistrement des réclamations de la Compagnie',
  },
  {
    locale: 'ro',
    bundle: 'Pachet de acces',
    reader: 'Citirea reclamațiilor Companiei',
    recorder: 'Înregistrarea reclamațiilor Companiei',
  },
  {
    locale: 'ru',
    bundle: 'Набор прав доступа',
    reader: 'Чтение жалоб Компании',
    recorder: 'Регистрация жалоб Компании',
  },
])(
  'offers both explicit Complaint choices through the custom selector in $locale',
  async ({ locale, bundle, reader, recorder }) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(administration([legacy]))),
    );
    present(locale);
    const selector = await screen.findByLabelText(bundle);
    expect(selector.tagName).toBe('BUTTON');
    selectOption(selector, 'complaints-reader');
    expect(selector).toHaveTextContent(reader);
    selectOption(selector, 'complaints-recorder');
    expect(selector).toHaveTextContent(recorder);
    expect(document.querySelector('select')).toBeNull();
  },
);

it.each([
  { bundle: 'Company Complaints Reader', version: null },
  { bundle: 'Company Complaints Reader', version: 'v2' },
  { bundle: 'Company Complaints Recorder', version: null },
  { bundle: 'Company Complaints Recorder', version: 'v2' },
])(
  'rejects a mixed administration page with unsupported $bundle capture $version',
  async ({ bundle, version }) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          administration([
            legacy,
            {
              id: 'complaint-assignment',
              companyId,
              workspaceMembershipId: memberId,
              bundle,
              active: true,
              permissionSetVersion: version,
            },
          ]),
        ),
      ),
    );
    present();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The access state could not be loaded or changed.',
    );
    expect(screen.queryByLabelText('Access bundle')).not.toBeInTheDocument();
  },
);
