import { useEffect, useRef, useState } from 'react';
import { useInterfaceLocale } from '../localization/interface-locale';
import type { invoiceRecordAuthority } from '../access/invoice-record-authority';
import { readCurrent, type InvoiceCurrent } from './invoice-record-contract';
import { useInvoiceRecordCopy } from './invoice-record-copy';
import type { InvoiceReceipt } from './invoice-record-history';
import {
  accessRejected,
  useInvoiceLifetime,
  useInvoiceOwner,
  type InvoiceAccessProps,
} from './invoice-record-owner';
import {
  InvoiceRecordRelations,
  type InvoiceRelatedCallbacks,
} from './InvoiceRecordRelations';
import { InvoiceRecordForm, type InvoiceEdit } from './InvoiceRecordForm';
import { InvoiceRecordHistory } from './InvoiceRecordHistory';
import { InvoiceContextView, InvoiceValuesView } from './InvoiceRecordValues';

export type InvoiceAuthority = NonNullable<
  ReturnType<typeof invoiceRecordAuthority>
>;
type Read =
  | { kind: 'loading' | 'error' | 'denied' }
  | { kind: 'ready'; current: InvoiceCurrent; projection: number };
export function InvoiceRecordDetail(
  props: InvoiceAccessProps &
    InvoiceRelatedCallbacks & {
      authority: InvoiceAuthority;
      readCapture: string;
      recordId: string;
      projectionAuthority: string;
      confirmed?: InvoiceReceipt;
      onOpenRecord: (id: string, receipt?: InvoiceReceipt) => void;
      onBack: () => void;
    },
) {
  const copy = useInvoiceRecordCopy();
  const { formatDateTime } = useInterfaceLocale();
  const projection = useInvoiceLifetime(
    props.identity,
    props.projectionAuthority,
  );
  const sourceGeneration = useInvoiceLifetime(
    props.identity,
    JSON.stringify([props.authority.sourceKey, props.projectionAuthority]),
  );
  const manageGeneration = useInvoiceLifetime(
    props.identity,
    props.authority.manageKey ?? 'unavailable',
  );
  const contentGeneration = useInvoiceLifetime(
    props.identity,
    JSON.stringify([props.authority.contentKey, projection]),
  );
  const owner = useInvoiceOwner(
    props,
    props.authority.companyId,
    JSON.stringify([props.authority.key, props.recordId, projection]),
  );
  const [read, setRead] = useState<Read>({ kind: 'loading' });
  const [confirmation, setConfirmation] = useState(props.confirmed);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [edit, setEdit] = useState<{
    value: InvoiceEdit;
    sourceGeneration: number;
    manageGeneration: number;
    sequence: number;
  }>();
  const editSequence = useRef(0);
  const readSequence = useRef(0);
  const activeEdit =
    edit &&
    edit.manageGeneration === manageGeneration &&
    (edit.value.kind === 'WITHDRAW_ENTRY' ||
      edit.sourceGeneration === sourceGeneration)
      ? edit
      : undefined;
  function deny() {
    setRead({ kind: 'denied' });
    setEdit(undefined);
    setConfirmation(undefined);
    setRefreshFailed(false);
  }
  async function refresh(afterCommand = false) {
    const sequence = ++readSequence.current;
    setRefreshing(true);
    setRefreshFailed(false);
    if (afterCommand) setRead({ kind: 'loading' });
    const result = await owner.request(
      `/invoice-records/${encodeURIComponent(props.recordId)}`,
    );
    if (
      !owner.isLive() ||
      result.status === 'retired' ||
      readSequence.current !== sequence
    )
      return;
    setRefreshing(false);
    if (accessRejected(result) || result.status === 'notFound') {
      deny();
      return;
    }
    const current =
      result.status === 'ok'
        ? readCurrent(
            result.value,
            props.authority.companyId,
            props.recordId,
            props.readCapture,
          )
        : undefined;
    if (!current) {
      setRefreshFailed(true);
      if (afterCommand || read.kind !== 'ready') setRead({ kind: 'error' });
      return;
    }
    setRead({ kind: 'ready', current, projection });
  }
  useEffect(() => {
    void refresh();
  }, [projection]);
  function open(value: InvoiceEdit) {
    editSequence.current += 1;
    setEdit({
      value,
      sourceGeneration,
      manageGeneration,
      sequence: editSequence.current,
    });
  }
  function sourceDenied() {
    owner.retireRequests();
    setEdit((current) =>
      current?.value.kind === 'WITHDRAW_ENTRY' ? current : undefined,
    );
    setRead((current) =>
      current.kind === 'ready'
        ? {
            ...current,
            projection: -1,
            current: {
              ...current.current,
              capabilities: {
                ...current.current.capabilities,
                canCorrect: false,
              },
            },
          }
        : current,
    );
    void refresh();
  }
  function writeDenied() {
    owner.retireRequests();
    setEdit(undefined);
    setRead((current) =>
      current.kind === 'ready'
        ? {
            ...current,
            current: {
              ...current.current,
              capabilities: { canCorrect: false, canWithdraw: false },
            },
          }
        : current,
    );
    void refresh();
  }
  function saved(receipt: InvoiceReceipt) {
    setEdit(undefined);
    setConfirmation(receipt);
    if (receipt.recordId !== props.recordId)
      props.onOpenRecord(receipt.recordId, receipt);
    else void refresh(true);
  }
  const current = read.kind === 'ready' ? read.current : undefined;
  const projectionsLive =
    read.kind === 'ready' && read.projection === projection;
  const source = projectionsLive ? current?.liveSource : undefined;
  const related = projectionsLive ? current?.related : undefined;
  return (
    <section className="invoice-record-detail">
      <div className="invoice-record-actions">
        <button type="button" disabled={!!activeEdit} onClick={props.onBack}>
          {copy.back}
        </button>
        <button
          type="button"
          disabled={refreshing || !!activeEdit}
          onClick={() => void refresh()}
        >
          {copy.reload}
        </button>
      </div>
      {confirmation && (
        <p role="status">
          {copy.confirmed} · {copy.revision} {confirmation.revision}
        </p>
      )}
      {refreshFailed && (
        <p role="alert">
          {confirmation ? copy.refreshFailed : copy.error}{' '}
          <button
            type="button"
            disabled={refreshing || !!activeEdit}
            onClick={() => void refresh()}
          >
            {copy.retry}
          </button>
        </p>
      )}
      {read.kind === 'loading' && <p role="status">{copy.loading}</p>}
      {read.kind === 'denied' && <p role="alert">{copy.denied}</p>}
      {current && (
        <>
          <header>
            <h3>{current.record.values.externalNumber}</h3>
            <p>
              {current.record.entryState === 'RECORDED'
                ? copy.recorded
                : copy.withdrawn}{' '}
              · {copy.revision} {current.record.revision}
            </p>
            <p>
              {copy.actor}: {current.actor.displayName} ·{' '}
              <time dateTime={current.recordedAt}>
                {formatDateTime(current.recordedAt)}
              </time>
            </p>
          </header>
          <InvoiceContextView context={current.record.copiedContext} />
          <InvoiceValuesView values={current.record.values} />
          <InvoiceRecordRelations
            key={contentGeneration}
            {...props}
            companyId={props.authority.companyId}
            downloadAuthority={
              props.authority.contentKey
                ? JSON.stringify([props.authority.contentKey, projection])
                : null
            }
            source={source}
            related={related}
            editing={!!activeEdit}
            onDenied={sourceDenied}
            recoverAccess={owner.recover}
          />
          {!activeEdit && (
            <div className="invoice-record-actions">
              {props.authority.manageKey &&
                props.authority.sourceKey &&
                current.capabilities.canCorrect && (
                  <button
                    type="button"
                    onClick={() => open({ kind: 'CORRECT', current })}
                  >
                    {copy.correct}
                  </button>
                )}
              {props.authority.manageKey &&
                current.capabilities.canWithdraw && (
                  <button
                    type="button"
                    onClick={() => open({ kind: 'WITHDRAW_ENTRY', current })}
                  >
                    {copy.withdraw}
                  </button>
                )}
              {props.authority.manageKey &&
                props.authority.sourceKey &&
                current.record.entryState === 'WITHDRAWN' &&
                current.record.replacementRecordId === null && (
                  <button
                    type="button"
                    onClick={() =>
                      open({ kind: 'CREATE', replaces: current.record.id })
                    }
                  >
                    {copy.replace}
                  </button>
                )}
              {current.record.replacesWithdrawnRecordId && (
                <button
                  type="button"
                  onClick={() => {
                    if (current.record.replacesWithdrawnRecordId)
                      props.onOpenRecord(
                        current.record.replacesWithdrawnRecordId,
                      );
                  }}
                >
                  {copy.predecessor}
                </button>
              )}
              {current.record.replacementRecordId && (
                <button
                  type="button"
                  onClick={() => {
                    if (current.record.replacementRecordId)
                      props.onOpenRecord(current.record.replacementRecordId);
                  }}
                >
                  {copy.successor}
                </button>
              )}
            </div>
          )}
          <InvoiceRecordHistory
            key={`${current.record.id}:${current.record.revision}`}
            {...props}
            companyId={props.authority.companyId}
            readAuthority={props.authority.key}
            current={current}
            editing={!!activeEdit}
            onDenied={deny}
            onReload={() => {
              if (!activeEdit) void refresh();
            }}
          />
        </>
      )}
      {activeEdit && props.authority.manageKey && (
        <InvoiceRecordForm
          key={activeEdit.sequence}
          {...props}
          companyId={props.authority.companyId}
          manageAuthority={props.authority.manageKey}
          sourceAuthority={props.authority.sourceKey}
          edit={activeEdit.value}
          onCancel={() => setEdit(undefined)}
          onDenied={
            activeEdit.value.kind === 'WITHDRAW_ENTRY'
              ? writeDenied
              : sourceDenied
          }
          recoverAccess={owner.recover}
          onSaved={saved}
          onReload={() => {
            setEdit(undefined);
            void refresh();
          }}
        />
      )}
    </section>
  );
}
