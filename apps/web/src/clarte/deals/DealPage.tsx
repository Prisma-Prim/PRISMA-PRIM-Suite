import { ArrowLeft, ArrowRight } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { holds } from '../../access/company-grants';
import { useActorRequests } from '../../api/use-actor-requests';
import { useCommercialRequestCopy } from '../../commercial-intake/commercial-request.copy';
import { useSalesStageCopy } from '../../commercial-intake/sales-stage.copy';
import { useInterfaceLocale } from '../../localization/interface-locale';
import { formatMessage } from '../../localization/messages';
import { ClarteBadge } from '../components/ClarteBadge';
import { ClarteButton } from '../components/ClarteButton';
import { ClarteCard } from '../components/ClarteCard';
import {
  ClarteEmptyState,
  ClarteErrorState,
  ClarteLoadingState,
} from '../components/ClarteState';
import { markerLabelKeys, stageLabelKeys, stageNumber } from './deal-labels';
import {
  parseDealDetail,
  type DealDetail,
  type DealStage,
  type DealStageView,
  type DealSummary,
} from './deal-response';
import { useDealCopy } from './deals.copy';
import { dealStagePanels, type DealStagePanelContext } from './stage-panels';

/** One deal, by its Opportunity or, from another screen, by its Request. */
export type DealTarget =
  | { kind: 'opportunity'; opportunityId: string }
  | { kind: 'request'; clientRequestId: string };

type PageState =
  | { kind: 'loading' }
  | { kind: 'ready'; deal: DealDetail; projection: string }
  | { kind: 'unavailable' | 'denied' | 'error' };

/** A reread deal and the Client projection it was read under. */
export type DealUpdate = { summary: DealSummary; projection: string };

type PageContext = Omit<
  DealStagePanelContext,
  'onDealChanged' | 'onRequestProtectedChange' | 'requestCommand'
>;

/**
 * The deal page: header, the seven-stage thread, one Next step card and
 * the selected stage's panel. Every fact comes from `GET /deals/:id`;
 * after a confirmed change the page rereads it, so the thread and the Next
 * step card follow without a reload.
 */
