import {
  hasExternalInvoiceAccess,
  hasExternalInvoiceNativeRead,
} from './external-invoice-access';
import { useExternalInvoiceCopy } from './external-invoice.copy';
import { hasReceivedContractAccess } from './received-contract-access';
import { documentFamilyCaptureKey } from './document-family-access';
import { useReceivedContractCopy } from './received-contract.copy';
import { useMissionDeliverableCopy } from './mission-deliverable.copy';
import { hasMissionDeliverableAccess } from './mission-deliverable-access';
import { DocumentPdfContent } from './DocumentPdfContent';
import { useDocumentNavigationProtection } from './document-navigation-protection';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import {
  handleAuthenticatedAccessRejection,
  runLatestAuthenticatedRequest,
} from '../api/latest-authenticated-request';
import { formatApplicationDateTime } from '../presentation/date-time';
import { Select } from '../presentation/Select';
import {
  isRepresentationForm,
  readDocumentVersionReceipt,
  readDocumentVersions,
  type DocumentFamily,
  type DocumentRepresentationForm,
  type DocumentVersion,
  type DocumentVersionReference,
  type DocumentVersions as VersionsRead,
  type DocumentVersionReceipt,
} from './document-response';
import { useDocumentVersionsCopy } from './document-versions.copy';
import './document-versions.css';

type ReadState =
  | { status: 'loading' | 'error' | 'unavailable' }
  | { status: 'ready'; read: VersionsRead };

/** One Version command exactly as submitted; a retry resends it unchanged. */
interface VersionCommand {
  action:
    | 'designated_official'
    | 'drafted'
    | 'representation_added'
    | 'representation_removed';
  path: string;
  payload: string;
  key: string;
  capacityScope?: 'draft' | 'official';
}
type CommandState =
  | { status: 'idle' }
  | {
      status: 'confirming';
      action: 'designation';
      versionId: string;
      versionNumber: number;
      supersededVersionNumber: number | null;
      expectedRevision: number;
    }
  | {
      status: 'confirming';
      action: 'official-append';
      versionId: string;
      versionNumber: number;
      expectedRevision: number;
      form: DocumentRepresentationForm;
      url: string;
    }
  | { status: 'pending'; command: VersionCommand }
  | { status: 'uncertain'; command: VersionCommand }
  | {
      status: 'confirmed';
      receipt: Pick<DocumentVersionReceipt, 'action' | 'versionNumber'>;
    }
  | {
      status: 'refused';
      reason:
        | 'conflict'
        | 'unavailable'
        | 'version-capacity'
        | 'draft-reference-capacity'
        | 'official-reference-capacity'
        | 'denied';
    };

interface AccessRejection {
  onCompanyContextRejected: (companyId: string) => Promise<void> | void;
  onActorRevalidated: (actor: ActorContext) => Promise<void> | void;
  onWorkspaceAccessRejected: () => Promise<void> | void;
}

/**
 * The formal Versions of one open working Document: each Version's status,
 * attribution and references, with the designation and new-draft commands the
 * live permissions allow. It is keyed to the Document, member, Company and
 * Document permission set, including the Approver assignment, it was read
 * under: any change starts a new section, whose predecessor's late replies
 * never render. A pending command is never cancelled.
 */
