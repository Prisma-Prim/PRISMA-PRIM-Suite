import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page, type Locator } from '@playwright/test';
import { selectOption } from './select-option';
const origin = 'http://127.0.0.1:4174';
const ada = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'local-demonstration-user',
  'x-test-display-name': 'Ada Ionescu',
  'x-test-email': 'ada@example.test',
};
const owner = {
  ...ada,
  'x-test-external-subject': 'workspace-owner',
  'x-test-display-name': 'Workspace Owner',
  'x-test-email': 'owner@example.test',
};
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected identified response');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new Error('Expected identity');
  return value;
}
async function navigate(page: Page, name: string, narrow: boolean) {
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name, exact: true })
    .click();
}
async function download(page: Page, button: Locator, bytes: Buffer) {
  const pending = page.waitForEvent('download');
  await button.click();
  const result = await pending;
  const path = await result.path();
  if (!path) throw new Error('Missing browser download');
  expect(await readFile(path)).toEqual(bytes);
}

test('creates a reference-free mission, preserves exact official/successor PDFs and reopens it from its Project under independent rights', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const narrow = testInfo.project.name.endsWith('narrow');
  const suffix = narrow ? 'narrow' : 'desktop';
  const companyId = text(process.env.ACCEPTANCE_PRIMARY_COMPANY_ID);
  const membershipId = text(process.env.ACCEPTANCE_PRIMARY_MEMBERSHIP_ID);
  const identity = {
    ...ada,
    'x-company-context-id': companyId,
    'idempotency-key': randomUUID(),
  };
  const title = `Mission deliverable DEMO ${suffix}`;
  const clientName = `Mission Client DEMO ${suffix}`;
  const projectTitle = `Mission Project DEMO ${suffix}`;
  const pdfA = await readFile(
    fileURLToPath(
      new URL(
        '../../api/test-support/fixtures/questionnaire-demo.pdf',
        import.meta.url,
      ),
    ),
  );
  const pdfB = Buffer.from(pdfA);
  pdfB.write('NEXT', pdfB.indexOf('DEMO'), 'ascii');
  const unavailable = Buffer.from(pdfA);
  unavailable.write('UNAV', unavailable.indexOf('DEMO'), 'ascii');
  const grants = new Set<string>();
  async function assign(bundle: string, active: boolean) {
    const path = `${origin}/api/company-${bundle}-assignments`;
    const headers = { ...owner, 'idempotency-key': randomUUID() };
    const response = active
      ? await page.request.post(path, {
          headers,
          data: { companyId, workspaceMembershipId: membershipId },
        })
      : await page.request.delete(`${path}/${membershipId}/${companyId}`, {
          headers,
        });
    expect(response.status()).toBe(active ? 201 : 200);
    if (active) grants.add(bundle);
    else grants.delete(bundle);
  }
  async function openDocuments() {
    await page.goto('/');
    if (narrow)
      await page.getByRole('button', { name: 'Open navigation' }).click();
    await selectOption(page.getByLabel('Active Company', { exact: true }), {
      label: 'PRISMA-PRIM',
    });
    if (narrow)
      await page.getByRole('button', { name: 'Close navigation' }).click();
    await navigate(page, 'Working Documents', narrow);
    return page.locator('.working-documents');
  }
  try {
    for (const bundle of [
      'mission-deliverable-access',
      'document-content-reader',
      'document-content-uploader',
      'document-approver',
    ])
      await assign(bundle, true);
    const client = await page.request.post(`${origin}/api/clients`, {
      headers: identity,
      data: { displayName: clientName },
    });
    expect(client.status()).toBe(201);
    const clientId = text(record(await client.json()).id);
    const project = await page.request.post(`${origin}/api/projects`, {
      headers: { ...identity, 'idempotency-key': randomUUID() },
      data: { title: projectTitle, clientAccountId: clientId },
    });
    expect(project.status()).toBe(201);
    let documents = await openDocuments();
    await selectOption(documents.getByLabel('Document family'), {
      value: 'mission-deliverable',
    });
    await expect(documents.getByLabel('External HTTPS link')).toHaveCount(0);
    await selectOption(documents.getByLabel('Client', { exact: true }), {
      label: clientName,
    });
    await documents.getByLabel('Title', { exact: true }).fill(title);
    await documents
      .getByLabel('Purpose', { exact: true })
      .fill('Synthetic governed mission output');
    const registered = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        new URL(r.url()).pathname === '/api/documents',
    );
    await documents
      .getByRole('button', { name: 'Register working reference' })
      .click();
    expect((await registered).status()).toBe(201);
    const documentId = text(record(await (await registered).json()).id);
    await expect(
      documents.getByRole('heading', { name: title, exact: true }),
    ).toBeVisible();
    await expect(
      documents.getByText('This Version has no preserved PDF yet.'),
    ).toBeVisible();
    await expect(
      documents.getByRole('button', { name: 'Designate as official' }),
    ).toHaveCount(0);
    const file = documents.getByLabel('Choose the PDF file');
    await file.setInputFiles({
      name: 'unavailable-demo.pdf',
      mimeType: 'application/pdf',
      buffer: unavailable,
    });
    await documents
      .getByRole('button', { name: 'Preserve PDF', exact: true })
      .click();
    await expect(
      documents.getByText(
        'Scanning is unavailable. The PDF was not preserved. Try again when scanning is available.',
      ),
    ).toBeVisible();
    await file.setInputFiles({
      name: 'mission-a.pdf',
      mimeType: 'application/pdf',
      buffer: pdfA,
    });
    await documents
      .getByRole('button', { name: 'Preserve PDF', exact: true })
      .click();
    await expect(
      documents.getByText('mission-a.pdf', { exact: true }),
    ).toBeVisible();
    await download(
      page,
      documents.getByRole('button', {
        name: 'Download Version 1 PDF',
        exact: true,
      }),
      pdfA,
    );
    await navigate(page, 'Projects', narrow);
    const projects = page.locator('.project-workspace');
    await projects
      .getByRole('searchbox', { name: 'Find Projects' })
      .fill(projectTitle);
    await projects
      .getByRole('list', { name: 'Projects' })
      .getByRole('button', {
        name: `${projectTitle} Client: ${clientName}`,
        exact: true,
      })
      .click();
    await projects
      .getByRole('tab', { name: 'Working Documents', exact: true })
      .click();
    const attached = page.locator('.project-documents');
    await attached
      .getByRole('button', { name: 'Attach working Document' })
      .click();
    await attached
      .getByRole('button', { name: `Attach ${title}`, exact: true })
      .click();
    await expect(
      attached.getByRole('heading', { name: title, exact: true }),
    ).toBeVisible();
    await attached
      .getByRole('button', { name: 'Open Document', exact: true })
      .click();
    await expect(
      documents.getByRole('heading', { name: title, exact: true }),
    ).toBeVisible();
    await expect(
      documents.getByRole('button', { name: 'Open Project', exact: true }),
    ).toBeVisible();
    await documents
      .getByRole('button', { name: 'Designate as official', exact: true })
      .click();
    await documents
      .getByRole('button', { name: 'Confirm official designation' })
      .click();
    await documents
      .getByRole('button', { name: 'Start new draft', exact: true })
      .click();
    const version2 = documents.locator('.working-document-version').filter({
      has: page.getByRole('heading', { name: 'Version 2', exact: true }),
    });
    await expect(
      version2.getByText('This Version has no preserved PDF yet.'),
    ).toBeVisible();
    await version2.getByLabel('Choose the PDF file').setInputFiles({
      name: 'mission-b.pdf',
      mimeType: 'application/pdf',
      buffer: pdfB,
    });
    await version2
      .getByRole('button', { name: 'Preserve PDF', exact: true })
      .click();
    await expect(
      version2.getByText('mission-b.pdf', { exact: true }),
    ).toBeVisible();
    await version2
      .getByRole('button', { name: 'Designate as official', exact: true })
      .click();
    await documents
      .getByRole('button', { name: 'Confirm official designation' })
      .click();
    documents = await openDocuments();
    await documents.getByRole('button', { name: title, exact: true }).click();
    await expect(documents.getByText('Superseded by Version 2')).toBeVisible();
    await download(
      page,
      documents.getByRole('button', {
        name: 'Download Version 1 PDF',
        exact: true,
      }),
      pdfA,
    );
    await download(
      page,
      documents.getByRole('button', {
        name: 'Download Version 2 PDF',
        exact: true,
      }),
      pdfB,
    );
    await expect(page.locator('body')).toHaveJSProperty(
      'scrollWidth',
      await page.evaluate(() => document.documentElement.clientWidth),
    );
    await documents.getByRole('heading', { name: title, exact: true }).click();
    await page.screenshot({
      path: testInfo.outputPath('mission-deliverable-official-successor.png'),
      fullPage: true,
    });
    await assign('document-content-reader', false);
    documents = await openDocuments();
    await documents.getByRole('button', { name: title, exact: true }).click();
    await expect(
      documents.getByRole('heading', { name: title, exact: true }),
    ).toBeVisible();
    await expect(
      documents.getByRole('button', { name: /Download Version/u }),
    ).toHaveCount(0);
    await expect(
      documents.getByText('mission-a.pdf', { exact: true }),
    ).toHaveCount(0);
    await expect(
      documents.getByText('mission-b.pdf', { exact: true }),
    ).toHaveCount(0);
    await assign('mission-deliverable-access', false);
    documents = await openDocuments();
    await expect(
      documents.getByRole('button', { name: title, exact: true }),
    ).toHaveCount(0);
    await expect(documents.getByLabel('Document family')).toHaveCount(0);
    expect(
      (
        await page.request.get(`${origin}/api/documents/${documentId}`, {
          headers: identity,
        })
      ).status(),
    ).toBe(404);
  } finally {
    for (const bundle of [...grants].reverse()) await assign(bundle, false);
  }
});
