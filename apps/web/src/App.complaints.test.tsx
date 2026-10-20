import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
import type { ActorContext } from './access-types';
import { deterministicBrowserIdentity } from './access-composition';
import {
  clearWorkspaceSelection,
  selectWorkspace,
} from './access/workspace-selection';
import { complaintMessages } from './complaints/complaints.copy';
import { InterfaceLocaleSelect } from './localization/InterfaceLocaleSelect';
import { assertMessageCoverage, resolveMessage } from './localization/messages';
import {
  InterfaceLocaleProvider,
  interfaceLocales,
  interfaceLocaleStorageKey,
  type InterfaceLocale,
} from './localization/interface-locale';
import { preferenceKey } from './production-shell/company-context-preference';
import { changeValue } from './test/select-option';

const ids = {
  workspace: '00000000-0000-4000-8000-000000000737',
  company: '00000000-0000-4000-8000-000000000738',
  membership: '00000000-0000-4000-8000-000000000739',
  client: '00000000-0000-4000-8000-000000000740',
  complaint: '00000000-0000-4000-8000-000000000741',
};
const company = { id: ids.company, displayName: 'Synthetic Complaint Company' };
const original = {
  complaintDate: null,
  complainant: 'Synthetic representative',
  subject: '  Literal <script>private declaration</script>\nȘtefan / Иван  ',
  severityDescription: null,
  responseDueDate: null,
};
const saved = {
  id: ids.complaint,
  workspaceId: ids.workspace,
  companyId: ids.company,
  clientAccountId: ids.client,
  clientDisplayName: 'Synthetic Client',
  projectId: null,
  project: null,
  revision: 1,
  createdAt: '2026-10-20T09:30:00.000Z',
  responsible: {
    workspaceMembershipId: ids.membership,
    displayLabel: 'Synthetic recorder',
  },
  originalIntake: original,
  currentIntake: original,
};
const nativeScrollIntoView = Element.prototype.scrollIntoView;

function actor(reader = true, recorder = true): ActorContext {
  return {
    internalUserId: 'synthetic-recorder',
    workspaceMembershipId: ids.membership,
    workspaceId: ids.workspace,
    workspaceName: 'Synthetic Workspace',
    displayName: 'Synthetic recorder',
    email: 'synthetic@example.test',
    active: true,
    workspacePermissions: [],
    activeCompany: {
      ...company,
      clientPermissions: ['client.read'],
      clientPermissionAssignmentId: 'synthetic-client-reader',
      clientPermissionSetVersion: 'v1',
      ...(reader
        ? {
            complaintReaderAssignmentId: 'synthetic-complaint-reader',
            complaintReaderPermissionSetVersion: 'v1',
          }
        : {}),
      ...(recorder
        ? {
            complaintRecorderAssignmentId: 'synthetic-complaint-recorder',
            complaintRecorderPermissionSetVersion: 'v1',
          }
        : {}),
    },
  };
}

function serve(current: ActorContext) {
  const commands: { body: BodyInit | null | undefined; key: string | null }[] =
    [];
  const complaintReads: string[] = [];
  let recorded = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input.toString(), window.location.origin);
      const path = url.pathname;
      const method = init?.method ?? 'GET';
      if (path === '/api/access/current-actor') return Response.json(current);
      if (path === '/api/companies') return Response.json([company]);
      if (path === '/api/activity-log') return Response.json({ events: [] });
      if (path === '/api/operational-home')
        return Response.json({
          companyId: ids.company,
          today: '2026-10-20',
          summaries: [{ kind: 'active_clients', count: 1 }],
        });
      if (path === '/api/clients') return Response.json([]);
      if (path === '/api/clients/search')
        return Response.json([
          {
            id: ids.client,
            displayName: 'Synthetic Client',
            relatedToActiveCompany: true,
          },
        ]);
      if (path === '/api/complaints' && method === 'POST') {
        commands.push({
          body: init?.body,
          key: new Headers(init?.headers).get('idempotency-key'),
        });
        if (commands.length === 1)
          return Response.json(
            { message: 'Synthetic uncertain outcome' },
            { status: 503 },
          );
        recorded = true;
        return Response.json(saved, { status: 201 });
      }
      if (path === '/api/complaints') {
        complaintReads.push(url.toString());
        return Response.json({
          companyId: ids.company,
          complaints: recorded ? [saved] : [],
          total: recorded ? 1 : 0,
          offset: 0,
          pageSize: 25,
        });
      }
      if (path === `/api/complaints/${ids.complaint}`)
        return Response.json(saved);
      if (path === `/api/complaints/${ids.complaint}/history`)
        return Response.json({
          complaintId: ids.complaint,
          companyId: ids.company,
          revision: 1,
          entries: [
            {
              id: 'synthetic-intake',
              kind: 'intake',
              revision: 1,
              intake: original,
              reason: null,
              actor: saved.responsible,
              recordedAt: saved.createdAt,
            },
          ],
          total: 1,
          offset: 0,
          pageSize: 25,
        });
      return Response.json(
        { message: 'Synthetic ungranted endpoint' },
        { status: 403 },
      );
    }),
  );
  return { commands, complaintReads };
}

