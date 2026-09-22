export const companyContextAccessCopy = {
  eyebrow: 'Access',
  title: 'Company access',
  description:
    'Choose an active Workspace member, an active Company and one approved access bundle. The displayed state is always reloaded from the server.',
  bundleLabel: 'Access bundle',
  documentProjectOrganizerBundle: 'Company Document Project Organizer',
  documentRegistrarBundle: 'Company Document Registrar',
  companyContextBundle: 'Company Context Access',
  projectBundle: 'Company Project Access',
  commercialIntakeBundle: 'Company Commercial Intake',
  serviceCatalogueBundle: 'Company Service Catalogue',
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
    'company_context_assignment.granted': 'granted Company Context Access',
    'company_context_assignment.revoked': 'revoked Company Context Access',
    'company_director_client_assignment.granted':
      'granted Company Director Client Access',
    'company_director_client_assignment.revoked':
      'revoked Company Director Client Access',
  },
} as const;
