import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
  inspectCommercialPdf,
  compactPdfText,
} from '../../api/src/commercial-pdf/pdf-inspection.test-support.mjs';
import {
  prepareModelContractCase,
  modelContractIdentities,
  object,
  text,
} from './model-contract.acceptance.fixture';
import { selectOption } from './select-option';

test('downloads real current and historical exact Offer and Contract PDFs through the registered App', async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  const narrow = info.project.name.endsWith('narrow');
  const ready = await prepareModelContractCase(
    page,
    `PDF965-${narrow ? 'Narrow' : 'Desktop'}`,
  );
  for (const bundle of [
    'company-contract-preparer',
    'company-contract-approver',
  ])
    await ready.command(`/${bundle}-assignments`, {
      companyId: ready.companyId,
      workspaceMembershipId: ready.preparerId,
    });
  const contractBase = `/contracts/opportunities/${ready.opportunityId}`,
    offerBase = `/offers/opportunities/${ready.opportunityId}`;
  const selected = object(
    object(
      (await ready.read('/contract-models/consulting-ro', ready.companyId))
        .model,
    ).head,
  );
  const intent = {
    sourceOfferVersionId: ready.offerVersionId,
    modelVersionId: ready.modelVersionId,
    modelVersionNumber: 1,
    modelApprovalDecisionId: text(object(selected.decision).id),
    documentDate: '2026-10-24',
    clientDetails:
      ' Synthetic requisites Șț Русский Français a\u0306 e\u0301 ☀️\n<script>literal()</script> ',
    termStartsOn: null,
    termEndsOn: null,
    specialConditions: null,
    sourceConcordanceDeclaration: true,
    sourceConcordanceBasis: 'Synthetic concordance, no actual legal authority',
  };
  const contract = await ready.command(
    contractBase + '/from-approved-model',
    intent,
    modelContractIdentities.preparer,
    ready.companyId,
  );
  const offer = object((await ready.read(offerBase, ready.companyId)).offer);
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
      .filter({ has: page.getByText(ready.subject, { exact: true }) })
      .click();
    await expect(
      workspace.getByRole('article', { name: ready.subject, exact: true }),
    ).toBeVisible();
  }
  await open();
  await actualDownload(page, info, 'offer', offer, 'current');
  await actualDownload(page, info, 'contract', contract, 'current');
  await page.screenshot({
    path: info.outputPath('commercial-pdf-current.png'),
    fullPage: true,
  });
  const offerPanel = page.locator('.offer-panel');
  await offerPanel
    .getByRole('button', {
      name: 'Prepare full Offer from approved model',
      exact: true,
    })
    .click();
  const draft = offerPanel.getByRole('textbox', {
    name: 'Declared tax label',
    exact: true,
  });
  await draft.fill('Literal PDF-independent draft');
  await expect(
    offerPanel.getByRole('button', {
      name: 'Download exact Romanian HTML',
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    page
      .locator(
        '.commercial-pdf-action[data-kind="offer"][data-placement="inline"]',
      )
      .getByRole('button', { name: 'Download non-official PDF', exact: true }),
  ).toBeDisabled();
  await actualDownload(
    page,
    info,
    'offer',
    offer,
    'editing-fallback',
    'fallback',
  );
  await expect(draft).toHaveValue('Literal PDF-independent draft');
  await page.screenshot({
    path: info.outputPath('commercial-pdf-editing-fallback.png'),
    fullPage: false,
  });
  await offerPanel
    .getByRole('button', { name: 'Cancel preparation', exact: true })
    .click();
  const successor = await ready.command(
    contractBase + '/versions/from-approved-model',
    {
      ...intent,
      expectedContractRevision: 1,
      clientDetails: 'Complete successor requisites',
    },
    modelContractIdentities.preparer,
    ready.companyId,
  );
  // The existing public Offer command deliberately supplies complete sources and declaration.
  const originalOfferVersion = object(offer.version),
    price = object(originalOfferVersion.priceSource),
    model = object(originalOfferVersion.modelSource),
    facts = object(originalOfferVersion.financialDeclaration);
  await ready.command(
    offerBase + '/versions/from-approved-model',
    {
      expectedOfferRevision: offer.revision,
      estimateVersionId: price.estimateVersionId,
      estimateVersionNumber: price.estimateVersionNumber,
      modelVersionId: model.versionId,
      modelVersionNumber: model.versionNumber,
      recipient: { kind: 'PRIMARY' },
      validityDays: 30,
      scopeNote: 'Explicit successor source',
      commercialConditions: null,
      financialDeclaration: {
        kind: 'NET_PLUS_DECLARED_TAX',
        netAmountConfirmed: true,
        taxAmount: facts.taxAmount,
        taxLabel: facts.taxLabel,
        basis: 'New synthetic declaration',
      },
    },
    modelContractIdentities.preparer,
    ready.companyId,
  );
  await open();
  await page
    .locator('.offer-version-history')
    .getByRole('button', { name: 'Open version 1', exact: true })
    .click();
  const history = page
    .locator('.model-contract-panel')
    .getByRole('region', { name: 'Contract Version history', exact: true });
  await history
    .getByRole('button', { name: 'Contract Version history', exact: true })
    .click();
  await history
    .getByRole('button', { name: 'Open Contract Version 1', exact: true })
    .click();
  await actualDownload(page, info, 'offer', offer, 'historical');
  await actualDownload(page, info, 'contract', contract, 'historical');
  await page.screenshot({
    path: info.outputPath('commercial-pdf-historical.png'),
    fullPage: true,
  });
  await ready.revoke('company-offer-model-editor');
  await ready.revoke('company-offer-model-approver');
  await ready.revoke('company-contract-model-editor');
  await ready.revoke('company-contract-model-approver');
  await ready.revoke('company-profitability-contributor');
  // Real shell actor refresh; copied read authority remains independently present.
  await page.reload();
  await open();
  await expect(
    page.locator('.commercial-pdf-action[data-kind="contract"]'),
  ).toContainText('v2');
  const source = object(
    object(
      (
        await ready.read(
          `${contractBase}/versions/${text(object(contract.version).id)}`,
          ready.companyId,
        )
      ).contract,
    ).version,
  );
  expect(source.representation).toEqual(
    object(contract.version).representation,
  );
  expect(object(successor.version).versionNumber).toBe(2);
  await page.screenshot({
    path: info.outputPath(
      'commercial-pdf-reopened-after-source-grant-loss.png',
    ),
    fullPage: true,
  });
});

