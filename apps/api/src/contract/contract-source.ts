import type { contracts, contractVersions } from '../database/schema/index.js';
export type ContractEventSource =
  | { kind: 'DIRECT' }
  | {
      kind: 'ACCEPTED_OFFER';
      contractKind: 'CONTRACT' | 'PRECONTRACT';
      offerVersionId: string;
    }
  | {
      kind: 'OFFER_PREPARATION';
      contractKind: 'CONTRACT';
      offerVersionId: string;
    }
  | {
      kind: 'COMPANY_MODEL_OFFER';
      contractKind: 'CONTRACT';
      offerVersionId: string;
      modelVersionId: string;
      modelVersionNumber: number;
      modelApprovalDecisionId: string;
      rendererVersion: 1;
      contractRevision: number;
    }
  | { kind: 'ADDENDUM'; parentContractId: string; addendumOrdinal: number };
export function contractSource(
  contract: typeof contracts.$inferSelect,
  version?: typeof contractVersions.$inferSelect,
): ContractEventSource {
  if (
    contract.kind === 'CONTRACT' &&
    contract.origin === 'COMPANY_MODEL_OFFER' &&
    contract.sourceOfferId &&
    version?.sourceOfferVersionId &&
    version.provenance === 'COMPANY_MODEL_OFFER' &&
    version.modelSourceVersionId &&
    version.modelSourceVersionNumber &&
    version.modelSourceDecisionId
  ) {
    return {
      kind: 'COMPANY_MODEL_OFFER',
      contractKind: 'CONTRACT',
      offerVersionId: version.sourceOfferVersionId,
      modelVersionId: version.modelSourceVersionId,
      modelVersionNumber: version.modelSourceVersionNumber,
      modelApprovalDecisionId: version.modelSourceDecisionId,
      rendererVersion: 1,
      contractRevision: contract.revision,
    };
  }
  if (
    (contract.kind === 'CONTRACT' || contract.kind === 'PRECONTRACT') &&
    contract.parentContractId === null &&
    contract.addendumOrdinal === null
  ) {
    if (
      contract.kind === 'CONTRACT' &&
      contract.origin === 'DIRECT' &&
      contract.sourceOfferId === null &&
      contract.sourceOfferVersionId === null &&
      contract.directReason !== null &&
      contract.directReason.trim() &&
      contract.directReason.length <= 500
    )
      return { kind: 'DIRECT' };
    if (
      (contract.origin === 'ACCEPTED_OFFER' ||
        (contract.kind === 'CONTRACT' &&
          contract.origin === 'OFFER_PREPARATION' &&
          version?.sourceOfferVersionId)) &&
      contract.sourceOfferId &&
      contract.sourceOfferVersionId &&
      contract.directReason === null &&
      (contract.kind === 'CONTRACT' || contract.precontractId === null)
    )
      return contract.origin === 'OFFER_PREPARATION' &&
        version?.sourceOfferVersionId
        ? {
            kind: 'OFFER_PREPARATION',
            contractKind: 'CONTRACT',
            offerVersionId: version.sourceOfferVersionId,
          }
        : {
            kind: 'ACCEPTED_OFFER',
            contractKind: contract.kind,
            offerVersionId: contract.sourceOfferVersionId,
          };
  }
  if (
    contract.kind === 'ADDENDUM' &&
    contract.origin === null &&
    contract.sourceOfferId === null &&
    contract.sourceOfferVersionId === null &&
    contract.directReason === null &&
    contract.precontractId === null &&
    contract.parentContractId &&
    contract.addendumOrdinal !== null &&
    contract.addendumOrdinal > 0
  )
    return {
      kind: 'ADDENDUM',
      parentContractId: contract.parentContractId,
      addendumOrdinal: contract.addendumOrdinal,
    };
  throw new Error('Invalid stored Contract source.');
}
