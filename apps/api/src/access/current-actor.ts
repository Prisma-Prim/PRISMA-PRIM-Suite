import type { ActiveCompanyContext, ActorContext } from './access.types.js';

/** The public read has one registry-derived grant list, never server projections. */
export type CurrentActor = Omit<ActorContext, 'activeCompany'> & {
  activeCompany?: ActiveCompanyContext;
};

export function currentActor(actor: ActorContext): CurrentActor {
  const { activeCompany: company, ...identity } = actor;
  if (!company) return identity;
  return {
    ...identity,
    activeCompany: {
      id: company.id,
      displayName: company.displayName,
      grants: company.grants,
      paymentObservationReadCapture: company.paymentObservationReadCapture,
      paymentObservationContextCapture:
        company.paymentObservationContextCapture,
      paymentEvidenceContextCapture: company.paymentEvidenceContextCapture,
      paymentEvidenceReferenceReadCapture:
        company.paymentEvidenceReferenceReadCapture,
      invoiceRecordReadCapture: company.invoiceRecordReadCapture,
      offerMessageReadCapture: company.offerMessageReadCapture,
      workingEvidenceClientReadCapture:
        company.workingEvidenceClientReadCapture,
      workingEvidenceContextCapture: company.workingEvidenceContextCapture,
      receivedAddendumClientReadCapture:
        company.receivedAddendumClientReadCapture,
      opportunityFollowUpReadCapture: company.opportunityFollowUpReadCapture,
    },
  };
}
