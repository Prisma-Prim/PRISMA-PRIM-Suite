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
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
} from './localization/interface-locale';
import { changeValue } from './test/select-option';
import { InterfaceLocaleSelect } from './localization/InterfaceLocaleSelect';
import {
  confirmationActor,
  confirmationCompanies,
  confirmationFirst,
  confirmationCanonical,
  confirmationDossier,
  confirmationSecond,
  confirmationPair,
  confirmationReason,
  confirmationLocaleCases,
} from './test/client-union-confirmation-localization.fixture';

const [companyA, companyB] = confirmationCompanies;
const first = confirmationFirst;
const second = confirmationSecond;
function resolverActor(): ActorContext {
  return { ...confirmationActor };
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
    requests: string[];
    confirmations: {
      path: string;
      company: string | null;
      body: string;
      key: string | null;
    }[];
    confirm: ((init?: RequestInit) => Promise<Response>) | undefined;
    review: ((init?: RequestInit) => Promise<Response>) | undefined;
  } = {
    actor: resolverActor(),
    united: false,
    activityReads: 0,
    clientReads: 0,
    requests: [],
    confirmations: [],
    confirm: undefined,
    review: undefined,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = input.toString();
      state.requests.push(path);
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
          (state.united ? [confirmationCanonical] : [first, second]).map(
            (client) => ({
              ...client,
              relatedToActiveCompany: true,
            }),
          ),
        );
      }
      if (path.endsWith('/union-reviews'))
        return state.review
          ? state.review(init)
          : respond(confirmationPair, 201);
      if (path.endsWith('/confirm')) {
        if (typeof init?.body !== 'string')
          throw new Error('Expected existing serialized command');
        state.confirmations.push({
          path,
          company: new Headers(init.headers).get('x-company-context-id'),
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
            projectionReference: 'projection-716',
          },
          201,
        );
      }
      const clientId = [first.id, second.id].find((id) =>
        path.endsWith('/clients/' + id),
      );
      const client = clientId
        ? confirmationDossier({ clientId, united: state.united })
        : undefined;
      if (client)
        return respond({
          ...client,
          relatedToActiveCompany: true,
          involvedCompanyDisplayNames: confirmationCompanies.map(
            ({ displayName }) => displayName,
          ),
        });
      const legalClientId = [first.id, second.id].find((id) =>
        path.endsWith('/clients/' + id + '/legal-entities'),
      );
      const legalDossier = legalClientId
        ? confirmationDossier({ clientId: legalClientId, united: state.united })
        : undefined;
      if (legalDossier)
        return respond({
          clientVersion: legalDossier.version,
          legalEntities: [],
        });
      throw new Error('Unexpected API request: ' + path);
    }),
  );
  return state;
}

function deferredResponse() {
  let complete: (value: Response) => void = () => {
    throw new Error('Deferred response not initialized');
  };
  const promise = new Promise<Response>((resolve) => {
    complete = resolve;
  });
  return { promise, complete };
}

const literalReason = confirmationReason;

