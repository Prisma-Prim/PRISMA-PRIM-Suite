import { useEffect, useId, useRef, useState } from 'react';
import { Select } from '../presentation/Select';
import {
  readSources,
  sourceKey,
  type InvoiceSource,
} from './invoice-record-contract';
import { useInvoiceRecordCopy } from './invoice-record-copy';
import {
  accessRejected,
  useInvoiceOwner,
  type InvoiceAccessProps,
  type InvoiceAccessRecovery,
} from './invoice-record-owner';
import { InvoiceContextView } from './InvoiceRecordValues';

export function InvoiceSourcePicker(
  props: InvoiceAccessProps & {
    companyId: string;
    readCapture: string;
    sourceAuthority: string;
    selected: InvoiceSource | undefined;
    onSelect: (value: InvoiceSource | undefined) => void;
    disabled: boolean;
    onDenied: () => void;
    recoverAccess?: InvoiceAccessRecovery;
  },
) {
  const copy = useInvoiceRecordCopy();
  const id = useId();
  const owner = useInvoiceOwner(
    props,
    props.companyId,
    props.sourceAuthority,
    props.recoverAccess,
  );
  const [items, setItems] = useState<InvoiceSource[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const seen = useRef(new Set<string>());
  const pending = useRef(false);
  async function load(continuation: string | null = null) {
    if (pending.current) return;
    pending.current = true;
    setState('loading');
    const result = await owner.request(
      `/invoice-records/sources${continuation ? `?cursor=${encodeURIComponent(continuation)}` : ''}`,
    );
    if (!owner.isLive() || result.status === 'retired') return;
    pending.current = false;
    if (accessRejected(result)) {
      props.onDenied();
      return;
    }
    const page =
      result.status === 'ok'
        ? readSources(result.value, props.companyId, props.readCapture)
        : undefined;
    const previous = continuation ? items : [];
    if (
      !page ||
      (page.nextCursor !== null &&
        (seen.current.has(page.nextCursor) ||
          page.nextCursor === continuation)) ||
      page.items.some((item) =>
        previous.some(
          (old) => sourceKey(old.source) === sourceKey(item.source),
        ),
      )
    ) {
      setState('error');
      return;
    }
    if (!continuation) seen.current.clear();
    if (continuation) seen.current.add(continuation);
    setItems([...previous, ...page.items]);
    setCursor(page.nextCursor);
    setState('ready');
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <section aria-label={copy.source}>
      <div>
        <label htmlFor={id}>{copy.chooseSource}</label>
        <Select
          id={id}
          value={props.selected ? sourceKey(props.selected.source) : ''}
          placeholder={copy.chooseSource}
          disabled={props.disabled || state === 'loading'}
          emptyMessage={copy.sourceEmpty}
          options={items.map((item) => ({
            value: sourceKey(item.source),
            label: `${item.documentTitle} · ${copy.version} ${item.versionNumber} (${item.versionState === 'official' ? copy.official : copy.superseded}) · ${item.fileName} · ${item.copiedContext.contractReference} · ${copy.version} ${item.copiedContext.contractVersionNumber} · ${item.copiedContext.receivingParty.legalName}`,
          }))}
          onValueChange={(value) =>
            props.onSelect(
              items.find((item) => sourceKey(item.source) === value),
            )
          }
        />
      </div>
      {state === 'loading' && <p role="status">{copy.loading}</p>}
      {state === 'error' && (
        <p role="alert">
          {copy.error}{' '}
          <button
            type="button"
            disabled={props.disabled}
            onClick={() => void load(cursor)}
          >
            {copy.retry}
          </button>
        </p>
      )}
      {state === 'ready' && items.length === 0 && <p>{copy.sourceEmpty}</p>}
      {cursor && state === 'ready' && (
        <button
          type="button"
          disabled={props.disabled}
          onClick={() => void load(cursor)}
        >
          {copy.more}
        </button>
      )}
      {props.selected && (
        <InvoiceContextView context={props.selected.copiedContext} />
      )}
    </section>
  );
}
