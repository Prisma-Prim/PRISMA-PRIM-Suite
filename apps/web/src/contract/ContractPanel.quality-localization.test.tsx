import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
  useInterfaceLocale,
  interfaceLocales,
} from '../localization/interface-locale';
import {
  assertMessageCoverage,
  resolveMessage,
} from '../localization/messages';
import {
  contractLocaleActor,
  contractLocaleIds,
  contractLocaleLiteral,
  contractLocalePath,
  contractLocaleRecord,
} from '../test/contract-localization-fixture';
import { ContractPanel } from './ContractPanel';
import type { ContractQualityRunView } from './contract-quality-response';
import { contractQualityMessages } from './contract-quality.copy';
import {
  contractQualityLocales,
  contractQualityRun,
  literalDecisionReason,
  pendingQualityContract,
  qualityActor,
  type QualityOrigin,
} from '../test/contract-quality-localization-fixture';
import { contractDecisionMessages } from './contract-decision.copy';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

function LocaleChoices() {
  const { changeLocale } = useInterfaceLocale();
  return (
    <>
      {interfaceLocales.map((locale) => (
        <button key={locale} onClick={() => changeLocale(locale)}>
          Use {locale}
        </button>
      ))}
    </>
  );
}

it('retranslates exact recorded Contract checks and history without replacing evidence, nodes or requests', async () => {
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
  const actor = contractLocaleActor();
  const identity = deterministicBrowserIdentity({
    'x-test-external-subject': 'contract-quality-706',
  });
  const run: ContractQualityRunView = {
    id: 'recorded-run-706',
    contractVersionId: contractLocaleIds.version,
    ruleSet: 'CONTRACT_QUALITY_ILLUSTRATIVE',
    ruleSetVersion: 1,
    actorWorkspaceMembershipId: 'recorded-member-706',
    evaluatedAt: '2026-10-07T23:30:00.000Z',
    results: [
      { code: 'SOURCE_COMPANY_MATCHES', status: 'PASS' },
      { code: 'PARTY_AVAILABLE', status: 'PASS' },
      { code: 'PARTY_MATCHES_SOURCE', status: 'PASS' },
      { code: 'PARTY_IDENTITY_MATCHES_SOURCE', status: 'PASS' },
      { code: 'PARTY_IDENTITY_CURRENT', status: 'PASS' },
      { code: 'PARTY_TAX_ID_RECORDED', status: 'PASS' },
      { code: 'PRICE_MATCHES_ACCEPTED_OFFER', status: 'PASS' },
      { code: 'PRICING_SNAPSHOT_COHERENT', status: 'PASS' },
      { code: 'CONDITIONS_MATCH_ACCEPTED_OFFER', status: 'PASS' },
      { code: 'ADDED_CONDITIONS_CONFIRMED', status: 'WARNING' },
      { code: 'TERM_END_NOT_PASSED', status: 'PASS' },
      { code: 'PROVISIONAL_MARKER_PRESENT', status: 'PASS' },
    ],
  };
  const stored = contractLocaleRecord();
  const pendingVersion = {
    ...stored,
    version: { ...stored.version, latestQualityRun: run },
  };
  const qualityPath = `${contractLocalePath}/versions/${contractLocaleIds.version}/quality-checks`;
  const onCompanyContextRejected = vi.fn();
  const onActorRevalidated = vi.fn();
  const onWorkspaceAccessRejected = vi.fn();
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init) => {
      const path = new URL(input.toString(), 'http://localhost').pathname;
      if (init?.method === 'POST')
        throw new Error('Locale switching must not evaluate Contract checks');
      if (path === contractLocalePath)
        return Response.json({ contract: pendingVersion });
      if (path === `${contractLocalePath}/versions`)
        return Response.json({ items: [], nextCursor: null });
      if (path === qualityPath)
        return Response.json({ items: [run], nextCursor: 'recorded-run-706' });
      if (path === `${qualityPath}/recorded-run-706`) return Response.json(run);
      throw new Error(`Unexpected HTTP boundary: ${path}`);
    });
  render(
    <InterfaceLocaleProvider>
      <LocaleChoices />
      <ContractPanel
        actor={actor}
        identity={identity}
        opportunityId={contractLocaleIds.opportunity}
        onCompanyContextRejected={onCompanyContextRejected}
        onActorRevalidated={onActorRevalidated}
        onWorkspaceAccessRejected={onWorkspaceAccessRejected}
      />
    </InterfaceLocaleProvider>,
  );
  const quality = await screen.findByRole('region', {
    name: 'Contract Quality Checks',
  });
  expect(within(quality).getByText('WARNING')).toBeVisible();
  expect(within(quality).getByText('recorded-member-706')).toBeVisible();
  fireEvent.click(
    within(quality).getByRole('button', { name: 'Reopen recorded checks' }),
  );
  fireEvent.click(
    await within(quality).findByRole('button', {
      name: 'Reopen run · Oct 7, 2026, 11:30:00 PM (UTC)',
    }),
  );
  await within(quality).findByText('Contract checks completed with warnings.');
  const reopen = within(quality).getByRole('button', {
    name: 'Reopen run · Oct 7, 2026, 11:30:00 PM (UTC)',
  });
  const history = within(quality).getByRole('button', {
    name: 'Reopen recorded checks',
  });
  await waitFor(() => expect(history).toBeEnabled());
  const heading = within(quality).getByRole('heading');
  const instant = within(quality).getByText('Oct 7, 2026, 11:30:00 PM');
  const literals = screen.getAllByText(contractLocaleLiteral, {
    normalizer: (text) => text,
  });
  history.focus();
  const calls = fetch.mock.calls.length;
  expect(calls).toBe(4);
  expect(fetch.mock.calls.at(-1)?.[0].toString()).toContain(
    `${qualityPath}/recorded-run-706`,
  );

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Use ro' }));
  });

  expect
    .soft(heading)
    .toHaveTextContent('Verificări de calitate ale Contractului');
  expect.soft(within(quality).queryByText('AVERTISMENT')).toBeVisible();
  expect
    .soft(history)
    .toHaveTextContent('Redeschide verificările înregistrate');
  expect(within(quality).getByRole('heading')).toBe(heading);
  expect(history).toHaveFocus();
  expect(reopen).toBeInTheDocument();
  expect(instant).toHaveAttribute('dateTime', '2026-10-07T23:30:00.000Z');
  expect(instant).toHaveTextContent('7 oct. 2026, 23:30:00');
  expect(within(quality).getByText(contractLocaleIds.version)).toBeVisible();
  expect(within(quality).getByText('recorded-member-706')).toBeVisible();
  expect(
    within(quality).getByText('CONTRACT_QUALITY_ILLUSTRATIVE v1'),
  ).toBeVisible();
  for (const literal of literals) {
    expect(literal).toBeInTheDocument();
    expect(literal.textContent).toBe(contractLocaleLiteral);
  }
  expect(fetch).toHaveBeenCalledTimes(calls);
  expect(onCompanyContextRejected).not.toHaveBeenCalled();
  expect(onActorRevalidated).not.toHaveBeenCalled();
  expect(onWorkspaceAccessRejected).not.toHaveBeenCalled();
});

