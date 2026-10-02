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
} as const;
