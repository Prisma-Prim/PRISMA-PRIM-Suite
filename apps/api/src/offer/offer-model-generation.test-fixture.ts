import {
  ESTIMATE_OFFER_DIRECTOR,
  ESTIMATE_OFFER_PREPARER,
  ESTIMATE_OFFER_READER,
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from './offer-estimate-preparation.test-support.js';

export const generatedOfferModelContent = {
  sourceKind: 'ILLUSTRATIVE',
  sourceDescription: 'source-description-internal-852',
  issuer: {
    legalName: 'Furnizor sintetic\nModel 852',
    taxId: 'SYNTHETIC-852',
    legalAddress: 'Adresă demonstrativă\nFără date reale',
    contactDetails: 'Contact demonstrativ',
  },
  serviceTitle: 'Consultanță demonstrativă\nSistem integrat',
  frameworks: [{ name: 'Cadru sintetic', edition: 'Ediție demonstrativă 852' }],
  sections: {
    introduction: ' Introducere demonstrativă\n<script>literal852()</script> ',
    providerProfile: 'Profil demonstrativ',
    scope: 'Domeniu demonstrativ',
    objectives: 'Obiective declarate pentru exemplu',
    assessmentGuidance: 'Date sintetice verificate de autorul exemplului',
    methodology: 'Metodologie demonstrativă',
    deliverables: 'Rezultate planificate demonstrative',
    realizationConditions: 'Condiții demonstrative de realizare',
    paymentConditions: 'Text demonstrativ fără scadențe sau plăți reale',
    closingRationale: 'Încheiere demonstrativă',
  },
  stages: Array.from({ length: 18 }, (_, index) => ({
    title: `Etapă sintetică ${index + 1}`,
    plannedActivity: `Activitate planificată ${index + 1}`,
    intendedResult: `Rezultat intenționat ${index + 1}`,
  })),
};

export async function prepareGeneratedOfferSource(
  fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>,
  options: { clientTaxId?: string } = {},
) {
  const source = await fixture.prepare(options);
  await fixture.grant({
    path: '/company-offer-model-editor-assignments',
    companyId: source.companyId,
    membershipId: source.preparerMembershipId,
  });
  await fixture.grant({
    path: '/company-offer-model-approver-assignments',
    companyId: source.companyId,
    membershipId: source.directorMembershipId,
  });
  const created = responseRecord(
    responseRecord(
      await fixture.command({
        path: '/offer-models/consulting-ro/versions',
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: {
          expectedModelRevision: 0,
          content: generatedOfferModelContent,
        },
      }),
    ).model,
  );
  const modelVersionId = responseString(responseRecord(created.head), 'id');
  const approved = responseRecord(
    responseRecord(
      await fixture.command({
        path: `/offer-models/consulting-ro/versions/${modelVersionId}/decision`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_DIRECTOR,
        body: {
          expectedModelRevision: 1,
          versionNumber: 1,
          outcome: 'APPROVE',
          basis: 'model-approval-basis-not-for-Offer-output-852',
        },
      }),
    ).model,
  );
  return {
    ...source,
    modelVersionId,
    modelVersionNumber: 1,
    modelApprovalDecisionId: responseString(
      responseRecord(responseRecord(approved.head).decision),
      'id',
    ),
  };
}

export function generatedOfferIntent(source: {
  estimateVersionId: string;
  estimateVersionNumber: number;
  modelVersionId: string;
  modelVersionNumber: number;
}) {
  return {
    estimateVersionId: source.estimateVersionId,
    estimateVersionNumber: source.estimateVersionNumber,
    modelVersionId: source.modelVersionId,
    modelVersionNumber: source.modelVersionNumber,
    recipient: { kind: 'PRIMARY' },
    validityDays: 30,
    scopeNote: ' Domeniu păstrat\nLiteral ',
    commercialConditions: null,
    financialDeclaration: {
      kind: 'NET_PLUS_DECLARED_TAX',
      netAmountConfirmed: true,
      taxAmount: '25.00',
      taxLabel: 'Taxă declarată pentru exemplul sintetic',
      basis: 'basis-should-stay-internal-852',
    },
  };
}

/** Arrange the real public workflow up to a dangerous committing transition. */
export async function prepareGeneratedOfferWorkflow(
  fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>,
  stage: 'PENDING' | 'APPROVED' | 'TRANSMITTED',
  options: { clientTaxId?: string } = {},
) {
  const source = await prepareGeneratedOfferSource(fixture, options);
  const path = `/offers/opportunities/${source.opportunityId}`;
  const created = responseRecord(
    await fixture.command({
      path: `${path}/from-approved-model`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      body: generatedOfferIntent(source),
    }),
  );
  const versionId = responseString(responseRecord(created.version), 'id');
  const base = `${path}/versions/${versionId}`;
  let revision = positiveResponseInteger(created.revision);
  if (stage !== 'PENDING') {
    const approved = responseRecord(
      await fixture.command({
        path: `${base}/approve`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_READER,
        body: {
          expectedOfferRevision: revision,
          acknowledgedWarningCodes: [
            'DECLARED_TAX_UNVERIFIED',
            'NON_OFFICIAL_OFFER',
            'ILLUSTRATIVE_MODEL',
          ],
        },
      }),
    );
    revision = positiveResponseInteger(approved.offerRevision);
  }
  if (stage === 'TRANSMITTED') {
    const transmission = responseRecord(
      await fixture.command({
        path: `${base}/transmission`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: {
          expectedOfferRevision: revision,
          acknowledgedWarningCodes: [],
          note: null,
        },
      }),
    );
    revision = positiveResponseInteger(transmission.offerRevision);
  }
  return { source, path, base, versionId, revision };
}
function positiveResponseInteger(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw new Error('Expected a recorded public revision.');
  return value;
}
