export const localInstantCopy = {
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
} as const;
