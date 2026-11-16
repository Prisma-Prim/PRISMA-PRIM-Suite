import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import { useRequestLifetime } from '../api/use-actor-requests';
import { useScopedOperationGroup } from '../api/use-scoped-operation';
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
  const lifetime = useRequestLifetime(
    identity,
    JSON.stringify([companyId, documentId, identity.loaded, identity.signedIn]),
  );
  const reads = useScopedOperationGroup(String(lifetime));
  const rejection = useRef(onRejected);
  useLayoutEffect(() => {
    rejection.current = onRejected;
  });
  useEffect(() => {
    const request = reads.beginLatest();
    if (!request) return;
    const current = () => reads.isLive() && !request.signal.aborted;
    const reject = rejection.current;
    void (async () => {
      try {
        const api = await createAuthenticatedApiClient(identity);
        if (!current()) return;
        const result = await api.request(
          '/documents/' + encodeURIComponent(documentId),
          {
            companyContextId: companyId,
            signal: request.signal,
            cache: 'no-store',
          },
        );
        if (!current()) return;
        if (result.status !== 'ok') {
          await reject(result, request.signal, current);
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
      } finally {
        request.release();
      }
    })();
    return request.retire;
  }, [companyId, documentId, identity, reads]);
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
