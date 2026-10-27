import {
  PendingDecisionQueue,
  type PendingDecisionContext,
} from '../commercial-decision-queue/PendingDecisionQueue';
import { OfferPanel } from './OfferPanel';
import { offerDecisionQueueAuthority } from './offer-decision-queue-authority';
import {
  parseOfferDecisionQueue,
  type OfferDecisionQueueItem,
} from './offer-decision-queue-response';
import { useOfferDecisionQueueCopy } from './offer-decision-queue.copy';

export function OfferDecisionQueue(props: PendingDecisionContext) {
  const copy = useOfferDecisionQueueCopy();
  const authority = offerDecisionQueueAuthority(props.actor);
  const company = props.actor.activeCompany;
  if (!company) return null;
  return (
    <PendingDecisionQueue<OfferDecisionQueueItem>
      {...props}
      read={authority.read}
      authorityKey={authority.key}
      endpoint="/offer-decision-queue"
      className="offer-decision-queue"
      copy={copy}
      parsePage={(value) =>
        parseOfferDecisionQueue(value, {
          workspaceId: props.actor.workspaceId,
          companyId: company.id,
          modelDecision: authority.modelDecision,
        })
      }
      renderVariant={(item) => (
        <p>
          {item.provenance === 'ILLUSTRATIVE' ? copy.illustrative : copy.model}
        </p>
      )}
      actionLabel={(item) =>
        `${copy.open} ${item.illustrativeReference}, ${copy.version.toLowerCase()} ${item.versionNumber}`
      }
      renderSelected={(item, report) => (
        <OfferPanel
          {...props}
          opportunityId={item.opportunityId}
          requestedVersionId={item.versionId}
          expectedOfferId={item.offerId}
          onProtectedWorkChange={report}
        />
      )}
    />
  );
}
