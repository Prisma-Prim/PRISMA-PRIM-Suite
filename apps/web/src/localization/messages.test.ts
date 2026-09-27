import { describe, expect, it } from 'vitest';
import { assertFirstJourneyTranslationCoverage } from './first-journey-coverage';
import {
  assertMessageCoverage,
  defineMessages,
  resolveMessage,
} from './messages';

describe('localized message boundary', () => {
  it('falls back to Romanian instead of exposing a missing key', () => {
    const messages = defineMessages<'greeting'>(['greeting'], {
      ro: { greeting: 'Bună' },
      ru: { greeting: 'Здравствуйте' },
      fr: {},
      en: { greeting: 'Hello' },
    });

    expect(resolveMessage(messages, 'fr', 'greeting')).toBe('Bună');
  });

  it('identifies the missing locale and key in release coverage', () => {
    const messages = defineMessages<'greeting'>(['greeting'], {
      ro: { greeting: 'Bună' },
      ru: { greeting: 'Здравствуйте' },
      fr: {},
      en: { greeting: 'Hello' },
    });

    expect(() => assertMessageCoverage('example', messages)).toThrow(
      'Missing translation: example.fr.greeting',
    );
  });

  it('covers every message owned by the first localized journey', () => {
    expect(() => assertFirstJourneyTranslationCoverage()).not.toThrow();
  });
});
