import { describe, expect, it } from 'vitest';
import {
  getApplicationPresentation,
  getPresentationUrl,
} from './application-presentation';

describe('application presentation URL contract', () => {
  const selections: ReadonlyArray<readonly [string, 'classic' | 'prisme']> = [
    ['https://suite.test/', 'prisme'],
    ['https://suite.test/?frame=prisme', 'prisme'],
    ['https://suite.test/?frame=classic', 'classic'],
    ['https://suite.test/?frame=unknown', 'prisme'],
  ];
  it.each(selections)('selects %s as %s', (href, expected) => {
    expect(getApplicationPresentation(new URL(href))).toBe(expected);
  });

  it('adds only the explicit Classic rollback while preserving query order and fragment', () => {
    expect(
      getPresentationUrl(
        new URL('https://suite.test/?source=invitation&step=2#companies'),
        'classic',
      ).href,
    ).toBe(
      'https://suite.test/?source=invitation&step=2&frame=classic#companies',
    );
  });

  it('removes only the frame parameter when returning to default Prisme', () => {
    expect(
      getPresentationUrl(
        new URL(
          'https://suite.test/?source=invitation&frame=classic&step=2#companies',
        ),
        'prisme',
      ).href,
    ).toBe('https://suite.test/?source=invitation&step=2#companies');
  });
});