export function DealPage({
  target,
  companyId,
  context,
  readAuthority,
  initialStage,
  leaveHeld,
  onBack,
  onProtectedChange,
  onSummary,
}: Readonly<{
  target: DealTarget;
  companyId: string;
  context: PageContext;
  /**
   * The grants, captures and Client authority and identity the shown facts
   * belong to. A change withdraws the Client name and every stage fact at
   * once and rereads the deal.
   */
  readAuthority: string;
  initialStage?: DealStage;
  /** The Request stage protects pending or uncertain work: Back waits. */
  leaveHeld: boolean;
  onBack: () => void;
  onProtectedChange: (active: boolean) => void;
  onSummary: (update: DealUpdate) => void;
}>) {
  const copy = useDealCopy();
  const requests = useActorRequests({
    actor: context.actor,
    identity: context.identity,
    onCompanyContextRejected: context.onCompanyContextRejected,
    onActorRevalidated: context.onActorRevalidated,
    onWorkspaceAccessRejected: context.onWorkspaceAccessRejected,
    companyId,
    scope: 'clarte-deal',
  });
  const [state, setState] = useState<PageState>({ kind: 'loading' });
  const [selected, setSelected] = useState(initialStage);
  const [command, setCommand] =
    useState<DealStagePanelContext['requestCommand']>();
  const opportunity = useRef(
    target.kind === 'opportunity' ? target.opportunityId : undefined,
  );
  const sequence = useRef(0);
  const summary = useRef(onSummary);
  const latestRequest = useRef(requests.request);
  const projection = useRef(readAuthority);
  useLayoutEffect(() => {
    summary.current = onSummary;
    latestRequest.current = requests.request;
    projection.current = readAuthority;
  });

  const load = useCallback(async () => {
    const request = latestRequest.current;
    const readUnder = projection.current;
    const attempt = ++sequence.current;
    const current = () => attempt === sequence.current;
    if (!opportunity.current && target.kind === 'request') {
      const found = await request(
        `/commercial-intake/requests/${encodeURIComponent(target.clientRequestId)}`,
      );
      if (found.status === 'retired' || !current()) return;
      const opportunityId =
        found.status === 'ok' ? initialOpportunityId(found.value) : undefined;
      if (!opportunityId) {
        setState(failure(found.status));
        return;
      }
      opportunity.current = opportunityId;
    }
    const opportunityId = opportunity.current;
    if (!opportunityId) return;
    const result = await request(`/deals/${encodeURIComponent(opportunityId)}`);
    if (result.status === 'retired' || !current()) return;
    if (result.status !== 'ok') {
      // A failed reread keeps the shown deal; a refusal never does.
      setState((shown) =>
        shown.kind === 'ready' && result.status === 'error'
          ? shown
          : failure(result.status),
      );
      return;
    }
    try {
      const deal = parseDealDetail(result.value, opportunityId);
      setState({ kind: 'ready', deal, projection: readUnder });
      summary.current({ summary: deal, projection: readUnder });
    } catch {
      setState({ kind: 'error' });
    }
  }, [target]);

  useEffect(() => {
    void load();
  }, [load]);

  // A Client authority or identity change rereads; until then no name shows.
  const readProjection = useRef(readAuthority);
  useEffect(() => {
    if (readProjection.current === readAuthority) return;
    readProjection.current = readAuthority;
    void load();
  }, [readAuthority, load]);

  const heading = useRef<HTMLHeadingElement>(null);
  const focused = useRef(false);
  useEffect(() => {
    if (state.kind !== 'ready' || focused.current) return;
    focused.current = true;
    heading.current?.focus();
  }, [state.kind]);

  const back = (
    <ClarteButton
      variant="quiet"
      size="small"
      disabled={leaveHeld}
      onClick={onBack}
    >
      <ArrowLeft aria-hidden="true" />
      {copy('backToList')}
    </ClarteButton>
  );
  if (state.kind === 'loading')
    return (
      <div className="clarte-deal">
        {back}
        <ClarteLoadingState label={copy('loadingDeal')} />
      </div>
    );
  if (state.kind !== 'ready')
    return (
      <div className="clarte-deal">
        {back}
        <ClarteErrorState
          title={
            state.kind === 'unavailable'
              ? copy('dealUnavailable')
              : state.kind === 'denied'
                ? copy('dealDenied')
                : copy('dealError')
          }
          action={
            state.kind === 'error' ? (
              <ClarteButton onClick={() => void load()}>
                {copy('retry')}
              </ClarteButton>
            ) : undefined
          }
        />
      </div>
    );

  const deal: DealDetail =
    state.projection === readAuthority ? state.deal : withdrawn(state.deal);
  const current =
    deal.thread.kind === 'in_progress' ? deal.thread.currentStage : undefined;
  const shown: DealStage = selected ?? current ?? 'request';
  const panelContext: DealStagePanelContext = {
    ...context,
    onDealChanged: () => void load(),
    onRequestProtectedChange: onProtectedChange,
    requestCommand: command,
  };
  const openCommand = (kind: 'next-action' | 'outcome') => {
    setSelected('request');
    setCommand((previous) => ({
      kind,
      requestId: (previous?.requestId ?? 0) + 1,
    }));
  };
  return (
    <div className="clarte-deal">
      {back}
      <DealHeader deal={deal} heading={heading} context={context} />
      <DealThread
        deal={deal}
        shown={shown}
        onSelect={(stage) => setSelected(stage)}
      />
      <div className="clarte-deal-layout">
        <aside className="clarte-deal-side">
          <NextStepCard deal={deal} context={context} onCommand={openCommand} />
        </aside>
        <StagePanel
          deal={deal}
          shown={shown}
          current={current}
          context={panelContext}
          onReturn={() => setSelected(current)}
        />
      </div>
    </div>
  );
}

function DealHeader({
  deal,
  heading,
  context,
}: Readonly<{
  deal: DealDetail;
  heading: RefObject<HTMLHeadingElement | null>;
  context: PageContext;
}>) {
  const copy = useDealCopy();
  const request = useCommercialRequestCopy();
  const stageCopy = useSalesStageCopy();
  const stage =
    deal.thread.kind === 'in_progress' ? deal.thread.currentStage : undefined;
  const dossier = deal.client?.clientDossierId;
  return (
    <header className="clarte-deal-head">
      <p className="clarte-deal-kicker">
        {stage ? (
          <span className="clarte-stage-chip" data-stage={stageNumber(stage)}>
            {copy(stageLabelKeys[stage])}
          </span>
        ) : null}
        <ClarteBadge tone={statusTone(deal.status)}>
          {request.opportunityStatusLabels[deal.status]}
        </ClarteBadge>
        {deal.salesStage ? (
          <ClarteBadge tone="neutral">
            {stageCopy('salesStage')}: {deal.salesStage.label}
          </ClarteBadge>
        ) : null}
      </p>
      <h2 ref={heading} tabIndex={-1}>
        {deal.title}
      </h2>
      {deal.subject ? (
        <p className="clarte-deal-subject">{deal.subject}</p>
      ) : null}
      <dl className="clarte-deal-meta">
        <div>
          <dt>{copy('headerClient')}</dt>
          <dd>
            {deal.client ? (
              dossier && context.onOpenClientDossier ? (
                <button
                  type="button"
                  className="clarte-link"
                  onClick={() => context.onOpenClientDossier?.(dossier)}
                >
                  {deal.client.displayName}
                </button>
              ) : (
                deal.client.displayName
              )
            ) : (
              copy('noClient')
            )}
          </dd>
        </div>
        <div>
          <dt>{copy('headerOwner')}</dt>
          <dd>{deal.owner.displayName}</dd>
        </div>
      </dl>
    </header>
  );
}

