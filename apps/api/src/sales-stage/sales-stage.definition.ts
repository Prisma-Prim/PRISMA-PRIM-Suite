// The Sales Stage definition of Commercial Workflow PRD section 24.1. Only
// Create exists so far, so every stage is ACTIVE; Retire adds RETIRED.
export const SALES_STAGE_STATES = ['ACTIVE'] as const;
export type SalesStageState = (typeof SALES_STAGE_STATES)[number];

/** A label is 1–80 characters with at least one non-whitespace character. */
export const SALES_STAGE_LABEL_MAXIMUM_LENGTH = 80;

/** A Company holds at most 30 stages, at positions 1 to 30. */
export const SALES_STAGE_LIMIT = 30;
