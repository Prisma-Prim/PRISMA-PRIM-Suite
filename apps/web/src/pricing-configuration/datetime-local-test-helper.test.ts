import { describe, expect, it } from 'vitest';

import { canonicalDateTimeLocalValue } from './datetime-local-test-helper';

describe('canonicalDateTimeLocalValue', () => {
  it.each([
    {
      input: '2026-09-26T11:34:00',
      canonical: '2026-09-26T11:34',
    },
    {
      input: '2026-09-26T11:34:27',
      canonical: '2026-09-26T11:34:27',
    },
  ])(
    'produces the canonical fill value for $input without changing its instant',
    ({ input, canonical }) => {
      const field = document.createElement('input');
      field.type = 'datetime-local';
      field.step = '1';

      const fillValue = canonicalDateTimeLocalValue(input);
      field.value = fillValue;

      expect(fillValue).toBe(canonical);
      expect(new Date(field.value).getTime()).toBe(new Date(input).getTime());
    },
  );
});
