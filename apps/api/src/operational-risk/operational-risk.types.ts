export interface OperationalRiskFacts {
  process: string;
  cause: string;
  effect: string;
  plannedMeasure: string;
  existingMeasures: string | null;
  sourceDescription: string | null;
  plannedDate: string | null;
}

interface EntryAttribution {
  id: string;
  revision: number;
  actor: { workspaceMembershipId: string; displayName: string };
  recordedAt: string;
}

export type OperationalRiskIntake = EntryAttribution &
  (
    | {
        kind: 'intake-recorded';
        facts: OperationalRiskFacts;
        predecessorId: null;
        reason: null;
      }
    | {
        kind: 'intake-corrected';
        facts: OperationalRiskFacts;
        predecessorId: string;
        reason: string;
      }
  );

export type OperationalRiskJournalOriginal = EntryAttribution &
  ({ kind: 'observation' } | { kind: 'reassessment' }) & {
    narrative: string;
    occurredOn: string | null;
  };

export type OperationalRiskJournalCorrection = EntryAttribution & {
  kind: 'journal-corrected';
  originalEntryId: string;
  journalKind: 'observation' | 'reassessment';
  predecessorId: string;
  narrative: string;
  occurredOn: string | null;
  reason: string;
};

export type OperationalRiskEntry =
  | OperationalRiskIntake
  | OperationalRiskJournalOriginal
  | OperationalRiskJournalCorrection;

export interface OperationalRiskJournalStatement {
  riskId: string;
  companyId: string;
  revision: number;
  originalEntry: OperationalRiskJournalOriginal;
  currentEntry:
    OperationalRiskJournalOriginal | OperationalRiskJournalCorrection;
}

export interface OperationalRiskRecord {
  id: string;
  companyId: string;
  revision: number;
  assessment: 'not-assessed';
  responsibility: 'not-specified';
  createdAt: string;
  originalIntake: OperationalRiskIntake & { kind: 'intake-recorded' };
  currentIntake: OperationalRiskIntake;
}

export interface OperationalRiskResult {
  risk: OperationalRiskRecord;
  entry: OperationalRiskEntry;
}

export interface OperationalRiskSummary {
  id: string;
  companyId: string;
  revision: number;
  process: string;
  createdAt: string;
}

export interface OperationalRiskPage<Item> {
  items: Item[];
  next_cursor: string | null;
}
