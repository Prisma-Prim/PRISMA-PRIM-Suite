import type { CompanyRoleBundle } from './company-permissions.js';

// The 65 literal URLs served before #1150 (main 05e7097), independent of
// the registry route derivation. Knowledge keeps its separate controller.
const legacyAssignmentRoutes = {
  company_certification_approver:
    '/api/company-certification-approver-assignments',
  company_certification_auditor:
    '/api/company-certification-auditor-assignments',
  company_certification_programme_manager:
    '/api/company-certification-programme-manager-assignments',
  company_certification_reader: '/api/company-certification-reader-assignments',
  company_commercial_activity_reader:
    '/api/company-commercial-activity-reader-assignments',
  company_commercial_intake: '/api/company-commercial-intake-assignments',
  company_context_access: '/api/company-context-assignments',
  company_contract_approver: '/api/company-contract-approver-assignments',
  company_contract_early_preparation:
    '/api/company-contract-early-preparation-assignments',
  company_contract_model_approver:
    '/api/company-contract-model-approver-assignments',
  company_contract_model_editor:
    '/api/company-contract-model-editor-assignments',
  company_contract_preparer: '/api/company-contract-preparer-assignments',
  company_contract_signature_declarer:
    '/api/company-contract-signature-declarer-assignments',
  company_director_client_access: '/api/company-director-client-assignments',
  company_document_approver: '/api/company-document-approver-assignments',
  company_document_content_reader:
    '/api/company-document-content-reader-assignments',
  company_document_content_uploader:
    '/api/company-document-content-uploader-assignments',
  company_document_project_organizer:
    '/api/company-document-project-organizer-assignments',
  company_document_registrar: '/api/company-document-registrar-assignments',
  company_external_invoice_access:
    '/api/company-external-invoice-access-assignments',
  company_ideas_reader: '/api/company-ideas-reader-assignments',
  company_ideas_recorder: '/api/company-ideas-recorder-assignments',
  company_ideas_reviewer: '/api/company-ideas-reviewer-assignments',
  company_internal_task_manager:
    '/api/company-internal-task-manager-assignments',
  company_invoice_reader: '/api/company-invoice-reader-assignments',
  company_invoice_recorder: '/api/company-invoice-recorder-assignments',
  company_knowledge_evidence_reader: null,
  company_knowledge_source_administrator: null,
  company_mission_applicability_approver:
    '/api/company-mission-applicability-approver-assignments',
  company_mission_applicability_coordinator:
    '/api/company-mission-applicability-coordinator-assignments',
  company_mission_deliverable_access:
    '/api/company-mission-deliverable-access-assignments',
  company_mission_plan_configuration:
    '/api/company-mission-plan-configuration-assignments',
  company_mission_plan_user: '/api/company-mission-plan-user-assignments',
  company_mission_result_reviewer:
    '/api/company-mission-result-reviewer-assignments',
  company_offer_approver: '/api/company-offer-approver-assignments',
  company_offer_model_approver: '/api/company-offer-model-approver-assignments',
  company_offer_model_editor: '/api/company-offer-model-editor-assignments',
  company_offer_preparer: '/api/company-offer-preparer-assignments',
  company_operational_risk_reader:
    '/api/company-operational-risk-reader-assignments',
  company_operational_risk_recorder:
    '/api/company-operational-risk-recorder-assignments',
  company_opportunity_follow_up_coordinator:
    '/api/company-opportunity-follow-up-coordinator-assignments',
  company_opportunity_manager: '/api/company-opportunity-manager-assignments',
  company_payment_confirmer: '/api/company-payment-confirmer-assignments',
  company_payment_evidence_access:
    '/api/company-payment-evidence-access-assignments',
  company_payment_reader: '/api/company-payment-reader-assignments',
  company_payment_recorder: '/api/company-payment-recorder-assignments',
  company_payment_reverser: '/api/company-payment-reverser-assignments',
  company_pricing_adjustment: '/api/company-pricing-adjustment-assignments',
  company_pricing_configuration:
    '/api/company-pricing-configuration-assignments',
  company_pricing_user: '/api/company-pricing-user-assignments',
  company_profitability_contributor:
    '/api/company-profitability-contributor-assignments',
  company_profitability_director:
    '/api/company-profitability-director-assignments',
  company_project_access: '/api/company-project-assignments',
  company_project_approver: '/api/company-project-approver-assignments',
  company_project_next_action_coordinator:
    '/api/company-project-next-action-coordinator-assignments',
  company_project_stage_advancer:
    '/api/company-project-stage-advancer-assignments',
  company_project_template_configuration:
    '/api/company-project-template-configuration-assignments',
  company_project_template_user:
    '/api/company-project-template-user-assignments',
  company_received_addendum_access:
    '/api/company-received-addendum-access-assignments',
  company_received_audit_source_access:
    '/api/company-received-audit-source-access-assignments',
  company_received_contract_access:
    '/api/company-received-contract-access-assignments',
  company_sales_stage_configuration:
    '/api/company-sales-stage-configuration-assignments',
  company_service_catalogue: '/api/company-service-catalogue-assignments',
  company_task_manager: '/api/company-task-manager-assignments',
  company_task_result_recorder: '/api/company-task-result-recorder-assignments',
  company_working_evidence_case_reader:
    '/api/company-working-evidence-case-reader-assignments',
  company_working_evidence_case_recorder:
    '/api/company-working-evidence-case-recorder-assignments',
} satisfies Record<CompanyRoleBundle, string | null>;

export const assignmentRouteCases = Object.keys(legacyAssignmentRoutes)
  .filter((bundle): bundle is CompanyRoleBundle =>
    Object.hasOwn(legacyAssignmentRoutes, bundle),
  )
  .flatMap((bundle) => {
    const path = legacyAssignmentRoutes[bundle];
    return path === null ? [] : [{ bundle, path }];
  });
