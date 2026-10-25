import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  ESTIMATE_OFFER_PREPARER,
  ESTIMATE_OFFER_READER,
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import { prepareModelContractSource } from './model-contract.test-fixture.js';
import { modelContractEffects } from './model-contract.test-support.js';
import * as valuesOwner from './model-contract-version-values.js';
import {
  backendPid,
  waitForBlocked,
} from '../offer/offer-concurrency.test-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('Model Contract scoped storage and fresh instants', () => {
  let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>,
    instant: Date;
  beforeAll(async () => {
    fixture = await openEstimateOfferFixture({
      serverClock: { now: () => new Date(instant) },
    });
  });
  beforeEach(async () => {
    instant = new Date('2026-10-24T09:00:00.000Z');
    await fixture.reset();
  });
  afterAll(async () => {
    await fixture?.close();
  });

  it('rejects changes to frozen provenance, source/model copies, financials and representation and immutable decisions', async () => {
    const ready = await prepareModelContractSource(fixture),
      created = responseRecord(
        await ready.invoke(ready.path + '/from-approved-model', ready.intent),
      ),
      versionId = responseString(responseRecord(created.version), 'id');
    await ready.invoke(`${ready.path}/versions/${versionId}/approve`, {
      expectedContractRevision: 1,
      acknowledgedWarningCodes: [
        'MODEL_WORDING_REVIEWED',
        'ANNEX_SCOPE_REVIEWED',
      ],
      reviewBasis: 'Synthetic exact review retained forever',
    });
    const before = await modelContractEffects(fixture.pool);
    for (const command of [
      {
        sql: "UPDATE contracts SET origin='DIRECT',source_offer_id=NULL,source_offer_version_id=NULL,direct_reason='Attempted mode conversion' WHERE id=$1",
        values: [created.id],
      },
      {
        sql: "UPDATE contract_versions SET provenance='ILLUSTRATIVE' WHERE id=$1",
        values: [versionId],
      },
      {
        sql: 'UPDATE contract_versions SET model_source_version_id=$2 WHERE id=$1',
        values: [versionId, '10000000-0000-4000-8000-000000000999'],
      },
      {
        sql: "UPDATE contract_versions SET model_generation_snapshot=jsonb_set(model_generation_snapshot,'{financials,netAmount}','\"1.00\"') WHERE id=$1",
        values: [versionId],
      },
      {
        sql: "UPDATE contract_versions SET model_generation_snapshot=jsonb_set(model_generation_snapshot,'{representation,html}','\"changed\"') WHERE id=$1",
        values: [versionId],
      },
      {
        sql: "UPDATE contract_decisions SET review_basis='Changed past review' WHERE contract_version_id=$1",
        values: [versionId],
      },
    ]) {
      await expect(
        fixture.pool.query(command.sql, command.values),
      ).rejects.toMatchObject({ code: '23514' });
      expect(await modelContractEffects(fixture.pool)).toEqual(before);
    }
  });

  it.each([
    'foreign-model',
    'unequal-financials',
    'unequal-representation',
  ] as const)(
    'rolls back a faulty producer attempting %s before a response or receipt can commit',
    async (fault) => {
      const ready = await prepareModelContractSource(fixture),
        foreign = await prepareModelContractSource(fixture, {
          clientTaxId: 'OTHER-SYNTHETIC-STORAGE-868',
        });
      const before = await modelContractEffects(fixture.pool),
        actual = valuesOwner.modelContractVersionValues;
      const producer = vi
        .spyOn(valuesOwner, 'modelContractVersionValues')
        .mockImplementationOnce((input) => {
          const values = actual(input);
          if (fault === 'foreign-model')
            return {
              ...values,
              modelSourceVersionId: foreign.intent.modelVersionId,
              modelSourceDecisionId: foreign.intent.modelApprovalDecisionId,
            };
          const snapshot = values.modelGenerationSnapshot;
          const changed =
            fault === 'unequal-financials'
              ? {
                  ...snapshot,
                  financials: {
                    ...snapshot.financials,
                    grossAmount: '1.00',
                  },
                }
              : {
                  ...snapshot,
                  representation: {
                    ...snapshot.representation,
                    html: 'Changed frozen bytes',
                  },
                };
          return { ...values, modelGenerationSnapshot: changed };
        });
      const command = {
        path: ready.path + '/from-approved-model',
        companyId: ready.source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: ready.intent,
        key: 'producer-fault-is-uncommitted',
      };
      try {
        expect((await fixture.post(command)).status).toBe(500);
        expect(await modelContractEffects(fixture.pool)).toEqual(before);
      } finally {
        producer.mockRestore();
      }
      expect(await fixture.command(command)).toMatchObject({
        illustrativeReference: 1,
        revision: 1,
      });
    },
  );

  it('binds the quality rule set to the new mode and refuses a fabricated ready-source PASS', async () => {
    const ready = await prepareModelContractSource(fixture),
      created = responseRecord(
        await ready.invoke(ready.path + '/from-approved-model', ready.intent),
      ),
      versionId = responseString(responseRecord(created.version), 'id');
    const run = responseRecord(
      await ready.invoke(
        `${ready.path}/versions/${versionId}/quality-checks`,
        {},
      ),
    );
    await fixture.command({
      path: ready.flow.base + '/client-response',
      companyId: ready.source.companyId,
      headers: ESTIMATE_OFFER_READER,
      body: {
        expectedOfferRevision: 3,
        outcome: 'REJECTED',
        receivedAt: instant.toISOString(),
        reason: 'Explicit synthetic refusal',
      },
    });
    const before = await modelContractEffects(fixture.pool);
    for (const ruleSet of [
      'CONTRACT_QUALITY_ILLUSTRATIVE',
      'CONTRACT_QUALITY_COMPANY_MODEL',
    ]) {
      await expect(
        fixture.pool.query(
          `INSERT INTO contract_quality_runs(workspace_id,company_id,contract_id,contract_version_id,rule_set,rule_set_version,results,actor_internal_user_id,actor_workspace_membership_id,evaluated_at) SELECT workspace_id,company_id,contract_id,id,$2,1,$3,created_by_internal_user_id,created_by_workspace_membership_id,$4 FROM contract_versions WHERE id=$1`,
          [
            versionId,
            ruleSet,
            JSON.stringify(run.results),
            instant.toISOString(),
          ],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      expect(await modelContractEffects(fixture.pool)).toEqual(before);
    }
  });

  it.each(['preparation', 'decision'] as const)(
    'rechecks expiry after the final %s source fence wait',
    async (stage) => {
      const ready = await prepareModelContractSource(fixture);
      let command: {
        path: string;
        body: unknown;
        companyId: string;
        headers: typeof ESTIMATE_OFFER_PREPARER;
      } = {
        path: ready.path + '/from-approved-model',
        body: ready.intent,
        companyId: ready.source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
      };
      if (stage === 'decision') {
        const created = responseRecord(
          await ready.invoke(command.path, command.body),
        );
        command = {
          ...command,
          path: `${ready.path}/versions/${responseString(responseRecord(created.version), 'id')}/approve`,
          body: {
            expectedContractRevision: 1,
            acknowledgedWarningCodes: [
              'MODEL_WORDING_REVIEWED',
              'ANNEX_SCOPE_REVIEWED',
            ],
            reviewBasis: 'Synthetic review before final wait',
          },
        };
      }
      const before = await modelContractEffects(fixture.pool),
        barrier = await fixture.pool.connect();
      let pending: Promise<Response> | undefined;
      try {
        await barrier.query('BEGIN');
        const pid = await backendPid(barrier);
        await barrier.query(
          stage === 'preparation'
            ? 'SELECT id FROM contract_models WHERE company_id=$1 FOR UPDATE'
            : 'SELECT id FROM contracts WHERE company_id=$1 FOR UPDATE',
          [ready.source.companyId],
        );
        pending = fixture.post(command);
        await waitForBlocked(fixture.pool, pid);
        instant = new Date('2026-11-25T09:00:00.000Z');
        await barrier.query('COMMIT');
        expect((await pending).status).toBe(409);
        expect(await modelContractEffects(fixture.pool)).toEqual(before);
      } finally {
        await barrier.query('ROLLBACK');
        barrier.release();
        await Promise.allSettled(pending ? [pending] : []);
      }
    },
  );
});