function deferredResponse() {
  let finish: ((response: Response) => void) | undefined;
  const promise = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  return {
    promise,
    finish(response: Response) {
      if (!finish) throw new Error('Missing synthetic HTTP response gate');
      finish(response);
    },
  };
}

type HttpRequest = { url: URL; init: RequestInit | undefined };
function mountQuality({
  contract = pendingQualityContract(),
  actor = qualityActor(),
  origin = 'offer',
  respond,
}: {
  contract?: ReturnType<typeof pendingQualityContract>;
  actor?: ActorContext;
  origin?: QualityOrigin;
  respond?: (request: HttpRequest) => Promise<Response> | Response;
} = {}) {
  const onCompanyContextRejected = vi.fn();
  const onActorRevalidated = vi.fn();
  const onWorkspaceAccessRejected = vi.fn();
  const identity = deterministicBrowserIdentity({
    'x-test-external-subject': 'quality-706',
  });
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init) => {
      const url = new URL(input.toString(), 'http://localhost');
      if (url.pathname.includes('/quality-checks') || init?.method === 'POST') {
        if (!respond)
          throw new Error('Unexpected Quality command or history read');
        return respond({ url, init });
      }
      if (url.pathname === '/api/access/current-actor')
        return Response.json(actor);
      if (url.pathname.endsWith('/versions'))
        return Response.json({ items: [], nextCursor: null });
      if (url.pathname.startsWith(contractLocalePath))
        return Response.json({ contract });
      throw new Error(`Unexpected public Contract HTTP read: ${url.pathname}`);
    });
  const requestedVersion =
    origin === 'addendum'
      ? {
          contractId: contractLocaleIds.contract,
          contractVersionId: contractLocaleIds.version,
          kind: 'ADDENDUM' as const,
        }
      : origin === 'precontract'
        ? {
            contractId: contractLocaleIds.contract,
            contractVersionId: contractLocaleIds.version,
            kind: 'PRECONTRACT' as const,
          }
        : undefined;
  const content = (current: ActorContext) => (
    <InterfaceLocaleProvider>
      <LocaleChoices />
      <ContractPanel
        actor={current}
        identity={identity}
        opportunityId={contractLocaleIds.opportunity}
        requestedVersion={requestedVersion}
        onCompanyContextRejected={onCompanyContextRejected}
        onActorRevalidated={onActorRevalidated}
        onWorkspaceAccessRejected={onWorkspaceAccessRejected}
      />
    </InterfaceLocaleProvider>
  );
  const view = render(content(actor));
  return {
    fetch,
    onCompanyContextRejected,
    onActorRevalidated,
    onWorkspaceAccessRejected,
    replaceActor: (next: ActorContext) => view.rerender(content(next)),
  };
}

