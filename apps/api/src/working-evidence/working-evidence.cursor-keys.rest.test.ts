import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  openWorkingEvidenceFixture,
  json,
  text,
} from './working-evidence.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)(
  'Working Evidence Company cursor key lifecycle',
  () => {
    it('provisions before any read, retains keys through Company retry and reads, and refuses a missing key without generating one', async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL required.');
      const fixture = await openWorkingEvidenceFixture(databaseUrl);
      try {
        const { companyId, projectId } = await fixture.prepare();
        const keys = async () =>
          (
            await fixture.pool.query<{ company_id: string; key: string }>(
              'SELECT company_id,key FROM working_evidence_cursor_keys ORDER BY company_id',
            )
          ).rows;
        const before = await keys();
        expect(before.find((row) => row.company_id === companyId)?.key).toMatch(
          /^[a-f0-9-]{72}$/u,
        );
        const path = `/projects/${projectId}/working-evidence-cases`;
        expect((await fixture.call(path)).status).toBe(200);
        expect(await keys()).toEqual(before);
        const key = randomUUID();
        const registration = {
          method: 'POST',
          company: null,
          key,
          body: { displayName: 'Fictional cursor Company' },
        };
        const created = await fixture.call('/companies', registration);
        expect(created.status).toBe(201);
        const createdId = text((await json(created)).id);
        const provisioned = await keys();
        expect(
          provisioned.find((row) => row.company_id === createdId)?.key,
        ).toMatch(/^[a-f0-9-]{72}$/u);
        const replay = await fixture.call('/companies', registration);
        expect(replay.status).toBe(201);
        expect((await json(replay)).id).toBe(createdId);
        expect(await keys()).toEqual(provisioned);
        // Deliberate infrastructure loss in this disposable database only.
        await fixture.pool.query('TRUNCATE working_evidence_cursor_keys');
        const unavailable = await fixture.call(path + '?cursor=foreign.cursor');
        expect(unavailable.status).toBe(503);
        expect(await unavailable.json()).toEqual({
          code: 'content_unavailable',
        });
        expect(await keys()).toEqual([]);
      } finally {
        await fixture.close();
      }
    });
  },
);
