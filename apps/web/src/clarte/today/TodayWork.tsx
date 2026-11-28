import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  ShieldCheck,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import { useContractDecisionQueueCopy } from '../../contract/contract-decision-queue.copy';
import { useInterfaceLocale } from '../../localization/interface-locale';
import { useOfferDecisionQueueCopy } from '../../offer/offer-decision-queue.copy';
import type { AttentionRule } from '../../operational-home/operational-home-response';
import { useOperationalHomeCopy } from '../../operational-home/operational-home-localized.copy';
import { ClarteBadge, type ClarteTone } from '../components/ClarteBadge';
import { ClarteButton } from '../components/ClarteButton';
import { ClarteEmptyState } from '../components/ClarteState';
import { useClarteTodayCopy } from './clarte-today.copy';
import {
  workKey,
  workSources,
  type WorkItem,
  type WorkSource,
} from './work-order';

type Described = Readonly<{
  kind: string;
  title: string;
  context: string;
  reasons: readonly { label: string; tone: ClarteTone }[];
}>;

const groupIcons = {
  decision: ShieldCheck,
  attention: ListChecks,
  overdue: TriangleAlert,
  upcoming: CalendarClock,
} satisfies Record<WorkSource, LucideIcon>;

/**
 * Work in order (#1532): the items of Today one at a time, in the order of
 * `workInOrder`, with the list beside them. Each item says what it is and
 * why it is here, and opens in its existing destination.
 */
