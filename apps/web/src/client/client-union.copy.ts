export const clientUnionCopy = {
  title: 'Governed Client union',
  review: 'Review existing duplicates',
  history: 'Union history',
  compare: 'Compare the two existing Clients',
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
  viewDetails: 'View authorized union details',
  noHistory:
    'No union history is available for this Client in the active Company.',
  resolver: 'Authorized resolver',
  confirmedAction: 'confirmed a Client union',
  reversedAction: 'reversed a Client union',
  restrictedTitle: 'Attributable union history',
  originals: 'Preserved original dossiers',
  reversalBlocked:
    'Reversal is blocked because the dossier or its relationships changed after union.',
  notProvided: 'Not provided',
  actionLabels: {
    'client.union_confirmed': 'confirmed a Client union',
    'client.union_reversed': 'reversed a Client union',
  },
} as const;
