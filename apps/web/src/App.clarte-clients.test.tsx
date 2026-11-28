import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import {
  bakeryClient,
  createClarteClientsApi,
  orchardClient,
  orchardDocument,
  orchardProject,
  orchardRequest,
  orchardTask,
  registeredClient,
  sharedClient,
  type ClientsApiOptions,
} from './clarte/clients/clarte-clients.test-fixture';
import { interfaceLocaleStorageKey } from './localization/interface-locale';
import { renderInInterface } from './test/app-interface';
import { showDossierView } from './test/client-interface';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';
import { changeValue } from './test/select-option';

function serve(options: ClientsApiOptions = {}) {
  const api = createClarteClientsApi(options);
  const bodies: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input.toString(), window.location.origin);
      const body =
        typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      if (body !== undefined) bodies.push(body);
      const reply = api.reply({
        method: init?.method ?? 'GET',
        url,
        body,
        companyId: new Headers(init?.headers).get('x-company-context-id'),
      });
      return Response.json(reply.json, { status: reply.status });
    }),
  );
  return { api, bodies };
}

function openClients() {
  window.history.replaceState(null, '', '/#clients');
  renderInInterface(
    'clarte',
    <App identity={deterministicBrowserIdentity()} />,
  );
}

function directory() {
  return screen.getByRole('region', { name: 'Clients in PRISMA-PRIM' });
}

async function card(displayName: string) {
  const region = await screen.findByRole('region', {
    name: 'Clients in PRISMA-PRIM',
  });
  const heading = await within(region).findByRole('heading', {
    name: displayName,
  });
  const item = heading.closest('li');
  if (!item) throw new Error(`Expected the card of ${displayName}`);
  return item;
}

