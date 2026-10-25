import type { ActorContext } from '../access/access.types.js';
import type { LockedClientLegalRecipient } from '../client/client-operational-reference.service.js';
import { contracts, contractVersions } from '../database/schema/index.js';
import type { readModelContractCase } from './model-contract-case.js';
import {
  renderModelContractRepresentation,
  type ApprovedContractModelSource,
  type ModelContractOfferSource,
} from './model-contract-representation.js';

/** One complete immutable Version from owner-validated inputs; no live lookups. */
export function modelContractVersionValues(input: {
  actor: ActorContext;
  contract: typeof contracts.$inferSelect;
  previous: typeof contractVersions.$inferSelect | null;
  createdAt: Date;
  modelSource: ApprovedContractModelSource;
  offerSource: ModelContractOfferSource;
  caseDetails: ReturnType<typeof readModelContractCase>;
  recipient: LockedClientLegalRecipient;
}) {
  const {
    actor,
    contract,
    previous,
    createdAt,
    modelSource,
    offerSource,
    caseDetails,
    recipient,
  } = input;
  const copied = recipient.recipient;
  const versionNumber = (previous?.versionNumber ?? 0) + 1;
  const representation = renderModelContractRepresentation({
    modelSource,
    offerSource,
    caseDetails,
    recipient: copied,
    illustrativeReference: contract.illustrativeReference,
    versionNumber,
    createdAt: createdAt.toISOString(),
  });
  return {
    workspaceId: actor.workspaceId,
    companyId: contract.companyId,
    contractId: contract.id,
    opportunityId: contract.opportunityId,
    versionNumber,
    createdContractRevision: contract.revision,
    predecessorVersionId: previous?.id ?? null,
    createdByInternalUserId: actor.internalUserId,
    createdByWorkspaceMembershipId: actor.workspaceMembershipId,
    createdAt,
    sourceOfferVersionId: offerSource.offerVersionId,
    recipientClientAccountId: recipient.currentClientAccountId,
    recipientKind: copied.kind,
    recipientAdditionalLegalEntityId:
      copied.kind === 'ADDITIONAL' ? copied.additionalLegalEntityId : null,
    recipientLegalName: copied.legalName,
    recipientTaxId: copied.taxId,
    recipientLegalAddress: copied.legalAddress,
    issuingCompanyLabel: actor.activeCompany?.displayName ?? '',
    scopeNote: offerSource.scopeNote,
    commercialConditions: offerSource.commercialConditions,
    termStartsOn: caseDetails.termStartsOn,
    termEndsOn: caseDetails.termEndsOn,
    specialConditions: caseDetails.specialConditions,
    templateCode: 'COMPANY_CONSULTING_CONTRACT_RO',
    templateVersion: 1,
    clauseVersions: [],
    provenance: 'COMPANY_MODEL_OFFER',
    modelSourceId: modelSource.modelId,
    modelSourceVersionId: modelSource.versionId,
    modelSourceVersionNumber: modelSource.versionNumber,
    modelSourceDecisionId: modelSource.approvalDecisionId,
    modelSourceDecisionOutcome: 'APPROVE',
    modelGenerationSnapshot: {
      modelSource,
      offerSource,
      caseDetails,
      financials: offerSource.financials,
      representation,
    },
  } satisfies typeof contractVersions.$inferInsert;
}
