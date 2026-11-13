import { BadRequestException } from '@nestjs/common';
import {
  createContinuationCursor,
  type ContinuationCursorBinding,
  type ContinuationCursorKey,
} from '../continuation-cursor/continuation-cursor.js';
import { requireUuid } from '../access/access-command-validation.js';
import {
  paymentObject,
  paymentRevision,
  paymentSource,
  type PaymentSource,
} from './payment.input.js';
export type PaymentCursorBinding = ContinuationCursorBinding;
export type PaymentPosition =
  | { kind: 'history'; paymentId: string; headRevision: number; before: number }
  | { kind: 'inventory'; createdAt: string; id: string }
  | { kind: 'source'; source: PaymentSource };
export function paymentCursors(
  key: ContinuationCursorKey<PaymentPosition['kind']>,
) {
  return createContinuationCursor<PaymentPosition>({
    protocol: 'payment',
    key,
    position: { encode: (position) => position, decode: paymentPosition },
    invalid: () =>
      new BadRequestException(
        'Restart payment discovery or history deliberately.',
      ),
    wrongKind: () => new BadRequestException(),
  });
}
function paymentPosition(value: unknown): PaymentPosition {
  if (!value || typeof value !== 'object' || !('kind' in value))
    throw new Error();
  if (value.kind === 'history') {
    const p = paymentObject(value, [
      'kind',
      'paymentId',
      'headRevision',
      'before',
    ]);
    const before = paymentRevision(p.before),
      headRevision = paymentRevision(p.headRevision);
    if (before > headRevision) throw new Error();
    return {
      kind: 'history',
      paymentId: requireUuid(p.paymentId),
      headRevision,
      before,
    };
  }
  if (value.kind === 'inventory') {
    const p = paymentObject(value, ['kind', 'createdAt', 'id']);
    if (
      typeof p.createdAt !== 'string' ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(p.createdAt) ||
      new Date(p.createdAt).toISOString() !== p.createdAt
    )
      throw new Error();
    return {
      kind: 'inventory',
      createdAt: p.createdAt,
      id: requireUuid(p.id),
    };
  }
  const p = paymentObject(value, ['kind', 'source']);
  if (p.kind !== 'source') throw new Error();
  return { kind: 'source', source: paymentSource(p.source) };
}
