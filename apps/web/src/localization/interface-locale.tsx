import {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
  type ReactNode,
} from 'react';

export const defaultInterfaceLocale: InterfaceLocale = 'ro';
export const interfaceLocaleStorageKey = 'prisma-prim.interface-locale';
export const interfaceLocales = ['ro', 'ru', 'fr', 'en'] as const;
export type InterfaceLocale = (typeof interfaceLocales)[number];

type InterfaceLocaleContextValue = Readonly<{
  locale: InterfaceLocale;
  changeLocale: (locale: InterfaceLocale) => void;
  formatDate: (value: string | Date) => string;
  formatDateTime: (value: string | Date) => string;
  formatNumber: (value: number) => string;
}>;

function languageTag(locale: InterfaceLocale): string {
  switch (locale) {
    case 'ro':
      return 'ro';
    case 'ru':
      return 'ru';
    case 'fr':
      return 'fr';
    case 'en':
      return 'en';
    default: {
      const exhaustive: never = locale;
      return exhaustive;
    }
  }
}

function formatDate(locale: InterfaceLocale, value: string | Date): string {
  return new Intl.DateTimeFormat(languageTag(locale), {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(value));
}

function formatDateTime(locale: InterfaceLocale, value: string | Date): string {
  return new Intl.DateTimeFormat(languageTag(locale), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatNumber(locale: InterfaceLocale, value: number): string {
  return new Intl.NumberFormat(languageTag(locale)).format(value);
}

const InterfaceLocaleContext = createContext<InterfaceLocaleContextValue>({
  locale: defaultInterfaceLocale,
  changeLocale: () => undefined,
  formatDate: (value) => formatDate(defaultInterfaceLocale, value),
  formatDateTime: (value) => formatDateTime(defaultInterfaceLocale, value),
  formatNumber: (value) => formatNumber(defaultInterfaceLocale, value),
});

export function isInterfaceLocale(value: unknown): value is InterfaceLocale {
  return interfaceLocales.some((locale) => locale === value);
}

function readInterfaceLocale(): InterfaceLocale {
  try {
    const stored: unknown = window.localStorage.getItem(
      interfaceLocaleStorageKey,
    );
    return isInterfaceLocale(stored) ? stored : defaultInterfaceLocale;
  } catch {
    return defaultInterfaceLocale;
  }
}

function persistInterfaceLocale(locale: InterfaceLocale): void {
  try {
    window.localStorage.setItem(interfaceLocaleStorageKey, locale);
  } catch {
    // The in-memory choice remains usable when browser storage is unavailable.
  }
}

function synchronizeDocumentLocale(locale: InterfaceLocale): void {
  document.documentElement.lang = languageTag(locale);
}

function initializeInterfaceLocale(): InterfaceLocale {
  const locale = readInterfaceLocale();
  synchronizeDocumentLocale(locale);
  return locale;
}

export function InterfaceLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState(initializeInterfaceLocale);

  useLayoutEffect(() => {
    synchronizeDocumentLocale(locale);
  }, [locale]);

  function changeLocale(nextLocale: InterfaceLocale): void {
    synchronizeDocumentLocale(nextLocale);
    setLocale(nextLocale);
    persistInterfaceLocale(nextLocale);
  }

  return (
    <InterfaceLocaleContext
      value={{
        locale,
        changeLocale,
        formatDate: (value) => formatDate(locale, value),
        formatDateTime: (value) => formatDateTime(locale, value),
        formatNumber: (value) => formatNumber(locale, value),
      }}
    >
      {children}
    </InterfaceLocaleContext>
  );
}

export function useInterfaceLocale(): InterfaceLocaleContextValue {
  return useContext(InterfaceLocaleContext);
}
