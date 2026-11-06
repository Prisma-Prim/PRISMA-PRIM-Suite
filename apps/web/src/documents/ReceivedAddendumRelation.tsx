import { useEffect, useRef, useState } from 'react';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import { useAuthorityLifetime } from '../access/use-authority-lifetime';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
import { formatApplicationDateTime } from '../presentation/date-time';
import { readDocumentDetail } from './document-response';
import {
  canReadReceivedAddendumRelation,
  receivedAddendumSourceAuthority,
} from './received-addendum-access';
import type { ReceivedAddendumRelation as Relation } from './received-addendum-response';
import { useReceivedAddendumCopy } from './received-addendum.copy';

type Props = {
  actor: ActorContext;
  identity: BrowserIdentity;
  documentId: string;
  onActorRevalidated?: (actor: ActorContext) => Promise<void> | void;
  onCompanyContextRejected?: (companyId: string) => Promise<void> | void;
  onWorkspaceAccessRejected?: () => Promise<void> | void;
};
type Capture = ReturnType<typeof useAuthorityLifetime>;
type Projection =
  { status: 'loading' | 'error' } | { status: 'ready'; relation: Relation };
/** The parent projection consumes no sibling PDF or Version authority. */
export function ReceivedAddendumRelation(props: Props) {
  const signature = JSON.stringify([
    receivedAddendumSourceAuthority(props.actor),
    props.documentId,
    props.identity.loaded,
    props.identity.signedIn,
  ]);
  const captureOwner = useAuthorityLifetime(signature, props.identity);
  // An unrelated Actor update preserves the projection but retires a held full-Actor recovery.
  const captureRecovery = useAuthorityLifetime(
    JSON.stringify(props.actor),
    props.identity,
  );
  const [owner, setOwner] = useState({
    signature,
    identity: props.identity,
    generation: 0,
  });
  if (owner.signature !== signature || owner.identity !== props.identity)
    setOwner({
      signature,
      identity: props.identity,
      generation: owner.generation + 1,
    });
  return (
    <RelationSession
      key={JSON.stringify([signature, owner.generation])}
      {...props}
      captureOwner={captureOwner}
      captureRecovery={captureRecovery}
    />
  );
}
function RelationSession({
  actor,
  identity,
  documentId,
  captureOwner,
  captureRecovery,
  ...callbacks
}: Props & { captureOwner: Capture; captureRecovery: Capture }) {
  const copy = useReceivedAddendumCopy();
  const [projection, setProjection] = useState<Projection>({
    status: 'loading',
  });
  const [revision, setRevision] = useState(0);
  const companyId = actor.activeCompany?.id;
  const allowed =
    identity.loaded &&
    identity.signedIn &&
    canReadReceivedAddendumRelation(actor);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  useEffect(() => {
    if (!allowed || !companyId) return;
    const request = new AbortController(),
      owner = captureOwner(),
      recovery = captureRecovery();
    const current = () => !request.signal.aborted && owner();
    const currentRecovery = () => current() && recovery();
    setProjection({ status: 'loading' });
    async function reject() {
      if (!currentRecovery()) return;
      await handleAuthenticatedAccessRejection({
        result: { status: 'forbidden' },
        identity,
        companyContextId: companyId,
        signal: request.signal,
        isCurrent: currentRecovery,
        onActorRevalidated: (next) => {
          if (currentRecovery())
            return callbacksRef.current.onActorRevalidated?.(next);
        },
        onCompanyContextRejected: (id) => {
          if (currentRecovery())
            void callbacksRef.current.onCompanyContextRejected?.(id);
        },
        onWorkspaceAccessRejected: () => {
          if (currentRecovery())
            return callbacksRef.current.onWorkspaceAccessRejected?.();
        },
      });
    }
    void (async () => {
      try {
        const api = await createAuthenticatedApiClient(identity);
        if (!current()) return;
        const result = await api.request<unknown>(
          `/documents/${encodeURIComponent(documentId)}`,
          {
            companyContextId: companyId,
            signal: request.signal,
            cache: 'no-store',
          },
        );
        if (!current()) return;
        if (result.status === 'unauthorized') {
          setProjection({ status: 'error' });
          if (currentRecovery()) await identity.rejectSession();
          return;
        }
        if (result.status === 'forbidden' || result.status === 'notFound') {
          setProjection({ status: 'ready', relation: { access: 'denied' } });
          await reject();
          return;
        }
        if (result.status !== 'ok') throw new Error('Relation unavailable');
        const document = readDocumentDetail(result.value);
        if (!current()) return;
        if (
          document.id !== documentId ||
          document.companyId !== companyId ||
          document.type !== 'received-addendum'
        )
          throw new Error('Invalid related Document');
        setProjection({
          status: 'ready',
          relation: document.receivedAddendumRelation,
        });
        if (document.receivedAddendumRelation.access === 'denied')
          await reject();
      } catch {
        // A failed access recovery must never replace the deliberate unavailable projection.
        if (current())
          setProjection((previous) =>
            previous.status === 'ready' && previous.relation.access === 'denied'
              ? previous
              : { status: 'error' },
          );
      }
    })();
    return () => request.abort();
  }, [
    allowed,
    captureOwner,
    captureRecovery,
    companyId,
    documentId,
    identity,
    revision,
  ]);
  if (
    !allowed ||
    (projection.status === 'ready' && projection.relation.access === 'denied')
  )
    return <p>{copy.t('relationDenied')}</p>;
  if (projection.status === 'error')
    return (
      <>
        <p role="alert">{copy.t('relationLoadFailed')}</p>
        <button type="button" onClick={() => setRevision((value) => value + 1)}>
          {copy.t('retryLoad')}
        </button>
      </>
    );
  if (projection.status !== 'ready' || projection.relation.access !== 'granted')
    return <p role="status">{copy.t('loading')}</p>;
  const relation = projection.relation;
  return (
    <section aria-label={copy.t('relation')}>
      <h4>{copy.t('relation')}</h4>
      <p className="working-documents-warning">{copy.t('warning')}</p>
      <button type="button" onClick={() => setRevision((value) => value + 1)}>
        {copy.t('reloadRelation')}
      </button>
      <p>
        {copy.versionLabel(
          relation.illustrativeReference,
          relation.contractVersionNumber,
        )}
      </p>
      <dl className="working-document-party">
        <dt>
          {copy.t('recipient')} ·{' '}
          {copy.t(
            relation.recordedRecipient.kind === 'PRIMARY'
              ? 'primaryRecipient'
              : 'additionalRecipient',
          )}
        </dt>
        <dd className="working-document-literal">
          {relation.recordedRecipient.legalName}
        </dd>
        {relation.recordedRecipient.taxId !== null && (
          <>
            <dt>{copy.t('taxId')}</dt>
            <dd className="working-document-literal">
              {relation.recordedRecipient.taxId}
            </dd>
          </>
        )}
        {relation.recordedRecipient.legalAddress !== null && (
          <>
            <dt>{copy.t('legalAddress')}</dt>
            <dd className="working-document-literal">
              {relation.recordedRecipient.legalAddress}
            </dd>
          </>
        )}
        <dt>{copy.t('declaredSource')}</dt>
        <dd className="working-document-literal">
          {relation.sourceDescription}
        </dd>
        <dt>{copy.t('receivedOn')}</dt>
        <dd>{relation.receivedOn ?? copy.t('unknownDate')}</dd>
        <dt>{copy.t('registeredAt')}</dt>
        <dd>
          <time dateTime={relation.registeredAt}>
            {formatApplicationDateTime(relation.registeredAt)}
          </time>
        </dd>
        <dt>{copy.t('registeredBy')}</dt>
        <dd className="working-document-literal">
          <span>{relation.registeredBy.internalUserId}</span> /{' '}
          <span>{relation.registeredBy.workspaceMembershipId}</span>
        </dd>
      </dl>
    </section>
  );
}
