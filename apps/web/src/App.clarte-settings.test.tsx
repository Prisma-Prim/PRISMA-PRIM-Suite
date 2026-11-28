import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import type { ActorContext } from './access-types';
import { companyGrants } from './access/company-grants.test-fixture';
import { renderInInterface } from './test/app-interface';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';

// Fictional Workspace, Companies and members; every API read is faked here.
type Company = Readonly<{ id: string; displayName: string }>;
type Sent = Readonly<{
  method: string;
  path: string;
  body: unknown;
  key: string | null;
}>;

const prismaPrim: Company = {
  id: '00000000-0000-4000-8000-000000001546',
  displayName: 'PRISMA-PRIM',
};
const bic: Company = {
  id: '00000000-0000-4000-8000-000000001547',
  displayName: 'BIC',
};
const ion = {
  workspaceMembershipId: '00000000-0000-4000-8000-000000002001',
  displayName: 'Ion Popa',
  email: 'ion@example.test',
};
const maria = {
  workspaceMembershipId: '00000000-0000-4000-8000-000000002002',
  displayName: 'Maria Rusu',
  email: 'maria@example.test',
};

function actor(
  workspacePermissions: ActorContext['workspacePermissions'],
): ActorContext {
  return {
    internalUserId: 'ada',
    workspaceMembershipId: '00000000-0000-4000-8000-000000002000',
    workspaceId: 'workspace-a',
    workspaceName: 'PRISMA Workspace',
    displayName: 'Ada Ionescu',
    email: 'ada@example.test',
    active: true,
    workspacePermissions,
    activeCompany: {
      ...prismaPrim,
      grants: companyGrants({
        bundle: 'company_director_client_access',
        version: 'v1',
        assignmentId: 'client-access',
      }),
    },
  };
}

const administrator = () =>
  actor(['company.manage', 'company.assignment.manage', 'member.invite']);
const director = () => actor([]);

type Assignment = {
  id: string;
  workspaceMembershipId: string;
  companyId: string;
  active: boolean;
  bundle: string;
  permissionSetVersion: string | null;
};

type Invitation = {
  id: string;
  email: string;
  status: string;
  deliveryStatus: string;
  expiresAt: string;
  createdAt: string;
  revokedAt: string | null;
  consumedAt: string | null;
  nextCheckAt: string;
};

function invitation(index: number, email: string): Invitation {
  return {
    id: `00000000-0000-4000-8000-00000000300${index}`,
    email,
    status: 'pending',
    deliveryStatus: 'pending',
    expiresAt: '2026-12-05T10:00:00.000Z',
    createdAt: '2026-11-28T10:00:00.000Z',
    revokedAt: null,
    consumedAt: null,
    nextCheckAt: '2026-11-28T10:05:00.000Z',
  };
}

