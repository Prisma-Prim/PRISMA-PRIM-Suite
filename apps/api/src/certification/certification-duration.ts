import type { FoodChainSubcategory } from './certification.types.js';

/**
 * Deterministic ISO 22000 audit-duration proposal: the basic method of the
 * certification body's calculator (ISO/TS 22003-1 basic, HACCP and FTE times).
 * It proposes; a programme manager confirms or adjusts with a justification.
 */
export const DURATION_RULE_VERSION = 'iso22000-basic-2026-11';

export const INCREASE_FACTORS = [
  'productTypes',
  'productLines',
  'productDevelopment',
  'criticalControlPoints',
  'operationalPrerequisites',
  'constructionSites',
  'complexInfrastructure',
  'onSiteLaboratory',
  'remoteAuditTechnology',
  'interpreter',
] as const;
export const REDUCTION_FACTORS = [
  'systemMaturity',
  'priorCertification',
  'transferPreparedness',
  'automation',
] as const;
export type IncreaseFactor = (typeof INCREASE_FACTORS)[number];
export type ReductionFactor = (typeof REDUCTION_FACTORS)[number];

const REDUCTION_EACH_CAP = 10;
const REDUCTION_TOTAL_CAP = 20;
/** Effective FTE from which the source's band tables overlap. */
export const AMBIGUOUS_FTE_FROM = 1000;

/** Basic time TD and per-additional-HACCP-study time TH, in quarter days. */
const SUBCATEGORY_TIMES: Record<
  FoodChainSubcategory,
  { td: number; th: number }
> = {
  AI: { td: 4, th: 1 },
  AII: { td: 4, th: 1 },
  BI: { td: 4, th: 1 },
  BII: { td: 4, th: 1 },
  BIII: { td: 4, th: 1 },
  C0: { td: 8, th: 2 },
  CI: { td: 8, th: 2 },
  CII: { td: 8, th: 2 },
  CIII: { td: 8, th: 2 },
  CIV: { td: 8, th: 2 },
  D: { td: 4, th: 2 },
  E: { td: 6, th: 2 },
  FI: { td: 4, th: 2 },
  FII: { td: 4, th: 2 },
  G: { td: 6, th: 1 },
  H: { td: 6, th: 1 },
  I: { td: 6, th: 2 },
  J: { td: 6, th: 2 },
  K: { td: 8, th: 2 },
};

/** FTE time TFTE in quarter days, by inclusive upper bound of whole FTE. */
const FTE_BANDS: readonly { upTo: number; tfte: number }[] = [
  { upTo: 5, tfte: 0 },
  { upTo: 49, tfte: 2 },
  { upTo: 99, tfte: 4 },
  { upTo: 199, tfte: 6 },
  { upTo: 499, tfte: 8 },
  { upTo: 999, tfte: 10 },
];

export interface DurationInputs {
  subcategories: readonly FoodChainSubcategory[];
  primary: FoodChainSubcategory;
  /** HACCP studies per subcategory; the first study of the primary is in TD. */
  haccpStudies: Readonly<Partial<Record<FoodChainSubcategory, number>>>;
  effectiveFte: number;
  increases: Readonly<Partial<Record<IncreaseFactor, number>>>;
  reductions: Readonly<Partial<Record<ReductionFactor, number>>>;
}

export type DurationRefusal =
  | 'PRIMARY_NOT_SELECTED'
  | 'PRIMARY_NOT_HIGHEST_BASIC_TIME'
  | 'HACCP_STUDIES_MISMATCH'
  | 'REDUCTION_FACTOR_CAP'
  | 'REDUCTION_TOTAL_CAP';

export type DurationWarning =
  | 'SURVEILLANCE_BELOW_ONE_DAY'
  | 'RECERTIFICATION_BELOW_ONE_DAY'
  | 'STAGE2_BELOW_ONE_DAY';

/** Exact decimal amounts of auditor-days, as strings without trailing zeros. */
export interface DurationProposal {
  ruleVersion: typeof DURATION_RULE_VERSION;
  basicTime: string;
  haccpTime: string;
  fteTime: string;
  baseDays: string;
  netAdjustmentPercent: number;
  initialOnSite: string;
  initialTotal: string;
  stage1OnSite: string;
  stage2OnSite: string;
  surveillanceOnSite: string;
  surveillanceTotal: string;
  recertificationOnSite: string;
  recertificationTotal: string;
  warnings: DurationWarning[];
}

export type DurationResult =
  | { kind: 'proposal'; proposal: DurationProposal }
  | { kind: 'manual'; reason: 'FTE_BAND_AMBIGUOUS' }
  | { kind: 'refused'; refusals: DurationRefusal[] };

// Amounts are integers in units of 1e-8 day: every intermediate value of the
// method (quarter days × whole percents × 0.333 or 0.666 × 1.2) is exact there.
const UNIT = 100_000_000;
const QUARTER = UNIT / 4;

