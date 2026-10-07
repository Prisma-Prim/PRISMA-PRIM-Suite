import { fireEvent, render, screen } from './test/render-with-interface-locale';
import { afterEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import type { ActorContext } from './access-types';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});
it('opens a recorded Contract from its Request without Offer or Client authority', async () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(
      (query: string) =>
        ({
          matches: true,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(() => false),
        }) satisfies MediaQueryList,
    ),
  );
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/?frame=prisme#requests');
  const company = { id: 'company-one', displayName: 'Company' };
  const actor: ActorContext = {
    internalUserId: 'user-one',
    workspaceMembershipId: 'member-one',
    workspaceId: 'workspace-one',
    workspaceName: 'Workspace',
    displayName: 'Reader',
    email: 'reader@example.test',
    active: true,
    workspacePermissions: [],
    activeCompany: {
      ...company,
      clientPermissions: [],
      contractPermissions: ['commercial.contract.read'],
      contractPermissionAssignmentId: 'contract-grant',
      contractPermissionSetVersion: 'v1',
      commercialIntakePermissions: [
        'commercial.request.read',
        'commercial.request.create',
        'commercial.opportunity.read',
        'commercial.opportunity.create',
      ],
      commercialIntakePermissionAssignmentId: 'intake-grant',
      commercialIntakePermissionSetVersion: 'v1',
    },
  };
  const detail = {
    id: 'request-one',
    companyId: company.id,
    sourceKind: 'MANUAL_TEXT',
    sourceLabel: null,
    reportedReceivedAt: null,
    subject: 'Contract Request',
    originalText: 'Recorded request evidence',
    capturedByWorkspaceMembershipId: 'member-one',
    capturedAt: '2026-10-03T06:00:00.000Z',
    version: 1,
    clientAssociationStatus: 'hidden',
    initialOpportunity: {
      id: 'opportunity-one',
      title: 'Opportunity',
      scope: null,
      nextAction: 'Read Contract',
      status: 'OPEN',
      responsibleWorkspaceMembershipId: 'member-one',
      responsibleActor: {
        workspaceMembershipId: 'member-one',
        displayName: 'Reader',
      },
      createdAt: '2026-10-03T06:00:00.000Z',
      version: 1,
    },
  };
  const paths: string[] = [];
  let denyRepresentation = false;
  let latestActor = actor;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = input.toString();
      paths.push(path);
      if (path.endsWith('/access/current-actor'))
        return Response.json(latestActor);
      if (
        path.endsWith(
          '/contracts/opportunities/opportunity-one/versions/version-one/representation',
        )
      ) {
        if (denyRepresentation) return Response.json({}, { status: 403 });
        return Response.json({
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
          html: '<html lang="en"><body>Recorded Contract bytes</body></html>',
          sha256: 'a'.repeat(64),
        });
      }
      if (path.endsWith('/companies')) return Response.json([company]);
      if (path.includes('/commercial-intake/requests?'))
        return Response.json({
          items: [
            {
              id: detail.id,
              subject: detail.subject,
              capturedAt: detail.capturedAt,
              initialOpportunity: {
                title: 'Opportunity',
                nextAction: 'Read Contract',
                responsibleActor: detail.initialOpportunity.responsibleActor,
              },
            },
          ],
        });
      if (path.endsWith('/commercial-intake/requests/request-one'))
        return Response.json(detail);
      if (path.endsWith('/contracts/opportunities/opportunity-one'))
        return Response.json({
          contract: {
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
          },
        });
      if (path.endsWith('/activity-log')) return Response.json({ events: [] });
      return Response.json({}, { status: 599 });
    }),
  );
  render(<App identity={deterministicBrowserIdentity()} />);
  fireEvent.click(
    await screen.findByRole('button', { name: /^Contract Request/u }),
  );
  expect(await screen.findByText('Synthetic accepted scope')).toBeVisible();
  expect(screen.getByText('Source Offer')).toBeVisible();
  expect(
    screen.getByText('Illustrative reference 7 · version 2'),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Create Contract' }),
  ).not.toBeInTheDocument();
  expect(paths.some((path) => path.includes('/contracts/'))).toBe(true);
  expect(
    paths.some(
      (path) => path.includes('/offers/') || path.includes('/clients/'),
    ),
  ).toBe(false);
  fireEvent.click(
    screen.getByRole('button', { name: 'Open exact Contract document' }),
  );
  expect(
    await screen.findByTitle('Illustrative Contract document'),
  ).toHaveAttribute(
    'srcdoc',
    '<html lang="en"><body>Recorded Contract bytes</body></html>',
  );
  expect(screen.getByText('a'.repeat(64))).toBeVisible();
  denyRepresentation = true;
  latestActor = {
    ...actor,
    activeCompany: {
      ...actor.activeCompany,
      ...company,
      contractPermissions: [],
    },
  };
  fireEvent.click(
    screen.getByRole('button', { name: 'Reload exact Contract document' }),
  );
  await screen.findByText('Recorded request evidence');
  expect(
    screen.queryByTitle('Illustrative Contract document'),
  ).not.toBeInTheDocument();
  expect(screen.queryByText('a'.repeat(64))).not.toBeInTheDocument();
});
