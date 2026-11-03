import type {
  DocumentInvoiceCopy,
  DocumentInvoiceSnapshot,
  DocumentInvoiceLiveSource,
  DocumentInvoiceRelated,
  DocumentInvoiceSelectable,
} from '../documents/document-invoice-record-source.js';
import type { InvoiceInput, InvoiceValues } from './invoice-record.input.js';
export type InvoiceAction = InvoiceInput['action'];
export interface InvoiceFact {
  entryState: 'RECORDED' | 'WITHDRAWN';
  values: InvoiceValues;
}
export interface InvoiceActor {
  membershipId: string;
  displayName: string;
}
export interface InvoiceReceipt {
  format: 'EXTERNAL_INVOICE_COMMAND/1';
  commandId: string;
  recordId: string;
  revision: number;
  action: InvoiceAction;
  recordedAt: string;
}
export interface InvoiceRevision {
  format: 'EXTERNAL_INVOICE_REVISION/1';
  recordId: string;
  revision: number;
  action: InvoiceAction;
  commandId: string;
  actor: InvoiceActor;
  recordedAt: string;
  before: InvoiceFact | null;
  after: InvoiceFact;
  reason: string | null;
}
export type InvoiceCopiedContext = DocumentInvoiceCopy;
export type InvoiceSourceSnapshot = DocumentInvoiceSnapshot;
export interface InvoiceScope {
  workspaceId: string;
  companyId: string;
}
export interface InvoiceSummary extends InvoiceFact {
  id: string;
  revision: number;
  copiedContext: InvoiceCopiedContext;
  createdAt: string;
  replacesWithdrawnRecordId: string | null;
  replacementRecordId: string | null;
}

export interface InvoiceHistoryPage {
  items: InvoiceRevision[];
  nextCursor: string | null;
}
export interface InvoiceInventory {
  format: 'EXTERNAL_INVOICE_INVENTORY/1';
  companyId: string;
  readCapture: string;
  items: InvoiceSummary[];
  nextCursor: string | null;
}
export interface InvoiceCurrent {
  format: 'EXTERNAL_INVOICE_RECORD/1';
  companyId: string;
  readCapture: string;
  record: InvoiceSummary;
  actor: InvoiceActor;
  recordedAt: string;
  capabilities: { canCorrect: boolean; canWithdraw: boolean };
  liveSource: DocumentInvoiceLiveSource;
  related: DocumentInvoiceRelated;
  history: InvoiceHistoryPage;
}
export interface InvoiceHistory extends InvoiceHistoryPage {
  format: 'EXTERNAL_INVOICE_HISTORY/1';
  companyId: string;
  readCapture: string;
  recordId: string;
  headRevision: number;
}
export interface InvoiceSourcePage {
  format: 'EXTERNAL_INVOICE_SOURCE_PAGE/1';
  companyId: string;
  readCapture: string;
  items: DocumentInvoiceSelectable[];
  nextCursor: string | null;
}
