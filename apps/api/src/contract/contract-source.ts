import type { contracts } from '../database/schema/index.js';
export type ContractEventSource =
  | { kind: 'DIRECT' }
  | { kind: 'ACCEPTED_OFFER'; offerVersionId: string }
  | { kind: 'ADDENDUM'; parentContractId: string; addendumOrdinal: number };
export function contractSource(
  contract: typeof contracts.$inferSelect,
): ContractEventSource {
  if (
    contract.kind === 'CONTRACT' &&
    contract.parentContractId === null &&
    contract.addendumOrdinal === null
  ) {
    if (
      contract.origin === 'DIRECT' &&
      contract.sourceOfferId === null &&
      contract.sourceOfferVersionId === null &&
      contract.directReason !== null &&
      contract.directReason.trim() &&
      contract.directReason.length <= 500
    )
      return { kind: 'DIRECT' };
    if (
      contract.origin === 'ACCEPTED_OFFER' &&
      contract.sourceOfferId &&
      contract.sourceOfferVersionId &&
      contract.directReason === null
    )
      return {
        kind: 'ACCEPTED_OFFER',
        offerVersionId: contract.sourceOfferVersionId,
      };
  }
  if (
    contract.kind === 'ADDENDUM' &&
    contract.origin === null &&
    contract.sourceOfferId === null &&
    contract.sourceOfferVersionId === null &&
    contract.directReason === null &&
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
