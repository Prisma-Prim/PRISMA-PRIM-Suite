/** Metadata is disclosed only after current content-read authorization. */
export interface PreservedDocumentPdf {
  representationId: string;
  revision: number;
  fileName: string;
  mediaType: 'application/pdf';
  size: number;
  sha256: string;
  storedAt: string;
  storedBy: { displayName: string };
  scan: { outcome: 'clean'; engine: string; scannedAt: string };
}
/** Stored bytes are independent from an unverified external reference. */
export type DocumentPdfContent =
  | { state: 'absent' }
  | { state: 'stored'; access: 'denied' }
  | (PreservedDocumentPdf & { state: 'stored'; access: 'granted' });
export interface DocumentPdfUploadHistory {
  uploads: Array<PreservedDocumentPdf & { current: boolean }>;
  nextBeforeRevision: number | null;
}

/** Validated once at the bounded PDF input boundary, before scanning. */
export interface ValidatedDocumentPdf {
  bytes: Buffer;
  fileName: string;
  size: number;
  sha256: string;
}
export interface CleanDocumentScan {
  outcome: 'clean';
  engine: string;
  scannedAt: Date;
}
export const MAXIMUM_DOCUMENT_PDF_BYTES = 5 * 1024 * 1024;
