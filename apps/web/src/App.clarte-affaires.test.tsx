import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import type { ActorContext } from './access-types';
import { companyGrants } from './access/company-grants.test-fixture';
import type { AffaireStageView } from './clarte/affaires/affaire-response';
import type { ClientRequest } from './commercial-intake/CommercialIntakeWorkspace';
import { affaireDetailFor, affaireSummaryFor } from './test/affaire-responses';
import { renderInInterface } from './test/app-interface';
import {
  buildClientRequest,
  buildOutcomeHistoryEntry,
  buildStageHistoryEntry,
} from './test/commercial-intake-responses';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';
import { changeValue } from './test/select-option';

// Fictional Company, members, Clients and affaires only.
const company = { id: 'company-affaires', displayName: 'Fictional Company' };
const ada = { workspaceMembershipId: 'member-ada', displayName: 'Ada Ionescu' };
const ion = { workspaceMembershipId: 'member-ion', displayName: 'Ion Popa' };
const negotiation = { id: 'stage-negotiation', label: 'Negotiation' };

function actor(bundles: 'commercial' | 'reader' = 'commercial'): ActorContext {
  return {
    internalUserId: 'user-ada',
    workspaceMembershipId: ada.workspaceMembershipId,
    workspaceId: 'workspace-affaires',
    workspaceName: 'Fictional Workspace',
    displayName: ada.displayName,
    email: 'ada@example.test',
    active: true,
    workspacePermissions: [],
    activeCompany: {
      ...company,
      grants: companyGrants(
        {
          bundle: 'company_director_client_access',
          version: 'v1',
          assignmentId: 'client-access',
        },
        {
          bundle: 'company_commercial_intake',
          version: bundles === 'commercial' ? 'v4' : 'v1',
          assignmentId: 'intake',
        },
        ...(bundles === 'commercial'
          ? [
              {
                bundle: 'company_opportunity_manager',
                version: 'v2',
                assignmentId: 'manager',
              } as const,
            ]
          : []),
      ),
    },
  };
}

function affaireRequest(
  key: string,
  title: string,
  owner: typeof ada,
  capturedAt: string,
  client?: string,
): ClientRequest {
  return buildClientRequest({
    id: `request-${key}`,
    companyId: company.id,
    subject: `${title} request`,
    originalText: `Fictional evidence of ${title}.`,
    sourceLabel: 'Telephone note',
    capturedAt,
    ...(client
      ? {
          clientAssociationStatus: 'visible',
          clientReference: {
            originalClientId: `client-${key}`,
            currentClientId: `client-${key}`,
            displayName: client,
          },
        }
      : {}),
    initialOpportunity: {
      id: `opportunity-${key}`,
      title,
      nextAction: 'Call the Client',
      responsibleActor: owner,
    },
  });
}

// The stage rule's markers for an affaire at the Offer stage, or lost there.
const offerStages = (request: ClientRequest): AffaireStageView[] => {
  const lost = request.initialOpportunity.status === 'LOST';
  return [
    {
      stage: 'request',
      marker: 'done',
      capturedAt: request.capturedAt,
      clientAssociationStatus: request.clientAssociationStatus,
    },
    {
      stage: 'costing',
      marker: 'not_applicable',
      pricingSnapshot: { readable: true, value: null },
      profitabilityEstimate: { readable: false },
    },
    {
      stage: 'offer',
      marker: lost ? 'done' : 'current',
      offer: {
        versionNumber: 1,
        decisionState: 'PENDING',
        transmissionState: 'NOT_TRANSMITTED',
        clientResponseState: 'NONE',
        validUntil: '2026-12-20T10:00:00.000Z',
      },
    },
    {
      stage: 'contract',
      marker: lost ? 'not_applicable' : 'upcoming',
      agreements: [],
    },
    {
      stage: 'delivery',
      marker: lost ? 'not_applicable' : 'upcoming',
      projects: [],
    },
    { stage: 'closure', marker: 'not_available' },
    { stage: 'collection', marker: 'not_applicable', link: 'not_linked' },
  ];
};

