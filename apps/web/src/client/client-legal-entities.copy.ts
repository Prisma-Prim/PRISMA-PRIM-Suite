import { clientWorkspaceCopy } from './client-workspace.copy';

export const clientLegalEntitiesCopy = {
  title: 'Legal entities and branches',
  description:
    'Branches or other legal entities linked to the main organization of this Client.',
  loading: 'Loading legal entities and branches…',
  empty:
    'No additional legal entities or branches recorded. The dossier identity above is the main organization.',
  error:
    'Legal entities and branches could not be loaded. The dossier remains available.',
  retry: 'Retry legal entities and branches',
  unavailable:
    'Legal entities and branches are not available with your current access.',
  list: 'Recorded legal entities and branches',
  legalNameLabel: 'Exact legal name',
  taxIdLabel: clientWorkspaceCopy.taxIdLabel,
  legalAddressLabel: 'Legal address',
  notRecorded: 'Not recorded',
  add: 'Add legal entity or branch',
  addTitle: 'Add a legal entity or branch',
  correct: 'Correct',
  correctEntity: (legalName: string) => `Correct ${legalName}`,
  save: 'Save legal entity',
  saving: 'Saving legal entity…',
  cancel: 'Cancel',
  recorded: 'Legal entity or branch recorded.',
  corrected: 'Legal entity or branch corrected.',
  legalNameRequired: 'Enter the exact legal name.',
  legalNameTooLong: 'The legal name must be 200 characters or fewer.',
  taxIdTooLong: 'The IDNO / tax code must be 500 characters or fewer.',
  legalAddressTooLong: 'The legal address must be 2,000 characters or fewer.',
  unchanged: 'Change at least one value before saving.',
  invalid: 'Check the legal entity values and try again.',
  uncertain:
    'We could not confirm whether this change was saved. Save again to retry exactly the same change safely.',
  stale:
    'This Client dossier changed before your change was saved. Reload the legal entities and branches before trying again.',
  reload: 'Reload legal entities and branches',
  capacity:
    'This Client already records the maximum of 50 additional legal entities or branches. Nothing was added.',
  activityActionLabels: {
    'client_legal_entity.registered': 'recorded a Client legal entity',
    'client_legal_entity.corrected': 'corrected a Client legal entity',
  },
} as const;
