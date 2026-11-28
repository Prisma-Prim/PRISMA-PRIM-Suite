import { Plus, Search } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ClientDuplicateReviewPanel } from '../../client/ClientDuplicateReviewPanel';
import { useClientDirectoryCopy } from '../../client/client-directory.copy';
import { useClientRegistrationCopy } from '../../client/client-registration.copy';
import {
  useClientWorkspace,
  type ClientWorkspaceOwner,
  type ClientWorkspaceProps,
} from '../../client/use-client-workspace';
import { ClarteButton } from '../components/ClarteButton';
import { ClarteField } from '../components/ClarteField';
import {
  ClarteEmptyState,
  ClarteErrorState,
  ClarteLoadingState,
} from '../components/ClarteState';
import { ClarteClientDossier } from './ClarteClientDossier';
import { ClarteClientList } from './ClarteClientList';
import { ClarteClientRegistration } from './ClarteClientRegistration';
import { ClarteNotice } from './ClarteNotice';
import { useClarteClientCopy } from './clarte-clients.copy';
import './clarte-clients.css';

/**
 * The Clarté Clients screen (#1536): the active Company's directory with the
 * Workspace search, registration in a side panel and the possible
 * duplicates, then one dossier page per Client. App composes it with the
 * gates, key and callbacks of the current Clients section; the directory
 * and dossier owners are the ones the current interface uses.
 */
export function ClarteClients(props: ClientWorkspaceProps) {
  const workspace = useClientWorkspace(props);
  const directoryCopy = useClientDirectoryCopy();
  // One dossier page shows at a time. Leaving it only hides it, so a union
  // command or correction already sent still completes, as it does in the
  // current interface while the directory is used; opening another Client
  // replaces it.
  const [opening, setOpening] = useState(0);
  const [pageShown, setPageShown] = useState(false);
  const selectedClientId = workspace.dossier.selectedClientId;
  const showPage = () => {
    setPageShown(true);
    setOpening((current) => current + 1);
  };
  useEffect(() => {
    if (selectedClientId !== undefined) showPage();
  }, [selectedClientId]);
  useEffect(() => {
    if (props.requestedClientDossierRequest) showPage();
  }, [props.requestedClientDossierRequest]);
  const owner: ClientWorkspaceOwner = {
    ...workspace,
    dossier: {
      ...workspace.dossier,
      open: (clientId: string) => {
        showPage();
        workspace.dossier.open(clientId);
      },
      close: () => setPageShown(false),
    },
  };
  const { activeCompany, access, dossier } = owner;
  if (!access.canReadClients)
    return (
      <div id="clients" tabIndex={-1} className="clarte-clients">
        <ClarteErrorState title={directoryCopy.permissionDenied} />
      </div>
    );
  if (!activeCompany)
    return (
      <div id="clients" tabIndex={-1} className="clarte-clients">
        <ClarteEmptyState title={directoryCopy.missingCompany} />
      </div>
    );
  const dossierShown =
    access.canReadClientDossiers &&
    dossier.selectedClientId !== undefined &&
    pageShown;
  return (
    <div id="clients" tabIndex={-1} className="clarte-clients">
      {/* The directory stays mounted under an open dossier, so its search,
          duplicate review and drafts are still there on the way back. */}
      <div hidden={dossierShown}>
        <ClientDirectoryScreen
          owner={owner}
          props={props}
          company={activeCompany}
        />
      </div>
      {access.canReadClientDossiers &&
        dossier.selectedClientId !== undefined && (
          <div hidden={!dossierShown}>
            <ClarteClientDossier
              key={`${props.actor.workspaceMembershipId}:${activeCompany.id}:${dossier.selectedClientId}:${owner.clientAuthority}`}
              clientId={dossier.selectedClientId}
              owner={owner}
              props={props}
              companyContextId={activeCompany.id}
              shown={dossierShown}
              opening={opening}
            />
          </div>
        )}
    </div>
  );
}

