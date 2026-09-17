export const sessionRevocationCopy = {
  title: 'Identity-provider sessions',
  description:
    'Suspended members remain blocked from this Workspace even if session revocation needs another attempt. Revocation signs the person out of all sessions in this application, including sessions used for other Workspaces.',
  refresh: 'Check session revocations',
  more: 'Next suspended members',
  retry: 'Retry session revocation',
  pending: 'Checking session revocations…',
  empty: 'No suspended members on this page.',
  error:
    'Session revocation status could not be verified. Workspace access remains suspended.',
  status: {
    pending: 'Session revocation pending.',
    running: 'Session revocation in progress. Check again shortly.',
    retry_required:
      'Session revocation needs another attempt. Retry after 30 seconds.',
    complete:
      'Existing provider sessions revoked. Workspace access remains suspended.',
  },
};
