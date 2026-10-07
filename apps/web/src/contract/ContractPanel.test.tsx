import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { ContractPanel } from './ContractPanel';
const identity = deterministicBrowserIdentity({
  'x-test-external-subject': 'contract-reader',
});
afterEach(() => vi.restoreAllMocks());
describe('ContractPanel', () => {
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
