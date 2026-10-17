import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
} from '@playwright/test';
import { selectOption } from './select-option';

const origin = 'http://127.0.0.1:4174';
const ada = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'local-demonstration-user',
  'x-test-display-name': 'Ada Ionescu',
  'x-test-email': 'ada@example.test',
};
const owner = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'workspace-owner',
  'x-test-display-name': 'Workspace Owner',
  'x-test-email': 'owner@example.test',
};
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected identified API record.');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value)
    throw new Error('Expected API identity.');
  return value;
}
function requiredEnvironment(name: string): string {
  return text(process.env[name]);
}
async function assign({
  request,
  role,
  companyId,
  membershipId,
  active,
}: {
  request: APIRequestContext;
  role: 'reader' | 'uploader';
  companyId: string;
  membershipId: string;
  active: boolean;
}): Promise<void> {
  const path = `/api/company-document-content-${role}-assignments`;
  const headers = { ...owner, 'idempotency-key': randomUUID() };
  const response = active
    ? await request.post(`${origin}${path}`, {
        headers,
        data: { companyId, workspaceMembershipId: membershipId },
      })
    : await request.delete(`${origin}${path}/${membershipId}/${companyId}`, {
        headers,
      });
  expect(response.status()).toBe(active ? 201 : 200);
}
async function openDocument(
  page: Page,
  title: string,
  narrow: boolean,
): Promise<Locator> {
  await page.goto('/');
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await selectOption(page.getByLabel('Active Company', { exact: true }), {
    label: 'PRISMA-PRIM',
  });
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: 'Working Documents', exact: true })
    .click();
  const documents = page.locator('.working-documents');
  await documents.getByRole('button', { name: title, exact: true }).click();
  await expect(
    documents.getByRole('heading', { name: title, exact: true }),
  ).toBeVisible();
  return documents;
}
async function expectDownload(
  page: Page,
  button: Locator,
  expected: Buffer,
  fileName: string,
): Promise<void> {
  const downloading = page.waitForEvent('download');
  await button.click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe(fileName);
  const path = await download.path();
  if (!path) throw new Error('Browser did not preserve the downloaded PDF.');
  expect(await readFile(path)).toEqual(expected);
}