it('requires every Quality translation and falls back to Romanian for an omitted locale key', () => {
  expect(() =>
    assertMessageCoverage('contractQuality', contractQualityMessages),
  ).not.toThrow();
  const incomplete = {
    ...contractQualityMessages,
    translations: { ...contractQualityMessages.translations, fr: {} },
  };
  expect(resolveMessage(incomplete, 'fr', 'title')).toBe(
    'Verificări de calitate ale Contractului',
  );
  expect(() => assertMessageCoverage('contractQuality', incomplete)).toThrow(
    'contractQuality.fr.title',
  );
});

for (const locale of contractQualityLocales) {
  for (const role of ['preparer', 'approver'] as const) {
    it(`keeps a ${role}-only pending v2 run and exact uncertain retry in ${locale.code}`, async () => {
      localStorage.setItem(interfaceLocaleStorageKey, 'en');
      const delayed = deferredResponse();
      const attempts: Array<{
        path: string;
        company: string | null;
        body: BodyInit | null | undefined;
        key: string | null;
      }> = [];
      const currentRun = contractQualityRun({ ruleSetVersion: 2 });
      const mounted = mountQuality({
        actor: qualityActor(role),
        contract: pendingQualityContract({
          bindingVersion: 2,
          latestRun: null,
        }),
        respond: ({ url, init }) => {
          const headers = new Headers(init?.headers);
          attempts.push({
            path: url.pathname,
            company: headers.get('x-company-context-id'),
            body: init?.body,
            key: headers.get('idempotency-key'),
          });
          return attempts.length === 1
            ? delayed.promise
            : Response.json(currentRun, { status: 201 });
        },
      });
      const checks = await screen.findByRole('region', {
        name: 'Contract Quality Checks',
      });
      expect(
        within(checks).getByText('No Contract Quality Check run yet.'),
      ).toBeVisible();
      const runButton = within(checks).getByRole('button', {
        name: 'Run Contract Quality Checks',
      });
      fireEvent.click(runButton);
      await waitFor(() => expect(attempts).toHaveLength(1));
      const calls = mounted.fetch.mock.calls.length;
      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: `Use ${locale.code}` }),
        );
      });
      expect(within(checks).getByRole('button', { name: locale.running })).toBe(
        runButton,
      );
      expect(runButton).toBeDisabled();
      expect(mounted.fetch).toHaveBeenCalledTimes(calls);
      await act(async () => delayed.finish(Response.json({}, { status: 503 })));
      expect(within(checks).getByRole('alert')).toHaveTextContent(
        locale.uncertain,
      );
      const retry = within(checks).getByRole('button', { name: locale.retry });
      expect(retry).toBe(runButton);
      expect(
        within(checks).getByRole('button', { name: locale.history }),
      ).toBeDisabled();
      const beforeRetry = mounted.fetch.mock.calls.length;
      fireEvent.click(screen.getByRole('button', { name: 'Use en' }));
      fireEvent.click(
        screen.getByRole('button', { name: `Use ${locale.code}` }),
      );
      expect(mounted.fetch).toHaveBeenCalledTimes(beforeRetry);
      fireEvent.click(retry);
      await within(checks).findByText(locale.warnings);
      expect(attempts).toHaveLength(2);
      expect(attempts[1]).toEqual(attempts[0]);
      expect(attempts[0]).toEqual({
        path: `${contractLocalePath}/versions/${contractLocaleIds.version}/quality-checks`,
        company: contractLocaleIds.company,
        body: '{}',
        key: expect.any(String),
      });
      expect(attempts[0]?.key).not.toBe('');
      expect(
        within(checks).getByText('CONTRACT_QUALITY_ILLUSTRATIVE v2'),
      ).toBeVisible();
      expect(within(checks).getByText(locale.warning)).toBeVisible();
      expect(within(checks).getByText(locale.added)).toBeVisible();
      expect(within(checks).getAllByRole('listitem')).toHaveLength(12);
      for (const rule of locale.rules)
        expect(within(checks).getByText(rule)).toBeVisible();
      expect(within(checks).getAllByText(locale.pass)).toHaveLength(11);
      expect(within(checks).getByText(locale.utc)).toHaveAttribute(
        'datetime',
        currentRun.evaluatedAt,
      );
      expect(
        screen.queryByRole('button', {
          name: /Create Contract|Create new Contract Version/u,
        }),
      ).not.toBeInTheDocument();
      expect(mounted.onCompanyContextRejected).not.toHaveBeenCalled();
      expect(mounted.onActorRevalidated).not.toHaveBeenCalled();
      expect(mounted.onWorkspaceAccessRejected).not.toHaveBeenCalled();
    });
  }

  it(`preserves the current history cursor and reopens exact historical v1 on a v2-bound Version in ${locale.code}`, async () => {
    localStorage.setItem(interfaceLocaleStorageKey, 'en');
    const current = contractQualityRun({
      id: 'new-run-706',
      ruleSetVersion: 2,
      evaluatedAt: '2026-10-08T23:30:00.000Z',
    });
    const old = contractQualityRun();
    const paths: string[] = [];
    const delayed = deferredResponse();
    const mounted = mountQuality({
      actor: qualityActor('reader'),
      contract: pendingQualityContract({
        bindingVersion: 2,
        latestRun: current,
      }),
      respond: ({ url }) => {
        paths.push(url.pathname + url.search);
        if (url.pathname.endsWith('/recorded-run-706'))
          return Response.json(old);
        if (url.searchParams.has('cursor')) {
          expect(url.searchParams.get('cursor')).toBe('new-run-706');
          return Response.json({ items: [old], nextCursor: null });
        }
        return delayed.promise;
      },
    });
    const checks = await screen.findByRole('region', {
      name: 'Contract Quality Checks',
    });
    expect(
      within(checks).queryByRole('button', {
        name: 'Run Contract Quality Checks',
      }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(checks).getByRole('button', { name: 'Reopen recorded checks' }),
    );
    await waitFor(() => expect(paths).toHaveLength(1));
    const calls = mounted.fetch.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: `Use ${locale.code}` }));
    expect(within(checks).getByText(locale.loading)).toBeVisible();
    expect(mounted.fetch).toHaveBeenCalledTimes(calls);
    await act(async () =>
      delayed.finish(
        Response.json({ items: [current], nextCursor: current.id }),
      ),
    );
    const older = within(checks).getByRole('button', { name: locale.next });
    older.focus();
    fireEvent.click(screen.getByRole('button', { name: 'Use en' }));
    expect(within(checks).getByRole('button', { name: 'Older checks' })).toBe(
      older,
    );
    expect(older).toHaveFocus();
    expect(mounted.fetch).toHaveBeenCalledTimes(calls);
    fireEvent.click(older);
    const oldAction = await within(checks).findByRole('button', {
      name: 'Reopen run · Oct 7, 2026, 11:30:00 PM (UTC)',
    });
    const pagedCalls = mounted.fetch.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: `Use ${locale.code}` }));
    expect(oldAction).toHaveTextContent(
      `${locale.reopen} · ${locale.utc} (UTC)`,
    );
    expect(
      within(checks).queryByRole('button', { name: locale.next }),
    ).not.toBeInTheDocument();
    expect(mounted.fetch).toHaveBeenCalledTimes(pagedCalls);
    fireEvent.click(oldAction);
    await within(checks).findByText('CONTRACT_QUALITY_ILLUSTRATIVE v1');
    expect(paths.at(-1)).toBe(
      `${contractLocalePath}/versions/${contractLocaleIds.version}/quality-checks/recorded-run-706`,
    );
    expect(within(checks).getByText(locale.utc)).toHaveAttribute(
      'datetime',
      old.evaluatedAt,
    );
    expect(within(checks).getByText('recorded-member-706')).toBeVisible();
    expect(mounted.onActorRevalidated).not.toHaveBeenCalled();
  });

  for (const origin of ['direct', 'addendum', 'precontract'] as const) {
    it(`renders ${origin} applicability using its existing localized rule owners in ${locale.code}`, async () => {
      localStorage.setItem(interfaceLocaleStorageKey, locale.code);
      mountQuality({ origin, contract: pendingQualityContract({ origin }) });
      const checks = await screen.findByRole('region', { name: locale.title });
      expect(
        within(checks).getByText('CONTRACT_QUALITY_ILLUSTRATIVE v1'),
      ).toBeVisible();
      expect(within(checks).getByText(locale.utc)).toHaveAttribute(
        'datetime',
        '2026-10-07T23:30:00.000Z',
      );
      expect(within(checks).getAllByRole('listitem')).toHaveLength(
        origin === 'direct' ? 8 : origin === 'addendum' ? 11 : 12,
      );
      if (origin === 'direct') {
        expect(within(checks).getByText(locale.direct)).toBeVisible();
        expect(
          within(checks).queryByText(locale.added),
        ).not.toBeInTheDocument();
        expect(
          within(checks).queryByText(locale.parent),
        ).not.toBeInTheDocument();
      } else if (origin === 'addendum') {
        expect(within(checks).getByText(locale.parent)).toBeVisible();
        expect(within(checks).getByText(locale.currency)).toBeVisible();
        expect(
          within(checks).queryByText(locale.added),
        ).not.toBeInTheDocument();
      } else expect(within(checks).getByText(locale.added)).toBeVisible();
    });
  }

  it.each(['approve', 'reject'] as const)(
    `keeps checked canonical warnings and literal pending %s work while labels change to ${locale.code}`,
    async (kind) => {
      localStorage.setItem(interfaceLocaleStorageKey, 'en');
      const attempts: Array<{
        path: string;
        body: BodyInit | null | undefined;
        key: string | null;
      }> = [];
      const delayed = deferredResponse();
      const mounted = mountQuality({
        actor: qualityActor('approver'),
        respond: ({ url, init }) => {
          attempts.push({
            path: url.pathname,
            body: init?.body,
            key: new Headers(init?.headers).get('idempotency-key'),
          });
          return attempts.length === 1
            ? delayed.promise
            : Response.json({}, { status: 503 });
        },
      });
      const warning = await screen.findByRole('checkbox', {
        name: 'I acknowledge this warning: Added terms and conditions need confirmation',
      });
      const reason = screen.getByRole('textbox', { name: 'Rejection reason' });
      fireEvent.click(warning);
      fireEvent.change(reason, { target: { value: literalDecisionReason } });
      reason.focus();
      const before = mounted.fetch.mock.calls.length;
      fireEvent.click(
        screen.getByRole('button', { name: `Use ${locale.code}` }),
      );
      const dc = (key: (typeof contractDecisionMessages.keys)[number]) =>
        resolveMessage(contractDecisionMessages, locale.code, key);
      expect(
        screen.getByRole('checkbox', {
          name: `${dc('acknowledge')}: ${locale.added}`,
        }),
      ).toBe(warning);
      expect(warning).toBeChecked();
      expect(screen.getByRole('textbox', { name: dc('reason') })).toBe(reason);
      expect(reason).toHaveValue(literalDecisionReason);
      expect(reason).toHaveFocus();
      expect(mounted.fetch).toHaveBeenCalledTimes(before);
      fireEvent.click(screen.getByRole('button', { name: dc(kind) }));
      await waitFor(() => expect(attempts).toHaveLength(1));
      expect(attempts[0]?.body).toBe(
        JSON.stringify(
          kind === 'approve'
            ? {
                expectedContractRevision: 1,
                acknowledgedWarningCodes: ['ADDED_CONDITIONS_CONFIRMED'],
              }
            : { expectedContractRevision: 1, reason: literalDecisionReason },
        ),
      );
      expect(attempts[0]?.path.endsWith('/' + kind)).toBe(true);
      fireEvent.click(screen.getByRole('button', { name: 'Use en' }));
      await act(async () => delayed.finish(Response.json({}, { status: 503 })));
      expect(
        screen.getByRole('textbox', { name: 'Rejection reason' }),
      ).toBeDisabled();
      fireEvent.click(
        screen.getByRole('button', { name: `Use ${locale.code}` }),
      );
      fireEvent.click(screen.getByRole('button', { name: dc('retry') }));
      await waitFor(() => expect(attempts).toHaveLength(2));
      expect(attempts[1]).toEqual(attempts[0]);
      expect(reason).toHaveValue(literalDecisionReason);
      expect(warning).toBeChecked();
    },
  );

  it.each(['success', 'errors'] as const)(
    `renders a late %s result in the current ${locale.code} language with canonical evidence retained`,
    async (outcome) => {
      localStorage.setItem(interfaceLocaleStorageKey, 'en');
      const delayed = deferredResponse();
      const original = contractQualityRun({ errors: outcome === 'errors' });
      const result: ContractQualityRunView =
        outcome === 'errors'
          ? original
          : {
              ...original,
              results: original.results.map((item) => ({
                ...item,
                status: 'PASS',
              })),
            };
      const mounted = mountQuality({
        contract: pendingQualityContract({ latestRun: null }),
        respond: () => delayed.promise,
      });
      fireEvent.click(
        await screen.findByRole('button', {
          name: 'Run Contract Quality Checks',
        }),
      );
      await waitFor(() =>
        expect(
          mounted.fetch.mock.calls.some(([, init]) => init?.method === 'POST'),
        ).toBe(true),
      );
      fireEvent.click(
        screen.getByRole('button', { name: `Use ${locale.code}` }),
      );
      await act(async () =>
        delayed.finish(Response.json(result, { status: 201 })),
      );
      const checks = screen.getByRole('region', { name: locale.title });
      expect(within(checks).getByText(locale[outcome])).toBeVisible();
      if (outcome === 'errors')
        expect(within(checks).getByText(locale.error)).toBeVisible();
      else expect(within(checks).getAllByText(locale.pass)).toHaveLength(12);
      expect(within(checks).getByText(locale.utc)).toHaveAttribute(
        'datetime',
        result.evaluatedAt,
      );
      expect(within(checks).getByText(contractLocaleIds.version)).toBeVisible();
      expect(within(checks).getByText('recorded-member-706')).toBeVisible();
    },
  );
}

