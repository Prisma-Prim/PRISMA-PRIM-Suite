import { generatedOfferModelContent } from '../offer/offer-model-generation.test-fixture.js';
import { generatedContractModelContent } from '../contract/model-contract.test-fixture.js';
export const qualifiedUnicode =
  'ȘșȚțĂăÂâÎî Русский Français English ☀️ a\u0306 e\u0301';
const prose = (label: string) =>
  ` ${label} ${qualifiedUnicode}\n\n<script>literal & unexecuted</script>\r\n\t${'W'.repeat(300)}\n${' conținut complet'.repeat(20)} `;
export function nearBoundOfferModel() {
  const content = structuredClone(generatedOfferModelContent);
  content.sourceKind = 'COMPANY_SUPPLIED';
  const keys = [
    'introduction',
    'providerProfile',
    'scope',
    'objectives',
    'assessmentGuidance',
    'methodology',
    'deliverables',
    'realizationConditions',
    'paymentConditions',
    'closingRationale',
  ] satisfies (keyof typeof content.sections)[];
  for (const [i, key] of keys.entries())
    content.sections[key] = prose(`OFFER-SECTION-${i + 1}`);
  for (const [i, row] of content.stages.entries()) {
    row.title = `OFFER-ROW-${i + 1}`;
    row.plannedActivity = prose(`OFFER-CELL-${i + 1}`);
    row.intendedResult =
      i < 2 ? 'Activitate planificată' : `Rezultat repetat ${qualifiedUnicode}`;
  }
  content.stages[6].plannedActivity =
    'SPLIT-START\n' +
    Array.from({ length: 100 }, (_, i) => `R${i} Ș`).join('\n') +
    '\nSPLIT-END';
  saturate(content, [
    ...keys.map((key) => ({
      get: () => content.sections[key],
      set: (value: string) => {
        content.sections[key] = value;
      },
      max: 4000,
    })),
    ...content.stages.flatMap((row) => [
      {
        get: () => row.plannedActivity,
        set: (value: string) => {
          row.plannedActivity = value;
        },
        max: 1000,
      },
      {
        get: () => row.intendedResult,
        set: (value: string) => {
          row.intendedResult = value;
        },
        max: 1000,
      },
    ]),
  ]);
  return content;
}
export function nearBoundContractModel() {
  const content = structuredClone(generatedContractModelContent);
  const keys = [
    'subject',
    'executionTerm',
    'rightsAndObligations',
    'confidentiality',
    'priceAndPayment',
    'liability',
    'termination',
    'finalProvisions',
    'partiesAndSignatures',
  ] satisfies (keyof typeof content.sections)[];
  for (const [i, key] of keys.entries())
    content.sections[key] = prose(`CONTRACT-SECTION-${i + 1}`);
  for (const [i, row] of content.annex.activities.entries()) {
    row.title = `CONTRACT-ROW-${i + 1}`;
    row.plannedActivity = prose(`CONTRACT-CELL-${i + 1}`);
    row.intendedResult =
      i < 2 ? 'Rezultat intenționat' : `Rezultat repetat ${qualifiedUnicode}`;
  }
  content.annex.activities[6].plannedActivity =
    'SPLIT-START\n' +
    Array.from({ length: 100 }, (_, i) => `R${i} Ș`).join('\n') +
    '\nSPLIT-END';
  const signatures = [
    'provider',
    'client',
    'annexProvider',
    'annexClient',
  ] satisfies (keyof typeof content.signatureAreas)[];
  saturate(content, [
    ...keys.map((key) => ({
      get: () => content.sections[key],
      set: (value: string) => {
        content.sections[key] = value;
      },
      max: 4000,
    })),
    ...content.annex.activities.flatMap((row) => [
      {
        get: () => row.plannedActivity,
        set: (value: string) => {
          row.plannedActivity = value;
        },
        max: 1000,
      },
      {
        get: () => row.intendedResult,
        set: (value: string) => {
          row.intendedResult = value;
        },
        max: 1000,
      },
    ]),
    {
      get: () => content.providerDetails,
      set: (value: string) => {
        content.providerDetails = value;
      },
      max: 4000,
    },
    ...signatures.map((key) => ({
      get: () => content.signatureAreas[key],
      set: (value: string) => {
        content.signatureAreas[key] = value;
      },
      max: 500,
    })),
  ]);
  return content;
}
function saturate(
  content: unknown,
  fields: { get: () => string; set: (value: string) => void; max: number }[],
) {
  for (const field of fields) {
    const room = 65530 - Buffer.byteLength(JSON.stringify(content));
    if (room <= 0) break;
    const value = field.get();
    field.set(
      value + 'Z'.repeat(Math.max(0, Math.min(room, field.max - value.length))),
    );
  }
  if (Buffer.byteLength(JSON.stringify(content)) !== 65530)
    throw new Error('Expected exact near-bound synthetic model.');
}

