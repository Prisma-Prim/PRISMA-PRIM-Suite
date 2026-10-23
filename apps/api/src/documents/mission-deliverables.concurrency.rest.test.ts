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
withPostgres('D3 mission-deliverable concurrent commands REST', () => {
  let fixture: MissionDocumentFixture;
  let companyId: string;
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
    ({ companyId, membershipId, clientId } = await fixture.reset());
  });
  const call = (...args: Parameters<MissionDocumentFixture['call']>) =>
    fixture.call(...args);
  const grant = (...args: Parameters<MissionDocumentFixture['grant']>) =>
    fixture.grant(...args);
  const upload = (...args: Parameters<MissionDocumentFixture['upload']>) =>
    fixture.upload(...args);

  it('refuses a PDF after family revocation during the external scan and permits a fresh authorized retry without a false receipt', async () => {
    await grant('/company-mission-deliverable-access-assignments');
    await grant('/company-document-content-reader-assignments');
    await grant('/company-document-content-uploader-assignments');
    const registered = await call('/documents', {
      method: 'POST',
      body: {
        type: 'mission-deliverable',
        clientId,
        title: 'Scanned result DEMO',
        purpose: 'Commit only under current authority',
      },
    });
    expect(registered.status).toBe(201);
    const document = await json(registered);
    const documentId = text(document.id);
    const versionId = text(record(document.version).id);
    const barrier = fixture.holdNextScan();
    const pending = upload({
      documentId,
      versionId,
      revision: 1,
      bytes: PDF_A,
      key: 'held-mission-upload',
    });
    try {
      await Promise.race([
        barrier.reached,
        pending.then(() => {
          throw new Error('Upload ended before reaching the scanner barrier.');
        }),
      ]);
      expect(
        (
          await call(
            `/company-mission-deliverable-access-assignments/${membershipId}/${companyId}`,
            { method: 'DELETE', company: null },
          )
        ).status,
      ).toBe(200);
      barrier.release();
      expect((await pending).status).toBe(404);
    } finally {
      barrier.release();
      await pending.catch(() => undefined);
    }
    await grant('/company-mission-deliverable-access-assignments');
    const unchanged = await call(`/documents/${documentId}/versions`);
    expect(unchanged.status).toBe(200);
    expect(await unchanged.json()).toMatchObject({
      workingRevision: 1,
      versions: [
        { id: versionId, status: 'draft', pdfContent: { state: 'absent' } },
      ],
    });
    const history = await call(
      `/documents/${documentId}/versions/${versionId}/content/history`,
    );
    expect(history.status).toBe(200);
    expect(await history.json()).toEqual({
      uploads: [],
      nextBeforeRevision: null,
    });
    const activity = await json(await call('/activity-log'));
    if (!Array.isArray(activity.events))
      throw new Error('Expected Activity events.');
    expect(
      activity.events.filter(
        (event) => record(event).action === 'document.representation.added',
      ),
    ).toEqual([]);
    expect(
      (
        await upload({
          documentId,
          versionId,
          revision: 1,
          bytes: PDF_A,
          key: 'held-mission-upload',
        })
      ).status,
    ).toBe(201);
    expect(fixture.scanCount).toBe(2);
  });

  async function scannableMission() {
    await grant('/company-mission-deliverable-access-assignments');
    await grant('/company-document-content-reader-assignments');
    await grant('/company-document-content-uploader-assignments');
    const response = await call('/documents', {
      method: 'POST',
      body: {
        type: 'mission-deliverable',
        clientId,
        title: 'Concurrent mission DEMO',
        purpose: 'Atomic content history',
      },
    });
    expect(response.status).toBe(201);
    const document = await json(response);
    return {
      documentId: text(document.id),
      versionId: text(record(document.version).id),
    };
  }

  it('lets official designation win against a replacement still being scanned and preserves the exact earlier bytes', async () => {
    const scope = await scannableMission();
    await grant('/company-document-approver-assignments');
    const first = await upload({
      ...scope,
      revision: 1,
      bytes: PDF_A,
      key: 'first-mission-pdf',
    });
    expect(first.status).toBe(201);
    const firstReceipt = await first.json();
    const barrier = fixture.holdNextScan();
    const pending = upload({
      ...scope,
      revision: 2,
      bytes: PDF_B,
      key: 'replacement-mission-pdf',
    });
    try {
      await Promise.race([
        barrier.reached,
        pending.then(() => {
          throw new Error('Upload missed scanner barrier.');
        }),
      ]);
      expect(
        (
          await call(
            `/documents/${scope.documentId}/versions/${scope.versionId}/official-designation`,
            { method: 'POST', body: { expectedRevision: 2 } },
          )
        ).status,
      ).toBe(200);
      barrier.release();
      expect((await pending).status).toBe(409);
    } finally {
      barrier.release();
      await pending.catch(() => undefined);
    }
    const current = await call(
      `/documents/${scope.documentId}/versions/${scope.versionId}/content`,
    );
    expect(current.status).toBe(200);
    expect(Buffer.from(await current.arrayBuffer())).toEqual(PDF_A);
    const replay = await upload({
      ...scope,
      revision: 1,
      bytes: PDF_A,
      key: 'first-mission-pdf',
    });
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(firstReceipt);
    expect(
      await (await call(`/documents/${scope.documentId}/versions`)).json(),
    ).toMatchObject({ workingRevision: 3, versions: [{ status: 'official' }] });
  });

  it('serializes competing PDF writes and keeps exact versus changed-body retries distinct', async () => {
    const scope = await scannableMission();
    const barrier = fixture.holdNextScan();
    const pending = upload({
      ...scope,
      revision: 1,
      bytes: PDF_A,
      key: 'losing-key',
    });
    try {
      await Promise.race([
        barrier.reached,
        pending.then(() => {
          throw new Error('Upload missed scanner barrier.');
        }),
      ]);
      expect(
        (
          await upload({
            ...scope,
            revision: 1,
            bytes: PDF_B,
            key: 'winning-key',
          })
        ).status,
      ).toBe(201);
      barrier.release();
      expect((await pending).status).toBe(409);
    } finally {
      barrier.release();
      await pending.catch(() => undefined);
    }
    expect(
      (
        await upload({
          ...scope,
          revision: 1,
          bytes: PDF_B,
          key: 'winning-key',
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await upload({
          ...scope,
          revision: 1,
          bytes: PDF_A,
          key: 'winning-key',
        })
      ).status,
    ).toBe(409);
    const history = await json(
      await call(
        `/documents/${scope.documentId}/versions/${scope.versionId}/content/history`,
      ),
    );
    expect(history.uploads).toHaveLength(1);
    const current = await call(
      `/documents/${scope.documentId}/versions/${scope.versionId}/content`,
    );
    expect(Buffer.from(await current.arrayBuffer())).toEqual(PDF_B);
  });

  it.each(['document_version_commands', 'document_pdfs'])(
    'rolls PDF, revision, receipt and Client fence back on %s persistence failure',
    async (table) => {
      const scope = await scannableMission();
      const before = await fixture.pool.query(
        'SELECT id, version, updated_at FROM client_accounts ORDER BY id',
      );
      const events = await fixture.pool.query(
        'SELECT count(*)::int AS count FROM activity_log_events',
      );
      await fixture.pool.query(
        "CREATE FUNCTION fail_mission_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic mission write failure' USING ERRCODE='23514'; END $$",
      );
      // Only the two literal test-owned tables above can reach this fixture DDL.
      await fixture.pool.query(
        `CREATE TRIGGER fail_mission_write BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION fail_mission_write()`,
      );
      try {
        expect(
          (
            await upload({
              ...scope,
              revision: 1,
              bytes: PDF_A,
              key: 'rollback-mission',
            })
          ).status,
        ).toBe(500);
      } finally {
        await fixture.pool.query(`DROP TRIGGER fail_mission_write ON ${table}`);
        await fixture.pool.query('DROP FUNCTION fail_mission_write()');
      }
      expect(
        await (await call(`/documents/${scope.documentId}/versions`)).json(),
      ).toMatchObject({
        workingRevision: 1,
        versions: [{ pdfContent: { state: 'absent' } }],
      });
      expect(
        await (
          await call(
            `/documents/${scope.documentId}/versions/${scope.versionId}/content/history`,
          )
        ).json(),
      ).toEqual({ uploads: [], nextBeforeRevision: null });
      expect(
        (
          await fixture.pool.query(
            'SELECT id, version, updated_at FROM client_accounts ORDER BY id',
          )
        ).rows,
      ).toEqual(before.rows);
      expect(
        (
          await fixture.pool.query(
            'SELECT count(*)::int AS count FROM activity_log_events',
          )
        ).rows,
      ).toEqual(events.rows);
      expect(
        (
          await fixture.pool.query(
            'SELECT count(*)::int AS count FROM document_version_commands',
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
      expect(
        (
          await upload({
            ...scope,
            revision: 1,
            bytes: PDF_A,
            key: 'rollback-mission',
          })
        ).status,
      ).toBe(201);
    },
  );
});
