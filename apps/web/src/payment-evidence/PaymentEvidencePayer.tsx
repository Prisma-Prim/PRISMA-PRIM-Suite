import { useEffect, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import {
  readPaymentEvidenceDocument,
  type PaymentEvidenceSource,
} from './payment-evidence-response';
import { usePaymentEvidenceCopy } from './payment-evidence.copy';
import type { PaymentEvidenceRejection as Rejected } from './payment-evidence-types';
export function PaymentEvidencePayer({
  identity,
  companyId,
  documentId,
  onRejected,
}: {
  identity: BrowserIdentity;
  companyId: string;
  documentId: string;
  onRejected: Rejected;
}) {
  const copy = usePaymentEvidenceCopy();
  const [payer, setPayer] = useState<PaymentEvidenceSource['payer']>();
  useEffect(() => {
    const request = new AbortController(),
      current = () => !request.signal.aborted;
    void (async () => {
      try {
        const api = await createAuthenticatedApiClient(identity);
        if (!current()) return;
        const result = await api.request<unknown>(
          '/documents/' + encodeURIComponent(documentId),
          {
            companyContextId: companyId,
            signal: request.signal,
            cache: 'no-store',
          },
        );
        if (!current()) return;
        if (result.status !== 'ok') {
          await onRejected(result, request.signal, current);
          if (current()) setPayer({ kind: 'UNAVAILABLE' });
          return;
        }
        const loaded = readPaymentEvidenceDocument(result.value);
        if (!current()) return;
        if (loaded.id !== documentId || loaded.companyId !== companyId)
          throw new Error('Wrong source payer');
        setPayer(loaded.paymentEvidenceSource.payer);
      } catch {
        if (current()) setPayer({ kind: 'UNAVAILABLE' });
      }
    })();
    return () => request.abort();
  }, [companyId, documentId, identity, onRejected]);
  if (!payer) return <p role="status">{copy('loading')}</p>;
  if (payer.kind === 'UNAVAILABLE') return <p>{copy('payerUnavailable')}</p>;
  return (
    <section className="payment-evidence-party" aria-label={copy('payer')}>
      <h5>{copy('payer')}</h5>
      <p>{copy(payer.party.kind === 'PRIMARY' ? 'primary' : 'additional')}</p>
      <p>{payer.party.legalName}</p>
      <dl>
        <dt>{copy('taxId')}</dt>
        <dd>{payer.party.taxId ?? copy('notRecorded')}</dd>
        <dt>{copy('address')}</dt>
        <dd>{payer.party.legalAddress ?? copy('notRecorded')}</dd>
      </dl>
    </section>
  );
}
