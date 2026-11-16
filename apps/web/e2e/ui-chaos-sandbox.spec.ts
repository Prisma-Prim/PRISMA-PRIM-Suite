import { expect, test } from '@playwright/test';
import { startChaos } from './ui-chaos.fixture';

test.use({ trace: 'on' });

test('keeps a traced scriptless sandbox preview while retaining its script prohibition', async ({
  page,
}, info) => {
  const chaos = await startChaos(page, info, 1431);
  try {
    await page.setContent(
      '<iframe title="Synthetic preview" sandbox="" srcdoc="<html><body><p>Scriptless conserved content</p></body></html>"></iframe>',
    );
    await expect(
      page.frameLocator('iframe').getByText('Scriptless conserved content'),
    ).toBeVisible();
    await expect(page.locator('iframe')).toHaveAttribute('sandbox', '');
    await chaos.finish({ check: true });
  } finally {
    await chaos.dispose();
  }
});

test('still fails when a sandbox preview actually contains an inline script', async ({
  page,
}, info) => {
  const chaos = await startChaos(page, info, 1431);
  try {
    await page.setContent(
      '<iframe title="Synthetic forbidden script" sandbox="" srcdoc="<html><body><p>Unchanged content</p><script>document.body.dataset.executed = &quot;yes&quot;;</script></body></html>"></iframe>',
    );
    await expect(
      page.frameLocator('iframe').getByText('Unchanged content'),
    ).toBeVisible();
    expect(
      await page
        .frameLocator('iframe')
        .locator('body')
        .getAttribute('data-executed'),
    ).toBeNull();
    await expect(chaos.finish({ check: true })).rejects.toThrow(
      'Blocked script execution',
    );
  } finally {
    await chaos.dispose();
  }
});

test('still fails on an ordinary unexpected console error beside a safe sandbox preview', async ({
  page,
}, info) => {
  const chaos = await startChaos(page, info, 1431);
  try {
    await page.setContent(
      '<iframe title="Synthetic preview" sandbox="" srcdoc="<html><body><p>Scriptless conserved content</p></body></html>"></iframe>',
    );
    await expect(
      page.frameLocator('iframe').getByText('Scriptless conserved content'),
    ).toBeVisible();
    await page.evaluate(() =>
      console.error('Unexpected synthetic application error'),
    );
    await expect(chaos.finish({ check: true })).rejects.toThrow(
      'Unexpected synthetic application error',
    );
  } finally {
    await chaos.dispose();
  }
});

test('still fails when application code imitates the Chromium sandbox diagnostic', async ({
  page,
}, info) => {
  const chaos = await startChaos(page, info, 1431);
  try {
    await page.setContent(
      '<iframe title="Synthetic preview" sandbox="" srcdoc="<html><body><p>Scriptless conserved content</p></body></html>"></iframe>',
    );
    await expect(
      page.frameLocator('iframe').getByText('Scriptless conserved content'),
    ).toBeVisible();
    await page.evaluate(() =>
      console.error(
        "Blocked script execution in 'about:srcdoc' because the document's frame is sandboxed and the 'allow-scripts' permission is not set.",
      ),
    );
    await expect(chaos.finish({ check: true })).rejects.toThrow(
      'Blocked script execution',
    );
  } finally {
    await chaos.dispose();
  }
});

test('keeps traced scriptless previews after a multiline source is replaced', async ({
  page,
}, info) => {
  const chaos = await startChaos(page, info, 1431);
  try {
    for (const version of [1, 2, 3]) {
      await page.setContent(`<iframe title="Multiline synthetic preview" sandbox="" srcdoc="
<html><body><p>Scriptless source ${version}</p></body></html>"></iframe>`);
      await expect(
        page
          .frameLocator('iframe')
          .getByText(`Scriptless source ${version}`, { exact: true }),
      ).toBeVisible();
      expect(
        await page.frameLocator('iframe').locator('body').textContent(),
      ).toBe(`Scriptless source ${version}`);
      await expect(page.locator('iframe')).toHaveAttribute('sandbox', '');
    }
    await chaos.finish({ check: true });
  } finally {
    await chaos.dispose();
  }
});

test('still fails on a real script after a multiline srcdoc prefix', async ({
  page,
}, info) => {
  const chaos = await startChaos(page, info, 1431);
  try {
    await page.setContent(`<iframe title="Multiline forbidden script" sandbox="" srcdoc="
<html><body><p>Unchanged source</p><script>document.body.dataset.executed = &quot;yes&quot;;</script></body></html>"></iframe>`);
    await expect(
      page
        .frameLocator('iframe')
        .getByText('Unchanged source', { exact: true }),
    ).toBeVisible();
    expect(
      await page
        .frameLocator('iframe')
        .locator('body')
        .getAttribute('data-executed'),
    ).toBeNull();
    await expect(chaos.finish({ check: true })).rejects.toThrow(
      'Blocked script execution',
    );
  } finally {
    await chaos.dispose();
  }
});

test('retains a real sandbox script error after its source is replaced with inert markup', async ({
  page,
}, info) => {
  const chaos = await startChaos(page, info, 1431);
  try {
    await page.setContent(
      '<iframe title="Forbidden transient source" sandbox="" srcdoc="<html><body><p>Unsafe original</p><script>document.body.dataset.executed = &quot;yes&quot;;</script></body></html>"></iframe>',
    );
    await expect(
      page.frameLocator('iframe').getByText('Unsafe original'),
    ).toBeVisible();
    await page.setContent(
      '<iframe title="Inert replacement" sandbox="" srcdoc="<html><body><p>Safe replacement</p></body></html>"></iframe>',
    );
    await expect(
      page.frameLocator('iframe').getByText('Safe replacement'),
    ).toBeVisible();
    await expect(chaos.finish({ check: true })).rejects.toThrow(
      'Blocked script execution',
    );
  } finally {
    await chaos.dispose();
  }
});

test('keeps traced scriptless preview evidence across a real document navigation', async ({
  page,
}, info) => {
  const chaos = await startChaos(page, info, 1431);
  try {
    await page.goto(
      'data:text/html,' +
        encodeURIComponent(
          '<iframe title="Navigated preview" sandbox="" srcdoc="<html><body><p>Safe navigated source</p></body></html>"></iframe>',
        ),
    );
    await expect(
      page.frameLocator('iframe').getByText('Safe navigated source'),
    ).toBeVisible();
    await chaos.finish({ check: true });
  } finally {
    await chaos.dispose();
  }
});
