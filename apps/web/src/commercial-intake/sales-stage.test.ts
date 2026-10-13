import { describe, expect, it } from 'vitest';
import { isSalesStageList, isValidStageLabel } from './sales-stage';

describe('Sales Stage label rule', () => {
  it('counts Unicode characters, not UTF-16 units', () => {
    expect(isValidStageLabel('🚀'.repeat(80))).toBe(true);
    expect(isValidStageLabel('🚀'.repeat(81))).toBe(false);
    expect(isValidStageLabel('x'.repeat(80))).toBe(true);
    expect(isValidStageLabel('x'.repeat(81))).toBe(false);
    expect(isValidStageLabel('   ')).toBe(false);
    expect(isValidStageLabel('')).toBe(false);
  });

  it('accepts a stage list carrying an 80-emoji label', () => {
    expect(
      isSalesStageList({
        revision: 1,
        stages: [
          {
            id: 'stage-1',
            label: '🚀'.repeat(80),
            position: 1,
            state: 'ACTIVE',
          },
        ],
      }),
    ).toBe(true);
  });
});
