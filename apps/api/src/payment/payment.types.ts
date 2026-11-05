import type {
  PaymentInput,
  PaymentValues,
  PaymentSource,
} from './payment.input.js';
export type PaymentAction = PaymentInput['action'];
export interface PaymentActor {
  membershipId: string;
  displayName: string;
}
export interface PaymentConfirmation {
  actor: PaymentActor;
  recordedAt: string;
  note: string;
}
export type PaymentFact =
  | { state: 'DRAFT' | 'WITHDRAWN'; values: PaymentValues; confirmation: null }
  | {
      state: 'CONFIRMED' | 'REVERSED';
      values: PaymentValues;
      confirmation: PaymentConfirmation;
    };
export interface PaymentReceipt {
  format: 'PAYMENT_COMMAND/1';
  commandId: string;
  paymentId: string;
  revision: number;
  action: PaymentAction;
  recordedAt: string;
}
export interface PaymentRevision {
  format: 'PAYMENT_REVISION/1';
  paymentId: string;
  revision: number;
  action: PaymentAction;
  commandId: string;
  actor: PaymentActor;
  recordedAt: string;
  before: PaymentFact | null;
  after: PaymentFact;
  reason: string | null;
}
export interface PaymentCopy {
  companyLabel: string;
  payer: {
    kind: 'PRIMARY' | 'ADDITIONAL';
    legalName: string;
    taxId: string | null;
    legalAddress: string | null;
  };
}
export interface PaymentSourceSnapshot {
  source: PaymentSource;
  originalClientId: string;
  payerAdditionalId: string | null;
  byteLength: number;
  sha256: string;
  copiedContext: PaymentCopy;
}
export interface PaymentScope {
  workspaceId: string;
  companyId: string;
}
export type PaymentSummary = PaymentFact & {
  id: string;
  revision: number;
  copiedContext: PaymentCopy;
  createdAt: string;
  replacesClosedPaymentId: string | null;
  replacementPaymentId: string | null;
};
export interface PaymentHistoryPage {
  items: PaymentRevision[];
  nextCursor: string | null;
}
export interface PaymentInventory {
  format: 'PAYMENT_INVENTORY/1';
  companyId: string;
  readCapture: string;
  items: PaymentSummary[];
  nextCursor: string | null;
}
export type PaymentContent =
  | { kind: 'UNAVAILABLE' }
  | {
      kind: 'AVAILABLE';
      representationId: string;
      fileName: string;
      byteLength: number;
      sha256: string;
    };
export type PaymentLiveSource =
  | { kind: 'UNAVAILABLE' }
  | {
      kind: 'AVAILABLE';
      documentId: string;
      documentVersionId: string;
      title: string;
      versionNumber: number;
      versionState: 'official' | 'superseded';
      content: PaymentContent;
    };
export type PaymentClient =
  | { kind: 'UNAVAILABLE' }
  | { kind: 'AVAILABLE'; clientId: string; displayName: string };
export interface PaymentCurrent {
  format: 'PAYMENT_OBSERVATION/1';
  companyId: string;
  readCapture: string;
  payment: PaymentSummary;
  actor: PaymentActor;
  recordedAt: string;
  capabilities: {
    canCorrect: boolean;
    canWithdraw: boolean;
    canConfirm: boolean;
    canReverse: boolean;
    canReplace: boolean;
  };
  liveSource: PaymentLiveSource;
  client: PaymentClient;
  history: PaymentHistoryPage;
}
export interface PaymentHistory extends PaymentHistoryPage {
  format: 'PAYMENT_HISTORY/1';
  companyId: string;
  readCapture: string;
  paymentId: string;
  headRevision: number;
}
export interface PaymentSelectable {
  source: PaymentSource;
  documentTitle: string;
  versionNumber: number;
  versionState: 'official' | 'superseded';
  fileName: string;
  byteLength: number;
  sha256: string;
  copiedContext: PaymentCopy;
}
export interface PaymentSourcePage {
  format: 'PAYMENT_SOURCE_PAGE/1';
  companyId: string;
  readCapture: string;
  items: PaymentSelectable[];
  nextCursor: string | null;
}
