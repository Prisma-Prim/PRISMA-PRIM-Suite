import {
  CONFIRMED_DURATION_FIELDS,
  INCREASE_FACTORS,
  REDUCTION_FACTORS,
  confirmedCents,
  confirmedStagesAddUp,
  durationJustificationRequired,
  type ConfirmedDuration,
  type ConfirmedDurationField,
  type DurationComputation,
  type DurationDetermination,
  type DurationFactorInputs,
  type IncreaseFactor,
  type ReductionFactor,
} from './certification-duration';
import {
  CERTIFICATION_LIMITS,
  FOOD_CHAIN_SUBCATEGORIES,
  type ApplicationFacts,
  type FoodChainSubcategory,
} from './certification-response';

/** The editable duration determination, kept as typed text until it is sent. */
export interface DurationDraft {
  /** No default: the programme manager chooses the primary subcategory. */
  primary: FoodChainSubcategory | null;
  /** One entry per application subcategory, in the application's order. */
  haccpStudies: { code: FoodChainSubcategory; count: string }[];
  /** Typed percentages; an absent factor reads as zero, as the server does. */
  increases: Partial<Record<IncreaseFactor, string>>;
  reductions: Partial<Record<ReductionFactor, string>>;
  confirmed: Record<ConfirmedDurationField, string>;
  justification: string;
  reason: string;
}

/**
 * A first determination starts from the accepted application: a single
 * subcategory carries every declared HACCP study, several are distributed by
 * the programme manager, and every factor starts at zero. A correction starts
 * from the current determination's exact values.
 */
export function durationDraftFor({
  facts,
  current,
}: {
  facts: ApplicationFacts;
  current: DurationDetermination | null;
}): DurationDraft {
  const [only, ...others] = facts.foodChainSubcategories;
  const single = only !== undefined && others.length === 0;
  if (!current)
    return {
      primary: null,
      haccpStudies: facts.foodChainSubcategories.map((code) => ({
        code,
        count: single ? String(facts.haccpStudyCount) : '',
      })),
      increases: percentTexts(INCREASE_FACTORS, {}),
      reductions: percentTexts(REDUCTION_FACTORS, {}),
      confirmed: blankConfirmation(),
      justification: '',
      reason: '',
    };
  const { inputs } = current;
  return {
    primary: facts.foodChainSubcategories.includes(inputs.primary)
      ? inputs.primary
      : null,
    haccpStudies: facts.foodChainSubcategories.map((code) => ({
      code,
      count: String(inputs.haccpStudies[code] ?? 0),
    })),
    increases: percentTexts(INCREASE_FACTORS, inputs.increases),
    reductions: percentTexts(REDUCTION_FACTORS, inputs.reductions),
    confirmed: { ...current.confirmed },
    justification: current.justification ?? '',
    reason: '',
  };
}

export type DurationInputsCheck =
  | { status: 'valid'; inputs: DurationFactorInputs }
  | { status: 'incomplete' }
  | { status: 'studiesMismatch' };

/**
 * The factors the server would read: a chosen primary subcategory, whole
 * studies adding up to the application's count and whole percentages. Zero
 * entries are left out, as absent keys count as zero. The reduction caps and
 * the primary subcategory's basic time stay the server's refusals.
 */
export function durationInputsFromDraft(
  draft: DurationDraft,
  facts: ApplicationFacts,
): DurationInputsCheck {
  const counts = draft.haccpStudies.map((entry) => ({
    code: entry.code,
    count: wholeNumber(
      entry.count,
      CERTIFICATION_LIMITS.haccpStudiesPerSubcategory,
    ),
  }));
  const increases = percents(INCREASE_FACTORS, draft.increases);
  const reductions = percents(REDUCTION_FACTORS, draft.reductions);
  if (
    draft.primary === null ||
    !increases ||
    !reductions ||
    counts.some((entry) => entry.count === undefined)
  )
    return { status: 'incomplete' };
  const haccpStudies: Partial<Record<FoodChainSubcategory, number>> = {};
  // The reference order keeps equal inputs serialized equally.
  for (const code of FOOD_CHAIN_SUBCATEGORIES) {
    const count = counts.find((entry) => entry.code === code)?.count;
    if (count) haccpStudies[code] = count;
  }
  if (studiesTotal(draft) !== facts.haccpStudyCount)
    return { status: 'studiesMismatch' };
  return {
    status: 'valid',
    inputs: { primary: draft.primary, haccpStudies, increases, reductions },
  };
}

