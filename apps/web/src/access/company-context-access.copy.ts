export const companyContextAccessCopy = {
  eyebrow: 'Access',
  title: 'Company Context Access',
  description:
    'Grant or revoke one approved, fixed Company-scoped access bundle.',
  bundleLabel: 'Access bundle',
  companyContextBundle: 'Company Context Access',
  directorClientBundle: 'Company Director Client Access',
  workspaceMembershipLabel: 'Workspace membership ID',
  companyLabel: 'Company ID',
  grant: 'Grant access',
  revoke: 'Revoke access',
  granted: 'Access granted.',
  revoked: 'Access revoked.',
  error: 'The access change could not be completed.',
  activityActionLabels: {
    'company_context_assignment.granted': 'granted Company Context Access',
    'company_context_assignment.revoked': 'revoked Company Context Access',
    'company_director_client_assignment.granted':
      'granted Company Director Client Access',
    'company_director_client_assignment.revoked':
      'revoked Company Director Client Access',
  },
} as const;
