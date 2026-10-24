import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createMissionDocumentFixture,
  json,
  record,
  text,
  PDF_A,
  PDF_B,
  type MissionDocumentFixture,
} from '../documents/mission-document.test-support.js';
import {
  prepareTaskResult,
  preserveFrozenResultDocument,
} from './task-results.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;
withPostgres('D4 exact frozen reference validation REST', () => {
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
  const input = () => ({
    expectedTaskVersion: 1,
    expectedResultRevision: 0,
    documentId: context.documentId,
    versionId: context.versionId,
    declaration: 'A qualified exact result DEMO',
  });
  const submit = (body: unknown) =>
    fixture.call(`/tasks/${context.taskId}/results`, {
      method: 'POST',
      key: 'reference-record-demo',
      body,
    });

  it('counts Unicode characters consistently with PostgreSQL and the result form at both declaration and reason limits', async () => {
    const declaration = '🧪'.repeat(2000);
    expect((await submit({ ...input(), declaration })).status).toBe(201);
    const corrected = await fixture.call(
      `/tasks/${context.taskId}/results/corrections`,
      {
        method: 'POST',
        body: {
          ...input(),
          expectedResultRevision: 1,
          declaration: 'A corrected Unicode result DEMO',
          reason: '🧪'.repeat(500),
        },
      },
    );
    expect(corrected.status).toBe(201);
    expect(
      await json(await fixture.call(`/tasks/${context.taskId}/results`)),
    ).toMatchObject({ revision: 2, current: { reason: '🧪'.repeat(500) } });
  });

  it('rejects direct mutation/deletion of immutable declarations, receipts and restricted events', async () => {
    expect((await submit(input())).status).toBe(201);
    const current = await json(
      await fixture.call(`/tasks/${context.taskId}/results`),
    );
    const history = await json(
      await fixture.call(`/tasks/${context.taskId}/results/history`),
    );
    for (const table of [
      'task_result_declarations',
      'task_result_commands',
      'task_result_events',
    ]) {
      // These fixed test-owned identifiers exercise the persistence integrity seam.
      await expect(
        fixture.pool.query(`UPDATE ${table} SET id=id`),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        fixture.pool.query(`DELETE FROM ${table}`),
      ).rejects.toMatchObject({ code: '23514' });
    }
    expect(
      await json(await fixture.call(`/tasks/${context.taskId}/results`)),
    ).toEqual(current);
    expect(
      await json(
        await fixture.call(`/tasks/${context.taskId}/results/history`),
      ),
    ).toEqual(history);
  });

  it('rejects a direct append with an incorrect predecessor or mismatched exact PDF without creating partial history', async () => {
    expect((await submit(input())).status).toBe(201);
    const forged = `INSERT INTO task_result_declarations
      (workspace_id,company_id,task_id,revision,declaration,document_id,version_id,pdf_id,
       predecessor_id,reason,actor_internal_user_id,actor_membership_id,actor_display_name)
      SELECT workspace_id,company_id,task_id,2,'Forged result DEMO',document_id,version_id,
        CASE WHEN $1::boolean THEN gen_random_uuid() ELSE pdf_id END,
        CASE WHEN $1::boolean THEN id ELSE gen_random_uuid() END,
        'Invalid frozen identity DEMO',actor_internal_user_id,actor_membership_id,actor_display_name
      FROM task_result_declarations WHERE task_id=$2`;
    for (const invalidPdf of [false, true])
      await expect(
        fixture.pool.query(forged, [invalidPdf, context.taskId]),
      ).rejects.toMatchObject({ code: '23514' });
    expect(
      await json(await fixture.call(`/tasks/${context.taskId}/results`)),
    ).toMatchObject({ revision: 1 });
    expect(
      (
        await json(
          await fixture.call(`/tasks/${context.taskId}/results/history`),
        )
      ).declarations,
    ).toHaveLength(1);
  });

  it('rejects malformed observations/text/identifiers and caller-selected PDF or scope fields without material effects', async () => {
    const client = await fixture.pool.query(
      'SELECT version,updated_at FROM client_accounts WHERE id=$1',
      [context.clientId],
    );
    const invalid: unknown[] = [
      null,
      [],
      {},
      { ...input(), expectedTaskVersion: '1' },
      { ...input(), expectedTaskVersion: 0 },
      { ...input(), expectedResultRevision: -1 },
      { ...input(), expectedResultRevision: 1.5 },
      { ...input(), expectedResultRevision: 2147483648 },
      { ...input(), declaration: '' },
      { ...input(), declaration: '   ' },
      { ...input(), declaration: 'x'.repeat(2001) },
      { ...input(), declaration: 17 },
      { ...input(), documentId: 'invalid' },
      { ...input(), versionId: 'invalid' },
      { ...input(), pdfId: context.versionId },
      { ...input(), representationId: context.versionId },
      { ...input(), companyId: context.companyId },
      { ...input(), workspaceId: context.companyId },
      { ...input(), reason: 'First records have no correction reason' },
    ];
    for (const body of invalid) expect((await submit(body)).status).toBe(400);
    expect(
      await json(await fixture.call(`/tasks/${context.taskId}/results`)),
    ).toMatchObject({ revision: 0, current: null });
    expect(
      (
        await fixture.pool.query(
          'SELECT version,updated_at FROM client_accounts WHERE id=$1',
          [context.clientId],
        )
      ).rows,
    ).toEqual(client.rows);
    expect(
      (
        await fixture.pool.query(
          'SELECT count(*)::int AS count FROM task_result_commands',
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
  });

  it.each([
    'unlinked',
    'other-Project',
    'other-Client',
    'questionnaire',
    'mismatched-Version',
  ])(
    'refuses a readable %s reference instead of substituting its scope or Version',
    async (kind) => {
      let clientId = context.clientId;
      if (kind === 'other-Client') {
        const client = await fixture.call('/clients', {
          method: 'POST',
          body: { displayName: 'Other result Client DEMO' },
        });
        expect(client.status).toBe(201);
        clientId = text((await json(client)).id);
      }
      const fields = {
        clientId,
        title: 'Qualified elsewhere DEMO',
        purpose: 'Refuse an incorrect result relation',
      };
      const reference = await preserveFrozenResultDocument({
        fixture,
        registration:
          kind === 'questionnaire'
            ? {
                ...fields,
                type: 'questionnaire',
                url: 'https://example.test/other-family',
              }
            : { ...fields, type: 'mission-deliverable' },
      });
      if (kind !== 'unlinked' && kind !== 'other-Client') {
        let projectId = context.projectId;
        if (kind === 'other-Project') {
          const project = await fixture.call('/projects', {
            method: 'POST',
            body: {
              clientAccountId: clientId,
              title: 'Other result Project DEMO',
            },
          });
          expect(project.status).toBe(201);
          projectId = text((await json(project)).id);
        }
        expect(
          (
            await fixture.call(
              `/documents/${reference.documentId}/project-association`,
              {
                method: 'POST',
                body: { action: 'link', projectId, expectedRevision: 0 },
              },
            )
          ).status,
        ).toBe(201);
      }
      const response = await submit({
        ...input(),
        ...reference,
        ...(kind === 'mismatched-Version'
          ? { documentId: context.documentId }
          : {}),
      });
      expect(response.status).toBe(404);
      expect(
        await json(await fixture.call(`/tasks/${context.taskId}/results`)),
      ).toMatchObject({ revision: 0, current: null });
      if (kind !== 'mismatched-Version') {
        const eligible = await fixture.call(
          `/tasks/${context.taskId}/results/eligible-versions`,
        );
        expect(eligible.status).toBe(200);
        expect(await eligible.text()).not.toContain(reference.versionId);
      }
    },
  );

  it('captures the frozen current PDF Representation rather than an earlier upload of the same Version', async () => {
    const draft = await fixture.call(
      `/documents/${context.documentId}/versions`,
      { method: 'POST', body: { expectedRevision: 3 } },
    );
    expect(draft.status).toBe(201);
    const versionId = text((await json(draft)).versionId);
    expect(
      (
        await fixture.upload({
          documentId: context.documentId,
          versionId,
          revision: 4,
          bytes: PDF_A,
        })
      ).status,
    ).toBe(201);
    expect((await submit({ ...input(), versionId })).status).toBe(404);
    expect(
      (
        await fixture.upload({
          documentId: context.documentId,
          versionId,
          revision: 5,
          bytes: PDF_B,
        })
      ).status,
    ).toBe(201);
    expect((await submit({ ...input(), versionId })).status).toBe(404);
    expect(
      (
        await fixture.call(
          `/documents/${context.documentId}/versions/${versionId}/official-designation`,
          { method: 'POST', body: { expectedRevision: 6 } },
        )
      ).status,
    ).toBe(200);
    const uploads = (
      await json(
        await fixture.call(
          `/documents/${context.documentId}/versions/${versionId}/content/history`,
        ),
      )
    ).uploads;
    if (!Array.isArray(uploads))
      throw new Error('Expected preserved public upload history.');
    expect(uploads).toHaveLength(2);
    const current = record(uploads[0]);
    const previous = record(uploads[1]);
    expect(current).toMatchObject({ revision: 6, current: true });
    expect(previous).toMatchObject({ revision: 5, current: false });
    expect(
      (
        await submit({
          ...input(),
          versionId,
          representationId: text(previous.representationId),
        })
      ).status,
    ).toBe(400);
    const recorded = await submit({ ...input(), versionId });
    expect(recorded.status).toBe(201);
    const stream = await fixture.call(`/tasks/${context.taskId}/results`);
    expect(stream.status).toBe(200);
    expect(await stream.json()).toMatchObject({
      current: {
        reference: {
          documentId: context.documentId,
          versionId,
          representationId: text(current.representationId),
        },
      },
    });
    const exact = await fixture.call(
      `/documents/${context.documentId}/versions/${versionId}/content/${text(current.representationId)}`,
    );
    expect(exact.status).toBe(200);
    expect(Buffer.from(await exact.arrayBuffer())).toEqual(PDF_B);
    const original = await fixture.call(
      `/documents/${context.documentId}/versions/${versionId}/content/${text(previous.representationId)}`,
    );
    expect(original.status).toBe(200);
    expect(Buffer.from(await original.arrayBuffer())).toEqual(PDF_A);
  });
});
