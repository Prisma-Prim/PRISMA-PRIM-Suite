import { Plus, RotateCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { displayMoney } from '../../invoice-record/invoice-record-money';
import { useInterfaceLocale } from '../../localization/interface-locale';
import { PaymentCommandPanel } from '../../payment-observation/PaymentCommandPanel';
import { PaymentDownload } from '../../payment-observation/PaymentDownload';
import { PaymentSources } from '../../payment-observation/PaymentSources';
import {
  usePaymentReadOwner,
  usePaymentWorkspaceGate,
  type PaymentWorkspaceProps,
} from '../../payment-observation/PaymentWorkspace';
import type { PaymentAuthority } from '../../payment-observation/payment-authority';
import type {
  PaymentFact,
  PaymentSelectable,
  PaymentValues,
} from '../../payment-observation/payment.types';
import {
  PaymentRevisionView,
  PaymentSummaryView,
  paymentCopy,
} from '../../payment-observation/ui';
import { ClarteBadge, type ClarteTone } from '../components/ClarteBadge';
import { ClarteButton } from '../components/ClarteButton';
import { ClarteCard } from '../components/ClarteCard';
import { ClarteSidePanel } from '../components/ClarteSidePanel';
import {
  ClarteEmptyState,
  ClarteErrorState,
  ClarteLoadingState,
} from '../components/ClarteState';
import { openFromRow, RowChevron, RowChevronHead } from './ClarteFinanceRow';
import { ClarteSourcePdf } from './ClarteSourcePdf';
import { useClarteFinanceCopy } from './clarte-finance.copy';
import './clarte-finance.css';

const stateTone = {
  DRAFT: 'warning',
  CONFIRMED: 'success',
  WITHDRAWN: 'neutral',
  REVERSED: 'neutral',
} as const satisfies Record<PaymentFact['state'], ClarteTone>;

/**
 * Finance › Collections in Clarté (#1544): manual received-payment
 * observations as a table, each observation in a side panel, and recording,
 * correction and confirmation made beside the exact source. The Payment read
 * owner keeps every read, command, protection and recovery.
 */
export function ClartePaymentObservations(props: PaymentWorkspaceProps) {
  const gate = usePaymentWorkspaceGate(props);
  if (!gate) return null;
  return (
    <ClartePaymentOwner
      key={gate.lifetime}
      {...props}
      authority={gate.authority}
    />
  );
}

type Owner = ReturnType<typeof usePaymentReadOwner>;

function ClartePaymentOwner(
  props: PaymentWorkspaceProps & { authority: PaymentAuthority },
) {
  const { locale } = useInterfaceLocale();
  const copy = paymentCopy[locale];
  const finance = useClarteFinanceCopy();
  const owner = usePaymentReadOwner(props);
  const a = owner.authority;
  const { selected, detail, liveInventory, status, protectedWork } = owner;
  const editor = owner.activeEditor;
  const creating = !selected && Boolean(owner.chooser || editor);
  const listNeedsReload =
    !selected &&
    !creating &&
    (status === 'error' || status === 'changed' || owner.conflict);
  const statusView = (
    <>
      {status === 'loading' && <ClarteLoadingState label={copy.loading} />}
      {status === 'error' && <ClarteErrorState title={copy.error} />}
      {status === 'denied' && <ClarteErrorState title={copy.unavailable} />}
      {status === 'changed' && <ClarteErrorState title={copy.historyChanged} />}
    </>
  );
  const reload = (
    <ClarteButton
      disabled={
        (protectedWork && !(!editor && owner.conflict)) ||
        (status === 'loading' && !owner.conflict)
      }
      onClick={owner.reload}
    >
      <RotateCw aria-hidden="true" />
      {copy.reload}
    </ClarteButton>
  );
  const chooser = owner.chooser && a.createKey && (
    <PaymentSources
      key={owner.sourceGeneration}
      {...props}
      companyId={a.companyId}
      capture={a.readCapture}
      authority={a.createKey}
      disabled={protectedWork && owner.chooser.recovery === undefined}
      onReady={owner.chooserReady}
      onSelect={(source) =>
        owner.start('CREATE', source, owner.chooser?.predecessor ?? null)
      }
    />
  );
  const command = editor && (
    <PaymentCommandPanel
      key={JSON.stringify([
        editor.action,
        editor.authority,
        editor.generation,
        editor.source?.source,
        editor.target,
      ])}
      {...props}
      companyId={a.companyId}
      authority={editor.authority}
      action={editor.action}
      current={detail}
      source={editor.source}
      predecessor={editor.predecessor}
      onProtected={owner.protect}
      onConflict={owner.markConflict}
      onReloadSources={owner.reloadSources}
      onClose={owner.closeEditor}
      onReload={(id) => owner.load(id, undefined, true)}
      onSaved={owner.saved}
    />
  );
  return (
    <section
      id="payments"
      tabIndex={-1}
      className="clarte-finance"
      aria-label={copy.title}
    >
      <p className="clarte-finance-notice">{copy.allocationNotice}</p>
      <ClarteCard
        title={finance.text('collectionsHeading')}
        actions={
          <>
            {listNeedsReload && reload}
            {a.createKey && (
              <ClarteButton
                variant="primary"
                disabled={protectedWork}
                onClick={owner.newObservation}
              >
                <Plus aria-hidden="true" />
                {copy.newObservation}
              </ClarteButton>
            )}
          </>
        }
      >
        {!selected && !creating && statusView}
        {liveInventory && (
          <ClartePaymentTable
            owner={owner}
            onOpen={(id) => void owner.open(id)}
          />
        )}
      </ClarteCard>
      {/*
        One panel for creation and the selected observation: a command that
        records an observation keeps its owner until it closes itself.
      */}
      {(selected || creating) && (
        <div className="clarte-finance-wide">
          <ClarteSidePanel
            title={
              !selected
                ? copy.newObservation
                : detail
                  ? amountOf(detail.payment.values, locale)
                  : finance.text('paymentPanel')
            }
            description={
              !selected
                ? copy.manualNotice
                : detail
                  ? `${copy.states[detail.payment.state]} · ${copy.revision} ${detail.payment.revision}`
                  : copy.title
            }
            onClose={selected ? owner.back : owner.cancelCreation}
          >
            {selected ? (
              <div className="clarte-finance-toolbar">
                <ClarteButton disabled={protectedWork} onClick={owner.back}>
                  {copy.back}
                </ClarteButton>
                {reload}
              </div>
            ) : null}
            {(selected || status !== 'ready') && statusView}
            {(detail || editor || !selected) && (
              <ClarteSourceBeside
                source={
                  editor?.source ? (
                    <SelectedSource
                      {...props}
                      authority={a}
                      source={editor.source}
                    />
                  ) : selected ? (
                    <DetailSource {...props} owner={owner} />
                  ) : (
                    <p className="clarte-source-pdf-hint">
                      {copy.selectSource}
                    </p>
                  )
                }
              >
                {/*
                  The source chooser keeps its own place, as in the current
                  interface: a creation conflict reloads it beside the held
                  command, and its fresh read releases the conflict.
                */}
                {chooser}
                {editor ? (
                  command
                ) : selected ? (
                  <ObservationDetail {...props} owner={owner} />
                ) : null}
                {!selected && !editor && !protectedWork && (
                  <ClarteButton onClick={owner.cancelCreation}>
                    {copy.cancel}
                  </ClarteButton>
                )}
              </ClarteSourceBeside>
            )}
          </ClarteSidePanel>
        </div>
      )}
    </section>
  );
}

/** A declared amount in the interface's number grammar, without rounding. */
function amountOf(
  values: Pick<PaymentValues, 'amountMinor' | 'currency'>,
  locale: ReturnType<typeof useInterfaceLocale>['locale'],
) {
  return displayMoney({
    minor: values.amountMinor,
    currency: values.currency,
    locale,
  });
}

/** The exact source on the left and the facts or the command on the right. */
function ClarteSourceBeside({
  source,
  children,
}: Readonly<{ source: ReactNode; children: ReactNode }>) {
  return (
    <div className="clarte-finance-beside">
      <div className="clarte-finance-beside-source">{source}</div>
      <div className="clarte-finance-beside-work">{children}</div>
    </div>
  );
}

function ClartePaymentTable({
  owner,
  onOpen,
}: Readonly<{ owner: Owner; onOpen: (id: string) => void }>) {
  const { locale } = useInterfaceLocale();
  const copy = paymentCopy[locale];
  const finance = useClarteFinanceCopy();
  const inventory = owner.liveInventory;
  if (!inventory) return null;
  const shortDate = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  return (
    <>
      {inventory.items.length === 0 && <ClarteEmptyState title={copy.empty} />}
      {inventory.items.length > 0 && (
        <div className="clarte-table-wrap">
          <table className="clarte-table clarte-finance-table">
            <thead>
              <tr>
                <th scope="col">{finance.text('paymentColumn')}</th>
                <th scope="col">{finance.text('payerColumn')}</th>
                <th scope="col">{copy.amount}</th>
                <th scope="col">{finance.text('statusColumn')}</th>
                <RowChevronHead />
              </tr>
            </thead>
            <tbody>
              {inventory.items.map((payment) => (
                <tr
                  key={payment.id}
                  className="clarte-finance-row"
                  onClick={openFromRow(() => {
                    if (!owner.protectedWork) onOpen(payment.id);
                  })}
                >
                  <td>
                    <button
                      type="button"
                      className="clarte-finance-row-open"
                      disabled={owner.protectedWork}
                      onClick={() => onOpen(payment.id)}
                    >
                      {payment.values.method} ·{' '}
                      <time dateTime={payment.values.effectiveOn}>
                        {shortDate.format(new Date(payment.values.effectiveOn))}
                      </time>
                    </button>
                    <small>
                      {payment.values.externalReference ?? copy.notRecorded}
                    </small>
                  </td>
                  <td data-label={finance.text('payerColumn')}>
                    {payment.copiedContext.payer.legalName}
                  </td>
                  <td
                    data-label={copy.amount}
                    className="clarte-finance-amount"
                  >
                    {amountOf(payment.values, locale)}
                  </td>
                  <td data-label={finance.text('statusColumn')}>
                    <ClarteBadge tone={stateTone[payment.state]}>
                      {copy.states[payment.state]}
                    </ClarteBadge>
                    <small>
                      {copy.revision} {payment.revision}
                    </small>
                  </td>
                  <RowChevron />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {inventory.nextCursor && (
        <div className="clarte-finance-more">
          <ClarteButton
            disabled={owner.protectedWork || owner.status === 'loading'}
            onClick={() =>
              void owner.load(undefined, inventory.nextCursor ?? undefined)
            }
          >
            {copy.loadMore}
          </ClarteButton>
        </div>
      )}
    </>
  );
}

/** The selected observation's live source: open it, download it, view it. */
function DetailSource(props: PaymentWorkspaceProps & { owner: Owner }) {
  const { locale } = useInterfaceLocale();
  const copy = paymentCopy[locale];
  const { owner } = props;
  const a = owner.authority;
  const source = owner.source;
  const detail = owner.detail;
  if (!detail || source?.kind !== 'AVAILABLE')
    return (
      <section className="clarte-finance-source" aria-label={copy.source}>
        <h3>{copy.source}</h3>
        <p>{copy.unavailable}</p>
      </section>
    );
  const content = source.content;
  return (
    <section className="clarte-finance-source" aria-label={copy.source}>
      <h3>{copy.source}</h3>
      <p>
        <strong>{source.title}</strong> · {copy.version} {source.versionNumber}
      </p>
      <div className="clarte-finance-actions">
        {props.onOpenDocument && (
          <ClarteButton
            size="small"
            disabled={owner.protectedWork}
            onClick={() =>
              props.onOpenDocument?.(
                { documentId: source.documentId, focus: 'document' },
                source.documentVersionId,
              )
            }
          >
            {copy.source}
          </ClarteButton>
        )}
        {a.downloadKey && (
          <PaymentDownload
            key={JSON.stringify([owner.downloadGeneration, content])}
            {...props}
            companyId={a.companyId}
            recordId={detail.payment.id}
            authority={a.downloadKey}
            source={source}
            onDenied={owner.denyDownload}
          />
        )}
      </div>
      {a.downloadKey && content.kind === 'AVAILABLE' && (
        <ClarteSourcePdf
          key={JSON.stringify([
            owner.downloadGeneration,
            detail.payment.id,
            content.representationId,
          ])}
          {...props}
          source={{
            companyId: a.companyId,
            authority: JSON.stringify([
              a.downloadKey,
              detail.payment.id,
              source.documentId,
              source.documentVersionId,
              content.representationId,
            ]),
            path: `/payments/${encodeURIComponent(detail.payment.id)}/source`,
            file: {
              size: content.byteLength,
              sha256: content.sha256,
              fileName: content.fileName,
            },
            reading: owner.activeEditor ? 'immediate' : 'on-request',
            onDenied: owner.denyDownload,
          }}
        />
      )}
    </section>
  );
}

/** The exact source chosen for a new observation, read before recording. */
function SelectedSource(
  props: PaymentWorkspaceProps & {
    authority: PaymentAuthority;
    source: PaymentSelectable;
  },
) {
  const { locale } = useInterfaceLocale();
  const copy = paymentCopy[locale];
  const { authority: a, source } = props;
  return (
    <section className="clarte-finance-source" aria-label={copy.source}>
      <h3>{copy.source}</h3>
      <p>
        <strong>{source.documentTitle}</strong> · {copy.version}{' '}
        {source.versionNumber}
      </p>
      {a.createKey && (
        <ClarteSourcePdf
          key={JSON.stringify(source.source)}
          {...props}
          source={{
            companyId: a.companyId,
            authority: JSON.stringify([a.createKey, source.source]),
            path: `/documents/${encodeURIComponent(source.source.documentId)}/versions/${encodeURIComponent(source.source.documentVersionId)}/content/${encodeURIComponent(source.source.representationId)}`,
            file: {
              size: source.byteLength,
              sha256: source.sha256,
              fileName: source.fileName,
            },
            reading: 'immediate',
            onDenied: () => undefined,
          }}
        />
      )}
    </section>
  );
}

/** The observation's facts, related records, commands and history. */
function ObservationDetail(props: PaymentWorkspaceProps & { owner: Owner }) {
  const { locale } = useInterfaceLocale();
  const copy = paymentCopy[locale];
  const { owner } = props;
  const a = owner.authority;
  const detail = owner.detail;
  const client = owner.client;
  if (!detail) return null;
  const payment = detail.payment;
  return (
    <>
      <PaymentSummaryView locale={locale} payment={payment} />
      <div className="clarte-finance-actions">
        {payment.replacesClosedPaymentId && (
          <ClarteButton
            size="small"
            disabled={owner.protectedWork}
            onClick={() =>
              void owner.open(payment.replacesClosedPaymentId ?? '')
            }
          >
            {copy.replacesClosedPayment}
          </ClarteButton>
        )}
        {payment.replacementPaymentId && (
          <ClarteButton
            size="small"
            disabled={owner.protectedWork}
            onClick={() => void owner.open(payment.replacementPaymentId ?? '')}
          >
            {copy.replacementPayment}
          </ClarteButton>
        )}
        {client?.kind === 'AVAILABLE' && props.onOpenClient && (
          <ClarteButton
            size="small"
            disabled={owner.protectedWork}
            onClick={() => props.onOpenClient?.(client.clientId)}
          >
            {client.displayName}
          </ClarteButton>
        )}
      </div>
      <div className="clarte-finance-actions clarte-finance-commands">
        {detail.capabilities.canCorrect && a.correctKey && (
          <ClarteButton
            disabled={owner.protectedWork}
            onClick={() => owner.start('CORRECT_DRAFT')}
          >
            {copy.correct}
          </ClarteButton>
        )}
        {detail.capabilities.canWithdraw && a.recordKey && (
          <ClarteButton
            disabled={owner.protectedWork}
            onClick={() => owner.start('WITHDRAW_DRAFT')}
          >
            {copy.withdraw}
          </ClarteButton>
        )}
        {detail.capabilities.canConfirm && a.confirmKey && (
          <ClarteButton
            variant="primary"
            disabled={owner.protectedWork}
            onClick={() => owner.start('CONFIRM')}
          >
            {copy.confirm}
          </ClarteButton>
        )}
        {detail.capabilities.canReverse && a.reverseKey && (
          <ClarteButton
            disabled={owner.protectedWork}
            onClick={() => owner.start('REVERSE')}
          >
            {copy.reverse}
          </ClarteButton>
        )}
        {detail.capabilities.canReplace && a.createKey && (
          <ClarteButton
            disabled={owner.protectedWork}
            onClick={() => owner.startReplacement(payment.id)}
          >
            {copy.replace}
          </ClarteButton>
        )}
      </div>
      <section className="clarte-finance-history" aria-label={copy.history}>
        <h3>{copy.history}</h3>
        {owner.history?.items.map((revision) => (
          <PaymentRevisionView
            key={revision.revision}
            locale={locale}
            revision={revision}
          />
        ))}
        {owner.history?.nextCursor && (
          <ClarteButton
            disabled={owner.protectedWork || owner.historyPending}
            onClick={() => void owner.moreHistory()}
          >
            {copy.loadMore}
          </ClarteButton>
        )}
      </section>
    </>
  );
}
