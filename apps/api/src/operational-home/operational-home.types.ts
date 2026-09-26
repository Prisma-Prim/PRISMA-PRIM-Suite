import type { TaskAttention } from '../task/task.types.js';

/** The Company summaries of Operational Dashboard PRD §17.2, in their fixed order. */
export const COMPANY_SUMMARY_KINDS = [
  'active_clients',
  'open_projects',
  'overdue_tasks',
] as const;
export type CompanySummaryKind = (typeof COMPANY_SUMMARY_KINDS)[number];

export interface CompanySummary {
  kind: CompanySummaryKind;
  count: number;
}

/**
 * The active-Company operational home: one sampled `today` and at most one
 * summary per kind the reader may read, in the fixed kind order.
 */
export interface OperationalHomeView {
  companyId: string;
  today: string;
  summaries: CompanySummary[];
  attention?: TaskAttention;
}
