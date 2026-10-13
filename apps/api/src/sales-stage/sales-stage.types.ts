import type { SalesStageState } from './sales-stage.definition.js';

/** One stage of a Company's ordered list; the label is shown as entered. */
export interface SalesStageView {
  readonly id: string;
  readonly label: string;
  readonly position: number;
  readonly state: SalesStageState;
}

/**
 * The Company's stages in order with the configuration revision, which is 0
 * and the list empty before any operation (section 24.2).
 */
export interface SalesStageList {
  readonly revision: number;
  readonly stages: readonly SalesStageView[];
}

/** The observed configuration revision and the label exactly as submitted. */
export interface CreateSalesStageCommand {
  readonly expectedRevision: number;
  readonly label: string;
}

// The receipt confirms what one command did; `configuration` is the current
// list, refreshed separately from the receipt.
export interface SalesStageCreateResult {
  readonly receipt: {
    readonly operation: 'CREATED';
    readonly salesStageId: string;
    readonly label: string;
    readonly position: number;
    readonly revision: number;
  };
  readonly configuration: SalesStageList;
}

/** An `ACTIVE` stage an Opportunity of its Company may be assigned. */
export interface AssignableSalesStage {
  readonly id: string;
  readonly label: string;
}
