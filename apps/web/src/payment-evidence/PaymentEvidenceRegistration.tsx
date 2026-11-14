import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import type { BrowserIdentity } from '../access-composition';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import { useAuthorityLifetime } from '../access/use-authority-lifetime';
import { useDocumentNavigationProtection } from '../documents/document-navigation-protection';
import {
  readPaymentEvidenceDocument,
  paymentEvidenceMetadata,
  type PaymentEvidenceDocument,
} from './payment-evidence-response';
import { usePaymentEvidenceCopy } from './payment-evidence.copy';
import { PaymentEvidencePayerPicker } from './PaymentEvidencePayerPicker';
import type {
  PaymentEvidencePayerSelection as Selection,
  PaymentEvidenceRejection as Rejection,
} from './payment-evidence-types';

type Envelope = {
  body: string;
  key: string;
  selection: Selection;
  sourceDescription: string;
  receivedOn: string | null;
};
type Attempt =
  | { status: 'editable'; invalid?: true }
  | { status: 'pending' | 'uncertain'; command: Envelope }
  | { status: 'refused' | 'confirmed' | 'conflict' };
/** Fresh copying and the sealed, already-dispatched retry have separate lifetimes. */
export function PaymentEvidenceRegistration({
  identity,
  companyId,
  registerKey,
  freshPayerKey,
  onRegistered,
  onProtectedWorkChange,
  onRejected,
}: {
  identity: BrowserIdentity;
  companyId: string;
  registerKey: string;
  freshPayerKey: string | null;
  onRegistered: (document: PaymentEvidenceDocument) => void;
  onProtectedWorkChange: (protectedWork: boolean) => void;
  onRejected: Rejection;
}) {
  const copy = usePaymentEvidenceCopy(),
    id = useId();
  const [title, setTitle] = useState(''),
    [purpose, setPurpose] = useState(''),
    [sourceDescription, setSourceDescription] = useState(''),
    [receivedOn, setReceivedOn] = useState('');
  const [selected, setSelected] = useState<Selection>();
  const [attempt, setAttempt] = useState<Attempt>({ status: 'editable' });
  const pending = useRef<AbortController | undefined>(undefined);
  const envelopeLifetime = useAuthorityLifetime(registerKey, identity);
  const copyLifetime = useAuthorityLifetime(
    freshPayerKey ?? 'unavailable',
    identity,
  );
  const callbacks = useRef({ onRegistered, onRejected });
  callbacks.current = { onRegistered, onRejected };
  const busy = attempt.status === 'pending' || attempt.status === 'uncertain';
  useDocumentNavigationProtection(busy, onProtectedWorkChange);
  useEffect(() => () => pending.current?.abort(), []);
  useLayoutEffect(() => {
    setSelected(undefined);
  }, [freshPayerKey]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (
      attempt.status === 'pending' ||
      attempt.status === 'confirmed' ||
      attempt.status === 'refused' ||
      attempt.status === 'conflict'
    )
      return;
    const live = envelopeLifetime(),
      copyLive = copyLifetime();
    if (!live()) return;
    let command: Envelope;
    if (attempt.status === 'uncertain') command = attempt.command;
    else {
      if (
        !freshPayerKey ||
        !copyLive() ||
        !selected ||
        !metadata(title, 200) ||
        !metadata(purpose, 2000) ||
        !metadata(sourceDescription, 2000) ||
        !validDate(receivedOn)
      ) {
        setAttempt({ status: 'editable', invalid: true });
        return;
      }
      command = {
        key: crypto.randomUUID(),
        selection: selected,
        sourceDescription: sourceDescription.trim(),
        receivedOn: receivedOn || null,
        body: JSON.stringify({
          type: 'payment-evidence',
          clientId: selected.clientId,
          payer: selected.party,
          title,
          purpose,
          sourceDescription,
          receivedOn: receivedOn || null,
        }),
      };
    }
    const request = new AbortController();
    pending.current = request;
    const current = () => !request.signal.aborted && live();
    setAttempt({ status: 'pending', command });
    let settled = false;
    let dispatched = attempt.status === 'uncertain';
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (!current()) return;
      // Only the initial dispatch consumes fresh identity-copy authority.
      if (attempt.status !== 'uncertain' && (!copyLive() || !freshPayerKey)) {
        setAttempt({ status: 'editable' });
        return;
      }
      dispatched = true;
      const result = await api.request('/documents', {
        method: 'POST',
        companyContextId: companyId,
        signal: request.signal,
        headers: {
          'content-type': 'application/json',
          'idempotency-key': command.key,
        },
        body: command.body,
      });
      if (!current()) return;
      if (result.status === 'unauthorized' || result.status === 'forbidden') {
        settled = true;
        setAttempt({ status: 'refused' });
        await callbacks.current.onRejected(result, request.signal, current);
        return;
      }
      if (result.status === 'validation' || result.status === 'notFound') {
        setAttempt({ status: 'editable', invalid: true });
        return;
      }
      if (result.status === 'conflict') {
        setAttempt({ status: 'conflict' });
        return;
      }
      if (result.status !== 'ok')
        throw new Error('Uncertain evidence registration');
      const saved = readPaymentEvidenceDocument(result.value);
      if (!current()) return;
      const source = saved.paymentEvidenceSource;
      if (
        saved.companyId !== companyId ||
        saved.clientId !== command.selection.clientId ||
        source.sourceDescription !== command.sourceDescription ||
        source.receivedOn !== command.receivedOn ||
        (source.payer.kind === 'AVAILABLE' &&
          (source.payer.party.kind !== command.selection.party.kind ||
            (source.payer.party.kind === 'ADDITIONAL' &&
              command.selection.party.kind === 'ADDITIONAL' &&
              source.payer.party.legalEntityId !==
                command.selection.party.legalEntityId)))
      )
        throw new Error('Mismatched registration response');
      settled = true;
      setAttempt({ status: 'confirmed' });
      callbacks.current.onRegistered(paymentEvidenceMetadata(saved));
    } catch {
      if (!settled && current())
        setAttempt(
          dispatched
            ? { status: 'uncertain', command }
            : { status: 'editable', invalid: true },
        );
    }
  }
  const locked =
    busy ||
    attempt.status === 'confirmed' ||
    attempt.status === 'refused' ||
    attempt.status === 'conflict';
  return (
    <form
      className="payment-evidence-registration working-document-form working-document-registration"
      onSubmit={(event) => void submit(event)}
      noValidate
      aria-label={copy('register')}
    >
      <h4>{copy('register')}</h4>
      {freshPayerKey ? (
        <PaymentEvidencePayerPicker
          key={freshPayerKey}
          identity={identity}
          companyId={companyId}
          disabled={locked}
          onSelect={setSelected}
          onRejected={onRejected}
        />
      ) : (
        <p>{copy('identityRequired')}</p>
      )}
      <fieldset disabled={locked}>
        <label htmlFor={id + '-title'}>{copy('titleLabel')}</label>
        <input
          id={id + '-title'}
          value={title}
          maxLength={200}
          required
          onChange={(event) => setTitle(event.target.value)}
          aria-describedby={
            attempt.status === 'editable' && attempt.invalid
              ? id + '-error'
              : undefined
          }
        />
        <label htmlFor={id + '-purpose'}>{copy('purpose')}</label>
        <textarea
          id={id + '-purpose'}
          value={purpose}
          maxLength={2000}
          required
          onChange={(event) => setPurpose(event.target.value)}
        />
        <label htmlFor={id + '-source'}>{copy('sourceDescription')}</label>
        <textarea
          id={id + '-source'}
          value={sourceDescription}
          maxLength={2000}
          required
          onChange={(event) => setSourceDescription(event.target.value)}
        />
        <label htmlFor={id + '-date'}>{copy('receivedOn')}</label>
        <input
          id={id + '-date'}
          value={receivedOn}
          onChange={(event) => setReceivedOn(event.target.value)}
          inputMode="numeric"
          aria-describedby={id + '-date-hint'}
          placeholder="YYYY-MM-DD"
        />
        <p id={id + '-date-hint'}>{copy('dateHint')}</p>
      </fieldset>
      {attempt.status === 'editable' && attempt.invalid && (
        <p id={id + '-error'} role="alert">
          {copy('invalid')}
        </p>
      )}
      {attempt.status === 'uncertain' && (
        <p role="alert">{copy('uncertain')}</p>
      )}
      {attempt.status === 'refused' && <p role="alert">{copy('denied')}</p>}
      {attempt.status === 'conflict' && <p role="alert">{copy('conflict')}</p>}
      <button
        type="submit"
        className="prisme-primary-action"
        disabled={
          attempt.status === 'pending' ||
          attempt.status === 'confirmed' ||
          attempt.status === 'refused' ||
          attempt.status === 'conflict' ||
          (attempt.status === 'editable' && !freshPayerKey)
        }
      >
        {attempt.status === 'pending'
          ? copy('saving')
          : attempt.status === 'uncertain'
            ? copy('retryRegistration')
            : copy('save')}
      </button>
    </form>
  );
}
function metadata(value: string, maximum: number) {
  return (
    Boolean(value.trim()) &&
    value.trim().length <= maximum &&
    !/[\0\uD800-\uDFFF]/u.test(value)
  );
}
function validDate(value: string) {
  if (value === '') return true;
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value) || value.startsWith('0000'))
    return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return (
    Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}