describe('Client union confirmation interface localization through App', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(interfaceLocaleStorageKey, 'en');
    window.history.replaceState(null, '', '/?frame=prisme#clients');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.history.replaceState(null, '', '/');
  });

  it('keeps second-canonical mixed-source intent through locale changes, pending uncertainty and exact retry with truthful localized completion', async () => {
    const state = installTransport();
    const firstReply = deferredResponse();
    const retryReply = deferredResponse();
    state.confirm = () =>
      state.confirmations.length === 1
        ? firstReply.promise
        : retryReply.promise;
    render(
      <InterfaceLocaleProvider>
        <InterfaceLocaleSelect />
        <App identity={deterministicBrowserIdentity()} />
      </InterfaceLocaleProvider>,
    );
    const [open] = await screen.findAllByRole('button', {
      name: 'Open dossier',
    });
    if (!open) throw new Error('Expected readable first Client');
    fireEvent.click(open);
    await screen.findByText(confirmationLocaleCases.en.legalEmpty);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Review existing duplicates' }),
    );
    const form = await screen.findByRole('form', { name: 'Confirm union' });
    const heading = screen.getByRole('heading', {
      name: 'Compare the two existing Clients',
    });
    const selectors = within(form).getAllByRole('combobox');
    expect(selectors).toHaveLength(7);
    for (const selector of selectors)
      expect(selector).toHaveTextContent('Choose a source');
    const canonical = within(form).getByLabelText('Canonical Client dossier');
    changeValue(canonical, second.id);
    const sources = [
      ['Client display name', first.id],
      ['IDNO / tax code', second.id],
      ['Address', first.id],
      ['Telephone', second.id],
      ['General email', first.id],
      ['Business activity', second.id],
    ];
    for (const [label, source] of sources) {
      if (!label || !source) throw new Error('Expected explicit source choice');
      changeValue(within(form).getByLabelText(label, { exact: true }), source);
    }
    const reason = within(form).getByRole('textbox', {
      name: 'Reason for this union',
    });
    changeValue(reason, literalReason);
    const acknowledgements = within(form).getAllByRole('checkbox');
    expect(acknowledgements).toHaveLength(2);
    for (const checkbox of acknowledgements) fireEvent.click(checkbox);
    expect(within(form).getAllByText('Not provided').length).toBeGreaterThan(0);
    const language = screen.getByRole('combobox', {
      name: 'Interface language',
    });
    language.focus();
    const requestsBeforeLocale = [...state.requests];
    changeValue(language, 'ro');
    expect(document.documentElement.lang).toBe('ro');
    expect(state.requests).toEqual(requestsBeforeLocale);
    expect(state.confirmations).toHaveLength(0);
    expect(screen.getByRole('combobox', { name: 'Limba interfeței' })).toBe(
      language,
    );
    expect(language).toHaveFocus();
    expect(form).toBeInTheDocument();
    expect(heading).toBeInTheDocument();
    expect(within(form).getAllByRole('combobox')).toEqual(selectors);
    expect(reason).toHaveValue(literalReason);
    for (const checkbox of acknowledgements) expect(checkbox).toBeChecked();
    // Independent translation oracles: existing English-only owner must fail here.
    expect.soft(heading).toHaveTextContent('Compară cei doi Clienți existenți');
    expect.soft(form).toHaveAccessibleName('Confirmă unirea');
    expect
      .soft(canonical)
      .toHaveAccessibleName('Dosarul canonic al Clientului');
    expect.soft(reason).toHaveAccessibleName('Motivul acestei uniri');
    expect.soft(form).toHaveTextContent('Valoarea de păstrat din Sursa 1');
    expect.soft(form).toHaveTextContent('Nefurnizat');

    fireEvent.submit(form);
    await waitFor(() => expect(state.confirmations).toHaveLength(1));
    const originalCommand = state.confirmations[0];
    if (!originalCommand)
      throw new Error('Expected captured explicit union command');
    expect(originalCommand.path).toContain(
      '/client-union-reviews/review-716/confirm',
    );
    expect(originalCommand.company).toBe(companyA.id);
    expect(originalCommand.key).toBeTruthy();
    expect(JSON.parse(originalCommand.body)).toEqual({
      canonicalClientId: second.id,
      fields: {
        displayName: first.id,
        taxId: second.id,
        address: first.id,
        telephone: second.id,
        generalEmail: first.id,
        businessActivity: second.id,
      },
      reason: literalReason,
      reviewedDifferences: true,
      companyIds: [companyA.id, companyB.id],
    });
    const pendingRequests = [...state.requests];
    changeValue(language, 'en');
    expect(state.requests).toEqual(pendingRequests);
    expect(form).toBeInTheDocument();
    expect(reason).toHaveValue(literalReason);
    expect(
      within(form).getByRole('button', { name: 'Saving…' }),
    ).toBeDisabled();
    await act(async () => firstReply.complete(respond({}, 503)));
    await screen.findByText(
      'The request could not be completed. You can retry safely.',
    );
    changeValue(language, 'ro');
    expect(state.requests).toEqual(pendingRequests);
    expect(state.confirmations).toHaveLength(1);
    expect
      .soft(form)
      .toHaveTextContent(
        'Nu s-a primit nicio confirmare. Alegerile și motivul sunt păstrate.',
      );
    expect(reason).toHaveValue(literalReason);
    for (const checkbox of acknowledgements) expect(checkbox).toBeChecked();
    fireEvent.submit(form);
    await waitFor(() => expect(state.confirmations).toHaveLength(2));
    expect(state.confirmations[1]).toEqual(originalCommand);
    state.united = true;
    await act(async () =>
      retryReply.complete(
        respond(
          {
            outcome: 'united',
            canonicalClientId: second.id,
            projectionReference: 'projection-716',
          },
          201,
        ),
      ),
    );
    const dossier = await screen.findByRole('region', {
      name: confirmationCanonical.displayName,
    });
    expect(
      within(dossier).getByRole('heading', {
        name: confirmationCanonical.displayName,
      }),
    ).toBeInTheDocument();
    await within(dossier).findByText(confirmationLocaleCases.ro.legalEmpty);
    expect(form).not.toBeInTheDocument();
    expect
      .soft(
        screen.queryByText(
          'Unirea a fost confirmată. Dosarul canonic este acum disponibil în Companiile implicate.',
        ),
      )
      .toBeInTheDocument();
    expect(state.clientReads).toBeGreaterThan(1);
    expect(state.activityReads).toBeGreaterThan(1);
    const completedRequests = [...state.requests];
    changeValue(language, 'en');
    expect(state.requests).toEqual(completedRequests);
    expect(
      screen.getByText(
        'Union confirmed. The canonical dossier is now available in the affected Companies.',
      ),
    ).toBeInTheDocument();
  });
});

