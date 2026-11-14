import type { ActorContext } from '../access-types';
import {
  grantOf,
  holds,
  type CompanyGrant,
  type CompanyGrantBundle,
  type CompanyGrantOf,
  type CompanyGrantPermission,
} from '../access/company-grants';

type Company = ActorContext['activeCompany'];

/** The live grant of `bundle` when it confers `permission`, for its capture. */
export function grantHolding<Bundle extends CompanyGrantBundle>(
  company: Company,
  bundle: Bundle,
  permission: CompanyGrantPermission<Bundle>,
): CompanyGrantOf<Bundle> | undefined {
  return holds(company, bundle, permission)
    ? grantOf(company, bundle)
    : undefined;
}

/** Contract read comes from the Contract Preparer or the Contract Approver. */
export function holdsContractRead(company: Company): boolean {
  return (
    holds(company, 'company_contract_preparer', 'commercial.contract.read') ||
    holds(company, 'company_contract_approver', 'commercial.contract.read')
  );
}

/** Company Client read; the Workspace `client.manage` alternative is separate. */
export function holdsClientRead(company: Company): boolean {
  return holds(company, 'company_director_client_access', 'client.read');
}

/** A grant's captured assignment and version, as an authority key part. */
export function captureOf(grant: CompanyGrant | undefined) {
  return [grant?.assignmentId, grant?.permissionSetVersion] as const;
}