/** Computes the proposal, or says why none can be computed. */
export function proposeDuration(input: DurationInputs): DurationResult {
  const refusals: DurationRefusal[] = [];
  const primaryTimes = SUBCATEGORY_TIMES[input.primary];
  if (!input.subcategories.includes(input.primary))
    refusals.push('PRIMARY_NOT_SELECTED');
  else if (
    input.subcategories.some(
      (code) => SUBCATEGORY_TIMES[code].td > primaryTimes.td,
    )
  )
    refusals.push('PRIMARY_NOT_HIGHEST_BASIC_TIME');
  if (
    Object.keys(input.haccpStudies).some(
      (code) => !input.subcategories.some((selected) => selected === code),
    ) ||
    (input.haccpStudies[input.primary] ?? 0) < 1
  )
    refusals.push('HACCP_STUDIES_MISMATCH');
  const reductions = REDUCTION_FACTORS.map(
    (factor) => input.reductions[factor] ?? 0,
  );
  if (reductions.some((percent) => percent > REDUCTION_EACH_CAP))
    refusals.push('REDUCTION_FACTOR_CAP');
  if (sum(reductions) > REDUCTION_TOTAL_CAP)
    refusals.push('REDUCTION_TOTAL_CAP');
  if (refusals.length) return { kind: 'refused', refusals };

  const wholeFte = Math.ceil(input.effectiveFte);
  const band = FTE_BANDS.find((entry) => wholeFte <= entry.upTo);
  if (wholeFte >= AMBIGUOUS_FTE_FROM || !band)
    return { kind: 'manual', reason: 'FTE_BAND_AMBIGUOUS' };

  const td = primaryTimes.td;
  const th = sum(
    input.subcategories.map((code) => {
      const studies = input.haccpStudies[code] ?? 0;
      const additional = code === input.primary ? studies - 1 : studies;
      return SUBCATEGORY_TIMES[code].th * additional;
    }),
  );
  const baseQuarters = td + th + band.tfte;
  const net =
    sum(INCREASE_FACTORS.map((factor) => input.increases[factor] ?? 0)) -
    sum(reductions);
  // quarters × (100 + net) / 100 days, expressed in units.
  const initialOnSite = (baseQuarters * (100 + net) * QUARTER) / 100;
  const surveillanceOnSite = (initialOnSite * 333) / 1000;
  const recertificationOnSite = (initialOnSite * 666) / 1000;
  const stage1 = Math.ceil(initialOnSite / 3 / QUARTER) * QUARTER;
  const stage2 = initialOnSite - stage1;
  const warnings: DurationWarning[] = [];
  if (surveillanceOnSite < UNIT) warnings.push('SURVEILLANCE_BELOW_ONE_DAY');
  if (recertificationOnSite < UNIT)
    warnings.push('RECERTIFICATION_BELOW_ONE_DAY');
  if (stage2 < UNIT) warnings.push('STAGE2_BELOW_ONE_DAY');
  return {
    kind: 'proposal',
    proposal: {
      ruleVersion: DURATION_RULE_VERSION,
      basicTime: days(td * QUARTER),
      haccpTime: days(th * QUARTER),
      fteTime: days(band.tfte * QUARTER),
      baseDays: days(baseQuarters * QUARTER),
      netAdjustmentPercent: net,
      initialOnSite: days(initialOnSite),
      initialTotal: days((initialOnSite * 6) / 5),
      stage1OnSite: days(stage1),
      stage2OnSite: days(stage2),
      surveillanceOnSite: days(surveillanceOnSite),
      surveillanceTotal: days((surveillanceOnSite * 6) / 5),
      recertificationOnSite: days(recertificationOnSite),
      recertificationTotal: days((recertificationOnSite * 6) / 5),
      warnings,
    },
  };
}

/** Rounds an exact amount half up to two decimals, as the calculator displays it. */
export function roundToHundredths(amount: string): string {
  const units = unitsOf(amount);
  const hundredth = UNIT / 100;
  return days(Math.floor((units + hundredth / 2) / hundredth) * hundredth);
}

function unitsOf(amount: string): number {
  const match = /^(\d+)(?:\.(\d{1,8}))?$/u.exec(amount);
  if (!match) throw new Error(`Invalid duration amount ${amount}`);
  const [, whole = '0', fraction = ''] = match;
  return Number(whole) * UNIT + Number(fraction.padEnd(8, '0'));
}

function days(units: number): string {
  if (!Number.isSafeInteger(units) || units < 0)
    throw new Error(`Inexact duration amount ${String(units)}`);
  const whole = Math.floor(units / UNIT);
  const fraction = String(units % UNIT)
    .padStart(8, '0')
    .replace(/0+$/u, '');
  return fraction ? `${String(whole)}.${fraction}` : String(whole);
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
