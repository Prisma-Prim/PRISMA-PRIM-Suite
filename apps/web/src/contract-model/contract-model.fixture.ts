import type { ActorContext } from '../access-types';
import type { ContractModelContent } from './contract-model-content';
export const syntheticContent = {
  sourceKind: 'ILLUSTRATIVE',
  sourceDescription: ' Synthetic ordinary Contract model; no actual clauses ',
  title: 'Contract demonstrativ de consultanță',
  serviceTitle: 'Serviciu sintetic de consultanță',
  place: ' Localitate demonstrativă ',
  issuer: {
    legalName: 'Furnizor sintetic',
    taxId: 'SYNTHETIC-864',
    legalAddress: 'Adresă sintetică',
    contactDetails: null,
  },
  providerDetails: ' Rechizite demonstrative\n<script>literal()</script> ',
  clientDetailsIntroduction: 'Datele beneficiarului se declară separat.',
  frameworks: [{ name: 'Cadru sintetic', edition: 'Ediție sintetică 1' }],
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
} satisfies ContractModelContent;

export const syntheticActor: ActorContext = {
  internalUserId: '20000000-0000-4000-8000-000000000864',
  workspaceMembershipId: '30000000-0000-4000-8000-000000000864',
  workspaceId: '00000000-0000-4000-8000-000000000864',
  workspaceName: 'Synthetic Workspace',
  displayName: 'Synthetic modeller',
  email: 'modeller@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: '10000000-0000-4000-8000-000000000864',
    displayName: 'Synthetic Company',
    clientPermissions: [],
    contractModelGrants: [
      {
        bundle: 'company_contract_model_editor',
        assignmentId: '40000000-0000-4000-8000-000000000864',
        permissionSetVersion: 'v1',
        permissions: [
          'commercial.contract.model.read',
          'commercial.contract.model.version.create',
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
  id: '50000000-0000-4000-8000-000000000864',
  workspaceId: syntheticActor.workspaceId,
  companyId: '10000000-0000-4000-8000-000000000864',
  code: 'INTEGRATED_MANAGEMENT_CONSULTING_CONTRACT_RO',
  kind: 'CONTRACT',
  language: 'ro',
  revision: 1,
  head: {
    id: '60000000-0000-4000-8000-000000000864',
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
    id: '10000000-0000-4000-8000-000000000864',
    displayName: 'Synthetic Company',
    contractModelGrants: [
      {
        bundle: 'company_contract_model_approver',
        assignmentId: '41000000-0000-4000-8000-000000000864',
        permissionSetVersion: 'v1',
        permissions: [
          'commercial.contract.model.read',
          'commercial.contract.model.decide',
          'commercial.contract.model.withdraw',
        ],
      },
    ],
  },
};
