import {
  interfaceLocales,
  useInterfaceLocale,
  type InterfaceLocale,
} from './interface-locale';

export type MessageCatalog<Key extends string> = Readonly<{
  keys: readonly Key[];
  translations: Readonly<
    Record<InterfaceLocale, Readonly<Partial<Record<Key, string>>>>
  >;
}>;

export function defineMessages<Key extends string>(
  keys: readonly Key[],
  translations: MessageCatalog<Key>['translations'],
): MessageCatalog<Key> {
  return { keys, translations };
}

export function resolveMessage<Key extends string>(
  catalog: MessageCatalog<Key>,
  locale: InterfaceLocale,
  key: Key,
): string {
  const fallback = catalog.translations.ro[key];
  if (fallback === undefined)
    throw new Error(`Missing Romanian fallback for translation key: ${key}`);
  return catalog.translations[locale][key] ?? fallback;
}

export function useMessages<Key extends string>(
  catalog: MessageCatalog<Key>,
): (key: Key) => string {
  const { locale } = useInterfaceLocale();
  return (key) => resolveMessage(catalog, locale, key);
}

export function assertMessageCoverage<Key extends string>(
  name: string,
  catalog: MessageCatalog<Key>,
): void {
  for (const locale of interfaceLocales) {
    for (const key of catalog.keys) {
      if (catalog.translations[locale][key] === undefined)
        throw new Error(`Missing translation: ${name}.${locale}.${key}`);
    }
  }
}

export function formatMessage(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{[a-zA-Z][a-zA-Z0-9]*\}/gu, (placeholder) => {
    const name = placeholder.slice(1, -1);
    const value = values[name];
    if (value === undefined)
      throw new Error(
        `Missing value for translation placeholder: ${placeholder}`,
      );
    return String(value);
  });
}
