import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  backendPid,
  effects,
  waitForBlocked,
} from './offer-concurrency.test-support.js';
import {
  ESTIMATE_OFFER_DIRECTOR,
  ESTIMATE_OFFER_PREPARER,
  estimateOfferIntent,
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from './offer-estimate-preparation.test-support.js';
import {
  generatedOfferIntent,
  generatedOfferModelContent,
  prepareGeneratedOfferSource,
} from './offer-model-generation.test-fixture.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('Generated-model Offer transactional REST', () => {
  let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
  beforeAll(async () => {
    fixture = await openEstimateOfferFixture();
  });
  beforeEach(async () => fixture.reset());
  afterAll(async () => fixture?.close());

  it.each([
    { change: 'withdrawal', order: 'change-first' },
    { change: 'withdrawal', order: 'generation-first' },
    { change: 'replacement', order: 'change-first' },
    { change: 'replacement', order: 'generation-first' },
  ] as const)(
    'serializes model use and $change in the proven $order order',
    async ({ change, order }) => {
      const source = await prepareGeneratedOfferSource(fixture);
      let replacementId: string | undefined;
      if (change === 'replacement') {
        const pending = responseRecord(
          responseRecord(
            await fixture.command({
              path: '/offer-models/consulting-ro/versions',
              companyId: source.companyId,
              headers: ESTIMATE_OFFER_PREPARER,
              body: {
                expectedModelRevision: 2,
                content: {
                  ...generatedOfferModelContent,
                  serviceTitle: 'Replacement source for serialized use',
                },
              },
            }),
          ).model,
        );
        replacementId = responseString(responseRecord(pending.head), 'id');
      }
      const barrier = await fixture.pool.connect();
      let generation: Promise<Response> | undefined,
        withdrawal: Promise<Response> | undefined;
      const generate = () =>
        fixture.post({
          path: `/offers/opportunities/${source.opportunityId}/from-approved-model`,
          companyId: source.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
          key: 'model-use-serialized',
          body: generatedOfferIntent(source),
        });
      const changeModel = () =>
        fixture.post(
          replacementId
            ? {
                path: `/offer-models/consulting-ro/versions/${replacementId}/decision`,
                companyId: source.companyId,
                headers: ESTIMATE_OFFER_DIRECTOR,
                body: {
                  expectedModelRevision: 3,
                  versionNumber: 2,
                  outcome: 'APPROVE',
                  basis: 'Replacement approved for future use',
                },
              }
            : {
                path: `/offer-models/consulting-ro/versions/${source.modelVersionId}/withdrawal`,
                companyId: source.companyId,
                headers: ESTIMATE_OFFER_DIRECTOR,
                body: {
                  expectedModelRevision: 2,
                  versionNumber: 1,
                  reason: 'Synthetic future-use retirement',
                },
              },
        );
      try {
        await barrier.query('BEGIN');
        const pid = await backendPid(barrier);
        await barrier.query(
          'SELECT id FROM offer_models WHERE company_id=$1 FOR UPDATE',
          [source.companyId],
        );
        if (order === 'change-first') withdrawal = changeModel();
        else generation = generate();
        await waitForBlocked(fixture.pool, pid);
        if (order === 'change-first') generation = generate();
        else withdrawal = changeModel();
        await waitForBlocked(fixture.pool, pid, 2);
        await barrier.query('COMMIT');
        if (!generation || !withdrawal)
          throw new Error('Missing paired commands.');
        const [generated, withdrawn] = await Promise.all([
          generation,
          withdrawal,
        ]);
        expect(withdrawn.status).toBe(201);
        if (order === 'change-first') {
          expect({
            status: generated.status,
            body: await generated.json(),
          }).toMatchObject({
            status: 409,
            body: { code: 'OFFER_MODEL_SELECTION_UNAVAILABLE' },
          });
          expect(await effects(fixture.pool)).toMatchObject({
            offers: 0,
            versions: 0,
            commands: 0,
            events: 0,
          });
        } else {
          expect(generated.status).toBe(201);
          const recorded: unknown = await generated.json();
          expect(
            await fixture.command({
              path: `/offers/opportunities/${source.opportunityId}/from-approved-model`,
              companyId: source.companyId,
              headers: ESTIMATE_OFFER_PREPARER,
              key: 'model-use-serialized',
              body: generatedOfferIntent(source),
            }),
          ).toEqual(recorded);
          expect(await effects(fixture.pool)).toMatchObject({
            offers: 1,
            versions: 1,
            commands: 1,
            events: 2,
          });
        }
      } finally {
        await barrier.query('ROLLBACK');
        barrier.release();
        await Promise.allSettled([
          ...(generation ? [generation] : []),
          ...(withdrawal ? [withdrawal] : []),
        ]);
      }
    },
  );

  it.each([
    'identical-key',
    'changed-key-intent',
    'distinct-first-keys',
    'shared-legacy-key',
  ] as const)('commits once for concurrent %s commands', async (kind) => {
    const source = await prepareGeneratedOfferSource(fixture);
    const path = `/offers/opportunities/${source.opportunityId}`;
    const first = {
      path: `${path}/from-approved-model`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      key: 'competing-model-create',
      body: generatedOfferIntent(source),
    };
    const second =
      kind === 'changed-key-intent'
        ? {
            ...first,
            body: {
              ...first.body,
              financialDeclaration: {
                ...first.body.financialDeclaration,
                taxAmount: '0.00',
              },
            },
          }
        : kind === 'distinct-first-keys'
          ? { ...first, key: 'other-first-key' }
          : kind === 'shared-legacy-key'
            ? {
                ...first,
                path: `${path}/from-approved-estimate`,
                body: estimateOfferIntent(source),
              }
            : first;
    const barrier = await fixture.pool.connect();
    let pending: Promise<Response>[] = [];
    try {
      await barrier.query('BEGIN');
      const pid = await backendPid(barrier);
      await barrier.query(
        'SELECT id FROM opportunities WHERE id=$1 FOR UPDATE',
        [source.opportunityId],
      );
      pending = [fixture.post(first), fixture.post(second)];
      await waitForBlocked(fixture.pool, pid, 2);
      await barrier.query('COMMIT');
      const results = await Promise.all(pending);
      expect(results.map((result) => result.status).sort()).toEqual(
        kind === 'identical-key' ? [201, 201] : [201, 409],
      );
      if (kind === 'identical-key')
        expect(await results[0]?.json()).toEqual(await results[1]?.json());
      expect(await effects(fixture.pool)).toMatchObject({
        offers: 1,
        versions: 1,
        commands: 1,
        events: 2,
      });
    } finally {
      await barrier.query('ROLLBACK');
      barrier.release();
      await Promise.allSettled(pending);
    }
  });

  it('serializes complete successors at one observed revision', async () => {
    const source = await prepareGeneratedOfferSource(fixture);
    const path = `/offers/opportunities/${source.opportunityId}`;
    const created = responseRecord(
      await fixture.command({
        path: `${path}/from-approved-model`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: generatedOfferIntent(source),
      }),
    );
    const barrier = await fixture.pool.connect();
    let pending: Promise<Response>[] = [];
    try {
      await barrier.query('BEGIN');
      const pid = await backendPid(barrier);
      await barrier.query('SELECT id FROM offers WHERE id=$1 FOR UPDATE', [
        created.id,
      ]);
      pending = ['25.00', '0.00'].map((taxAmount) =>
        fixture.post({
          path: `${path}/versions/from-approved-model`,
          companyId: source.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
          body: {
            ...generatedOfferIntent(source),
            expectedOfferRevision: 1,
            financialDeclaration: {
              ...generatedOfferIntent(source).financialDeclaration,
              taxAmount,
            },
          },
        }),
      );
      await waitForBlocked(fixture.pool, pid, 2);
      await barrier.query('COMMIT');
      const responses = await Promise.all(pending);
      expect(responses.map((result) => result.status).sort()).toEqual([
        201, 409,
      ]);
      const conflict = responses.find((result) => result.status === 409);
      expect(conflict ? await conflict.json() : null).toMatchObject({
        code: 'STALE_OFFER_REVISION',
      });
      expect(await effects(fixture.pool)).toMatchObject({
        offers: 1,
        versions: 2,
        commands: 2,
        events: 3,
      });
    } finally {
      await barrier.query('ROLLBACK');
      barrier.release();
      await Promise.allSettled(pending);
    }
  });

  it('rolls back every generated record, reference, Client fence and lineage on final event failure', async () => {
    const source = await prepareGeneratedOfferSource(fixture);
    const path = `/offers/opportunities/${source.opportunityId}`;
    const before = await effects(fixture.pool);
    await fixture.pool.query(
      "CREATE FUNCTION fail_generated_offer_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='offer_version.created' THEN RAISE EXCEPTION 'Synthetic final-write refusal'; END IF; RETURN NEW; END $$",
    );
    await fixture.pool.query(
      'CREATE TRIGGER fail_generated_offer_event BEFORE INSERT ON offer_events FOR EACH ROW EXECUTE FUNCTION fail_generated_offer_event()',
    );
    try {
      const result = await fixture.post({
        path: `${path}/from-approved-model`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: generatedOfferIntent(source),
      });
      expect({
        status: result.status,
        body: await result.json(),
      }).toMatchObject({ status: 500, body: { code: 'OFFER_COMMAND_FAILED' } });
      expect(await effects(fixture.pool)).toEqual(before);
    } finally {
      await fixture.pool.query(
        'DROP TRIGGER fail_generated_offer_event ON offer_events',
      );
      await fixture.pool.query('DROP FUNCTION fail_generated_offer_event()');
    }
  });
});
