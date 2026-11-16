import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import { useAuthorityLifetime } from '../access/use-authority-lifetime';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import { useRequestLifetime } from '../api/use-actor-requests';
import { useScopedOperationGroup } from '../api/use-scoped-operation';
import { useDocumentNavigationProtection } from '../documents/document-navigation-protection';
import {
  paymentEvidenceAuthority,
  type PaymentEvidenceOperationKeys,
} from './payment-evidence-authority';
import {
  paymentEvidenceMetadata,
  readPaymentEvidenceDocuments,
  type PaymentEvidenceDocument,
} from './payment-evidence-response';
import { usePaymentEvidenceCopy } from './payment-evidence.copy';
import { PaymentEvidenceRegistration } from './PaymentEvidenceRegistration';
import { PaymentEvidenceDetail } from './PaymentEvidenceDetail';
import { usePaymentEvidenceAccessRecovery } from './use-payment-evidence-access-recovery';
import type {
  PaymentEvidenceAccessCallbacks,
  PaymentEvidenceSelection,
  PaymentEvidenceTarget,
} from './payment-evidence-types';
import './payment-evidence.css';
export type {
  PaymentEvidenceSelection,
  PaymentEvidenceTarget,
} from './payment-evidence-types';

export interface PaymentEvidenceSourcePanelProps extends PaymentEvidenceAccessCallbacks {
  actor: ActorContext;
  identity: BrowserIdentity;
  selection: PaymentEvidenceSelection;
  onSelect: (target: PaymentEvidenceTarget) => void;
  onProtectedWorkChange: (protectedWork: boolean) => void;
  onActivityRecorded?: () => void;
}
/** A single native Document-family pane; its host owns navigation and selection. */
export function PaymentEvidenceSourcePanel(
  props: PaymentEvidenceSourcePanelProps,
) {
  const copy = usePaymentEvidenceCopy(),
    authority = paymentEvidenceAuthority(props.actor);
  const identityGeneration = useRequestLifetime(
    props.identity,
    JSON.stringify([props.identity.loaded, props.identity.signedIn]),
  );
  if (!authority || !props.identity.loaded || !props.identity.signedIn)
    return (
      <section
        className="working-documents payment-evidence-source working-documents--prisme"
        aria-label={copy('title')}
      >
        <h3>{copy('title')}</h3>
        <p role="alert">{copy('denied')}</p>
      </section>
    );
  return (
    <AvailablePaymentEvidencePanel
      key={JSON.stringify([
        props.actor.internalUserId,
        props.actor.workspaceId,
        props.actor.workspaceMembershipId,
        authority.companyId,
        identityGeneration,
      ])}
      {...props}
      authority={authority}
    />
  );
}
type ListState =
  | { status: 'loading' | 'error' | 'denied' }
  | {
      status: 'ready';
      owner: () => boolean;
      documents: PaymentEvidenceDocument[];
    };
