import type { ActorContext } from '../access-types';
import { syntheticContent } from '../contract-model/contract-model.fixture';
import {
  modelOfferActor,
  modelOfferFixture,
} from '../offer/model-offer.fixture';
import { modelContractRules } from './model-contract-quality-response';
import { modelOfferQualityCodes } from '../offer/offer-response';

export const modelContractActor: ActorContext = {
  ...modelOfferActor,
  workspaceId: '00000000-0000-4000-8000-000000000868',
  activeCompany: {
    ...modelOfferActor.activeCompany,
    id: modelOfferFixture().companyId,
    displayName: 'Synthetic Contract Company',
    contractPermissionSetVersion: 'v2',
    contractPermissionAssignmentId: 'contract-preparer-868',
    contractApproverPermissionSetVersion: 'v2',
    contractApproverAssignmentId: 'contract-approver-868',
    contractPermissions: [
      'commercial.contract.read',
      'commercial.contract.prepare',
      'commercial.contract.approve',
      'commercial.contract.project.link',
      'commercial.contract.signature.record',
      'commercial.contract.model.select',
      'commercial.contract.model_based.prepare',
      'commercial.contract.model_based.approve',
    ],
  },
};
export const selectedContractModelFixture = {
  kind: 'APPROVED_COMPANY_CONTRACT_MODEL',
  modelId: '40000000-0000-4000-8000-000000000868',
  versionId: '50000000-0000-4000-8000-000000000868',
  versionNumber: 1,
  code: 'INTEGRATED_MANAGEMENT_CONSULTING_CONTRACT_RO',
  language: 'ro',
  approvalDecisionId: '60000000-0000-4000-8000-000000000868',
  approvedAt: '2026-10-24T08:00:00.000Z',
  approvedBy: {
    workspaceMembershipId: '70000000-0000-4000-8000-000000000868',
    internalUserId: '80000000-0000-4000-8000-000000000868',
  },
  content: {
    ...syntheticContent,
    issuer: modelOfferFixture().version.modelSource.content.issuer,
    serviceTitle: modelOfferFixture().version.modelSource.content.serviceTitle,
    frameworks: modelOfferFixture().version.modelSource.content.frameworks,
  },
};
export function modelContractFixture() {
  const offer = modelOfferFixture(),
    v = offer.version,
    { content, ...stamp } = v.modelSource;
  const financials = {
    netAmount: v.financialDeclaration.netAmount,
    taxAmount: v.financialDeclaration.taxAmount,
    grossAmount: v.financialDeclaration.grossAmount,
    taxLabel: v.financialDeclaration.taxLabel,
    currency: v.financialDeclaration.currency,
  };
  const recipient = {
    ...v.recipient,
    taxId: 'SYNTHETIC-WEB-868',
    legalAddress: 'Synthetic case address',
  };
  const offerSource = {
    workspaceId: modelContractActor.workspaceId,
    companyId: offer.companyId,
    opportunityId: offer.opportunityId,
    originalClientAccountId: '10000000-0000-4000-8000-000000000868',
    clientRequestId: '20000000-0000-4000-8000-000000000868',
    offerId: offer.id,
    offerVersionId: v.id,
    offerVersionNumber: 1,
    illustrativeReference: 1,
    representationSha256: v.representation.sha256,
    recipient,
    scopeNote: v.scopeNote,
    commercialConditions: v.commercialConditions,
    model: {
      modelId: stamp.modelId,
      versionId: stamp.versionId,
      versionNumber: stamp.versionNumber,
      approvalDecisionId: stamp.approvalDecisionId,
      approvedAt: stamp.approvedAt,
      approvedBy: stamp.approvedBy,
      issuer: content.issuer,
      serviceTitle: content.serviceTitle,
      frameworks: content.frameworks,
    },
    priceSource: v.priceSource,
    financials,
  };
  return {
    id: '30000000-0000-4000-8000-000000000868',
    companyId: offer.companyId,
    opportunityId: offer.opportunityId,
    clientRequestId: offerSource.clientRequestId,
    originalClientAccountId: offerSource.originalClientAccountId,
    kind: 'CONTRACT',
    origin: 'COMPANY_MODEL_OFFER',
    sourceOfferId: offer.id,
    sourceOfferVersionId: v.id,
    sourceOffer: {
      id: offer.id,
      versionId: v.id,
      versionNumber: 1,
      illustrativeReference: 1,
    },
    parentContractId: null,
    addendumOrdinal: null,
    precontract: null,
    parent: null,
    addenda: [],
    linkedProjects: [],
    illustrativeReference: 1,
    revision: 1,
    provisional: true,
    eligibility: 'NON_OFFICIAL_REHEARSAL',
    createdAt: '2026-10-24T09:00:00.000Z',
    createdByWorkspaceMembershipId: modelContractActor.workspaceMembershipId,
    version: {
      id: '90000000-0000-4000-8000-000000000868',
      sourceOfferVersionId: v.id,
      versionNumber: 1,
      createdContractRevision: 1,
      predecessorVersionId: null,
      supersededByVersionId: null,
      supersededAt: null,
      differences: [],
      representation: {
        rendererCode: 'COMPANY_CONSULTING_CONTRACT_RO',
        rendererVersion: 1,
        html: '<!doctype html><html lang="ro"><body>Contract neoficial — nesemnat</body></html>',
        sha256: 'b'.repeat(64),
      },
      modelGeneration: {
        modelSource: selectedContractModelFixture,
        offerSource,
        caseDetails: {
          documentDate: '2026-10-24',
          clientDetails: ' Literal case requisites ☀️ ',
          termStartsOn: null,
          termEndsOn: null,
          specialConditions: null,
          sourceConcordanceDeclaration: true,
          sourceConcordanceBasis: ' Literal concordance basis ',
        },
        financials,
      },
      decision: null,
      signature: null,
      latestQualityRun: null,
      recipient,
      issuingCompanyLabel: 'Synthetic Contract Company',
      scopeNote: v.scopeNote,
      commercialConditions: v.commercialConditions,
      termStartsOn: null,
      termEndsOn: null,
      specialConditions: null,
      preliminaryWork: null,
      changeSummary: null,
      pricingSnapshotId: null,
      pricingSnapshot: null,
      decisionState: 'PENDING',
      executionState: 'NOT_EXECUTED',
      qualityRuleSet: 'CONTRACT_QUALITY_COMPANY_MODEL',
      qualityRuleSetVersion: 1,
      provenance: 'COMPANY_MODEL_OFFER',
      provisional: true,
      createdAt: '2026-10-24T09:00:00.000Z',
      createdByWorkspaceMembershipId: modelContractActor.workspaceMembershipId,
    },
  };
}