function installServer({
  actorFor = administrator,
  administration = 'ok',
}: Readonly<{
  actorFor?: () => ActorContext;
  administration?: 'ok' | 'error';
}> = {}) {
  const sent: Sent[] = [];
  const members = [ion, maria];
  const assignments: Assignment[] = [
    {
      id: 'assignment-context',
      workspaceMembershipId: ion.workspaceMembershipId,
      companyId: prismaPrim.id,
      active: true,
      bundle: 'Company Context Access',
      permissionSetVersion: null,
    },
    {
      id: 'assignment-ideas',
      workspaceMembershipId: ion.workspaceMembershipId,
      companyId: prismaPrim.id,
      active: true,
      bundle: 'Company Ideas Reader',
      permissionSetVersion: 'v1',
    },
  ];
  const firstPage = [invitation(1, 'elena@example.test')];
  const secondPage = [invitation(2, 'victor@example.test')];
  const revocations = [
    {
      workspaceMembershipId: '00000000-0000-4000-8000-000000002009',
      displayName: 'Dan Cojocaru',
      status: 'retry_required',
    },
  ];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input.toString(), window.location.origin);
      const method = init?.method ?? 'GET';
      const path = url.pathname;
      const raw = typeof init?.body === 'string' ? init.body : undefined;
      const body: unknown = raw ? JSON.parse(raw) : undefined;
      if (method !== 'GET')
        sent.push({
          method,
          path: path + url.search,
          body,
          key: new Headers(init?.headers).get('idempotency-key'),
        });
      if (path === '/api/access/current-actor')
        return Response.json(actorFor());
      if (path === '/api/companies' && method === 'GET')
        return Response.json([prismaPrim, bic]);
      if (path === '/api/companies' && method === 'POST')
        return Response.json({ id: '00000000-0000-4000-8000-000000001548' });
      if (path === '/api/companies/00000000-0000-4000-8000-000000001548')
        return Response.json({
          id: '00000000-0000-4000-8000-000000001548',
          workspaceId: 'workspace-a',
          displayName: 'Nord Expert SRL',
          status: 'active',
          createdAt: '2026-11-28T09:00:00.000Z',
          createdByInternalUserId: 'ada',
        });
      if (path === '/api/activity-log')
        return Response.json({
          events: [
            {
              id: 'event-company',
              action: 'company.registered',
              occurredAt: '2026-11-27T10:00:00.000Z',
              actor: { internalUserId: 'ada', displayName: 'Ada Ionescu' },
              target: {
                type: 'company',
                companyId: bic.id,
                displayName: 'BIC',
              },
            },
          ],
        });
      if (path === '/api/operational-home')
        return Response.json({
          companyId: prismaPrim.id,
          today: '2026-11-28',
          summaries: [],
        });
      if (path === '/api/clients') return Response.json([]);
      if (path === '/api/client-duplicate-reviews')
        return Response.json({ items: [], next_cursor: null });
      if (path === '/api/company-context-assignments/administration')
        return administration === 'error'
          ? new Response(null, { status: 500 })
          : Response.json({
              members,
              companies: [prismaPrim, bic],
              assignments,
            });
      if (path === '/api/company-ideas-recorder-assignments') {
        assignments.push({
          id: 'assignment-recorder',
          workspaceMembershipId: ion.workspaceMembershipId,
          companyId: bic.id,
          active: true,
          bundle: 'Company Ideas Recorder',
          permissionSetVersion: 'v1',
        });
        return Response.json({ id: 'assignment-recorder' });
      }
      if (
        path ===
        `/api/company-ideas-reader-assignments/${ion.workspaceMembershipId}/${prismaPrim.id}`
      ) {
        const ideas = assignments.find(
          (assignment) => assignment.id === 'assignment-ideas',
        );
        if (ideas) ideas.active = false;
        return Response.json({ id: 'assignment-ideas', active: false });
      }
      if (path === '/api/workspace-membership-suspensions') {
        members.splice(
          members.findIndex(
            (member) =>
              member.workspaceMembershipId === maria.workspaceMembershipId,
          ),
          1,
        );
        return Response.json({
          workspaceMembershipId: maria.workspaceMembershipId,
          status: 'inactive',
        });
      }
      if (path === '/api/workspace-session-revocations')
        return Response.json({ records: revocations, nextCursor: null });
      if (
        path ===
        '/api/workspace-session-revocations/00000000-0000-4000-8000-000000002009/retry'
      ) {
        revocations[0] = { ...revocations[0], status: 'complete' };
        return Response.json({ status: 'checked' });
      }
      if (path === '/api/workspace-invitations' && method === 'GET')
        return Response.json(
          url.searchParams.get('after')
            ? { invitations: secondPage, nextCursor: null }
            : { invitations: firstPage, nextCursor: 'cursor-2' },
        );
      if (path === '/api/workspace-invitations' && method === 'POST')
        return Response.json({
          ...invitation(3, 'natalia@example.test'),
          createdAt: '2026-11-28T11:00:00.000Z',
        });
      if (path === `/api/workspace-invitations/${firstPage[0]?.id}/refresh`)
        return Response.json({
          ...invitation(1, 'elena@example.test'),
          status: 'accepted',
          deliveryStatus: 'accepted',
        });
      if (path === `/api/workspace-invitations/${firstPage[0]?.id}/revoke`)
        return Response.json({
          ...invitation(1, 'elena@example.test'),
          status: 'revoked',
          deliveryStatus: 'revoked',
          revokedAt: '2026-11-28T11:30:00.000Z',
        });
      return new Response(null, { status: 404 });
    }),
  );
  return { sent };
}

