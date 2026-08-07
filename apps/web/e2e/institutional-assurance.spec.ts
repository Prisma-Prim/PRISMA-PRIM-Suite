import { expect, test } from '@playwright/test';
import { comparisonViewports } from '../src/design-lab/comparisonViewports';

const conceptPath = '/design-lab/institutional-assurance';
const captureDirectory = '../../docs/design/captures/institutional-assurance';

function captureName(
  screen: 'dashboard' | 'client-request' | 'analysis-review',
  projectName: string,
) {
  const viewport =
    projectName === 'narrow'
      ? comparisonViewports.narrow
      : comparisonViewports.desktop;

  return `${captureDirectory}/${screen}-${viewport.width}x${viewport.height}.png`;
}

test('Institutional Assurance dashboard exposes accountable next work', async ({
  page,
}, testInfo) => {
  await page.goto(`${conceptPath}/dashboard`);

  await expect(
    page.getByRole('heading', { name: 'Assurance register' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: 'Integrated ISO 22000 and IFS Food readiness programme',
    }),
  ).toBeVisible();
  await expect(
    page.getByText('Resolve the requested certification scope'),
  ).toBeVisible();
  await expect(page.getByText('Human review required')).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    animations: 'disabled',
    path: captureName('dashboard', testInfo.project.name),
  });

  await page.getByRole('link', { name: 'Client Request' }).click();
  await expect(page).toHaveURL(`${conceptPath}/client-request`);
});

test('Institutional Assurance Client Request preserves the difficult source record', async ({
  page,
}, testInfo) => {
  await page.goto(`${conceptPath}/client-request`);

  await expect(
    page.getByRole('heading', { name: 'Client Request dossier' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: 'Certification programme brief — revision 2',
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/Turda is expected to provide warehousing evidence/),
  ).toBeVisible();
  await expect(page.getByText('Discovery call notes')).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    animations: 'disabled',
    path: captureName('client-request', testInfo.project.name),
  });

  await page.getByRole('link', { name: 'Analysis review' }).first().click();
  await expect(page).toHaveURL(`${conceptPath}/analysis-review`);
});

test('Institutional Assurance Analysis review separates proposal states from decisions', async ({
  page,
}, testInfo) => {
  await page.goto(`${conceptPath}/analysis-review`);

  await expect(
    page.getByRole('heading', { name: 'Analysis decision record' }),
  ).toBeVisible();
  await expect(page.getByText('AI proposal · not a decision')).toBeVisible();
  await expect(page.getByText('Pricing gate blocked')).toBeVisible();
  await expect(page.getByText('10,000–15,000 tonnes')).toBeVisible();

  const stateKey = page.getByRole('region', {
    name: 'Field assurance states',
  });
  for (const state of ['Confirmed', 'Inferred', 'Missing', 'Contradictory']) {
    await expect(stateKey.getByText(state, { exact: true })).toBeVisible();
  }

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    animations: 'disabled',
    path: captureName('analysis-review', testInfo.project.name),
  });

  const contradiction = page.getByRole('article', {
    name: 'Certification-site scope — Contradictory',
  });
  await contradiction.getByText('Inspect provenance · 2 sources').click();
  await expect(
    contradiction.getByText(
      'across both our Cluj production site and the Turda packing operation',
    ),
  ).toBeVisible();
  await expect(
    contradiction.getByText(
      'Turda ... is not presently listed as a certification site',
    ),
  ).toBeVisible();
  await expect(page.getByText('Originally proposed: 180 people')).toBeVisible();
});
