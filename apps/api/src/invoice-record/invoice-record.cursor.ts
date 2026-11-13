import { BadRequestException } from '@nestjs/common';
import {
  createContinuationCursor,
  type ContinuationCursorBinding,
  type ContinuationCursorKey,
} from '../continuation-cursor/continuation-cursor.js';
import { requireUuid } from '../access/access-command-validation.js';
import {
  invoiceObject,
  invoiceRevision,
  invoiceSource,
  type InvoiceSource,
} from './invoice-record.input.js';
export type InvoiceCursorBinding = ContinuationCursorBinding;
export type InvoicePosition =
  | { kind: 'history'; recordId: string; headRevision: number; before: number }
  | { kind: 'inventory'; createdAt: string; id: string }
  | { kind: 'source'; source: InvoiceSource };
export function invoiceCursors(
  key: ContinuationCursorKey<InvoicePosition['kind']>,
) {
  return createContinuationCursor<InvoicePosition>({
    protocol: 'invoice-record',
    key,
    position: { encode: (position) => position, decode: invoicePosition },
    invalid: () =>
      new BadRequestException(
        'Restart invoice discovery or history deliberately.',
      ),
    wrongKind: () => new BadRequestException(),
  });
}
function invoicePosition(value: unknown): InvoicePosition {
  if (!value || typeof value !== 'object' || !('kind' in value))
    throw new Error();
  if (value.kind === 'history') {
    const p = invoiceObject(value, [
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
  if (value.kind === 'inventory') {
    const p = invoiceObject(value, ['kind', 'createdAt', 'id']);
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
  const p = invoiceObject(value, ['kind', 'source']);
  if (p.kind !== 'source') throw new Error();
  return { kind: 'source', source: invoiceSource(p.source) };
}
