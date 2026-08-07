import { describe, expect, it } from 'vitest';
import { comparisonFixture } from './comparisonFixture';
import { comparisonViewports } from './comparisonViewports';

describe('design lab comparison inputs', () => {
  it('provides every Extracted Field state with review pressure', () => {
    const fieldStatuses = new Set(
      comparisonFixture.extractedFields.map((field) => field.status),
    );

    expect([...fieldStatuses].sort()).toEqual([
      'confirmed',
      'contradictory',
      'inferred',
      'missing',
    ]);
    expect(comparisonFixture.requestSources.length).toBeGreaterThanOrEqual(3);
    expect(
      comparisonFixture.extractedFields.some(
        (field) => field.correction !== undefined,
      ),
    ).toBe(true);
    expect(
      comparisonFixture.extractedFields.some(
        (field) => field.exception !== undefined,
      ),
    ).toBe(true);
    expect(
      comparisonFixture.requestSources.some(
        (source) => source.excerpt.length > 300,
      ),
    ).toBe(true);
  });

  it('defines the deterministic comparison viewports', () => {
    expect(comparisonViewports).toEqual({
      desktop: { width: 1440, height: 900 },
      narrow: { width: 390, height: 844 },
    });
  });
});
