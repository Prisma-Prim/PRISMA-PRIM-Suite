import type { DocumentPdfContent } from './document-pdf.types.js';
/** One current typed, unverified external reference held by a Version. */
export type DocumentVersionReference = {
  id: string;
  kind: 'external-reference';
  verification: 'unverified';
  position: number;
  form: 'editable' | 'rendered' | 'signed' | 'other';
  primary: boolean;
  appendedAfterDesignation: boolean;
  addedAt: string;
  addedBy: { displayName: string };
} & ({ access: 'granted'; url: string } | { access: 'denied' });

interface DocumentVersionBase {
  id: string;
  number: number;
  createdAt: string;
  createdBy: { displayName: string };
  representations: DocumentVersionReference[];
  pdfContent: DocumentPdfContent;
}

interface DocumentVersionDesignation {
  designatedAt: string;
  designatedBy: { displayName: string };
  /** The Document's title and purpose frozen when it was designated. */
  frozen: { title: string; purpose: string };
}

/** One formal Version, discriminated by its content status. */
export type DocumentVersionView =
  | (DocumentVersionBase & { status: 'draft' })
  | (DocumentVersionBase & DocumentVersionDesignation & { status: 'official' })
  | (DocumentVersionBase &
      DocumentVersionDesignation & {
        status: 'superseded';
        supersededAt: string;
        supersededByVersionNumber: number;
      });

export interface DocumentVersionsRead {
  workingRevision: number;
  /** Commands are possible only while the original Client stays active. */
  mutable: boolean;
  /** Every Version, highest number first. */
  versions: DocumentVersionView[];
}

interface DocumentVersionReceiptBase {
  documentId: string;
  workingRevision: number;
  versionId: string;
  versionNumber: number;
}

/** The durable result of one committed Version command. */
export type DocumentVersionReceipt =
  | (DocumentVersionReceiptBase & {
      action: 'designated_official';
      supersededVersionNumber: number | null;
    })
  | (DocumentVersionReceiptBase & {
      action: 'drafted';
      sourceVersionNumber: number;
    })
  | (DocumentVersionReceiptBase & {
      action: 'representation_added';
      representationId: string;
      appendedAfterDesignation: boolean;
    })
  | (DocumentVersionReceiptBase & {
      action: 'representation_removed';
      representationId: string;
    });
