import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createMissionDocumentFixture,
  json,
  record,
  text,
  PDF_A,
  PDF_B,
  type MissionDocumentFixture,
} from './mission-document.test-support.js';
const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;
withPostgres('D3 governed mission-deliverable PDFs REST', () => {
  let fixture: MissionDocumentFixture;
  let membershipId: string;
  let clientId: string;
  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    fixture = await createMissionDocumentFixture(databaseUrl);
  });
  afterAll(async () => {
    await fixture?.close();
  });
  beforeEach(async () => {
    ({ membershipId, clientId } = await fixture.reset());
  });
  const call = (...args: Parameters<MissionDocumentFixture['call']>) =>
    fixture.call(...args);
  const grant = (...args: Parameters<MissionDocumentFixture['grant']>) =>
    fixture.grant(...args);
  const upload = (...args: Parameters<MissionDocumentFixture['upload']>) =>
    fixture.upload(...args);
  it('registers an explicitly authorized reference-free mission draft and reopens its empty Version', async () => {
    await grant('/company-mission-deliverable-access-assignments');
    const actor = await json(await call('/access/current-actor'));
    expect(record(actor.activeCompany).documentPermissions).toContain(
      'document.mission_deliverable.access',
    );
    const response = await call('/documents', {
      method: 'POST',
      body: {
        type: 'mission-deliverable',
        clientId,
        title: 'Mission result DEMO',
        purpose: 'Preserve the consulting mission output',
      },
    });
    expect(response.status).toBe(201);
    const document = await json(response);
    expect(document).toMatchObject({
      type: 'mission-deliverable',
      confidentiality: 'company-confidential',
      workingRevision: 1,
      version: { status: 'draft', representation: null },
    });
    const read = await call(`/documents/${text(document.id)}`);
    expect(read.status).toBe(200);
    expect(await read.json()).toEqual(document);
    const versions = await call(`/documents/${text(document.id)}/versions`);
    expect(versions.status).toBe(200);
    expect(await versions.json()).toMatchObject({
      workingRevision: 1,
      mutable: true,
      versions: [
        {
          number: 1,
          status: 'draft',
          representations: [],
          pdfContent: { state: 'absent' },
        },
      ],
    });
  });
  it('refuses official designation of an empty mission draft without changing its revision or content state', async () => {
    await grant('/company-mission-deliverable-access-assignments');
    await grant('/company-document-approver-assignments');
    const registered = await call('/documents', {
      method: 'POST',
      body: {
        type: 'mission-deliverable',
        clientId,
        title: 'Empty result DEMO',
        purpose: 'Await preserved content',
      },
    });
    expect(registered.status).toBe(201);
    const document = await json(registered);
    const documentId = text(document.id);
    const versionId = text(record(document.version).id);
    const result = await call(
      `/documents/${documentId}/versions/${versionId}/official-designation`,
      {
        method: 'POST',
        body: { expectedRevision: 1 },
      },
    );
    expect(result.status).toBe(409);
    expect(await result.json()).toMatchObject({
      code: 'document_pdf_required',
    });
    expect(await json(await call(`/documents/${documentId}`))).toMatchObject({
      workingRevision: 1,
      version: { id: versionId, status: 'draft' },
    });
  });

  it('also rejects an empty official mission Version at the database integrity boundary', async () => {
    await grant('/company-mission-deliverable-access-assignments');
    const registered = await call('/documents', {
      method: 'POST',
      body: {
        type: 'mission-deliverable',
        clientId,
        title: 'Guarded result DEMO',
        purpose: 'Require stored content',
      },
    });
    expect(registered.status).toBe(201);
    const document = await json(registered);
    const versionId = text(record(document.version).id);
    await expect(
      fixture.pool.query(
        "UPDATE document_versions SET status='official', designated_at=now(), designated_by_membership_id=$2, frozen_title='Guarded result DEMO', frozen_purpose='Require stored content' WHERE id=$1",
        [versionId, membershipId],
      ),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'mission_document_version_pdf_required',
    });
    expect(
      await json(await call(`/documents/${text(document.id)}`)),
    ).toMatchObject({
      workingRevision: 1,
      version: { id: versionId, status: 'draft' },
    });
  });

  it('preserves two distinct official mission PDFs through an empty successor draft and exact historical downloads', async () => {
    await grant('/company-mission-deliverable-access-assignments');
    await grant('/company-document-content-reader-assignments');
    await grant('/company-document-content-uploader-assignments');
    await grant('/company-document-approver-assignments');
    const registered = await call('/documents', {
      method: 'POST',
      body: {
        type: 'mission-deliverable',
        clientId,
        title: 'Mission output DEMO',
        purpose: 'Exact preserved Versions',
      },
    });
    expect(registered.status).toBe(201);
    const document = await json(registered);
    const documentId = text(document.id);
    const firstVersionId = text(record(document.version).id);
    const firstUpload = await upload({
      documentId,
      versionId: firstVersionId,
      revision: 1,
      bytes: PDF_A,
    });
    expect(firstUpload.status).toBe(201);
    expect(await firstUpload.json()).toMatchObject({
      workingRevision: 2,
      versionId: firstVersionId,
      action: 'representation_added',
    });
    const firstDownload = await call(
      `/documents/${documentId}/versions/${firstVersionId}/content`,
    );
    expect(firstDownload.status).toBe(200);
    expect(Buffer.from(await firstDownload.arrayBuffer())).toEqual(PDF_A);
    const official = await call(
      `/documents/${documentId}/versions/${firstVersionId}/official-designation`,
      { method: 'POST', body: { expectedRevision: 2 } },
    );
    expect(official.status).toBe(200);
    const drafted = await call(`/documents/${documentId}/versions`, {
      method: 'POST',
      body: { expectedRevision: 3 },
    });
    expect(drafted.status).toBe(201);
    const receipt = await json(drafted);
    const nextVersionId = text(receipt.versionId);
    expect(receipt).toMatchObject({
      action: 'drafted',
      versionNumber: 2,
      sourceVersionNumber: 1,
      workingRevision: 4,
    });
    const intermediate = await call(`/documents/${documentId}/versions`);
    expect(await intermediate.json()).toMatchObject({
      versions: [
        {
          id: nextVersionId,
          status: 'draft',
          representations: [],
          pdfContent: { state: 'absent' },
        },
        {
          id: firstVersionId,
          status: 'official',
          representations: [],
          pdfContent: { state: 'stored', access: 'granted' },
        },
      ],
    });
    expect(PDF_B).not.toEqual(PDF_A);
    const replacement = await upload({
      documentId,
      versionId: nextVersionId,
      revision: 4,
      bytes: PDF_B,
    });
    expect(replacement.status).toBe(201);
    expect(
      (
        await call(
          `/documents/${documentId}/versions/${nextVersionId}/official-designation`,
          { method: 'POST', body: { expectedRevision: 5 } },
        )
      ).status,
    ).toBe(200);
    const history = await call(`/documents/${documentId}/versions`);
    expect(await history.json()).toMatchObject({
      workingRevision: 6,
      versions: [
        { id: nextVersionId, status: 'official' },
        {
          id: firstVersionId,
          status: 'superseded',
          supersededByVersionNumber: 2,
        },
      ],
    });
    for (const [versionId, expected] of [
      [firstVersionId, PDF_A],
      [nextVersionId, PDF_B],
    ] as const) {
      const download = await call(
        `/documents/${documentId}/versions/${versionId}/content`,
      );
      expect(download.status).toBe(200);
      expect(Buffer.from(await download.arrayBuffer())).toEqual(expected);
    }
    expect(fixture.scanCount).toBe(2);
  });

  it('corrects mission draft metadata with a stable receipt and URL-free material history', async () => {
    await grant('/company-mission-deliverable-access-assignments');
    const registered = await call('/documents', {
      method: 'POST',
      body: {
        type: 'mission-deliverable',
        clientId,
        title: 'Draft result DEMO',
        purpose: 'Initial result description',
      },
    });
    expect(registered.status).toBe(201);
    const documentId = text((await json(registered)).id);
    const body = {
      expectedRevision: 1,
      title: 'Corrected result DEMO',
      purpose: 'Revised result description',
    };
    const changed = await call(`/documents/${documentId}`, {
      method: 'PATCH',
      body,
      key: 'mission-metadata-first',
    });
    expect(changed.status).toBe(200);
    const receipt = await changed.json();
    expect(receipt).toMatchObject({ outcome: 'corrected', revision: 2 });
    const replay = await call(`/documents/${documentId}`, {
      method: 'PATCH',
      body,
      key: 'mission-metadata-first',
    });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(receipt);
    const noOp = await call(`/documents/${documentId}`, {
      method: 'PATCH',
      body: { ...body, expectedRevision: 2 },
    });
    expect(noOp.status).toBe(200);
    expect(await noOp.json()).toMatchObject({
      outcome: 'unchanged',
      revision: 2,
    });
    expect(await json(await call(`/documents/${documentId}`))).toMatchObject({
      workingRevision: 2,
      title: 'Corrected result DEMO',
      purpose: 'Revised result description',
    });
    const history = await call(`/documents/${documentId}/correction-history`);
    expect(history.status).toBe(200);
    const result = await json(history);
    expect(result).toMatchObject({
      corrections: [
        {
          revision: 2,
          changes: {
            title: {
              before: 'Draft result DEMO',
              after: 'Corrected result DEMO',
            },
            purpose: {
              before: 'Initial result description',
              after: 'Revised result description',
            },
          },
        },
      ],
      nextBeforeRevision: null,
    });
    if (!Array.isArray(result.corrections))
      throw new Error('Expected correction history.');
    expect(record(record(result.corrections[0]).changes)).not.toHaveProperty(
      'url',
    );
  });

  it('keeps the PDF-only family free of external URL registration, correction and typed references', async () => {
    await grant('/company-mission-deliverable-access-assignments');
    const registration = {
      type: 'mission-deliverable',
      clientId,
      title: 'PDF only DEMO',
      purpose: 'No external reference placeholder',
    };
    expect(
      (
        await call('/documents', {
          method: 'POST',
          body: {
            ...registration,
            url: 'https://example.test/not-a-mission-pdf',
          },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call('/documents', {
          method: 'POST',
          body: { ...registration, type: 'unsupported-family' },
        })
      ).status,
    ).toBe(400);
    const registered = await call('/documents', {
      method: 'POST',
      body: registration,
    });
    expect(registered.status).toBe(201);
    const document = await json(registered);
    const documentId = text(document.id);
    const versionId = text(record(document.version).id);
    expect(
      (
        await call(`/documents/${documentId}`, {
          method: 'PATCH',
          body: {
            expectedRevision: 1,
            url: 'https://example.test/not-a-mission-pdf',
          },
        })
      ).status,
    ).toBe(400);
    const reference = await call(
      `/documents/${documentId}/versions/${versionId}/representations`,
      {
        method: 'POST',
        body: {
          expectedRevision: 1,
          form: 'other',
          url: 'https://example.test/not-a-mission-pdf',
        },
      },
    );
    expect(reference.status).toBe(400);
    expect(await json(await call(`/documents/${documentId}`))).toMatchObject({
      workingRevision: 1,
      version: { representation: null },
    });
  });

  it('keeps the stored family immutable and forbids mission external references at the integrity boundary', async () => {
    await grant('/company-mission-deliverable-access-assignments');
    const registered = await call('/documents', {
      method: 'POST',
      body: {
        type: 'mission-deliverable',
        clientId,
        title: 'Immutable family DEMO',
        purpose: 'No relabelled questionnaire',
      },
    });
    expect(registered.status).toBe(201);
    const document = await json(registered);
    const documentId = text(document.id);
    const versionId = text(record(document.version).id);
    await expect(
      fixture.pool.query(
        "UPDATE working_documents SET type='questionnaire' WHERE id=$1",
        [documentId],
      ),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'document_family_immutable',
    });
    const actor = await json(await call('/access/current-actor'));
    await expect(
      fixture.pool.query(
        'INSERT INTO document_representations (workspace_id, company_id, version_id, url, added_by_membership_id) VALUES ($1,$2,$3,$4,$5)',
        [
          text(actor.workspaceId),
          text(document.companyId),
          versionId,
          'https://example.test/forbidden',
          membershipId,
        ],
      ),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'mission_document_external_reference_forbidden',
    });
    expect(
      await json(await call(`/documents/${documentId}/versions`)),
    ).toMatchObject({
      workingRevision: 1,
      versions: [{ representations: [], pdfContent: { state: 'absent' } }],
    });
  });
});
