import { useState, type ReactNode } from 'react';
import type { BrowserIdentity } from '../../access-composition';
import type { ActorContext } from '../../access-types';
import {
  CommercialIntakeWorkspace,
  type RequestStagePresentation,
} from '../../commercial-intake/CommercialIntakeWorkspace';
import { useInterfaceLocale } from '../../localization/interface-locale';
import { formatMessage } from '../../localization/messages';
import { ClarteBadge, type ClarteTone } from '../components/ClarteBadge';
import { ClarteButton } from '../components/ClarteButton';
import { ClarteCard } from '../components/ClarteCard';
import { ClarteEmptyState } from '../components/ClarteState';
import type {
  DealDetail,
  DealStage,
  DealStageView,
  AgreementFact,
  CertificationCaseFact,
  DecisionState,
  OfferFact,
  ProjectFact,
} from './deal-response';
import { useDealCopy, type DealMessageKey } from './deals.copy';

/**
 * What App composed for the deal page, handed to every stage panel with
 * the same gates, keys and callbacks as the current interface.
 */
export type DealStagePanelContext = {
  actor: ActorContext;
  identity: BrowserIdentity;
  onCompanyContextRejected: (companyContextId: string) => void;
  onActorRevalidated: (actor: ActorContext) => Promise<void> | void;
  onWorkspaceAccessRejected: () => Promise<void> | void;
  onActivityRecorded: () => Promise<void> | void;
  clientIdentityRevision: number;
  clientAuthorityRevision: number;
  onOpenClientDossier?: (clientDossierId: string) => void;
  onOpenProject?: (projectId: string) => void;
  /** The authorized Finance section, when App offers one. */
  financeDestination?: 'invoice-records' | 'payments';
  /** Rereads the deal after a confirmed change made in a panel. */
  onDealChanged: () => void;
  /** Holds leaving the deal while the Request stage protects its work. */
  onRequestProtectedChange: (active: boolean) => void;
  /** The Next step card's latest request for a Request stage editor. */
  requestCommand?: RequestStagePresentation['command'];
};

export type DealStagePanelProps = Readonly<{
  deal: DealDetail;
  /** The stage's facts; never `not_available`, which the page shows itself. */
  view: DealStageView;
  context: DealStagePanelContext;
}>;

export type DealStagePanel = (props: DealStagePanelProps) => ReactNode;

/**
 * The stage-panel registry of the deal page. Later slices replace their
 * own entry: Costing and Offer (#1534), Contract and Delivery (#1535). Each
 * panel narrows `view` to its own stage and reuses the owner's existing
 * transports; see README.md.
 */
export const dealStagePanels: Readonly<Record<DealStage, DealStagePanel>> = {
  request: RequestStagePanel,
  costing: CostingSummary,
  offer: OfferSummary,
  contract: ContractSummary,
  delivery: DeliverySummary,
  closure: ClosureSummary,
  collection: CollectionSummary,
};

/**
 * The Request stage reuses Commercial Intake's own detail and Opportunity
 * commands (EX-056 to EX-066): drafts, retries, receipts and permission
 * states stay exactly those of the existing workspace.
 */
function RequestStagePanel({ deal, context }: DealStagePanelProps) {
  const copy = useDealCopy();
  // One requested Request per mounted page; it never reopens on rerender.
  const [requested] = useState(() => ({
    clientRequestId: deal.clientRequestId,
    requestId: 1,
  }));
  return (
    <div className="clarte-request-stage">
      <CommercialIntakeWorkspace
        actor={context.actor}
        identity={context.identity}
        onCompanyContextRejected={context.onCompanyContextRejected}
        onActorRevalidated={context.onActorRevalidated}
        onWorkspaceAccessRejected={context.onWorkspaceAccessRejected}
        onActivityRecorded={context.onActivityRecorded}
        clientIdentityRevision={context.clientIdentityRevision}
        clientAuthorityRevision={context.clientAuthorityRevision}
        onOpenClientDossier={context.onOpenClientDossier}
        onOpenProject={context.onOpenProject}
        requestedRequest={requested}
        requestStage={{
          loadingLabel: copy('requestLoading'),
          command: context.requestCommand,
          onChanged: context.onDealChanged,
          onProtectedChange: context.onRequestProtectedChange,
        }}
      />
    </div>
  );
}

