import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  backendPid,
  effects,
  waitForBlocked,
} from './offer-concurrency.test-support.js';
import {
  ESTIMATE_OFFER_PREPARER,
  ESTIMATE_OFFER_READER,
  openEstimateOfferFixture,
  responseRecord,
} from './offer-estimate-preparation.test-support.js';
import {
  generatedOfferIntent,
  prepareGeneratedOfferWorkflow,
} from './offer-model-generation.test-fixture.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const transitions = [
  {
    name: 'approval',
    stage: 'PENDING',
    action: 'approve',
    event: 'offer_version.approved',
    error: 'OFFER_DECISION_UNCERTAIN',
  },
  {
    name: 'transmission',
    stage: 'APPROVED',
    action: 'transmission',
    event: 'offer_version.transmission_recorded',
    error: 'OFFER_TRANSMISSION_UNCERTAIN',
  },
  {
    name: 'response',
    stage: 'TRANSMITTED',
    action: 'client-response',
    event: 'offer_version.client_response_recorded',
    error: 'OFFER_CLIENT_RESPONSE_UNCERTAIN',
  },
] as const;
withPostgres('Generated-model Offer execution serialization', () => {
  let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
  beforeAll(async () => {
    fixture = await openEstimateOfferFixture();
  });
  beforeEach(async () => fixture.reset());
  afterAll(async () => fixture?.close());
  const pairs = transitions.flatMap((transition) =>
    (['transition-first', 'successor-first'] as const).map((order) => ({
      ...transition,
      order,
    })),
  );
  it.each(pairs)(
    'serializes $name and successor in the proven $order order',
    async (transition) => {
      const ready = await prepareGeneratedOfferWorkflow(
        fixture,
        transition.stage,
      );
      const action = actionCommand(ready, transition.action);
      const successor = {
        path: `${ready.path}/versions/from-approved-model`,
        companyId: ready.source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: {
          ...generatedOfferIntent(ready.source),
          expectedOfferRevision: ready.revision,
        },
      };
      const barrier = await fixture.pool.connect();
      let first: Promise<Response> | undefined,
        second: Promise<Response> | undefined;
      try {
        await barrier.query('BEGIN');
        const pid = await backendPid(barrier);
        await barrier.query(
          'SELECT id FROM opportunities WHERE id=$1 FOR UPDATE',
          [ready.source.opportunityId],
        );
        first = fixture.post(
          transition.order === 'transition-first' ? action : successor,
        );
        await waitForBlocked(fixture.pool, pid);
        second = fixture.post(
          transition.order === 'transition-first' ? successor : action,
        );
        await waitForBlocked(fixture.pool, pid, 2);
        await barrier.query('COMMIT');
        const [winner, loser] = await Promise.all([first, second]);
        expect(winner.status).toBe(201);
        expect(loser.status).toBe(409);
        expect(await loser.json()).toMatchObject({
          code: 'STALE_OFFER_REVISION',
        });
        const reopened = responseRecord(
          responseRecord(
            await fixture.read({
              path: ready.path,
              companyId: ready.source.companyId,
              headers: ESTIMATE_OFFER_READER,
            }),
          ).offer,
        );
        expect(reopened.revision).toBe(ready.revision + 1);
        if (transition.order === 'successor-first')
          expect(reopened).toMatchObject({
            version: {
              versionNumber: 2,
              decisionState: 'PENDING',
              transmissionState: 'NOT_TRANSMITTED',
              clientResponseState: 'NONE',
              latestQualityRun: null,
            },
          });
        else expect(reopened).toMatchObject({ version: { versionNumber: 1 } });
        const { rows } = await fixture.pool.query<{ count: number }>(
          'SELECT count(*)::int AS count FROM offer_versions',
        );
        expect(rows[0]?.count).toBe(
          transition.order === 'successor-first' ? 2 : 1,
        );
      } finally {
        await barrier.query('ROLLBACK');
        barrier.release();
        await Promise.allSettled([
          ...(first ? [first] : []),
          ...(second ? [second] : []),
        ]);
      }
    },
  );
  it.each(transitions)(
    'rolls back the full $name transition when its final event fails',
    async (transition) => {
      const ready = await prepareGeneratedOfferWorkflow(
        fixture,
        transition.stage,
      );
      const before = await effects(fixture.pool);
      await fixture.pool.query(
        `CREATE FUNCTION fail_model_execution() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='${transition.event}' THEN RAISE EXCEPTION 'Synthetic final execution fault'; END IF; RETURN NEW; END $$`,
      );
      await fixture.pool.query(
        'CREATE TRIGGER fail_model_execution BEFORE INSERT ON offer_events FOR EACH ROW EXECUTE FUNCTION fail_model_execution()',
      );
      try {
        const failed = await fixture.post(
          actionCommand(ready, transition.action),
        );
        expect({
          status: failed.status,
          body: await failed.json(),
        }).toMatchObject({ status: 500, body: { code: transition.error } });
        expect(await effects(fixture.pool)).toEqual(before);
      } finally {
        await fixture.pool.query(
          'DROP TRIGGER fail_model_execution ON offer_events',
        );
        await fixture.pool.query('DROP FUNCTION fail_model_execution()');
      }
    },
  );
});
function actionCommand(
  ready: Awaited<ReturnType<typeof prepareGeneratedOfferWorkflow>>,
  action: (typeof transitions)[number]['action'],
) {
  const base = {
    path: `${ready.base}/${action}`,
    companyId: ready.source.companyId,
    headers:
      action === 'transmission'
        ? ESTIMATE_OFFER_PREPARER
        : ESTIMATE_OFFER_READER,
  };
  switch (action) {
    case 'approve':
      return {
        ...base,
        body: {
          expectedOfferRevision: ready.revision,
          acknowledgedWarningCodes: [
            'DECLARED_TAX_UNVERIFIED',
            'NON_OFFICIAL_OFFER',
            'ILLUSTRATIVE_MODEL',
          ],
        },
      };
    case 'transmission':
      return {
        ...base,
        body: {
          expectedOfferRevision: ready.revision,
          acknowledgedWarningCodes: [],
          note: null,
        },
      };
    case 'client-response':
      return {
        ...base,
        body: {
          expectedOfferRevision: ready.revision,
          outcome: 'ACCEPTED',
          receivedAt: '2026-10-24T09:00:00.000Z',
        },
      };
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
