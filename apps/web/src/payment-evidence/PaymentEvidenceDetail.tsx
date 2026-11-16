import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { useAuthorityLifetime } from '../access/use-authority-lifetime';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import { useRequestLifetime } from '../api/use-actor-requests';
import { useScopedOperationGroup } from '../api/use-scoped-operation';
import { DocumentVersions } from '../documents/DocumentVersions';
import { DocumentCorrectionHistory } from '../documents/DocumentCorrectionHistory';
import { useDocumentNavigationProtection } from '../documents/document-navigation-protection';
import { formatApplicationDateTime } from '../presentation/date-time';
import {
  paymentEvidenceMetadata,
  readPaymentEvidenceDocument,
  type PaymentEvidenceDocument,
} from './payment-evidence-response';
import type { PaymentEvidenceOperationKeys } from './payment-evidence-authority';
import { usePaymentEvidenceCopy } from './payment-evidence.copy';
import type {
  PaymentEvidenceAccessCallbacks,
  PaymentEvidenceRejection as Rejected,
} from './payment-evidence-types';
import { PaymentEvidencePayer } from './PaymentEvidencePayer';
import { PaymentEvidenceMetadataCorrection } from './PaymentEvidenceMetadataCorrection';

type DetailState =
  | { status: 'loading' | 'error' | 'denied' }
  | {
      status: 'available';
      freshness: 'current' | 'refreshing' | 'failed';
      observedRead: number;
      owner: () => boolean;
      document: PaymentEvidenceDocument;
    };