test('preserves and corrects a questionnaire draft PDF, reopens both uploads and enforces live content rights', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const narrow = testInfo.project.name.endsWith('narrow');
  const companyId = requiredEnvironment('ACCEPTANCE_PRIMARY_COMPANY_ID');
  const membershipId = requiredEnvironment('ACCEPTANCE_PRIMARY_MEMBERSHIP_ID');
  const title = `Preserved PDF DEMO ${narrow ? 'narrow' : 'desktop'}`;
  const bytesA = await readFile(
    fileURLToPath(
      new URL(
        '../../api/test-support/fixtures/questionnaire-demo.pdf',
        import.meta.url,
      ),
    ),
  );
  const bytesB = Buffer.from(
    bytesA
      .toString('utf8')
      .replace('DEMO questionnaire A', 'DEMO questionnaire B'),
  );
  const firstName = 'questionnaire-a.pdf';
  const secondName = 'questionnaire-b.pdf';
  const identity = {
    ...ada,
    'x-company-context-id': companyId,
    'idempotency-key': randomUUID(),
  };
  const client = await page.request.post(`${origin}/api/clients`, {
    headers: identity,
    data: { displayName: `${title} Client` },
  });
  expect(client.status()).toBe(201);
  const registered = await page.request.post(`${origin}/api/documents`, {
    headers: { ...identity, 'idempotency-key': randomUUID() },
    data: {
      clientId: text(record(await client.json()).id),
      title,
      purpose: 'Synthetic PDF preservation acceptance',
      url: 'https://example.test/synthetic-questionnaire',
    },
  });
  expect(registered.status()).toBe(201);
  const registeredDocument = record(await registered.json());
  const documentId = text(registeredDocument.id);
  const versionId = text(record(registeredDocument.version).id);
  const granted = new Set<'reader' | 'uploader'>();
  try {
    let documents = await openDocument(page, title, narrow);
    await expect(documents.getByLabel('Choose the PDF file')).toHaveCount(0);
    const before = await page.request.get(
      `${origin}/api/access/current-actor`,
      { headers: identity },
    );
    expect(before.status()).toBe(200);
    const initialPermissions = record(
      record(await before.json()).activeCompany,
    ).documentPermissions;
    expect(Array.isArray(initialPermissions)).toBe(true);
    expect(initialPermissions).not.toContain('document.content.read');
    expect(initialPermissions).not.toContain('document.content.upload');
    await assign({
      request: page.request,
      role: 'reader',
      companyId,
      membershipId,
      active: true,
    });
    granted.add('reader');
    await assign({
      request: page.request,
      role: 'uploader',
      companyId,
      membershipId,
      active: true,
    });
    granted.add('uploader');
    documents = await openDocument(page, title, narrow);
    const file = documents.getByLabel('Choose the PDF file');
    await file.setInputFiles({
      name: firstName,
      mimeType: 'application/pdf',
      buffer: bytesA,
    });
    await documents
      .getByRole('button', { name: 'Preserve PDF', exact: true })
      .click();
    await expect(documents.getByText(firstName, { exact: true })).toBeVisible();
    await expectDownload(
      page,
      documents.getByRole('button', {
        name: 'Download Version 1 PDF',
        exact: true,
      }),
      bytesA,
      firstName,
    );
    await expect(file).toHaveValue('');
    await file.setInputFiles({
      name: secondName,
      mimeType: 'application/pdf',
      buffer: bytesB,
    });
    // A competing public reference command advances this same Document. The
    // selected PDF intention must conflict, reload, then use the fresh revision.
    const competing = await page.request.post(
      `${origin}/api/documents/${documentId}/versions/${versionId}/representations`,
      {
        headers: { ...identity, 'idempotency-key': randomUUID() },
        data: {
          expectedRevision: 2,
          form: 'other',
          url: 'https://example.test/concurrent-reference',
        },
      },
    );
    expect(competing.status()).toBe(201);
    await documents
      .getByRole('button', { name: 'Preserve PDF', exact: true })
      .click();
    await documents
      .getByRole('button', {
        name: 'Reload Document and Versions',
        exact: true,
      })
      .click();
    await expect(file).toBeVisible();
    await expect(file).toHaveValue('');
    await expect(
      documents.getByRole('button', { name: 'Preserve PDF', exact: true }),
    ).toBeDisabled();
    await file.setInputFiles({
      name: secondName,
      mimeType: 'application/pdf',
      buffer: bytesB,
    });
    await documents
      .getByRole('button', { name: 'Preserve PDF', exact: true })
      .click();
    await expect(
      documents.getByText(secondName, { exact: true }),
    ).toBeVisible();
    // A complete browser reload proves persistence rather than component memory.
    documents = await openDocument(page, title, narrow);
    await expect(
      documents.getByText(secondName, { exact: true }),
    ).toBeVisible();
    await expectDownload(
      page,
      documents.getByRole('button', {
        name: 'Download Version 1 PDF',
        exact: true,
      }),
      bytesB,
      secondName,
    );
    await documents
      .getByRole('button', { name: 'PDF history', exact: true })
      .click();
    const history = documents.getByRole('list', {
      name: 'PDF history',
      exact: true,
    });
    await expect(history.getByRole('listitem')).toHaveCount(2);
    await expectDownload(
      page,
      history
        .getByRole('listitem')
        .filter({ has: page.getByText(firstName, { exact: true }) })
        .getByRole('button', { name: 'Download Version 1 PDF', exact: true }),
      bytesA,
      firstName,
    );
    const dimensions = await page.evaluate(() => ({
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
    }));
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
    await page.screenshot({
      path: testInfo.outputPath('preserved-questionnaire-pdf.png'),
      fullPage: true,
    });
    await assign({
      request: page.request,
      role: 'reader',
      companyId,
      membershipId,
      active: false,
    });
    documents = await openDocument(page, title, narrow);
    await expect(
      documents.getByText(
        'Reading metadata does not grant access to the PDF file.',
      ),
    ).toBeVisible();
    await expect(
      documents.getByRole('button', {
        name: 'Download Version 1 PDF',
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(documents.getByText(firstName, { exact: true })).toHaveCount(
      0,
    );
    await expect(documents.getByText(secondName, { exact: true })).toHaveCount(
      0,
    );
    const refused = await page.request.get(
      `${origin}/api/documents/${documentId}/versions/${versionId}/content`,
      { headers: identity },
    );
    expect(refused.status()).toBe(403);
  } finally {
    for (const role of granted)
      await assign({
        request: page.request,
        role,
        companyId,
        membershipId,
        active: false,
      });
  }
});
