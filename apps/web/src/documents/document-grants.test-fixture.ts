import type { CompanyGrantBundle } from '../access/company-grants';
import {
  companyGrants,
  type CompanyGrantRequest,
} from '../access/company-grants.test-fixture';
import type { CompanyGrant } from '../access/company-grants';
import type { ActorContext } from '../access-types';
import { readCurrentActor } from '../access/current-actor';

/** The bundle that confers each Document permission (#1384). */
const DOCUMENT_PERMISSION_BUNDLES = {
  'document.read': 'company_document_registrar',
  'document.register': 'company_document_registrar',
  'document.reference.read': 'company_document_registrar',
  'document.correct': 'company_document_registrar',
  'document.version.manage': 'company_document_registrar',
  'document.version.designate_official': 'company_document_approver',
  'document.content.read': 'company_document_content_reader',
  'document.content.upload': 'company_document_content_uploader',
  'document.project.manage': 'company_document_project_organizer',
  'document.mission_deliverable.access': 'company_mission_deliverable_access',
  'document.received_contract.access': 'company_received_contract_access',
  'document.received_addendum.access': 'company_received_addendum_access',
  'document.received_audit_source.access':
    'company_received_audit_source_access',
} as const satisfies Record<string, CompanyGrantBundle>;

export type DocumentPermission = keyof typeof DOCUMENT_PERMISSION_BUNDLES;
type DocumentBundle = (typeof DOCUMENT_PERMISSION_BUNDLES)[DocumentPermission];

/** The assignment id each Document bundle captures unless a test names one. */
const DEFAULT_ASSIGNMENTS = {
  company_document_registrar: 'registrar-assignment',
  company_document_approver: 'approver-assignment',
  company_document_content_reader: 'content-reader-assignment',
  company_document_content_uploader: 'content-uploader-assignment',
  company_document_project_organizer: 'project-organizer-assignment',
  company_mission_deliverable_access: 'mission-deliverable-assignment',
  company_received_contract_access: 'received-contract-assignment',
  company_received_addendum_access: 'received-addendum-assignment',
  company_received_audit_source_access: 'received-audit-source-assignment',
} as const satisfies Record<DocumentBundle, string>;

/**
 * The live grant requests that confer `permissions`, one per bundle. The
 * Registrar gets the lowest registry version holding every requested
 * Registrar permission: v1 always confers read, register and Reference read,
 * v2 adds correction and v3 Version management, so a list naming fewer
 * Registrar permissions than its version confers gains the rest.
 */
export function documentGrantRequests(
  permissions: readonly DocumentPermission[],
  assignmentIds: Partial<Record<DocumentBundle, string>> = {},
): CompanyGrantRequest[] {
  const bundles = new Set(
    permissions.map((permission) => DOCUMENT_PERMISSION_BUNDLES[permission]),
  );
  const assignmentOf = (bundle: DocumentBundle) =>
    assignmentIds[bundle] ?? DEFAULT_ASSIGNMENTS[bundle];
  return [...bundles].map((bundle): CompanyGrantRequest => {
    if (bundle === 'company_document_registrar')
      return {
        bundle,
        version: permissions.includes('document.version.manage')
          ? 'v3'
          : permissions.includes('document.correct')
            ? 'v2'
            : 'v1',
        assignmentId: assignmentOf(bundle),
      };
    return { bundle, version: 'v1', assignmentId: assignmentOf(bundle) };
  });
}

/**
 * Whether the current Actor parser accepts `actor` once its Registrar grant
 * stops conferring `permission`. Every Registrar version confers Document
 * read with Reference read, so such a grant matches no registry version and
 * is refused with the whole Actor: the screens never see it.
 */
export async function acceptsRegistrarWithout(
  actor: ActorContext,
  permission: DocumentPermission,
): Promise<boolean> {
  const company = actor.activeCompany;
  const result = await readCurrentActor({
    api: {
      request: async () => ({
        status: 'ok',
        value: {
          ...actor,
          activeCompany: company && {
            ...company,
            grants: (company.grants ?? []).map((grant) =>
              grant.bundle === 'company_document_registrar'
                ? {
                    ...grant,
                    permissions: grant.permissions.filter(
                      (granted) => granted !== permission,
                    ),
                  }
                : grant,
            ),
          },
        },
      }),
    },
  });
  return result.status === 'ok';
}

/** `documentGrantRequests` as the `grants` list the API sends. */
export function documentGrants(
  permissions: readonly DocumentPermission[],
  assignmentIds: Partial<Record<DocumentBundle, string>> = {},
): CompanyGrant[] {
  return companyGrants(...documentGrantRequests(permissions, assignmentIds));
}
