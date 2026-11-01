import { randomUUID } from 'node:crypto';
import { PDF_A } from '../documents/mission-document.test-support.js';
import {
  ESTIMATE_OFFER_PREPARER,
  ESTIMATE_OFFER_READER,
  responseRecord,
  responseString,
  type openEstimateOfferFixture,
} from '../offer/offer-estimate-preparation.test-support.js';
import {
  generatedOfferIntent,
  prepareGeneratedOfferSource,
} from '../offer/offer-model-generation.test-fixture.js';
import type { ExternalInvoiceRecordedRecipient } from './contract-external-invoice-reference.service.js';
import { generatedContractModelContent } from './model-contract.test-fixture.js';

type Fixture = Awaited<ReturnType<typeof openEstimateOfferFixture>>;

/** Genuine native source; no persisted Contract or party is manufactured. */
export async function prepareExternalInvoiceContract(
  fixture: Fixture,
  options: {
    recipient?: 'PRIMARY' | 'ADDITIONAL';
    declare?: boolean;
    successor?: boolean;
  } = {},
) {
  const source = await prepareGeneratedOfferSource(fixture);
  const target = {
    companyId: source.companyId,
    headers: ESTIMATE_OFFER_PREPARER,
  };
  const invoke = (path: string, body: unknown) =>
    fixture.command({ ...target, path, body });
  const additional =
    options.recipient === 'ADDITIONAL'
      ? await registerAdditionalRecipient(fixture, source)
      : undefined;
  const recipient: ExternalInvoiceRecordedRecipient = additional
    ? {
        kind: 'ADDITIONAL',
        additionalLegalEntityId: additional.id,
        legalName: additional.legalName,
        taxId: additional.taxId,
        legalAddress: additional.legalAddress,
      }
    : {
        kind: 'PRIMARY',
        legalName: 'Synthetic internal Offer Client',
        taxId: 'SYNTHETIC-842',
        legalAddress: '842 Example Street',
      };
  const offerPath = `/offers/opportunities/${source.opportunityId}`;
  const offer = responseRecord(
    await invoke(`${offerPath}/from-approved-model`, {
      ...generatedOfferIntent(source),
      recipient: additional
        ? { kind: 'ADDITIONAL', legalEntityId: additional.id }
        : { kind: 'PRIMARY' },
    }),
  );
  const offerVersionId = responseString(responseRecord(offer.version), 'id');
  const offerApproval = responseRecord(
    await fixture.command({
      ...target,
      headers: ESTIMATE_OFFER_READER,
      path: `${offerPath}/versions/${offerVersionId}/approve`,
      body: {
        expectedOfferRevision: positiveInteger(offer.revision),
        acknowledgedWarningCodes: [
          'DECLARED_TAX_UNVERIFIED',
          'NON_OFFICIAL_OFFER',
          'ILLUSTRATIVE_MODEL',
        ],
      },
    }),
  );
  await invoke(`${offerPath}/versions/${offerVersionId}/transmission`, {
    expectedOfferRevision: positiveInteger(offerApproval.offerRevision),
    acknowledgedWarningCodes: [],
    note: null,
  });
  for (const path of [
    '/company-contract-model-editor-assignments',
    '/company-contract-model-approver-assignments',
    '/company-contract-preparer-assignments',
    '/company-contract-approver-assignments',
    '/company-contract-signature-declarer-assignments',
    '/company-document-registrar-assignments',
    '/company-received-contract-access-assignments',
    '/company-document-content-reader-assignments',
    '/company-document-content-uploader-assignments',
    '/company-document-approver-assignments',
  ])
    await fixture.grant({
      path,
      companyId: source.companyId,
      membershipId: source.preparerMembershipId,
    });
  const modelPath = '/contract-models/consulting-ro';
  const model = responseRecord(
    responseRecord(
      await invoke(`${modelPath}/versions`, {
        expectedModelRevision: 0,
        content: generatedContractModelContent,
      }),
    ).model,
  );
  const modelVersionId = responseString(responseRecord(model.head), 'id');
  const approvedModel = responseRecord(
    responseRecord(
      await invoke(`${modelPath}/versions/${modelVersionId}/decision`, {
        expectedModelRevision: positiveInteger(model.revision),
        versionNumber: positiveInteger(
          responseRecord(model.head).versionNumber,
        ),
        outcome: 'APPROVE',
        basis: 'Fictional source Contract wording deliberately reviewed',
      }),
    ).model,
  );
  const intent = {
    sourceOfferVersionId: offerVersionId,
    modelVersionId,
    modelVersionNumber: positiveInteger(
      responseRecord(approvedModel.head).versionNumber,
    ),
    modelApprovalDecisionId: responseString(
      responseRecord(responseRecord(approvedModel.head).decision),
      'id',
    ),
    documentDate: '2026-10-24',
    clientDetails:
      'Fictional Contract party requisites, declared and unverified',
    termStartsOn: null,
    termEndsOn: null,
    specialConditions: null,
    sourceConcordanceDeclaration: true,
    sourceConcordanceBasis:
      'Fictional Offer and Contract source deliberately compared',
  };
  const contractPath = `/contracts/opportunities/${source.opportunityId}`;
  const original = responseRecord(
    await invoke(`${contractPath}/from-approved-model`, intent),
  );
  const originalVersionId = responseString(
    responseRecord(original.version),
    'id',
  );
  const contract =
    options.successor === false
      ? original
      : responseRecord(
          await invoke(`${contractPath}/versions/from-approved-model`, {
            ...intent,
            expectedContractRevision: positiveInteger(original.revision),
            clientDetails: 'Fictional successor Contract party requisites',
          }),
        );
  const contractId = responseString(contract, 'id');
  const contractVersionId = responseString(
    responseRecord(contract.version),
    'id',
  );
  const selection = {
    opportunityId: source.opportunityId,
    contractId,
    contractVersionId,
  };
  const document = responseRecord(
    await invoke('/documents', {
      type: 'received-contract',
      ...selection,
      title: 'Fictional reported-signing original',
      purpose: 'Preserve an unverified fictional received Contract PDF',
      sourceDescription: 'Fictional manual Contract receipt',
      receivedOn: null,
    }),
  );
  const documentId = responseString(document, 'id');
  const documentVersionId = responseString(
    responseRecord(document.version),
    'id',
  );
  const uploaded = await fixture.request({
    ...target,
    path: `/documents/${documentId}/versions/${documentVersionId}/content?expectedRevision=${positiveInteger(document.workingRevision)}&fileName=fictional-contract.pdf`,
    init: {
      method: 'POST',
      headers: {
        'content-type': 'application/pdf',
        'idempotency-key': randomUUID(),
      },
      body: new Uint8Array(PDF_A),
    },
  });
  if (uploaded.status !== 201)
    throw new Error(
      `Fictional received PDF upload refused (${uploaded.status}).`,
    );
  const upload = responseRecord(await uploaded.json());
  const designation = await fixture.post({
    ...target,
    path: `/documents/${documentId}/versions/${documentVersionId}/official-designation`,
    body: { expectedRevision: positiveInteger(upload.workingRevision) },
  });
  if (designation.status !== 200)
    throw new Error(
      `Fictional received PDF designation refused (${designation.status}).`,
    );
  const warningCodes = ['MODEL_WORDING_REVIEWED', 'ANNEX_SCOPE_REVIEWED'];
  const approval = responseRecord(
    await invoke(`${contractPath}/versions/${contractVersionId}/approve`, {
      expectedContractRevision: positiveInteger(contract.revision),
      acknowledgedWarningCodes: warningCodes,
      reviewBasis: 'Fictional exact Contract wording deliberately reviewed',
    }),
  );
  const signing = {
    path: `${contractPath}/versions/${contractVersionId}/signing-declarations`,
    body: {
      expectedContractRevision: positiveInteger(approval.revision),
      documentId,
      documentVersionId,
      representationId: responseString(upload, 'representationId'),
      providerSignatory: {
        label: 'Fictional provider signatory',
        signedOn: null,
        mandate: { kind: 'UNKNOWN' },
      },
      clientSignatory: {
        label: 'Fictional Client signatory',
        signedOn: null,
        mandate: { kind: 'UNKNOWN' },
      },
      concordanceBasis:
        'Fictional saved PDF and exact Contract deliberately compared',
      acceptanceBasis:
        'Unverified signing declared for the fictional case only',
      acknowledgedWarningCodes: warningCodes,
    },
  };
  const declaration =
    options.declare === false
      ? null
      : responseRecord(await invoke(signing.path, signing.body));
  return {
    source,
    target,
    invoke,
    selection,
    recordedRecipient: recipient,
    contract,
    contractPath,
    originalVersionId,
    signing,
    declaration,
    receivedDocument: { documentId, documentVersionId, upload },
  };
}

async function registerAdditionalRecipient(
  fixture: Fixture,
  source: { companyId: string; clientId: string },
) {
  const target = {
    companyId: source.companyId,
    headers: ESTIMATE_OFFER_PREPARER,
  };
  const client = responseRecord(
    await fixture.read({ ...target, path: `/clients/${source.clientId}` }),
  );
  const party = {
    legalName: 'Fictional additional invoice recipient',
    taxId: 'FICTIONAL-ADDITIONAL-1020',
    legalAddress: 'Fictional additional address',
  };
  const registered = responseRecord(
    await fixture.command({
      ...target,
      path: `/clients/${source.clientId}/legal-entities`,
      body: {
        expectedClientVersion: positiveInteger(client.version),
        ...party,
      },
    }),
  );
  return {
    id: responseString(responseRecord(registered.legalEntity), 'id'),
    ...party,
  };
}

function positiveInteger(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw new Error('Expected a native positive revision or Version number.');
  return value;
}
