import type { ActorContext } from '../access-types';
import type { ActivityLogEvent } from '../production-shell/company-context-transitions';
import {
  buildClientRequest,
  requestListItemFor,
} from './commercial-intake-responses';

// Synthetic canonical projection inputs, never real business data. No production
// message catalog or formatter supplies an expected sentence to the tests.
export const activityLocaleIds = {
  company: '30000000-0000-4000-8000-000000000703',
  otherCompany: '30000000-0000-4000-8000-000000000704',
  request: '50000000-0000-4000-8000-000000000703',
  opportunity: '60000000-0000-4000-8000-000000000703',
  offerVersion: '80000000-0000-4000-8000-000000000703',
  contract: '70000000-0000-4000-8000-000000000703',
  contractVersion: '90000000-0000-4000-8000-000000000703',
};
export const activityLiteral =
  'Literal {original} — Société / Компания / Știință — î'.repeat(2);
export const activityInstant = '2026-09-21T10:05:00.000Z';
const actor = {
  internalUserId: 'user-703',
  displayName: 'Alex {literal} — Știință / Имя',
};
const ordinary = { occurredAt: activityInstant, actor };
const targets = {
  workspace_invitation: {
    type: 'workspace_invitation',
    invitationId: 'invitation-703-{literal}',
  },
  internal_user: {
    type: 'internal_user',
    internalUserId: 'user-703',
    displayName: activityLiteral,
  },
  workspace_membership: {
    type: 'workspace_membership',
    workspaceMembershipId: 'membership-703',
    internalUserId: 'user-703',
    displayName: activityLiteral,
  },
  company: {
    type: 'company',
    companyId: activityLocaleIds.company,
    displayName: activityLiteral,
  },
  company_role_assignment: {
    type: 'company_role_assignment',
    assignmentId: 'assignment-703',
    companyId: activityLocaleIds.company,
    companyDisplayName: activityLiteral,
    workspaceMembershipId: 'membership-703',
    internalUserId: 'user-703',
    internalUserDisplayName: 'Nom {before} — Имя',
  },
  client_account: {
    type: 'client_account',
    clientAccountId: 'client-703',
    displayName: activityLiteral,
    companyId: activityLocaleIds.company,
    companyDisplayName: 'Company {literal} — Société / Компания',
  },
  client_company_relationship: {
    type: 'client_company_relationship',
    relationshipId: 'relationship-703',
    clientAccountId: 'client-703',
    clientDisplayName: activityLiteral,
    companyId: activityLocaleIds.company,
    companyDisplayName: 'Company {literal} — Société / Компания',
  },
  project: {
    type: 'project',
    projectId: 'project-703',
    projectTitle: activityLiteral,
    companyId: activityLocaleIds.company,
  },
  project_template_version: {
    type: 'project_template_version',
    versionId: 'template-version-703',
    companyId: activityLocaleIds.company,
  },
  task: {
    type: 'task',
    taskId: 'task-703',
    taskTitle: activityLiteral,
    companyId: activityLocaleIds.company,
  },
  document: {
    type: 'document',
    documentId: 'document-703-{literal}',
    documentTitle: activityLiteral,
    companyId: activityLocaleIds.company,
  },
  document_project: {
    type: 'document_project',
    documentId: 'document-703',
    documentTitle: activityLiteral,
    projectId: 'project-703',
    projectTitle: 'Project {literal} — Проект',
    companyId: activityLocaleIds.company,
  },
  client_request: {
    type: 'client_request',
    clientRequestId: activityLocaleIds.request,
    companyId: activityLocaleIds.company,
  },
  opportunity: {
    type: 'opportunity',
    opportunityId: activityLocaleIds.opportunity,
    clientRequestId: activityLocaleIds.request,
    companyId: activityLocaleIds.company,
  },
  offer_version: {
    type: 'offer_version',
    offerVersionId: activityLocaleIds.offerVersion,
    versionNumber: 1,
    illustrativeReference: 1234,
    opportunityId: activityLocaleIds.opportunity,
    clientRequestId: activityLocaleIds.request,
    companyId: activityLocaleIds.company,
  },
  contract_version: {
    type: 'contract_version',
    contractId: activityLocaleIds.contract,
    contractVersionId: activityLocaleIds.contractVersion,
    kind: 'CONTRACT',
    versionNumber: 1,
    illustrativeReference: 2345,
    opportunityId: activityLocaleIds.opportunity,
    clientRequestId: activityLocaleIds.request,
    companyId: activityLocaleIds.company,
  },
  sales_stage: {
    type: 'sales_stage',
    salesStageId: 'stage-703',
    companyId: activityLocaleIds.company,
  },
} as const;

