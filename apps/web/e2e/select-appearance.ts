import { expect, test, type Locator } from '@playwright/test';

/** Checks the real field in its feature layout, including inherited action CSS. */
export async function expectSelectAppearance(select: Locator): Promise<void> {
  const trigger = select.and(select.page().getByRole('combobox'));
  await expect(trigger).toBeVisible();
  await expect(trigger).toBeEnabled();
  const layout = await trigger.evaluate((element) => {
    const field = element.closest('.shared-select');
    if (!field) throw new Error('Expected a shared Select field');
    return {
      fieldWidth: field.getBoundingClientRect().width,
      triggerWidth: element.getBoundingClientRect().width,
      rootFontSize: Number.parseFloat(
        getComputedStyle(document.documentElement).fontSize,
      ),
      narrow: window.innerWidth <= 520,
      ink: getComputedStyle(field).color,
    };
  });
  expect(Math.abs(layout.triggerWidth - layout.fieldWidth)).toBeLessThan(1);
  await expect(trigger).toHaveCSS('display', 'grid');
  await expect(trigger).toHaveCSS(
    'min-height',
    `${layout.rootFontSize * (layout.narrow ? 3 : 2.75)}px`,
  );
  await expect(trigger).toHaveCSS(
    'padding-top',
    `${layout.rootFontSize * 0.65}px`,
  );
  await expect(trigger).toHaveCSS(
    'padding-right',
    `${layout.rootFontSize * 0.75}px`,
  );
  await expect(trigger).toHaveCSS(
    'padding-left',
    `${layout.rootFontSize * 0.85}px`,
  );
  await expect(trigger).toHaveCSS('border-top-width', '1px');
  await expect(trigger).toHaveCSS(
    'border-top-left-radius',
    `${layout.rootFontSize * 0.65}px`,
  );
  await expect(trigger).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(trigger).toHaveCSS('color', layout.ink);

  // A harmless key makes keyboard focus visible without opening or choosing.
  await trigger.focus();
  await trigger.press('ArrowLeft');
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveCSS('outline-style', 'solid');
  await expect(trigger).toHaveCSS('outline-width', '3px');
  await expect(trigger).toHaveCSS('outline-offset', '2px');
  const id = (await trigger.getAttribute('id'))?.replace(/[^a-z0-9-]/giu, '-');
  if (!id) throw new Error('Expected a labelled Select with an id');
  await trigger.screenshot({
    path: test.info().outputPath(`select-appearance-${id}.png`),
  });
}
