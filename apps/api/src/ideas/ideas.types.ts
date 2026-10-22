export interface IdeaAttribution {
  workspaceMembershipId: string;
  internalUserId: string;
  displayName: string;
}
export interface IdeaRecord {
  id: string;
  companyId: string;
  description: string;
  origin: string;
  revision: number;
  disposition: 'new' | 'deferred' | 'rejected';
  submittedBy: IdeaAttribution;
  submittedAt: string;
}
export type IdeaDisposition = {
  id: string;
  ideaId: string;
  precedingRevision: number;
  revision: number;
  reason: string;
  recordedBy: IdeaAttribution;
  recordedAt: string;
} & (
  | { kind: 'deferred'; reconsiderationDate: string | null }
  | { kind: 'rejected'; reconsiderationDate: null }
);
export interface IdeaDispositionResult {
  idea: IdeaRecord;
  entry: IdeaDisposition;
}
export interface IdeaPage {
  companyId: string;
  ideas: IdeaRecord[];
  total: number;
  nextCursor: string | null;
}
export interface IdeaHistory {
  ideaId: string;
  entries: IdeaDisposition[];
  total: number;
  nextCursor: string | null;
}
