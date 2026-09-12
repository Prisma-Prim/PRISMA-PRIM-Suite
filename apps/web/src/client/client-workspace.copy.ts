export const clientWorkspaceCopy = {
  navigationLabel: 'Clients',
  eyebrow: 'Shared Client',
  title: 'Clients',
  description:
    'Create, view and correct the approved shared Client dossier for the active Company.',
  displayNameLabel: 'Client display name',
  taxIdLabel: 'IDNO / tax code',
  addressLabel: 'Address',
  telephoneLabel: 'Telephone',
  generalEmailLabel: 'General email',
  businessActivityLabel: 'Business activity',
  contactNameLabel: 'Contact name',
  contactTelephoneLabel: 'Contact telephone',
  contactEmailLabel: 'Contact email',
  create: 'Create Client',
  creating: 'Creating…',
  loading: 'Loading Clients…',
  missingCompany: 'Select an active Company to work with Clients.',
  permissionDenied: 'You do not have permission to manage Clients.',
  displayNameRequired: 'Client display name is required.',
  retryableError: 'We could not load Clients. Please try again.',
  possibleDuplicate:
    'This Client may already exist. No Client was created or changed. An authorized reviewer can compare the records safely.',
  searchLabel: 'Find a shared Client',
  search: 'Search Clients',
  searching: 'Searching…',
  searchRequired: 'Enter a Client name to search.',
  noSearchResults: 'No shared Client matches this search.',
  notAvailableInCompany: 'This Client is not available in the active Company.',
  searchResultsTitle: 'Search results',
  clientId: (id: string) => `Client ID: ${id}`,
  openDossier: 'Open dossier',
  loadingDossier: 'Loading Client dossier…',
  dossierNotFound: 'The Client dossier is not available in this Company.',
  dossierEyebrow: 'Shared general dossier',
  version: (version: number) => `Version ${version}`,
  notProvided: 'Not provided',
  involvedCompaniesLabel: 'Involved provider Companies',
  contactsLabel: 'Contacts',
  noContacts: 'No shared Contacts recorded.',
  contactsEditLabel: 'Editable Contacts',
  contactEditorLabel: (position: number) => `Contact ${position}`,
  addContact: 'Add Contact',
  removeContact: 'Remove Contact',
  contactsInvalid: 'Each Contact must have a name.',
  correctionFormLabel: 'Correct Client dossier',
  correctionInvalid: 'The Client correction is invalid.',
  saveCorrection: 'Save correction',
  savingCorrection: 'Saving…',
  correctionSaved: 'Client correction saved with attributable history.',
  correctionRetry: 'The correction could not be saved. Retry safely.',
  duplicateReviewTitle: 'Possible duplicate reviews',
  duplicateReviewDescription:
    'Only reviews covered by your complete current Company authority appear here.',
  loadingDuplicateReviews: 'Loading possible duplicate reviews…',
  loadMoreDuplicateReviews: 'Load more possible duplicate reviews',
  loadingMoreDuplicateReviews: 'Loading more possible duplicate reviews…',
  loadingDuplicateReview: 'Loading the duplicate comparison…',
  noDuplicateReviews: 'No possible duplicate review is currently available.',
  duplicateReviewRetry: 'The duplicate review could not be loaded safely.',
  duplicateReviewContinuationRetry:
    'More duplicate reviews could not be loaded safely. Try again.',
  duplicateReviewUnavailable:
    'This review is no longer available. Its data or authority may have changed.',
  openDuplicateReview: (position: number) =>
    `Review possible duplicate ${position}`,
  multipleDuplicateCandidates:
    'Several existing Clients use this identifier. Data remediation is required before comparison can continue.',
  duplicateComparisonTitle: 'Compare the proposed and existing Client',
  duplicateFieldColumn: 'Field',
  duplicateProposalColumn: 'Proposed value',
  duplicateCandidateColumn: 'Existing Client',
  notApplicable: 'Not applicable',
  attachExistingDuplicate: 'Use this existing Client in the active Company',
  attachingDuplicate: 'Adding existing Client…',
  correctDuplicateProposal:
    'Return to the dossier and submit a fresh ordinary correction after reviewing these values.',
  staleCorrection:
    'This dossier changed before your correction was saved. Reload the current version before retrying.',
  reloadDossier: 'Reload dossier',
  addToCompany: (companyName: string) => `Add to ${companyName}`,
  availableInCompany: (companyName: string) => `Available in ${companyName}`,
  empty: (companyName: string) => `No Clients for ${companyName} yet.`,
  unionTitle: 'Unite two existing Client dossiers',
  unionDescription:
    'Select exactly two Clients that share one exact IDNO / tax code. The union is non-destructive and reversible while the reviewed state still holds.',
  unionSelectLabel: (position: number) => `Client ${position} to compare`,
  unionSelectPlaceholder: 'Select a Client',
  unionCompare: 'Compare dossiers',
  unionComparing: 'Comparing…',
  unionSelectionRequired: 'Select two different Clients to compare.',
  unionComparisonTitle: 'Review both dossiers before uniting',
  unionCanonicalLegend: 'Canonical dossier to keep',
  unionFieldColumn: 'Field',
  unionKeepValueLabel: (field: string, client: string) =>
    `Keep the ${field} of ${client}`,
  unionDifferingFieldsHint:
    'Choose the current value for each field the two dossiers do not share.',
  unionAffectedCompaniesLegend: 'Confirm every affected provider Company',
  unionReasonLabel: 'Written reason for the union',
  unionReasonRequired: 'A written reason is required.',
  unionCompaniesRequired:
    'Confirm every affected provider Company before uniting.',
  unionConfirm: 'Confirm union',
  unionConfirming: 'Uniting…',
  unionConfirmed:
    'The dossiers are united. Both originals remain preserved and the union is reversible.',
  unionContactsPreserved: (count: number) =>
    `${count} Contacts are preserved on the canonical dossier.`,
  unionReversalReasonLabel: 'Written reason for the reversal',
  unionReverse: 'Reverse union',
  unionReversing: 'Reversing…',
  unionReversed:
    'The union is reversed. Both original dossiers are readable again.',
  unionUnavailable:
    'These dossiers cannot be compared. They may not share one exact identifier, may already be united, or may be outside your complete current authority.',
  unionRemediation:
    'Three or more Clients share this identifier. Data remediation is required before any union.',
  unionStale:
    'The dossiers changed since this comparison. Compare them again before uniting.',
  unionDifferencesRequireReview:
    'Review every differing field before confirming the union.',
  unionCapacityExceeded:
    'The united dossier would exceed the Contact limit. No dossier was changed.',
  unionBlocked:
    'This union is blocked by the current relationships. No dossier was changed.',
  unionReversalBlocked:
    'This union can no longer be reversed safely because the dossiers or relationships changed. No data was discarded.',
  unionChangedIntent:
    'This command key was already used for a different union. Start a fresh command.',
  unionRetry: 'The union could not be completed safely. Retry.',
  unitedWithLabel: 'United into another Client dossier',
  openCanonicalDossier: 'Open the canonical dossier',
  activityUnionLabels: {
    'client.union_confirmed': 'united two Client dossiers',
    'client.union_reversed': 'reversed a Client dossier union',
  },
  unionProjectionTitle: 'Governed Client unions in this Company',
  unionProjectionDescription:
    'Each entry is this Company\u2019s own record. It carries no actor, no time and no other Company.',
  unionProjectionActor: 'Authorized resolver',
  activityActionLabels: {
    'client.created': 'created a Client',
    'client_company_relationship.established': 'linked a Client to a Company',
    'client.corrected': 'corrected a Client dossier',
  },
} as const;
