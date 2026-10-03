export const offerCopy = {
  title: 'Illustrative Offer',
  explanation:
    'This first version is illustrative and provisional. It is not a contract, approval, invoice, tax decision, or evidence of ability to perform.',
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
  unsupportedAdjustment:
    'The selected Pricing Snapshot contains an adjustment and cannot be used for Offer version 1.',
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

export const offerTransmissionCopy = {
  title: 'Simulated transmission',
  explanation:
    'Record a provisional simulation of this approved version. No message is sent. This does not confirm Client acceptance.',
  record: 'Record simulated transmission',
  note: 'Simulation note',
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
