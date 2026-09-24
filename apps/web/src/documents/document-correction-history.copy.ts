import { documentsCopy } from './documents.copy';

export const documentCorrectionHistoryCopy = {
  title: 'Correction history',
  show: 'Show reference correction history',
  hide: 'Hide reference correction history',
  description:
    'Each entry shows the values before and after one saved correction. Recorded values are history, not a statement of the current reference.',
  loading: 'Loading correction history…',
  empty: 'No corrections have been saved for this working reference.',
  error:
    'The correction history could not be loaded. The reference remains available.',
  retry: 'Retry reference correction history',
  unavailable: 'Correction history is not available with your current access.',
  list: 'Reference corrections, newest first',
  resultingRevision: (revision: number) => `Working revision ${revision}`,
  correctedBy: (displayName: string) => `Corrected by ${displayName}`,
  changedTo: 'changed to',
  withheldChanges:
    'The changed details are not shown with your current access.',
  showOlder: 'Load older corrections',
  loadingOlder: 'Loading older corrections…',
  olderError: 'Older corrections could not be loaded. Try again.',
  fieldLabels: {
    title: documentsCopy.titleLabel,
    purpose: documentsCopy.purpose,
    url: documentsCopy.url,
  },
} as const;
