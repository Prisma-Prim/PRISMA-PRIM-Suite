import { describe, expect, it } from 'vitest';
import { requireVersion } from './client-dossier-validation.js';

describe('Client dossier validation', () => {
  it('accepts every version that can be incremented in PostgreSQL', () => {
    expect(requireVersion(1)).toBe(1);
    expect(requireVersion(2_147_483_646)).toBe(2_147_483_646);
  });

  it.each([0, -1, 1.5, 2_147_483_647, 2_147_483_648, Number.MAX_SAFE_INTEGER])(
    'rejects an expected version outside the persisted integer range: %s',
    (value) => {
      expect(() => requireVersion(value)).toThrow(
        'Expected Client version must be an integer between 1 and 2147483646.',
      );
    },
  );
});