function DealThread({
  deal,
  shown,
  onSelect,
}: Readonly<{
  deal: DealDetail;
  shown: DealStage;
  onSelect: (stage: DealStage) => void;
}>) {
  const copy = useDealCopy();
  const request = useCommercialRequestCopy();
  const list = useRef<HTMLOListElement>(null);
  // On a narrow screen the thread scrolls sideways: show the current stage.
  useEffect(() => {
    const element = list.current;
    const current = element?.querySelector<HTMLElement>(
      '[data-marker="current"]',
    );
    if (element && current && element.scrollWidth > element.clientWidth)
      element.scrollLeft +=
        current.getBoundingClientRect().left -
        element.getBoundingClientRect().left -
        10;
  }, []);
  return (
    <div className="clarte-thread-wrap">
      <ol ref={list} className="clarte-thread" aria-label={copy('threadLabel')}>
        {deal.stages.map((view) => (
          <li
            key={view.stage}
            data-stage={stageNumber(view.stage)}
            data-marker={view.marker}
          >
            <button
              type="button"
              aria-pressed={shown === view.stage}
              aria-current={view.marker === 'current' ? 'step' : undefined}
              onClick={() => onSelect(view.stage)}
            >
              <span className="clarte-thread-number" aria-hidden="true">
                {stageNumber(view.stage)}
              </span>
              <span className="clarte-thread-label">
                {copy(stageLabelKeys[view.stage])}
              </span>
              <span className="clarte-thread-marker">
                {copy(markerLabelKeys[view.marker])}
              </span>
            </button>
          </li>
        ))}
      </ol>
      {deal.thread.kind === 'closed' ? (
        <p className="clarte-thread-closed" role="status">
          {formatMessage(copy('threadClosed'), {
            status: request.opportunityStatusLabels[deal.thread.status],
          })}
        </p>
      ) : null}
    </div>
  );
}

function NextStepCard({
  deal,
  context,
  onCommand,
}: Readonly<{
  deal: DealDetail;
  context: PageContext;
  onCommand: (kind: 'next-action' | 'outcome') => void;
}>) {
  const copy = useDealCopy();
  const request = useCommercialRequestCopy();
  const { formatDate } = useInterfaceLocale();
  const company = context.actor.activeCompany;
  const intakeReads =
    holds(company, 'company_commercial_intake', 'commercial.request.read') &&
    holds(company, 'company_commercial_intake', 'commercial.opportunity.read');
  // The same gates as the Request stage's own buttons; the server decides.
  const canEditNextAction = holds(
    company,
    'company_commercial_intake',
    'commercial.opportunity.next_action.update',
  );
  const canChangeOutcome =
    holds(
      company,
      'company_opportunity_manager',
      'commercial.opportunity.outcome.change',
    ) && intakeReads;
  const closed = deal.thread.kind === 'closed';
  const followUpOn = deal.followUpOn.readable ? deal.followUpOn.value : null;
  return (
    <ClarteCard title={copy('nextStepTitle')}>
      <div className="clarte-next-step">
        <p className="clarte-next-step-stage">
          {deal.thread.kind === 'in_progress'
            ? formatMessage(copy('nextStepCurrent'), {
                stage: copy(stageLabelKeys[deal.thread.currentStage]),
              })
            : formatMessage(copy('nextStepClosed'), {
                status: request.opportunityStatusLabels[deal.thread.status],
              })}
        </p>
        <p className="clarte-next-step-label">{copy('nextStepAction')}</p>
        <p className="clarte-next-step-action">{deal.nextAction}</p>
        <p className="clarte-next-step-meta">
          <span>{deal.owner.displayName}</span>
          {followUpOn ? (
            <ClarteBadge tone="warning">
              {formatMessage(copy('nextStepFollowUp'), {
                date: formatDate(followUpOn),
              })}
            </ClarteBadge>
          ) : null}
        </p>
        {closed ? (
          canChangeOutcome ? (
            <ClarteButton
              variant="primary"
              onClick={() => onCommand('outcome')}
            >
              {copy('commandStatus')}
              <ArrowRight aria-hidden="true" />
            </ClarteButton>
          ) : null
        ) : canEditNextAction ? (
          <ClarteButton
            variant="primary"
            onClick={() => onCommand('next-action')}
          >
            {copy('commandNextAction')}
            <ArrowRight aria-hidden="true" />
          </ClarteButton>
        ) : null}
      </div>
    </ClarteCard>
  );
}