export function DocumentVersions({
  actor,
  identity,
  documentId,
  documentType = 'questionnaire',
  workingRevision,
  onRefresh,
  onProtectedWorkChange,
  onCompanyContextRejected = () => undefined,
  onActorRevalidated = () => undefined,
  onWorkspaceAccessRejected = () => undefined,
}: {
  actor: ActorContext;
  identity: BrowserIdentity;
  documentId: string;
  documentType?: DocumentFamily;
  /** The open Document's revision; a newer one reloads the Versions. */
  workingRevision: number;
  /** Re-reads the open Document and its list after a confirmed or stale command. */
  onRefresh: () => Promise<void> | void;
  /** Navigation observes protection, never the command, payload or retry key. */
  onProtectedWorkChange?: (protectedWork: boolean) => void;
} & Partial<AccessRejection>) {
  const company = actor.activeCompany;
  const permissions = company?.documentPermissions ?? [];
  if (
    !company ||
    !permissions.includes('document.read') ||
    (documentType === 'mission-deliverable' &&
      !hasMissionDeliverableAccess(company)) ||
    (documentType === 'received-contract' &&
      !hasReceivedContractAccess(company)) ||
    (documentType === 'external-invoice' &&
      (!hasExternalInvoiceAccess(company) ||
        !hasExternalInvoiceNativeRead(
          company,
          actor.workspacePermissions.includes('client.manage'),
        )))
  )
    return null;
  const canReadReference = permissions.includes('document.reference.read');
  const canMutateFamily =
    documentType !== 'external-invoice' ||
    hasExternalInvoiceAccess(company, true);
  return (
    <VersionsSection
      key={JSON.stringify([
        actor.workspaceId,
        actor.workspaceMembershipId,
        company.id,
        documentId,
        documentType,
        documentFamilyCaptureKey(company, documentType),
        permissions
          .filter((permission) =>
            [
              'document.read',
              'document.reference.read',
              'document.version.manage',
              'document.version.designate_official',
              'document.content.read',
              'document.content.upload',
            ].includes(permission),
          )
          .sort(),
        company.documentPermissionSetVersion ?? null,
        company.documentApproverAssignmentId ?? null,
        company.documentContentReaderAssignmentId ?? null,
        company.documentContentReaderPermissionSetVersion ?? null,
        company.documentContentUploaderAssignmentId ?? null,
        company.documentContentUploaderPermissionSetVersion ?? null,
        company.clientPermissions?.includes('client.read') === true,
        actor.workspacePermissions.includes('client.manage'),
      ])}
      identity={identity}
      companyId={company.id}
      documentId={documentId}
      documentType={documentType}
      workingRevision={workingRevision}
      canDesignate={
        canMutateFamily &&
        canReadReference &&
        permissions.includes('document.version.designate_official')
      }
      canStartDraft={
        canMutateFamily &&
        canReadReference &&
        permissions.includes('document.version.manage')
      }
      canUploadContent={
        canMutateFamily &&
        permissions.includes('document.content.read') &&
        permissions.includes('document.content.upload') &&
        permissions.includes('document.version.manage')
      }
      onRefresh={onRefresh}
      onProtectedWorkChange={onProtectedWorkChange}
      rejection={{
        onCompanyContextRejected,
        onActorRevalidated,
        onWorkspaceAccessRejected,
      }}
    />
  );
}

