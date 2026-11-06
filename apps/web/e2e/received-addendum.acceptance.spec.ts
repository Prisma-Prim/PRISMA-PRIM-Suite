import { expect, test } from '@playwright/test';
import { selectOption } from './select-option';
import { enterClassicCompatibility } from './classic-compatibility';
import { prismeMessages } from '../src/production-shell/prisme/prisme-localized.copy';
import { companyContextMessages } from '../src/company/company-context.copy';
import { resolveMessage } from '../src/localization/messages';
import {
  exactReceivedDownload,
  openReceivedDocuments,
} from './received-contract.acceptance.fixture';
import {
  prepareReceivedAddendumCase,
  modelContractIdentities,
  object,
  text,
} from './received-addendum.acceptance.fixture';

test('preserves exact received Addendum originals against genuine executed V2 with independent parent/content authority', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  const narrow = info.project.name.endsWith('narrow'),
    suffix = narrow ? 'narrow' : 'desktop';
  const ready = await prepareReceivedAddendumCase(page, suffix);
  const identity = modelContractIdentities.preparer;
  await page.route('**/api/**', (route) =>
    route.fallback({ headers: { ...route.request().headers(), ...identity } }),
  );
  let documents = await openReceivedDocuments(page, ready.companyName, narrow);
  await selectOption(documents.getByLabel('Document family'), {
    value: 'received-addendum',
  });
  await expect(
    documents.getByText(
      'No eligible executed parent Contract Version is available.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    documents.getByRole('button', {
      name: 'Register received Addendum PDF',
      exact: true,
    }),
  ).toBeDisabled();
  // The same exact approved, unsigned Version remains visible in the old native family.
  await selectOption(documents.getByLabel('Document family'), {
    value: 'received-contract',
  });
  await expect(
    documents.getByLabel('Exact Contract Version', { exact: true }),
  ).toBeEnabled();
  await selectOption(
    documents.getByLabel('Exact Contract Version', { exact: true }),
    { value: ready.parentContractVersionId },
  );
  await ready.executeParent();
  // Executed Contracts keep their native refusal to create a successor.
  const successorRefusal = await page.request.post(
    `http://127.0.0.1:4174/api/contracts/opportunities/${ready.opportunityId}/versions/from-approved-model`,
    {
      headers: { ...ready.headers, 'idempotency-key': crypto.randomUUID() },
      data: { ...ready.intent, expectedContractRevision: 4 },
    },
  );
  expect(successorRefusal.status()).toBe(409);
  await selectOption(documents.getByLabel('Document family'), {
    value: 'received-addendum',
  });
  const picker = documents.getByLabel(
    'Exact executed parent Contract Version',
    { exact: true },
  );
  await expect(picker).toBeEnabled();
  await selectOption(picker, { value: ready.parentContractVersionId });
  const title = 'Fictional received Addendum ' + suffix,
    sourceText =
      ' Literal fictional email source 😀\n<script>literalOnly()</script>  inner space ';
  await documents.getByLabel('Title', { exact: true }).fill(title);
  await documents
    .getByLabel('Purpose', { exact: true })
    .fill('Preserve a fictional later source without legal effect');
  await documents
    .getByLabel('Declared source', { exact: true })
    .fill(sourceText);
  await expect(documents.getByLabel('Received on (optional)')).toHaveValue('');
  await expect(documents.getByLabel('Client', { exact: true })).toHaveCount(0);
  await expect(documents.getByLabel('External HTTPS link')).toHaveCount(0);
  const traffic: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/documents'))
      traffic.push(request.method() + ' ' + request.url());
  });
  const beforeLocale = traffic.length;
  for (const locale of ['ro', 'ru', 'fr', 'en'] as const) {
    await selectOption(page.locator('#interface-locale'), { value: locale });
    await expect(documents.locator('textarea[id$="-source"]')).toHaveValue(
      sourceText,
    );
    await page.screenshot({
      path: info.outputPath(`addendum-${suffix}-${locale}-prisme.png`),
      fullPage: true,
    });
    const presentationName = resolveMessage(prismeMessages, locale, 'optIn');
    await enterClassicCompatibility(page, presentationName);
    await expect(documents.locator('textarea[id$="-source"]')).toHaveValue(
      sourceText,
    );
    await page.screenshot({
      path: info.outputPath(`addendum-${suffix}-${locale}-classic.png`),
      fullPage: true,
    });
    await page
      .getByRole('button', { name: presentationName, exact: true })
      .click();
  }
  expect(traffic).toHaveLength(beforeLocale);
  const attempts: Array<{ body: string | null; key: string | undefined }> = [];
  let documentId = '';
  await page.route('**/api/documents', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    attempts.push({
      body: route.request().postData(),
      key: route.request().headers()['idempotency-key'],
    });
    const response = await route.fetch({
      headers: { ...route.request().headers(), ...identity },
    });
    expect(response.status()).toBe(201);
    const saved = object(await response.json());
    documentId = text(saved.id);
    expect(object(saved.receivedAddendumRelation)).toMatchObject({
      parentContractId: ready.parentContractId,
      parentContractVersionId: ready.parentContractVersionId,
      contractVersionNumber: 2,
      receivedOn: null,
      sourceDescription: sourceText.trim(),
    });
    if (attempts.length === 1)
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: '{}',
      });
    else await route.fulfill({ response });
  });
  await documents
    .getByRole('button', {
      name: 'Register received Addendum PDF',
      exact: true,
    })
    .click();
  await expect(
    documents.getByRole('button', {
      name: 'Retry identical registration',
      exact: true,
    }),
  ).toBeEnabled();
  await expect(documents.getByLabel('Title', { exact: true })).toBeDisabled();
  await expect(documents.getByLabel('Document family')).toBeDisabled();
  const protectedUrl = page.url();
  if (narrow)
    await page
      .getByRole('button', {
        name: resolveMessage(prismeMessages, 'en', 'openNavigation'),
        exact: true,
      })
      .click();
  await expect(
    page.getByRole('combobox', {
      name: resolveMessage(companyContextMessages, 'en', 'activeCompany'),
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('combobox', {
      name: resolveMessage(companyContextMessages, 'en', 'activeCompany'),
      exact: true,
    }),
  ).toBeDisabled();
  if (narrow)
    await page
      .getByRole('button', {
        name: resolveMessage(prismeMessages, 'en', 'closeNavigation'),
        exact: true,
      })
      .click();
  expect(page.url()).toBe(protectedUrl);
  await documents
    .getByRole('button', { name: 'Retry identical registration', exact: true })
    .click();
  await expect(
    documents.getByRole('heading', { name: title, exact: true }),
  ).toBeVisible();
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);
  await expect(
    documents.getByText(sourceText.trim(), { exact: true }),
  ).toBeVisible();
  await expect(
    documents.getByText('Receipt date unknown', { exact: true }),
  ).toBeVisible();
  await expect(
    documents.getByText('Contract 1 · Version 2', { exact: true }),
  ).toBeVisible();
  async function upload(name: string, buffer: Buffer) {
    await documents
      .getByLabel('Choose the PDF file')
      .setInputFiles({ name, mimeType: 'application/pdf', buffer });
    await documents
      .getByRole('button', { name: 'Preserve PDF', exact: true })
      .click();
    await expect(documents.getByText(name, { exact: true })).toBeVisible();
  }
  await upload('fictional-addendum-a.pdf', ready.addendumA);
  await upload('fictional-addendum-b.pdf', ready.addendumB);
  await exactReceivedDownload(
    page,
    documents.getByRole('button', {
      name: 'Download Version 1 PDF',
      exact: true,
    }),
    ready.addendumB,
  );
  await documents
    .getByRole('button', { name: 'PDF history', exact: true })
    .click();
  const old = documents
    .getByRole('list', { name: 'PDF history' })
    .getByRole('listitem')
    .filter({ hasText: 'fictional-addendum-a.pdf' });
  await exactReceivedDownload(
    page,
    old.getByRole('button', { name: 'Download Version 1 PDF', exact: true }),
    ready.addendumA,
  );
  await documents
    .getByRole('button', { name: 'Designate as official', exact: true })
    .click();
  await documents
    .getByRole('button', { name: 'Confirm official designation', exact: true })
    .click();
  await documents
    .getByRole('button', { name: 'Start new draft', exact: true })
    .click();
  const next = documents.locator('.working-document-version').filter({
    has: page.getByRole('heading', { name: 'Version 2', exact: true }),
  });
  await expect(
    next.getByText('This Version has no preserved PDF yet.', { exact: true }),
  ).toBeVisible();
  await documents
    .getByRole('button', { name: 'Edit reference', exact: true })
    .click();
  await documents
    .getByLabel('Title', { exact: true })
    .fill(title + ' corrected');
  await documents
    .getByRole('button', { name: 'Save correction', exact: true })
    .click();
  await expect(
    documents.getByRole('heading', { name: title + ' corrected', exact: true }),
  ).toBeVisible();
  for (const frame of ['prisme', 'classic']) {
    if (frame === 'classic') await enterClassicCompatibility(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`addendum-preserved-${suffix}-${frame}.png`),
      fullPage: true,
    });
  }
  await page.getByRole('button', { name: 'Try Prisme', exact: true }).click();
  await ready.revoke('company-contract-preparer');
  await ready.revoke('company-contract-approver');
  documents = await openReceivedDocuments(page, ready.companyName, narrow);
  await documents
    .getByRole('button', { name: title + ' corrected', exact: true })
    .click();
  await expect(
    documents.getByText(
      'The declared parent and source are unavailable under your current access.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    documents.getByText(sourceText.trim(), { exact: true }),
  ).toHaveCount(0);
  await expect(
    documents.getByText('Contract 1 · Version 2', { exact: true }),
  ).toHaveCount(0);
  await exactReceivedDownload(
    page,
    documents.getByRole('button', {
      name: 'Download Version 1 PDF',
      exact: true,
    }),
    ready.addendumB,
  );
  const initialVersion = documents.locator('.working-document-version').filter({
    has: page.getByRole('heading', { name: 'Version 1', exact: true }),
  });
  await expect(initialVersion.getByText(/^Created by /)).toHaveCount(0);
  await expect(next.getByText(/^Created by /)).toBeVisible();
  await expect(
    documents.locator('.working-document-registration-time'),
  ).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath(`addendum-parent-unavailable-${suffix}-prisme.png`),
    fullPage: true,
  });
  const native = await page.request.get(
    `http://127.0.0.1:4174/api/documents/${documentId}`,
    { headers: ready.headers },
  );
  expect(native.status()).toBe(200);
  const hidden = object(await native.json());
  expect(hidden.receivedAddendumRelation).toEqual({ access: 'denied' });
  expect(hidden).not.toHaveProperty('createdByMembershipId');
  expect(hidden).not.toHaveProperty('createdAt');
  expect(hidden).not.toHaveProperty('projectAssociation');
  await ready.revoke('company-document-content-reader');
  documents = await openReceivedDocuments(page, ready.companyName, narrow);
  await documents
    .getByRole('button', { name: title + ' corrected', exact: true })
    .click();
  await expect(
    documents.getByRole('button', { name: /Download Version/u }),
  ).toHaveCount(0);
  await expect(
    documents.getByText('fictional-addendum-b.pdf', { exact: true }),
  ).toHaveCount(0);
});
