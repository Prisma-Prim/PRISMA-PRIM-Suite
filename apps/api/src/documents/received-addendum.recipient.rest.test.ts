import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ESTIMATE_OFFER_READER,
  ESTIMATE_OFFER_PREPARER,
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import { generatedOfferIntent } from '../offer/offer-model-generation.test-fixture.js';
import { PDF_A } from './mission-document.test-support.js';
import { openDocumentScannerFixture } from './document-scanner.test-support.js';
import { prepareModelContractSource } from '../contract/model-contract.test-fixture.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('Received Addendum exact ADDITIONAL recipient', () => {
  let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
  let scanner: Awaited<ReturnType<typeof openDocumentScannerFixture>>;
  let ready: Awaited<ReturnType<typeof prepareModelContractSource>>;
  let parentContractId: string, parentVersionId: string, legalEntityId: string;
  const party = {
    kind: 'ADDITIONAL',
    legalName: 'Fictional original additional recipient',
    taxId: 'SYNTHETIC-ADDENDUM-ADDITIONAL',
    legalAddress: null,
  };
  const call = (path: string, init: RequestInit = {}) =>
    fixture.request({
      companyId: ready.source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      path,
      init,
    });
  const post = async (path: string, body: unknown) => {
    const response = await call(path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      body: JSON.stringify(body),
    });
    expect(response.status, path + ':' + (await response.clone().text())).toBe(
      201,
    );
    const value: unknown = await response.json();
    return value;
  };
  const read = (path: string) =>
    fixture.read({
      companyId: ready.source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      path,
    });
  const register = (key: string, body: unknown) =>
    call('/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': key },
      body: JSON.stringify(body),
    });
  const clientVersion = async () => {
    const value = responseRecord(
      await read(`/clients/${ready.source.clientId}`),
    ).version;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
      throw new Error('Native Client dossier version required');
    return value;
  };
  beforeAll(async () => {
    scanner = await openDocumentScannerFixture();
    fixture = await openEstimateOfferFixture({
      scannerEnvironment: scanner.environment,
    });
  });
  beforeEach(async () => {
    await fixture.reset();
    scanner.reset();
    // Choose the additional recipient before the first Contract. The native
    // Contract deliberately forbids changing its party across successors.
    ready = await prepareModelContractSource(fixture);
    for (const path of [
      '/company-document-registrar-assignments',
      '/company-received-contract-access-assignments',
      '/company-received-addendum-access-assignments',
      '/company-contract-signature-declarer-assignments',
      '/company-document-content-reader-assignments',
      '/company-document-content-uploader-assignments',
      '/company-document-approver-assignments',
    ])
      await fixture.grant({
        path,
        companyId: ready.source.companyId,
        membershipId: ready.source.preparerMembershipId,
      });
    const entity = responseRecord(
      await post(`/clients/${ready.source.clientId}/legal-entities`, {
        expectedClientVersion: await clientVersion(),
        legalName: party.legalName,
        taxId: party.taxId,
        legalAddress: party.legalAddress,
      }),
    );
    legalEntityId = responseString(responseRecord(entity.legalEntity), 'id');
    expect(responseRecord(entity.legalEntity)).toMatchObject({
      id: legalEntityId,
      legalName: party.legalName,
      taxId: party.taxId,
      legalAddress: null,
    });
    const flow = ready.flow;
    const offer = responseRecord(
      await post(flow.path + '/versions/from-approved-model', {
        ...generatedOfferIntent(flow.source),
        recipient: { kind: 'ADDITIONAL', legalEntityId },
        expectedOfferRevision: flow.revision,
      }),
    );
    const offerVersionId = responseString(responseRecord(offer.version), 'id');
    const approvedOffer = responseRecord(
      await fixture.command({
        companyId: ready.source.companyId,
        headers: ESTIMATE_OFFER_READER,
        path: `${flow.path}/versions/${offerVersionId}/approve`,
        body: {
          expectedOfferRevision: offer.revision,
          acknowledgedWarningCodes: [
            'DECLARED_TAX_UNVERIFIED',
            'NON_OFFICIAL_OFFER',
            'ILLUSTRATIVE_MODEL',
          ],
        },
      }),
    );
    await post(`${flow.path}/versions/${offerVersionId}/transmission`, {
      expectedOfferRevision: approvedOffer.offerRevision,
      acknowledgedWarningCodes: [],
      note: null,
    });
    const intent = { ...ready.intent, sourceOfferVersionId: offerVersionId };
    const first = responseRecord(
      await post(ready.path + '/from-approved-model', intent),
    );
    parentContractId = responseString(first, 'id');
    const next = responseRecord(
      await post(ready.path + '/versions/from-approved-model', {
        ...intent,
        expectedContractRevision: 1,
      }),
    );
    parentVersionId = responseString(responseRecord(next.version), 'id');
    const warnings = ['MODEL_WORDING_REVIEWED', 'ANNEX_SCOPE_REVIEWED'];
    await post(`${ready.path}/versions/${parentVersionId}/approve`, {
      expectedContractRevision: 2,
      acknowledgedWarningCodes: warnings,
      reviewBasis:
        'Fictional exact additional-party V2 reviewed before execution',
    });
    const own = responseRecord(
      await post('/documents', {
        type: 'received-contract',
        opportunityId: ready.source.opportunityId,
        contractId: parentContractId,
        contractVersionId: parentVersionId,
        title: 'Fictional additional-party parent own PDF',
        purpose: 'Preserve the exact parent own copy for reported signing',
        sourceDescription: 'Fictional parent own source',
      }),
    );
    const ownId = responseString(own, 'id');
    const ownVersionId = responseString(responseRecord(own.version), 'id');
    const uploaded = await call(
      `/documents/${ownId}/versions/${ownVersionId}/content?expectedRevision=1&fileName=fictional-additional-parent.pdf`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/pdf',
          'idempotency-key': randomUUID(),
        },
        body: new Uint8Array(PDF_A),
      },
    );
    expect(uploaded.status, await uploaded.clone().text()).toBe(201);
    const representationId = responseString(
      responseRecord(await uploaded.json()),
      'representationId',
    );
    const designation = await call(
      `/documents/${ownId}/versions/${ownVersionId}/official-designation`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': randomUUID(),
        },
        body: JSON.stringify({ expectedRevision: 2 }),
      },
    );
    expect(designation.status).toBe(200);
    await post(
      `${ready.path}/versions/${parentVersionId}/signing-declarations`,
      {
        expectedContractRevision: 3,
        documentId: ownId,
        documentVersionId: ownVersionId,
        representationId,
        providerSignatory: {
          label: 'Fictional provider',
          signedOn: null,
          mandate: { kind: 'UNKNOWN' },
        },
        clientSignatory: {
          label: 'Fictional additional recipient',
          signedOn: null,
          mandate: { kind: 'UNKNOWN' },
        },
        concordanceBasis:
          'Fictional additional-party V2 and own PDF comparison',
        acceptanceBasis: 'Fictional reported signing acceptance',
        acknowledgedWarningCodes: warnings,
      },
    );
  });
  afterAll(async () => {
    await fixture?.close();
    await scanner?.close();
  });
  it('registers and reads the conserved additional identity and native null address after a permitted live party correction', async () => {
    const expected = { ...party, additionalLegalEntityId: legalEntityId };
    const choices = responseRecord(
      await read('/documents/received-addendum-sources'),
    );
    expect(choices.sources).toEqual([
      expect.objectContaining({
        parentContractId: parentContractId,
        parentContractVersionId: parentVersionId,
        contractVersionNumber: 2,
        clientId: ready.source.clientId,
        recordedRecipient: expected,
      }),
    ]);
    const body = {
      type: 'received-addendum',
      parentContractId,
      parentContractVersionId: parentVersionId,
      title: 'Fictional additional-party received Addendum',
      purpose: 'Preserve the exact later source',
      sourceDescription: 'Literal fictional additional-party email',
      receivedOn: null,
    };
    const key = randomUUID();
    const saved = await register(key, body);
    expect(saved.status, await saved.clone().text()).toBe(201);
    const document = responseRecord(await saved.json());
    const id = responseString(document, 'id');
    expect(document.clientId).toBe(ready.source.clientId);
    expect(document.receivedAddendumRelation).toMatchObject({
      access: 'granted',
      recordedRecipient: expected,
      parentContractVersionId: parentVersionId,
    });
    const corrected = await call(
      `/clients/${ready.source.clientId}/legal-entities/${legalEntityId}`,
      {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': randomUUID(),
        },
        body: JSON.stringify({
          expectedClientVersion: await clientVersion(),
          changes: {
            legalName: 'Corrected live additional recipient',
            legalAddress: 'Corrected fictional live address',
          },
        }),
      },
    );
    expect(corrected.status).toBe(200);
    expect(
      responseRecord(responseRecord(await corrected.json()).legalEntity),
    ).toMatchObject({
      id: legalEntityId,
      legalName: 'Corrected live additional recipient',
      taxId: party.taxId,
      legalAddress: 'Corrected fictional live address',
    });
    expect(
      responseRecord(await read(`/documents/${id}`)).receivedAddendumRelation,
    ).toEqual(document.receivedAddendumRelation);
    expect(responseRecord(await (await register(key, body)).json()).id).toBe(
      id,
    );
    expect(
      responseRecord(await read('/documents/received-addendum-sources'))
        .sources,
    ).toEqual(choices.sources);
  });
});
