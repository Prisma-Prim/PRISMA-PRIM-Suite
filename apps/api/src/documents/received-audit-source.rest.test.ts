import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createMissionDocumentFixture,
  json,
  record,
  text,
  PDF_A,
  type MissionDocumentFixture,
} from './mission-document.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;
withPostgres('Received Audit source native preservation REST', () => {
  let fixture: MissionDocumentFixture;
  let clientId: string;
  let companyId: string;
  let membershipId: string;
  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    fixture = await createMissionDocumentFixture(databaseUrl);
  });
  afterAll(async () => fixture?.close());
  beforeEach(async () => {
    ({ clientId, companyId, membershipId } = await fixture.reset());
    await fixture.grant('/company-received-audit-source-access-assignments');
  });
  const body = () => ({
    type: 'received-audit-source',
    clientId,
    title: 'Fictional received observation support',
    purpose: 'Preserve an unverified fictional original without approval',
  });
  async function register(key = randomUUID()) {
    const response = await fixture.call('/documents', {
      method: 'POST',
      body: body(),
      key,
    });
    expect(response.status).toBe(201);
    const document = await json(response);
    return {
      document,
      documentId: text(document.id),
      versionId: text(record(document.version).id),
    };
  }
  async function grantContent() {
    await fixture.grant('/company-document-content-reader-assignments');
    await fixture.grant('/company-document-content-uploader-assignments');
  }
  async function revoke(path: string) {
    expect(
      (
        await fixture.call(`${path}/${membershipId}/${companyId}`, {
          method: 'DELETE',
          company: null,
        })
      ).status,
    ).toBe(200);
  }

  it('preserves original native receipts through correction and an empty successor, but rechecks source authority before replay', async () => {
    await grantContent();
    await fixture.grant('/company-document-approver-assignments');
    await fixture.grant('/company-project-assignments');
    const key = randomUUID();
    const { document, documentId, versionId } = await register(key);
    expect(document).toMatchObject({
      type: 'received-audit-source',
      confidentiality: 'company-confidential',
      version: { status: 'draft', representation: null },
    });
    expect(document).not.toHaveProperty('projectAssociation');
    const uploadInput = {
      documentId,
      versionId,
      revision: 1,
      bytes: PDF_A,
      key: randomUUID(),
    };
    const uploaded = await fixture.upload(uploadInput);
    expect(uploaded.status).toBe(201);
    const uploadReceipt = await json(uploaded);
    const designationPath = `/documents/${documentId}/versions/${versionId}/official-designation`;
    const designationInput = {
      method: 'POST',
      body: { expectedRevision: 2 },
      key: randomUUID(),
    };
    const designated = await fixture.call(designationPath, designationInput);
    expect(designated.status).toBe(200);
    const designationReceipt = await json(designated);
    expect(
      (
        await fixture.call(`/documents/${documentId}/versions`, {
          method: 'POST',
          body: { expectedRevision: 3 },
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await fixture.call(`/documents/${documentId}`, {
          method: 'PATCH',
          body: {
            expectedRevision: 4,
            title: 'Fictional corrected native label',
            purpose: 'A later unverified label',
          },
        })
      ).status,
    ).toBe(200);
    const replay = await fixture.call('/documents', {
      method: 'POST',
      body: body(),
      key,
    });
    expect(replay.status).toBe(201);
    expect(await replay.json()).toMatchObject({
      id: documentId,
      title: 'Fictional corrected native label',
      workingRevision: 5,
    });
    const versions = await json(
      await fixture.call(`/documents/${documentId}/versions`),
    );
    expect(versions).toMatchObject({
      versions: [
        {
          number: 2,
          status: 'draft',
          representations: [],
          pdfContent: { state: 'absent' },
        },
        {
          number: 1,
          status: 'official',
          frozen: { title: body().title, purpose: body().purpose },
        },
      ],
    });
    const original = await fixture.call(
      `/documents/${documentId}/versions/${versionId}/content`,
    );
    expect(original.status).toBe(200);
    expect(Buffer.from(await original.arrayBuffer())).toEqual(PDF_A);
    expect(
      (
        await fixture.call('/documents', {
          method: 'POST',
          body: { ...body(), title: 'Changed intent' },
          key,
        })
      ).status,
    ).toBe(409);
    const replayedUpload = await fixture.upload(uploadInput);
    expect(replayedUpload.status).toBe(201);
    expect(await json(replayedUpload)).toEqual(uploadReceipt);
    const replayedDesignation = await fixture.call(
      designationPath,
      designationInput,
    );
    expect(replayedDesignation.status).toBe(200);
    expect(await json(replayedDesignation)).toEqual(designationReceipt);
    expect(fixture.scanCount).toBe(1);

    await revoke('/company-received-audit-source-access-assignments');
    expect((await fixture.upload(uploadInput)).status).toBe(404);
    expect((await fixture.call(designationPath, designationInput)).status).toBe(
      404,
    );
    expect(fixture.scanCount).toBe(1);
    await fixture.grant('/company-received-audit-source-access-assignments');
    expect(
      await json(await fixture.call(`/documents/${documentId}/versions`)),
    ).toEqual(versions);
  });

  it('requires clean content but no Content Reader capture for designation or an empty successor', async () => {
    await fixture.grant('/company-document-approver-assignments');
    const { documentId, versionId } = await register();
    const path = `/documents/${documentId}/versions/${versionId}/official-designation`;
    expect(
      (
        await fixture.call(path, {
          method: 'POST',
          body: { expectedRevision: 1 },
        })
      ).status,
    ).toBe(409);
    await grantContent();
    expect(
      (
        await fixture.upload({
          documentId,
          versionId,
          revision: 1,
          bytes: PDF_A,
        })
      ).status,
    ).toBe(201);
    await revoke('/company-document-content-reader-assignments');
    expect(
      (
        await fixture.call(path, {
          method: 'POST',
          body: { expectedRevision: 2 },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await fixture.call(`/documents/${documentId}/versions`, {
          method: 'POST',
          body: { expectedRevision: 3 },
        })
      ).status,
    ).toBe(201);
    const versions = await fixture.call(`/documents/${documentId}/versions`);
    expect(versions.status).toBe(200);
    expect(await versions.json()).toMatchObject({
      versions: [
        { number: 2, status: 'draft', pdfContent: { state: 'absent' } },
        {
          number: 1,
          status: 'official',
          pdfContent: { state: 'stored', access: 'denied' },
        },
      ],
    });
    expect(
      (
        await fixture.call(
          `/documents/${documentId}/versions/${versionId}/content`,
        )
      ).status,
    ).toBe(403);
  });

  it('rejects external references, invented registration fields and known-ID Project attachment/bundle uses', async () => {
    for (const extra of [
      { url: 'https://example.test/inert' },
      { projectId: randomUUID() },
      { sha256: 'a'.repeat(64) },
    ])
      expect(
        (
          await fixture.call('/documents', {
            method: 'POST',
            body: { ...body(), ...extra },
          })
        ).status,
      ).toBe(400);
    await fixture.grant('/company-project-assignments');
    await fixture.grant('/company-document-project-organizer-assignments');
    await grantContent();
    await fixture.grant('/company-document-approver-assignments');
    const { documentId, versionId } = await register();
    const upload = await fixture.upload({
      documentId,
      versionId,
      revision: 1,
      bytes: PDF_A,
    });
    expect(upload.status).toBe(201);
    const representationId = text((await json(upload)).representationId);
    expect(
      (
        await fixture.call(
          `/documents/${documentId}/versions/${versionId}/official-designation`,
          { method: 'POST', body: { expectedRevision: 2 } },
        )
      ).status,
    ).toBe(200);
    const project = await fixture.call('/projects', {
      method: 'POST',
      body: {
        clientAccountId: clientId,
        title: 'Fictional preparation context',
      },
    });
    expect(project.status).toBe(201);
    const projectId = text((await json(project)).id);
    const eligible = await fixture.call(
      `/projects/${projectId}/eligible-documents`,
    );
    expect(eligible.status).toBe(200);
    expect(await eligible.json()).toMatchObject({ documents: [] });
    expect(
      (
        await fixture.call(`/documents/${documentId}/project-association`, {
          method: 'POST',
          body: { action: 'link', projectId, expectedRevision: 0 },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await fixture.call(`/projects/${projectId}/pdf-bundle`, {
          method: 'POST',
          body: {
            items: [
              {
                documentId,
                versionId,
                representationId,
                expectedProjectRevision: 0,
              },
            ],
          },
        })
      ).status,
    ).toBe(404);
    const reference = await fixture.call(
      `/documents/${documentId}/versions/${versionId}/representations`,
      {
        method: 'POST',
        body: {
          expectedRevision: 3,
          form: 'other',
          url: 'https://example.test/inert',
        },
      },
    );
    expect(reference.status).toBe(400);
  });

  it('rechecks the independent source gate after scanning and leaves no new byte, revision or receipt', async () => {
    await grantContent();
    const { documentId, versionId } = await register();
    const barrier = fixture.holdNextScan();
    const pending = fixture.upload({
      documentId,
      versionId,
      revision: 1,
      bytes: PDF_A,
      key: 'fictional-held-source-upload',
    });
    try {
      await Promise.race([
        barrier.reached,
        pending.then(() => {
          throw new Error('Upload ended before scan barrier.');
        }),
      ]);
      await revoke('/company-received-audit-source-access-assignments');
      barrier.release();
      expect((await pending).status).toBe(404);
    } finally {
      barrier.release();
      await pending.catch(() => undefined);
    }
    expect((await fixture.call(`/documents/${documentId}`)).status).toBe(404);
    const hidden = await fixture.call('/documents');
    expect(hidden.status).toBe(200);
    expect(await hidden.json()).toEqual([]);
    await fixture.grant('/company-received-audit-source-access-assignments');
    expect(
      await json(await fixture.call(`/documents/${documentId}/versions`)),
    ).toMatchObject({
      workingRevision: 1,
      versions: [{ number: 1, pdfContent: { state: 'absent' } }],
    });
    expect(fixture.scanCount).toBe(1);
  });
});
