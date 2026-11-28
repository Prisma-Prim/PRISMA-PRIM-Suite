import { Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PaymentEvidenceDetail } from '../../payment-evidence/PaymentEvidenceDetail';
import { PaymentEvidenceRegistration } from '../../payment-evidence/PaymentEvidenceRegistration';
import {
  usePaymentEvidenceGate,
  usePaymentEvidenceOwner,
  type PaymentEvidenceOwnerAuthority,
  type PaymentEvidenceSourcePanelProps,
} from '../../payment-evidence/PaymentEvidenceSourcePanel';
import { usePaymentEvidenceCopy } from '../../payment-evidence/payment-evidence.copy';
import type {
  PaymentEvidenceSelection,
  PaymentEvidenceTarget,
} from '../../payment-evidence/payment-evidence-types';
import '../../payment-evidence/payment-evidence.css';
import { ClarteBadge } from '../components/ClarteBadge';
import { ClarteButton } from '../components/ClarteButton';
import { ClarteCard } from '../components/ClarteCard';
import { ClarteSidePanel } from '../components/ClarteSidePanel';
import {
  ClarteEmptyState,
  ClarteErrorState,
  ClarteLoadingState,
} from '../components/ClarteState';
import { openFromRow, RowChevron, RowChevronHead } from './ClarteFinanceRow';
import { useClarteFinanceCopy } from './clarte-finance.copy';
import './clarte-finance.css';

/** A payment proof another Finance view asked to open, consumed once. */
export type RequestedPaymentProof = Readonly<{
  documentId: string;
  versionId?: string;
  requestId: number;
}>;

export type ClartePaymentProofsProps = Omit<
  PaymentEvidenceSourcePanelProps,
  'selection' | 'onSelect'
> & {
  requested?: RequestedPaymentProof;
  onRequestConsumed?: (requestId: number) => void;
};

/**
 * Finance › Payment proofs in Clarté (#1544): the payment evidence inventory
 * as a table, registration and each proof with its Versions and PDF in a side
 * panel. The payment evidence owners keep every read, command and hold.
 */
export function ClartePaymentProofs(props: ClartePaymentProofsProps) {
  const copy = usePaymentEvidenceCopy();
  const gate = usePaymentEvidenceGate(props);
  if (!gate)
    return (
      <section
        id="payment-proofs"
        tabIndex={-1}
        className="clarte-finance"
        aria-label={copy('title')}
      >
        <ClarteErrorState title={copy('denied')} />
      </section>
    );
  return (
    <ClarteProofOwner key={gate.key} {...props} authority={gate.authority} />
  );
}

