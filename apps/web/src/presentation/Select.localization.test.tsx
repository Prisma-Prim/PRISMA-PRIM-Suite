import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
} from '../localization/interface-locale';
import { Select } from './Select';

describe('Select localized generic copy', () => {
  beforeEach(() => {
    localStorage.setItem(interfaceLocaleStorageKey, 'fr');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    document.documentElement.lang = '';
  });

  it('localizes empty, unavailable and fallback copy through the shared locale seam', () => {
    const { rerender } = render(
      <InterfaceLocaleProvider>
        <Select
          id="localized-select"
          value=""
          options={[]}
          onValueChange={() => undefined}
        />
      </InterfaceLocaleProvider>,
    );
    const select = screen.getByRole('combobox');
    expect(select).toHaveTextContent('Sélectionnez une option');
    fireEvent.click(select);
    expect(screen.getByText('Aucune option disponible')).toBeInTheDocument();

    rerender(
      <InterfaceLocaleProvider>
        <Select
          id="localized-select"
          value="missing"
          options={[]}
          onValueChange={() => undefined}
        />
      </InterfaceLocaleProvider>,
    );
    expect(screen.getByRole('combobox')).toHaveTextContent(
      'Sélection indisponible',
    );
  });
});
