import { documentsCopy } from './documents.copy';

export const documentVersionsCopy = {
  title: 'Versions',
  list: 'Document Versions, newest first',
  loading: 'Loading Versions…',
  error: 'The Versions could not be loaded. The Document remains available.',
  retry: 'Retry loading Versions',
  unavailable: 'Versions are not available with your current access.',
  readOnly:
    'Read-only: the original Client has been superseded. Every Version remains visible.',
  version: (number: number) => `Version ${number}`,
  statusLabels: {
    draft: 'Draft',
    official: 'Official',
    superseded: 'Superseded',
  },
  createdBy: (displayName: string) => `Created by ${displayName}`,
  designatedBy: (displayName: string) =>
    `Designated official by ${displayName}`,
  frozenTitle: 'Frozen title',
  frozenPurpose: 'Frozen purpose',
  supersededBy: (number: number) => `Superseded by Version ${number}`,
  frozenNotice:
    'The recorded reference and title of this official Version are frozen. The linked external content is not stored or verified here and may change at its source.',
  openReference: (number: number) => `Open Version ${number} reference`,
  referenceDenied: documentsCopy.referenceDenied,
  designate: 'Designate as official',
  startDraft: 'Start new draft',
  confirmDesignation: (number: number, superseded: number | null) =>
    superseded === null
      ? `Designate Version ${number} as the official Version? No Version will be superseded.`
      : `Designate Version ${number} as the official Version? Version ${superseded} will become superseded.`,
  confirm: 'Confirm official designation',
  cancel: 'Cancel designation',
  pending: 'Saving the Version change…',
  designated: (number: number) => `Version ${number} is now official.`,
  drafted: (number: number) => `Version ${number} was started as a draft.`,
  conflict:
    'This Document changed. Reload the Document and its Versions before trying again.',
  unavailableCommand:
    'This Document can no longer be changed here. Reload the Document and its Versions.',
  capacity:
    'This Document has reached its Version limit. No new draft can be started.',
  denied: 'You no longer have permission for this Version change.',
  uncertain:
    'The result of this Version change is uncertain. Retry the exact same change safely.',
  retryCommand: 'Retry the same Version change',
  reload: 'Reload Document and Versions',
} as const;
