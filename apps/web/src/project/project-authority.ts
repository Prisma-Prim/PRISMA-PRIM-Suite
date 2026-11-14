import type { ActorContext } from '../access-types';
import {
  grantOf,
  holds,
  type CompanyGrantBundle,
} from '../access/company-grants';

/** The Template, stage, applicability, review and Mission Plan grants that existing Project children never consume. */
const INDEPENDENT_PROJECT_CHILD_BUNDLES: ReadonlySet<CompanyGrantBundle> =
  new Set([
    'company_project_next_action_coordinator',
    'company_mission_applicability_coordinator',
    'company_mission_applicability_approver',
    'company_mission_plan_configuration',
    'company_mission_plan_user',
    'company_mission_result_reviewer',
    'company_project_stage_advancer',
    'company_project_template_configuration',
    'company_project_template_user',
  ]);

/**
 * The per-bundle wire fields that repeat those grants until #1148 step c
 * (#1334) removes them from the current Actor; the authority below leaves
 * them out unread, as it leaves out the grants themselves.
 */
const INDEPENDENT_PER_BUNDLE_FIELDS: ReadonlySet<string> = new Set([
  'projectNextActionPermissions',
  'projectNextActionCoordinatorAssignmentId',
  'projectNextActionCoordinatorPermissionSetVersion',
  'missionApplicabilityProposalPermissions',
  'missionApplicabilityCoordinatorAssignmentId',
  'missionApplicabilityCoordinatorPermissionSetVersion',
  'missionApplicabilityDecisionPermissions',
  'missionApplicabilityApproverAssignmentId',
  'missionApplicabilityApproverPermissionSetVersion',
  'missionPlanGrants',
  'missionResultReviewPermissions',
  'missionResultReviewerAssignmentId',
  'missionResultReviewerPermissionSetVersion',
  'projectStagePermissions',
  'projectStagePermissionAssignmentId',
  'projectStagePermissionSetVersion',
  'projectTemplateConfigurationPermissions',
  'projectTemplateConfigurationPermissionAssignmentId',
  'projectTemplateConfigurationPermissionSetVersion',
  'projectTemplatePermissions',
  'projectTemplatePermissionAssignmentId',
  'projectTemplatePermissionSetVersion',
]);

/**
 * The authority existing Project children remount on: every fact of the
 * active Company except the independent Template, stage, applicability,
 * review and Mission Plan grants. Only its serialized form is consumed.
 */
export function companyAuthorityWithoutProjectTemplate(
  company: ActorContext['activeCompany'],
): Readonly<Record<string, unknown>> | undefined {
  if (!company) return;
  return Object.fromEntries(
    Object.entries(company).flatMap(([field, value]) =>
      INDEPENDENT_PER_BUNDLE_FIELDS.has(field)
        ? []
        : field === 'grants'
          ? [
              [
                field,
                company.grants?.filter(
                  (grant) =>
                    !INDEPENDENT_PROJECT_CHILD_BUNDLES.has(grant.bundle),
                ),
              ],
            ]
          : [[field, value]],
    ),
  );
}

/** Match the Client owner: Workspace management or the exact Company read capture. */
export function clientReadAuthority(actor: ActorContext) {
  if (actor.workspacePermissions.includes('client.manage'))
    return { workspaceClientManage: true };
  const company = actor.activeCompany;
  const grant = grantOf(company, 'company_director_client_access');
  return {
    clientRead: holds(company, 'company_director_client_access', 'client.read'),
    assignmentId: grant?.assignmentId,
    permissionSetVersion: grant?.permissionSetVersion,
  };
}

/** Task work consumes Project/Task/original-Client authority, independently of evidence or review grants. */
export function projectTaskCompanyAuthority(actor: ActorContext) {
  const company = actor.activeCompany;
  if (!company) return;
  return {
    id: company.id,
    project: grantOf(company, 'company_project_access'),
    task: grantOf(company, 'company_task_manager'),
    clientRead: clientReadAuthority(actor),
  };
}

/** Native result intent consumes its exact evidence and recorder captures only. */
export function taskResultAuthority(actor: ActorContext) {
  const c = actor.activeCompany;
  return {
    projectTask: projectTaskCompanyAuthority(actor),
    documentRegistrar: grantOf(c, 'company_document_registrar'),
    documentContentReader: grantOf(c, 'company_document_content_reader'),
    missionDeliverableAccess: grantOf(c, 'company_mission_deliverable_access'),
    taskResultRecorder: grantOf(c, 'company_task_result_recorder'),
  };
}
