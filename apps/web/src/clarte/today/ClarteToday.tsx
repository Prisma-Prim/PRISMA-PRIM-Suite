import { FileSignature, Inbox, Play, ShieldCheck } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { BrowserIdentity } from '../../access-composition';
import type { ActorContext } from '../../access-types';
import { useContractDecisionQueueCopy } from '../../contract/contract-decision-queue.copy';
import { useInterfaceLocale } from '../../localization/interface-locale';
import { useOfferDecisionQueueCopy } from '../../offer/offer-decision-queue.copy';
import {
  useCompanySummary,
  type OperationalHomeProps,
} from '../../operational-home/OperationalHome';
import { OverdueTasksPanel } from '../../operational-home/OverdueTasksPanel';
import { readCompanyOverdueTasks } from '../../operational-home/operational-home-response';
import { readUpcomingDeadlines } from '../../operational-home/upcoming-deadlines-response';
import { ClarteButton } from '../components/ClarteButton';
import { ClarteSidePanel } from '../components/ClarteSidePanel';
import { ClarteEmptyState } from '../components/ClarteState';
import { useClarteTodayCopy } from './clarte-today.copy';
import {
  TodayDecisions,
  type QueueReport,
  type ReportedQueue,
  type ReportedQueues,
} from './TodayDecisions';
import {
  CapturePanel,
  DirectContractPanel,
  type TodayCapture,
  type TodayDirectContract,
} from './TodayQuickActions';
import { TodaySummary } from './TodaySummary';
import { TodayToDo, TodayWeek } from './TodayTasks';
import { TodayWork } from './TodayWork';
import { browserDate, longDate } from './today-dates';
import { useFirstPage } from './use-first-page';
import { workInOrder, type DecisionWork, type WorkItem } from './work-order';
import './clarte-today.css';

export type ClarteTodayProps = Readonly<{
  actor: ActorContext;
  identity: BrowserIdentity;
  /** Keys the decision queue owners as App keys them in the current overview. */
  sessionGeneration: number;
  onActorRevalidated: (actor: ActorContext) => Promise<void> | void;
  onCompanyContextRejected: (companyId: string) => void;
  onWorkspaceAccessRejected: () => Promise<void> | void;
  /**
   * True while a panel of Today holds a pending or uncertain command (a
   * capture, a direct Contract or a decision): App then holds navigation,
   * as for a protected write, so leaving never discards its retry.
   */
  onProtectedWorkChange?: (active: boolean) => void;
  /**
   * The Company summary App offers in the active Company, with the scope
   * that keys it; absent, Today shows no summary, attention or deadlines.
   */
  summary?: OperationalHomeProps & { scope: string };
  /** App's summaries of all the actor's Companies, with their continuation. */
  companies?: ReactNode;
  /** The Client Request capture, where App offers the Requests section. */
  capture?: TodayCapture;
  /** The direct Contract preparation, where App's predicates allow it. */
  directContract?: TodayDirectContract;
}>;

type SummaryOwner = Readonly<{
  props: OperationalHomeProps;
  state: ReturnType<typeof useCompanySummary>;
}>;

/**
 * Today in the Clarté interface (#1532): what to handle now, in which order,
 * each item opened in its existing destination. It renders the existing
 * owners of the Company summary, the decision queues, the attention and
 * deadline lists, the Company summaries and the capture, and adds no
 * authority, total or priority of its own.
 */
export function ClarteToday(props: ClarteTodayProps) {
  if (props.summary)
    return (
      <TodayWithSummary
        key={props.summary.scope}
        {...props}
        summary={props.summary}
      />
    );
  return <TodayScreen {...props} summary={undefined} />;
}

function TodayWithSummary(
  props: ClarteTodayProps & { summary: OperationalHomeProps },
) {
  const state = useCompanySummary(props.summary);
  return <TodayScreen {...props} summary={{ props: props.summary, state }} />;
}

