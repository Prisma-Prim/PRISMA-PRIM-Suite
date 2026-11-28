import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { SectionVisibility } from '../../production-shell/section-visibility';
import {
  CommercialIntakeWorkspace,
  type RequestedVersion,
} from '../../commercial-intake/CommercialIntakeWorkspace';
import { ClarteButton } from '../components/ClarteButton';
import { DealList, rowTarget, type ClientRestriction } from './DealList';
import { DealPage, type DealTarget, type DealUpdate } from './DealPage';
import { useDealCopy } from './deals.copy';
import type { DealStagePanelContext } from './stage-panels';
import './clarte-deals.css';

type OpenedDeal = {
  target: DealTarget;
  /** Numbers each opening, so reopening the same deal remounts its page. */
  opening: number;
};

type RequestedRequest = {
  clientRequestId: string;
  version?: RequestedVersion;
  sourceSignal?: AbortSignal;
  requestId: number;
};

/**
 * The Clarté Deals screen (#1533): the list and board of deals and one
 * deal page. App composes it with the gates, keys and callbacks of the
 * current Requests section; it replaces only the Deals tab renderer.
 */
export function ClarteDeals({
  clientRestriction,
  requestedRequest,
  ...context
}: Omit<
  DealStagePanelContext,
  'onDealChanged' | 'onRequestProtectedChange' | 'requestCommand'
> &
  Readonly<{
    /** A new object restricts the loaded rows to one dossier; none clears it. */
    clientRestriction?: ClientRestriction;
    /**
     * A new object opens that Request's deal; one naming an exact Offer or
     * agreement version opens it in the current Request screens instead,
     * until #1534 and #1535 bring those versions to the deal page.
     */
    requestedRequest?: RequestedRequest;
  }>) {
  const company = context.actor.activeCompany;
  const copy = useDealCopy();
  const [opened, setOpened] = useState<OpenedDeal>();
  // The current Request screens stay mounted once used, hidden while the
  // list or a deal shows, so leaving them never discards their work.
  const [versioned, setVersioned] = useState<RequestedRequest>();
  const [versionShown, setVersionShown] = useState(false);
  // The frame keeps every section mounted; the list reads only once the
  // Deals list is first shown, then keeps its rows.
  const visible = useContext(SectionVisibility);
  const listShown = visible && opened === undefined && !versionShown;
  const [entered, setEntered] = useState(listShown);
  useEffect(() => {
    if (listShown) setEntered(true);
  }, [listShown]);
  const [restriction, setRestriction] = useState(clientRestriction);
  const [updated, setUpdated] = useState<DealUpdate>();
  // While the Request stage protects a pending or uncertain command, the
  // page stays: a requested deal waits, as in the current workspace.
  const [pageProtected, setPageProtected] = useState(false);
  const [held, setHeld] = useState<Omit<OpenedDeal, 'opening'>>();

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
    if (requestedRequest.version) {
      // The current screens open the exact version and hold it themselves.
      setVersioned(requestedRequest);
      setVersionShown(true);
      return;
    }
    setVersionShown(false);
    setHeld({
      target: {
        kind: 'request',
        clientRequestId: requestedRequest.clientRequestId,
      },
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
  const open = (target: DealTarget) =>
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
    <div id="requests" tabIndex={-1} className="clarte-deals">
      <div hidden={opened !== undefined || versionShown}>
        {entered ? (
          <DealList
            companyId={company.id}
            context={context}
            readAuthority={readAuthority}
            restriction={restriction}
            onClearRestriction={() => setRestriction(undefined)}
            updated={updated}
            onOpen={(deal) =>
              open({
                kind: 'opportunity',
                opportunityId: deal.opportunityId,
              })
            }
            onOpenRequest={(clientRequestId) =>
              open({ kind: 'request', clientRequestId })
            }
          />
        ) : null}
      </div>
      {opened ? (
        <div hidden={versionShown}>
          <DealPage
            key={opened.opening}
            target={opened.target}
            companyId={company.id}
            context={context}
            readAuthority={readAuthority}
            leaveHeld={pageProtected}
            onBack={close}
            onProtectedChange={setPageProtected}
            onSummary={setUpdated}
          />
        </div>
      ) : null}
      {versioned ? (
        <div hidden={!versionShown}>
          <ClarteButton
            variant="quiet"
            size="small"
            onClick={() => setVersionShown(false)}
          >
            {copy('backToList')}
          </ClarteButton>
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
            requestedRequest={versioned}
          />
        </div>
      ) : null}
    </div>
  );
}
