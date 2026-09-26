import { changeValue } from './test/select-option';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import type { ActorContext } from './access-types';

const companyA = { id: 'company-a', displayName: 'Company A' };
const companyB = { id: 'company-b', displayName: 'Company B' };
function directorActor(): ActorContext {
  return {
    internalUserId: 'director',
    workspaceMembershipId: 'membership-1',
    workspaceId: 'workspace',
    workspaceName: 'Workspace',
    displayName: 'Director',
    email: 'director@example.test',
    active: true,
    workspacePermissions: [],
    activeCompany: {
      ...companyA,
      clientPermissions: ['client.read', 'client.create', 'client.update'],
      clientPermissionAssignmentId: 'assignment-1',
      clientPermissionSetVersion: 'v1',
    },
  };
}
function respond(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}
function fillName(value = 'Same Client') {
  changeValue(screen.getByLabelText('Client display name'), value);
}
async function openRegistration() {
  fireEvent.click(await screen.findByRole('button', { name: 'New Client' }));
  await waitFor(() =>
    expect(screen.getByLabelText('Client display name')).toBeVisible(),
  );
}

describe('Client ownership through App', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState(null, '', '/?frame=prisme#clients');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.history.replaceState(null, '', '/');
  });

  it.each(['Company', 'session', 'membership', 'assignment', 'version'])(
    'invalidates the Client draft and retry key across a %s boundary',
    async (boundary) => {
      let actor = directorActor();
      const commands: {
        body: BodyInit | null | undefined;
        key: string | null;
      }[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const path = input.toString();
          if (path.endsWith('/access/current-actor')) {
            const selected = new Headers(init?.headers).get(
              'x-company-context-id',
            );
            if (selected === companyB.id)
              actor = {
                ...actor,
                activeCompany: { ...actor.activeCompany, ...companyB },
              };
            return respond(actor);
          }
          if (path.endsWith('/companies')) return respond([companyA, companyB]);
          if (path.endsWith('/activity-log')) return respond({ events: [] });
          if (path.includes('/client-duplicate-reviews?'))
            return respond({ items: [], next_cursor: null });
          if (path.includes('/clients/search?'))
            return respond({ message: 'Forbidden' }, 403);
          if (path.endsWith('/clients') && init?.method === 'POST') {
            commands.push({
              body: init.body,
              key: new Headers(init.headers).get('idempotency-key'),
            });
            return respond({}, 503);
          }
          if (path.endsWith('/clients')) return respond([]);
          throw new Error('Unexpected API request: ' + path);
        }),
      );
      const rendered = render(
        <App identity={deterministicBrowserIdentity()} />,
      );
      await openRegistration();
      fillName();
      changeValue(screen.getByLabelText('IDNO / tax code'), 'TAX-231');
      fireEvent.click(screen.getByRole('button', { name: 'Add Contact' }));
      changeValue(
        within(screen.getByRole('group', { name: 'Contact 1' })).getByLabelText(
          'Contact name',
        ),
        'Ana',
      );
      changeValue(
        screen.getByLabelText('Find a shared Client'),
        'Draft search',
      );
      fireEvent.click(screen.getByRole('button', { name: 'Create Client' }));
      await screen.findByText(
        'The Client creation could not be confirmed. Retry the same details safely.',
      );
      expect(commands).toHaveLength(1);
      expect(commands[0]?.key).toBeTruthy();
      if (boundary === 'Company') {
        changeValue(
          screen.getByLabelText('Active Company', { exact: true }),
          companyB.id,
        );
      } else if (boundary === 'session' || boundary === 'membership') {
        if (boundary === 'membership')
          actor = { ...actor, workspaceMembershipId: 'membership-2' };
        rendered.rerender(<App identity={deterministicBrowserIdentity()} />);
        expect(
          screen.queryByLabelText('Client display name'),
        ).not.toBeInTheDocument();
      } else {
        actor = {
          ...actor,
          activeCompany: {
            ...actor.activeCompany,
            ...companyA,
            ...(boundary === 'assignment'
              ? { clientPermissionAssignmentId: 'assignment-2' }
              : {
                  clientPermissionSetVersion: 'v2',
                  clientPermissions: [
                    'client.read',
                    'client.create',
                    'client.update',
                    'client.duplicate.resolve',
                  ],
                }),
          },
        };
        fireEvent.click(screen.getByRole('button', { name: 'Search Clients' }));
      }
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'New Client' }),
        ).toHaveAttribute('aria-expanded', 'false'),
      );
      await openRegistration();
      expect(screen.getByLabelText('Client display name')).toHaveValue('');
      expect(screen.getByLabelText('IDNO / tax code')).toHaveValue('');
      expect(
        screen.queryByRole('group', { name: 'Contact 1' }),
      ).not.toBeInTheDocument();
      expect(screen.getByLabelText('Find a shared Client')).toHaveValue('');
      fillName();
      changeValue(screen.getByLabelText('IDNO / tax code'), 'TAX-231');
      fireEvent.click(screen.getByRole('button', { name: 'Add Contact' }));
      changeValue(
        within(screen.getByRole('group', { name: 'Contact 1' })).getByLabelText(
          'Contact name',
        ),
        'Ana',
      );
      fireEvent.click(screen.getByRole('button', { name: 'Create Client' }));
      await waitFor(() => expect(commands).toHaveLength(2));
      expect(commands[1]?.body).toBe(commands[0]?.body);
      expect(commands[1]?.key).not.toBe(commands[0]?.key);
    },
  );

  it.each([
    ['Company re-selection', 'settles'],
    ['Company re-selection', 'loses its response'],
    ['Access revalidation', 'settles'],
    ['Access revalidation', 'loses its response'],
  ] as const)(
    'keeps a pending Client registration across an equivalent %s when it %s',
    async (refresh, outcome) => {
      const actor = directorActor();
      const created = {
        id: 'client-refreshed',
        displayName: 'Refreshed Client',
        relatedToActiveCompany: true,
      };
      const listed: (typeof created)[] = [];
      const commands: {
        signal: AbortSignal | null | undefined;
        body: BodyInit | null | undefined;
        key: string | null;
        settle: (response: Response) => void;
        lose: () => void;
      }[] = [];
      let actorReads = 0;
      let activityReads = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const path = input.toString();
          if (path.endsWith('/access/current-actor')) {
            actorReads += 1;
            return respond(actor);
          }
          if (path.endsWith('/companies')) return respond([companyA, companyB]);
          if (path.endsWith('/activity-log')) {
            activityReads += 1;
            return respond({ events: [] });
          }
          if (path.includes('/clients/search?'))
            return respond({ message: 'Forbidden' }, 403);
          if (path.endsWith('/clients') && init?.method === 'POST')
            return new Promise<Response>((resolve, reject) => {
              commands.push({
                signal: init.signal,
                body: init.body,
                key: new Headers(init.headers).get('idempotency-key'),
                settle: resolve,
                lose: () => reject(new TypeError('Failed to fetch')),
              });
            });
          if (path.endsWith('/clients')) return respond(listed);
          throw new Error('Unexpected API request: ' + path);
        }),
      );
      render(<App identity={deterministicBrowserIdentity()} />);
      await openRegistration();
      await waitFor(() => expect(activityReads).toBe(1));
      fillName(created.displayName);
      fireEvent.click(screen.getByRole('button', { name: 'Create Client' }));
      await waitFor(() => expect(commands).toHaveLength(1));
      const actorReadsBeforeRefresh = actorReads;

      if (refresh === 'Company re-selection') {
        changeValue(
          screen.getByLabelText('Active Company', { exact: true }),
          companyA.id,
        );
      } else {
        changeValue(screen.getByLabelText('Find a shared Client'), 'Refreshed');
        fireEvent.click(screen.getByRole('button', { name: 'Search Clients' }));
      }
      // Choosing the committed Company again closes the Select without a command.
      // A refused Client search still revalidates through the access owner.
      const refreshCount = refresh === 'Company re-selection' ? 0 : 1;
      await waitFor(() =>
        expect(actorReads).toBe(actorReadsBeforeRefresh + refreshCount),
      );
      await waitFor(() => expect(activityReads).toBe(1 + refreshCount));

      if (refresh === 'Access revalidation') {
        expect(
          screen.getByText('You do not have permission to manage Clients.'),
        ).toBeVisible();
        fireEvent.click(
          screen.getByRole('button', { name: 'Back to Company Clients' }),
        );
      }
      expect(commands[0]?.signal?.aborted).toBe(false);
      expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled();
      expect(screen.getByLabelText('Client display name')).toHaveValue(
        created.displayName,
      );
      listed.push(created);
      if (outcome === 'loses its response') {
        await act(async () => commands[0]?.lose());
        await screen.findByText(
          'The Client creation could not be confirmed. Retry the same details safely.',
        );
        fireEvent.click(screen.getByRole('button', { name: 'Create Client' }));
        await waitFor(() => expect(commands).toHaveLength(2));
        expect(commands[1]?.key).toBe(commands[0]?.key);
        expect(commands[1]?.body).toBe(commands[0]?.body);
      }
      const settled = outcome === 'settles' ? commands[0] : commands[1];
      await act(async () => settled?.settle(respond(created, 201)));

      expect(
        await screen.findByText(
          'Client created and linked to the active Company.',
        ),
      ).toBeInTheDocument();
      expect(
        screen.getAllByText('Client created and linked to the active Company.'),
      ).toHaveLength(1);
      await waitFor(() => expect(activityReads).toBe(2 + refreshCount));
      expect(
        await screen.findByRole('heading', {
          name: created.displayName,
        }),
      ).toBeVisible();
      expect(commands).toHaveLength(outcome === 'settles' ? 1 : 2);
    },
  );

  it('aborts a pending Client creation on Company change and ignores its late success', async () => {
    const actor = directorActor();
    let release: ((response: Response) => void) | undefined;
    let pendingSignal: AbortSignal | null | undefined;
    let activityReads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = input.toString();
        if (path.endsWith('/access/current-actor')) {
          const company =
            new Headers(init?.headers).get('x-company-context-id') ===
            companyB.id
              ? companyB
              : companyA;
          return respond({
            ...actor,
            activeCompany: { ...actor.activeCompany, ...company },
          });
        }
        if (path.endsWith('/companies')) return respond([companyA, companyB]);
        if (path.endsWith('/activity-log')) {
          activityReads += 1;
          return respond({ events: [] });
        }
        if (path.endsWith('/clients') && init?.method === 'POST') {
          pendingSignal = init.signal;
          return new Promise<Response>((resolve) => {
            release = resolve;
          });
        }
        if (path.endsWith('/clients')) return respond([]);
        throw new Error('Unexpected API request: ' + path);
      }),
    );
    render(<App identity={deterministicBrowserIdentity()} />);
    await openRegistration();
    fillName('Old Company Client');
    fireEvent.click(screen.getByRole('button', { name: 'Create Client' }));
    await waitFor(() => expect(release).toBeDefined());
    changeValue(
      screen.getByLabelText('Active Company', { exact: true }),
      companyB.id,
    );
    await screen.findByText('No Clients for Company B yet.');
    await waitFor(() => expect(pendingSignal?.aborted).toBe(true));
    const readsBeforeLateResponse = activityReads;
    await act(async () => {
      if (!release) throw new Error('Expected a pending Client request');
      release(
        respond(
          {
            id: 'old-client',
            displayName: 'Old Company Client',
            relatedToActiveCompany: true,
          },
          201,
        ),
      );
    });
    expect(screen.queryByText('Old Company Client')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Client created and linked to the active Company.'),
    ).not.toBeInTheDocument();
    expect(activityReads).toBe(readsBeforeLateResponse);
    await openRegistration();
    expect(screen.getByLabelText('Client display name')).toHaveValue('');
  });
});