type Review = DecisionWork & { owner: object };

function TodayScreen({
  actor,
  identity,
  sessionGeneration,
  onActorRevalidated,
  onCompanyContextRejected,
  onWorkspaceAccessRejected,
  onProtectedWorkChange,
  summary,
  companies,
  capture,
  directContract,
}: Omit<ClarteTodayProps, 'summary'> & { summary: SummaryOwner | undefined }) {
  const copy = useClarteTodayCopy();
  const { locale } = useInterfaceLocale();
  const company = actor.activeCompany;
  const companyId = company?.id ?? '';
  const [working, setWorking] = useState(false);
  const [queues, setQueues] = useState<ReportedQueues>({});
  const [review, setReview] = useState<Review>();
  const [reviewHeld, setReviewHeld] = useState(false);
  const [quick, setQuick] = useState<'capture' | 'contract'>();
  const [quickHeld, setQuickHeld] = useState(false);
  const workButton = useRef<HTMLButtonElement>(null);
  const returnToWorkButton = useRef(false);
  const returnToOverdueCard = useRef(false);

  const load = summary?.state.load;
  const view = load?.kind === 'ready' ? load.view : undefined;
  const available = summary?.props.availableSummaries;
  const onOpenTask = summary?.props.onOpenTask;
  const onOpenOverdueTask = summary?.props.onOpenOverdueTask ?? onOpenTask;
  // Deadlines follow the Company's Task read, as in the current overview.
  const deadlines =
    summary !== undefined &&
    summary.state.overdueShown &&
    available?.overdue_tasks === true;
  const week = useFirstPage({
    identity,
    companyId,
    workspaceMembershipId: actor.workspaceMembershipId,
    path: '/due-soon-tasks?offset=0',
    enabled: deadlines,
    parse: (value) =>
      readUpcomingDeadlines(value, {
        companyId,
        workspaceMembershipId: actor.workspaceMembershipId,
        offset: 0,
      }),
  });
  // Work in order reads the first page of the Company's overdue Tasks.
  const overdue = useFirstPage({
    identity,
    companyId,
    workspaceMembershipId: actor.workspaceMembershipId,
    path: '/overdue-tasks?offset=0',
    enabled: working && deadlines && onOpenOverdueTask !== undefined,
    parse: (value) => readCompanyOverdueTasks(value, { companyId, offset: 0 }),
  });

  // Today's held work holds App's navigation until it settles or unmounts.
  const reportHeld = useRef(onProtectedWorkChange);
  useLayoutEffect(() => {
    reportHeld.current = onProtectedWorkChange;
  });
  const held = reviewHeld || quickHeld;
  useLayoutEffect(() => {
    reportHeld.current?.(held);
  }, [held]);
  useLayoutEffect(() => () => reportHeld.current?.(false), []);

  const onReport = useCallback((report: QueueReport) => {
    setQueues((current) => {
      switch (report.kind) {
        case 'profitability':
          return { ...current, profitability: report.queue };
        case 'offer':
          return { ...current, offer: report.queue };
        case 'contract':
          return { ...current, contract: report.queue };
        default: {
          const exhaustive: never = report;
          return exhaustive;
        }
      }
    });
  }, []);
  // A review belongs to the queue owner that listed it; a remounted or
  // withdrawn owner retires it.
  const reviewOwner = review ? queues[review.queue]?.owner : undefined;
  useEffect(() => {
    if (review && reviewOwner !== review.owner) {
      setReview(undefined);
      setReviewHeld(false);
    }
  }, [review, reviewOwner]);

  const panelOpen = summary?.state.panelOpen === true;
  const followUp = panelOpen && summary?.state.overdueShown === true;
  useEffect(() => {
    if (panelOpen || !returnToOverdueCard.current) return;
    returnToOverdueCard.current = false;
    summary?.state.overdueCard.current?.focus();
  }, [panelOpen]);
  useEffect(() => {
    if (working || !returnToWorkButton.current) return;
    returnToWorkButton.current = false;
    workButton.current?.focus();
  }, [working]);

  if (!company)
    return (
      <div className="clarte-today">
        <ClarteEmptyState title={copy.message('heroNoCompany')} />
      </div>
    );

  function openReview(work: DecisionWork) {
    const owner = queues[work.queue]?.owner;
    if (!owner) return;
    setReviewHeld(false);
    setReview({ ...work, owner });
  }
  function closeReview() {
    if (!review) return;
    setReview(undefined);
    setReviewHeld(false);
    // As the queue's own Back does: the page is read again from the start.
    queues[review.queue]?.state.refresh();
  }
  function openWork(item: WorkItem) {
    switch (item.source) {
      case 'decision':
        openReview(item);
        return;
      case 'attention':
        onOpenTask?.({ projectId: item.task.project.id, taskId: item.task.id });
        return;
      case 'overdue':
        onOpenOverdueTask?.({
          projectId: item.task.projectId,
          taskId: item.task.id,
        });
        return;
      case 'upcoming':
        onOpenTask?.({ projectId: item.task.projectId, taskId: item.task.id });
        return;
      default: {
        const exhaustive: never = item;
        return exhaustive;
      }
    }
  }

  const items = workInOrder({
    profitability: readyItems(queues.profitability),
    offer: readyItems(queues.offer),
    contract: readyItems(queues.contract),
    // Only Tasks Today can open take part in work in order.
    attention: onOpenTask ? view?.attention?.tasks : undefined,
    overdue:
      onOpenOverdueTask && overdue.load.kind === 'ready'
        ? overdue.load.page.tasks
        : undefined,
    upcoming:
      onOpenTask && week.load.kind === 'ready'
        ? week.load.page.tasks
        : undefined,
  });
  const reads = [
    ...[queues.profitability, queues.offer, queues.contract].map(
      (queue) => queue?.state.view.kind,
    ),
    load?.kind,
    week.load.kind,
    overdue.load.kind,
  ];

  const date = view?.today ?? browserDate();
  return (
    <div className="clarte-today">
      {working && (
        <TodayWork
          items={items}
          loading={reads.includes('loading')}
          incomplete={reads.includes('error')}
          onOpen={openWork}
          onBack={() => {
            returnToWorkButton.current = true;
            setWorking(false);
          }}
        />
      )}
      {followUp && summary && (
        <div className="clarte-today-followup">
          <OverdueTasksPanel
            company={company}
            identity={identity}
            headingRef={summary.state.panelHeading}
            onOpenTask={onOpenOverdueTask}
            onClose={() => {
              returnToOverdueCard.current = true;
              summary.state.closePanel();
            }}
          />
        </div>
      )}
      <div className="clarte-today-home" hidden={working || followUp}>
        <div className="clarte-today-hero">
          <p className="clarte-today-hero-date">
            <time dateTime={date}>{longDate(locale, date)}</time>
            <span aria-hidden="true"> · </span>
            <span>{company.displayName}</span>
          </p>
          <p className="clarte-today-hero-lead">{copy.message('heroLead')}</p>
          <div className="clarte-today-hero-actions">
            <ClarteButton
              ref={workButton}
              variant="primary"
              onClick={() => setWorking(true)}
            >
              <Play aria-hidden="true" />
              {copy.message('workStart')}
            </ClarteButton>
            {capture && (
              <ClarteButton onClick={() => setQuick('capture')}>
                <Inbox aria-hidden="true" />
                {copy.message('newRequest')}
              </ClarteButton>
            )}
            {directContract && (
              <ClarteButton onClick={() => setQuick('contract')}>
                <FileSignature aria-hidden="true" />
                {copy.message('directContract')}
              </ClarteButton>
            )}
          </div>
        </div>
        <div className="clarte-today-columns">
          <div className="clarte-today-main">
            <TodayDecisions
              context={{
                actor,
                identity,
                onActorRevalidated,
                onCompanyContextRejected,
                onWorkspaceAccessRejected,
              }}
              sessionGeneration={sessionGeneration}
              queues={queues}
              onReport={onReport}
              onReview={openReview}
            />
            {summary && (
              <TodayToDo
                attention={view?.attention}
                today={view?.today}
                deadlines={deadlines}
                company={company}
                workspaceMembershipId={actor.workspaceMembershipId}
                identity={identity}
                onOpenTask={onOpenTask}
                onOpenMyTasks={summary.props.onOpenMyTasks}
              />
            )}
          </div>
          <div className="clarte-today-side">
            {summary && (
              <TodaySummary
                company={company}
                load={summary.state.load}
                onRefresh={summary.state.read}
                onOpen={summary.state.open}
                overdueCard={summary.state.overdueCard}
              />
            )}
            {companies && (
              <div className="clarte-today-card clarte-today-companies">
                {companies}
              </div>
            )}
            <TodayWeek
              load={week.load}
              onRetry={week.retry}
              onOpenTask={onOpenTask}
            />
          </div>
        </div>
      </div>
      {review && (
        <DecisionReview
          review={review}
          queues={queues}
          held={reviewHeld}
          onHeld={setReviewHeld}
          onRetired={() => {
            setReview(undefined);
            setReviewHeld(false);
          }}
          onClose={closeReview}
        />
      )}
      {quick === 'capture' && capture && (
        <CapturePanel
          capture={capture}
          onHeld={setQuickHeld}
          onClose={() => setQuick(undefined)}
        />
      )}
      {quick === 'contract' && directContract && (
        <DirectContractPanel
          directContract={directContract}
          onHeld={setQuickHeld}
          onClose={() => setQuick(undefined)}
        />
      )}
    </div>
  );
}

