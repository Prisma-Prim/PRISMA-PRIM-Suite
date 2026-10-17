import { expect, test } from '@playwright/test';
import { unionLocators } from './locator-union';

test('detects a later matching predicate without escaping its original scope', async ({
  page,
}) => {
  await page.setContent(`
    <section id="activity">
      <p>Public event</p>
      <p>SECOND\n    secret</p>
    </section>
    <p>first secret outside the Activity scope</p>
  `);
  const content = page.locator('#activity > p');
  await expect(content).toHaveCount(2);
  const matches = unionLocators([
    content.filter({ hasText: 'first secret' }),
    content.filter({ hasText: 'second secret' }),
    content.filter({ hasText: 'second secret' }),
  ]);
  await expect(matches).toHaveCount(1);

  await content.first().evaluate((element) => {
    element.textContent = 'FIRST secret and second secret';
  });
  // A row matching multiple predicates is still one matching row.
  await expect(matches).toHaveCount(2);
  await content.nth(1).evaluate((element) => {
    element.setAttribute('hidden', '');
  });
  await expect(matches).toHaveCount(2);
  await content.evaluateAll((elements) => {
    for (const element of elements) element.textContent = 'Public event';
  });
  await expect(matches).toHaveCount(0);
});

test('rejects an empty union rather than omitting its checks', () => {
  expect(() => unionLocators([])).toThrow('At least one locator');
});
