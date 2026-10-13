// The Sales Stage definition of Commercial Workflow PRD section 24.1. Only
// Create exists so far, so every stage is ACTIVE; Retire adds RETIRED.
export const SALES_STAGE_STATES = ['ACTIVE'] as const;
export type SalesStageState = (typeof SALES_STAGE_STATES)[number];

/** A label is 1–80 characters with at least one non-whitespace character. */
export const SALES_STAGE_LABEL_MAXIMUM_LENGTH = 80;

/**
 * The section 24.1 label rule. Characters are Unicode code points, as the
 * `length(label)` CHECK counts them, so an astral character such as an emoji
 * counts once, not as two UTF-16 units.
 */
export function isSalesStageLabel(value: string): boolean {
  return (
    value.trim().length > 0 &&
    [...value].length <= SALES_STAGE_LABEL_MAXIMUM_LENGTH
  );
}

/** A Company holds at most 30 stages, at positions 1 to 30. */
export const SALES_STAGE_LIMIT = 30;