function mount(current: ActorContext, locale: InterfaceLocale = 'en') {
  localStorage.setItem(interfaceLocaleStorageKey, locale);
  localStorage.setItem(preferenceKey(current), ids.company);
  return render(
    <InterfaceLocaleProvider>
      <InterfaceLocaleSelect />
      <App identity={deterministicBrowserIdentity()} />
    </InterfaceLocaleProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  selectWorkspace(ids.workspace);
  window.history.replaceState(
    window.history.state,
    '',
    '/?frame=prisme#complaints',
  );
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(
      (query: string) =>
        ({
          matches: true,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(() => false),
        }) satisfies MediaQueryList,
    ),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Element.prototype.scrollIntoView = nativeScrollIntoView;
  clearWorkspaceSelection();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

it('covers every complaint message in all four interface languages', () => {
  expect(() =>
    assertMessageCoverage('complaints', complaintMessages),
  ).not.toThrow();
});

it.each(interfaceLocales)(
  'offers explicit self-responsible intake through the real App in %s',
  async (locale) => {
    const api = serve(actor());
    mount(actor(), locale);
    const copy = (key: (typeof complaintMessages.keys)[number]) =>
      resolveMessage(complaintMessages, locale, key);
    const section = await screen.findByRole('region', { name: copy('title') });
    fireEvent.click(
      await within(section).findByRole('button', {
        name: copy('newComplaint'),
      }),
    );
    expect(within(section).getByLabelText(copy('complainant'))).toBeVisible();
    expect(within(section).getByLabelText(copy('subject'))).toBeVisible();
    expect(
      within(section).getByRole('button', { name: copy('assignMyself') }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(
      within(section).getByRole('button', { name: copy('saveIntake') }),
    ).toBeDisabled();
    expect(section.querySelector('select, input[type="checkbox"]')).toBeNull();
    expect(api.commands).toHaveLength(0);
  },
);

it('retains the literal command and exact retry key after an uncertain intake and confirms the saved record', async () => {
  const api = serve(actor());
  const mounted = mount(actor());
  const copy = (key: (typeof complaintMessages.keys)[number]) =>
    resolveMessage(complaintMessages, 'en', key);
  const section = await screen.findByRole('region', { name: copy('title') });
  fireEvent.click(
    await within(section).findByRole('button', { name: copy('newComplaint') }),
  );
  changeValue(
    within(section).getByLabelText(copy('clientSearch')),
    'Synthetic',
  );
  fireEvent.click(
    within(section).getByRole('button', { name: copy('searchClients') }),
  );
  await waitFor(() =>
    expect(within(section).getByLabelText(copy('client'))).not.toBeDisabled(),
  );
  changeValue(within(section).getByLabelText(copy('client')), ids.client);
  changeValue(
    within(section).getByLabelText(copy('complainant')),
    original.complainant,
  );
  changeValue(
    within(section).getByLabelText(copy('subject')),
    original.subject,
  );
  fireEvent.click(
    within(section).getByRole('button', { name: copy('assignMyself') }),
  );
  fireEvent.click(
    within(section).getByRole('button', { name: copy('saveIntake') }),
  );
  await within(section).findByText(copy('uncertain'));
  expect(api.commands).toHaveLength(1);
  expect(api.commands[0]?.key).toBeTruthy();
  expect(typeof api.commands[0]?.body).toBe('string');
  fireEvent.click(within(section).getByRole('button', { name: copy('retry') }));
  await within(section).findByText(copy('saved'));
  expect(api.commands).toHaveLength(2);
  expect(api.commands[1]).toEqual(api.commands[0]);
  expect(mounted.container.querySelector('script')).toBeNull();
  expect(section.textContent).toContain(original.subject);
});

it('keeps Reader-only access separate from recording and never fetches complaints for Recorder-only access', async () => {
  const readOnlyApi = serve(actor(true, false));
  const mounted = mount(actor(true, false));
  const section = await screen.findByRole('region', { name: 'Complaints' });
  await within(section).findByText(
    'No complaints are available in this Company.',
  );
  expect(
    within(section).queryByRole('button', { name: 'Record a complaint' }),
  ).toBeNull();
  expect(readOnlyApi.complaintReads).toHaveLength(1);
  mounted.unmount();
  const recordOnlyApi = serve(actor(false, true));
  mount(actor(false, true));
  await screen.findByRole('heading', { name: 'Synthetic Workspace' });
  expect(screen.queryByRole('region', { name: 'Complaints' })).toBeNull();
  expect(recordOnlyApi.complaintReads).toHaveLength(0);
});

it('preserves an unsaved factual draft and explicit responsibility through locale and section navigation', async () => {
  const api = serve(actor());
  mount(actor());
  const section = await screen.findByRole('region', { name: 'Complaints' });
  fireEvent.click(
    await within(section).findByRole('button', { name: 'Record a complaint' }),
  );
  changeValue(
    within(section).getByLabelText('Complaint content'),
    '  Private unsaved draft.\nȘtefan / Иван  ',
  );
  fireEvent.click(
    within(section).getByRole('button', {
      name: 'I take responsibility for this complaint',
    }),
  );
  changeValue(screen.getByLabelText('Interface language'), 'fr');
  const translated = await screen.findByRole('region', {
    name: 'Réclamations',
  });
  expect(
    within(translated).getByLabelText('Contenu de la réclamation'),
  ).toHaveValue('  Private unsaved draft.\nȘtefan / Иван  ');
  expect(
    within(translated).getByRole('button', {
      name: 'Je prends la responsabilité de cette réclamation',
    }),
  ).toHaveAttribute('aria-pressed', 'true');
  for (const hash of ['#overview', '#complaints']) {
    act(() => {
      window.history.pushState(
        window.history.state,
        '',
        `/?frame=prisme${hash}`,
      );
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
  }
  expect(
    within(translated).getByLabelText('Contenu de la réclamation'),
  ).toHaveValue('  Private unsaved draft.\nȘtefan / Иван  ');
  expect(api.commands).toHaveLength(0);
  expect(api.complaintReads).toHaveLength(1);
});
