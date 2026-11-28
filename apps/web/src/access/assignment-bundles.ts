import type {
  AssignmentBundleLabel,
  CompanyAccessMember,
} from './company-access-administration-response';

/** One administrable Company access bundle, by its route segment. */
export type AssignmentBundle =
  | 'opportunity-follow-up-coordinator'
  | 'payment-reader'
  | 'payment-recorder'
  | 'payment-confirmer'
  | 'payment-reverser'
  | 'payment-evidence-access'
  | 'invoice-reader'
  | 'invoice-recorder'
  | 'external-invoice-access'
  | 'mission-plan-configuration'
  | 'mission-plan-user'
  | 'contract-model-editor'
  | 'contract-model-approver'
  | 'offer-model-editor'
  | 'offer-model-approver'
  | 'mission-applicability-coordinator'
  | 'project-next-action-coordinator'
  | 'mission-applicability-approver'
  | 'mission-result-reviewer'
  | 'task-result-recorder'
  | 'internal-task-manager'
  | 'task-manager'
  | 'company-context'
  | 'director-client'
  | 'mission-deliverable-access'
  | 'contract-signature-declarer'
  | 'received-contract-access'
  | 'received-addendum-access'
  | 'working-evidence-case-reader'
  | 'working-evidence-case-recorder'
  | 'received-audit-source-access'
  | 'document-registrar'
  | 'document-content-reader'
  | 'document-content-uploader'
  | 'document-approver'
  | 'document-project-organizer'
  | 'commercial-intake'
  | 'service-catalogue'
  | 'pricing-configuration'
  | 'pricing-user'
  | 'offer-preparer'
  | 'contract-preparer'
  | 'contract-early-preparation'
  | 'contract-approver'
  | 'offer-approver'
  | 'pricing-adjustment'
  | 'commercial-activity-reader'
  | 'opportunity-manager'
  | 'sales-stage-configuration'
  | 'project-template-user'
  | 'project-template-configuration'
  | 'project-stage-advancer'
  | 'project'
  | 'project-approver'
  | 'ideas-reader'
  | 'ideas-recorder'
  | 'ideas-reviewer'
  | 'certification-reader'
  | 'certification-programme-manager'
  | 'certification-approver'
  | 'certification-auditor'
  | 'profitability-contributor'
  | 'profitability-director'
  | 'operational-risk-reader'
  | 'operational-risk-recorder';