function ClientDirectoryScreen({
  owner,
  props,
  company,
}: Readonly<{
  owner: ClientWorkspaceOwner;
  props: ClientWorkspaceProps;
  company: { id: string; displayName: string };
}>) {
  const directoryCopy = useClientDirectoryCopy();
  const registrationCopy = useClientRegistrationCopy();
  const { message } = useClarteClientCopy();
  const { access, search, attachment, registration } = owner;
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const registrationTrigger = useRef<HTMLButtonElement>(null);
  const registrationState = registration.state.status;
  // A confirmed registration closes the panel; the new Client is in the list.
  useEffect(() => {
    if (registrationState === 'success') setRegistrationOpen(false);
  }, [registrationState]);
  const searching = search.state.status !== 'idle';
  const registrationFeedback = (
    <RegistrationFeedback owner={owner} copy={registrationCopy} />
  );
  // The outcome shows once: in the open panel, or on the page once it
  // closed; a confirmed registration closes the panel, so it shows there.
  const feedbackInPanel = registrationOpen && registrationState !== 'success';
  return (
    <section
      className="clarte-clients-directory"
      aria-labelledby="clarte-clients-directory-title"
    >
      <div className="clarte-clients-toolbar">
        <h2
          id="clarte-clients-directory-title"
          className="clarte-clients-company"
        >
          {directoryCopy.directoryCompany(company.displayName)}
        </h2>
        {access.canCreateClients && (
          <ClarteButton
            ref={registrationTrigger}
            variant="primary"
            aria-expanded={registrationOpen}
            aria-haspopup="dialog"
            onClick={() => setRegistrationOpen(true)}
          >
            <Plus aria-hidden="true" />
            {directoryCopy.newClient}
          </ClarteButton>
        )}
      </div>
      <form
        className="clarte-clients-search"
        role="search"
        onSubmit={(event) => void search.submit(event)}
        noValidate
      >
        <ClarteField
          label={directoryCopy.searchLabel}
          labelHidden
          hint={`${
            access.canAttachClients
              ? directoryCopy.workspaceSearchHint
              : directoryCopy.companySearchHint
          } ${directoryCopy.searchLimitHint}`}
          error={
            search.state.status === 'validation'
              ? directoryCopy.searchRequired
              : undefined
          }
        >
          {(control) => (
            <span className="clarte-clients-searchbox">
              <Search aria-hidden="true" />
              <input
                {...control}
                className="clarte-input"
                type="search"
                placeholder={message('searchPlaceholder')}
                value={search.query}
                onChange={(event) => search.setQuery(event.target.value)}
              />
            </span>
          )}
        </ClarteField>
        <div className="clarte-clients-search-actions">
          <ClarteButton
            type="submit"
            disabled={
              search.state.status === 'submitting' ||
              attachment.attachingClientId !== undefined
            }
          >
            {search.state.status === 'submitting'
              ? directoryCopy.searching
              : directoryCopy.search}
          </ClarteButton>
          {searching && (
            <ClarteButton
              variant="quiet"
              disabled={attachment.attachingClientId !== undefined}
              onClick={search.clear}
            >
              {directoryCopy.showCompanyClients}
            </ClarteButton>
          )}
        </div>
      </form>
      {!feedbackInPanel && registrationFeedback}
      {searching ? (
        <SearchResults owner={owner} company={company} />
      ) : (
        <CompanyClients owner={owner} company={company} />
      )}
      {access.canResolveDuplicateClients && (
        <div className="clarte-clients-duplicates">
          <p className="clarte-clients-intro">
            {message('possibleDuplicatesIntro')}
          </p>
          <ClientDuplicateReviewPanel
            key={`${props.actor.internalUserId}:${props.actor.workspaceId}:${props.actor.workspaceMembershipId}`}
            companyContextId={company.id}
            identity={props.identity}
            captureRecovery={owner.captureRecovery}
            canAttach={access.canAttachClients}
            refreshKey={owner.duplicateReview.refreshKey}
            authorityGeneration={owner.clientAuthority}
            onCompanyContextRejected={props.onCompanyContextRejected}
            onWorkspaceAccessRejected={props.onWorkspaceAccessRejected}
            onActorRevalidated={props.onActorRevalidated}
            onActivityRecorded={props.onActivityRecorded}
            onClientsChanged={() => owner.reloadClients(company.id)}
          />
        </div>
      )}
      {access.canCreateClients && registrationOpen && (
        <ClarteClientRegistration
          owner={owner}
          feedback={feedbackInPanel ? registrationFeedback : null}
          onClose={() => {
            setRegistrationOpen(false);
          }}
        />
      )}
    </section>
  );
}