function VersionsSection({
  identity,
  companyId,
  documentId,
  documentType,
  workingRevision,
  canDesignate,
  canStartDraft,
  canUploadContent,
  onRefresh,
  onProtectedWorkChange,
  rejection,
}: {
  identity: BrowserIdentity;
  companyId: string;
  documentId: string;
  documentType: DocumentFamily;
  workingRevision: number;
  canDesignate: boolean;
  canStartDraft: boolean;
  canUploadContent: boolean;
  onRefresh: () => Promise<void> | void;
  onProtectedWorkChange?: (protectedWork: boolean) => void;
  rejection: AccessRejection;
}) {
  const copy = useDocumentVersionsCopy();
  const titleId = useId();
  const confirmationId = useId();
  const [read, setRead] = useState<ReadState>({ status: 'loading' });
  const [reloads, setReloads] = useState(0);
  const [command, setCommand] = useState<CommandState>({ status: 'idle' });
  const [protectedPdfVersions, setProtectedPdfVersions] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const reportPdfProtection = useCallback(
    ({
      versionId,
      protectedWork,
    }: {
      versionId: string;
      protectedWork: boolean;
    }) => {
      setProtectedPdfVersions((current) => {
        if (current.has(versionId) === protectedWork) return current;
        const next = new Set(current);
        if (protectedWork) next.add(versionId);
        else next.delete(versionId);
        return next;
      });
    },
    [],
  );
  /** Versions reads only; a command is never aborted here. */
  const readRequest = useRef<AbortController | undefined>(undefined);
  /** Late command outcomes of a retired section never render. */
  const mounted = useRef(true);
  const refresh = useRef(onRefresh);
  refresh.current = onRefresh;
  const reject = useRef(rejection);
  reject.current = rejection;
  const confirmButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async (): Promise<void> => {
    await runLatestAuthenticatedRequest({
      pending: readRequest,
      identity,
      execute: (api, signal) =>
        api.request<unknown>(
          `/documents/${encodeURIComponent(documentId)}/versions`,
          { companyContextId: companyId, signal },
        ),
      async onResult(result) {
        if (result.status === 'unauthorized') {
          await identity.rejectSession();
          return;
        }
        // Lost read authority removes every row, without counts.
        if (result.status === 'forbidden' || result.status === 'notFound') {
          setRead({ status: 'unavailable' });
          return;
        }
        if (result.status !== 'ok') {
          setRead({ status: 'error' });
          return;
        }
        setRead({
          status: 'ready',
          read: readDocumentVersions(result.value, documentType),
        });
      },
      onError: () => setRead({ status: 'error' }),
    });
  }, [identity, companyId, documentId, documentType]);

  // A newer working revision or an explicit reload re-reads the Versions; the
  // loaded rows stay visible until the newer read answers.
  useEffect(() => {
    void load();
    return () => readRequest.current?.abort();
  }, [load, workingRevision, reloads]);

  useEffect(() => {
    if (command.status === 'confirming') confirmButton.current?.focus();
  }, [command.status]);

  async function submit(next: VersionCommand): Promise<void> {
    setCommand({ status: 'pending', command: next });
    try {
      const api = await createAuthenticatedApiClient(identity);
      const result = await api.request<unknown>(next.path, {
        method: 'POST',
        companyContextId: companyId,
        headers: {
          'content-type': 'application/json',
          'idempotency-key': next.key,
        },
        body: next.payload,
      });
      if (!mounted.current) return;
      switch (result.status) {
        case 'unauthorized':
          await identity.rejectSession();
          return;
        case 'forbidden':
          setCommand({ status: 'refused', reason: 'denied' });
          // As delivered, a refusal revalidates the actor and its Company. A
          // failed revalidation leaves the refusal shown; it is never retried
          // as an uncertain command.
          await handleAuthenticatedAccessRejection({
            result,
            identity,
            companyContextId: companyId,
            onCompanyContextRejected: (rejected) =>
              reject.current.onCompanyContextRejected(rejected),
            onActorRevalidated: (actor) =>
              reject.current.onActorRevalidated(actor),
            onWorkspaceAccessRejected: () =>
              reject.current.onWorkspaceAccessRejected(),
          }).catch(() => undefined);
          return;
        case 'notFound':
          setCommand({ status: 'refused', reason: 'unavailable' });
          return;
        case 'conflict':
          setCommand({
            status: 'refused',
            reason:
              result.reason === undefined &&
              result.code === 'document_version_capacity_exceeded'
                ? 'version-capacity'
                : result.reason === undefined &&
                    result.code === 'document_representation_capacity_exceeded'
                  ? next.capacityScope === 'official'
                    ? 'official-reference-capacity'
                    : 'draft-reference-capacity'
                  : 'conflict',
          });
          return;
        case 'validation':
          setCommand({ status: 'refused', reason: 'conflict' });
          return;
        case 'error':
          setCommand({ status: 'uncertain', command: next });
          return;
        case 'ok': {
          const receipt = readDocumentVersionReceipt(result.value);
          if (
            receipt.documentId !== documentId ||
            receipt.action !== next.action
          )
            throw new Error('Unexpected Version receipt');
          setCommand({
            status: 'confirmed',
            receipt: {
              action: receipt.action,
              versionNumber: receipt.versionNumber,
            },
          });
          setReloads((count) => count + 1);
          // The owner reports its own refresh failure; the confirmed command
          // is never presented as uncertain.
          await Promise.resolve(refresh.current()).catch(() => undefined);
          return;
        }
        default: {
          const exhaustive: never = result;
          return exhaustive;
        }
      }
    } catch {
      if (mounted.current) setCommand({ status: 'uncertain', command: next });
    }
  }

  function startDraft(expectedRevision: number): void {
    void submit({
      action: 'drafted',
      path: `/documents/${encodeURIComponent(documentId)}/versions`,
      payload: JSON.stringify({ expectedRevision }),
      key: crypto.randomUUID(),
    });
  }

  function confirmDesignation(): void {
    if (command.status !== 'confirming' || command.action !== 'designation')
      return;
    void submit({
      action: 'designated_official',
      path: `/documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(command.versionId)}/official-designation`,
      payload: JSON.stringify({ expectedRevision: command.expectedRevision }),
      key: crypto.randomUUID(),
    });
  }

  function addReference(
    version: DocumentVersion,
    form: DocumentRepresentationForm,
    url: string,
  ): void {
    if (version.status === 'official') {
      setCommand({
        status: 'confirming',
        action: 'official-append',
        versionId: version.id,
        versionNumber: version.number,
        expectedRevision:
          read.status === 'ready' ? read.read.workingRevision : 0,
        form,
        url,
      });
      return;
    }
    if (read.status !== 'ready') return;
    void submit(
      referenceAdditionCommand(
        documentId,
        version,
        read.read.workingRevision,
        form,
        url,
      ),
    );
  }

  function confirmOfficialAppend(): void {
    if (command.status !== 'confirming' || command.action !== 'official-append')
      return;
    void submit({
      action: 'representation_added',
      path: `/documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(command.versionId)}/representations`,
      payload: JSON.stringify({
        expectedRevision: command.expectedRevision,
        form: command.form,
        url: command.url,
      }),
      key: crypto.randomUUID(),
      capacityScope: 'official',
    });
  }

  function removeReference(
    version: DocumentVersion,
    reference: DocumentVersionReference,
  ): void {
    if (read.status !== 'ready') return;
    void submit({
      action: 'representation_removed',
      path: `/documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(version.id)}/representations/${encodeURIComponent(reference.id)}/removal`,
      payload: JSON.stringify({ expectedRevision: read.read.workingRevision }),
      key: crypto.randomUUID(),
    });
  }

  /** An explicit reload of the open Document and its Versions. */
  function reload(): void {
    setCommand({ status: 'idle' });
    setReloads((count) => count + 1);
    void Promise.resolve()
      .then(() => refresh.current())
      .catch(() => undefined);
  }

  const busy =
    command.status === 'pending' ||
    command.status === 'uncertain' ||
    command.status === 'confirming';
  useDocumentNavigationProtection(
    busy || protectedPdfVersions.size > 0,
    onProtectedWorkChange,
  );

  return (
    <section
      className="working-document-versions"
      aria-labelledby={titleId}
      aria-busy={read.status === 'loading'}
    >
      <h4 id={titleId}>{copy.title}</h4>
      {read.status === 'loading' && <p>{copy.loading}</p>}
      {read.status === 'unavailable' && <p>{copy.unavailable}</p>}
      {read.status === 'error' && (
        <>
          <p role="alert">{copy.error}</p>
          <button
            type="button"
            onClick={() => {
              setRead({ status: 'loading' });
              setReloads((count) => count + 1);
            }}
          >
            {copy.retry}
          </button>
        </>
      )}
      {read.status === 'ready' && (
        <>
          {!read.read.mutable && <p>{copy.readOnly}</p>}
          <ol className="working-document-versions-list" aria-label={copy.list}>
            {read.read.versions.map((version) => (
              <VersionRow
                key={version.id}
                version={version}
                documentType={documentType}
                mutable={read.read.mutable}
                canManage={canStartDraft && documentType === 'questionnaire'}
                busy={busy}
                onAdd={addReference}
                onRemove={removeReference}
              >
                <DocumentPdfContent
                  identity={identity}
                  companyId={companyId}
                  documentId={documentId}
                  versionId={version.id}
                  versionNumber={version.number}
                  content={version.pdfContent}
                  canUpload={
                    canUploadContent &&
                    read.read.mutable &&
                    version.status === 'draft' &&
                    !busy
                  }
                  workingRevision={read.read.workingRevision}
                  onProtectedWorkChange={(protectedWork) =>
                    reportPdfProtection({
                      versionId: version.id,
                      protectedWork,
                    })
                  }
                  onConfirmed={() => {
                    setRead({ status: 'loading' });
                    setReloads((count) => count + 1);
                    void Promise.resolve()
                      .then(() => refresh.current())
                      .catch(() => undefined);
                  }}
                  onReload={() => {
                    setRead({ status: 'loading' });
                    reload();
                  }}
                  onDenied={async () => {
                    await handleAuthenticatedAccessRejection({
                      result: { status: 'forbidden' },
                      identity,
                      companyContextId: companyId,
                      onCompanyContextRejected: (company) => {
                        if (mounted.current)
                          return reject.current.onCompanyContextRejected(
                            company,
                          );
                      },
                      onActorRevalidated: (actor) => {
                        if (mounted.current)
                          return reject.current.onActorRevalidated(actor);
                      },
                      onWorkspaceAccessRejected: () => {
                        if (mounted.current)
                          return reject.current.onWorkspaceAccessRejected();
                      },
                    });
                    if (mounted.current) setReloads((count) => count + 1);
                  }}
                />
                {read.read.mutable &&
                  canDesignate &&
                  version.status === 'draft' &&
                  (documentType === 'questionnaire' ||
                    version.pdfContent.state === 'stored') && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        setCommand({
                          status: 'confirming',
                          action: 'designation',
                          versionId: version.id,
                          versionNumber: version.number,
                          supersededVersionNumber:
                            read.read.versions.find(
                              (candidate) => candidate.status === 'official',
                            )?.number ?? null,
                          expectedRevision: read.read.workingRevision,
                        })
                      }
                    >
                      {copy.designate}
                    </button>
                  )}
                {read.read.mutable &&
                  canStartDraft &&
                  version.status === 'official' &&
                  !read.read.versions.some(
                    (candidate) => candidate.status === 'draft',
                  ) && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => startDraft(read.read.workingRevision)}
                    >
                      {copy.startDraft}
                    </button>
                  )}
              </VersionRow>
            ))}
          </ol>
        </>
      )}
      <CommandFeedback
        command={command}
        confirmationId={confirmationId}
        confirmButton={confirmButton}
        onConfirm={confirmDesignation}
        onConfirmOfficialAppend={confirmOfficialAppend}
        onCancel={() => setCommand({ status: 'idle' })}
        onRetry={(pending) => void submit(pending)}
        onReload={reload}
      />
    </section>
  );
}

