import { ArrowRight, RefreshCw } from 'lucide-react';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from 'react';
import type {
  DecisionQueueState,
  PendingDecisionContext,
} from '../../commercial-decision-queue/PendingDecisionQueue';
import { ContractDecisionQueue } from '../../contract/ContractDecisionQueue';
import type { ContractDecisionQueueItem } from '../../contract/contract-decision-queue-response';
import { useContractDecisionQueueCopy } from '../../contract/contract-decision-queue.copy';
import { useInterfaceLocale } from '../../localization/interface-locale';
import { OfferDecisionQueue } from '../../offer/OfferDecisionQueue';
import type { OfferDecisionQueueItem } from '../../offer/offer-decision-queue-response';
import { useOfferDecisionQueueCopy } from '../../offer/offer-decision-queue.copy';
import { ProfitabilityDecisionQueue } from '../../profitability-estimate/ProfitabilityDecisionQueue';
import type { DecisionQueueItem } from '../../profitability-estimate/profitability-decision-queue-response';
import { useDecisionQueueCopy } from '../../profitability-estimate/profitability-decision-queue.copy';
import { ClarteBadge } from '../components/ClarteBadge';
import { ClarteButton } from '../components/ClarteButton';
import {
  ClarteErrorState,
  ClarteLoadingState,
} from '../components/ClarteState';
import { useClarteTodayCopy } from './clarte-today.copy';
import type { DecisionQueueKind, DecisionWork } from './work-order';

/** One mounted queue owner as Today sees it; `owner` changes when it remounts. */
export type ReportedQueue<Item> = Readonly<{
  owner: object;
  state: DecisionQueueState<Item>;
}>;
export type ReportedQueues = Readonly<{
  profitability?: ReportedQueue<DecisionQueueItem>;
  offer?: ReportedQueue<OfferDecisionQueueItem>;
  contract?: ReportedQueue<ContractDecisionQueueItem>;
}>;
/** One queue owner's latest state, or its departure. */
export type QueueReport =
  | {
      kind: 'profitability';
      queue: ReportedQueue<DecisionQueueItem> | undefined;
    }
  | { kind: 'offer'; queue: ReportedQueue<OfferDecisionQueueItem> | undefined }
  | {
      kind: 'contract';
      queue: ReportedQueue<ContractDecisionQueueItem> | undefined;
    };

/** What the Clarté card of one decision shows, from its queue's own copy. */
type CardFacts = Readonly<{
  kind: string;
  title: string;
  facts: readonly (readonly [string, string])[];
  variant?: string;
  actionLabel: string;
}>;

/**
 * "To decide" (#1532): the Profitability Estimate, Offer and Contract
 * decision queues, each its existing owner with its gates, keys, reads,
 * paging and recovery, presented as Clarté cards. A card opens the existing
 * review through `onReview`; every queue reports its state to Today for
 * work in order.
 */
export function TodayDecisions({
  context,
  sessionGeneration,
  queues,
  onReport,
  onReview,
}: Readonly<{
  context: PendingDecisionContext;
  sessionGeneration: number;
  queues: ReportedQueues;
  onReport: (report: QueueReport) => void;
  onReview: (work: DecisionWork) => void;
}>) {
  const copy = useClarteTodayCopy();
  const titleId = useId();
  const { formatDateTime } = useInterfaceLocale();
  const profitabilityCopy = useDecisionQueueCopy();
  const offerCopy = useOfferDecisionQueueCopy();
  const contractCopy = useContractDecisionQueueCopy();
  const contractKinds = {
    CONTRACT: contractCopy.contract,
    PRECONTRACT: contractCopy.precontract,
    ADDENDUM: contractCopy.addendum,
  };
  // The block exists once an authorized queue owner is mounted.
  const reported = [queues.profitability, queues.offer, queues.contract].filter(
    (queue) => queue !== undefined,
  );
  return (
    <section
      className="clarte-today-section"
      aria-labelledby={titleId}
      hidden={reported.length === 0}
    >
      <header className="clarte-today-section-head">
        <h2 id={titleId}>{copy.message('decideTitle')}</h2>
        <p>{copy.message('decideLead')}</p>
      </header>
      <div className="clarte-today-queues">
        <ProfitabilityDecisionQueue
          key={`profitability-queue:${sessionGeneration}`}
          {...context}
          present={(state) => (
            <QueueCards
              kind="profitability"
              state={state}
              copy={profitabilityCopy}
              onReport={(queue) => onReport({ kind: 'profitability', queue })}
              onReview={(item) => onReview({ queue: 'profitability', item })}
              facts={(item) => ({
                kind: copy.message('kindProfitability'),
                title: item.opportunityTitle,
                facts: [
                  [profitabilityCopy.version, String(item.versionNumber)],
                  [profitabilityCopy.submitted, formatDateTime(item.createdAt)],
                ],
                variant:
                  item.versionNumber === item.latestVersionNumber
                    ? profitabilityCopy.latest
                    : profitabilityCopy.earlier,
                actionLabel: `${profitabilityCopy.open} ${item.versionNumber}`,
              })}
            />
          )}
        />
        <OfferDecisionQueue
          key={`offer-queue:${sessionGeneration}`}
          {...context}
          present={(state) => (
            <QueueCards
              kind="offer"
              state={state}
              copy={offerCopy}
              onReport={(queue) => onReport({ kind: 'offer', queue })}
              onReview={(item) => onReview({ queue: 'offer', item })}
              facts={(item) => ({
                kind: copy.message('kindOffer'),
                title: item.opportunityTitle,
                facts: [
                  [offerCopy.reference, String(item.illustrativeReference)],
                  [offerCopy.version, String(item.versionNumber)],
                  [offerCopy.submitted, formatDateTime(item.createdAt)],
                ],
                variant:
                  item.provenance === 'ILLUSTRATIVE'
                    ? offerCopy.illustrative
                    : offerCopy.model,
                actionLabel: `${offerCopy.open} ${item.illustrativeReference}, ${offerCopy.version.toLowerCase()} ${item.versionNumber}`,
              })}
            />
          )}
        />
        <ContractDecisionQueue
          key={`contract-queue:${sessionGeneration}`}
          {...context}
          present={(state) => (
            <QueueCards
              kind="contract"
              state={state}
              copy={contractCopy}
              onReport={(queue) => onReport({ kind: 'contract', queue })}
              onReview={(item) => onReview({ queue: 'contract', item })}
              facts={(item) => ({
                kind: contractKinds[item.kind],
                title: item.opportunityTitle,
                facts: [
                  [contractCopy.reference, String(item.illustrativeReference)],
                  [contractCopy.version, String(item.versionNumber)],
                  [contractCopy.submitted, formatDateTime(item.createdAt)],
                ],
                variant:
                  item.provenance === 'ILLUSTRATIVE'
                    ? contractCopy.illustrative
                    : contractCopy.model,
                actionLabel: `${contractCopy.open} ${contractKinds[item.kind]} ${item.illustrativeReference}, ${contractCopy.version.toLowerCase()} ${item.versionNumber}`,
              })}
            />
          )}
        />
      </div>
    </section>
  );
}

