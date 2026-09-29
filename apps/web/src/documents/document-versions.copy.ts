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
    'The recorded references, their forms, and the title of this official Version are frozen. The linked external content is not stored or verified here and may change at its source.',
  references: (number: number) => `References for Version ${number}`,
  formLabels: {
    editable: 'Editable',
    rendered: 'Rendered',
    signed: 'Signed',
    other: 'Other',
  },
  formOptions: [
    { value: 'editable', label: 'Editable' },
    { value: 'rendered', label: 'Rendered' },
    { value: 'signed', label: 'Signed' },
    { value: 'other', label: 'Other' },
  ],
  position: (position: number) => `Position ${position}`,
  primary: 'Primary',
  appendedAfterDesignation: 'Added after designation',
  addedBy: (displayName: string) => `Added by ${displayName}`,
  openReference: (number: number) => `Open Version ${number} reference`,
  referenceDenied: documentsCopy.referenceDenied,
  designate: 'Designate as official',
  startDraft: 'Start new draft',
  form: 'Reference form',
  url: 'HTTPS URL',
  invalidUrl: 'Enter an HTTPS URL without credentials.',
  addReference: 'Add reference',
  appendReference: 'Add reference to official Version',
  removeReference: 'Remove',
  confirmOfficialAppend: (number: number) =>
    `Add this reference to official Version ${number}? It will belong to this exact Version and can never be removed.`,
  confirmAppend: 'Add irreversible reference',
  cancelAppend: 'Cancel reference addition',
  confirmDesignation: (number: number, superseded: number | null) =>
    superseded === null
      ? `Designate Version ${number} as the official Version? No Version will be superseded.`
      : `Designate Version ${number} as the official Version? Version ${superseded} will become superseded.`,
  confirm: 'Confirm official designation',
  cancel: 'Cancel designation',
  pending: 'Saving the Version change…',
  designated: (number: number) => `Version ${number} is now official.`,
  drafted: (number: number) => `Version ${number} was started as a draft.`,
  referenceAdded: (number: number) =>
    `A reference was added to Version ${number}.`,
  referenceRemoved: (number: number) =>
    `A draft reference was removed from Version ${number}.`,
  conflict:
    'This Document changed. Reload the Document and its Versions before trying again.',
  unavailableCommand:
    'This Document can no longer be changed here. Reload the Document and its Versions.',
  versionCapacity:
    'This Document has reached its Version limit. No new draft can be started.',
  draftReferenceCapacity:
    'This draft already has five references. Remove one before adding another.',
  officialReferenceCapacity:
    'This official Version already has ten references. No more can be appended.',
  denied: 'You no longer have permission for this Version change.',
  uncertain:
    'The result of this Version change is uncertain. Retry the exact same change safely.',
  retryCommand: 'Retry the same Version change',
  reload: 'Reload Document and Versions',
} as const;
