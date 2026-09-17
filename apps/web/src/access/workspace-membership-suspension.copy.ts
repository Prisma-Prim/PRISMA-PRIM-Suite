export const workspaceMembershipSuspensionCopy = {
  title: 'Workspace access',
  description:
    'Suspend an active member without deleting their identity, assignments, or history.',
  memberLabel: 'Member to suspend',
  selectMember: 'Select a member',
  review: 'Review suspension',
  confirmationRegionLabel: 'Confirm Workspace access suspension',
  confirmation:
    'Their application access will stop. Their identity, assignments, and history will be preserved. Existing identity-provider sessions will also be revoked across this application.',
  selectedMemberLabel: 'Selected member',
  cancel: 'Cancel',
  confirm: 'Suspend access',
  submitting: 'Suspending Workspace access…',
  suspended: 'Member suspended. Server state refreshed.',
  error: 'The suspension could not be completed. Server state was refreshed.',
  empty: 'No active member is available for suspension.',
  activityActionLabels: {
    'workspace_sessions.revoked': 'revoked existing provider sessions for',
    'workspace_sessions.revocation_retry_required':
      'recorded a required provider-session retry for',
    'workspace_membership.suspended': 'suspended Workspace access for',
  },
} as const;
