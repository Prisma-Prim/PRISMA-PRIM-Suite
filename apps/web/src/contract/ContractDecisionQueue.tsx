import {
  PendingDecisionQueue,
  type PendingDecisionContext,
} from '../commercial-decision-queue/PendingDecisionQueue';
import { ContractPanel } from './ContractPanel';
import { contractDecisionQueueAuthority } from './contract-decision-queue-authority';
import {
  parseContractDecisionQueue,
  type ContractDecisionQueueItem,
} from './contract-decision-queue-response';
import { useContractDecisionQueueCopy } from './contract-decision-queue.copy';

export function ContractDecisionQueue(props: PendingDecisionContext) {
  const copy = useContractDecisionQueueCopy();
  const authority = contractDecisionQueueAuthority(props.actor);
  const company = props.actor.activeCompany;
  if (!company) return null;
  const kinds = {
    CONTRACT: copy.contract,
    PRECONTRACT: copy.precontract,
    ADDENDUM: copy.addendum,
  };
  return (
    <PendingDecisionQueue<ContractDecisionQueueItem>
      {...props}
      read={authority.read}
      authorityKey={authority.key}
      endpoint="/contract-decision-queue"
      className="contract-decision-queue"
      copy={copy}
      parsePage={(value) =>
        parseContractDecisionQueue(value, {
          workspaceId: props.actor.workspaceId,
          companyId: company.id,
          modelDecision: authority.modelDecision,
        })
      }
      renderVariant={(item) => (
        <>
          <p>{kinds[item.kind]}</p>
          <p>
            {item.provenance === 'ILLUSTRATIVE'
              ? copy.illustrative
              : copy.model}
          </p>
        </>
      )}
      actionLabel={(item) =>
        `${copy.open} ${kinds[item.kind]} ${item.illustrativeReference}, ${copy.version.toLowerCase()} ${item.versionNumber}`
      }
      renderSelected={(item, report) => (
        <ContractPanel
          {...props}
          opportunityId={item.opportunityId}
          opportunityTitle={item.opportunityTitle}
          requestedVersion={{
            kind: item.kind,
            contractId: item.contractId,
            contractVersionId: item.versionId,
          }}
          onProtectedWorkChange={report}
        />
      )}
    />
  );
}
