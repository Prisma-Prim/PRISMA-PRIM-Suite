import { BadRequestException } from '@nestjs/common';
import {
  DURATION_RULE_VERSION,
  INCREASE_FACTORS,
  REDUCTION_FACTORS,
  type DurationProposal,
  type DurationWarning,
} from './certification-duration.js';
import {
  FOOD_CHAIN_SUBCATEGORIES,
  type ConfirmedDuration,
  type DurationDetermination,
  type DurationFactorInputs,
  type FoodChainSubcategory,
} from './certification.types.js';
import { inputObject } from './certification.validation.js';

const WARNINGS: readonly DurationWarning[] = [
  'SURVEILLANCE_BELOW_ONE_DAY',
  'RECERTIFICATION_BELOW_ONE_DAY',
  'STAGE2_BELOW_ONE_DAY',
];
const CONFIRMED_FIELDS = [
  'initialOnSite',
  'stage1OnSite',
  'stage2OnSite',
  'surveillanceOnSite',
  'recertificationOnSite',
] as const;
const PROPOSAL_AMOUNTS = [
  'basicTime',
  'haccpTime',
  'fteTime',
  'baseDays',
  'initialOnSite',
  'initialTotal',
  'stage1OnSite',
  'stage2OnSite',
  'surveillanceOnSite',
  'surveillanceTotal',
  'recertificationOnSite',
  'recertificationTotal',
] as const;

export function durationFactorInputs(value: unknown): DurationFactorInputs {
  const body = inputObject(value, [
    'primary',
    'haccpStudies',
    'increases',
    'reductions',
  ]);
  const studiesBody = inputObject(body.haccpStudies, FOOD_CHAIN_SUBCATEGORIES);
  const haccpStudies: Partial<Record<FoodChainSubcategory, number>> = {};
  for (const code of FOOD_CHAIN_SUBCATEGORIES)
    if (studiesBody[code] !== undefined) {
      // Zero studies is the same input as none, so it is not kept.
      const studies = integer(studiesBody[code], 0, 999);
      if (studies > 0) haccpStudies[code] = studies;
    }
  return {
    primary: subcategory(body.primary),
    haccpStudies,
    increases: percents(body.increases, INCREASE_FACTORS, 100),
    reductions: percents(body.reductions, REDUCTION_FACTORS, 100),
  };
}

export function durationCommand(value: unknown): {
  expectedRevision: number;
  reason: string | null;
  inputs: DurationFactorInputs;
  confirmed: ConfirmedDuration;
  justification: string | null;
} {
  const body = inputObject(value, [
    'expectedRevision',
    'reason',
    'inputs',
    'confirmed',
    'justification',
  ]);
  return {
    expectedRevision: integer(body.expectedRevision, 1, 2147483646),
    reason: optionalText(body.reason, 2000),
    inputs: durationFactorInputs(body.inputs),
    confirmed: confirmedDuration(body.confirmed),
    justification: optionalText(body.justification, 4000),
  };
}

/** Confirmed amounts: positive hundredths of a day, Stage 1 + Stage 2 = initial. */
export function confirmedDuration(value: unknown): ConfirmedDuration {
  const body = inputObject(value, CONFIRMED_FIELDS);
  const confirmed: ConfirmedDuration = {
    initialOnSite: hundredths(body.initialOnSite),
    stage1OnSite: hundredths(body.stage1OnSite),
    stage2OnSite: hundredths(body.stage2OnSite),
    surveillanceOnSite: hundredths(body.surveillanceOnSite),
    recertificationOnSite: hundredths(body.recertificationOnSite),
  };
  if (
    cents(confirmed.stage1OnSite) + cents(confirmed.stage2OnSite) !==
    cents(confirmed.initialOnSite)
  )
    throw new BadRequestException({
      code: 'CERTIFICATION_DURATION_STAGES_MISMATCH',
      message:
        'Stage 1 and Stage 2 on-site days must add up to the initial on-site days.',
    });
  return confirmed;
}

