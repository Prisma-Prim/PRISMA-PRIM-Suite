import { useEffect, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { companyAuthorityWithoutProjectTemplate } from '../project/project-authority';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import { useInterfaceLocale } from '../localization/interface-locale';
import {
  readLinkedContracts,
  type LinkedContract,
} from './contract-projects-response';
import { useContractProjectsCopy } from './contract-projects.copy';
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
  return (
    <ProjectContractsSession
      key={JSON.stringify([
        props.projectId,
        {
          ...props.actor,
          activeCompany: companyAuthorityWithoutProjectTemplate(
            props.actor.activeCompany,
          ),
        },
      ])}
      {...props}
    />
  );
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
  const mayRead = Boolean(
    company &&
    (((company.contractPermissionSetVersion === 'v1' ||
      company.contractPermissionSetVersion === 'v2') &&
      company.contractPermissionAssignmentId) ||
      ((company.contractApproverPermissionSetVersion === 'v1' ||
        company.contractApproverPermissionSetVersion === 'v2') &&
        company.contractApproverAssignmentId)) &&
    company.contractPermissions?.includes('commercial.contract.read') &&
    company.commercialIntakePermissions?.includes(
      'commercial.opportunity.read',
    ) &&
    company.projectPermissions?.includes('project.read') &&
    (company.clientPermissions?.includes('client.read') ||
      actor.workspacePermissions.includes('client.manage')),
  );
  useEffect(() => {
    if (!mayRead || !company) return;
    const controller = new AbortController();
    async function load() {
      try {
        const api = await createAuthenticatedApiClient(identity);
        if (controller.signal.aborted) return;
        const result = await api.request<unknown>(
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
      }
    }
    void load();
    return () => controller.abort();
  }, [identity, projectId, mayRead, company?.id]);
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
