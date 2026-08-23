import { describe, expect, it } from 'vitest';
import { sameJsonValue } from './json-structural-equality.js';

describe('sameJsonValue', () => {
  it('ignores object key order at every JSON object boundary', () => {
    expect(
      sameJsonValue(
        {
          contacts: [
            {
              name: 'Ana Popescu',
              telephone: '+373 60 000 000',
              email: 'ana@example.test',
            },
          ],
          telephone: '+373 22 000 000',
        },
        {
          telephone: '+373 22 000 000',
          contacts: [
            {
              email: 'ana@example.test',
              name: 'Ana Popescu',
              telephone: '+373 60 000 000',
            },
          ],
        },
      ),
    ).toBe(true);
  });

  it('still distinguishes changed JSON values and array order', () => {
    expect(sameJsonValue({ contacts: ['Ana'] }, { contacts: ['Ion'] })).toBe(
      false,
    );
    expect(
      sameJsonValue({ contacts: ['Ana', 'Ion'] }, { contacts: ['Ion', 'Ana'] }),
    ).toBe(false);
  });
});
