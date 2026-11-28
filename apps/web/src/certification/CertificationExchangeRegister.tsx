import { useState, type ReactNode, type FormEvent } from 'react';
import type { ApiResult } from '../api/authenticated-api-client';
import type { ScopedOperation } from '../api/use-scoped-operation';
import type { CaseDetail, DocumentRegister } from './certification-response';
import {
  draftFromExchange,
  emptyExchangeDraft,
  exchangeFromDraft,
  parseExchangePage,
  reverificationFromDraft,
  type ExchangeDraft,
  type ReverificationDraft,
} from './certification-exchanges';
import {
  ExchangesRegion,
  type ExchangesRegionProps,
  type ExchangePaging,
  type ExchangeFieldFeedback,
} from './CertificationExchanges';
import {
  IDLE,
  retryUncertainCommand,
  reuse,
  blockedUntilReload,
  refusedWith,
  type Intent,
  type Feedback,
} from './certification-command';

export type ExchangeMutationKind = 'exchange' | 'reverification' | 'withdrawal';
type ExchangeCommand = {
  kind: ExchangeMutationKind;
  intent: Intent;
  setFeedback: (next: Feedback) => void;
  confirmed: () => void;
};
type ExchangeFeedbackPresentation = {
  kind: ExchangeMutationKind;
  feedback: Feedback;
  id: string;
  retry: () => void;
};
interface ExchangeRegisterContext {
  view: { caseDetail: CaseDetail; register: DocumentRegister } | undefined;
  pageOperation: ScopedOperation;
  queryPage: (signal: AbortSignal, path: string) => Promise<ApiResult<unknown>>;
  commit: (command: ExchangeCommand) => Promise<void>;
  updateCase: (update: (current: CaseDetail) => CaseDetail) => void;
  reload: (caseId: string) => void;
  isBusy: () => boolean;
  renderFeedback: (presentation: ExchangeFeedbackPresentation) => ReactNode;
}

