import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
  useInterfaceLocale,
} from './interface-locale';

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