/** The sum of the readable study counts, shown beside the declared count. */
export function studiesTotal(draft: DurationDraft): number {
  return draft.haccpStudies.reduce(
    (total, entry) =>
      total +
      (wholeNumber(
        entry.count,
        CERTIFICATION_LIMITS.haccpStudiesPerSubcategory,
      ) ?? 0),
    0,
  );
}

export type ConfirmationCheck =
  | {
      status: 'valid';
      confirmed: ConfirmedDuration;
      justification: string | null;
      reason: string | null;
    }
  | { status: 'invalidValues' }
  | { status: 'stagesMismatch' }
  | { status: 'justificationRequired' }
  | { status: 'reasonRequired' };

/** Mirrors the server's checks of a confirmation, which stays authoritative. */
export function confirmationFromDraft(
  draft: DurationDraft,
  {
    inputs,
    computation,
    correcting,
  }: {
    inputs: DurationFactorInputs;
    computation: DurationComputation;
    correcting: boolean;
  },
): ConfirmationCheck {
  const confirmed = normalizedConfirmation(draft.confirmed);
  if (
    CONFIRMED_DURATION_FIELDS.some(
      (field) => confirmedCents(confirmed[field]) === undefined,
    )
  )
    return { status: 'invalidValues' };
  if (!confirmedStagesAddUp(confirmed)) return { status: 'stagesMismatch' };
  const justification = draft.justification.trim();
  if (
    justification.length > CERTIFICATION_LIMITS.justification ||
    (!justification &&
      durationJustificationRequired({ ...inputs, computation, confirmed }))
  )
    return { status: 'justificationRequired' };
  const reason = draft.reason.trim();
  if (correcting && (!reason || reason.length > CERTIFICATION_LIMITS.reason))
    return { status: 'reasonRequired' };
  return {
    status: 'valid',
    confirmed,
    justification: justification || null,
    reason: correcting ? reason : null,
  };
}

/** Whether the confirmation, as typed, needs a justification. */
export function draftNeedsJustification(
  draft: DurationDraft,
  computation: DurationComputation,
): boolean {
  return durationJustificationRequired({
    increases: percents(INCREASE_FACTORS, draft.increases) ?? {},
    reductions: percents(REDUCTION_FACTORS, draft.reductions) ?? {},
    computation,
    confirmed: normalizedConfirmation(draft.confirmed),
  });
}

/** Accepts a decimal point or comma, as typed in every supported locale. */
function normalizedConfirmation(
  values: Record<ConfirmedDurationField, string>,
): ConfirmedDuration {
  const normalized = (field: ConfirmedDurationField) =>
    values[field].trim().replace(',', '.');
  return {
    initialOnSite: normalized('initialOnSite'),
    stage1OnSite: normalized('stage1OnSite'),
    stage2OnSite: normalized('stage2OnSite'),
    surveillanceOnSite: normalized('surveillanceOnSite'),
    recertificationOnSite: normalized('recertificationOnSite'),
  };
}

function blankConfirmation(): Record<ConfirmedDurationField, string> {
  return {
    initialOnSite: '',
    stage1OnSite: '',
    stage2OnSite: '',
    surveillanceOnSite: '',
    recertificationOnSite: '',
  };
}

function percentTexts<Factor extends string>(
  factors: readonly Factor[],
  values: Partial<Record<Factor, number>>,
): Partial<Record<Factor, string>> {
  const texts: Partial<Record<Factor, string>> = {};
  for (const factor of factors) texts[factor] = String(values[factor] ?? 0);
  return texts;
}

/** The typed percentage of a factor; an untouched factor reads as zero. */
export function factorText<Factor extends string>(
  texts: Partial<Record<Factor, string>>,
  factor: Factor,
): string {
  return texts[factor] ?? '0';
}

/** Non-zero whole percentages by factor, or undefined when one is unreadable. */
function percents<Factor extends string>(
  factors: readonly Factor[],
  texts: Partial<Record<Factor, string>>,
): Partial<Record<Factor, number>> | undefined {
  const result: Partial<Record<Factor, number>> = {};
  for (const factor of factors) {
    const percent = wholeNumber(
      factorText(texts, factor),
      CERTIFICATION_LIMITS.factorPercent,
    );
    if (percent === undefined) return undefined;
    if (percent > 0) result[factor] = percent;
  }
  return result;
}

function wholeNumber(value: string, maximum: number): number | undefined {
  const trimmed = value.trim();
  if (!/^\d{1,3}$/u.test(trimmed)) return undefined;
  const number = Number(trimmed);
  return number <= maximum ? number : undefined;
}