function CostingSummary({ view }: DealStagePanelProps) {
  const copy = useDealCopy();
  const { formatDateTime } = useInterfaceLocale();
  if (view.stage !== 'costing' || view.marker === 'not_available') return null;
  const snapshot = view.pricingSnapshot;
  const estimate = view.profitabilityEstimate;
  return (
    <div className="clarte-stage-facts">
      <ClarteCard title={copy('pricingTitle')}>
        {!snapshot.readable ? (
          <p className="clarte-muted">{copy('notAvailable')}</p>
        ) : snapshot.value ? (
          <>
            <p className="clarte-fact-figure">
              {formatMessage(copy('pricingValue'), {
                total: snapshot.value.total,
                currency: snapshot.value.currency,
              })}
            </p>
            <p className="clarte-muted">
              {formatMessage(copy('pricingCalculated'), {
                date: formatDateTime(snapshot.value.calculatedAt),
              })}
            </p>
          </>
        ) : (
          <p className="clarte-muted">{copy('pricingNone')}</p>
        )}
      </ClarteCard>
      <ClarteCard title={copy('estimateTitle')}>
        {!estimate.readable ? (
          <p className="clarte-muted">{copy('notAvailable')}</p>
        ) : estimate.value ? (
          <p className="clarte-fact-line">
            <span>
              {formatMessage(copy('estimateVersion'), {
                version: estimate.value.versionNumber,
              })}
            </span>
            <ClarteBadge tone={estimateTone(estimate.value.decision)}>
              {copy(estimateLabel(estimate.value.decision))}
            </ClarteBadge>
          </p>
        ) : (
          <p className="clarte-muted">{copy('estimateNone')}</p>
        )}
      </ClarteCard>
    </div>
  );
}

function OfferSummary({ view }: DealStagePanelProps) {
  const copy = useDealCopy();
  const { formatDate } = useInterfaceLocale();
  if (view.stage !== 'offer' || view.marker === 'not_available') return null;
  if (!view.offer) return <EmptyStage />;
  const offer: OfferFact = view.offer;
  return (
    <ClarteCard>
      <p className="clarte-fact-line">
        <span>
          {formatMessage(copy('offerVersion'), {
            version: offer.versionNumber,
          })}
        </span>
        <ClarteBadge tone={decisionTone(offer.decisionState)}>
          {copy(decisionLabel(offer.decisionState))}
        </ClarteBadge>
        <ClarteBadge
          tone={offer.transmissionState === 'TRANSMITTED' ? 'info' : 'neutral'}
        >
          {copy(
            offer.transmissionState === 'TRANSMITTED'
              ? 'offerSent'
              : 'offerNotSent',
          )}
        </ClarteBadge>
      </p>
      <p>{copy(responseLabel(offer.clientResponseState))}</p>
      <p className="clarte-muted">
        {formatMessage(copy('offerValidUntil'), {
          date: formatDate(offer.validUntil),
        })}
      </p>
    </ClarteCard>
  );
}

function ContractSummary({ view }: DealStagePanelProps) {
  const copy = useDealCopy();
  if (view.stage !== 'contract' || view.marker === 'not_available') return null;
  if (view.agreements.length === 0) return <EmptyStage />;
  return (
    <ClarteCard>
      <ul className="clarte-list">
        {view.agreements.map((agreement: AgreementFact) => (
          <li key={agreement.id} className="clarte-fact-line">
            <strong>{copy(agreementLabel(agreement.kind))}</strong>
            <span>
              {formatMessage(copy('offerVersion'), {
                version: agreement.versionNumber,
              })}
            </span>
            <ClarteBadge tone={decisionTone(agreement.decisionState)}>
              {copy(decisionLabel(agreement.decisionState))}
            </ClarteBadge>
            <ClarteBadge
              tone={
                agreement.executionState === 'EXECUTED' ? 'success' : 'neutral'
              }
            >
              {copy(
                agreement.executionState === 'EXECUTED'
                  ? 'agreementSigned'
                  : 'agreementNotSigned',
              )}
            </ClarteBadge>
          </li>
        ))}
      </ul>
    </ClarteCard>
  );
}

function DeliverySummary({ view, context }: DealStagePanelProps) {
  const copy = useDealCopy();
  if (view.stage !== 'delivery' || view.marker === 'not_available') return null;
  if (view.projects.length === 0) return <EmptyStage />;
  return (
    <ClarteCard title={copy('projectsTitle')}>
      <ul className="clarte-list">
        {view.projects.map((project: ProjectFact) => (
          <li key={project.id} className="clarte-fact-line">
            <strong>{project.title}</strong>
            <ClarteBadge tone={projectTone(project.status)}>
              {copy(projectLabel(project.status))}
            </ClarteBadge>
            {context.onOpenProject ? (
              <ClarteButton
                size="small"
                variant="quiet"
                onClick={() => context.onOpenProject?.(project.id)}
              >
                {copy('openProject')}
              </ClarteButton>
            ) : null}
          </li>
        ))}
      </ul>
    </ClarteCard>
  );
}

