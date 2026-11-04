import { useContext, useEffect, useRef, useState } from 'react';
import { invoiceRecordAuthority } from '../access/invoice-record-authority';
import { useInterfaceLocale } from '../localization/interface-locale';
import { SectionVisibility } from '../production-shell/section-visibility';
import { readInventory, type InvoiceSummary } from './invoice-record-contract';
import { useInvoiceRecordCopy } from './invoice-record-copy';
import { displayMoney } from './invoice-record-money';
import type { InvoiceReceipt } from './invoice-record-history';
import {
  accessRejected,
  useInvoiceLifetime,
  useInvoiceOwner,
  type InvoiceAccessProps,
} from './invoice-record-owner';
import {
  InvoiceRecordDetail,
  type InvoiceAuthority,
} from './InvoiceRecordDetail';
import { InvoiceRecordForm } from './InvoiceRecordForm';
import type { InvoiceRelatedCallbacks } from './InvoiceRecordRelations';
import './invoice-record.css';

export type InvoiceRecordsWorkspaceProps = InvoiceAccessProps &
  InvoiceRelatedCallbacks & { projectionAuthority: string };
function financeReadCapture(actor: InvoiceAccessProps['actor']) {
  const company = actor.activeCompany;
  return company &&
    'invoiceRecordReadCapture' in company &&
    typeof company.invoiceRecordReadCapture === 'string' &&
    company.invoiceRecordReadCapture.length > 0
    ? company.invoiceRecordReadCapture
    : undefined;
}
export function InvoiceRecordsWorkspace(props: InvoiceRecordsWorkspaceProps) {
  const visible = useContext(SectionVisibility);
  const authority = invoiceRecordAuthority(props.actor);
  const capture = financeReadCapture(props.actor);
  const generation = useInvoiceLifetime(
    props.identity,
    JSON.stringify([
      authority?.key,
      props.identity.loaded,
      props.identity.signedIn,
      visible,
    ]),
  );
  if (
    !visible ||
    !authority ||
    !capture ||
    !props.identity.loaded ||
    !props.identity.signedIn
  )
    return null;
  return (
    <InvoiceWorkspaceOwner
      key={generation}
      {...props}
      authority={authority}
      readCapture={capture}
    />
  );
}
type Selection =
  | { kind: 'inventory' }
  | {
      kind: 'record';
      id: string;
      generation: number;
      receipt?: InvoiceReceipt;
    };
