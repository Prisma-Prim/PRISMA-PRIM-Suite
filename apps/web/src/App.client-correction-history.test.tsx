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
import { formatApplicationDateTime } from './presentation/date-time';
import { ApplicationPresentation } from './production-shell/application-presentation';

const companyA = { id: 'company-a', displayName: 'Company A' };
const companyB = { id: 'company-b', displayName: 'Company B' };
const dossier = {
  id: 'client-one',
  displayName: 'SICOM Demo SRL',
  relatedToActiveCompany: true,
  taxId: '1003600054321',
  address: 'Str. Demo 1',
  telephone: null,
  generalEmail: null,
  businessActivity: null,
  contacts: [{ name: 'Ana Demo', email: 'ana.demo@example.test' }],
  version: 3,
  involvedCompanyDisplayNames: ['Company A', 'Company B'],
};
const otherDossier = {
  ...dossier,
  id: 'client-two',
  displayName: 'Other Demo SRL',
};
const newest = {
  id: 'correction-2',
  occurredAt: '2026-09-24T09:15:00.000Z',
  actor: { displayName: 'Director A' },
  changes: {
    taxId: { before: '1003600012345', after: '1003600054321' },
    contacts: {
      before: [],
      after: [{ name: 'Ana Demo', email: 'ana.demo@example.test' }],
    },
  },
};
const oldest = {
  id: 'correction-1',
  occurredAt: '2026-09-23T08:00:00.000Z',
  actor: { displayName: 'Director B' },
  changes: { address: { before: null, after: 'Str. Demo 1' } },
};
const historyPath = '/clients/client-one/correction-history';

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
function page(corrections: unknown[], nextCursor: string | null = null) {
  return respond({ corrections, nextCursor });
}
type HistoryRoute = (
  path: string,
  init: RequestInit | undefined,
) => Response | Promise<Response>;

function renderDossier(history: HistoryRoute) {
  const requests: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = input.toString();
      if (path.includes('/correction-history')) {
        requests.push(path);
        expect(new Headers(init?.headers).get('x-company-context-id')).toBe(
          companyA.id,
        );
        return history(path, init);
      }
      if (path.endsWith('/access/current-actor'))
        return respond(directorActor());
      if (path.endsWith('/clients/client-one')) return respond(dossier);
      if (path.endsWith('/legal-entities'))
        return respond({ clientVersion: 1, legalEntities: [] });
      throw new Error('Unexpected API request: ' + path);
    }),
  );
  render(
    <ApplicationPresentation value="prisme">
      <ClientDossierPanel
        clientAccountId={dossier.id}
        companyContextId={companyA.id}
        canUpdate
        identity={deterministicBrowserIdentity()}
        onCompanyContextRejected={() => undefined}
        onActivityRecorded={async () => undefined}
        onClientsChanged={async () => undefined}
      />
    </ApplicationPresentation>,
  );
  return requests;
}
async function expandHistory() {
  fireEvent.click(
    await screen.findByRole('button', { name: 'Show correction history' }),
  );
  return screen.getByRole('region', { name: 'Correction history' });
}
async function listedCorrections(history: HTMLElement) {
  const list = await within(history).findByRole('list', {
    name: 'Corrections, newest first',
  });
  return Array.from(list.querySelectorAll(':scope > li'), (item) => {
    if (!(item instanceof HTMLElement)) throw new Error('Expected an item.');
    return item;
  });
}
function fieldRow(item: HTMLElement, label: string) {
  const row = within(item).getByText(label, { selector: 'dt' }).parentElement;
  if (!row) throw new Error(`Expected the ${label} row.`);
  return row;
}