/** Keeps editing and paging alive while the selected Case is being reloaded. */
export function useCertificationExchangeRegister(
  context: ExchangeRegisterContext,
) {
  const {
    view,
    pageOperation: exchangePageOperation,
    queryPage,
    commit,
    updateCase,
    reload,
    isBusy,
    renderFeedback,
  } = context;
  const [exchangePaging, setExchangePaging] = useState<ExchangePaging>('idle');
  /** The Exchange Record form: closed, a new record or a correction. */
  const [exchangeOpen, setExchangeOpen] = useState<{
    correcting: number | null;
  } | null>(null);
  const [exchangeDraft, setExchangeDraft] =
    useState<ExchangeDraft>(emptyExchangeDraft);
  const [exchangeFeedback, setExchangeFeedback] = useState<Feedback>(IDLE);
  const [itemOpen, setItemOpen] = useState(false);
  const [itemDraft, setItemDraft] = useState<ReverificationDraft>({
    text: '',
    source: '',
  });
  const [itemFeedback, setItemFeedback] = useState<Feedback>(IDLE);
  const [withdrawalDraft, setWithdrawalDraft] = useState<{
    itemId: string;
    reason: string;
  } | null>(null);
  const [withdrawalFeedback, setWithdrawalFeedback] = useState<Feedback>(IDLE);

  const feedbackSetters = {
    exchange: setExchangeFeedback,
    reverification: setItemFeedback,
    withdrawal: setWithdrawalFeedback,
  };
  function execute(kind: ExchangeMutationKind, intent: Intent) {
    return commit({
      kind,
      intent,
      setFeedback: feedbackSetters[kind],
      confirmed: () => {
        switch (kind) {
          case 'exchange':
            setExchangeDraft(emptyExchangeDraft());
            setExchangeOpen(null);
            break;
          case 'reverification':
            setItemDraft({ text: '', source: '' });
            setItemOpen(false);
            break;
          case 'withdrawal':
            setWithdrawalDraft(null);
            break;
          default: {
            const unexpected: never = kind;
            throw new Error(
              `Unexpected Exchange Record command: ${String(unexpected)}`,
            );
          }
        }
      },
    });
  }
  function retry(kind: ExchangeMutationKind, feedback: Feedback) {
    retryUncertainCommand(feedback, (intent) => execute(kind, intent));
  }
  /** Records an Exchange Record, or corrects one with a reason. */
  function submitExchange(event: FormEvent) {
    event.preventDefault();
    if (
      isBusy() ||
      !view ||
      exchangeOpen === null ||
      blockedUntilReload(exchangeFeedback)
    )
      return;
    const { caseDetail: current, register } = view;
    const correcting = exchangeOpen.correcting;
    const check = exchangeFromDraft(exchangeDraft, {
      attachments: register.items,
      correcting: correcting !== null,
    });
    if (check.status !== 'valid') {
      setExchangeFeedback(
        refusedWith(
          check.status === 'noteRequired'
            ? 'exchangeNoteRequired'
            : check.status === 'reasonRequired'
              ? 'exchangeReasonRequired'
              : 'exchangeValidation',
        ),
      );
      return;
    }
    const base = `/certification-cases/${encodeURIComponent(current.id)}/exchanges`;
    void execute(
      'exchange',
      reuse(exchangeFeedback, {
        path: correcting === null ? base : `${base}/${String(correcting)}`,
        body: JSON.stringify({
          expectedRevision: current.revision,
          ...check.body,
        }),
        caseId: current.id,
      }),
    );
  }

  /** Adds a manual Re-verification Item. */
  function submitItem(event: FormEvent) {
    event.preventDefault();
    if (isBusy() || !view || blockedUntilReload(itemFeedback)) return;
    const current = view.caseDetail;
    const check = reverificationFromDraft(itemDraft);
    if (check.status !== 'valid') {
      setItemFeedback(refusedWith('reverificationValidation'));
      return;
    }
    void execute(
      'reverification',
      reuse(itemFeedback, {
        path: `/certification-cases/${encodeURIComponent(current.id)}/reverification-items`,
        body: JSON.stringify({
          expectedRevision: current.revision,
          ...check.body,
        }),
        caseId: current.id,
      }),
    );
  }

  /** Withdraws a manual Re-verification Item with its reason. */
  function submitWithdrawal(event: FormEvent) {
    event.preventDefault();
    if (
      isBusy() ||
      !view ||
      withdrawalDraft === null ||
      blockedUntilReload(withdrawalFeedback)
    )
      return;
    const current = view.caseDetail;
    if (!withdrawalDraft.reason.trim()) {
      setWithdrawalFeedback(refusedWith('withdrawalReasonRequired'));
      return;
    }
    void execute(
      'withdrawal',
      reuse(withdrawalFeedback, {
        path: `/certification-cases/${encodeURIComponent(current.id)}/reverification-items/${encodeURIComponent(withdrawalDraft.itemId)}/withdrawal`,
        body: JSON.stringify({
          expectedRevision: current.revision,
          reason: withdrawalDraft.reason,
        }),
        caseId: current.id,
      }),
    );
  }

  async function loadMoreExchanges() {
    if (!view || exchangePaging === 'loading' || isBusy()) return;
    const current = view.caseDetail;
    const cursor = current.exchanges.nextCursor;
    if (cursor === null) return;
    const signal = exchangePageOperation.begin();
    if (!signal) return;
    setExchangePaging('loading');
    try {
      const result = await queryPage(
        signal,
        `/certification-cases/${encodeURIComponent(current.id)}/exchanges?cursor=${encodeURIComponent(cursor)}`,
      );
      if (signal.aborted) return;
      if (result.status === 'ok') {
        const page = parseExchangePage(result.value);
        const previous = current.exchanges.records;
        if (
          page.total !== current.exchanges.total ||
          page.records.some((entry) =>
            previous.some((old) => old.sequence === entry.sequence),
          ) ||
          page.nextCursor === cursor ||
          previous.length + page.records.length > page.total ||
          (page.nextCursor === null &&
            previous.length + page.records.length !== page.total)
        )
          throw new Error('Inconsistent exchange page.');
        updateCase((latest) =>
          latest.id === current.id &&
          latest.revision === current.revision &&
          latest.exchanges.nextCursor === cursor
            ? {
                ...latest,
                exchanges: {
                  ...latest.exchanges,
                  records: [...previous, ...page.records],
                  nextCursor: page.nextCursor,
                },
              }
            : latest,
        );
        setExchangePaging('idle');
      } else if (result.status === 'conflict') setExchangePaging('stale');
      else if (
        result.status !== 'forbidden' &&
        result.status !== 'unauthorized'
      )
        setExchangePaging('error');
    } catch {
      if (!signal.aborted) setExchangePaging('error');
    }
  }

  /** The Exchanges and deadlines region of the read Case. */
  function render({
    prefix,
    busy,
    roles,
    administration,
    part,
  }: {
    prefix: string;
    busy: boolean;
    roles: ExchangesRegionProps['roles'];
    administration: ReactNode;
    part?: ExchangesRegionProps['part'];
  }) {
    if (!view) return null;
    const feedbackIds = {
      exchange: `${prefix}-exchange-feedback`,
      reverification: `${prefix}-reverification-feedback`,
      withdrawal: `${prefix}-withdrawal-feedback`,
    };
    const feedbackMessage = (kind: ExchangeMutationKind, feedback: Feedback) =>
      renderFeedback({
        kind,
        feedback,
        id: feedbackIds[kind],
        retry: () => retry(kind, feedback),
      });
    const describedFeedback = (
      kind: ExchangeMutationKind,
      feedback: Feedback,
    ) =>
      feedback.status === 'refused' ||
      feedback.status === 'uncertain' ||
      feedback.status === 'unmet'
        ? feedbackIds[kind]
        : undefined;
    const formState = <Draft,>(
      kind: 'exchange' | 'reverification' | 'withdrawal',
      feedback: Feedback,
      draft: Draft,
    ) => ({
      draft,
      feedback: feedbackMessage(kind, feedback),
      saving: feedback.status === 'saving',
      fieldFeedback: exchangeFieldFeedback({
        kind,
        feedback,
        id: feedbackIds[kind],
      }),
      describedBy: describedFeedback(kind, feedback),
    });
    const clearRefusal = (
      feedback: Feedback,
      set: (next: Feedback) => void,
    ) => {
      if (
        feedback.status === 'saved' ||
        (feedback.status === 'refused' && !feedback.reload)
      )
        set(IDLE);
    };
    const records = view.caseDetail.exchanges.records;
    return (
      <ExchangesRegion
        part={part}
        paging={exchangePaging}
        onLoadMore={() => void loadMoreExchanges()}
        onReload={() => reload(view.caseDetail.id)}
        prefix={prefix}
        detail={view.caseDetail}
        register={view.register}
        roles={roles}
        busy={busy}
        exchange={{
          ...formState('exchange', exchangeFeedback, exchangeDraft),
          open: exchangeOpen,
        }}
        onExchangeOpen={(open) => {
          setExchangeOpen(open);
          const corrected =
            open?.correcting === null || open === null
              ? undefined
              : records.find((entry) => entry.sequence === open.correcting);
          setExchangeDraft(
            corrected
              ? draftFromExchange(corrected.current)
              : emptyExchangeDraft(),
          );
          setExchangeFeedback(IDLE);
        }}
        onExchangeDraft={(draft) => {
          setExchangeDraft(draft);
          clearRefusal(exchangeFeedback, setExchangeFeedback);
        }}
        onExchangeSubmit={submitExchange}
        item={{
          ...formState('reverification', itemFeedback, itemDraft),
          open: itemOpen,
        }}
        onItemOpen={(open) => {
          setItemOpen(open);
          if (!open) setItemDraft({ text: '', source: '' });
          setItemFeedback(IDLE);
        }}
        onItemDraft={(draft) => {
          setItemDraft(draft);
          clearRefusal(itemFeedback, setItemFeedback);
        }}
        onItemSubmit={submitItem}
        withdrawal={formState(
          'withdrawal',
          withdrawalFeedback,
          withdrawalDraft,
        )}
        onWithdrawalDraft={(draft) => {
          const reopened =
            draft === null || draft.itemId !== withdrawalDraft?.itemId;
          setWithdrawalDraft(draft);
          if (reopened) setWithdrawalFeedback(IDLE);
          else clearRefusal(withdrawalFeedback, setWithdrawalFeedback);
        }}
        onWithdrawalSubmit={submitWithdrawal}
        administration={administration}
      />
    );
  }

  return {
    saved: [exchangeFeedback, itemFeedback, withdrawalFeedback].some(
      (feedback) => feedback.status === 'saved',
    ),
    saving: [exchangeFeedback, itemFeedback, withdrawalFeedback].some(
      (feedback) => feedback.status === 'saving',
    ),
    render,
    reset() {
      setExchangePaging('idle');
      setExchangeOpen(null);
      setExchangeDraft(emptyExchangeDraft());
      setExchangeFeedback(IDLE);
      setItemOpen(false);
      setItemDraft({ text: '', source: '' });
      setItemFeedback(IDLE);
      setWithdrawalDraft(null);
      setWithdrawalFeedback(IDLE);
    },
    prepareRead({ reload }: { reload?: boolean }) {
      setExchangePaging('idle');
      if (reload) {
        const clear = (feedback: Feedback) =>
          feedback.status === 'refused' || feedback.status === 'unmet'
            ? IDLE
            : feedback;
        setExchangeFeedback(clear);
        setItemFeedback(clear);
        setWithdrawalFeedback(clear);
      }
    },
  };
}

/** Only input refusals name fields; stale, denied and other state alerts do not. */
function exchangeFieldFeedback({
  kind,
  feedback,
  id,
}: {
  kind: 'exchange' | 'reverification' | 'withdrawal';
  feedback: Feedback;
  id: string;
}): ExchangeFieldFeedback {
  if (feedback.status !== 'refused') return null;
  switch (feedback.message) {
    case 'exchangeInFuture':
      return { id, field: 'businessDate' };
    case 'exchangeNoteRequired':
      return { id, field: 'note' };
    case 'exchangeReasonRequired':
    case 'withdrawalReasonRequired':
      return { id, field: 'reason' };
    case 'discrepancyDocumentUnavailable':
      return kind === 'exchange' ? { id, field: 'attachmentIds' } : null;
    case 'exchangeValidation':
    case 'reverificationValidation':
    case 'invalid':
      return { id, field: 'draft' };
    default:
      return null;
  }
}
