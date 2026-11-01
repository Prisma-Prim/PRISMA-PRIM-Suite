import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { syntheticContent as offerContent } from '../src/offer-model/offer-model.fixture';
import { syntheticContent as contractContent } from '../src/contract-model/contract-model.fixture';
import {
  modelContractIdentities,
  object,
  text,
} from './model-contract.acceptance.fixture';
export { modelContractIdentities, object, text };
export const invoiceApiOrigin = 'http://127.0.0.1:4174/api';
const origin = invoiceApiOrigin;
function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw new Error('Expected native positive revision');
  return value;
}
async function prepareInvoiceCommercialCase(
  page: Page,
  suffix: string,
  partyKind: 'PRIMARY' | 'ADDITIONAL',
) {
  async function command(
    path: string,
    body: unknown,
    identity = modelContractIdentities.owner,
    companyId?: string,
  ) {
    const response = await page.request.post(origin + path, {
      headers: {
        ...identity,
        ...(companyId ? { 'x-company-context-id': companyId } : {}),
        'idempotency-key': randomUUID(),
      },
      data: body,
    });
    const reply: unknown = await response.json();
    expect(response.status(), `${path}: ${JSON.stringify(reply)}`).toBe(201);
    return object(reply);
  }
  async function read(
    path: string,
    companyId: string,
    identity = modelContractIdentities.preparer,
  ) {
    const response = await page.request.get(origin + path, {
      headers: { ...identity, 'x-company-context-id': companyId },
    });
    expect(response.status(), path).toBe(200);
    return object(await response.json());
  }
  async function member(identity: typeof modelContractIdentities.owner) {
    const response = await page.request.get(origin + '/access/current-actor', {
      headers: identity,
    });
    expect(response.status()).toBe(200);
    return text(object(await response.json()).workspaceMembershipId);
  }
  const companyName = 'Fictional invoice provider ' + suffix,
    subject = 'Fictional invoice source case ' + suffix;
  const companyId = text(
    (await command('/companies', { displayName: companyName })).id,
  );
  const otherCompanyName = 'Other Fictional invoice provider ' + suffix,
    otherCompanyId = text(
      (await command('/companies', { displayName: otherCompanyName })).id,
    );
  const preparerId = await member(modelContractIdentities.preparer),
    directorId = await member(modelContractIdentities.director),
    readerId = await member(modelContractIdentities.reader);
  for (const membershipId of [preparerId, directorId, readerId])
    for (const bundle of ['company-context', 'company-commercial-intake'])
      await command('/' + bundle + '-assignments', {
        companyId,
        workspaceMembershipId: membershipId,
      });
  await command('/company-context-assignments', {
    companyId: otherCompanyId,
    workspaceMembershipId: readerId,
  });
  for (const bundle of [
    'company-director-client',
    'company-offer-preparer',
    'company-profitability-contributor',
    'company-contract-model-editor',
    'company-contract-model-approver',
  ])
    await command('/' + bundle + '-assignments', {
      companyId,
      workspaceMembershipId: preparerId,
    });
  await command('/company-profitability-director-assignments', {
    companyId,
    workspaceMembershipId: directorId,
  });
  for (const membershipId of [preparerId, readerId])
    await command('/company-offer-approver-assignments', {
      companyId,
      workspaceMembershipId: membershipId,
    });
  await command('/company-contract-approver-assignments', {
    companyId,
    workspaceMembershipId: readerId,
  });
  const clientId = text(
    (
      await command(
        '/clients',
        {
          displayName: 'Fictional invoice Client ' + suffix,
          taxId: 'SYNTHETIC-MODEL-CONTRACT-' + suffix,
          address: 'Synthetic case address',
        },
        modelContractIdentities.preparer,
        companyId,
      )
    ).id,
  );
  const request = await command(
      '/commercial-intake/requests',
      {
        clientAccountId: clientId,
        subject,
        originalText: 'Synthetic full corresponding Contract rehearsal.',
        opportunity: {
          title: subject,
          nextAction: 'Prepare the corresponding complete Contract and annex',
        },
      },
      modelContractIdentities.preparer,
      companyId,
    ),
    opportunityId = text(object(request.initialOpportunity).id);
  const estimate = await command(
    `/opportunities/${opportunityId}/profitability-estimates`,
    {
      expectedLatestVersionNumber: null,
      currency: 'EUR',
      executorType: 'PATENT_CONSULTANT',
      executorCost: '70.00',
      fiscalCost: '10.00',
      allocatedOverhead: '10.00',
      directCosts: [
        {
          key: 'travel',
          category: 'TRAVEL',
          label: 'Synthetic travel',
          amount: '10.00',
          currency: 'EUR',
        },
      ],
      targetProfitability: '20',
      proposedPrice: '125.00',
      pricingIntent: { kind: 'ORDINARY' },
      costConfirmation: true,
    },
    modelContractIdentities.preparer,
    companyId,
  );
  await command(
    `/opportunities/${opportunityId}/profitability-estimates/versions/${text(estimate.id)}/decision`,
    { expectedVersionNumber: 1, expectedDecision: null, code: 'APPROVE' },
    modelContractIdentities.director,
    companyId,
  );
  for (const bundle of [
    'company-offer-model-editor',
    'company-offer-model-approver',
  ])
    await command('/' + bundle + '-assignments', {
      companyId,
      workspaceMembershipId: preparerId,
    });
  const offerModel = object(
      (
        await command(
          '/offer-models/consulting-ro/versions',
          { expectedModelRevision: 0, content: offerContent },
          modelContractIdentities.preparer,
          companyId,
        )
      ).model,
    ),
    offerModelId = text(object(offerModel.head).id);
  await command(
    `/offer-models/consulting-ro/versions/${offerModelId}/decision`,
    {
      expectedModelRevision: 1,
      versionNumber: 1,
      outcome: 'APPROVE',
      basis: 'Synthetic full Offer wording reviewed',
    },
    modelContractIdentities.preparer,
    companyId,
  );
  let recipient:
    { kind: 'PRIMARY' } | { kind: 'ADDITIONAL'; legalEntityId: string } = {
    kind: 'PRIMARY',
  };
  let expectedParty:
    | {
        kind: 'PRIMARY';
        legalName: string;
        taxId: string | null;
        legalAddress: string | null;
      }
    | {
        kind: 'ADDITIONAL';
        additionalLegalEntityId: string;
        legalName: string;
        taxId: string | null;
        legalAddress: string | null;
      } = {
    kind: 'PRIMARY',
    legalName: 'Fictional invoice Client ' + suffix,
    taxId: 'SYNTHETIC-MODEL-CONTRACT-' + suffix,
    legalAddress: 'Synthetic case address',
  };
  if (partyKind === 'ADDITIONAL') {
    const current = await read('/clients/' + clientId, companyId);
    const legalName = 'Fictional additional party Ș Я é ' + suffix;
    const entity = object(
      (
        await command(
          '/clients/' + clientId + '/legal-entities',
          {
            expectedClientVersion: integer(current.version),
            legalName,
            taxId: 'FICTIONAL-ADDITIONAL-' + suffix,
            legalAddress: 'Fictional branch address',
          },
          modelContractIdentities.preparer,
          companyId,
        )
      ).legalEntity,
    );
    const legalEntityId = text(entity.id);
    recipient = { kind: 'ADDITIONAL', legalEntityId };
    expectedParty = {
      kind: 'ADDITIONAL',
      additionalLegalEntityId: legalEntityId,
      legalName,
      taxId: 'FICTIONAL-ADDITIONAL-' + suffix,
      legalAddress: 'Fictional branch address',
    };
  }
  const offer = await command(
      `/offers/opportunities/${opportunityId}/from-approved-model`,
      {
        estimateVersionId: text(estimate.id),
        estimateVersionNumber: 1,
        modelVersionId: offerModelId,
        modelVersionNumber: 1,
        recipient,
        validityDays: 30,
        scopeNote:
          ' Synthetic corresponding scope\n<script>literalScope()</script> ',
        commercialConditions: 'Synthetic commercial conditions',
        financialDeclaration: {
          kind: 'NET_PLUS_DECLARED_TAX',
          netAmountConfirmed: true,
          taxAmount: '25.00',
          taxLabel: 'Synthetic declared tax',
          basis: 'Synthetic private tax declaration basis',
        },
      },
      modelContractIdentities.preparer,
      companyId,
    ),
    offerVersionId = text(object(offer.version).id);
  await command(
    `/offers/opportunities/${opportunityId}/versions/${offerVersionId}/approve`,
    {
      expectedOfferRevision: 1,
      acknowledgedWarningCodes: [
        'DECLARED_TAX_UNVERIFIED',
        'NON_OFFICIAL_OFFER',
        'ILLUSTRATIVE_MODEL',
      ],
    },
    modelContractIdentities.preparer,
    companyId,
  );
  await command(
    `/offers/opportunities/${opportunityId}/versions/${offerVersionId}/transmission`,
    { expectedOfferRevision: 2, acknowledgedWarningCodes: [], note: null },
    modelContractIdentities.preparer,
    companyId,
  );
  const content = {
    ...contractContent,
    issuer: offerContent.issuer,
    serviceTitle: offerContent.serviceTitle,
    frameworks: offerContent.frameworks,
  };
  const model = object(
      (
        await command(
          '/contract-models/consulting-ro/versions',
          { expectedModelRevision: 0, content },
          modelContractIdentities.preparer,
          companyId,
        )
      ).model,
    ),
    modelVersionId = text(object(model.head).id);
  await command(
    `/contract-models/consulting-ro/versions/${modelVersionId}/decision`,
    {
      expectedModelRevision: 1,
      versionNumber: 1,
      outcome: 'APPROVE',
      basis: 'Synthetic full Contract and thirteen-row annex reviewed',
    },
    modelContractIdentities.preparer,
    companyId,
  );
  async function revoke(bundle: string, membershipId = preparerId) {
    const response = await page.request.delete(
      origin + `/${bundle}-assignments/${membershipId}/${companyId}`,
      {
        headers: {
          ...modelContractIdentities.owner,
          'idempotency-key': randomUUID(),
        },
      },
    );
    expect(response.status()).toBe(200);
  }
  return {
    expectedParty,
    companyId,
    clientId,
    companyName,
    otherCompanyId,
    otherCompanyName,
    subject,
    preparerId,
    readerId,
    opportunityId,
    offerVersionId,
    modelVersionId,
    command,
    read,
    revoke,
  };
}

