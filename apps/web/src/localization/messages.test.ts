import { describe, expect, it } from 'vitest';
import { assertFirstJourneyTranslationCoverage } from './first-journey-coverage';
import {
  assertMessageCoverage,
  defineMessages,
  formatMessage,
  resolveMessage,
} from './messages';

function proveKeyTupleOwnership(): void {
  const keys = ['known'] as const;
  const messages = defineMessages(keys, {
    ro: { known: 'Cunoscut' },
    ru: { known: 'Известный' },
    fr: { known: 'Connu' },
    en: { known: 'Known' },
  });
  defineMessages(keys, {
    ro: {
      known: 'Cunoscut',
      // @ts-expect-error The key tuple is the sole translation-key owner.
      unlisted: 'Nedeclarat',
    },
    ru: { known: 'Известный' },
    fr: { known: 'Connu' },
    en: { known: 'Known' },
  });
  // @ts-expect-error Lookup keys are derived from the same tuple.
  resolveMessage(messages, 'en', 'unlisted');
}
void proveKeyTupleOwnership;

describe('localized message boundary', () => {
  it('derives accepted translation and lookup keys only from the key tuple', () => {
    const keys = ['known'] as const;
    const messages = defineMessages(keys, {
      ro: { known: 'Cunoscut' },
      ru: { known: 'Известный' },
      fr: { known: 'Connu' },
      en: { known: 'Known' },
    });

    expect(resolveMessage(messages, 'en', 'known')).toBe('Known');
  });

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

  it('preserves literal braces in interpolated business content', () => {
    expect(
      formatMessage('{actor} registered {company} on {today}.', {
        actor: '{admin}',
        company: '{today}',
        today: '27 September 2026',
      }),
    ).toBe('{admin} registered {today} on 27 September 2026.');
  });

  it('reports a placeholder missing from the original template', () => {
    expect(() =>
      formatMessage('{actor} registered {company}.', { actor: 'Ada' }),
    ).toThrow('Missing value for translation placeholder: {company}');
  });
});
