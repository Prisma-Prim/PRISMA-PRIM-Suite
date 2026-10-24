import { createHash } from 'node:crypto';
import type { OfferModelService } from '../offer-model/offer-model.service.js';
import type { ApprovedEstimateCommercialProjection } from '../profitability-estimate/profitability-estimate.types.js';
import type { modelOfferFinancials } from './model-offer-financials.js';
import type { OfferRecipientCopy } from './offer.types.js';
import { escapeHtml } from './offer-representation.js';

export type ApprovedOfferModelSource = Awaited<
  ReturnType<OfferModelService['requireSelectedForOfferWithinTransaction']>
>;

export const MODEL_OFFER_RENDERER = 'OFFER_COMPANY_CONSULTING_RO';
export const MODEL_OFFER_NON_OFFICIAL_MARKER =
  'Document neoficial pentru repetiție — fără număr oficial — fără efect juridic';

/** Renderer v1 is frozen: future changes receive another renderer version. */
export function renderModelOfferRepresentation(input: {
  modelSource: ApprovedOfferModelSource;
  priceSource: ApprovedEstimateCommercialProjection;
  financialDeclaration: ReturnType<typeof modelOfferFinancials>;
  illustrativeReference: number;
  versionNumber: number;
  recipient: OfferRecipientCopy;
  createdAt: string;
  validUntil: string;
  scopeNote: string | null;
  commercialConditions: string | null;
}) {
  const model = input.modelSource;
  const content = model.content;
  const financials = input.financialDeclaration;
  const sections = [
    { key: 'introduction', title: 'Introducere' },
    { key: 'providerProfile', title: 'Profilul furnizorului' },
    { key: 'scope', title: 'Domeniul serviciului' },
    { key: 'objectives', title: 'Obiective' },
    { key: 'assessmentGuidance', title: 'Date și îndrumări pentru evaluare' },
    { key: 'methodology', title: 'Metodologie' },
    { key: 'deliverables', title: 'Rezultate planificate' },
    { key: 'realizationConditions', title: 'Condiții de realizare' },
    { key: 'paymentConditions', title: 'Condiții de plată' },
    { key: 'closingRationale', title: 'Încheiere' },
  ] satisfies readonly { key: keyof typeof content.sections; title: string }[];
  const row = (label: string, value: string | null) =>
    `<dt>${escapeHtml(label)}</dt><dd class="literal">${value === null ? 'Nespecificat' : escapeHtml(value)}</dd>`;
  const html = [
    '<!doctype html>',
    '<html lang="ro">',
    '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><title>Ofertă de consultanță</title><style>*,*::before,*::after{box-sizing:border-box}body{margin:0;padding:1rem;font-family:system-ui,sans-serif;color:#172033;overflow-wrap:anywhere}.literal{white-space:pre-wrap;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{padding:.5rem;text-align:left;vertical-align:top;border:1px solid #cbd5e1;overflow-wrap:anywhere}dl{display:grid;grid-template-columns:minmax(8rem,1fr) 2fr;gap:.5rem 1rem}dt{font-weight:700}dd{margin:0;min-width:0}@media(max-width:30rem){dl{grid-template-columns:1fr}th,td{font-size:.75rem;padding:.25rem}}@media print{body{padding:0}thead{display:table-header-group}tr{break-inside:avoid}h2{break-after:avoid}}</style></head>',
    '<body><article aria-labelledby="offer-title">',
    `<header><p><strong>${MODEL_OFFER_NON_OFFICIAL_MARKER}</strong></p><p>${content.sourceKind === 'ILLUSTRATIVE' ? 'Model ilustrativ aprobat pentru această repetiție.' : 'Model furnizat de companie și aprobat de un utilizator; documentul rămâne neoficial.'}</p><h1 id="offer-title" class="literal">${escapeHtml(content.serviceTitle)}</h1></header>`,
    '<section aria-labelledby="parties-title"><h2 id="parties-title">Furnizor și destinatar</h2><dl>',
    row('Furnizor — denumire juridică declarată', content.issuer.legalName),
    row('Furnizor — identificator fiscal declarat', content.issuer.taxId),
    row('Furnizor — adresă juridică declarată', content.issuer.legalAddress),
    row('Furnizor — date de contact', content.issuer.contactDetails),
    row('Referință internă neoficială', String(input.illustrativeReference)),
    row('Versiunea ofertei', String(input.versionNumber)),
    row('Destinatar — denumire juridică', input.recipient.legalName),
    row('Destinatar — identificator fiscal', input.recipient.taxId),
    row('Destinatar — adresă juridică', input.recipient.legalAddress),
    row('Creat la', input.createdAt),
    row('Valabil până la', input.validUntil),
    '</dl></section>',
    '<section aria-labelledby="frameworks-title"><h2 id="frameworks-title">Cadre și ediții declarate</h2><ul>',
    ...content.frameworks.map(
      (framework) =>
        `<li class="literal">${escapeHtml(framework.name)} — ${escapeHtml(framework.edition)}</li>`,
    ),
    '</ul></section>',
    ...sections.map(
      (section) =>
        `<section aria-labelledby="section-${section.key}"><h2 id="section-${section.key}">${section.title}</h2><p class="literal">${escapeHtml(content.sections[section.key])}</p></section>`,
    ),
    '<section aria-labelledby="terms-title"><h2 id="terms-title">Termenii acestei versiuni a ofertei</h2><dl>',
    row('Domeniu suplimentar', input.scopeNote),
    row('Condiții comerciale suplimentare', input.commercialConditions),
    '</dl></section>',
    '<section aria-labelledby="financials-title"><h2 id="financials-title">Valori comerciale declarate</h2><p>Valoarea netă este confirmată de autor. Taxa este declarată de un utilizator și nu reprezintă un calcul fiscal verificat.</p><dl>',
    row(
      'Valoare netă confirmată',
      `${financials.netAmount} ${financials.currency}`,
    ),
    row(financials.taxLabel, `${financials.taxAmount} ${financials.currency}`),
    row(
      'Total net plus taxa declarată',
      `${financials.grossAmount} ${financials.currency}`,
    ),
    row('Monedă', financials.currency),
    '</dl></section>',
    '<section aria-labelledby="annex-title"><h2 id="annex-title">Anexă — optsprezece etape propuse</h2><p>Activități și rezultate intenționate; nu constituie dovada unor lucrări efectuate.</p><table><thead><tr><th scope="col">Etapă propusă</th><th scope="col">Activitate planificată</th><th scope="col">Rezultat intenționat</th></tr></thead><tbody>',
    ...content.stages.map(
      (stage) =>
        `<tr><td class="literal">${escapeHtml(stage.title)}</td><td class="literal">${escapeHtml(stage.plannedActivity)}</td><td class="literal">${escapeHtml(stage.intendedResult)}</td></tr>`,
    ),
    '</tbody></table></section>',
    '<footer><h2>Proveniență și limite</h2><dl>',
    row(
      'Model și versiune',
      `${model.code} / ${model.versionId} / ${model.versionNumber}`,
    ),
    row(
      'Aprobarea modelului',
      `${model.approvalDecisionId} / ${model.approvedAt}`,
    ),
    row(
      'Versiunea economică',
      `${input.priceSource.estimateVersionId} / ${input.priceSource.estimateVersionNumber}`,
    ),
    row(
      'Aprobarea sursei economice',
      `${input.priceSource.approvalDecisionId} / ${input.priceSource.approvedAt}`,
    ),
    row('Reprezentare', `${MODEL_OFFER_RENDERER} / 1`),
    row(
      'Eligibilitate',
      'Repetiție neoficială; fără transmitere sau acceptare reală',
    ),
    '</dl></footer></article></body></html>',
  ].join('\n');
  return {
    rendererCode: MODEL_OFFER_RENDERER,
    rendererVersion: 1,
    html,
    sha256: createHash('sha256').update(html, 'utf8').digest('hex'),
  } satisfies {
    rendererCode: typeof MODEL_OFFER_RENDERER;
    rendererVersion: 1;
    html: string;
    sha256: string;
  };
}

export type ModelOfferRepresentation = ReturnType<
  typeof renderModelOfferRepresentation
>;
