import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ESTIMATE_OFFER_PREPARER,
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import { prepareModelContractSource } from './model-contract.test-fixture.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres(
  'Model Contract input and stored effects through public REST',
  () => {
    let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
    beforeAll(async () => {
      fixture = await openEstimateOfferFixture();
    });
    beforeEach(async () => {
      await fixture.reset();
    });
    afterAll(async () => {
      await fixture?.close();
    });

    it.each([
      { name: 'unknown mode or authority', change: { official: true } },
      {
        name: 'caller-supplied model copy',
        change: { modelSource: { approved: true } },
      },
      {
        name: 'caller-supplied financial amount',
        change: { financials: { netAmount: '1.00' } },
      },
      { name: 'missing date', change: { documentDate: undefined } },
      { name: 'non-calendar day', change: { documentDate: '2026-02-30' } },
      {
        name: 'unsupported calendar year zero',
        change: { documentDate: '0000-01-01' },
      },
      {
        name: 'timestamp instead of calendar date',
        change: { documentDate: '2026-10-24T09:00:00Z' },
      },
      {
        name: 'reversed entered term dates',
        change: { termStartsOn: '2026-11-02', termEndsOn: '2026-11-01' },
      },
      { name: 'blank requisites', change: { clientDetails: ' \n ' } },
      {
        name: 'overlong requisites in UTF-16',
        change: { clientDetails: '☀️'.repeat(2001) },
      },
      {
        name: 'NUL in requisites',
        change: { clientDetails: 'synthetic\0requisites' },
      },
      { name: 'lone surrogate', change: { clientDetails: 'synthetic\ud800' } },
      {
        name: 'unconfirmed concordance',
        change: { sourceConcordanceDeclaration: false },
      },
      {
        name: 'string instead of explicit confirmation',
        change: { sourceConcordanceDeclaration: 'true' },
      },
      {
        name: 'blank concordance basis',
        change: { sourceConcordanceBasis: ' \t ' },
      },
      {
        name: 'overlong concordance basis',
        change: { sourceConcordanceBasis: 'x'.repeat(2001) },
      },
      {
        name: 'total UTF-8 byte limit',
        change: {
          clientDetails: '中'.repeat(4000),
          sourceConcordanceBasis: '中'.repeat(2000),
        },
      },
      {
        name: 'invalid source identifier',
        change: { sourceOfferVersionId: 'not-an-id' },
      },
      {
        name: 'non-integer model Version',
        change: { modelVersionNumber: 1.5 },
      },
      {
        name: 'unknown model Version number',
        change: { modelVersionNumber: 0 },
      },
      {
        name: 'overflowing model Version number',
        change: { modelVersionNumber: 2147483648 },
      },
    ])(
      'rejects $name without reserving a Contract/reference/receipt/event',
      async ({ change }) => {
        const { source, path, intent } =
          await prepareModelContractSource(fixture);
        const before = await effects(source.companyId);
        const response = await fixture.post({
          path: `${path}/from-approved-model`,
          companyId: source.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
          body: { ...intent, ...change },
          key: 'invalid-case',
        });
        expect(response.status).toBe(400);
        expect(await effects(source.companyId)).toEqual(before);
      },
    );

    it('preserves maximum literal Unicode, normalizes optional absence, and permits a corrected uncommitted key', async () => {
      const { source, path, intent } =
        await prepareModelContractSource(fixture);
      const key = randomUUID();
      const bad = await fixture.post({
        path: `${path}/from-approved-model`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: { ...intent, documentDate: '2026-02-30' },
        key,
      });
      expect(bad.status).toBe(400);
      const { termStartsOn, termEndsOn, specialConditions, ...required } =
        intent;
      expect([termStartsOn, termEndsOn, specialConditions]).toEqual([
        null,
        null,
        null,
      ]);
      const body = {
        ...required,
        documentDate: '2024-02-29',
        clientDetails: '☀️'.repeat(2000),
      };
      const created = responseRecord(
        await fixture.command({
          path: `${path}/from-approved-model`,
          companyId: source.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
          body,
          key,
        }),
      );
      const version = responseRecord(created.version);
      expect(
        responseRecord(responseRecord(version.modelGeneration).caseDetails),
      ).toMatchObject({
        documentDate: '2024-02-29',
        clientDetails: '☀️'.repeat(2000),
        termStartsOn: null,
        termEndsOn: null,
        specialConditions: null,
      });
      const changed = await fixture.post({
        path: `${path}/from-approved-model`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: {
          ...body,
          sourceConcordanceBasis: body.sourceConcordanceBasis + ' ',
        },
        key,
      });
      expect({
        status: changed.status,
        body: await changed.json(),
      }).toMatchObject({ status: 409, body: { code: 'IDEMPOTENCY_CONFLICT' } });
      const read = responseRecord(
        await fixture.read({
          path: `${path}/versions/${responseString(version, 'id')}`,
          companyId: source.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
        }),
      );
      expect(responseRecord(read.contract).version).toEqual(version);
    });

    async function effects(companyId: string) {
      const { rows } = await fixture.pool.query<{ effects: unknown }>(
        `SELECT jsonb_build_object(
      'contracts',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY id),'[]') FROM contracts r WHERE company_id=$1),
      'versions',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY id),'[]') FROM contract_versions r WHERE company_id=$1),
      'counters',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY kind),'[]') FROM contract_reference_counters r WHERE company_id=$1),
      'receipts',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY id),'[]') FROM contract_commands r WHERE company_id=$1),
      'events',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY id),'[]') FROM contract_events r WHERE company_id=$1)
    ) AS effects`,
        [companyId],
      );
      if (!rows[0])
        throw new Error('Expected an exact business-effect snapshot.');
      return rows[0].effects;
    }
  },
);