function sectionList() {
  return screen.getByRole('navigation', { name: 'Settings sections' });
}

function linkNames(container: HTMLElement): string[] {
  return within(container)
    .getAllByRole('link')
    .map((link) => link.textContent ?? '');
}

async function openSettings(hash = '#settings') {
  window.history.replaceState(null, '', `/${hash}`);
  renderInInterface(
    'clarte',
    <App identity={deterministicBrowserIdentity()} />,
  );
  await screen.findByRole('heading', {
    level: 1,
    name: hash ? 'Settings' : 'Today',
  });
}

function openSection(name: string) {
  fireEvent.click(within(sectionList()).getByRole('link', { name }));
}

const nativeScrollIntoView = Element.prototype.scrollIntoView;
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
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
  Element.prototype.scrollIntoView = nativeScrollIntoView;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('Settings console sections', () => {
  it('lists every access section for a Workspace administrator, grouped, and each opens beside the list', async () => {
    installServer();
    await openSettings('');
    fireEvent.click(
      within(
        screen.getByRole('navigation', { name: 'Primary navigation' }),
      ).getByRole('link', { name: 'Settings' }),
    );

    expect(window.location.hash).toBe('#settings');
    expect(linkNames(sectionList())).toEqual([
      'Language and region',
      'Companies',
      'Team & access',
      'Invitations',
      'Activity Log',
    ]);
    expect(
      within(sectionList()).getByRole('list', { name: 'Organisation' }),
    ).toBeInTheDocument();
    const home = screen.getByRole('region', { name: 'All settings' });
    expect(
      within(home)
        .getAllByRole('link')
        .map((link) => link.querySelector('strong')?.textContent),
    ).toEqual([
      'Language and region',
      'Companies',
      'Team & access',
      'Invitations',
      'Activity Log',
    ]);
    expect(
      screen.queryByRole('navigation', { name: 'Settings views' }),
    ).not.toBeInTheDocument();

    fireEvent.click(within(home).getByRole('link', { name: /^Invitations/u }));
    expect(window.location.hash).toBe('#invitations');
    expect(
      within(sectionList()).getByRole('link', { name: 'Invitations' }),
    ).toHaveAttribute('aria-current', 'page');
    const invitations = screen.getByRole('region', { name: 'Invitations' });
    expect(screen.getByRole('link', { name: 'All settings' })).toHaveAttribute(
      'href',
      '#settings',
    );
    expect(
      await within(invitations).findByText('elena@example.test'),
    ).toBeVisible();
  });

  it('shows a Company director only Language and region and the Activity Log', async () => {
    installServer({ actorFor: director });
    await openSettings();

    expect(linkNames(sectionList())).toEqual([
      'Language and region',
      'Activity Log',
    ]);
    openSection('Activity Log');
    const log = screen.getByRole('region', { name: 'Activity Log' });
    expect(
      await within(log).findByText('Ada Ionescu registered a Company'),
    ).toBeVisible();
    expect(log).toHaveTextContent('Target: BIC');
    expect(screen.queryByText('Team & access')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Send invitation' }),
    ).not.toBeInTheDocument();
  });
});

