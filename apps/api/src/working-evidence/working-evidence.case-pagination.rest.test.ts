import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  openWorkingEvidenceFixture,
  json,
  record,
  text,
} from './working-evidence.test-support.js';
const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)(
  'Working Evidence Case and revision continuation',
  () => {
    it('reaches every Case and revision across restart, rejects another paging kind and creates no read effects', async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL required.');
      const fixture = await openWorkingEvidenceFixture(databaseUrl);
      try {
        const { projectId } = await fixture.prepare();
        const source = await fixture.source();
        const path = `/projects/${projectId}/working-evidence-cases`;
        const ids: string[] = [];
        for (let index = 0; index < 26; index++) {
          const created = await fixture.call(path, {
            method: 'POST',
            body: fixture.recordBody([source]),
          });
          expect(created.status).toBe(201);
          ids.push(text((await json(created)).caseId));
        }
        const caseId = ids[0];
        if (!caseId) throw new Error('Missing recorded Case.');
        for (let revision = 1; revision <= 26; revision++) {
          const corrected = await fixture.call(
            `/working-evidence-cases/${caseId}/corrections`,
            {
              method: 'POST',
              body: {
                format: 'WORKING_EVIDENCE_CASE_COMMAND/1',
                commandId: randomUUID(),
                expectedRevision: revision,
                reason: 'Fictional correction ' + revision,
                values: {
                  ...fixture.values([source]),
                  statement: 'Fictional working statement ' + revision,
                },
              },
            },
          );
          expect(corrected.status).toBe(201);
        }
        const effects = async () =>
          (
            await fixture.pool.query(`SELECT
        (SELECT count(*)::int FROM working_evidence_receipts) receipts,
        (SELECT count(*)::int FROM working_evidence_events) events,
        (SELECT count(*)::int FROM working_evidence_revisions) revisions,
        (SELECT jsonb_agg(to_jsonb(k) ORDER BY company_id) FROM working_evidence_cursor_keys k) keys`)
          ).rows;
        const before = await effects();
        const first = await json(await fixture.call(path));
        if (!Array.isArray(first.items)) throw new Error('Case page required.');
        expect(first.items).toHaveLength(25);
        const caseCursor = text(first.nextCursor);
        const historyPath = `/working-evidence-cases/${caseId}/revisions`;
        const history = await json(await fixture.call(historyPath));
        if (!Array.isArray(history.items))
          throw new Error('Revision page required.');
        expect(
          history.items.map((item) => record(item).revisionNumber),
        ).toEqual(Array.from({ length: 25 }, (_, index) => 27 - index));
        const historyCursor = text(history.nextCursor);
        await fixture.restart();
        const rest = await fixture.call(
          path + '?cursor=' + encodeURIComponent(caseCursor),
        );
        expect(rest.status).toBe(200);
        const second = await json(rest);
        if (!Array.isArray(second.items))
          throw new Error('Case page required.');
        expect(second.items).toHaveLength(1);
        expect(second.nextCursor).toBeNull();
        expect(
          [...first.items, ...second.items]
            .map((item) => text(record(item).caseId))
            .sort(),
        ).toEqual([...ids].sort());
        const older = await fixture.call(
          historyPath + '?cursor=' + encodeURIComponent(historyCursor),
        );
        expect(older.status).toBe(200);
        const tail = await json(older);
        if (!Array.isArray(tail.items))
          throw new Error('Revision page required.');
        expect(tail.items.map((item) => record(item).revisionNumber)).toEqual([
          2, 1,
        ]);
        expect(tail.nextCursor).toBeNull();
        expect(
          (
            await fixture.call(
              path + '?cursor=' + encodeURIComponent(historyCursor),
            )
          ).status,
        ).toBe(400);
        expect(
          (
            await fixture.call(
              historyPath + '?cursor=' + encodeURIComponent(caseCursor),
            )
          ).status,
        ).toBe(400);
        expect(await effects()).toEqual(before);
      } finally {
        await fixture.close();
      }
    }, 60_000);
  },
);
