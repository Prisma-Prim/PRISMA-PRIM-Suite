import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { SectionVisibility } from '../../production-shell/section-visibility';
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
}: Omit<
  AffaireStagePanelContext,
  'onAffaireChanged' | 'onRequestProtectedChange' | 'requestCommand'
> &
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
  // The frame keeps every section mounted; the list reads only once the
  // Affaires screen is first shown, then keeps its rows.
  const visible = useContext(SectionVisibility);
  const [entered, setEntered] = useState(visible);
  useEffect(() => {
    if (visible) setEntered(true);
  }, [visible]);
  const [opened, setOpened] = useState<OpenedAffaire>();
  const [restriction, setRestriction] = useState(clientRestriction);
  const [updated, setUpdated] = useState<AffaireUpdate>();
  // While the Request stage protects a pending or uncertain command, the
  // page stays: a requested affaire waits, as in the current workspace.
  const [pageProtected, setPageProtected] = useState(false);
  const [held, setHeld] = useState<Omit<OpenedAffaire, 'opening'>>();

  const protection = useRef(pageProtected);
  useLayoutEffect(() => {
    protection.current = pageProtected;
  });
  // Only a new restriction closes the page, never over protected work.
  useEffect(() => {
    setRestriction(clientRestriction);
    if (clientRestriction && !protection.current) setOpened(undefined);
  }, [clientRestriction]);

  useEffect(() => {
    if (!requestedRequest || requestedRequest.sourceSignal?.aborted) return;
    const version = requestedRequest.version;
    setHeld({
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
    });
  }, [requestedRequest]);

  useEffect(() => {
    if (!held || pageProtected) return;
    setHeld(undefined);
    setOpened((current) => ({
      ...held,
      opening: (current?.opening ?? 0) + 1,
    }));
  }, [held, pageProtected]);

  if (!company) return null;
  // Loaded names and stage facts belong to the authority they were read
  // under: any change of grant, capture, Client authority or identity
  // withdraws them at once and rereads, as the current workspaces do.
  const readAuthority = JSON.stringify([
    context.clientAuthorityRevision,
    context.clientIdentityRevision,
    context.actor.workspacePermissions,
    company,
  ]);
  const open = (target: AffaireTarget) =>
    setOpened((current) => ({
      target,
      opening: (current?.opening ?? 0) + 1,
    }));
  const close = () => {
    if (pageProtected) return;
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
        {entered ? (
          <AffaireList
            companyId={company.id}
            context={context}
            readAuthority={readAuthority}
            restriction={restriction}
            onClearRestriction={() => setRestriction(undefined)}
            updated={updated}
            onOpen={(affaire) =>
              open({
                kind: 'opportunity',
                opportunityId: affaire.opportunityId,
              })
            }
            onOpenRequest={(clientRequestId) =>
              open({ kind: 'request', clientRequestId })
            }
          />
        ) : null}
      </div>
      {opened ? (
        <AffairePage
          key={opened.opening}
          target={opened.target}
          companyId={company.id}
          context={context}
          readAuthority={readAuthority}
          initialStage={opened.initialStage}
          leaveHeld={pageProtected}
          onBack={close}
          onProtectedChange={setPageProtected}
          onSummary={setUpdated}
        />
      ) : null}
    </div>
  );
}
