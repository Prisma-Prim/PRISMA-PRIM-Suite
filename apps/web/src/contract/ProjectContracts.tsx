import { useEffect, useState } from 'react';
import { useRequestLifetime } from '../api/use-actor-requests';
import { useScopedOperationGroup } from '../api/use-scoped-operation';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import { useInterfaceLocale } from '../localization/interface-locale';
import {
  readLinkedContracts,
  type LinkedContract,
} from './contract-projects-response';
import { useContractProjectsCopy } from './contract-projects.copy';
import { grantOf, holds } from '../access/company-grants';
import { holdsContractRead } from './contract-grants';
type Props = {
  actor: ActorContext;
  identity: BrowserIdentity;
  projectId: string;
  onOpenContract?: (clientRequestId: string) => void;
};
type View =
  | { kind: 'loading' | 'unavailable' }
  | { kind: 'ready'; items: LinkedContract[] };
export function ProjectContracts(props: Props) {
  const company = props.actor.activeCompany;
  const lifetime = useRequestLifetime(
    props.identity,
    JSON.stringify([
      props.projectId,
      props.identity.loaded,
      props.identity.signedIn,
      props.actor.active,
      props.actor.workspaceId,
      props.actor.internalUserId,
      props.actor.workspaceMembershipId,
      company?.id,
      grantOf(company, 'company_contract_preparer'),
      grantOf(company, 'company_contract_approver'),
      grantOf(company, 'company_commercial_intake'),
      grantOf(company, 'company_project_access'),
      props.actor.workspacePermissions.includes('client.manage')
        ? 'workspace-client-read'
        : grantOf(company, 'company_director_client_access'),
    ]),
  );
  return <ProjectContractsSession key={lifetime} {...props} />;
}
function ProjectContractsSession({
  actor,
  identity,
  projectId,
  onOpenContract,
}: Props) {
  const [view, setView] = useState<View>({ kind: 'loading' });
  const copy = useContractProjectsCopy(),
    { formatDateTime } = useInterfaceLocale();
  const company = actor.activeCompany;
  const mayRead =
    identity.loaded &&
    identity.signedIn &&
    holdsContractRead(company) &&
    holds(
      company,
      'company_commercial_intake',
      'commercial.opportunity.read',
    ) &&
    holds(company, 'company_project_access', 'project.read') &&
    (holds(company, 'company_director_client_access', 'client.read') ||
      actor.workspacePermissions.includes('client.manage'));
  const lifetime = useRequestLifetime(
    identity,
    JSON.stringify([projectId, company?.id, mayRead]),
  );
  const reads = useScopedOperationGroup(String(lifetime));
  useEffect(() => {
    if (!mayRead || !company) return;
    const controller = reads.beginLatest();
    if (!controller) return;
    const load = async () => {
      try {
        const api = await createAuthenticatedApiClient(identity);
        if (controller.signal.aborted) return;
        const result = await api.request(
          `/contracts/projects/${encodeURIComponent(projectId)}`,
          { companyContextId: company?.id, signal: controller.signal },
        );
        if (!controller.signal.aborted)
          setView(
            result.status === 'ok'
              ? { kind: 'ready', items: readLinkedContracts(result.value) }
              : { kind: 'unavailable' },
          );
      } catch {
        if (!controller.signal.aborted) setView({ kind: 'unavailable' });
      } finally {
        controller.release();
      }
    };
    void load();
    return controller.retire;
  }, [identity, projectId, mayRead, company?.id, reads]);
  if (!mayRead || (view.kind === 'ready' && view.items.length === 0))
    return null;
  return (
    <section
      className="contract-projects contract-decision"
      aria-label={copy('contracts')}
    >
      <h4>{copy('contracts')}</h4>
      {view.kind === 'ready' ? (
        <ul>
          {view.items.map((contract) => (
            <li key={contract.id}>
              <span>
                {copy(
                  contract.kind === 'PRECONTRACT'
                    ? 'precontractReference'
                    : 'reference',
                )}{' '}
                {contract.illustrativeReference}
              </span>{' '}
              ·{' '}
              <time dateTime={contract.linkedAt}>
                {formatDateTime(contract.linkedAt)}
              </time>
              {onOpenContract && (
                <button
                  type="button"
                  onClick={() => onOpenContract(contract.clientRequestId)}
                >
                  {copy('openContract')}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p role="status">
          {copy(view.kind === 'loading' ? 'loading' : 'unavailable')}
        </p>
      )}
    </section>
  );
}