export function modelContractQualityFixture() {
  const contract = modelContractFixture();
  return {
    id: '10000000-0000-4000-8000-000000000869',
    contractVersionId: contract.version.id,
    ruleSet: 'CONTRACT_QUALITY_COMPANY_MODEL',
    ruleSetVersion: 1,
    actorWorkspaceMembershipId: modelContractActor.workspaceMembershipId,
    evaluatedAt: '2026-10-24T09:01:00.000Z',
    results: Object.keys(modelContractRules).map((code) => ({
      code,
      status:
        code === 'MODEL_WORDING_REVIEWED' || code === 'ANNEX_SCOPE_REVIEWED'
          ? 'WARNING'
          : 'PASS',
    })),
  };
}
export function modelContractApprovalFixture() {
  const c = modelContractFixture(),
    qualityRun = modelContractQualityFixture();
  return {
    id: '20000000-0000-4000-8000-000000000869',
    contractVersionId: c.version.id,
    revision: 2,
    actorWorkspaceMembershipId: modelContractActor.workspaceMembershipId,
    decidedAt: qualityRun.evaluatedAt,
    kind: 'APPROVE',
    reviewBasis: ' Synthetic exact Contract and annex review ',
    representationChecksum: c.version.representation.sha256,
    qualityRun,
    acknowledgedWarningCodes: [
      'ANNEX_SCOPE_REVIEWED',
      'MODEL_WORDING_REVIEWED',
    ],
  };
}
export function modelContractSourceOfferFixture() {
  const offer = modelOfferFixture(),
    version = offer.version,
    instant = '2026-10-24T09:00:00.000Z';
  const qualityRun = {
    id: '30000000-0000-4000-8000-000000000869',
    offerVersionId: version.id,
    ruleSet: 'OFFER_QUALITY_COMPANY_MODEL',
    ruleSetVersion: 1,
    actorWorkspaceMembershipId: modelContractActor.workspaceMembershipId,
    evaluatedAt: instant,
    results: modelOfferQualityCodes.map((code) => ({
      code,
      status: [
        'DECLARED_TAX_UNVERIFIED',
        'NON_OFFICIAL_OFFER',
        'ILLUSTRATIVE_MODEL',
      ].includes(code)
        ? 'WARNING'
        : 'PASS',
    })),
  };
  const decision = {
    id: '40000000-0000-4000-8000-000000000869',
    offerVersionId: version.id,
    offerRevision: 2,
    actorWorkspaceMembershipId: modelContractActor.workspaceMembershipId,
    decidedAt: instant,
    state: 'APPROVED',
    qualityRun,
    acknowledgedWarningCodes: [
      'DECLARED_TAX_UNVERIFIED',
      'NON_OFFICIAL_OFFER',
      'ILLUSTRATIVE_MODEL',
    ],
    representationSha256: version.representation.sha256,
  };
  const transmission = {
    id: '50000000-0000-4000-8000-000000000869',
    offerVersionId: version.id,
    offerRevision: 3,
    actorWorkspaceMembershipId: modelContractActor.workspaceMembershipId,
    transmittedAt: instant,
    channel: 'SIMULATED',
    note: null,
    qualityRun,
    acknowledgedWarningCodes: [],
    representationSha256: version.representation.sha256,
  };
  return {
    ...offer,
    revision: 3,
    version: {
      ...version,
      recipient: modelContractFixture().version.recipient,
      decisionState: 'APPROVED',
      decision,
      transmissionState: 'TRANSMITTED',
      transmission,
      clientResponseState: 'PENDING',
      clientResponse: null,
    },
  };
}
