import type { workingDocuments } from '../database/schema/index.js';

export type DocumentType = (typeof workingDocuments.$inferSelect)['type'];

/**
 * The Document actions whose authority depends on the family. Registration
 * keeps its own family checks until it has one module (#1177).
 */
export type DocumentFamilyAction =
  'read' | 'content-read' | 'upload' | 'version' | 'designate' | 'correct';

/**
 * `native`: the family's own exact native grant is required, in addition to
 * the delivered Document authority each caller checks. `delivered`: the
 * delivered Document authority alone decides.
 */
export type DocumentFamilyAccessDecision = 'native' | 'delivered';

/** One access decision for every family-dependent action. */
export type DocumentFamilyAccessDecisions = Readonly<
  Record<DocumentFamilyAction, DocumentFamilyAccessDecision>
>;

const NATIVE_FAMILY_ACCESS = {
  read: 'native',
  'content-read': 'native',
  upload: 'native',
  version: 'native',
  designate: 'native',
  correct: 'native',
} as const satisfies DocumentFamilyAccessDecisions;

const DELIVERED_DOCUMENT_ACCESS = {
  read: 'delivered',
  'content-read': 'delivered',
  upload: 'delivered',
  version: 'delivered',
  designate: 'delivered',
  correct: 'delivered',
} as const satisfies DocumentFamilyAccessDecisions;

/**
 * Every decision that depends on a Document family, in one exhaustive table.
 * A new family fails type checking here until each decision is made, so no
 * family inherits a default by omission (#1174).
 */
export const DOCUMENT_FAMILY_POLICY = {
  questionnaire: { projectLinkable: true, access: DELIVERED_DOCUMENT_ACCESS },
  'mission-deliverable': {
    projectLinkable: true,
    access: DELIVERED_DOCUMENT_ACCESS,
  },
  'received-contract': {
    projectLinkable: true,
    access: DELIVERED_DOCUMENT_ACCESS,
  },
  'received-addendum': { projectLinkable: false, access: NATIVE_FAMILY_ACCESS },
  'received-audit-source': {
    projectLinkable: false,
    access: NATIVE_FAMILY_ACCESS,
  },
  'external-invoice': { projectLinkable: false, access: NATIVE_FAMILY_ACCESS },
  'payment-evidence': { projectLinkable: false, access: NATIVE_FAMILY_ACCESS },
} as const satisfies Record<
  DocumentType,
  {
    readonly projectLinkable: boolean;
    readonly access: DocumentFamilyAccessDecisions;
  }
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

/** The families that require their own native grant for at least one action. */
export type NativeAccessDocumentType = {
  [
    Type in DocumentType
  ]: 'native' extends (typeof DOCUMENT_FAMILY_POLICY)[Type]['access'][DocumentFamilyAction]
    ? Type
    : never;
}[DocumentType];

export function isNativeAccessFamily(
  type: DocumentType,
): type is NativeAccessDocumentType {
  return Object.values(DOCUMENT_FAMILY_POLICY[type].access).includes('native');
}

/** Whether this action on this family requires the family's native grant. */
export function requiresNativeFamilyAccess(
  type: DocumentType,
  action: DocumentFamilyAction,
): boolean {
  return DOCUMENT_FAMILY_POLICY[type].access[action] === 'native';
}
