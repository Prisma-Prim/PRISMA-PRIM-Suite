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
export type PaymentEvidenceOwnerAuthority = PaymentEvidenceOperationKeys & {
  companyId: string;
};
/**
 * The payment evidence owner a view may mount, with the key that retires it
 * on any actor, Company or identity change. Both interfaces use this gate.
 */
export function usePaymentEvidenceGate(
  props: Pick<PaymentEvidenceSourcePanelProps, 'actor' | 'identity'>,
): { authority: PaymentEvidenceOwnerAuthority; key: string } | undefined {
  const authority = paymentEvidenceAuthority(props.actor);
  const identityGeneration = useRequestLifetime(
    props.identity,
    JSON.stringify([props.identity.loaded, props.identity.signedIn]),
  );
  if (!authority || !props.identity.loaded || !props.identity.signedIn)
    return undefined;
  return {
    authority,
    key: JSON.stringify([
      props.actor.internalUserId,
      props.actor.workspaceId,
      props.actor.workspaceMembershipId,
      authority.companyId,
      identityGeneration,
    ]),
  };
}
/** A single native Document-family pane; its host owns navigation and selection. */
export function PaymentEvidenceSourcePanel(
  props: PaymentEvidenceSourcePanelProps,
) {
  const copy = usePaymentEvidenceCopy();
  const gate = usePaymentEvidenceGate(props);
  if (!gate)
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
      key={gate.key}
      {...props}
      authority={gate.authority}
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
/**
 * The payment evidence inventory, protection and registration receipt of one
 * owner. Views lay it out; the reads, access recovery and the navigation hold
 * stay here.
 */
export function usePaymentEvidenceOwner({
  actor,
  identity,
  onSelect,
  onProtectedWorkChange,
  onActivityRecorded,
  authority,
  ...accessCallbacks
}: Omit<PaymentEvidenceSourcePanelProps, 'selection'> & {
  authority: PaymentEvidenceOwnerAuthority;
}) {
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
  return {
    list,
    currentList,
    protectedWork,
    setProtectedWork,
    confirmed,
    retry: () => setRevision((value) => value + 1),
    registered,
    reject,
    accessCallbacks,
  };
}
function AvailablePaymentEvidencePanel({
  selection,
  ...props
}: PaymentEvidenceSourcePanelProps & {
  authority: PaymentEvidenceOwnerAuthority;
}) {
  const copy = usePaymentEvidenceCopy();
  const { actor, identity, onSelect, onActivityRecorded, authority } = props;
  const {
    list,
    currentList,
    protectedWork,
    setProtectedWork,
    confirmed,
    retry,
    registered,
    reject,
    accessCallbacks,
  } = usePaymentEvidenceOwner(props);
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
            <button type="button" onClick={retry}>
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
