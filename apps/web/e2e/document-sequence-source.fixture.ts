import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { expect } from './ui-chaos.fixture';
import {
  accessApiOrigin as apiOrigin,
  accessIdentities as identities,
  accessObject as object,
  accessText as text,
  prepareAccessSequenceCase,
} from './access-sequence-source.fixture';

export {
  apiOrigin as documentApiOrigin,
  identities as documentIdentities,
  object as documentObject,
  text as documentText,
};

/** Fresh Companies and a real original Client/Document; scanner and storage stay native. */
export async function prepareDocumentSequenceSource(
  page: Page,
  suffix: string,
) {
  const ready = await prepareAccessSequenceCase(page, suffix);
  for (const company of ['a', 'b'] satisfies Array<
    keyof typeof ready.companies
  >) {
    for (const bundle of [
      'company-context',
      'company-director-client',
      'company-document-registrar',
    ])
      await ready.grant(bundle, company);
  }
  for (const bundle of [
    'company-document-approver',
    'company-document-content-reader',
    'company-document-content-uploader',
  ])
    await ready.grant(bundle, 'a');
  const companyId = ready.companies.a.id;
  const headers = { ...identities.member, 'x-company-context-id': companyId };
  async function command(path: string, data: unknown) {
    const response = await page.request.post(apiOrigin + path, {
      headers: { ...headers, 'idempotency-key': randomUUID() },
      data,
    });
    expect([200, 201], path).toContain(response.status());
    return object(await response.json());
  }
  const client = await command('/clients', {
    displayName: `Fictional Document Client ${suffix}`,
  });
  const title = `Fictional Document ${suffix}`;
  const reference = `https://example.test/document-sequence/${randomUUID()}`;
  const document = await command('/documents', {
    clientId: text(client.id),
    title,
    purpose: 'Synthetic native Document verification',
    url: reference,
  });
  const documentId = text(document.id);
  const firstVersionId = text(object(document.version).id);
  const pdfA = await readFile(
    new URL(
      '../../api/test-support/fixtures/questionnaire-demo.pdf',
      import.meta.url,
    ),
  );
  const pdfB = Buffer.from(
    pdfA
      .toString('utf8')
      .replace('DEMO questionnaire A', 'DEMO questionnaire B'),
  );
  expect(pdfB).not.toEqual(pdfA);
  async function versions() {
    const response = await page.request.get(
      `${apiOrigin}/documents/${documentId}/versions`,
      { headers },
    );
    expect(response.status()).toBe(200);
    const projection = object(await response.json());
    if (!Array.isArray(projection.versions))
      throw new Error('Expected native Document Versions');
    return {
      revision: projection.workingRevision,
      versions: projection.versions.map(object),
    };
  }
  return {
    ...ready,
    companyId,
    documentId,
    firstVersionId,
    title,
    reference,
    pdfA,
    pdfB,
    headers,
    command,
    versions,
  };
}
