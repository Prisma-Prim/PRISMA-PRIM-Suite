import { describe, expect, it } from 'vitest';
import { readOfferModelContent } from '../offer-model/offer-model.content.js';
import {
  modelOfferFinancials,
  readModelOfferFinancialDeclaration,
} from './model-offer-financials.js';
import { renderModelOfferRepresentation } from './model-offer-representation.js';

// Renderer v1 is a persisted format. Keep this input and digest stable; a
// deliberate rendering change needs a new version so saved Offers still reopen.
const instant = '2026-10-24T09:00:00.000Z';
const modelSource = {
  kind: 'APPROVED_COMPANY_OFFER_MODEL',
  code: 'INTEGRATED_MANAGEMENT_CONSULTING_RO',
  language: 'ro',
  modelId: '00000000-0000-4000-8000-000000000001',
  versionId: '00000000-0000-4000-8000-000000000002',
  versionNumber: 1,
  approvalDecisionId: '00000000-0000-4000-8000-000000000003',
  approvedAt: instant,
  approvedBy: {
    workspaceMembershipId: '00000000-0000-4000-8000-000000000004',
    internalUserId: '00000000-0000-4000-8000-000000000005',
  },
  content: readOfferModelContent({
    sourceKind: 'COMPANY_SUPPLIED',
    sourceDescription: 'Internal fixed renderer source',
    issuer: {
      legalName: 'Furnizor sintetic & partener',
      taxId: 'SYNTHETIC-V1',
      legalAddress: 'Adresă sintetică\nLinia 2',
      contactDetails: null,
    },
    serviceTitle: 'Model fix\nConsultanță sintetică',
    frameworks: [{ name: 'Cadru sintetic', edition: 'Ediție fixă' }],
    sections: {
      introduction: ' Text literal <script>v1()</script>\nLinia 2 ',
      providerProfile: 'Profil fix',
      scope: 'Domeniu fix',
      objectives: 'Obiective fixe',
      assessmentGuidance: 'Date fixe',
      methodology: 'Metodologie fixă',
      deliverables: 'Rezultate fixe',
      realizationConditions: 'Condiții fixe',
      paymentConditions: 'Text fix fără fapte de plată',
      closingRationale: 'Încheiere fixă',
    },
    stages: Array.from({ length: 18 }, (_, index) => ({
      title: `Etapă fixă ${index + 1}`,
      plannedActivity: `Activitate fixă ${index + 1}`,
      intendedResult: `Rezultat fix ${index + 1}`,
    })),
  }),
} satisfies Parameters<typeof renderModelOfferRepresentation>[0]['modelSource'];
const priceSource = {
  estimateId: '00000000-0000-4000-8000-000000000006',
  estimateVersionId: '00000000-0000-4000-8000-000000000007',
  estimateVersionNumber: 1,
  approvalDecisionId: '00000000-0000-4000-8000-000000000008',
  approvedAt: instant,
  amount: '125.00',
  currency: 'EUR',
};
const financialDeclaration = modelOfferFinancials({
  netAmount: priceSource.amount,
  currency: priceSource.currency,
  declaration: readModelOfferFinancialDeclaration({
    kind: 'NET_PLUS_DECLARED_TAX',
    netAmountConfirmed: true,
    taxAmount: '25.00',
    taxLabel: 'Taxă declarată sintetică',
    basis: 'Internal fixed declaration basis',
  }),
  actorWorkspaceMembershipId: '00000000-0000-4000-8000-000000000009',
  actorInternalUserId: '00000000-0000-4000-8000-000000000010',
  declaredAt: instant,
});

describe('Fixed Company consulting renderer v1', () => {
  it('preserves its exact persisted Romanian bytes and excludes internal source and tax bases', () => {
    const result = renderModelOfferRepresentation({
      modelSource,
      priceSource,
      financialDeclaration,
      illustrativeReference: 7,
      versionNumber: 3,
      recipient: {
        kind: 'PRIMARY',
        legalName: 'Destinatar sintetic',
        taxId: null,
        legalAddress: 'Adresă sintetică',
      },
      createdAt: instant,
      validUntil: '2026-11-23T09:00:00.000Z',
      scopeNote: ' Domeniu suplimentar\nLiteral ',
      commercialConditions: null,
    });
    expect(result.rendererVersion).toBe(1);
    expect(result.sha256).toBe(
      '0bea4ab080caaaf78ed32db37caa537b1e9b68fbee2294bb8b2f5ce92355af57',
    );
    expect(result.html).toContain('&lt;script&gt;v1()&lt;/script&gt;');
    expect(result.html).not.toContain('Internal fixed renderer source');
    expect(result.html).not.toContain('Internal fixed declaration basis');
  });
});
