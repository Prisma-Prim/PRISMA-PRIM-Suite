import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { prepareModelContractSource } from '../contract/model-contract.test-fixture.js';
import { PDF_A } from '../documents/mission-document.test-support.js';
import { generatedOfferIntent } from '../offer/offer-model-generation.test-fixture.js';
import {
  ESTIMATE_OFFER_PREPARER,
  ESTIMATE_OFFER_READER,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import {
  prepareAdditionalInvoiceRecordSource,
  type InvoiceRecordProofFixture,
  type prepareInvoiceRecordSource,
} from './invoice-record.proof-support.js';

export type CopiedRecordSource = Pick<
  Awaited<ReturnType<typeof prepareInvoiceRecordSource>>,
  | 'companyId'
  | 'membershipId'
  | 'target'
  | 'createBody'
  | 'create'
  | 'command'
  | 'read'
  | 'request'
>;

/** An ADDITIONAL recipient, real model Offer/Contract and §31 PDF declaration. */
export async function prepareAdditionalCopiedRecordSource(
  fixture: InvoiceRecordProofFixture,
  party: { legalName: string; taxId: string; legalAddress: string },
): Promise<CopiedRecordSource> {
  const ready = await prepareModelContractSource(fixture);
  const target = {
    companyId: ready.source.companyId,
    headers: ESTIMATE_OFFER_PREPARER,
  };
  const legalEntities = responseRecord(
    await fixture.read({
      ...target,
      path: `/clients/${ready.source.clientId}/legal-entities`,
    }),
  );
  const registration = await fixture.post({
    ...target,
    path: `/clients/${ready.source.clientId}/legal-entities`,
    body: { expectedClientVersion: legalEntities.clientVersion, ...party },
  });
  const registered = responseRecord(await registration.json());
  expect(registration.status, JSON.stringify(registered)).toBe(201);
  const additionalId = responseString(
    responseRecord(registered.legalEntity),
    'id',
  );
  const offer = responseRecord(
    await ready.invoke(`${ready.flow.path}/versions/from-approved-model`, {
      ...generatedOfferIntent(ready.source),
      expectedOfferRevision: ready.flow.revision,
      recipient: { kind: 'ADDITIONAL', legalEntityId: additionalId },
    }),
  );
  const offerVersionId = responseString(responseRecord(offer.version), 'id');
  const approvedOffer = responseRecord(
    await fixture.command({
      companyId: target.companyId,
      headers: ESTIMATE_OFFER_READER,
      path: `${ready.flow.path}/versions/${offerVersionId}/approve`,
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
  await ready.invoke(
    `${ready.flow.path}/versions/${offerVersionId}/transmission`,
    {
      expectedOfferRevision: approvedOffer.offerRevision,
      acknowledgedWarningCodes: [],
      note: null,
    },
  );
  const contract = responseRecord(
    await ready.invoke(ready.path + '/from-approved-model', {
      ...ready.intent,
      sourceOfferVersionId: offerVersionId,
    }),
  );
  const contractId = responseString(contract, 'id');
  const contractVersionId = responseString(
    responseRecord(contract.version),
    'id',
  );
  const membershipId = ready.source.preparerMembershipId;
  for (const path of [
    '/company-document-registrar-assignments',
    '/company-received-contract-access-assignments',
    '/company-contract-signature-declarer-assignments',
    '/company-document-content-reader-assignments',
    '/company-document-content-uploader-assignments',
    '/company-document-approver-assignments',
    '/company-invoice-recorder-assignments',
    '/company-external-invoice-access-assignments',
  ])
    await fixture.grant({ path, companyId: target.companyId, membershipId });
  const document = responseRecord(
    await fixture.command({
      ...target,
      path: '/documents',
      body: {
        type: 'received-contract',
        opportunityId: ready.source.opportunityId,
        contractId,
        contractVersionId,
        title: 'Fictional received Contract for copied native text',
        purpose: 'Preserve the synthetic execution original',
        sourceDescription: 'Synthetic software fixture only',
        receivedOn: '2026-01-15',
      },
    }),
  );
  const documentId = responseString(document, 'id');
  const documentVersionId = responseString(
    responseRecord(document.version),
    'id',
  );
  const uploaded = await fixture.request({
    ...target,
    path: `/documents/${documentId}/versions/${documentVersionId}/content?expectedRevision=1&fileName=fictional-received.pdf`,
    init: {
      method: 'POST',
      headers: {
        'content-type': 'application/pdf',
        'idempotency-key': randomUUID(),
      },
      body: new Uint8Array(PDF_A),
    },
  });
  expect(uploaded.status).toBe(201);
  const representationId = responseString(
    responseRecord(await uploaded.json()),
    'representationId',
  );
  const designated = await fixture.post({
    ...target,
    path: `/documents/${documentId}/versions/${documentVersionId}/official-designation`,
    body: { expectedRevision: 2 },
  });
  expect(designated.status).toBe(200);
  const warnings = ['MODEL_WORDING_REVIEWED', 'ANNEX_SCOPE_REVIEWED'];
  await ready.invoke(`${ready.path}/versions/${contractVersionId}/approve`, {
    expectedContractRevision: 1,
    acknowledgedWarningCodes: warnings,
    reviewBasis: 'Synthetic wording deliberately reviewed',
  });
  await ready.invoke(
    `${ready.path}/versions/${contractVersionId}/signing-declarations`,
    {
      expectedContractRevision: 2,
      documentId,
      documentVersionId,
      representationId,
      providerSignatory: {
        label: 'Synthetic provider',
        signedOn: '2026-01-01',
        mandate: { kind: 'UNKNOWN' },
      },
      clientSignatory: {
        label: 'Synthetic Client',
        signedOn: null,
        mandate: {
          kind: 'DECLARED_UNVERIFIED',
          basis: 'Literal synthetic basis',
        },
      },
      concordanceBasis: 'Compared exact saved PDF, Contract and Offer',
      acceptanceBasis: 'Acceptance reported only for this software fixture',
      acknowledgedWarningCodes: warnings,
    },
  );
  const source = await prepareAdditionalInvoiceRecordSource(fixture, {
    target,
    body: {
      type: 'external-invoice',
      opportunityId: ready.source.opportunityId,
      contractId,
      contractVersionId,
      title: 'Fictional external invoice — not a fiscal document',
      purpose: 'Preserve native ADDITIONAL party copies',
      sourceDescription: 'Fictional manual process',
      receivedOn: null,
    },
    title: 'Fictional additional-party invoice — not a fiscal document',
  });
  const request = (path: string, init?: RequestInit) =>
    fixture.request({ ...target, path, init });
  return {
    ...source,
    membershipId,
    request,
    read: async (path: string) => {
      const result = await request(path);
      expect(result.status).toBe(200);
      return responseRecord(await result.json());
    },
    command: ({ recordId, body, key = randomUUID() }) =>
      fixture.post({
        ...target,
        path: `/invoice-records/${recordId}/commands`,
        body,
        key,
      }),
  };
}
