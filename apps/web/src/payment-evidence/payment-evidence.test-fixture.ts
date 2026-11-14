import type { ActorContext } from '../access-types';
import { companyGrants } from '../access/company-grants.test-fixture';
export const paymentEvidenceIds = {
  company: '10000000-0000-4000-8000-000000000001',
  client: '10000000-0000-4000-8000-000000000002',
  entity: '10000000-0000-4000-8000-000000000003',
  user: '10000000-0000-4000-8000-000000000004',
  membership: '10000000-0000-4000-8000-000000000005',
  workspace: '10000000-0000-4000-8000-000000000006',
  document: '10000000-0000-4000-8000-000000000007',
  version: '10000000-0000-4000-8000-000000000008',
};
export function paymentEvidenceActor() {
  const result = {
    internalUserId: paymentEvidenceIds.user,
    workspaceMembershipId: paymentEvidenceIds.membership,
    workspaceId: paymentEvidenceIds.workspace,
    workspaceName: 'Fictional Workspace',
    displayName: 'Fictional Recorder',
    email: 'fictional@example.test',
    active: true as const,
    workspacePermissions: ['client.manage' as const],
    activeCompany: {
      id: paymentEvidenceIds.company,
      displayName: 'Fictional Company',
      clientPermissions: ['client.read' as const],
      clientPermissionAssignmentId: '10000000-0000-4000-8000-000000000009',
      clientPermissionSetVersion: 'v2' as const,
      documentPermissionAssignmentId: '10000000-0000-4000-8000-000000000010',
      documentPermissionSetVersion: 'v3' as const,
      documentPermissions: [
        'document.read',
        'document.register',
        'document.reference.read',
        'document.correct',
        'document.version.manage',
        'document.version.designate_official',
        'document.content.read',
        'document.content.upload',
      ] satisfies NonNullable<
        ActorContext['activeCompany']
      >['documentPermissions'],
      documentApproverAssignmentId: '10000000-0000-4000-8000-000000000011',
      documentApproverPermissionSetVersion: 'v1' as const,
      documentContentReaderAssignmentId: '10000000-0000-4000-8000-000000000012',
      documentContentReaderPermissionSetVersion: 'v1' as const,
      documentContentUploaderAssignmentId:
        '10000000-0000-4000-8000-000000000013',
      documentContentUploaderPermissionSetVersion: 'v1' as const,
      // The Document area reads these grants; the legacy fields above stay
      // for Payment Evidence until it reads its grants too.
      grants: companyGrants(
        {
          bundle: 'company_director_client_access',
          version: 'v2',
          assignmentId: '10000000-0000-4000-8000-000000000009',
        },
        {
          bundle: 'company_document_registrar',
          version: 'v3',
          assignmentId: '10000000-0000-4000-8000-000000000010',
        },
        {
          bundle: 'company_document_approver',
          version: 'v1',
          assignmentId: '10000000-0000-4000-8000-000000000011',
        },
        {
          bundle: 'company_document_content_reader',
          version: 'v1',
          assignmentId: '10000000-0000-4000-8000-000000000012',
        },
        {
          bundle: 'company_document_content_uploader',
          version: 'v1',
          assignmentId: '10000000-0000-4000-8000-000000000013',
        },
      ),
      paymentGrants: [
        {
          bundle: 'company_payment_reader',
          assignmentId: '10000000-0000-4000-8000-000000000014',
          permissionSetVersion: 'v1',
        },
        {
          bundle: 'company_payment_recorder',
          assignmentId: '10000000-0000-4000-8000-000000000015',
          permissionSetVersion: 'v1',
        },
        {
          bundle: 'company_payment_evidence_access',
          assignmentId: '10000000-0000-4000-8000-000000000016',
          permissionSetVersion: 'v1',
        },
      ],
      paymentEvidenceContextCapture:
        'payment-evidence-context.v1.' + 'a'.repeat(64),
      paymentEvidenceReferenceReadCapture:
        'payment-evidence-reference-read.v1.' + 'b'.repeat(64),
    },
  };
  return result;
}
export function paymentEvidenceDocument() {
  return {
    id: paymentEvidenceIds.document,
    companyId: paymentEvidenceIds.company,
    clientId: paymentEvidenceIds.client,
    clientDisplayName: 'Fictional original Client',
    title: 'Fictional notice',
    purpose: 'Preserve original source',
    type: 'payment-evidence',
    confidentiality: 'company-confidential',
    createdAt: '2026-01-15T09:00:00.000Z',
    createdByMembershipId: paymentEvidenceIds.membership,
    workingRevision: 1,
    correction: 'allowed',
    version: {
      id: paymentEvidenceIds.version,
      status: 'draft',
      representation: null,
    },
    paymentEvidenceSource: {
      format: 'PAYMENT_EVIDENCE_SOURCE/1',
      receivingCompanyLabel: 'Fictional Company',
      sourceDescription: 'Fictional manual notice',
      receivedOn: null,
      registeredAt: '2026-01-15T09:00:00.000Z',
      registeredBy: {
        workspaceMembershipId: paymentEvidenceIds.membership,
        internalUserId: paymentEvidenceIds.user,
      },
      payer: {
        kind: 'AVAILABLE',
        party: {
          kind: 'PRIMARY',
          legalName: 'Fictional original Client',
          taxId: null,
          legalAddress: null,
        },
      },
    },
  };
}
