import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useInterfaceLocale } from '../../localization/interface-locale';
import { useInvoiceRecordCopy } from '../../invoice-record/invoice-record-copy';
import { displayMoney } from '../../invoice-record/invoice-record-money';
import { InvoiceRecordDetail } from '../../invoice-record/InvoiceRecordDetail';
import { InvoiceRecordForm } from '../../invoice-record/InvoiceRecordForm';
import {
  useInvoiceInventory,
  useInvoiceWorkspaceGate,
  useInvoiceWorkspaceOwner,
  type InvoiceOwnerProps,
  type InvoiceRecordsWorkspaceProps,
} from '../../invoice-record/InvoiceRecordsWorkspace';
import '../../invoice-record/invoice-record.css';
import { ClarteBadge } from '../components/ClarteBadge';
import { ClarteButton } from '../components/ClarteButton';
import { ClarteCard } from '../components/ClarteCard';
import { ClarteSidePanel } from '../components/ClarteSidePanel';
import {
  ClarteEmptyState,
  ClarteErrorState,
  ClarteLoadingState,
} from '../components/ClarteState';
import { openFromRow, RowChevron, RowChevronHead } from './ClarteFinanceRow';
import { clarteSourcePdfRenderer } from './ClarteSourcePdf';
import { useClarteFinanceCopy } from './clarte-finance.copy';
import './clarte-finance.css';

/**
 * Finance › Invoices in Clarté (#1544): the Invoice Records inventory as a
 * table, each record in a side panel and every transcription made beside its
 * exact source PDF. The owners, reads, commands and gates are the Invoice
 * Record module's own; this screen only lays them out.
 */
export function ClarteInvoiceRecords(props: InvoiceRecordsWorkspaceProps) {
  const gate = useInvoiceWorkspaceGate(props);
  if (!gate) return null;
  return (
    <ClarteInvoiceOwner
      key={gate.generation}
      {...props}
      authority={gate.authority}
      readCapture={gate.readCapture}
    />
  );
}

function ClarteInvoiceOwner(props: InvoiceOwnerProps) {
  const copy = useInvoiceRecordCopy();
  const finance = useClarteFinanceCopy();
  const workspace = useInvoiceWorkspaceOwner(props);
  const [inventoryRead, setInventoryRead] = useState(0);
  const [editing, setEditing] = useState(false);
  const [creationHeld, setCreationHeld] = useState(false);
  const [titles, setTitles] = useState<ReadonlyMap<string, string>>(new Map());
  const { selection, activeCreate } = workspace;
  const renderSourceView = clarteSourcePdfRenderer(props);
  const canCreate = Boolean(
    props.authority.manageKey && props.authority.sourceKey,
  );
  function closeRecord() {
    if (editing) return;
    workspace.backToInventory();
    // A fresh read shows what the record's commands changed.
    setInventoryRead((value) => value + 1);
  }
  return (
    <section
      id="invoice-records"
      tabIndex={-1}
      className="clarte-finance"
      aria-label={copy.title}
    >
      {workspace.denied ? (
        <ClarteErrorState title={copy.denied} />
      ) : (
        <ClarteCard
          title={finance.text('invoicesHeading')}
          actions={
            canCreate && (
              <ClarteButton
                variant="primary"
                disabled={Boolean(activeCreate)}
                onClick={workspace.startCreate}
              >
                <Plus aria-hidden="true" />
                {copy.create}
              </ClarteButton>
            )
          }
        >
          <ClarteInvoiceTable
            key={inventoryRead}
            {...props}
            onOpen={(id, title) => {
              setTitles((known) => new Map(known).set(id, title));
              workspace.open(id);
            }}
            onDenied={workspace.deny}
          />
        </ClarteCard>
      )}
      {!workspace.denied && selection.kind === 'record' && (
        <div className="clarte-finance-wide">
          <ClarteSidePanel
            title={titles.get(selection.id) ?? finance.text('invoicePanel')}
            description={copy.title}
            onClose={closeRecord}
          >
            <div className="clarte-finance-invoice">
              <InvoiceRecordDetail
                key={selection.generation}
                {...props}
                renderSourceView={renderSourceView}
                recordId={selection.id}
                confirmed={selection.receipt}
                onOpenRecord={workspace.open}
                onBack={closeRecord}
                onEditingChange={setEditing}
              />
            </div>
          </ClarteSidePanel>
        </div>
      )}
      {!workspace.denied &&
        activeCreate &&
        props.authority.manageKey &&
        props.authority.sourceKey && (
          <div className="clarte-finance-wide">
            <ClarteSidePanel
              title={copy.create}
              description={copy.title}
              onClose={() => {
                if (!creationHeld) workspace.leaveCreate();
              }}
            >
              <div className="clarte-finance-invoice clarte-finance-create">
                <InvoiceRecordForm
                  {...props}
                  key={workspace.sourceGeneration}
                  renderSourceView={renderSourceView}
                  companyId={props.authority.companyId}
                  manageAuthority={props.authority.manageKey}
                  sourceAuthority={props.authority.sourceKey}
                  edit={{ kind: 'CREATE', replaces: null }}
                  onCancel={workspace.leaveCreate}
                  onDenied={workspace.closeCreate}
                  onSaved={(receipt) => {
                    setInventoryRead((value) => value + 1);
                    workspace.open(receipt.recordId, receipt);
                  }}
                  onReload={workspace.leaveCreate}
                  onLockedChange={setCreationHeld}
                  recoverAccess={workspace.recoverAccess}
                />
              </div>
            </ClarteSidePanel>
          </div>
        )}
    </section>
  );
}

