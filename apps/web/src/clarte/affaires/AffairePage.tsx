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
import { markerLabelKeys, stageLabelKeys, stageNumber } from './affaire-labels';
import {
  parseAffaireDetail,
  type AffaireDetail,
  type AffaireStage,
  type AffaireSummary,
} from './affaire-response';
import { useAffaireCopy } from './affaires.copy';
import {
  affaireStagePanels,
  type AffaireStagePanelContext,
} from './stage-panels';

/** One affaire, by its Opportunity or, from another screen, by its Request. */
export type AffaireTarget =
  | { kind: 'opportunity'; opportunityId: string }
  | { kind: 'request'; clientRequestId: string };

type PageState =
  | { kind: 'loading' }
  | { kind: 'ready'; affaire: AffaireDetail; projection: string }
  | { kind: 'unavailable' | 'denied' | 'error' };

/** A reread affaire and the Client projection it was read under. */
export type AffaireUpdate = { summary: AffaireSummary; projection: string };

type PageContext = Omit<
  AffaireStagePanelContext,
  'onAffaireChanged' | 'requestCommand'
>;

/**
 * The affaire page: header, the seven-stage thread, one Next step card and
 * the selected stage's panel. Every fact comes from `GET /affaires/:id`;
 * after a confirmed change the page rereads it, so the thread and the Next
 * step card follow without a reload.
 */
