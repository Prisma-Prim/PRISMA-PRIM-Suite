export interface KnowledgeSourceSummary {
  sourceId: string;
  documentId: string;
  documentVersionId: string;
  sourceSha256: string;
  projectionSha256: string;
  title: string;
  language: 'ro' | 'ru' | 'en';
  versionStatus: 'official' | 'superseded';
}
export interface KnowledgeSourcePage {
  items: KnowledgeSourceSummary[];
  nextCursor: string | null;
}
export interface KnowledgePassage {
  source: KnowledgeSourceSummary;
  locator: string;
  text: string;
  passageSha256: string;
  retrievedAt: string;
}
export interface KnowledgeSearchPage {
  items: KnowledgePassage[];
  nextCursor: string | null;
}
export interface KnowledgeReceipt {
  sourceId: string;
  revision: number;
  state: 'draft' | 'admitted' | 'revoked';
  sourceSha256: string;
  projectionSha256: string;
}
