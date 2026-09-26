import { expect, type Locator } from '@playwright/test';

type SelectOptionChoice =
  | string
  | Readonly<{ label: string }>
  | Readonly<{ value: string }>
  | Readonly<{ index: number }>;

/** Chooses through the visible custom listbox, preserving real user interaction. */
export async function selectOption(
  select: Locator,
  choice: SelectOptionChoice,
): Promise<void> {
  await select.click();
  const listbox = select.page().getByRole('listbox');
  await listbox.waitFor({ state: 'visible' });
  const options = listbox.getByRole('option');

  if (typeof choice === 'object' && 'label' in choice) {
    await listbox
      .getByRole('option', { name: choice.label, exact: true })
      .click();
    return;
  }
  if (typeof choice === 'object' && 'index' in choice) {
    await options.nth(choice.index).click();
    return;
  }
  const value = typeof choice === 'string' ? choice : choice.value;
  const optionCount = await options.count();
  for (let index = 0; index < optionCount; index += 1) {
    const option = options.nth(index);
    if ((await option.getAttribute('data-value')) === value) {
      await option.click();
      return;
    }
  }
  throw new Error(`Select option value not found: ${value}`);
}

/** Keeps value assertions meaningful for native fields and custom Selects. */
export async function expectValue(
  control: Locator,
  expected: string | RegExp,
): Promise<void> {
  if ((await control.getAttribute('role')) === 'combobox') {
    await expect(control).toHaveAttribute('data-value', expected);
    return;
  }
  await expect(control).toHaveValue(expected);
}