export function AffairePage({
  target,
  companyId,
  context,
  clientProjection,
  initialStage,
  onBack,
  onSummary,
}: Readonly<{
  target: AffaireTarget;
  companyId: string;
  context: PageContext;
  /**
   * The Client authority and identity the shown Client name belongs to. A
   * change withdraws the name at once and rereads the affaire.
   */
  clientProjection: string;
  initialStage?: AffaireStage;
  onBack: () => void;
  onSummary: (update: AffaireUpdate) => void;
}>) {
  const copy = useAffaireCopy();
  const requests = useActorRequests({
    actor: context.actor,
    identity: context.identity,
    onCompanyContextRejected: context.onCompanyContextRejected,
    onActorRevalidated: context.onActorRevalidated,
    onWorkspaceAccessRejected: context.onWorkspaceAccessRejected,
    companyId,
    scope: 'clarte-affaire',
  });
  const [state, setState] = useState<PageState>({ kind: 'loading' });
  const [selected, setSelected] = useState(initialStage);
  const [command, setCommand] =
    useState<AffaireStagePanelContext['requestCommand']>();
  const opportunity = useRef(
    target.kind === 'opportunity' ? target.opportunityId : undefined,
  );
  const sequence = useRef(0);
  const summary = useRef(onSummary);
  const latestRequest = useRef(requests.request);
  const projection = useRef(clientProjection);
  useLayoutEffect(() => {
    summary.current = onSummary;
    latestRequest.current = requests.request;
    projection.current = clientProjection;
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
    const result = await request(
      `/affaires/${encodeURIComponent(opportunityId)}`,
    );
    if (result.status === 'retired' || !current()) return;
    if (result.status !== 'ok') {
      // A failed reread keeps the shown affaire; a refusal never does.
      setState((shown) =>
        shown.kind === 'ready' && result.status === 'error'
          ? shown
          : failure(result.status),
      );
      return;
    }
    try {
      const affaire = parseAffaireDetail(result.value, opportunityId);
      setState({ kind: 'ready', affaire, projection: readUnder });
      summary.current({ summary: affaire, projection: readUnder });
    } catch {
      setState({ kind: 'error' });
    }
  }, [target]);

  useEffect(() => {
    void load();
  }, [load]);

  // A Client authority or identity change rereads; until then no name shows.
  const readProjection = useRef(clientProjection);
  useEffect(() => {
    if (readProjection.current === clientProjection) return;
    readProjection.current = clientProjection;
    void load();
  }, [clientProjection, load]);

  const heading = useRef<HTMLHeadingElement>(null);
  const focused = useRef(false);
  useEffect(() => {
    if (state.kind !== 'ready' || focused.current) return;
    focused.current = true;
    heading.current?.focus();
  }, [state.kind]);

  const back = (
    <ClarteButton variant="quiet" size="small" onClick={onBack}>
      <ArrowLeft aria-hidden="true" />
      {copy('backToList')}
    </ClarteButton>
  );
  if (state.kind === 'loading')
    return (
      <div className="clarte-affaire">
        {back}
        <ClarteLoadingState label={copy('loadingAffaire')} />
      </div>
    );
  if (state.kind !== 'ready')
    return (
      <div className="clarte-affaire">
        {back}
        <ClarteErrorState
          title={
            state.kind === 'unavailable'
              ? copy('affaireUnavailable')
              : state.kind === 'denied'
                ? copy('affaireDenied')
                : copy('affaireError')
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

  const affaire: AffaireDetail =
    state.projection === clientProjection
      ? state.affaire
      : { ...state.affaire, client: null };
  const current =
    affaire.thread.kind === 'in_progress'
      ? affaire.thread.currentStage
      : undefined;
  const shown: AffaireStage = selected ?? current ?? 'request';
  const panelContext: AffaireStagePanelContext = {
    ...context,
    onAffaireChanged: () => void load(),
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
    <div className="clarte-affaire">
      {back}
      <AffaireHeader affaire={affaire} heading={heading} context={context} />
      <AffaireThread
        affaire={affaire}
        shown={shown}
        onSelect={(stage) => setSelected(stage)}
      />
      <div className="clarte-affaire-layout">
        <aside className="clarte-affaire-side">
          <NextStepCard
            affaire={affaire}
            context={context}
            onCommand={openCommand}
          />
        </aside>
        <StagePanel
          affaire={affaire}
          shown={shown}
          current={current}
          context={panelContext}
          onReturn={() => setSelected(current)}
        />
      </div>
    </div>
  );
}

function AffaireHeader({
  affaire,
  heading,
  context,
}: Readonly<{
  affaire: AffaireDetail;
  heading: RefObject<HTMLHeadingElement | null>;
  context: PageContext;
}>) {
  const copy = useAffaireCopy();
  const request = useCommercialRequestCopy();
  const stageCopy = useSalesStageCopy();
  const stage =
    affaire.thread.kind === 'in_progress'
      ? affaire.thread.currentStage
      : undefined;
  const dossier = affaire.client?.clientDossierId;
  return (
    <header className="clarte-affaire-head">
      <p className="clarte-affaire-kicker">
        {stage ? (
          <span className="clarte-stage-chip" data-stage={stageNumber(stage)}>
            {copy(stageLabelKeys[stage])}
          </span>
        ) : null}
        <ClarteBadge tone={statusTone(affaire.status)}>
          {request.opportunityStatusLabels[affaire.status]}
        </ClarteBadge>
        {affaire.salesStage ? (
          <ClarteBadge tone="neutral">
            {stageCopy('salesStage')}: {affaire.salesStage.label}
          </ClarteBadge>
        ) : null}
      </p>
      <h2 ref={heading} tabIndex={-1}>
        {affaire.title}
      </h2>
      {affaire.subject ? (
        <p className="clarte-affaire-subject">{affaire.subject}</p>
      ) : null}
      <dl className="clarte-affaire-meta">
        <div>
          <dt>{copy('headerClient')}</dt>
          <dd>
            {affaire.client ? (
              dossier && context.onOpenClientDossier ? (
                <button
                  type="button"
                  className="clarte-link"
                  onClick={() => context.onOpenClientDossier?.(dossier)}
                >
                  {affaire.client.displayName}
                </button>
              ) : (
                affaire.client.displayName
              )
            ) : (
              copy('noClient')
            )}
          </dd>
        </div>
        <div>
          <dt>{copy('headerOwner')}</dt>
          <dd>{affaire.owner.displayName}</dd>
        </div>
      </dl>
    </header>
  );
}

function AffaireThread({
  affaire,
  shown,
  onSelect,
}: Readonly<{
  affaire: AffaireDetail;
  shown: AffaireStage;
  onSelect: (stage: AffaireStage) => void;
}>) {
  const copy = useAffaireCopy();
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
        {affaire.stages.map((view) => (
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
      {affaire.thread.kind === 'closed' ? (
        <p className="clarte-thread-closed" role="status">
          {formatMessage(copy('threadClosed'), {
            status: request.opportunityStatusLabels[affaire.thread.status],
          })}
        </p>
      ) : null}
    </div>
  );
}

function NextStepCard({
  affaire,
  context,
  onCommand,
}: Readonly<{
  affaire: AffaireDetail;
  context: PageContext;
  onCommand: (kind: 'next-action' | 'outcome') => void;
}>) {
  const copy = useAffaireCopy();
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
  const closed = affaire.thread.kind === 'closed';
  const followUpOn = affaire.followUpOn.readable
    ? affaire.followUpOn.value
    : null;
  return (
    <ClarteCard title={copy('nextStepTitle')}>
      <div className="clarte-next-step">
        <p className="clarte-next-step-stage">
          {affaire.thread.kind === 'in_progress'
            ? formatMessage(copy('nextStepCurrent'), {
                stage: copy(stageLabelKeys[affaire.thread.currentStage]),
              })
            : formatMessage(copy('nextStepClosed'), {
                status: request.opportunityStatusLabels[affaire.thread.status],
              })}
        </p>
        <p className="clarte-next-step-label">{copy('nextStepAction')}</p>
        <p className="clarte-next-step-action">{affaire.nextAction}</p>
        <p className="clarte-next-step-meta">
          <span>{affaire.owner.displayName}</span>
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
  affaire,
  shown,
  current,
  context,
  onReturn,
}: Readonly<{
  affaire: AffaireDetail;
  shown: AffaireStage;
  current: AffaireStage | undefined;
  context: AffaireStagePanelContext;
  onReturn: () => void;
}>) {
  const copy = useAffaireCopy();
  const titleId = useId();
  const Panel = affaireStagePanels[shown];
  const view = affaire.stages.find((stage) => stage.stage === shown);
  const requestView = affaire.stages.find((stage) => stage.stage === 'request');
  const RequestPanel = affaireStagePanels.request;
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
          <RequestPanel
            affaire={affaire}
            view={requestView}
            context={context}
          />
        </div>
      ) : null}
      {shown === 'request' || !view ? null : view.marker === 'not_available' ? (
        <ClarteEmptyState title={copy('panelNotAvailable')}>
          <p>{copy('panelNotAvailableHelp')}</p>
        </ClarteEmptyState>
      ) : (
        <Panel affaire={affaire} view={view} context={context} />
      )}
    </section>
  );
}

function statusTone(status: AffaireDetail['status']) {
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
