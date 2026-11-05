import { useEffect, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { useAuthorityLifetime } from '../access/use-authority-lifetime';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
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
      status: 'ready';
      owner: () => boolean;
      document: PaymentEvidenceDocument;
    };
export function PaymentEvidenceDetail({
  actor,
  identity,
  documentId,
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
  const [correctionBusy, setCorrectionBusy] = useState(false),
    [versionBusy, setVersionBusy] = useState(false);
  const lifetime = useAuthorityLifetime(
    JSON.stringify([operationKeys.readKey, documentId, selectionGeneration]),
    identity,
  );
  const callbacks = useRef({ onRejected, onActivityRecorded });
  callbacks.current = { onRejected, onActivityRecorded };
  useDocumentNavigationProtection(
    correctionBusy || versionBusy,
    onProtectedWorkChange,
  );
  const companyId = actor.activeCompany?.id;
  const focusRequested = useRef(true);
  useEffect(() => {
    const request = new AbortController(),
      live = lifetime(),
      current = () => !request.signal.aborted && live();
    const focusOrigin = document.activeElement;
    const shouldFocus = focusRequested.current;
    void (async () => {
      try {
        const api = await createAuthenticatedApiClient(identity);
        if (!current()) return;
        const result = await api.request<unknown>(
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
            await callbacks.current.onRejected(result, request.signal, current);
            return;
          }
          throw new Error('Evidence read failed');
        }
        const loaded = readPaymentEvidenceDocument(result.value);
        if (!current()) return;
        if (loaded.id !== documentId || loaded.companyId !== companyId)
          throw new Error('Wrong evidence');
        const metadata = paymentEvidenceMetadata(loaded);
        setVersionRevision(metadata.workingRevision);
        setDetail({
          status: 'ready',
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
        if (current()) setDetail({ status: 'error' });
      }
    })();
    return () => request.abort();
  }, [
    companyId,
    documentId,
    identity,
    lifetime,
    operationKeys.readKey,
    reload,
    selectionGeneration,
  ]);
  const readable = detail.status === 'ready' && detail.owner();
  const loaded =
    detail.status === 'ready' && readable ? detail.document : undefined;
  function refresh() {
    setConfirmed(true);
    setDetail({ status: 'loading' });
    setReload((value) => value + 1);
    callbacks.current.onActivityRecorded?.();
  }
  return (
    <article className="payment-evidence-detail working-document-detail">
      <button
        type="button"
        disabled={correctionBusy || versionBusy}
        onClick={() => {
          setDetail({ status: 'loading' });
          setReload((value) => value + 1);
        }}
      >
        {copy('refresh')}
      </button>
      {!readable && detail.status !== 'error' && detail.status !== 'denied' && (
        <p role="status">{copy('loading')}</p>
      )}
      {detail.status === 'error' && (
        <div role="alert">
          <p>{confirmed ? copy('confirmedRefreshFailed') : copy('error')}</p>
          <button type="button" onClick={() => setReload((value) => value + 1)}>
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
          document={readable ? loaded : undefined}
          correctKey={operationKeys.correctKey}
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
            workingRevision={versionRevision}
            operationKeys={operationKeys}
            paymentEvidenceReadable={readable}
            {...accessCallbacks}
            onRefresh={refresh}
            onProtectedWorkChange={setVersionBusy}
          />
        </fieldset>
      )}
    </article>
  );
}
