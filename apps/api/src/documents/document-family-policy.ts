import type { workingDocuments } from '../database/schema/index.js';

export type DocumentType = (typeof workingDocuments.$inferSelect)['type'];

/**
 * Every decision that depends on a Document family, in one exhaustive table.
 * A new family fails type checking here until each decision is made, so no
 * family inherits a default by omission (#1174).
 */
export const DOCUMENT_FAMILY_POLICY = {
  questionnaire: { projectLinkable: true },
  'mission-deliverable': { projectLinkable: true },
  'received-contract': { projectLinkable: true },
  'received-addendum': { projectLinkable: false },
  'received-audit-source': { projectLinkable: false },
  'external-invoice': { projectLinkable: false },
  'payment-evidence': { projectLinkable: false },
} as const satisfies Record<
  DocumentType,
  { readonly projectLinkable: boolean }
>;

export type ProjectLinkableDocumentType = {
  [
    Type in DocumentType
  ]: (typeof DOCUMENT_FAMILY_POLICY)[Type]['projectLinkable'] extends true
    ? Type
    : never;
}[DocumentType];

/**
 * Whether a Document of this family may be linked to a Project, listed with
 * it or included in its PDF bundle.
 */
export function isProjectLinkable(
  type: DocumentType,
): type is ProjectLinkableDocumentType {
  return DOCUMENT_FAMILY_POLICY[type].projectLinkable;
}

/** The same decision for a Document, narrowing it to the linkable families. */
export function isProjectLinkableDocument<
  Document extends { type: DocumentType },
>(
  document: Document,
): document is Document & { type: ProjectLinkableDocumentType } {
  return isProjectLinkable(document.type);
}
