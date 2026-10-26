import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { openDocumentScannerFixture } from '../documents/document-scanner.test-support.js';
import {
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import { prepareReportedSigning } from './reported-contract-signing.test-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres(
  'Reported signing fresh checks and immutable result states',
  () => {
    let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
    let scanner: Awaited<ReturnType<typeof openDocumentScannerFixture>>;
    let instant = new Date('2026-10-24T09:00:00.000Z');
    beforeAll(async () => {
      scanner = await openDocumentScannerFixture();
      fixture = await openEstimateOfferFixture({
        scannerEnvironment: scanner.environment,
        serverClock: { now: () => new Date(instant) },
      });
    });
    beforeEach(async () => {
      instant = new Date('2026-10-24T09:00:00.000Z');
      await fixture.reset();
      scanner.reset();
    });
    afterAll(async () => {
      await fixture?.close();
      await scanner?.close();
    });
    async function expire(
      ready: Awaited<ReturnType<typeof prepareReportedSigning>>,
    ) {
      const offer = responseRecord(
        responseRecord(
          await fixture.read({
            ...ready.target,
            path: ready.f.ready.flow.path,
          }),
        ).offer,
      );
      instant = new Date(
        Date.parse(
          responseString(responseRecord(offer.version), 'validUntil'),
        ) + 1,
      );
    }
    it('refuses a new statement after source expiry but resolves its original receipt before expiry, revision or latest-run checks', async () => {
      const ready = await prepareReportedSigning(fixture),
        key = randomUUID();
      const recorded = await fixture.command({
        ...ready.target,
        path: ready.path,
        body: ready.body,
        key,
      });
      await expire(ready);
      const later = await fixture.command({
        ...ready.target,
        path: `${ready.f.ready.path}/versions/${ready.f.contractVersionId}/quality-checks`,
        body: {},
      });
      expect(later).toMatchObject({
        results: expect.arrayContaining([
          { code: 'SOURCE_OFFER_READY', status: 'ERROR' },
        ]),
      });
      expect(
        await fixture.command({
          ...ready.target,
          path: ready.path,
          body: ready.body,
          key,
        }),
      ).toEqual(recorded);
      expect(
        (
          await fixture.post({
            ...ready.target,
            path: ready.path,
            body: ready.body,
          })
        ).status,
      ).toBe(409);
      const current = responseRecord(
        responseRecord(
          await fixture.read({ ...ready.target, path: ready.f.ready.path }),
        ).contract,
      );
      expect(responseRecord(current.version).signature).toEqual(recorded);
      expect(current.revision).toBe(3);
    });
    it('requires the whole fresh warning set after a public Client correction, including previously acknowledged approval warnings', async () => {
      const ready = await prepareReportedSigning(fixture);
      const client = responseRecord(
        await fixture.read({
          ...ready.target,
          path: '/clients/' + ready.f.ready.source.clientId,
        }),
      );
      const correction = await fixture.request({
        ...ready.target,
        path: '/clients/' + ready.f.ready.source.clientId,
        init: {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': randomUUID(),
          },
          body: JSON.stringify({
            expectedVersion: client.version,
            taxId: 'CORRECTED-IDENTITY-877',
          }),
        },
      });
      expect(correction.status).toBe(200);
      const candidates = responseRecord(
        await fixture.read({
          ...ready.target,
          path: ready.path + '/pdf-candidates',
        }),
      );
      expect(candidates.warningCodes).toEqual([
        'ANNEX_SCOPE_REVIEWED',
        'MODEL_WORDING_REVIEWED',
        'PARTY_IDENTITY_CURRENT',
      ]);
      for (const warnings of [
        ready.body.acknowledgedWarningCodes,
        ['PARTY_IDENTITY_CURRENT'],
      ])
        expect(
          (
            await fixture.post({
              ...ready.target,
              path: ready.path,
              body: { ...ready.body, acknowledgedWarningCodes: warnings },
            })
          ).status,
        ).toBe(409);
      expect(
        await fixture.command({
          ...ready.target,
          path: ready.path,
          body: {
            ...ready.body,
            acknowledgedWarningCodes: candidates.warningCodes,
          },
        }),
      ).toMatchObject({ acknowledgedWarningCodes: candidates.warningCodes });
    });
    it('preserves maximum literal UTF-16 fields and a real year-one historical date while treating any positive safe observed revision as a revision', async () => {
      const ready = await prepareReportedSigning(fixture);
      expect(
        (
          await fixture.post({
            ...ready.target,
            path: ready.path,
            body: {
              ...ready.body,
              expectedContractRevision: Number.MAX_SAFE_INTEGER,
            },
          })
        ).status,
      ).toBe(409);
      const body = {
        ...ready.body,
        providerSignatory: {
          ...ready.body.providerSignatory,
          label: '😀'.repeat(100),
          signedOn: '0001-01-01',
        },
        clientSignatory: {
          ...ready.body.clientSignatory,
          mandate: {
            kind: 'DECLARED_UNVERIFIED',
            basis: ' ' + 'm'.repeat(1998) + ' ',
          },
        },
        concordanceBasis: ' ' + 'c'.repeat(1998) + ' ',
        acceptanceBasis: ' ' + 'a'.repeat(1998) + ' ',
      };
      const recorded = await fixture.command({
        ...ready.target,
        path: ready.path,
        body,
      });
      expect(recorded).toMatchObject({
        providerSignatory: body.providerSignatory,
        clientSignatory: body.clientSignatory,
        concordanceBasis: body.concordanceBasis,
        acceptanceBasis: body.acceptanceBasis,
      });
    });

    it('refuses pending and rejected successor Versions without coupling any declaration effects', async () => {
      const ready = await prepareReportedSigning(fixture);
      const successor = responseRecord(
        await fixture.command({
          ...ready.target,
          path: ready.f.ready.path + '/versions/from-approved-model',
          body: { ...ready.f.ready.intent, expectedContractRevision: 2 },
        }),
      );
      const versionId = responseString(responseRecord(successor.version), 'id');
      const path = `${ready.f.ready.path}/versions/${versionId}/signing-declarations`;
      const body = { ...ready.body, expectedContractRevision: 3 };
      expect((await fixture.post({ ...ready.target, path, body })).status).toBe(
        409,
      );
      await fixture.command({
        ...ready.target,
        path: `${ready.f.ready.path}/versions/${versionId}/reject`,
        body: {
          expectedContractRevision: 3,
          reason: 'Synthetic successor deliberately rejected',
        },
      });
      expect(
        (
          await fixture.post({
            ...ready.target,
            path,
            body: { ...body, expectedContractRevision: 4 },
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await fixture.pool.query<{ count: number }>(
            'SELECT count(*)::int count FROM contract_signing_declarations',
          )
        ).rows[0]?.count,
      ).toBe(0);
    });
  },
);
