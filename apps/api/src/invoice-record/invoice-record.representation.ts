import { requireUuid } from '../access/access-command-validation.js';
import {
  invoiceObject,
  invoiceRevision,
  invoiceSource,
  invoiceText,
  invoiceValues,
} from './invoice-record.input.js';
import type {
  InvoiceAction,
  InvoiceFact,
  InvoiceReceipt,
  InvoiceRevision,
  InvoiceSourceSnapshot,
} from './invoice-record.types.js';
import { isDeepStrictEqual } from 'node:util';
function time(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    throw new Error('Invalid invoice timestamp.');
  return value;
}
function action(value: unknown): InvoiceAction {
  if (value !== 'CREATE' && value !== 'CORRECT' && value !== 'WITHDRAW_ENTRY')
    throw new Error('Invalid invoice action.');
  return value;
}
export function invoiceFact(value: unknown): InvoiceFact {
  const v = invoiceObject(value, ['entryState', 'values']);
  if (v.entryState !== 'RECORDED' && v.entryState !== 'WITHDRAWN')
    throw new Error('Invalid invoice state.');
  return { entryState: v.entryState, values: invoiceValues(v.values) };
}
export function invoiceReceipt(value: unknown): InvoiceReceipt {
  const v = invoiceObject(value, [
    'format',
    'commandId',
    'recordId',
    'revision',
    'action',
    'recordedAt',
  ]);
  if (v.format !== 'EXTERNAL_INVOICE_COMMAND/1')
    throw new Error('Unsupported invoice receipt.');
  return {
    format: v.format,
    commandId: requireUuid(v.commandId),
    recordId: requireUuid(v.recordId),
    revision: invoiceRevision(v.revision),
    action: action(v.action),
    recordedAt: time(v.recordedAt),
  };
}
export function invoiceHistoryRevision(value: unknown): InvoiceRevision {
  const v = invoiceObject(value, [
    'format',
    'recordId',
    'revision',
    'action',
    'commandId',
    'actor',
    'recordedAt',
    'before',
    'after',
    'reason',
  ]);
  if (v.format !== 'EXTERNAL_INVOICE_REVISION/1')
    throw new Error('Unsupported invoice revision.');
  const a = invoiceObject(v.actor, ['membershipId', 'displayName']);
  const result: InvoiceRevision = {
    format: v.format,
    recordId: requireUuid(v.recordId),
    revision: invoiceRevision(v.revision),
    action: action(v.action),
    commandId: requireUuid(v.commandId),
    actor: {
      membershipId: requireUuid(a.membershipId),
      displayName: invoiceText(a.displayName, 1000),
    },
    recordedAt: time(v.recordedAt),
    before: v.before === null ? null : invoiceFact(v.before),
    after: invoiceFact(v.after),
    reason: v.reason === null ? null : invoiceText(v.reason, 2000),
  };
  if (
    result.action === 'CREATE'
      ? result.revision !== 1 ||
        result.before !== null ||
        result.reason !== null ||
        result.after.entryState !== 'RECORDED'
      : result.revision < 2 ||
        !result.before ||
        result.before.entryState !== 'RECORDED' ||
        result.reason === null ||
        (result.action === 'CORRECT'
          ? result.after.entryState !== 'RECORDED' ||
            isDeepStrictEqual(result.before.values, result.after.values)
          : result.after.entryState !== 'WITHDRAWN' ||
            !isDeepStrictEqual(result.before.values, result.after.values))
  )
    throw new Error('Invalid invoice transition.');
  return result;
}
export function invoiceSnapshot(value: unknown): InvoiceSourceSnapshot {
  const v = invoiceObject(value, [
    'source',
    'originalClientId',
    'opportunityId',
    'contractId',
    'contractVersionId',
    'receivingPartyAdditionalId',
    'byteLength',
    'sha256',
    'copiedContext',
  ]);
  const c = invoiceObject(v.copiedContext, [
    'companyLabel',
    'contractReference',
    'contractVersionNumber',
    'receivingParty',
  ]);
  const p = invoiceObject(c.receivingParty, [
    'kind',
    'legalName',
    'taxIdentifier',
    'address',
  ]);
  if (
    (p.kind !== 'PRIMARY' && p.kind !== 'ADDITIONAL') ||
    typeof v.byteLength !== 'number' ||
    !Number.isInteger(v.byteLength) ||
    v.byteLength < 1 ||
    v.byteLength > 5242880 ||
    typeof v.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(v.sha256)
  )
    throw new Error('Invalid conserved invoice source.');
  const additional =
    v.receivingPartyAdditionalId === null
      ? null
      : requireUuid(v.receivingPartyAdditionalId);
  if ((p.kind === 'PRIMARY') !== (additional === null))
    throw new Error('Invalid conserved invoice party.');
  return {
    source: invoiceSource(v.source),
    originalClientId: requireUuid(v.originalClientId),
    opportunityId: requireUuid(v.opportunityId),
    contractId: requireUuid(v.contractId),
    contractVersionId: requireUuid(v.contractVersionId),
    receivingPartyAdditionalId: additional,
    byteLength: v.byteLength,
    sha256: v.sha256,
    copiedContext: {
      companyLabel: invoiceText(c.companyLabel, 1000),
      contractReference: invoiceText(c.contractReference, 200),
      contractVersionNumber: invoiceRevision(c.contractVersionNumber),
      receivingParty: {
        kind: p.kind,
        legalName: invoiceText(p.legalName, 200),
        taxIdentifier:
          p.taxIdentifier === null ? null : invoiceText(p.taxIdentifier, 200),
        address: p.address === null ? null : invoiceText(p.address, 2000),
      },
    },
  };
}
