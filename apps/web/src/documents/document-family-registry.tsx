import { useRef, useState, type ComponentType, type ReactNode } from 'react';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import {
  documentFamilyCaptureKey,
  hasDocumentFamilyAccess,
} from './document-family-access';
import type {
  DocumentFamily,
  WorkingDocument,
  WorkingDocumentDetail,
} from './document-response';
import { useDocumentsCopy } from './documents.copy';
import {
  canSelectExternalInvoiceSource,
  externalInvoiceCaptureKey,
  externalInvoiceSourceAuthority,
  hasExternalInvoiceAccess,
  hasExternalInvoiceNativeRead,
} from './external-invoice-access';
import { useExternalInvoiceCopy } from './external-invoice.copy';
import { ExternalInvoiceRegistration } from './ExternalInvoiceRegistration';
import { ExternalInvoiceRelation } from './ExternalInvoiceRelation';
import { hasMissionDeliverableAccess } from './mission-deliverable-access';
import { useMissionDeliverableCopy } from './mission-deliverable.copy';
import {
  canReadReceivedAddendumRelation,
  hasReceivedAddendumAccess,
  receivedAddendumSourceAuthority,
} from './received-addendum-access';
import { useReceivedAddendumCopy } from './received-addendum.copy';
import { ReceivedAddendumRegistration } from './ReceivedAddendumRegistration';
import { ReceivedAddendumRelation } from './ReceivedAddendumRelation';
import { hasReceivedAuditSourceAccess } from './received-audit-source-access';
import { useReceivedAuditSourceCopy } from './received-audit-source.copy';
import {
  canReadReceivedContractRelation,
  hasReceivedContractAccess,
  receivedContractSourceAuthority,
} from './received-contract-access';
import { useReceivedContractCopy } from './received-contract.copy';
import { ReceivedContractRegistration } from './ReceivedContractRegistration';
import { ReceivedContractRelation } from './ReceivedContractRelation';

/** Payment evidence has its own section; every other family opens here. */
export type WorkspaceFamily = Exclude<DocumentFamily, 'payment-evidence'>;
export type WorkspaceDocument = Exclude<
  WorkingDocument,
  { type: 'payment-evidence' }
>;
export type WorkspaceDocumentDetail = Exclude<
  WorkingDocumentDetail,
  { type: 'payment-evidence' }
>;

type VersionStatus = WorkspaceDocumentDetail['version']['status'];

/** Every family's copy, read once per render. */
export function useDocumentFamilyCopies() {
  return {
    documents: useDocumentsCopy(),
    auditSource: useReceivedAuditSourceCopy(),
    mission: useMissionDeliverableCopy(),
    received: useReceivedContractCopy(),
    addendum: useReceivedAddendumCopy(),
    invoice: useExternalInvoiceCopy(),
  };
}
export type DocumentFamilyCopies = ReturnType<typeof useDocumentFamilyCopies>;

type RelationProps = {
  actor: ActorContext;
  identity: BrowserIdentity;
  documentId: string;
  onActorRevalidated?: (actor: ActorContext) => Promise<void> | void;
  onCompanyContextRejected?: (companyId: string) => Promise<void> | void;
  onWorkspaceAccessRejected?: () => Promise<void> | void;
};

export type SourceRegistrationProps = {
  actor: ActorContext;
  identity: BrowserIdentity;
  companyId: string;
  onBusyChange: (busy: boolean) => void;
  onAccessRejected: (
    signal: AbortSignal,
    isCurrent?: () => boolean,
  ) => Promise<void> | void;
  onStarted: () => void;
  onRegistered: (document: WorkingDocumentDetail) => void;
};

/** A family registered from a selected source rather than the native form. */
interface SourceRegistration {
  /** Part of the form's owner key: a change retires the whole source intent. */
  authority(actor: ActorContext): string;
  denied(copies: DocumentFamilyCopies): string;
  render(props: SourceRegistrationProps): ReactNode;
}