function ClosureSummary({ view }: DealStagePanelProps) {
  const copy = useDealCopy();
  if (view.stage !== 'closure' || view.marker === 'not_available') return null;
  if (view.certificationCases.length === 0) return <EmptyStage />;
  return (
    <ClarteCard title={copy('casesTitle')}>
      <ul className="clarte-list">
        {view.certificationCases.map((item: CertificationCaseFact) => (
          <li key={item.id} className="clarte-fact-line">
            <strong>{item.orderReference}</strong>
            <ClarteBadge tone={caseTone(item.status)}>
              {copy(caseLabel(item.status))}
            </ClarteBadge>
          </li>
        ))}
      </ul>
    </ClarteCard>
  );
}

function CollectionSummary({ context }: DealStagePanelProps) {
  const copy = useDealCopy();
  return (
    <ClarteEmptyState
      title={copy('collectionNotLinked')}
      action={
        context.financeDestination ? (
          <a
            className="clarte-button clarte-button--secondary"
            href={`#${context.financeDestination}`}
          >
            {copy('openFinance')}
          </a>
        ) : undefined
      }
    >
      <p>{copy('collectionHelp')}</p>
    </ClarteEmptyState>
  );
}

function EmptyStage() {
  const copy = useDealCopy();
  return <ClarteEmptyState title={copy('panelEmpty')} />;
}

function decisionLabel(state: DecisionState): DealMessageKey {
  switch (state) {
    case 'PENDING':
      return 'decisionPending';
    case 'APPROVED':
      return 'decisionApproved';
    case 'REJECTED':
      return 'decisionRejected';
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}

function decisionTone(state: DecisionState): ClarteTone {
  return state === 'APPROVED'
    ? 'success'
    : state === 'REJECTED'
      ? 'danger'
      : 'warning';
}

function estimateLabel(
  decision: 'APPROVE' | 'MODIFY' | 'REJECT' | null,
): DealMessageKey {
  switch (decision) {
    case 'APPROVE':
      return 'estimateApprove';
    case 'MODIFY':
      return 'estimateModify';
    case 'REJECT':
      return 'estimateReject';
    case null:
      return 'estimatePending';
    default: {
      const exhaustive: never = decision;
      return exhaustive;
    }
  }
}

function estimateTone(
  decision: 'APPROVE' | 'MODIFY' | 'REJECT' | null,
): ClarteTone {
  return decision === 'APPROVE'
    ? 'success'
    : decision === 'REJECT'
      ? 'danger'
      : 'warning';
}

function responseLabel(state: OfferFact['clientResponseState']) {
  const labels = {
    NONE: 'responseNone',
    PENDING: 'responsePending',
    ACCEPTED: 'responseAccepted',
    REJECTED: 'responseRejected',
    EXPIRED: 'responseExpired',
  } as const satisfies Record<OfferFact['clientResponseState'], DealMessageKey>;
  return labels[state];
}

function agreementLabel(kind: AgreementFact['kind']) {
  const labels = {
    CONTRACT: 'agreementContract',
    PRECONTRACT: 'agreementPrecontract',
    ADDENDUM: 'agreementAddendum',
  } as const satisfies Record<AgreementFact['kind'], DealMessageKey>;
  return labels[kind];
}

function projectLabel(status: ProjectFact['status']) {
  const labels = {
    preparatory: 'projectPreparatory',
    active: 'projectActive',
    on_hold: 'projectOnHold',
    completed: 'projectCompleted',
    cancelled: 'projectCancelled',
  } as const satisfies Record<ProjectFact['status'], DealMessageKey>;
  return labels[status];
}

function projectTone(status: ProjectFact['status']): ClarteTone {
  return status === 'active'
    ? 'info'
    : status === 'completed'
      ? 'success'
      : status === 'on_hold'
        ? 'warning'
        : 'neutral';
}

function caseLabel(status: CertificationCaseFact['status']) {
  const labels = {
    open: 'caseOpen',
    rejected: 'caseRejected',
    refused: 'caseRefused',
    certified: 'caseCertified',
  } as const satisfies Record<CertificationCaseFact['status'], DealMessageKey>;
  return labels[status];
}

function caseTone(status: CertificationCaseFact['status']): ClarteTone {
  return status === 'certified'
    ? 'success'
    : status === 'open'
      ? 'info'
      : 'danger';
}
