export interface WorkingDocument {
  id: string;
  workspaceId: string;
  companyId: string;
  clientId: string;
  /** Derived navigation target owned by Client; never persisted or accepted as input. */
  clientDossierId?: string;
  clientDisplayName: string;
  title: string;
  purpose: string;
  type: 'questionnaire';
  confidentiality: 'company-confidential';
  createdAt: string;
  createdByMembershipId: string;
  workingRevision: number;
  correction: 'allowed' | 'read-only';
  version: {
    id: string;
    status: 'draft';
    representation: {
      id: string;
      kind: 'external-reference';
      verification: 'unverified';
    } & ({ access: 'granted'; url: string } | { access: 'denied' });
  };
}

/** The optional preparatory Project a working Document is organized in. */
export type DocumentProjectAssociation =
  | { state: 'linked'; project: { id: string; title: string } }
  | { state: 'unlinked' };

/** A single-Document response; lists never carry the association. */
export interface WorkingDocumentDetail extends WorkingDocument {
  /** Present only for a current Project reader; absence never means unlinked. */
  projectAssociation?: DocumentProjectAssociation;
}

interface DocumentFieldChange {
  before: string;
  after: string;
}

/** One material correction as recorded; its values are history, not current. */
export interface DocumentCorrectionHistoryEntry {
  /** The working revision this correction produced. */
  revision: number;
  occurredAt: string;
  actor: { displayName: string };
  /**
   * Only materially changed fields. `url` is present only for a current
   * Representation reader, so a URL-only correction may carry no field.
   */
  changes: {
    title?: DocumentFieldChange;
    purpose?: DocumentFieldChange;
    url?: DocumentFieldChange;
  };
}

export interface DocumentCorrectionHistoryPage {
  /** Newest revision first. */
  corrections: DocumentCorrectionHistoryEntry[];
  /** The last returned revision, only while an older correction exists. */
  nextBeforeRevision: number | null;
}