function CompanyClients({
  owner,
  company,
}: Readonly<{
  owner: ClientWorkspaceOwner;
  company: { id: string; displayName: string };
}>) {
  const directoryCopy = useClientDirectoryCopy();
  const { message } = useClarteClientCopy();
  const { list, access, dossier, attachment } = owner;
  if (list.status === 'loading')
    return <ClarteLoadingState label={directoryCopy.loading} />;
  if (list.status !== 'ready')
    return list.status === 'forbidden' ? (
      <ClarteErrorState title={directoryCopy.permissionDenied} />
    ) : (
      <ClarteErrorState
        title={directoryCopy.retryableError}
        action={
          <ClarteButton onClick={() => void owner.reloadClients(company.id)}>
            {message('retry')}
          </ClarteButton>
        }
      />
    );
  if (list.clients.length === 0)
    return (
      <ClarteEmptyState title={directoryCopy.empty(company.displayName)} />
    );
  return (
    <ClarteClientList
      clients={list.clients}
      companyName={company.displayName}
      onOpenDossier={access.canReadClientDossiers ? dossier.open : undefined}
      attachingClientId={attachment.attachingClientId}
    />
  );
}

function SearchResults({
  owner,
  company,
}: Readonly<{
  owner: ClientWorkspaceOwner;
  company: { id: string; displayName: string };
}>) {
  const directoryCopy = useClientDirectoryCopy();
  const { search, access, dossier, attachment } = owner;
  const state = search.state;
  if (state.status === 'submitting')
    return <ClarteLoadingState label={directoryCopy.searching} />;
  if (state.status !== 'ready')
    return state.status === 'forbidden' ? (
      <ClarteErrorState title={directoryCopy.permissionDenied} />
    ) : state.status === 'error' ? (
      <ClarteErrorState title={directoryCopy.retryableError} />
    ) : null;
  if (state.clients.length === 0)
    return <ClarteEmptyState title={directoryCopy.noSearchResults} />;
  return (
    <section
      className="clarte-clients-results"
      aria-labelledby="clarte-clients-results-title"
    >
      <h3 id="clarte-clients-results-title">
        {directoryCopy.searchResultsTitle}
      </h3>
      <ClarteClientList
        clients={state.clients}
        companyName={company.displayName}
        onOpenDossier={access.canReadClientDossiers ? dossier.open : undefined}
        onAttach={
          access.canAttachClients
            ? (id) => void attachment.attach(id)
            : undefined
        }
        attachingClientId={attachment.attachingClientId}
      />
    </section>
  );
}

/** The registration outcome, shown once: in the panel while it is open. */
function RegistrationFeedback({
  owner,
  copy,
}: Readonly<{
  owner: ClientWorkspaceOwner;
  copy: ReturnType<typeof useClientRegistrationCopy>;
}>): ReactNode {
  const state = owner.registration.state;
  switch (state.status) {
    case 'idle':
      return null;
    case 'submitting':
      return (
        <ClarteNotice tone="pending" role="status">
          {copy.creating}
        </ClarteNotice>
      );
    case 'success':
      return (
        <ClarteNotice tone="success" role="status">
          {copy.created}
        </ClarteNotice>
      );
    case 'validation':
      return (
        <ClarteNotice id="client-create-validation" tone="danger" role="alert">
          {copy.validation(state.issue)}
        </ClarteNotice>
      );
    case 'forbidden':
      return (
        <ClarteNotice tone="danger" role="alert">
          {copy.permissionDenied}
        </ClarteNotice>
      );
    case 'error':
      return (
        <ClarteNotice tone="danger" role="alert">
          {copy.createRetry}
        </ClarteNotice>
      );
    case 'possibleDuplicate':
      return (
        <ClarteNotice tone="danger" role="alert">
          {copy.possibleDuplicate}
        </ClarteNotice>
      );
    default: {
      const unhandled: never = state;
      return unhandled;
    }
  }
}