async function openDossier(displayName: string) {
  fireEvent.click(
    within(await card(displayName)).getByRole('button', {
      name: 'Open dossier',
    }),
  );
  return screen.findByRole('region', { name: displayName });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  // jsdom implements no scrolling; the browser journey proves it.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('Clarté Clients directory', () => {
  it('registers a Client with a Contact from the side panel, lists it and opens its dossier', async () => {
    const { bodies } = serve();
    openClients();
    expect(await card(orchardClient.displayName)).toHaveTextContent(
      'Available in PRISMA-PRIM',
    );
    expect(await card(bakeryClient.displayName)).toBeVisible();

    const trigger = within(directory()).getByRole('button', {
      name: 'New Client',
    });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const panel = screen.getByRole('dialog', { name: 'Register a Client' });
    expect(within(panel).getByLabelText('Client display name')).toHaveFocus();
    changeValue(
      within(panel).getByLabelText('Client display name'),
      registeredClient.displayName,
    );
    changeValue(
      within(panel).getByLabelText('IDNO / tax code'),
      '1018600099887',
    );
    fireEvent.click(within(panel).getByRole('button', { name: 'Add Contact' }));
    changeValue(
      within(
        within(panel).getByRole('group', { name: 'Contact 1' }),
      ).getByLabelText('Contact name'),
      'Elena Gavriliță',
    );
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Create Client' }),
    );

    expect(
      await screen.findByText(
        'Client created and linked to the active Company.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('dialog', { name: 'Register a Client' }),
    ).not.toBeInTheDocument();
    expect(bodies).toContainEqual({
      displayName: registeredClient.displayName,
      taxId: '1018600099887',
      contacts: [{ name: 'Elena Gavriliță' }],
    });
    const dossier = await openDossier(registeredClient.displayName);
    const heading = within(dossier).getByRole('heading', {
      level: 2,
      name: registeredClient.displayName,
    });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(within(dossier).getByText('Version 1')).toBeVisible();
  });

  it('keeps a registration draft when the panel closes and reopens', async () => {
    serve();
    openClients();
    await card(orchardClient.displayName);
    fireEvent.click(screen.getByRole('button', { name: 'New Client' }));
    changeValue(screen.getByLabelText('Client display name'), 'Draft SRL');
    fireEvent.click(
      within(
        screen.getByRole('dialog', { name: 'Register a Client' }),
      ).getByRole('button', { name: 'Close registration' }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New Client' }));
    expect(screen.getByLabelText('Client display name')).toHaveValue(
      'Draft SRL',
    );
  });

  it('searches the Workspace and adds a shared Client to the active Company', async () => {
    const { api } = serve();
    openClients();
    await card(orchardClient.displayName);
    changeValue(
      screen.getByRole('searchbox', { name: 'Find a shared Client' }),
      'Prut',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Search Clients' }));
    const results = await screen.findByRole('region', {
      name: 'Search results',
    });
    const shared = within(results)
      .getByRole('heading', { name: sharedClient.displayName })
      .closest('li');
    if (!shared) throw new Error('Expected the shared Client card');
    expect(shared).toHaveTextContent('Not yet linked to PRISMA-PRIM');
    fireEvent.click(
      within(shared).getByRole('button', { name: 'Add to PRISMA-PRIM' }),
    );
    await waitFor(() =>
      expect(shared).toHaveTextContent('Available in PRISMA-PRIM'),
    );
    expect(api.writes).toContain(
      `PUT /api/clients/${sharedClient.id}/active-company-relationship`,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Back to Company Clients' }),
    );
    expect(await card(sharedClient.displayName)).toBeVisible();
  });

  it('filters the Company’s Clients as the member types and opens a dossier from its card', async () => {
    const { api } = serve();
    openClients();
    await card(orchardClient.displayName);
    expect(screen.getByText('2 Clients shown')).toBeVisible();
    const field = screen.getByRole('searchbox', {
      name: 'Find a shared Client',
    });
    changeValue(field, 'bákery');
    expect(
      within(directory()).queryByRole('heading', {
        name: orchardClient.displayName,
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('1 Client shown')).toBeVisible();
    changeValue(field, 'Nowhere');
    expect(
      screen.getByText('No Client of PRISMA-PRIM matches “Nowhere”.'),
    ).toBeVisible();
    expect(api.requests.filter((line) => line.includes('/search'))).toEqual([]);
    changeValue(field, '');
    fireEvent.click(
      within(await card(bakeryClient.displayName)).getByRole('heading', {
        name: bakeryClient.displayName,
      }),
    );
    expect(
      await screen.findByRole('region', { name: bakeryClient.displayName }),
    ).toBeVisible();
  });

  it('says so when the Company has no Client yet', async () => {
    serve({ empty: true });
    openClients();
    expect(
      await screen.findByText('No Clients for PRISMA-PRIM yet.'),
    ).toBeVisible();
  });

  it('offers a retry when the directory cannot be read', async () => {
    const { api } = serve({ listStatus: 503 });
    openClients();
    const message = await screen.findByText(
      'We could not load Clients. Please try again.',
    );
    const failure = message.closest('[role="alert"]');
    if (!(failure instanceof HTMLElement))
      throw new Error('Expected the directory failure alert');
    const reads = api.requests.filter((line) => line === 'GET /api/clients');
    fireEvent.click(within(failure).getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(
        api.requests.filter((line) => line === 'GET /api/clients'),
      ).toHaveLength(reads.length + 1),
    );
  });
});

describe('Clarté Client dossier', () => {
  it('shows the identity, legal entities and status, then each view of the dossier', async () => {
    serve();
    openClients();
    const dossier = await openDossier(orchardClient.displayName);
    expect(within(dossier).getByText('Available in PRISMA-PRIM')).toBeVisible();
    expect(
      within(dossier).getByText('IDNO / tax code 1018600012345'),
    ).toBeVisible();
    expect(
      await within(dossier).findByText('1 legal entity or branch'),
    ).toBeVisible();
    expect(within(dossier).getByText('Version 3')).toBeVisible();
    const record = within(dossier).getByRole('region', {
      name: 'Shared details',
    });
    expect(record).toHaveTextContent('1018600012345');
    expect(record).toHaveTextContent('Fruit growing and storage');

    await showDossierView('clarte', 'Contacts');
    const contacts = within(dossier).getByRole('region', { name: 'Contacts' });
    expect(record).not.toBeVisible();
    expect(contacts).toHaveTextContent('Elena Rusu');
    expect(contacts).toHaveTextContent('Quality manager');
    expect(contacts).toHaveTextContent('Final decision-maker');
    expect(contacts).toHaveTextContent('Romanian, by email before 10:00');

    await showDossierView('clarte', 'Legal entities and branches');
    expect(
      within(dossier).getByRole('region', {
        name: 'Legal entities and branches',
      }),
    ).toHaveTextContent('Codru Orchards SRL — Orhei branch');

    await showDossierView('clarte', 'History');
    fireEvent.click(
      within(dossier).getByRole('button', { name: 'Show correction history' }),
    );
    expect(
      await within(dossier).findByText('str. Livezilor 10, Orhei'),
    ).toBeVisible();
    expect(
      within(dossier).getByRole('button', { name: 'Union history' }),
    ).toBeVisible();

    fireEvent.click(
      within(dossier).getByRole('button', { name: 'Back to Clients' }),
    );
    expect(directory()).toBeVisible();
  });

  it('corrects the shared record and its Contacts from the side panel', async () => {
    const { bodies } = serve();
    openClients();
    const dossier = await openDossier(orchardClient.displayName);
    await showDossierView('clarte', 'Contacts');
    fireEvent.click(
      within(dossier).getByRole('button', { name: 'Edit Contacts' }),
    );
    const form = screen.getByRole('form', { name: 'Correct Client dossier' });
    changeValue(within(form).getByLabelText('Telephone'), '+373 235 20 199');
    fireEvent.click(
      within(form).getByRole('button', { name: 'Save correction' }),
    );
    expect(
      await screen.findByText(
        'Client correction saved with attributable history.',
      ),
    ).toBeVisible();
    expect(await within(dossier).findByText('Version 4')).toBeVisible();
    expect(bodies).toContainEqual(
      expect.objectContaining({
        expectedVersion: 3,
        telephone: '+373 235 20 199',
      }),
    );
  });

  it('lists the Client’s commercial matters and opens one Request in its deal', async () => {
    serve();
    openClients();
    const dossier = await openDossier(orchardClient.displayName);
    await showDossierView('clarte', 'Deals');
    const commercial = await within(dossier).findByRole('region', {
      name: 'Commercial affairs',
    });
    fireEvent.click(
      await within(commercial).findByRole('button', {
        name: `Open Request: ${orchardRequest.subject}`,
      }),
    );
    expect(
      await screen.findByRole('heading', {
        name: orchardRequest.initialOpportunity.title,
      }),
    ).toBeVisible();
    expect(window.location.hash).toBe('#requests');
  });

  it('shows only the Client’s deals from its dossier and lifts the restriction', async () => {
    serve();
    openClients();
    const dossier = await openDossier(orchardClient.displayName);
    await showDossierView('clarte', 'Deals');
    fireEvent.click(
      within(dossier).getByRole('button', { name: 'Open Client Requests' }),
    );
    const restriction = await screen.findByText(
      `Deals of the Client ${orchardClient.displayName}`,
    );
    await waitFor(() => expect(restriction).toBeVisible());
    expect(
      screen.getByRole('button', {
        name: orchardRequest.initialOpportunity.title,
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'HACCP training' }),
    ).not.toBeInTheDocument();
    const show = screen.getByRole('button', { name: 'Show all deals' });
    fireEvent.click(show);
    await waitFor(() =>
      expect(
        screen.queryByText(`Deals of the Client ${orchardClient.displayName}`),
      ).not.toBeInTheDocument(),
    );
  });

  it('shows the Client’s Projects with their Tasks and its Documents', async () => {
    serve();
    openClients();
    const dossier = await openDossier(orchardClient.displayName);
    await showDossierView('clarte', 'Missions');
    const missions = await within(dossier).findByRole('region', {
      name: 'Client missions',
    });
    expect(
      await within(missions).findByText(orchardProject.title),
    ).toBeVisible();
    fireEvent.click(
      within(missions).getByRole('button', {
        name: `View Tasks: ${orchardProject.title}`,
      }),
    );
    expect(await within(missions).findByText(orchardTask.title)).toBeVisible();
    await showDossierView('clarte', 'Documents');
    const documents = await within(dossier).findByRole('region', {
      name: 'Client Documents',
    });
    expect(
      await within(documents).findByText(orchardDocument.title),
    ).toBeVisible();
    expect(
      within(dossier).getByRole('button', {
        name: 'Open Client working Documents',
      }),
    ).toBeVisible();
  });

  it('compares and confirms a union, opens the canonical record from its history and undoes it', async () => {
    const { api } = serve();
    openClients();
    const dossier = await openDossier(orchardClient.displayName);
    await showDossierView('clarte', 'History');
    fireEvent.click(
      within(dossier).getByRole('button', {
        name: 'Review existing duplicates',
      }),
    );
    const form = await screen.findByRole('form', { name: 'Confirm union' });
    for (const select of within(form).getAllByRole('combobox'))
      changeValue(select, bakeryClient.id);
    changeValue(
      within(form).getByLabelText('Reason for this union'),
      'Same legal identity, registered twice.',
    );
    for (const checkbox of within(form).getAllByRole('checkbox'))
      fireEvent.click(checkbox);
    await act(async () => {
      fireEvent.submit(form);
    });
    const canonical = await screen.findByRole('region', {
      name: bakeryClient.displayName,
    });
    expect(
      await screen.findByText(
        'Union confirmed. The canonical dossier is now available in the affected Companies.',
      ),
    ).toBeVisible();
    expect(api.isUnited()).toBe(true);

    await showDossierView('clarte', 'History');
    fireEvent.click(
      within(canonical).getByRole('button', { name: 'Union history' }),
    );
    fireEvent.click(
      await within(canonical).findByRole('button', {
        name: 'View authorized union details',
      }),
    );
    fireEvent.click(
      await within(canonical).findByRole('button', {
        name: 'Open canonical Client dossier',
      }),
    );
    expect(
      await within(canonical).findByRole('region', { name: 'Shared details' }),
    ).toBeVisible();

    await showDossierView('clarte', 'History');
    fireEvent.click(
      within(canonical).getByRole('button', { name: 'Union history' }),
    );
    fireEvent.click(
      await within(canonical).findByRole('button', {
        name: 'View authorized union details',
      }),
    );
    const reversal = await within(canonical).findByRole('form', {
      name: 'Reverse union',
    });
    changeValue(
      within(reversal).getByLabelText('Reason for reversal'),
      'Registered as two Clients on purpose.',
    );
    fireEvent.click(within(reversal).getByRole('checkbox'));
    fireEvent.click(
      within(reversal).getByRole('button', { name: 'Reverse union' }),
    );
    expect(
      await within(canonical).findByText(/^Union reversed\./u),
    ).toBeVisible();
    expect(api.isUnited()).toBe(false);
  });

  it.each([
    [404, 'The Client dossier is not available in this Company.'],
    [503, 'We could not load this Client dossier. Please try again.'],
  ] as const)(
    'shows the loading and then the %s state of a dossier with the way back',
    async (status, message) => {
      serve({ dossierStatus: status });
      openClients();
      fireEvent.click(
        within(await card(orchardClient.displayName)).getByRole('button', {
          name: 'Open dossier',
        }),
      );
      expect(screen.getByText('Loading Client dossier…')).toBeVisible();
      expect(await screen.findByText(message)).toBeVisible();
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Back to Clients' }));
      expect(await card(orchardClient.displayName)).toBeVisible();
    },
  );

  it('names the dossier views in the chosen interface language', async () => {
    serve();
    localStorage.setItem(interfaceLocaleStorageKey, 'ro');
    window.history.replaceState(null, '', '/#clients');
    renderInInterface(
      'clarte',
      <App identity={deterministicBrowserIdentity()} />,
    );
    // The test render sets English; Clarté's user menu changes the language.
    fireEvent.click(await screen.findByRole('button', { name: 'User menu' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Română' }));
    const heading = await screen.findByRole('heading', {
      name: orchardClient.displayName,
    });
    const item = heading.closest('li');
    if (!item) throw new Error('Expected the Client card');
    fireEvent.click(
      within(item).getByRole('button', { name: 'Deschide dosarul' }),
    );
    const views = await screen.findByRole('tablist', {
      name: 'Secțiunile dosarului Clientului',
    });
    expect(
      within(views)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual([
      'Prezentare',
      'Contacte',
      'Entități juridice și sucursale',
      'Afaceri',
      'Misiuni',
      'Documente',
      'Istoric',
    ]);
  });
});
