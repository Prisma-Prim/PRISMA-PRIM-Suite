import {
  COMPANY_GRANT_REGISTRY,
  type CompanyGrant,
  type CompanyGrantPermission,
} from '../access/company-grants';
import { companyGrants } from '../access/company-grants.test-fixture';

type OfferBundle = 'company_offer_preparer' | 'company_offer_approver';
export type OfferPermission =
  | CompanyGrantPermission<'company_offer_preparer'>
  | CompanyGrantPermission<'company_offer_approver'>;

const offerBundles = [
  'company_offer_preparer',
  'company_offer_approver',
] as const;

function conferredBy(bundle: OfferBundle): ReadonlySet<string> {
  return new Set(Object.values(COMPANY_GRANT_REGISTRY[bundle]).flat());
}

function narrowed<Grant extends CompanyGrant>(
  grant: Grant,
  kept: readonly string[],
): Grant {
  return {
    ...grant,
    permissions: grant.permissions.filter((permission) =>
      kept.includes(permission),
    ),
  };
}

/**
 * The Offer Preparer and Offer Approver grants that confer exactly
 * `permissions`, the Offer permissions a component test gives its actor.
 * Each bundle takes the lowest registry version covering its part of the
 * list; Offer read alone goes to the Preparer unless an Approver-only
 * permission is listed. When the list is narrower than that version, the
 * grant is narrowed by hand: the current Actor parser refuses such a grant
 * (#1332), so only component tests that check each permission on its own
 * use it.
 */
export function offerGrants(
  permissions: readonly OfferPermission[],
  assignments: { preparer?: string; approver?: string } = {},
): CompanyGrant[] {
  const preparer = conferredBy('company_offer_preparer');
  const approver = conferredBy('company_offer_approver');
  const approves = permissions.some(
    (permission) => approver.has(permission) && !preparer.has(permission),
  );
  const prepares =
    permissions.some(
      (permission) => preparer.has(permission) && !approver.has(permission),
    ) ||
    (!approves && permissions.length > 0);
  return offerBundles
    .filter((bundle) =>
      bundle === 'company_offer_preparer' ? prepares : approves,
    )
    .flatMap((bundle) => {
      const conferred = conferredBy(bundle);
      const part = permissions.filter((permission) =>
        conferred.has(permission),
      );
      const versions: Readonly<Record<string, readonly string[]>> =
        COMPANY_GRANT_REGISTRY[bundle];
      const version = Object.keys(versions).find((candidate) =>
        part.every((permission) => versions[candidate]?.includes(permission)),
      );
      const assignmentId =
        (bundle === 'company_offer_preparer'
          ? assignments.preparer
          : assignments.approver) ?? `${bundle}-grant`;
      const grant =
        bundle === 'company_offer_preparer'
          ? companyGrants({
              bundle,
              version:
                version === 'v1' || version === 'v2' || version === 'v3'
                  ? version
                  : unrepresentable(part),
              assignmentId,
            })
          : companyGrants({
              bundle,
              version:
                version === 'v1' || version === 'v2'
                  ? version
                  : unrepresentable(part),
              assignmentId,
            });
      return grant.map((full) => narrowed(full, part));
    });
}

function unrepresentable(permissions: readonly string[]): never {
  throw new Error(
    `No Offer grant version confers ${JSON.stringify(permissions)}.`,
  );
}
