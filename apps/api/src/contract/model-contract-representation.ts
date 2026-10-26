import { createHash } from 'node:crypto';
import type { ContractModelService } from '../contract-model/contract-model.service.js';
import type { OfferService } from '../offer/offer.service.js';
import type { OfferRecipientCopy } from '../offer/offer.types.js';
import { escapeHtml } from '../offer/offer-representation.js';
import type { readModelContractCase } from './model-contract-case.js';

export type ApprovedContractModelSource = Awaited<
  ReturnType<
    ContractModelService['requireSelectedForContractWithinTransaction']
  >
>;
export type ModelContractOfferSource = Awaited<
  ReturnType<OfferService['resolveModelContractSource']>
>['copy'];
export const MODEL_CONTRACT_RENDERER = 'COMPANY_CONSULTING_CONTRACT_RO';
export const MODEL_CONTRACT_MARKER =
  'Contract neoficial pentru repetiție — fără număr oficial — nesemnat — fără verificare juridică';

/** Renderer v1 consumes frozen facts only. A wording change requires a new version. */
export function renderModelContractRepresentation(input: {
  modelSource: ApprovedContractModelSource;
  offerSource: ModelContractOfferSource;
  caseDetails: ReturnType<typeof readModelContractCase>;
  recipient: OfferRecipientCopy;
  illustrativeReference: number;
  versionNumber: number;
  createdAt: string;
}) {
  const content = input.modelSource.content;
  const details = input.caseDetails;
  const offer = input.offerSource;
  const financials = offer.financials;
  const sections = [
    { key: 'subject', title: 'I. Obiectul contractului' },
    { key: 'executionTerm', title: 'II. Termenul de executare' },
    { key: 'rightsAndObligations', title: 'III. Drepturi și obligații' },
    { key: 'confidentiality', title: 'IV. Confidențialitate' },
    { key: 'priceAndPayment', title: 'V. Preț și plată' },
    { key: 'liability', title: 'VI. Răspundere' },
    { key: 'termination', title: 'VII. Încetare' },
    { key: 'finalProvisions', title: 'VIII. Dispoziții finale' },
    { key: 'partiesAndSignatures', title: 'IX. Părți și semnături' },
  ] satisfies { key: keyof typeof content.sections; title: string }[];
  const row = (label: string, value: string | null) =>
    `<dt>${escapeHtml(label)}</dt><dd class="literal">${value === null ? 'Nespecificat' : escapeHtml(value)}</dd>`;
  const paragraph = (value: string) =>
    `<p class="literal">${escapeHtml(value)}</p>`;
  const html = [
    '<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><title>Contract de consultanță</title><style>*,*::before,*::after{box-sizing:border-box}body{margin:0;padding:1rem;font-family:system-ui,sans-serif;color:#172033;overflow-wrap:anywhere}.literal{white-space:pre-wrap;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{padding:.5rem;text-align:left;vertical-align:top;border:1px solid #cbd5e1;overflow-wrap:anywhere}dl{display:grid;grid-template-columns:minmax(8rem,1fr) 2fr;gap:.5rem 1rem}dt{font-weight:700}dd{margin:0;min-width:0}@media(max-width:30rem){dl{grid-template-columns:1fr}th,td{font-size:.75rem;padding:.25rem}}@media print{body{padding:0}thead{display:table-header-group}tr{break-inside:avoid}h2{break-after:avoid}}</style></head><body><article>',
    `<header><p><strong>${MODEL_CONTRACT_MARKER}</strong></p>${paragraph(content.sourceKind === 'ILLUSTRATIVE' ? 'Model ilustrativ aprobat pentru această repetiție.' : 'Model furnizat de companie; documentul rămâne neoficial.')}<h1 class="literal">${escapeHtml(content.title)}</h1></header><dl>`,
    row('Referință internă neoficială', String(input.illustrativeReference)),
    row('Versiune', String(input.versionNumber)),
    row('Localitate declarată', content.place),
    row('Data documentului declarată', details.documentDate),
    row('Serviciu', content.serviceTitle),
    row('Furnizor — denumire juridică declarată', content.issuer.legalName),
    row('Furnizor — identificator fiscal declarat', content.issuer.taxId),
    row('Furnizor — adresă juridică declarată', content.issuer.legalAddress),
    row('Furnizor — contact', content.issuer.contactDetails),
    '</dl>',
    paragraph(content.providerDetails),
    '<h2>Beneficiar</h2>',
    paragraph(content.clientDetailsIntroduction),
    '<dl>',
    row('Denumire juridică', input.recipient.legalName),
    row('Identificator fiscal', input.recipient.taxId),
    row('Adresă juridică', input.recipient.legalAddress),
    '</dl>',
    paragraph(details.clientDetails),
    '<h2>Cadre și ediții declarate</h2><ul>',
    ...content.frameworks.map(
      (f) =>
        `<li class="literal">${escapeHtml(f.name)} — ${escapeHtml(f.edition)}</li>`,
    ),
    '</ul>',
    ...sections.map(
      (s) =>
        `<section><h2>${s.title}</h2>${paragraph(content.sections[s.key])}</section>`,
    ),
    '<section><h2>Datele acestei versiuni și concordanța cu oferta</h2><dl>',
    row('Început declarat', details.termStartsOn),
    row('Sfârșit declarat', details.termEndsOn),
    row('Domeniu copiat din ofertă', offer.scopeNote),
    row('Condiții comerciale copiate din ofertă', offer.commercialConditions),
    row('Condiții suplimentare declarate', details.specialConditions),
    row(
      'Valoare netă confirmată în ofertă',
      `${financials.netAmount} ${financials.currency}`,
    ),
    row(financials.taxLabel, `${financials.taxAmount} ${financials.currency}`),
    row(
      'Total net plus taxa declarată',
      `${financials.grossAmount} ${financials.currency}`,
    ),
    '</dl><p>Taxa este declarată în oferta sursă, fără calcul fiscal verificat. Aceste valori nu confirmă plata.</p></section>',
    paragraph(content.signatureAreas.provider),
    paragraph(content.signatureAreas.client),
    `<section><h2 class="literal">${escapeHtml(content.annex.title)}</h2>`,
    paragraph(content.annex.referenceWording),
    '<p>Treisprezece activități și rezultate intenționate, fără dovada unor lucrări efectuate.</p><table><thead><tr><th scope="col">Activitate</th><th scope="col">Lucrare planificată</th><th scope="col">Rezultat intenționat</th></tr></thead><tbody>',
    ...content.annex.activities.map(
      (a) =>
        `<tr><td class="literal">${escapeHtml(a.title)}</td><td class="literal">${escapeHtml(a.plannedActivity)}</td><td class="literal">${escapeHtml(a.intendedResult)}</td></tr>`,
    ),
    '</tbody></table>',
    paragraph(content.signatureAreas.annexProvider),
    paragraph(content.signatureAreas.annexClient),
    '</section>',
    '<footer><h2>Proveniență și limite</h2><dl>',
    row(
      'Ofertă sursă — referință internă / versiune',
      `${offer.illustrativeReference} / ${offer.offerVersionNumber}`,
    ),
    row('Versiunea exactă a ofertei', offer.offerVersionId),
    row('SHA-256 al ofertei', offer.representationSha256),
    row(
      'Model de contract / versiune',
      `${input.modelSource.code} / ${input.modelSource.versionId} / ${input.modelSource.versionNumber}`,
    ),
    row('Aprobarea modelului', input.modelSource.approvalDecisionId),
    row('Aprobarea sursei economice', offer.priceSource.approvalDecisionId),
    row('Creat la', input.createdAt),
    row(
      'Proveniență',
      'Contract din model aprobat și ofertă selectată; repetiție neoficială',
    ),
    '</dl><p>Aprobarea internă nu confirmă acceptarea ofertei, semnarea, mandatul, plata sau validitatea juridică.</p></footer></article></body></html>',
  ].join('\n');
  return {
    rendererCode: MODEL_CONTRACT_RENDERER,
    rendererVersion: 1,
    html,
    sha256: createHash('sha256').update(html, 'utf8').digest('hex'),
  } satisfies {
    rendererCode: typeof MODEL_CONTRACT_RENDERER;
    rendererVersion: 1;
    html: string;
    sha256: string;
  };
}