function StagePanel({
  deal,
  shown,
  current,
  context,
  onReturn,
}: Readonly<{
  deal: DealDetail;
  shown: DealStage;
  current: DealStage | undefined;
  context: DealStagePanelContext;
  onReturn: () => void;
}>) {
  const copy = useDealCopy();
  const titleId = useId();
  const Panel = dealStagePanels[shown];
  const view = deal.stages.find((stage) => stage.stage === shown);
  const requestView = deal.stages.find((stage) => stage.stage === 'request');
  const RequestPanel = dealStagePanels.request;
  return (
    <section className="clarte-stage-panel" aria-labelledby={titleId}>
      <h3 id={titleId} data-stage={stageNumber(shown)}>
        {copy(stageLabelKeys[shown])}
      </h3>
      {current && shown !== current ? (
        <p className="clarte-stage-viewing">
          {formatMessage(copy('viewingStage'), {
            stage: copy(stageLabelKeys[shown]),
          })}{' '}
          <button type="button" className="clarte-link" onClick={onReturn}>
            {copy('returnToCurrent')}
          </button>
        </p>
      ) : null}
      {/* The Request stage stays mounted so its drafts and retries survive. */}
      {requestView ? (
        <div hidden={shown !== 'request'}>
          <RequestPanel deal={deal} view={requestView} context={context} />
        </div>
      ) : null}
      {shown === 'request' || !view ? null : view.marker === 'not_available' ? (
        <ClarteEmptyState title={copy('panelNotAvailable')}>
          <p>{copy('panelNotAvailableHelp')}</p>
        </ClarteEmptyState>
      ) : (
        <Panel deal={deal} view={view} context={context} />
      )}
    </section>
  );
}

function statusTone(status: DealDetail['status']) {
  switch (status) {
    case 'OPEN':
      return 'info' as const;
    case 'ON_HOLD':
      return 'warning' as const;
    case 'WON':
      return 'success' as const;
    case 'LOST':
    case 'DISQUALIFIED':
      return 'danger' as const;
    case 'ARCHIVED':
      return 'neutral' as const;
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

/**
 * What may stay shown while a reread under a changed authority is pending:
 * the Commercial Intake summary, never a Client name, follow-up date or any
 * later stage's facts or presence.
 */
function withdrawn(deal: DealDetail): DealDetail {
  const closed = deal.thread.kind === 'closed';
  return {
    ...deal,
    client: null,
    followUpOn: { readable: false },
    thread: closed
      ? deal.thread
      : { kind: 'in_progress', currentStage: 'request' },
    stages: deal.stages.map((view): DealStageView => {
      switch (view.stage) {
        case 'request':
          return { ...view, marker: closed ? 'done' : 'current' };
        case 'collection':
          return view;
        case 'costing':
        case 'offer':
        case 'contract':
        case 'delivery':
        case 'closure':
          return { stage: view.stage, marker: 'not_available' };
        default: {
          const exhaustive: never = view;
          return exhaustive;
        }
      }
    }),
  };
}

function failure(
  status: string,
): Extract<PageState, { kind: 'unavailable' | 'denied' | 'error' }> {
  if (status === 'notFound') return { kind: 'unavailable' };
  if (status === 'forbidden' || status === 'unauthorized')
    return { kind: 'denied' };
  return { kind: 'error' };
}

function initialOpportunityId(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const opportunity: unknown = Reflect.get(value, 'initialOpportunity');
  if (typeof opportunity !== 'object' || opportunity === null) return undefined;
  const id: unknown = Reflect.get(opportunity, 'id');
  return typeof id === 'string' && id ? id : undefined;
}
