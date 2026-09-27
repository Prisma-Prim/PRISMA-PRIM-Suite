import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { formatApplicationDateTime } from '../presentation/date-time';
import {
  InterfaceLocaleProvider,
  interfaceLocales,
  interfaceLocaleStorageKey,
  type InterfaceLocale,
  useInterfaceLocale,
} from './interface-locale';

const localizedTimestamps = [
  { locale: 'ro', expected: /27 ian\. 2026/u },
  { locale: 'ru', expected: /27 янв\. 2026/u },
  { locale: 'fr', expected: /27 janv\. 2026/u },
  { locale: 'en', expected: /Jan 27, 2026/u },
] satisfies ReadonlyArray<{
  locale: InterfaceLocale;
  expected: RegExp;
}>;

describe('interface locale formatting', () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.lang = '';
  });

  it('formats owned dates and numbers in Romanian without changing their values', () => {
    localStorage.setItem(interfaceLocaleStorageKey, 'ro');
    render(
      <InterfaceLocaleProvider>
        <FormattingProbe />
      </InterfaceLocaleProvider>,
    );

    expect(screen.getByTestId('date')).toHaveTextContent('27 sept. 2026');
    expect(screen.getByTestId('number')).toHaveTextContent('1.234.567');
    expect(screen.getByTestId('date')).toHaveAttribute(
      'data-canonical',
      '2026-09-27',
    );
    expect(screen.getByTestId('number')).toHaveAttribute(
      'data-canonical',
      '1234567',
    );
  });

  it.each(localizedTimestamps)(
    'starts an already loaded $locale timestamp in the resolved locale',
    ({ locale, expected }) => {
      if (locale !== 'ro')
        localStorage.setItem(interfaceLocaleStorageKey, locale);
      document.documentElement.lang = locale === 'en' ? 'fr' : 'en';

      render(
        <InterfaceLocaleProvider>
          <LoadedTimestampProbe />
        </InterfaceLocaleProvider>,
      );

      expect(document.documentElement.lang).toBe(locale);
      expect(screen.getByTestId('loaded-timestamp')).toHaveTextContent(
        expected,
      );
    },
  );

  it('updates an already loaded timestamp with each explicit locale choice', () => {
    localStorage.setItem(interfaceLocaleStorageKey, 'en');
    document.documentElement.lang = 'en';
    render(
      <InterfaceLocaleProvider>
        <LoadedTimestampProbe />
      </InterfaceLocaleProvider>,
    );

    for (const choice of localizedTimestamps) {
      fireEvent.click(
        screen.getByRole('button', { name: `Use ${choice.locale}` }),
      );
      expect(document.documentElement.lang).toBe(choice.locale);
      expect(screen.getByTestId('loaded-timestamp')).toHaveTextContent(
        choice.expected,
      );
    }
  });
});

function FormattingProbe() {
  const { formatDate, formatNumber } = useInterfaceLocale();
  return (
    <>
      <span data-testid="date" data-canonical="2026-09-27">
        {formatDate('2026-09-27')}
      </span>
      <span data-testid="number" data-canonical="1234567">
        {formatNumber(1_234_567)}
      </span>
    </>
  );
}

function LoadedTimestampProbe() {
  const { changeLocale } = useInterfaceLocale();
  return (
    <>
      {interfaceLocales.map((locale) => (
        <button key={locale} type="button" onClick={() => changeLocale(locale)}>
          Use {locale}
        </button>
      ))}
      <time data-testid="loaded-timestamp" dateTime="2026-01-27T12:00:00.000Z">
        {formatApplicationDateTime('2026-01-27T12:00:00.000Z')}
      </time>
    </>
  );
}
