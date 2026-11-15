import type { CompanyAuthorityContext } from '../access/company-authority-context.js';
import { canReadCommercialTarget } from '../commercial-intake/commercial-intake.read-predicate.js';

/**
 * The complete Contract read prerequisite of section 19.6 as the Contract
 * reads enforce it: `commercial.contract.read` together with the Commercial
 * Intake read of the owning Opportunity and its Request. Neither side
 * suffices alone, so partial authority fails closed. Another module may
 * authorize a read of a Contract target through this predicate; it gains no
 * Contract behaviour from it.
 */
export function canReadContractTarget(
  company: CompanyAuthorityContext | undefined,
): boolean {
  return (
    company?.contractPermissions?.includes('commercial.contract.read') ===
      true &&
    canReadCommercialTarget(company, 'client_request') &&
    canReadCommercialTarget(company, 'opportunity')
  );
}
