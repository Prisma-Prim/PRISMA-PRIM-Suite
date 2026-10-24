import type { ActorContext } from '../access-types';
import type { OfferModelContent } from './offer-model-content';

export const syntheticContent = {
  sourceKind: 'ILLUSTRATIVE',
  sourceDescription: ' Synthetic source, not approved legal content ',
  issuer: {
    legalName: 'Furnizor demonstrativ',
    taxId: 'DEMO-847',
    legalAddress: 'Adresă demonstrativă',
    contactDetails: null,
  },
  serviceTitle: 'Consultanță demonstrativă',
  frameworks: [{ name: 'Cadru demonstrativ', edition: 'Ediția 1' }],
  sections: {
    introduction: ' Introducere\n<script>literal()</script> ',
    providerProfile: 'Profil demonstrativ',
    scope: 'Domeniu demonstrativ',
    objectives: 'Obiective demonstrative',
    assessmentGuidance: 'Date demonstrative',
    methodology: 'Metodologie demonstrativă',
    deliverables: 'Rezultate demonstrative',
    realizationConditions: 'Condiții demonstrative',
    paymentConditions: 'Text demonstrativ fără sume reale',
    closingRationale: 'Încheiere demonstrativă',
  },
  stages: Array.from({ length: 18 }, (_, index) => ({
    title: `Etapă ${index + 1}`,
    plannedActivity: `Activitate ${index + 1}`,
    intendedResult: `Rezultat ${index + 1}`,
  })),
} satisfies OfferModelContent;

export const syntheticActor: ActorContext = {
  internalUserId: '20000000-0000-4000-8000-000000000847',
  workspaceMembershipId: '30000000-0000-4000-8000-000000000847',
  workspaceId: '00000000-0000-4000-8000-000000000847',
  workspaceName: 'Synthetic Workspace',
  displayName: 'Synthetic modeller',
  email: 'modeller@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: '10000000-0000-4000-8000-000000000847',
    displayName: 'Synthetic Company',
    clientPermissions: [],
    offerModelGrants: [
      {
        bundle: 'company_offer_model_editor',
        assignmentId: '40000000-0000-4000-8000-000000000847',
        permissionSetVersion: 'v1',
        permissions: [
          'commercial.offer.model.read',
          'commercial.offer.model.version.create',
        ],
      },
    ],
  },
};
export const syntheticAttribution = {
  actor: {
    workspaceMembershipId: syntheticActor.workspaceMembershipId,
    internalUserId: syntheticActor.internalUserId,
    displayName: syntheticActor.displayName,
  },
  recordedAt: '2026-10-24T12:00:00.000Z',
};
export const syntheticModel = {
  id: '50000000-0000-4000-8000-000000000847',
  workspaceId: syntheticActor.workspaceId,
  companyId: '10000000-0000-4000-8000-000000000847',
  code: 'INTEGRATED_MANAGEMENT_CONSULTING_RO',
  language: 'ro',
  revision: 1,
  head: {
    id: '60000000-0000-4000-8000-000000000847',
    versionNumber: 1,
    predecessorVersionId: null,
    content: syntheticContent,
    ...syntheticAttribution,
    decision: null,
    withdrawal: null,
  },
  activeVersion: null,
};
export const syntheticApprover: ActorContext = {
  ...syntheticActor,
  activeCompany: {
    id: '10000000-0000-4000-8000-000000000847',
    displayName: 'Synthetic Company',
    offerModelGrants: [
      {
        bundle: 'company_offer_model_approver',
        assignmentId: '41000000-0000-4000-8000-000000000847',
        permissionSetVersion: 'v1',
        permissions: [
          'commercial.offer.model.read',
          'commercial.offer.model.decide',
          'commercial.offer.model.withdraw',
        ],
      },
    ],
  },
};