function ClarteInvoiceTable(
  props: InvoiceOwnerProps & {
    onOpen: (id: string, title: string) => void;
    onDenied: () => void;
  },
) {
  const copy = useInvoiceRecordCopy();
  const finance = useClarteFinanceCopy();
  const { locale } = useInterfaceLocale();
  const { items, cursor, state, load } = useInvoiceInventory(props);
  if (state === 'loading' && items.length === 0)
    return <ClarteLoadingState label={copy.loading} />;
  return (
    <>
      {state === 'ready' && items.length === 0 && (
        <ClarteEmptyState title={copy.empty} />
      )}
      {items.length > 0 && (
        <div className="clarte-table-wrap">
          <table className="clarte-table clarte-finance-table">
            <thead>
              <tr>
                <th scope="col">{finance.text('invoiceColumn')}</th>
                <th scope="col">{finance.text('partyContractColumn')}</th>
                <th scope="col">{finance.text('amountColumn')}</th>
                <th scope="col">{copy.due}</th>
                <th scope="col">{finance.text('statusColumn')}</th>
                <RowChevronHead />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="clarte-finance-row"
                  onClick={openFromRow(() =>
                    props.onOpen(item.id, item.values.externalNumber),
                  )}
                >
                  <td>
                    <button
                      type="button"
                      className="clarte-finance-row-open"
                      onClick={() =>
                        props.onOpen(item.id, item.values.externalNumber)
                      }
                    >
                      {item.values.externalNumber}
                    </button>
                    <small>{item.values.externalSystem}</small>
                  </td>
                  <td data-label={finance.text('partyContractColumn')}>
                    <span>{item.copiedContext.receivingParty.legalName}</span>
                    <small>
                      {item.copiedContext.contractReference} · {copy.version}{' '}
                      {item.copiedContext.contractVersionNumber}
                    </small>
                  </td>
                  <td
                    data-label={finance.text('amountColumn')}
                    className="clarte-finance-amount"
                  >
                    {displayMoney({
                      minor: item.values.grossMinor,
                      currency: item.values.currency,
                      locale,
                    })}
                  </td>
                  <td data-label={copy.due}>
                    {item.values.dueOn === null ? (
                      copy.unknown
                    ) : (
                      <time dateTime={item.values.dueOn}>
                        {item.values.dueOn}
                      </time>
                    )}
                  </td>
                  <td data-label={finance.text('statusColumn')}>
                    <ClarteBadge
                      tone={
                        item.entryState === 'RECORDED' ? 'success' : 'neutral'
                      }
                    >
                      {item.entryState === 'RECORDED'
                        ? copy.recorded
                        : copy.withdrawn}
                    </ClarteBadge>
                    <small>
                      {copy.revision} {item.revision}
                    </small>
                  </td>
                  <RowChevron />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {state === 'loading' && <ClarteLoadingState label={copy.loading} />}
      {state === 'error' && (
        <ClarteErrorState
          title={copy.error}
          action={
            <ClarteButton onClick={() => void load(cursor)}>
              {copy.retry}
            </ClarteButton>
          }
        />
      )}
      {cursor && state === 'ready' && (
        <div className="clarte-finance-more">
          <ClarteButton onClick={() => void load(cursor)}>
            {copy.more}
          </ClarteButton>
        </div>
      )}
    </>
  );
}
