import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { comparisonViewports } from '../src/design-lab/comparisonViewports';

const captureDirectory = fileURLToPath(
  new URL('../../../docs/design/captures/premium-editorial/', import.meta.url),
);

const representativeScreens = [
  'dashboard',
  'client-request',
  'analysis-review',
] as const;

function projectViewport(projectName: string) {
  return projectName === 'desktop'
    ? comparisonViewports.desktop
    : comparisonViewports.narrow;
}

async function expectUncroppedCaptureGeometry(
  page: Page,
  viewport: (typeof comparisonViewports)[keyof typeof comparisonViewports],
) {
  const geometry = await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    const shell = document.querySelector('.pe-shell');
    const wordmark = document.querySelector('.pe-wordmark > span');
    const dossierPage = document.querySelector('.pe-page');
    const title = document.querySelector('.pe-page h1');

    if (!shell || !wordmark || !dossierPage || !title) {
      throw new Error('Premium Editorial capture geometry is unavailable.');
    }

    const rectangle = (element: Element) => {
      const box = element.getBoundingClientRect();
      return {
        height: box.height,
        width: box.width,
        x: box.x,
        y: box.y,
      };
    };

    return {
      dossierPage: rectangle(dossierPage),
      innerWidth: window.innerWidth,
      paddingLeft: Number.parseFloat(getComputedStyle(dossierPage).paddingLeft),
      scrollWidth: document.documentElement.scrollWidth,
      scrollX: window.scrollX,
      shell: rectangle(shell),
      title: rectangle(title),
      wordmark: rectangle(wordmark),
      wordmarkText: wordmark.textContent,
    };
  });

  expect(geometry.wordmarkText).toBe('PRISMA');
  expect(geometry.shell.x).toBeGreaterThanOrEqual(0);
  expect(geometry.shell.width).toBeLessThanOrEqual(viewport.width);
  expect(geometry.wordmark.x).toBeGreaterThanOrEqual(15);
  expect(geometry.wordmark.x + geometry.wordmark.width).toBeLessThanOrEqual(
    viewport.width,
  );
  expect(geometry.dossierPage.x).toBeGreaterThanOrEqual(0);
  expect(geometry.paddingLeft).toBeGreaterThanOrEqual(16);
  expect(geometry.title.x).toBeGreaterThanOrEqual(
    geometry.dossierPage.x + geometry.paddingLeft - 1,
  );
  expect(geometry.scrollX).toBe(0);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.innerWidth);
}
test('Premium Editorial preserves the dossier through navigation', async ({
  page,
}) => {
  await page.goto('/design-lab/premium-editorial/dashboard');
  await expect(
    page.getByRole('heading', {
      name: 'Integrated ISO 22000 and IFS Food readiness programme',
    }),
  ).toBeVisible();
  await expect(
    page.getByText('Resolve the requested certification scope'),
  ).toBeVisible();
  await expect(
    page.getByRole('table', { name: 'Open action register' }),
  ).toBeVisible();

  await page.getByRole('link', { name: /Client Request/ }).click();
  await expect(page).toHaveURL(
    /\/design-lab\/premium-editorial\/client-request$/,
  );
  await expect(page.getByTestId('premium-editorial-source')).toHaveCount(3);
  await expect(
    page.getByText(/the current HACCP plan was not included/),
  ).toBeVisible();

  await page.getByRole('link', { name: /Analysis Review/ }).click();
  await expect(page).toHaveURL(
    /\/design-lab\/premium-editorial\/analysis-review$/,
  );
  await expect(page.getByTestId('premium-editorial-field')).toHaveCount(6);
  await expect(page.getByTestId('premium-editorial-field-status')).toHaveText([
    '✓ Confirmed',
    '✓ Confirmed',
    '≈ Inferred',
    '≈ Inferred',
    '— Missing',
    '↯ Contradictory',
  ]);
  await expect(page.getByText('10,000–15,000 tonnes')).toBeVisible();
  await expect(page.getByText('No supported value supplied')).toBeVisible();
  await expect(page.getByText('Original proposal: 180 people')).toBeVisible();
  await expect(
    page.getByText(
      'Annual tonnage and certification-site scope must be Confirmed.',
    ),
  ).toBeVisible();

  const firstAnnotation = page.getByText(/Open editorial notes/).first();
  await firstAnnotation.click();
  await expect(firstAnnotation.locator('..')).toHaveAttribute('open', '');
  await expect(page.getByText('ISO 22000:2018 readiness')).toBeVisible();
});

for (const screen of representativeScreens) {
  test(`captures an uncropped ${screen} chapter`, async ({
    page,
  }, testInfo) => {
    const viewport = projectViewport(testInfo.project.name);
    const viewportLabel = `${viewport.width}x${viewport.height}`;

    expect(page.viewportSize()).toEqual(viewport);
    await page.goto(`/design-lab/premium-editorial/${screen}`);
    await expect(
      page.getByRole('navigation', { name: 'Dossier chapters' }),
    ).toBeVisible();
    await expectUncroppedCaptureGeometry(page, viewport);

    await mkdir(captureDirectory, { recursive: true });
    await page.screenshot({
      animations: 'disabled',
      path: `${captureDirectory}/${screen}-${viewportLabel}.png`,
    });
  });
}