import { readOfferModelContent } from '../offer-model/offer-model.content.js';
import { renderModelOfferRepresentation } from '../offer/model-offer-representation.js';
import {
  modelOfferFinancials,
  readModelOfferFinancialDeclaration,
} from '../offer/model-offer-financials.js';
import type { CommercialPdfSource } from './commercial-pdf-source.js';
export function syntheticPdfSource(
  text = ' Literal Șț Русский Français English a\u0306 e\u0301 ☀️\n\n<script>unexecuted & literal</script>\tEnd ',
): CommercialPdfSource {
  const instant = '2026-10-28T09:00:00.000Z',
    id = (n: number) =>
      `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const content = structuredClone(generatedOfferModelContent);
  content.sections.introduction = text;
  const representation = renderModelOfferRepresentation({
    modelSource: {
      kind: 'APPROVED_COMPANY_OFFER_MODEL',
      code: 'INTEGRATED_MANAGEMENT_CONSULTING_RO',
      language: 'ro',
      modelId: id(1),
      versionId: id(2),
      versionNumber: 1,
      approvalDecisionId: id(3),
      approvedAt: instant,
      approvedBy: { workspaceMembershipId: id(4), internalUserId: id(5) },
      content: readOfferModelContent(content),
    },
    priceSource: {
      estimateId: id(6),
      estimateVersionId: id(7),
      estimateVersionNumber: 1,
      approvalDecisionId: id(8),
      approvedAt: instant,
      amount: '125.00',
      currency: 'EUR',
    },
    financialDeclaration: modelOfferFinancials({
      netAmount: '125.00',
      currency: 'EUR',
      declaration: readModelOfferFinancialDeclaration({
        kind: 'NET_PLUS_DECLARED_TAX',
        netAmountConfirmed: true,
        taxAmount: '25.00',
        taxLabel: 'Taxă DEMO',
        basis: 'INTERNAL-DO-NOT-PRINT',
      }),
      actorWorkspaceMembershipId: id(4),
      actorInternalUserId: id(5),
      declaredAt: instant,
    }),
    illustrativeReference: 7,
    versionNumber: 3,
    recipient: {
      kind: 'PRIMARY',
      legalName: 'Beneficiar DEMO',
      taxId: null,
      legalAddress: null,
    },
    createdAt: instant,
    validUntil: '2026-11-28T09:00:00.000Z',
    scopeNote: null,
    commercialConditions: null,
  });
  return {
    kind: 'offer',
    workspaceId: id(10),
    companyId: id(11),
    opportunityId: id(12),
    rootId: id(13),
    reference: 7,
    versionId: id(14),
    versionNumber: 3,
    provenance: 'COMPANY_MODEL_ESTIMATE',
    language: 'ro',
    createdAt: instant,
    sourceRendererCode: representation.rendererCode,
    sourceRendererVersion: 1,
    sourceHtmlSha256: representation.sha256,
    html: representation.html,
  };
}
