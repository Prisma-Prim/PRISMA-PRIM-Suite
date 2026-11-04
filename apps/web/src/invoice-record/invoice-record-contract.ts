import {
  isInvoiceActor,
  revisionPage,
  type InvoiceActor,
  type InvoiceRevision,
} from './invoice-record-history';
import {
  isInvoiceValues,
  object,
  positive,
  sameValues,
  utc,
  uuid,
  type InvoiceValues,
} from './invoice-record-values';

export type CopiedContext = {
  companyLabel: string;
  contractReference: string;
  contractVersionNumber: number;
  receivingParty: {
    kind: 'PRIMARY' | 'ADDITIONAL';
    legalName: string;
    taxIdentifier: string | null;
    address: string | null;
  };
};
export type InvoiceSummary = {
  id: string;
  revision: number;
  entryState: 'RECORDED' | 'WITHDRAWN';
  values: InvoiceValues;
  copiedContext: CopiedContext;
  createdAt: string;
  replacesWithdrawnRecordId: string | null;
  replacementRecordId: string | null;
};
export type SourceTuple = {
  documentId: string;
  documentVersionId: string;
  representationId: string;
};
export type InvoiceSource = {
  source: SourceTuple;
  documentTitle: string;
  versionNumber: number;
  versionState: 'official' | 'superseded';
  fileName: string;
  byteLength: number;
  sha256: string;
  copiedContext: CopiedContext;
};
type Content =
  | { kind: 'UNAVAILABLE' }
  | {
      kind: 'AVAILABLE';
      representationId: string;
      fileName: string;
      byteLength: number;
      sha256: string;
    };
export type LiveSource =
  | { kind: 'UNAVAILABLE' }
  | {
      kind: 'AVAILABLE';
      documentId: string;
      documentVersionId: string;
      title: string;
      versionNumber: number;
      versionState: 'official' | 'superseded';
      content: Content;
    };
