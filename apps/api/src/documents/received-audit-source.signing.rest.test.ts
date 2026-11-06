import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import { openDocumentScannerFixture } from './document-scanner.test-support.js';
import { PDF_A } from './mission-document.test-support.js';
import { prepareReceivedAddendumParent } from './received-addendum.test-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres(
  'Received Audit source excluded from signable Contract evidence',
  () => {
    let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
    let scanner: Awaited<ReturnType<typeof openDocumentScannerFixture>>;
    let parent: Awaited<ReturnType<typeof prepareReceivedAddendumParent>>;
    let documentId: string;
    let documentVersionId: string;
    let representationId: string;
    const post = (path: string, body: unknown) =>
      parent.call(path, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': randomUUID(),
        },
        body: JSON.stringify(body),
      });

    beforeAll(async () => {
      scanner = await openDocumentScannerFixture();
      fixture = await openEstimateOfferFixture({
        scannerEnvironment: scanner.environment,
      });
    });
    afterAll(async () => {
      await fixture?.close();
      await scanner?.close();
    });

    beforeEach(async () => {
      await fixture.reset();
      parent = await prepareReceivedAddendumParent(fixture, false);
      await fixture.grant({
        path: '/company-received-audit-source-access-assignments',
        companyId: parent.target.companyId,
        membershipId: parent.ready.source.preparerMembershipId,
      });
      const registered = await post('/documents', {
        type: 'received-audit-source',
        clientId: parent.ready.source.clientId,
        title: 'Fictional received source for signing exclusion',
        purpose: 'Preserve an unverified original without Contract acceptance',
      });
      expect(registered.status).toBe(201);
      const document = responseRecord(await registered.json());
      documentId = responseString(document, 'id');
      documentVersionId = responseString(
        responseRecord(document.version),
        'id',
      );
      const uploaded = await parent.call(
        `/documents/${documentId}/versions/${documentVersionId}/content?expectedRevision=1&fileName=fictional-source.pdf`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/pdf',
            'idempotency-key': randomUUID(),
          },
          body: new Uint8Array(PDF_A),
        },
      );
      expect(uploaded.status).toBe(201);
      representationId = responseString(
        responseRecord(await uploaded.json()),
        'representationId',
      );
      expect(
        (
          await post(
            `/documents/${documentId}/versions/${documentVersionId}/official-designation`,
            { expectedRevision: 2 },
          )
        ).status,
      ).toBe(200);
    });

    it('omits a frozen source from a signable selector and rejects its exact known tuple', async () => {
      const signingPath = `${parent.ready.path}/versions/${parent.parentContractVersionId}/signing-declarations`;
      const candidates = await parent.call(signingPath + '/pdf-candidates');
      expect(candidates.status).toBe(200);
      expect(responseRecord(await candidates.json()).items).toEqual([]);
      const refused = await post(signingPath, {
        expectedContractRevision: 3,
        documentId,
        documentVersionId,
        representationId,
        providerSignatory: {
          label: 'Fictional provider',
          signedOn: null,
          mandate: { kind: 'UNKNOWN' },
        },
        clientSignatory: {
          label: 'Fictional Client',
          signedOn: null,
          mandate: { kind: 'UNKNOWN' },
        },
        concordanceBasis: 'Fictional exact-source exclusion probe',
        acceptanceBasis: 'Fictional declaration only',
        acknowledgedWarningCodes: [
          'MODEL_WORDING_REVIEWED',
          'ANNEX_SCOPE_REVIEWED',
          'ADDED_CONDITIONS_CONFIRMED',
        ],
      });
      expect(refused.status).toBe(404);
      expect(await refused.text()).not.toContain(documentId);
      const stillSignable = await parent.call(signingPath + '/pdf-candidates');
      expect(stillSignable.status).toBe(200);
      expect(responseRecord(await stillSignable.json()).items).toEqual([]);
    });
  },
);
