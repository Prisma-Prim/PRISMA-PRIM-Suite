export const workspaceMembershipSuspensionCopy = {
  title: 'Workspace access',
  description:
    'Suspend an active member without deleting their identity, assignments, or history.',
  memberLabel: 'Member to suspend',
  selectMember: 'Select a member',
  review: 'Review suspension',
  confirmationRegionLabel: 'Confirm Workspace access suspension',
  confirmation:
    'Their application access will stop. Their identity, assignments, and history will be preserved.',
  selectedMemberLabel: 'Selected member',
  cancel: 'Cancel',
  confirm: 'Suspend access',
  submitting: 'Suspending Workspace access…',
  suspended: 'Member suspended. Server state refreshed.',
  error: 'The suspension could not be completed. Server state was refreshed.',
  empty: 'No active member is available for suspension.',
  activityActionLabels: {
    'workspace_membership.suspended': 'suspended Workspace access for',
  },
} as const;
