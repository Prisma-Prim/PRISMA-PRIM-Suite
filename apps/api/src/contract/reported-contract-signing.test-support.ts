import { expect } from 'vitest';
import { registerReceivedContract } from '../documents/received-contract.test-support.js';
import { PDF_A, PDF_B } from '../documents/mission-document.test-support.js';
import {
  ESTIMATE_OFFER_PREPARER,
  responseRecord,
  responseString,
  type openEstimateOfferFixture,
} from '../offer/offer-estimate-preparation.test-support.js';
export async function prepareReportedSigning(
  fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>,
  options: { clientTaxId?: string; correctedPdf?: boolean } = {},
) {
  const f = await registerReceivedContract(fixture, options);
  for (const path of [
    '/company-contract-signature-declarer-assignments',
    '/company-document-content-reader-assignments',
    '/company-document-content-uploader-assignments',
    '/company-document-approver-assignments',
  ])
    await fixture.grant({
      path,
      companyId: f.ready.source.companyId,
      membershipId: f.ready.source.preparerMembershipId,
    });
  const documentVersionId = responseString(
    responseRecord(f.document.version),
    'id',
  );
  const firstUpload = await f.upload(documentVersionId, 1, PDF_A);
  expect(firstUpload.status).toBe(201);
  const earlierRepresentationId = responseString(
    responseRecord(await firstUpload.json()),
    'representationId',
  );
  if (options.correctedPdf)
    expect((await f.upload(documentVersionId, 2, PDF_B)).status).toBe(201);
  expect(
    (
      await f.mutate(`/versions/${documentVersionId}/official-designation`, {
        expectedRevision: options.correctedPdf ? 3 : 2,
      })
    ).status,
  ).toBe(200);
  const warnings = ['MODEL_WORDING_REVIEWED', 'ANNEX_SCOPE_REVIEWED'];
  await f.ready.invoke(
    `${f.ready.path}/versions/${f.contractVersionId}/approve`,
    {
      expectedContractRevision: 1,
      acknowledgedWarningCodes: warnings,
      reviewBasis: 'Synthetic Contract wording deliberately reviewed',
    },
  );
  const path = `${f.ready.path}/versions/${f.contractVersionId}/signing-declarations`;
  const target = {
    companyId: f.ready.source.companyId,
    headers: ESTIMATE_OFFER_PREPARER,
  };
  const selection = responseRecord(
    await fixture.read({ ...target, path: path + '/pdf-candidates' }),
  );
  if (!Array.isArray(selection.items) || selection.items.length !== 1)
    throw new Error('Expected one exact eligible PDF.');
  const pdf = responseRecord(selection.items[0]);
  const body = {
    expectedContractRevision: 2,
    documentId: responseString(f.document, 'id'),
    documentVersionId,
    representationId: responseString(pdf, 'representationId'),
    providerSignatory: {
      label: '  Synthetic provider 😀  ',
      signedOn: '2026-01-01',
      mandate: { kind: 'UNKNOWN' },
    },
    clientSignatory: {
      label: 'Synthetic Client',
      signedOn: null,
      mandate: { kind: 'DECLARED_UNVERIFIED', basis: ' Literal human basis ' },
    },
    concordanceBasis: ' Compared exact saved PDF, Contract and Offer ',
    acceptanceBasis: ' Acceptance reported for this case ',
    acknowledgedWarningCodes: warnings,
  };
  return { f, body, path, target, documentVersionId, earlierRepresentationId };
}
