import { describe, expect, it } from 'vitest';
import { assertClerkAuthenticationCoverage } from '../access/clerk-authentication.copy';
import {
  assertEveryCatalogDefinitionReachable,
  assertEveryLocalizedCatalogCovered,
} from '../test/localized-catalog-coverage';
import { interfaceLocales, type InterfaceLocale } from './interface-locale';
import { defineMessages } from './messages';

// Every `*.copy.ts` module under src is discovered here, so a catalog added
// later is covered without registering it anywhere. The modules are unparsed
// input: assertEveryLocalizedCatalogCovered checks each export's shape.
const copyModules = import.meta.glob('../**/*.copy.ts', { eager: true });
// The same files as text, to find catalogs defined but not exported.
const copySources = import.meta.glob('../**/*.copy.ts', {
  eager: true,
  query: '?raw',
  import: 'default',
});

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
    expect(covered).toContain('project/team-tasks.copy.ts#teamTasksMessages');
  });

  it('reaches every catalog that a .copy.ts file defines', () => {
    expect(() =>
      assertEveryCatalogDefinitionReachable({
        modules: copyModules,
        sources: copySources,
      }),
    ).not.toThrow();
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

  describe('catalog definitions the export scan cannot see', () => {
    const exported = {
      '../example/example.copy.ts': {
        exampleMessages: defineMessages(keys, complete),
      },
    };
    const exportedSource = {
      '../example/example.copy.ts':
        'export const exampleMessages = defineMessages(keys, {});',
    };

    it('accepts a defined catalog that its module exports', () => {
      expect(() =>
        assertEveryCatalogDefinitionReachable({
          modules: exported,
          sources: exportedSource,
        }),
      ).not.toThrow();
    });

    it('fails naming the file when a module keeps its catalog private', () => {
      expect(() =>
        assertEveryCatalogDefinitionReachable({
          modules: {
            '../example/example.copy.ts': { useExampleCopy: () => '' },
          },
          sources: {
            '../example/example.copy.ts': [
              'const messages = defineMessages(keys, {});',
              'export const useExampleCopy = () => messages;',
            ].join('\n'),
          },
        }),
      ).toThrow(
        'Unchecked message catalog: example/example.copy.ts defines 1 catalog(s) with defineMessages but exports 0. Export each catalog so the release check can reach it.',
      );
    });

    it('counts a typed call and every catalog of a module', () => {
      expect(() =>
        assertEveryCatalogDefinitionReachable({
          modules: exported,
          sources: {
            '../example/example.copy.ts': [
              "export const exampleMessages = defineMessages<'greeting'>(keys, {});",
              'const second = defineMessages(keys, {});',
            ].join('\n'),
          },
        }),
      ).toThrow('defines 2 catalog(s) with defineMessages but exports 1');
    });

    it('accepts a module that only re-exports a catalog', () => {
      expect(() =>
        assertEveryCatalogDefinitionReachable({
          modules: exported,
          sources: {
            '../example/example.copy.ts':
              "export { exampleMessages } from './example-localized.copy';",
          },
        }),
      ).not.toThrow();
    });

    it('fails when a source has no module to inspect', () => {
      expect(() =>
        assertEveryCatalogDefinitionReachable({
          modules: {},
          sources: exportedSource,
        }),
      ).toThrow('Missing module for source: example/example.copy.ts');
    });
  });
});
