export const clientUnionCopy = {
  title: 'Governed Client union',
  review: 'Review existing duplicates',
  history: 'Union history',
  sources: 'Superseded Client history',
  noSources: 'No superseded Client dossiers are related to the active Company.',
  openCanonical: 'Open canonical Client dossier',
  compare: 'Compare the two existing Clients',
  comparisonEyebrow: 'Saved Client dossiers',
  source: ({ number, name }: { number: number; name: string }) =>
    `Source ${number} \u00b7 ${name}`,
  contactSource: ({ source, contact }: { source: number; contact: number }) =>
    `Source ${source} \u00b7 Contact ${contact}`,
  noContacts: 'No Contacts provided.',
  affectedCompanies: 'Complete affected Company set',
  contactCount: (count: number) =>
    `Contact entries from both sources: ${count}. Maximum: 50.`,
  retainedSource: (source: number) => `Value to retain from Source ${source}`,
  decisions: 'Choose the retained dossier and values',
  chooseFields:
    'For each field, choose the saved source whose current value will be retained. Values cannot be edited here.',
  reasonLimit: 'Required. Maximum 2,000 characters.',
  incomplete:
    'Choose a canonical Client and a source for every field, give a reason and confirm both acknowledgements.',
  uncertain:
    'No confirmation has been received. Your choices and reason are retained. Confirm again to retry this intention, or close the review to discard the local choices. Closing does not cancel a command already received by the server.',
  refreshError:
    'The command was confirmed, but a subsequent refresh failed. Reload the list or Activity Log to see the latest data.',
  canonical: 'Canonical Client dossier',
  choose: 'Choose a source',
  keep: 'Keep the current value from',
  reason: 'Reason for this union',
  reverseReason: 'Reason for reversal',
  reviewed: 'I reviewed the identity basis and every material difference.',
  confirmedCompanies: 'I confirm the complete affected Company set:',
  confirm: 'Confirm union',
  reverse: 'Reverse union',
  close: 'Close review',
  loading: 'Loading the authorized union view…',
  saving: 'Saving…',
  unavailable:
    'This operation is unavailable. Its data, Company scope or authority may have changed. Reload the review before continuing.',
  error: 'The request could not be completed. You can retry safely.',
  remediation:
    'This identifier needs separate data remediation before a pair can be united.',
  preserved:
    'Both original dossiers, Contact entries and source relationships are preserved. Identical Contacts remain separate entries.',
  capacity:
    'The combined dossier exceeds 50 Contacts. This union cannot be confirmed.',
  saved:
    'Union confirmed. The canonical dossier is now available in the affected Companies.',
  reversed:
    'Union reversed. The original dossiers and relationships are available again.',
  unitedState: 'United',
  reversedState: 'Reversed',
  state: 'Operation state',
  canonicalSource: 'Canonical Client',
  capturedCompanies: 'Complete captured Company set',
  reversalUncertain:
    'No confirmation has been received for this reversal. Your reason and complete Company acknowledgement are retained. Retry only if this intention is unchanged.',
  reversalStale:
    'The reversal is no longer current. Load the authorized operation detail again before deciding.',
  reverseIncomplete:
    'Give a reason and confirm the complete captured Company set before reversing.',
  retryReversal: 'Retry reversal',
  viewDetails: 'View authorized union details',
  noHistory:
    'No union history is available for this Client in the active Company.',
  resolver: 'Authorized resolver',
  confirmedAction: 'confirmed a Client union',
  reversedAction: 'reversed a Client union',
  restrictedTitle: 'Attributable union history',
  originals: 'Preserved original dossiers',
  reversalBlocked:
    'This union cannot be reversed from the current authorized detail. Its state or governing conditions may have changed.',
  notProvided: 'Not provided',
  actionLabels: {
    'client.union_confirmed': 'confirmed a Client union',
    'client.union_reversed': 'reversed a Client union',
  },
} as const;