/** What the Documents screens need to know about one family. */
export interface DocumentFamilyScreen {
  /** Financial: read and owned under the external invoice capture. */
  readonly financial: boolean;
  /** Registered and corrected with an external reference URL. */
  readonly referenceUrl: boolean;
  readonly showsRegistrationTime: boolean;
  /** Shows the Project association, as the API family policy links it. */
  readonly projectLinkable: boolean;
  /** Its protected work is also reported to its own navigation guard. */
  readonly separateProtectedWork: boolean;
  /** A 401 on its native commands is answered locally, then revalidated. */
  readonly deniesOnUnauthorized: boolean;
  label(copies: DocumentFamilyCopies): string;
  /** The family's own warning; undefined uses the generic Document warning. */
  warning(copies: DocumentFamilyCopies): string | undefined;
  status(copies: DocumentFamilyCopies, status: VersionStatus): string;
  readonly Relation?: ComponentType<RelationProps>;
  readonly source?: SourceRegistration;
}

/** The working Version the detail shows: the draft, otherwise the official one. */
function workingVersionLabel(
  status: VersionStatus,
  copy: Pick<DocumentFamilyCopies['documents'], 'draft' | 'official'>,
): string {
  switch (status) {
    case 'draft':
      return copy.draft;
    case 'official':
      return copy.official;
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

const NATIVE = {
  financial: false,
  referenceUrl: false,
  showsRegistrationTime: true,
  separateProtectedWork: false,
  deniesOnUnauthorized: false,
} as const;

/**
 * Every Documents-screen decision that depends on the family, in selector
 * order. A family without an entry fails type checking.
 */
export const DOCUMENT_FAMILY_SCREENS = {
  questionnaire: {
    ...NATIVE,
    referenceUrl: true,
    projectLinkable: true,
    label: (copies) => copies.mission.t('questionnaire'),
    warning: () => undefined,
    status: (copies, status) => workingVersionLabel(status, copies.documents),
  },
  'received-audit-source': {
    ...NATIVE,
    projectLinkable: false,
    deniesOnUnauthorized: true,
    label: (copies) => copies.auditSource('family'),
    warning: (copies) => copies.auditSource('warning'),
    status: (copies, status) => copies.auditSource(status),
  },
  'mission-deliverable': {
    ...NATIVE,
    projectLinkable: true,
    label: (copies) => copies.mission.t('mission'),
    warning: (copies) => copies.mission.t('warning'),
    status: (copies, status) => copies.mission.t(status),
  },
  'external-invoice': {
    ...NATIVE,
    financial: true,
    projectLinkable: false,
    label: (copies) => copies.invoice.t('family'),
    warning: (copies) => copies.invoice.t('warning'),
    status: (copies, status) => copies.invoice.t(status),
    Relation: ExternalInvoiceRelation,
    source: {
      authority: (actor) =>
        externalInvoiceSourceAuthority(
          actor.activeCompany,
          actor.workspacePermissions.includes('client.manage'),
        ),
      denied: (copies) => copies.invoice.t('sourceDenied'),
      render: (props) => (
        <ExternalInvoiceRegistration
          identity={props.identity}
          companyId={props.companyId}
          onBusyChange={props.onBusyChange}
          onAccessRejected={props.onAccessRejected}
          onStarted={props.onStarted}
          onRegistered={props.onRegistered}
        />
      ),
    },
  },
  'received-addendum': {
    ...NATIVE,
    showsRegistrationTime: false,
    projectLinkable: false,
    separateProtectedWork: true,
    label: (copies) => copies.addendum.t('family'),
    warning: (copies) => copies.addendum.t('warning'),
    status: (copies, status) => copies.addendum.t(status),
    Relation: ReceivedAddendumRelation,
    source: {
      authority: (actor) => receivedAddendumSourceAuthority(actor),
      denied: (copies) => copies.addendum.t('sourceDenied'),
      render: (props) => <ReceivedAddendumRegistration {...props} />,
    },
  },
  'received-contract': {
    ...NATIVE,
    projectLinkable: true,
    label: (copies) => copies.received.t('family'),
    warning: (copies) => copies.received.t('warning'),
    status: (copies, status) => copies.received.t(status),
    Relation: ReceivedContractRelation,
    source: {
      authority: (actor) =>
        receivedContractSourceAuthority(actor.activeCompany),
      denied: (copies) => copies.received.t('sourceDenied'),
      render: (props) => (
        <ReceivedContractRegistration
          identity={props.identity}
          companyId={props.companyId}
          onBusyChange={props.onBusyChange}
          onAccessRejected={props.onAccessRejected}
          onStarted={props.onStarted}
          onRegistered={props.onRegistered}
        />
      ),
    },
  },
} as const satisfies Record<WorkspaceFamily, DocumentFamilyScreen>;

export const DEFAULT_REGISTRATION_FAMILY: WorkspaceFamily = 'questionnaire';

export function isWorkspaceFamily(value: string): value is WorkspaceFamily {
  return Object.hasOwn(DOCUMENT_FAMILY_SCREENS, value);
}

/** Every workspace family, in selector order. */
export const WORKSPACE_FAMILIES: readonly WorkspaceFamily[] = Object.keys(
  DOCUMENT_FAMILY_SCREENS,
).filter(isWorkspaceFamily);

export function familyScreen(type: WorkspaceFamily): DocumentFamilyScreen {
  return DOCUMENT_FAMILY_SCREENS[type];
}

export function isWorkspaceDocument<Document extends { type: DocumentFamily }>(
  document: Document,
): document is Exclude<Document, { type: 'payment-evidence' }> {
  return isWorkspaceFamily(document.type);
}

type ScreenFlag =
  | 'financial'
  | 'referenceUrl'
  | 'showsRegistrationTime'
  | 'projectLinkable'
  | 'separateProtectedWork'
  | 'deniesOnUnauthorized';

/** The families whose entry sets `Flag`, derived from the registry. */
export type FamiliesWith<Flag extends ScreenFlag> = {
  [
    Type in WorkspaceFamily
  ]: (typeof DOCUMENT_FAMILY_SCREENS)[Type][Flag] extends true ? Type : never;
}[WorkspaceFamily];

/** Narrows a Document to the families whose entry sets `flag`. */
export function documentHas<
  Flag extends ScreenFlag,
  Document extends { type: WorkspaceFamily },
>(
  document: Document,
  flag: Flag,
): document is Document & { type: FamiliesWith<Flag> } {
  return DOCUMENT_FAMILY_SCREENS[document.type][flag];
}

/**
 * The relation an ordinary metadata or list owner keeps: none. Each relation
 * has its own keyed reader, so protected source fields never stay here.
 */
export function withoutProtectedRelation(
  document: WorkspaceDocumentDetail,
): WorkspaceDocumentDetail {
  switch (document.type) {
    case 'received-addendum':
      return { ...document, receivedAddendumRelation: { access: 'denied' } };
    case 'external-invoice':
      return { ...document, externalInvoiceRelation: { access: 'denied' } };
    case 'received-contract':
      return { ...document, receivedContractRelation: { access: 'denied' } };
    case 'questionnaire':
    case 'mission-deliverable':
    case 'received-audit-source':
      return document;
    default: {
      const exhaustive: never = document;
      return exhaustive;
    }
  }
}

/**
 * The current family authority and owner captures of one Documents session.
 * A capture change retires that family's rows, reads and drafts; the external
 * invoice and received audit source owners also renew on an identity change,
 * so A → B → A never revives old work.
 */
export function useDocumentFamilyAuthority({
  actor,
  identity,
  sectionVisible,
  clientIdentityRevision,
}: {
  actor: ActorContext;
  identity: BrowserIdentity;
  sectionVisible: boolean;
  clientIdentityRevision: number;
}) {
  const company = actor.activeCompany;
  const workspaceClientRead =
    actor.workspacePermissions.includes('client.manage');
  const canUseAuditSource = hasReceivedAuditSourceAccess(company);
  const canUseMission = hasMissionDeliverableAccess(company);
  const canUseAddendum = hasReceivedAddendumAccess(company);
  const canUseReceived = hasReceivedContractAccess(company);
  const canUseInvoice =
    actor.active &&
    identity.loaded &&
    identity.signedIn &&
    hasExternalInvoiceAccess(company) &&
    hasExternalInvoiceNativeRead(company, workspaceClientRead);
  const canManageInvoice = hasExternalInvoiceAccess(company, true);
  const invoiceAuthority = JSON.stringify([
    canUseInvoice,
    externalInvoiceCaptureKey(company),
    company?.clientPermissionAssignmentId,
    company?.clientPermissionSetVersion,
    workspaceClientRead,
    actor.internalUserId,
  ]);
  const [invoiceOwner, setInvoiceOwner] = useState({
    identity,
    authority: invoiceAuthority,
    visible: sectionVisible,
    clientRevision: clientIdentityRevision,
    generation: 0,
  });
  // A monotonically new financial owner prevents A → B → A from reviving old work.
  // Native sibling-family drafts keep their existing owners.
  if (
    invoiceOwner.identity !== identity ||
    invoiceOwner.authority !== invoiceAuthority ||
    invoiceOwner.visible !== sectionVisible ||
    invoiceOwner.clientRevision !== clientIdentityRevision
  ) {
    setInvoiceOwner({
      identity,
      authority: invoiceAuthority,
      visible: sectionVisible,
      clientRevision: clientIdentityRevision,
      generation: invoiceOwner.generation + 1,
    });
  }
  const invoiceCapture = JSON.stringify([
    invoiceAuthority,
    invoiceOwner.generation,
  ]);
  const auditSourceSignature = documentFamilyCaptureKey(
    company,
    'received-audit-source',
  );
  const auditSourceOwner = useRef({
    signature: auditSourceSignature,
    identity,
    generation: 0,
  });
  if (
    auditSourceOwner.current.signature !== auditSourceSignature ||
    auditSourceOwner.current.identity !== identity
  )
    auditSourceOwner.current = {
      signature: auditSourceSignature,
      identity,
      generation: auditSourceOwner.current.generation + 1,
    };
  const captures = {
    questionnaire: 'questionnaire',
    'received-audit-source': JSON.stringify([
      auditSourceSignature,
      auditSourceOwner.current.generation,
    ]),
    'mission-deliverable': documentFamilyCaptureKey(
      company,
      'mission-deliverable',
    ),
    'external-invoice': invoiceCapture,
    'received-addendum': documentFamilyCaptureKey(company, 'received-addendum'),
    'received-contract': documentFamilyCaptureKey(company, 'received-contract'),
    'payment-evidence': 'payment-evidence-owned-separately',
  } satisfies Record<DocumentFamily, string>;
  const selectable = {
    questionnaire: true,
    'received-audit-source': canUseAuditSource,
    'mission-deliverable': canUseMission,
    'external-invoice': canUseInvoice && canManageInvoice && sectionVisible,
    'received-addendum': canUseAddendum,
    'received-contract': canUseReceived,
  } satisfies Record<WorkspaceFamily, boolean>;
  const sourceSelectable = {
    questionnaire: false,
    'received-audit-source': false,
    'mission-deliverable': false,
    'external-invoice':
      canUseInvoice &&
      sectionVisible &&
      canSelectExternalInvoiceSource(company, workspaceClientRead),
    'received-addendum':
      canUseAddendum && canReadReceivedAddendumRelation(actor),
    'received-contract':
      canUseReceived && canReadReceivedContractRelation(company),
  } satisfies Record<WorkspaceFamily, boolean>;
  // Only mission deliverables recheck family access when the native form submits.
  const nativeRegistrable = {
    questionnaire: true,
    'received-audit-source': true,
    'mission-deliverable': canUseMission,
    'external-invoice': true,
    'received-addendum': true,
    'received-contract': true,
  } satisfies Record<WorkspaceFamily, boolean>;
  return {
    /** Each family's current owner capture. */
    captures,
    /** Changes whenever any family's capture changes. */
    capturesKey: JSON.stringify(captures),
    /** The captures whose change re-reads the Document list. */
    listCaptureKey: JSON.stringify([
      captures['mission-deliverable'],
      captures['received-contract'],
      captures['received-addendum'],
      canUseInvoice ? invoiceCapture : undefined,
    ]),
    /** A family other than questionnaires can be chosen for registration. */
    offersFamilyChoice:
      canUseAuditSource ||
      canUseMission ||
      canUseReceived ||
      canUseAddendum ||
      canUseInvoice,
    selectable: (type: WorkspaceFamily) => selectable[type],
    sourceSelectable: (type: WorkspaceFamily) => sourceSelectable[type],
    /** The native registration form may submit this family. */
    nativeRegistrable: (type: WorkspaceFamily) => nativeRegistrable[type],
    /** Rows and details of this family may be shown. */
    readable: (type: WorkspaceFamily) =>
      hasDocumentFamilyAccess(company, type) &&
      (!DOCUMENT_FAMILY_SCREENS[type].financial ||
        (canUseInvoice && sectionVisible)),
    /** Metadata of this family may be corrected by this member. */
    manageable: (type: WorkspaceFamily) =>
      !DOCUMENT_FAMILY_SCREENS[type].financial || canManageInvoice,
    /** A financial family's owners are keyed by its capture; others are not. */
    ownerKey: (prefix: string, type: WorkspaceFamily) =>
      DOCUMENT_FAMILY_SCREENS[type].financial
        ? `${prefix}:${captures[type]}`
        : undefined,
  };
}