describe('Settings console commands', () => {
  it('registers a provider Company', async () => {
    const { sent } = installServer();
    await openSettings('#companies');

    const companies = screen.getByRole('region', { name: 'Companies' });
    fireEvent.click(
      within(companies).getByRole('button', { name: 'Register Company' }),
    );
    expect(
      within(companies).getByText('Company display name is required.'),
    ).toBeVisible();
    fireEvent.change(within(companies).getByLabelText('Company display name'), {
      target: { value: 'Nord Expert SRL' },
    });
    fireEvent.click(
      within(companies).getByRole('button', { name: 'Register Company' }),
    );

    expect(
      await within(companies).findByRole('heading', {
        name: 'Nord Expert SRL',
      }),
    ).toBeVisible();
    expect(
      within(companies).getByText('Registered by Ada Ionescu'),
    ).toBeVisible();
    expect(sent).toEqual([
      {
        method: 'POST',
        path: '/api/companies',
        body: { displayName: 'Nord Expert SRL' },
        key: expect.any(String),
      },
    ]);
  });

  it('grants and revokes rights sets per member and Company and shows the state and captured version of each', async () => {
    const { sent } = installServer();
    await openSettings('#access');

    const team = screen.getByRole('region', { name: 'Team & access' });
    const members = await within(team).findByRole('table');
    const ionRow = within(members).getByRole('row', { name: /Ion Popa/u });
    expect(ionRow).toHaveTextContent('PRISMA-PRIM');
    expect(
      within(members).getByRole('row', { name: /Maria Rusu/u }),
    ).toHaveTextContent('No rights yet');

    fireEvent.click(within(ionRow).getByRole('button', { name: 'Ion Popa' }));
    const panel = screen.getByRole('dialog', { name: 'Ion Popa' });
    const rights = (group: string) =>
      within(panel).getByRole('region', { name: group });
    const row = (group: string, label: string) => {
      const item = within(rights(group))
        .getByText(label, { selector: 'strong' })
        .closest('li');
      if (!item) throw new Error(`Expected the rights set ${label}.`);
      return item;
    };
    expect(
      row('Company and Clients', 'Company Context Access'),
    ).toHaveTextContent('Granted');
    expect(
      row('Ideas and Operational Risks', 'Ideas Reader'),
    ).toHaveTextContent('Granted — captured version v1');
    expect(
      within(panel).getByText(
        /The version is captured when access is granted/u,
      ),
    ).toBeVisible();
    for (const [group, label] of [
      ['Projects, missions and Tasks', 'Company Task Manager'],
      ['Certification', 'Company Certification Auditor'],
      ['Ideas and Operational Risks', 'Company Operational Risk Reader'],
    ] as const)
      expect(row(group, label)).toHaveTextContent('Not granted');

    fireEvent.click(
      within(panel).getByRole('button', {
        name: 'Revoke access — Ideas Reader',
      }),
    );
    expect(
      await within(panel).findByText('Access revoked. Server state refreshed.'),
    ).toBeVisible();
    expect(
      row('Ideas and Operational Risks', 'Ideas Reader'),
    ).toHaveTextContent('Not granted');

    expect(
      within(panel).getByRole('button', { name: 'PRISMA-PRIM' }),
    ).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(panel).getByRole('button', { name: 'BIC' }));
    fireEvent.click(
      within(panel).getByRole('button', {
        name: 'Grant access — Ideas Recorder',
      }),
    );
    expect(
      await within(panel).findByText('Access granted. Server state refreshed.'),
    ).toBeVisible();
    expect(
      row('Ideas and Operational Risks', 'Ideas Recorder'),
    ).toHaveTextContent('Granted — captured version v1');
    expect(sent).toEqual([
      {
        method: 'DELETE',
        path: `/api/company-ideas-reader-assignments/${ion.workspaceMembershipId}/${prismaPrim.id}`,
        body: undefined,
        key: expect.any(String),
      },
      {
        method: 'POST',
        path: '/api/company-ideas-recorder-assignments',
        body: {
          workspaceMembershipId: ion.workspaceMembershipId,
          companyId: bic.id,
        },
        key: expect.any(String),
      },
    ]);
  });

  it('suspends a member after review and confirmation, then retries the session revocation', async () => {
    const { sent } = installServer();
    await openSettings('#access');

    const team = screen.getByRole('region', { name: 'Team & access' });
    fireEvent.click(
      await within(team).findByRole('button', { name: 'Maria Rusu' }),
    );
    const panel = screen.getByRole('dialog', { name: 'Maria Rusu' });
    fireEvent.click(
      within(panel).getByRole('tab', { name: 'Workspace access' }),
    );
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Review suspension' }),
    );
    const confirmation = screen.getByRole('alertdialog', {
      name: 'Confirm Workspace access suspension',
    });
    expect(confirmation).toHaveTextContent(
      'Selected member: Maria Rusu — maria@example.test.',
    );
    expect(
      within(confirmation).getByRole('button', { name: 'Cancel' }),
    ).toHaveFocus();
    expect(sent).toEqual([]);
    fireEvent.click(
      within(confirmation).getByRole('button', { name: 'Suspend access' }),
    );

    expect(
      await within(team).findByText(
        'Member suspended. Server state refreshed.',
      ),
    ).toBeVisible();
    expect(screen.queryByRole('dialog', { name: 'Maria Rusu' })).toBeNull();
    expect(
      within(team).queryByRole('button', { name: 'Maria Rusu' }),
    ).toBeNull();
    expect(sent).toEqual([
      {
        method: 'POST',
        path: '/api/workspace-membership-suspensions',
        body: { workspaceMembershipId: maria.workspaceMembershipId },
        key: expect.any(String),
      },
    ]);

    const sessions = within(team).getByRole('region', {
      name: 'Identity-provider sessions',
    });
    fireEvent.click(
      within(sessions).getByRole('button', {
        name: 'Check session revocations',
      }),
    );
    const suspended = (
      await within(sessions).findByText('Dan Cojocaru')
    ).closest('li');
    if (!suspended) throw new Error('Expected the suspended member.');
    expect(suspended).toHaveTextContent('Retry needed');
    fireEvent.click(
      within(suspended).getByRole('button', {
        name: 'Retry session revocation',
      }),
    );
    await waitFor(() =>
      expect(
        within(sessions).getByText('Dan Cojocaru').closest('li'),
      ).toHaveTextContent('Complete'),
    );
    expect(sent.at(-1)).toMatchObject({
      method: 'POST',
      path: '/api/workspace-session-revocations/00000000-0000-4000-8000-000000002009/retry',
    });
  });

  it('invites by e-mail for 1 to 30 days, pages, checks and revokes an invitation after confirmation', async () => {
    const { sent } = installServer();
    await openSettings('#invitations');

    const invitations = screen.getByRole('region', { name: 'Invitations' });
    const sentList = await within(invitations).findByRole('region', {
      name: 'Workspace invitations',
    });
    expect(
      await within(sentList).findByText('elena@example.test'),
    ).toBeVisible();
    fireEvent.click(
      within(sentList).getByRole('button', { name: 'Next page' }),
    );
    expect(
      await within(
        await screen.findByRole('region', { name: 'Workspace invitations' }),
      ).findByText('victor@example.test'),
    ).toBeVisible();
    fireEvent.click(
      within(
        await screen.findByRole('region', { name: 'Workspace invitations' }),
      ).getByRole('button', { name: 'First page' }),
    );
    const firstPage = await screen.findByRole('region', {
      name: 'Workspace invitations',
    });
    expect(
      await within(firstPage).findByText('elena@example.test'),
    ).toBeVisible();

    fireEvent.click(
      within(firstPage).getByRole('button', { name: 'Invite a person' }),
    );
    const form = screen.getByRole('dialog', { name: 'Invite a person' });
    fireEvent.change(within(form).getByLabelText('Recipient email'), {
      target: { value: 'natalia@example.test' },
    });
    fireEvent.change(within(form).getByLabelText('Expires in days'), {
      target: { value: '31' },
    });
    fireEvent.click(
      within(form).getByRole('button', { name: 'Send invitation' }),
    );
    expect(
      within(form).getByText('Enter a whole number between 1 and 30.'),
    ).toBeVisible();
    fireEvent.change(within(form).getByLabelText('Expires in days'), {
      target: { value: '14' },
    });
    fireEvent.click(
      within(form).getByRole('button', { name: 'Send invitation' }),
    );
    expect(
      await within(
        await screen.findByRole('region', { name: 'Workspace invitations' }),
      ).findByText('natalia@example.test'),
    ).toBeVisible();
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Invite a person' }),
      ).toBeNull(),
    );

    const elena = within(
      screen.getByRole('region', { name: 'Workspace invitations' }),
    )
      .getByText('elena@example.test')
      .closest('li');
    if (!elena) throw new Error('Expected the invitation row.');
    fireEvent.click(
      within(elena).getByRole('button', { name: 'Check invitation status' }),
    );
    await waitFor(() => expect(elena).toHaveTextContent('Used'));
    fireEvent.click(
      within(elena).getByRole('button', { name: 'Revoke invitation' }),
    );
    const confirmation = screen.getByRole('alertdialog', {
      name: 'Revoke invitation',
    });
    fireEvent.click(
      within(confirmation).getByRole('button', { name: 'Confirm revocation' }),
    );
    await waitFor(() => expect(elena).toHaveTextContent('Revoked'));
    expect(
      sent.map((request) => [request.method, request.path, request.body]),
    ).toEqual([
      [
        'POST',
        '/api/workspace-invitations',
        { email: 'natalia@example.test', expiresInDays: 14 },
      ],
      [
        'POST',
        '/api/workspace-invitations/00000000-0000-4000-8000-000000003001/refresh',
        {},
      ],
      [
        'POST',
        '/api/workspace-invitations/00000000-0000-4000-8000-000000003001/revoke',
        {},
      ],
    ]);
  });
});