export function TodayWork({
  items,
  loading,
  incomplete,
  review,
  onOpen,
  onBack,
}: Readonly<{
  items: readonly WorkItem[];
  /** Some lists of the order are still being read. */
  loading: boolean;
  /** Some lists could not be read and are not in the order. */
  incomplete: boolean;
  /** The existing review shown in the detail column on desktop. */
  review?: ReactNode;
  onOpen: (item: WorkItem) => void;
  onBack: () => void;
}>) {
  const copy = useClarteTodayCopy();
  const describe = useDescribe();
  const { formatNumber } = useInterfaceLocale();
  const titleId = useId();
  const itemTitleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const reviewed = useRef(false);
  const reviewOpen = Boolean(review);
  const [current, setCurrent] = useState<{ key: string; index: number }>();
  useEffect(() => {
    heading.current?.focus();
  }, []);
  useLayoutEffect(() => {
    if (reviewed.current && !reviewOpen)
      (openButton.current ?? heading.current)?.focus();
    reviewed.current = reviewOpen;
  }, [reviewOpen]);

  // The position follows its item across rereads; a settled item gives its
  // place to the next one.
  const found = current
    ? items.findIndex((item) => workKey(item) === current.key)
    : 0;
  const index =
    found >= 0 ? found : Math.min(current?.index ?? 0, items.length - 1);
  const item = items[index];
  const go = (next: number) => {
    const target = items[next];
    if (target) setCurrent({ key: workKey(target), index: next });
  };

  return (
    <section
      className="clarte-today-work-layout"
      aria-labelledby={titleId}
      aria-description={copy.message('workOrder')}
    >
      <div className="clarte-today-work-list">
        <header className="clarte-today-work-head">
          <h2 id={titleId} ref={heading} tabIndex={-1}>
            {copy.message('workTitle')}
          </h2>
          <ClarteButton size="small" disabled={reviewOpen} onClick={onBack}>
            <ArrowLeft aria-hidden="true" />
            {copy.message('workBack')}
          </ClarteButton>
        </header>
        {loading && (
          <p className="clarte-today-card-note" role="status">
            {copy.message('workLoading')}
          </p>
        )}
        {incomplete && (
          <p className="clarte-today-work-warning" role="alert">
            {copy.message('workIncomplete')}
          </p>
        )}
        {!item ? (
          !loading && <ClarteEmptyState title={copy.message('workEmpty')} />
        ) : (
          <nav
            className="clarte-today-work-groups"
            aria-label={copy.message('workList')}
          >
            {workSources.map((source) => {
              const group = items
                .map((entry, position) => ({ entry, position }))
                .filter(({ entry }) => entry.source === source);
              if (group.length === 0) return null;
              const Icon = groupIcons[source];
              return (
                <div key={source} className="clarte-today-work-group">
                  <h3>
                    <Icon aria-hidden="true" />
                    {copy.message(groupLabel[source])}
                    <span>{formatNumber(group.length)}</span>
                  </h3>
                  <ol>
                    {group.map(({ entry, position }) => {
                      const described = describe(entry);
                      return (
                        <li key={workKey(entry)}>
                          <button
                            type="button"
                            aria-current={position === index || undefined}
                            disabled={reviewOpen}
                            onClick={() => go(position)}
                          >
                            <span
                              className="clarte-today-work-icon"
                              aria-hidden="true"
                            >
                              <Icon />
                            </span>
                            <strong>{described.title}</strong>
                            <small>{described.context}</small>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              );
            })}
          </nav>
        )}
      </div>
      {item && (
        <WorkItemCard
          item={item}
          described={describe(item)}
          titleId={itemTitleId}
          position={copy.workPosition({
            position: formatNumber(index + 1),
            total: formatNumber(items.length),
          })}
          hasPrevious={index > 0}
          hasNext={index < items.length - 1}
          onPrevious={() => go(index - 1)}
          onNext={() => go(index + 1)}
          onOpen={() => onOpen(item)}
          openRef={openButton}
          hidden={reviewOpen}
        />
      )}
      {review}
    </section>
  );
}

const groupLabel = {
  decision: 'groupDecision',
  attention: 'groupAttention',
  overdue: 'groupOverdue',
  upcoming: 'groupUpcoming',
} as const satisfies Record<WorkSource, string>;

function WorkItemCard({
  item,
  described,
  titleId,
  position,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  onOpen,
  openRef,
  hidden,
}: Readonly<{
  item: WorkItem;
  described: Described;
  titleId: string;
  position: string;
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onOpen: () => void;
  openRef: Ref<HTMLButtonElement>;
  hidden: boolean;
}>) {
  const copy = useClarteTodayCopy();
  const Icon = groupIcons[item.source];
  return (
    <article
      className="clarte-today-work-item"
      data-source={item.source}
      aria-labelledby={titleId}
      hidden={hidden}
    >
      <p className="clarte-today-work-position" role="status">
        {position}
      </p>
      <p className="clarte-today-work-kind">
        <Icon aria-hidden="true" />
        {described.kind}
      </p>
      <h3 id={titleId}>{described.title}</h3>
      <p className="clarte-today-work-context">{described.context}</p>
      <p className="clarte-today-work-reasons">
        {described.reasons.map((reason) => (
          <ClarteBadge key={reason.label} tone={reason.tone}>
            {reason.label}
          </ClarteBadge>
        ))}
      </p>
      <div className="clarte-today-work-actions">
        <ClarteButton
          ref={openRef}
          variant="primary"
          aria-label={copy.workOpenNamed({ title: described.title })}
          onClick={onOpen}
        >
          {copy.message('workOpen')}
          <ArrowRight aria-hidden="true" />
        </ClarteButton>
        <span className="clarte-today-work-steps">
          <ClarteButton disabled={!hasPrevious} onClick={onPrevious}>
            <ChevronLeft aria-hidden="true" />
            {copy.message('workPrevious')}
          </ClarteButton>
          <ClarteButton disabled={!hasNext} onClick={onNext}>
            {copy.message('workNext')}
            <ChevronRight aria-hidden="true" />
          </ClarteButton>
        </span>
      </div>
    </article>
  );
}

/** What an item is, its context and why it is in the order, in the interface language. */
function useDescribe(): (item: WorkItem) => Described {
  const copy = useClarteTodayCopy();
  const home = useOperationalHomeCopy();
  const offerCopy = useOfferDecisionQueueCopy();
  const contractCopy = useContractDecisionQueueCopy();
  const { formatDate, formatNumber } = useInterfaceLocale();
  const contractKinds = {
    CONTRACT: contractCopy.contract,
    PRECONTRACT: contractCopy.precontract,
    ADDENDUM: contractCopy.addendum,
  };
  function attentionReason(
    rule: AttentionRule,
    dueInDays: number | null,
  ): { label: string; tone: ClarteTone } {
    switch (rule) {
      case 'overdue': {
        const days = -(dueInDays ?? 0);
        return {
          label: home.attention.overdueBy({
            days,
            count: formatNumber(days),
          }),
          tone: 'danger',
        };
      }
      case 'critical':
        return { label: home.attention.critical, tone: 'danger' };
      case 'blocked':
        return { label: home.attention.blocked, tone: 'warning' };
      case 'due_soon': {
        const days = dueInDays ?? 0;
        return {
          label:
            days === 0
              ? home.attention.dueToday
              : home.attention.dueIn({ days, count: formatNumber(days) }),
          tone: 'warning',
        };
      }
      default: {
        const exhaustive: never = rule;
        return exhaustive;
      }
    }
  }
  return (item) => {
    switch (item.source) {
      case 'decision': {
        const waiting = {
          label: copy.whyDecision({ date: formatDate(item.item.createdAt) }),
          tone: 'info' as const,
        };
        switch (item.queue) {
          case 'profitability':
            return {
              kind: copy.message('kindProfitability'),
              title: item.item.opportunityTitle,
              context: copy.decisionContext({
                version: formatNumber(item.item.versionNumber),
              }),
              reasons: [waiting],
            };
          case 'offer':
            return {
              kind: copy.message('kindOffer'),
              title: item.item.opportunityTitle,
              context: `${offerCopy.reference} ${item.item.illustrativeReference} — ${offerCopy.version} ${item.item.versionNumber}`,
              reasons: [waiting],
            };
          case 'contract':
            return {
              kind: contractKinds[item.item.kind],
              title: item.item.opportunityTitle,
              context: `${contractCopy.reference} ${item.item.illustrativeReference} — ${contractCopy.version} ${item.item.versionNumber}`,
              reasons: [waiting],
            };
          default: {
            const exhaustive: never = item;
            return exhaustive;
          }
        }
      }
      case 'attention':
        return {
          kind: copy.message('kindTask'),
          title: item.task.title,
          context: copy.taskContext({
            project: item.task.project.title,
            client: item.task.project.clientDisplayName,
          }),
          reasons: item.task.rules.map((rule) =>
            attentionReason(rule, item.task.dueInDays),
          ),
        };
      case 'overdue':
        return {
          kind: copy.message('kindTask'),
          title: item.task.title,
          context: copy.taskContext({
            project: item.task.project.title,
            client: item.task.project.clientDisplayName,
          }),
          reasons: [
            {
              label: home.overdue.overdueBy({
                days: item.task.daysOverdue,
                count: formatNumber(item.task.daysOverdue),
              }),
              tone: 'danger',
            },
          ],
        };
      case 'upcoming':
        return {
          kind: copy.message('kindTask'),
          title: item.task.title,
          context: copy.taskContext({
            project: item.task.project.title,
            client: item.task.project.clientDisplayName,
          }),
          reasons: [
            {
              label: copy.whyUpcoming({ date: formatDate(item.task.dueDate) }),
              tone: 'info',
            },
          ],
        };
      default: {
        const exhaustive: never = item;
        return exhaustive;
      }
    }
  };
}
