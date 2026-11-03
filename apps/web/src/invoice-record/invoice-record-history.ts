import {
  exact,
  isInvoiceValues,
  literal,
  object,
  positive,
  sameValues,
  utc,
  uuid,
  type InvoiceValues,
} from './invoice-record-values';

export type InvoiceAction = 'CREATE' | 'CORRECT' | 'WITHDRAW_ENTRY';
export type InvoiceSnapshot = {
  entryState: 'RECORDED' | 'WITHDRAWN';
  values: InvoiceValues;
};
export type InvoiceActor = { membershipId: string; displayName: string };
export type InvoiceReceipt = {
  format: 'EXTERNAL_INVOICE_COMMAND/1';
  commandId: string;
  recordId: string;
  revision: number;
  action: InvoiceAction;
  recordedAt: string;
};
export type InvoiceRevision = {
  format: 'EXTERNAL_INVOICE_REVISION/1';
  recordId: string;
  revision: number;
  action: InvoiceAction;
  commandId: string;
  actor: InvoiceActor;
  recordedAt: string;
  before: InvoiceSnapshot | null;
  after: InvoiceSnapshot;
  reason: string | null;
};
function action(value: unknown): value is InvoiceAction {
  return (
    value === 'CREATE' || value === 'CORRECT' || value === 'WITHDRAW_ENTRY'
  );
}
export function isInvoiceActor(value: unknown): value is InvoiceActor {
  return (
    object(value) &&
    exact(value, ['membershipId', 'displayName']) &&
    uuid(value.membershipId) &&
    typeof value.displayName === 'string'
  );
}
function snapshot(value: unknown): value is InvoiceSnapshot {
  return (
    object(value) &&
    exact(value, ['entryState', 'values']) &&
    (value.entryState === 'RECORDED' || value.entryState === 'WITHDRAWN') &&
    isInvoiceValues(value.values)
  );
}
export function readReceipt(value: unknown): InvoiceReceipt | undefined {
  if (
    !object(value) ||
    !exact(value, [
      'format',
      'commandId',
      'recordId',
      'revision',
      'action',
      'recordedAt',
    ]) ||
    value.format !== 'EXTERNAL_INVOICE_COMMAND/1' ||
    !uuid(value.commandId) ||
    !uuid(value.recordId) ||
    !positive(value.revision) ||
    !action(value.action) ||
    !utc(value.recordedAt) ||
    (value.action === 'CREATE' && value.revision !== 1) ||
    (value.action !== 'CREATE' && value.revision === 1)
  )
    return undefined;
  return {
    format: value.format,
    commandId: value.commandId,
    recordId: value.recordId,
    revision: value.revision,
    action: value.action,
    recordedAt: value.recordedAt,
  };
}
export function isInvoiceRevision(value: unknown): value is InvoiceRevision {
  if (
    !object(value) ||
    !exact(value, [
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
    ]) ||
    value.format !== 'EXTERNAL_INVOICE_REVISION/1' ||
    !uuid(value.recordId) ||
    !positive(value.revision) ||
    !action(value.action) ||
    !uuid(value.commandId) ||
    !isInvoiceActor(value.actor) ||
    !utc(value.recordedAt) ||
    !snapshot(value.after)
  )
    return false;
  if (value.action === 'CREATE')
    return (
      value.revision === 1 &&
      value.before === null &&
      value.reason === null &&
      value.after.entryState === 'RECORDED'
    );
  if (
    value.revision === 1 ||
    !snapshot(value.before) ||
    value.before.entryState !== 'RECORDED' ||
    !literal(value.reason, 2000)
  )
    return false;
  return value.action === 'CORRECT'
    ? value.after.entryState === 'RECORDED' &&
        !sameValues(value.before.values, value.after.values)
    : value.after.entryState === 'WITHDRAWN' &&
        sameValues(value.before.values, value.after.values);
}
/** Historical formats are closed, including every nested snapshot and actor. */
export function revisionPage(
  value: unknown,
  recordId: string,
  head: number,
): InvoiceRevision[] | undefined {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 25 ||
    !value.every(isInvoiceRevision)
  )
    return undefined;
  if (
    value.some(
      (item, index) =>
        item.recordId !== recordId || item.revision !== head - index,
    )
  )
    return undefined;
  if (new Set(value.map((item) => item.commandId)).size !== value.length)
    return undefined;
  for (let index = 1; index < value.length; index += 1) {
    const newer = value[index - 1];
    const older = value[index];
    if (
      !newer ||
      !older ||
      !newer.before ||
      newer.before.entryState !== older.after.entryState ||
      !sameValues(newer.before.values, older.after.values)
    )
      return undefined;
  }
  return value;
}
