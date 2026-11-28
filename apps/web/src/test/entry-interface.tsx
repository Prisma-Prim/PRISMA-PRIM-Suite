import { fireEvent, screen } from '@testing-library/react';
import { expect } from 'vitest';
import {
  interfacePreferenceStorageKey,
  type InterfacePreference,
} from '../clarte/interface-preference';

/**
 * Stores the tester choice as an opt-in does, for tests that render
 * `ApplicationRoot`, whose own preference provider reads it. App-level tests
 * use `renderInInterface` instead.
 */
export function storeInterfacePreference(
  appInterface: InterfacePreference,
): void {
  if (appInterface === 'clarte')
    localStorage.setItem(interfacePreferenceStorageKey, 'clarte');
  else localStorage.removeItem(interfacePreferenceStorageKey);
}

const languageControlName =
  /^(Limba interfeței|Язык интерфейса|Langue de l’interface|Interface language)$/u;

export type InterfaceLanguageName =
  'Română' | 'Русский' | 'Français' | 'English';

/**
 * Asserts which interface draws an entry screen: Clarté draws a light page
 * outside the frame that offers the four languages itself; the current
 * interface never mounts Clarté.
 */
export function expectEntryInterface(appInterface: InterfacePreference): void {
  if (appInterface === 'clarte') {
    expect(document.querySelector('main.clarte-page')).not.toBeNull();
    expect(
      screen.getByRole('group', { name: languageControlName }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: languageControlName }),
    ).not.toBeInTheDocument();
    return;
  }
  expect(document.querySelector('.clarte-frame')).toBeNull();
}

/**
 * Chooses the interface language on an entry screen rendered by
 * `ApplicationRoot`: the floating selector, or Clarté's four choices.
 */
export function chooseEntryLanguage(
  appInterface: InterfacePreference,
  language: InterfaceLanguageName,
): void {
  if (appInterface === 'clarte') {
    fireEvent.click(screen.getByRole('radio', { name: language }));
    return;
  }
  fireEvent.click(screen.getByRole('combobox', { name: languageControlName }));
  fireEvent.click(screen.getByRole('option', { name: language }));
}
