import { useId, useRef, useState } from 'react';
import { conflictCode } from '../api/authenticated-api-client';
import type { InvoiceCurrent, InvoiceSource } from './invoice-record-contract';
import { useInvoiceRecordCopy } from './invoice-record-copy';
import { readReceipt, type InvoiceReceipt } from './invoice-record-history';
import {
  accessRejected,
  useInvoiceOwner,
  type InvoiceAccessProps,
  type InvoiceAccessRecovery,
} from './invoice-record-owner';
import { literal, sameValues } from './invoice-record-values';
import {
  draftValues,
  invoiceDraft,
  InvoiceValueFields,
  InvoiceContextView,
} from './InvoiceRecordValues';
import { InvoiceSourcePicker } from './InvoiceSourcePicker';

export type InvoiceEdit =
  | { kind: 'CREATE'; replaces: string | null }
  | { kind: 'CORRECT'; current: InvoiceCurrent }
  | { kind: 'WITHDRAW_ENTRY'; current: InvoiceCurrent };
type Attempt = Readonly<{ key: string; body: string }>;
type SubmitState =
  | { kind: 'editing'; message?: 'validation' | 'noChange' }
  | { kind: 'sending' | 'uncertain'; attempt: Attempt }
  | { kind: 'conflict'; message: 'conflict' | 'stale' };
