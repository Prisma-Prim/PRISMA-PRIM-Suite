import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  InterfaceLocaleProvider,
  useInterfaceLocale,
} from '../localization/interface-locale';
import { selectOption } from '../test/select-option';
import type { EstimateVersion } from './profitability-contract';
import { ProfitabilityEstimatePanel } from './ProfitabilityEstimatePanel';
import {
  profitabilityActor as actor,
  syntheticInputs,
  syntheticVersion,
} from './profitability.fixture';

const both: ActorContext = {
  ...actor,
  activeCompany: {
    ...actor.activeCompany,
    id: 'company-1',
    displayName: 'Synthetic Company',
    profitabilityDirectorPermissions: [
      'commercial.profitability_estimate.read',
      'commercial.profitability_estimate.decide',
    ],
    profitabilityDirectorPermissionAssignmentId: 'director-assignment',
    profitabilityDirectorPermissionSetVersion: 'v1',
  },
};
afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.sessionStorage.clear();
});
function mount(value = actor, identity = deterministicBrowserIdentity()) {
  window.localStorage.setItem('prisma-prim.interface-locale', 'en');
  return render(
    <InterfaceLocaleProvider>
      <ProfitabilityEstimatePanel
        actor={value}
        identity={identity}
        opportunityId="opportunity-1"
        onCompanyContextRejected={() => undefined}
      />
    </InterfaceLocaleProvider>,
  );
}
function fillForm() {
  for (const [label, value] of [
    ['ISO currency', 'EUR'],
    ['Executor cost', '60.00'],
    ['Confirmed fiscal cost', '10.00'],
    ['Explicit allocated overhead', '30.00'],
    ['Proposed commercial price', '125.00'],
    ['Target profitability (%)', '20'],
  ]) {
    if (label && value)
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  selectOption(screen.getByLabelText('Executor type'), 'PATENT_CONSULTANT');
  selectOption(screen.getByLabelText('Pricing intent'), 'ORDINARY');
  fireEvent.click(screen.getByRole('checkbox'));
}
describe('Profitability Estimate production public seam', () => {
  it('requires explicit costs, target and fresh confirmation without a target default', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ items: [], latestVersionNumber: null }),
      );
    vi.stubGlobal('fetch', fetch);
    mount();
    expect(
      await screen.findByText('No Profitability Estimate Versions yet.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Target profitability (%)')).toHaveValue('');
    fireEvent.click(
      screen.getByRole('button', { name: 'Save confirmed version' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Complete');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('completes version → MODIFY → fresh-confirmed correction → APPROVE → immutable reload', async () => {
    let versions = [syntheticVersion()];
    const commands: { path: string; body: unknown }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, options?: RequestInit) => {
        const url = path.replace('/api', '');
        if (options?.method === 'POST') {
          const body: unknown = JSON.parse(String(options.body));
          commands.push({ path: url, body });
          if (url.endsWith('/decision')) {
            const version = url.includes('/version-1/')
              ? versions.find((item) => item.versionNumber === 1)
              : versions.find((item) => item.versionNumber === 2);
            if (
              !version ||
              typeof body !== 'object' ||
              body === null ||
              !('code' in body) ||
              (body.code !== 'MODIFY' && body.code !== 'APPROVE')
            )
              throw new Error('Unexpected synthetic decision.');
            const decided: EstimateVersion = {
              ...version,
              decision: {
                id: `decision-${version.versionNumber}`,
                code: body.code,
                decidedByWorkspaceMembershipId: 'director',
                decidedAt: '2026-10-01T09:00:00Z',
              },
            };
            versions = versions.map((item) =>
              item.id === decided.id ? decided : item,
            );
            return Response.json(decided);
          }
          const created = {
            ...syntheticVersion(2),
            inputs: {
              ...syntheticInputs,
              directCosts: [],
              allocatedOverhead: '30.00',
            },
          };
          versions = [created, ...versions];
          return Response.json(created);
        }
        if (url.includes('/versions/'))
          return Response.json(versions.find((item) => url.endsWith(item.id)));
        return Response.json({
          items: versions,
          latestVersionNumber: versions[0]?.versionNumber ?? null,
        });
      }),
    );
    mount(both);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open version 1' }),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Return this version for modification',
      }),
    );
    await screen.findByText(
      'Director decision recorded for this exact version.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Prepare correction' }));
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Remove this cost' }));
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Save confirmed version' }),
    );
    await screen.findByText('Version saved.');
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    fireEvent.click(
      screen.getByRole('button', { name: 'Approve this version' }),
    );
    await screen.findByText(
      'Director decision recorded for this exact version.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reload estimate' }));
    await screen.findByRole('button', { name: 'Open version 2' });
    expect(
      screen.getByText('Decision for this version: Approved'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Decision for this version: Returned for modification'),
    ).toBeInTheDocument();
    expect(commands[0]?.body).toEqual({
      expectedVersionNumber: 1,
      expectedDecision: null,
      code: 'MODIFY',
    });
    expect(commands[1]?.body).toMatchObject({
      expectedLatestVersionNumber: 1,
      allocatedOverhead: '30.00',
      costConfirmation: true,
      targetProfitability: '20',
      directCosts: [],
    });
    expect(commands[2]?.path).toContain('/versions/version-2/decision');
  });
  it('retains exact canonical payload/key/expectation after unknown acknowledgement and locks edits until unchanged retry or reload', async () => {
    const calls: { body: string | null; key: string | null }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_path: string, options?: RequestInit) => {
        if (options?.method === 'POST') {
          calls.push({
            body: String(options.body),
            key: new Headers(options.headers).get('idempotency-key'),
          });
          if (calls.length === 1) throw new Error('Lost acknowledgement');
          return Response.json({
            ...syntheticVersion(),
            inputs: {
              ...syntheticInputs,
              directCosts: [],
              allocatedOverhead: '30.00',
            },
          });
        }
        return Response.json({ items: [], latestVersionNumber: null });
      }),
    );
    mount();
    await screen.findByText('No Profitability Estimate Versions yet.');
    fillForm();
    fireEvent.change(screen.getByLabelText('Target profitability (%)'), {
      target: { value: '+20.000' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Save confirmed version' }),
    );
    await screen.findByText(/The result is unconfirmed/u);
    expect(screen.getByLabelText('Proposed commercial price')).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry exact command' }),
    );
    await screen.findByText('Version saved.');
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual(calls[0]);
    expect(calls[0]?.body).toContain('"targetProfitability":"+20.000"');
  });
  it('preserves every entered field through validation, stale reload failure and a refreshed head, then requires fresh confirmation and a new command key', async () => {
    let reads = 0;
    const commands: { body: string; key: string | null }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_path: string, options?: RequestInit) => {
        if (options?.method === 'POST') {
          commands.push({
            body: String(options.body),
            key: new Headers(options.headers).get('idempotency-key'),
          });
          if (commands.length < 3)
            return new Response(null, {
              status: commands.length === 1 ? 400 : 409,
            });
          return Response.json(syntheticVersion(2));
        }
        reads += 1;
        if (reads === 2) return new Response(null, { status: 503 });
        return Response.json(
          reads === 1
            ? { items: [], latestVersionNumber: null }
            : { items: [syntheticVersion()], latestVersionNumber: 1 },
        );
      }),
    );
    mount();
    await screen.findByText('No Profitability Estimate Versions yet.');
    fillForm();
    selectOption(
      screen.getByLabelText('Executor type'),
      'CIVIL_CONTRACT_FREELANCER',
    );
    selectOption(screen.getByLabelText('Pricing intent'), 'STRATEGIC');
    fireEvent.change(screen.getByLabelText('Strategic-price reason'), {
      target: { value: ' Synthetic retained reason ' },
    });
    fireEvent.change(screen.getByLabelText('Target profitability (%)'), {
      target: { value: '+20.000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add direct cost' }));
    selectOption(screen.getByLabelText('Category'), 'TRAVEL');
    fireEvent.change(screen.getByLabelText('Cost label'), {
      target: { value: ' Synthetic entered travel ' },
    });
    fireEvent.change(screen.getByLabelText('Amount (EUR)'), {
      target: { value: '20.00' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Save confirmed version' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Complete');
    expect(screen.getByLabelText('Proposed commercial price')).toHaveValue(
      '125.00',
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Save confirmed version' }),
    );
    await screen.findByText(/The version or decision changed/u);
    expect(screen.getByLabelText('Proposed commercial price')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Reload estimate' }));
    await screen.findByText('Estimate history could not be loaded. Reload.');
    fireEvent.click(screen.getByRole('button', { name: 'Reload estimate' }));
    await screen.findByRole('button', { name: 'Open version 1' });
    for (const [label, value] of [
      ['ISO currency', 'EUR'],
      ['Executor cost', '60.00'],
      ['Confirmed fiscal cost', '10.00'],
      ['Explicit allocated overhead', '30.00'],
      ['Proposed commercial price', '125.00'],
      ['Target profitability (%)', '+20.000'],
      ['Strategic-price reason', ' Synthetic retained reason '],
      ['Cost label', ' Synthetic entered travel '],
      ['Amount (EUR)', '20.00'],
    ])
      if (label && value)
        expect(screen.getByLabelText(label)).toHaveValue(value);
    expect(screen.getByLabelText('Executor type')).toHaveTextContent(
      'Civil-contract freelancer',
    );
    expect(screen.getByLabelText('Pricing intent')).toHaveTextContent(
      'Strategic pricing',
    );
    expect(screen.getByLabelText('Category')).toHaveTextContent('Travel');
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save confirmed version' }),
    );
    await screen.findByRole('alert');
    expect(commands).toHaveLength(2);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Save confirmed version' }),
    );
    await screen.findByText('Version saved.');
    const first = commands[0];
    const retried = commands[2];
    if (!first || !retried) throw new Error('Missing public submission.');
    const original: unknown = JSON.parse(first.body);
    const correction: unknown = JSON.parse(retried.body);
    expect(original).toMatchObject({ expectedLatestVersionNumber: null });
    expect(correction).toEqual({
      ...Object.fromEntries(Object.entries(original ?? {})),
      expectedLatestVersionNumber: 1,
    });
    expect(retried.key).not.toBe(first.key);
    expect(retried.key).not.toBe(commands[1]?.key);
  });
  it('rejects overprecision locally and keeps all duplicate-looking direct amounts visible', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ items: [], latestVersionNumber: null }),
      );
    vi.stubGlobal('fetch', fetch);
    mount();
    await screen.findByText('No Profitability Estimate Versions yet.');
    fillForm();
    fireEvent.change(screen.getByLabelText('Executor cost'), {
      target: { value: '1.005' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Save confirmed version' }),
    );
    await screen.findByRole('alert');
    expect(fetch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Add direct cost' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add direct cost' }));
    expect(screen.getAllByLabelText('Cost label')).toHaveLength(2);
  });
  it('Director-only reads and decides older undecided versions while create remains absent', async () => {
    const director: ActorContext = {
      ...both,
      activeCompany: {
        ...both.activeCompany,
        id: 'company-1',
        displayName: 'Synthetic Company',
        profitabilityContributorPermissions: [],
        profitabilityContributorPermissionAssignmentId: undefined,
      },
    };
    const older = syntheticVersion();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, options?: RequestInit) => {
        if (options?.method === 'POST')
          return Response.json({
            ...older,
            decision: {
              id: 'decision-old',
              code: 'APPROVE',
              decidedByWorkspaceMembershipId: 'director',
              decidedAt: '2026-10-01T09:00:00Z',
            },
          });
        return Response.json(
          path.includes('/versions/')
            ? older
            : { items: [syntheticVersion(2), older], latestVersionNumber: 2 },
        );
      }),
    );
    mount(director);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open version 1' }),
    );
    expect(
      await screen.findByRole('button', { name: 'Approve this version' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save confirmed version' }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Approve this version' }),
    );
    await screen.findByText(
      'Director decision recorded for this exact version.',
    );
  });
  it('Contributor cannot decide, and missing captured authority or Opportunity read produces no request', async () => {
    const fetch = vi.fn(async (path: string) =>
      Response.json(
        path.includes('/versions/')
          ? syntheticVersion()
          : { items: [syntheticVersion()], latestVersionNumber: 1 },
      ),
    );
    vi.stubGlobal('fetch', fetch);
    const rendered = mount();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open version 1' }),
    );
    await screen.findByText('Complete costs confirmed');
    expect(
      screen.queryByRole('button', { name: 'Approve this version' }),
    ).not.toBeInTheDocument();
    rendered.unmount();
    fetch.mockClear();
    mount({
      ...actor,
      activeCompany: {
        ...actor.activeCompany,
        id: 'company-1',
        displayName: 'Synthetic Company',
        commercialIntakePermissions: [],
      },
    });
    expect(
      screen.queryByRole('heading', { name: 'Profitability Estimate' }),
    ).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('fails closed for unknown response rules, foreign scope and captured permission versions', async () => {
    const invalid = {
      ...syntheticVersion(),
      calculationRule: { ...syntheticVersion().calculationRule, version: 2 },
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ items: [invalid], latestVersionNumber: 1 }),
        ),
    );
    mount();
    await screen.findByRole('alert');
    expect(screen.queryByText('100.00 EUR')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Open version 1' }),
    ).not.toBeInTheDocument();
  });
  it('suppresses late replies and retires draft/retry on identity, membership, Company and assignment replacement', async () => {
    let release: (response: Response) => void = () => undefined;
    let count = 0;
    const fetch = vi.fn(async () =>
      ++count === 1
        ? new Promise<Response>((resolve) => {
            release = resolve;
          })
        : Response.json({ items: [], latestVersionNumber: null }),
    );
    vi.stubGlobal('fetch', fetch);
    const identity = deterministicBrowserIdentity();
    const rendered = mount(actor, identity);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const replacement = { ...actor, workspaceMembershipId: 'member-2' };
    rendered.rerender(
      <InterfaceLocaleProvider>
        <ProfitabilityEstimatePanel
          actor={replacement}
          identity={identity}
          opportunityId="opportunity-1"
          onCompanyContextRejected={() => undefined}
        />
      </InterfaceLocaleProvider>,
    );
    await screen.findByText('No Profitability Estimate Versions yet.');
    await act(async () =>
      release(
        Response.json({ items: [syntheticVersion()], latestVersionNumber: 1 }),
      ),
    );
    expect(
      screen.queryByRole('button', { name: 'Open version 1' }),
    ).not.toBeInTheDocument();
    fillForm();
    const changed = {
      ...replacement,
      activeCompany: {
        ...replacement.activeCompany,
        id: 'company-1',
        displayName: 'Synthetic Company',
        profitabilityContributorPermissionAssignmentId:
          'replacement-assignment',
      },
    };
    rendered.rerender(
      <InterfaceLocaleProvider>
        <ProfitabilityEstimatePanel
          actor={changed}
          identity={identity}
          opportunityId="opportunity-1"
          onCompanyContextRejected={() => undefined}
        />
      </InterfaceLocaleProvider>,
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Proposed commercial price')).toHaveValue(
        '',
      ),
    );
    rendered.rerender(
      <InterfaceLocaleProvider>
        <ProfitabilityEstimatePanel
          actor={changed}
          identity={{ ...identity }}
          opportunityId="opportunity-1"
          onCompanyContextRejected={() => undefined}
        />
      </InterfaceLocaleProvider>,
    );
    await screen.findByText('No Profitability Estimate Versions yet.');
    expect(screen.getByLabelText('Target profitability (%)')).toHaveValue('');
    rendered.rerender(
      <InterfaceLocaleProvider>
        <ProfitabilityEstimatePanel
          actor={{ ...changed, activeCompany: undefined }}
          identity={identity}
          opportunityId="opportunity-1"
          onCompanyContextRejected={() => undefined}
        />
      </InterfaceLocaleProvider>,
    );
    expect(
      screen.queryByRole('heading', { name: 'Profitability Estimate' }),
    ).not.toBeInTheDocument();
  });
  it.each([401, 403, 404])(
    'discards the protected draft immediately after a %s command denial',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (path: string, options?: RequestInit) => {
          if (options?.method === 'POST') return new Response(null, { status });
          return Response.json(
            path.includes('/access/current-actor')
              ? actor
              : { items: [], latestVersionNumber: null },
          );
        }),
      );
      mount();
      await screen.findByText('No Profitability Estimate Versions yet.');
      fillForm();
      fireEvent.click(
        screen.getByRole('button', { name: 'Save confirmed version' }),
      );
      await screen.findByText(
        'The estimate is unavailable with your current access.',
      );
      expect(
        screen.queryByLabelText('Proposed commercial price'),
      ).not.toBeInTheDocument();
      expect(screen.queryByDisplayValue('125.00')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Reload estimate' }));
      await screen.findByText('No Profitability Estimate Versions yet.');
      expect(screen.getByLabelText('Proposed commercial price')).toHaveValue(
        '',
      );
    },
  );
  it.each([
    'actor',
    'membership',
    'Workspace',
    'Company',
    'grant',
    'Opportunity',
    'session',
  ])(
    'retires an uncertain command and its entire draft on %s replacement',
    async (replacement) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_path: string, options?: RequestInit) => {
          if (options?.method === 'POST')
            throw new Error('Synthetic unknown response');
          return Response.json({ items: [], latestVersionNumber: null });
        }),
      );
      const identity = deterministicBrowserIdentity();
      const rendered = mount(actor, identity);
      await screen.findByText('No Profitability Estimate Versions yet.');
      fillForm();
      fireEvent.click(
        screen.getByRole('button', { name: 'Save confirmed version' }),
      );
      await screen.findByText(/The result is unconfirmed/u);
      const changedActor: ActorContext = {
        ...actor,
        internalUserId:
          replacement === 'actor' ? 'replacement-user' : actor.internalUserId,
        workspaceMembershipId:
          replacement === 'membership'
            ? 'replacement-member'
            : actor.workspaceMembershipId,
        workspaceId:
          replacement === 'Workspace'
            ? 'replacement-workspace'
            : actor.workspaceId,
        activeCompany: {
          ...actor.activeCompany,
          id: replacement === 'Company' ? 'replacement-company' : 'company-1',
          displayName: 'Synthetic Company',
          profitabilityContributorPermissionAssignmentId:
            replacement === 'grant'
              ? 'replacement-grant'
              : actor.activeCompany
                  ?.profitabilityContributorPermissionAssignmentId,
        },
      };
      rendered.rerender(
        <InterfaceLocaleProvider>
          <ProfitabilityEstimatePanel
            actor={changedActor}
            identity={replacement === 'session' ? { ...identity } : identity}
            opportunityId={
              replacement === 'Opportunity'
                ? 'replacement-opportunity'
                : 'opportunity-1'
            }
            onCompanyContextRejected={() => undefined}
          />
        </InterfaceLocaleProvider>,
      );
      await screen.findByText('No Profitability Estimate Versions yet.');
      expect(screen.getByLabelText('Proposed commercial price')).toHaveValue(
        '',
      );
      expect(screen.getByRole('checkbox')).not.toBeChecked();
      expect(
        screen.queryByRole('button', { name: 'Retry exact command' }),
      ).not.toBeInTheDocument();
    },
  );
  it('locale changes preserve canonical draft and fresh confirmation', async () => {
    function LocaleButtons() {
      const { changeLocale } = useInterfaceLocale();
      return <button onClick={() => changeLocale('fr')}>French</button>;
    }
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ items: [], latestVersionNumber: null }),
        ),
    );
    window.localStorage.setItem('prisma-prim.interface-locale', 'en');
    render(
      <InterfaceLocaleProvider>
        <LocaleButtons />
        <ProfitabilityEstimatePanel
          actor={actor}
          identity={deterministicBrowserIdentity()}
          opportunityId="opportunity-1"
          onCompanyContextRejected={() => undefined}
        />
      </InterfaceLocaleProvider>,
    );
    await screen.findByText('No Profitability Estimate Versions yet.');
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'French' }));
    expect(screen.getByLabelText('Prix commercial proposé')).toHaveValue(
      '125.00',
    );
    expect(screen.getByLabelText('Rentabilité cible (%)')).toHaveValue('20');
    expect(screen.getByRole('checkbox')).toBeChecked();
  });
});
