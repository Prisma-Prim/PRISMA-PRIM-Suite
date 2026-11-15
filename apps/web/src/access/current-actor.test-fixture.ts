import { companyGrants } from './company-grants.test-fixture';
import type { ActorContext } from './current-actor';

// A complete wire example also keeps every optional Company field in coverage.
export const completeActor = {
  internalUserId: 'sample',
  workspaceMembershipId: 'sample',
  workspaceId: 'sample',
  workspaceName: 'sample',
  displayName: 'sample',
  email: 'sample',
  active: true,
  workspacePermissions: ['company.manage'],
  activeCompany: {
    id: 'sample',
    displayName: 'sample',
    grants: companyGrants(
      {
        bundle: 'company_context_access',
        version: null,
        assignmentId: 'sample-context',
      },
      {
        bundle: 'company_director_client_access',
        version: 'v1',
        assignmentId: 'sample-client',
      },
      {
        bundle: 'company_project_access',
        version: 'v1',
        assignmentId: 'sample-project',
      },
    ),
    workingEvidenceClientReadCapture: { version: 'future', arbitrary: null },
    workingEvidenceContextCapture: { version: 'future', arbitrary: null },
    receivedAddendumClientReadCapture: 'sample-addendum-client-read',
    paymentObservationReadCapture: { version: 'future', arbitrary: null },
    paymentObservationContextCapture: { version: 'future', arbitrary: null },
    paymentEvidenceContextCapture: { version: 'future', arbitrary: null },
    paymentEvidenceReferenceReadCapture: { version: 'future', arbitrary: null },
    invoiceRecordReadCapture: { version: 'future', arbitrary: null },
    offerMessageReadCapture: { version: 'future', arbitrary: null },
    opportunityFollowUpReadCapture: { version: 'future', arbitrary: null },
  },
} satisfies ActorContext & {
  activeCompany: Required<NonNullable<ActorContext['activeCompany']>>;
};
