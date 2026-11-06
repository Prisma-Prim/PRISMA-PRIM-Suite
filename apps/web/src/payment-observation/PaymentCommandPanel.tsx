import { useEffect, useId, useRef, useState } from 'react';
import { useInterfaceLocale } from '../localization/interface-locale';
import {
  paymentDraft,
  paymentDraftValues,
  paymentLiteral,
} from './payment-draft';
import { readPaymentReceipt } from './payment-contract';
import { usePaymentOwner, type PaymentAccessProps } from './payment-owner';
import type {
  PaymentAction,
  PaymentCurrent,
  PaymentInput,
  PaymentReceipt,
  PaymentSelectable,
} from './payment.types';
import {
  PaymentSummaryView,
  PaymentSourceView,
  PaymentValuesFields,
  paymentCopy,
} from './ui';

type CommandProps = PaymentAccessProps & {
  companyId: string;
  authority: string;
  action: PaymentAction;
  current?: PaymentCurrent;
  source?: PaymentSelectable;
  predecessor: string | null;
  onProtected: (active: boolean) => void;
  onConflict: (target: string | null) => void;
  onReloadSources: () => void;
  onClose: () => void;
  onReload: (id: string) => Promise<PaymentCurrent | undefined>;
  onSaved: (receipt: PaymentReceipt) => Promise<boolean>;
};
type Phase =
  'editing' | 'pending' | 'uncertain' | 'conflict' | 'saved' | 'denied';
