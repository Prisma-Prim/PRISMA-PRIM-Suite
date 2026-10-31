import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
  compactPdfText,
  inspectCommercialPdf,
} from '../../api/src/commercial-pdf/pdf-inspection.test-support.mjs';
import {
  prepareModelContractCase,
  modelContractIdentities,
  object,
  text,
} from './model-contract.acceptance.fixture';
import { selectOption } from './select-option';

test('downloads complete real current and historical illustrative v1 PDFs in the registered App', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  const narrow = info.project.name.endsWith('narrow');
  const ready = await prepareModelContractCase(
    page,
    `ILLPDF1005-${narrow ? 'N' : 'D'}`,
  );
  for (const bundle of [
    'company-service-catalogue',
    'company-pricing-configuration',
    'company-pricing-user',
  ])
    await ready.command(`/${bundle}-assignments`, {
      companyId: ready.companyId,
      workspaceMembershipId: ready.preparerId,
    });
  const subject = `Illustrative PDF exact source ${narrow ? 'narrow' : 'desktop'}`;
  const command = (path: string, body: unknown) =>
    ready.command(
      path,
      body,
      modelContractIdentities.preparer,
      ready.companyId,
    );
  const request = await command('/commercial-intake/requests', {
    clientAccountId: ready.clientId,
    subject,
    originalText: 'Synthetic exact illustrative PDF source.',
    opportunity: {
      title: subject,
      nextAction: 'Read the exact non-official copy',
    },
  });
  const opportunityId = text(object(request.initialOpportunity).id);
  const clockFile = process.env.ACCEPTANCE_CLOCK_OFFSET_FILE;
  if (!clockFile) throw new Error('Synthetic acceptance clock is required.');
  const offset: unknown = JSON.parse(await readFile(clockFile, 'utf8'));
  if (typeof offset !== 'number' || !Number.isSafeInteger(offset))
    throw new Error('Invalid synthetic clock.');
  const effectiveFrom = new Date(Date.now() + offset + 60_000).toISOString();
  await command('/pricing-configuration/rule-versions', {
    label: 'Synthetic exact PDF rule',
    effectiveFrom,
    expectedActiveVersionNumber: null,
  });
  const definition = object(
    (
      await command('/commercial-catalogue/service-definitions', {
        code: `ILL-PDF-${narrow ? 'N' : 'D'}`,
        name: 'Seven-column service Șț Русский Français a\u0306 e\u0301 ☀️',
        description: null,
      })
    ).definition,
  );
  const offering = object(
    (
      await command('/commercial-catalogue/offerings', {
        serviceDefinitionId: definition.id,
        commercialLabel: null,
      })
    ).offering,
  );
  await command(
    `/pricing-configuration/offerings/${text(offering.id)}/tariff-versions`,
    {
      unit: 'day',
      unitAmount: '100.00',
      currency: 'EUR',
      taxRatePercent: '20.00',
      taxLabel: 'Synthetic declared tax',
      effectiveFrom,
      expectedActiveVersionNumber: null,
    },
  );
  await writeFile(clockFile, JSON.stringify(offset + 120_000));
  try {
    const snapshot = await command(
      `/pricing/opportunities/${opportunityId}/snapshots`,
      {
        pricingRuleVersionNumber: 1,
        lines: [
          { offeringId: offering.id, tariffVersionNumber: 1, quantity: '1' },
        ],
      },
    );
    const path = `/offers/opportunities/${opportunityId}`;
    const intent = {
      pricingSnapshotId: snapshot.id,
      recipient: { kind: 'PRIMARY' },
      scopeNote: 'Exact  scope\twith\r\n\nblank lines',
      commercialConditions: '<script>literal &amp; once</script>',
    };
    const first = await command(path, intent);
    const firstVersion = object(first.version);
    const firstExact = `${path}/versions/${text(firstVersion.id)}`;
    const firstBefore = await ready.read(firstExact, ready.companyId);
    await page.route('**/api/**', (route) =>
      route.fallback({
        headers: {
          ...route.request().headers(),
          ...modelContractIdentities.preparer,
        },
      }),
    );
    async function open() {
      await page.goto('/');
      if (narrow)
        await page.getByRole('button', { name: 'Open navigation' }).click();
      await selectOption(page.getByLabel('Active Company', { exact: true }), {
        label: ready.companyName,
      });
      if (narrow)
        await page.getByRole('button', { name: 'Close navigation' }).click();
      if (narrow)
        await page.getByRole('button', { name: 'Open navigation' }).click();
      await page
        .getByRole('navigation', { name: 'Primary navigation' })
        .getByRole('link', { name: 'Client Requests', exact: true })
        .click();
      const workspace = page.locator('.commercial-intake-workspace');
      await workspace
        .getByRole('button')
        .filter({ has: page.getByText(subject, { exact: true }) })
        .click();
      await expect(
        workspace.getByRole('article', { name: subject, exact: true }),
      ).toBeVisible();
    }
    await open();
    await actualDownload(page, info, first, 'current');
    expect(await ready.read(firstExact, ready.companyId)).toEqual(firstBefore);
    await page.waitForLoadState('networkidle');
    let reads = 0;
    const count = (request: { url(): string }) => {
      if (request.url().includes('/api/')) reads += 1;
    };
    page.on('request', count);
    if (narrow)
      await page.getByRole('button', { name: 'Open navigation' }).click();
    const language = page.getByRole('combobox', {
      name: /^(?:Interface language|Limba interfeței|Язык интерфейса|Langue de l’interface)$/u,
    });
    const beforeLocale = reads;
    for (const value of ['ro', 'ru', 'fr', 'en'])
      await selectOption(language, { value });
    expect(reads).toBe(beforeLocale);
    if (narrow)
      await page.getByRole('button', { name: 'Close navigation' }).click();
    page.off('request', count);
    await command(path + '/versions', {
      ...intent,
      expectedOfferRevision: 1,
      commercialConditions: 'Deliberate immutable successor',
    });
    const historicalBefore = await ready.read(firstExact, ready.companyId);
    await open();
    await page
      .locator('.offer-version-history')
      .getByRole('button', { name: 'Open version 1', exact: true })
      .click();
    await actualDownload(page, info, first, 'historical');
    await page.screenshot({
      path: info.outputPath('illustrative-v1-historical.png'),
      fullPage: true,
    });
    expect(
      object((await ready.read(firstExact, ready.companyId)).offer).version,
    ).toEqual(object(historicalBefore.offer).version);
    await open();
    await page
      .locator('.offer-version-history')
      .getByRole('button', { name: 'Open version 1', exact: true })
      .click();
    await actualDownload(page, info, first, 'reloaded-historical');
  } finally {
    await writeFile(clockFile, JSON.stringify(offset));
  }
});

