import type { ReactNode } from 'react';

/**
 * One authorized section of App's composition. Both interfaces receive the
 * same list: the current shell shows `content`, and the Clarté frame shows
 * what its tab renderer returns for the section.
 */
export interface ApplicationSection {
  id:
    | 'payments'
    | 'invoice-records'
    | 'knowledge-evidence'
    | 'internal-tasks'
    | 'ideas'
    | 'operational-risks'
    | 'documents'
    | 'requests'
    | 'catalogue'
    | 'pricing'
    | 'offer-models'
    | 'contract-models'
    | 'projects'
    | 'my-tasks'
    | 'unassigned-tasks'
    | 'blocked-tasks'
    | 'team-tasks'
    | 'clients'
    | 'access'
    | 'companies'
    | 'activity'
    | 'invitations';
  label: string;
  description: string;
  content: ReactNode;
  /**
   * The Clarté screen of this section, composed by App with the same gates,
   * keys and callbacks as `content`. Only the Clarté frame reads it, through
   * the tab renderer of `src/clarte/clarte-entries.ts`.
   */
  clarteContent?: ReactNode;
  /** A fresh read-only view retires requests and rows on section navigation. */
  mountWhenSelected?: true;
  /** Retain the scoped owner after deliberate entry; it owns fresh-return reads. */
  retainAfterSelection?: true;
}

/**
 * These sections render their own focusable destination; the layout wrapper
 * generates no box, so it cannot receive navigation focus.
 */
export const sectionsOwningFocusTarget: ReadonlySet<ApplicationSection['id']> =
  new Set([
    'payments',
    'invoice-records',
    'knowledge-evidence',
    'internal-tasks',
    'ideas',
    'operational-risks',
    'clients',
    'documents',
    'projects',
    'requests',
    'my-tasks',
    'unassigned-tasks',
    'blocked-tasks',
    'team-tasks',
    'activity',
  ]);
