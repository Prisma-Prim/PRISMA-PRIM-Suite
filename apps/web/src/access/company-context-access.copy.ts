export const companyContextAccessCopy = {
  eyebrow: 'Access',
  title: 'Company access',
  description:
    'Choose an active Workspace member, an active Company and one approved access bundle. The displayed state is always reloaded from the server.',
  bundleLabel: 'Access bundle',
  companyContextBundle: 'Company Context Access',
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
    'company_context_assignment.granted': 'granted Company Context Access',
    'company_context_assignment.revoked': 'revoked Company Context Access',
    'company_director_client_assignment.granted':
      'granted Company Director Client Access',
    'company_director_client_assignment.revoked':
      'revoked Company Director Client Access',
  },
} as const;
