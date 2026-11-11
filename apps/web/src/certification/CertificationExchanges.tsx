import { useState, type FormEvent, type ReactNode } from 'react';
import { useInterfaceLocale } from '../localization/interface-locale';
import { formatMessage } from '../localization/messages';
import { Select } from '../presentation/Select';
import {
  DEADLINE_KINDS,
  EXCHANGE_CHANNELS,
  EXCHANGE_COUNTERPART_KINDS,
  EXCHANGE_DIRECTIONS,
  EXCHANGE_ITEM_KINDS,
  EXCHANGE_LIMITS,
  filterExchanges,
  sendingsOf,
  type DeadlineDraft,
  type DeadlineEntry,
  type DeadlineHistory,
  type DeadlineKind,
  type DeadlineSetVersion,
  type DeadlineState,
  type ExchangeChannel,
  type ExchangeCounterpartKind,
  type ExchangeDirection,
  type ExchangeDraft,
  type ExchangeFilter,
  type ExchangeItemKind,
  type ExchangeRecord,
  type Exchanges,
  type ReverificationDraft,
  type ReverificationItem,
} from './certification-exchanges';
import {
  useExchangeCopy,
  type ExchangeMessageKey,
} from './certification-exchanges.copy';
import type { CaseDetail, DocumentRegister } from './certification-response';

/** One command form of the region: its draft, feedback and description. */
type FormState<Draft> = {
  draft: Draft;
  /** The rendered refusal, uncertainty or saving message, if any. */
  feedback: ReactNode;
  saving: boolean;
  invalid: boolean;
  describedBy: string | undefined;
};

/** Who may record what in the region, as the read Case shows it. */
export type ExchangeRoles = {
  /** Records and corrects exchanges, withdraws manual items. */
  manager: boolean;
  /** A programme manager, an auditor on the team or an approver outside it. */
  contributor: boolean;
};

export interface ExchangesRegionProps {
  prefix: string;
  detail: CaseDetail;
  register: DocumentRegister;
  roles: ExchangeRoles;
  busy: boolean;
  exchange: FormState<ExchangeDraft> & {
    /** `null` when closed; the record number while correcting one. */
    open: { correcting: number | null } | null;
  };
  onExchangeOpen: (open: { correcting: number | null } | null) => void;
  onExchangeDraft: (draft: ExchangeDraft) => void;
  onExchangeSubmit: (event: FormEvent) => void;
  item: FormState<ReverificationDraft> & { open: boolean };
  onItemOpen: (open: boolean) => void;
  onItemDraft: (draft: ReverificationDraft) => void;
  onItemSubmit: (event: FormEvent) => void;
  withdrawal: FormState<{ itemId: string; reason: string } | null>;
  onWithdrawalDraft: (draft: { itemId: string; reason: string } | null) => void;
  onWithdrawalSubmit: (event: FormEvent) => void;
  /** The procedure deadline configuration, for its administrator only. */
  administration: ReactNode;
}

/**
 * The "Exchanges and deadlines" region of a Case: the register with its
 * filters by direction and kind, the procedure deadline states, the dates
 * the Case derives, and the Re-verification Items. Each command is offered
 * only to the roles that may record it.
 */
