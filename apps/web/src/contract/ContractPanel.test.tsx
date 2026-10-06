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
