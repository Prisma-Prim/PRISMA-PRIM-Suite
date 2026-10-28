import {
  fireEvent,
  act,
  waitFor,
  render,
  screen,
  within,
} from './test/render-with-interface-locale';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import type { ActorContext } from './access-types';
import { selectOption } from './test/select-option';
import { InterfaceLocaleSelect } from './localization/InterfaceLocaleSelect';
import {
  journalActor,
  journalReadResponse,
  journalCorrection,
} from './test/operational-risk-journal-fixture';

const companyId = '55555555-5555-4555-8555-555555555555';
const memberId = '33333333-3333-4333-8333-333333333333';
const company = { id: companyId, displayName: 'Synthetic Risk Company' };
const administrator = {
  internalUserId: '11111111-1111-4111-8111-111111111111',
  workspaceMembershipId: '22222222-2222-4222-8222-222222222222',
  workspaceId: '44444444-4444-4444-8444-444444444444',
  workspaceName: 'Synthetic Risk Workspace',
  displayName: 'Synthetic assignment administrator',
  email: 'administrator@example.test',
  active: true,
  workspacePermissions: ['company.assignment.manage'],
  activeCompany: company,
} satisfies ActorContext;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal('matchMedia', (media: string) => ({
    media,
    matches: media.includes('prefers-reduced-motion'),
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => true,
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('Operational Risk access through App', () => {
  it('opens the exact current journal statement and offers correction only after the admitted Company, Risk and original are loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const path = input.toString();
        if (path === '/api/access/current-actor')
          return Response.json(journalActor);
        if (path === '/api/companies') return Response.json([company]);
        return journalReadResponse(path);
      }),
    );
    window.history.replaceState(null, '', '/#operational-risks');
    render(<App identity={deterministicBrowserIdentity()} />);
    expect(
      await screen.findByRole('combobox', { name: 'Active Company' }),
    ).toHaveTextContent(company.displayName);
    fireEvent.click(
      await screen.findByRole('button', { name: /Synthetic journal risk/u }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Immutable history' }),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'View current statement' }),
    );
    await screen.findByRole('heading', {
      name: 'Current journal statement',
      level: 3,
    });
    const statement = screen.getByRole('region', {
      name: 'Current journal statement',
    });
    expect(
      within(statement).getByText('Synthetic original author'),
    ).toBeVisible();
    fireEvent.click(
      within(statement).getByRole('button', {
        name: 'Correct journal statement',
      }),
    );
    expect(await screen.findByLabelText('Note', { exact: true })).toHaveValue(
      ' Original literal statement Î Ж <script> ',
    );
    expect(screen.getByLabelText('Correction reason')).toHaveValue('');
  });
  it.each(['Company', 'session', 'Recorder'] as const)(
    'retires the actual App correction owner on %s replacement and ignores its late command 401',
    async (boundary) => {
      const companyB = {
        id: '55555555-5555-4555-8555-555555555556',
        displayName: 'Replacement Company',
      };
      let current: ActorContext =
        boundary === 'Recorder'
          ? {
              ...journalActor,
              activeCompany: {
                ...journalActor.activeCompany,
                clientPermissions: ['client.read'],
                clientPermissionAssignmentId:
                  '00000000-0000-4000-8000-000000962015',
                clientPermissionSetVersion: 'v1',
              },
            }
          : journalActor;
      let reply: ((value: Response) => void) | undefined;
      let actorReads = 0;
      const rejectSession = vi.fn(async () => undefined);
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const path = input.toString();
          if (path === '/api/access/current-actor') {
            actorReads++;
            const selected = new Headers(init?.headers).get(
              'x-company-context-id',
            );
            return Response.json(
              selected === companyB.id
                ? {
                    ...current,
                    activeCompany: {
                      ...journalActor.activeCompany,
                      ...companyB,
                    },
                  }
                : current,
            );
          }
          if (path === '/api/companies')
            return Response.json([company, companyB]);
          if (path === '/api/clients') return Response.json([]);
          if (path.startsWith('/api/clients/search?'))
            return new Response(null, { status: 403 });
          if (init?.method === 'POST')
            return new Promise<Response>((resolve) => {
              reply = resolve;
            });
          if (
            path === '/api/operational-risks' &&
            new Headers(init?.headers).get('x-company-context-id') ===
              companyB.id
          )
            return Response.json({ items: [], next_cursor: null });
          return journalReadResponse(path);
        }),
      );
      window.history.replaceState(null, '', '/#operational-risks');
      const identity = { ...deterministicBrowserIdentity(), rejectSession };
      const app = render(<App identity={identity} />);
      await beginAppCorrection();
      fireEvent.change(screen.getByLabelText('Note', { exact: true }), {
        target: { value: ' Retired literal proposal ' },
      });
      fireEvent.change(screen.getByLabelText('Correction reason'), {
        target: { value: ' Retired reason ' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Record' }));
      await waitFor(() => expect(reply).toBeDefined());
      if (boundary === 'Company')
        selectOption(
          screen.getByRole('combobox', { name: 'Active Company' }),
          companyB.id,
        );
      if (boundary === 'Recorder') {
        current = {
          ...current,
          activeCompany: {
            ...journalActor.activeCompany,
            ...current.activeCompany,
            operationalRiskPermissions: ['risk.read'],
            operationalRiskRecorderAssignmentId: undefined,
            operationalRiskRecorderPermissionSetVersion: undefined,
          },
        };
        fireEvent.click(
          within(
            screen.getByRole('navigation', { name: 'Primary navigation' }),
          ).getByRole('link', { name: 'Clients' }),
        );
        fireEvent.change(await screen.findByLabelText('Find a shared Client'), {
          target: { value: 'Synthetic access refresh' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Search Clients' }));
      }
      if (boundary === 'session') {
        current = {
          ...journalActor,
          displayName: 'Replacement session actor',
          workspaceMembershipId: '33333333-3333-4333-8333-333333333334',
        };
        app.rerender(
          <App
            identity={{ ...deterministicBrowserIdentity(), rejectSession }}
          />,
        );
      }
      await waitFor(() =>
        expect(
          screen.queryByLabelText('Note', { exact: true }),
        ).not.toBeInTheDocument(),
      );
      await screen.findByRole('combobox', { name: 'Active Company' });
      const reads = actorReads;
      await act(async () => reply?.(new Response(null, { status: 401 })));
      expect(actorReads).toBe(reads);
      expect(rejectSession).not.toHaveBeenCalled();
      expect(
        screen.queryByLabelText('Note', { exact: true }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('combobox', { name: 'Active Company' }),
      ).toHaveTextContent(
        boundary === 'Company' ? companyB.displayName : company.displayName,
      );
    },
  );

  it('retains one frozen correction through actual App section hiding and locale change without another POST', async () => {
    const writes: { body: BodyInit | null | undefined; key: string | null }[] =
      [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = input.toString();
        if (path === '/api/access/current-actor')
          return Response.json(journalActor);
        if (path === '/api/companies') return Response.json([company]);
        if (init?.method === 'POST') {
          writes.push({
            body: init.body,
            key: new Headers(init.headers).get('idempotency-key'),
          });
          return new Response(null, { status: 503 });
        }
        return journalReadResponse(path);
      }),
    );
    window.history.replaceState(null, '', '/#operational-risks');
    render(
      <>
        <InterfaceLocaleSelect />
        <App identity={deterministicBrowserIdentity()} />
      </>,
    );
    await beginAppCorrection();
    fireEvent.change(screen.getByLabelText('Note', { exact: true }), {
      target: { value: journalCorrection.narrative },
    });
    fireEvent.change(screen.getByLabelText('Correction reason'), {
      target: { value: journalCorrection.reason },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    await screen.findByRole('button', { name: 'Retry the same correction' });
    const navigation = screen.getByRole('navigation', {
      name: 'Primary navigation',
    });
    fireEvent.click(within(navigation).getByRole('link', { name: 'Overview' }));
    expect(
      screen.queryByRole('button', { name: 'Retry the same correction' }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(navigation).getByRole('link', { name: 'Operational risks' }),
    );
    expect(await screen.findByLabelText('Note', { exact: true })).toHaveValue(
      journalCorrection.narrative,
    );
    const locale = screen.getByRole('combobox', { name: 'Interface language' });
    selectOption(locale, 'fr');
    expect(screen.getByLabelText('Note', { exact: true })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Réessayer la même correction' }),
    ).toBeEnabled();
    expect(writes).toHaveLength(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'Réessayer la même correction' }),
    );
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[1]).toEqual(writes[0]);
  });

  it('offers explicit Reader and Recorder grants after Company administration is ready', async () => {
    const requests: { path: string; method: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = input.toString();
        requests.push({ path, method: init?.method ?? 'GET' });
        if (path === '/api/access/current-actor')
          return Response.json(administrator);
        if (path === '/api/companies') return Response.json([company]);
        if (path === '/api/activity-log') return Response.json({ events: [] });
        if (path === '/api/company-context-assignments/administration')
          return Response.json({
            members: [
              {
                workspaceMembershipId: memberId,
                displayName: 'Synthetic eligible member',
                email: 'member@example.test',
              },
            ],
            companies: [company],
            assignments: [],
          });
        throw new Error('Unexpected request before Risk grant selection.');
      }),
    );
    window.history.replaceState(null, '', '/#access');
    render(<App identity={deterministicBrowserIdentity()} />);

    expect(
      await within(await screen.findByRole('banner')).findByText(
        company.displayName,
      ),
    ).toBeVisible();
    const administration = await screen.findByRole('region', {
      name: /^Company access$/u,
    });
    const member = await within(administration).findByRole('combobox', {
      name: /^Workspace member\b/u,
    });
    selectOption(member, memberId);
    expect(member).toHaveTextContent('Synthetic eligible member');
    const companyChoice = within(administration).getByRole('combobox', {
      name: /^Company\b/u,
    });
    selectOption(companyChoice, companyId);
    expect(companyChoice).toHaveTextContent(company.displayName);
    expect(requests.every((request) => request.method === 'GET')).toBe(true);
    expect(requests.some((request) => request.path.includes('risk'))).toBe(
      false,
    );

    const bundle = within(administration).getByRole('combobox', {
      name: /^Access bundle\b/u,
    });
    bundle.focus();
    fireEvent.keyDown(bundle, { key: 'ArrowDown' });
    const options = within(screen.getByRole('listbox'));
    expect(
      options.getByRole('option', {
        name: /^Company Profitability Contributor$/u,
      }),
    ).toBeVisible();
    expect(
      options.getByRole('option', {
        name: /^Company Operational Risk Reader$/u,
      }),
    ).toBeVisible();
    expect(
      options.getByRole('option', {
        name: /^Company Operational Risk Recorder$/u,
      }),
    ).toBeVisible();
  });
});

async function beginAppCorrection() {
  expect(
    await screen.findByRole('combobox', { name: 'Active Company' }),
  ).toHaveTextContent(company.displayName);
  fireEvent.click(
    await screen.findByRole('button', { name: /Synthetic journal risk/u }),
  );
  await screen.findByRole('heading', { name: 'Immutable history' });
  fireEvent.click(
    screen.getByRole('button', { name: 'View current statement' }),
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Correct journal statement' }),
  );
  await screen.findByLabelText('Note', { exact: true });
}
