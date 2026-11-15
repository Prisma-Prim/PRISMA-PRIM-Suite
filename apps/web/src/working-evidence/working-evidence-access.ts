import type { ActorContext } from '../access-types';
import type { CompanyGrant } from '../access/company-grants';
import { grantHolding } from '../documents/document-grants';
import { receivedAuditSourceNativeAuthority } from '../documents/received-audit-source-access';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
/** A live grant whose assignment is a native lowercase UUID. */
function captured<Grant extends CompanyGrant>(grant: Grant | undefined) {
  return grant && uuid.test(grant.assignmentId) ? grant : undefined;
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
      captured(
        grantHolding(company, 'company_director_client_access', 'client.read'),
      )
    )
  )
    return undefined;
  const project = captured(
    grantHolding(company, 'company_project_access', 'project.read'),
  );
  if (!project) return undefined;
  const recordingGrant = captured(
    grantHolding(
      company,
      'company_working_evidence_case_recorder',
      'working_evidence_case.record',
    ),
  );
  const recorder = recordingGrant
    ? [
        'Recorder',
        recordingGrant.assignmentId,
        recordingGrant.permissionSetVersion,
      ]
    : null;
  const readingGrant = captured(
    grantHolding(
      company,
      'company_working_evidence_case_reader',
      'working_evidence_case.read',
    ),
  );
  const reader = readingGrant
    ? ['Reader', readingGrant.assignmentId, readingGrant.permissionSetVersion]
    : recorder;
  if (!reader) return undefined;
  const context = [
    actor.internalUserId,
    actor.workspaceId,
    actor.workspaceMembershipId,
    company.id,
    company.workingEvidenceContextCapture,
    company.workingEvidenceClientReadCapture,
    project.assignmentId,
    project.permissionSetVersion,
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
