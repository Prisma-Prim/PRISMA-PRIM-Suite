import { requireUuid } from '../access/access-command-validation.js';
import {
  paymentObject,
  paymentRevision,
  paymentSource,
  paymentText,
  paymentValues,
} from './payment.input.js';
import type {
  PaymentAction,
  PaymentActor,
  PaymentConfirmation,
  PaymentFact,
  PaymentReceipt,
  PaymentRevision,
  PaymentSourceSnapshot,
} from './payment.types.js';
import { isDeepStrictEqual } from 'node:util';
function time(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    throw new Error('Invalid Payment instant.');
  return value;
}
function action(value: unknown): PaymentAction {
  if (
    value !== 'CREATE' &&
    value !== 'CORRECT_DRAFT' &&
    value !== 'WITHDRAW_DRAFT' &&
    value !== 'CONFIRM' &&
    value !== 'REVERSE'
  )
    throw new Error('Invalid Payment action.');
  return value;
}
function nativeText(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    /[\uD800-\uDFFF]/u.test(value) ||
    value.includes('\0')
  )
    throw new Error('Invalid copied Payment text.');
  return value;
}
function actor(value: unknown): PaymentActor {
  const v = paymentObject(value, ['membershipId', 'displayName']);
  return {
    membershipId: requireUuid(v.membershipId),
    displayName: nativeText(v.displayName),
  };
}
function confirmation(value: unknown): PaymentConfirmation {
  const v = paymentObject(value, ['actor', 'recordedAt', 'note']);
  return {
    actor: actor(v.actor),
    recordedAt: time(v.recordedAt),
    note: paymentText(v.note, 2000),
  };
}
export function paymentFact(value: unknown): PaymentFact {
  const v = paymentObject(value, ['state', 'values', 'confirmation']);
  const values = paymentValues(v.values);
  if (v.state === 'DRAFT' || v.state === 'WITHDRAWN') {
    if (v.confirmation !== null)
      throw new Error('Unconfirmed Payment has confirmation.');
    return { state: v.state, values, confirmation: null };
  }
  if (v.state !== 'CONFIRMED' && v.state !== 'REVERSED')
    throw new Error('Invalid Payment state.');
  return { state: v.state, values, confirmation: confirmation(v.confirmation) };
}
export function paymentReceipt(value: unknown): PaymentReceipt {
  const v = paymentObject(value, [
    'format',
    'commandId',
    'paymentId',
    'revision',
    'action',
    'recordedAt',
  ]);
  if (v.format !== 'PAYMENT_COMMAND/1')
    throw new Error('Unsupported Payment receipt.');
  return {
    format: v.format,
    commandId: requireUuid(v.commandId),
    paymentId: requireUuid(v.paymentId),
    revision: paymentRevision(v.revision),
    action: action(v.action),
    recordedAt: time(v.recordedAt),
  };
}
export function paymentHistoryRevision(value: unknown): PaymentRevision {
  const v = paymentObject(value, [
    'format',
    'paymentId',
    'revision',
    'action',
    'commandId',
    'actor',
    'recordedAt',
    'before',
    'after',
    'reason',
  ]);
  if (v.format !== 'PAYMENT_REVISION/1')
    throw new Error('Unsupported Payment history.');
  const r: PaymentRevision = {
    format: v.format,
    paymentId: requireUuid(v.paymentId),
    revision: paymentRevision(v.revision),
    action: action(v.action),
    commandId: requireUuid(v.commandId),
    actor: actor(v.actor),
    recordedAt: time(v.recordedAt),
    before: v.before === null ? null : paymentFact(v.before),
    after: paymentFact(v.after),
    reason: v.reason === null ? null : paymentText(v.reason, 2000),
  };
  if (r.action === 'CREATE') {
    if (
      r.revision !== 1 ||
      r.before !== null ||
      r.reason !== null ||
      r.after.state !== 'DRAFT'
    )
      throw new Error('Invalid Payment creation.');
    return r;
  }
  const b = r.before,
    a = r.after;
  if (!b || r.revision < 2) throw new Error('Missing Payment predecessor.');
  switch (r.action) {
    case 'CORRECT_DRAFT':
      if (
        b.state !== 'DRAFT' ||
        a.state !== 'DRAFT' ||
        r.reason === null ||
        isDeepStrictEqual(b.values, a.values)
      )
        throw new Error('Invalid Payment correction.');
      break;
    case 'WITHDRAW_DRAFT':
      if (
        b.state !== 'DRAFT' ||
        a.state !== 'WITHDRAWN' ||
        r.reason === null ||
        !isDeepStrictEqual(b.values, a.values)
      )
        throw new Error('Invalid Payment withdrawal.');
      break;
    case 'CONFIRM':
      if (
        b.state !== 'DRAFT' ||
        a.state !== 'CONFIRMED' ||
        r.reason !== null ||
        !isDeepStrictEqual(b.values, a.values) ||
        !isDeepStrictEqual(a.confirmation.actor, r.actor) ||
        a.confirmation.recordedAt !== r.recordedAt
      )
        throw new Error('Invalid Payment confirmation.');
      break;
    case 'REVERSE':
      if (
        b.state !== 'CONFIRMED' ||
        a.state !== 'REVERSED' ||
        r.reason === null ||
        !isDeepStrictEqual(b.values, a.values) ||
        !isDeepStrictEqual(b.confirmation, a.confirmation)
      )
        throw new Error('Invalid Payment reversal.');
      break;
    default: {
      const exhaustive: never = r.action;
      throw new Error(`Unsupported Payment transition ${exhaustive}`);
    }
  }
  return r;
}
export function paymentSnapshot(value: unknown): PaymentSourceSnapshot {
  const v = paymentObject(value, [
    'source',
    'originalClientId',
    'payerAdditionalId',
    'byteLength',
    'sha256',
    'copiedContext',
  ]);
  const c = paymentObject(v.copiedContext, ['companyLabel', 'payer']),
    p = paymentObject(c.payer, ['kind', 'legalName', 'taxId', 'legalAddress']);
  if (
    (p.kind !== 'PRIMARY' && p.kind !== 'ADDITIONAL') ||
    typeof v.byteLength !== 'number' ||
    !Number.isInteger(v.byteLength) ||
    v.byteLength < 1 ||
    v.byteLength > 5242880 ||
    typeof v.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(v.sha256)
  )
    throw new Error('Invalid conserved Payment source.');
  const additional =
    v.payerAdditionalId === null ? null : requireUuid(v.payerAdditionalId);
  if ((p.kind === 'PRIMARY') !== (additional === null))
    throw new Error('Invalid conserved payer.');
  return {
    source: paymentSource(v.source),
    originalClientId: requireUuid(v.originalClientId),
    payerAdditionalId: additional,
    byteLength: v.byteLength,
    sha256: v.sha256,
    copiedContext: {
      companyLabel: nativeText(c.companyLabel),
      payer: {
        kind: p.kind,
        legalName: nativeText(p.legalName),
        taxId: p.taxId === null ? null : nativeText(p.taxId),
        legalAddress:
          p.legalAddress === null ? null : nativeText(p.legalAddress),
      },
    },
  };
}