/** One deliberate shown revision and immutable serialized command under its own consumed capture. */
export function PaymentCommandPanel(props: CommandProps) {
  const { locale } = useInterfaceLocale(),
    copy = paymentCopy[locale],
    id = useId();
  const owner = usePaymentOwner(props, props.companyId, props.authority);
  const latest = useRef(props);
  latest.current = props;
  const [shown, setShown] = useState(props.current);
  const [draft, setDraft] = useState(() =>
    paymentDraft(
      props.action === 'CORRECT_DRAFT'
        ? props.current?.payment.values
        : undefined,
    ),
  );
  const [reason, setReason] = useState(''),
    [note, setNote] = useState(''),
    [ack, setAck] = useState(false);
  const [phase, setPhase] = useState<Phase>('editing'),
    [invalid, setInvalid] = useState(false),
    [receipt, setReceipt] = useState<PaymentReceipt>();
  const held = useRef<
    { key: string; body: string; intent: PaymentInput } | undefined
  >(undefined);
  const pending = useRef(false);
  const protectedWork =
    phase === 'pending' ||
    phase === 'uncertain' ||
    phase === 'conflict' ||
    phase === 'saved';
  useEffect(() => {
    props.onProtected(protectedWork);
    return () => props.onProtected(false);
  }, [protectedWork, props.onProtected]);
  const editing = phase === 'editing';
  function intent(): PaymentInput {
    if (props.action === 'CREATE') {
      if (!props.source || !ack)
        throw new Error('The exact source and declaration are required.');
      return {
        action: 'CREATE',
        source: props.source.source,
        values: paymentDraftValues(draft),
        acknowledgeObservedDeclaration: true,
        replacesClosedPaymentId: props.predecessor,
      };
    }
    if (!shown) throw new Error('An exact shown revision is required.');
    const expectedRevision = shown.payment.revision;
    switch (props.action) {
      case 'CORRECT_DRAFT': {
        const values = paymentDraftValues(draft);
        if (JSON.stringify(values) === JSON.stringify(shown.payment.values))
          throw new Error('A material correction is required.');
        return {
          action: 'CORRECT_DRAFT',
          expectedRevision,
          values,
          reason: paymentLiteral(reason, 2000),
        };
      }
      case 'WITHDRAW_DRAFT':
        return {
          action: 'WITHDRAW_DRAFT',
          expectedRevision,
          reason: paymentLiteral(reason, 2000),
        };
      case 'REVERSE':
        return {
          action: 'REVERSE',
          expectedRevision,
          reason: paymentLiteral(reason, 2000),
        };
      case 'CONFIRM':
        if (!ack) throw new Error('Explicit review is required.');
        return {
          action: 'CONFIRM',
          expectedRevision,
          acknowledgeReviewedObservation: true,
          confirmationNote: paymentLiteral(note, 2000),
        };
    }
  }
  async function send() {
    if (pending.current || !['editing', 'uncertain'].includes(phase)) return;
    if (!held.current) {
      try {
        const command = intent();
        const body =
          command.action === 'CREATE'
            ? JSON.stringify({
                source: command.source,
                values: command.values,
                acknowledgeObservedDeclaration: true,
                replacesClosedPaymentId: command.replacesClosedPaymentId,
              })
            : JSON.stringify(command);
        held.current = { key: crypto.randomUUID(), body, intent: command };
      } catch {
        setInvalid(true);
        return;
      }
    }
    const exact = held.current;
    pending.current = true;
    setInvalid(false);
    setPhase('pending');
    const result = await owner.request(
      props.action === 'CREATE'
        ? '/payments'
        : `/payments/${encodeURIComponent(shown?.payment.id ?? '')}/commands`,
      {
        method: 'POST',
        body: exact.body,
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': exact.key,
        },
      },
    );
    if (!owner.isLive() || result.status === 'retired') return;
    pending.current = false;
    if (result.status === 'ok') {
      try {
        const saved = readPaymentReceipt(result.value);
        if (
          saved.action !== exact.intent.action ||
          (exact.intent.action === 'CREATE'
            ? saved.revision !== 1
            : saved.paymentId !== shown?.payment.id ||
              saved.revision !== exact.intent.expectedRevision + 1)
        )
          throw new Error('Mismatched receipt.');
        setReceipt(saved);
        setPhase('saved');
        if (await latest.current.onSaved(saved)) {
          if (owner.isLive()) latest.current.onClose();
        }
      } catch {
        setPhase('uncertain');
      }
    } else if (result.status === 'conflict') {
      latest.current.onConflict(shown?.payment.id ?? null);
      setPhase('conflict');
    } else if (result.status === 'validation') {
      held.current = undefined;
      setPhase('editing');
      setInvalid(true);
    } else if (
      result.status === 'unauthorized' ||
      result.status === 'forbidden' ||
      result.status === 'notFound'
    )
      setPhase('denied');
    else setPhase('uncertain');
  }
  async function reload() {
    if (pending.current || !shown) return;
    pending.current = true;
    const fresh = await latest.current.onReload(shown.payment.id);
    if (!owner.isLive()) return;
    pending.current = false;
    if (!fresh) return;
    const allowed =
      props.action === 'CORRECT_DRAFT'
        ? fresh.capabilities.canCorrect
        : props.action === 'WITHDRAW_DRAFT'
          ? fresh.capabilities.canWithdraw
          : props.action === 'CONFIRM'
            ? fresh.capabilities.canConfirm
            : props.action === 'REVERSE'
              ? fresh.capabilities.canReverse
              : false;
    if (!allowed) {
      setShown(fresh);
      setPhase('denied');
      return;
    }
    // Only this deliberate successful reload, started after the conflict, releases its held intention.
    held.current = undefined;
    setShown(fresh);
    setDraft(
      paymentDraft(
        props.action === 'CORRECT_DRAFT' ? fresh.payment.values : undefined,
      ),
    );
    setReason('');
    setNote('');
    setAck(false);
    setPhase('editing');
    setInvalid(false);
  }
  async function retryRead() {
    if (!receipt || pending.current) return;
    pending.current = true;
    const complete = await latest.current.onSaved(receipt);
    if (!owner.isLive()) return;
    pending.current = false;
    if (complete) latest.current.onClose();
  }
  const meaning =
    props.action === 'CREATE'
      ? props.predecessor
        ? copy.replacementMeaning
        : copy.manualNotice
      : props.action === 'CORRECT_DRAFT'
        ? copy.correctionMeaning
        : props.action === 'WITHDRAW_DRAFT'
          ? copy.withdrawalMeaning
          : props.action === 'CONFIRM'
            ? copy.confirmationMeaning
            : copy.reversalMeaning;
  const label =
    props.action === 'CREATE'
      ? copy.create
      : props.action === 'CORRECT_DRAFT'
        ? copy.correct
        : props.action === 'WITHDRAW_DRAFT'
          ? copy.withdraw
          : props.action === 'CONFIRM'
            ? copy.confirm
            : copy.reverse;
  return (
    <section
      className="payment-observation-panel"
      aria-labelledby={`${id}-title`}
    >
      <h3 id={`${id}-title`}>{label}</h3>
      <p>{meaning}</p>
      {shown && <PaymentSummaryView locale={locale} payment={shown.payment} />}
      {props.source && (
        <PaymentSourceView locale={locale} source={props.source} />
      )}
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        {(props.action === 'CREATE' || props.action === 'CORRECT_DRAFT') && (
          <PaymentValuesFields
            locale={locale}
            value={draft}
            onChange={setDraft}
            disabled={!editing}
            idPrefix={id}
            errorId={invalid ? `${id}-error` : undefined}
          />
        )}
        {['CORRECT_DRAFT', 'WITHDRAW_DRAFT', 'REVERSE'].includes(
          props.action,
        ) && (
          <label htmlFor={`${id}-reason`}>
            {copy.reason}
            <textarea
              id={`${id}-reason`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={!editing}
              required
              maxLength={2000}
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? `${id}-error` : undefined}
            />
          </label>
        )}
        {props.action === 'CONFIRM' && (
          <label htmlFor={`${id}-note`}>
            {copy.confirmationNote}
            <textarea
              id={`${id}-note`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              disabled={!editing}
              required
              maxLength={2000}
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? `${id}-error` : undefined}
            />
          </label>
        )}
        {(props.action === 'CREATE' || props.action === 'CONFIRM') && (
          <label>
            <input
              type="checkbox"
              checked={ack}
              onChange={(event) => setAck(event.target.checked)}
              disabled={!editing}
              aria-describedby={invalid ? `${id}-error` : undefined}
            />
            {props.action === 'CREATE'
              ? copy.acknowledgeObserved
              : copy.acknowledgeReviewed}
          </label>
        )}
        {invalid && (
          <p id={`${id}-error`} role="alert">
            {copy.invalid}
          </p>
        )}
        {editing && <button type="submit">{label}</button>}
      </form>
      {phase === 'pending' && <p role="status">{copy.saving}</p>}
      {phase === 'uncertain' && (
        <>
          <p role="alert">{copy.uncertain}</p>
          <button type="button" onClick={() => void send()}>
            {copy.retrySame}
          </button>
        </>
      )}
      {phase === 'conflict' && (
        <>
          <p role="alert">{copy.conflict}</p>
          {props.action === 'CREATE' ? (
            <button
              type="button"
              onClick={() => latest.current.onReloadSources()}
            >
              {copy.reload}
            </button>
          ) : (
            shown && (
              <button type="button" onClick={() => void reload()}>
                {copy.reload}
              </button>
            )
          )}
        </>
      )}
      {phase === 'saved' && (
        <>
          <p role="status">{copy.saved}</p>
          <p role="alert">{copy.refreshFailed}</p>
          <button type="button" onClick={() => void retryRead()}>
            {copy.retryRead}
          </button>
        </>
      )}
      {phase === 'denied' && <p role="alert">{copy.unavailable}</p>}
      {!protectedWork && (
        <button type="button" onClick={props.onClose}>
          {copy.close}
        </button>
      )}
    </section>
  );
}