export type Related = {
  contract:
    | { kind: 'UNAVAILABLE' }
    | {
        kind: 'AVAILABLE';
        opportunityId: string;
        contractId: string;
        contractVersionId: string;
      };
  client:
    | { kind: 'UNAVAILABLE' }
    | { kind: 'AVAILABLE'; clientId: string; displayName: string };
};
export type InvoiceCurrent = {
  format: 'EXTERNAL_INVOICE_RECORD/1';
  companyId: string;
  readCapture: string;
  record: InvoiceSummary;
  actor: InvoiceActor;
  recordedAt: string;
  capabilities: { canCorrect: boolean; canWithdraw: boolean };
  liveSource: LiveSource;
  related: Related;
  history: { items: InvoiceRevision[]; nextCursor: string | null };
};
export type InvoiceInventory = {
  items: InvoiceSummary[];
  nextCursor: string | null;
};
export type InvoiceSourcePage = {
  items: InvoiceSource[];
  nextCursor: string | null;
};
export type InvoiceHistoryPage = {
  items: InvoiceRevision[];
  nextCursor: string | null;
};
export function cursor(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === 'string' && value.length > 0 && value.length <= 8192)
  );
}
function nullableText(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}
function context(value: unknown): value is CopiedContext {
  return (
    object(value) &&
    typeof value.companyLabel === 'string' &&
    typeof value.contractReference === 'string' &&
    positive(value.contractVersionNumber) &&
    object(value.receivingParty) &&
    (value.receivingParty.kind === 'PRIMARY' ||
      value.receivingParty.kind === 'ADDITIONAL') &&
    typeof value.receivingParty.legalName === 'string' &&
    nullableText(value.receivingParty.taxIdentifier) &&
    nullableText(value.receivingParty.address)
  );
}
function summary(value: unknown): value is InvoiceSummary {
  return (
    object(value) &&
    uuid(value.id) &&
    positive(value.revision) &&
    (value.entryState === 'RECORDED' || value.entryState === 'WITHDRAWN') &&
    isInvoiceValues(value.values) &&
    context(value.copiedContext) &&
    utc(value.createdAt) &&
    (value.replacesWithdrawnRecordId === null ||
      uuid(value.replacesWithdrawnRecordId)) &&
    (value.replacementRecordId === null || uuid(value.replacementRecordId)) &&
    value.replacesWithdrawnRecordId !== value.id &&
    value.replacementRecordId !== value.id
  );
}
function formal(value: unknown): value is 'official' | 'superseded' {
  return value === 'official' || value === 'superseded';
}
function bytes(value: Record<string, unknown>) {
  return (
    positive(value.byteLength) &&
    value.byteLength <= 5 * 1024 * 1024 &&
    typeof value.sha256 === 'string' &&
    /^[0-9a-f]{64}$/u.test(value.sha256) &&
    typeof value.fileName === 'string' &&
    value.fileName.length > 0
  );
}
function source(value: unknown): value is InvoiceSource {
  return (
    object(value) &&
    object(value.source) &&
    uuid(value.source.documentId) &&
    uuid(value.source.documentVersionId) &&
    uuid(value.source.representationId) &&
    typeof value.documentTitle === 'string' &&
    positive(value.versionNumber) &&
    formal(value.versionState) &&
    bytes(value) &&
    context(value.copiedContext)
  );
}
function content(value: unknown): value is Content {
  return (
    object(value) &&
    (value.kind === 'UNAVAILABLE'
      ? Object.keys(value).length === 1
      : value.kind === 'AVAILABLE' &&
        uuid(value.representationId) &&
        bytes(value))
  );
}
function liveSource(value: unknown): value is LiveSource {
  return (
    object(value) &&
    (value.kind === 'UNAVAILABLE'
      ? Object.keys(value).length === 1
      : value.kind === 'AVAILABLE' &&
        uuid(value.documentId) &&
        uuid(value.documentVersionId) &&
        typeof value.title === 'string' &&
        positive(value.versionNumber) &&
        formal(value.versionState) &&
        content(value.content))
  );
}
function related(value: unknown): value is Related {
  if (!object(value) || !object(value.contract) || !object(value.client))
    return false;
  const contract = value.contract;
  const client = value.client;
  return (
    (contract.kind === 'UNAVAILABLE'
      ? Object.keys(contract).length === 1
      : contract.kind === 'AVAILABLE' &&
        uuid(contract.opportunityId) &&
        uuid(contract.contractId) &&
        uuid(contract.contractVersionId)) &&
    (client.kind === 'UNAVAILABLE'
      ? Object.keys(client).length === 1
      : client.kind === 'AVAILABLE' &&
        uuid(client.clientId) &&
        typeof client.displayName === 'string')
  );
}
function envelope(
  value: unknown,
  format: string,
  companyId: string,
  capture: string,
): value is Record<string, unknown> {
  return (
    object(value) &&
    value.format === format &&
    value.companyId === companyId &&
    value.readCapture === capture
  );
}
export function readInventory(
  value: unknown,
  companyId: string,
  capture: string,
): InvoiceInventory | undefined {
  if (
    !envelope(value, 'EXTERNAL_INVOICE_INVENTORY/1', companyId, capture) ||
    !Array.isArray(value.items) ||
    value.items.length > 25 ||
    !value.items.every(summary) ||
    !cursor(value.nextCursor)
  )
    return undefined;
  if (new Set(value.items.map((item) => item.id)).size !== value.items.length)
    return undefined;
  for (let index = 1; index < value.items.length; index += 1) {
    const prior = value.items[index - 1];
    const current = value.items[index];
    if (
      !prior ||
      !current ||
      prior.createdAt < current.createdAt ||
      (prior.createdAt === current.createdAt && prior.id <= current.id)
    )
      return undefined;
  }
  return { items: value.items, nextCursor: value.nextCursor };
}
export function readSources(
  value: unknown,
  companyId: string,
  capture: string,
): InvoiceSourcePage | undefined {
  if (
    !envelope(value, 'EXTERNAL_INVOICE_SOURCE_PAGE/1', companyId, capture) ||
    !Array.isArray(value.items) ||
    value.items.length > 25 ||
    !value.items.every(source) ||
    !cursor(value.nextCursor) ||
    new Set(value.items.map((item) => sourceKey(item.source))).size !==
      value.items.length
  )
    return undefined;
  return { items: value.items, nextCursor: value.nextCursor };
}
export function readCurrent(
  value: unknown,
  companyId: string,
  recordId: string,
  capture: string,
): InvoiceCurrent | undefined {
  if (
    !envelope(value, 'EXTERNAL_INVOICE_RECORD/1', companyId, capture) ||
    !summary(value.record) ||
    value.record.id !== recordId ||
    !isInvoiceActor(value.actor) ||
    !utc(value.recordedAt) ||
    !object(value.capabilities) ||
    typeof value.capabilities.canCorrect !== 'boolean' ||
    typeof value.capabilities.canWithdraw !== 'boolean' ||
    !liveSource(value.liveSource) ||
    !related(value.related) ||
    !object(value.history) ||
    !cursor(value.history.nextCursor)
  )
    return undefined;
  const items = revisionPage(
    value.history.items,
    recordId,
    value.record.revision,
  );
  const head = items?.[0];
  if (
    !items ||
    !head ||
    head.after.entryState !== value.record.entryState ||
    !sameValues(head.after.values, value.record.values) ||
    head.actor.membershipId !== value.actor.membershipId ||
    head.actor.displayName !== value.actor.displayName ||
    head.recordedAt !== value.recordedAt ||
    (value.history.nextCursor === null
      ? items[items.length - 1]?.revision !== 1
      : items[items.length - 1]?.revision === 1) ||
    (value.record.entryState === 'WITHDRAWN' &&
      (value.capabilities.canCorrect || value.capabilities.canWithdraw))
  )
    return undefined;
  return {
    format: 'EXTERNAL_INVOICE_RECORD/1',
    companyId,
    readCapture: capture,
    record: value.record,
    actor: value.actor,
    recordedAt: value.recordedAt,
    capabilities: {
      canCorrect: value.capabilities.canCorrect,
      canWithdraw: value.capabilities.canWithdraw,
    },
    liveSource: value.liveSource,
    related: value.related,
    history: { items, nextCursor: value.history.nextCursor },
  };
}
export function readHistory(
  value: unknown,
  companyId: string,
  recordId: string,
  headRevision: number,
  nextRevision: number,
  capture: string,
): InvoiceHistoryPage | undefined {
  if (
    !envelope(value, 'EXTERNAL_INVOICE_HISTORY/1', companyId, capture) ||
    value.recordId !== recordId ||
    value.headRevision !== headRevision ||
    !cursor(value.nextCursor)
  )
    return undefined;
  const items = revisionPage(value.items, recordId, nextRevision);
  if (
    !items ||
    (value.nextCursor === null
      ? items[items.length - 1]?.revision !== 1
      : items[items.length - 1]?.revision === 1)
  )
    return undefined;
  return { items, nextCursor: value.nextCursor };
}
export function sourceKey(value: SourceTuple) {
  return `${value.documentId}:${value.documentVersionId}:${value.representationId}`;
}
