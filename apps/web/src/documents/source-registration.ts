import type { CSSProperties, ReactNode } from 'react';
import type { ActorContext } from '../access-types';
import type { WorkingDocumentDetail } from './document-response';
import { useReceivedContractCopy } from './received-contract.copy';
import { useReceivedAddendumCopy } from './received-addendum.copy';
import { useExternalInvoiceCopy } from './external-invoice.copy';

export function useSourceRegistrationCopies() {
  return {
    received: useReceivedContractCopy(),
    addendum: useReceivedAddendumCopy(),
    invoice: useExternalInvoiceCopy(),
  };
}
type Copies = ReturnType<typeof useSourceRegistrationCopies>;
type CopyKey =
  | 'loading'
  | 'loadFailed'
  | 'retryLoad'
  | 'sourceUnavailable'
  | 'sourceDenied'
  | 'confirmed'
  | 'exactVersion'
  | 'selectVersion'
  | 'loadNext'
  | 'declaredSource'
  | 'receivedOn'
  | 'invalid'
  | 'uncertain'
  | 'retry'
  | 'register';
type Field = 'selection' | 'title' | 'purpose' | 'source' | 'received';
export type SourceFieldLayout = 'separate' | 'label' | 'grouped';
export type SourceRegistrationFields = {
  title: string;
  purpose: string;
  sourceDescription: string;
  receivedOn: string;
};
export interface SourceRegistrationAdapter<Source> {
  family: 'received-contract' | 'external-invoice' | 'received-addendum';
  endpoint: string;
  authority(actor: ActorContext): string;
  canRegister(actor: ActorContext): boolean;
  readSources(value: unknown): { sources: Source[]; nextCursor: string | null };
  sourceId(source: Source): string;
  sourceLabel(source: Source, copies: Copies): string;
  copy(copies: Copies): { t(key: CopyKey): string };
  presentation(copies: Copies): {
    className: string;
    style?: CSSProperties;
    fields: Record<Field, SourceFieldLayout>;
    date: { kind: 'native'; bounded: boolean } | { kind: 'text'; hint: string };
    warning?: string;
    pendingLabel?: string;
    focusErrors: boolean;
  };
  details?: {
    placement: 'before-picker' | 'after-picker';
    render(source: Source, actor: ActorContext, copies: Copies): ReactNode;
  };
  prepare(input: {
    source: Source;
    fields: SourceRegistrationFields;
    actor: ActorContext;
    companyId: string;
  }): {
    body: string;
    confirms(document: WorkingDocumentDetail): boolean;
  };
}
