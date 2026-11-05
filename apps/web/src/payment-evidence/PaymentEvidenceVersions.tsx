import { useCallback, useEffect, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { useAuthorityLifetime } from '../access/use-authority-lifetime';
import {
  createAuthenticatedApiClient,
  type ApiResult,
} from '../api/authenticated-api-client';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
import {
  readDocumentVersions,
  type DocumentVersion,
  type DocumentVersionReceipt,
  type DocumentVersions,
} from '../documents/document-response';
import { useDocumentVersionsCopy } from '../documents/document-versions.copy';
import { useDocumentPdfCopy } from '../documents/document-pdf.copy';
import { useDocumentNavigationProtection } from '../documents/document-navigation-protection';
import { useInterfaceLocale } from '../localization/interface-locale';
import {
  paymentEvidenceAuthority,
  type PaymentEvidenceOperationKeys,
} from './payment-evidence-authority';
import type { PaymentEvidenceAccessCallbacks } from './payment-evidence-types';
import { PaymentEvidenceVersionCommand } from './PaymentEvidenceVersionCommand';
import { PaymentEvidencePdf } from './PaymentEvidencePdf';
import { usePaymentEvidenceCopy } from './payment-evidence.copy';

export interface PaymentEvidenceVersionsProps extends PaymentEvidenceAccessCallbacks {
  actor: ActorContext;
  identity: BrowserIdentity;
  documentId: string;
  documentType?: 'payment-evidence';
  workingRevision: number;
  operationKeys: PaymentEvidenceOperationKeys;
  metadataReadable?: boolean;
  onRefresh: () => Promise<void> | void;
  onProtectedWorkChange?: (protectedWork: boolean) => void;
}
type Read =
  | { status: 'loading' | 'error' | 'denied' }
  | { status: 'ready'; owner: () => boolean; page: DocumentVersions };
/** Native reference-free Versions with independent read, designation and upload owners. */
export function PaymentEvidenceVersions(props: PaymentEvidenceVersionsProps) {
  const copy = useDocumentVersionsCopy();
  const { actor, ...sourceProps } = props;
  const authority = paymentEvidenceAuthority(actor);
  const [owner, setOwner] = useState({
    identity: props.identity,
    generation: 0,
  });
  if (owner.identity !== props.identity)
    setOwner({ identity: props.identity, generation: owner.generation + 1 });
  if (!authority || authority.readKey !== props.operationKeys.readKey)
    return <p>{copy.unavailable}</p>;
  return (
    <SourceVersions
      key={JSON.stringify([
        props.actor.internalUserId,
        props.actor.workspaceId,
        props.actor.workspaceMembershipId,
        authority.companyId,
        props.documentId,
        owner.generation,
      ])}
      {...sourceProps}
      companyId={authority.companyId}
    />
  );
}
function SourceVersions({
  identity,
  documentId,
  workingRevision,
  operationKeys,
  metadataReadable = true,
  onRefresh,
  onProtectedWorkChange,
  companyId,
  ...accessCallbacks
}: Omit<PaymentEvidenceVersionsProps, 'actor'> & { companyId: string }) {
  const copy = useDocumentVersionsCopy(),
    sourceCopy = usePaymentEvidenceCopy(),
    locale = useInterfaceLocale();
  const [read, setRead] = useState<Read>({ status: 'loading' }),
    [retry, setRetry] = useState(0),
    [confirmedRevision, setConfirmedRevision] = useState(0),
    [confirmed, setConfirmed] = useState(false);
  const [selection, setSelection] = useState<{
    version: Pick<DocumentVersion, 'id' | 'number'> | undefined;
    generation: number;
  }>({ version: undefined, generation: 0 });
  const [busy, setBusy] = useState({
    successor: false,
    designation: false,
    upload: false,
  });
  const life = useAuthorityLifetime(
      JSON.stringify([operationKeys.readKey, metadataReadable]),
      identity,
    ),
    callbacks = useRef({ onRefresh, ...accessCallbacks });
  callbacks.current = { onRefresh, ...accessCallbacks };
  const requestedRevision = Math.max(workingRevision, confirmedRevision);
  useDocumentNavigationProtection(
    busy.successor || busy.designation || busy.upload,
    onProtectedWorkChange,
  );
  const rejected = useCallback(
    async (
      result: ApiResult<unknown>,
      signal: AbortSignal,
      isCurrent: () => boolean,
    ) => {
      if (!isCurrent() || signal.aborted) return;
      await handleAuthenticatedAccessRejection({
        result,
        identity,
        companyContextId: companyId,
        signal,
        isCurrent,
        onCompanyContextRejected: (id) =>
          callbacks.current.onCompanyContextRejected?.(id),
        onActorRevalidated: (next) =>
          callbacks.current.onActorRevalidated?.(next),
        onWorkspaceAccessRejected: () =>
          callbacks.current.onWorkspaceAccessRejected?.(),
      });
    },
    [companyId, identity],
  );
  useEffect(() => {
    if (!metadataReadable) return;
    const request = new AbortController(),
      live = life(),
      current = () => !request.signal.aborted && live();
    void (async () => {
      try {
        const api = await createAuthenticatedApiClient(identity);
        if (!current()) return;
        const result = await api.request<unknown>(
          '/documents/' + encodeURIComponent(documentId) + '/versions',
          {
            companyContextId: companyId,
            signal: request.signal,
            cache: 'no-store',
          },
        );
        if (!current()) return;
        if (result.status !== 'ok') {
          if (
            result.status === 'unauthorized' ||
            result.status === 'forbidden' ||
            result.status === 'notFound'
          ) {
            setRead({ status: 'denied' });
            await rejected(result, request.signal, current);
            return;
          }
          throw new Error('Version read unavailable');
        }
        const page = readDocumentVersions(result.value, 'payment-evidence');
        if (!current()) return;
        if (
          !page.versions.length ||
          page.workingRevision < requestedRevision ||
          page.versions.some((version) => !uuid(version.id))
        )
          throw new Error('Invalid evidence Version read');
        // Protected PDF metadata belongs only to the independently keyed PDF reader.
        const metadata = {
          ...page,
          versions: page.versions.map((version) => ({
            ...version,
            pdfContent:
              version.pdfContent.state === 'absent'
                ? { state: 'absent' as const }
                : { state: 'stored' as const, access: 'denied' as const },
          })),
        };
        setRead({
          status: 'ready',
          owner: live,
          page: metadata,
        });
        setSelection((currentSelection) =>
          currentSelection.version === undefined
            ? {
                version: metadata.versions[0]
                  ? {
                      id: metadata.versions[0].id,
                      number: metadata.versions[0].number,
                    }
                  : undefined,
                generation: currentSelection.generation + 1,
              }
            : currentSelection,
        );
      } catch {
        if (current()) setRead({ status: 'error' });
      }
    })();
    return () => request.abort();
  }, [
    companyId,
    documentId,
    identity,
    life,
    operationKeys.readKey,
    metadataReadable,
    rejected,
    requestedRevision,
    retry,
  ]);
  const readable =
    metadataReadable &&
    read.status === 'ready' &&
    read.owner() &&
    read.page.workingRevision >= requestedRevision;
  const page = readable ? read.page : undefined;
  const selected = page?.versions.find(
    (version) => version.id === selection.version?.id,
  );
  const official = page?.versions.find(
    (version) => version.status === 'official',
  );
  const canWrite = Boolean(
    readable && page?.mutable && page.workingRevision < 2147483647,
  );
  const canStartSuccessor = Boolean(
    canWrite &&
    page &&
    page.versions.length < 50 &&
    !page.versions.some((version) => version.status === 'draft') &&
    official,
  );
  const draftTarget =
    selected?.status === 'draft' && selected.pdfContent.state === 'stored'
      ? selected
      : undefined;
  async function refresh(receipt: DocumentVersionReceipt) {
    setConfirmed(true);
    setConfirmedRevision((value) => Math.max(value, receipt.workingRevision));
    // The durable receipt remains confirmed even if either native refresh fails.
    await Promise.resolve(callbacks.current.onRefresh()).catch(() => undefined);
  }
  const report = useCallback(
    (kind: 'successor' | 'designation' | 'upload', value: boolean) =>
      setBusy((current) =>
        current[kind] === value ? current : { ...current, [kind]: value },
      ),
    [],
  );
  return (
    <section
      className="working-document-versions payment-evidence-versions"
      aria-label={copy.title}
    >
      <h5>{copy.title}</h5>
      {!readable && read.status !== 'error' && read.status !== 'denied' && (
        <p role="status">{copy.loading}</p>
      )}
      {read.status === 'error' && (
        <div role="alert">
          <p>{confirmed ? sourceCopy('confirmedRefreshFailed') : copy.error}</p>
          <button type="button" onClick={() => setRetry((value) => value + 1)}>
            {copy.retry}
          </button>
        </div>
      )}
      {read.status === 'denied' && <p role="alert">{copy.unavailable}</p>}
      {readable && page && (
        <>
          {!page.mutable && <p>{copy.readOnly}</p>}
          <ol aria-label={copy.list}>
            {page.versions.map((version) => (
              <li key={version.id}>
                <button
                  type="button"
                  aria-pressed={selection.version?.id === version.id}
                  disabled={busy.successor || busy.designation || busy.upload}
                  onClick={() =>
                    setSelection((current) => ({
                      version: { id: version.id, number: version.number },
                      generation: current.generation + 1,
                    }))
                  }
                >
                  {copy.version(version.number)}
                </button>{' '}
                · {copy.statusLabels[version.status]} ·{' '}
                <time dateTime={version.createdAt}>
                  {locale.formatDateTime(version.createdAt)}
                </time>{' '}
                · {copy.createdBy(version.createdByDisplayName)}
              </li>
            ))}
          </ol>
          {selected && <VersionIdentity key={selected.id} version={selected} />}
        </>
      )}
      <fieldset disabled={busy.designation || busy.upload}>
        {operationKeys.successorKey && (
          <PaymentEvidenceVersionCommand
            key={operationKeys.successorKey}
            identity={identity}
            companyId={companyId}
            documentId={documentId}
            authorityKey={operationKeys.successorKey}
            action="drafted"
            expectedRevision={page?.workingRevision ?? workingRevision}
            sourceVersion={official}
            target={undefined}
            canStart={canStartSuccessor}
            onConfirmed={refresh}
            onProtectedWorkChange={(value) => report('successor', value)}
            onRejected={rejected}
          />
        )}
      </fieldset>
      <fieldset disabled={busy.successor || busy.upload}>
        {operationKeys.designateKey && (
          <PaymentEvidenceVersionCommand
            key={operationKeys.designateKey}
            identity={identity}
            companyId={companyId}
            documentId={documentId}
            authorityKey={operationKeys.designateKey}
            action="designated_official"
            expectedRevision={page?.workingRevision ?? workingRevision}
            sourceVersion={official}
            target={draftTarget}
            canStart={Boolean(canWrite && draftTarget)}
            onConfirmed={refresh}
            onProtectedWorkChange={(value) => report('designation', value)}
            onRejected={rejected}
          />
        )}
      </fieldset>
      {selection.version && (
        <PaymentEvidencePdf
          key={JSON.stringify([selection.version.id, selection.generation])}
          identity={identity}
          companyId={companyId}
          documentId={documentId}
          versionId={selection.version.id}
          versionNumber={selection.version.number}
          workingRevision={Math.max(
            requestedRevision,
            page?.workingRevision ?? 0,
          )}
          contentState={selected?.pdfContent.state ?? 'absent'}
          readable={readable}
          contentReadKey={operationKeys.contentReadKey}
          uploadKey={operationKeys.uploadKey}
          canUpload={Boolean(canWrite && selected?.status === 'draft')}
          uploadDisabled={busy.successor || busy.designation}
          onConfirmed={refresh}
          onProtectedWorkChange={(value) => report('upload', value)}
          onRejected={rejected}
        />
      )}
    </section>
  );
}
function VersionIdentity({ version }: { version: DocumentVersion }) {
  const copy = useDocumentVersionsCopy(),
    pdfCopy = useDocumentPdfCopy(),
    locale = useInterfaceLocale();
  return (
    <section aria-label={copy.version(version.number)}>
      <h6>
        {copy.version(version.number)} · {copy.statusLabels[version.status]}
      </h6>
      {version.status !== 'draft' && (
        <>
          <p>
            {copy.designatedBy(version.designatedByDisplayName)} ·{' '}
            <time dateTime={version.designatedAt}>
              {locale.formatDateTime(version.designatedAt)}
            </time>
          </p>
          <dl>
            <dt>{copy.frozenTitle}</dt>
            <dd>{version.frozen.title}</dd>
            <dt>{copy.frozenPurpose}</dt>
            <dd>{version.frozen.purpose}</dd>
          </dl>
          <p>{pdfCopy.t('preserved')}</p>
        </>
      )}
      {version.status === 'superseded' && (
        <p>
          {copy.supersededBy(version.supersededByVersionNumber)} ·{' '}
          <time dateTime={version.supersededAt}>
            {locale.formatDateTime(version.supersededAt)}
          </time>
        </p>
      )}
    </section>
  );
}
function uuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
    value,
  );
}
