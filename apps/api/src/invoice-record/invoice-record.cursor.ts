import { BadRequestException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { requireUuid } from '../access/access-command-validation.js';
import {
  invoiceObject,
  invoiceRevision,
  invoiceSource,
  type InvoiceSource,
} from './invoice-record.input.js';
export interface InvoiceCursorBinding {
  workspaceId: string;
  companyId: string;
  actorMembershipId: string;
  readCapture: string;
}
export type InvoicePosition =
  | { kind: 'history'; recordId: string; headRevision: number; before: number }
  | { kind: 'inventory'; createdAt: string; id: string }
  | { kind: 'source'; source: InvoiceSource };
export function invoiceCursor(
  key: string,
  binding: InvoiceCursorBinding,
  position: InvoicePosition,
) {
  const payload = Buffer.from(
    JSON.stringify({ format: 'EXTERNAL_INVOICE_CURSOR/1', binding, position }),
  ).toString('base64url');
  return (
    payload +
    '.' +
    createHmac('sha256', key).update(payload).digest('base64url')
  );
}
export function readInvoiceCursor(
  key: string,
  value: string,
  binding: InvoiceCursorBinding,
): InvoicePosition {
  try {
    if (value.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(value))
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
    const v = invoiceObject(parsed, ['format', 'binding', 'position']);
    const b = invoiceObject(v.binding, [
      'workspaceId',
      'companyId',
      'actorMembershipId',
      'readCapture',
    ]);
    if (
      v.format !== 'EXTERNAL_INVOICE_CURSOR/1' ||
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
      const p = invoiceObject(v.position, [
        'kind',
        'recordId',
        'headRevision',
        'before',
      ]);
      const before = invoiceRevision(p.before),
        headRevision = invoiceRevision(p.headRevision);
      if (before > headRevision) throw new Error();
      return {
        kind: 'history',
        recordId: requireUuid(p.recordId),
        headRevision,
        before,
      };
    }
    if (v.position.kind === 'inventory') {
      const p = invoiceObject(v.position, ['kind', 'createdAt', 'id']);
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
    const p = invoiceObject(v.position, ['kind', 'source']);
    if (p.kind !== 'source') throw new Error();
    return { kind: 'source', source: invoiceSource(p.source) };
  } catch {
    throw new BadRequestException(
      'Restart invoice discovery or history deliberately.',
    );
  }
}