export function InvoiceRecordForm(
  props: InvoiceAccessProps & {
    edit: InvoiceEdit;
    companyId: string;
    readCapture: string;
    manageAuthority: string;
    sourceAuthority: string | null;
    onCancel: () => void;
    onDenied: () => void;
    onSaved: (receipt: InvoiceReceipt) => void;
    onReload: () => void;
    recoverAccess?: InvoiceAccessRecovery;
  },
) {
  const copy = useInvoiceRecordCopy();
  const id = useId();
  const commandScope = JSON.stringify([
    props.manageAuthority,
    props.edit.kind === 'WITHDRAW_ENTRY' ? null : props.sourceAuthority,
    props.edit.kind,
    props.edit.kind === 'CREATE'
      ? props.edit.replaces
      : props.edit.current.record.id,
  ]);
  const owner = useInvoiceOwner(
    props,
    props.companyId,
    commandScope,
    props.recoverAccess,
  );
  const [draft, setDraft] = useState(() =>
    invoiceDraft(
      props.edit.kind === 'CREATE'
        ? undefined
        : props.edit.current.record.values,
    ),
  );
  const [reason, setReason] = useState('');
  const [acknowledge, setAcknowledge] = useState(false);
  const [source, setSource] = useState<InvoiceSource>();
  const [state, setState] = useState<SubmitState>({ kind: 'editing' });
  const pending = useRef(false);
  const callbacks = useRef({
    onSaved: props.onSaved,
    onDenied: props.onDenied,
  });
  callbacks.current = { onSaved: props.onSaved, onDenied: props.onDenied };
  const locked = state.kind !== 'editing';
  async function send(attempt: Attempt) {
    if (pending.current) return;
    pending.current = true;
    setState({ kind: 'sending', attempt });
    const path =
      props.edit.kind === 'CREATE'
        ? '/invoice-records'
        : `/invoice-records/${encodeURIComponent(props.edit.current.record.id)}/commands`;
    const result = await owner.request(path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': attempt.key,
      },
      body: attempt.body,
    });
    if (!owner.isLive() || result.status === 'retired') return;
    pending.current = false;
    if (accessRejected(result) || result.status === 'notFound') {
      callbacks.current.onDenied();
      return;
    }
    const receipt =
      result.status === 'ok' ? readReceipt(result.value) : undefined;
    if (
      receipt &&
      receipt.action === props.edit.kind &&
      (props.edit.kind === 'CREATE'
        ? receipt.revision === 1
        : receipt.recordId === props.edit.current.record.id &&
          receipt.revision === props.edit.current.record.revision + 1)
    ) {
      callbacks.current.onSaved(receipt);
      return;
    }
    if (result.status === 'validation') {
      setState({ kind: 'editing', message: 'validation' });
      return;
    }
    if (result.status === 'conflict') {
      setState({
        kind: 'conflict',
        message:
          conflictCode(result) === 'STALE_INVOICE_RECORD'
            ? 'stale'
            : 'conflict',
      });
      return;
    }
    setState({ kind: 'uncertain', attempt });
  }
  function submit() {
    if (state.kind !== 'editing' || pending.current) return;
    const values = draftValues(draft);
    if (
      (props.edit.kind !== 'WITHDRAW_ENTRY' && !values) ||
      (props.edit.kind === 'CREATE'
        ? !source || !acknowledge || !props.sourceAuthority
        : !literal(reason, 2000))
    ) {
      setState({ kind: 'editing', message: 'validation' });
      return;
    }
    if (
      props.edit.kind === 'CORRECT' &&
      values &&
      sameValues(values, props.edit.current.record.values)
    ) {
      setState({ kind: 'editing', message: 'noChange' });
      return;
    }
    let command: unknown;
    if (props.edit.kind === 'CREATE') {
      if (!source || !values) return;
      command = {
        source: source.source,
        values,
        acknowledgeExternalDeclaration: true,
        replacesWithdrawnRecordId: props.edit.replaces,
      };
    } else if (props.edit.kind === 'CORRECT') {
      if (!values) return;
      command = {
        action: 'CORRECT',
        expectedRevision: props.edit.current.record.revision,
        values,
        reason,
      };
    } else
      command = {
        action: 'WITHDRAW_ENTRY',
        expectedRevision: props.edit.current.record.revision,
        reason,
      };
    void send({ key: crypto.randomUUID(), body: JSON.stringify(command) });
  }
  const heading =
    props.edit.kind === 'CREATE'
      ? props.edit.replaces
        ? copy.replace
        : copy.create
      : props.edit.kind === 'CORRECT'
        ? copy.correct
        : copy.withdraw;
  return (
    <section
      className="invoice-record-panel invoice-record-editor"
      aria-labelledby={`${id}-heading`}
    >
      <h3 id={`${id}-heading`}>{heading}</h3>
      <p>
        {props.edit.kind === 'WITHDRAW_ENTRY'
          ? copy.withdrawalMeaning
          : props.edit.kind === 'CORRECT'
            ? copy.correctionMeaning
            : props.edit.replaces
              ? copy.replacementMeaning
              : copy.description}
      </p>
      <form
        autoComplete="off"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {props.edit.kind === 'CREATE' && props.sourceAuthority && (
          <InvoiceSourcePicker
            {...props}
            sourceAuthority={props.sourceAuthority}
            selected={source}
            onSelect={setSource}
            disabled={locked}
          />
        )}
        {props.edit.kind !== 'CREATE' && (
          <InvoiceContextView
            context={props.edit.current.record.copiedContext}
          />
        )}
        {props.edit.kind !== 'WITHDRAW_ENTRY' && (
          <InvoiceValueFields
            draft={draft}
            setDraft={setDraft}
            disabled={locked}
          />
        )}
        {props.edit.kind === 'CREATE' ? (
          <label className="invoice-record-acknowledgement">
            <input
              type="checkbox"
              checked={acknowledge}
              disabled={locked}
              onChange={(event) => setAcknowledge(event.target.checked)}
            />
            {copy.acknowledge}
          </label>
        ) : (
          <label htmlFor={`${id}-reason`}>
            {copy.reason}
            <textarea
              id={`${id}-reason`}
              value={reason}
              maxLength={2000}
              disabled={locked}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
        )}
        <div className="invoice-record-actions">
          {state.kind === 'editing' && (
            <button type="submit">
              {props.edit.kind === 'CREATE'
                ? copy.save
                : props.edit.kind === 'CORRECT'
                  ? copy.saveCorrection
                  : copy.confirmWithdraw}
            </button>
          )}
          {state.kind === 'sending' && <p role="status">{copy.saving}</p>}
          {state.kind === 'uncertain' && (
            <button type="button" onClick={() => void send(state.attempt)}>
              {copy.retryCommand}
            </button>
          )}
          {state.kind === 'conflict' && (
            <button type="button" onClick={props.onReload}>
              {copy.reload}
            </button>
          )}
          <button
            type="button"
            disabled={state.kind === 'sending' || state.kind === 'uncertain'}
            onClick={props.onCancel}
          >
            {copy.cancel}
          </button>
        </div>
        {state.kind === 'editing' && state.message && (
          <p role="alert">{copy[state.message]}</p>
        )}
        {state.kind === 'uncertain' && <p role="alert">{copy.uncertain}</p>}
        {state.kind === 'conflict' && <p role="alert">{copy[state.message]}</p>}
      </form>
    </section>
  );
}
