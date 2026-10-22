import { expect, type Page } from '@playwright/test';
import {
  interfaceLocales,
  type InterfaceLocale,
} from '../src/localization/interface-locale';
import { interfaceLocaleMessages } from '../src/localization/interface-locale.copy';
import { resolveMessage } from '../src/localization/messages';

export async function chooseContractLocale(
  page: Page,
  current: InterfaceLocale,
  target: InterfaceLocale,
) {
  const label = (locale: InterfaceLocale) =>
    resolveMessage(interfaceLocaleMessages, locale, 'label');
  const picker = page.getByRole('combobox', {
    name: label(current),
    exact: true,
  });
  await picker.focus();
  await picker.press('Enter');
  await expect(page.getByRole('listbox')).toBeVisible();
  await picker.press('Home');
  for (let index = 0; index < interfaceLocales.indexOf(target); index += 1)
    await picker.press('ArrowDown');
  await picker.press('Enter');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(
    page.getByRole('combobox', { name: label(target), exact: true }),
  ).toBeFocused();
}