/** Fictional preserved bytes only; no Invoice Record or fiscal calculation is created. */
async function invoicePdf(second: boolean) {
  const pdf = await PDFDocument.create();
  pdf.setCreationDate(new Date('2026-01-15T00:00:00.000Z'));
  pdf.setModificationDate(new Date('2026-01-15T00:00:00.000Z'));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([612, 792]);
  for (const [index, line] of [
    'Fictional external invoice — not a fiscal document',
    'Fictional manual process',
    'SYN-INV-001',
    '1255.50 MDL',
    '2026-01-15',
    second
      ? 'Different preserved external file B'
      : 'Original preserved external file A',
  ].entries())
    page.drawText(line, {
      x: 40,
      y: 740 - index * 28,
      size: index === 0 ? 15 : 12,
      font,
    });
  return Buffer.from(await pdf.save());
}

/** Native public V1 → V2 approval and reported signing, never an invented execution flag. */
export async function prepareExternalInvoiceSourceCase(
  page: Page,
  suffix: string,
  partyKind: 'PRIMARY' | 'ADDITIONAL',
) {
  const ready = await prepareInvoiceCommercialCase(page, suffix, partyKind);
  for (const bundle of [
    'company-contract-preparer',
    'company-contract-approver',
    'company-contract-signature-declarer',
    'company-document-registrar',
    'company-received-contract-access',
    'company-document-content-reader',
    'company-document-content-uploader',
    'company-document-approver',
  ])
    await ready.command('/' + bundle + '-assignments', {
      companyId: ready.companyId,
      workspaceMembershipId: ready.preparerId,
    });
  const model = object(
    (await ready.read('/contract-models/consulting-ro', ready.companyId)).model,
  );
  const intent = {
    sourceOfferVersionId: ready.offerVersionId,
    modelVersionId: ready.modelVersionId,
    modelVersionNumber: 1,
    modelApprovalDecisionId: text(object(object(model.head).decision).id),
    documentDate: '2026-10-25',
    clientDetails: 'Fictional declared source party',
    termStartsOn: null,
    termEndsOn: null,
    specialConditions: null,
    sourceConcordanceDeclaration: true,
    sourceConcordanceBasis:
      'Fictional Offer and Contract deliberately compared',
  };
  const contractPath = '/contracts/opportunities/' + ready.opportunityId;
  const first = await ready.command(
    contractPath + '/from-approved-model',
    intent,
    modelContractIdentities.preparer,
    ready.companyId,
  );
  const initialVersionId = text(object(first.version).id);
  const second = await ready.command(
    contractPath + '/versions/from-approved-model',
    {
      ...intent,
      expectedContractRevision: integer(first.revision),
      specialConditions:
        'Second unexecuted native Version selected deliberately',
    },
    modelContractIdentities.preparer,
    ready.companyId,
  );
  const contractId = text(second.id),
    contractVersionId = text(object(second.version).id);
  const received = await ready.command(
    '/documents',
    {
      type: 'received-contract',
      opportunityId: ready.opportunityId,
      contractId,
      contractVersionId,
      title: 'Fictional Contract declaration PDF ' + suffix,
      purpose: 'Unverified reported signing source',
      sourceDescription: 'Fictional declared Contract file',
      receivedOn: null,
    },
    modelContractIdentities.preparer,
    ready.companyId,
  );
  const documentId = text(received.id),
    documentVersionId = text(object(received.version).id);
  const pdfA = await invoicePdf(false),
    pdfB = await invoicePdf(true);
  const headers = {
    ...modelContractIdentities.preparer,
    'x-company-context-id': ready.companyId,
  };
  const uploaded = await page.request.post(
    origin +
      `/documents/${documentId}/versions/${documentVersionId}/content?expectedRevision=1&fileName=fictional-declared-contract.pdf`,
    {
      headers: {
        ...headers,
        'content-type': 'application/pdf',
        'idempotency-key': randomUUID(),
      },
      data: pdfA,
    },
  );
  expect(uploaded.status()).toBe(201);
  const upload = object(await uploaded.json());
  const designated = await page.request.post(
    origin +
      `/documents/${documentId}/versions/${documentVersionId}/official-designation`,
    {
      headers: { ...headers, 'idempotency-key': randomUUID() },
      data: { expectedRevision: integer(upload.workingRevision) },
    },
  );
  expect(designated.status()).toBe(200);
  const checked = await ready.command(
    `${contractPath}/versions/${contractVersionId}/quality-checks`,
    {},
    modelContractIdentities.preparer,
    ready.companyId,
  );
  expect(checked).toMatchObject({
    contractVersionId,
    ruleSet: 'CONTRACT_QUALITY_COMPANY_MODEL',
    ruleSetVersion: 1,
  });
  if (!Array.isArray(checked.results))
    throw new Error('Expected native Contract Quality Check results.');
  const results = checked.results.map(object);
  expect(results.filter((result) => result.status === 'ERROR')).toEqual([]);
  const warnings = results
    .filter((result) => result.status === 'WARNING')
    .map((result) => text(result.code));
  expect([...warnings].sort()).toEqual([
    'ADDED_CONDITIONS_CONFIRMED',
    'ANNEX_SCOPE_REVIEWED',
    'MODEL_WORDING_REVIEWED',
  ]);
  const observed = object(
    (await ready.read(contractPath, ready.companyId)).contract,
  );
  await ready.command(
    `${contractPath}/versions/${contractVersionId}/approve`,
    {
      expectedContractRevision: integer(observed.revision),
      acknowledgedWarningCodes: warnings,
      reviewBasis: 'Fictional Contract wording and annex deliberately reviewed',
    },
    modelContractIdentities.preparer,
    ready.companyId,
  );
  const approved = object(
    (await ready.read(contractPath, ready.companyId)).contract,
  );
  const declaration = await ready.command(
    `${contractPath}/versions/${contractVersionId}/signing-declarations`,
    {
      expectedContractRevision: integer(approved.revision),
      documentId,
      documentVersionId,
      representationId: text(upload.representationId),
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
      concordanceBasis: 'Fictional exact preserved PDF and Contract compared',
      acceptanceBasis: 'Fictional reported case acceptance',
      acknowledgedWarningCodes: warnings,
    },
    modelContractIdentities.preparer,
    ready.companyId,
  );
  expect(declaration).toMatchObject({
    evidenceKind: 'DECLARED_RECEIVED_PDF',
    caseAcceptance: 'DECLARED',
  });
  const current = object(
    (await ready.read(contractPath, ready.companyId)).contract,
  );
  expect(object(current.version)).toMatchObject({
    id: contractVersionId,
    executionState: 'EXECUTED',
  });
  return {
    ...ready,
    contractId,
    contractVersionId,
    initialVersionId,
    contractPath,
    pdfA,
    pdfB,
  };
}