function VersionRow({
  version,
  documentType,
  mutable,
  canManage,
  busy,
  onAdd,
  onRemove,
  children,
}: {
  version: DocumentVersion;
  documentType: DocumentFamily;
  mutable: boolean;
  canManage: boolean;
  busy: boolean;
  onAdd: (
    version: DocumentVersion,
    form: DocumentRepresentationForm,
    url: string,
  ) => void;
  onRemove: (
    version: DocumentVersion,
    reference: DocumentVersionReference,
  ) => void;
  children: ReactNode;
}) {
  const copy = useDocumentVersionsCopy();
  return (
    <li
      className={`working-document-version working-document-version--${version.status}`}
    >
      <div className="working-document-version-heading">
        <h5>{copy.version(version.number)}</h5>
        <span className="working-document-version-status">
          {copy.statusLabels[version.status]}
        </span>
      </div>
      <Attribution
        label={copy.createdBy(version.createdByDisplayName)}
        at={version.createdAt}
      />
      <Designation version={version} documentType={documentType} />
      {documentType === 'questionnaire' && (
        <ol
          className="working-document-version-references"
          aria-label={copy.references(version.number)}
        >
          {version.references.map((reference) => (
            <li key={reference.id}>
              <VersionReference
                number={version.number}
                reference={reference}
                showPrimary={version.status === 'draft'}
              />
              <Attribution
                label={copy.addedBy(reference.addedByDisplayName)}
                at={reference.addedAt}
              />
              {mutable &&
                canManage &&
                version.status === 'draft' &&
                version.references.length > 1 && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onRemove(version, reference)}
                  >
                    {copy.removeReference}
                  </button>
                )}
            </li>
          ))}
        </ol>
      )}
      <div className="working-document-version-actions">{children}</div>
      {mutable && canManage && version.status !== 'superseded' && (
        <ReferenceForm
          version={version}
          busy={busy}
          onAdd={(form, url) => onAdd(version, form, url)}
        />
      )}
    </li>
  );
}