for (const copy of Object.values(confirmationLocaleCases)) {
  it(`localizes saved comparison values, attempted validation, late feedback and canonical completion in ${copy.code}`, async () => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(interfaceLocaleStorageKey, 'en');
    window.history.replaceState(null, '', '/?frame=prisme#clients');
    try {
      const state = installTransport();
      const reply = deferredResponse();
      state.confirm = () => reply.promise;
      render(
        <InterfaceLocaleProvider>
          <InterfaceLocaleSelect />
          <App identity={deterministicBrowserIdentity()} />
        </InterfaceLocaleProvider>,
      );
      const [open] = await screen.findAllByRole('button', {
        name: 'Open dossier',
      });
      if (!open) throw new Error('Expected first readable dossier');
      fireEvent.click(open);
      await screen.findByText(confirmationLocaleCases.en.legalEmpty);
      fireEvent.click(
        await screen.findByRole('button', {
          name: 'Review existing duplicates',
        }),
      );
      const form = await screen.findByRole('form', { name: 'Confirm union' });
      fireEvent.submit(form);
      const controls = within(form).getAllByRole('combobox');
      const reason = within(form).getByRole('textbox');
      const language = screen.getByRole('combobox', {
        name: 'Interface language',
      });
      const requests = [...state.requests];
      changeValue(language, copy.code);
      expect(state.requests).toEqual(requests);
      expect(form).toHaveAccessibleName(copy.confirm);
      expect(within(form).getByRole('alert')).toHaveTextContent(
        copy.incomplete,
      );
      expect(reason).toHaveAttribute('aria-invalid', 'true');
      expect(reason).toHaveAccessibleName(copy.reason);
      expect(within(form).getAllByRole('combobox')).toEqual(controls);
      const comparison = screen.getByRole('region', { name: copy.compare });
      const articles = within(comparison).getAllByRole('article');
      expect(articles).toHaveLength(2);
      expect(articles[0]).toHaveAccessibleName(
        `${copy.source} 1 · ${first.displayName}`,
      );
      expect(articles[1]).toHaveAccessibleName(
        `${copy.source} 2 · ${second.displayName}`,
      );
      expect(comparison).toHaveTextContent(copy.version, {
        normalizeWhitespace: false,
      });
      expect(comparison).toHaveTextContent(copy.count);
      expect(comparison).toHaveTextContent(copy.roles);
      expect(comparison).toHaveTextContent(copy.contactSource);
      for (const caption of copy.contacts)
        expect(comparison).toHaveTextContent(caption);
      for (const label of copy.fields)
        expect(
          within(form).getByLabelText(label, { exact: true }),
        ).toHaveAttribute('aria-invalid', 'true');
      expect(
        within(comparison).getByRole('region', { name: copy.companies }),
      ).toHaveTextContent(companyB.displayName);
      const canonical = within(form).getByLabelText(copy.canonical);
      changeValue(canonical, second.id);
      for (const [index, label] of copy.fields.entries())
        changeValue(
          within(form).getByLabelText(label, { exact: true }),
          index % 2 === 0 ? first.id : second.id,
        );
      changeValue(reason, literalReason);
      for (const checkbox of within(form).getAllByRole('checkbox'))
        fireEvent.click(checkbox);
      expect(form).toHaveTextContent(copy.retained);
      expect(form).toHaveTextContent(copy.absent);
      fireEvent.submit(form);
      await waitFor(() => expect(state.confirmations).toHaveLength(1));
      const pendingRequests = [...state.requests];
      const alternate =
        copy.code === 'ro'
          ? confirmationLocaleCases.fr
          : confirmationLocaleCases.ro;
      changeValue(language, alternate.code);
      expect(state.requests).toEqual(pendingRequests);
      expect(
        within(form).getByRole('button', { name: alternate.pending }),
      ).toBeDisabled();
      await act(async () => reply.complete(respond({}, 503)));
      await screen.findByText(alternate.error);
      expect(form).toHaveTextContent(alternate.uncertain);
      changeValue(language, copy.code);
      expect(state.requests).toEqual(pendingRequests);
      expect(form).toHaveTextContent(copy.uncertain);
      expect(reason).toHaveValue(literalReason);
      state.confirm = undefined;
      fireEvent.submit(form);
      await waitFor(() => expect(state.confirmations).toHaveLength(2));
      expect(state.confirmations[1]).toEqual(state.confirmations[0]);
      const dossier = await screen.findByRole('region', {
        name: confirmationCanonical.displayName,
      });
      expect(
        within(dossier).getByRole('heading', {
          name: confirmationCanonical.displayName,
        }),
      ).toBeInTheDocument();
      await within(dossier).findByText(copy.legalEmpty);
      expect(screen.getByText(copy.saved)).toBeInTheDocument();
      expect(form).not.toBeInTheDocument();
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
      window.history.replaceState(null, '', '/');
    }
  });
}