function AvailablePaymentEvidencePanel({
  actor,
  identity,
  selection,
  onSelect,
  onProtectedWorkChange,
  onActivityRecorded,
  authority,
  ...accessCallbacks
}: PaymentEvidenceSourcePanelProps & {
  authority: PaymentEvidenceOperationKeys & { companyId: string };
}) {
  const copy = usePaymentEvidenceCopy();
  const [list, setList] = useState<ListState>({ status: 'loading' }),
    [revision, setRevision] = useState(0),
    [protectedWork, setProtectedWork] = useState(false),
    [confirmed, setConfirmed] = useState<string>();
  const scope = JSON.stringify([
    authority.readKey,
    identity.loaded,
    identity.signedIn,
  ]);
  const life = useAuthorityLifetime(scope, identity);
  const readGeneration = useRequestLifetime(identity, scope);
  const reads = useScopedOperationGroup(String(readGeneration));
  const reject = usePaymentEvidenceAccessRecovery({
    actor,
    identity,
    companyId: authority.companyId,
    ...accessCallbacks,
  });
  const callbacks = useRef({
    onActivityRecorded,
    onSelect,
    reject,
  });
  useLayoutEffect(() => {
    callbacks.current = { onActivityRecorded, onSelect, reject };
  });
  useDocumentNavigationProtection(protectedWork, onProtectedWorkChange);
  useEffect(() => {
    const request = reads.beginLatest();
    if (!request) return;
    const live = life(),
      current = () => !request.signal.aborted && live(),
      rejected = callbacks.current.reject;
    void (async () => {
      try {
        const api = await createAuthenticatedApiClient(identity);
        if (!current()) return;
        const result = await api.request('/documents', {
          companyContextId: authority.companyId,
          signal: request.signal,
          cache: 'no-store',
        });
        if (!current()) return;
        if (result.status !== 'ok') {
          if (
            result.status === 'unauthorized' ||
            result.status === 'forbidden'
          ) {
            setList({ status: 'denied' });
            await rejected(result, request.signal, current);
            return;
          }
          throw new Error('Evidence inventory unavailable');
        }
        const documents = readPaymentEvidenceDocuments(result.value).map(
          paymentEvidenceMetadata,
        );
        if (!current()) return;
        if (
          documents.some(
            (document) => document.companyId !== authority.companyId,
          )
        )
          throw new Error('Wrong evidence Company');
        setList({ status: 'ready', owner: live, documents });
      } catch {
        if (current()) setList({ status: 'error' });
      } finally {
        request.release();
      }
    })();
    return request.retire;
  }, [authority.companyId, authority.readKey, identity, life, reads, revision]);
  function registered(document: PaymentEvidenceDocument) {
    setConfirmed(document.id);
    setRevision((value) => value + 1);
    callbacks.current.onSelect({ kind: 'document', documentId: document.id });
  }
  const currentList =
    list.status === 'ready' && list.owner() ? list.documents : undefined;
  return (
    <section
      className="working-documents payment-evidence-source working-documents--prisme"
      aria-label={copy('title')}
    >
      <header>
        <h3>{copy('title')}</h3>
        <p>{copy('description')}</p>
      </header>
      <div className="payment-evidence-inventory">
        <h4>{copy('inventory')}</h4>
        {!currentList &&
          list.status !== 'error' &&
          list.status !== 'denied' && <p role="status">{copy('loading')}</p>}
        {list.status === 'error' && (
          <div role="alert">
            <p>{copy('error')}</p>
            <button
              type="button"
              onClick={() => setRevision((value) => value + 1)}
            >
              {copy('retry')}
            </button>
          </div>
        )}
        {list.status === 'denied' && <p role="alert">{copy('denied')}</p>}
        {currentList?.length === 0 && <p>{copy('empty')}</p>}
        {currentList && (
          <ul className="working-document-list">
            {currentList.map((document) => (
              <li key={document.id}>
                <span>{document.title}</span>
                <span>{document.clientDisplayName}</span>
                <button
                  type="button"
                  disabled={protectedWork}
                  onClick={() =>
                    onSelect({ kind: 'document', documentId: document.id })
                  }
                >
                  {copy('open')}
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className="prisme-primary-action"
          disabled={protectedWork || !authority.freshPayerKey}
          onClick={() => onSelect({ kind: 'register' })}
        >
          {copy('register')}
        </button>
      </div>
      {confirmed && <p role="status">{copy('registered')}</p>}
      {selection.kind === 'register' ? (
        authority.registerKey ? (
          <PaymentEvidenceRegistration
            key={JSON.stringify([authority.registerKey, selection.generation])}
            identity={identity}
            companyId={authority.companyId}
            registerKey={authority.registerKey}
            freshPayerKey={authority.freshPayerKey}
            onRegistered={registered}
            onProtectedWorkChange={setProtectedWork}
            onRejected={reject}
          />
        ) : (
          <p>{copy('denied')}</p>
        )
      ) : (
        <PaymentEvidenceDetail
          key={JSON.stringify([selection.documentId, selection.generation])}
          actor={actor}
          identity={identity}
          documentId={selection.documentId}
          requestedVersionId={selection.requestedVersionId}
          selectionGeneration={selection.generation}
          operationKeys={authority}
          onProtectedWorkChange={setProtectedWork}
          onRejected={reject}
          onActivityRecorded={onActivityRecorded}
          registrationConfirmed={confirmed === selection.documentId}
          accessCallbacks={accessCallbacks}
        />
      )}
    </section>
  );
}