// Total fixture membership tracks the public canonical union, rather than a
// private rendering helper. Each input has the public action's exact target.
export const activityEventsByAction = {
  'company_knowledge_source_administrator_assignment.granted': {
    ...ordinary,
    id: 'event-company_knowledge_source_administrator_assignment.granted',
    action: 'company_knowledge_source_administrator_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_knowledge_source_administrator_assignment.revoked': {
    ...ordinary,
    id: 'event-company_knowledge_source_administrator_assignment.revoked',
    action: 'company_knowledge_source_administrator_assignment.revoked',
    target: targets.company_role_assignment,
  },
  'company_knowledge_evidence_reader_assignment.granted': {
    ...ordinary,
    id: 'event-company_knowledge_evidence_reader_assignment.granted',
    action: 'company_knowledge_evidence_reader_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_knowledge_evidence_reader_assignment.revoked': {
    ...ordinary,
    id: 'event-company_knowledge_evidence_reader_assignment.revoked',
    action: 'company_knowledge_evidence_reader_assignment.revoked',
    target: targets.company_role_assignment,
  },
  'workspace_invitation.issued': {
    ...ordinary,
    id: 'event-workspace_invitation.issued',
    action: 'workspace_invitation.issued',
    target: targets.workspace_invitation,
  },
  'workspace_invitation.revoked': {
    ...ordinary,
    id: 'event-workspace_invitation.revoked',
    action: 'workspace_invitation.revoked',
    target: targets.workspace_invitation,
  },
  'workspace_invitation.accepted': {
    ...ordinary,
    id: 'event-workspace_invitation.accepted',
    action: 'workspace_invitation.accepted',
    target: targets.workspace_invitation,
  },
  'internal_user.provisioned': {
    ...ordinary,
    id: 'event-internal_user.provisioned',
    action: 'internal_user.provisioned',
    target: targets.internal_user,
  },
  'workspace_membership.suspended': {
    ...ordinary,
    id: 'event-workspace_membership.suspended',
    action: 'workspace_membership.suspended',
    target: targets.workspace_membership,
  },
  'workspace_sessions.revoked': {
    ...ordinary,
    id: 'event-workspace_sessions.revoked',
    action: 'workspace_sessions.revoked',
    target: targets.workspace_membership,
  },
  'workspace_sessions.revocation_retry_required': {
    ...ordinary,
    id: 'event-workspace_sessions.revocation_retry_required',
    action: 'workspace_sessions.revocation_retry_required',
    target: targets.workspace_membership,
  },
  'company.registered': {
    ...ordinary,
    id: 'event-company.registered',
    action: 'company.registered',
    target: targets.company,
  },
  'company_operational_risk_reader_assignment.granted': {
    ...ordinary,
    id: 'event-company_operational_risk_reader_assignment.granted',
    action: 'company_operational_risk_reader_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_operational_risk_reader_assignment.revoked': {
    ...ordinary,
    id: 'event-company_operational_risk_reader_assignment.revoked',
    action: 'company_operational_risk_reader_assignment.revoked',
    target: targets.company_role_assignment,
  },
  'company_operational_risk_recorder_assignment.granted': {
    ...ordinary,
    id: 'event-company_operational_risk_recorder_assignment.granted',
    action: 'company_operational_risk_recorder_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_operational_risk_recorder_assignment.revoked': {
    ...ordinary,
    id: 'event-company_operational_risk_recorder_assignment.revoked',
    action: 'company_operational_risk_recorder_assignment.revoked',
    target: targets.company_role_assignment,
  },
  'company_task_manager_assignment.granted': {
    ...ordinary,
    id: 'event-company_task_manager_assignment.granted',
    action: 'company_task_manager_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_ideas_reader_assignment.granted': {
    ...ordinary,
    id: 'event-company_ideas_reader_assignment.granted',
    action: 'company_ideas_reader_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_ideas_reader_assignment.revoked': {
    ...ordinary,
    id: 'event-company_ideas_reader_assignment.revoked',
    action: 'company_ideas_reader_assignment.revoked',
    target: targets.company_role_assignment,
  },
  'company_ideas_recorder_assignment.granted': {
    ...ordinary,
    id: 'event-company_ideas_recorder_assignment.granted',
    action: 'company_ideas_recorder_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_ideas_recorder_assignment.revoked': {
    ...ordinary,
    id: 'event-company_ideas_recorder_assignment.revoked',
    action: 'company_ideas_recorder_assignment.revoked',
    target: targets.company_role_assignment,
  },
  'company_ideas_reviewer_assignment.granted': {
    ...ordinary,
    id: 'event-company_ideas_reviewer_assignment.granted',
    action: 'company_ideas_reviewer_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_ideas_reviewer_assignment.revoked': {
    ...ordinary,
    id: 'event-company_ideas_reviewer_assignment.revoked',
    action: 'company_ideas_reviewer_assignment.revoked',
    target: targets.company_role_assignment,
  },
  'company_task_manager_assignment.revoked': {
    ...ordinary,
    id: 'event-company_task_manager_assignment.revoked',
    action: 'company_task_manager_assignment.revoked',
    target: targets.company_role_assignment,
  },
  'company_project_assignment.granted': {
    ...ordinary,
    id: 'event-company_project_assignment.granted',
    action: 'company_project_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_project_assignment.revoked': {
    ...ordinary,
    id: 'event-company_project_assignment.revoked',
    action: 'company_project_assignment.revoked',
    target: targets.company_role_assignment,
  },
  'company_commercial_intake_assignment.granted': {
    ...ordinary,
    id: 'event-company_commercial_intake_assignment.granted',
    action: 'company_commercial_intake_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_commercial_intake_assignment.revoked': {
    ...ordinary,
    id: 'event-company_commercial_intake_assignment.revoked',
    action: 'company_commercial_intake_assignment.revoked',
    target: targets.company_role_assignment,
  },
  'company_service_catalogue_assignment.granted': {
    ...ordinary,
    id: 'event-company_service_catalogue_assignment.granted',
    action: 'company_service_catalogue_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_service_catalogue_assignment.revoked': {
    ...ordinary,
    id: 'event-company_service_catalogue_assignment.revoked',
    action: 'company_service_catalogue_assignment.revoked',
    target: targets.company_role_assignment,
  },
  'company_pricing_configuration_assignment.granted': {
    ...ordinary,
    id: 'event-company_pricing_configuration_assignment.granted',
    action: 'company_pricing_configuration_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_pricing_configuration_assignment.revoked': {
    ...ordinary,
    id: 'event-company_pricing_configuration_assignment.revoked',
    action: 'company_pricing_configuration_assignment.revoked',
    target: targets.company_role_assignment,
  },
  'company_pricing_user_assignment.granted': {
    ...ordinary,
    id: 'event-company_pricing_user_assignment.granted',
    action: 'company_pricing_user_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_pricing_user_assignment.revoked': {
    ...ordinary,
    id: 'event-company_pricing_user_assignment.revoked',
    action: 'company_pricing_user_assignment.revoked',
    target: targets.company_role_assignment,
  },
  'company_offer_preparer_assignment.granted': {
    ...ordinary,
    id: 'event-company_offer_preparer_assignment.granted',
    action: 'company_offer_preparer_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_offer_model_editor_assignment.granted': {
    ...ordinary,
    id: 'event-model-editor-granted',
    action: 'company_offer_model_editor_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_offer_model_editor_assignment.revoked': {
    ...ordinary,
    id: 'event-model-editor-revoked',
    action: 'company_offer_model_editor_assignment.revoked',
    target: targets.company_role_assignment,
  },
  'company_offer_model_approver_assignment.granted': {
    ...ordinary,
    id: 'event-model-approver-granted',
    action: 'company_offer_model_approver_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_offer_model_approver_assignment.revoked': {
    ...ordinary,
    id: 'event-model-approver-revoked',
    action: 'company_offer_model_approver_assignment.revoked',
    target: targets.company_role_assignment,
  },
  'company_mission_plan_configuration_assignment.granted': {
    ...ordinary,
    id: 'event-company_mission_plan_configuration_assignment.granted',
    action: 'company_mission_plan_configuration_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_mission_plan_configuration_assignment.revoked': {
    ...ordinary,
    id: 'event-company_mission_plan_configuration_assignment.revoked',
    action: 'company_mission_plan_configuration_assignment.revoked',
    target: targets.company_role_assignment,
  },
  'company_mission_plan_user_assignment.granted': {
    ...ordinary,
    id: 'event-company_mission_plan_user_assignment.granted',
    action: 'company_mission_plan_user_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_mission_plan_user_assignment.revoked': {
    ...ordinary,
    id: 'event-company_mission_plan_user_assignment.revoked',
    action: 'company_mission_plan_user_assignment.revoked',
    target: targets.company_role_assignment,
  },
  'mission_plan.version.published': {
    ...ordinary,
    id: 'event-mission-plan',
    action: 'mission_plan.version.published',
    target: {
      type: 'mission_plan_version',
      companyId: activityLocaleIds.company,
      planId: '10000000-0000-4000-8000-000000000920',
      versionId: '20000000-0000-4000-8000-000000000920',
    },
    metadata: { versionNumber: 2, activityCount: 13 },
  },
  'company_contract_model_editor_assignment.granted': {
    ...ordinary,
    id: 'event-contract-model-editor-granted',
    action: 'company_contract_model_editor_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_contract_model_editor_assignment.revoked': {
    ...ordinary,
    id: 'event-contract-model-editor-revoked',
    action: 'company_contract_model_editor_assignment.revoked',
    target: targets.company_role_assignment,
  },
  'company_contract_model_approver_assignment.granted': {
    ...ordinary,
    id: 'event-contract-model-approver-granted',
    action: 'company_contract_model_approver_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_contract_model_approver_assignment.revoked': {
    ...ordinary,
    id: 'event-contract-model-approver-revoked',
    action: 'company_contract_model_approver_assignment.revoked',
    target: targets.company_role_assignment,
  },
  'company_offer_approver_assignment.granted': {
    ...ordinary,
    id: 'event-company_offer_approver_assignment.granted',
    action: 'company_offer_approver_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_offer_approver_assignment.revoked': {
    ...ordinary,
    id: 'event-company_offer_approver_assignment.revoked',
    action: 'company_offer_approver_assignment.revoked',
    target: targets.company_role_assignment,
  },
  'company_offer_preparer_assignment.revoked': {
    ...ordinary,
    id: 'event-company_offer_preparer_assignment.revoked',
    action: 'company_offer_preparer_assignment.revoked',
    target: targets.company_role_assignment,
  },
  'company_pricing_adjustment_assignment.granted': {
    ...ordinary,
    id: 'event-company_pricing_adjustment_assignment.granted',
    action: 'company_pricing_adjustment_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_pricing_adjustment_assignment.revoked': {
    ...ordinary,
    id: 'event-company_pricing_adjustment_assignment.revoked',
    action: 'company_pricing_adjustment_assignment.revoked',
    target: targets.company_role_assignment,
  },
  'company_commercial_activity_reader_assignment.granted': {
    ...ordinary,
    id: 'event-company_commercial_activity_reader_assignment.granted',
    action: 'company_commercial_activity_reader_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_commercial_activity_reader_assignment.revoked': {
    ...ordinary,
    id: 'event-company_commercial_activity_reader_assignment.revoked',
    action: 'company_commercial_activity_reader_assignment.revoked',
    target: targets.company_role_assignment,
  },
  'company_opportunity_manager_assignment.granted': {
    ...ordinary,
    id: 'event-company_opportunity_manager_assignment.granted',
    action: 'company_opportunity_manager_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_opportunity_manager_assignment.revoked': {
    ...ordinary,
    id: 'event-company_opportunity_manager_assignment.revoked',
    action: 'company_opportunity_manager_assignment.revoked',
    target: targets.company_role_assignment,
  },
  'company_sales_stage_configuration_assignment.granted': {
    ...ordinary,
    id: 'event-company_sales_stage_configuration_assignment.granted',
    action: 'company_sales_stage_configuration_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_sales_stage_configuration_assignment.revoked': {
    ...ordinary,
    id: 'event-company_sales_stage_configuration_assignment.revoked',
    action: 'company_sales_stage_configuration_assignment.revoked',
    target: targets.company_role_assignment,
  },
  'company_project_template_user_assignment.granted': {
    ...ordinary,
    id: 'event-company_project_template_user_assignment.granted',
    action: 'company_project_template_user_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_project_template_user_assignment.revoked': {
    ...ordinary,
    id: 'event-company_project_template_user_assignment.revoked',
    action: 'company_project_template_user_assignment.revoked',
    target: targets.company_role_assignment,
  },
  'company_project_stage_advancer_assignment.granted': {
    ...ordinary,
    id: 'event-company_project_stage_advancer_assignment.granted',
    action: 'company_project_stage_advancer_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_project_stage_advancer_assignment.revoked': {
    ...ordinary,
    id: 'event-company_project_stage_advancer_assignment.revoked',
    action: 'company_project_stage_advancer_assignment.revoked',
    target: targets.company_role_assignment,
  },
  'company_project_approver_assignment.granted': {
    ...ordinary,
    id: 'event-company_project_approver_assignment.granted',
    action: 'company_project_approver_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_project_approver_assignment.revoked': {
    ...ordinary,
    id: 'event-company_project_approver_assignment.revoked',
    action: 'company_project_approver_assignment.revoked',
    target: targets.company_role_assignment,
  },
  'company_context_assignment.granted': {
    ...ordinary,
    id: 'event-company_context_assignment.granted',
    action: 'company_context_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_context_assignment.revoked': {
    ...ordinary,
    id: 'event-company_context_assignment.revoked',
    action: 'company_context_assignment.revoked',
    target: targets.company_role_assignment,
  },
  'company_director_client_assignment.granted': {
    ...ordinary,
    id: 'event-company_director_client_assignment.granted',
    action: 'company_director_client_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_director_client_assignment.revoked': {
    ...ordinary,
    id: 'event-company_director_client_assignment.revoked',
    action: 'company_director_client_assignment.revoked',
    target: targets.company_role_assignment,
  },
  'company_document_project_organizer_assignment.granted': {
    ...ordinary,
    id: 'event-company_document_project_organizer_assignment.granted',
    action: 'company_document_project_organizer_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_document_project_organizer_assignment.revoked': {
    ...ordinary,
    id: 'event-company_document_project_organizer_assignment.revoked',
    action: 'company_document_project_organizer_assignment.revoked',
    target: targets.company_role_assignment,
  },
  'company_document_registrar_assignment.granted': {
    ...ordinary,
    id: 'event-company_document_registrar_assignment.granted',
    action: 'company_document_registrar_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_document_registrar_assignment.revoked': {
    ...ordinary,
    id: 'event-company_document_registrar_assignment.revoked',
    action: 'company_document_registrar_assignment.revoked',
    target: targets.company_role_assignment,
  },
  'company_contract_signature_declarer_assignment.granted': {
    ...ordinary,
    id: 'event-company_contract_signature_declarer_assignment.granted',
    action: 'company_contract_signature_declarer_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_contract_signature_declarer_assignment.revoked': {
    ...ordinary,
    id: 'event-company_contract_signature_declarer_assignment.revoked',
    action: 'company_contract_signature_declarer_assignment.revoked',
    target: targets.company_role_assignment,
  },
  'company_received_contract_access_assignment.granted': {
    ...ordinary,
    id: 'event-company_received_contract_access_assignment.granted',
    action: 'company_received_contract_access_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_received_contract_access_assignment.revoked': {
    ...ordinary,
    id: 'event-company_received_contract_access_assignment.revoked',
    action: 'company_received_contract_access_assignment.revoked',
    target: targets.company_role_assignment,
  },
  'company_mission_deliverable_access_assignment.granted': {
    ...ordinary,
    id: 'event-company_mission_deliverable_access_assignment.granted',
    action: 'company_mission_deliverable_access_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_mission_applicability_coordinator_assignment.granted': {
    ...ordinary,
    id: 'event-company_mission_applicability_coordinator_assignment.granted',
    action: 'company_mission_applicability_coordinator_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_project_next_action_coordinator_assignment.granted': {
    ...ordinary,
    id: 'event-next-action-coordinator-granted',
    action: 'company_project_next_action_coordinator_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_project_next_action_coordinator_assignment.revoked': {
    ...ordinary,
    id: 'event-next-action-coordinator-revoked',
    action: 'company_project_next_action_coordinator_assignment.revoked',
    target: targets.company_role_assignment,
  },
  'company_mission_applicability_coordinator_assignment.revoked': {
    ...ordinary,
    id: 'event-company_mission_applicability_coordinator_assignment.revoked',
    action: 'company_mission_applicability_coordinator_assignment.revoked',
    target: targets.company_role_assignment,
  },

  'company_mission_applicability_approver_assignment.granted': {
    ...ordinary,
    id: 'event-company_mission_applicability_approver_assignment.granted',
    action: 'company_mission_applicability_approver_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_mission_applicability_approver_assignment.revoked': {
    ...ordinary,
    id: 'event-company_mission_applicability_approver_assignment.revoked',
    action: 'company_mission_applicability_approver_assignment.revoked',
    target: targets.company_role_assignment,
  },

  'company_mission_result_reviewer_assignment.granted': {
    ...ordinary,
    id: 'event-company_mission_result_reviewer_assignment.granted',
    action: 'company_mission_result_reviewer_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_mission_result_reviewer_assignment.revoked': {
    ...ordinary,
    id: 'event-company_mission_result_reviewer_assignment.revoked',
    action: 'company_mission_result_reviewer_assignment.revoked',
    target: targets.company_role_assignment,
  },

  'company_task_result_recorder_assignment.granted': {
    ...ordinary,
    id: 'event-company_task_result_recorder_assignment.granted',
    action: 'company_task_result_recorder_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_task_result_recorder_assignment.revoked': {
    ...ordinary,
    id: 'event-company_task_result_recorder_assignment.revoked',
    action: 'company_task_result_recorder_assignment.revoked',
    target: targets.company_role_assignment,
  },
  'company_mission_deliverable_access_assignment.revoked': {
    ...ordinary,
    id: 'event-company_mission_deliverable_access_assignment.revoked',
    action: 'company_mission_deliverable_access_assignment.revoked',
    target: targets.company_role_assignment,
  },
  'company_document_content_reader_assignment.granted': {
    ...ordinary,
    id: 'event-company_document_content_reader_assignment.granted',
    action: 'company_document_content_reader_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_document_content_reader_assignment.revoked': {
    ...ordinary,
    id: 'event-company_document_content_reader_assignment.revoked',
    action: 'company_document_content_reader_assignment.revoked',
    target: targets.company_role_assignment,
  },
  'company_document_content_uploader_assignment.granted': {
    ...ordinary,
    id: 'event-company_document_content_uploader_assignment.granted',
    action: 'company_document_content_uploader_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_document_content_uploader_assignment.revoked': {
    ...ordinary,
    id: 'event-company_document_content_uploader_assignment.revoked',
    action: 'company_document_content_uploader_assignment.revoked',
    target: targets.company_role_assignment,
  },
  'company_document_approver_assignment.granted': {
    ...ordinary,
    id: 'event-company_document_approver_assignment.granted',
    action: 'company_document_approver_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_document_approver_assignment.revoked': {
    ...ordinary,
    id: 'event-company_document_approver_assignment.revoked',
    action: 'company_document_approver_assignment.revoked',
    target: targets.company_role_assignment,
  },
  'client.created': {
    ...ordinary,
    id: 'event-client.created',
    action: 'client.created',
    target: targets.client_account,
  },
  'client.corrected': {
    ...ordinary,
    id: 'event-client.corrected',
    action: 'client.corrected',
    target: targets.client_account,
  },
  'client_legal_entity.registered': {
    ...ordinary,
    id: 'event-client_legal_entity.registered',
    action: 'client_legal_entity.registered',
    target: targets.client_account,
  },
  'client_legal_entity.corrected': {
    ...ordinary,
    id: 'event-client_legal_entity.corrected',
    action: 'client_legal_entity.corrected',
    target: targets.client_account,
  },
  'client_company_relationship.established': {
    ...ordinary,
    id: 'event-client_company_relationship.established',
    action: 'client_company_relationship.established',
    target: targets.client_company_relationship,
  },
  'project.created': {
    ...ordinary,
    id: 'event-project.created',
    action: 'project.created',
    target: targets.project,
  },
  'project.responsible.changed': {
    ...ordinary,
    id: 'event-project.responsible.changed',
    action: 'project.responsible.changed',
    target: targets.project,
    metadata: {
      revision: 1,
      before: null,
      after: {
        workspaceMembershipId: 'member-after-703',
        displayLabel: 'Nom {after} — Имя',
      },
    },
  },
  'project.lifecycle.changed': {
    ...ordinary,
    id: 'event-project.lifecycle.changed',
    action: 'project.lifecycle.changed',
    target: targets.project,
    metadata: {
      lifecycleRevision: 1,
      from: 'preparatory',
      to: 'active',
      withStartException: true,
    },
  },
  'project.stage.changed': {
    ...ordinary,
    id: 'event-project.stage.changed',
    action: 'project.stage.changed',
    target: targets.project,
    metadata: {
      stageRevision: 1,
      fromStageKey: 'scoping',
      toStageKey: 'preparation',
    },
  },
  'project.template.version.created': {
    ...ordinary,
    id: 'event-project.template.version.created',
    action: 'project.template.version.created',
    target: targets.project_template_version,
    metadata: {
      templateKey: 'CONSULTING_PREPARATION_ILLUSTRATIVE',
      version: 1234,
      sourceVersion: 1233,
    },
  },
  'company_project_template_configuration_assignment.granted': {
    ...ordinary,
    id: 'event-company_project_template_configuration_assignment.granted',
    action: 'company_project_template_configuration_assignment.granted',
    target: targets.company_role_assignment,
  },
  'company_project_template_configuration_assignment.revoked': {
    ...ordinary,
    id: 'event-company_project_template_configuration_assignment.revoked',
    action: 'company_project_template_configuration_assignment.revoked',
    target: targets.company_role_assignment,
  },
  'task.created': {
    ...ordinary,
    id: 'event-task.created',
    action: 'task.created',
    target: targets.task,
  },
  'task.updated': {
    ...ordinary,
    id: 'event-task.updated',
    action: 'task.updated',
    target: targets.task,
  },
  'task.status.changed': {
    ...ordinary,
    id: 'event-task.status.changed',
    action: 'task.status.changed',
    target: targets.task,
  },
  'task.completed': {
    ...ordinary,
    id: 'event-task.completed',
    action: 'task.completed',
    target: targets.task,
  },
  'task.cancelled': {
    ...ordinary,
    id: 'event-task.cancelled',
    action: 'task.cancelled',
    target: targets.task,
  },
  'task.reopened': {
    ...ordinary,
    id: 'event-task.reopened',
    action: 'task.reopened',
    target: targets.task,
  },
  'document.registered': {
    ...ordinary,
    id: 'event-document.registered',
    action: 'document.registered',
    target: targets.document,
  },
  'document.corrected': {
    ...ordinary,
    id: 'event-document.corrected',
    action: 'document.corrected',
    target: {
      type: 'document',
      documentId: 'document-703-{literal}',
      companyId: activityLocaleIds.company,
    },
  },
  'document.version.drafted': {
    ...ordinary,
    id: 'event-document.version.drafted',
    action: 'document.version.drafted',
    target: targets.document,
    metadata: { versionNumber: 2, sourceVersionNumber: 1 },
  },
  'document.version.designated_official': {
    ...ordinary,
    id: 'event-document.version.designated_official',
    action: 'document.version.designated_official',
    target: targets.document,
    metadata: { versionNumber: 2, supersededVersionNumber: 1 },
  },
  'document.representation.added': {
    ...ordinary,
    id: 'event-document.representation.added',
    action: 'document.representation.added',
    target: targets.document,
    metadata: {
      versionNumber: 2,
      form: 'rendered',
      appendedAfterDesignation: true,
    },
  },
  'document.representation.removed': {
    ...ordinary,
    id: 'event-document.representation.removed',
    action: 'document.representation.removed',
    target: targets.document,
    metadata: {
      versionNumber: 1,
      form: 'editable',
      appendedAfterDesignation: false,
    },
  },
  'document.project.linked': {
    ...ordinary,
    id: 'event-document.project.linked',
    action: 'document.project.linked',
    target: targets.document_project,
  },
  'document.project.unlinked': {
    ...ordinary,
    id: 'event-document.project.unlinked',
    action: 'document.project.unlinked',
    target: targets.document_project,
  },
  'client.union_confirmed': {
    action: 'client.union_confirmed',
    projectionReference: 'projection-client.union_confirmed',
    companyId: activityLocaleIds.company,
    actor: { kind: 'authorized_resolver' },
    target: {
      type: 'client_union_operation',
      projectionReference: 'projection-client.union_confirmed',
      companyId: activityLocaleIds.company,
    },
  },
  'client.union_reversed': {
    action: 'client.union_reversed',
    projectionReference: 'projection-client.union_reversed',
    companyId: activityLocaleIds.company,
    actor: { kind: 'authorized_resolver' },
    target: {
      type: 'client_union_operation',
      projectionReference: 'projection-client.union_reversed',
      companyId: activityLocaleIds.company,
    },
  },
  'client_request.created': {
    ...ordinary,
    id: 'event-client_request.created',
    action: 'client_request.created',
    target: targets.client_request,
  },
  'client_request.client_associated': {
    ...ordinary,
    id: 'event-client_request.client_associated',
    action: 'client_request.client_associated',
    target: targets.client_request,
  },
  'opportunity.created': {
    ...ordinary,
    id: 'event-opportunity.created',
    action: 'opportunity.created',
    target: targets.opportunity,
  },
  'opportunity.next_action.updated': {
    ...ordinary,
    id: 'event-opportunity.next_action.updated',
    action: 'opportunity.next_action.updated',
    target: targets.opportunity,
  },
  'opportunity.responsible.changed': {
    ...ordinary,
    id: 'event-opportunity.responsible.changed',
    action: 'opportunity.responsible.changed',
    target: targets.opportunity,
    metadata: {
      before: {
        workspaceMembershipId: 'member-before-703',
        displayLabel: 'Nom {before} — Имя',
      },
      after: {
        workspaceMembershipId: 'member-after-703',
        displayLabel: 'Nom {after} — Имя',
      },
    },
  },
  'opportunity.outcome.changed': {
    ...ordinary,
    id: 'event-opportunity.outcome.changed',
    action: 'opportunity.outcome.changed',
    target: targets.opportunity,
    metadata: {
      previousStatus: 'ON_HOLD',
      newStatus: 'LOST',
      lossReasonCode: 'COMPETITOR',
    },
  },
  'offer.created': {
    ...ordinary,
    id: 'event-offer.created',
    action: 'offer.created',
    target: targets.offer_version,
    metadata: {},
  },
  'offer_version.created': {
    ...ordinary,
    id: 'event-offer_version.created',
    action: 'offer_version.created',
    target: targets.offer_version,
    metadata: {},
  },
  'offer_version.approved': {
    ...ordinary,
    id: 'event-offer_version.approved',
    action: 'offer_version.approved',
    target: targets.offer_version,
    metadata: {},
  },
  'offer_version.rejected': {
    ...ordinary,
    id: 'event-offer_version.rejected',
    action: 'offer_version.rejected',
    target: targets.offer_version,
    metadata: {},
  },
  'offer_version.transmission_recorded': {
    ...ordinary,
    id: 'event-offer_version.transmission_recorded',
    action: 'offer_version.transmission_recorded',
    target: targets.offer_version,
    metadata: { channel: 'SIMULATED' },
  },
  'offer_version.client_response_recorded': {
    ...ordinary,
    id: 'event-offer_version.client_response_recorded',
    action: 'offer_version.client_response_recorded',
    target: targets.offer_version,
    metadata: { outcome: 'ACCEPTED', evidenceKind: 'SIMULATED' },
  },
  'opportunity.stage.changed': {
    ...ordinary,
    id: 'event-opportunity.stage.changed',
    action: 'opportunity.stage.changed',
    target: targets.opportunity,
    metadata: { previousLabel: 'Cadrage {literal} — Этап', newLabel: null },
  },
  'sales_stage.configured': {
    ...ordinary,
    id: 'event-sales_stage.configured',
    action: 'sales_stage.configured',
    target: targets.sales_stage,
    metadata: { operation: 'CREATED', label: 'Étape {literal} — Этап' },
  },
  'contract.created': {
    ...ordinary,
    id: 'event-contract.created',
    action: 'contract.created',
    target: targets.contract_version,
    metadata: {},
  },
  'contract_version.created': {
    ...ordinary,
    id: 'event-contract_version.created',
    action: 'contract_version.created',
    target: targets.contract_version,
    metadata: {},
  },
  'contract_version.approved': {
    ...ordinary,
    id: 'event-contract_version.approved',
    action: 'contract_version.approved',
    target: targets.contract_version,
    metadata: {},
  },
  'contract_version.rejected': {
    ...ordinary,
    id: 'event-contract_version.rejected',
    action: 'contract_version.rejected',
    target: targets.contract_version,
    metadata: {},
  },
  'contract_version.signing_declared': {
    ...ordinary,
    id: 'event-contract_version.signing_declared',
    action: 'contract_version.signing_declared',
    target: targets.contract_version,
    metadata: {
      evidenceKind: 'DECLARED_RECEIVED_PDF',
      provenance: 'COMPANY_MODEL_OFFER',
    },
  },
  'contract_version.signature_recorded': {
    ...ordinary,
    id: 'event-contract_version.signature_recorded',
    action: 'contract_version.signature_recorded',
    target: targets.contract_version,
    metadata: { evidenceKind: 'SIMULATED' },
  },
  'contract_project.linked': {
    ...ordinary,
    id: 'event-contract_project.linked',
    action: 'contract_project.linked',
    target: targets.contract_version,
    metadata: {
      created: true,
      project: { projectId: 'project-703', projectTitle: activityLiteral },
    },
  },
} satisfies Record<ActivityLogEvent['action'], ActivityLogEvent>;

export const allActivityEvents: ActivityLogEvent[] = Object.values(
  activityEventsByAction,
);
export const heterogeneousActivityEvents: ActivityLogEvent[] = [
  activityEventsByAction['client_request.created'],
  activityEventsByAction['offer_version.transmission_recorded'],
  activityEventsByAction['contract_version.signature_recorded'],
  activityEventsByAction['opportunity.responsible.changed'],
  activityEventsByAction['opportunity.outcome.changed'],
  activityEventsByAction['project.lifecycle.changed'],
  activityEventsByAction['document.registered'],
  activityEventsByAction['client.union_confirmed'],
  activityEventsByAction['opportunity.stage.changed'],
  activityEventsByAction['project.template.version.created'],
  activityEventsByAction[
    'company_project_template_configuration_assignment.granted'
  ],
];

export function activityLocaleActor({
  companyId = activityLocaleIds.company,
  requests = true,
}: { companyId?: string; requests?: boolean } = {}): ActorContext {
  return {
    internalUserId: 'user-703',
    workspaceMembershipId: 'membership-703',
    workspaceId: 'workspace-703',
    workspaceName: 'Workspace {literal} — Espace',
    displayName: actor.displayName,
    email: 'activity-703@example.test',
    active: true,
    workspacePermissions: [],
    activeCompany: {
      id: companyId,
      displayName: activityLiteral,
      clientPermissions: [],
      commercialActivityPermissions: ['commercial.activity.read'],
      ...(requests
        ? {
            commercialIntakePermissions: [
              'commercial.request.read',
              'commercial.request.create',
              'commercial.opportunity.read',
              'commercial.opportunity.create',
              'commercial.opportunity.next_action.update',
            ],
            commercialIntakePermissionAssignmentId: 'intake-703',
            commercialIntakePermissionSetVersion: 'v2',
            offerPermissions: [
              'commercial.offer.read',
              'commercial.offer.approve',
              'commercial.offer.response.record',
            ],
            offerApproverAssignmentId: 'offer-reader-703',
            offerApproverPermissionSetVersion: 'v1',
            contractPermissions: [
              'commercial.contract.read',
              'commercial.contract.approve',
              'commercial.contract.signature.record',
            ],
            contractApproverAssignmentId: 'contract-reader-703',
            contractApproverPermissionSetVersion: 'v1',
          }
        : {}),
    },
  };
}

export const activityRequest = buildClientRequest({
  id: activityLocaleIds.request,
  companyId: activityLocaleIds.company,
  subject: 'Activity Request {literal} — Запрос / Demande',
  originalText: 'Original Request evidence {literal} — Источник',
  capturedByWorkspaceMembershipId: 'membership-703',
  capturedAt: activityInstant,
  initialOpportunity: {
    id: activityLocaleIds.opportunity,
    title: 'Opportunity {literal}',
    nextAction: 'Preserved next action {literal} — Действие',
    version: 2,
    responsibleActor: {
      workspaceMembershipId: 'membership-703',
      displayName: actor.displayName,
    },
  },
});
export const activityRequestList = {
  items: [requestListItemFor(activityRequest)],
};

// Complete synthetic records at the same HTTP seam as the existing immutable
// Offer/Contract Activity journeys. Version1 remains superseded by Version2.
export function activityOfferAt(versionNumber: 1 | 2) {
  return {
    id: 'offer-703',
    illustrativeReference: 1234,
    revision: 4,
    version: {
      createdAt: activityInstant,
      id:
        versionNumber === 1
          ? activityLocaleIds.offerVersion
          : 'offer-successor-703',
      qualityRuleSet: 'OFFER_QUALITY_ILLUSTRATIVE',
      qualityRuleSetVersion: 1,
      latestQualityRun: null,
      versionNumber,
      predecessorVersionId:
        versionNumber === 1 ? null : activityLocaleIds.offerVersion,
      supersededByVersionId: versionNumber === 1 ? 'offer-successor-703' : null,
      supersededAt: versionNumber === 1 ? '2026-09-22T10:00:00.000Z' : null,
      differences: [],
      pricingSnapshotId: 'snapshot-703',
      pricingSnapshot: {
        id: 'snapshot-703',
        currency: 'EUR',
        total: '345.00',
        committedAt: '2026-09-20T09:00:00.000Z',
      },
      recipient: {
        kind: 'PRIMARY',
        legalName: 'Literal Client {party} — Клиент',
        taxId: null,
        legalAddress: null,
        additionalLegalEntityId: null,
      },
      issuingCompanyLabel: activityLiteral,
      validityDays: 30,
      validUntil: '2026-10-27T09:00:00.000Z',
      scopeNote: null,
      commercialConditions:
        versionNumber === 1
          ? 'Historical Offer conditions {original} — Оферта'
          : 'HEAD MUST NOT REPLACE THE REQUESTED OFFER',
      decisionState: 'PENDING',
      decision: null,
      transmissionState: 'NOT_TRANSMITTED',
      transmission: null,
      clientResponseState: 'NONE',
      clientResponse: null,
      validityElapsed: false,
      provenance: 'ILLUSTRATIVE',
      provisional: true,
      representation: {
        templateCode: 'OFFER_ILLUSTRATIVE',
        templateVersion: 1,
        html: '<!doctype html><html lang="en"><body><h1>Illustrative Offer</h1></body></html>',
        sha256:
          'e08e76ef771b57620b188b0e65648e93f47dbf7c88fd8582a403e4e4f75eaf34',
      },
    },
  } satisfies import('../offer/offer-response').OfferView;
}
export function activityContractAt(versionNumber: 1 | 2): unknown {
  // Raw HTTP includes kind and Snapshot identity; readContract deliberately
  // erases those fields from its narrower rendered read model.
  const recipient = {
    kind: 'PRIMARY',
    additionalLegalEntityId: null,
    legalName: 'Literal Client {party} — Клиент',
    taxId: 'SYNTHETIC',
    legalAddress: 'Example Street',
  };
  const snapshot = {
    id: 'snapshot-703',
    currency: 'EUR',
    subtotal: '300.00',
    taxTotal: '45.00',
    total: '345.00',
    lines: [
      {
        serviceName: 'Illustrative service',
        quantity: '1',
        lineNet: '300.00',
        lineTax: '45.00',
      },
    ],
  };
  return {
    id: activityLocaleIds.contract,
    companyId: activityLocaleIds.company,
    opportunityId: activityLocaleIds.opportunity,
    kind: 'CONTRACT',
    origin: 'ACCEPTED_OFFER',
    sourceOfferId: 'offer-703',
    sourceOfferVersionId: 'accepted-offer-703',
    sourceOffer: { illustrativeReference: 1234, versionNumber: 1 },
    revision: 3,
    illustrativeReference: 2345,
    parent: null,
    parentContractId: null,
    addendumOrdinal: null,
    provisional: true,
    precontract: null,
    addenda: [],
    linkedProjects: [],
    version: {
      id:
        versionNumber === 1
          ? activityLocaleIds.contractVersion
          : 'contract-successor-703',
      versionNumber,
      createdContractRevision: versionNumber === 1 ? 1 : 3,
      predecessorVersionId:
        versionNumber === 1 ? null : activityLocaleIds.contractVersion,
      supersededByVersionId:
        versionNumber === 1 ? 'contract-successor-703' : null,
      differences: [],
      createdAt: '2026-09-21T10:00:00.000Z',
      recipient,
      qualityRuleSet: 'CONTRACT_QUALITY_ILLUSTRATIVE',
      qualityRuleSetVersion: 1,
      issuingCompanyLabel: activityLiteral,
      scopeNote: 'Synthetic accepted scope',
      commercialConditions: 'Accepted conditions {original}',
      termStartsOn: null,
      termEndsOn: null,
      specialConditions:
        versionNumber === 1
          ? 'Historical Contract conditions {original} — Договор'
          : 'HEAD MUST NOT REPLACE THE REQUESTED CONTRACT',
      preliminaryWork: null,
      changeSummary: null,
      latestQualityRun: null,
      decisionState: 'PENDING',
      decision: null,
      signature: null,
      executionState: 'NOT_EXECUTED',
      provenance: 'ILLUSTRATIVE',
      provisional: true,
      pricingSnapshotId: 'snapshot-703',
      pricingSnapshot: snapshot,
    },
  };
}

export const activityOfferPath = `/api/offers/opportunities/${activityLocaleIds.opportunity}`;
export const activityContractPath = `/api/contracts/opportunities/${activityLocaleIds.opportunity}`;
export const activityDetailPath = `/api/commercial-intake/requests/${activityLocaleIds.request}`;
export const activityNextActionPath = `/api/commercial-intake/opportunities/${activityLocaleIds.opportunity}/next-action`;
export const activityDraft = '  App draft {literal} — Позвонить / Préparer  ';
export function activitySavedRequest() {
  return buildClientRequest({
    ...activityRequest,
    initialOpportunity: {
      ...activityRequest.initialOpportunity,
      nextAction: activityDraft,
      version: 3,
    },
  });
}

/** Known unchanged GET fixtures. Adapters own delay/status/command sequencing. */
export function readActivityJourneyFixture({
  path,
  companyId = activityLocaleIds.company,
  requests = true,
  saved = false,
}: {
  path: string;
  companyId?: string;
  requests?: boolean;
  saved?: boolean;
}): unknown {
  if (path === '/api/access/current-actor')
    return activityLocaleActor({ companyId, requests });
  // Home composes this independent read even while Activity is selected.
  if (path === '/api/offer-decision-queue') return { items: [] };
  if (path === '/api/contract-decision-queue') return { items: [] };
  if (path === '/api/companies')
    return [
      { id: activityLocaleIds.company, displayName: activityLiteral },
      {
        id: activityLocaleIds.otherCompany,
        displayName: 'Other Company {literal}',
      },
    ];
  if (path === '/api/activity-log')
    return {
      events:
        companyId === activityLocaleIds.company
          ? heterogeneousActivityEvents
          : [],
    };
  if (path === '/api/commercial-intake/requests')
    return {
      items:
        companyId === activityLocaleIds.company
          ? [
              requestListItemFor(
                saved ? activitySavedRequest() : activityRequest,
              ),
            ]
          : [],
    };
  if (path === activityDetailPath)
    return saved ? activitySavedRequest() : activityRequest;
  if (path === activityOfferPath) return { offer: activityOfferAt(2) };
  if (path === `${activityOfferPath}/versions`)
    return {
      versions: [
        {
          id: 'offer-successor-703',
          versionNumber: 2,
          createdAt: '2026-09-22T10:00:00.000Z',
          supersededByVersionId: null,
        },
        {
          id: activityLocaleIds.offerVersion,
          versionNumber: 1,
          createdAt: activityInstant,
          supersededByVersionId: 'offer-successor-703',
        },
      ],
      nextCursor: null,
    };
  if (
    path === `${activityOfferPath}/versions/${activityLocaleIds.offerVersion}`
  )
    return { offer: activityOfferAt(1) };
  if (path === `${activityOfferPath}/versions/offer-successor-703`)
    return { offer: activityOfferAt(2) };
  if (path.startsWith(activityOfferPath) && path.endsWith('/quality-checks'))
    return { items: [], nextCursor: null };
  if (path === activityContractPath)
    return { contract: activityContractAt(2), precontract: null };
  if (path === `${activityContractPath}/versions`)
    return {
      items: [
        { id: 'contract-successor-703', versionNumber: 2 },
        { id: activityLocaleIds.contractVersion, versionNumber: 1 },
      ],
      nextCursor: null,
    };
  if (
    path ===
    `${activityContractPath}/versions/${activityLocaleIds.contractVersion}`
  )
    return { contract: activityContractAt(1) };
  if (path === `${activityContractPath}/versions/contract-successor-703`)
    return { contract: activityContractAt(2) };
  if (path.startsWith(activityContractPath) && path.endsWith('/quality-checks'))
    return { items: [], nextCursor: null };
  throw new Error('Unexpected Activity journey GET: ' + path);
}
