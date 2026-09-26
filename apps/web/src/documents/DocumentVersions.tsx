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
import {
  readDocumentVersionReceipt,
  readDocumentVersions,
  type DocumentReference,
  type DocumentVersion,
  type DocumentVersions as VersionsRead,
} from './document-response';
import { documentVersionsCopy as copy } from './document-versions.copy';
import './document-versions.css';

type ReadState =
  | { status: 'loading' | 'error' | 'unavailable' }
  | { status: 'ready'; read: VersionsRead };

/** One Version command exactly as submitted; a retry resends it unchanged. */
interface VersionCommand {
  action: 'designated_official' | 'drafted';
  path: string;
  payload: string;
  key: string;
}
type CommandState =
  | { status: 'idle' }
  | {
      status: 'confirming';
      versionId: string;
      versionNumber: number;
      supersededVersionNumber: number | null;
      expectedRevision: number;
    }
  | { status: 'pending'; command: VersionCommand }
  | { status: 'uncertain'; command: VersionCommand }
  | { status: 'confirmed'; message: string }
  | {
      status: 'refused';
      reason: 'conflict' | 'unavailable' | 'capacity' | 'denied';
    };

interface AccessRejection {
  onCompanyContextRejected: (companyId: string) => Promise<void> | void;
  onActorRevalidated: (actor: ActorContext) => Promise<void> | void;
  onWorkspaceAccessRejected: () => Promise<void> | void;
}

/**
 * The formal Versions of one open working Document: each Version's status,
 * attribution and reference, with the designation and new-draft commands the
 * live permissions allow. It is keyed to the Document, member, Company and
 * Document permission set, including the Approver assignment, it was read
 * under: any change starts a new section, whose predecessor's late replies
 * never render. A pending command is never cancelled.
 */
export function DocumentVersions({
  actor,
  identity,
  documentId,
  workingRevision,
  onRefresh,
  onCompanyContextRejected = () => undefined,
  onActorRevalidated = () => undefined,
  onWorkspaceAccessRejected = () => undefined,
}: {
  actor: ActorContext;
  identity: BrowserIdentity;
  documentId: string;
  /** The open Document's revision; a newer one reloads the Versions. */
  workingRevision: number;
  /** Re-reads the open Document and its list after a confirmed or stale command. */
  onRefresh: () => Promise<void> | void;
} & Partial<AccessRejection>) {
  const company = actor.activeCompany;
  const permissions = company?.documentPermissions ?? [];
  if (!company || !permissions.includes('document.read')) return null;
  const canReadReference = permissions.includes('document.reference.read');
  return (
    <VersionsSection
      key={JSON.stringify([
        actor.workspaceId,
        actor.workspaceMembershipId,
        company.id,
        documentId,
        [...permissions].sort(),
        company.documentPermissionSetVersion ?? null,
        company.documentApproverAssignmentId ?? null,
        company.clientPermissions?.includes('client.read') === true,
        actor.workspacePermissions.includes('client.manage'),
      ])}
      identity={identity}
      companyId={company.id}
      documentId={documentId}
      workingRevision={workingRevision}
      canDesignate={
        canReadReference &&
        permissions.includes('document.version.designate_official')
      }
      canStartDraft={
        canReadReference && permissions.includes('document.version.manage')
      }
      onRefresh={onRefresh}
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
  workingRevision,
  canDesignate,
  canStartDraft,
  onRefresh,
  rejection,
}: {
  identity: BrowserIdentity;
  companyId: string;
  documentId: string;
  workingRevision: number;
  canDesignate: boolean;
  canStartDraft: boolean;
  onRefresh: () => Promise<void> | void;
  rejection: AccessRejection;
}) {
  const titleId = useId();
  const confirmationId = useId();
  const [read, setRead] = useState<ReadState>({ status: 'loading' });
  const [reloads, setReloads] = useState(0);
  const [command, setCommand] = useState<CommandState>({ status: 'idle' });
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
        setRead({ status: 'ready', read: readDocumentVersions(result.value) });
      },
      onError: () => setRead({ status: 'error' }),
    });
  }, [identity, companyId, documentId]);

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
                ? 'capacity'
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
            message:
              receipt.action === 'designated_official'
                ? copy.designated(receipt.versionNumber)
                : copy.drafted(receipt.versionNumber),
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
    if (command.status !== 'confirming') return;
    void submit({
      action: 'designated_official',
      path: `/documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(command.versionId)}/official-designation`,
      payload: JSON.stringify({ expectedRevision: command.expectedRevision }),
      key: crypto.randomUUID(),
    });
  }

  /** An explicit reload of the open Document and its Versions. */
  function reload(): void {
    setCommand({ status: 'idle' });
    setReloads((count) => count + 1);
    void Promise.resolve(refresh.current()).catch(() => undefined);
  }

  const busy =
    command.status === 'pending' ||
    command.status === 'uncertain' ||
    command.status === 'confirming';

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
              <VersionRow key={version.id} version={version}>
                {read.read.mutable &&
                  canDesignate &&
                  version.status === 'draft' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        setCommand({
                          status: 'confirming',
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
        onCancel={() => setCommand({ status: 'idle' })}
        onRetry={(pending) => void submit(pending)}
        onReload={reload}
      />
    </section>
  );
}

function VersionRow({
  version,
  children,
}: {
  version: DocumentVersion;
  children: ReactNode;
}) {
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
      <Designation version={version} />
      <VersionReference number={version.number} reference={version.reference} />
      <div className="working-document-version-actions">{children}</div>
    </li>
  );
}

function Designation({ version }: { version: DocumentVersion }) {
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
              {copy.frozenNotice}
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
}: {
  number: number;
  reference: DocumentReference;
}) {
  switch (reference.access) {
    case 'granted':
      return (
        <a href={reference.url} target="_blank" rel="noopener noreferrer">
          {copy.openReference(number)}
        </a>
      );
    case 'denied':
      return <p>{copy.referenceDenied}</p>;
    default: {
      const exhaustive: never = reference;
      return exhaustive;
    }
  }
}

function CommandFeedback({
  command,
  confirmationId,
  confirmButton,
  onConfirm,
  onCancel,
  onRetry,
  onReload,
}: {
  command: CommandState;
  confirmationId: string;
  confirmButton: RefObject<HTMLButtonElement | null>;
  onConfirm: () => void;
  onCancel: () => void;
  onRetry: (command: VersionCommand) => void;
  onReload: () => void;
}) {
  switch (command.status) {
    case 'idle':
      return null;
    case 'confirming':
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
      return <p role="status">{command.message}</p>;
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
          <p role="alert">{refusalMessage(command.reason)}</p>
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

function refusalMessage(
  reason: Extract<CommandState, { status: 'refused' }>['reason'],
): string {
  switch (reason) {
    case 'conflict':
      return copy.conflict;
    case 'unavailable':
      return copy.unavailableCommand;
    case 'capacity':
      return copy.capacity;
    case 'denied':
      return copy.denied;
    default: {
      const exhaustive: never = reason;
      return exhaustive;
    }
  }
}
