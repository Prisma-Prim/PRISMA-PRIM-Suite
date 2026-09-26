export const tariffVersionCopy = {
  eyebrow: 'Pricing Configuration',
  title: 'Tariff Versions',
  companyPrefix: 'Company:',
  noticeLabel: 'Illustrative Tariff Versions notice',
  illustrativeMarker: 'Illustrative tariffs: provisional records',
  illustrativeDetail:
    'Every Tariff Version here is illustrative. No amount is a real price, no unit is a real unit and no tax rate has fiscal validity. Nothing here converts, combines or totals amounts, and nothing here calculates a price.',
  timeZone: (zone: string) =>
    `Instants are entered and shown in your browser time zone: ${zone}.`,
  offering: 'Company Service Offering',
  chooseOffering: 'Choose an offering',
  offeringOption: ({
    name,
    code,
    commercialLabel,
  }: {
    name: string;
    code: string;
    commercialLabel: string | null;
  }) =>
    commercialLabel === null
      ? `${name} (${code})`
      : `${name} (${code}) — ${commercialLabel}`,
  offeringsLoading: 'Loading Company Service Offerings…',
  offeringsError:
    'Company Service Offerings could not be loaded. Please try again.',
  offeringsEmpty:
    'No Company Service Offering is recorded for this Company yet. Tariff Versions are published per offering.',
  reloadOfferings: 'Reload offerings',
  showMoreOfferings: 'Show more offerings',
  moreOfferingsLoading: 'Loading more offerings…',
  moreOfferingsError: 'More offerings could not be loaded. Please try again.',
  chooseOfferingPrompt:
    'Choose an offering to see and publish its Tariff Versions. Each offering has its own versions, head and schedule.',
  currentTitle: 'Current Tariff Version',
  currentLoading: 'Loading the current Tariff Version…',
  noCurrent:
    'No current version: no Tariff Version of this offering is current at this instant.',
  head: (versionNumber: number) =>
    `Head: version ${versionNumber}. A new publication follows this version.`,
  noHead: 'No Tariff Version has been published for this offering yet.',
  scheduledTitle: 'Scheduled Tariff successors',
  noScheduled: 'No successor is scheduled.',
  takesOver: 'Takes over from',
  versionName: (versionNumber: number) => `Version ${versionNumber}`,
  // The server strings are shown verbatim with their currency or percent
  // sign; nothing here reformats, converts or totals them.
  amount: ({
    unitAmount,
    currency,
    unit,
  }: {
    unitAmount: string;
    currency: string;
    unit: string;
  }) => `${unitAmount} ${currency} per ${unit}`,
  taxRate: ({
    taxRatePercent,
    taxLabel,
  }: {
    taxRatePercent: string;
    taxLabel: string;
  }) => `Tax ${taxRatePercent}% (${taxLabel})`,
  noFiscalValidity: 'no fiscal validity',
  window: 'Effective',
  from: 'from',
  until: 'until',
  openEnded: 'with no declared end',
  takenOverFrom: 'Taken over from',
  headMarker: 'Head',
  provisionalMarker: 'Provisional',
  // Indexing these by the validated identifier makes an unmapped variant a
  // type error instead of a missing or invented label.
  stateLabels: {
    SCHEDULED: 'Scheduled',
    CURRENT: 'Current',
    SUPERSEDED: 'Superseded',
  },
  provenanceLabels: { ILLUSTRATIVE: 'Illustrative' },
  publishTitle: 'Publish a Tariff Version',
  publishAfterHead: (versionNumber: number) =>
    `The new version will follow head version ${versionNumber} of this offering.`,
  publishFirst: 'The new version will be the first for this offering.',
  unit: 'Unit',
  unitHelp: 'Use 1 to 24 characters.',
  unitAmount: 'Unit amount',
  unitAmountHelp:
    'Illustrative only. Up to 7 digits and 4 decimals, greater than zero, such as 123.4500.',
  currency: 'Currency',
  chooseCurrency: 'Choose a currency',
  taxRatePercent: 'Tax rate percent',
  taxRatePercentHelp:
    'Illustrative only, with no fiscal validity. From 0 to 100 with up to 2 decimals, such as 12.34.',
  taxLabel: 'Tax label',
  taxLabelHelp: 'Use 1 to 60 characters.',
  effectiveFrom: (zone: string) => `Effective from (${zone})`,
  effectiveTo: (zone: string) => `Effective until, optional (${zone})`,
  publish: 'Publish Tariff Version',
  published: (versionNumber: number) =>
    `Tariff Version ${versionNumber} published.`,
  unchanged: (versionNumber: number) =>
    `Tariff Version ${versionNumber} already has this content. Nothing changed.`,
  // One explanation per field, shown with the entered values kept.
  invalid: {
    unit: 'Enter a unit of 1 to 24 characters.',
    unitAmount:
      'Enter a unit amount greater than zero with up to 7 digits and 4 decimals, without spaces, signs or leading zeros, such as 123.4500.',
    currency: 'Choose a currency: MDL, EUR, RON or USD.',
    taxRatePercent:
      'Enter a tax rate from 0 to 100 with up to 2 decimals, without spaces, signs or leading zeros, such as 12.34.',
    taxLabel: 'Enter a tax label of 1 to 60 characters.',
    window: 'Enter a start, and an optional end later than the start.',
  },
  validation:
    'Check the Tariff Version: every value must follow the rule shown below its field.',
  effectiveFromPast: 'Choose a start that is not earlier than now.',
  effectiveFromNotAdvancing:
    'Choose a start later than the start of the head version.',
  windowGap:
    'The head version ends before this start. Choose a start no later than its end, or wait until it has ended.',
  versionExhausted: 'No further Tariff Version number can be allocated.',
  idempotencyConflict:
    'Nothing was published with that request: its identifier had already been used for a different request. Your draft is kept and can be published again.',
  stale: (headVersionNumber: number | null) =>
    headVersionNumber === null
      ? 'The offering changed: no version is the head any more. Reload before publishing again.'
      : `The offering changed: version ${headVersionNumber} is now the head. Reload before publishing again.`,
  reload: 'Reload Tariff Versions',
  uncertain:
    'The publication outcome is uncertain. Retry to confirm it: the same request is sent again and never publishes twice. No other Tariff Version can be published until its outcome is known.',
  retryPublication: 'Retry Tariff publication',
  versionsTitle: 'All Tariff Versions of this offering',
  versionsList: 'Tariff Versions',
  versionsLoading: 'Loading Tariff Versions…',
  versionsEmpty: 'No Tariff Version has been published yet.',
  versionsError: 'Tariff Versions could not be loaded. Please try again.',
  versionsChanging:
    'Tariff Versions kept changing while loading. Reload to see the latest versions.',
  showOlder: 'Show older Tariff Versions',
  olderLoading: 'Loading older Tariff Versions…',
  olderError: 'Older Tariff Versions could not be loaded. Please try again.',
  denied: 'You do not have permission to access Tariff Versions.',
} as const;