it.each([
  {
    name: 'mismatched run identity',
    body: { ...contractQualityRun(), id: 'foreign-run-706' },
  },
  {
    name: 'unknown canonical severity',
    body: {
      ...contractQualityRun(),
      results: [{ code: 'PARTY_AVAILABLE', status: 'UNKNOWN' }],
    },
  },
  {
    name: 'foreign exact Version',
    body: { ...contractQualityRun(), contractVersionId: 'hidden-version' },
  },
  {
    name: 'unknown rule-set version',
    body: { ...contractQualityRun(), ruleSetVersion: 3 },
  },
])(
  'refuses $name on exact recorded reopening without exposing its payload',
  async ({ body }) => {
    localStorage.setItem(interfaceLocaleStorageKey, 'ro');
    const old = contractQualityRun();
    mountQuality({
      respond: ({ url }) =>
        Response.json(
          url.pathname.endsWith('/recorded-run-706')
            ? body
            : { items: [old], nextCursor: null },
        ),
    });
    const checks = await screen.findByRole('region', {
      name: 'Verificări de calitate ale Contractului',
    });
    fireEvent.click(
      within(checks).getByRole('button', {
        name: 'Redeschide verificările înregistrate',
      }),
    );
    fireEvent.click(
      await within(checks).findByRole('button', {
        name: 'Redeschide verificarea · 7 oct. 2026, 23:30:00 (UTC)',
      }),
    );
    await within(checks).findByText(
      'Rezultatele verificărilor nu au putut fi încărcate. Reîncercați.',
    );
    expect(
      within(checks).queryByText('recorded-member-706'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('hidden-version')).not.toBeInTheDocument();
    expect(screen.queryByText('foreign-run-706')).not.toBeInTheDocument();
  },
);

it.each([
  'Company',
  'Workspace',
  'membership',
  'Contract grant',
  'Opportunity read',
] as const)(
  'retires a delayed Quality response when the parent replaces %s authority',
  async (change) => {
    localStorage.setItem(interfaceLocaleStorageKey, 'en');
    const delayed = deferredResponse();
    const actor = qualityActor('approver');
    const mounted = mountQuality({
      actor,
      contract: pendingQualityContract({ latestRun: null }),
      respond: () => delayed.promise,
    });
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Run Contract Quality Checks',
      }),
    );
    await waitFor(() =>
      expect(
        mounted.fetch.mock.calls.some(([, init]) => init?.method === 'POST'),
      ).toBe(true),
    );
    if (!actor.activeCompany) throw new Error('Missing synthetic Company');
    const retired: ActorContext = {
      ...actor,
      workspaceId:
        change === 'Workspace' ? 'replacement-workspace' : actor.workspaceId,
      workspaceMembershipId:
        change === 'membership'
          ? 'replacement-membership'
          : actor.workspaceMembershipId,
      activeCompany: {
        ...actor.activeCompany,
        id:
          change === 'Company' ? 'replacement-company' : actor.activeCompany.id,
        contractPermissions:
          change === 'Contract grant'
            ? []
            : actor.activeCompany.contractPermissions,
        commercialIntakePermissions:
          change === 'Opportunity read'
            ? []
            : actor.activeCompany.commercialIntakePermissions,
      },
    };
    mounted.replaceActor(retired);
    fireEvent.click(screen.getByRole('button', { name: 'Use fr' }));
    await act(async () =>
      delayed.finish(Response.json(contractQualityRun(), { status: 201 })),
    );
    expect(screen.queryByText('recorded-member-706')).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'Les contrôles du contrat se sont terminés avec des avertissements.',
      ),
    ).not.toBeInTheDocument();
  },
);