function readyItems<Item>(
  queue: ReportedQueue<Item> | undefined,
): Item[] | undefined {
  return queue?.state.view.kind === 'ready'
    ? queue.state.view.page.items
    : undefined;
}

/** The existing review of one decision, in a side panel over Today. */
function DecisionReview({
  review,
  queues,
  held,
  onHeld,
  onRetired,
  onClose,
}: Readonly<{
  review: Review;
  queues: ReportedQueues;
  held: boolean;
  onHeld: (locked: boolean) => void;
  onRetired: () => void;
  onClose: () => void;
}>) {
  const copy = useClarteTodayCopy();
  const offerCopy = useOfferDecisionQueueCopy();
  const contractCopy = useContractDecisionQueueCopy();
  const controls = { reportProtectedWork: onHeld, close: onRetired };
  let kind: string;
  let body: ReactNode;
  switch (review.queue) {
    case 'profitability':
      kind = copy.message('kindProfitability');
      body = queues.profitability?.state.renderReview(review.item, controls);
      break;
    case 'offer':
      kind = `${copy.message('kindOffer')} ${offerCopy.reference.toLowerCase()} ${review.item.illustrativeReference}`;
      body = queues.offer?.state.renderReview(review.item, controls);
      break;
    case 'contract':
      kind = `${{ CONTRACT: contractCopy.contract, PRECONTRACT: contractCopy.precontract, ADDENDUM: contractCopy.addendum }[review.item.kind]} ${contractCopy.reference.toLowerCase()} ${review.item.illustrativeReference}`;
      body = queues.contract?.state.renderReview(review.item, controls);
      break;
    default: {
      const exhaustive: never = review;
      return exhaustive;
    }
  }
  return (
    <ClarteSidePanel
      title={review.item.opportunityTitle}
      description={`${kind} — ${copy.decisionContext({ version: review.item.versionNumber })}`}
      icon={<ShieldCheck />}
      dismissible={!held}
      onClose={onClose}
    >
      <div className="clarte-today-review">{body}</div>
    </ClarteSidePanel>
  );
}
