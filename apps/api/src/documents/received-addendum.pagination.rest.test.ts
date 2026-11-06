import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ESTIMATE_OFFER_DIRECTOR,
  ESTIMATE_OFFER_PREPARER,
  ESTIMATE_OFFER_READER,
  estimateSubmission,
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import { generatedOfferIntent } from '../offer/offer-model-generation.test-fixture.js';
import { openDocumentScannerFixture } from './document-scanner.test-support.js';
import { prepareReceivedAddendumParent } from './received-addendum.test-support.js';
import { PDF_A } from './mission-document.test-support.js';
const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('Received Addendum native eligible parent page boundaries', () => {
  let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>,
    scanner: Awaited<ReturnType<typeof openDocumentScannerFixture>>,
    parent: Awaited<ReturnType<typeof prepareReceivedAddendumParent>>;
  let eligible: string[], unsigned: string[];
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
    scanner.reset();
    parent = await prepareReceivedAddendumParent(fixture);
    eligible = [parent.parentContractVersionId];
    unsigned = [];
    const heads: {
      opportunityId: string;
      contractId: string;
      versionId: string;
    }[] = [];
    const command = async (
      path: string,
      body: unknown,
      headers = ESTIMATE_OFFER_PREPARER,
    ) =>
      responseRecord(
        await fixture.command({ ...parent.target, path, body, headers }),
      );
    for (let i = 0; i < 22; i++) {
      const intake = await command('/commercial-intake/requests', {
          clientAccountId: parent.ready.source.clientId,
          originalText: 'Fictional pagination source',
          subject: 'Fictional executed parent page ' + i,
          sourceLabel: 'Synthetic native page proof',
          opportunity: {
            title: 'Fictional page Contract ' + i,
            scope: 'Synthetic scope',
            nextAction: 'Prepare fictional source',
          },
        }),
        opportunityId = responseString(
          responseRecord(intake.initialOpportunity),
          'id',
        );
      const estimate = await command(
          `/opportunities/${opportunityId}/profitability-estimates`,
          estimateSubmission(),
        ),
        estimateVersionId = responseString(estimate, 'id');
      await command(
        `/opportunities/${opportunityId}/profitability-estimates/versions/${estimateVersionId}/decision`,
        { expectedVersionNumber: 1, expectedDecision: null, code: 'APPROVE' },
        ESTIMATE_OFFER_DIRECTOR,
      );
      const offerPath = `/offers/opportunities/${opportunityId}`,
        offer = await command(
          offerPath + '/from-approved-model',
          generatedOfferIntent({
            ...parent.ready.flow.source,
            estimateVersionId,
            estimateVersionNumber: 1,
          }),
        ),
        offerVersionId = responseString(responseRecord(offer.version), 'id');
      await command(
        `${offerPath}/versions/${offerVersionId}/approve`,
        {
          expectedOfferRevision: 1,
          acknowledgedWarningCodes: [
            'DECLARED_TAX_UNVERIFIED',
            'NON_OFFICIAL_OFFER',
            'ILLUSTRATIVE_MODEL',
          ],
        },
        ESTIMATE_OFFER_READER,
      );
      await command(`${offerPath}/versions/${offerVersionId}/transmission`, {
        expectedOfferRevision: 2,
        acknowledgedWarningCodes: [],
        note: null,
      });
      const contractPath = `/contracts/opportunities/${opportunityId}`,
        contract = await command(contractPath + '/from-approved-model', {
          ...parent.ready.intent,
          sourceOfferVersionId: offerVersionId,
        }),
        versionId = responseString(responseRecord(contract.version), 'id');
      await command(`${contractPath}/versions/${versionId}/approve`, {
        expectedContractRevision: 1,
        acknowledgedWarningCodes: [
          'MODEL_WORDING_REVIEWED',
          'ANNEX_SCOPE_REVIEWED',
        ],
        reviewBasis: 'Fictional pagination wording reviewed',
      });
      heads.push({
        opportunityId,
        contractId: responseString(contract, 'id'),
        versionId,
      });
    }
    heads.sort((a, b) => a.versionId.localeCompare(b.versionId));
    unsigned = heads.slice(0, 2).map((head) => head.versionId);
    for (const head of heads.slice(2)) {
      const document = await command('/documents', {
          type: 'received-contract',
          opportunityId: head.opportunityId,
          contractId: head.contractId,
          contractVersionId: head.versionId,
          title: 'Fictional own parent signing source',
          purpose: 'Synthetic pagination only',
          sourceDescription: 'Fictional native executed parent control',
        }),
        documentId = responseString(document, 'id'),
        documentVersionId = responseString(
          responseRecord(document.version),
          'id',
        );
      const uploaded = await parent.call(
        `/documents/${documentId}/versions/${documentVersionId}/content?expectedRevision=1&fileName=fictional-parent.pdf`,
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
      const representationId = responseString(
        responseRecord(await uploaded.json()),
        'representationId',
      );
      const designation = await fixture.post({
        ...parent.target,
        path: `/documents/${documentId}/versions/${documentVersionId}/official-designation`,
        body: { expectedRevision: 2 },
      });
      expect(designation.status).toBe(200);
      await command(
        `/contracts/opportunities/${head.opportunityId}/versions/${head.versionId}/signing-declarations`,
        {
          expectedContractRevision: 2,
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
          concordanceBasis: 'Fictional exact PDF comparison',
          acceptanceBasis: 'Synthetic observed declaration only',
          acknowledgedWarningCodes: [
            'MODEL_WORDING_REVIEWED',
            'ANNEX_SCOPE_REVIEWED',
          ],
        },
      );
      eligible.push(head.versionId);
    }
  });
  it('qualifies genuine execution before twenty/lookahead, exposes no hidden total and accepts only a visible opaque anchor', async () => {
    const read = (suffix = '') =>
        parent.call('/documents/received-addendum-sources' + suffix),
      firstResponse = await read();
    expect(firstResponse.status).toBe(200);
    const first = responseRecord(await firstResponse.json());
    expect(Object.keys(first).sort()).toEqual(['nextCursor', 'sources']);
    expect(first.sources).toHaveLength(20);
    const cursor = responseString(first, 'nextCursor');
    expect(cursor).toMatch(/^[A-Za-z0-9_-]{48}$/u);
    const secondResponse = await read('?cursor=' + cursor);
    expect(secondResponse.status).toBe(200);
    const second = responseRecord(await secondResponse.json());
    expect(second.sources).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    if (!Array.isArray(first.sources) || !Array.isArray(second.sources))
      throw new Error('Native pages required');
    const ids = [...first.sources, ...second.sources].map((value) =>
      responseString(responseRecord(value), 'parentContractVersionId'),
    );
    expect([...ids].sort()).toEqual([...eligible].sort());
    expect(new Set(ids).size).toBe(21);
    for (const id of unsigned) expect(ids).not.toContain(id);
    for (const suffix of [
      '?limit=100',
      '?cursor=invalid',
      '?cursor=' + Buffer.from(randomUUID()).toString('base64url'),
      '?cursor=' + Buffer.from(unsigned[0] ?? 'missing').toString('base64url'),
      '?cursor=' + cursor + '&cursor=' + cursor,
    ])
      expect((await read(suffix)).status).toBe(400);
    // Existing owner-supported negative visibility seam; no positive business fact is fabricated.
    await fixture.pool.query(
      "UPDATE client_company_relationships SET status='archived' WHERE client_account_id=$1 AND company_id=$2",
      [parent.ready.source.clientId, parent.target.companyId],
    );
    expect(await (await read()).json()).toEqual({
      sources: [],
      nextCursor: null,
    });
    expect((await read('?cursor=' + cursor)).status).toBe(400);
  });
});
