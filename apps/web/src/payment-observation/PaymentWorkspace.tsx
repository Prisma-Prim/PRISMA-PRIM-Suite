import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { DocumentOpenTarget } from '../documents/DocumentWorkspace';
import { useInterfaceLocale } from '../localization/interface-locale';
import { SectionVisibility } from '../production-shell/section-visibility';
import { paymentAuthority, type PaymentAuthority } from './payment-authority';
import {
  readPaymentCurrent,
  readPaymentHistory,
  readPaymentInventory,
} from './payment-contract';
import {
  usePaymentLifetime,
  usePaymentOwner,
  type PaymentAccessProps,
} from './payment-owner';
import type {
  PaymentAction,
  PaymentCurrent,
  PaymentHistoryPage,
  PaymentInventory,
  PaymentLiveSource,
  PaymentReceipt,
  PaymentSelectable,
} from './payment.types';
import { PaymentCommandPanel } from './PaymentCommandPanel';
import { PaymentSources } from './PaymentSources';
import { PaymentDownload } from './PaymentDownload';
import { PaymentRevisionView, PaymentSummaryView, paymentCopy } from './ui';

type Props = PaymentAccessProps & {
  onProtectedWorkChange: (active: boolean) => void;
  onOpenClient?: (id: string) => void;
  onOpenDocument?: (
    target: DocumentOpenTarget,
    documentVersionId: string,
  ) => void;
  projectionAuthority: string;
};
export function PaymentWorkspace(props: Props) {
  const authority = paymentAuthority(props.actor);
  const lifetime = usePaymentLifetime(
    props.identity,
    authority
      ? JSON.stringify([
          props.actor.internalUserId,
          props.actor.workspaceId,
          props.actor.workspaceMembershipId,
          authority.companyId,
        ])
      : 'unavailable',
  );
  if (!authority || !props.identity.loaded || !props.identity.signedIn)
    return null;
  return <PaymentReadOwner key={lifetime} {...props} authority={authority} />;
}
type Editor = {
  action: PaymentAction;
  authority: string;
  generation: number;
  source?: PaymentSelectable;
  predecessor: string | null;
  target: string | null;
};
function PaymentReadOwner(props: Props & { authority: PaymentAuthority }) {
  const { locale } = useInterfaceLocale(),
    copy = paymentCopy[locale],
    visible = useContext(SectionVisibility),
    a = props.authority;
  const readGeneration = usePaymentLifetime(props.identity, a.readKey);
  const owner = usePaymentOwner(
    props,
    a.companyId,
    JSON.stringify([a.readKey, visible]),
  );
  const createGeneration = usePaymentLifetime(
    props.identity,
    a.createKey ?? 'no-create',
  );
  const correctGeneration = usePaymentLifetime(
    props.identity,
    a.correctKey ?? 'no-correct',
  );
  const withdrawGeneration = usePaymentLifetime(
    props.identity,
    a.recordKey ?? 'no-withdraw',
  );
  const confirmGeneration = usePaymentLifetime(
    props.identity,
    a.confirmKey ?? 'no-confirm',
  );
  const reverseGeneration = usePaymentLifetime(
    props.identity,
    a.reverseKey ?? 'no-reverse',
  );
  const clientProjectionGeneration = usePaymentLifetime(
    props.identity,
    props.projectionAuthority,
  );
  const sourceProjectionGeneration = usePaymentLifetime(
    props.identity,
    a.projectionKey ?? 'no-source-projection',
  );
  const downloadGeneration = usePaymentLifetime(
    props.identity,
    a.downloadKey ?? 'no-download',
  );
  const sourceGeneration = usePaymentLifetime(
    props.identity,
    JSON.stringify([a.createKey, a.readCapture]),
  );
  const [inventory, setInventory] = useState<{
      value: PaymentInventory;
      read: number;
    }>(),
    [current, setCurrent] = useState<{
      value: PaymentCurrent;
      sourceProjection: number;
      download: number;
      clientProjection: number;
      read: number;
    }>();
  const [history, setHistory] = useState<PaymentHistoryPage>(),
    [selected, setSelected] = useState<string>();
  const [status, setStatus] = useState<
    'loading' | 'ready' | 'error' | 'denied' | 'changed'
  >('loading');
  const [chooser, setChooser] = useState<{
    generation: number;
    predecessor: string | null;
    recovery?: number;
  }>();
  const [editor, setEditor] = useState<Editor>();
  const [protection, setProtection] = useState(false);
  type Conflict = { target: string | null; generation: number };
  const [conflict, setConflict] = useState<Conflict>();
  const conflictOwner = useRef<Conflict | undefined>(undefined);
  const conflictSequence = useRef(0);
  const markConflict = useCallback((target: string | null) => {
    const value = { target, generation: ++conflictSequence.current };
    conflictOwner.current = value;
    setConflict(value);
  }, []);
  function releaseConflict(observed: Conflict | undefined) {
    if (observed && conflictOwner.current === observed) {
      conflictOwner.current = undefined;
      setConflict(undefined);
    }
  }
  const requestSequence = useRef(0),
    pending = useRef(false),
    heading = useRef<HTMLHeadingElement>(null);
  const actionAuthority = (action: PaymentAction) =>
    action === 'CREATE'
      ? { key: a.createKey, generation: createGeneration }
      : action === 'CORRECT_DRAFT'
        ? { key: a.correctKey, generation: correctGeneration }
        : action === 'WITHDRAW_DRAFT'
          ? { key: a.recordKey, generation: withdrawGeneration }
          : action === 'CONFIRM'
            ? { key: a.confirmKey, generation: confirmGeneration }
            : { key: a.reverseKey, generation: reverseGeneration };
  const activeEditor =
    editor &&
    actionAuthority(editor.action).key === editor.authority &&
    actionAuthority(editor.action).generation === editor.generation
      ? editor
      : undefined;
  const protectedWork =
    Boolean(conflict) || Boolean(activeEditor && protection);
  const protect = useCallback((active: boolean) => setProtection(active), []);
  useEffect(() => {
    props.onProtectedWorkChange(protectedWork);
    return () => props.onProtectedWorkChange(false);
  }, [protectedWork, props.onProtectedWorkChange]);
  async function load(
    id?: string,
    cursor?: string,
    deliberateRecovery = false,
  ): Promise<PaymentCurrent | undefined> {
    const request = ++requestSequence.current;
    const sourceProjection = sourceProjectionGeneration,
      download = downloadGeneration,
      clientProjection = clientProjectionGeneration,
      recovering = deliberateRecovery ? conflictOwner.current : undefined;
    setStatus('loading');
    pending.current = true;
    const result = await owner.request(
      id
        ? `/payments/${encodeURIComponent(id)}`
        : `/payments${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    );
    if (
      !owner.isLive() ||
      request !== requestSequence.current ||
      result.status === 'retired'
    )
      return;
    pending.current = false;
    if (result.status === 'ok') {
      try {
        if (id) {
          const value = readPaymentCurrent(
            result.value,
            a.companyId,
            a.readCapture,
            id,
          );
          setCurrent({
            value,
            sourceProjection,
            download,
            clientProjection,
            read: readGeneration,
          });
          setHistory(value.history);
          setStatus('ready');
          if (recovering?.target === id || recovering?.target === null)
            releaseConflict(recovering);
          return value;
        }
        setInventory({
          value: readPaymentInventory(result.value, a.companyId, a.readCapture),
          read: readGeneration,
        });
        setStatus('ready');
        if (recovering?.target === null) releaseConflict(recovering);
      } catch {
        setStatus('error');
      }
    } else
      setStatus(
        result.status === 'forbidden' || result.status === 'unauthorized'
          ? 'denied'
          : result.status === 'conflict'
            ? 'changed'
            : 'error',
      );
  }
  useEffect(() => {
    if (visible && !protectedWork) void load(selected);
    return () => {
      requestSequence.current++;
      owner.retireRequests();
      pending.current = false;
    };
  }, [visible, readGeneration]);
  async function open(id: string, trigger?: HTMLElement) {
    if (protectedWork) return;
    setEditor(undefined);
    setChooser(undefined);
    setSelected(id);
    setCurrent(undefined);
    setHistory(undefined);
    const loaded = await load(id);
    if (
      loaded &&
      owner.isLive() &&
      trigger === document.activeElement &&
      visible
    )
      heading.current?.focus();
  }
  function start(
    action: PaymentAction,
    source?: PaymentSelectable,
    predecessor: string | null = null,
  ) {
    if (protectedWork) return;
    const authority = actionAuthority(action);
    if (!authority.key) return;
    setEditor({
      action,
      authority: authority.key,
      generation: authority.generation,
      source,
      predecessor,
      target: selected ?? null,
    });
    setChooser(undefined);
    setProtection(false);
  }
  async function saved(receipt: PaymentReceipt) {
    setSelected(receipt.paymentId);
    return (await load(receipt.paymentId)) !== undefined;
  }
  async function moreHistory() {
    if (!current || !history?.nextCursor || protectedWork || pending.current)
      return;
    pending.current = true;
    const snapshot = current.value,
      previous = history,
      request = ++requestSequence.current,
      before = previous.items.at(-1)?.revision;
    if (before === undefined) {
      pending.current = false;
      return;
    }
    const result = await owner.request(
      `/payments/${encodeURIComponent(snapshot.payment.id)}/history?cursor=${encodeURIComponent(previous.nextCursor ?? '')}`,
    );
    if (
      !owner.isLive() ||
      request !== requestSequence.current ||
      result.status === 'retired'
    )
      return;
    pending.current = false;
    if (result.status === 'ok') {
      try {
        const page = readPaymentHistory(
          result.value,
          a.companyId,
          a.readCapture,
          snapshot.payment.id,
          snapshot.payment.revision,
          before,
        );
        setHistory({
          items: [...previous.items, ...page.items],
          nextCursor: page.nextCursor,
        });
      } catch {
        setStatus('error');
      }
    } else setStatus(result.status === 'conflict' ? 'changed' : 'error');
  }
  const detail = current?.read === readGeneration ? current.value : undefined;
  const liveInventory =
    inventory?.read === readGeneration ? inventory.value : undefined;
  const sourceMetadata =
    current?.sourceProjection === sourceProjectionGeneration && a.projectionKey
      ? detail?.liveSource
      : undefined;
  const source: PaymentLiveSource | undefined =
    sourceMetadata?.kind === 'AVAILABLE'
      ? {
          ...sourceMetadata,
          content:
            current?.download === downloadGeneration && a.downloadKey
              ? sourceMetadata.content
              : { kind: 'UNAVAILABLE' },
        }
      : sourceMetadata;
  const client =
    current?.clientProjection === clientProjectionGeneration
      ? detail?.client
      : undefined;
  return (
    <section className="payment-observation" aria-label={copy.title}>
      <h2 ref={heading} tabIndex={-1}>
        {copy.title}
      </h2>
      <p className="payment-observation-notice">{copy.manualNotice}</p>
      <p>{copy.allocationNotice}</p>
      <div className="payment-observation-actions">
        {selected && (
          <button
            type="button"
            disabled={protectedWork}
            onClick={() => {
              if (protectedWork) return;
              setSelected(undefined);
              setCurrent(undefined);
              setHistory(undefined);
              setEditor(undefined);
              setChooser(undefined);
              void load();
            }}
          >
            {copy.back}
          </button>
        )}
        <button
          type="button"
          disabled={
            (protectedWork && !(!activeEditor && conflict)) ||
            (status === 'loading' && !conflict)
          }
          onClick={() =>
            void load(selected, undefined, Boolean(conflict && !activeEditor))
          }
        >
          {copy.reload}
        </button>
        {a.createKey && (
          <button
            type="button"
            disabled={protectedWork}
            onClick={() => {
              setEditor(undefined);
              setChooser({ generation: sourceGeneration, predecessor: null });
            }}
          >
            {copy.newObservation}
          </button>
        )}
      </div>
      {status === 'loading' && <p role="status">{copy.loading}</p>}
      {status === 'error' && <p role="alert">{copy.error}</p>}
      {status === 'denied' && <p role="alert">{copy.unavailable}</p>}
      {status === 'changed' && <p role="alert">{copy.historyChanged}</p>}
      {!selected && liveInventory && (
        <>
          <ul>
            {liveInventory.items.map((payment) => (
              <li key={payment.id}>
                <PaymentSummaryView locale={locale} payment={payment} />
                <button
                  type="button"
                  disabled={protectedWork}
                  onClick={(event) =>
                    void open(payment.id, event.currentTarget)
                  }
                >
                  {copy.values} · {copy.revision} {payment.revision}
                </button>
              </li>
            ))}
          </ul>
          {liveInventory.items.length === 0 && <p>{copy.empty}</p>}
          {liveInventory.nextCursor && (
            <button
              type="button"
              disabled={protectedWork || status === 'loading'}
              onClick={() =>
                void load(undefined, liveInventory.nextCursor ?? undefined)
              }
            >
              {copy.loadMore}
            </button>
          )}
        </>
      )}
      {selected && detail && (
        <>
          <PaymentSummaryView locale={locale} payment={detail.payment} />
          <div className="payment-observation-actions">
            {detail.payment.replacesClosedPaymentId && (
              <button
                type="button"
                disabled={protectedWork}
                onClick={() =>
                  void open(detail.payment.replacesClosedPaymentId ?? '')
                }
              >
                {copy.replacesClosedPayment}
              </button>
            )}
            {detail.payment.replacementPaymentId && (
              <button
                type="button"
                disabled={protectedWork}
                onClick={() =>
                  void open(detail.payment.replacementPaymentId ?? '')
                }
              >
                {copy.replacementPayment}
              </button>
            )}
            {source?.kind === 'AVAILABLE' && (
              <div>
                <p>
                  {copy.source}: {source.title} · {copy.version}{' '}
                  {source.versionNumber}
                </p>
                {props.onOpenDocument && (
                  <button
                    type="button"
                    disabled={protectedWork}
                    onClick={() =>
                      props.onOpenDocument?.(
                        {
                          documentId: source.documentId,
                          focus: 'document',
                        },
                        source.documentVersionId,
                      )
                    }
                  >
                    {copy.source}
                  </button>
                )}
                {a.downloadKey && (
                  <PaymentDownload
                    key={JSON.stringify([downloadGeneration, source.content])}
                    {...props}
                    companyId={a.companyId}
                    recordId={detail.payment.id}
                    authority={a.downloadKey}
                    source={source}
                    onDenied={() =>
                      setCurrent((value) =>
                        value
                          ? {
                              ...value,
                              value: {
                                ...value.value,
                                liveSource: { kind: 'UNAVAILABLE' },
                              },
                            }
                          : value,
                      )
                    }
                  />
                )}
              </div>
            )}
            {(!source || source.kind === 'UNAVAILABLE') && (
              <p>
                {copy.source}: {copy.unavailable}
              </p>
            )}
            {client?.kind === 'AVAILABLE' && props.onOpenClient && (
              <button
                type="button"
                disabled={protectedWork}
                onClick={() => props.onOpenClient?.(client.clientId)}
              >
                {client.displayName}
              </button>
            )}
          </div>
          {!activeEditor && (
            <div className="payment-observation-actions">
              {detail.capabilities.canCorrect && a.correctKey && (
                <button
                  type="button"
                  disabled={protectedWork}
                  onClick={() => start('CORRECT_DRAFT')}
                >
                  {copy.correct}
                </button>
              )}
              {detail.capabilities.canWithdraw && a.recordKey && (
                <button
                  type="button"
                  disabled={protectedWork}
                  onClick={() => start('WITHDRAW_DRAFT')}
                >
                  {copy.withdraw}
                </button>
              )}
              {detail.capabilities.canConfirm && a.confirmKey && (
                <button
                  type="button"
                  disabled={protectedWork}
                  onClick={() => start('CONFIRM')}
                >
                  {copy.confirm}
                </button>
              )}
              {detail.capabilities.canReverse && a.reverseKey && (
                <button
                  type="button"
                  disabled={protectedWork}
                  onClick={() => start('REVERSE')}
                >
                  {copy.reverse}
                </button>
              )}
              {detail.capabilities.canReplace && a.createKey && (
                <button
                  type="button"
                  disabled={protectedWork}
                  onClick={() =>
                    setChooser({
                      generation: sourceGeneration,
                      predecessor: detail.payment.id,
                    })
                  }
                >
                  {copy.replace}
                </button>
              )}
            </div>
          )}
          <section aria-label={copy.history}>
            <h3>{copy.history}</h3>
            {history?.items.map((revision) => (
              <PaymentRevisionView
                key={revision.revision}
                locale={locale}
                revision={revision}
              />
            ))}
            {history?.nextCursor && (
              <button
                type="button"
                disabled={protectedWork || pending.current}
                onClick={() => void moreHistory()}
              >
                {copy.loadMore}
              </button>
            )}
          </section>
        </>
      )}
      {chooser && chooser.generation === sourceGeneration && a.createKey && (
        <PaymentSources
          key={sourceGeneration}
          {...props}
          companyId={a.companyId}
          capture={a.readCapture}
          authority={a.createKey}
          disabled={protectedWork && chooser.recovery === undefined}
          onReady={() => {
            const recovering = conflictOwner.current;
            if (recovering && chooser.recovery === recovering.generation) {
              releaseConflict(recovering);
              setEditor(undefined);
              setProtection(false);
            }
          }}
          onSelect={(source) => start('CREATE', source, chooser.predecessor)}
        />
      )}
      {activeEditor && (
        <PaymentCommandPanel
          key={JSON.stringify([
            activeEditor.action,
            activeEditor.authority,
            activeEditor.generation,
            activeEditor.source?.source,
            activeEditor.target,
          ])}
          {...props}
          companyId={a.companyId}
          authority={activeEditor.authority}
          action={activeEditor.action}
          current={detail}
          source={activeEditor.source}
          predecessor={activeEditor.predecessor}
          onProtected={protect}
          onConflict={markConflict}
          onReloadSources={() => {
            if (
              activeEditor.action === 'CREATE' &&
              conflictOwner.current &&
              a.createKey
            )
              setChooser({
                generation: sourceGeneration,
                predecessor: activeEditor.predecessor,
                recovery: conflictOwner.current.generation,
              });
          }}
          onClose={() => {
            setEditor(undefined);
            setProtection(false);
          }}
          onReload={(id) => load(id, undefined, true)}
          onSaved={saved}
        />
      )}
    </section>
  );
}