it.each([
  {
    status: 403,
    code: undefined,
    expected:
      'Accesul la verificările de calitate ale Contractului nu este disponibil.',
  },
  {
    status: 404,
    code: undefined,
    expected:
      'Versiunea Contractului nu este disponibilă. Reîncărcați Contractul.',
  },
  {
    status: 409,
    code: 'CONTRACT_VERSION_SUPERSEDED',
    expected:
      'Această versiune a Contractului a fost înlocuită. Reîncărcați Contractul.',
  },
  {
    status: 409,
    code: 'IDEMPOTENCY_CONFLICT',
    expected:
      'Reîncercarea diferă de comanda înregistrată. Reîncărcați Contractul.',
  },
  {
    status: 400,
    code: undefined,
    expected: 'Comanda de verificare a calității a fost refuzată.',
  },
  {
    status: 503,
    code: undefined,
    expected:
      'Rezultatele verificărilor nu au putut fi încărcate. Reîncercați.',
  },
])(
  'retranslates the safe history refusal HTTP $status/$code without repeating it',
  async ({ status, code, expected }) => {
    localStorage.setItem(interfaceLocaleStorageKey, 'en');
    const mounted = mountQuality({
      respond: () =>
        Response.json(
          { code, message: 'Untrusted hidden details' },
          { status },
        ),
    });
    const checks = await screen.findByRole('region', {
      name: 'Contract Quality Checks',
    });
    fireEvent.click(
      within(checks).getByRole('button', { name: 'Reopen recorded checks' }),
    );
    await within(checks).findByRole('alert');
    const calls = mounted.fetch.mock.calls.length;
    const callbacks = mounted.onActorRevalidated.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Use ro' }));
    expect(within(checks).getByRole('alert')).toHaveTextContent(expected);
    expect(
      screen.queryByText('Untrusted hidden details'),
    ).not.toBeInTheDocument();
    expect(mounted.fetch).toHaveBeenCalledTimes(calls);
    expect(mounted.onActorRevalidated).toHaveBeenCalledTimes(callbacks);
  },
);

it.each([null, 'unsupported'])(
  'defaults to Romanian with saved choice %s and keeps the reader empty state free of commands',
  async (saved) => {
    if (saved !== null) localStorage.setItem(interfaceLocaleStorageKey, saved);
    const mounted = mountQuality({
      actor: qualityActor('reader'),
      contract: pendingQualityContract({ latestRun: null }),
    });
    const checks = await screen.findByRole('region', {
      name: 'Verificări de calitate ale Contractului',
    });
    const calls = mounted.fetch.mock.calls.length;
    for (const locale of contractQualityLocales) {
      fireEvent.click(
        screen.getByRole('button', { name: `Use ${locale.code}` }),
      );
      expect(within(checks).getByText(locale.empty)).toBeVisible();
      expect(
        within(checks).queryByRole('button', { name: locale.run }),
      ).not.toBeInTheDocument();
      expect(
        within(checks).getByRole('button', { name: locale.history }),
      ).toBeEnabled();
      expect(mounted.fetch).toHaveBeenCalledTimes(calls);
    }
    expect(
      mounted.fetch.mock.calls.some(([, init]) => init?.method === 'POST'),
    ).toBe(false);
  },
);
