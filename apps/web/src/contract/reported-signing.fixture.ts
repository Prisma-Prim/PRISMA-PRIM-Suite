import type { ActorContext } from '../access-types';
import {
  modelContractActor,
  modelContractApprovalFixture,
  modelContractFixture,
  modelContractQualityFixture,
} from './model-contract.fixture';

export const signingActor: ActorContext = {
  ...modelContractActor,
  activeCompany: {
    ...modelContractActor.activeCompany,
    id: modelContractFixture().companyId,
    displayName: 'Reported signing DEMO',
    clientPermissions: ['client.read'],
    clientPermissionAssignmentId: 'client-877',
    clientPermissionSetVersion: 'v2',
    commercialIntakePermissions: [
      'commercial.request.read',
      'commercial.opportunity.read',
    ],
    commercialIntakePermissionAssignmentId: 'intake-877',
    commercialIntakePermissionSetVersion: 'v4',
    contractSignatureDeclarerAssignmentId: 'declarer-877',
    contractSignatureDeclarerPermissionSetVersion: 'v1',
    documentPermissionAssignmentId: 'documents-877',
    documentPermissionSetVersion: 'v3',
    documentPermissions: [
      'document.read',
      'document.content.read',
      'document.received_contract.access',
    ],
    receivedContractAccessAssignmentId: 'received-877',
    receivedContractAccessPermissionSetVersion: 'v1',
    documentContentReaderAssignmentId: 'content-877',
    documentContentReaderPermissionSetVersion: 'v1',
  },
};
export const signingPdf = {
  documentId: '10000000-0000-4000-8000-000000000877',
  documentVersionId: '20000000-0000-4000-8000-000000000877',
  documentVersionNumber: 1,
  title: 'Exact received Contract DEMO',
  status: 'official',
  representationId: '30000000-0000-4000-8000-000000000877',
  fileName: 'received-demo.pdf',
  mediaType: 'application/pdf',
  size: 595,
  sha256: 'd'.repeat(64),
  scanOutcome: 'clean',
  scanEngine: 'Synthetic boundary scanner',
  scannedAt: '2026-10-24T09:00:00.000Z',
  storedAt: '2026-10-24T09:00:00.000Z',
  storedByMembershipId: signingActor.workspaceMembershipId,
};
export const signingIntent = {
  expectedContractRevision: 2,
  documentId: signingPdf.documentId,
  documentVersionId: signingPdf.documentVersionId,
  representationId: signingPdf.representationId,
  providerSignatory: {
    label: '  Provider 😀 / Știință  ',
    signedOn: '2026-01-01',
    mandate: { kind: 'UNKNOWN' },
  },
  clientSignatory: {
    label: ' Client literal ',
    signedOn: null,
    mandate: {
      kind: 'DECLARED_UNVERIFIED',
      basis: '  Literal unverified mandate  ',
    },
  },
  concordanceBasis: ' Exact PDF / Contract / Offer compared literally ',
  acceptanceBasis: ' Literal case acceptance statement ',
  acknowledgedWarningCodes: ['ANNEX_SCOPE_REVIEWED', 'MODEL_WORDING_REVIEWED'],
};
export function approvedSigningContract() {
  const contract = modelContractFixture();
  return {
    ...contract,
    revision: 2,
    version: {
      ...contract.version,
      decisionState: 'APPROVED',
      decision: modelContractApprovalFixture(),
      latestQualityRun: modelContractQualityFixture(),
    },
  };
}
export function reportedSigningFixture() {
  const contract = approvedSigningContract(),
    quality = {
      ...modelContractQualityFixture(),
      id: '40000000-0000-4000-8000-000000000877',
      evaluatedAt: '2026-10-24T10:00:00.000Z',
    };
  return {
    id: '50000000-0000-4000-8000-000000000877',
    contractId: contract.id,
    contractVersionId: contract.version.id,
    versionNumber: 1,
    revision: 3,
    evidenceKind: 'DECLARED_RECEIVED_PDF',
    provenance: 'COMPANY_MODEL_OFFER',
    provisional: true,
    caseAcceptance: 'DECLARED',
    providerSignatory: signingIntent.providerSignatory,
    clientSignatory: signingIntent.clientSignatory,
    concordanceBasis: signingIntent.concordanceBasis,
    acceptanceBasis: signingIntent.acceptanceBasis,
    acknowledgedWarningCodes: signingIntent.acknowledgedWarningCodes,
    actorWorkspaceMembershipId: signingActor.workspaceMembershipId,
    actorInternalUserId: signingActor.internalUserId,
    recordedAt: quality.evaluatedAt,
    approvalDecisionId: contract.version.decision.id,
    representationChecksum: contract.version.representation.sha256,
    qualityRun: quality,
    pdf: { access: 'granted', reference: signingPdf },
  };
}
