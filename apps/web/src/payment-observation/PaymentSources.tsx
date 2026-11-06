import { useEffect, useRef, useState } from 'react';
import { useInterfaceLocale } from '../localization/interface-locale';
import { readPaymentSources } from './payment-contract';
import { usePaymentOwner, type PaymentAccessProps } from './payment-owner';
import type { PaymentSelectable, PaymentSourcePage } from './payment.types';
import { PaymentSourceView, paymentCopy } from './ui';

export function PaymentSources(
  props: PaymentAccessProps & {
    companyId: string;
    capture: string;
    authority: string;
    disabled: boolean;
    onSelect: (source: PaymentSelectable) => void;
    onReady?: () => void;
  },
) {
  const { locale } = useInterfaceLocale(),
    copy = paymentCopy[locale];
  const owner = usePaymentOwner(props, props.companyId, props.authority);
  const [page, setPage] = useState<PaymentSourcePage>(),
    [status, setStatus] = useState('loading');
  const sequence = useRef(0);
  async function load(cursor?: string) {
    const request = ++sequence.current;
    setStatus('loading');
    const result = await owner.request(
      `/payments/sources${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    );
    if (
      !owner.isLive() ||
      request !== sequence.current ||
      result.status === 'retired'
    )
      return;
    if (result.status === 'ok') {
      try {
        setPage(
          readPaymentSources(result.value, props.companyId, props.capture),
        );
        setStatus('ready');
        props.onReady?.();
      } catch {
        setPage(undefined);
        setStatus('error');
      }
    } else {
      setPage(undefined);
      setStatus(result.status === 'forbidden' ? 'denied' : 'error');
    }
  }
  useEffect(() => {
    void load();
    return () => {
      sequence.current++;
      owner.retire();
    };
  }, []);
  return (
    <section aria-label={copy.selectSource}>
      <h3>{copy.selectSource}</h3>
      {status === 'loading' && <p role="status">{copy.loading}</p>}
      {status === 'denied' && <p role="alert">{copy.unavailable}</p>}
      {status === 'error' && (
        <>
          <p role="alert">{copy.error}</p>
          <button
            type="button"
            disabled={props.disabled}
            onClick={() => void load()}
          >
            {copy.retryRead}
          </button>
        </>
      )}
      {page && (
        <>
          <ul>
            {page.items.map((source, index) => (
              <li key={JSON.stringify(source.source)}>
                <PaymentSourceView locale={locale} source={source} />
                <button
                  type="button"
                  disabled={props.disabled || status === 'loading'}
                  onClick={() => props.onSelect(source)}
                >
                  {copy.selectSource} {index + 1}
                </button>
              </li>
            ))}
          </ul>
          {page.items.length === 0 && <p>{copy.sourceEmpty}</p>}
          {page.nextCursor && (
            <button
              type="button"
              disabled={props.disabled || status === 'loading'}
              onClick={() => void load(page.nextCursor ?? undefined)}
            >
              {copy.loadMore}
            </button>
          )}
        </>
      )}
    </section>
  );
}
