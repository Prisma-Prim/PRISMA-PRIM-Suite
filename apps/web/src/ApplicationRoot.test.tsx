import type { ActorContext } from './access-types';
import { baseActor } from './production-shell/production-shell-context.test-fixtures';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from './access-composition';
import { ApplicationRoot } from './ApplicationRoot';
import { interfaceLocaleStorageKey } from './localization/interface-locale';

describe('ApplicationRoot', () => {
  beforeEach(() => {
    localStorage.setItem(interfaceLocaleStorageKey, 'en');
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
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((input: RequestInfo | URL) =>
        Promise.resolve(
          new Response(
            JSON.stringify(
              input.toString().endsWith('/companies')
                ? []
                : input.toString().endsWith('/activity-log')
                  ? { events: [] }
                  : ({
                      ...baseActor,
                      displayName: 'Ada Ionescu',
                      email: 'ada@example.test',
                      workspaceName: 'PRISMA Workspace',
                      workspacePermissions: ['company.manage'],
                    } satisfies ActorContext),
            ),
            { status: 200 },
          ),
        ),
      ),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
    document.documentElement.lang = '';
    window.history.replaceState(null, '', '/');
  });

  it('starts the public journey in Romanian without using the browser language', () => {
    localStorage.removeItem(interfaceLocaleStorageKey);
    sessionStorage.setItem('deterministic-auth-state', 'signed-out');
    vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('en-US');

    render(
      <ApplicationRoot
        pathname="/"
        identity={deterministicBrowserIdentity()}
      />,
    );

    expect(
      screen.getByRole('heading', {
        name: 'Faceți fiecare decizie trasabilă.',
      }),
    ).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('lang', 'ro');
  });

  it.each([
    ['ro', 'Faceți fiecare decizie trasabilă.', 'Limba interfeței'],
    ['ru', 'Сделайте каждое решение отслеживаемым.', 'Язык интерфейса'],
    ['fr', 'Rendez chaque décision traçable.', 'Langue de l’interface'],
    ['en', 'Make every decision traceable.', 'Interface language'],
  ])('uses the saved %s interface locale', (locale, heading, label) => {
    localStorage.setItem(interfaceLocaleStorageKey, locale);
    sessionStorage.setItem('deterministic-auth-state', 'signed-out');

    render(
      <ApplicationRoot
        pathname="/"
        identity={deterministicBrowserIdentity()}
      />,
    );

    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: label })).toHaveAttribute(
      'data-value',
      locale,
    );
    expect(document.documentElement).toHaveAttribute('lang', locale);
  });

  it.each(['de', '{not-json'])(
    'falls back to Romanian for the invalid preference %s',
    (preference) => {
      localStorage.setItem(interfaceLocaleStorageKey, preference);
      sessionStorage.setItem('deterministic-auth-state', 'signed-out');
      render(
        <ApplicationRoot
          pathname="/"
          identity={deterministicBrowserIdentity()}
        />,
      );
      expect(
        screen.getByRole('heading', {
          name: 'Faceți fiecare decizie trasabilă.',
        }),
      ).toBeInTheDocument();
    },
  );

  it('falls back to Romanian when the preference is unreadable', () => {
    sessionStorage.setItem('deterministic-auth-state', 'signed-out');
    const originalGetItem = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (
      this: Storage,
      key,
    ) {
      if (key === interfaceLocaleStorageKey)
        throw new DOMException('Storage unavailable', 'SecurityError');
      return originalGetItem.call(this, key);
    });
    render(
      <ApplicationRoot
        pathname="/"
        identity={deterministicBrowserIdentity()}
      />,
    );
    expect(document.documentElement).toHaveAttribute('lang', 'ro');
  });

  it('selects all four languages by keyboard and keeps the explicit choice', () => {
    localStorage.removeItem(interfaceLocaleStorageKey);
    sessionStorage.setItem('deterministic-auth-state', 'signed-out');
    const view = render(
      <ApplicationRoot
        pathname="/"
        identity={deterministicBrowserIdentity()}
      />,
    );

    for (const locale of ['ru', 'fr', 'en', 'ro', 'ru']) {
      chooseNextLocaleByKeyboard();
      expect(document.documentElement).toHaveAttribute('lang', locale);
      expect(localStorage.getItem(interfaceLocaleStorageKey)).toBe(locale);
    }
    view.unmount();
    render(
      <ApplicationRoot
        pathname="/"
        identity={deterministicBrowserIdentity()}
      />,
    );
    expect(document.documentElement).toHaveAttribute('lang', 'ru');
  });

  it('keeps the in-memory language when preference storage rejects writes', () => {
    localStorage.removeItem(interfaceLocaleStorageKey);
    sessionStorage.setItem('deterministic-auth-state', 'signed-out');
    render(
      <ApplicationRoot
        pathname="/"
        identity={deterministicBrowserIdentity()}
      />,
    );
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      if (key === interfaceLocaleStorageKey)
        throw new DOMException('Storage unavailable', 'SecurityError');
      originalSetItem.call(this, key, value);
    });

    chooseNextLocaleByKeyboard();

    expect(document.documentElement).toHaveAttribute('lang', 'ru');
    expect(
      screen.getByRole('heading', {
        name: 'Сделайте каждое решение отслеживаемым.',
      }),
    ).toBeInTheDocument();
  });

  it('preserves the Company draft and exact retry command across locale changes', async () => {
    localStorage.setItem(interfaceLocaleStorageKey, 'en');
    window.history.replaceState(null, '', '/?frame=prisme#companies');
    const commands: Array<{ body: string | undefined; key: string | null }> =
      [];
    const company = {
      id: 'company-new',
      workspaceId: 'workspace-1',
      displayName: 'Societate Test',
      status: 'active',
      createdAt: '2026-09-19T17:00:00.000Z',
      createdByInternalUserId: 'user-1',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        if (url.endsWith('/access/current-actor'))
          return jsonResponse({
            internalUserId: 'user-1',
            workspaceMembershipId: 'membership-1',
            workspaceId: 'workspace-1',
            workspaceName: 'Spațiu Client',
            displayName: 'Ada Ionescu',
            email: 'ada@example.test',
            active: true,
            workspacePermissions: ['company.manage'],
          });
        if (url.endsWith('/activity-log')) return jsonResponse({ events: [] });
        if (url.endsWith('/companies') && init?.method === 'POST') {
          commands.push({
            body: init.body?.toString(),
            key: new Headers(init.headers).get('idempotency-key'),
          });
          return commands.length === 1
            ? new Response(null, { status: 503 })
            : jsonResponse(company);
        }
        if (url.endsWith(`/companies/${company.id}`))
          return jsonResponse(company);
        if (url.endsWith('/companies')) return jsonResponse([]);
        return new Response(null, { status: 404 });
      }),
    );

    render(
      <ApplicationRoot
        pathname="/"
        identity={deterministicBrowserIdentity()}
      />,
    );
    const name = await screen.findByLabelText('Company display name');
    fireEvent.change(name, { target: { value: '  Societate Test  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register Company' }));
    await screen.findByText(/retried safely/u);

    chooseLocaleWithPointer('Français');
    expect(name).toHaveValue('  Societate Test  ');
    fireEvent.click(
      screen.getByRole('button', { name: 'Enregistrer l’Entreprise' }),
    );
    await screen.findByRole('heading', { name: company.displayName });

    expect(commands).toHaveLength(2);
    expect(commands[0]).toEqual(commands[1]);
    expect(commands[0]?.body).toBe(
      JSON.stringify({ displayName: company.displayName }),
    );
    expect(commands[0]?.key).not.toBeNull();
    expect(screen.getByText(company.displayName)).toBeInTheDocument();
  });

  it('preserves the selected Company context while switching locale', async () => {
    localStorage.setItem(interfaceLocaleStorageKey, 'en');
    const company = { id: 'company-active', displayName: 'Client Company' };
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.endsWith('/access/current-actor'))
        return jsonResponse({
          internalUserId: 'user-1',
          workspaceMembershipId: 'membership-1',
          workspaceId: 'workspace-1',
          workspaceName: 'Client Workspace',
          displayName: 'Ada Ionescu',
          email: 'ada@example.test',
          active: true,
          workspacePermissions: ['company.manage'],
          activeCompany: company,
        });
      if (url.endsWith('/activity-log')) return jsonResponse({ events: [] });
      if (url.endsWith('/companies')) return jsonResponse([company]);
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetch);

    render(
      <ApplicationRoot
        pathname="/"
        identity={deterministicBrowserIdentity()}
      />,
    );
    expect(
      await screen.findByRole('combobox', { name: 'Active Company' }),
    ).toHaveAttribute('data-value', company.id);
    const actorRequestsBeforeLocaleChange = fetch.mock.calls.filter(([input]) =>
      input.toString().endsWith('/access/current-actor'),
    ).length;

    chooseLocaleWithPointer('Français');

    expect(
      screen.getByRole('combobox', { name: 'Entreprise active' }),
    ).toHaveAttribute('data-value', company.id);
    expect(screen.getAllByText(company.displayName).length).toBeGreaterThan(0);
    await waitFor(() =>
      expect(
        fetch.mock.calls.filter(([input]) =>
          input.toString().endsWith('/access/current-actor'),
        ),
      ).toHaveLength(actorRequestsBeforeLocaleChange),
    );
  });

  it('shows the public welcome at the root without requesting protected data', () => {
    sessionStorage.setItem('deterministic-auth-state', 'signed-out');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    render(
      <ApplicationRoot
        pathname="/"
        identity={deterministicBrowserIdentity()}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Make every decision traceable.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Continue to sign in' }),
    ).toHaveAttribute('href', '/sign-in');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns a server-rejected root session to the public welcome', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 401 })),
    );

    render(
      <ApplicationRoot
        pathname="/"
        identity={deterministicBrowserIdentity()}
      />,
    );

    expect(
      await screen.findByRole('heading', {
        name: 'Make every decision traceable.',
      }),
    ).toBeInTheDocument();
  });

  it('renders the protected production shell with local identity', async () => {
    render(
      <ApplicationRoot
        pathname="/"
        identity={deterministicBrowserIdentity()}
      />,
    );

    expect(
      await screen.findByRole('heading', {
        name: 'Hello, Ada Ionescu.',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByText('Ada Ionescu')).toBeInTheDocument();
    expect(screen.getByText('ada@example.test')).toBeInTheDocument();
    expect(screen.getAllByText('PRISMA Workspace')).toHaveLength(4);
  });
});

function chooseNextLocaleByKeyboard(): void {
  const select = screen.getByRole('combobox', {
    name: /Limba interfeței|Язык интерфейса|Langue de l’interface|Interface language/u,
  });
  fireEvent.keyDown(select, { key: 'ArrowDown' });
  fireEvent.keyDown(select, { key: 'ArrowDown' });
  fireEvent.keyDown(select, { key: 'Enter' });
}

function chooseLocaleWithPointer(label: string): void {
  fireEvent.click(
    screen.getByRole('combobox', {
      name: /Limba interfeței|Язык интерфейса|Langue de l’interface|Interface language/u,
    }),
  );
  fireEvent.click(screen.getByRole('option', { name: label }));
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