describe('Client correction history', () => {
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

  it('stays collapsed until expanded, then lists newest-first corrections with attributed before and after values', async () => {
    const requests = renderDossier(() => page([newest, oldest]));
    await screen.findByRole('heading', { name: dossier.displayName });
    const toggle = screen.getByRole('button', {
      name: 'Show correction history',
    });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(requests).toHaveLength(0);

    const history = await expandHistory();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAccessibleName('Hide correction history');
    const [first, second] = await listedCorrections(history);
    if (!first || !second) throw new Error('Expected two corrections.');
    expect(requests).toEqual([expect.stringMatching(/correction-history$/u)]);

    expect(first).toHaveTextContent('Corrected by Director A');
    expect(
      within(first).getByText(formatApplicationDateTime(newest.occurredAt)),
    ).toHaveAttribute('datetime', newest.occurredAt);
    const taxId = fieldRow(first, 'IDNO / tax code');
    expect(within(taxId).getByText('1003600012345')).toBeVisible();
    expect(within(taxId).getByText('1003600054321')).toBeVisible();
    const contacts = fieldRow(first, 'Contacts');
    expect(
      within(within(contacts).getByRole('group', { name: 'Before' })).getByText(
        'No shared Contacts recorded.',
      ),
    ).toBeVisible();
    const after = within(contacts).getByRole('group', { name: 'After' });
    expect(within(after).getByText('Ana Demo')).toBeVisible();
    expect(within(after).getByText('ana.demo@example.test')).toBeVisible();
    expect(within(first).queryByText('Address')).not.toBeInTheDocument();

    expect(second).toHaveTextContent('Corrected by Director B');
    const address = fieldRow(second, 'Address');
    expect(within(address).getByText('Not provided')).toBeVisible();
    expect(within(address).getByText('Str. Demo 1')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Show older corrections' }),
    ).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(
      within(history).queryByRole('list', {
        name: 'Corrections, newest first',
      }),
    ).not.toBeInTheDocument();
  });

  it('shows the empty state for a Client without corrections in this Company', async () => {
    renderDossier(() => page([]));
    const history = await expandHistory();
    expect(
      await within(history).findByText(
        'No corrections have been recorded for this Client in this Company.',
      ),
    ).toBeVisible();
  });

  it('keeps the dossier usable after a failed or malformed history response and retries on request', async () => {
    const responses = [
      () => respond({}, 503),
      () =>
        page([
          { ...newest, changes: { legalEntity: { before: null, after: 'X' } } },
        ]),
      () => page([newest]),
    ];
    renderDossier(() => {
      const next = responses.shift();
      if (!next) throw new Error('Unexpected history request.');
      return next();
    });
    const history = await expandHistory();
    expect(await within(history).findByRole('alert')).toHaveTextContent(
      'We could not load the correction history. The dossier remains available.',
    );
    expect(
      screen.getByRole('button', { name: 'Correct Client dossier' }),
    ).toBeEnabled();
    expect(
      screen.getByText('SICOM Demo SRL', { selector: 'h3' }),
    ).toBeVisible();

    fireEvent.click(
      within(history).getByRole('button', { name: 'Retry correction history' }),
    );
    expect(await within(history).findByRole('alert')).toBeVisible();
    expect(within(history).queryByText('X')).not.toBeInTheDocument();
    fireEvent.click(
      within(history).getByRole('button', { name: 'Retry correction history' }),
    );
    const [item] = await listedCorrections(history);
    expect(item).toHaveTextContent('Corrected by Director A');
    expect(within(history).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a retryable section error instead of an unreadable server time on any page', async () => {
    const unreadable = { ...oldest, occurredAt: 'not-a-date' };
    const responses = [
      () => page([{ ...newest, occurredAt: 'not-a-date' }]),
      () => page([newest], newest.id),
      () => page([unreadable]),
      () => page([oldest]),
    ];
    const requests = renderDossier(() => {
      const next = responses.shift();
      if (!next) throw new Error('Unexpected history request.');
      return next();
    });
    const history = await expandHistory();
    expect(await within(history).findByRole('alert')).toHaveTextContent(
      'We could not load the correction history. The dossier remains available.',
    );
    expect(
      screen.getByRole('heading', { name: dossier.displayName }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Correct Client dossier' }),
    ).toBeEnabled();

    fireEvent.click(
      within(history).getByRole('button', { name: 'Retry correction history' }),
    );
    const [first] = await listedCorrections(history);
    expect(
      within(first ?? history).getByText(
        formatApplicationDateTime(newest.occurredAt),
      ),
    ).toHaveAttribute('datetime', newest.occurredAt);

    fireEvent.click(
      within(history).getByRole('button', { name: 'Show older corrections' }),
    );
    expect(
      await within(history).findByText(
        'Older corrections could not be loaded. Try again.',
      ),
    ).toBeVisible();
    expect(await listedCorrections(history)).toHaveLength(1);
    expect(within(history).queryByText(/Director B/u)).not.toBeInTheDocument();

    fireEvent.click(
      within(history).getByRole('button', { name: 'Show older corrections' }),
    );
    await waitFor(async () =>
      expect(await listedCorrections(history)).toHaveLength(2),
    );
    const [, second] = await listedCorrections(history);
    expect(
      within(second ?? history).getByText(
        formatApplicationDateTime(oldest.occurredAt),
      ),
    ).toHaveAttribute('datetime', oldest.occurredAt);
    expect(requests).toEqual([
      expect.stringMatching(/correction-history$/u),
      expect.stringMatching(/correction-history$/u),
      expect.stringMatching(/correction-history\?cursor=correction-2$/u),
      expect.stringMatching(/correction-history\?cursor=correction-2$/u),
    ]);
  });

  it.each([403, 404])(
    'shows only a safe unavailable state for a %s history refusal',
    async (status) => {
      renderDossier(() => respond({}, status));
      const history = await expandHistory();
      expect(
        await within(history).findByText(
          'Correction history is not available with your current access.',
        ),
      ).toBeVisible();
      expect(within(history).queryByRole('list')).not.toBeInTheDocument();
      expect(within(history).queryByText(/\d/u)).not.toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: dossier.displayName }),
      ).toBeVisible();
    },
  );

  it('appends an older page only when explicitly requested', async () => {
    let olderAttempts = 0;
    const requests = renderDossier((path) => {
      if (!path.includes('?')) return page([newest], newest.id);
      olderAttempts += 1;
      return olderAttempts === 1 ? respond({}, 503) : page([oldest]);
    });
    const history = await expandHistory();
    expect(await listedCorrections(history)).toHaveLength(1);
    const older = within(history).getByRole('button', {
      name: 'Show older corrections',
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(requests).toHaveLength(1);

    fireEvent.click(older);
    expect(
      await within(history).findByText(
        'Older corrections could not be loaded. Try again.',
      ),
    ).toBeVisible();
    expect(await listedCorrections(history)).toHaveLength(1);
    fireEvent.click(
      within(history).getByRole('button', { name: 'Show older corrections' }),
    );
    await waitFor(async () =>
      expect(await listedCorrections(history)).toHaveLength(2),
    );
    const [first, second] = await listedCorrections(history);
    expect(first).toHaveTextContent('Director A');
    expect(second).toHaveTextContent('Director B');
    expect(requests.slice(1)).toEqual([
      expect.stringMatching(/correction-history\?cursor=correction-2$/u),
      expect.stringMatching(/correction-history\?cursor=correction-2$/u),
    ]);
    expect(
      within(history).queryByRole('button', { name: 'Show older corrections' }),
    ).not.toBeInTheDocument();
    expect(
      within(history).queryByText(
        'Older corrections could not be loaded. Try again.',
      ),
    ).not.toBeInTheDocument();
  });

  it('reloads the open section from the first page after a successful correction', async () => {
    const telephoneCorrection = {
      id: 'correction-3',
      occurredAt: '2026-09-24T10:00:00.000Z',
      actor: { displayName: 'Director' },
      changes: { telephone: { before: null, after: '+373 60 000 348' } },
    };
    const responses = [
      () => page([newest], newest.id),
      () => page([telephoneCorrection, newest], newest.id),
    ];
    const requests: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = input.toString();
        if (path.includes('/correction-history')) {
          requests.push(path);
          const next = responses.shift();
          if (!next) throw new Error('Unexpected history request.');
          return next();
        }
        if (init?.method === 'PATCH')
          return respond({
            ...dossier,
            telephone: '+373 60 000 348',
            version: 4,
          });
        if (path.endsWith('/clients/client-one')) return respond(dossier);
        if (path.endsWith('/legal-entities'))
          return respond({ clientVersion: 1, legalEntities: [] });
        throw new Error('Unexpected API request: ' + path);
      }),
    );
    render(
      <ApplicationPresentation value="prisme">
        <ClientDossierPanel
          clientAccountId={dossier.id}
          companyContextId={companyA.id}
          canUpdate
          identity={deterministicBrowserIdentity()}
          onCompanyContextRejected={() => undefined}
          onActivityRecorded={async () => undefined}
          onClientsChanged={async () => undefined}
        />
      </ApplicationPresentation>,
    );
    const history = await expandHistory();
    expect(await listedCorrections(history)).toHaveLength(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'Correct Client dossier' }),
    );
    const form = screen.getByRole('form', { name: 'Correct Client dossier' });
    fireEvent.change(within(form).getByLabelText('Telephone'), {
      target: { value: '+373 60 000 348' },
    });
    fireEvent.click(
      within(form).getByRole('button', { name: 'Save correction' }),
    );
    await screen.findByText('Version 4');
    await waitFor(async () =>
      expect(await listedCorrections(history)).toHaveLength(2),
    );
    const [first] = await listedCorrections(history);
    expect(first).toHaveTextContent('Corrected by Director');
    expect(within(first ?? history).getByText('+373 60 000 348')).toBeVisible();
    expect(requests).toEqual([
      expect.stringMatching(/correction-history$/u),
      expect.stringMatching(/correction-history$/u),
    ]);
    expect(
      screen.getByRole('button', { name: 'Hide correction history' }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('never renders a previous Client response and clears the section on a Company switch', async () => {
    let actor = directorActor();
    let release: ((response: Response) => void) | undefined;
    let pendingSignal: AbortSignal | null | undefined;
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
        if (path.endsWith('/union-history')) return respond([]);
        if (path.endsWith('/clients')) return respond([dossier, otherDossier]);
        if (path.endsWith(historyPath)) {
          if (release) return page([newest]);
          pendingSignal = init?.signal;
          return new Promise<Response>((resolve) => {
            release = resolve;
          });
        }
        if (path.endsWith('/clients/client-one')) return respond(dossier);
        if (path.endsWith('/clients/client-two')) return respond(otherDossier);
        if (path.endsWith('/legal-entities'))
          return respond({ clientVersion: 1, legalEntities: [] });
        throw new Error('Unexpected API request: ' + path);
      }),
    );
    render(<App identity={deterministicBrowserIdentity()} />);
    await openDossier(dossier.displayName);
    await expandHistory();
    await waitFor(() => expect(release).toBeDefined());
    await openDossier(otherDossier.displayName);
    await waitFor(() => expect(pendingSignal?.aborted).toBe(true));
    await act(async () => {
      release?.(page([{ ...newest, actor: { displayName: 'Late Director' } }]));
    });
    expect(screen.queryByText(/Late Director/u)).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Show correction history' }),
    ).toHaveAttribute('aria-expanded', 'false');

    await openDossier(dossier.displayName);
    const history = await expandHistory();
    expect(await listedCorrections(history)).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Active Company', { exact: true }), {
      target: { value: companyB.id },
    });
    await screen.findByText('Clients in Company B');
    expect(screen.queryByText(/Corrected by/u)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Correction history' }),
    ).not.toBeInTheDocument();
  });
});

async function openDossier(client: string) {
  const heading = await screen.findByRole('heading', { name: client });
  const row = heading.closest('li');
  if (!row) throw new Error('Expected the Client directory row');
  fireEvent.click(within(row).getByRole('button', { name: 'Open dossier' }));
  await screen.findByRole('heading', { name: client, level: 3 });
}
