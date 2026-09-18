export const workspaceInvitationsCopy = {
  title: 'Workspace invitations',
  description:
    'Invite a person to this Workspace. An invitation does not grant membership, Company access or business permissions.',
  email: 'Recipient email',
  expiry: 'Expires in days',
  send: 'Send invitation',
  loading: 'Loading invitations…',
  empty: 'No invitations on this page.',
  error:
    'The request could not be confirmed. Retry the same request to check its result.',
  forbidden: 'You no longer have permission to manage invitations.',
  refresh: 'Check invitation status',
  reload: 'Reload invitations',
  more: 'Next page',
  first: 'First page',
  revoke: 'Revoke invitation',
  confirm: 'Confirm revocation',
  cancel: 'Cancel',
  confirmation:
    'Revoke this invitation? A revoked invitation cannot be used to join this Workspace.',
  revocationPending:
    'Revocation recorded. The email link still requires confirmation from Clerk.',
  usedBeforeRevocation:
    'Clerk reports that this invitation was already used. Local revocation remains recorded; no Workspace access is granted here.',
  checkAfter: 'Next provider check available after',
  expires: 'Expires',
  consumed:
    'Accepted into the Workspace. Business access is assigned separately.',
  statuses: {
    uncertain:
      'Delivery unconfirmed — check status before sending another invitation.',
    pending: 'Invitation sent; awaiting use.',
    accepted:
      'Used at Clerk; Workspace admission is not granted by this invitation screen.',
    revoked: 'Revoked',
    expired: 'Expired',
    rejected:
      'Clerk rejected the invitation. Check the recipient and provider configuration.',
  },
  activityActionLabels: {
    'workspace_invitation.accepted': 'accepted a Workspace invitation',
    'workspace_invitation.issued': 'issued a Workspace invitation',
    'workspace_invitation.revoked': 'revoked a Workspace invitation',
  },
} as const;