/** Decodes a stored determination; any mismatch is corruption, not input. */
export function durationDetermination(value: unknown): DurationDetermination {
  const body = inputObject(value, [
    'ruleVersion',
    'inputs',
    'computation',
    'confirmed',
    'justification',
  ]);
  if (body.ruleVersion !== DURATION_RULE_VERSION) invalid();
  const inputsBody = inputObject(body.inputs, [
    'primary',
    'haccpStudies',
    'increases',
    'reductions',
    'subcategories',
    'effectiveFte',
  ]);
  const { subcategories, effectiveFte, ...factors } = inputsBody;
  if (!Array.isArray(subcategories)) return invalid();
  if (typeof effectiveFte !== 'number' || !Number.isFinite(effectiveFte))
    return invalid();
  const computationBody = inputObject(body.computation, [
    'kind',
    'proposal',
    'reason',
  ]);
  let computation: DurationDetermination['computation'];
  if (computationBody.kind === 'manual') {
    if (computationBody.reason !== 'FTE_BAND_AMBIGUOUS') return invalid();
    computation = { kind: 'manual', reason: 'FTE_BAND_AMBIGUOUS' };
  } else if (computationBody.kind === 'proposal')
    computation = {
      kind: 'proposal',
      proposal: proposal(computationBody.proposal),
    };
  else return invalid();
  return {
    ruleVersion: DURATION_RULE_VERSION,
    inputs: {
      ...durationFactorInputs(factors),
      subcategories: subcategories.map(subcategory),
      effectiveFte,
    },
    computation,
    confirmed: confirmedDuration(body.confirmed),
    justification: optionalText(body.justification, 4000),
  };
}

function proposal(value: unknown): DurationProposal {
  const body = inputObject(value, [
    'ruleVersion',
    ...PROPOSAL_AMOUNTS,
    'netAdjustmentPercent',
    'warnings',
  ]);
  if (body.ruleVersion !== DURATION_RULE_VERSION) return invalid();
  const amounts = Object.fromEntries(
    PROPOSAL_AMOUNTS.map((field) => [field, amount(body[field])]),
  );
  if (!Array.isArray(body.warnings)) return invalid();
  return {
    ruleVersion: DURATION_RULE_VERSION,
    basicTime: field(amounts, 'basicTime'),
    haccpTime: field(amounts, 'haccpTime'),
    fteTime: field(amounts, 'fteTime'),
    baseDays: field(amounts, 'baseDays'),
    netAdjustmentPercent: integer(body.netAdjustmentPercent, -100, 1000),
    initialOnSite: field(amounts, 'initialOnSite'),
    initialTotal: field(amounts, 'initialTotal'),
    stage1OnSite: field(amounts, 'stage1OnSite'),
    stage2OnSite: field(amounts, 'stage2OnSite'),
    surveillanceOnSite: field(amounts, 'surveillanceOnSite'),
    surveillanceTotal: field(amounts, 'surveillanceTotal'),
    recertificationOnSite: field(amounts, 'recertificationOnSite'),
    recertificationTotal: field(amounts, 'recertificationTotal'),
    warnings: body.warnings.map(warning),
  };
}

function field(values: Record<string, string>, name: string): string {
  const value = values[name];
  if (value === undefined) return invalid();
  return value;
}

function warning(value: unknown): DurationWarning {
  const match = WARNINGS.find((entry) => entry === value);
  if (!match) return invalid();
  return match;
}

function percents<T extends string>(
  value: unknown,
  factors: readonly T[],
  maximum: number,
): Partial<Record<T, number>> {
  const body = inputObject(value, factors);
  const result: Partial<Record<T, number>> = {};
  for (const factor of factors)
    if (body[factor] !== undefined) {
      // A zero factor is the same input as an omitted one, so it is not kept.
      const percent = integer(body[factor], 0, maximum);
      if (percent > 0) result[factor] = percent;
    }
  return result;
}

function subcategory(value: unknown): FoodChainSubcategory {
  const match = FOOD_CHAIN_SUBCATEGORIES.find((code) => code === value);
  if (!match) return invalid();
  return match;
}

/**
 * A positive amount of days with at most two decimals, e.g. "2.25", kept in
 * one spelling ("2.50" and "2.5" are the same amount) so equal values compare
 * equal.
 */
function hundredths(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^(0|[1-9]\d{0,2})(\.\d{1,2})?$/u.test(value) ||
    cents(value) <= 0
  )
    return invalid();
  const [whole = '0', fraction = ''] = value.split('.');
  const significant = fraction.replace(/0+$/u, '');
  return significant ? `${whole}.${significant}` : whole;
}

function amount(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{1,4}(\.\d{1,8})?$/u.test(value))
    return invalid();
  return value;
}

/** Whole hundredths of a day of a validated amount. */
export function cents(value: string): number {
  const [whole = '0', fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0').slice(0, 2));
}

function integer(value: unknown, minimum: number, maximum: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  )
    return invalid();
  return value;
}

function optionalText(value: unknown, limit: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !value.trim() || value.length > limit)
    return invalid();
  return value;
}

function invalid(): never {
  throw new BadRequestException({
    code: 'INVALID_CERTIFICATION_INPUT',
    message: 'Invalid certification input.',
  });
}
