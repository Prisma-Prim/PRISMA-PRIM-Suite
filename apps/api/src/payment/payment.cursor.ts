import { BadRequestException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { requireUuid } from '../access/access-command-validation.js';
import {
  paymentObject,
  paymentRevision,
  paymentSource,
  type PaymentSource,
} from './payment.input.js';
export interface PaymentCursorBinding {
  workspaceId: string;
  companyId: string;
  actorMembershipId: string;
  readCapture: string;
}
export type PaymentPosition =
  | { kind: 'history'; paymentId: string; headRevision: number; before: number }
  | { kind: 'inventory'; createdAt: string; id: string }
  | { kind: 'source'; source: PaymentSource };
export function paymentCursor(
  key: string,
  binding: PaymentCursorBinding,
  position: PaymentPosition,
) {
  const payload = Buffer.from(
    JSON.stringify({ format: 'PAYMENT_CURSOR/1', binding, position }),
  ).toString('base64url');
  return (
    payload +
    '.' +
    createHmac('sha256', key).update(payload).digest('base64url')
  );
}
export function readPaymentCursor(
  key: string,
  value: string,
  binding: PaymentCursorBinding,
): PaymentPosition {
  try {
    if (value.length > 2048 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(value))
      throw new Error();
    const [payload, signature] = value.split('.');
    if (!payload || !signature) throw new Error();
    const expected = createHmac('sha256', key).update(payload).digest(),
      supplied = Buffer.from(signature, 'base64url');
    if (
      supplied.length !== expected.length ||
      supplied.toString('base64url') !== signature ||
      Buffer.from(payload, 'base64url').toString('base64url') !== payload ||
      !timingSafeEqual(expected, supplied)
    )
      throw new Error();
    const parsed: unknown = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    );
    const v = paymentObject(parsed, ['format', 'binding', 'position']);
    const b = paymentObject(v.binding, [
      'workspaceId',
      'companyId',
      'actorMembershipId',
      'readCapture',
    ]);
    if (
      v.format !== 'PAYMENT_CURSOR/1' ||
      b.workspaceId !== binding.workspaceId ||
      b.companyId !== binding.companyId ||
      b.actorMembershipId !== binding.actorMembershipId ||
      b.readCapture !== binding.readCapture
    )
      throw new Error();
    if (
      !v.position ||
      typeof v.position !== 'object' ||
      !('kind' in v.position)
    )
      throw new Error();
    if (v.position.kind === 'history') {
      const p = paymentObject(v.position, [
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
    if (v.position.kind === 'inventory') {
      const p = paymentObject(v.position, ['kind', 'createdAt', 'id']);
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
    const p = paymentObject(v.position, ['kind', 'source']);
    if (p.kind !== 'source') throw new Error();
    return { kind: 'source', source: paymentSource(p.source) };
  } catch {
    throw new BadRequestException(
      'Restart payment discovery or history deliberately.',
    );
  }
}