function server(initialActor = actor()) {
  let stored = affaireRequest(
    'offer',
    'Certification ISO 22000',
    ada,
    '2026-11-20T08:00:00.000Z',
    'Valea Verde SRL',
  );
  const fresh = affaireRequest(
    'fresh',
    'HACCP set-up',
    ada,
    '2026-11-26T08:00:00.000Z',
  );
  const closed = affaireRequest(
    'closed',
    'ISO 14001 certification',
    ion,
    '2026-11-01T08:00:00.000Z',
    'Prut Grain SA',
  );
  const calls: string[] = [];
  const unexpected: string[] = [];
  let listResponse: (() => Response | Promise<Response>) | undefined;
  let affaireResponse: (() => Response) | undefined;
  const offerSummary = () =>
    affaireSummaryFor(stored, {
      thread:
        stored.initialOpportunity.status === 'LOST'
          ? { kind: 'closed', status: 'LOST' }
          : { kind: 'in_progress', currentStage: 'offer' },
      lastChangedAt: '2026-11-27T09:00:00.000Z',
    });
  const rows = {
    fresh: affaireSummaryFor(fresh, {
      followUpOn: { readable: true, value: '2026-12-02' },
    }),
    closed: affaireSummaryFor(closed, {
      status: 'LOST',
      thread: { kind: 'closed', status: 'LOST' },
    }),
  };
  function changed(request: ClientRequest, receipt: Record<string, unknown>) {
    stored = request;
    return Response.json({ receipt, request: stored });
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const method = init?.method ?? 'GET';
      calls.push(`${method} ${path}`);
      const body: unknown =
        typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      if (path === '/api/access/current-actor')
        return Response.json(initialActor);
      if (path === '/api/companies') return Response.json([company]);
      if (path === '/api/activity-log') return Response.json({ events: [] });
      if (path === '/api/clients') return Response.json([]);
      if (path.startsWith('/api/client-duplicate-reviews?'))
        return Response.json({ items: [], next_cursor: null });
      if (path.startsWith('/api/affaires?')) {
        if (listResponse) return listResponse();
        const url = new URL(path, 'http://application.test');
        if (url.searchParams.get('view') === 'mine_open')
          return Response.json({ items: [rows.fresh, offerSummary()] });
        if (url.searchParams.get('cursor') === 'older')
          return Response.json({ items: [rows.closed] });
        return Response.json({
          items: [rows.fresh, offerSummary()],
          nextCursor: 'older',
        });
      }
      const opportunity = stored.initialOpportunity;
      if (path === `/api/affaires/${opportunity.id}` && affaireResponse)
        return affaireResponse();
      if (path === `/api/affaires/${opportunity.id}`)
        return Response.json(
          affaireDetailFor(stored, {
            ...offerSummary(),
            stages: offerStages(stored),
          }),
        );
      if (path === `/api/commercial-intake/requests/${stored.id}`)
        return Response.json(stored);
      if (path === '/api/sales-stages')
        return Response.json({
          revision: 1,
          stages: [{ ...negotiation, position: 1, state: 'ACTIVE' }],
        });
      const commands = `/api/commercial-intake/opportunities/${opportunity.id}`;
      if (path === `${commands}/eligible-responsible-actors`)
        return Response.json({
          members: [ada, ion].map((member) => ({
            workspaceMembershipId: member.workspaceMembershipId,
            displayLabel: member.displayName,
          })),
        });
      if (method === 'POST' && typeof body === 'object' && body !== null) {
        const version = opportunity.version + 1;
        if (path === `${commands}/next-action` && 'nextAction' in body)
          return changed(
            {
              ...stored,
              initialOpportunity: {
                ...opportunity,
                nextAction: String(body.nextAction),
                version,
              },
            },
            {
              opportunityId: opportunity.id,
              nextAction: String(body.nextAction),
              version,
              outcome: 'updated',
            },
          );
        if (path === `${commands}/responsible`)
          return changed(
            {
              ...stored,
              initialOpportunity: {
                ...opportunity,
                responsibleActor: ion,
                responsibleWorkspaceMembershipId: ion.workspaceMembershipId,
                version,
              },
            },
            {
              opportunityId: opportunity.id,
              workspaceMembershipId: ion.workspaceMembershipId,
              version,
              outcome: 'updated',
            },
          );
        if (path === `${commands}/outcome`) {
          const entry = buildOutcomeHistoryEntry({
            previousStatus: 'OPEN',
            newStatus: 'ON_HOLD',
            reason: 'Awaiting the Client budget',
            version,
            changedAt: '2026-11-28T09:00:00.000Z',
          });
          return changed(
            {
              ...stored,
              initialOpportunity: {
                ...opportunity,
                status: 'ON_HOLD',
                statusEnteredAt: entry.changedAt,
                outcomeHistory: { entries: [entry] },
                version,
              },
            },
            {
              opportunityId: opportunity.id,
              previousStatus: 'OPEN',
              status: 'ON_HOLD',
              version,
            },
          );
        }
        if (path === `${commands}/stage`)
          return changed(
            {
              ...stored,
              initialOpportunity: {
                ...opportunity,
                salesStage: { ...negotiation, state: 'ACTIVE' },
                stageHistory: {
                  entries: [
                    buildStageHistoryEntry({
                      newStage: {
                        salesStageId: negotiation.id,
                        label: negotiation.label,
                      },
                      version,
                    }),
                  ],
                },
                version,
              },
            },
            {
              opportunityId: opportunity.id,
              salesStageId: negotiation.id,
              version,
              outcome: 'updated',
            },
          );
      }
      unexpected.push(`${method} ${path}`);
      return Response.json({}, { status: 599 });
    }),
  );
  return {
    calls,
    unexpected,
    affaireReads: () =>
      calls.filter((call) => call === 'GET /api/affaires/opportunity-offer')
        .length,
    respondToList(next: () => Response | Promise<Response>) {
      listResponse = next;
    },
    respondToAffaire(next: () => Response) {
      affaireResponse = next;
    },
    lose() {
      stored = {
        ...stored,
        initialOpportunity: {
          ...stored.initialOpportunity,
          status: 'LOST',
          outcomeHistory: {
            entries: [
              buildOutcomeHistoryEntry({
                newStatus: 'LOST',
                reason: null,
                lossReasonCode: 'COMPETITOR',
                note: 'Fictional competitor',
              }),
            ],
          },
          statusEnteredAt: '2026-09-21T10:00:00.000Z',
          version: 2,
        },
      };
    },
  };
}