function Designation({
  version,
  documentType,
}: {
  version: DocumentVersion;
  documentType: DocumentFamily;
}) {
  const copy = useDocumentVersionsCopy();
  const missionCopy = useMissionDeliverableCopy();
  const receivedCopy = useReceivedContractCopy();
  const invoiceCopy = useExternalInvoiceCopy();
  switch (version.status) {
    case 'draft':
      return null;
    case 'official':
    case 'superseded':
      return (
        <>
          <Attribution
            label={copy.designatedBy(version.designatedByDisplayName)}
            at={version.designatedAt}
          />
          <dl className="working-document-version-frozen">
            <dt>{copy.frozenTitle}</dt>
            <dd>{version.frozen.title}</dd>
          </dl>
          <dl className="working-document-version-frozen">
            <dt>{copy.frozenPurpose}</dt>
            <dd>{version.frozen.purpose}</dd>
          </dl>
          {version.status === 'superseded' ? (
            <Attribution
              label={copy.supersededBy(version.supersededByVersionNumber)}
              at={version.supersededAt}
            />
          ) : (
            <p className="working-document-version-notice">
              {documentType === 'external-invoice'
                ? invoiceCopy.t('warning')
                : documentType === 'received-contract'
                  ? receivedCopy.t('warning')
                  : documentType === 'mission-deliverable'
                    ? missionCopy.t('warning')
                    : copy.frozenNotice}
            </p>
          )}
        </>
      );
    default: {
      const exhaustive: never = version;
      return exhaustive;
    }
  }
}