async function actualDownload(
  page: Page,
  info: TestInfo,
  kind: 'offer' | 'contract',
  source: Record<string, unknown>,
  label: string,
  placement: 'inline' | 'fallback' = 'inline',
) {
  const version = object(source.version),
    representation = object(version.representation),
    versionId = text(version.id);
  const control = page.locator(
    `.commercial-pdf-action[data-kind="${kind}"][data-placement="${placement}"]`,
  );
  await expect(control).toContainText(`v${String(version.versionNumber)}`);
  const responsePromise = page.waitForResponse((response) =>
    response.url().includes(`/versions/${versionId}/pdf?`),
  );
  const downloadPromise = page.waitForEvent('download');
  const button = control.getByRole('button', {
    name: 'Download non-official PDF',
    exact: true,
  });
  await button.scrollIntoViewIfNeeded();
  if (placement === 'inline') {
    const html = page
      .locator(
        kind === 'offer' ? '.model-offer-details' : '.model-contract-details',
      )
      .getByRole('button', {
        name:
          kind === 'offer'
            ? 'Download exact Romanian HTML'
            : 'Download exact non-official Contract HTML',
        exact: true,
      });
    await html.focus();
    await page.keyboard.press('Tab');
    await expect(button).toBeFocused();
    const htmlBox = await html.boundingBox(),
      pdfBox = await button.boundingBox(),
      viewport = page.viewportSize();
    if (!htmlBox || !pdfBox || !viewport)
      throw new Error('Missing actual HTML/PDF button geometry.');
    expect(Math.abs(pdfBox.y - htmlBox.y)).toBeLessThan(160);
    expect(pdfBox.x).toBeGreaterThanOrEqual(0);
    expect(pdfBox.x + pdfBox.width).toBeLessThanOrEqual(viewport.width);
    const focus = await button.evaluate((element) => ({
      outlineStyle: getComputedStyle(element).outlineStyle,
      outlineWidth: getComputedStyle(element).outlineWidth,
      color: getComputedStyle(element).color,
    }));
    expect(focus.outlineStyle).not.toBe('none');
    const x = Math.max(0, Math.min(htmlBox.x, pdfBox.x) - 8),
      y = Math.max(0, Math.min(htmlBox.y, pdfBox.y) - 8);
    await page.screenshot({
      path: info.outputPath(`${label}-${kind}-html-pdf-focus.png`),
      clip: {
        x,
        y,
        width: Math.min(
          viewport.width - x,
          Math.max(htmlBox.x + htmlBox.width, pdfBox.x + pdfBox.width) - x + 8,
        ),
        height: Math.min(
          viewport.height - y,
          Math.max(htmlBox.y + htmlBox.height, pdfBox.y + pdfBox.height) -
            y +
            8,
        ),
      },
    });
    await writeFile(
      info.outputPath(`${label}-${kind}-geometry.json`),
      JSON.stringify({ html: htmlBox, pdf: pdfBox, viewport, focus }, null, 2),
    );
  } else await button.focus();
  await button.press('Enter');
  const [response, download] = await Promise.all([
    responsePromise,
    downloadPromise,
  ]);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toBe('application/pdf');
  const filename = `${kind}-${String(source.illustrativeReference)}-v${String(version.versionNumber)}-non-official-ro.pdf`;
  expect(download.suggestedFilename()).toBe(filename);
  const path = info.outputPath(`${label}-${filename}`);
  await download.saveAs(path);
  const bytes = new Uint8Array(await readFile(path));
  expect(response.headers()['x-commercial-pdf-sha256']).toBe(
    createHash('sha256').update(bytes).digest('hex'),
  );
  const metadata = object(
    JSON.parse(response.headers()['x-commercial-pdf-source']),
  );
  await writeFile(
    info.outputPath(`${label}-${kind}-download.json`),
    JSON.stringify(
      {
        filename,
        contentType: response.headers()['content-type'],
        source: metadata,
        pdfSha256: response.headers()['x-commercial-pdf-sha256'],
        bytes: bytes.length,
        renderer: response.headers()['x-commercial-pdf-renderer'],
      },
      null,
      2,
    ),
  );
  expect(metadata).toMatchObject({
    rootId: source.id,
    versionId,
    sourceHtmlSha256: representation.sha256,
  });
  const pages = await inspectCommercialPdf(bytes),
    tags = new Map<string, string>();
  for (const [i, pageContent] of pages.entries()) {
    expect(pageContent.text).toContain(`Pagina ${i + 1}`);
    expect(compactPdfText(pageContent.text)).toContain(
      text(representation.sha256),
    );
    for (const item of pageContent.items)
      if (item.tag.startsWith('SourceBlock'))
        tags.set(item.tag, (tags.get(item.tag) ?? '') + item.text);
  }
  const oracle = await page.evaluate((html: string) => {
    const document = new DOMParser().parseFromString(html, 'text/html'),
      blocks: string[][][] = [];
    function visit(element: Element) {
      if (element.tagName === 'TABLE') {
        blocks.push(
          [...element.querySelectorAll('tr')].map((row) =>
            [...row.children].map((cell) => cell.textContent ?? ''),
          ),
        );
        return;
      }
      if (['H1', 'H2', 'P', 'DT', 'DD', 'LI'].includes(element.tagName)) {
        blocks.push([[element.textContent ?? '']]);
        return;
      }
      for (const child of element.children) visit(child);
    }
    visit(document.body);
    return blocks;
  }, text(representation.html));
  const expected = new Map<string, string>();
  for (const [i, rows] of oracle.entries()) {
    if (rows.length === 1 && rows[0].length === 1)
      expected.set(`SourceBlock${i}`, rows[0][0]);
    else
      for (const [r, row] of rows.entries())
        for (const [c, cell] of row.entries())
          expected.set(`SourceBlock${i}Row${r}Cell${c}`, cell);
  }
  expect([...tags.keys()]).toEqual([...expected.keys()]);
  for (const [tag, value] of expected)
    expect(compactPdfText(tags.get(tag) ?? ''), tag).toBe(
      compactPdfText(value),
    );
  await expect(
    page
      .locator(`.commercial-pdf-held[data-kind="${kind}"]`)
      .getByRole('status'),
  ).toHaveText('The non-official PDF copy was offered for download.');
}
