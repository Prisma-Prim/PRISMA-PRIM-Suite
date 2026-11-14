import { holds } from '../access/company-grants';
import type { ActorContext } from '../access-types';

type Company = ActorContext['activeCompany'];

/** A live Contract Preparer or Contract Approver grant confers Contract reads. */
export function holdsContractRead(company: Company): boolean {
  return (
    holds(company, 'company_contract_preparer', 'commercial.contract.read') ||
    holds(company, 'company_contract_approver', 'commercial.contract.read')
  );
}

/** A live Offer Preparer or Offer Approver grant confers source Offer reads. */
export function holdsOfferRead(company: Company): boolean {
  return (
    holds(company, 'company_offer_preparer', 'commercial.offer.read') ||
    holds(company, 'company_offer_approver', 'commercial.offer.read')
  );
}

/** A live Pricing User or Offer Preparer grant confers pricing snapshot reads. */
export function holdsPricingSnapshotRead(company: Company): boolean {
  return (
    holds(
      company,
      'company_pricing_user',
      'commercial.pricing.snapshot.read',
    ) ||
    holds(company, 'company_offer_preparer', 'commercial.pricing.snapshot.read')
  );
}