function ClarteProofOwner(
  props: ClartePaymentProofsProps & {
    authority: PaymentEvidenceOwnerAuthority;
  },
) {
  const copy = usePaymentEvidenceCopy();
  const finance = useClarteFinanceCopy();
  const { authority, requested, onRequestConsumed, ...ownerProps } = props;
  const [selection, setSelection] = useState<PaymentEvidenceSelection>();
  const [heldTarget, setHeldTarget] = useState<PaymentEvidenceTarget>();
  const generation = useRef(0);
  const held = useRef(false);
  // A selection asked for during protected work waits until the work settles.
  function select(target: PaymentEvidenceTarget) {
    if (held.current) {
      setHeldTarget(target);
      return;
    }
    generation.current += 1;
    setHeldTarget(undefined);
    setSelection({ ...target, generation: generation.current });
  }
  const owner = usePaymentEvidenceOwner({
    ...ownerProps,
    authority,
    onSelect: select,
  });
  held.current = owner.protectedWork;
  useEffect(() => {
    if (!owner.protectedWork && heldTarget) select(heldTarget);
  }, [owner.protectedWork, heldTarget]);
  const consumed = useRef(0);
  const consume = useRef(onRequestConsumed);
  consume.current = onRequestConsumed;
  useEffect(() => {
    if (!requested || requested.requestId <= consumed.current) return;
    consumed.current = requested.requestId;
    select({
      kind: 'document',
      documentId: requested.documentId,
      requestedVersionId: requested.versionId,
    });
    consume.current?.(requested.requestId);
  }, [requested]);
  const list = owner.currentList;
  const selectedTitle =
    selection?.kind === 'document'
      ? list?.find((document) => document.id === selection.documentId)?.title
      : undefined;
  return (
    <section
      id="payment-proofs"
      tabIndex={-1}
      className="clarte-finance"
      aria-label={copy('title')}
    >
      <ClarteCard
        title={finance.text('proofsHeading')}
        actions={
          <ClarteButton
            variant="primary"
            disabled={owner.protectedWork || !authority.freshPayerKey}
            onClick={() => select({ kind: 'register' })}
          >
            <Plus aria-hidden="true" />
            {copy('register')}
          </ClarteButton>
        }
      >
        {!list &&
          owner.list.status !== 'error' &&
          owner.list.status !== 'denied' && (
            <ClarteLoadingState label={copy('loading')} />
          )}
        {owner.list.status === 'error' && (
          <ClarteErrorState
            title={copy('error')}
            action={
              <ClarteButton onClick={owner.retry}>{copy('retry')}</ClarteButton>
            }
          />
        )}
        {owner.list.status === 'denied' && (
          <ClarteErrorState title={copy('denied')} />
        )}
        {list?.length === 0 && <ClarteEmptyState title={copy('empty')} />}
        {list && list.length > 0 && (
          <div className="clarte-table-wrap">
            <table className="clarte-table clarte-finance-table">
              <thead>
                <tr>
                  <th scope="col">{finance.text('proofColumn')}</th>
                  <th scope="col">{finance.text('declaredSourceColumn')}</th>
                  <th scope="col">{finance.text('clientColumn')}</th>
                  <th scope="col">{finance.text('versionColumn')}</th>
                  <RowChevronHead />
                </tr>
              </thead>
              <tbody>
                {list.map((document) => (
                  <tr
                    key={document.id}
                    className="clarte-finance-row"
                    onClick={openFromRow(() =>
                      select({ kind: 'document', documentId: document.id }),
                    )}
                  >
                    <td>
                      <button
                        type="button"
                        className="clarte-finance-row-open"
                        disabled={owner.protectedWork}
                        onClick={() =>
                          select({ kind: 'document', documentId: document.id })
                        }
                      >
                        {document.title}
                      </button>
                      <small>{document.purpose}</small>
                    </td>
                    <td data-label={finance.text('declaredSourceColumn')}>
                      {document.paymentEvidenceSource.sourceDescription}
                    </td>
                    <td data-label={finance.text('clientColumn')}>
                      {document.clientDisplayName}
                    </td>
                    <td data-label={finance.text('versionColumn')}>
                      <ClarteBadge
                        tone={
                          document.version.status === 'official'
                            ? 'success'
                            : 'warning'
                        }
                      >
                        {document.version.status === 'official'
                          ? copy('official')
                          : copy('draft')}
                      </ClarteBadge>
                    </td>
                    <RowChevron />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ClarteCard>
      {selection && (
        <ClarteSidePanel
          title={
            selection.kind === 'register'
              ? copy('register')
              : (selectedTitle ?? finance.text('proofPanel'))
          }
          description={copy('description')}
          onClose={() => {
            if (!held.current) setSelection(undefined);
          }}
        >
          <div className="clarte-finance-proof working-documents payment-evidence-source">
            {owner.confirmed && <p role="status">{copy('registered')}</p>}
            {selection.kind === 'register' ? (
              authority.registerKey ? (
                <PaymentEvidenceRegistration
                  key={JSON.stringify([
                    authority.registerKey,
                    selection.generation,
                  ])}
                  identity={props.identity}
                  companyId={authority.companyId}
                  registerKey={authority.registerKey}
                  freshPayerKey={authority.freshPayerKey}
                  onRegistered={owner.registered}
                  onProtectedWorkChange={owner.setProtectedWork}
                  onRejected={owner.reject}
                />
              ) : (
                <ClarteErrorState title={copy('denied')} />
              )
            ) : (
              <PaymentEvidenceDetail
                key={JSON.stringify([
                  selection.documentId,
                  selection.generation,
                ])}
                actor={props.actor}
                identity={props.identity}
                documentId={selection.documentId}
                requestedVersionId={selection.requestedVersionId}
                selectionGeneration={selection.generation}
                operationKeys={authority}
                onProtectedWorkChange={owner.setProtectedWork}
                onRejected={owner.reject}
                onActivityRecorded={props.onActivityRecorded}
                registrationConfirmed={owner.confirmed === selection.documentId}
                accessCallbacks={owner.accessCallbacks}
              />
            )}
          </div>
        </ClarteSidePanel>
      )}
    </section>
  );
}