export function ExchangesRegion(props: ExchangesRegionProps) {
  const t = useExchangeCopy();
  const { formatDateTime } = useInterfaceLocale();
  const [filter, setFilter] = useState<ExchangeFilter>({
    direction: 'all',
    itemKind: 'all',
  });
  const { detail } = props;
  const exchanges = detail.exchanges;
  const titleId = `${props.prefix}-exchanges-title`;
  const recordable =
    detail.status === 'open' ||
    detail.status === 'refused' ||
    detail.status === 'certified';
  const shown = filterExchanges(exchanges.records, filter);
  const documentLabel = (attachmentId: string) => {
    const attachment = props.register.items.find(
      (entry) => entry.id === attachmentId,
    );
    return attachment
      ? formatMessage(t('documentVersion'), {
          title: attachment.sourceTitle,
          version: attachment.versionNumber,
        })
      : attachmentId;
  };

  function record(entry: ExchangeRecord) {
    const current = entry.current;
    const headingId = `${props.prefix}-exchange-${String(entry.sequence)}`;
    const correcting = props.exchange.open?.correcting === entry.sequence;
    return (
      <li key={entry.sequence} aria-labelledby={headingId}>
        <p id={headingId} className="certification-discrepancy-heading">
          <strong>
            {formatMessage(t('recordHeading'), {
              sequence: entry.sequence,
              direction: t(directionLabel(current.direction)),
              kind: t(kindLabel(current.itemKind)),
            })}
          </strong>
        </p>
        <dl className="certification-summary">
          <div>
            <dt>{t('fieldDate')}</dt>
            <dd>
              <time dateTime={current.businessDate}>
                {current.businessDate}
              </time>
            </dd>
          </div>
          <div>
            <dt>{t('fieldCounterpart')}</dt>
            <dd>
              {t(counterpartLabel(current.counterpart.kind))}:{' '}
              {current.counterpart.name}
            </dd>
          </div>
          <div>
            <dt>{t('fieldChannel')}</dt>
            <dd>{t(channelLabel(current.channel))}</dd>
          </div>
          {current.reference !== null && (
            <div>
              <dt>{t('fieldReference')}</dt>
              <dd>{current.reference}</dd>
            </div>
          )}
          <div>
            <dt>{t('fieldDocuments')}</dt>
            <dd>
              <ul>
                {current.attachmentIds.map((id) => (
                  <li key={id}>{documentLabel(id)}</li>
                ))}
              </ul>
            </dd>
          </div>
          {current.note !== null && (
            <div>
              <dt>{t('fieldNote')}</dt>
              <dd>{current.note}</dd>
            </div>
          )}
        </dl>
        <ol className="certification-versions">
          {entry.versions.map((version) => (
            <li key={version.id}>
              {formatMessage(t('versionRecorded'), {
                version: version.version,
                by: version.recordedBy.displayName,
                at: formatDateTime(version.recordedAt),
              })}
              {version.reason !== null && (
                <>
                  {' — '}
                  {formatMessage(t('versionReason'), {
                    reason: version.reason,
                  })}
                </>
              )}
            </li>
          ))}
        </ol>
        {props.roles.manager &&
          recordable &&
          (correcting ? (
            exchangeForm(entry.sequence)
          ) : (
            <div className="certification-actions">
              <button
                type="button"
                disabled={props.busy || props.exchange.open !== null}
                aria-describedby={headingId}
                onClick={() =>
                  props.onExchangeOpen({ correcting: entry.sequence })
                }
              >
                {formatMessage(t('correctAction'), {
                  sequence: entry.sequence,
                })}
              </button>
            </div>
          ))}
      </li>
    );
  }

  function exchangeForm(correcting: number | null) {
    const state = props.exchange;
    const draft = state.draft;
    const formId = `${props.prefix}-exchange-form`;
    const set = (patch: Partial<ExchangeDraft>) =>
      props.onExchangeDraft({ ...draft, ...patch });
    const title =
      correcting === null
        ? t('formTitle')
        : formatMessage(t('correctionTitle'), { sequence: correcting });
    const options = <T extends string>(
      values: readonly T[],
      label: (value: T) => ExchangeMessageKey,
    ) => values.map((value) => ({ value, label: t(label(value)) }));
    return (
      <form
        className="certification-form"
        aria-label={title}
        noValidate
        onSubmit={props.onExchangeSubmit}
      >
        {state.feedback}
        <label htmlFor={`${formId}-direction`}>{t('formDirection')}</label>
        <Select
          id={`${formId}-direction`}
          value={draft.direction}
          placeholder={t('selectDirection')}
          disabled={props.busy}
          invalid={state.invalid}
          describedBy={state.describedBy}
          options={options(EXCHANGE_DIRECTIONS, directionLabel)}
          onValueChange={(value) =>
            set({
              direction:
                EXCHANGE_DIRECTIONS.find((entry) => entry === value) ?? '',
            })
          }
        />
        <label htmlFor={`${formId}-kind`}>{t('formKind')}</label>
        <Select
          id={`${formId}-kind`}
          value={draft.itemKind}
          placeholder={t('selectKind')}
          disabled={props.busy}
          invalid={state.invalid}
          describedBy={state.describedBy}
          options={options(EXCHANGE_ITEM_KINDS, kindLabel)}
          onValueChange={(value) =>
            set({
              itemKind:
                EXCHANGE_ITEM_KINDS.find((entry) => entry === value) ?? '',
            })
          }
        />
        <fieldset aria-describedby={state.describedBy}>
          <legend>{t('formDocuments')}</legend>
          {props.register.items.length === 0 && <p>{t('noDocuments')}</p>}
          {props.register.items.map((attachment) => (
            <label key={attachment.id}>
              <input
                type="checkbox"
                checked={draft.attachmentIds.includes(attachment.id)}
                disabled={props.busy}
                onChange={(event) =>
                  set({
                    attachmentIds: event.target.checked
                      ? [...draft.attachmentIds, attachment.id]
                      : draft.attachmentIds.filter(
                          (id) => id !== attachment.id,
                        ),
                  })
                }
              />{' '}
              {documentLabel(attachment.id)}
            </label>
          ))}
        </fieldset>
        <label htmlFor={`${formId}-counterpart-kind`}>
          {t('formCounterpartKind')}
        </label>
        <Select
          id={`${formId}-counterpart-kind`}
          value={draft.counterpartKind}
          placeholder={t('selectCounterpart')}
          disabled={props.busy}
          invalid={state.invalid}
          describedBy={state.describedBy}
          options={options(EXCHANGE_COUNTERPART_KINDS, counterpartLabel)}
          onValueChange={(value) =>
            set({
              counterpartKind:
                EXCHANGE_COUNTERPART_KINDS.find((entry) => entry === value) ??
                '',
            })
          }
        />
        <label htmlFor={`${formId}-counterpart-name`}>
          {t('formCounterpartName')}
        </label>
        <input
          id={`${formId}-counterpart-name`}
          value={draft.counterpartName}
          maxLength={EXCHANGE_LIMITS.counterpartName}
          required
          disabled={props.busy}
          aria-invalid={state.invalid}
          aria-describedby={`${formId}-counterpart-hint`}
          onChange={(event) => set({ counterpartName: event.target.value })}
        />
        <p id={`${formId}-counterpart-hint`} className="certification-hint">
          {t('formCounterpartHint')}
        </p>
        <label htmlFor={`${formId}-date`}>{t('formDate')}</label>
        <input
          id={`${formId}-date`}
          type="date"
          value={draft.businessDate}
          required
          disabled={props.busy}
          aria-invalid={state.invalid}
          aria-describedby={state.describedBy}
          onChange={(event) => set({ businessDate: event.target.value })}
        />
        <label htmlFor={`${formId}-channel`}>{t('formChannel')}</label>
        <Select
          id={`${formId}-channel`}
          value={draft.channel}
          placeholder={t('selectChannel')}
          disabled={props.busy}
          invalid={state.invalid}
          describedBy={state.describedBy}
          options={options(EXCHANGE_CHANNELS, channelLabel)}
          onValueChange={(value) =>
            set({
              channel: EXCHANGE_CHANNELS.find((entry) => entry === value) ?? '',
            })
          }
        />
        <label htmlFor={`${formId}-reference`}>{t('formReference')}</label>
        <input
          id={`${formId}-reference`}
          value={draft.reference}
          maxLength={EXCHANGE_LIMITS.reference}
          disabled={props.busy}
          aria-describedby={state.describedBy}
          onChange={(event) => set({ reference: event.target.value })}
        />
        <label htmlFor={`${formId}-note`}>{t('formNote')}</label>
        <textarea
          id={`${formId}-note`}
          value={draft.note}
          maxLength={EXCHANGE_LIMITS.note}
          required={draft.channel === 'other'}
          disabled={props.busy}
          aria-invalid={state.invalid && draft.channel === 'other'}
          aria-describedby={`${formId}-note-hint`}
          onChange={(event) => set({ note: event.target.value })}
        />
        <p id={`${formId}-note-hint`} className="certification-hint">
          {t('formNoteHint')}
        </p>
        {correcting !== null && (
          <>
            <label htmlFor={`${formId}-reason`}>{t('formReason')}</label>
            <textarea
              id={`${formId}-reason`}
              value={draft.reason}
              maxLength={EXCHANGE_LIMITS.reason}
              required
              disabled={props.busy}
              aria-invalid={state.invalid}
              aria-describedby={state.describedBy}
              onChange={(event) => set({ reason: event.target.value })}
            />
          </>
        )}
        <div className="certification-actions">
          <button
            type="submit"
            className="certification-primary"
            disabled={props.busy}
          >
            {state.saving
              ? t('saving')
              : correcting === null
                ? t('formSubmit')
                : t('formSubmitCorrection')}
          </button>
          <button
            type="button"
            disabled={props.busy}
            onClick={() => props.onExchangeOpen(null)}
          >
            {t('cancel')}
          </button>
        </div>
      </form>
    );
  }

  function deadline(entry: DeadlineEntry) {
    const name = t(deadlineLabel(entry.kind));
    const label = entry.stage
      ? `${name} — ${t(entry.stage === 'stage_1' ? 'stage1' : 'stage2')}`
      : name;
    const key = `${entry.kind}-${entry.stage ?? ''}`;
    return (
      <li key={key}>
        <strong>{label}</strong> <DeadlineStateLabel state={entry.state} />
        {entry.dueDate !== null && (
          <>
            <br />
            {formatMessage(
              t(entry.direction === 'not_before' ? 'notBeforeOn' : 'dueOn'),
              { date: entry.dueDate },
            )}
          </>
        )}
        {entry.record !== null && (
          <>
            <br />
            {formatMessage(
              t(entry.state === 'sent_too_early' ? 'breachedBy' : 'metBy'),
              {
                sequence: entry.record.sequence,
                date: entry.record.businessDate,
              },
            )}
          </>
        )}
      </li>
    );
  }

  function item(entry: ReverificationItem) {
    const headingId = `${props.prefix}-reverification-${entry.id}`;
    const heading =
      entry.origin === 'automatic'
        ? formatMessage(t('itemAutomatic'), {
            sequence:
              entry.source?.kind === 'finding' ? entry.source.sequence : '—',
          })
        : formatMessage(t('itemHeading'), {
            sequence: entry.sequence,
            text: entry.text,
          });
    const source = entry.source;
    let sourceText: string | null = null;
    if (source && entry.origin !== 'automatic')
      switch (source.kind) {
        case 'finding':
          sourceText = formatMessage(t('sourceFinding'), {
            sequence: source.sequence,
          });
          break;
        case 'discrepancy':
          sourceText = formatMessage(t('sourceDiscrepancy'), {
            rule: source.discrepancyId.startsWith('manual:')
              ? '—'
              : (source.discrepancyId.split(':')[0] ?? '—'),
          });
          break;
        case 'exchange':
          sourceText = formatMessage(t('sourceExchange'), {
            sequence: source.sequence,
          });
          break;
        case 'attachment':
          sourceText = formatMessage(t('documentVersion'), {
            title: source.sourceTitle,
            version: source.versionNumber,
          });
          break;
      }
    const withdrawing =
      props.withdrawal.draft?.itemId === entry.id
        ? props.withdrawal.draft
        : null;
    return (
      <li key={entry.id} aria-labelledby={headingId}>
        <p id={headingId} className="certification-discrepancy-heading">
          <strong>{heading}</strong>{' '}
          <span className="certification-verdict certification-verdict-to-clarify">
            <span aria-hidden="true">
              {entry.status === 'open' ? '↻ ' : '⊘ '}
            </span>
            {entry.status === 'open'
              ? t('itemOpen')
              : formatMessage(t('itemWithdrawn'), {
                  by: entry.withdrawal.by.displayName,
                  at: formatDateTime(entry.withdrawal.at),
                  reason: entry.withdrawal.reason,
                })}
          </span>
        </p>
        {entry.origin !== 'automatic' && (
          <p>
            {formatMessage(
              t(
                entry.origin === 'discrepancy'
                  ? 'itemFromDiscrepancy'
                  : 'itemAddedBy',
              ),
              {
                by: entry.addedBy.displayName,
                at: formatDateTime(entry.addedAt),
              },
            )}
            {sourceText !== null && (
              <>
                <br />
                {formatMessage(t('itemSource'), { source: sourceText })}
              </>
            )}
          </p>
        )}
        {entry.origin !== 'automatic' &&
          entry.status === 'open' &&
          props.roles.manager &&
          recordable &&
          (withdrawing ? (
            <form
              className="certification-form"
              aria-label={formatMessage(t('withdrawFormTitle'), {
                sequence: entry.sequence,
              })}
              noValidate
              onSubmit={props.onWithdrawalSubmit}
            >
              {props.withdrawal.feedback}
              <label htmlFor={`${headingId}-reason`}>
                {t('withdrawReason')}
              </label>
              <textarea
                id={`${headingId}-reason`}
                value={withdrawing.reason}
                maxLength={EXCHANGE_LIMITS.reason}
                required
                disabled={props.busy}
                aria-invalid={props.withdrawal.invalid}
                aria-describedby={props.withdrawal.describedBy}
                onChange={(event) =>
                  props.onWithdrawalDraft({
                    itemId: entry.id,
                    reason: event.target.value,
                  })
                }
              />
              <div className="certification-actions">
                <button
                  type="submit"
                  className="certification-primary"
                  disabled={props.busy}
                >
                  {props.withdrawal.saving ? t('saving') : t('withdrawSubmit')}
                </button>
                <button
                  type="button"
                  disabled={props.busy}
                  onClick={() => props.onWithdrawalDraft(null)}
                >
                  {t('cancel')}
                </button>
              </div>
            </form>
          ) : (
            <div className="certification-actions">
              <button
                type="button"
                disabled={props.busy}
                aria-describedby={headingId}
                onClick={() =>
                  props.onWithdrawalDraft({ itemId: entry.id, reason: '' })
                }
              >
                {formatMessage(t('withdrawAction'), {
                  sequence: entry.sequence,
                })}
              </button>
            </div>
          ))}
      </li>
    );
  }

  function itemForm() {
    const state = props.item;
    const draft = state.draft;
    const formId = `${props.prefix}-reverification-form`;
    const sources = [
      { value: '', label: t('noSource') },
      ...detail.findings.map((finding) => ({
        value: `finding:${finding.id}`,
        label: formatMessage(t('sourceFinding'), {
          sequence: finding.sequence,
        }),
      })),
      ...[...detail.consistency.open, ...detail.consistency.resolved].map(
        (discrepancy) => ({
          value: `discrepancy:${discrepancy.id}`,
          label: formatMessage(t('sourceDiscrepancy'), {
            rule:
              discrepancy.origin === 'rule'
                ? discrepancy.rule
                : `${String(discrepancy.sequence)} — ${discrepancy.subject}`,
          }),
        }),
      ),
      ...exchanges.records.map((entry) => ({
        value: `exchange:${String(entry.sequence)}`,
        label: formatMessage(t('sourceExchange'), {
          sequence: entry.sequence,
        }),
      })),
      ...props.register.items.map((attachment) => ({
        value: `attachment:${attachment.id}`,
        label: documentLabel(attachment.id),
      })),
    ];
    return (
      <form
        className="certification-form"
        aria-label={t('itemFormTitle')}
        noValidate
        onSubmit={props.onItemSubmit}
      >
        {state.feedback}
        <label htmlFor={`${formId}-text`}>{t('itemText')}</label>
        <textarea
          id={`${formId}-text`}
          value={draft.text}
          maxLength={EXCHANGE_LIMITS.text}
          required
          disabled={props.busy}
          aria-invalid={state.invalid}
          aria-describedby={state.describedBy}
          onChange={(event) =>
            props.onItemDraft({ ...draft, text: event.target.value })
          }
        />
        <label htmlFor={`${formId}-source`}>{t('itemSourceLabel')}</label>
        <Select
          id={`${formId}-source`}
          value={draft.source}
          disabled={props.busy}
          describedBy={state.describedBy}
          options={sources}
          onValueChange={(source) => props.onItemDraft({ ...draft, source })}
        />
        <div className="certification-actions">
          <button
            type="submit"
            className="certification-primary"
            disabled={props.busy}
          >
            {state.saving ? t('saving') : t('itemSubmit')}
          </button>
          <button
            type="button"
            disabled={props.busy}
            onClick={() => props.onItemOpen(false)}
          >
            {t('cancel')}
          </button>
        </div>
      </form>
    );
  }

  const responses = detail.findings.filter(
    (finding) => finding.responseDueOn !== null,
  );
  const items = exchanges.reverification.items;
  return (
    <section aria-labelledby={titleId} className="certification-exchanges">
      <h5 id={titleId}>{t('title')}</h5>
      <p>{t('introduction')}</p>

      <h6>{t('deadlinesTitle')}</h6>
      {exchanges.deadlines.set === null ? (
        <p>{t('noDeadlines')}</p>
      ) : (
        <p>
          {formatMessage(t('deadlineSet'), {
            version: exchanges.deadlines.set.version,
            by: exchanges.deadlines.set.configuredBy.displayName,
            at: formatDateTime(exchanges.deadlines.set.configuredAt),
          })}
        </p>
      )}
      {exchanges.deadlines.entries.length > 0 && (
        <ul
          aria-label={t('deadlinesTitle')}
          className="certification-discrepancies"
        >
          {exchanges.deadlines.entries.map(deadline)}
        </ul>
      )}
      {props.administration}
      <p>
        <strong>{t('derivedTitle')}</strong>
      </p>
      <ul>
        {responses.map((finding) => (
          <li key={finding.id}>
            {formatMessage(t('responseDue'), {
              sequence: finding.sequence,
              date: finding.responseDueOn ?? '',
            })}
          </li>
        ))}
        <li>
          {exchanges.reverification.firstSurveillanceBy === null
            ? t('firstSurveillancePending')
            : formatMessage(t('firstSurveillance'), {
                date: exchanges.reverification.firstSurveillanceBy,
              })}
        </li>
      </ul>

      <h6>{t('registerTitle')}</h6>
      {exchanges.records.length === 0 ? (
        <p>{t('empty')}</p>
      ) : (
        <>
          <div
            role="group"
            aria-label={t('filtersLabel')}
            className="certification-actions"
          >
            <label htmlFor={`${props.prefix}-exchange-filter-direction`}>
              {t('filterDirection')}
            </label>
            <Select
              id={`${props.prefix}-exchange-filter-direction`}
              value={filter.direction}
              options={[
                { value: 'all', label: t('filterAll') },
                ...EXCHANGE_DIRECTIONS.map((value) => ({
                  value,
                  label: t(directionLabel(value)),
                })),
              ]}
              onValueChange={(value) =>
                setFilter({
                  ...filter,
                  direction:
                    EXCHANGE_DIRECTIONS.find((entry) => entry === value) ??
                    'all',
                })
              }
            />
            <label htmlFor={`${props.prefix}-exchange-filter-kind`}>
              {t('filterKind')}
            </label>
            <Select
              id={`${props.prefix}-exchange-filter-kind`}
              value={filter.itemKind}
              options={[
                { value: 'all', label: t('filterAll') },
                ...EXCHANGE_ITEM_KINDS.map((value) => ({
                  value,
                  label: t(kindLabel(value)),
                })),
              ]}
              onValueChange={(value) =>
                setFilter({
                  ...filter,
                  itemKind:
                    EXCHANGE_ITEM_KINDS.find((entry) => entry === value) ??
                    'all',
                })
              }
            />
          </div>
          {exchanges.total > exchanges.records.length && (
            <p>
              {formatMessage(t('partial'), {
                shown: exchanges.records.length,
                total: exchanges.total,
              })}
            </p>
          )}
          {shown.length === 0 ? (
            <p>{t('filteredEmpty')}</p>
          ) : (
            <ol
              aria-label={t('registerTitle')}
              className="certification-discrepancies"
            >
              {shown.map(record)}
            </ol>
          )}
        </>
      )}
      {props.exchange.open === null && props.exchange.feedback}
      {props.roles.manager &&
        recordable &&
        (props.exchange.open?.correcting === null ? (
          exchangeForm(null)
        ) : (
          <div className="certification-actions">
            <button
              type="button"
              disabled={props.busy || props.exchange.open !== null}
              onClick={() => props.onExchangeOpen({ correcting: null })}
            >
              {t('recordAction')}
            </button>
          </div>
        ))}

      <h6>{t('reverificationTitle')}</h6>
      <p>{t('reverificationIntroduction')}</p>
      {items.length === 0 ? (
        <p>{t('noItems')}</p>
      ) : (
        <ol
          aria-label={t('reverificationTitle')}
          className="certification-discrepancies"
        >
          {items.map(item)}
        </ol>
      )}
      {props.withdrawal.draft === null && props.withdrawal.feedback}
      {props.roles.contributor &&
        recordable &&
        (props.item.open ? (
          itemForm()
        ) : (
          <div className="certification-actions">
            {props.item.feedback}
            <button
              type="button"
              disabled={props.busy}
              onClick={() => props.onItemOpen(true)}
            >
              {t('addItem')}
            </button>
          </div>
        ))}
    </section>
  );
}

