import { useEffect, useState } from 'react';
import { grantOf, holds } from '../../access/company-grants';
import type { RequestedVersion } from '../../commercial-intake/CommercialIntakeWorkspace';
import { AffaireList, rowTarget, type ClientRestriction } from './AffaireList';
import {
  AffairePage,
  type AffaireTarget,
  type AffaireUpdate,
} from './AffairePage';
import type { AffaireStage } from './affaire-response';
import type { AffaireStagePanelContext } from './stage-panels';
import './clarte-affaires.css';

type OpenedAffaire = {
  target: AffaireTarget;
  initialStage?: AffaireStage;
  /** Numbers each opening, so reopening the same affaire remounts its page. */
  opening: number;
};

/**
 * The Clarté Affaires screen (#1533): the list and board of affaires and one
 * affaire page. App composes it with the gates, keys and callbacks of the
 * current Requests section; it replaces only the Affaires tab renderer.
 */
export function ClarteAffaires({
  clientRestriction,
  requestedRequest,
  ...context
}: Omit<AffaireStagePanelContext, 'onAffaireChanged' | 'requestCommand'> &
  Readonly<{
    /** A new object restricts the loaded rows to one dossier; none clears it. */
    clientRestriction?: ClientRestriction;
    /** A new object opens that Request's affaire; none retires it. */
    requestedRequest?: {
      clientRequestId: string;
      version?: RequestedVersion;
      sourceSignal?: AbortSignal;
      requestId: number;
    };
  }>) {
  const company = context.actor.activeCompany;
  const [opened, setOpened] = useState<OpenedAffaire>();
  const [restriction, setRestriction] = useState(clientRestriction);
  const [updated, setUpdated] = useState<AffaireUpdate>();

  useEffect(() => {
    setRestriction(clientRestriction);
    if (clientRestriction) setOpened(undefined);
  }, [clientRestriction]);

  useEffect(() => {
    if (!requestedRequest || requestedRequest.sourceSignal?.aborted) return;
    const version = requestedRequest.version;
    setOpened((current) => ({
      target: {
        kind: 'request',
        clientRequestId: requestedRequest.clientRequestId,
      },
      initialStage:
        version?.type === 'offer_version'
          ? 'offer'
          : version?.type === 'contract_version'
            ? 'contract'
            : undefined,
      opening: (current?.opening ?? 0) + 1,
    }));
  }, [requestedRequest]);

  if (!company) return null;
  // Client names belong to the Client authority and identity they were read
  // under, as in the current Requests workspace.
  const clientGrant = grantOf(company, 'company_director_client_access');
  const clientProjection = JSON.stringify([
    context.clientAuthorityRevision,
    context.clientIdentityRevision,
    clientGrant?.assignmentId,
    clientGrant?.permissionSetVersion,
    context.actor.workspacePermissions.includes('client.manage') ||
      holds(company, 'company_director_client_access', 'client.read'),
  ]);
  const open = (target: AffaireTarget) =>
    setOpened((current) => ({
      target,
      opening: (current?.opening ?? 0) + 1,
    }));
  const close = () => {
    const target = opened?.target;
    setOpened(undefined);
    if (target?.kind === 'opportunity')
      window.requestAnimationFrame(() =>
        document.getElementById(rowTarget(target.opportunityId))?.focus(),
      );
  };
  return (
    <div id="requests" tabIndex={-1} className="clarte-affaires">
      <div hidden={opened !== undefined}>
        <AffaireList
          companyId={company.id}
          context={context}
          clientProjection={clientProjection}
          restriction={restriction}
          onClearRestriction={() => setRestriction(undefined)}
          updated={updated}
          onOpen={(affaire) =>
            open({ kind: 'opportunity', opportunityId: affaire.opportunityId })
          }
          onOpenRequest={(clientRequestId) =>
            open({ kind: 'request', clientRequestId })
          }
        />
      </div>
      {opened ? (
        <AffairePage
          key={opened.opening}
          target={opened.target}
          companyId={company.id}
          context={context}
          clientProjection={clientProjection}
          initialStage={opened.initialStage}
          onBack={close}
          onSummary={setUpdated}
        />
      ) : null}
    </div>
  );
}
