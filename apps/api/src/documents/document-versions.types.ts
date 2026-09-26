/** The one unverified external reference each Version holds in this slice. */
export type DocumentVersionReference = {
  id: string;
  kind: 'external-reference';
  verification: 'unverified';
} & ({ access: 'granted'; url: string } | { access: 'denied' });

interface DocumentVersionBase {
  id: string;
  number: number;
  createdAt: string;
  createdBy: { displayName: string };
  representations: DocumentVersionReference[];
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
    });
