import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';

// Runs in the actual API production image, from /tmp with no network/system fonts.
const compiled = resolve(process.argv[2] ?? '/app/apps/api/dist');
const require = createRequire(
  join(compiled, 'commercial-pdf/commercial-pdf-renderer.js'),
);
const { CommercialPdfRenderer } = require(
  join(compiled, 'commercial-pdf/commercial-pdf-renderer.js'),
);
const { renderModelOfferRepresentation } = require(
  join(compiled, 'offer/model-offer-representation.js'),
);
const at = '2026-10-28T09:00:00.000Z';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const content = {
  sourceKind: 'ILLUSTRATIVE',
  sourceDescription: 'INTERNAL-DO-NOT-PRINT',
  issuer: {
    legalName: 'Furnizor DEMO',
    taxId: 'DEMO',
    legalAddress: 'Adresă DEMO',
    contactDetails: null,
  },
  serviceTitle: 'Consultanță DEMO Șț Русский Français a\u0306 e\u0301 ☀️',
  frameworks: [{ name: 'Cadru DEMO', edition: 'Ediție DEMO' }],
  sections: Object.fromEntries(
    [
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
    ].map((key) => [key, `${key}: conținut DEMO <script>literal</script>`]),
  ),
  stages: Array.from({ length: 18 }, (_, n) => ({
    title: `Etapă ${n + 1}`,
    plannedActivity: `Activitate ${n + 1}`,
    intendedResult: `Rezultat ${n + 1}`,
  })),
};
const representation = renderModelOfferRepresentation({
  modelSource: {
    kind: 'APPROVED_COMPANY_OFFER_MODEL',
    code: 'INTEGRATED_MANAGEMENT_CONSULTING_RO',
    language: 'ro',
    modelId: id(1),
    versionId: id(2),
    versionNumber: 1,
    approvalDecisionId: id(3),
    approvedAt: at,
    approvedBy: { workspaceMembershipId: id(4), internalUserId: id(5) },
    content,
  },
  priceSource: {
    estimateId: id(6),
    estimateVersionId: id(7),
    estimateVersionNumber: 1,
    approvalDecisionId: id(8),
    approvedAt: at,
    amount: '125.00',
    currency: 'EUR',
  },
  financialDeclaration: {
    kind: 'NET_PLUS_DECLARED_TAX',
    netAmountConfirmed: true,
    netAmount: '125.00',
    taxAmount: '25.00',
    grossAmount: '150.00',
    taxLabel: 'Taxă DEMO',
    currency: 'EUR',
    basis: 'INTERNAL-DO-NOT-PRINT',
  },
  illustrativeReference: 7,
  versionNumber: 3,
  recipient: {
    kind: 'PRIMARY',
    legalName: 'Beneficiar DEMO',
    taxId: null,
    legalAddress: null,
  },
  createdAt: at,
  validUntil: '2026-11-28T09:00:00.000Z',
  scopeNote: null,
  commercialConditions: null,
});
const assets = [];
for (const [name, expected] of [
  [
    'DejaVuSans.ttf',
    '57f73e11f51999432bf7ab22ce55b6f945d5eca1bf824404cfa9ec2e3718c84e',
  ],
  [
    'DejaVuSans-Bold.ttf',
    'a4c5bc453ca281d90ea079e596da7ae0dfeb5777497c29ec254e76d97ff6f890',
  ],
]) {
  const bytes = await readFile(join(compiled, 'commercial-pdf/assets', name)),
    sha256 = createHash('sha256').update(bytes).digest('hex');
  assert.equal(sha256, expected);
  assets.push({ name, bytes: bytes.length, sha256 });
}
const license = await readFile(
  join(compiled, 'commercial-pdf/assets/font-license.txt'),
  'utf8',
);
assert(
  license.includes('Bitstream Vera is a trademark') &&
    license.includes('DejaVu changes are in public domain.'),
);
const bytes = await new CommercialPdfRenderer().render({
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
  createdAt: at,
  sourceRendererCode: representation.rendererCode,
  sourceRendererVersion: 1,
  sourceHtmlSha256: representation.sha256,
  html: representation.html,
});
assert(bytes.length > 100_000 && bytes.length < 16 * 1024 * 1024);
assert(Buffer.from(bytes).subarray(0, 5).equals(Buffer.from('%PDF-')));
console.log(
  JSON.stringify({
    check: 'commercial-pdf-production-package',
    outcome: 'PASS',
    cwd: process.cwd(),
    sourceHtmlSha256: representation.sha256,
    pdfSha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
    assets,
    licensed: true,
    renderer: 'COMMERCIAL_MODEL_PDF/1',
  }),
);
