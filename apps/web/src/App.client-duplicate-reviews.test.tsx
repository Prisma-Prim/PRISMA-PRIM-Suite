import { changeValue } from './test/select-option';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from './test/render-with-interface-locale';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import type { ActorContext } from './access-types';
import { ClientWorkspace } from './client/ClientWorkspace';
import { ApplicationPresentation } from './production-shell/application-presentation';

const companyA = { id: 'company-a', displayName: 'Company A' };
const companyB = { id: 'company-b', displayName: 'Company B' };
const reference = '23600000-0000-4000-8000-000000000001';
const saved = {
  id: 'existing-client',
  displayName: 'Existing shared Client',
  taxId: 'TAX-236',
  address: null,
  telephone: null,
  generalEmail: null,
  businessActivity: null,
  contacts: [],
  version: 1,
  relatedToActiveCompany: false,
  involvedCompanyDisplayNames: ['Company B'],
};
const comparison = {
  outcome: 'comparison',
  duplicate_review_reference: reference,
  proposal: {
    kind: 'registration',
    fields: {
      displayName: 'Rejected proposal',
      taxId: 'TAX-236',
      address: null,
      telephone: null,
      generalEmail: null,
      businessActivity: null,
      contacts: [],
    },
  },
  candidate: saved,
};
const attachedCopy = 'Existing Client linked to the active Company.';
function resolverActor(): ActorContext {
  return {
    internalUserId: 'reviewer',
    workspaceMembershipId: 'membership-1',
    workspaceId: 'workspace',
    workspaceName: 'Workspace',
    displayName: 'Reviewer',
    email: 'reviewer@example.test',
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
    attached: boolean;
    activityReads: number;
    detail: ((init?: RequestInit) => Promise<Response>) | undefined;
    attach: ((init?: RequestInit) => Promise<Response>) | undefined;
    list: ((init?: RequestInit) => Promise<Response>) | undefined;
  } = {
    actor: resolverActor(),
    attached: false,
    activityReads: 0,
    detail: undefined,
    attach: undefined,
    list: undefined,
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
        return state.list
          ? state.list(init)
          : respond({
              items: state.attached
                ? []
                : [{ duplicate_review_reference: reference }],
              next_cursor: null,
            });
      if (path.endsWith(`/client-duplicate-reviews/${reference}`))
        return state.detail ? state.detail(init) : respond(comparison);
      if (path.includes('/clients/search?')) return respond({}, 403);
      if (
        path.endsWith('/clients/existing-client/active-company-relationship')
      ) {
        if (state.attach) return state.attach(init);
        state.attached = true;
        return respond({ ...saved, relatedToActiveCompany: true });
      }
      if (path.endsWith('/clients')) {
        if (init?.method === 'POST')
          return respond(
            {
              code: 'possible_duplicate_review_required',
              duplicate_review_reference: reference,
            },
            409,
          );
        return respond(
          state.attached ? [{ ...saved, relatedToActiveCompany: true }] : [],
        );
      }
      throw new Error('Unexpected API request: ' + path);
    }),
  );
  return state;
}
async function openReview() {
  fireEvent.click(
    await screen.findByRole('button', { name: 'Review possible duplicate 1' }),
  );
}
async function attachReview() {
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Use this existing Client in the active Company',
    }),
  );
}
function revalidateAuthority() {
  changeValue(
    screen.getByLabelText('Find a shared Client'),
    'Check current authority',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Search Clients' }));
}

describe('duplicate review ownership through App', () => {
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

  it.each([
    'Company',
    'session',
    'identity',
    'assignment',
    'version',
    'permission',
  ])(
    'clears a confirmed attachment on a real %s boundary',
    async (boundary) => {
      const state = installTransport();
      const rendered = render(
        <App identity={deterministicBrowserIdentity()} />,
      );
      await openReview();
      await attachReview();
      await screen.findByText(attachedCopy);
      await waitFor(() => expect(state.activityReads).toBeGreaterThan(1));
      if (boundary === 'Company') {
        changeValue(
          screen.getByLabelText('Active Company', { exact: true }),
          companyB.id,
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
      } else if (boundary === 'permission') {
        state.actor = { ...state.actor, workspacePermissions: [] };
        revalidateAuthority();
      } else {
        state.actor = {
          ...state.actor,
          activeCompany: {
            ...state.actor.activeCompany,
            ...companyA,
            ...(boundary === 'assignment'
              ? { clientPermissionAssignmentId: 'assignment-2' }
              : {
                  clientPermissionSetVersion: 'v1',
                  clientPermissions: [
                    'client.read',
                    'client.create',
                    'client.update',
                  ],
                }),
          },
        };
        revalidateAuthority();
      }
      await waitFor(() =>
        expect(screen.queryByText(attachedCopy)).not.toBeInTheDocument(),
      );
      expect(screen.queryByText('Rejected proposal')).not.toBeInTheDocument();
    },
  );

  it.each(['Company', 'session', 'assignment', 'permission'])(
    'aborts attachment and suppresses late confirmation across a %s boundary',
    async (boundary) => {
      const state = installTransport();
      let release: ((response: Response) => void) | undefined;
      let signal: AbortSignal | null | undefined;
      state.attach = (init) => {
        signal = init?.signal;
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      };
      const rendered = render(
        <App identity={deterministicBrowserIdentity()} />,
      );
      await openReview();
      await attachReview();
      await waitFor(() => expect(release).toBeDefined());
      if (boundary === 'Company') {
        changeValue(
          screen.getByLabelText('Active Company', { exact: true }),
          companyB.id,
        );
        await screen.findByText('Clients in Company B');
      } else if (boundary === 'session') {
        rendered.rerender(<App identity={deterministicBrowserIdentity()} />);
      } else if (boundary === 'permission') {
        state.actor = { ...state.actor, workspacePermissions: [] };
        revalidateAuthority();
      } else {
        state.actor = {
          ...state.actor,
          activeCompany: {
            ...state.actor.activeCompany,
            ...companyA,
            clientPermissionAssignmentId: 'assignment-2',
          },
        };
        revalidateAuthority();
      }
      await waitFor(() => expect(signal?.aborted).toBe(true));
      await screen.findByRole('button', {
        name: 'Review possible duplicate 1',
      });
      await openReview();
      await screen.findByText('Rejected proposal');
      const readsBeforeLateResponse = state.activityReads;
      await act(async () => {
        if (!release) throw new Error('Expected pending attachment');
        release(respond({}));
      });
      expect(screen.queryByText(attachedCopy)).not.toBeInTheDocument();
      expect(screen.getByText('Rejected proposal')).toBeInTheDocument();
      expect(state.activityReads).toBe(readsBeforeLateResponse);
    },
  );

  it.each(['list', 'detail', 'attach', 'confirmed'])(
    'clears %s review state when the public workspace accepts a new membership',
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
      if (phase === 'list') state.list = pending;
      if (phase === 'detail') state.detail = pending;
      if (phase === 'attach') state.attach = pending;
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
      if (phase !== 'list') await openReview();
      if (phase === 'attach' || phase === 'confirmed') await attachReview();
      if (phase === 'confirmed') await screen.findByText(attachedCopy);
      else await waitFor(() => expect(release).toBeDefined());
      state.list = undefined;
      state.detail = undefined;
      state.attach = undefined;
      // App rejects a different membership on an old request origin. Exercise
      // the public workspace boundary that receives an already accepted actor.
      rendered.rerender(
        workspace({ ...actor, workspaceMembershipId: 'membership-2' }),
      );
      if (phase !== 'confirmed')
        await waitFor(() => expect(signal?.aborted).toBe(true));
      await waitFor(() =>
        expect(screen.queryByText(attachedCopy)).not.toBeInTheDocument(),
      );
      const activityBefore = state.activityReads;
      if (phase !== 'confirmed')
        await act(async () => {
          if (!release) throw new Error('Expected pending review operation');
          release(
            respond(
              phase === 'detail'
                ? comparison
                : {
                    items: [
                      {
                        duplicate_review_reference:
                          '23600000-0000-4000-8000-000000000099',
                      },
                    ],
                    next_cursor: null,
                  },
            ),
          );
        });
      expect(screen.queryByText('Rejected proposal')).not.toBeInTheDocument();
      expect(screen.queryByText(attachedCopy)).not.toBeInTheDocument();
      expect(state.activityReads).toBe(activityBefore);
    },
  );

  it('clears local confirmation when a new rejected registration invalidates review references', async () => {
    installTransport();
    render(<App identity={deterministicBrowserIdentity()} />);
    await openReview();
    await attachReview();
    await screen.findByText(attachedCopy);
    fireEvent.click(screen.getByRole('button', { name: 'New Client' }));
    changeValue(
      screen.getByLabelText('Client display name'),
      'Another rejected proposal',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create Client' }));
    await screen.findByText(/No Client was created or changed/);
    await waitFor(() =>
      expect(screen.queryByText(attachedCopy)).not.toBeInTheDocument(),
    );
  });
});
