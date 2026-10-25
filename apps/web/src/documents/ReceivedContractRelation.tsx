import { useEffect, useRef, useState } from 'react';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
import { formatApplicationDateTime } from '../presentation/date-time';
import { readDocumentDetail } from './document-response';
import {
  canReadReceivedContractRelation,
  receivedContractSourceAuthority,
} from './received-contract-access';
import type { ReceivedContractRelation as Relation } from './received-contract-response';
import { useReceivedContractCopy } from './received-contract.copy';

/** Relation authority is independent of the sibling PDF/Version owner. */
type Props = {
  actor: ActorContext;
  identity: BrowserIdentity;
  documentId: string;
  onActorRevalidated?: (actor: ActorContext) => Promise<void> | void;
  onCompanyContextRejected?: (companyId: string) => Promise<void> | void;
  onWorkspaceAccessRejected?: () => Promise<void> | void;
};
const ignore = () => undefined;
export function ReceivedContractRelation(props: Props) {
  return (
    <RelationSession
      key={JSON.stringify([
        props.actor.workspaceId,
        props.actor.workspaceMembershipId,
        props.actor.activeCompany?.id,
        props.documentId,
        receivedContractSourceAuthority(props.actor.activeCompany),
      ])}
      {...props}
    />
  );
}
function RelationSession({ actor, identity, documentId, ...callbacks }: Props) {
  const copy = useReceivedContractCopy();
  const [relation, setRelation] = useState<Relation>();
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const companyId = actor.activeCompany?.id;
  const allowed = canReadReceivedContractRelation(actor.activeCompany);
  const rejection = useRef(callbacks);
  rejection.current = callbacks;
  useEffect(() => {
    if (!allowed || !companyId) return;
    const request = new AbortController();
    void (async () => {
      try {
        const api = await createAuthenticatedApiClient(identity);
        if (request.signal.aborted) return;
        const result = await api.request<unknown>(
          `/documents/${encodeURIComponent(documentId)}`,
          { companyContextId: companyId, signal: request.signal },
        );
        if (request.signal.aborted) return;
        if (result.status === 'unauthorized') {
          await identity.rejectSession();
          return;
        }
        if (result.status === 'forbidden' || result.status === 'notFound') {
          setRelation({ access: 'denied' });
          return;
        }
        if (result.status !== 'ok') throw new Error('Relation unavailable');
        const document = readDocumentDetail(result.value);
        if (document.id !== documentId || document.type !== 'received-contract')
          throw new Error('Invalid related Document');
        setRelation(document.receivedContractRelation);
        setFailed(false);
        // A denied related projection can arrive with an otherwise readable Document.
        // Refresh the actor through the existing access owner, without retiring PDF work.
        if (document.receivedContractRelation.access === 'denied')
          await handleAuthenticatedAccessRejection({
            result: { status: 'forbidden' },
            identity,
            companyContextId: companyId,
            signal: request.signal,
            onActorRevalidated: rejection.current.onActorRevalidated ?? ignore,
            onCompanyContextRejected:
              rejection.current.onCompanyContextRejected ?? ignore,
            onWorkspaceAccessRejected:
              rejection.current.onWorkspaceAccessRejected ?? ignore,
          });
      } catch {
        if (!request.signal.aborted) setFailed(true);
      }
    })();
    return () => request.abort();
  }, [identity, companyId, documentId, allowed, revision]);
  if (!allowed || relation?.access === 'denied')
    return <p>{copy.t('relationDenied')}</p>;
  if (failed)
    return (
      <>
        <p role="alert">{copy.t('loadFailed')}</p>
        <button onClick={() => setRevision((value) => value + 1)}>
          {copy.t('retryLoad')}
        </button>
      </>
    );
  if (!relation) return <p role="status">{copy.t('loading')}</p>;
  return (
    <section aria-label={copy.t('relation')}>
      <h4>{copy.t('relation')}</h4>
      <button type="button" onClick={() => setRevision((value) => value + 1)}>
        {copy.t('reloadRelation')}
      </button>
      <p>
        {copy.versionLabel(
          relation.illustrativeReference,
          relation.contractVersionNumber,
        )}
      </p>
      <dl>
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
      </dl>
    </section>
  );
}
