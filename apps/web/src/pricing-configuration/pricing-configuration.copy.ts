export const pricingConfigurationCopy = {
  eyebrow: 'Commercial',
  title: 'Pricing Configuration',
  companyPrefix: 'Company:',
  noticeLabel: 'Illustrative pricing configuration notice',
  illustrativeMarker: 'Illustrative configuration: provisional records',
  illustrativeDetail:
    'Every Pricing Rule Version here is illustrative. Nothing here is a real price, rule or approval, and nothing here calculates a price.',
  timeZone: (zone: string) =>
    `Instants are entered and shown in your browser time zone: ${zone}.`,
  currentTitle: 'Current Pricing Rule Version',
  currentLoading: 'Loading the current Pricing Rule Version…',
  noCurrent:
    'No current version: no Pricing Rule Version is current at this instant.',
  head: (versionNumber: number) =>
    `Head: version ${versionNumber}. A new publication follows this version.`,
  noHead: 'No Pricing Rule Version has been published for this Company yet.',
  scheduledTitle: 'Scheduled successors',
  noScheduled: 'No successor is scheduled.',
  takesOver: 'Takes over from',
  versionName: (versionNumber: number) => `Version ${versionNumber}`,
  window: 'Effective',
  from: 'from',
  until: 'until',
  openEnded: 'with no declared end',
  takenOverFrom: 'Taken over from',
  headMarker: 'Head',
  // Indexing these by the validated identifier makes an unmapped variant a
  // type error instead of a missing or invented label.
  stateLabels: {
    SCHEDULED: 'Scheduled',
    CURRENT: 'Current',
    SUPERSEDED: 'Superseded',
  },
  provenanceLabels: { ILLUSTRATIVE: 'Illustrative' },
  fixedRule:
    'Fixed rule shape: unit price × quantity, rounded half-up to 2 decimals, tax per line.',
  publishTitle: 'Publish a Pricing Rule Version',
  publishAfterHead: (versionNumber: number) =>
    `The new version will follow head version ${versionNumber}.`,
  publishFirst: 'The new version will be the first for this Company.',
  label: 'Label',
  labelHelp: 'Use 1 to 120 characters.',
  effectiveFrom: (zone: string) => `Effective from (${zone})`,
  effectiveTo: (zone: string) => `Effective until, optional (${zone})`,
  publish: 'Publish version',
  published: (versionNumber: number) => `Version ${versionNumber} published.`,
  unchanged: (versionNumber: number) =>
    `Version ${versionNumber} already has this content. Nothing changed.`,
  validation:
    'Enter a label of 1 to 120 characters, a start, and an optional end later than the start.',
  // A local time that a clock change skips or repeats names no single
  // instant, so it is refused rather than moved to a neighbouring one.
  skippedTime: {
    effectiveFrom: (zone: string) =>
      `The start does not exist in ${zone}: a clock change skips that time. Choose a time outside the change.`,
    effectiveTo: (zone: string) =>
      `The end does not exist in ${zone}: a clock change skips that time. Choose a time outside the change.`,
  },
  repeatedTime: {
    effectiveFrom: (zone: string) =>
      `The start is ambiguous in ${zone}: a clock change repeats that time. Choose a time outside the change.`,
    effectiveTo: (zone: string) =>
      `The end is ambiguous in ${zone}: a clock change repeats that time. Choose a time outside the change.`,
  },
  effectiveFromPast: 'Choose a start that is not earlier than now.',
  effectiveFromNotAdvancing:
    'Choose a start later than the start of the head version.',
  windowGap:
    'The head version ends before this start. Choose a start no later than its end, or wait until it has ended.',
  versionExhausted: 'No further Pricing Rule Version number can be allocated.',
  stale: (headVersionNumber: number | null) =>
    headVersionNumber === null
      ? 'The configuration changed: no version is the head any more. Reload before publishing again.'
      : `The configuration changed: version ${headVersionNumber} is now the head. Reload before publishing again.`,
  reload: 'Reload Pricing Rule Versions',
  uncertain:
    'The publication outcome is uncertain. Retry to confirm it: the same request is sent again and never publishes twice.',
  retryPublication: 'Retry publication',
  versionsTitle: 'All Pricing Rule Versions',
  versionsList: 'Pricing Rule Versions',
  versionsLoading: 'Loading Pricing Rule Versions…',
  versionsEmpty: 'No Pricing Rule Version has been published yet.',
  versionsError: 'Pricing Rule Versions could not be loaded. Please try again.',
  showOlder: 'Show older versions',
  olderLoading: 'Loading older versions…',
  olderError: 'Older versions could not be loaded. Please try again.',
  denied: 'You do not have permission to access Pricing Configuration.',
} as const;
