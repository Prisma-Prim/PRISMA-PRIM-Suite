import { prepareTaskResult } from './task-results.test-support.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createMissionDocumentFixture,
  json,
  text,
  PDF_A,
  PDF_B,
  type MissionDocumentFixture,
} from '../documents/mission-document.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;

withPostgres('D4 exact mission Task results REST', () => {
  let fixture: MissionDocumentFixture;
  let taskId: string;
  let documentId: string;
  let versionId: string;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    fixture = await createMissionDocumentFixture(databaseUrl);
  });
  afterAll(async () => {
    await fixture?.close();
  });
  beforeEach(async () => {
    ({ taskId, documentId, versionId } = await prepareTaskResult(fixture));
  });

  it('records and reloads an explicitly authorized exact frozen result without completing or editing the Task', async () => {
    await fixture.grant('/company-task-result-recorder-assignments');
    const response = await fixture.call(`/tasks/${taskId}/results`, {
      method: 'POST',
      key: 'record-first-result-demo',
      body: {
        expectedTaskVersion: 1,
        expectedResultRevision: 0,
        documentId,
        versionId,
        declaration: 'Prepared the consulting mission output DEMO.',
      },
    });
    expect(response.status).toBe(201);
    const receipt = await json(response);
    expect(receipt).toMatchObject({
      action: 'recorded',
      taskId,
      resultRevision: 1,
    });
    const current = await fixture.call(`/tasks/${taskId}/results`);
    expect(current.status).toBe(200);
    expect(await current.json()).toMatchObject({
      revision: 1,
      taskVersion: 1,
      mutable: true,
      current: {
        id: text(receipt.resultId),
        revision: 1,
        declaration: 'Prepared the consulting mission output DEMO.',
        reference: {
          documentId,
          versionId,
          versionNumber: 1,
          title: 'Frozen mission output DEMO',
          status: 'official',
        },
      },
    });
    expect(await json(await fixture.call(`/tasks/${taskId}`))).toMatchObject({
      task: { version: 1, status: 'todo', completion: null },
    });
    const history = await fixture.call(`/tasks/${taskId}/results/history`);
    expect(history.status).toBe(200);
    expect(await history.json()).toMatchObject({
      declarations: [{ id: text(receipt.resultId), revision: 1 }],
      hasMore: false,
      nextBeforeRevision: null,
    });
    const download = await fixture.call(
      `/documents/${documentId}/versions/${versionId}/content`,
    );
    expect(download.status).toBe(200);
    expect(Buffer.from(await download.arrayBuffer())).toEqual(PDF_A);
  });

  it('offers exact linked frozen Versions to a reader without making empty or uploaded drafts eligible', async () => {
    const candidates = () =>
      fixture.call(`/tasks/${taskId}/results/eligible-versions`);
    const initial = await candidates();
    expect(initial.status).toBe(200);
    expect(await initial.json()).toMatchObject({
      mutable: true,
      versions: [
        { documentId, versionId, versionNumber: 1, status: 'official' },
      ],
    });
    const draft = await fixture.call(`/documents/${documentId}/versions`, {
      method: 'POST',
      body: { expectedRevision: 3 },
    });
    expect(draft.status).toBe(201);
    const nextVersionId = text((await json(draft)).versionId);
    for (const uploaded of [false, true]) {
      if (uploaded)
        expect(
          (
            await fixture.upload({
              documentId,
              versionId: nextVersionId,
              revision: 4,
              bytes: PDF_B,
            })
          ).status,
        ).toBe(201);
      const response = await candidates();
      expect(response.status).toBe(200);
      const versions = (await json(response)).versions;
      expect(versions).toEqual([
        expect.objectContaining({ versionId, status: 'official' }),
      ]);
    }
    expect(
      (
        await fixture.call(
          `/documents/${documentId}/versions/${nextVersionId}/official-designation`,
          {
            method: 'POST',
            body: { expectedRevision: 5 },
          },
        )
      ).status,
    ).toBe(200);
    expect((await json(await candidates())).versions).toEqual([
      expect.objectContaining({
        versionId: nextVersionId,
        versionNumber: 2,
        status: 'official',
      }),
      expect.objectContaining({
        versionId,
        versionNumber: 1,
        status: 'superseded',
      }),
    ]);
    expect(
      await json(await fixture.call(`/tasks/${taskId}/results`)),
    ).toMatchObject({ revision: 0, current: null });
  });

  it('preserves the first exact Version through Document succession, result correction and ordinary Task completion/reopening', async () => {
    await fixture.grant('/company-task-result-recorder-assignments');
    const first = await fixture.call(`/tasks/${taskId}/results`, {
      method: 'POST',
      key: 'first-declaration-demo',
      body: {
        expectedTaskVersion: 1,
        expectedResultRevision: 0,
        documentId,
        versionId,
        declaration: 'Original mission result DEMO',
      },
    });
    expect(first.status).toBe(201);
    const firstReceipt = await json(first);
    const draft = await fixture.call(`/documents/${documentId}/versions`, {
      method: 'POST',
      body: { expectedRevision: 3 },
    });
    expect(draft.status).toBe(201);
    const nextVersionId = text((await json(draft)).versionId);
    expect(
      (
        await fixture.upload({
          documentId,
          versionId: nextVersionId,
          revision: 4,
          bytes: PDF_B,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await fixture.call(
          `/documents/${documentId}/versions/${nextVersionId}/official-designation`,
          { method: 'POST', body: { expectedRevision: 5 } },
        )
      ).status,
    ).toBe(200);
    expect(
      await json(await fixture.call(`/tasks/${taskId}/results`)),
    ).toMatchObject({
      revision: 1,
      current: {
        id: text(firstReceipt.resultId),
        declaration: 'Original mission result DEMO',
        reference: { versionId, versionNumber: 1, status: 'superseded' },
      },
    });
    const correction = await fixture.call(
      `/tasks/${taskId}/results/corrections`,
      {
        method: 'POST',
        key: 'correct-declaration-demo',
        body: {
          expectedTaskVersion: 1,
          expectedResultRevision: 1,
          documentId,
          versionId: nextVersionId,
          declaration: 'Corrected mission result DEMO',
          reason:
            'Preserve the corrected output without rewriting its predecessor',
        },
      },
    );
    expect(correction.status).toBe(201);
    const receipt = await json(correction);
    expect(receipt).toMatchObject({ action: 'corrected', resultRevision: 2 });
    const history = await json(
      await fixture.call(`/tasks/${taskId}/results/history`),
    );
    expect(history).toMatchObject({
      declarations: [
        {
          id: text(receipt.resultId),
          revision: 2,
          kind: 'corrected',
          predecessorId: text(firstReceipt.resultId),
          reason:
            'Preserve the corrected output without rewriting its predecessor',
          reference: {
            versionId: nextVersionId,
            versionNumber: 2,
            status: 'official',
          },
        },
        {
          id: text(firstReceipt.resultId),
          revision: 1,
          kind: 'recorded',
          declaration: 'Original mission result DEMO',
          reference: { versionId },
        },
      ],
    });
    const completed = await fixture.call(`/tasks/${taskId}/complete`, {
      method: 'POST',
      body: { expectedVersion: 1 },
    });
    expect(completed.status).toBe(201);
    const reopened = await fixture.call(`/tasks/${taskId}/reopen`, {
      method: 'POST',
      body: { expectedVersion: 2 },
    });
    expect(reopened.status).toBe(201);
    expect(
      await json(await fixture.call(`/tasks/${taskId}/results/history`)),
    ).toEqual(history);
    expect(
      await json(await fixture.call(`/tasks/${taskId}/results`)),
    ).toMatchObject({
      revision: 2,
      taskVersion: 3,
      mutable: true,
      current: {
        id: text(receipt.resultId),
        reference: { versionId: nextVersionId },
      },
    });
    for (const expected of [
      { id: versionId, bytes: PDF_A },
      { id: nextVersionId, bytes: PDF_B },
    ]) {
      const download = await fixture.call(
        `/documents/${documentId}/versions/${expected.id}/content`,
      );
      expect(download.status).toBe(200);
      expect(Buffer.from(await download.arrayBuffer())).toEqual(expected.bytes);
    }
  });
});
