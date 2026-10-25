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
  backendPid,
  waitForBlocked,
} from '../offer/offer-concurrency.test-support.js';
import {
  ESTIMATE_OFFER_PREPARER,
  ESTIMATE_OFFER_READER,
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import { generatedOfferIntent } from '../offer/offer-model-generation.test-fixture.js';
import {
  generatedContractModelContent,
  prepareModelContractSource,
} from './model-contract.test-fixture.js';
import { modelContractEffects } from './model-contract.test-support.js';
import * as presentation from './model-contract-view.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres(
  'Model Contract atomic preparation and exact committing transitions',
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

    it.each(['withdrawal', 'replacement'] as const)(
      'serializes both orders of model %s and consumption',
      async (change) => {
        // Separate fresh fixtures for the two serial histories; neither order relies on timing.
        for (const changeFirst of [true, false]) {
          if (!changeFirst) await fixture.reset();
          const ready = await prepareModelContractSource(fixture);
          let replacementId: string | undefined;
          if (change === 'replacement') {
            const submitted = responseRecord(
              responseRecord(
                await ready.invoke('/contract-models/consulting-ro/versions', {
                  expectedModelRevision: 2,
                  content: {
                    ...generatedContractModelContent,
                    title: 'Replacement deliberately selected later',
                  },
                }),
              ).model,
            );
            replacementId = responseString(
              responseRecord(submitted.head),
              'id',
            );
          }
          const generation = creation(ready, 'serialized-model-use');
          const mutation = replacementId
            ? {
                path: `/contract-models/consulting-ro/versions/${replacementId}/decision`,
                body: {
                  expectedModelRevision: 3,
                  versionNumber: 2,
                  outcome: 'APPROVE',
                  basis: 'Explicit synthetic replacement',
                },
              }
            : {
                path: `/contract-models/consulting-ro/versions/${ready.intent.modelVersionId}/withdrawal`,
                body: {
                  expectedModelRevision: 2,
                  versionNumber: 1,
                  reason: 'Retire future use',
                },
              };
          const changeCommand = {
            ...mutation,
            companyId: ready.source.companyId,
            headers: ESTIMATE_OFFER_PREPARER,
          };
          const pair = await orderedPair(
            'SELECT id FROM contract_models WHERE company_id=$1 FOR UPDATE',
            [ready.source.companyId],
            changeFirst ? changeCommand : generation,
            changeFirst ? generation : changeCommand,
          );
          expect(pair[0].status).toBe(201);
          expect(pair[1].status).toBe(changeFirst ? 409 : 201);
          if (changeFirst)
            expect(await pair[1].json()).toMatchObject({
              code: 'CONTRACT_MODEL_SELECTION_UNAVAILABLE',
            });
          else
            expect(await fixture.command(generation)).toEqual(
              await pair[0].json(),
            );
          expect(await counts()).toMatchObject(
            changeFirst
              ? {
                  roots: 0,
                  versions: 0,
                  receipts: 0,
                  events: 0,
                  reference: null,
                }
              : { roots: 1, versions: 1, receipts: 1, events: 2, reference: 1 },
          );
        }
      },
      30_000,
    );

    it.each(['rejection', 'successor'] as const)(
      'serializes both orders of source %s and first binding',
      async (change) => {
        for (const changeFirst of [true, false]) {
          if (!changeFirst) await fixture.reset();
          const ready = await prepareModelContractSource(fixture);
          const generation = creation(ready, 'serialized-offer-use');
          const mutation =
            change === 'rejection'
              ? {
                  path: ready.flow.base + '/client-response',
                  headers: ESTIMATE_OFFER_READER,
                  body: {
                    expectedOfferRevision: ready.flow.revision,
                    outcome: 'REJECTED',
                    receivedAt: '2026-10-24T09:00:00.000Z',
                    reason: 'Synthetic refusal',
                  },
                }
              : {
                  path: ready.flow.path + '/versions/from-approved-model',
                  headers: ESTIMATE_OFFER_PREPARER,
                  body: {
                    ...generatedOfferIntent(ready.source),
                    expectedOfferRevision: ready.flow.revision,
                  },
                };
          const changeCommand = {
            ...mutation,
            companyId: ready.source.companyId,
          };
          const pair = await orderedPair(
            'SELECT id FROM opportunities WHERE id=$1 FOR UPDATE',
            [ready.source.opportunityId],
            changeFirst ? changeCommand : generation,
            changeFirst ? generation : changeCommand,
          );
          expect(pair[0].status).toBe(201);
          expect(pair[1].status).toBe(changeFirst ? 409 : 201);
          if (changeFirst)
            expect(await pair[1].json()).toMatchObject({
              code: 'OFFER_NOT_PREPARABLE',
            });
          else
            expect(await fixture.command(generation)).toEqual(
              await pair[0].json(),
            );
          expect(await counts()).toMatchObject(
            changeFirst
              ? {
                  roots: 0,
                  versions: 0,
                  receipts: 0,
                  events: 0,
                  reference: null,
                }
              : { roots: 1, versions: 1, receipts: 1, events: 2, reference: 1 },
          );
        }
      },
      30_000,
    );

    it.each(['same-key', 'changed-intent', 'different-keys'] as const)(
      'commits only one first Version for competing %s commands',
      async (mode) => {
        const ready = await prepareModelContractSource(fixture),
          first = creation(ready, 'competing-first');
        const second =
          mode === 'changed-intent'
            ? {
                ...first,
                body: {
                  ...ready.intent,
                  clientDetails: 'Different synthetic intent',
                },
              }
            : mode === 'different-keys'
              ? { ...first, key: 'other-first-key' }
              : first;
        const responses = await orderedPair(
          'SELECT id FROM opportunities WHERE id=$1 FOR UPDATE',
          [ready.source.opportunityId],
          first,
          second,
        );
        expect(responses.map((r) => r.status)).toEqual(
          mode === 'same-key' ? [201, 201] : [201, 409],
        );
        if (mode === 'same-key')
          expect(await responses[1].json()).toEqual(await responses[0].json());
        else
          expect(await responses[1].json()).toMatchObject({
            code:
              mode === 'changed-intent'
                ? 'IDEMPOTENCY_CONFLICT'
                : 'CONTRACT_ALREADY_EXISTS',
          });
        expect(await counts()).toMatchObject({
          roots: 1,
          versions: 1,
          receipts: 1,
          events: 2,
          reference: 1,
        });
      },
    );

    it.each(['successor', 'approve', 'reject'] as const)(
      'serializes a successor against a competing %s at the exact revision',
      async (transition) => {
        for (const successorFirst of [true, false]) {
          if (!successorFirst) await fixture.reset();
          const ready = await prepareModelContractSource(fixture),
            created = responseRecord(
              await fixture.command(creation(ready, 'original')),
            ),
            versionId = responseString(responseRecord(created.version), 'id');
          const successor = {
            path: ready.path + '/versions/from-approved-model',
            companyId: ready.source.companyId,
            headers: ESTIMATE_OFFER_PREPARER,
            body: { ...ready.intent, expectedContractRevision: 1 },
          };
          const other =
            transition === 'successor'
              ? {
                  ...successor,
                  body: {
                    ...successor.body,
                    clientDetails: 'Other complete successor',
                  },
                }
              : {
                  path: `${ready.path}/versions/${versionId}/${transition}`,
                  companyId: ready.source.companyId,
                  headers: ESTIMATE_OFFER_PREPARER,
                  body:
                    transition === 'approve'
                      ? {
                          expectedContractRevision: 1,
                          acknowledgedWarningCodes: [
                            'MODEL_WORDING_REVIEWED',
                            'ANNEX_SCOPE_REVIEWED',
                          ],
                          reviewBasis: 'Synthetic exact review',
                        }
                      : {
                          expectedContractRevision: 1,
                          reason: 'Synthetic explicit rejection',
                        },
                };
          const pair = await orderedPair(
            'SELECT id FROM opportunities WHERE id=$1 FOR UPDATE',
            [ready.source.opportunityId],
            successorFirst ? successor : other,
            successorFirst ? other : successor,
          );
          expect(pair.map((r) => r.status)).toEqual([201, 409]);
          const current = responseRecord(
            responseRecord(
              await fixture.read({
                path: ready.path,
                companyId: ready.source.companyId,
                headers: ESTIMATE_OFFER_PREPARER,
              }),
            ).contract,
          );
          expect(current.revision).toBe(2);
          expect(responseRecord(current.version)).toMatchObject({
            versionNumber: successorFirst || transition === 'successor' ? 2 : 1,
            decisionState:
              successorFirst || transition === 'successor'
                ? 'PENDING'
                : transition === 'approve'
                  ? 'APPROVED'
                  : 'REJECTED',
          });
          expect(await counts()).toMatchObject({
            roots: 1,
            versions: successorFirst || transition === 'successor' ? 2 : 1,
            receipts: 2,
            events: 3,
            reference: 1,
          });
        }
      },
      30_000,
    );

    it.each(['first', 'successor', 'decision'] as const)(
      'rolls back every effect after a forced final %s event failure and accepts an identical retry',
      async (stage) => {
        const ready = await prepareModelContractSource(fixture);
        let command = creation(ready, 'final-event-first');
        if (stage !== 'first') {
          const created = responseRecord(await fixture.command(command));
          command =
            stage === 'successor'
              ? {
                  ...creation(ready, 'final-event-successor'),
                  path: ready.path + '/versions/from-approved-model',
                  body: { ...ready.intent, expectedContractRevision: 1 },
                }
              : {
                  ...creation(ready, 'final-event-approve'),
                  path: `${ready.path}/versions/${responseString(responseRecord(created.version), 'id')}/approve`,
                  body: {
                    expectedContractRevision: 1,
                    acknowledgedWarningCodes: [
                      'MODEL_WORDING_REVIEWED',
                      'ANNEX_SCOPE_REVIEWED',
                    ],
                    reviewBasis: 'Synthetic complete review',
                  },
                };
        }
        const before = await modelContractEffects(fixture.pool);
        await fixture.pool.query(
          "CREATE FUNCTION fail_model_contract_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action <> 'contract.created' THEN RAISE EXCEPTION 'synthetic final event failure'; END IF; RETURN NEW; END $$",
        );
        await fixture.pool.query(
          'CREATE TRIGGER fail_model_contract_event BEFORE INSERT ON contract_events FOR EACH ROW EXECUTE FUNCTION fail_model_contract_event()',
        );
        try {
          expect((await fixture.post(command)).status).toBe(500);
          expect(await modelContractEffects(fixture.pool)).toEqual(before);
        } finally {
          await fixture.pool.query(
            'DROP TRIGGER fail_model_contract_event ON contract_events',
          );
          await fixture.pool.query('DROP FUNCTION fail_model_contract_event()');
        }
        expect((await fixture.post(command)).status).toBe(201);
      },
    );

    it.each(['first', 'successor'] as const)(
      'rolls back the %s command when final response construction fails',
      async (stage) => {
        const ready = await prepareModelContractSource(fixture);
        let command = creation(ready, 'response-first');
        if (stage === 'successor') {
          await fixture.command(command);
          command = {
            ...creation(ready, 'response-successor'),
            path: ready.path + '/versions/from-approved-model',
            body: { ...ready.intent, expectedContractRevision: 1 },
          };
        }
        const before = await modelContractEffects(fixture.pool);
        const failure = vi
          .spyOn(presentation, 'modelContractCreationReceipt')
          .mockImplementationOnce(() => {
            throw new Error('Synthetic response boundary failure');
          });
        try {
          expect((await fixture.post(command)).status).toBe(500);
          expect(await modelContractEffects(fixture.pool)).toEqual(before);
        } finally {
          failure.mockRestore();
        }
        expect((await fixture.post(command)).status).toBe(201);
      },
    );

    async function orderedPair(
      lock: string,
      values: readonly string[],
      first: Parameters<typeof fixture.post>[0],
      second: Parameters<typeof fixture.post>[0],
    ) {
      const barrier = await fixture.pool.connect();
      let one: Promise<Response> | undefined,
        two: Promise<Response> | undefined;
      try {
        await barrier.query('BEGIN');
        const pid = await backendPid(barrier);
        await barrier.query(lock, [...values]);
        one = fixture.post(first);
        await waitForBlocked(fixture.pool, pid);
        two = fixture.post(second);
        await waitForBlocked(fixture.pool, pid, 2);
        await barrier.query('COMMIT');
        return await Promise.all([one, two]);
      } finally {
        await barrier.query('ROLLBACK');
        barrier.release();
        await Promise.allSettled([
          ...(one ? [one] : []),
          ...(two ? [two] : []),
        ]);
      }
    }
    async function counts() {
      const { rows } = await fixture.pool.query<{
        roots: number;
        versions: number;
        receipts: number;
        events: number;
        reference: number | null;
      }>(
        `SELECT (SELECT count(*)::int FROM contracts) AS roots,(SELECT count(*)::int FROM contract_versions) AS versions,(SELECT count(*)::int FROM contract_commands) AS receipts,(SELECT count(*)::int FROM contract_events) AS events,(SELECT max(current_reference) FROM contract_reference_counters) AS reference`,
      );
      if (!rows[0]) throw new Error('Missing complete counts');
      return rows[0];
    }
  },
);
function creation(
  ready: Awaited<ReturnType<typeof prepareModelContractSource>>,
  key: string,
): {
  path: string;
  companyId: string;
  headers: typeof ESTIMATE_OFFER_PREPARER;
  key: string;
  body: unknown;
} {
  return {
    path: ready.path + '/from-approved-model',
    companyId: ready.source.companyId,
    headers: ESTIMATE_OFFER_PREPARER,
    key,
    body: ready.intent,
  };
}
