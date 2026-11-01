import type { OpportunityOutcomeStatus } from '../commercial-intake/opportunity-outcome.js';

export const FOLLOW_UP_FORMAT = 'opportunity-follow-up.v1';
export interface FollowUpActor {
  workspaceMembershipId: string;
  displayLabel: string;
}
export interface RecordedFollowUp {
  state: 'RECORDED';
  revision: number;
  followUpOn: string | null;
  confirmedEpoch: string;
  recordedBy: FollowUpActor;
  recordedAt: string;
}
export type FollowUpHead =
  { state: 'UNRECORDED'; revision: 0 } | RecordedFollowUp;
export interface FollowUpReceipt {
  format: typeof FOLLOW_UP_FORMAT;
  opportunityId: string;
  outcome: 'updated' | 'unchanged';
  fact: RecordedFollowUp;
}
export interface FollowUpHistoryEntry {
  format: typeof FOLLOW_UP_FORMAT;
  opportunityId: string;
  revision: number;
  before: FollowUpHead;
  after: RecordedFollowUp;
  reason: string | null;
  commandId: string;
  actor: FollowUpActor;
  occurredAt: string;
}
export interface FollowUpHistoryPage {
  format: typeof FOLLOW_UP_FORMAT;
  opportunityId: string;
  headRevision: number;
  entries: FollowUpHistoryEntry[];
  nextCursor: string | null;
}
export interface FollowUpCurrent {
  format: typeof FOLLOW_UP_FORMAT;
  opportunityId: string;
  requestId: string;
  status: OpportunityOutcomeStatus;
  opportunityVersion: number;
  outcomeEpoch: string;
  head: FollowUpHead;
  history: FollowUpHistoryPage;
}
export interface FollowUpDiscoveryItem {
  opportunityId: string;
  requestId: string;
  title: string;
  followUpOn: string;
  recordedBy: FollowUpActor;
  recordedAt: string;
  clientDisplayName?: string;
  clientDossierId?: string;
}
export interface FollowUpDiscovery {
  format: typeof FOLLOW_UP_FORMAT;
  through: string;
  items: FollowUpDiscoveryItem[];
  nextCursor: string | null;
}
export interface FollowUpScope {
  workspaceId: string;
  companyId: string;
  opportunityId: string;
}
