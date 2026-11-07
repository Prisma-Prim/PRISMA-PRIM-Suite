import type { ActAttribution } from './certification-attribution';
import type { FoodChainSubcategory } from './certification-response';

/**
 * The server's audit-duration contract: it proposes auditor-days from the
 * accepted application and the stated factors; a programme manager confirms
 * them or adjusts them with a justification. The server stays authoritative;
 * this module only reads its amounts exactly and mirrors its guards.
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

export const DURATION_WARNINGS = [
  'SURVEILLANCE_BELOW_ONE_DAY',
  'RECERTIFICATION_BELOW_ONE_DAY',
  'STAGE2_BELOW_ONE_DAY',
] as const;
export type DurationWarning = (typeof DURATION_WARNINGS)[number];

export const DURATION_REFUSALS = [
  'PRIMARY_NOT_SELECTED',
  'PRIMARY_NOT_HIGHEST_BASIC_TIME',
  'HACCP_STUDIES_MISMATCH',
  'REDUCTION_FACTOR_CAP',
  'REDUCTION_TOTAL_CAP',
] as const;
export type DurationRefusal = (typeof DURATION_REFUSALS)[number];

/** The auditor-days a programme manager confirms, in the server's order. */
export const CONFIRMED_DURATION_FIELDS = [
  'initialOnSite',
  'stage1OnSite',
  'stage2OnSite',
  'surveillanceOnSite',
  'recertificationOnSite',
] as const;
export type ConfirmedDurationField = (typeof CONFIRMED_DURATION_FIELDS)[number];

/** Confirmed auditor-days, as decimal strings with at most two decimals. */
export type ConfirmedDuration = Record<ConfirmedDurationField, string>;

/** Exact decimal amounts of auditor-days, as strings, e.g. "1.64835". */
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

/** What a confirmation rests on: a computed proposal or a manual determination. */
export type DurationComputation =
  | { kind: 'proposal'; proposal: DurationProposal }
  | { kind: 'manual'; reason: 'FTE_BAND_AMBIGUOUS' };

export type DurationResult =
  DurationComputation | { kind: 'refused'; refusals: DurationRefusal[] };

/** Factors as sent: absent keys count as zero. */
export interface DurationFactorInputs {
  primary: FoodChainSubcategory;
  haccpStudies: Partial<Record<FoodChainSubcategory, number>>;
  increases: Partial<Record<IncreaseFactor, number>>;
  reductions: Partial<Record<ReductionFactor, number>>;
}

export interface DurationDetermination {
  ruleVersion: typeof DURATION_RULE_VERSION;
  inputs: DurationFactorInputs & {
    subcategories: FoodChainSubcategory[];
    effectiveFte: number;
  };
  computation: DurationComputation;
  confirmed: ConfirmedDuration;
  justification: string | null;
  /** The certification body's approval, when recorded on its behalf. */
  onBehalf: ActAttribution | null;
}

// Amounts are integers in units of 1e-8 day, as the server computes them.
const UNIT = 100_000_000;
const HUNDREDTH = UNIT / 100;
const EXACT_AMOUNT = /^(\d{1,4})(?:\.(\d{1,8}))?$/u;
const CONFIRMED_AMOUNT = /^(0|[1-9]\d{0,2})(?:\.(\d{1,2}))?$/u;

/** An exact proposal amount in units of 1e-8 day, or undefined when malformed. */
export function exactUnits(amount: string): number | undefined {
  const match = EXACT_AMOUNT.exec(amount);
  if (!match) return undefined;
  const [, whole = '0', fraction = ''] = match;
  return Number(whole) * UNIT + Number(fraction.padEnd(8, '0'));
}

/**
 * Whole hundredths of a confirmable amount: positive, below 1,000 days, with
 * at most two decimals, as the server accepts; undefined otherwise.
 */
export function confirmedCents(amount: string): number | undefined {
  const match = CONFIRMED_AMOUNT.exec(amount);
  if (!match) return undefined;
  const [, whole = '0', fraction = ''] = match;
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return cents > 0 ? cents : undefined;
}

/** A proposal amount rounded half up to hundredths, in whole hundredths. */
function proposedCents(amount: string): number | undefined {
  const units = exactUnits(amount);
  return units === undefined
    ? undefined
    : Math.floor((units + HUNDREDTH / 2) / HUNDREDTH);
}

/** Rounds half up to two decimals, as the calculator displays it: "0.999" → "1". */
export function roundToHundredths(amount: string): string | undefined {
  const cents = proposedCents(amount);
  if (cents === undefined) return undefined;
  const whole = Math.floor(cents / 100);
  const fraction = String(cents % 100)
    .padStart(2, '0')
    .replace(/0+$/u, '');
  return fraction ? `${String(whole)}.${fraction}` : String(whole);
}

/** Stage 1 and Stage 2 on site add up exactly to the initial audit on site. */
export function confirmedStagesAddUp(confirmed: ConfirmedDuration): boolean {
  const initial = confirmedCents(confirmed.initialOnSite);
  const stage1 = confirmedCents(confirmed.stage1OnSite);
  const stage2 = confirmedCents(confirmed.stage2OnSite);
  return (
    initial !== undefined &&
    stage1 !== undefined &&
    stage2 !== undefined &&
    stage1 + stage2 === initial
  );
}

/** The proposal's own Stage 1 and Stage 2 add up exactly to its initial audit. */
export function proposedStagesAddUp(proposal: DurationProposal): boolean {
  const initial = exactUnits(proposal.initialOnSite);
  const stage1 = exactUnits(proposal.stage1OnSite);
  const stage2 = exactUnits(proposal.stage2OnSite);
  return (
    initial !== undefined &&
    stage1 !== undefined &&
    stage2 !== undefined &&
    stage1 + stage2 === initial
  );
}

/** The proposal's on-site amounts rounded half up, as a confirmation starts. */
export function proposedConfirmation(
  proposal: DurationProposal,
): Record<ConfirmedDurationField, string> {
  const rounded = (field: ConfirmedDurationField) =>
    roundToHundredths(proposal[field]) ?? '';
  return {
    initialOnSite: rounded('initialOnSite'),
    stage1OnSite: rounded('stage1OnSite'),
    stage2OnSite: rounded('stage2OnSite'),
    surveillanceOnSite: rounded('surveillanceOnSite'),
    recertificationOnSite: rounded('recertificationOnSite'),
  };
}

/**
 * The server's rule: adjustment factors, a manual determination or any
 * confirmed value other than the proposal rounded half up need a written
 * justification. An unreadable confirmed value counts as a difference.
 */
export function durationJustificationRequired({
  increases,
  reductions,
  computation,
  confirmed,
}: {
  increases: Partial<Record<IncreaseFactor, number>>;
  reductions: Partial<Record<ReductionFactor, number>>;
  computation: DurationComputation;
  confirmed: Record<ConfirmedDurationField, string>;
}): boolean {
  const factors = [...Object.values(increases), ...Object.values(reductions)];
  if (factors.some((percent) => (percent ?? 0) > 0)) return true;
  if (computation.kind === 'manual') return true;
  const { proposal } = computation;
  return CONFIRMED_DURATION_FIELDS.some((field) => {
    const value = confirmedCents(confirmed[field]);
    return value === undefined || value !== proposedCents(proposal[field]);
  });
}
