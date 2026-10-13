import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { readCreateSalesStageCommand } from './sales-stage.validation.js';

describe('Sales Stage creation command', () => {
  it('counts label characters as Unicode code points, as PostgreSQL does', () => {
    const emoji = '🚀'.repeat(80);
    expect(
      readCreateSalesStageCommand({ expectedRevision: 0, label: emoji }),
    ).toEqual({ expectedRevision: 0, label: emoji });
    expect(() =>
      readCreateSalesStageCommand({ expectedRevision: 0, label: `${emoji}🚀` }),
    ).toThrow(BadRequestException);
  });

  it('keeps the 1–80 character boundary for plain labels', () => {
    expect(
      readCreateSalesStageCommand({
        expectedRevision: 2,
        label: 'x'.repeat(80),
      }),
    ).toEqual({ expectedRevision: 2, label: 'x'.repeat(80) });
    for (const label of ['', '   ', 'x'.repeat(81)])
      expect(() =>
        readCreateSalesStageCommand({ expectedRevision: 2, label }),
      ).toThrow(BadRequestException);
  });
});
