import { useInterfaceLocale } from '../../localization/interface-locale';
import { formatMessage } from '../../localization/messages';
import { OfferWorkspace, offerPanelGrantKey } from '../../offer/OfferWorkspace';
import { ClarteBadge, type ClarteTone } from '../components/ClarteBadge';
import { ClarteCard } from '../components/ClarteCard';
import { decisionLabelKeys, responseLabelKeys } from './deal-labels';
import type { OfferFact } from './deal-response';
import { useDealCopy, type DealMessageKey } from './deals.copy';
import {
  useCommercialStageCopy,
  type CommercialStageMessageKey,
} from './commercial-stages.copy';
import type { DealStagePanelProps } from './stage-panels';
import './commercial-stages.css';

/**
 * The Offer stage (EX-084 to EX-094): the Offer's path from the deal read,
 * then the existing Offer owner with its preparation, versions, exact
 * representation, PDF, checks, decision, simulated records and cover
 * message. Each version's commands sit beside its exact representation,
 * and an exact version a navigation asked for opens here.
 */
export function OfferStagePanel({ deal, view, context }: DealStagePanelProps) {
  if (view.stage !== 'offer' || view.marker === 'not_available') return null;
  const { actor } = context;
  const requested = context.requestedVersion;
  const requestedOffer =
    requested?.version.type === 'offer_version'
      ? {
          requestId: requested.requestId,
          offerVersionId: requested.version.offerVersionId,
        }
      : undefined;
  const currentClientId = deal.client?.clientDossierId;
  return (
    <div className="clarte-commercial-stage clarte-offer-stage">
      <OfferPath offer={view.offer} />
      <div className="clarte-commercial-owner">
        <OfferWorkspace
          panelKey={`offer:${requestedOffer?.requestId ?? 'head'}:${context.clientAuthorityRevision}:${context.clientIdentityRevision}:${actor.internalUserId}:${actor.workspaceId}:${actor.workspaceMembershipId}:${deal.clientRequestId}:${deal.opportunityId}:${offerPanelGrantKey(actor)}:${currentClientId ?? 'no-client'}`}
          actor={actor}
          identity={context.identity}
          clientRequestId={deal.clientRequestId}
          opportunityId={deal.opportunityId}
          requestedOffer={requestedOffer}
          currentClientId={currentClientId}
          clientDisplayName={deal.client?.displayName}
          besideVersion
          onChanged={context.onDealChanged}
          onCompanyContextRejected={context.onCompanyContextRejected}
          onActorRevalidated={context.onActorRevalidated}
          onWorkspaceAccessRejected={context.onWorkspaceAccessRejected}
        />
      </div>
    </div>
  );
}

type StepState = 'done' | 'current' | 'upcoming' | 'stopped';
type Step = {
  label: CommercialStageMessageKey;
  state: StepState;
  status: string;
};

/** The head Offer version's path, as the deal read states it. */
function OfferPath({ offer }: Readonly<{ offer: OfferFact | null }>) {
  const copy = useDealCopy();
  const stageCopy = useCommercialStageCopy();
  const { formatDate } = useInterfaceLocale();
  if (!offer)
    return (
      <ClarteCard title={stageCopy('offerPathTitle')}>
        <p>{stageCopy('offerPathNone')}</p>
        <p className="clarte-muted">{stageCopy('offerPathNoneHelp')}</p>
      </ClarteCard>
    );
  const steps = offerSteps(offer, copy);
  return (
    <ClarteCard title={stageCopy('offerPathTitle')}>
      <ol className="clarte-offer-path">
        {steps.map((step) => (
          <li key={step.label} data-state={step.state}>
            <span className="clarte-offer-path-label">
              {stageCopy(step.label)}
            </span>
            <ClarteBadge tone={stepTone(step.state)}>{step.status}</ClarteBadge>
          </li>
        ))}
      </ol>
      <p className="clarte-muted">
        {formatMessage(copy('offerValidUntil'), {
          date: formatDate(offer.validUntil),
        })}
      </p>
    </ClarteCard>
  );
}

function offerSteps(
  offer: OfferFact,
  copy: (key: DealMessageKey) => string,
): Step[] {
  const approved = offer.decisionState === 'APPROVED';
  const sent = offer.transmissionState === 'TRANSMITTED';
  const answered =
    offer.clientResponseState !== 'NONE' &&
    offer.clientResponseState !== 'PENDING';
  return [
    {
      label: 'offerPathPrepared',
      state: 'done',
      status: formatMessage(copy('offerVersion'), {
        version: offer.versionNumber,
      }),
    },
    {
      label: 'offerPathDecision',
      state:
        offer.decisionState === 'PENDING'
          ? 'current'
          : approved
            ? 'done'
            : 'stopped',
      status: copy(decisionLabelKeys[offer.decisionState]),
    },
    {
      label: 'offerPathTransmission',
      state: sent ? 'done' : approved ? 'current' : 'upcoming',
      status: copy(sent ? 'offerSent' : 'offerNotSent'),
    },
    {
      label: 'offerPathResponse',
      state: answered
        ? offer.clientResponseState === 'ACCEPTED'
          ? 'done'
          : 'stopped'
        : offer.clientResponseState === 'PENDING'
          ? 'current'
          : 'upcoming',
      status: copy(responseLabelKeys[offer.clientResponseState]),
    },
  ];
}

function stepTone(state: StepState): ClarteTone {
  switch (state) {
    case 'done':
      return 'success';
    case 'current':
      return 'warning';
    case 'stopped':
      return 'danger';
    case 'upcoming':
      return 'neutral';
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}
