import type { ActiveCompanyContext } from '../access/access.types.js';
import { canReadCommercialTarget } from '../commercial-intake/commercial-intake.read-predicate.js';

/**
 * The complete Offer read prerequisite of section 18.6 as the Offer reads
 * enforce it: `commercial.offer.read` together with the Commercial Intake read
 * of the owning Opportunity and its Request. Neither side suffices alone, so
 * partial authority fails closed. Another module may authorize a read of an
 * Offer target through this predicate; it gains no Offer behaviour from it.
 */
export function canReadOfferTarget(
  company: ActiveCompanyContext | undefined,
): boolean {
  return (
    company?.offerPermissions?.includes('commercial.offer.read') === true &&
    canReadCommercialTarget(company, 'client_request') &&
    canReadCommercialTarget(company, 'opportunity')
  );
}
