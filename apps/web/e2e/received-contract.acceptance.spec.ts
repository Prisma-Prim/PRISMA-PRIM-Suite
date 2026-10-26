import { expect, test } from '@playwright/test';
import { selectOption } from './select-option';
import { enterClassicCompatibility } from './classic-compatibility';
import {
  exactReceivedDownload,
  modelContractIdentities,
  navigateReceived,
  object,
  openReceivedDocuments,
  prepareReceivedContractCase,
  selectReceivedCompany,
  text,
} from './received-contract.acceptance.fixture';

test('registers a received exact Contract original, preserves official/successor PDFs and keeps source and content rights independent', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  const narrow = info.project.name.endsWith('narrow'),
    suffix = narrow ? 'narrow' : 'desktop';
  const ready = await prepareReceivedContractCase(page, suffix);
  let identity = modelContractIdentities.owner;
  await page.route('**/api/**', (route) =>
    route.fallback({ headers: { ...route.request().headers(), ...identity } }),
  );
  await page.goto('/#access');
  const admin = page.locator('.company-access');
  await selectOption(admin.getByLabel('Workspace member'), {
    value: ready.preparerId,
  });
  await selectOption(admin.getByLabel('Company', { exact: true }), {
    label: ready.companyName,
  });
  await selectOption(admin.getByLabel('Access bundle'), {
    value: 'received-contract-access',
  });
  await admin
    .getByRole('button', { name: 'Grant access', exact: true })
    .click();
  await expect(
    admin.getByText('Granted — captured version v1', { exact: true }),
  ).toBeVisible();
  identity = modelContractIdentities.preparer;
  let documents = await openReceivedDocuments(page, ready.companyName, narrow);
  await selectOption(documents.getByLabel('Document family'), {
    value: 'received-contract',
  });
  const source = documents.getByLabel('Exact Contract Version', {
    exact: true,
  });
  await expect(source).toBeEnabled();
  await selectOption(source, { value: ready.contractVersionId });
  await expect(documents.getByLabel('Client', { exact: true })).toHaveCount(0);
  await expect(documents.getByLabel('External HTTPS link')).toHaveCount(0);
  await expect(documents.getByLabel('Received on (optional)')).toHaveValue('');
  const title = 'Received Contract original DEMO ' + suffix;
  const sourceText =
    ' Synthetic email original\n<script>literalReceived()</script> ☀️ ';
  await documents.getByLabel('Title', { exact: true }).fill(title);
  await documents
    .getByLabel('Purpose', { exact: true })
    .fill('Preserve the externally received original');
  await documents
    .getByLabel('Declared source', { exact: true })
    .fill(sourceText);
  const traffic: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/documents'))
      traffic.push(request.method() + ' ' + request.url());
  });
  const beforeLocale = traffic.length;
  for (const locale of ['fr', 'ro', 'ru', 'en'])
    await selectOption(page.locator('#interface-locale'), { value: locale });
  expect(traffic).toHaveLength(beforeLocale);
  await expect(
    documents.getByLabel('Declared source', { exact: true }),
  ).toHaveValue(sourceText);
  await expect(source).toHaveAttribute('data-value', ready.contractVersionId);
  const attempts: Array<{ body: string | null; key: string | undefined }> = [];
  let documentId = '';
  await page.route('**/api/documents', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    attempts.push({
      body: route.request().postData(),
      key: route.request().headers()['idempotency-key'],
    });
    const actual = await route.fetch({
      headers: { ...route.request().headers(), ...identity },
    });
    expect(actual.status()).toBe(201);
    const saved = object(await actual.json());
    documentId = text(saved.id);
    expect(object(saved.receivedContractRelation)).toMatchObject({
      contractVersionId: ready.contractVersionId,
      receivedOn: null,
      sourceDescription: sourceText.trim(),
    });
    if (attempts.length === 1)
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: '{}',
      });
    else if (attempts.length === 2)
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{}',
      });
    else await route.fulfill({ response: actual });
  });
  await documents
    .getByRole('button', {
      name: 'Register received Contract PDF',
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
  await documents
    .getByRole('button', { name: 'Retry identical registration', exact: true })
    .click();
  await expect(
    documents.getByRole('button', {
      name: 'Retry identical registration',
      exact: true,
    }),
  ).toBeEnabled();
  await enterClassicCompatibility(page);
  await expect(
    documents.getByLabel('Declared source', { exact: true }),
  ).toHaveValue(sourceText);
  await page.getByRole('button', { name: 'Try Prisme', exact: true }).click();
  await documents
    .getByRole('button', { name: 'Retry identical registration', exact: true })
    .click();
  await expect(
    documents.getByRole('heading', { name: title, exact: true }),
  ).toBeVisible();
  expect(attempts).toHaveLength(3);
  expect(attempts[1]).toEqual(attempts[0]);
  expect(attempts[2]).toEqual(attempts[0]);
  await expect(
    documents.getByText(sourceText.trim(), { exact: true }),
  ).toBeVisible();
  await expect(
    documents.getByText('Receipt date unknown', { exact: true }),
  ).toBeVisible();
  await expect(
    documents.getByRole('button', {
      name: 'Designate as official',
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    documents.getByRole('button', { name: 'Add reference', exact: true }),
  ).toHaveCount(0);
  await documents.getByLabel('Choose the PDF file').setInputFiles({
    name: 'received-original-a.pdf',
    mimeType: 'application/pdf',
    buffer: ready.pdfA,
  });
  await documents
    .getByRole('button', { name: 'Preserve PDF', exact: true })
    .click();
  await expect(
    documents.getByText('received-original-a.pdf', { exact: true }),
  ).toBeVisible();
  await exactReceivedDownload(
    page,
    documents.getByRole('button', {
      name: 'Download Version 1 PDF',
      exact: true,
    }),
    ready.pdfA,
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
  await next.getByLabel('Choose the PDF file').setInputFiles({
    name: 'received-original-b.pdf',
    mimeType: 'application/pdf',
    buffer: ready.pdfB,
  });
  await next.getByRole('button', { name: 'Preserve PDF', exact: true }).click();
  await expect(
    next.getByText('received-original-b.pdf', { exact: true }),
  ).toBeVisible();
  await next
    .getByRole('button', { name: 'Designate as official', exact: true })
    .click();
  await documents
    .getByRole('button', { name: 'Confirm official designation', exact: true })
    .click();
  await ready.command(
    `/contracts/opportunities/${ready.opportunityId}/versions/from-approved-model`,
    { ...ready.intent, expectedContractRevision: 1 },
    identity,
    ready.companyId,
  );
  await documents
    .getByRole('button', {
      name: 'Reload declared Contract relation',
      exact: true,
    })
    .click();
  await expect(
    documents.getByText('Contract 1 · Version 1', { exact: true }),
  ).toBeVisible();
  documents = await openReceivedDocuments(page, ready.companyName, narrow);
  await documents
    .getByRole('button', { name: title + ' corrected', exact: true })
    .click();
  await expect(documents.getByText('Superseded by Version 2')).toBeVisible();
  await exactReceivedDownload(
    page,
    documents.getByRole('button', {
      name: 'Download Version 1 PDF',
      exact: true,
    }),
    ready.pdfA,
  );
  await exactReceivedDownload(
    page,
    documents.getByRole('button', {
      name: 'Download Version 2 PDF',
      exact: true,
    }),
    ready.pdfB,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath(`received-contract-preserved-${suffix}.png`),
    fullPage: true,
  });
  await ready.revoke('company-document-content-reader');
  documents = await openReceivedDocuments(page, ready.companyName, narrow);
  await documents
    .getByRole('button', { name: title + ' corrected', exact: true })
    .click();
  await expect(
    documents.getByText('received-original-a.pdf', { exact: true }),
  ).toHaveCount(0);
  await expect(
    documents.getByText('received-original-b.pdf', { exact: true }),
  ).toHaveCount(0);
  await expect(
    documents.getByRole('button', { name: /Download Version/u }),
  ).toHaveCount(0);
  await expect(
    documents.getByText(sourceText.trim(), { exact: true }),
  ).toBeVisible();
  await ready.revoke('company-received-contract-access');
  documents = await openReceivedDocuments(page, ready.companyName, narrow);
  await expect(
    documents.getByRole('button', { name: title + ' corrected', exact: true }),
  ).toHaveCount(0);
  const denied = await page.request.get(
    `http://127.0.0.1:4174/api/documents/${documentId}`,
    { headers: { ...identity, 'x-company-context-id': ready.companyId } },
  );
  expect(denied.status()).toBe(404);
});

test('keeps an identical uncertain PDF retry through actual Contract read retirement and rejects held earlier related data', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  const narrow = info.project.name.endsWith('narrow'),
    suffix = (narrow ? 'narrow' : 'desktop') + '-retirement';
  const ready = await prepareReceivedContractCase(page, suffix),
    identity = modelContractIdentities.preparer;
  await ready.command('/company-received-contract-access-assignments', {
    companyId: ready.companyId,
    workspaceMembershipId: ready.preparerId,
  });
  await ready.command('/company-mission-deliverable-access-assignments', {
    companyId: ready.companyId,
    workspaceMembershipId: ready.preparerId,
  });
  const title = 'Received independent PDF work DEMO ' + suffix,
    source = 'Protected declared email source ' + suffix;
  const saved = await ready.command(
    '/documents',
    {
      type: 'received-contract',
      opportunityId: ready.opportunityId,
      contractId: ready.contractId,
      contractVersionId: ready.contractVersionId,
      title,
      purpose: 'Preserve authorized PDF work independently',
      sourceDescription: source,
    },
    identity,
    ready.companyId,
  );
  const documentId = text(saved.id),
    versionId = text(object(saved.version).id);
  await page.route('**/api/**', (route) =>
    route.fallback({ headers: { ...route.request().headers(), ...identity } }),
  );
  const documents = await openReceivedDocuments(
    page,
    ready.companyName,
    narrow,
  );
  await documents.getByRole('button', { name: title, exact: true }).click();
  await expect(documents.getByText(source, { exact: true })).toBeVisible();
  const uploads: Array<{ key: string | undefined; body: Buffer | null }> = [];
  await page.route(
    `**/api/documents/${documentId}/versions/${versionId}/content?**`,
    async (route) => {
      uploads.push({
        key: route.request().headers()['idempotency-key'],
        body: route.request().postDataBuffer(),
      });
      const actual = await route.fetch({
        headers: { ...route.request().headers(), ...identity },
      });
      expect(actual.status()).toBe(201);
      if (uploads.length === 1)
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{}',
        });
      else await route.fulfill({ response: actual });
    },
  );
  await documents.getByLabel('Choose the PDF file').setInputFiles({
    name: 'independent-received.pdf',
    mimeType: 'application/pdf',
    buffer: ready.pdfA,
  });
  await documents
    .getByRole('button', { name: 'Preserve PDF', exact: true })
    .click();
  await expect(
    documents.getByRole('button', { name: 'Retry the same PDF', exact: true }),
  ).toBeEnabled();
  let releaseEarlier: (() => void) | undefined,
    hold = true;
  await page.route(`**/api/documents/${documentId}`, async (route) => {
    const actual = await route.fetch({
      headers: { ...route.request().headers(), ...identity },
    });
    if (hold) {
      hold = false;
      await new Promise<void>((resolve) => {
        releaseEarlier = resolve;
      });
    }
    await route.fulfill({ response: actual }).catch(() => undefined);
  });
  try {
    await documents
      .getByRole('button', {
        name: 'Reload declared Contract relation',
        exact: true,
      })
      .click();
    await expect.poll(() => Boolean(releaseEarlier)).toBe(true);
    await ready.revoke('company-mission-deliverable-access');
    await ready.revoke('company-contract-preparer');
    await documents
      .getByRole('button', {
        name: 'Reload declared Contract relation',
        exact: true,
      })
      .click();
    await expect(
      documents.getByText(
        'The declared Contract relation is unavailable under your current access.',
        { exact: true },
      ),
    ).toBeVisible();
    releaseEarlier?.();
    await expect(documents.getByText(source, { exact: true })).toHaveCount(0);
    await expect(
      documents.getByRole('button', {
        name: 'Retry the same PDF',
        exact: true,
      }),
    ).toBeEnabled();
    await enterClassicCompatibility(page);
    await expect(
      documents.getByRole('button', {
        name: 'Retry the same PDF',
        exact: true,
      }),
    ).toBeEnabled();
    await page.getByRole('button', { name: 'Try Prisme', exact: true }).click();
    await documents
      .getByRole('button', { name: 'Retry the same PDF', exact: true })
      .click();
    await expect(
      documents.getByText('independent-received.pdf', { exact: true }),
    ).toBeVisible();
    expect(uploads).toHaveLength(2);
    expect(uploads[1]).toEqual(uploads[0]);
    await exactReceivedDownload(
      page,
      documents.getByRole('button', {
        name: 'Download Version 1 PDF',
        exact: true,
      }),
      ready.pdfA,
    );
    await selectReceivedCompany(page, ready.otherCompanyName, narrow);
    await expect(page.getByText(source, { exact: true })).toHaveCount(0);
    await selectReceivedCompany(page, ready.companyName, narrow);
    await navigateReceived(page, 'Working Documents', narrow);
    await documents.getByRole('button', { name: title, exact: true }).click();
    await expect(
      documents.getByRole('button', {
        name: 'Retry the same PDF',
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(documents.getByLabel('Choose the PDF file')).toHaveValue('');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(
        `received-contract-independent-retirement-${suffix}.png`,
      ),
      fullPage: true,
    });
  } finally {
    releaseEarlier?.();
  }
});