// Indexing by the selected bundle makes a new bundle a type error until its
// route and label are decided here.
export const ASSIGNMENT_PATHS: Record<AssignmentBundle, string> = {
  'opportunity-follow-up-coordinator':
    '/company-opportunity-follow-up-coordinator-assignments',
  'payment-reader': '/company-payment-reader-assignments',
  'payment-recorder': '/company-payment-recorder-assignments',
  'payment-confirmer': '/company-payment-confirmer-assignments',
  'payment-reverser': '/company-payment-reverser-assignments',
  'payment-evidence-access': '/company-payment-evidence-access-assignments',
  'invoice-reader': '/company-invoice-reader-assignments',
  'invoice-recorder': '/company-invoice-recorder-assignments',
  'external-invoice-access': '/company-external-invoice-access-assignments',
  'mission-plan-configuration':
    '/company-mission-plan-configuration-assignments',
  'mission-plan-user': '/company-mission-plan-user-assignments',
  'contract-model-editor': '/company-contract-model-editor-assignments',
  'contract-model-approver': '/company-contract-model-approver-assignments',
  'offer-model-editor': '/company-offer-model-editor-assignments',
  'offer-model-approver': '/company-offer-model-approver-assignments',
  'task-result-recorder': '/company-task-result-recorder-assignments',
  'mission-result-reviewer': '/company-mission-result-reviewer-assignments',
  'mission-applicability-coordinator':
    '/company-mission-applicability-coordinator-assignments',
  'project-next-action-coordinator':
    '/company-project-next-action-coordinator-assignments',
  'mission-applicability-approver':
    '/company-mission-applicability-approver-assignments',
  'ideas-reader': '/company-ideas-reader-assignments',
  'ideas-recorder': '/company-ideas-recorder-assignments',
  'ideas-reviewer': '/company-ideas-reviewer-assignments',
  'certification-reader': '/company-certification-reader-assignments',
  'certification-programme-manager':
    '/company-certification-programme-manager-assignments',
  'certification-approver': '/company-certification-approver-assignments',
  'certification-auditor': '/company-certification-auditor-assignments',
  'operational-risk-reader': '/company-operational-risk-reader-assignments',
  'operational-risk-recorder': '/company-operational-risk-recorder-assignments',
  'profitability-contributor': '/company-profitability-contributor-assignments',
  'profitability-director': '/company-profitability-director-assignments',
  'internal-task-manager': '/company-internal-task-manager-assignments',
  'task-manager': '/company-task-manager-assignments',
  'company-context': '/company-context-assignments',
  'director-client': '/company-director-client-assignments',
  'document-registrar': '/company-document-registrar-assignments',
  'contract-signature-declarer':
    '/company-contract-signature-declarer-assignments',
  'received-contract-access': '/company-received-contract-access-assignments',
  'received-addendum-access': '/company-received-addendum-access-assignments',
  'working-evidence-case-reader':
    '/company-working-evidence-case-reader-assignments',
  'working-evidence-case-recorder':
    '/company-working-evidence-case-recorder-assignments',
  'received-audit-source-access':
    '/company-received-audit-source-access-assignments',

  'mission-deliverable-access':
    '/company-mission-deliverable-access-assignments',
  'document-content-reader': '/company-document-content-reader-assignments',
  'document-content-uploader': '/company-document-content-uploader-assignments',
  'document-approver': '/company-document-approver-assignments',
  'document-project-organizer':
    '/company-document-project-organizer-assignments',
  'commercial-intake': '/company-commercial-intake-assignments',
  'service-catalogue': '/company-service-catalogue-assignments',
  'pricing-configuration': '/company-pricing-configuration-assignments',
  'pricing-user': '/company-pricing-user-assignments',
  'offer-preparer': '/company-offer-preparer-assignments',
  'contract-preparer': '/company-contract-preparer-assignments',
  'contract-early-preparation':
    '/company-contract-early-preparation-assignments',
  'contract-approver': '/company-contract-approver-assignments',
  'offer-approver': '/company-offer-approver-assignments',
  'pricing-adjustment': '/company-pricing-adjustment-assignments',
  'commercial-activity-reader':
    '/company-commercial-activity-reader-assignments',
  'opportunity-manager': '/company-opportunity-manager-assignments',
  'sales-stage-configuration': '/company-sales-stage-configuration-assignments',
  'project-template-user': '/company-project-template-user-assignments',
  'project-template-configuration':
    '/company-project-template-configuration-assignments',
  'project-stage-advancer': '/company-project-stage-advancer-assignments',
  project: '/company-project-assignments',
  'project-approver': '/company-project-approver-assignments',
};

