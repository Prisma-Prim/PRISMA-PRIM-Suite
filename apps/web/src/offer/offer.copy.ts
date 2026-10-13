export const offerCopy = {
  title: 'Illustrative Offer',
  explanation:
    'This Offer is illustrative and provisional. It is not a contract, approval, invoice, tax decision, or evidence of ability to perform.',
  loading: 'Loading Offer…',
  denied: 'Offer access is not available for this Opportunity.',
  unavailable: 'The Offer could not be loaded. Try again.',
  reload: 'Retry',
  noClient: 'A readable Client is required before preparing an Offer.',
  noOffer: 'No Offer exists for this Opportunity.',
  noSnapshot:
    'Save an illustrative Pricing Snapshot before preparing an Offer.',
  pricingSnapshot: 'Pricing Snapshot',
  recipient: 'Legal recipient',
  primaryRecipient: (name: string) => `Primary — ${name}`,
  clientFallback: 'Client',
  validityDays: 'Validity in days',
  scopeNote: 'Scope note',
  commercialConditions: 'Commercial conditions',
  prepare: 'Prepare version 1',
  preparing: 'Preparing…',
  retry: 'Retry the same preparation',
  uncertain:
    'The outcome is uncertain. Retry sends the exact same values and key.',
  invalid: 'Check the selected Snapshot and the entered values.',
  conflict: 'An Offer already exists or this retry no longer matches.',
  targetUnavailable:
    'The Opportunity, Snapshot or recipient is no longer available. Reload the Request.',
  stale: 'The Offer changed. Reload the Request before creating a version.',
  accepted: 'This Offer has been accepted and cannot receive another version.',
  created: 'New Offer version created.',
  reference: 'Illustrative reference',
  version: 'Version',
  issuingCompany: 'Issuing Company',
  validUntil: 'Valid until',
  states: 'State',
  stateValue: 'Pending · not transmitted · no Client response',
  snapshotTotal: 'Referenced illustrative total',
  provisional: 'Illustrative and provisional',
  draftState: 'Draft — not approved',
  representation: 'Exact version representation',
  templateVersion: 'Template Version',
  checksum: 'SHA-256 checksum',
  representationFrame: 'Illustrative Offer representation',
} as const;

export const offerVersionCopy = {
  prepare: 'Prepare a new version',
  create: 'Create new version',
  cancel: 'Cancel',
  title: 'Version history',
  loading: 'Loading versions…',
  empty: 'No versions recorded.',
  unavailable: 'Version history is unavailable. Try again.',
  more: 'Show older versions',
  open: (number: number) => `Open version ${number}`,
  predecessor: (number: number) => `Previous version: ${number}`,
  differences: 'Differences from previous version',
  noPredecessor: 'Version 1 has no previous version.',
  noDifferences: 'No recorded field differences.',
  previous: 'Previous value',
  current: 'Current value',
  absent: 'Not recorded',
  emptyText: 'Empty text',
  unchanged: 'Unchanged',
  changed: 'Changed',
  historical: 'Historical version · read only',
  currentHead: 'Current version',
  fields: {
    recipientKind: 'Recipient kind',
    recipientAdditionalLegalEntityId: 'Named additional entity',
    recipientLegalName: 'Legal name',
    recipientTaxId: 'Tax ID',
    recipientLegalAddress: 'Legal address',
    pricingSnapshotId: 'Pricing Snapshot',
    currency: 'Currency',
    total: 'Recorded total',
    validityDays: 'Validity in days',
    validUntil: 'Valid until',
    scopeNote: 'Scope note',
    commercialConditions: 'Commercial conditions',
  },
} as const;

export const offerTransmissionCopy = {
  title: 'Simulated transmission',
  explanation:
    'Record a provisional simulation of this approved version. No message is sent. This does not confirm Client acceptance.',
  record: 'Record simulated transmission',
  note: 'Simulation note',
  noNote: 'No simulation note',
  acknowledge: 'Acknowledge warnings not acknowledged at approval',
  running: 'Recording simulated transmission…',
  retry: 'Retry the same transmission',
  uncertain:
    'The outcome is uncertain. Retry sends the exact same transmission, values and key.',
  invalid:
    'Use a note of at most 500 characters and check the warning acknowledgements.',
  denied: 'Transmission access is no longer available.',
  unavailable: 'The Offer Version is no longer available. Reload the Request.',
  stale: 'The Offer changed. Reload the Request before transmission.',
  superseded: 'This version has been superseded. Reload the Request.',
  notApproved: 'This version is no longer approved. Reload the Request.',
  alreadyTransmitted:
    'This version already has a simulated transmission. Reload the Request.',
  mismatch:
    'The representation does not match the approved version. Reload the Request.',
  conflict: 'This retry no longer matches. Reload the Request.',
  qualityErrors:
    'Current Quality Check errors prevent transmission. Run Quality Checks to review them.',
  warningsChanged:
    'Acknowledge exactly the new warnings. Run Quality Checks to refresh them.',
  success: 'Simulated transmission recorded · Client response pending',
  actor: 'Transmitting membership',
  transmittedAt: 'Simulated transmission recorded at',
  run: 'Transmission Quality Check run',
  checksum: 'Transmitted SHA-256 checksum',
  warnings: 'Warnings acknowledged at transmission',
} as const;

