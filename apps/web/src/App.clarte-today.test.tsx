import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import {
  capturedRequestId,
  createClarteTodayApi,
  todayActor,
  todayDecisions,
  todayDirectRequest,
  todayOtherCompany,
  todayTasks,
  type TodayApiOptions,
} from './clarte/today/clarte-today.test-fixture';
import { operationalHomeCopy as home } from './operational-home/operational-home.copy';
import { render as plainRender } from '@testing-library/react';
import { InterfacePreferenceProvider } from './clarte/InterfacePreferenceProvider';
import { interfacePreferenceStorageKey } from './clarte/interface-preference';
import { InterfaceLocaleProvider } from './localization/interface-locale';
import { renderInInterface } from './test/app-interface';
import {
  fireEvent,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';

function serve(options: TodayApiOptions = {}) {
  const api = createClarteTodayApi(options);
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

function openToday() {
  window.history.replaceState(null, '', '/');
  renderInInterface(
    'clarte',
    <App identity={deterministicBrowserIdentity()} />,
  );
}

async function decisions() {
  return screen.findByRole('region', { name: 'To decide' });
}

const reviewOffer = `Review Offer ${todayDecisions.offer.illustrativeReference}, version ${todayDecisions.offer.versionNumber}`;
const cardName = (kind: keyof typeof home.summaries, count: number) =>
  home.cardName({
    label: home.summaries[kind].label,
    count: String(count),
    destination: home.summaries[kind].destination,
  });

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal('crypto', webcrypto);
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('Clarté Today', () => {
  it('greets the actor with the date and the active Company and offers every destination', async () => {
    serve();
    openToday();
    await decisions();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Today' }),
    ).toBeVisible();
    expect(screen.getByText('Hello, Ada Ionescu.')).toBeVisible();
    expect(
      screen.getByText('Saturday, November 28, 2026', {
        selector: '.clarte-today-hero-date time',
      }),
    ).toBeVisible();
    const navigation = screen.getByRole('navigation', {
      name: 'Primary navigation',
    });
    for (const entry of [
      'Today',
      'Clients',
      'Missions and audits',
      'Tasks',
      'Settings',
    ])
      expect(
        within(navigation).getByRole('link', { name: entry }),
      ).toBeVisible();
    expect(document.querySelector('.prisme-overview')).toBeNull();
  });

  it('lists the three decision queues and opens an Offer decision in its existing review', async () => {
    const { api } = serve();
    openToday();
    const block = await decisions();
    await within(block).findByRole('heading', {
      name: 'Pending profitability estimates',
    });
    await within(block).findByRole('heading', {
      name: 'Offers awaiting an internal decision',
    });
    await within(block).findByRole('heading', {
      name: 'Contracts awaiting an internal decision',
    });
    for (const [action, title] of [
      [
        'Decide on the Profitability Estimate',
        todayDecisions.profitability.opportunityTitle,
      ],
      ['Decide on the Offer', todayDecisions.offer.opportunityTitle],
      ['Decide on the Contract', todayDecisions.contract.opportunityTitle],
    ] as const) {
      const heading = await within(block).findByRole('heading', {
        name: action,
      });
      expect(heading.nextElementSibling).toHaveTextContent(title);
    }
    expect(
      within(block).getByRole('button', { name: 'Review version 2' }),
    ).toBeVisible();
    expect(
      within(block).getByRole('button', {
        name: 'Review Contract 7, version 1',
      }),
    ).toBeVisible();
    fireEvent.click(within(block).getByRole('button', { name: reviewOffer }));
    const review = await screen.findByRole('dialog', {
      name: todayDecisions.offer.opportunityTitle,
    });
    await within(review).findByRole('button', {
      name: 'Approve this version',
    });
    const queueReads = () =>
      api.requests.filter((request) =>
        request.startsWith('GET /api/offer-decision-queue'),
      ).length;
    const before = queueReads();
    fireEvent.click(within(review).getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', {
          name: todayDecisions.offer.opportunityTitle,
        }),
      ).not.toBeInTheDocument(),
    );
    // Closing reads the queue again from the start, as the queue's Back does.
    await waitFor(() => expect(queueReads()).toBe(before + 1));
    expect(api.unhandled).toEqual(new Set());
  });

  it('shows each authorized queue with its own empty state', async () => {
    serve({ emptyQueues: ['profitability', 'offer', 'contract'] });
    openToday();
    const block = await decisions();
    expect(
      await within(block).findByText(
        'No estimate versions awaiting your decision.',
      ),
    ).toBeVisible();
    expect(
      await within(block).findByText(
        'No Offer versions awaiting your decision.',
      ),
    ).toBeVisible();
    expect(
      await within(block).findByText(
        'No agreement versions awaiting your decision.',
      ),
    ).toBeVisible();
    expect(
      within(block).queryByRole('button', { name: /^Review/u }),
    ).not.toBeInTheDocument();
  });

  it('works through decisions, attention, overdue Tasks and deadlines in order and opens a Task', async () => {
    serve();
    openToday();
    await within(await decisions()).findByRole('button', {
      name: reviewOffer,
    });
    await screen.findByRole('region', { name: 'This week' });
    fireEvent.click(screen.getByRole('button', { name: 'Work in order' }));
    const work = await screen.findByRole('region', { name: 'Work in order' });
    expect(
      within(work).getByRole('heading', { level: 2, name: 'Work in order' }),
    ).toHaveFocus();
    await within(work).findByText('Item 1 of 8');
    const titles: string[] = [];
    for (let index = 0; index < 8; index++) {
      const item = within(work).getByRole('article');
      titles.push(
        within(item).getByRole('heading', { level: 3 }).textContent ?? '',
      );
      expect(item).toHaveTextContent(`Item ${index + 1} of 8`);
      if (index < 7)
        fireEvent.click(within(item).getByRole('button', { name: 'Next' }));
    }
    expect(titles).toEqual([
      todayDecisions.profitability.opportunityTitle,
      todayDecisions.offer.opportunityTitle,
      todayDecisions.contract.opportunityTitle,
      todayTasks.auditPlan.title,
      todayTasks.haccp.title,
      todayTasks.questionnaire.title,
      todayTasks.call.title,
      todayTasks.stageOne.title,
    ]);
    const last = within(work).getByRole('article');
    expect(within(last).getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(last).toHaveTextContent('Due on Dec 2, 2026');
    fireEvent.click(within(last).getByRole('button', { name: 'Previous' }));
    expect(within(work).getByRole('article')).toHaveTextContent('Item 7 of 8');
    // An overdue Task says why it is here.
    fireEvent.click(
      within(
        within(work).getByRole('navigation', { name: 'Items in order' }),
      ).getByRole('button', {
        name: new RegExp(todayTasks.questionnaire.title),
      }),
    );
    expect(within(work).getByRole('article')).toHaveTextContent(
      'Overdue by 8 days',
    );
    fireEvent.click(
      within(within(work).getByRole('article')).getByRole('button', {
        name: `Open ${todayTasks.questionnaire.title}`,
      }),
    );
    await waitFor(() => expect(window.location.hash).toBe('#projects'));
  });

  it('opens a decision from work in order and comes back to the same place', async () => {
    serve();
    openToday();
    await within(await decisions()).findByRole('button', {
      name: reviewOffer,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Work in order' }));
    const work = await screen.findByRole('region', { name: 'Work in order' });
    fireEvent.click(
      within(within(work).getByRole('article')).getByRole('button', {
        name: 'Next',
      }),
    );
    fireEvent.click(
      within(within(work).getByRole('article')).getByRole('button', {
        name: `Open ${todayDecisions.offer.opportunityTitle}`,
      }),
    );
    const review = await within(work).findByRole('region', {
      name: todayDecisions.offer.opportunityTitle,
    });
    expect(within(review).getByRole('heading', { level: 3 })).toHaveFocus();
    expect(
      within(work).getByRole('navigation', { name: 'Items in order' }),
    ).toBeVisible();
    fireEvent.keyDown(review, { key: 'Escape' });
    expect(review).not.toBeInTheDocument();
    expect(await within(work).findByText('Item 2 of 8')).toBeVisible();
    expect(
      within(work).getByRole('button', {
        name: `Open ${todayDecisions.offer.opportunityTitle}`,
      }),
    ).toHaveFocus();
    fireEvent.click(
      within(work).getByRole('button', { name: 'Back to Today' }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Work in order' }),
      ).toHaveFocus(),
    );
  });

  it('shows the Company summary with its counting date, refreshes it and opens the full overdue list', async () => {
    const { api } = serve();
    openToday();
    const summary = await screen.findByRole('region', { name: home.title });
    expect(
      within(summary).getByRole('button', { name: 'All Companies summaries' }),
    ).toBeVisible();
    await within(summary).findByRole('button', {
      name: cardName('overdue_tasks', 2),
    });
    expect(
      within(summary).getByRole('button', {
        name: cardName('active_clients', 9),
      }),
    ).toBeVisible();
    expect(
      within(summary).getByRole('button', {
        name: cardName('open_projects', 4),
      }),
    ).toBeVisible();
    expect(summary).toHaveTextContent(
      home.note({ company: 'PRISMA-PRIM', today: 'Nov 28, 2026' }),
    );
    const reads = () =>
      api.requests.filter((request) => request === 'GET /api/operational-home')
        .length;
    const before = reads();
    fireEvent.click(
      within(summary).getByRole('button', { name: home.refresh }),
    );
    await waitFor(() => expect(reads()).toBe(before + 1));
    fireEvent.click(
      await within(
        await screen.findByRole('region', { name: home.title }),
      ).findByRole('button', { name: cardName('overdue_tasks', 2) }),
    );
    const panel = await screen.findByRole('region', {
      name: home.overdue.title({ company: 'PRISMA-PRIM' }),
    });
    await within(panel).findByText(todayTasks.questionnaire.title);
    expect(panel).toHaveTextContent('Ion Rusu');
    expect(within(panel).getByRole('heading', { level: 3 })).toHaveFocus();
    expect(
      screen.queryByRole('region', { name: 'To decide' }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(panel).getByRole('button', { name: home.overdue.closeName }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: cardName('overdue_tasks', 2) }),
      ).toHaveFocus(),
    );
  });

  it('opens the Clients and Projects destinations from their counters', async () => {
    serve();
    openToday();
    const summary = await screen.findByRole('region', { name: home.title });
    fireEvent.click(
      await within(summary).findByRole('button', {
        name: cardName('active_clients', 9),
      }),
    );
    await waitFor(() => expect(window.location.hash).toBe('#clients'));
    fireEvent.click(
      within(
        screen.getByRole('navigation', { name: 'Primary navigation' }),
      ).getByRole('link', { name: 'Today' }),
    );
    fireEvent.click(
      await within(
        await screen.findByRole('region', { name: home.title }),
      ).findByRole('button', { name: cardName('open_projects', 4) }),
    );
    await waitFor(() => expect(window.location.hash).toBe('#projects'));
  });

  it('shows the Tasks needing attention with their full list, and this week grouped by day', async () => {
    serve();
    openToday();
    const todo = await screen.findByRole('region', { name: 'To do' });
    const attention = await within(todo).findByRole('region', {
      name: home.attention.title,
    });
    expect(within(attention).getAllByRole('listitem')).toHaveLength(2);
    fireEvent.click(
      within(attention).getByRole('button', { name: home.attention.seeAll }),
    );
    const all = await screen.findByRole('region', {
      name: 'All Tasks needing my attention — PRISMA-PRIM',
    });
    await waitFor(() => expect(all).toHaveTextContent('Total: 2'));
    const week = await screen.findByRole('region', { name: 'This week' });
    await within(week).findByText(todayTasks.stageOne.title);
    const days = within(week)
      .getAllByRole('listitem')
      .filter((item) => item.querySelector('time'));
    expect(days.map((day) => day.querySelector('time')?.dateTime)).toEqual([
      '2026-11-28',
      '2026-11-30',
      '2026-12-02',
    ]);
    expect(
      within(todo).getByRole('button', {
        name: 'Show my upcoming deadlines',
      }),
    ).toBeVisible();
    fireEvent.click(
      within(week).getByRole('button', {
        name: new RegExp(todayTasks.call.title),
      }),
    );
    await waitFor(() => expect(window.location.hash).toBe('#projects'));
  });

  it('continues to another Company only after confirmation', async () => {
    serve();
    openToday();
    fireEvent.click(
      await screen.findByRole('button', { name: 'All Companies summaries' }),
    );
    const card = await screen.findByRole('button', {
      name: `${todayOtherCompany.displayName}: ${home.summaries.active_clients.label}: 4. ${home.summaries.active_clients.destination}`,
    });
    fireEvent.click(card);
    const confirmation = await screen.findByRole('dialog', {
      name: 'Open Company destination',
    });
    expect(confirmation).toHaveTextContent(
      `Continue to “${home.summaries.active_clients.destination}” in ${todayOtherCompany.displayName}?`,
    );
    expect(window.location.hash).toBe('');
    fireEvent.click(
      within(confirmation).getByRole('button', { name: 'Continue' }),
    );
    await waitFor(() => expect(window.location.hash).toBe('#clients'));
    await waitFor(() =>
      expect(screen.getByLabelText('Active Company')).toHaveValue(
        todayOtherCompany.id,
      ),
    );
  });

  it('captures a Client Request with its initial Opportunity from the quick action', async () => {
    const { api, bodies } = serve();
    openToday();
    fireEvent.click(
      await screen.findByRole('button', { name: 'New Client Request' }),
    );
    const panel = await screen.findByRole('dialog', {
      name: 'New Client Request',
    });
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Capture Request' }),
    );
    expect(
      await within(panel).findByText(
        'Enter the required request and Opportunity fields.',
      ),
    ).toBeVisible();
    expect(api.writes).toEqual([]);
    fireEvent.change(within(panel).getByLabelText('Original request text'), {
      target: { value: 'We would like an ISO 22000 audit next spring.' },
    });
    fireEvent.change(within(panel).getByLabelText('Source label'), {
      target: { value: 'E-mail' },
    });
    fireEvent.change(within(panel).getByLabelText('Subject'), {
      target: { value: 'ISO 22000 audit' },
    });
    fireEvent.change(within(panel).getByLabelText('Opportunity title'), {
      target: { value: 'ISO 22000 certification for Lumen Dairy' },
    });
    fireEvent.change(within(panel).getByLabelText('Next action'), {
      target: { value: 'Call the quality manager' },
    });
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Capture Request' }),
    );
    expect(
      await within(panel).findByText(
        'Client Request recorded: ISO 22000 certification for Lumen Dairy.',
      ),
    ).toBeVisible();
    expect(api.writes).toEqual(['POST /api/commercial-intake/requests']);
    expect(bodies).toContainEqual({
      originalText: 'We would like an ISO 22000 audit next spring.',
      sourceLabel: 'E-mail',
      subject: 'ISO 22000 audit',
      opportunity: {
        title: 'ISO 22000 certification for Lumen Dairy',
        nextAction: 'Call the quality manager',
      },
    });
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Open the Request' }),
    );
    await waitFor(() => expect(window.location.hash).toBe('#requests'));
    expect(
      screen.queryByRole('dialog', { name: 'New Client Request' }),
    ).not.toBeInTheDocument();
    // The Requests section opens the recorded Request itself.
    await waitFor(() =>
      expect(api.requests).toContain(
        `GET /api/commercial-intake/requests/${capturedRequestId}`,
      ),
    );
  });

  it('keeps the capture open and its retry while the result is uncertain', async () => {
    const { api } = serve();
    const fetch = vi.mocked(globalThis.fetch);
    const answer = fetch.getMockImplementation();
    const keys: (string | null)[] = [];
    fetch.mockImplementation(async (input, init) => {
      if (init?.method === 'POST') {
        keys.push(new Headers(init.headers).get('idempotency-key'));
        if (keys.length === 1) return new Response(null, { status: 503 });
      }
      if (!answer) throw new Error('Missing fixture');
      return answer(input, init);
    });
    openToday();
    fireEvent.click(
      await screen.findByRole('button', { name: 'New Client Request' }),
    );
    const panel = await screen.findByRole('dialog', {
      name: 'New Client Request',
    });
    fireEvent.change(within(panel).getByLabelText('Original request text'), {
      target: { value: 'Fictional request text' },
    });
    fireEvent.change(within(panel).getByLabelText('Opportunity title'), {
      target: { value: 'Fictional Opportunity' },
    });
    fireEvent.change(within(panel).getByLabelText('Next action'), {
      target: { value: 'Fictional next action' },
    });
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Capture Request' }),
    );
    await waitFor(() => expect(keys).toHaveLength(1));
    await waitFor(() =>
      expect(
        within(panel).getByRole('button', { name: 'Close' }),
      ).toBeDisabled(),
    );
    fireEvent.keyDown(panel, { key: 'Escape' });
    expect(
      screen.getByRole('dialog', { name: 'New Client Request' }),
    ).toBeVisible();
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Capture Request' }),
    );
    expect(
      await within(panel).findByText(
        'Client Request recorded: Fictional Opportunity.',
      ),
    ).toBeVisible();
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
    expect(api.writes).toEqual(['POST /api/commercial-intake/requests']);
  });

  it('holds browser navigation while a capture result is uncertain and keeps its retry', async () => {
    const { api } = serve();
    const fetch = vi.mocked(globalThis.fetch);
    const answer = fetch.getMockImplementation();
    const keys: (string | null)[] = [];
    fetch.mockImplementation(async (input, init) => {
      if (init?.method === 'POST') {
        keys.push(new Headers(init.headers).get('idempotency-key'));
        if (keys.length === 1) return new Response(null, { status: 503 });
      }
      if (!answer) throw new Error('Missing fixture');
      return answer(input, init);
    });
    openToday();
    fireEvent.click(
      await screen.findByRole('button', { name: 'New Client Request' }),
    );
    const panel = await screen.findByRole('dialog', {
      name: 'New Client Request',
    });
    fireEvent.change(within(panel).getByLabelText('Original request text'), {
      target: { value: 'Fictional request text' },
    });
    fireEvent.change(within(panel).getByLabelText('Opportunity title'), {
      target: { value: 'Fictional Opportunity' },
    });
    fireEvent.change(within(panel).getByLabelText('Next action'), {
      target: { value: 'Fictional next action' },
    });
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Capture Request' }),
    );
    await waitFor(() =>
      expect(
        within(panel).getByRole('button', { name: 'Close' }),
      ).toBeDisabled(),
    );
    // Browser Back to another section while the result is uncertain.
    window.history.pushState(null, '', '/#clients');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await waitFor(() => expect(window.location.hash).not.toBe('#clients'));
    expect(
      screen.getByRole('dialog', { name: 'New Client Request' }),
    ).toBeVisible();
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Capture Request' }),
    );
    expect(
      await within(panel).findByText(
        'Client Request recorded: Fictional Opportunity.',
      ),
    ).toBeVisible();
    expect(keys).toEqual([keys[0], keys[0]]);
    expect(api.writes).toEqual(['POST /api/commercial-intake/requests']);
    // The recorded Request releases the hold.
    window.history.pushState(null, '', '/#clients');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { level: 1, name: 'Clients' }),
      ).toBeVisible(),
    );
  });

  it('opens the existing direct Contract form for a chosen deal in a side panel', async () => {
    const { api } = serve();
    openToday();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Direct Contract' }),
    );
    const panel = await screen.findByRole('dialog', {
      name: 'Direct Contract',
    });
    const choice = await within(panel).findByRole('button', {
      name: `Prepare a direct Contract for ${todayDirectRequest.initialOpportunity.title} (Fictional Lumen Dairy SRL)`,
    });
    // A Request without a Client cannot take a direct Contract.
    expect(
      within(panel).queryByText('Training enquiry without a Client yet'),
    ).not.toBeInTheDocument();
    fireEvent.click(choice);
    expect(
      await within(panel).findByLabelText('Internal direct reason'),
    ).toBeVisible();
    expect(within(panel).getByLabelText('Direct scope')).toBeVisible();
    expect(
      within(panel).getByRole('button', { name: 'Create direct Contract' }),
    ).toBeVisible();
    expect(api.requests).toContain(
      `GET /api/pricing/opportunities/${todayDirectRequest.initialOpportunity.id}/snapshots?limit=25`,
    );
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Choose another deal' }),
    );
    expect(
      await within(panel).findByRole('heading', { name: 'Choose the deal' }),
    ).toBeVisible();
    expect(api.writes).toEqual([]);
  });

  it('refuses a chosen deal that another Company answers', async () => {
    const { api } = serve();
    const fetch = vi.mocked(globalThis.fetch);
    const answer = fetch.getMockImplementation();
    fetch.mockImplementation(async (input, init) => {
      if (
        input
          .toString()
          .endsWith(`/commercial-intake/requests/${todayDirectRequest.id}`)
      )
        return Response.json({
          ...todayDirectRequest,
          companyId: todayOtherCompany.id,
        });
      if (!answer) throw new Error('Missing fixture');
      return answer(input, init);
    });
    openToday();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Direct Contract' }),
    );
    const panel = await screen.findByRole('dialog', {
      name: 'Direct Contract',
    });
    fireEvent.click(
      await within(panel).findByRole('button', {
        name: new RegExp(todayDirectRequest.initialOpportunity.title),
      }),
    );
    expect(
      await within(panel).findByText('The deal could not be loaded.'),
    ).toBeVisible();
    expect(
      within(panel).queryByLabelText('Internal direct reason'),
    ).not.toBeInTheDocument();
    expect(
      api.requests.some((request) => request.includes('/contracts/')),
    ).toBe(false);
  });

  it('offers no quick action, decision or summary the actor cannot open', async () => {
    const api = createClarteTodayApi();
    const actor = todayActor();
    const company = actor.activeCompany;
    if (!company) throw new Error('Missing fictional Company');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(input.toString(), window.location.origin);
        if (url.pathname === '/api/access/current-actor')
          return Response.json({
            ...actor,
            activeCompany: { ...company, grants: [] },
          });
        const reply = api.reply({
          method: init?.method ?? 'GET',
          url,
          body: undefined,
          companyId: new Headers(init?.headers).get('x-company-context-id'),
        });
        return Response.json(reply.json, { status: reply.status });
      }),
    );
    openToday();
    await screen.findByRole('button', { name: 'Work in order' });
    expect(
      screen.queryByRole('button', { name: 'New Client Request' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Direct Contract' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'To decide' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: home.title }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Work in order' }));
    expect(
      await screen.findByText('Nothing is waiting for you right now.'),
    ).toBeVisible();
    expect(api.requests.some((request) => request.includes('queue'))).toBe(
      false,
    );
  });

  it('shows a failed Company summary without counts and retries it', async () => {
    serve({ summaryStatus: 500 });
    openToday();
    const summary = await screen.findByRole('region', { name: home.title });
    expect(await within(summary).findByText(home.error)).toBeVisible();
    expect(within(summary).queryAllByRole('listitem')).toEqual([]);
    expect(
      within(summary).getByRole('button', { name: home.retry }),
    ).toBeVisible();
  });

  it('shows Today in Romanian by default', async () => {
    serve();
    localStorage.setItem(interfacePreferenceStorageKey, 'clarte');
    window.history.replaceState(null, '', '/');
    plainRender(
      <InterfaceLocaleProvider>
        <InterfacePreferenceProvider>
          <App identity={deterministicBrowserIdentity()} />
        </InterfacePreferenceProvider>
      </InterfaceLocaleProvider>,
    );
    expect(
      await screen.findByRole('region', { name: 'De decis' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Lucrați în ordine' }),
    ).toBeVisible();
    expect(
      screen.getByText('sâmbătă, 28 noiembrie 2026', {
        selector: '.clarte-today-hero-date time',
      }),
    ).toBeVisible();
  });
});
