import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';

const documentTarget = {
  type: 'document',
  documentId: 'document-1',
  documentTitle: 'Chestionar de evaluare inițială — GRUP Demo SA',
  companyId: 'company-1',
};
const approverTarget = {
  type: 'company_role_assignment',
  assignmentId: 'assignment-1',
  companyId: 'company-1',
  companyDisplayName: 'PRISMA-PRIM',
  workspaceMembershipId: 'membership-2',
  internalUserId: 'user-2',
  internalUserDisplayName: 'Document Approver',
};

beforeEach(() => {
  window.history.replaceState(null, '', '/?frame=classic');
});
afterEach(() => vi.unstubAllGlobals());

it.each([
  [
    'document.version.drafted',
    { versionNumber: 2, sourceVersionNumber: 1 },
    documentTarget,
    'started a new draft Document Version',
    'Target: Working Document: Chestionar de evaluare inițială — GRUP Demo SA',
  ],
  [
    'document.version.designated_official',
    { versionNumber: 2, supersededVersionNumber: 1 },
    documentTarget,
    'designated an official Document Version',
    'Target: Working Document: Chestionar de evaluare inițială — GRUP Demo SA',
  ],
  [
    'company_document_approver_assignment.granted',
    { bundle: 'Company Document Approver' },
    approverTarget,
    'granted Company Document Approver',
    'Target: Document Approver — PRISMA-PRIM',
  ],
  [
    'company_document_approver_assignment.revoked',
    { bundle: 'Company Document Approver' },
    approverTarget,
    'revoked Company Document Approver',
    'Target: Document Approver — PRISMA-PRIM',
  ],
] as const)(
  'labels the %s Activity Log event from centralized copy',
  async (action, metadata, target, label, targetLabel) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input.toString();
        return Response.json(
          url.endsWith('/companies')
            ? []
            : url.endsWith('/activity-log')
              ? {
                  events: [
                    {
                      id: `event-${action}`,
                      action,
                      occurredAt: '2026-09-26T08:00:00.000Z',
                      actor: {
                        internalUserId: 'owner-1',
                        displayName: 'Workspace Owner',
                      },
                      target,
                      metadata,
                    },
                  ],
                }
              : {
                  internalUserId: 'owner-1',
                  displayName: 'Workspace Owner',
                  email: 'owner@example.test',
                  workspaceName: 'PRISMA Workspace',
                  workspacePermissions: ['company.manage'],
                },
        );
      }),
    );
    render(<App identity={deterministicBrowserIdentity()} />);
    expect(
      await screen.findByText(`Workspace Owner ${label}`),
    ).toBeInTheDocument();
    expect(screen.getByText(targetLabel)).toBeInTheDocument();
  },
);
