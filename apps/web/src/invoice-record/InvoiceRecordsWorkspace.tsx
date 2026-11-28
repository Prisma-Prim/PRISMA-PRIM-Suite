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
  useRequestLifetime,
  useActorRequests,
  type ActorRequestProps,
} from '../api/use-actor-requests';
import {
  InvoiceRecordDetail,
  type InvoiceAuthority,
} from './InvoiceRecordDetail';
import { InvoiceRecordForm } from './InvoiceRecordForm';
import type { InvoiceRelatedCallbacks } from './InvoiceRecordRelations';
import './invoice-record.css';

export type InvoiceRecordsWorkspaceProps = ActorRequestProps &
  InvoiceRelatedCallbacks & { projectionAuthority: string };
/** What an Invoice Records owner reads under: its authority and read capture. */
export type InvoiceOwnerProps = InvoiceRecordsWorkspaceProps & {
  authority: InvoiceAuthority;
  readCapture: string;
};
function financeReadCapture(actor: ActorRequestProps['actor']) {
  const company = actor.activeCompany;
  return company &&
    'invoiceRecordReadCapture' in company &&
    typeof company.invoiceRecordReadCapture === 'string' &&
    company.invoiceRecordReadCapture.length > 0
    ? company.invoiceRecordReadCapture
    : undefined;
}
/**
 * The owner an Invoice Records view may mount while its section is shown:
 * its authority, read capture and the lifetime that keys it. Both interfaces
 * use the same gate.
 */
export function useInvoiceWorkspaceGate(props: InvoiceRecordsWorkspaceProps):
  | {
      authority: InvoiceAuthority;
      readCapture: string;
      generation: number;
    }
  | undefined {
  const visible = useContext(SectionVisibility);
  const authority = invoiceRecordAuthority(props.actor);
  const capture = financeReadCapture(props.actor);
  const generation = useRequestLifetime(
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
    return undefined;
  return { authority, readCapture: capture, generation };
}
export function InvoiceRecordsWorkspace(props: InvoiceRecordsWorkspaceProps) {
  const gate = useInvoiceWorkspaceGate(props);
  if (!gate) return null;
  return (
    <InvoiceWorkspaceOwner
      key={gate.generation}
      {...props}
      authority={gate.authority}
      readCapture={gate.readCapture}
    />
  );
}
export type InvoiceSelection =
  | { kind: 'inventory' }
  | {
      kind: 'record';
      id: string;
      generation: number;
      receipt?: InvoiceReceipt;
    };
/**
 * The inventory, record and creation selection of one Invoice Records owner.
 * Opening a record or leaving creation retires the owner's earlier requests;
 * creation lives only while its source, manage and projection authority do.
 */
export function useInvoiceWorkspaceOwner(props: InvoiceOwnerProps) {
  const owner = useActorRequests({
    ...props,
    companyId: props.authority.companyId,
    scope: props.authority.key,
  });
  const [selection, setSelection] = useState<InvoiceSelection>({
    kind: 'inventory',
  });
  const [denied, setDenied] = useState(false);
  const [create, setCreate] = useState<{
    generation: number;
    authority: string;
    manage: string;
  }>();
  const generation = useRef(0);
  const sourceGeneration = useRequestLifetime(
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
  function startCreate() {
    if (props.authority.sourceKey && props.authority.manageKey) {
      owner.retire();
      setCreate({
        generation: sourceGeneration,
        authority: props.authority.sourceKey,
        manage: props.authority.manageKey,
      });
    }
  }
  return {
    selection,
    backToInventory: () => setSelection({ kind: 'inventory' }),
    denied,
    activeCreate,
    sourceGeneration,
    recoverAccess: owner.recover,
    open,
    deny,
    leaveCreate,
    /** A creation denial closes the form and keeps the inventory. */
    closeCreate: () => setCreate(undefined),
    startCreate,
  };
}
function InvoiceWorkspaceOwner(props: InvoiceOwnerProps) {
  const copy = useInvoiceRecordCopy();
  const workspace = useInvoiceWorkspaceOwner(props);
  const { selection, activeCreate } = workspace;
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
      {workspace.denied ? (
        <p role="alert">{copy.denied}</p>
      ) : selection.kind === 'record' ? (
        <InvoiceRecordDetail
          key={selection.generation}
          {...props}
          recordId={selection.id}
          confirmed={selection.receipt}
          onOpenRecord={workspace.open}
          onBack={workspace.backToInventory}
        />
      ) : (
        <>
          {!activeCreate &&
            props.authority.manageKey &&
            props.authority.sourceKey && (
              <button type="button" onClick={workspace.startCreate}>
                {copy.create}
              </button>
            )}
          {activeCreate &&
          props.authority.manageKey &&
          props.authority.sourceKey ? (
            <InvoiceRecordForm
              {...props}
              key={workspace.sourceGeneration}
              companyId={props.authority.companyId}
              manageAuthority={props.authority.manageKey}
              sourceAuthority={props.authority.sourceKey}
              edit={{ kind: 'CREATE', replaces: null }}
              onCancel={workspace.leaveCreate}
              onDenied={workspace.closeCreate}
              onSaved={(receipt) => workspace.open(receipt.recordId, receipt)}
              onReload={workspace.leaveCreate}
              recoverAccess={workspace.recoverAccess}
            />
          ) : (
            <InvoiceInventory
              {...props}
              onOpen={workspace.open}
              onDenied={workspace.deny}
            />
          )}
        </>
      )}
    </section>
  );
}
/**
 * The paged Invoice Records inventory. A page that repeats a cursor or a row,
 * or breaks the newest-first order, is refused as an error.
 */
export function useInvoiceInventory(
  props: InvoiceOwnerProps & { onDenied: () => void },
) {
  const owner = useActorRequests({
    ...props,
    companyId: props.authority.companyId,
    scope: props.authority.key,
  });
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
  return { items, cursor, state, load };
}
function InvoiceInventory(
  props: InvoiceOwnerProps & {
    onOpen: (id: string) => void;
    onDenied: () => void;
  },
) {
  const copy = useInvoiceRecordCopy();
  const { locale } = useInterfaceLocale();
  const { items, cursor, state, load } = useInvoiceInventory(props);
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
