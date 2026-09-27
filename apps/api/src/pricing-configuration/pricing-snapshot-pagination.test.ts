import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  pricingSnapshotCursor,
  readPricingSnapshotCursor,
  readPricingSnapshotLimit,
} from './pricing-snapshot-pagination.js';

const ID = '10000000-0000-4000-8000-000000000001';

describe('Pricing Snapshot pagination', () => {
  it('round-trips the exact stable cursor and applies bounded limits', () => {
    const cursor = {
      calculatedAt: '2026-09-26T12:34:56.789Z',
      id: ID,
    };
    expect(readPricingSnapshotCursor(pricingSnapshotCursor(cursor))).toEqual(
      cursor,
    );
    expect(readPricingSnapshotLimit(undefined)).toBe(25);
    expect(readPricingSnapshotLimit('1')).toBe(1);
    expect(readPricingSnapshotLimit('50')).toBe(50);
  });

  it.each(['', '0', '51', '1.5', '-1', 25])(
    'rejects malformed explicit limit %j',
    (limit) => {
      expect(() => readPricingSnapshotLimit(limit)).toThrow(
        BadRequestException,
      );
    },
  );

  it.each([
    '',
    'not-a-cursor',
    encoded({ calculatedAt: '2026-02-30T00:00:00.000Z', id: ID }),
    encoded({ calculatedAt: '2026-09-26T12:34:56Z', id: ID }),
    encoded({ calculatedAt: '2026-09-26T12:34:56.789Z', id: 'bad-id' }),
    encoded({
      calculatedAt: '2026-09-26T12:34:56.789Z',
      id: ID,
      extra: true,
    }),
  ])('rejects malformed cursor %j before it reaches PostgreSQL', (cursor) => {
    expect(() => readPricingSnapshotCursor(cursor)).toThrow(
      BadRequestException,
    );
  });
});

function encoded(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}