async function actualDownload(
  page: Page,
  info: TestInfo,
  offer: Record<string, unknown>,
  label: string,
) {
  const version = object(offer.version);
  const representation = object(version.representation);
  const panel = page.locator('.offer-panel');
  const frame = panel.frameLocator(
    'iframe[title="Illustrative Offer representation"]',
  );
  const html = text(representation.html);
  await expect(panel.locator('iframe')).toHaveAttribute('srcdoc', html);
  await expect(
    frame.getByRole('heading', { name: 'Services', exact: true }),
  ).toBeVisible();
  const visible = await frame.locator('body').textContent();
  const pdf = panel.getByRole('button', {
    name: 'Download non-official PDF',
    exact: true,
  });
  const recovery = panel.getByRole('button', {
    name: 'Download exact English HTML',
    exact: true,
  });
  await expect(pdf).toBeVisible();
  await expect(recovery).toBeVisible();
  const box = await pdf.boundingBox(),
    viewport = page.viewportSize();
  if (!box || !viewport)
    throw new Error('Expected actual PDF action geometry.');
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  await pdf.focus();
  await expect(pdf).toBeFocused();
  const offered = page.waitForEvent('download');
  const replied = page.waitForResponse((response) =>
    response.url().includes(`/versions/${text(version.id)}/pdf?`),
  );
  await pdf.press('Enter');
  const [download, response] = await Promise.all([offered, replied]);
  expect(response.status()).toBe(200);
  const filename = `offer-${String(offer.illustrativeReference)}-v${String(version.versionNumber)}-non-official-en.pdf`;
  expect(download.suggestedFilename()).toBe(filename);
  const file = info.outputPath(`${label}-${filename}`);
  await download.saveAs(file);
  const bytes = new Uint8Array(await readFile(file));
  const headers = response.headers();
  expect(headers['content-type']).toBe('application/pdf');
  expect(Number(headers['content-length'])).toBe(bytes.length);
  expect(headers['x-commercial-pdf-renderer']).toBe(
    'COMMERCIAL_ILLUSTRATIVE_OFFER_PDF/1',
  );
  expect(headers['x-commercial-pdf-sha256']).toBe(
    createHash('sha256').update(bytes).digest('hex'),
  );
  expect(JSON.parse(headers['x-commercial-pdf-source'])).toMatchObject({
    kind: 'offer',
    rootId: offer.id,
    versionId: version.id,
    versionNumber: version.versionNumber,
    provenance: 'ILLUSTRATIVE',
    language: 'en',
    sourceRendererCode: 'OFFER_ILLUSTRATIVE',
    sourceRendererVersion: 1,
    sourceHtmlSha256: representation.sha256,
    createdAt: version.createdAt,
  });
  const pages = await inspectCommercialPdf(bytes);
  const source = new Map<string, string>();
  for (const [index, page] of pages.entries()) {
    expect(page.text).toContain('NON-OFFICIAL PDF COPY');
    expect(page.text).toContain(`Page ${index + 1}`);
    for (const item of page.items)
      if (item.tag.startsWith('SourceBlock'))
        source.set(item.tag, (source.get(item.tag) ?? '') + item.text);
  }
  expect(compactPdfText([...source.values()].join(''))).toBe(
    compactPdfText(visible ?? ''),
  );
  await writeFile(
    info.outputPath(`${label}-identity.json`),
    JSON.stringify({ filename, headers, pages: pages.length }, null, 2),
  );
  await page.screenshot({
    path: info.outputPath(`${label}-illustrative-v1.png`),
    fullPage: true,
  });
}
