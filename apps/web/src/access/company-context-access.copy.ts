export const companyContextAccessCopy = {
  eyebrow: 'Access',
  title: 'Company access',
  description:
    'Choose an active Workspace member, an active Company and one approved access bundle. The displayed state is always reloaded from the server.',
  bundleLabel: 'Access bundle',
  documentProjectOrganizerBundle: 'Company Document Project Organizer',
  documentRegistrarBundle: 'Company Document Registrar',
  documentApproverBundle: 'Company Document Approver',
  documentApproverPrerequisites:
    'Company Document Approver v1 grants only the designation of a draft Document Version as official. Company context, Document and reference read, and Client read must already be authorized separately, for example through Company Document Registrar.',
  companyContextBundle: 'Company Context Access',
  projectBundle: 'Company Project Access',
  commercialIntakeBundle: 'Company Commercial Intake',
  serviceCatalogueBundle: 'Company Service Catalogue',
  pricingConfigurationBundle: 'Company Pricing Configuration',
  pricingConfigurationPrerequisites:
    'Company Pricing Configuration v1 grants offering read and pricing configuration only: reading and publishing illustrative Pricing Rule Versions and Tariff Versions. Company context must already be authorized separately.',
  commercialActivityReaderBundle: 'Company Commercial Activity Reader',
  commercialActivityReaderPrerequisites:
    'Company Commercial Activity Reader v1 grants commercial Activity Log read only. Company context and the commercial target read of each event must already be authorized separately.',
  projectApproverBundle: 'Company Project Approver',
  projectApproverPrerequisites:
    'Changes the Project lifecycle only; Project and Client read are authorized separately.',
  pricingUserBundle: 'Company Pricing User',
  pricingUserPrerequisites:
    'Company Pricing User v1 grants read-only access to offerings and the Pricing configuration; it grants no publication. Company context must already be authorized separately.',
  offerPreparerBundle: 'Company Offer Preparer',
  offerPreparerPrerequisites:
    'Company Offer Preparer v1 grants Offer read and preparation plus Pricing Snapshot read. Company context, Commercial Intake read and Client read must already be authorized separately.',
  pricingAdjustmentBundle: 'Company Pricing Adjustment',
  pricingAdjustmentPrerequisites:
    'Company Pricing Adjustment v1 grants only the application of a fixed net discount during a Pricing calculation. Company context, Opportunity visibility and Company Pricing User access must already be authorized separately.',
  taskManagerBundle: 'Company Task Manager',
  taskManagerPrerequisites:
    'Company Task Manager v1 grants Task read and management only. Company context, Project read and Client read must already be authorized separately.',
  directorClientBundle: 'Company Director Client Access',
  workspaceMemberLabel: 'Workspace member',
  companyLabel: 'Company',
  selectMember: 'Select a member',
  selectCompany: 'Select a Company',
  referenceLabel: 'Reference',
  grant: 'Grant access',
  revoke: 'Revoke access',
  granted: 'Access granted. Server state refreshed.',
  revoked: 'Access revoked. Server state refreshed.',
  currentStateLabel: 'Current server state',
  currentStateGranted: 'Granted',
  currentStateGrantedVersion: (version: string) =>
    `Granted — captured version ${version}`,
  capturedVersionExplanation:
    'The version is captured when access is granted. A later version applies only after this access is revoked and granted again.',
  currentStateNotGranted: 'Not granted',
  loading: 'Loading access administration…',
  empty: 'No active member or Company is available for access administration.',
  retry: 'Retry access state',
  error: 'The access state could not be loaded or changed.',
  activityActionLabels: {
    'company_task_manager_assignment.granted': 'granted Company Task Manager',
    'company_task_manager_assignment.revoked': 'revoked Company Task Manager',
    'company_document_project_organizer_assignment.granted':
      'granted Company Document Project Organizer',
    'company_document_project_organizer_assignment.revoked':
      'revoked Company Document Project Organizer',
    'company_document_registrar_assignment.granted':
      'granted Company Document Registrar',
    'company_document_registrar_assignment.revoked':
      'revoked Company Document Registrar',
    'company_document_approver_assignment.granted':
      'granted Company Document Approver',
    'company_document_approver_assignment.revoked':
      'revoked Company Document Approver',
    'company_project_assignment.granted': 'granted Company Project Access',
    'company_project_assignment.revoked': 'revoked Company Project Access',
    'company_commercial_intake_assignment.granted':
      'granted Company Commercial Intake',
    'company_commercial_intake_assignment.revoked':
      'revoked Company Commercial Intake',
    'company_service_catalogue_assignment.granted':
      'granted Company Service Catalogue',
    'company_service_catalogue_assignment.revoked':
      'revoked Company Service Catalogue',
    'company_pricing_configuration_assignment.granted':
      'granted Company Pricing Configuration',
    'company_pricing_configuration_assignment.revoked':
      'revoked Company Pricing Configuration',
    'company_commercial_activity_reader_assignment.granted':
      'granted Company Commercial Activity Reader',
    'company_commercial_activity_reader_assignment.revoked':
      'revoked Company Commercial Activity Reader',
    'company_project_approver_assignment.granted':
      'granted Company Project Approver',
    'company_project_approver_assignment.revoked':
      'revoked Company Project Approver',
    'company_pricing_user_assignment.granted': 'granted Company Pricing User',
    'company_pricing_user_assignment.revoked': 'revoked Company Pricing User',
    'company_offer_preparer_assignment.granted':
      'granted Company Offer Preparer',
    'company_offer_preparer_assignment.revoked':
      'revoked Company Offer Preparer',
    'company_pricing_adjustment_assignment.granted':
      'granted Company Pricing Adjustment',
    'company_pricing_adjustment_assignment.revoked':
      'revoked Company Pricing Adjustment',
    'company_context_assignment.granted': 'granted Company Context Access',
    'company_context_assignment.revoked': 'revoked Company Context Access',
    'company_director_client_assignment.granted':
      'granted Company Director Client Access',
    'company_director_client_assignment.revoked':
      'revoked Company Director Client Access',
  },
} as const;
