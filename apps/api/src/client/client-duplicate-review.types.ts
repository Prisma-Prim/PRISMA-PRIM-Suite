import type { ClientDossierView } from './client.types.js';
import type { NormalizedDossierFields } from './client-dossier-validation.js';

export const POSSIBLE_DUPLICATE_REVIEW_REQUIRED =
  'possible_duplicate_review_required' as const;

export interface ClientDuplicateReviewListItem {
  duplicate_review_reference: string;
}

export interface ClientDuplicateReviewPage {
  items: ClientDuplicateReviewListItem[];
  next_cursor: string | null;
}

export interface ClientDuplicateReviewPageRequest {
  pageSize: number;
  cursor: string | undefined;
}

export type ClientDuplicateReviewDetail =
  | {
      outcome: 'comparison';
      duplicate_review_reference: string;
      proposal: {
        kind: 'registration' | 'correction';
        fields: NormalizedDossierFields;
      };
      candidate: ClientDossierView;
    }
  | {
      outcome: 'multiple_duplicate_candidates_require_data_remediation';
      duplicate_review_reference: string;
    };

export type ClientMutationOutcome<T> =
  | { kind: 'completed'; value: T }
  | { kind: 'duplicate-review-required'; reference: string };