describe('Settings console states', () => {
  it('offers a retry when the access administration cannot be read', async () => {
    installServer({ administration: 'error' });
    await openSettings('#access');

    const team = screen.getByRole('region', { name: 'Team & access' });
    expect(await within(team).findByRole('alert')).toHaveTextContent(
      'The access state could not be loaded or changed.',
    );
    expect(
      within(team).getByRole('button', { name: 'Retry access state' }),
    ).toBeVisible();
  });
});

/** The example date and number as the language writes them, spaces normalized like text content. */
function formatted(language: 'en' | 'fr'): string {
  const date = new Intl.DateTimeFormat(language, {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date('2026-11-30T00:00:00.000Z'));
  const number = new Intl.NumberFormat(language).format(41200.5);
  return `${date} · ${number}`.replace(/\s+/gu, ' ');
}

describe('Language and region', () => {
  it('changes the interface language with locale-formatted dates and numbers, in step with the user menu', async () => {
    installServer({ actorFor: director });
    await openSettings('#language');

    const language = screen.getByRole('region', {
      name: 'Language and region',
    });
    const choice = within(language).getByRole('group', {
      name: 'Your interface language',
    });
    expect(
      within(choice).getByRole('radio', { name: /English/u }),
    ).toBeChecked();
    expect(language).toHaveTextContent(formatted('en'));

    act(() => {
      fireEvent.click(within(choice).getByRole('radio', { name: /Français/u }));
    });

    expect(
      screen.getByRole('heading', { level: 1, name: 'Paramètres' }),
    ).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('fr');
    const french = screen.getByRole('region', { name: 'Langue et région' });
    expect(french).toHaveTextContent(formatted('fr'));
    expect(formatted('fr')).not.toBe(formatted('en'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Menu de l’utilisateur' }),
    );
    const menu = screen.getByRole('group', { name: 'Menu de l’utilisateur' });
    expect(within(menu).getByRole('radio', { name: 'Français' })).toBeChecked();

    fireEvent.click(within(menu).getByRole('radio', { name: 'Română' }));
    expect(
      within(
        screen.getByRole('region', { name: 'Limbă și regiune' }),
      ).getByRole('radio', { name: /Română/u }),
    ).toBeChecked();
  });
});
