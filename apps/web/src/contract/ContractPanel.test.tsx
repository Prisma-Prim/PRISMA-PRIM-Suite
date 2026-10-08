import { resolveMessage } from '../localization/messages';
import { contractDecisionMessages } from './contract-decision.copy';
import { contractSignatureMessages } from './contract-signature.copy';
import '@testing-library/jest-dom/vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { ContractPanel } from './ContractPanel';
import {
  InterfaceLocaleProvider,
  interfaceLocales,
  interfaceLocaleStorageKey,
} from '../localization/interface-locale';
const identity = deterministicBrowserIdentity({
  'x-test-external-subject': 'contract-reader',
});
afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.removeItem(interfaceLocaleStorageKey);
});
describe('ContractPanel', () => {
  it.each(interfaceLocales)(
    'localizes both declared signature parties and the recording action in %s',
    async (locale) => {
      window.localStorage.setItem(interfaceLocaleStorageKey, locale);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        response({ contract: approvedUiFixture() }),
      );
      render(
        <InterfaceLocaleProvider>
          <ContractPanel
            actor={signatureActor()}
            identity={identity}
            opportunityId="opportunity-one"
            onCompanyContextRejected={() => undefined}
          />
        </InterfaceLocaleProvider>,
      );
      expect(
        await screen.findByLabelText(
          resolveMessage(contractSignatureMessages, locale, 'provider'),
        ),
      ).toBeVisible();
      expect(
        screen.getByLabelText(
          resolveMessage(contractSignatureMessages, locale, 'client'),
        ),
      ).toBeVisible();
      expect(
        screen.getByRole('button', {
          name: resolveMessage(contractSignatureMessages, locale, 'record'),
        }),
      ).toBeVisible();
    },
  );
  it.each([
    { code: 'QUALITY_CHECK_ERRORS', key: 'errors', terminal: false },
    {
      code: 'QUALITY_CHECK_WARNINGS_UNACKNOWLEDGED',
      key: 'warnings',
      terminal: false,
    },
    { code: 'STALE_CONTRACT_REVISION', key: 'stale', terminal: true },
    {
      code: 'CONTRACT_VERSION_ALREADY_EXECUTED',
      key: 'already',
      terminal: true,
    },
    {
      code: 'CONTRACT_VERSION_NOT_APPROVED',
      key: 'notApproved',
      terminal: true,
    },
    { code: 'REPRESENTATION_MISMATCH', key: 'mismatch', terminal: true },
    { code: 'INVALID_CONTRACT_INPUT', key: 'invalid', terminal: false },
  ] as const)(
    'preserves declared signature fields after $code and blocks only terminal outcomes',
    async ({ code, key, terminal }) => {
      window.localStorage.setItem(interfaceLocaleStorageKey, 'en');
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) =>
        init?.method === 'POST'
          ? response(
              { code, field: 'providerSignedOn' },
              key === 'invalid' ? 400 : 409,
            )
          : response({ contract: approvedUiFixture() }),
      );
      render(
        <InterfaceLocaleProvider>
          <ContractPanel
            actor={signatureActor()}
            identity={identity}
            opportunityId="opportunity-one"
            onCompanyContextRejected={() => undefined}
          />
        </InterfaceLocaleProvider>,
      );
      await fillSignatureFields();
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Record both simulated signatures',
        }),
      );
      expect(
        await screen.findByText(
          resolveMessage(contractSignatureMessages, 'en', key),
        ),
      ).toBeVisible();
      expect(screen.getByLabelText('Provider signatory label')).toHaveValue(
        'Provider declaration',
      );
      expect(screen.getByLabelText('Client signatory label')).toHaveValue(
        'Client declaration',
      );
      expect(screen.getByLabelText('Signature note')).toHaveValue(
        'Declared note',
      );
      const action = screen.getByRole('button', {
        name: 'Record both simulated signatures',
      });
      if (terminal) expect(action).toBeDisabled();
      else expect(action).toBeEnabled();
    },
  );
  it('invalidates an in-flight signature after a Company change and suppresses its late result', async () => {
    window.localStorage.setItem(interfaceLocaleStorageKey, 'en');
    let finish: ((value: Response) => void) | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) =>
      init?.method === 'POST'
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : response({ contract: approvedUiFixture() }),
    );
    const current = signatureActor();
    const mounted = render(
      <InterfaceLocaleProvider>
        <ContractPanel
          actor={current}
          identity={identity}
          opportunityId="opportunity-one"
          onCompanyContextRejected={() => undefined}
        />
      </InterfaceLocaleProvider>,
    );
    await fillSignatureFields();
    fireEvent.click(
      screen.getByRole('button', { name: 'Record both simulated signatures' }),
    );
    await waitFor(() => expect(finish).toBeDefined());
    mounted.rerender(
      <InterfaceLocaleProvider>
        <ContractPanel
          actor={{
            ...current,
            activeCompany: current.activeCompany
              ? { ...current.activeCompany, id: 'another-company' }
              : undefined,
          }}
          identity={identity}
          opportunityId="opportunity-one"
          onCompanyContextRejected={() => undefined}
        />
      </InterfaceLocaleProvider>,
    );
    await act(async () => {
      if (!finish) throw new Error('Missing delayed command');
      finish(response({ id: 'late-hidden-signature' }, 201));
    });
    expect(screen.queryByText('Provider declaration')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Both simulated signatures recorded.'),
    ).not.toBeInTheDocument();
  });
  it('preserves the entire uncertain simulated signature for explicit identical retry and shows both declarations', async () => {
    window.localStorage.setItem(interfaceLocaleStorageKey, 'en');
    const current = actor(false);
    if (!current.activeCompany) throw new Error('Missing Company');
    current.activeCompany.contractPermissions = [
      'commercial.contract.read',
      'commercial.contract.approve',
      'commercial.contract.signature.record',
    ];
    current.activeCompany.contractApproverAssignmentId = 'approver-one';
    current.activeCompany.contractApproverPermissionSetVersion = 'v1';
    const approval = {
      id: 'approval-one',
      contractVersionId: 'version-one',
      revision: 2,
      kind: 'APPROVE',
      actorWorkspaceMembershipId: 'member-one',
      decidedAt: '2026-10-07T09:00:00.000Z',
      qualityRun: qualityRun(),
      acknowledgedWarningCodes: ['ADDED_CONDITIONS_CONFIRMED'],
      representationChecksum: '1'.repeat(64),
    };
    const commands: Array<{ body: unknown; key: string | null }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (input.toString().endsWith('/signature')) {
        commands.push({
          body: init?.body,
          key: new Headers(init?.headers).get('idempotency-key'),
        });
        if (commands.length === 1) return response({}, 500);
        return response(
          {
            id: 'signature-one',
            contractVersionId: 'version-one',
            revision: 3,
            evidenceKind: 'SIMULATED',
            provenance: 'ILLUSTRATIVE',
            provisional: true,
            actorWorkspaceMembershipId: 'member-one',
            recordedAt: '2026-10-08T10:00:00.000Z',
            providerSignatoryLabel: '  Provider É  ',
            clientSignatoryLabel: 'Client 🙂',
            providerSignedOn: '2026-10-07',
            clientSignedOn: '2026-10-08',
            note: 'Declared only',
            qualityRun: {
              ...qualityRun(),
              id: 'signature-run',
              evaluatedAt: '2026-10-08T10:00:00.000Z',
            },
            acknowledgedWarningCodes: [],
            representationChecksum: '1'.repeat(64),
          },
          201,
        );
      }
      const stored = fixture();
      return response({
        contract: {
          ...stored,
          revision: 2,
          version: {
            ...stored.version,
            decisionState: 'APPROVED',
            decision: approval,
            latestQualityRun: qualityRun(),
          },
        },
      });
    });
    render(
      <InterfaceLocaleProvider>
        <ContractPanel
          actor={current}
          identity={identity}
          opportunityId="opportunity-one"
          onCompanyContextRejected={() => undefined}
        />
      </InterfaceLocaleProvider>,
    );
    fireEvent.change(await screen.findByLabelText('Provider signatory label'), {
      target: { value: '  Provider É  ' },
    });
    fireEvent.change(screen.getByLabelText('Client signatory label'), {
      target: { value: 'Client 🙂' },
    });
    fireEvent.change(screen.getByLabelText('Provider signing date'), {
      target: { value: '2026-10-07' },
    });
    fireEvent.change(screen.getByLabelText('Client signing date'), {
      target: { value: '2026-10-08' },
    });
    fireEvent.change(screen.getByLabelText('Signature note'), {
      target: { value: 'Declared only' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Record both simulated signatures' }),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Retry the same simulated signature',
      }),
    );
    const signatures = screen.getByRole('region', {
      name: 'Simulated Contract signatures',
    });
    expect(
      await within(signatures).findByText('Executed — simulated evidence only'),
    ).toBeVisible();
    expect(
      within(signatures).getByText('Provider É', { exact: true }),
    ).toBeVisible();
    expect(screen.getByText('Client 🙂')).toBeVisible();
    expect(commands).toHaveLength(2);
    expect(commands[1]).toEqual(commands[0]);
    expect(
      screen.queryByRole('button', {
        name: 'Record both simulated signatures',
      }),
    ).not.toBeInTheDocument();
  });
  it.each([false, true])(
    'shows the committed approval checks immediately with prior run %s and keeps reopened history',
    async (hasPriorRun) => {
      const current = actor(false);
      if (!current.activeCompany) throw new Error('Missing Company');
      current.activeCompany.contractPermissions = [
        'commercial.contract.read',
        'commercial.contract.approve',
      ];
      const historical = qualityRun();
      const committed = {
        ...historical,
        id: 'approval-run',
        evaluatedAt: '2026-10-07T10:00:00.000Z',
        actorWorkspaceMembershipId: 'approval-member',
        results: historical.results.map((item) => ({
          ...item,
          status: 'PASS',
        })),
      };
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const path = input.toString();
        if (path.endsWith('/approve'))
          return response(
            {
              id: 'decision-one',
              contractVersionId: 'version-one',
              revision: 2,
              actorWorkspaceMembershipId: committed.actorWorkspaceMembershipId,
              decidedAt: committed.evaluatedAt,
              kind: 'APPROVE',
              qualityRun: committed,
              acknowledgedWarningCodes: [],
              representationChecksum: '1'.repeat(64),
            },
            201,
          );
        if (path.endsWith('/quality-checks'))
          return response({ items: [historical], nextCursor: null });
        if (path.endsWith('/quality-checks/run-one'))
          return response(historical);
        const stored = fixture();
        return response({
          contract: {
            ...stored,
            version: {
              ...stored.version,
              latestQualityRun: hasPriorRun ? historical : null,
            },
          },
        });
      });
      render(
        <ContractPanel
          actor={current}
          identity={identity}
          opportunityId="opportunity-one"
          onCompanyContextRejected={() => undefined}
        />,
      );
      fireEvent.click(
        await screen.findByRole('button', {
          name: resolveMessage(contractDecisionMessages, 'ro', 'approve'),
        }),
      );
      await screen.findByText('1'.repeat(64));
      const checks = within(
        screen.getByRole('region', { name: 'Contract Quality Checks' }),
      );
      expect(
        await checks.findByText(committed.actorWorkspaceMembershipId),
      ).toBeVisible();
      expect(checks.getByText(committed.evaluatedAt)).toBeVisible();
      expect(
        checks.queryByText('No Contract Quality Check run yet.'),
      ).not.toBeInTheDocument();
      const reopenHistory = checks.getByRole('button', {
        name: 'Reopen recorded checks',
      });
      await waitFor(() => expect(reopenHistory).toBeEnabled());
      fireEvent.click(reopenHistory);
      fireEvent.click(
        await checks.findByRole('button', { name: /Reopen run/u }),
      );
      expect(
        await checks.findByText(historical.actorWorkspaceMembershipId),
      ).toBeVisible();
      expect(
        checks.queryByText(committed.actorWorkspaceMembershipId),
      ).not.toBeInTheDocument();
    },
  );
  it.each(interfaceLocales)(
    'formats the new decision instant in %s with UTC preserved',
    async (locale) => {
      const decidedAt = '2026-10-07T23:15:42.000Z';
      window.localStorage.setItem(interfaceLocaleStorageKey, locale);
      const stored = fixture();
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        response({
          contract: {
            ...stored,
            revision: 2,
            version: {
              ...stored.version,
              decisionState: 'REJECTED',
              decision: {
                id: 'decision-one',
                contractVersionId: 'version-one',
                revision: 2,
                actorWorkspaceMembershipId: 'member-one',
                decidedAt,
                kind: 'REJECT',
                reason: 'Synthetic rejection',
              },
            },
          },
        }),
      );
      render(
        <InterfaceLocaleProvider>
          <ContractPanel
            actor={actor(false)}
            identity={identity}
            opportunityId="opportunity-one"
            onCompanyContextRejected={() => undefined}
          />
        </InterfaceLocaleProvider>,
      );
      const expected = new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'medium',
        timeZone: 'UTC',
      }).format(new Date(decidedAt));
      expect(await screen.findByText(expected)).toBeVisible();
      expect(
        screen.getByText(
          resolveMessage(contractDecisionMessages, locale, 'instant'),
        ),
      ).toHaveTextContent('UTC');
      expect(screen.queryByText(decidedAt)).not.toBeInTheDocument();
      window.localStorage.removeItem(interfaceLocaleStorageKey);
    },
  );
  it('submits only warnings still displayed after a fresh review', async () => {
    const current = actor(false);
    if (!current.activeCompany) throw new Error('Missing Company');
    current.activeCompany.contractPermissions = [
      'commercial.contract.read',
      'commercial.contract.approve',
    ];
    const freshRun = {
      ...qualityRun(),
      id: 'fresh-run',
      results: qualityRun().results.map((result) => ({
        ...result,
        status: 'PASS',
      })),
    };
    let submitted: BodyInit | null | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (input.toString().endsWith('/quality-checks'))
        return response(freshRun, 201);
      if (input.toString().endsWith('/approve')) {
        submitted = init?.body;
        return response(
          {
            id: 'decision-one',
            contractVersionId: 'version-one',
            revision: 2,
            actorWorkspaceMembershipId: 'member-one',
            decidedAt: freshRun.evaluatedAt,
            kind: 'APPROVE',
            qualityRun: freshRun,
            acknowledgedWarningCodes: [],
            representationChecksum: '1'.repeat(64),
          },
          201,
        );
      }
      const stored = fixture();
      return response({
        contract: {
          ...stored,
          version: { ...stored.version, latestQualityRun: qualityRun() },
        },
      });
    });
    render(
      <ContractPanel
        actor={current}
        identity={identity}
        opportunityId="opportunity-one"
        onCompanyContextRejected={() => undefined}
      />,
    );
    fireEvent.click(await screen.findByRole('checkbox'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Run Contract Quality Checks' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument(),
    );
    const approve = screen.getByRole('button', {
      name: resolveMessage(contractDecisionMessages, 'ro', 'approve'),
    });
    await waitFor(() => expect(approve).toBeEnabled());
    fireEvent.click(approve);
    expect(await screen.findByText('1'.repeat(64))).toBeInTheDocument();
    expect(submitted).toBe(
      JSON.stringify({
        expectedContractRevision: 1,
        acknowledgedWarningCodes: [],
      }),
    );
  });
  it('keeps a malformed successful decision uncertain and retries the exact submitted intent', async () => {
    const current = actor(false);
    if (!current.activeCompany) throw new Error('Missing Company');
    current.activeCompany.contractPermissions = [
      'commercial.contract.read',
      'commercial.contract.approve',
    ];
    const attempts: Array<{
      body: BodyInit | null | undefined;
      key: string | null;
    }> = [];
    const recorded = {
      id: 'decision-one',
      contractVersionId: 'version-one',
      revision: 2,
      actorWorkspaceMembershipId: 'member-one',
      decidedAt: '2026-10-07T09:00:00.000Z',
      kind: 'REJECT',
      reason: 'Synthetic preserved rejection',
    };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (input.toString().endsWith('/reject')) {
        attempts.push({
          body: init?.body,
          key: new Headers(init?.headers).get('idempotency-key'),
        });
        return response(
          attempts.length === 1
            ? { ...recorded, contractVersionId: 'another-version' }
            : recorded,
          201,
        );
      }
      return response({ contract: fixture() });
    });
    render(
      <ContractPanel
        actor={current}
        identity={identity}
        opportunityId="opportunity-one"
        onCompanyContextRejected={() => undefined}
      />,
    );
    const reason = await screen.findByRole('textbox', {
      name: resolveMessage(contractDecisionMessages, 'ro', 'reason'),
    });
    fireEvent.change(reason, { target: { value: recorded.reason } });
    fireEvent.click(
      screen.getByRole('button', {
        name: resolveMessage(contractDecisionMessages, 'ro', 'reject'),
      }),
    );
    const retry = await screen.findByRole('button', {
      name: resolveMessage(contractDecisionMessages, 'ro', 'retry'),
    });
    expect(reason).toHaveValue(recorded.reason);
    expect(reason).toBeDisabled();
    expect(
      screen.queryByText(
        resolveMessage(contractDecisionMessages, 'ro', 'rejected'),
      ),
    ).not.toBeInTheDocument();
    fireEvent.click(retry);
    expect(
      await screen.findByText(
        resolveMessage(contractDecisionMessages, 'ro', 'rejected'),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(recorded.reason)).toBeInTheDocument();
    expect(attempts[1]).toEqual(attempts[0]);
  });
  it('discards an in-flight decision when the active Company changes', async () => {
    const current = actor(false);
    if (!current.activeCompany) throw new Error('Missing Company');
    current.activeCompany.contractPermissions = [
      'commercial.contract.read',
      'commercial.contract.approve',
    ];
    let finish: ((response: Response) => void) | undefined;
    let reads = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (input.toString().endsWith('/reject'))
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      if (++reads > 1) return new Promise<Response>(() => undefined);
      return response({ contract: fixture() });
    });
    const properties = {
      actor: current,
      identity,
      opportunityId: 'opportunity-one',
      onCompanyContextRejected: () => undefined,
    };
    const view = render(<ContractPanel {...properties} />);
    fireEvent.change(
      await screen.findByRole('textbox', {
        name: resolveMessage(contractDecisionMessages, 'ro', 'reason'),
      }),
      { target: { value: 'Synthetic private reason' } },
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: resolveMessage(contractDecisionMessages, 'ro', 'reject'),
      }),
    );
    await waitFor(() => expect(finish).toBeDefined());
    view.rerender(
      <ContractPanel
        {...properties}
        actor={{
          ...current,
          activeCompany: { ...current.activeCompany, id: 'another-company' },
        }}
      />,
    );
    await act(async () => {
      if (!finish) throw new Error('Missing pending decision');
      finish(
        response(
          {
            id: 'decision-one',
            contractVersionId: 'version-one',
            revision: 2,
            actorWorkspaceMembershipId: 'member-one',
            decidedAt: '2026-10-07T09:00:00.000Z',
            kind: 'REJECT',
            reason: 'Synthetic private reason',
          },
          201,
        ),
      );
    });
    expect(
      screen.queryByText('Synthetic private reason'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        resolveMessage(contractDecisionMessages, 'ro', 'rejected'),
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: resolveMessage(contractDecisionMessages, 'ro', 'retry'),
      }),
    ).not.toBeInTheDocument();
  });
  it('exposes an approver-only decision, preserves an uncertain exact retry and reloads approval evidence', async () => {
    const current = actor(false);
    if (!current.activeCompany) throw new Error('Missing fixture Company');
    current.activeCompany.contractPermissions = [
      'commercial.contract.read',
      'commercial.contract.approve',
      'commercial.contract.signature.record',
    ];
    current.activeCompany.contractPermissionAssignmentId = undefined;
    current.activeCompany.contractPermissionSetVersion = undefined;
    current.activeCompany.contractApproverAssignmentId = 'approver-one';
    current.activeCompany.contractApproverPermissionSetVersion = 'v1';
    const attempts: Array<{
      body: BodyInit | null | undefined;
      key: string | null;
    }> = [];
    const freshRun = {
      ...qualityRun(),
      results: qualityRun().results.map((result) => ({
        ...result,
        status: 'PASS',
      })),
    };
    const approved = {
      id: 'decision-one',
      contractVersionId: 'version-one',
      revision: 2,
      actorWorkspaceMembershipId: 'member-one',
      decidedAt: '2026-10-07T09:00:00.000Z',
      kind: 'APPROVE',
      qualityRun: freshRun,
      acknowledgedWarningCodes: [],
      representationChecksum: '1'.repeat(64),
    };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (input.toString().endsWith('/approve')) {
        attempts.push({
          body: init?.body,
          key: new Headers(init?.headers).get('idempotency-key'),
        });
        if (attempts.length === 1) throw new Error('Lost response');
        return response(approved, 201);
      }
      return response({ contract: fixture() });
    });
    render(
      <ContractPanel
        actor={current}
        identity={identity}
        opportunityId="opportunity-one"
        onCompanyContextRejected={() => undefined}
      />,
    );
    const copy = (key: 'approve' | 'retry' | 'approved') =>
      resolveMessage(contractDecisionMessages, 'ro', key);
    fireEvent.click(
      await screen.findByRole('button', { name: copy('approve') }),
    );
    fireEvent.click(await screen.findByRole('button', { name: copy('retry') }));
    await waitFor(() => expect(attempts).toHaveLength(2));
    expect(attempts[1]).toEqual(attempts[0]);
    expect(attempts[0]?.body).toBe(
      JSON.stringify({
        expectedContractRevision: 1,
        acknowledgedWarningCodes: [],
      }),
    );
    expect(await screen.findByText('1'.repeat(64))).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: copy('approve') }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Create Contract' }),
    ).not.toBeInTheDocument();
  });
  it.each([
    'QUALITY_CHECK_ERRORS',
    'QUALITY_CHECK_WARNINGS_UNACKNOWLEDGED',
    'STALE_CONTRACT_REVISION',
    'CONTRACT_VERSION_ALREADY_DECIDED',
  ])(
    'preserves reason text on %s and disables stale decisions',
    async (code) => {
      const current = actor(false);
      if (!current.activeCompany) throw new Error('Missing Company');
      current.activeCompany.contractPermissions = [
        'commercial.contract.read',
        'commercial.contract.approve',
      ];
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
        response(
          input.toString().endsWith('/approve')
            ? { code }
            : { contract: fixture() },
          input.toString().endsWith('/approve') ? 409 : 200,
        ),
      );
      render(
        <ContractPanel
          actor={current}
          identity={identity}
          opportunityId="opportunity-one"
          onCompanyContextRejected={() => undefined}
        />,
      );
      const approve = await screen.findByRole('button', {
        name: resolveMessage(contractDecisionMessages, 'ro', 'approve'),
      });
      const reason = screen.getByRole('textbox', {
        name: resolveMessage(contractDecisionMessages, 'ro', 'reason'),
      });
      fireEvent.change(reason, {
        target: { value: 'Synthetic entered reason' },
      });
      fireEvent.click(approve);
      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(reason).toHaveValue('Synthetic entered reason');
      if (
        code === 'STALE_CONTRACT_REVISION' ||
        code === 'CONTRACT_VERSION_ALREADY_DECIDED'
      )
        expect(approve).toBeDisabled();
    },
  );

  it.each([
    'opportunity',
    'identity',
    'contract-authority',
    'opportunity-authority',
  ])(
    'hides a currently visible exact document on %s replacement',
    async (replacement) => {
      let calls = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        calls++;
        if (calls > 2) return new Promise<Response>(() => undefined);
        return response(
          input.toString().endsWith('/representation')
            ? representation()
            : { contract: fixture() },
        );
      });
      const current = actor(false);
      const properties = {
        actor: current,
        identity,
        opportunityId: 'opportunity-one',
        onCompanyContextRejected: () => undefined,
      };
      const view = render(<ContractPanel {...properties} />);
      fireEvent.click(
        await screen.findByRole('button', {
          name: 'Open exact Contract document',
        }),
      );
      expect(
        await screen.findByTitle('Illustrative Contract document'),
      ).toBeInTheDocument();
      view.rerender(
        <ContractPanel
          {...properties}
          opportunityId={
            replacement === 'opportunity'
              ? 'opportunity-two'
              : properties.opportunityId
          }
          identity={
            replacement === 'identity'
              ? deterministicBrowserIdentity({
                  'x-test-external-subject': 'replacement-reader',
                })
              : identity
          }
          actor={
            replacement.endsWith('authority')
              ? {
                  ...current,
                  activeCompany: {
                    ...current.activeCompany,
                    id: 'company-one',
                    displayName: 'Company',
                    ...(replacement === 'contract-authority'
                      ? { contractPermissions: [] }
                      : { commercialIntakePermissions: [] }),
                  },
                }
              : current
          }
        />,
      );
      expect(
        screen.queryByTitle('Illustrative Contract document'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(representation().sha256),
      ).not.toBeInTheDocument();
    },
  );
  it('opens and reloads the exact isolated document with its checksum', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) =>
        response(
          input.toString().endsWith('/representation')
            ? representation()
            : { contract: fixture() },
        ),
      );
    render(
      <ContractPanel
        actor={actor(false)}
        identity={identity}
        opportunityId="opportunity-one"
        onCompanyContextRejected={() => undefined}
      />,
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open exact Contract document',
      }),
    );
    expect(await screen.findByText('Draft — not approved')).toBeVisible();
    const document = screen.getByTitle('Illustrative Contract document');
    expect(document).toHaveAttribute('srcdoc', representation().html);
    expect(document).toHaveAttribute('sandbox', '');
    expect(document).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(screen.getByText(representation().sha256)).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Reload exact Contract document' }),
    );
    await waitFor(() =>
      expect(
        screen.getByTitle('Illustrative Contract document'),
      ).toHaveAttribute('srcdoc', representation().html),
    );
    expect(
      fetch.mock.calls.filter(([path]) =>
        path.toString().endsWith('/representation'),
      ),
    ).toHaveLength(2);
  });
  it.each([
    'opportunity',
    'identity',
    'contract-authority',
    'opportunity-authority',
  ])(
    'removes an open document immediately on %s replacement and suppresses late responses',
    async (replacement) => {
      let resolveLate: ((response: Response) => void) | undefined;
      let documentRequests = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        if (input.toString().endsWith('/representation')) {
          documentRequests++;
          if (documentRequests === 1) return response(representation());
          return new Promise<Response>((resolve) => {
            resolveLate = resolve;
          });
        }
        if (input.toString().includes('opportunity-two'))
          return response({ contract: null });
        return response({ contract: fixture() });
      });
      const current = actor(false);
      const properties = {
        actor: current,
        identity,
        opportunityId: 'opportunity-one',
        onCompanyContextRejected: () => undefined,
      };
      const view = render(<ContractPanel {...properties} />);
      fireEvent.click(
        await screen.findByRole('button', {
          name: 'Open exact Contract document',
        }),
      );
      await screen.findByTitle('Illustrative Contract document');
      fireEvent.click(
        screen.getByRole('button', { name: 'Reload exact Contract document' }),
      );
      await waitFor(() => expect(resolveLate).toBeDefined());
      view.rerender(
        <ContractPanel
          {...properties}
          opportunityId={
            replacement === 'opportunity'
              ? 'opportunity-two'
              : properties.opportunityId
          }
          identity={
            replacement === 'identity'
              ? deterministicBrowserIdentity({
                  'x-test-external-subject': 'replacement-reader',
                })
              : identity
          }
          actor={
            replacement.endsWith('authority')
              ? {
                  ...current,
                  activeCompany: {
                    ...current.activeCompany,
                    id: 'company-one',
                    displayName: 'Company',
                    ...(replacement === 'contract-authority'
                      ? { contractPermissions: [] }
                      : { commercialIntakePermissions: [] }),
                  },
                }
              : current
          }
        />,
      );
      expect(
        screen.queryByTitle('Illustrative Contract document'),
      ).not.toBeInTheDocument();
      resolveLate?.(response(representation()));
      await waitFor(() =>
        expect(
          screen.queryByText(representation().sha256),
        ).not.toBeInTheDocument(),
      );
      expect(
        screen.queryByTitle('Illustrative Contract document'),
      ).not.toBeInTheDocument();
    },
  );
  it.each([
    { contractVersionId: 'other-version' },
    { contractId: 'other-contract' },
    { templateVersion: 2 },
    { clauseVersions: [] },
    { clauseVersions: [{ code: 'CL_GENERAL', version: 1 }] },
    { sha256: 'invalid' },
    { html: '' },
  ])('refuses incompatible exact document responses %j', async (invalid) => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      response(
        input.toString().endsWith('/representation')
          ? { ...representation(), ...invalid }
          : { contract: fixture() },
      ),
    );
    render(
      <ContractPanel
        actor={actor(false)}
        identity={identity}
        opportunityId="opportunity-one"
        onCompanyContextRejected={() => undefined}
      />,
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open exact Contract document',
      }),
    );
    expect(
      await screen.findByText(
        'The exact Contract document could not be loaded. Try again.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByTitle('Illustrative Contract document'),
    ).not.toBeInTheDocument();
  });
  it('reads the recorded Contract without any Offer or live Client read', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(response({ contract: fixture() }));
    render(
      <ContractPanel
        actor={actor(false)}
        identity={identity}
        opportunityId="opportunity-one"
        onCompanyContextRejected={() => undefined}
      />,
    );
    expect(await screen.findByText('Synthetic accepted scope')).toBeVisible();
    expect(screen.getByText('Source Offer')).toBeVisible();
    expect(
      screen.getByText('Illustrative reference 7 · version 2'),
    ).toBeVisible();
    expect(screen.getByText(/Synthetic recorded party/u)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Create Contract' }),
    ).not.toBeInTheDocument();
    expect(
      fetch.mock.calls.every(([path]) =>
        path.toString().includes('/contracts/'),
      ),
    ).toBe(true);
  });
  it('retains the exact command and key for an uncertain retry', async () => {
    const bodies: Array<{ body: unknown; key: string | null }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (init?.method === 'POST') {
        bodies.push({
          body: init.body,
          key: new Headers(init.headers).get('idempotency-key'),
        });
        if (bodies.length === 1) return response({}, 500);
        return response(fixture(), 201);
      }
      if (input.toString().includes('/offers/'))
        return response({
          offer: {
            version: {
              id: 'accepted-version',
              clientResponseState: 'ACCEPTED',
              provenance: 'ILLUSTRATIVE',
              provisional: true,
              decisionState: 'APPROVED',
              supersededByVersionId: null,
            },
          },
        });
      return response({ contract: null });
    });
    render(
      <ContractPanel
        actor={actor(true)}
        identity={identity}
        opportunityId="opportunity-one"
        onCompanyContextRejected={() => undefined}
      />,
    );
    fireEvent.change(await screen.findByLabelText('Special conditions'), {
      target: { value: 'Synthetic added conditions' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Contract' }));
    expect(
      await screen.findByText(
        'The result is uncertain. Retry the same Contract command.',
      ),
    ).toBeVisible();
    expect(screen.getByLabelText('Special conditions')).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry the same Contract command' }),
    );
    await screen.findByText('Synthetic accepted scope');
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toEqual(bodies[0]);
  });
  it('runs without Offer or Client read, preserves uncertain retry and reopens immutable attribution', async () => {
    const commands: Array<{ body: unknown; key: string | null }> = [];
    const run = qualityRun();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (init?.method === 'POST') {
        commands.push({
          body: init.body,
          key: new Headers(init.headers).get('idempotency-key'),
        });
        return commands.length === 1 ? response({}, 500) : response(run, 201);
      }
      if (input.toString().endsWith('/quality-checks'))
        return response({ items: [run], nextCursor: null });
      if (input.toString().endsWith('/quality-checks/run-one'))
        return response(run);
      return response({ contract: fixture() });
    });
    render(
      <ContractPanel
        actor={actor(false)}
        identity={identity}
        opportunityId="opportunity-one"
        onCompanyContextRejected={() => undefined}
      />,
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Run Contract Quality Checks',
      }),
    );
    const retryQuality = await screen.findByRole('button', {
      name: 'Retry the same Contract Quality Checks',
    });
    expect(
      screen.getByRole('button', { name: 'Reload Contract' }),
    ).toBeDisabled();
    fireEvent.click(retryQuality);
    expect(
      await screen.findByText('Contract checks completed with warnings.'),
    ).toBeVisible();
    expect(commands[1]).toEqual(commands[0]);
    expect(screen.getByText('2026-10-07T09:00:00.000Z')).toBeVisible();
    expect(screen.getByText('member-one')).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Reopen recorded checks' }),
    );
    fireEvent.click(await screen.findByRole('button', { name: /Reopen run/u }));
    expect(
      await screen.findByText('Contract checks completed with warnings.'),
    ).toBeVisible();
    expect(screen.getAllByText('WARNING')).toHaveLength(1);
  });
  it('retires a run after the Company or Contract Version context is replaced', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      response({
        contract: {
          ...fixture(),
          version: { ...fixture().version, latestQualityRun: qualityRun() },
        },
      }),
    );
    const view = render(
      <ContractPanel
        actor={actor(false)}
        identity={identity}
        opportunityId="opportunity-one"
        onCompanyContextRejected={() => undefined}
      />,
    );
    await screen.findByText('member-one');
    view.rerender(
      <ContractPanel
        actor={actor(false)}
        identity={identity}
        opportunityId="opportunity-two"
        onCompanyContextRejected={() => undefined}
      />,
    );
    await waitFor(() =>
      expect(screen.queryByText('member-one')).not.toBeInTheDocument(),
    );
  });
  it('hides Contract content after Contract authority is revoked', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      response({ contract: fixture() }),
    );
    const current = actor(false);
    const view = render(
      <ContractPanel
        actor={current}
        identity={identity}
        opportunityId="opportunity-one"
        onCompanyContextRejected={() => undefined}
      />,
    );
    await screen.findByText('Synthetic accepted scope');
    view.rerender(
      <ContractPanel
        actor={{
          ...current,
          activeCompany: {
            id: 'company-one',
            displayName: 'Company',
            contractPermissions: [],
            commercialIntakePermissions: ['commercial.opportunity.read'],
          },
        }}
        identity={identity}
        opportunityId="opportunity-one"
        onCompanyContextRejected={() => undefined}
      />,
    );
    await waitFor(() =>
      expect(
        screen.queryByText('Synthetic accepted scope'),
      ).not.toBeInTheDocument(),
    );
  });
});
function actor(prepare: boolean): ActorContext {
  return {
    internalUserId: 'user-one',
    workspaceMembershipId: 'member-one',
    workspaceId: 'workspace-one',
    workspaceName: 'Workspace',
    displayName: 'Reader',
    email: 'reader@example.test',
    active: true,
    workspacePermissions: [],
    activeCompany: {
      id: 'company-one',
      displayName: 'Company',
      contractPermissions: [
        'commercial.contract.read',
        'commercial.contract.prepare',
      ],
      contractPermissionAssignmentId: 'contract-assignment',
      contractPermissionSetVersion: 'v1',
      commercialIntakePermissions: ['commercial.opportunity.read'],
      ...(prepare
        ? {
            clientPermissions: ['client.read'],
            offerPermissions: ['commercial.offer.read'],
          }
        : {}),
    },
  };
}
function signatureActor(): ActorContext {
  const result = actor(false);
  if (!result.activeCompany) throw new Error('Missing Company');
  result.activeCompany.contractPermissions = [
    'commercial.contract.read',
    'commercial.contract.approve',
    'commercial.contract.signature.record',
  ];
  result.activeCompany.contractApproverAssignmentId = 'approver-one';
  result.activeCompany.contractApproverPermissionSetVersion = 'v1';
  return result;
}
function approvedUiFixture() {
  const stored = fixture();
  return {
    ...stored,
    revision: 2,
    version: {
      ...stored.version,
      decisionState: 'APPROVED',
      latestQualityRun: qualityRun(),
      decision: {
        id: 'approval-one',
        contractVersionId: 'version-one',
        revision: 2,
        kind: 'APPROVE',
        actorWorkspaceMembershipId: 'member-one',
        decidedAt: '2026-10-07T09:00:00.000Z',
        qualityRun: qualityRun(),
        acknowledgedWarningCodes: ['ADDED_CONDITIONS_CONFIRMED'],
        representationChecksum: '1'.repeat(64),
      },
    },
  };
}
async function fillSignatureFields() {
  fireEvent.change(await screen.findByLabelText('Provider signatory label'), {
    target: { value: 'Provider declaration' },
  });
  fireEvent.change(screen.getByLabelText('Client signatory label'), {
    target: { value: 'Client declaration' },
  });
  for (const field of ['Provider signing date', 'Client signing date'])
    fireEvent.change(screen.getByLabelText(field), {
      target: { value: '2026-10-07' },
    });
  fireEvent.change(screen.getByLabelText('Signature note'), {
    target: { value: 'Declared note' },
  });
}
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
function fixture() {
  return {
    id: 'contract-one',
    companyId: 'company-one',
    opportunityId: 'opportunity-one',
    kind: 'CONTRACT',
    origin: 'ACCEPTED_OFFER',
    sourceOfferId: 'offer-one',
    sourceOfferVersionId: 'accepted-version',
    sourceOffer: { illustrativeReference: 7, versionNumber: 2 },
    revision: 1,
    illustrativeReference: 1,
    provisional: true,
    version: {
      id: 'version-one',
      versionNumber: 1,
      recipient: {
        kind: 'PRIMARY',
        legalName: 'Synthetic recorded party',
        taxId: 'SYNTHETIC',
        legalAddress: 'Example Street',
      },
      issuingCompanyLabel: 'Company',
      scopeNote: 'Synthetic accepted scope',
      commercialConditions: 'Accepted conditions',
      termStartsOn: null,
      termEndsOn: null,
      specialConditions: 'Synthetic added conditions',
      latestQualityRun: null,
      decisionState: 'PENDING',
      executionState: 'NOT_EXECUTED',
      provenance: 'ILLUSTRATIVE',
      provisional: true,
      pricingSnapshotId: 'snapshot-one',
      pricingSnapshot: {
        id: 'snapshot-one',
        currency: 'EUR',
        subtotal: '300.00',
        taxTotal: '45.00',
        total: '345.00',
        lines: [
          {
            serviceName: 'Illustrative service',
            quantity: '1',
            lineNet: '300.00',
            lineTax: '45.00',
          },
        ],
      },
    },
  };
}
function representation() {
  return {
    contractId: 'contract-one',
    contractVersionId: 'version-one',
    templateCode: 'CONTRACT_ILLUSTRATIVE',
    templateVersion: 1,
    clauseVersions: [
      { code: 'CL_SUBJECT', version: 1 },
      { code: 'CL_PRICE', version: 1 },
      { code: 'CL_TERM', version: 1 },
      { code: 'CL_CONDITIONS', version: 1 },
      { code: 'CL_GENERAL', version: 1 },
    ],
    html: '<!doctype html><html lang="en"><body><p>Illustrative exact document</p></body></html>',
    sha256: '1'.repeat(64),
  };
}

function qualityRun() {
  return {
    id: 'run-one',
    contractVersionId: 'version-one',
    ruleSet: 'CONTRACT_QUALITY_ILLUSTRATIVE',
    ruleSetVersion: 1,
    actorWorkspaceMembershipId: 'member-one',
    evaluatedAt: '2026-10-07T09:00:00.000Z',
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
      { code: 'PROVISIONAL_MARKER_PRESENT', status: 'PASS' },
    ],
  };
}
