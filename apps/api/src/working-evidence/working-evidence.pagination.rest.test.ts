import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  openWorkingEvidenceFixture,
  json,
  record,
  text,
  PDF_A,
  type WorkingEvidenceFixture,
} from './working-evidence.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;
withPostgres('Working Evidence exact-source selector paging', () => {
  let fixture: WorkingEvidenceFixture;
  let path: string;
  let documentId: string;
  let originalVersionId: string;
  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    fixture = await openWorkingEvidenceFixture(databaseUrl);
  });
  beforeEach(async () => {
    const { projectId, clientId } = await fixture.prepare();
    path = `/projects/${projectId}/working-evidence-sources`;
    const first = await fixture.source();
    documentId = first.documentId;
    originalVersionId = first.versionId;
    let revision = 3;
    for (let version = 2; version <= 26; version++) {
      const drafted = await fixture.call(`/documents/${documentId}/versions`, {
        method: 'POST',
        body: { expectedRevision: revision },
      });
      expect(drafted.status).toBe(201);
      const versionId = text((await json(drafted)).versionId);
      const uploaded = await fixture.native.upload({
        documentId,
        versionId,
        revision: revision + 1,
        bytes: PDF_A,
      });
      expect(uploaded.status).toBe(201);
      const designated = await fixture.call(
        `/documents/${documentId}/versions/${versionId}/official-designation`,
        { method: 'POST', body: { expectedRevision: revision + 2 } },
      );
      expect(designated.status).toBe(200);
      revision += 3;
    }
    // Newer native drafts must be excluded before the selector's 25+1 lookahead.
    // A broad native inventory LIMIT would otherwise truncate the eligible first page.
    for (let index = 0; index < 2; index++) {
      const draft = await fixture.call('/documents', {
        method: 'POST',
        body: {
          type: 'received-audit-source',
          clientId,
          title: `Fictional unqualified draft ${index + 1}`,
          purpose:
            'No preserved final PDF; excluded from exact source selection',
        },
      });
      expect(draft.status).toBe(201);
    }
  });
  afterAll(async () => fixture?.close());

  it('continues within the same immutable Document creation instant and keeps unrelated grants outside the cursor lifetime', async () => {
    const response = await fixture.call(path);
    expect(response.status).toBe(200);
    const first = await json(response);
    if (!Array.isArray(first.items)) throw new Error('Expected source page.');
    expect(first.items).toHaveLength(25);
    expect(first.items.map((value) => record(value).versionNumber)).toEqual(
      Array.from({ length: 25 }, (_, index) => 26 - index),
    );
    expect(
      first.items.every((value) => record(value).documentId === documentId),
    ).toBe(true);
    const cursor = text(first.nextCursor);
    expect(cursor.length).toBeLessThanOrEqual(256);
    await fixture.revoke('/company-document-content-uploader-assignments');
    const continued = await fixture.call(
      path + '?cursor=' + encodeURIComponent(cursor),
    );
    expect(continued.status).toBe(200);
    expect(await json(continued)).toEqual({
      format: 'WORKING_EVIDENCE_CASE_SOURCE_PAGE/1',
      items: [
        {
          documentId,
          versionId: originalVersionId,
          versionNumber: 1,
          representationId: expect.any(String),
          sourceTitle: 'Fictional received working source',
        },
      ],
      nextCursor: null,
    });
    await fixture.revoke('/company-working-evidence-case-reader-assignments');
    const replacement = await fixture.call(
      path + '?cursor=' + encodeURIComponent(cursor),
    );
    expect(replacement.status).toBe(400);
    expect(await replacement.json()).toEqual({ code: 'invalid_request' });
    const recorderPageResponse = await fixture.call(path);
    expect(recorderPageResponse.status).toBe(200);
    const recorderPage = await json(recorderPageResponse);
    expect(recorderPage.items).toEqual(first.items);
    const recorderCursor = text(recorderPage.nextCursor);
    await fixture.grant('/company-working-evidence-case-reader-assignments');
    const returning = await fixture.call(
      path + '?cursor=' + encodeURIComponent(cursor),
    );
    expect(returning.status).toBe(400);
    expect(await returning.json()).toEqual({ code: 'invalid_request' });
    const retainedRecorder = await fixture.call(
      path + '?cursor=' + encodeURIComponent(recorderCursor),
    );
    expect(retainedRecorder.status).toBe(200);
    expect(await json(retainedRecorder)).toEqual({
      format: 'WORKING_EVIDENCE_CASE_SOURCE_PAGE/1',
      items: [
        {
          documentId,
          versionId: originalVersionId,
          versionNumber: 1,
          representationId: expect.any(String),
          sourceTitle: 'Fictional received working source',
        },
      ],
      nextCursor: null,
    });
    await fixture.revoke('/company-working-evidence-case-recorder-assignments');
    const retiredRecorder = await fixture.call(
      path + '?cursor=' + encodeURIComponent(recorderCursor),
    );
    expect(retiredRecorder.status).toBe(400);
    expect(await retiredRecorder.json()).toEqual({ code: 'invalid_request' });
    expect((await fixture.call(path)).status).toBe(200);
  });
});
