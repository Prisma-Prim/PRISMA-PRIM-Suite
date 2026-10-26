import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { selectOption } from './select-option';

const origin = 'http://127.0.0.1:4174/api';
const owner = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'workspace-owner',
  'x-test-display-name': 'Workspace Owner',
  'x-test-email': 'owner@example.test',
};
const reader = {
  ...owner,
  'x-test-external-subject': 'local-demonstration-user',
  'x-test-display-name': 'Ada Ionescu',
  'x-test-email': 'ada@example.test',
};
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a public response');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new Error('Expected identity');
  return value;
}
function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw new Error('Expected revision');
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
  const saved = await (await pending).path();
  if (!saved) throw new Error('Missing download');
  expect(await readFile(saved)).toEqual(bytes);
}

test('continues Client Documents beyond its first local window through exact preserved Version and PDF history', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const narrow = info.project.name.endsWith('narrow'),
    suffix = narrow ? 'Narrow' : 'Desktop';
  const companyName = `Client Documents DEMO ${suffix}`,
    clientName = `Same-name Document Client ${suffix}`;
  const title = `Representative governed mission ${suffix}`;
  async function post(
    path: string,
    data: unknown,
    identity = owner,
    companyId?: string,
    expectedStatus = 201,
  ) {
    const response = await page.request.post(origin + path, {
      headers: {
        ...identity,
        ...(companyId ? { 'x-company-context-id': companyId } : {}),
        'idempotency-key': randomUUID(),
      },
      data,
    });
    expect(response.status(), path).toBe(expectedStatus);
    return object(await response.json());
  }
  const companyId = text(
    (await post('/companies', { displayName: companyName })).id,
  );
  const actor = await page.request.get(origin + '/access/current-actor', {
    headers: reader,
  });
  expect(actor.status()).toBe(200);
  const membershipId = text(object(await actor.json()).workspaceMembershipId);
  for (const bundle of [
    'context',
    'director-client',
    'document-registrar',
    'mission-deliverable-access',
    'document-content-reader',
    'document-content-uploader',
    'document-approver',
  ])
    await post(`/company-${bundle}-assignments`, {
      companyId,
      workspaceMembershipId: membershipId,
    });
  const headers = { ...reader, 'x-company-context-id': companyId };
  const clientId = text(
    (await post('/clients', { displayName: clientName }, reader, companyId)).id,
  );
  const unrelatedId = text(
    (await post('/clients', { displayName: clientName }, reader, companyId)).id,
  );
  const target = await post(
    '/documents',
    {
      type: 'mission-deliverable',
      clientId,
      title,
      purpose:
        'Synthetic preserved mission output, no operational approval inferred.',
    },
    reader,
    companyId,
  );
  const documentId = text(target.id),
    firstVersionId = text(object(target.version).id);
  let revision = integer(target.workingRevision);
  const original = await readFile(
    fileURLToPath(
      new URL(
        '../../api/test-support/fixtures/questionnaire-demo.pdf',
        import.meta.url,
      ),
    ),
  );
  const corrected = Buffer.from(original),
    successor = Buffer.from(original);
  const marker = original.indexOf('DEMO');
  expect(marker).toBeGreaterThanOrEqual(0);
  corrected.write('D002', marker, 'ascii');
  successor.write('D003', marker, 'ascii');
  async function upload(versionId: string, fileName: string, bytes: Buffer) {
    const response = await page.request.post(
      `${origin}/documents/${documentId}/versions/${versionId}/content?expectedRevision=${revision}&fileName=${encodeURIComponent(fileName)}`,
      {
        headers: {
          ...headers,
          'idempotency-key': randomUUID(),
          'content-type': 'application/pdf',
        },
        data: bytes,
      },
    );
    expect(response.status()).toBe(201);
    const receipt = object(await response.json());
    revision = integer(receipt.workingRevision);
    return text(receipt.representationId);
  }
  const originalRepresentationId = await upload(
    firstVersionId,
    'client-original.pdf',
    original,
  );
  await upload(firstVersionId, 'client-corrected.pdf', corrected);
  revision = integer(
    (
      await post(
        `/documents/${documentId}/versions/${firstVersionId}/official-designation`,
        { expectedRevision: revision },
        reader,
        companyId,
        200,
      )
    ).workingRevision,
  );
  const draft = await post(
    `/documents/${documentId}/versions`,
    { expectedRevision: revision },
    reader,
    companyId,
  );
  revision = integer(draft.workingRevision);
  const secondVersionId = text(draft.versionId);
  await upload(secondVersionId, 'client-successor.pdf', successor);
  revision = integer(
    (
      await post(
        `/documents/${documentId}/versions/${secondVersionId}/official-designation`,
        { expectedRevision: revision },
        reader,
        companyId,
        200,
      )
    ).workingRevision,
  );
  expect(revision).toBe(7);
  for (let index = 0; index < 25; index += 1)
    await post(
      '/documents',
      {
        clientId,
        title: `Supporting piece ${index} ${suffix}`,
        purpose: 'Synthetic working reference',
        url: `https://example.test/supporting-${suffix}-${index}`,
      },
      reader,
      companyId,
    );
  for (let index = 0; index < 52; index += 1)
    await post(
      '/documents',
      {
        clientId: unrelatedId,
        title: `Unrelated same-name piece ${index} ${suffix}`,
        purpose: 'Different exact Client',
        url: `https://example.test/unrelated-${suffix}-${index}`,
      },
      reader,
      companyId,
    );

  const browserWrites: string[] = [];
  page.on('request', (request) => {
    if (
      new URL(request.url()).pathname.startsWith('/api/') &&
      request.method() !== 'GET'
    )
      browserWrites.push(request.method());
  });
  async function openInline() {
    await page.goto('/#clients');
    if (narrow)
      await page.getByRole('button', { name: 'Open navigation' }).click();
    await selectOption(page.getByLabel('Active Company', { exact: true }), {
      label: companyName,
    });
    if (narrow)
      await page.getByRole('button', { name: 'Close navigation' }).click();
    await navigate(page, 'Clients', narrow);
    const clients = page.locator('.client-workspace');
    const row = clients
      .locator('.client-directory li')
      .filter({ hasText: clientId });
    await expect(row).toHaveCount(1);
    await row
      .getByRole('button', { name: 'Open dossier', exact: true })
      .click();
    const overview = page.getByRole('region', {
      name: 'Client Documents',
      exact: true,
    });
    await expect(overview.getByRole('listitem')).toHaveCount(25);
    await expect(overview).toContainText(companyName);
    await expect(overview).not.toContainText('Unrelated same-name');
    await expect(overview.getByRole('link')).toHaveCount(0);
    await overview
      .getByRole('button', { name: 'Next Documents', exact: true })
      .click();
    await expect(overview.getByRole('listitem')).toHaveCount(1);
    await expect(
      overview.getByRole('heading', { name: title, exact: true }),
    ).toBeVisible();
    return overview;
  }
  const overview = await openInline();
  await overview.screenshot({
    path: info.outputPath(
      `client-documents-window-${suffix.toLowerCase()}.png`,
    ),
  });
  await overview
    .getByRole('button', { name: 'Open Document', exact: true })
    .click();
  const documents = page.locator('.working-documents'),
    detail = documents.locator('.working-document-detail');
  await expect(
    detail.getByRole('heading', { name: title, exact: true }),
  ).toBeFocused();
  const version1 = detail
    .locator('.working-document-versions-list > li')
    .filter({
      has: page.getByRole('heading', { name: 'Version 1', exact: true }),
    });
  const version2 = detail
    .locator('.working-document-versions-list > li')
    .filter({
      has: page.getByRole('heading', { name: 'Version 2', exact: true }),
    });
  await expect(
    version1.getByText('Superseded by Version 2', { exact: true }),
  ).toBeVisible();
  await download(
    page,
    version1.getByRole('button', {
      name: 'Download Version 1 PDF',
      exact: true,
    }),
    corrected,
  );
  await download(
    page,
    version2.getByRole('button', {
      name: 'Download Version 2 PDF',
      exact: true,
    }),
    successor,
  );
  await version1
    .getByRole('button', { name: 'PDF history', exact: true })
    .click();
  const history = version1.getByRole('list', {
    name: 'PDF history',
    exact: true,
  });
  await expect(history.getByRole('listitem')).toHaveCount(2);
  await download(
    page,
    history
      .getByRole('listitem')
      .filter({ hasText: 'client-original.pdf' })
      .getByRole('button', { name: 'Download Version 1 PDF', exact: true }),
    original,
  );
  await detail.locator('.working-document-versions').screenshot({
    path: info.outputPath(
      `client-documents-history-${suffix.toLowerCase()}.png`,
    ),
  });
  expect(page.url()).not.toContain(documentId);
  expect(page.url()).not.toContain(clientId);
  await expect(page.locator('body')).toHaveJSProperty(
    'scrollWidth',
    await page.evaluate(() => document.documentElement.clientWidth),
  );

  const revoked = await page.request.delete(
    `${origin}/company-document-content-reader-assignments/${membershipId}/${companyId}`,
    { headers: { ...owner, 'idempotency-key': randomUUID() } },
  );
  expect(revoked.status()).toBe(200);
  // The Company is unchanged. Reload to revalidate the externally revoked grant
  // and start a fresh dossier; hash navigation deliberately preserves local windows.
  await page.reload();
  const afterRevocation = await openInline();
  await expect(afterRevocation).toContainText(title);
  await afterRevocation
    .getByRole('button', { name: 'Open Document', exact: true })
    .click();
  await expect(
    detail.getByRole('heading', { name: title, exact: true }),
  ).toBeFocused();
  await expect(
    detail.getByRole('heading', { name: 'Version 1', exact: true }),
  ).toBeVisible();
  await expect(
    detail.getByRole('heading', { name: 'Version 2', exact: true }),
  ).toBeVisible();
  await expect(
    detail.getByRole('button', { name: /Download Version/u }),
  ).toHaveCount(0);
  await expect(
    detail.getByRole('button', { name: 'PDF history', exact: true }),
  ).toHaveCount(0);
  await expect(detail).not.toContainText('client-original.pdf');
  await expect(detail).not.toContainText('client-corrected.pdf');
  await expect(detail).not.toContainText('client-successor.pdf');
  expect(
    (
      await page.request.get(`${origin}/documents/${documentId}`, { headers })
    ).status(),
  ).toBe(200);
  for (const path of [
    `/documents/${documentId}/versions/${firstVersionId}/content`,
    `/documents/${documentId}/versions/${firstVersionId}/content/history`,
    `/documents/${documentId}/versions/${firstVersionId}/content/${originalRepresentationId}`,
  ])
    expect(
      (await page.request.get(origin + path, { headers })).status(),
      path,
    ).toBe(403);
  await detail.locator('.working-document-versions').screenshot({
    path: info.outputPath(
      `client-documents-content-denied-${suffix.toLowerCase()}.png`,
    ),
  });
  expect(browserWrites).toEqual([]);
});
