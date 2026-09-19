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
  fireEvent.change(screen.getByLabelText('Client display name'), {
    target: { value },
  });
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

  it('does not offer Client-to-Projects navigation without Project read access', async () => {
    const actor = directorActor();
    const client = {
      id: 'client-a',
      displayName: 'Client A',
      relatedToActiveCompany: true,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const path = input.toString();
        if (path.endsWith('/access/current-actor')) return respond(actor);
        if (path.endsWith('/companies')) return respond([companyA]);
        if (path.endsWith('/activity-log')) return respond({ events: [] });
        if (path.includes('/client-duplicate-reviews?'))
          return respond({ items: [], next_cursor: null });
        if (path.endsWith(`/clients/${client.id}`))
          return respond({
            ...client,
            taxId: null,
            address: null,
            telephone: null,
            generalEmail: null,
            contacts: [],
            businessActivity: null,
            version: 1,
            involvedCompanyDisplayNames: [companyA.displayName],
          });
        if (path.endsWith('/clients')) return respond([client]);
        throw new Error('Unexpected API request: ' + path);
      }),
    );

    render(<App identity={deterministicBrowserIdentity()} />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open dossier' }),
    );
    await screen.findByRole('heading', { name: client.displayName });

    expect(
      screen.queryByRole('button', { name: 'Open Client Projects' }),
    ).not.toBeInTheDocument();
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
      fireEvent.change(screen.getByLabelText('IDNO / tax code'), {
        target: { value: 'TAX-231' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Add Contact' }));
      fireEvent.change(
        within(screen.getByRole('group', { name: 'Contact 1' })).getByLabelText(
          'Contact name',
        ),
        { target: { value: 'Ana' } },
      );
      fireEvent.change(screen.getByLabelText('Find a shared Client'), {
        target: { value: 'Draft search' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Create Client' }));
      await screen.findByText(
        'The Client creation could not be confirmed. Retry the same details safely.',
      );
      expect(commands).toHaveLength(1);
      expect(commands[0]?.key).toBeTruthy();
      if (boundary === 'Company') {
        fireEvent.change(
          screen.getByLabelText('Active Company', { exact: true }),
          { target: { value: companyB.id } },
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
      fireEvent.change(screen.getByLabelText('IDNO / tax code'), {
        target: { value: 'TAX-231' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Add Contact' }));
      fireEvent.change(
        within(screen.getByRole('group', { name: 'Contact 1' })).getByLabelText(
          'Contact name',
        ),
        { target: { value: 'Ana' } },
      );
      fireEvent.click(screen.getByRole('button', { name: 'Create Client' }));
      await waitFor(() => expect(commands).toHaveLength(2));
      expect(commands[1]?.body).toBe(commands[0]?.body);
      expect(commands[1]?.key).not.toBe(commands[0]?.key);
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
    fireEvent.change(screen.getByLabelText('Active Company', { exact: true }), {
      target: { value: companyB.id },
    });
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
