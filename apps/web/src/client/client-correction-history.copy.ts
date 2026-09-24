import { clientWorkspaceCopy } from './client-workspace.copy';

export const clientCorrectionHistoryCopy = {
  title: 'Correction history',
  show: 'Show correction history',
  hide: 'Hide correction history',
  loading: 'Loading correction history…',
  empty: 'No corrections have been recorded for this Client in this Company.',
  error:
    'We could not load the correction history. The dossier remains available.',
  retry: 'Retry correction history',
  unavailable: 'Correction history is not available with your current access.',
  list: 'Corrections, newest first',
  correctedBy: (displayName: string) => `Corrected by ${displayName}`,
  changedTo: 'changed to',
  before: 'Before',
  after: 'After',
  showOlder: 'Show older corrections',
  loadingOlder: 'Loading older corrections…',
  olderError: 'Older corrections could not be loaded. Try again.',
  notProvided: clientWorkspaceCopy.notProvided,
  noContacts: clientWorkspaceCopy.noContacts,
  fieldLabels: {
    displayName: clientWorkspaceCopy.displayNameLabel,
    taxId: clientWorkspaceCopy.taxIdLabel,
    address: clientWorkspaceCopy.addressLabel,
    telephone: clientWorkspaceCopy.telephoneLabel,
    generalEmail: clientWorkspaceCopy.generalEmailLabel,
    businessActivity: clientWorkspaceCopy.businessActivityLabel,
    contacts: clientWorkspaceCopy.contactsLabel,
  },
} as const;