type QueueCopy = Readonly<{
  title: string;
  empty: string;
  loading: string;
  error: string;
  denied: string;
  refresh: string;
  retry: string;
  next: string;
  previous: string;
}> &
  Readonly<{ laterEmpty?: string }>;

function QueueCards<Item extends { versionId: string }>({
  kind,
  state,
  copy,
  facts,
  onReport,
  onReview,
}: Readonly<{
  kind: DecisionQueueKind;
  state: DecisionQueueState<Item>;
  copy: QueueCopy;
  facts: (item: Item) => CardFacts;
  onReport: (queue: ReportedQueue<Item> | undefined) => void;
  onReview: (item: Item) => void;
}>) {
  const today = useClarteTodayCopy();
  const titleId = useId();
  const owner = useRef({});
  const report = useRef(onReport);
  useLayoutEffect(() => {
    report.current = onReport;
  });
  const { view, page } = state;
  const latest = useRef(state);
  useLayoutEffect(() => {
    latest.current = state;
  });
  // The owner's state reaches Today whenever its page changes, and leaves
  // with the owner, so work in order never lists an item it cannot open.
  useEffect(() => {
    report.current({ owner: owner.current, state: latest.current });
  }, [view, page]);
  useEffect(() => () => report.current(undefined), []);

  const items = view.kind === 'ready' ? view.page.items : [];
  const nextCursor = view.kind === 'ready' ? view.page.nextCursor : undefined;
  let body: ReactNode;
  switch (view.kind) {
    case 'loading':
      body = <ClarteLoadingState label={copy.loading} />;
      break;
    case 'error':
    case 'denied':
      body = (
        <ClarteErrorState
          title={view.kind === 'error' ? copy.error : copy.denied}
          action={
            <ClarteButton size="small" onClick={state.retry}>
              {copy.retry}
            </ClarteButton>
          }
        />
      );
      break;
    case 'ready':
      body =
        items.length === 0 ? (
          <p className="clarte-today-queue-empty">
            {page > 1 ? (copy.laterEmpty ?? copy.empty) : copy.empty}
          </p>
        ) : (
          <ul className="clarte-today-decisions">
            {items.map((item) => {
              const card = facts(item);
              return (
                <li key={item.versionId} className="clarte-today-decision">
                  <div className="clarte-today-decision-top">
                    <ClarteBadge tone="accent">{card.kind}</ClarteBadge>
                    {card.variant && <small>{card.variant}</small>}
                  </div>
                  <h4>{card.title}</h4>
                  <dl className="clarte-today-facts">
                    {card.facts.map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <ClarteButton
                    variant="primary"
                    aria-label={card.actionLabel}
                    onClick={() => onReview(item)}
                  >
                    {today.message('reviewAction')}
                    <ArrowRight aria-hidden="true" />
                  </ClarteButton>
                </li>
              );
            })}
          </ul>
        );
      break;
    default: {
      const exhaustive: never = view;
      return exhaustive;
    }
  }
  return (
    <section
      className="clarte-today-queue"
      aria-labelledby={titleId}
      data-queue={kind}
      data-empty={items.length === 0 || undefined}
    >
      <header className="clarte-today-queue-head">
        <h3 id={titleId} ref={state.heading} tabIndex={-1}>
          {copy.title}
        </h3>
        {page > 1 && <small>{today.reviewPage({ page })}</small>}
        <ClarteButton
          size="small"
          variant="quiet"
          aria-label={copy.refresh}
          title={copy.refresh}
          disabled={view.kind === 'loading'}
          onClick={state.refresh}
        >
          <RefreshCw aria-hidden="true" />
        </ClarteButton>
      </header>
      {body}
      {(page > 1 || nextCursor) && (
        <div className="clarte-today-pager">
          <ClarteButton
            size="small"
            disabled={page < 2}
            onClick={state.previous}
          >
            {copy.previous}
          </ClarteButton>
          <ClarteButton
            size="small"
            disabled={!nextCursor}
            onClick={state.next}
          >
            {copy.next}
          </ClarteButton>
        </div>
      )}
    </section>
  );
}
