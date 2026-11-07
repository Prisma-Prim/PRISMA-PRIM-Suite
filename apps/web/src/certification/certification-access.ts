import type { ActorContext } from '../access-types';

/**
 * What the captured Certification grants let this actor attempt. The server
 * rechecks every grant live; this projection only decides what to offer.
 */
export type CertificationAuthority =
  | { read: false; manage: false; approve: false; audit: false }
  | { read: true; manage: boolean; approve: boolean; audit: boolean };

/**
 * Readers consult Cases; a programme manager also records steps, an approver
 * decides on the proposed audit team and an auditor records audit results
 * when the Case links them to the approved team's leader. Like the server,
 * each role counts only alongside the reader grant. An unrecognized
 * permission, assignment or version fails closed.
 */
export function certificationAuthority(
  actor: ActorContext,
): CertificationAuthority {
  const company = actor.activeCompany;
  const read =
    actor.active === true &&
    nonblank(actor.internalUserId) &&
    nonblank(actor.workspaceId) &&
    nonblank(actor.workspaceMembershipId) &&
    nonblank(company?.id) &&
    (company?.projectPermissions?.includes('project.read') ?? false) &&
    grant(
      company?.certificationReaderPermissions,
      'certification.read',
      company?.certificationReaderAssignmentId,
      company?.certificationReaderPermissionSetVersion,
    );
  if (!read)
    return { read: false, manage: false, approve: false, audit: false };
  return {
    read: true,
    manage: grant(
      company?.certificationProgrammeManagerPermissions,
      'certification.programme.manage',
      company?.certificationProgrammeManagerAssignmentId,
      company?.certificationProgrammeManagerPermissionSetVersion,
    ),
    approve: grant(
      company?.certificationApproverPermissions,
      'certification.approve',
      company?.certificationApproverAssignmentId,
      company?.certificationApproverPermissionSetVersion,
    ),
    audit: grant(
      company?.certificationAuditorPermissions,
      'certification.audit.record',
      company?.certificationAuditorAssignmentId,
      company?.certificationAuditorPermissionSetVersion,
    ),
  };
}

/** Changes whenever identity, Company or a captured Certification grant changes. */
export function certificationContextKey(actor: ActorContext): string {
  const company = actor.activeCompany;
  return JSON.stringify([
    actor.internalUserId,
    actor.workspaceId,
    actor.workspaceMembershipId,
    actor.active,
    company?.id,
    company?.projectPermissions,
    company?.certificationReaderAssignmentId,
    company?.certificationReaderPermissionSetVersion,
    company?.certificationReaderPermissions,
    company?.certificationProgrammeManagerAssignmentId,
    company?.certificationProgrammeManagerPermissionSetVersion,
    company?.certificationProgrammeManagerPermissions,
    company?.certificationApproverAssignmentId,
    company?.certificationApproverPermissionSetVersion,
    company?.certificationApproverPermissions,
    company?.certificationAuditorAssignmentId,
    company?.certificationAuditorPermissionSetVersion,
    company?.certificationAuditorPermissions,
  ]);
}

function grant(
  permissions: readonly string[] | undefined,
  expected: string,
  assignmentId: string | undefined,
  version: string | undefined,
): boolean {
  return (
    version === 'v1' &&
    nonblank(assignmentId) &&
    permissions !== undefined &&
    permissions.length === 1 &&
    permissions[0] === expected
  );
}

function nonblank(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