/** The sendings of one step's document, shown beside the step. */
export function StepSendings({
  attachmentId,
  exchanges,
  register,
}: {
  attachmentId: string;
  exchanges: Exchanges;
  register: DocumentRegister;
}) {
  const t = useExchangeCopy();
  const documentId = register.items.find(
    (entry) => entry.id === attachmentId,
  )?.documentId;
  if (!documentId) return null;
  const sendings = sendingsOf(exchanges.records, documentId, register.items);
  return (
    <div className="certification-step-sendings">
      <p>
        <strong>{t('stepSendingsTitle')}</strong>
      </p>
      {sendings.length === 0 ? (
        <p>{t('stepNotSent')}</p>
      ) : (
        <ul aria-label={t('stepSendingsTitle')}>
          {sendings.map((entry) => {
            const version = entry.current.attachmentIds
              .map((id) => register.items.find((item) => item.id === id))
              .find((item) => item?.documentId === documentId);
            return (
              <li key={entry.sequence}>
                {formatMessage(t('stepSending'), {
                  version: version?.versionNumber ?? '—',
                  counterpart: `${t(counterpartLabel(entry.current.counterpart.kind))}: ${entry.current.counterpart.name}`,
                  date: entry.current.businessDate,
                  channel: t(channelLabel(entry.current.channel)),
                  sequence: entry.sequence,
                })}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export type DeadlineAdministrationView =
  | { status: 'closed' | 'loading' | 'denied' | 'unavailable' }
  | { status: 'ready'; history: DeadlineHistory };

/** A save of the deadline set; an unanswered one keeps its key and body. */
export type DeadlineFeedback =
  | { status: 'idle' | 'stale' | 'invalid' | 'unchanged' }
  | { status: 'saving' | 'uncertain'; key: string; body: string }
  | { status: 'saved'; version: number };

/**
 * The procedure deadline configuration of the Company, for a member who
 * assigns the certification bundles: the three values, then their history.
 */
export function DeadlineAdministration(props: {
  prefix: string;
  view: DeadlineAdministrationView;
  feedback: DeadlineFeedback;
  draft: DeadlineDraft;
  busy: boolean;
  onOpen: () => void;
  onClose: () => void;
  onReload: () => void;
  onDraft: (draft: DeadlineDraft) => void;
  onSubmit: (event: FormEvent) => void;
  onRetry: () => void;
}) {
  const t = useExchangeCopy();
  const { formatDateTime } = useInterfaceLocale();
  const titleId = `${props.prefix}-deadline-administration`;
  const feedbackId = `${titleId}-feedback`;
  const view = props.view;
  if (view.status === 'closed')
    return (
      <div className="certification-actions">
        <button type="button" disabled={props.busy} onClick={props.onOpen}>
          {t('adminOpen')}
        </button>
      </div>
    );
  const values = (set: DeadlineSetVersion) =>
    DEADLINE_KINDS.map((kind) => {
      const days = set.days[kind];
      return `${t(deadlineLabel(kind))}: ${
        days === null
          ? t('adminNotConfigured')
          : formatMessage(t('adminDayCount'), { days })
      }`;
    }).join('; ');
  const feedback = props.feedback;
  let message: ReactNode = null;
  switch (feedback.status) {
    case 'saved':
      message = (
        <p id={feedbackId} role="status">
          {formatMessage(t('adminSaved'), { version: feedback.version })}
        </p>
      );
      break;
    case 'invalid':
    case 'unchanged':
      message = (
        <p id={feedbackId} role="alert">
          {t(feedback.status === 'invalid' ? 'adminInvalid' : 'adminUnchanged')}
        </p>
      );
      break;
    case 'stale':
      message = (
        <div id={feedbackId} role="alert">
          <p>{t('adminStale')}</p>
          <button type="button" onClick={props.onReload}>
            {t('adminReload')}
          </button>
        </div>
      );
      break;
    case 'uncertain':
      message = (
        <div id={feedbackId} role="alert">
          <p>{t('adminUncertain')}</p>
          <button type="button" disabled={props.busy} onClick={props.onRetry}>
            {t('adminRetry')}
          </button>
        </div>
      );
      break;
    case 'saving':
    case 'idle':
      break;
  }
  return (
    <section aria-labelledby={titleId} className="certification-form">
      <h6 id={titleId}>{t('adminTitle')}</h6>
      {view.status === 'loading' && <p role="status">{t('adminLoading')}</p>}
      {view.status === 'denied' && <p role="alert">{t('adminDenied')}</p>}
      {view.status === 'unavailable' && (
        <div role="alert">
          <p>{t('adminUnavailable')}</p>
          <button type="button" onClick={props.onReload}>
            {t('adminRetry')}
          </button>
        </div>
      )}
      {view.status === 'ready' && (
        <>
          <form
            aria-label={t('adminTitle')}
            noValidate
            onSubmit={props.onSubmit}
          >
            <p>{t('adminHelp')}</p>
            {message}
            {DEADLINE_KINDS.map((kind) => (
              <div key={kind}>
                <label htmlFor={`${titleId}-${kind}`}>
                  {formatMessage(t('adminDays'), {
                    name: t(deadlineLabel(kind)),
                  })}
                </label>
                <input
                  id={`${titleId}-${kind}`}
                  inputMode="numeric"
                  value={props.draft[kind]}
                  disabled={props.busy}
                  aria-invalid={feedback.status === 'invalid'}
                  aria-describedby={message ? feedbackId : undefined}
                  onChange={(event) =>
                    props.onDraft({
                      ...props.draft,
                      [kind]: event.target.value,
                    })
                  }
                />
              </div>
            ))}
            <div className="certification-actions">
              <button
                type="submit"
                className="certification-primary"
                disabled={props.busy}
              >
                {feedback.status === 'saving' ? t('saving') : t('adminSubmit')}
              </button>
            </div>
          </form>
          {view.history.history.length > 0 && (
            <>
              <p>
                <strong>{t('adminHistoryTitle')}</strong>
              </p>
              <ol aria-label={t('adminHistoryTitle')}>
                {view.history.history.map((set) => (
                  <li key={set.version}>
                    {formatMessage(t('adminHistoryEntry'), {
                      version: set.version,
                      by: set.configuredBy.displayName,
                      at: formatDateTime(set.configuredAt),
                      values: values(set),
                    })}
                  </li>
                ))}
              </ol>
            </>
          )}
        </>
      )}
      <div className="certification-actions">
        <button type="button" disabled={props.busy} onClick={props.onClose}>
          {t('adminClose')}
        </button>
      </div>
    </section>
  );
}

/** A deadline state by text and icon, never by colour alone. */
function DeadlineStateLabel({ state }: { state: DeadlineState | null }) {
  const t = useExchangeCopy();
  const icon =
    state === 'met'
      ? '✓'
      : state === 'met_late'
        ? '◷'
        : state === 'overdue' || state === 'sent_too_early'
          ? '⚠'
          : '…';
  const tone =
    state === 'overdue' || state === 'sent_too_early'
      ? 'error'
      : state === 'met_late'
        ? 'to-clarify'
        : 'neutral';
  return (
    <span className={`certification-verdict certification-verdict-${tone}`}>
      <span aria-hidden="true">{icon} </span>
      {t(stateLabel(state))}
    </span>
  );
}

function stateLabel(state: DeadlineState | null): ExchangeMessageKey {
  switch (state) {
    case 'due':
      return 'stateDue';
    case 'met':
      return 'stateMet';
    case 'met_late':
      return 'stateMetLate';
    case 'overdue':
      return 'stateOverdue';
    case 'sent_too_early':
      return 'stateSentTooEarly';
    case null:
      return 'stateAwaiting';
  }
  return unexpected(state);
}

function deadlineLabel(kind: DeadlineKind): ExchangeMessageKey {
  switch (kind) {
    case 'stage_plan_sent':
      return 'deadlineStagePlan';
    case 'audit_dossier_transmitted':
      return 'deadlineAuditDossier';
    case 'stage_2_report_released':
      return 'deadlineStage2Report';
  }
  return unexpected(kind);
}

function directionLabel(direction: ExchangeDirection): ExchangeMessageKey {
  return direction === 'received' ? 'directionReceived' : 'directionSent';
}

function counterpartLabel(kind: ExchangeCounterpartKind): ExchangeMessageKey {
  switch (kind) {
    case 'client':
      return 'counterpartClient';
    case 'certification_body':
      return 'counterpartCertificationBody';
    case 'audit_team_member':
      return 'counterpartAuditTeamMember';
    case 'other':
      return 'counterpartOther';
  }
  return unexpected(kind);
}

function channelLabel(channel: ExchangeChannel): ExchangeMessageKey {
  switch (channel) {
    case 'email':
      return 'channelEmail';
    case 'platform':
      return 'channelPlatform';
    case 'courier':
      return 'channelCourier';
    case 'hand_delivery':
      return 'channelHandDelivery';
    case 'other':
      return 'channelOther';
  }
  return unexpected(channel);
}

export function kindLabel(kind: ExchangeItemKind): ExchangeMessageKey {
  switch (kind) {
    case 'application':
      return 'kindApplication';
    case 'agreement':
      return 'kindAgreement';
    case 'team_notice':
      return 'kindTeamNotice';
    case 'stage_plan':
      return 'kindStagePlan';
    case 'stage_report':
      return 'kindStageReport';
    case 'participant_list':
      return 'kindParticipantList';
    case 'nonconformity_response':
      return 'kindNonconformityResponse';
    case 'client_data_confirmation':
      return 'kindClientDataConfirmation';
    case 'audit_dossier':
      return 'kindAuditDossier';
    case 'certificate_data_form':
      return 'kindCertificateDataForm';
    case 'certificate_draft':
      return 'kindCertificateDraft';
    case 'client_opinion':
      return 'kindClientOpinion';
    case 'decision_form':
      return 'kindDecisionForm';
    case 'certificate':
      return 'kindCertificate';
    case 'other':
      return 'kindOther';
  }
  return unexpected(kind);
}

function unexpected(value: never): never {
  throw new Error(`Unexpected exchange register value: ${String(value)}`);
}
