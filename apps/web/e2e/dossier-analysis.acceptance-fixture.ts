import { randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { strToU8, zipSync } from 'fflate';
import { expect, type APIRequestContext } from '@playwright/test';

const origin = 'http://127.0.0.1:4174/api';
const owner = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'workspace-owner',
  'x-test-display-name': 'Workspace Owner',
  'x-test-email': 'owner@example.test',
};
const editor = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'local-demonstration-user',
  'x-test-display-name': 'Ada Ionescu',
  'x-test-email': 'ada@example.test',
};
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected public JSON object');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value)
    throw new Error('Expected public identifier');
  return value;
}
export async function prepareDossier(
  request: APIRequestContext,
  suffix: string,
) {
  const membershipId = process.env.ACCEPTANCE_PRIMARY_MEMBERSHIP_ID;
  if (!membershipId) throw new Error('Acceptance membership required');
  const createdCompany = await request.post(`${origin}/companies`, {
    headers: { ...owner, 'idempotency-key': randomUUID() },
    data: { displayName: `Synthetic Dossier Company ${suffix}` },
  });
  expect(createdCompany.status(), await createdCompany.text()).toBe(201);
  const companyId = text(object(await createdCompany.json()).id);
  async function post(path: string, data: unknown, admin = false) {
    const response = await request.post(origin + path, {
      headers: {
        ...(admin ? owner : editor),
        ...(admin ? {} : { 'x-company-context-id': companyId }),
        'idempotency-key': randomUUID(),
      },
      data,
    });
    expect(response.status(), `${path}: ${await response.text()}`).toBe(201);
    return object(await response.json());
  }
  for (const bundle of [
    'context',
    'director-client',
    'project',
    'document-registrar',
    'document-project-organizer',
    'document-content-reader',
    'document-content-uploader',
    'document-approver',
  ])
    await post(
      `/company-${bundle}-assignments`,
      { companyId, workspaceMembershipId: membershipId },
      true,
    );
  const clientId = text(
    (
      await post('/clients', {
        displayName: `Fictional Dossier Client ${suffix}`,
      })
    ).id,
  );
  const title = `Fictional Dossier ${suffix}`;
  const projectId = text(
    (await post('/projects', { title, clientAccountId: clientId })).id,
  );
  const document = await post('/documents', {
    clientId,
    title: `Dossier Original ${suffix}`,
    purpose: 'Synthetic test evidence',
    url: 'https://example.test/fictional',
  });
  const documentId = text(document.id);
  const versionId = text(object(document.version).id);
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText('Tax ID: RO12345678');
  pdf.addPage(); // A page with no extractable text is explicitly unreadable.
  const bytes = Buffer.from(await pdf.save({ useObjectStreams: false }));
  const upload = await request.post(
    `${origin}/documents/${documentId}/versions/${versionId}/content?expectedRevision=1&fileName=dossier.pdf`,
    {
      headers: {
        ...editor,
        'x-company-context-id': companyId,
        'idempotency-key': randomUUID(),
        'content-type': 'application/pdf',
      },
      data: bytes,
    },
  );
  expect(upload.status(), await upload.text()).toBe(201);
  const designation = await request.post(
    `${origin}/documents/${documentId}/versions/${versionId}/official-designation`,
    {
      headers: {
        ...editor,
        'x-company-context-id': companyId,
        'idempotency-key': randomUUID(),
      },
      data: { expectedRevision: 2 },
    },
  );
  expect(designation.status(), await designation.text()).toBe(200);
  await post(`/documents/${documentId}/project-association`, {
    action: 'link',
    projectId,
    expectedRevision: 0,
  });
  const parts: Record<string, string> = {
    '[Content_Types].xml':
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels':
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="root" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/_rels/document.xml.rels':
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>',
    'word/document.xml': [
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>',
      '<w:tbl><w:tr><w:tc><w:p><w:r><w:t xml:space="preserve">  Cod fiscal</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>RO87654321</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
      '<w:p><w:r><w:pict xmlns:v="urn:schemas-microsoft-com:vml"><v:shape id="fictional-diagram" style="width:120pt;height:40pt"><v:textbox><w:txbxContent><w:p><w:r><w:t>Организация: учебный пример</w:t></w:r></w:p></w:txbxContent></v:textbox></v:shape></w:pict></w:r></w:p>',
      '</w:body></w:document>',
    ].join(''),
  };
  const docx = Buffer.from(
    zipSync(
      Object.fromEntries(
        Object.entries(parts).map(([name, value]) => [name, strToU8(value)]),
      ),
    ),
  );
  return {
    companyId,
    clientId,
    projectId,
    documentId,
    versionId,
    title,
    bytes,
    docx,
  };
}

export async function startNativeVersion(
  request: APIRequestContext,
  companyId: string,
  documentId: string,
) {
  const headers = { ...editor, 'x-company-context-id': companyId };
  const read = await request.get(`${origin}/documents/${documentId}`, {
    headers,
  });
  expect(read.status(), await read.text()).toBe(200);
  const revision = object(await read.json()).workingRevision;
  if (typeof revision !== 'number') throw new Error('Expected native revision');
  const created = await request.post(
    `${origin}/documents/${documentId}/versions`,
    {
      headers: { ...headers, 'idempotency-key': randomUUID() },
      data: { expectedRevision: revision },
    },
  );
  expect(created.status(), await created.text()).toBe(201);
}

export async function revokeUpload(
  request: APIRequestContext,
  companyId: string,
) {
  const membershipId = process.env.ACCEPTANCE_PRIMARY_MEMBERSHIP_ID;
  if (!membershipId) throw new Error('Acceptance membership required');
  const response = await request.delete(
    `${origin}/company-document-content-uploader-assignments/${membershipId}/${companyId}`,
    { headers: { ...owner, 'idempotency-key': randomUUID() } },
  );
  expect(response.status(), await response.text()).toBe(200);
}
