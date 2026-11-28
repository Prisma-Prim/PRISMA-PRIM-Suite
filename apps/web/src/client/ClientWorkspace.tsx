import { useEffect, useRef, useState } from 'react';
import { ClientDossierPanel } from './ClientDossierPanel';
import { ClientUnionPanel } from './ClientUnionPanel';
import { useClientUnionConfirmationCopy } from './client-union-confirmation.copy';
import { ClientDuplicateReviewPanel } from './ClientDuplicateReviewPanel';
import { ClientContactEditor } from './ClientContactEditor';
import { useClientRegistrationCopy } from './client-registration.copy';
import { useClientDirectoryCopy } from './client-directory.copy';
import { ClientDirectory } from './ClientDirectory';
import { ClientDirectoryFeedback } from './ClientDirectoryFeedback';
import {
  useClientWorkspace,
  type ClientWorkspaceProps,
} from './use-client-workspace';
import './client-directory.css';

export function ClientWorkspace(props: ClientWorkspaceProps) {
  const {
    actor,
    identity,
    onCompanyContextRejected,
    onActorRevalidated = () => undefined,
    onWorkspaceAccessRejected = () => undefined,
    onActivityRecorded,
    onOpenProjects,
    onOpenDocuments,
    onOpenRequests,
    renderCommercialWork,
    renderMissionWork,
    renderDocumentWork,
  } = props;
  const directoryCopy = useClientDirectoryCopy();
  const copy = useClientRegistrationCopy();
  const unionConfirmationCopy = useClientUnionConfirmationCopy();
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const registrationTrigger = useRef<HTMLButtonElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (registrationOpen) nameInput.current?.focus();
  }, [registrationOpen]);
  const owner = useClientWorkspace(props);
  const {
    activeCompany,
    clientAuthority,
    captureRecovery,
    access: {
      canReadClients,
      canCreateClients,
      canReadClientDossiers,
      canCreateEnrichedClients,
      canUpdateClients,
      canResolveDuplicateClients,
      canAttachClients,
    },
    list: listState,
    registration,
    search,
    attachment: { attachingClientId, attach: attachClient },
    dossier,
    duplicateReview,
    union,
  } = owner;
  const createState = registration.state;
  const searchState = search.state;
  const selectedClientId = dossier.selectedClientId;
  const confirmedUnionClientId = union.confirmedClientId;

  if (!canReadClients) {
    return (
      <section className="client-workspace">
        <ClientDirectoryFeedback role="alert" tone="error">
          {directoryCopy.permissionDenied}
        </ClientDirectoryFeedback>
      </section>
    );
  }
  if (!activeCompany) {
    return (
      <section className="client-workspace">
        <ClientDirectoryFeedback>
          {directoryCopy.missingCompany}
        </ClientDirectoryFeedback>
      </section>
    );
  }

  const activeCompanyId = activeCompany.id;

  return (
    <section
      id="clients"
      tabIndex={-1}
      className="client-workspace"
      aria-labelledby="client-workspace-title"
    >
      <div className="client-directory-heading">
        <div className="client-directory-context">
          <p className="eyebrow">{directoryCopy.eyebrow}</p>
          <h2 id="client-workspace-title">{directoryCopy.title}</h2>
          <p>{directoryCopy.directoryCompany(activeCompany.displayName)}</p>
        </div>
        {canCreateClients && (
          <button
            ref={registrationTrigger}
            type="button"
            aria-expanded={registrationOpen}
            aria-controls="client-registration"
            onClick={() => {
              setRegistrationOpen((open) => !open);
            }}
          >
            {directoryCopy.newClient}
          </button>
        )}
      </div>
      {canCreateClients && (
        <div
          id="client-registration"
          className="client-registration"
          hidden={!registrationOpen}
        >
          <div className="client-registration-heading">
            <div>
              <h3>{copy.registrationTitle}</h3>
              <p>{copy.registrationHint}</p>
            </div>
            <button
              type="button"
              className="client-secondary-action"
              onClick={() => {
                setRegistrationOpen(false);
                registrationTrigger.current?.focus();
              }}
            >
              {copy.closeRegistration}
            </button>
          </div>
          <form
            onSubmit={(event) => void registration.submit(event)}
            noValidate
          >
            <label htmlFor="client-display-name">{copy.displayNameLabel}</label>
            <div>
              <input
                id="client-display-name"
                ref={nameInput}
                value={registration.draft.displayName}
                onChange={(event) =>
                  registration.change({ displayName: event.target.value })
                }
                aria-invalid={
                  createState.status === 'validation' &&
                  createState.field === 'displayName'
                }
                aria-describedby={
                  createState.status === 'validation' &&
                  createState.field === 'displayName'
                    ? 'client-create-validation'
                    : undefined
                }
              />
            </div>
            {canCreateEnrichedClients && (
              <div className="client-dossier-fields">
                <label htmlFor="client-tax-id">{copy.taxIdLabel}</label>
                <input
                  id="client-tax-id"
                  value={registration.draft.taxId}
                  onChange={(event) =>
                    registration.change({ taxId: event.target.value })
                  }
                />
                <label htmlFor="client-address">{copy.addressLabel}</label>
                <input
                  id="client-address"
                  value={registration.draft.address}
                  onChange={(event) =>
                    registration.change({ address: event.target.value })
                  }
                />
                <label htmlFor="client-telephone">{copy.telephoneLabel}</label>
                <input
                  id="client-telephone"
                  value={registration.draft.telephone}
                  onChange={(event) =>
                    registration.change({ telephone: event.target.value })
                  }
                />
                <label htmlFor="client-general-email">
                  {copy.generalEmailLabel}
                </label>
                <input
                  id="client-general-email"
                  type="email"
                  value={registration.draft.generalEmail}
                  onChange={(event) =>
                    registration.change({ generalEmail: event.target.value })
                  }
                />
                <label htmlFor="client-business-activity">
                  {copy.businessActivityLabel}
                </label>
                <input
                  id="client-business-activity"
                  value={registration.draft.businessActivity}
                  onChange={(event) =>
                    registration.change({
                      businessActivity: event.target.value,
                    })
                  }
                />
                <ClientContactEditor
                  contacts={registration.draft.contacts}
                  idPrefix="client-create-contact"
                  invalid={
                    createState.status === 'validation' &&
                    createState.field === 'contacts'
                  }
                  errorId="client-create-validation"
                  onChange={(contacts) => registration.change({ contacts })}
                />
              </div>
            )}
            <button
              type="submit"
              disabled={createState.status === 'submitting'}
            >
              {createState.status === 'submitting'
                ? copy.creating
                : copy.create}
            </button>
          </form>
        </div>
      )}
      {createState.status === 'submitting' && (
        <ClientDirectoryFeedback role="status" tone="pending">
          {copy.creating}
        </ClientDirectoryFeedback>
      )}
      {createState.status === 'success' && (
        <ClientDirectoryFeedback role="status" tone="success">
          {copy.created}
        </ClientDirectoryFeedback>
      )}
      {createState.status === 'validation' && (
        <ClientDirectoryFeedback
          id="client-create-validation"
          role="alert"
          tone="error"
        >
          {copy.validation(createState.issue)}
        </ClientDirectoryFeedback>
      )}
      {createState.status === 'forbidden' && (
        <ClientDirectoryFeedback role="alert" tone="error">
          {copy.permissionDenied}
        </ClientDirectoryFeedback>
      )}
      {createState.status === 'error' && (
        <ClientDirectoryFeedback role="alert" tone="error">
          {copy.createRetry}
        </ClientDirectoryFeedback>
      )}
      {createState.status === 'possibleDuplicate' && (
        <ClientDirectoryFeedback role="alert" tone="error">
          {copy.possibleDuplicate}
        </ClientDirectoryFeedback>
      )}
      <form
        className="client-directory-search"
        onSubmit={(event) => void search.submit(event)}
        noValidate
      >
        <label htmlFor="client-search">{directoryCopy.searchLabel}</label>
        <div>
          <input
            id="client-search"
            value={search.query}
            onChange={(event) => search.setQuery(event.target.value)}
            aria-invalid={searchState.status === 'validation'}
            aria-describedby={
              searchState.status === 'validation'
                ? 'client-search-validation'
                : 'client-search-hint'
            }
          />
          <button
            type="submit"
            disabled={
              searchState.status === 'submitting' ||
              attachingClientId !== undefined
            }
          >
            {searchState.status === 'submitting'
              ? directoryCopy.searching
              : directoryCopy.search}
          </button>
        </div>
        <p id="client-search-hint">
          {canAttachClients
            ? directoryCopy.workspaceSearchHint
            : directoryCopy.companySearchHint}{' '}
          {directoryCopy.searchLimitHint}
        </p>
      </form>
      {searchState.status !== 'idle' && (
        <button
          className="client-secondary-action client-directory-return"
          type="button"
          disabled={attachingClientId !== undefined}
          onClick={search.clear}
        >
          {directoryCopy.showCompanyClients}
        </button>
      )}
      {searchState.status === 'submitting' && (
        <ClientDirectoryFeedback role="status" tone="pending">
          {directoryCopy.searching}
        </ClientDirectoryFeedback>
      )}
      {searchState.status === 'validation' && (
        <ClientDirectoryFeedback
          id="client-search-validation"
          role="alert"
          tone="error"
        >
          {directoryCopy.searchRequired}
        </ClientDirectoryFeedback>
      )}
      {searchState.status === 'forbidden' && (
        <ClientDirectoryFeedback role="alert" tone="error">
          {directoryCopy.permissionDenied}
        </ClientDirectoryFeedback>
      )}
      {searchState.status === 'error' && (
        <ClientDirectoryFeedback role="alert" tone="error">
          {directoryCopy.retryableError}
        </ClientDirectoryFeedback>
      )}
      {searchState.status === 'ready' && searchState.clients.length === 0 && (
        <ClientDirectoryFeedback>
          {directoryCopy.noSearchResults}
        </ClientDirectoryFeedback>
      )}
      {searchState.status === 'ready' && searchState.clients.length > 0 && (
        <section aria-labelledby="client-search-results-title">
          <h3 id="client-search-results-title">
            {directoryCopy.searchResultsTitle}
          </h3>
          <ClientDirectory
            clients={searchState.clients}
            companyName={activeCompany.displayName}
            onOpenDossier={canReadClientDossiers ? dossier.open : undefined}
            onAttach={
              canAttachClients ? (id) => void attachClient(id) : undefined
            }
            attachingClientId={attachingClientId}
          />
        </section>
      )}
      {searchState.status === 'idle' && (
        <>
          {listState.status === 'loading' && (
            <ClientDirectoryFeedback role="status" tone="pending">
              {directoryCopy.loading}
            </ClientDirectoryFeedback>
          )}
          {listState.status === 'forbidden' && (
            <ClientDirectoryFeedback role="alert" tone="error">
              {directoryCopy.permissionDenied}
            </ClientDirectoryFeedback>
          )}
          {listState.status === 'error' && (
            <ClientDirectoryFeedback role="alert" tone="error">
              {directoryCopy.retryableError}
            </ClientDirectoryFeedback>
          )}
          {listState.status === 'ready' && listState.clients.length === 0 && (
            <ClientDirectoryFeedback>
              {directoryCopy.empty(activeCompany.displayName)}
            </ClientDirectoryFeedback>
          )}
          {listState.status === 'ready' && listState.clients.length > 0 && (
            <ClientDirectory
              clients={listState.clients}
              companyName={activeCompany.displayName}
              onOpenDossier={canReadClientDossiers ? dossier.open : undefined}
              attachingClientId={attachingClientId}
            />
          )}
        </>
      )}
      {canResolveDuplicateClients && (
        <ClientDuplicateReviewPanel
          key={`${actor.internalUserId}:${actor.workspaceId}:${actor.workspaceMembershipId}`}
          companyContextId={activeCompany.id}
          identity={identity}
          captureRecovery={captureRecovery}
          canAttach={canAttachClients}
          refreshKey={duplicateReview.refreshKey}
          authorityGeneration={clientAuthority}
          onCompanyContextRejected={onCompanyContextRejected}
          onWorkspaceAccessRejected={onWorkspaceAccessRejected}
          onActorRevalidated={onActorRevalidated}
          onActivityRecorded={onActivityRecorded}
          onClientsChanged={() => owner.reloadClients(activeCompany.id)}
        />
      )}
      {canReadClientDossiers &&
        confirmedUnionClientId !== undefined &&
        confirmedUnionClientId === selectedClientId && (
          <ClientDirectoryFeedback role="status" tone="success">
            {unionConfirmationCopy.saved}
          </ClientDirectoryFeedback>
        )}
      {canReadClientDossiers && (
        <ClientDossierPanel
          key={`${selectedClientId ?? ''}:${union.revision}`}
          clientAccountId={selectedClientId}
          onHeadingReady={dossier.receiveHeading}
          onOpenProjects={onOpenProjects}
          onOpenDocuments={onOpenDocuments}
          onOpenRequests={onOpenRequests}
          renderCommercialWork={renderCommercialWork}
          renderMissionWork={renderMissionWork}
          renderDocumentWork={renderDocumentWork}
          companyContextId={activeCompany.id}
          canUpdate={canUpdateClients}
          identity={identity}
          captureRecovery={captureRecovery}
          onCompanyContextRejected={onCompanyContextRejected}
          onWorkspaceAccessRejected={onWorkspaceAccessRejected}
          onActorRevalidated={onActorRevalidated}
          onActivityRecorded={onActivityRecorded}
          onClientsChanged={() => owner.reloadClients(activeCompany.id)}
          onDuplicateReviewRequired={duplicateReview.request}
        />
      )}
      {canReadClientDossiers && (
        <ClientUnionPanel
          key={`${actor.workspaceMembershipId}:${activeCompany.id}:${selectedClientId}:${clientAuthority}`}
          clientId={selectedClientId}
          companyContextId={activeCompany.id}
          identity={identity}
          captureRecovery={captureRecovery}
          canResolve={canResolveDuplicateClients}
          onConfirmed={union.confirm}
          onCompanyContextRejected={onCompanyContextRejected}
          onWorkspaceAccessRejected={onWorkspaceAccessRejected}
          onActorRevalidated={onActorRevalidated}
          onOpenCanonical={(canonicalClientId) =>
            void union.showOutcome(activeCompanyId, canonicalClientId)
          }
          onChanged={(canonicalClientId) =>
            union.changed(activeCompanyId, canonicalClientId)
          }
        />
      )}
    </section>
  );
}
