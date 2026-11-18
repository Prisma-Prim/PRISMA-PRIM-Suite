import type { Page, TestInfo } from '@playwright/test';
import { expect } from './ui-chaos.fixture';
import { selectOption } from './select-option';
import { resolveMessage } from '../src/localization/messages';
import { prismeMessages } from '../src/production-shell/prisme/prisme-localized.copy';
/** Real shell controls only; source records and observations remain native. */
export function commercialOwnerBrowser(
  page: Page,
  info: TestInfo,
  companies: { a: { id: string }; b: { id: string } },
  subject: string,
) {
  let locale: 'en' | 'ro' | 'ru' = 'en';
  async function drawer(open: boolean) {
    if (!info.project.name.endsWith('narrow')) return;
    const close = page.getByRole('button', {
      name: resolveMessage(prismeMessages, locale, 'closeNavigation'),
      exact: true,
    });
    if ((await close.isVisible()) !== open)
      await page.locator('.production-menu-button').click();
  }
  async function company(value: 'a' | 'b') {
    await drawer(true);
    const control = page
      .locator('.prisme-company-selector')
      .getByRole('combobox');
    await selectOption(control, { value: companies[value].id });
    await expect(control).toBeEnabled();
    await drawer(false);
  }
  async function navigate(hash: '#requests' | '#pricing' | '#overview') {
    await drawer(true);
    await page.locator(`nav ul a[href="${hash}"]`).click();
    await drawer(false);
  }
  async function openRequest() {
    await drawer(true);
    await page.locator('nav ul a[href="#requests"]').click();
    await drawer(false);
    const workspace = page.locator('.commercial-intake-workspace:visible');
    const detail = workspace.getByRole('article', {
      name: subject,
      exact: true,
    });
    if (!(await detail.isVisible()))
      await workspace
        .getByRole('button')
        .filter({ has: page.getByText(subject, { exact: true }) })
        .click();
    await expect(detail).toBeVisible();
  }
  async function language(value: 'ro' | 'ru') {
    await selectOption(page.locator('#interface-locale'), { value });
    locale = value;
  }
  async function open() {
    await company('a');
    await openRequest();
    await language(info.project.name.endsWith('narrow') ? 'ru' : 'ro');
  }
  return {
    open,
    company,
    openRequest,
    language,
    navigate,
    locale: () => locale,
  };
}