export const offerClientResponseCopy = {
  title: 'Simulated Client response',
  explanation:
    'Record a provisional simulated outcome for this exact transmitted version. This evidence has no legal effect.',
  receivedAt: 'Reported received time (UTC)',
  recordedReceivedAt: 'Reported received time',
  timeExample: '2026-10-03T14:30:00.000Z',
  receivedHelp:
    'Use a UTC time between transmission and now, strictly before validity ends. A timely response can be recorded later.',
  reason: 'Client rejection reason',
  accept: 'Record simulated acceptance',
  reject: 'Record simulated Client rejection',
  expire: 'Record simulated expiry',
  running: 'Recording simulated Client response…',
  retry: 'Retry the same Client response',
  uncertain:
    'The outcome is uncertain. Retry sends the exact same outcome, values, revision and key.',
  invalid:
    'Check the received time. A rejection needs a reason of 1–500 characters.',
  denied: 'Client response access is no longer available.',
  unavailable: 'The Offer Version is no longer available. Reload the Request.',
  stale:
    'The Offer changed. Reload the Request before recording a Client response.',
  superseded: 'This version has been superseded. Reload the Request.',
  alreadyRecorded:
    'This version already has a Client response. Reload the Request.',
  notTransmitted: 'This version is not transmitted. Reload the Request.',
  elapsed:
    'The reported response was received after validity ended. Correct the received time or record expiry.',
  notElapsed: 'The validity has not ended. Expiry cannot be recorded yet.',
  conflict: 'This retry no longer matches. Reload the Request.',
  pendingElapsed:
    'Validity elapsed · Client response pending. Nothing expires automatically.',
  ACCEPTED: 'Simulated Client acceptance recorded',
  REJECTED: 'Simulated Client rejection recorded',
  EXPIRED: 'Simulated expiry recorded',
  actor: 'Response recording membership',
  decidedAt: 'Client response recorded at',
} as const;

export const offerQualityCopy = {
  title: 'Quality Checks',
  empty: 'No Quality Check run yet.',
  run: 'Run Quality Checks',
  running: 'Running Quality Checks…',
  retry: 'Retry the same Quality Checks',
  uncertain:
    'The outcome is uncertain. Retry sends the exact same command and key.',
  denied: 'Quality Check access is no longer available.',
  unavailable: 'The Offer Version is no longer available. Reload the Request.',
  superseded: 'This Offer Version has been superseded. Reload the Request.',
  conflict:
    'This retry no longer matches its recorded command. Reload the Request.',
  invalid: 'The Quality Check command was refused. Reload the Request.',
  errors: 'Checks completed with errors.',
  warnings: 'Checks completed with warnings.',
  success: 'All Quality Checks passed.',
  evaluatedAt: 'Evaluated at',
  actor: 'Checking membership',
  ruleSet: 'Rule set',
} as const;

export const offerDecisionCopy = {
  title: 'Internal decision',
  approve: 'Approve this version',
  reject: 'Reject this version',
  reason: 'Rejection reason',
  acknowledge: 'Acknowledge current warnings',
  explanation:
    'Approval checks this exact version again now. Each current warning must be acknowledged. The illustrative representation stays unchanged.',
  running: 'Recording decision…',
  retry: 'Retry the same decision',
  uncertain:
    'The outcome is uncertain. Retry sends the exact same decision, values and key.',
  invalid:
    'Enter a rejection reason of 1–500 characters, or check the warning acknowledgements.',
  denied: 'Decision access is no longer available.',
  unavailable: 'The Offer Version is no longer available. Reload the Request.',
  stale: 'The Offer changed. Reload the Request before deciding.',
  superseded: 'This version has been superseded. Reload the Request.',
  alreadyDecided: 'This version already has a decision. Reload the Request.',
  conflict: 'This retry no longer matches. Reload the Request.',
  qualityErrors:
    'Current Quality Check errors prevent approval. Run Quality Checks to review them.',
  warningsChanged:
    'Acknowledge exactly the current warnings. Run Quality Checks to refresh them.',
  approved: 'Version approved.',
  rejected: 'Version rejected.',
  actor: 'Deciding membership',
  decidedAt: 'Decided at',
  decisionRun: 'Approval Quality Check run',
  approvedChecksum: 'Approved representation checksum',
  acknowledgedWarnings: 'Acknowledged warnings',
  noWarnings: 'No warnings',
  approvedState: 'Approved · not transmitted · no Client response',
  rejectedState: 'Rejected · not transmitted · no Client response',
  approvedViewer: 'Approved internally',
  rejectedViewer: 'Rejected internally',
} as const;

// Offer history in the commercial Activity Log names the action, the Offer's
// illustrative reference and version, a Client response outcome and the
// simulated marker only; never Offer content.
export const offerActivityCopy = {
  actionLabels: {
    'offer.created': 'created an illustrative Offer',
    'offer_version.created': 'created an Offer Version',
    'offer_version.approved': 'approved an Offer Version',
    'offer_version.rejected': 'rejected an Offer Version',
    'offer_version.transmission_recorded':
      'recorded the transmission of an Offer Version',
    'offer_version.client_response_recorded':
      'recorded the Client response to an Offer Version',
  },
  responseOutcomes: {
    ACCEPTED: 'Accepted',
    REJECTED: 'Rejected by the Client',
    EXPIRED: 'Expired',
  },
  versionTarget: (reference: number, versionNumber: number) =>
    `Illustrative Offer ${reference} · version ${versionNumber}`,
  simulated: 'Simulated',
  openVersion: 'Open Offer Version',
} as const;
