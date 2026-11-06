import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { prepareReceivedContractSource } from './received-contract.test-support.js';
import { PDF_A } from './mission-document.test-support.js';
import {
  ESTIMATE_OFFER_PREPARER,
  responseRecord,
  responseString,
  type openEstimateOfferFixture,
} from '../offer/offer-estimate-preparation.test-support.js';
type Fixture = Awaited<ReturnType<typeof openEstimateOfferFixture>>;
export async function prepareReceivedAddendumParent(
  fixture: Fixture,
  execute = true,
) {
  const original = await prepareReceivedContractSource(fixture);
  const { ready } = original;
  const successor = responseRecord(
    await ready.invoke(ready.path + '/versions/from-approved-model', {
      ...ready.intent,
      expectedContractRevision: 1,
      specialConditions:
        'Fictional P-17 scenario, exact second Version before signing',
    }),
  );
  const parentContractId = responseString(successor, 'id'),
    parentContractVersionId = responseString(
      responseRecord(successor.version),
      'id',
    );
  const target = {
    companyId: ready.source.companyId,
    headers: ESTIMATE_OFFER_PREPARER,
  };
  for (const path of [
    '/company-received-addendum-access-assignments',
    '/company-contract-signature-declarer-assignments',
    '/company-document-content-reader-assignments',
    '/company-document-content-uploader-assignments',
    '/company-document-approver-assignments',
  ])
    await fixture.grant({
      path,
      companyId: target.companyId,
      membershipId: ready.source.preparerMembershipId,
    });
  const warnings = [
    'MODEL_WORDING_REVIEWED',
    'ANNEX_SCOPE_REVIEWED',
    'ADDED_CONDITIONS_CONFIRMED',
  ];
  await ready.invoke(
    `${ready.path}/versions/${parentContractVersionId}/approve`,
    {
      expectedContractRevision: 2,
      acknowledgedWarningCodes: warnings,
      reviewBasis: 'Synthetic V2 wording deliberately reviewed',
    },
  );
  const signingPath = `${ready.path}/versions/${parentContractVersionId}/signing-declarations`;
  if (execute) {
    const signingDocument = responseRecord(
      await fixture.command({
        ...target,
        path: '/documents',
        body: {
          type: 'received-contract',
          opportunityId: ready.source.opportunityId,
          contractId: parentContractId,
          contractVersionId: parentContractVersionId,
          title: 'Fictional parent own signing PDF',
          purpose: 'Synthetic own Contract received source',
          sourceDescription: 'Fictional signing source',
        },
      }),
    );
    const signingDocumentId = responseString(signingDocument, 'id'),
      signingVersionId = responseString(
        responseRecord(signingDocument.version),
        'id',
      );
    const upload = await fixture.request({
      ...target,
      path: `/documents/${signingDocumentId}/versions/${signingVersionId}/content?expectedRevision=1&fileName=parent-own-signing.pdf`,
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/pdf',
          'idempotency-key': randomUUID(),
        },
        body: new Uint8Array(PDF_A),
      },
    });
    expect(upload.status).toBe(201);
    const designated = await fixture.request({
      ...target,
      path: `/documents/${signingDocumentId}/versions/${signingVersionId}/official-designation`,
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': randomUUID(),
        },
        body: JSON.stringify({ expectedRevision: 2 }),
      },
    });
    expect(designated.status).toBe(200);
    const candidates = responseRecord(
      await fixture.read({ ...target, path: signingPath + '/pdf-candidates' }),
    );
    if (!Array.isArray(candidates.items) || candidates.items.length !== 1)
      throw new Error('Expected genuine exact own signing PDF candidate');
    const pdf = responseRecord(candidates.items[0]);
    await fixture.command({
      ...target,
      path: signingPath,
      body: {
        expectedContractRevision: 3,
        documentId: signingDocumentId,
        documentVersionId: signingVersionId,
        representationId: responseString(pdf, 'representationId'),
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
        concordanceBasis:
          'Fictional exact parent and own received PDF comparison',
        acceptanceBasis: 'Fictional reported signing acceptance',
        acknowledgedWarningCodes: warnings,
      },
    });
  }
  const body = {
    type: 'received-addendum',
    parentContractId,
    parentContractVersionId,
    title: 'Fictional received Addendum',
    purpose: 'Preserve exact fictional later source',
    sourceDescription: 'Literal fictional email source 😀\n  declared only',
    receivedOn: null,
  };
  const call = (path: string, init: RequestInit = {}) =>
    fixture.request({ ...target, path, init });
  const register = (key: string = randomUUID(), value: unknown = body) =>
    fixture.request({
      ...target,
      path: '/documents',
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': key },
        body: JSON.stringify(value),
      },
    });
  return {
    ready,
    original,
    target,
    parentContractId,
    parentContractVersionId,
    body,
    call,
    register,
  };
}
export async function fictionalAddendumPdf(label = 'Version 1') {
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica),
    page = pdf.addPage([800, 300]);
  page.drawText('Fictional received Addendum — not a legal document', {
    x: 25,
    y: 240,
    size: 20,
    font,
  });
  page.drawText(label, { x: 25, y: 190, size: 18, font });
  return Buffer.from(await pdf.save());
}