export function bundleLabel(bundle: AssignmentBundle): AssignmentBundleLabel {
  const labels = {
    'opportunity-follow-up-coordinator':
      'Company Opportunity Follow-up Coordinator',
    'payment-reader': 'Company Payment Reader',
    'payment-recorder': 'Company Payment Recorder',
    'payment-confirmer': 'Company Payment Confirmer',
    'payment-reverser': 'Company Payment Reverser',
    'payment-evidence-access': 'Company Payment Evidence Access',
    'invoice-reader': 'Company Invoice Reader',
    'invoice-recorder': 'Company Invoice Recorder',
    'external-invoice-access': 'Company External Invoice Access',
    'mission-plan-configuration': 'Company Mission Plan Configuration',
    'mission-plan-user': 'Company Mission Plan User',
    'contract-model-editor': 'Company Contract Model Editor',
    'contract-model-approver': 'Company Contract Model Approver',
    'offer-model-editor': 'Company Offer Model Editor',
    'offer-model-approver': 'Company Offer Model Approver',
    'ideas-reader': 'Company Ideas Reader',
    'ideas-recorder': 'Company Ideas Recorder',
    'ideas-reviewer': 'Company Ideas Reviewer',
    'certification-reader': 'Company Certification Reader',
    'certification-programme-manager':
      'Company Certification Programme Manager',
    'certification-approver': 'Company Certification Approver',
    'certification-auditor': 'Company Certification Auditor',
    'operational-risk-reader': 'Company Operational Risk Reader',
    'operational-risk-recorder': 'Company Operational Risk Recorder',
    'profitability-contributor': 'Company Profitability Contributor',
    'profitability-director': 'Company Profitability Director',
    'commercial-intake': 'Company Commercial Intake',
    'service-catalogue': 'Company Service Catalogue',
    'pricing-configuration': 'Company Pricing Configuration',
    'pricing-user': 'Company Pricing User',
    'offer-preparer': 'Company Offer Preparer',
    'contract-preparer': 'Company Contract Preparer',
    'contract-early-preparation': 'Company Contract Early Preparation',
    'contract-approver': 'Company Contract Approver',
    'offer-approver': 'Company Offer Approver',
    'pricing-adjustment': 'Company Pricing Adjustment',
    'commercial-activity-reader': 'Company Commercial Activity Reader',
    'opportunity-manager': 'Company Opportunity Manager',
    'sales-stage-configuration': 'Company Sales Stage Configuration',
    'project-template-user': 'Company Project Template User',
    'project-template-configuration': 'Company Project Template Configuration',
    'project-stage-advancer': 'Company Project Stage Advancer',
    'internal-task-manager': 'Company Internal Task Manager',
    'task-manager': 'Company Task Manager',
    'mission-result-reviewer': 'Company Mission Result Reviewer',
    'mission-applicability-coordinator':
      'Company Mission Applicability Coordinator',
    'project-next-action-coordinator':
      'Company Project Next Action Coordinator',
    'mission-applicability-approver': 'Company Mission Applicability Approver',
    'task-result-recorder': 'Company Task Result Recorder',
    'document-project-organizer': 'Company Document Project Organizer',
    'document-registrar': 'Company Document Registrar',
    'mission-deliverable-access': 'Company Mission Deliverable Access',
    'contract-signature-declarer': 'Company Contract Signature Declarer',
    'received-contract-access': 'Company Received Contract Access',
    'received-addendum-access': 'Company Received Addendum Access',
    'working-evidence-case-reader': 'Company Working Evidence Case Reader',
    'working-evidence-case-recorder': 'Company Working Evidence Case Recorder',
    'received-audit-source-access': 'Company Received Audit Source Access',

    'document-content-reader': 'Company Document Content Reader',
    'document-content-uploader': 'Company Document Content Uploader',
    'document-approver': 'Company Document Approver',
    project: 'Company Project Access',
    'project-approver': 'Company Project Approver',
    'director-client': 'Company Director Client Access',
    'company-context': 'Company Context Access',
  } satisfies Record<AssignmentBundle, AssignmentBundleLabel>;
  return labels[bundle];
}

export function memberLabel(member: CompanyAccessMember): string {
  return `${member.displayName} — ${member.email}`;
}

export function duplicatedLabels(labels: string[]): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const label of labels) {
    if (seen.has(label)) duplicates.add(label);
    seen.add(label);
  }
  return duplicates;
}

export function disambiguatedLabel({
  label,
  id,
  duplicates,
  referenceLabel,
}: {
  label: string;
  id: string;
  duplicates: ReadonlySet<string>;
  referenceLabel: string;
}): string {
  if (!duplicates.has(label)) return label;
  return `${label} — ${referenceLabel} ${stableReference(id)}`;
}

function stableReference(id: string): string {
  return BigInt(`0x${id.replaceAll('-', '')}`)
    .toString(36)
    .toUpperCase();
}
