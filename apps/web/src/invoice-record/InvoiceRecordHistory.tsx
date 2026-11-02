import { useRef, useState } from 'react';
import { conflictCode } from '../api/authenticated-api-client';
import { useInterfaceLocale } from '../localization/interface-locale';
import { readHistory, type InvoiceCurrent } from './invoice-record-contract';
import { useInvoiceRecordCopy } from './invoice-record-copy';
import { type InvoiceRevision } from './invoice-record-history';
import {
  accessRejected,
  useInvoiceOwner,
  type InvoiceAccessProps,
} from './invoice-record-owner';
import { sameValues } from './invoice-record-values';
import { InvoiceValuesView } from './InvoiceRecordValues';

function Revision({ fact }: { fact: InvoiceRevision }) {
  const copy = useInvoiceRecordCopy();
  const { formatDateTime } = useInterfaceLocale();
  return (
    <li>
      <h4>
        {copy.revision} {fact.revision} ·{' '}
        {fact.action === 'CREATE'
          ? copy.created
          : fact.action === 'CORRECT'
            ? copy.corrected
            : copy.entryWithdrawn}
      </h4>
      <p>
        {copy.actor}: {fact.actor.displayName} ·{' '}
        <time dateTime={fact.recordedAt}>
          {formatDateTime(fact.recordedAt)}
        </time>
      </p>
      {fact.reason !== null && (
        <p className="invoice-record-literal">
          {copy.reason}: {fact.reason}
        </p>
      )}
      <div className="invoice-record-revision-values">
        {fact.before && (
          <section aria-label={copy.before}>
            <h5>{copy.before}</h5>
            <p>
              {fact.before.entryState === 'RECORDED'
                ? copy.recorded
                : copy.withdrawn}
            </p>
            <InvoiceValuesView values={fact.before.values} />
          </section>
        )}
        <section aria-label={copy.after}>
          <h5>{copy.after}</h5>
          <p>
            {fact.after.entryState === 'RECORDED'
              ? copy.recorded
              : copy.withdrawn}
          </p>
          <InvoiceValuesView values={fact.after.values} />
        </section>
      </div>
    </li>
  );
}
export function InvoiceRecordHistory(
  props: InvoiceAccessProps & {
    companyId: string;
    readCapture: string;
    readAuthority: string;
    current: InvoiceCurrent;
    onDenied: () => void;
    onReload: () => void;
  },
) {
  const copy = useInvoiceRecordCopy();
  const record = props.current.record;
  const owner = useInvoiceOwner(
    props,
    props.companyId,
    JSON.stringify([props.readAuthority, record.id, record.revision]),
  );
  const [items, setItems] = useState(props.current.history.items);
  const [cursor, setCursor] = useState(props.current.history.nextCursor);
  const [state, setState] = useState<'idle' | 'loading' | 'error' | 'changed'>(
    'idle',
  );
  const pending = useRef(false);
  const seen = useRef(new Set<string>());
  async function more() {
    if (!cursor || pending.current) return;
    pending.current = true;
    setState('loading');
    const result = await owner.request(
      `/invoice-records/${encodeURIComponent(record.id)}/history?cursor=${encodeURIComponent(cursor)}`,
    );
    if (!owner.isLive() || result.status === 'retired') return;
    pending.current = false;
    if (accessRejected(result) || result.status === 'notFound') {
      props.onDenied();
      return;
    }
    if (
      result.status === 'conflict' &&
      conflictCode(result) === 'INVOICE_HISTORY_CHANGED'
    ) {
      setState('changed');
      return;
    }
    const last = items[items.length - 1];
    const page =
      result.status === 'ok' && last
        ? readHistory(
            result.value,
            props.companyId,
            record.id,
            record.revision,
            last.revision - 1,
            props.readCapture,
          )
        : undefined;
    const first = page?.items[0];
    if (
      !page ||
      !last?.before ||
      !first ||
      last.before.entryState !== first.after.entryState ||
      !sameValues(last.before.values, first.after.values) ||
      (page.nextCursor !== null &&
        (seen.current.has(page.nextCursor) || page.nextCursor === cursor))
    ) {
      setState('error');
      return;
    }
    seen.current.add(cursor);
    setItems([...items, ...page.items]);
    setCursor(page.nextCursor);
    setState('idle');
  }
  return (
    <section aria-label={copy.history}>
      <h3>{copy.history}</h3>
      <ol className="invoice-record-history">
        {items.map((item) => (
          <Revision key={item.revision} fact={item} />
        ))}
      </ol>
      {state === 'loading' && <p role="status">{copy.loading}</p>}
      {state === 'error' && <p role="alert">{copy.error}</p>}
      {state === 'changed' ? (
        <p role="alert">
          {copy.historyChanged}{' '}
          <button type="button" onClick={props.onReload}>
            {copy.reload}
          </button>
        </p>
      ) : (
        cursor && (
          <button
            type="button"
            disabled={pending.current}
            onClick={() => void more()}
          >
            {state === 'error' ? copy.retry : copy.more}
          </button>
        )
      )}
    </section>
  );
}
