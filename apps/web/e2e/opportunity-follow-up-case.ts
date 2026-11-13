import { expect, type Locator } from '@playwright/test';

export async function activate(control: Locator) {
  await expect(control).toBeEnabled();
  await control.scrollIntoViewIfNeeded();
  await control.focus();
  await expect(control).toBeFocused();
  await control.press('Enter');
}
export async function openRequestCase(
  intake: Locator,
  target: { subject: string; originalText: string },
) {
  await expect(intake.locator('.commercial-intake-list')).toBeVisible();
  const row = intake
    .locator('.commercial-intake-list > li')
    .filter({ hasText: target.subject });
  const older = intake.getByRole('button', {
    name: 'Show older Requests',
    exact: true,
    disabled: false,
  });
  // A row can be attached before it is visible. Counting it as progress
  // and then waiting only for the next page leaves the case unopened
  // when that page button is not there (#1243).
  while (!(await row.isVisible())) {
    await waitForRequestPage(row, older);
    if (await row.isVisible()) break;
    await activate(older);
  }
  await activate(row.getByRole('button').first());
  await expect(
    intake.getByRole('article', { name: target.subject, exact: true }),
  ).toBeVisible();
  await expect(
    intake.getByText(target.originalText, { exact: true }),
  ).toBeVisible();
}

/** Wait for the row or visibility of a continuation query filtered to enabled buttons. */
export async function waitForRequestPage(row: Locator, enabledOlder: Locator) {
  // The caller's role selector and this visibility query share one browser
  // observation. isVisible returns immediately when the final page removes
  // the control; isEnabled would wait for a node that never returns.
  await expect
    .poll(async () => {
      if (await row.isVisible()) return 'row';
      return (await enabledOlder.isVisible()) ? 'older' : 'waiting';
    })
    .not.toBe('waiting');
}