function renderClarte() {
  renderInInterface(
    'clarte',
    <App identity={deterministicBrowserIdentity()} />,
  );
}

function rowTitles() {
  return within(screen.getByRole('table'))
    .getAllByRole('button')
    .filter((button) => button.className === 'clarte-row-link')
    .map((button) => button.textContent);
}

async function openOfferAffaire() {
  renderClarte();
  const row = await screen.findByRole('button', {
    name: 'Certification ISO 22000',
  });
  await act(async () => {
    fireEvent.click(row);
  });
  await screen.findByRole('heading', {
    level: 2,
    name: 'Certification ISO 22000',
  });
  // The Request stage stays mounted, hidden while another stage is shown.
  return screen.findByRole('article', {
    name: 'Certification ISO 22000 request',
    hidden: true,
  });
}

function nextStep() {
  return screen.getByRole('region', { name: 'Next step' });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/#requests');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('Affaires in the Clarté interface', () => {
  it('lists affaires with their current stage, sorts and filters the loaded rows, loads older ones and shows My open dossiers', async () => {
    const api = server();
    renderClarte();
    await screen.findByRole('button', { name: 'HACCP set-up' });
    expect(rowTitles()).toEqual(['HACCP set-up', 'Certification ISO 22000']);
    const table = screen.getByRole('table');
    expect(within(table).getByText('Valea Verde SRL')).toBeVisible();
    expect(within(table).getByText('No Client')).toBeVisible();
    expect(within(table).getByText('Offer')).toBeVisible();
    expect(within(table).getByText('Request')).toBeVisible();
    expect(within(table).getByText('Not available to you')).toBeVisible();

    fireEvent.click(
      screen.getByRole('button', { name: 'Load older affaires' }),
    );
    await screen.findByRole('button', { name: 'ISO 14001 certification' });
    expect(rowTitles()).toEqual([
      'HACCP set-up',
      'Certification ISO 22000',
      'ISO 14001 certification',
    ]);
    expect(
      screen.queryByRole('button', { name: 'Load older affaires' }),
    ).not.toBeInTheDocument();

    const stage = screen.getByRole('columnheader', { name: /Stage/u });
    fireEvent.click(within(stage).getByRole('button'));
    expect(stage).toHaveAttribute('aria-sort', 'ascending');
    expect(rowTitles()).toEqual([
      'HACCP set-up',
      'Certification ISO 22000',
      'ISO 14001 certification',
    ]);
    fireEvent.click(within(stage).getByRole('button'));
    expect(stage).toHaveAttribute('aria-sort', 'descending');
    expect(rowTitles()[0]).toBe('ISO 14001 certification');

    changeValue(
      screen.getByRole('searchbox', { name: 'Filter loaded affaires' }),
      'popa',
    );
    expect(rowTitles()).toEqual(['ISO 14001 certification']);
    changeValue(
      screen.getByRole('searchbox', { name: 'Filter loaded affaires' }),
      'nothing like this',
    );
    expect(
      screen.getByText('No loaded affaire matches the filter.'),
    ).toBeVisible();
    changeValue(
      screen.getByRole('searchbox', { name: 'Filter loaded affaires' }),
      '',
    );

    fireEvent.click(screen.getByRole('button', { name: 'My open dossiers' }));
    expect(
      screen.getByRole('button', { name: 'My open dossiers' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() =>
      expect(api.calls).toContain('GET /api/affaires?limit=25&view=mine_open'),
    );
    await waitFor(() =>
      expect(rowTitles()).toEqual(['Certification ISO 22000', 'HACCP set-up']),
    );
    expect(api.unexpected).toEqual([]);
  });

  it('groups the loaded affaires by current stage on the board and says it shows loaded rows only', async () => {
    const api = server();
    renderClarte();
    await screen.findByRole('button', { name: 'HACCP set-up' });
    fireEvent.click(
      screen.getByRole('button', { name: 'Load older affaires' }),
    );
    await screen.findByRole('button', { name: 'ISO 14001 certification' });
    fireEvent.click(screen.getByRole('button', { name: 'Board' }));

    expect(
      screen.getByText(
        'The board groups only the affaires loaded so far by their current stage.',
      ),
    ).toBeVisible();
    const column = (name: RegExp) => screen.getByRole('region', { name });
    expect(column(/^Request/u)).toHaveTextContent('HACCP set-up');
    expect(column(/^Offer/u)).toHaveTextContent('Certification ISO 22000');
    expect(column(/^Closed/u)).toHaveTextContent('ISO 14001 certification');
    expect(column(/^Costing/u)).toHaveTextContent('No affaire');
    expect(
      screen.queryByRole('region', { name: /^Collection/u }),
    ).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(
        within(column(/^Offer/u)).getByRole('button', {
          name: /Certification ISO 22000/u,
        }),
      );
    });
    await screen.findByRole('heading', {
      level: 2,
      name: 'Certification ISO 22000',
    });
    expect(api.unexpected).toEqual([]);
  });

  it('shows the seven-stage thread, one Next step card, the Request details and the selected stage panel', async () => {
    const api = server();
    const request = await openOfferAffaire();

    const thread = screen.getByRole('list', { name: 'Affaire stages' });
    expect(
      within(thread)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual([
      '1RequestDone',
      '2CostingNot applicable',
      '3OfferCurrent stage',
      '4ContractUpcoming',
      '5DeliveryUpcoming',
      '6ClosureNot available to you',
      '7CollectionNot applicable',
    ]);
    expect(
      within(thread).getByRole('button', { name: /Offer/u }),
    ).toHaveAttribute('aria-current', 'step');
    expect(nextStep()).toHaveTextContent('Current stage: Offer');
    expect(nextStep()).toHaveTextContent('Call the Client');
    expect(nextStep()).toHaveTextContent('Ada Ionescu');
    const panel = screen.getByRole('region', { name: 'Offer' });
    expect(panel).toHaveTextContent('Version 1');
    expect(panel).toHaveTextContent('Awaiting approval');
    expect(panel).toHaveTextContent('No Client response');

    // EX-056: the Request stage shows the Client Request details.
    fireEvent.click(within(thread).getByRole('button', { name: /Request/u }));
    expect(
      screen.getByText('You are viewing the Request stage.'),
    ).toBeVisible();
    expect(request).toBeVisible();
    for (const fact of [
      'Telephone note',
      'Fictional evidence of Certification ISO 22000.',
      'Valea Verde SRL',
      'Certification ISO 22000',
    ])
      expect(within(request).getAllByText(fact).length).toBeGreaterThan(0);
    expect(request).toHaveTextContent('Responsible actor: Ada Ionescu');
    expect(request).toHaveTextContent('Status: Open');

    fireEvent.click(within(thread).getByRole('button', { name: /Closure/u }));
    expect(
      screen.getByText('This stage is not available to you.'),
    ).toBeVisible();
    expect(request).not.toBeVisible();
    fireEvent.click(
      within(thread).getByRole('button', { name: /Collection/u }),
    );
    expect(screen.getByText('Not linked in PRISMA')).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Back to the current stage' }),
    );
    expect(screen.getByRole('region', { name: 'Offer' })).toBeVisible();
    expect(api.unexpected).toEqual([]);
  });

  it('changes the next action from the Next step card and rereads the affaire without a reload', async () => {
    const api = server();
    await openOfferAffaire();
    expect(api.affaireReads()).toBe(1);

    fireEvent.click(
      within(nextStep()).getByRole('button', {
        name: 'Change the next action',
      }),
    );
    const field = await screen.findByLabelText('Next action');
    expect(field).toHaveValue('Call the Client');
    changeValue(field, 'Send the signed questionnaire');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save next action' }));
    });

    await waitFor(() =>
      expect(nextStep()).toHaveTextContent('Send the signed questionnaire'),
    );
    expect(api.affaireReads()).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: 'Back to affaires' }));
    expect(
      screen.getByRole('row', { name: /Certification ISO 22000/u }),
    ).toHaveTextContent('Send the signed questionnaire');
    expect(api.unexpected).toEqual([]);
  });

  it('changes the owner, the status with its reason and the Sales Stage, and reads their histories', async () => {
    const api = server();
    const request = await openOfferAffaire();
    fireEvent.click(
      within(screen.getByRole('list', { name: 'Affaire stages' })).getByRole(
        'button',
        { name: /Request/u },
      ),
    );

    // EX-058: change the Opportunity owner among eligible members.
    fireEvent.click(
      within(request).getByRole('button', { name: 'Change responsible' }),
    );
    changeValue(
      await screen.findByRole('combobox', { name: 'New responsible actor' }),
      ion.workspaceMembershipId,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save responsible' }));
    });
    await waitFor(() => expect(nextStep()).toHaveTextContent('Ion Popa'));
    expect(request).toHaveTextContent('Responsible actor: Ion Popa');

    // EX-060, EX-061: change the status with its reason and read the history.
    fireEvent.click(
      within(request).getByRole('button', { name: 'Change status' }),
    );
    changeValue(
      screen.getByRole('combobox', { name: 'Status change' }),
      'hold',
    );
    changeValue(screen.getByLabelText('Reason'), 'Awaiting the Client budget');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save status' }));
    });
    await waitFor(() => expect(request).toHaveTextContent('Status: On hold'));
    const history = within(request).getByRole('heading', {
      name: 'Status history',
    }).parentElement;
    expect(history).toHaveTextContent('Awaiting the Client budget');

    // EX-062, EX-063: set the Sales Stage and read its history.
    fireEvent.click(
      within(request).getByRole('button', { name: 'Change Sales Stage' }),
    );
    changeValue(
      await screen.findByRole('combobox', { name: 'New Sales Stage' }),
      negotiation.id,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save Sales Stage' }));
    });
    await waitFor(() =>
      expect(
        screen.getByText('Sales Stage: Negotiation', { selector: 'span' }),
      ).toBeVisible(),
    );
    expect(
      within(request).getByText('No Sales Stage → Negotiation'),
    ).toBeVisible();
    // Each confirmed command reread the affaire once.
    expect(api.affaireReads()).toBe(4);
    expect(api.unexpected).toEqual([]);
  });

  it('shows a closed affaire with its status instead of a current stage and offers the status change', async () => {
    const api = server();
    api.lose();
    await openOfferAffaire();
    expect(screen.getByText('This affaire is closed: Lost.')).toBeVisible();
    expect(
      within(screen.getByRole('list', { name: 'Affaire stages' })).queryByRole(
        'button',
        { current: 'step' },
      ),
    ).not.toBeInTheDocument();
    expect(nextStep()).toHaveTextContent('Closed: Lost');
    fireEvent.click(
      within(nextStep()).getByRole('button', { name: 'Change the status' }),
    );
    expect(
      await screen.findByRole('combobox', { name: 'Status change' }),
    ).toBeVisible();
    expect(api.unexpected).toEqual([]);
  });

  it('shows the loading, empty, error and no-permission states of the list', async () => {
    const api = server(actor('reader'));
    let respond: (response: Response) => void = () => undefined;
    api.respondToList(
      () =>
        new Promise<Response>((resolve) => {
          respond = resolve;
        }),
    );
    renderClarte();
    expect(await screen.findByText('Loading affaires…')).toBeVisible();
    await act(async () => {
      respond(Response.json({ items: [] }));
    });
    expect(await screen.findByText('No affaire yet.')).toBeVisible();

    api.respondToList(() => Response.json({}, { status: 500 }));
    fireEvent.click(screen.getByRole('button', { name: 'My open dossiers' }));
    expect(
      await screen.findByText('The affaires could not be loaded.'),
    ).toBeVisible();
    api.respondToList(() => Response.json({}, { status: 403 }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    });
    expect(
      await screen.findByText(
        'You do not have access to the affaires of this Company.',
      ),
    ).toBeVisible();
  });

  it('answers an affaire that became hidden or missing with one unavailable state and retries a failed read', async () => {
    const api = server(actor('reader'));
    api.respondToAffaire(() => Response.json({}, { status: 500 }));
    renderClarte();
    const row = await screen.findByRole('button', {
      name: 'Certification ISO 22000',
    });
    await act(async () => {
      fireEvent.click(row);
    });
    expect(
      await screen.findByText('The affaire could not be loaded.'),
    ).toBeVisible();
    api.respondToAffaire(() => Response.json({}, { status: 404 }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    });
    expect(
      await screen.findByText('This affaire is not available.'),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Back to affaires' }));
    expect(screen.getByRole('button', { name: 'HACCP set-up' })).toBeVisible();
    expect(api.unexpected).toEqual([]);
  });

  it('offers no Next step command without the next-action permission', async () => {
    server(actor('reader'));
    await openOfferAffaire();
    expect(nextStep()).toHaveTextContent('Call the Client');
    expect(within(nextStep()).queryByRole('button')).not.toBeInTheDocument();
  });
});
