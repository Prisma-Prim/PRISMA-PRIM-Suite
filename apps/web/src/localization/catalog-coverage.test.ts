import { describe, expect, it } from 'vitest';
import { assertClerkAuthenticationCoverage } from '../access/clerk-authentication.copy';
import { assertEveryLocalizedCatalogCovered } from '../test/localized-catalog-coverage';
import { interfaceLocales, type InterfaceLocale } from './interface-locale';
import { defineMessages } from './messages';

// Every `*.copy.ts` module under src is discovered here, so a catalog added
// later is covered without registering it anywhere. The modules are unparsed
// input: assertEveryLocalizedCatalogCovered checks each export's shape.
const copyModules = import.meta.glob('../**/*.copy.ts', { eager: true });

const keys = ['greeting', 'farewell'] as const;
const complete = {
  ro: { greeting: 'Bună', farewell: 'La revedere' },
  ru: { greeting: 'Здравствуйте', farewell: 'До свидания' },
  fr: { greeting: 'Bonjour', farewell: 'Au revoir' },
  en: { greeting: 'Hello', farewell: 'Goodbye' },
};

type Key = (typeof keys)[number];

/** A catalog that has every key in every locale except one value. */
function catalogMissing(locale: InterfaceLocale, omitted: Key) {
  const incomplete: Partial<Record<Key, string>> = { ...complete[locale] };
  delete incomplete[omitted];
  return defineMessages(keys, { ...complete, [locale]: incomplete });
}

describe('localized catalog release coverage', () => {
  it('covers every discovered catalog, including those never registered by hand', () => {
    const covered = assertEveryLocalizedCatalogCovered(copyModules);

    expect(covered).toContain(
      'client/client-union-confirmation.copy.ts#clientUnionConfirmationMessages',
    );
    expect(covered).toContain(
      'internal-task/internal-task.copy.ts#internalTaskMessages',
    );
    expect(covered).toContain(
      'payment-evidence/payment-evidence.copy.ts#paymentEvidenceMessages',
    );
    expect(covered).toContain(
      'contract-model/contract-model.copy.ts#contractModelMessages',
    );
  });

  it('keeps the Clerk authentication token and empty-value checks', () => {
    expect(() => assertClerkAuthenticationCoverage()).not.toThrow();
  });

  for (const locale of interfaceLocales) {
    it(`fails naming the module, locale and key when ${locale} lacks a key`, () => {
      expect(() =>
        assertEveryLocalizedCatalogCovered({
          '../example/example.copy.ts': {
            exampleMessages: catalogMissing(locale, 'farewell'),
          },
        }),
      ).toThrow(
        `Missing translation: example/example.copy.ts#exampleMessages.${locale}.farewell`,
      );
    });
  }

  it('fails for an incomplete catalog even when other modules are complete', () => {
    expect(() =>
      assertEveryLocalizedCatalogCovered({
        '../complete/complete.copy.ts': {
          completeMessages: defineMessages(keys, complete),
        },
        '../example/example.copy.ts': {
          exampleMessages: catalogMissing('fr', 'greeting'),
        },
      }),
    ).toThrow(
      'Missing translation: example/example.copy.ts#exampleMessages.fr.greeting',
    );
  });

  it('checks every catalog exported by one module and ignores other exports', () => {
    const covered = assertEveryLocalizedCatalogCovered({
      '../example/example.copy.ts': {
        firstMessages: defineMessages(keys, complete),
        secondMessages: defineMessages(keys, complete),
        labels: { greeting: 'Hello' },
        useExampleCopy: () => 'not a catalog',
      },
    });

    expect(covered).toEqual([
      'example/example.copy.ts#firstMessages',
      'example/example.copy.ts#secondMessages',
    ]);
    expect(() =>
      assertEveryLocalizedCatalogCovered({
        '../example/example.copy.ts': {
          firstMessages: defineMessages(keys, complete),
          secondMessages: catalogMissing('ru', 'greeting'),
        },
      }),
    ).toThrow(
      'Missing translation: example/example.copy.ts#secondMessages.ru.greeting',
    );
  });

  it('refuses a catalog whose shape cannot be checked instead of skipping it', () => {
    expect(() =>
      assertEveryLocalizedCatalogCovered({
        '../example/example.copy.ts': {
          brokenMessages: { keys, translations: { ro: complete.ro } },
        },
      }),
    ).toThrow(
      'Malformed message catalog: example/example.copy.ts#brokenMessages',
    );
  });
});
