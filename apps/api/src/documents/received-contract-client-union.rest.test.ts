import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ESTIMATE_OFFER_PREPARER,
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import {
  backendPid,
  waitForBlocked,
} from '../offer/offer-concurrency.test-support.js';
import { prepareReceivedContractSource } from './received-contract.test-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('Received Contract binding and public Client union REST', () => {
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
  it.each([true, false])(
    'serializes public Client union and relation binding, Document first: %s',
    async (documentFirst) => {
      const f = await prepareReceivedContractSource(fixture),
        s = f.ready.source;
      const command = (path: string, body: unknown) =>
        fixture.command({
          path,
          body,
          companyId: s.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
        });
      const second = responseString(
        responseRecord(
          await command('/clients', {
            displayName: 'Canonical received Client DEMO',
          }),
        ),
        'id',
      );
      // Model a historical duplicate import at the storage boundary, as in the Client owner tests.
      await fixture.pool.query(
        "UPDATE client_accounts SET tax_id='RECEIVED-UNION-DEMO' WHERE id=ANY($1::uuid[])",
        [[s.clientId, second]],
      );
      const review = async () =>
        responseString(
          responseRecord(
            await command(`/clients/${s.clientId}/union-reviews`, {}),
          ),
          'reviewReference',
        );
      const confirmation = {
        canonicalClientId: second,
        fields: {
          displayName: s.clientId,
          taxId: s.clientId,
          address: s.clientId,
          telephone: s.clientId,
          generalEmail: s.clientId,
          businessActivity: s.clientId,
        },
        companyIds: [s.companyId],
        reviewedDifferences: true,
        reason: 'Synthetic original identity review',
      };
      const union = {
        path: `/client-union-reviews/${await review()}/confirm`,
        companyId: s.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        key: randomUUID(),
        body: confirmation,
      };
      const registration = {
        path: '/documents',
        companyId: s.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        key: 'union-ordered-received',
        body: {
          type: 'received-contract',
          opportunityId: s.opportunityId,
          contractId: f.contractId,
          contractVersionId: f.contractVersionId,
          title: 'Original Client received Contract',
          purpose: 'No automatic canonical rebinding',
          sourceDescription: 'Synthetic source',
        },
      };
      const table = documentFirst
        ? 'document_registration_events'
        : 'client_union_operations';
      const barrier = await fixture.pool.connect();
      let first: Promise<Response> | undefined,
        secondCommand: Promise<Response> | undefined;
      await fixture.pool.query(
        'CREATE FUNCTION pause_received_union_order() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(872874); RETURN NEW; END $$',
      );
      await fixture.pool.query(
        `CREATE TRIGGER pause_received_union_order BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION pause_received_union_order()`,
      );
      try {
        await barrier.query('BEGIN');
        const pid = await backendPid(barrier);
        await barrier.query('SELECT pg_advisory_xact_lock(872874)');
        first = fixture.post(documentFirst ? registration : union);
        await waitForBlocked(fixture.pool, pid);
        secondCommand = fixture.post(documentFirst ? union : registration);
        await waitForBlocked(fixture.pool, pid, 2);
        await barrier.query('COMMIT');
        expect((await first).status).toBe(201);
        expect((await secondCommand).status).toBe(404);
        if (documentFirst) {
          const document = responseRecord(await (await first).json());
          await command(
            `/client-union-reviews/${await review()}/confirm`,
            confirmation,
          );
          const replay = responseRecord(await fixture.command(registration));
          expect(replay).toMatchObject({
            id: document.id,
            clientId: s.clientId,
            clientDossierId: second,
            correction: 'read-only',
            receivedContractRelation: document.receivedContractRelation,
          });
          expect(
            (await fixture.post({ ...registration, key: randomUUID() })).status,
          ).toBe(404);
        } else {
          expect(
            await fixture.read({
              path: '/documents',
              companyId: s.companyId,
              headers: ESTIMATE_OFFER_PREPARER,
            }),
          ).toEqual([]);
          expect((await fixture.post(registration)).status).toBe(404);
        }
      } finally {
        await barrier.query('ROLLBACK').catch(() => undefined);
        barrier.release();
        await first?.catch(() => undefined);
        await secondCommand?.catch(() => undefined);
        await fixture.pool.query(
          `DROP TRIGGER pause_received_union_order ON ${table}`,
        );
        await fixture.pool.query('DROP FUNCTION pause_received_union_order()');
      }
    },
  );
});
