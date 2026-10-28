import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';
import { expect, test } from '@playwright/test';
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
    throw new Error('Expected public response');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new Error('Expected identity');
  return value;
}
test('collects exact selected mission PDFs and a historical Version by keyboard with unchanged native history', async ({
  page,
}, testInfo) => {
  const narrow = testInfo.project.name.endsWith('narrow');
  const suffix = narrow ? 'narrow' : 'desktop';
  const companyId = text(process.env.ACCEPTANCE_PRIMARY_COMPANY_ID);
  const membershipId = text(process.env.ACCEPTANCE_PRIMARY_MEMBERSHIP_ID);
  const headers = { ...ada, 'x-company-context-id': companyId };
  async function command(path: string, body: unknown) {
    const result = await page.request.post(`${origin}/api${path}`, {
      headers: { ...headers, 'idempotency-key': randomUUID() },
      data: body,
    });
    expect([200, 201]).toContain(result.status());
    return record(await result.json());
  }
  async function read(path: string) {
    const result = await page.request.get(`${origin}/api${path}`, { headers });
    expect(result.status()).toBe(200);
    return record(await result.json());
  }
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
  const bundles = [
    'mission-deliverable-access',
    'document-content-reader',
    'document-content-uploader',
    'document-approver',
  ];
  try {
    for (const bundle of bundles) {
      const result = await page.request.post(
        `${origin}/api/company-${bundle}-assignments`,
        {
          headers: { ...owner, 'idempotency-key': randomUUID() },
          data: { companyId, workspaceMembershipId: membershipId },
        },
      );
      expect(result.status()).toBe(201);
    }
    const client = await command('/clients', {
      displayName: `Bundle Client DEMO ${suffix}`,
    });
    const clientId = text(client.id);
    const project = await command('/projects', {
      title: `Selected PDFs DEMO ${suffix}`,
      clientAccountId: clientId,
    });
    const projectId = text(project.id);
    const first = await command('/documents', {
      type: 'mission-deliverable',
      clientId,
      title: `Mission originals DEMO ${suffix}`,
      purpose: 'Exact historical selected PDFs',
    });
    const firstId = text(first.id);
    const v1 = text(record(first.version).id);
    async function upload(
      documentId: string,
      versionId: string,
      revision: number,
      name: string,
      bytes: Buffer,
    ) {
      const result = await page.request.post(
        `${origin}/api/documents/${documentId}/versions/${versionId}/content?expectedRevision=${revision}&fileName=${encodeURIComponent(name)}`,
        {
          headers: {
            ...headers,
            'idempotency-key': randomUUID(),
            'content-type': 'application/pdf',
          },
          data: bytes,
        },
      );
      expect(result.status()).toBe(201);
    }
    await upload(firstId, v1, 1, 'historical-original.pdf', pdfA);
    await command(`/documents/${firstId}/versions/${v1}/official-designation`, {
      expectedRevision: 2,
    });
    const successor = await command(`/documents/${firstId}/versions`, {
      expectedRevision: 3,
    });
    const v2 = text(successor.versionId);
    await upload(firstId, v2, 4, 'current-original.pdf', pdfB);
    await command(`/documents/${firstId}/project-association`, {
      projectId,
      action: 'link',
      expectedRevision: 0,
    });
    const second = await command('/documents', {
      type: 'mission-deliverable',
      clientId,
      title: `Another original DEMO ${suffix}`,
      purpose: 'Independent selected original',
    });
    const secondId = text(second.id);
    const otherVersion = text(record(second.version).id);
    await upload(secondId, otherVersion, 1, 'another-original.pdf', pdfA);
    await command(`/documents/${secondId}/project-association`, {
      projectId,
      action: 'link',
      expectedRevision: 0,
    });
    const before = [
      await read(`/documents/${firstId}/versions`),
      await read(`/documents/${firstId}/versions/${v1}/content/history`),
      await read(`/documents/${firstId}/versions/${v2}/content/history`),
      await read(`/documents/${secondId}/versions`),
      await read(`/projects/${projectId}/documents`),
    ];
    await page.goto('/');
    if (narrow)
      await page.getByRole('button', { name: 'Open navigation' }).click();
    await selectOption(page.getByLabel('Active Company', { exact: true }), {
      label: 'PRISMA-PRIM',
    });
    await page
      .getByRole('navigation', { name: 'Primary navigation' })
      .getByRole('link', { name: 'Projects', exact: true })
      .click();
    const projects = page.locator('.project-workspace');
    await projects
      .getByRole('searchbox', { name: 'Find Projects' })
      .fill(text(project.title));
    await projects
      .getByRole('list', { name: 'Projects' })
      .getByRole('button', {
        name: `${text(project.title)} Client: ${text(client.displayName)}`,
        exact: true,
      })
      .click();
    await projects
      .getByRole('tab', { name: 'Working Documents', exact: true })
      .click();
    const panel = page.getByRole('region', { name: 'Selected Project PDFs' });
    await expect(
      panel.getByRole('button', { name: 'Download selected PDFs' }),
    ).toBeDisabled();
    async function activate(name: string) {
      const button = panel.getByRole('button', { name, exact: true });
      await button.focus();
      await button.press('Enter');
    }
    await activate('Choose PDFs');
    await activate(`Load PDF Versions — ${text(first.title)}`);
    await activate(`Load PDF Versions — ${text(second.title)}`);
    await activate(
      `Select ${text(first.title)} — Version 1 — historical-original.pdf`,
    );
    await activate(
      `Select ${text(second.title)} — Version 1 — another-original.pdf`,
    );
    await activate(
      `Select ${text(first.title)} — Version 2 — current-original.pdf`,
    );
    const download = page.waitForEvent('download');
    await activate('Download selected PDFs');
    const received = await download;
    expect(received.suggestedFilename()).toBe('selected-project-pdfs.zip');
    const path = await received.path();
    if (!path) throw new Error('Missing actual download');
    const zip = await readFile(path);
    await testInfo.attach('selected-project-pdfs.zip', {
      body: zip,
      contentType: 'application/zip',
    });
    const archive = unzipSync(zip);
    const manifest = record(
      JSON.parse(strFromU8(archive['manifest.json'] ?? new Uint8Array())),
    );
    expect(manifest).toMatchObject({
      formatVersion: 1,
      purpose: 'SELECTED_PROJECT_PDFS',
      projectId,
      companyId,
      clientId,
    });
    if (!Array.isArray(manifest.entries)) throw new Error('Expected index');
    const entries = manifest.entries.map(record);
    expect(entries.map((e) => e.versionId)).toEqual([v1, otherVersion, v2]);
    expect(Object.keys(archive)).toHaveLength(4);
    for (const [index, original] of [pdfA, pdfA, pdfB].entries()) {
      const entry = entries[index];
      if (!entry) throw new Error('Missing indexed original');
      expect(Buffer.from(archive[text(entry.path)] ?? [])).toEqual(original);
      expect(entry).toMatchObject({
        byteSize: original.length,
        sha256: createHash('sha256').update(original).digest('hex'),
      });
      expect(text(entry.path)).toMatch(
        /^[0-9]{2}-[0-9a-f-]+-[0-9a-f-]+\.pdf$/u,
      );
    }
    expect([
      await read(`/documents/${firstId}/versions`),
      await read(`/documents/${firstId}/versions/${v1}/content/history`),
      await read(`/documents/${firstId}/versions/${v2}/content/history`),
      await read(`/documents/${secondId}/versions`),
      await read(`/projects/${projectId}/documents`),
    ]).toEqual(before);
    await expect(
      panel.getByRole('heading', { name: 'Selected PDFs (3/20)' }),
    ).toBeVisible();
    await expect(page.locator('body')).toHaveJSProperty(
      'scrollWidth',
      await page.locator('body').evaluate((body) => body.clientWidth),
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath(`selected-pdfs-${suffix}.png`),
      fullPage: true,
    });
    await panel.evaluate((element) =>
      element.scrollIntoView({ block: 'start' }),
    );
    await panel.screenshot({
      path: testInfo.outputPath(`selected-pdfs-panel-${suffix}.png`),
    });
    await testInfo.attach('Selected PDFs original screenshot', {
      path: testInfo.outputPath(`selected-pdfs-${suffix}.png`),
      contentType: 'image/png',
    });
  } finally {
    for (const bundle of bundles) {
      const result = await page.request.delete(
        `${origin}/api/company-${bundle}-assignments/${membershipId}/${companyId}`,
        { headers: { ...owner, 'idempotency-key': randomUUID() } },
      );
      expect(result.status()).toBe(200);
    }
  }
});
