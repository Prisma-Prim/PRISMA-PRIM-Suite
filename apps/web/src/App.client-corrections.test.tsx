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
import { ClientDossierPanel } from './client/ClientDossierPanel';
import { ClientWorkspace } from './client/ClientWorkspace';
import { ApplicationPresentation } from './production-shell/application-presentation';

const companyA = { id: 'company-a', displayName: 'Company A' };
const companyB = { id: 'company-b', displayName: 'Company B' };
const dossier = {
  id: 'client-one',
  displayName: 'Shared Client',
  relatedToActiveCompany: true,
  taxId: 'TAX-233',
  address: null,
  telephone: 'Saved telephone',
  generalEmail: null,
  businessActivity: null,
  contacts: [{ name: 'Saved Contact', email: 'saved@example.test' }],
  version: 1,
  involvedCompanyDisplayNames: ['Company A'],
};
const otherDossier = {
  ...dossier,
  id: 'client-two',
  displayName: 'Second Client',
};
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
function correctionForm() {
  return screen.getByRole('form', { name: 'Correct Client dossier' });
}
async function openCorrection(client = dossier.displayName) {
  const heading = await screen.findByRole('heading', {
    name: client,
  });
  const row = heading.closest('li');
  if (!row) throw new Error('Expected the Client directory row');
  fireEvent.click(within(row).getByRole('button', { name: 'Open dossier' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Correct Client dossier' }),
  );
  await waitFor(() => expect(correctionForm()).toBeVisible());
}
function changeTelephone(value = 'Private draft') {
  fireEvent.change(within(correctionForm()).getByLabelText('Telephone'), {
    target: { value },
  });
}
function submit() {
  fireEvent.click(
    within(correctionForm()).getByRole('button', { name: 'Save correction' }),
  );
}

describe('Client correction ownership', () => {
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

  it.each(['Company', 'session', 'assignment', 'version', 'Client'])(
    'invalidates the correction draft and unchanged retry command across a %s boundary',
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
            if (
              new Headers(init?.headers).get('x-company-context-id') ===
              companyB.id
            )
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
          if (path.includes('/clients/search?')) return respond({}, 403);
          if (path.endsWith('/union-history')) return respond([]);
          if (path.endsWith('/clients'))
            return respond([dossier, otherDossier]);
          if (init?.method === 'PATCH') {
            commands.push({
              body: init.body,
              key: new Headers(init.headers).get('idempotency-key'),
            });
            return respond({}, 503);
          }
          if (path.endsWith('/clients/client-one')) return respond(dossier);
          if (path.endsWith('/clients/client-two'))
            return respond(otherDossier);
          throw new Error('Unexpected API request: ' + path);
        }),
      );
      const rendered = render(
        <App identity={deterministicBrowserIdentity()} />,
      );
      await openCorrection();
      changeTelephone();
      fireEvent.change(
        within(correctionForm()).getByLabelText('Contact name'),
        { target: { value: 'Private Contact' } },
      );
      submit();
      await screen.findByText(
        'The correction could not be saved. Retry safely.',
      );
      fireEvent.click(screen.getByRole('button', { name: 'Close correction' }));
      expect(commands[0]?.key).toBeTruthy();
      if (boundary === 'Company') {
        fireEvent.change(
          screen.getByLabelText('Active Company', { exact: true }),
          { target: { value: companyB.id } },
        );
        await screen.findByText('Clients in Company B');
      } else if (boundary === 'session') {
        rendered.rerender(<App identity={deterministicBrowserIdentity()} />);
      } else if (boundary === 'assignment' || boundary === 'version') {
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
        fireEvent.change(screen.getByLabelText('Find a shared Client'), {
          target: { value: 'Refresh authority' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Search Clients' }));
      }
      if (boundary !== 'Client')
        await waitFor(() =>
          expect(
            screen.queryByRole('button', { name: 'Correct Client dossier' }),
          ).not.toBeInTheDocument(),
        );
      if (boundary === 'Client') {
        await openCorrection(otherDossier.displayName);
        expect(
          within(correctionForm()).getByLabelText('Telephone'),
        ).toHaveValue('Saved telephone');
        fireEvent.click(
          screen.getByRole('button', { name: 'Close correction' }),
        );
      }
      await openCorrection();
      expect(within(correctionForm()).getByLabelText('Telephone')).toHaveValue(
        'Saved telephone',
      );
      expect(
        within(correctionForm()).getByLabelText('Contact name'),
      ).toHaveValue('Saved Contact');
      changeTelephone();
      fireEvent.change(
        within(correctionForm()).getByLabelText('Contact name'),
        { target: { value: 'Private Contact' } },
      );
      submit();
      await waitFor(() => expect(commands).toHaveLength(2));
      expect(commands[1]?.body).toBe(commands[0]?.body);
      expect(commands[1]?.key).not.toBe(commands[0]?.key);
    },
  );

  it.each(['Company', 'session', 'Client'])(
    'aborts a pending correction at a %s boundary and suppresses its late success',
    async (boundary) => {
      let actor = directorActor();
      let release: ((response: Response) => void) | undefined;
      let pendingSignal: AbortSignal | null | undefined;
      let activityReads = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const path = input.toString();
          if (path.endsWith('/access/current-actor')) {
            if (
              new Headers(init?.headers).get('x-company-context-id') ===
              companyB.id
            )
              actor = {
                ...actor,
                activeCompany: { ...actor.activeCompany, ...companyB },
              };
            return respond(actor);
          }
          if (path.endsWith('/companies')) return respond([companyA, companyB]);
          if (path.endsWith('/activity-log')) {
            activityReads += 1;
            return respond({ events: [] });
          }
          if (path.endsWith('/clients'))
            return respond([dossier, otherDossier]);
          if (path.endsWith('/union-history')) return respond([]);
          if (init?.method === 'PATCH') {
            pendingSignal = init.signal;
            return new Promise<Response>((resolve) => {
              release = resolve;
            });
          }
          if (path.endsWith('/clients/client-one')) return respond(dossier);
          if (path.endsWith('/clients/client-two'))
            return respond(otherDossier);
          throw new Error('Unexpected API request: ' + path);
        }),
      );
      const rendered = render(
        <App identity={deterministicBrowserIdentity()} />,
      );
      await openCorrection();
      changeTelephone();
      submit();
      await waitFor(() => expect(release).toBeDefined());
      if (boundary === 'Company') {
        fireEvent.change(
          screen.getByLabelText('Active Company', { exact: true }),
          { target: { value: companyB.id } },
        );
        await screen.findByText('Clients in Company B');
      } else if (boundary === 'session') {
        rendered.rerender(<App identity={deterministicBrowserIdentity()} />);
        await screen.findByText('Clients in Company A');
      } else {
        await openCorrection(otherDossier.displayName);
      }
      await waitFor(() => expect(pendingSignal?.aborted).toBe(true));
      const activityBeforeLateResponse = activityReads;
      await act(async () => {
        if (!release) throw new Error('Expected a pending correction');
        release(
          respond({
            ...dossier,
            displayName: 'Late forbidden result',
            version: 2,
          }),
        );
      });
      expect(
        screen.queryByText('Late forbidden result'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(
          'Client correction saved with attributable history.',
        ),
      ).not.toBeInTheDocument();
      expect(activityReads).toBe(activityBeforeLateResponse);
    },
  );

  it('invalidates a correction when ClientWorkspace receives another membership without replacing identity or Company', async () => {
    const actor = directorActor();
    const identity = deterministicBrowserIdentity();
    const commands: {
      body: BodyInit | null | undefined;
      key: string | null;
    }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = input.toString();
        if (path.endsWith('/clients')) return respond([dossier]);
        if (path.endsWith('/union-history')) return respond([]);
        if (init?.method === 'PATCH') {
          commands.push({
            body: init.body,
            key: new Headers(init.headers).get('idempotency-key'),
          });
          return respond({}, 503);
        }
        if (path.endsWith('/clients/client-one')) return respond(dossier);
        throw new Error('Unexpected API request: ' + path);
      }),
    );
    const workspace = (currentActor: ActorContext) => (
      <ApplicationPresentation value="prisme">
        <ClientWorkspace
          actor={currentActor}
          identity={identity}
          onCompanyContextRejected={() => undefined}
          onActivityRecorded={async () => undefined}
        />
      </ApplicationPresentation>
    );
    const rendered = render(workspace(actor));
    await openCorrection();
    changeTelephone();
    submit();
    await screen.findByText('The correction could not be saved. Retry safely.');
    expect(commands[0]?.key).toBeTruthy();
    // App rejects a mismatched membership on an existing request origin;
    // this public owner boundary proves invalidation when a new actor is accepted.
    rendered.rerender(
      workspace({ ...actor, workspaceMembershipId: 'membership-2' }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('form', { name: 'Correct Client dossier' }),
      ).not.toBeInTheDocument(),
    );
    await openCorrection();
    expect(within(correctionForm()).getByLabelText('Telephone')).toHaveValue(
      'Saved telephone',
    );
    changeTelephone();
    submit();
    await waitFor(() => expect(commands).toHaveLength(2));
    expect(commands[1]?.body).toBe(commands[0]?.body);
    expect(commands[1]?.key).not.toBe(commands[0]?.key);
  });

  it('keeps the defensive canUpdate=false boundary without inventing a read-only role', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(dossier));
    vi.stubGlobal('fetch', fetchMock);
    render(
      <ApplicationPresentation value="prisme">
        <ClientDossierPanel
          clientAccountId={dossier.id}
          companyContextId={companyA.id}
          canUpdate={false}
          identity={deterministicBrowserIdentity()}
          onCompanyContextRejected={() => undefined}
          onActivityRecorded={async () => undefined}
          onClientsChanged={async () => undefined}
        />
      </ApplicationPresentation>,
    );
    await screen.findByText('TAX-233');
    expect(
      screen.queryByRole('button', { name: 'Correct Client dossier' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('form', { name: 'Correct Client dossier' }),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
