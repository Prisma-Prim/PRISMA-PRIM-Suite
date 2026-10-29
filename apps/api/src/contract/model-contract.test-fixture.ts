import { generatedOfferModelContent } from '../offer/offer-model-generation.test-fixture.js';
import { randomUUID } from 'node:crypto';
import { prepareGeneratedOfferWorkflow } from '../offer/offer-model-generation.test-fixture.js';
import {
  ESTIMATE_OFFER_PREPARER,
  responseRecord,
  responseString,
  type openEstimateOfferFixture,
} from '../offer/offer-estimate-preparation.test-support.js';
export const generatedContractModelContent = {
  sourceKind: 'ILLUSTRATIVE',
  sourceDescription: ' Synthetic ordinary Contract model; no actual clauses ',
  title: 'Contract demonstrativ de consultanță',
  serviceTitle: generatedOfferModelContent.serviceTitle,
  place: ' Localitate demonstrativă ',
  issuer: generatedOfferModelContent.issuer,
  providerDetails: ' Rechizite demonstrative\n<script>literal()</script> ',
  clientDetailsIntroduction: 'Datele beneficiarului se declară separat.',
  frameworks: generatedOfferModelContent.frameworks,
  sections: {
    subject: ' Obiect demonstrativ ☀️ ',
    executionTerm: 'Termen demonstrativ, fără date implicite',
    rightsAndObligations: 'Drepturi și obligații exclusiv demonstrative',
    confidentiality: 'Text demonstrativ de confidențialitate',
    priceAndPayment: 'Text sintetic, fără sumă sau regulă fiscală reală',
    liability: 'Text sintetic, fără penalități reale',
    termination: 'Text sintetic, fără preaviz implicit',
    finalProvisions: 'Dispoziții demonstrative',
    partiesAndSignatures: 'Zone demonstrative; nu confirmă semnarea',
  },
  signatureAreas: {
    provider: 'Zona furnizorului, necompletată',
    client: 'Zona beneficiarului, necompletată',
    annexProvider: 'Zona anexei pentru furnizor, necompletată',
    annexClient: 'Zona anexei pentru beneficiar, necompletată',
  },
  annex: {
    title: 'Plan demonstrativ de activități',
    referenceWording: 'Referința și data se declară separat.',
    activities: Array.from({ length: 13 }, (_, index) => ({
      title: `Activitate demonstrativă ${index + 1}`,
      plannedActivity: `Lucrare planificată demonstrativă ${index + 1}`,
      intendedResult: `Rezultat intenționat demonstrativ ${index + 1}`,
    })),
  },
};

export async function prepareModelContractSource(
  fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>,
  options: {
    clientTaxId?: string;
    clientAddress?: string;
    offerStage?: 'PENDING' | 'APPROVED' | 'TRANSMITTED';
    modelContent?: typeof generatedOfferModelContent;
    contractModelContent?: typeof generatedContractModelContent;
  } = {},
) {
  const flow = await prepareGeneratedOfferWorkflow(
    fixture,
    options.offerStage ?? 'TRANSMITTED',
    options,
  );
  const { source } = flow;
  for (const path of [
    '/company-contract-model-editor-assignments',
    '/company-contract-model-approver-assignments',
    '/company-contract-preparer-assignments',
    '/company-contract-approver-assignments',
  ]) {
    await fixture.grant({
      path,
      companyId: source.companyId,
      membershipId: source.preparerMembershipId,
    });
  }
  const invoke = (path: string, body: unknown) =>
    fixture.command({
      path,
      body,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
    });
  const modelPath = '/contract-models/consulting-ro';
  const submitted = responseRecord(
    responseRecord(
      await invoke(`${modelPath}/versions`, {
        expectedModelRevision: 0,
        content: options.contractModelContent ?? generatedContractModelContent,
      }),
    ).model,
  );
  const modelVersionId = responseString(responseRecord(submitted.head), 'id');
  const approved = responseRecord(
    responseRecord(
      await invoke(`${modelPath}/versions/${modelVersionId}/decision`, {
        expectedModelRevision: 1,
        versionNumber: 1,
        outcome: 'APPROVE',
        basis: 'Synthetic full wording deliberately reviewed',
      }),
    ).model,
  );
  const intent = {
    sourceOfferVersionId: flow.versionId,
    modelVersionId,
    modelVersionNumber: 1,
    modelApprovalDecisionId: responseString(
      responseRecord(responseRecord(approved.head).decision),
      'id',
    ),
    documentDate: '2026-10-24',
    clientDetails: ' Rechizite sintetice\n<script>literal()</script> ',
    termStartsOn: null,
    termEndsOn: null,
    specialConditions: null,
    sourceConcordanceDeclaration: true,
    sourceConcordanceBasis:
      'Synthetic Offer/Contract wording and distinct activity lists reviewed',
  };
  return {
    flow,
    source,
    path: `/contracts/opportunities/${source.opportunityId}`,
    intent,
    invoke,
  };
}

export async function revokeModelContractFixtureGrant(
  fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>,
  path: string,
  companyId: string,
  membershipId: string,
) {
  const response = await fixture.request({
    path: `${path}/${membershipId}/${companyId}`,
    init: { method: 'DELETE', headers: { 'idempotency-key': randomUUID() } },
  });
  if (response.status !== 200)
    throw new Error(
      `Expected public assignment revocation, received ${response.status}.`,
    );
  const body: unknown = await response.json();
  return responseRecord(body);
}
