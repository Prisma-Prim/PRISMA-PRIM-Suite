import type {
  CompanyAssignmentRecordMetadata,
  CompanyContextAssignmentRecord,
} from './company-context-assignment.types.js';
import {
  COMPANY_CONTEXT_ACCESS_BUNDLE,
  COMPANY_ROLE_BUNDLES,
  isCompanyRolePermissionSetVersion,
  type CompanyRoleBundle,
} from './company-permissions.js';

type AssignmentRecordInput = Pick<
  CompanyContextAssignmentRecord,
  'id' | 'workspaceMembershipId' | 'companyId'
> & { bundle: unknown; permissionSetVersion: unknown };

/** Decode persisted assignment metadata without changing its captured version. */
export function assignmentRecord(
  assignment: AssignmentRecordInput,
  active: boolean,
): CompanyContextAssignmentRecord {
  if (!isCompanyRoleBundle(assignment.bundle))
    throw new Error('Invalid Company assignment bundle.');
  const metadata = {
    bundle: COMPANY_ROLE_BUNDLES[assignment.bundle].label,
    // This legacy bundle has always published an explicitly unversioned record.
    permissionSetVersion:
      assignment.bundle === COMPANY_CONTEXT_ACCESS_BUNDLE
        ? null
        : assignment.permissionSetVersion,
  };
  if (!isAssignmentRecordMetadata(metadata, assignment.bundle))
    throw new Error('Invalid Company assignment version.');
  return {
    id: assignment.id,
    workspaceMembershipId: assignment.workspaceMembershipId,
    companyId: assignment.companyId,
    active,
    ...metadata,
  };
}

function isCompanyRoleBundle(bundle: unknown): bundle is CompanyRoleBundle {
  return (
    typeof bundle === 'string' && Object.hasOwn(COMPANY_ROLE_BUNDLES, bundle)
  );
}

// Prove the label/capture pair together; checking an independent version union
// would lose the registry's bundle-specific evidence when constructing a record.
function isAssignmentRecordMetadata(
  metadata: { bundle: string; permissionSetVersion: unknown },
  bundle: CompanyRoleBundle,
): metadata is CompanyAssignmentRecordMetadata {
  return (
    metadata.bundle === COMPANY_ROLE_BUNDLES[bundle].label &&
    (bundle === COMPANY_CONTEXT_ACCESS_BUNDLE
      ? metadata.permissionSetVersion === null
      : isCompanyRolePermissionSetVersion(
          bundle,
          metadata.permissionSetVersion,
        ))
  );
}