function Attribution({ label, at }: { label: string; at: string }) {
  return (
    <p className="working-document-version-attribution">
      <span>{label}</span>
      <time dateTime={at}>{formatApplicationDateTime(at)}</time>
    </p>
  );
}

/** Opens only with Representation read, in a new tab with opener isolation. */
function VersionReference({
  number,
  reference,
  showPrimary,
}: {
  number: number;
  reference: DocumentVersionReference;
  showPrimary: boolean;
}) {
  const copy = useDocumentVersionsCopy();
  const label = (
    <span className="working-document-version-reference-label">
      {copy.formLabels[reference.form]} · {copy.position(reference.position)}
      {showPrimary && reference.primary ? ` · ${copy.primary}` : ''}
      {reference.appendedAfterDesignation
        ? ` · ${copy.appendedAfterDesignation}`
        : ''}
    </span>
  );
  switch (reference.access) {
    case 'granted':
      return (
        <div className="working-document-version-reference">
          {label}
          <a
            href={reference.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={copy.openReference(number)}
          >
            {reference.url}
          </a>
        </div>
      );
    case 'denied':
      return (
        <div className="working-document-version-reference">
          {label}
          <p>{copy.referenceDenied}</p>
        </div>
      );
    default: {
      const exhaustive: never = reference;
      return exhaustive;
    }
  }
}

function ReferenceForm({
  version,
  busy,
  onAdd,
}: {
  version: DocumentVersion;
  busy: boolean;
  onAdd: (form: DocumentRepresentationForm, url: string) => void;
}) {
  const copy = useDocumentVersionsCopy();
  const id = useId();
  const [form, setForm] = useState<DocumentRepresentationForm>('other');
  const [url, setUrl] = useState('');
  const [error, setError] = useState(false);
  return (
    <form
      className="working-document-reference-form"
      onSubmit={(event) => {
        event.preventDefault();
        let parsed: URL;
        try {
          parsed = new URL(url.trim());
        } catch {
          setError(true);
          return;
        }
        if (
          parsed.protocol !== 'https:' ||
          parsed.username ||
          parsed.password
        ) {
          setError(true);
          return;
        }
        setError(false);
        onAdd(form, parsed.href);
      }}
    >
      <label htmlFor={`${id}-form`}>
        {copy.form}
        <Select
          id={`${id}-form`}
          value={form}
          options={copy.formOptions}
          onValueChange={(value) => {
            if (isRepresentationForm(value)) setForm(value);
          }}
          disabled={busy}
          required
        />
      </label>
      <label htmlFor={`${id}-url`}>
        {copy.url}
        <input
          id={`${id}-url`}
          type="url"
          required
          value={url}
          aria-invalid={error}
          aria-describedby={error ? `${id}-url-error` : undefined}
          onChange={(event) => {
            setUrl(event.target.value);
            setError(false);
          }}
          disabled={busy}
        />
      </label>
      {error && (
        <p id={`${id}-url-error`} role="alert">
          {copy.invalidUrl}
        </p>
      )}
      <button type="submit" disabled={busy}>
        {version.status === 'official'
          ? copy.appendReference
          : copy.addReference}
      </button>
    </form>
  );
}

function CommandFeedback({
  command,
  confirmationId,
  confirmButton,
  onConfirm,
  onConfirmOfficialAppend,
  onCancel,
  onRetry,
  onReload,
}: {
  command: CommandState;
  confirmationId: string;
  confirmButton: RefObject<HTMLButtonElement | null>;
  onConfirm: () => void;
  onConfirmOfficialAppend: () => void;
  onCancel: () => void;
  onRetry: (command: VersionCommand) => void;
  onReload: () => void;
}) {
  const copy = useDocumentVersionsCopy();
  switch (command.status) {
    case 'idle':
      return null;
    case 'confirming':
      if (command.action === 'official-append')
        return (
          <div
            className="working-document-version-confirmation"
            role="group"
            aria-labelledby={confirmationId}
          >
            <p id={confirmationId}>
              {copy.confirmOfficialAppend(command.versionNumber)}
            </p>
            <button
              type="button"
              ref={confirmButton}
              onClick={onConfirmOfficialAppend}
            >
              {copy.confirmAppend}
            </button>
            <button type="button" onClick={onCancel}>
              {copy.cancelAppend}
            </button>
          </div>
        );
      return (
        <div
          className="working-document-version-confirmation"
          role="group"
          aria-labelledby={confirmationId}
        >
          <p id={confirmationId}>
            {copy.confirmDesignation(
              command.versionNumber,
              command.supersededVersionNumber,
            )}
          </p>
          <button type="button" ref={confirmButton} onClick={onConfirm}>
            {copy.confirm}
          </button>
          <button type="button" onClick={onCancel}>
            {copy.cancel}
          </button>
        </div>
      );
    case 'pending':
      return <p role="status">{copy.pending}</p>;
    case 'confirmed':
      return <p role="status">{confirmedMessage(command.receipt, copy)}</p>;
    case 'uncertain':
      return (
        <>
          <p role="alert">{copy.uncertain}</p>
          <button type="button" onClick={() => onRetry(command.command)}>
            {copy.retryCommand}
          </button>
        </>
      );
    case 'refused':
      return (
        <>
          <p role="alert">{refusalMessage(command.reason, copy)}</p>
          {(command.reason === 'conflict' ||
            command.reason === 'unavailable') && (
            <button type="button" onClick={onReload}>
              {copy.reload}
            </button>
          )}
        </>
      );
    default: {
      const exhaustive: never = command;
      return exhaustive;
    }
  }
}

function confirmedMessage(
  receipt: Extract<CommandState, { status: 'confirmed' }>['receipt'],
  copy: ReturnType<typeof useDocumentVersionsCopy>,
): string {
  switch (receipt.action) {
    case 'designated_official':
      return copy.designated(receipt.versionNumber);
    case 'drafted':
      return copy.drafted(receipt.versionNumber);
    case 'representation_added':
      return copy.referenceAdded(receipt.versionNumber);
    case 'representation_removed':
      return copy.referenceRemoved(receipt.versionNumber);
    default: {
      const exhaustive: never = receipt.action;
      return exhaustive;
    }
  }
}

function refusalMessage(
  reason: Extract<CommandState, { status: 'refused' }>['reason'],
  copy: ReturnType<typeof useDocumentVersionsCopy>,
): string {
  switch (reason) {
    case 'conflict':
      return copy.conflict;
    case 'unavailable':
      return copy.unavailableCommand;
    case 'version-capacity':
      return copy.versionCapacity;
    case 'draft-reference-capacity':
      return copy.draftReferenceCapacity;
    case 'official-reference-capacity':
      return copy.officialReferenceCapacity;
    case 'denied':
      return copy.denied;
    default: {
      const exhaustive: never = reason;
      return exhaustive;
    }
  }
}

function referenceAdditionCommand(
  documentId: string,
  version: DocumentVersion,
  expectedRevision: number,
  form: DocumentRepresentationForm,
  url: string,
): VersionCommand {
  return {
    action: 'representation_added',
    path: `/documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(version.id)}/representations`,
    payload: JSON.stringify({ expectedRevision, form, url }),
    key: crypto.randomUUID(),
    capacityScope: version.status === 'official' ? 'official' : 'draft',
  };
}
