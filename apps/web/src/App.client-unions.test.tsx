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
import { ClientWorkspace } from './client/ClientWorkspace';
import { ApplicationPresentation } from './production-shell/application-presentation';

const companyA = { id: 'company-a', displayName: 'Company A' };
const companyB = { id: 'company-b', displayName: 'Company B' };
const first = {
  id: 'client-first',
  version: 2,
  displayName: 'First saved Client',
  taxId: 'UNION-241',
  address: null,
  telephone: '+373 60 111 222',
  generalEmail: null,
  businessActivity: null,
  contacts: [{ name: 'Alex' }],
};
const second = {
  ...first,
  id: 'client-second',
  version: 4,
  displayName: 'Second saved Client',
  address: '14 Example Avenue',
  contacts: [{ name: 'Dana' }],
};
const comparison = {
  outcome: 'comparison',
  reviewReference: 'review-241',
  clients: [first, second],
  companies: [companyA, companyB],
};
function resolverActor(): ActorContext {
  return {
    internalUserId: 'resolver',
    workspaceMembershipId: 'membership-1',
    workspaceId: 'workspace',
    workspaceName: 'Workspace',
    displayName: 'Resolver',
    email: 'resolver@example.test',
    active: true,
    workspacePermissions: ['client.manage'],
    activeCompany: {
      ...companyA,
      clientPermissions: [
        'client.read',
        'client.create',
        'client.update',
        'client.duplicate.resolve',
      ],
      clientPermissionAssignmentId: 'assignment-1',
      clientPermissionSetVersion: 'v2',
    },
  };
}
function respond(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}
function installTransport() {
  const state: {
    actor: ActorContext;
    united: boolean;
    activityReads: number;
    clientReads: number;
    confirmations: { body: string | null | undefined; key: string | null }[];
    confirm: ((init?: RequestInit) => Promise<Response>) | undefined;
    review: ((init?: RequestInit) => Promise<Response>) | undefined;
  } = {
    actor: resolverActor(),
    united: false,
    activityReads: 0,
    clientReads: 0,
    confirmations: [],
    confirm: undefined,
    review: undefined,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = input.toString();
      if (path.endsWith('/access/current-actor')) {
        if (
          new Headers(init?.headers).get('x-company-context-id') === companyB.id
        )
          state.actor = {
            ...state.actor,
            activeCompany: { ...state.actor.activeCompany, ...companyB },
          };
        return respond(state.actor);
      }
      if (path.endsWith('/companies')) return respond([companyA, companyB]);
      if (path.endsWith('/activity-log')) {
        state.activityReads++;
        return respond({ events: [] });
      }
      if (path.includes('/client-duplicate-reviews?'))
        return respond({ items: [], next_cursor: null });
      if (path.endsWith('/clients/search?query=Check%20authority'))
        return respond({}, 403);
      if (path.endsWith('/clients')) {
        state.clientReads++;
        return respond(
          (state.united ? [second] : [first, second]).map((client) => ({
            ...client,
            relatedToActiveCompany: true,
          })),
        );
      }
      if (path.endsWith('/union-reviews'))
        return state.review ? state.review(init) : respond(comparison, 201);
      if (path.endsWith('/confirm')) {
        if (typeof init?.body !== 'string')
          throw new Error('Expected existing serialized command');
        state.confirmations.push({
          body: init.body,
          key: new Headers(init.headers).get('idempotency-key'),
        });
        if (state.confirm) return state.confirm(init);
        if (state.confirmations.length === 1) return respond({}, 503);
        state.united = true;
        return respond(
          {
            outcome: 'united',
            canonicalClientId: second.id,
            projectionReference: 'projection-241',
          },
          201,
        );
      }
      const client = path.endsWith('/' + first.id)
        ? first
        : path.endsWith('/' + second.id)
          ? second
          : undefined;
      if (client)
        return respond({
          ...client,
          contacts: state.united
            ? [...first.contacts, ...second.contacts]
            : client.contacts,
          relatedToActiveCompany: true,
          involvedCompanyDisplayNames: ['Company A', 'Company B'],
        });
      throw new Error('Unexpected API request: ' + path);
    }),
  );
  return state;
}
async function openComparison() {
  const [openFirst] = await screen.findAllByRole('button', {
    name: 'Open dossier',
  });
  if (!openFirst)
    throw new Error('Expected the first dossier in the directory');
  fireEvent.click(openFirst);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Review existing duplicates' }),
  );
  return screen.findByRole('form', { name: 'Confirm union' });
}
function chooseSecond(form: HTMLElement) {
  for (const select of within(form).getAllByRole('combobox'))
    fireEvent.change(select, { target: { value: second.id } });
  fireEvent.change(within(form).getByLabelText('Telephone', { exact: true }), {
    target: { value: first.id },
  });
  fireEvent.change(within(form).getByLabelText('Reason for this union'), {
    target: { value: 'Reviewed both saved dossiers.' },
  });
  for (const checkbox of within(form).getAllByRole('checkbox'))
    fireEvent.click(checkbox);
}
describe('persisted Client union through App', () => {
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
  it('preserves an uncertain mixed-source command across navigation and frames and reports success in the second canonical dossier', async () => {
    const state = installTransport();
    render(<App identity={deterministicBrowserIdentity()} />);
    const form = await openComparison();
    chooseSecond(form);
    const clientsBefore = state.clientReads;
    const activityBefore = state.activityReads;
    fireEvent.submit(form);
    await screen.findByText(
      'The request could not be completed. You can retry safely.',
    );
    const nav = screen.getByRole('navigation', { name: 'Primary navigation' });
    fireEvent.click(within(nav).getByRole('link', { name: 'Activity Log' }));
    fireEvent.click(within(nav).getByRole('link', { name: 'Clients' }));
    act(() => {
      const url = new URL(window.location.href);
      url.searchParams.set('frame', 'classic');
      window.history.pushState(window.history.state, '', url);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Try Prisme' }));
    const retained = screen.getByRole('form', { name: 'Confirm union' });
    expect(
      within(retained).getByLabelText('Canonical Client dossier'),
    ).toHaveValue(second.id);
    expect(
      within(retained).getByLabelText('Telephone', { exact: true }),
    ).toHaveValue(first.id);
    expect(
      within(retained).getByLabelText('Reason for this union'),
    ).toHaveValue('Reviewed both saved dossiers.');
    expect(state.confirmations).toHaveLength(1);
    fireEvent.submit(retained);
    await waitFor(() => expect(state.confirmations).toHaveLength(2));
    expect(state.confirmations[1]).toEqual(state.confirmations[0]);
    expect(state.confirmations[0]?.key).toBeTruthy();
    expect(JSON.parse(state.confirmations[0]?.body ?? '{}')).toEqual({
      canonicalClientId: second.id,
      fields: {
        displayName: second.id,
        taxId: second.id,
        address: second.id,
        telephone: first.id,
        generalEmail: second.id,
        businessActivity: second.id,
      },
      reason: 'Reviewed both saved dossiers.',
      reviewedDifferences: true,
      companyIds: ['company-a', 'company-b'],
    });
    const canonical = await screen.findByRole('region', {
      name: second.displayName,
    });
    expect(
      within(canonical).getByRole('heading', { name: second.displayName }),
    ).toBeVisible();
    expect(
      await screen.findByText(
        'Union confirmed. The canonical dossier is now available in the affected Companies.',
      ),
    ).toBeVisible();
    expect(state.clientReads).toBeGreaterThan(clientsBefore);
    expect(state.activityReads).toBeGreaterThan(activityBefore);
  });
  it.each([
    'Client',
    'Company',
    'session',
    'identity',
    'assignment',
    'version',
    'permission',
  ])(
    'suppresses a late union confirmation across the real %s boundary',
    async (boundary) => {
      const state = installTransport();
      let release: ((response: Response) => void) | undefined;
      let signal: AbortSignal | null | undefined;
      state.confirm = (init) => {
        signal = init?.signal;
        return new Promise((resolve) => {
          release = resolve;
        });
      };
      const rendered = render(
        <App identity={deterministicBrowserIdentity()} />,
      );
      const form = await openComparison();
      chooseSecond(form);
      fireEvent.submit(form);
      await waitFor(() => expect(release).toBeDefined());
      if (boundary === 'Client') {
        const buttons = screen.getAllByRole('button', {
          name: 'Open dossier',
        });
        const secondButton = buttons[1];
        if (!secondButton)
          throw new Error('Expected the second directory Client');
        fireEvent.click(secondButton);
        await screen.findByRole('region', {
          name: second.displayName,
        });
      } else if (boundary === 'Company') {
        fireEvent.change(
          screen.getByLabelText('Active Company', { exact: true }),
          { target: { value: companyB.id } },
        );
        await screen.findByText('Clients in Company B');
      } else if (boundary === 'session' || boundary === 'identity') {
        if (boundary === 'identity')
          state.actor = {
            ...state.actor,
            internalUserId: 'other-user',
            workspaceMembershipId: 'other-membership',
          };
        rendered.rerender(<App identity={deterministicBrowserIdentity()} />);
      } else {
        state.actor = {
          ...state.actor,
          activeCompany: {
            ...state.actor.activeCompany,
            ...companyA,
            ...(boundary === 'assignment'
              ? { clientPermissionAssignmentId: 'assignment-2' }
              : boundary === 'version'
                ? {
                    clientPermissionSetVersion: 'v1',
                    clientPermissions: [
                      'client.read',
                      'client.create',
                      'client.update',
                    ],
                  }
                : { clientPermissions: ['client.read'] }),
          },
        };
        fireEvent.change(screen.getByLabelText('Find a shared Client'), {
          target: { value: 'Check authority' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Search Clients' }));
      }
      await waitFor(() => expect(signal?.aborted).toBe(true));
      const readsBefore = state.activityReads;
      await act(async () => {
        if (!release) throw new Error('Expected pending confirmation');
        release(
          respond(
            {
              outcome: 'united',
              canonicalClientId: first.id,
              projectionReference: 'late-projection',
            },
            201,
          ),
        );
      });
      expect(
        screen.queryByRole('form', { name: 'Confirm union' }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/Union confirmed\./)).not.toBeInTheDocument();
      expect(state.activityReads).toBe(readsBefore);
    },
  );

  it.each([
    'Company',
    'session',
    'identity',
    'assignment',
    'version',
    'permission',
  ])(
    'clears confirmed completion at the real %s boundary',
    async (boundary) => {
      const state = installTransport();
      state.confirm = async () => {
        state.united = true;
        return respond(
          {
            outcome: 'united',
            canonicalClientId: second.id,
            projectionReference: 'projection-241',
          },
          201,
        );
      };
      const rendered = render(
        <App identity={deterministicBrowserIdentity()} />,
      );
      const form = await openComparison();
      chooseSecond(form);
      fireEvent.submit(form);
      await screen.findByText(/Union confirmed\./);
      if (boundary === 'Company') {
        fireEvent.change(
          screen.getByLabelText('Active Company', { exact: true }),
          { target: { value: companyB.id } },
        );
        await screen.findByText('Clients in Company B');
      } else if (boundary === 'session' || boundary === 'identity') {
        if (boundary === 'identity')
          state.actor = {
            ...state.actor,
            internalUserId: 'other-user',
            workspaceMembershipId: 'other-membership',
          };
        rendered.rerender(<App identity={deterministicBrowserIdentity()} />);
      } else {
        state.actor = {
          ...state.actor,
          activeCompany: {
            ...state.actor.activeCompany,
            ...companyA,
            ...(boundary === 'assignment'
              ? { clientPermissionAssignmentId: 'assignment-2' }
              : boundary === 'version'
                ? {
                    clientPermissionSetVersion: 'v1',
                    clientPermissions: [
                      'client.read',
                      'client.create',
                      'client.update',
                    ],
                  }
                : { clientPermissions: ['client.read'] }),
          },
        };
        fireEvent.change(screen.getByLabelText('Find a shared Client'), {
          target: { value: 'Check authority' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Search Clients' }));
      }
      await waitFor(() =>
        expect(screen.queryByText(/Union confirmed\./)).not.toBeInTheDocument(),
      );
    },
  );

  it.each(['review', 'confirm', 'confirmed'])(
    'invalidates %s when ClientWorkspace accepts a replacement membership',
    async (phase) => {
      const state = installTransport();
      const actor = state.actor;
      const identity = deterministicBrowserIdentity();
      let release: ((response: Response) => void) | undefined;
      let signal: AbortSignal | null | undefined;
      const pending = (init?: RequestInit) => {
        signal = init?.signal;
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      };
      if (phase === 'review') state.review = pending;
      if (phase === 'confirm') state.confirm = pending;
      if (phase === 'confirmed')
        state.confirm = async () => {
          state.united = true;
          return respond(
            {
              outcome: 'united',
              canonicalClientId: second.id,
              projectionReference: 'projection-241',
            },
            201,
          );
        };
      const workspace = (current: ActorContext) => (
        <ApplicationPresentation value="prisme">
          <ClientWorkspace
            actor={current}
            identity={identity}
            onCompanyContextRejected={() => undefined}
            onActivityRecorded={async () => {
              state.activityReads++;
            }}
          />
        </ApplicationPresentation>
      );
      const rendered = render(workspace(actor));
      if (phase === 'review') {
        const [button] = await screen.findAllByRole('button', {
          name: 'Open dossier',
        });
        if (!button) throw new Error('Expected first dossier');
        fireEvent.click(button);
        fireEvent.click(
          await screen.findByRole('button', {
            name: 'Review existing duplicates',
          }),
        );
      } else {
        const form = await openComparison();
        chooseSecond(form);
        fireEvent.submit(form);
      }
      if (phase === 'confirmed') await screen.findByText(/Union confirmed\./);
      else await waitFor(() => expect(release).toBeDefined());
      rendered.rerender(
        workspace({ ...actor, workspaceMembershipId: 'membership-2' }),
      );
      if (phase !== 'confirmed') {
        await waitFor(() => expect(signal?.aborted).toBe(true));
        await act(async () => {
          if (!release) throw new Error('Expected pending union response');
          release(
            respond(
              phase === 'review'
                ? comparison
                : {
                    outcome: 'united',
                    canonicalClientId: second.id,
                    projectionReference: 'late-projection',
                  },
              201,
            ),
          );
        });
      }
      expect(screen.queryByText(/Union confirmed\./)).not.toBeInTheDocument();
      expect(
        screen.queryByRole('form', { name: 'Confirm union' }),
      ).not.toBeInTheDocument();
    },
  );
});