function InvoiceWorkspaceOwner(
  props: InvoiceRecordsWorkspaceProps & {
    authority: InvoiceAuthority;
    readCapture: string;
  },
) {
  const copy = useInvoiceRecordCopy();
  const owner = useInvoiceOwner(
    props,
    props.authority.companyId,
    props.authority.key,
  );
  const [selection, setSelection] = useState<Selection>({ kind: 'inventory' });
  const [denied, setDenied] = useState(false);
  const [create, setCreate] = useState<{
    generation: number;
    authority: string;
    manage: string;
  }>();
  const generation = useRef(0);
  const sourceGeneration = useInvoiceLifetime(
    props.identity,
    JSON.stringify([
      props.authority.sourceKey,
      props.authority.manageKey,
      props.projectionAuthority,
    ]),
  );
  const activeCreate =
    create?.generation === sourceGeneration &&
    create.authority === props.authority.sourceKey &&
    create.manage === props.authority.manageKey
      ? create
      : undefined;
  function open(id: string, receipt?: InvoiceReceipt) {
    generation.current += 1;
    setCreate(undefined);
    owner.retire();
    setSelection({
      kind: 'record',
      id,
      generation: generation.current,
      receipt,
    });
  }
  function deny() {
    owner.retire();
    setCreate(undefined);
    setDenied(true);
  }
  function leaveCreate() {
    owner.retire();
    setCreate(undefined);
  }
  return (
    <section
      id="invoice-records"
      tabIndex={-1}
      className="invoice-record-workspace"
      aria-labelledby="invoice-record-heading"
    >
      <header>
        <h2 id="invoice-record-heading">{copy.title}</h2>
        <p>{props.actor.activeCompany?.displayName}</p>
        <p className="invoice-record-notice">{copy.description}</p>
      </header>
      {denied ? (
        <p role="alert">{copy.denied}</p>
      ) : selection.kind === 'record' ? (
        <InvoiceRecordDetail
          key={selection.generation}
          {...props}
          recordId={selection.id}
          confirmed={selection.receipt}
          onOpenRecord={open}
          onBack={() => setSelection({ kind: 'inventory' })}
        />
      ) : (
        <>
          {!activeCreate &&
            props.authority.manageKey &&
            props.authority.sourceKey && (
              <button
                type="button"
                onClick={() => {
                  if (props.authority.sourceKey && props.authority.manageKey) {
                    owner.retire();
                    setCreate({
                      generation: sourceGeneration,
                      authority: props.authority.sourceKey,
                      manage: props.authority.manageKey,
                    });
                  }
                }}
              >
                {copy.create}
              </button>
            )}
          {activeCreate &&
          props.authority.manageKey &&
          props.authority.sourceKey ? (
            <InvoiceRecordForm
              {...props}
              key={sourceGeneration}
              companyId={props.authority.companyId}
              manageAuthority={props.authority.manageKey}
              sourceAuthority={props.authority.sourceKey}
              edit={{ kind: 'CREATE', replaces: null }}
              onCancel={leaveCreate}
              onDenied={() => setCreate(undefined)}
              onSaved={(receipt) => open(receipt.recordId, receipt)}
              onReload={leaveCreate}
              recoverAccess={owner.recover}
            />
          ) : (
            <InvoiceInventory {...props} onOpen={open} onDenied={deny} />
          )}
        </>
      )}
    </section>
  );
}
function InvoiceInventory(
  props: InvoiceRecordsWorkspaceProps & {
    authority: InvoiceAuthority;
    readCapture: string;
    onOpen: (id: string) => void;
    onDenied: () => void;
  },
) {
  const copy = useInvoiceRecordCopy();
  const { locale } = useInterfaceLocale();
  const owner = useInvoiceOwner(
    props,
    props.authority.companyId,
    props.authority.key,
  );
  const [items, setItems] = useState<InvoiceSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const pending = useRef(false);
  const seen = useRef(new Set<string>());
  async function load(continuation: string | null = null) {
    if (pending.current) return;
    pending.current = true;
    setState('loading');
    const result = await owner.request(
      `/invoice-records${continuation ? `?cursor=${encodeURIComponent(continuation)}` : ''}`,
    );
    if (!owner.isLive() || result.status === 'retired') return;
    pending.current = false;
    if (accessRejected(result)) {
      props.onDenied();
      return;
    }
    const page =
      result.status === 'ok'
        ? readInventory(
            result.value,
            props.authority.companyId,
            props.readCapture,
          )
        : undefined;
    const previous = continuation ? items : [];
    const last = previous[previous.length - 1];
    const first = page?.items[0];
    if (
      !page ||
      (page.nextCursor !== null &&
        (seen.current.has(page.nextCursor) ||
          page.nextCursor === continuation)) ||
      page.items.some((item) =>
        previous.some((prior) => prior.id === item.id),
      ) ||
      (last &&
        first &&
        (last.createdAt < first.createdAt ||
          (last.createdAt === first.createdAt && last.id <= first.id)))
    ) {
      setState('error');
      return;
    }
    if (!continuation) seen.current.clear();
    else seen.current.add(continuation);
    setItems([...previous, ...page.items]);
    setCursor(page.nextCursor);
    setState('ready');
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <section aria-label={copy.title}>
      {state === 'loading' && <p role="status">{copy.loading}</p>}
      {state === 'ready' && items.length === 0 && <p>{copy.empty}</p>}
      <ul className="invoice-record-inventory">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="invoice-record-row"
              onClick={() => props.onOpen(item.id)}
            >
              <strong>{item.values.externalNumber}</strong>
              <span>{item.values.externalSystem}</span>
              <span>
                {item.copiedContext.contractReference} · {copy.version}{' '}
                {item.copiedContext.contractVersionNumber}
              </span>
              <span>{item.copiedContext.receivingParty.legalName}</span>
              <span>
                {displayMoney({
                  minor: item.values.grossMinor,
                  currency: item.values.currency,
                  locale,
                })}
              </span>
              <span>
                {item.entryState === 'RECORDED'
                  ? copy.recorded
                  : copy.withdrawn}{' '}
                · {copy.revision} {item.revision}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {state === 'error' && (
        <p role="alert">
          {copy.error}{' '}
          <button type="button" onClick={() => void load(cursor)}>
            {copy.retry}
          </button>
        </p>
      )}
      {cursor && state === 'ready' && (
        <button type="button" onClick={() => void load(cursor)}>
          {copy.more}
        </button>
      )}
    </section>
  );
}
