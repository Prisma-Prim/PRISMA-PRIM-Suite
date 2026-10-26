import { seedHistoricalInternalOffer } from '../offer/offer-historical.test-fixture.js';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import {
  openEstimateOfferFixture,
  responseRecord,
  responseString,
  estimateOfferIntent,
  ESTIMATE_OFFER_PREPARER,
  ESTIMATE_OFFER_READER,
} from '../offer/offer-estimate-preparation.test-support.js';

it.skipIf(!process.env.TEST_DATABASE_URL)(
  'upgrades genuine 0078 internal Offer drafts and captured grants without seeding model content or extending old authority',
  async () => {
    const previous = await mkdtemp(join(tmpdir(), 'offer-model-upgrade-'));
    let fixture:
      Awaited<ReturnType<typeof openEstimateOfferFixture>> | undefined;
    try {
      const journal = responseRecord(
        JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8')),
      );
      if (!Array.isArray(journal.entries))
        throw new Error('Invalid migration journal.');
      const entries = journal.entries.map(responseRecord);
      const index = entries.findIndex(
        (entry) => entry.tag === '0079_company_offer_model',
      );
      expect(index).toBe(79);
      await mkdir(join(previous, 'meta'));
      await writeFile(
        join(previous, 'meta/_journal.json'),
        JSON.stringify({ ...journal, entries: entries.slice(0, index) }),
      );
      for (const entry of entries.slice(0, index)) {
        const tag = responseString(entry, 'tag');
        if (!/^\d{4}_[a-z0-9_-]+$/u.test(tag))
          throw new Error('Invalid migration tag.');
        await cp(join('drizzle', `${tag}.sql`), join(previous, `${tag}.sql`));
      }
      fixture = await openEstimateOfferFixture({
        migrationsFolder: previous,
        historicalOfferCaptures: { preparer: 'v2', approver: 'v1' },
      });
      const source = await fixture.prepare();
      const path = `/offers/opportunities/${source.opportunityId}`;
      const seeded = await seedHistoricalInternalOffer({
        ...source,
        pool: fixture.pool,
        key: 'pre-model-internal-offer',
        payload: estimateOfferIntent(source),
      });
      const oldRows = await fixture.pool.query(`SELECT
      (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM company_role_assignments r) AS grants,
      (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM company_context_assignment_commands r) AS receipts,
      (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM offer_versions r) AS versions,
      (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM offer_commands r) AS commands,
      (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM offer_events r) AS events`);
      await fixture.applyCurrentMigrations();
      await fixture.restart();
      expect(
        await fixture.read({
          path,
          companyId: source.companyId,
          headers: ESTIMATE_OFFER_READER,
        }),
      ).toMatchObject({
        offer: {
          id: seeded.offerId,
          version: {
            id: seeded.versionId,
            provenance: 'APPROVED_ESTIMATE_INTERNAL_DRAFT',
            priceSource: { amount: '125.00', taxTreatment: 'UNSPECIFIED' },
          },
        },
      });
      expect(
        (
          await fixture.pool.query(`SELECT
      (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM company_role_assignments r) AS grants,
      (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM company_context_assignment_commands r) AS receipts,
      (SELECT jsonb_agg((to_jsonb(r) - ARRAY['model_source_id','model_source_version_id','model_source_version_number','model_source_decision_id','model_source_decision_outcome','model_generation_snapshot']::text[]) ORDER BY id) FROM offer_versions r) AS versions,
      (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM offer_commands r) AS commands,
      (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM offer_events r) AS events`)
        ).rows,
      ).toEqual(oldRows.rows);
      expect(
        (
          await fixture.pool.query(`SELECT
      (SELECT count(*)::int FROM offer_models) AS models,
      (SELECT count(*)::int FROM offer_model_versions) AS versions,
      (SELECT count(*)::int FROM offer_model_decisions) AS decisions,
      (SELECT count(*)::int FROM offer_model_withdrawals) AS withdrawals,
      (SELECT count(*)::int FROM offer_model_commands) AS commands,
      (SELECT count(*)::int FROM offer_model_events) AS events`)
        ).rows,
      ).toEqual([
        {
          models: 0,
          versions: 0,
          decisions: 0,
          withdrawals: 0,
          commands: 0,
          events: 0,
        },
      ]);
      const denied = await fixture.request({
        path: '/offer-models/consulting-ro',
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
      });
      expect(denied.status).toBe(403);
    } finally {
      await fixture?.close();
      await rm(previous, { recursive: true, force: true });
    }
  },
);
