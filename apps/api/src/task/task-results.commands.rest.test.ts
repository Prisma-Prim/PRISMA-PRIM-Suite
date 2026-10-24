import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createMissionDocumentFixture,
  json,
  text,
  type MissionDocumentFixture,
} from '../documents/mission-document.test-support.js';
import { prepareTaskResult } from './task-results.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;
withPostgres('D4 Task result commands and history REST', () => {
  let fixture: MissionDocumentFixture;
  let context: Awaited<ReturnType<typeof prepareTaskResult>>;
  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    fixture = await createMissionDocumentFixture(databaseUrl);
  });
  afterAll(async () => {
    await fixture?.close();
  });
  beforeEach(async () => {
    context = await prepareTaskResult(fixture);
    await fixture.grant('/company-task-result-recorder-assignments');
  });
  const body = () => ({
    expectedTaskVersion: 1,
    expectedResultRevision: 0,
    documentId: context.documentId,
    versionId: context.versionId,
    declaration: 'First delivered output DEMO',
  });
  const first = (
    options: { key?: string; fields?: Record<string, unknown> } = {},
  ) =>
    fixture.call(`/tasks/${context.taskId}/results`, {
      method: 'POST',
      key: options.key ?? 'first-result-command-demo',
      body: { ...body(), ...options.fields },
    });
  const correctionBody = () => ({
    ...body(),
    expectedResultRevision: 1,
    declaration: 'Corrected delivered output DEMO',
    reason: 'Correct the declared output',
  });
  const correct = (
    options: { key?: string; fields?: Record<string, unknown> } = {},
  ) =>
    fixture.call(`/tasks/${context.taskId}/results/corrections`, {
      method: 'POST',
      key: options.key ?? 'correct-result-command-demo',
      body: { ...correctionBody(), ...options.fields },
    });
  const stream = () => fixture.call(`/tasks/${context.taskId}/results`);
  const history = () =>
    fixture.call(`/tasks/${context.taskId}/results/history`);

  it('confirms exact old receipts before stale observations and refuses changed-key intent without retargeting the current result', async () => {
    const recorded = await first();
    expect(recorded.status).toBe(201);
    const receipt = await json(recorded);
    const changed = await correct();
    expect(changed.status).toBe(201);
    const correction = await json(changed);
    const replay = await first();
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(receipt);
    const correctedReplay = await correct();
    expect(correctedReplay.status).toBe(201);
    expect(await correctedReplay.json()).toEqual(correction);
    expect(
      (
        await first({
          fields: { declaration: 'Changed body under the same key' },
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await correct({
          fields: { reason: 'Changed reason under the same key' },
        })
      ).status,
    ).toBe(409);
    expect((await first({ key: 'new-first-intention' })).status).toBe(409);
    expect((await correct({ key: 'stale-correction' })).status).toBe(409);
    const edit = await fixture.call(`/tasks/${context.taskId}`, {
      method: 'PATCH',
      body: {
        expectedVersion: 1,
        title: 'Deliberately corrected Task title DEMO',
      },
    });
    expect(edit.status).toBe(200);
    expect(
      (
        await correct({
          key: 'stale-task-version',
          fields: { expectedResultRevision: 2 },
        })
      ).status,
    ).toBe(409);
    expect(await json(await stream())).toMatchObject({
      taskVersion: 2,
      revision: 2,
      current: { id: text(correction.resultId) },
    });
    const finalReplay = await first();
    expect(finalReplay.status).toBe(201);
    expect(await finalReplay.json()).toEqual(receipt);
  });

  it('records a normalized no-op receipt without another declaration, event or Client fence advance', async () => {
    const recorded = await first();
    expect(recorded.status).toBe(201);
    const receipt = await json(recorded);
    const before = await json(await history());
    const clientBefore = await fixture.pool.query(
      'SELECT version,updated_at FROM client_accounts WHERE id=$1',
      [context.clientId],
    );
    const options = {
      key: 'normalized-noop-demo',
      fields: {
        declaration: '  First delivered output DEMO  ',
        reason: 'Same exact declaration and reference',
      },
    };
    const unchanged = await correct(options);
    expect(unchanged.status).toBe(201);
    const outcome = await json(unchanged);
    expect(outcome).toEqual({ ...receipt, action: 'unchanged' });
    const replay = await correct(options);
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(outcome);
    expect(await json(await history())).toEqual(before);
    expect(
      (
        await fixture.pool.query(
          'SELECT version,updated_at FROM client_accounts WHERE id=$1',
          [context.clientId],
        )
      ).rows,
    ).toEqual(clientBefore.rows);
    expect(
      (
        await fixture.pool.query(
          'SELECT (SELECT count(*)::int FROM task_result_declarations) AS declarations,(SELECT count(*)::int FROM task_result_events) AS events,(SELECT count(*)::int FROM task_result_commands) AS commands',
        )
      ).rows,
    ).toEqual([{ declarations: 1, events: 1, commands: 2 }]);
    expect(
      await json(await fixture.call(`/tasks/${context.taskId}`)),
    ).toMatchObject({ task: { version: 1, status: 'todo' } });
  });

  it('returns stable25-row immutable history pages without changing ordinary Task versions or history', async () => {
    expect((await first()).status).toBe(201);
    for (let revision = 1; revision < 26; revision += 1) {
      const response = await correct({
        key: `history-revision-${revision + 1}`,
        fields: {
          expectedResultRevision: revision,
          declaration: `Declared output ${revision + 1} DEMO`,
        },
      });
      expect(response.status).toBe(201);
    }
    const page = await json(await history());
    expect(page).toMatchObject({ hasMore: true, nextBeforeRevision: 2 });
    expect(Array.isArray(page.declarations)).toBe(true);
    if (!Array.isArray(page.declarations))
      throw new Error('Expected public declaration rows.');
    expect(page.declarations).toHaveLength(25);
    expect(page.declarations[0]).toMatchObject({ revision: 26 });
    expect(page.declarations.at(-1)).toMatchObject({ revision: 2 });
    const last = await fixture.call(
      `/tasks/${context.taskId}/results/history?beforeRevision=2`,
    );
    expect(last.status).toBe(200);
    expect(await last.json()).toMatchObject({
      declarations: [{ revision: 1 }],
      hasMore: false,
      nextBeforeRevision: null,
    });
    const empty = await fixture.call(
      `/tasks/${context.taskId}/results/history?beforeRevision=1`,
    );
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual({
      taskId: context.taskId,
      declarations: [],
      hasMore: false,
      nextBeforeRevision: null,
    });
    expect(await json(await stream())).toMatchObject({
      revision: 26,
      taskVersion: 1,
    });
    const ordinary = await json(
      await fixture.call(`/tasks/${context.taskId}/history`),
    );
    expect(ordinary.events).toEqual([
      expect.objectContaining({ action: 'task.created' }),
    ]);
    for (const query of [
      'beforeRevision=-1',
      'beforeRevision=1.5',
      'beforeRevision=2147483648',
      'unknown=1',
    ])
      expect(
        (
          await fixture.call(
            `/tasks/${context.taskId}/results/history?${query}`,
          )
        ).status,
      ).toBe(400);
  });

  it('preserves exact reads/replay after Task completion, unlinking and Project cancellation while refusing new writes', async () => {
    const recorded = await first();
    expect(recorded.status).toBe(201);
    const receipt = await json(recorded);
    expect(
      (
        await fixture.call(`/tasks/${context.taskId}/complete`, {
          method: 'POST',
          body: { expectedVersion: 1 },
        })
      ).status,
    ).toBe(201);
    expect((await correct({ fields: { expectedTaskVersion: 2 } })).status).toBe(
      409,
    );
    const replay = await first();
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(receipt);
    expect(
      (
        await fixture.call(`/tasks/${context.taskId}/reopen`, {
          method: 'POST',
          body: { expectedVersion: 2 },
        })
      ).status,
    ).toBe(201);
    const correction = await correct({ fields: { expectedTaskVersion: 3 } });
    expect(correction.status).toBe(201);
    const corrected = await json(correction);
    const before = await json(await history());
    expect(
      (
        await fixture.call(
          `/documents/${context.documentId}/project-association`,
          {
            method: 'POST',
            body: {
              action: 'unlink',
              projectId: context.projectId,
              expectedRevision: 1,
            },
          },
        )
      ).status,
    ).toBe(201);
    expect(await json(await history())).toEqual(before);
    expect(
      (
        await correct({
          key: 'new-unlinked-correction',
          fields: {
            expectedTaskVersion: 3,
            expectedResultRevision: 2,
            declaration: 'Another new output',
          },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await fixture.call(`/tasks/${context.taskId}/complete`, {
          method: 'POST',
          body: { expectedVersion: 3 },
        })
      ).status,
    ).toBe(201);
    await fixture.grant('/company-project-approver-assignments');
    expect(
      (
        await fixture.call(
          `/projects/${context.projectId}/lifecycle-transitions`,
          {
            method: 'POST',
            body: {
              action: 'cancel',
              expectedLifecycleRevision: 0,
              reason: 'Explicit synthetic cancellation',
            },
          },
        )
      ).status,
    ).toBe(200);
    const correctedReplay = await correct({
      fields: { expectedTaskVersion: 3 },
    });
    expect(correctedReplay.status).toBe(201);
    expect(await correctedReplay.json()).toEqual(corrected);
    expect(await json(await history())).toEqual(before);
    expect(await json(await stream())).toMatchObject({
      mutable: false,
      revision: 2,
      taskVersion: 4,
    });
    expect(
      (
        await correct({
          key: 'new-closed-project-correction',
          fields: { expectedTaskVersion: 4, expectedResultRevision: 2 },
        })
      ).status,
    ).toBe(409);
  });

  it('preserves the original Client and declared Version after a real governed union without redirecting new result writes', async () => {
    const recorded = await first();
    expect(recorded.status).toBe(201);
    const receipt = await json(recorded);
    const before = await json(await history());
    await fixture.grant('/company-director-client-assignments');
    const client = await fixture.call('/clients', {
      method: 'POST',
      body: { displayName: 'Canonical Task result Client DEMO' },
    });
    expect(client.status).toBe(201);
    const canonicalId = text((await json(client)).id);
    await fixture.pool.query(
      "UPDATE client_accounts SET tax_id='TASK-RESULT-UNION-DEMO' WHERE id=ANY($1::uuid[])",
      [[context.clientId, canonicalId]],
    );
    const review = await fixture.call(
      `/clients/${context.clientId}/union-reviews`,
      { method: 'POST', body: {} },
    );
    expect(review.status).toBe(201);
    const reviewReference = text((await json(review)).reviewReference);
    const confirmed = await fixture.call(
      `/client-union-reviews/${reviewReference}/confirm`,
      {
        method: 'POST',
        body: {
          canonicalClientId: canonicalId,
          fields: {
            displayName: context.clientId,
            taxId: context.clientId,
            address: context.clientId,
            telephone: context.clientId,
            generalEmail: context.clientId,
            businessActivity: context.clientId,
          },
          companyIds: [context.companyId],
          reviewedDifferences: true,
          reason: 'Synthetic original-Client identity correction',
        },
      },
    );
    expect(confirmed.status).toBe(201);
    const current = await stream();
    expect(current.status).toBe(200);
    expect(await current.json()).toMatchObject({
      mutable: false,
      revision: 1,
      current: {
        id: text(receipt.resultId),
        reference: {
          documentId: context.documentId,
          versionId: context.versionId,
        },
      },
    });
    expect(await json(await history())).toEqual(before);
    const replay = await first();
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(receipt);
    expect((await correct()).status).toBe(404);
    expect(
      await json(await fixture.call(`/tasks/${context.taskId}`)),
    ).toMatchObject({
      task: { clientAccountId: context.clientId, version: 1 },
    });
  });
});