export function PaymentEvidenceDetail({
  actor,
  identity,
  documentId,
  requestedVersionId,
  selectionGeneration,
  operationKeys,
  onProtectedWorkChange,
  onRejected,
  onActivityRecorded,
  registrationConfirmed = false,
  accessCallbacks,
}: {
  actor: ActorContext;
  identity: BrowserIdentity;
  documentId: string;
  requestedVersionId?: string;
  selectionGeneration: number;
  operationKeys: PaymentEvidenceOperationKeys;
  onProtectedWorkChange: (protectedWork: boolean) => void;
  onRejected: Rejected;
  onActivityRecorded?: () => void;
  registrationConfirmed?: boolean;
  accessCallbacks?: PaymentEvidenceAccessCallbacks;
}) {
  const copy = usePaymentEvidenceCopy(),
    heading = useRef<HTMLHeadingElement>(null);
  const [detail, setDetail] = useState<DetailState>({ status: 'loading' }),
    [reload, setReload] = useState(0),
    [confirmed, setConfirmed] = useState(registrationConfirmed);
  const [versionRevision, setVersionRevision] = useState<number>();
  const [deliberateReload, setDeliberateReload] = useState(0),
    [recoveryGeneration, setRecoveryGeneration] = useState(0);
  const [correctionBusy, setCorrectionBusy] = useState(false),
    [versionBusy, setVersionBusy] = useState(false);
  const scope = JSON.stringify([
    operationKeys.readKey,
    documentId,
    selectionGeneration,
    identity.loaded,
    identity.signedIn,
  ]);
  const lifetime = useAuthorityLifetime(scope, identity);
  const readGeneration = useRequestLifetime(identity, scope);
  const reads = useScopedOperationGroup(String(readGeneration));
  const callbacks = useRef({ onRejected, onActivityRecorded });
  useLayoutEffect(() => {
    callbacks.current = { onRejected, onActivityRecorded };
  });
  useDocumentNavigationProtection(
    correctionBusy || versionBusy,
    onProtectedWorkChange,
  );
  const companyId = actor.activeCompany?.id;
  const focusRequested = useRef(true);
  useEffect(() => {
    const request = reads.beginLatest();
    if (!request) return;
    const live = lifetime();
    const current = () => !request.signal.aborted && live();
    const rejected = callbacks.current.onRejected;
    const focusOrigin = document.activeElement;
    const shouldFocus = focusRequested.current;
    void (async () => {
      try {
        const api = await createAuthenticatedApiClient(identity);
        if (!current()) return;
        const result = await api.request(
          '/documents/' + encodeURIComponent(documentId),
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
            setDetail({ status: 'denied' });
            await rejected(result, request.signal, current);
            return;
          }
          throw new Error('Evidence read failed');
        }
        const loaded = readPaymentEvidenceDocument(result.value);
        if (!current()) return;
        if (loaded.id !== documentId || loaded.companyId !== companyId)
          throw new Error('Wrong evidence');
        const metadata = paymentEvidenceMetadata(loaded);
        setRecoveryGeneration((current) => Math.max(current, deliberateReload));
        setVersionRevision(metadata.workingRevision);
        setDetail({
          status: 'available',
          freshness: 'current',
          observedRead: reload,
          owner: live,
          document: metadata,
        });
        focusRequested.current = false;
        requestAnimationFrame(() => {
          if (
            shouldFocus &&
            current() &&
            document.activeElement === focusOrigin &&
            heading.current &&
            !heading.current.closest('[hidden]')
          )
            heading.current.focus();
        });
      } catch {
        if (current())
          setDetail((previous) =>
            previous.status === 'available' && previous.owner()
              ? { ...previous, freshness: 'failed' }
              : { status: 'error' },
          );
      } finally {
        request.release();
      }
    })();
    return request.retire;
  }, [
    companyId,
    deliberateReload,
    documentId,
    identity,
    lifetime,
    operationKeys.readKey,
    reads,
    reload,
    selectionGeneration,
  ]);
  const readable = detail.status === 'available' && detail.owner();
  const current =
    detail.status === 'available' && readable && detail.freshness === 'current';
  const failed =
    detail.status === 'error' ||
    (detail.status === 'available' && detail.freshness === 'failed');
  const loaded =
    detail.status === 'available' && readable ? detail.document : undefined;
  const observedRead =
    detail.status === 'available' ? detail.observedRead : undefined;
  function beginRead() {
    setDetail((previous) =>
      previous.status === 'available' && previous.owner()
        ? { ...previous, freshness: 'refreshing' }
        : { status: 'loading' },
    );
  }
  function refresh() {
    setConfirmed(true);
    beginRead();
    setReload((value) => value + 1);
    callbacks.current.onActivityRecorded?.();
  }
  function reloadEvidence() {
    beginRead();
    setDeliberateReload((value) => value + 1);
    setReload((value) => value + 1);
  }
  return (
    <article className="payment-evidence-detail working-document-detail">
      <button
        type="button"
        disabled={correctionBusy || versionBusy}
        onClick={reloadEvidence}
      >
        {copy('refresh')}
      </button>
      {!current && !failed && detail.status !== 'denied' && (
        <p role="status">{copy('loading')}</p>
      )}
      {failed && (
        <div role="alert">
          <p>{confirmed ? copy('confirmedRefreshFailed') : copy('error')}</p>
          <button type="button" onClick={reloadEvidence}>
            {copy('refresh')}
          </button>
        </div>
      )}
      {detail.status === 'denied' && <p role="alert">{copy('denied')}</p>}
      {readable && loaded && (
        <>
          <h4 ref={heading} tabIndex={-1}>
            {loaded.title}
          </h4>
          <p className="working-document-literal">{loaded.purpose}</p>
          <p>
            {copy(loaded.version.status === 'draft' ? 'draft' : 'official')}
          </p>
          <section aria-label={copy('source')}>
            <h5>{copy('source')}</h5>
            <dl>
              <dt>{copy('receivingCompany')}</dt>
              <dd>{loaded.paymentEvidenceSource.receivingCompanyLabel}</dd>
              <dt>{copy('client')}</dt>
              <dd>{loaded.clientDisplayName}</dd>
              <dt>{copy('sourceDescription')}</dt>
              <dd className="working-document-literal">
                {loaded.paymentEvidenceSource.sourceDescription}
              </dd>
              <dt>{copy('receivedOn')}</dt>
              <dd>
                {loaded.paymentEvidenceSource.receivedOn ?? copy('notRecorded')}
              </dd>
              <dt>{copy('registeredAt')}</dt>
              <dd>
                {formatApplicationDateTime(
                  loaded.paymentEvidenceSource.registeredAt,
                )}
              </dd>
              <dt>{copy('registeredBy')}</dt>
              <dd>
                {loaded.paymentEvidenceSource.registeredBy
                  .workspaceMembershipId === actor.workspaceMembershipId
                  ? actor.displayName
                  : copy('member')}
              </dd>
            </dl>
          </section>
          {operationKeys.payerKey ? (
            <PaymentEvidencePayer
              key={JSON.stringify([
                operationKeys.payerKey,
                documentId,
                selectionGeneration,
                observedRead,
              ])}
              identity={identity}
              companyId={loaded.companyId}
              documentId={documentId}
              onRejected={onRejected}
            />
          ) : (
            <p>{copy('payerUnavailable')}</p>
          )}
        </>
      )}
      <fieldset disabled={versionBusy}>
        <PaymentEvidenceMetadataCorrection
          key={operationKeys.correctKey ?? 'unavailable'}
          identity={identity}
          companyId={companyId}
          documentId={documentId}
          document={current ? loaded : undefined}
          correctKey={operationKeys.correctKey}
          recoveryGeneration={recoveryGeneration}
          onProtectedWorkChange={setCorrectionBusy}
          onConfirmed={refresh}
          onRejected={onRejected}
        />
      </fieldset>
      {loaded && (
        <DocumentCorrectionHistory
          key={JSON.stringify([operationKeys.readKey, documentId])}
          actor={actor}
          identity={identity}
          documentId={documentId}
          documentType="payment-evidence"
          operationKeys={operationKeys}
          workingRevision={loaded.workingRevision}
        />
      )}
      {versionRevision !== undefined && (
        <fieldset disabled={correctionBusy}>
          <DocumentVersions
            actor={actor}
            identity={identity}
            documentId={documentId}
            documentType="payment-evidence"
            paymentEvidenceRequestedVersionId={requestedVersionId}
            workingRevision={versionRevision}
            operationKeys={operationKeys}
            paymentEvidenceReadable={readable}
            paymentEvidenceCurrent={current}
            paymentEvidenceRecoveryGeneration={recoveryGeneration}
            {...accessCallbacks}
            onRefresh={refresh}
            onProtectedWorkChange={setVersionBusy}
          />
        </fieldset>
      )}
    </article>
  );
}
