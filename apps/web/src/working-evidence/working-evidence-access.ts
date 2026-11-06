import type { ActorContext } from '../access-types';
import { receivedAuditSourceNativeAuthority } from '../documents/received-audit-source-access';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
function captured(id: unknown, version: unknown, versions: readonly string[]) {
  return (
    typeof id === 'string' &&
    uuid.test(id) &&
    typeof version === 'string' &&
    versions.includes(version)
  );
}
export function workingEvidenceAuthority(
  actor: ActorContext,
  preferredRead?: string,
) {
  const company = actor.activeCompany;
  if (
    !actor.active ||
    !company ||
    !actor.workspaceId ||
    !actor.workspaceMembershipId ||
    !actor.internalUserId ||
    typeof company.workingEvidenceContextCapture !== 'string' ||
    !/^working-evidence-context\.v1\.[a-f0-9]{64}$/u.test(
      company.workingEvidenceContextCapture,
    ) ||
    typeof company.workingEvidenceClientReadCapture !== 'string' ||
    !/^working-evidence-client-read\.v1\.[a-f0-9]{64}$/u.test(
      company.workingEvidenceClientReadCapture,
    ) ||
    !(
      actor.workspacePermissions.includes('client.manage') ||
      (company.clientPermissions?.includes('client.read') &&
        captured(
          company.clientPermissionAssignmentId,
          company.clientPermissionSetVersion,
          ['v1', 'v2'],
        ))
    ) ||
    !company.projectPermissions?.includes('project.read') ||
    !captured(
      company.projectPermissionAssignmentId,
      company.projectPermissionSetVersion,
      ['v1', 'v2'],
    )
  )
    return undefined;
  const rawPermissions = company.workingEvidenceCasePermissions;
  const permissions =
    Array.isArray(rawPermissions) &&
    rawPermissions.every(
      (value: unknown) =>
        value === 'working_evidence_case.read' ||
        value === 'working_evidence_case.record',
    )
      ? rawPermissions
      : [];
  const recorder =
    permissions.includes('working_evidence_case.record') &&
    permissions.includes('working_evidence_case.read') &&
    captured(
      company.workingEvidenceCaseRecorderAssignmentId,
      company.workingEvidenceCaseRecorderPermissionSetVersion,
      ['v1'],
    )
      ? ['Recorder', company.workingEvidenceCaseRecorderAssignmentId, 'v1']
      : null;
  const reader =
    permissions.includes('working_evidence_case.read') &&
    captured(
      company.workingEvidenceCaseReaderAssignmentId,
      company.workingEvidenceCaseReaderPermissionSetVersion,
      ['v1'],
    )
      ? ['Reader', company.workingEvidenceCaseReaderAssignmentId, 'v1']
      : recorder;
  if (!reader) return undefined;
  const context = [
    actor.internalUserId,
    actor.workspaceId,
    actor.workspaceMembershipId,
    company.id,
    company.workingEvidenceContextCapture,
    company.workingEvidenceClientReadCapture,
    company.projectPermissionAssignmentId,
    company.projectPermissionSetVersion,
  ];
  const readerCapture = JSON.stringify([...context, reader]);
  const recorderCapture = recorder
    ? JSON.stringify([...context, recorder])
    : null;
  const read =
    preferredRead === readerCapture || preferredRead === recorderCapture
      ? preferredRead
      : readerCapture;
  const native = receivedAuditSourceNativeAuthority(actor);
  return {
    read,
    record: recorderCapture,
    source: native?.content ?? null,
    recovery: JSON.stringify(actor),
  };
}
