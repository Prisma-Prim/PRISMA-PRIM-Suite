import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { BrowserIdentity } from '../access-composition';
import { useAuthorityLifetime } from '../access/use-authority-lifetime';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import { readDocumentCorrectionReceipt } from '../documents/document-response';
import { useDocumentNavigationProtection } from '../documents/document-navigation-protection';
import { usePaymentEvidenceCopy } from './payment-evidence.copy';
import type { PaymentEvidenceDocument } from './payment-evidence-response';
import type { PaymentEvidenceRejection as Rejected } from './payment-evidence-types';
type CorrectionAttempt =
  | { status: 'closed' }
  | {
      status: 'editing';
      revision: number;
      title: string;
      purpose: string;
      invalid?: true;
    }
  | {
      status: 'pending' | 'uncertain';
      revision: number;
      title: string;
      purpose: string;
      body: string;
      key: string;
    }
  | { status: 'conflict' | 'denied' | 'confirmed' };
export function PaymentEvidenceMetadataCorrection({
  identity,
  companyId,
  documentId,
  document: loaded,
  correctKey,
  onProtectedWorkChange,
  onConfirmed,
  onRejected,
}: {
  identity: BrowserIdentity;
  companyId: string | undefined;
  documentId: string;
  document: PaymentEvidenceDocument | undefined;
  correctKey: string | null;
  onProtectedWorkChange: (protectedWork: boolean) => void;
  onConfirmed: () => void;
  onRejected: Rejected;
}) {
  const copy = usePaymentEvidenceCopy(),
    id = useId();
  const [attempt, setAttempt] = useState<CorrectionAttempt>({
    status: 'closed',
  });
  const pending = useRef<AbortController | undefined>(undefined);
  const life = useAuthorityLifetime(correctKey ?? 'unavailable', identity);
  const callbacks = useRef({ onConfirmed, onRejected });
  callbacks.current = { onConfirmed, onRejected };
  const busy = attempt.status === 'pending' || attempt.status === 'uncertain';
  useDocumentNavigationProtection(busy, onProtectedWorkChange);
  useEffect(() => () => pending.current?.abort(), []);
  if (!correctKey) return null;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (attempt.status !== 'editing' && attempt.status !== 'uncertain') return;
    if (!metadata(attempt.title, 200) || !metadata(attempt.purpose, 2000)) {
      if (attempt.status === 'editing')
        setAttempt({ ...attempt, invalid: true });
      return;
    }
    const command =
      attempt.status === 'uncertain'
        ? attempt
        : {
            ...attempt,
            status: 'pending' as const,
            body: JSON.stringify({
              expectedRevision: attempt.revision,
              title: attempt.title,
              purpose: attempt.purpose,
            }),
            key: crypto.randomUUID(),
          };
    const request = new AbortController(),
      live = life(),
      current = () => !request.signal.aborted && live();
    pending.current = request;
    setAttempt({ ...command, status: 'pending' });
    let settled = false;
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (!current()) return;
      const result = await api.request<unknown>(
        '/documents/' + encodeURIComponent(documentId),
        {
          method: 'PATCH',
          companyContextId: companyId,
          signal: request.signal,
          headers: {
            'content-type': 'application/json',
            'idempotency-key': command.key,
          },
          body: command.body,
        },
      );
      if (!current()) return;
      if (
        result.status === 'unauthorized' ||
        result.status === 'forbidden' ||
        result.status === 'notFound'
      ) {
        settled = true;
        setAttempt({ status: 'denied' });
        await callbacks.current.onRejected(result, request.signal, current);
        return;
      }
      if (result.status === 'conflict') {
        setAttempt({ status: 'conflict' });
        return;
      }
      if (result.status === 'validation') {
        setAttempt({
          status: 'editing',
          revision: command.revision,
          title: command.title,
          purpose: command.purpose,
          invalid: true,
        });
        return;
      }
      if (result.status !== 'ok') throw new Error('Uncertain correction');
      const receipt = readDocumentCorrectionReceipt(result.value);
      if (!current()) return;
      if (
        receipt.documentId !== documentId ||
        (receipt.outcome === 'corrected' &&
          receipt.revision !== command.revision + 1) ||
        (receipt.outcome === 'unchanged' &&
          receipt.revision !== command.revision)
      )
        throw new Error('Invalid correction receipt');
      settled = true;
      setAttempt({ status: 'confirmed' });
      callbacks.current.onConfirmed();
    } catch {
      if (!settled && current())
        setAttempt({ ...command, status: 'uncertain' });
    }
  }
  const editable =
    attempt.status === 'editing' ||
    attempt.status === 'uncertain' ||
    attempt.status === 'pending';
  if (!editable)
    return (
      <div>
        {attempt.status === 'confirmed' && (
          <p role="status">{copy('corrected')}</p>
        )}
        {attempt.status === 'conflict' && (
          <p role="alert">{copy('conflict')}</p>
        )}
        {attempt.status === 'denied' && <p role="alert">{copy('denied')}</p>}
        <button
          type="button"
          disabled={
            !loaded ||
            loaded.correction !== 'allowed' ||
            attempt.status === 'conflict' ||
            attempt.status === 'denied'
          }
          onClick={() => {
            if (loaded)
              setAttempt({
                status: 'editing',
                revision: loaded.workingRevision,
                title: loaded.title,
                purpose: loaded.purpose,
              });
          }}
        >
          {copy('edit')}
        </button>
      </div>
    );
  return (
    <form
      className="working-document-form working-document-correction"
      onSubmit={(event) => void submit(event)}
      noValidate
    >
      <fieldset disabled={busy}>
        <label htmlFor={id + '-title'}>{copy('titleLabel')}</label>
        <input
          id={id + '-title'}
          value={attempt.title}
          maxLength={200}
          onChange={(event) => {
            if (attempt.status === 'editing')
              setAttempt({ ...attempt, title: event.target.value });
          }}
          aria-describedby={
            attempt.status === 'editing' && attempt.invalid
              ? id + '-error'
              : undefined
          }
        />
        <label htmlFor={id + '-purpose'}>{copy('purpose')}</label>
        <textarea
          id={id + '-purpose'}
          value={attempt.purpose}
          maxLength={2000}
          onChange={(event) => {
            if (attempt.status === 'editing')
              setAttempt({ ...attempt, purpose: event.target.value });
          }}
        />
      </fieldset>
      {attempt.status === 'editing' && attempt.invalid && (
        <p id={id + '-error'} role="alert">
          {copy('invalid')}
        </p>
      )}
      {attempt.status === 'uncertain' && (
        <p role="alert">{copy('correctionUncertain')}</p>
      )}
      <button type="submit" disabled={attempt.status === 'pending'}>
        {attempt.status === 'uncertain'
          ? copy('retryCorrection')
          : copy('saveCorrection')}
      </button>
      {attempt.status === 'editing' && (
        <button type="button" onClick={() => setAttempt({ status: 'closed' })}>
          {copy('cancel')}
        </button>
      )}
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
