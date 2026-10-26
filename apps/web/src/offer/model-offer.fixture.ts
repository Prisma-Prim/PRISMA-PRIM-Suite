import type { ActorContext } from '../access-types';
import {
  profitabilityActor,
  syntheticVersion,
} from '../profitability-estimate/profitability.fixture';
import { syntheticContent } from '../offer-model/offer-model.fixture';
import { internalOfferFixture } from './offer-estimate.fixture';

export const MODEL_OFFER_COMPANY = '00000000-0000-4000-8000-000000000852';
export const MODEL_OFFER_OPPORTUNITY = '10000000-0000-4000-8000-000000000852';
const membership = '20000000-0000-4000-8000-000000000852';
const internalUser = '30000000-0000-4000-8000-000000000852';
export const modelOfferActor: ActorContext = {
  ...profitabilityActor,
  internalUserId: internalUser,
  workspaceMembershipId: membership,
  activeCompany: {
    ...profitabilityActor.activeCompany,
    id: MODEL_OFFER_COMPANY,
    displayName: 'Synthetic model Offer Company',
    clientPermissions: ['client.read'],
    offerPermissionAssignmentId: 'preparer-852',
    offerPermissionSetVersion: 'v3',
    offerPermissions: [
      'commercial.offer.read',
      'commercial.offer.prepare',
      'commercial.offer.estimate.prepare',
      'commercial.offer.model.select',
      'commercial.offer.model_based.prepare',
      'commercial.offer.transmission.record',
      'commercial.offer.model_based.transmission.record',
    ],
  },
};
export const selectedModelFixture = {
  kind: 'APPROVED_COMPANY_OFFER_MODEL',
  modelId: '40000000-0000-4000-8000-000000000852',
  code: 'INTEGRATED_MANAGEMENT_CONSULTING_RO',
  language: 'ro',
  versionId: '50000000-0000-4000-8000-000000000852',
  versionNumber: 1,
  approvalDecisionId: '60000000-0000-4000-8000-000000000852',
  approvedAt: '2026-10-24T08:00:00.000Z',
  approvedBy: {
    workspaceMembershipId: '70000000-0000-4000-8000-000000000852',
    internalUserId: '80000000-0000-4000-8000-000000000852',
  },
  content: syntheticContent,
};

export function modelOfferFixture() {
  const original = internalOfferFixture();
  const { taxTreatment, ...priceSource } = original.version.priceSource;
  void taxTreatment;
  return {
    ...original,
    companyId: MODEL_OFFER_COMPANY,
    opportunityId: MODEL_OFFER_OPPORTUNITY,
    provisional: true,
    version: {
      ...original.version,
      provenance: 'COMPANY_MODEL_ESTIMATE',
      eligibility: 'NON_OFFICIAL_REHEARSAL',
      priceSource,
      createdByWorkspaceMembershipId: membership,
      createdAt: '2026-10-24T09:00:00.000Z',
      modelSource: selectedModelFixture,
      financialDeclaration: {
        kind: 'NET_PLUS_DECLARED_TAX',
        netAmountConfirmed: true,
        netAmount: '125.00',
        taxAmount: '25.00',
        grossAmount: '150.00',
        currency: 'EUR',
        taxLabel: 'Literal tax',
        basis: ' Literal basis\n🌍 ',
        declaredBy: {
          workspaceMembershipId: membership,
          internalUserId: internalUser,
        },
        declaredAt: '2026-10-24T09:00:00.000Z',
      },
      qualityRuleSet: 'OFFER_QUALITY_COMPANY_MODEL',
      qualityRuleSetVersion: 1,
      representation: {
        rendererCode: 'OFFER_COMPANY_CONSULTING_RO',
        rendererVersion: 1,
        html: '<!doctype html><html lang="ro"><body>Document neoficial — exemplu sintetic</body></html>',
        sha256: 'a'.repeat(64),
      },
    },
  };
}
export function modelOfferEconomicFixture() {
  const source = modelOfferFixture().version.priceSource;
  return {
    ...syntheticVersion(),
    workspaceId: modelOfferActor.workspaceId,
    companyId: MODEL_OFFER_COMPANY,
    opportunityId: MODEL_OFFER_OPPORTUNITY,
    id: source.estimateVersionId,
    estimateId: source.estimateId,
    decision: {
      id: source.approvalDecisionId,
      code: 'APPROVE',
      decidedByWorkspaceMembershipId: 'director-1',
      decidedAt: source.approvedAt,
    },
  };
}
