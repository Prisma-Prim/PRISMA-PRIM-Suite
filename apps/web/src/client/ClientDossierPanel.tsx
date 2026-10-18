import {
  type FormEvent,
  type Ref,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  handleAuthenticatedAccessRejection,
  runLatestAuthenticatedRequest,
} from '../api/latest-authenticated-request';
import { resolveRetryCommand, type RetryCommand } from './client-command';
import {
  ClientContactDescription,
  ClientContactEditor,
  contactDraft,
  normalizedContacts,
  type ClientContact,
  type ClientContactDraft,
  type ClientContactValidationIssue,
} from './ClientContactEditor';
import {
  clientDossierValidationIssue,
  useClientDossierCopy,
  type ClientDossierValidationIssue,
} from './client-dossier.copy';
import { useClientContactEditorCopy } from './client-contact-editor.copy';
import {
  clientRegistrationValidationIssue,
  useClientRegistrationCopy,
  type ClientRegistrationValidationIssue,
} from './client-registration.copy';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import { ClientDirectoryFeedback } from './ClientDirectoryFeedback';
import { ClientCorrectionHistory } from './ClientCorrectionHistory';
import { ClientLegalEntities } from './ClientLegalEntities';
import './client-dossier.css';

interface ClientDossierView {
  id: string;
  displayName: string;
  relatedToActiveCompany: boolean;
  taxId: string | null;
  address: string | null;
  telephone: string | null;
  generalEmail: string | null;
  contacts: ClientContact[];
  businessActivity: string | null;
  version: number;
  involvedCompanyDisplayNames: string[];
}

interface DossierDraft {
  displayName: string;
  taxId: string;
  address: string;
  telephone: string;
  generalEmail: string;
  contacts: ClientContactDraft[];
  businessActivity: string;
}

type DossierState =
  | { status: 'idle' | 'loading' | 'notFound' | 'forbidden' | 'error' }
  | { status: 'ready'; dossier: ClientDossierView };

type CorrectionState =
  | {
      status:
        | 'idle'
        | 'submitting'
        | 'success'
        | 'stale'
        | 'possibleDuplicate'
        | 'error';
    }
  | {
      status: 'validation';
      source: 'localContact';
      issue: ClientContactValidationIssue;
      field: 'contacts';
    }
  | {
      status: 'validation';
      source: 'sharedClient';
      issue: ClientRegistrationValidationIssue;
      field?: undefined;
    }
  | {
      status: 'validation';
      source: 'dossier';
      issue: ClientDossierValidationIssue;
      field?: 'displayName';
    };

export function ClientDossierPanel({
  clientAccountId,
  companyContextId,
  canUpdate,
  identity,
  onCompanyContextRejected,
  onActorRevalidated = () => undefined,
  onWorkspaceAccessRejected = () => undefined,
  onActivityRecorded,
  onClientsChanged,
  onDuplicateReviewRequired = () => undefined,
  onHeadingReady,
  onOpenProjects,
  onOpenDocuments,
  onOpenRequests,
}: {
  clientAccountId: string | undefined;
  companyContextId: string;
  canUpdate: boolean;
  identity: BrowserIdentity;
  onCompanyContextRejected: (companyContextId: string) => void;
  onActorRevalidated?: (actor: ActorContext) => Promise<void> | void;
  onWorkspaceAccessRejected?: () => Promise<void> | void;
  onActivityRecorded: () => Promise<void>;
  onClientsChanged: () => Promise<void>;
  onDuplicateReviewRequired?: () => void;
  onHeadingReady?: (heading: HTMLHeadingElement | null) => void;
  onOpenProjects?: (client: { id: string; displayName: string }) => void;
  onOpenDocuments?: (client: { id: string; displayName: string }) => void;
  onOpenRequests?: (client: { id: string; displayName: string }) => void;
}) {
  const isPrisme = useContext(ApplicationPresentation) === 'prisme';
  const copy = useClientDossierCopy();
  const contactCopy = useClientContactEditorCopy();
  const sharedClientCopy = useClientRegistrationCopy();
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const correctionTrigger = useRef<HTMLButtonElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const [dossierState, setDossierState] = useState<DossierState>({
    status: 'idle',
  });
  useEffect(() => {
    if (correctionOpen) nameInput.current?.focus();
  }, [correctionOpen, dossierState.status]);
  const [correctionState, setCorrectionState] = useState<CorrectionState>({
    status: 'idle',
  });
  const [draft, setDraft] = useState<DossierDraft>(emptyDraft());
  // A confirmed legal-entity change refreshes the displayed version only; the
  // correction draft keeps the version it observed.
  const [confirmedVersion, setConfirmedVersion] = useState(0);
  const draftEdited = useRef(false);
  const correctionRetryCommand = useRef<RetryCommand | undefined>(undefined);
  const pendingDossier = useRef<AbortController | undefined>(undefined);
  const pendingCorrection = useRef<AbortController | undefined>(undefined);
  const rejectCompanyContext = useRef(onCompanyContextRejected);
  rejectCompanyContext.current = onCompanyContextRejected;
  const acceptRevalidatedActor = useRef(onActorRevalidated);
  acceptRevalidatedActor.current = onActorRevalidated;
  const rejectWorkspaceAccess = useRef(onWorkspaceAccessRejected);
  rejectWorkspaceAccess.current = onWorkspaceAccessRejected;

  const loadDossier = useCallback(
    async (selectedClientId: string): Promise<void> => {
      setDossierState({ status: 'loading' });
      setCorrectionState({ status: 'idle' });
      correctionRetryCommand.current = undefined;
      await runLatestAuthenticatedRequest({
        pending: pendingDossier,
        identity,
        execute: (api, signal) =>
          api.request<ClientDossierView>(
            `/clients/${encodeURIComponent(selectedClientId)}`,
            { companyContextId, signal },
          ),
        async onResult(result, signal) {
          if (signal.aborted) return;
          const rejection = await handleAuthenticatedAccessRejection({
            result,
            identity,
            companyContextId,
            onCompanyContextRejected: (rejectedCompanyId) =>
              rejectCompanyContext.current(rejectedCompanyId),
            onActorRevalidated: (revalidatedActor) =>
              acceptRevalidatedActor.current(revalidatedActor),
            onWorkspaceAccessRejected: () => rejectWorkspaceAccess.current(),
            signal,
          });
          if (signal.aborted) return;
          if (rejection) {
            setDossierState({ status: 'forbidden' });
            return;
          }
          if (result.status === 'notFound') {
            setDossierState({ status: 'notFound' });
            return;
          }
          if (result.status !== 'ok') {
            setDossierState({ status: 'error' });
            return;
          }
          draftEdited.current = false;
          setDraft(draftFrom(result.value));
          setDossierState({ status: 'ready', dossier: result.value });
        },
        onError: () => setDossierState({ status: 'error' }),
      });
    },
    [companyContextId, identity],
  );

  useEffect(() => {
    pendingDossier.current?.abort();
    pendingCorrection.current?.abort();
    correctionRetryCommand.current = undefined;
    setCorrectionState({ status: 'idle' });
    setCorrectionOpen(false);
    draftEdited.current = false;
    setDraft(emptyDraft());
    setConfirmedVersion(0);
    if (!clientAccountId) {
      setDossierState({ status: 'idle' });
      return;
    }
    void loadDossier(clientAccountId);
    return () => {
      pendingDossier.current?.abort();
      pendingCorrection.current?.abort();
    };
  }, [clientAccountId, companyContextId, loadDossier]);

  async function correctDossier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canUpdate || dossierState.status !== 'ready') return;
    if (!draft.displayName.trim()) {
      setCorrectionState({
        status: 'validation',
        source: 'dossier',
        issue: 'displayNameRequired',
        field: 'displayName',
      });
      return;
    }
    const contacts = normalizedContacts(draft.contacts);
    if (contacts.status === 'invalid') {
      setCorrectionState({
        status: 'validation',
        source: 'localContact',
        issue: contacts.issue,
        field: 'contacts',
      });
      return;
    }
    const serializedBody = JSON.stringify({
      expectedVersion: dossierState.dossier.version,
      displayName: draft.displayName.trim(),
      taxId: nullableText(draft.taxId),
      address: nullableText(draft.address),
      telephone: nullableText(draft.telephone),
      generalEmail: nullableText(draft.generalEmail),
      contacts: contacts.contacts,
      businessActivity: nullableText(draft.businessActivity),
    });
    const command = resolveRetryCommand(
      serializedBody,
      correctionRetryCommand.current,
    );
    correctionRetryCommand.current = command;
    setCorrectionState({ status: 'submitting' });

    await runLatestAuthenticatedRequest({
      pending: pendingCorrection,
      identity,
      execute: (api, signal) =>
        api.request<ClientDossierView>(
          `/clients/${encodeURIComponent(dossierState.dossier.id)}`,
          {
            method: 'PATCH',
            headers: {
              'content-type': 'application/json',
              'idempotency-key': command.idempotencyKey,
            },
            companyContextId,
            body: command.serializedBody,
            signal,
          },
        ),
      async onResult(result, signal) {
        if (signal.aborted) return;
        const rejection = await handleAuthenticatedAccessRejection({
          result,
          identity,
          companyContextId,
          onCompanyContextRejected: (rejectedCompanyId) =>
            rejectCompanyContext.current(rejectedCompanyId),
          onActorRevalidated: (revalidatedActor) =>
            acceptRevalidatedActor.current(revalidatedActor),
          onWorkspaceAccessRejected: () => rejectWorkspaceAccess.current(),
          signal,
        });
        if (signal.aborted) return;
        if (rejection) {
          setDossierState({ status: 'forbidden' });
          return;
        }
        if (result.status === 'conflict') {
          if (result.reason === 'possibleDuplicateReviewRequired') {
            setCorrectionState({ status: 'possibleDuplicate' });
            onDuplicateReviewRequired();
          } else {
            correctionRetryCommand.current = undefined;
            setCorrectionState({ status: 'stale' });
          }
          return;
        }
        if (result.status === 'notFound') {
          correctionRetryCommand.current = undefined;
          setDossierState({ status: 'notFound' });
          return;
        }
        if (result.status === 'validation') {
          const dossierIssue = clientDossierValidationIssue(result.message);
          const sharedIssue =
            result.message === undefined
              ? 'registrationInvalid'
              : clientRegistrationValidationIssue(result.message);
          setCorrectionState(
            dossierIssue !== undefined || sharedIssue === 'registrationInvalid'
              ? {
                  status: 'validation',
                  source: 'dossier',
                  issue: dossierIssue ?? 'correctionInvalid',
                }
              : {
                  status: 'validation',
                  source: 'sharedClient',
                  issue: sharedIssue,
                },
          );
          return;
        }
        if (result.status !== 'ok') {
          setCorrectionState({ status: 'error' });
          return;
        }
        correctionRetryCommand.current = undefined;
        draftEdited.current = false;
        setDraft(draftFrom(result.value));
        setDossierState({ status: 'ready', dossier: result.value });
        setCorrectionState({ status: 'success' });
        void onActivityRecorded();
        await onClientsChanged();
      },
      onError: () => setCorrectionState({ status: 'error' }),
    });
  }

  if (dossierState.status === 'idle') return null;
  if (dossierState.status === 'loading') {
    return (
      <ClientDirectoryFeedback role="status" tone="pending">
        {copy.loadingDossier}
      </ClientDirectoryFeedback>
    );
  }
  if (dossierState.status === 'notFound') {
    return (
      <ClientDirectoryFeedback role="alert" tone="error">
        {copy.dossierNotFound}
      </ClientDirectoryFeedback>
    );
  }
  if (dossierState.status === 'forbidden') {
    return (
      <ClientDirectoryFeedback role="alert" tone="error">
        {copy.permissionDenied}
      </ClientDirectoryFeedback>
    );
  }
  if (dossierState.status === 'error') {
    return (
      <ClientDirectoryFeedback role="alert" tone="error">
        {copy.dossierLoadError}
      </ClientDirectoryFeedback>
    );
  }
  if (dossierState.status !== 'ready') return null;

  const dossier = dossierState.dossier;
  const displayedVersion = Math.max(dossier.version, confirmedVersion);
  const correctionFeedback = (
    <div key="correction-feedback" className="client-correction-feedback">
      {correctionState.status === 'submitting' && (
        <ClientDirectoryFeedback role="status" tone="pending">
          {copy.savingCorrection}
        </ClientDirectoryFeedback>
      )}
      {correctionState.status === 'validation' && (
        <ClientDirectoryFeedback
          id="client-correction-validation"
          role="alert"
          tone="error"
        >
          {correctionState.source === 'localContact'
            ? contactCopy.validation(correctionState.issue)
            : correctionState.source === 'sharedClient'
              ? sharedClientCopy.validation(correctionState.issue)
              : copy[correctionState.issue]}
        </ClientDirectoryFeedback>
      )}
      {correctionState.status === 'success' && (
        <ClientDirectoryFeedback role="status" tone="success">
          {copy.correctionSaved}
        </ClientDirectoryFeedback>
      )}
      {correctionState.status === 'error' && (
        <ClientDirectoryFeedback role="alert" tone="error">
          {copy.correctionRetry}
        </ClientDirectoryFeedback>
      )}
      {correctionState.status === 'possibleDuplicate' && (
        <ClientDirectoryFeedback role="alert" tone="error">
          {copy.possibleDuplicate}
        </ClientDirectoryFeedback>
      )}
      {correctionState.status === 'stale' && (
        <div className="client-correction-stale">
          <ClientDirectoryFeedback role="alert" tone="error">
            {copy.staleCorrection}
          </ClientDirectoryFeedback>
          <p>{copy.reloadCorrectionHint}</p>
          <button
            type="button"
            className="client-secondary-action"
            onClick={() => void loadDossier(dossier.id)}
          >
            {copy.reloadDossier}
          </button>
        </div>
      )}
    </div>
  );
  return (
    <section
      className="client-dossier client-dossier-detail"
      aria-labelledby="client-dossier-title"
    >
      <div className="client-dossier-heading">
        <div>
          <p className="eyebrow">{copy.dossierEyebrow}</p>
          <h3 id="client-dossier-title" tabIndex={-1} ref={onHeadingReady}>
            {dossier.displayName}
          </h3>
          <p className="client-dossier-version">
            {copy.version(displayedVersion)}
          </p>
        </div>
        {isPrisme && canUpdate && (
          <button
            type="button"
            ref={correctionTrigger}
            aria-expanded={correctionOpen}
            aria-controls="client-correction"
            onClick={() => {
              if (
                !correctionOpen &&
                !draftEdited.current &&
                !correctionRetryCommand.current &&
                confirmedVersion > dossier.version
              ) {
                // A new draft must observe fields and their version together.
                // Edited or uncertain commands retain their original observation.
                void loadDossier(dossier.id);
              }
              setCorrectionOpen((open) => !open);
            }}
          >
            {copy.correctionFormLabel}
          </button>
        )}
      </div>
      {onOpenProjects && (
        <button
          type="button"
          className="client-secondary-action"
          onClick={() =>
            onOpenProjects({ id: dossier.id, displayName: dossier.displayName })
          }
        >
          {copy.openProjects}
        </button>
      )}
      {onOpenDocuments && (
        <button
          type="button"
          className="client-secondary-action"
          onClick={() =>
            onOpenDocuments({
              id: dossier.id,
              displayName: dossier.displayName,
            })
          }
        >
          {copy.openDocuments}
        </button>
      )}
      {onOpenRequests && (
        <button
          type="button"
          className="client-secondary-action"
          onClick={() =>
            onOpenRequests({
              id: dossier.id,
              displayName: dossier.displayName,
            })
          }
        >
          {copy.openRequests}
        </button>
      )}
      {isPrisme && !correctionOpen && correctionFeedback}
      <div className="client-dossier-reading">
        <section
          aria-labelledby="client-details-title"
          className="client-dossier-information"
        >
          <h4 id="client-details-title">{copy.sharedDetails}</h4>
          <dl>
            <DossierValue label={copy.taxIdLabel} value={dossier.taxId} />
            <DossierValue label={copy.addressLabel} value={dossier.address} />
            <DossierValue
              label={copy.telephoneLabel}
              value={dossier.telephone}
            />
            <DossierValue
              label={copy.generalEmailLabel}
              value={dossier.generalEmail}
            />
            <DossierValue
              label={copy.businessActivityLabel}
              value={dossier.businessActivity}
            />
            <DossierValue
              label={copy.involvedCompaniesLabel}
              value={dossier.involvedCompanyDisplayNames.join(', ')}
            />
          </dl>
        </section>
        <section
          aria-labelledby="client-contacts-title"
          className="client-dossier-contacts"
        >
          <h4 id="client-contacts-title">{copy.contactsLabel}</h4>
          {dossier.contacts.length === 0 ? (
            <p>{copy.noContacts}</p>
          ) : (
            <ul>
              {dossier.contacts.map((contact, index) => (
                <li key={`${contact.name}-${index}`}>
                  <strong>{contact.name}</strong>
                  {contact.telephone && <span>{contact.telephone}</span>}
                  {contact.email && <span>{contact.email}</span>}
                  <ClientContactDescription contact={contact} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <ClientLegalEntities
        key={dossier.id}
        clientAccountId={dossier.id}
        dossierVersion={dossier.version}
        companyContextId={companyContextId}
        canUpdate={canUpdate}
        identity={identity}
        onCompanyContextRejected={onCompanyContextRejected}
        onActorRevalidated={onActorRevalidated}
        onWorkspaceAccessRejected={onWorkspaceAccessRejected}
        onClientVersionChanged={(version) =>
          setConfirmedVersion((current) => Math.max(current, version))
        }
        onActivityRecorded={onActivityRecorded}
      />
      <ClientCorrectionHistory
        clientAccountId={dossier.id}
        dossierVersion={dossier.version}
        companyContextId={companyContextId}
        identity={identity}
        onCompanyContextRejected={onCompanyContextRejected}
        onActorRevalidated={onActorRevalidated}
        onWorkspaceAccessRejected={onWorkspaceAccessRejected}
      />
      {(!isPrisme || correctionOpen) && correctionFeedback}
      {canUpdate && (
        <div
          id="client-correction"
          className="client-correction"
          hidden={isPrisme && !correctionOpen}
        >
          {isPrisme && (
            <div className="client-correction-heading">
              <div>
                <h4>{copy.correctionFormLabel}</h4>
                <p>{copy.correctionHint}</p>
              </div>
              <button
                type="button"
                className="client-secondary-action"
                onClick={() => {
                  setCorrectionOpen(false);
                  correctionTrigger.current?.focus();
                }}
              >
                {copy.closeCorrection}
              </button>
            </div>
          )}
          <CorrectionForm
            draft={draft}
            pending={correctionState.status === 'submitting'}
            validation={
              correctionState.status === 'validation'
                ? correctionState
                : undefined
            }
            nameInput={nameInput}
            onDraftChange={(nextDraft) => {
              draftEdited.current = true;
              setDraft(nextDraft);
            }}
            onSubmit={correctDossier}
          />
        </div>
      )}
    </section>
  );
}

function DossierValue({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  const copy = useClientDossierCopy();
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value ?? copy.notProvided}</dd>
    </div>
  );
}

function CorrectionForm({
  draft,
  pending,
  validation,
  nameInput,
  onDraftChange,
  onSubmit,
}: {
  draft: DossierDraft;
  pending: boolean;
  validation: Extract<CorrectionState, { status: 'validation' }> | undefined;
  nameInput: Ref<HTMLInputElement>;
  onDraftChange: (draft: DossierDraft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const copy = useClientDossierCopy();
  const fields = [
    ['displayName', copy.displayNameLabel],
    ['taxId', copy.taxIdLabel],
    ['address', copy.addressLabel],
    ['telephone', copy.telephoneLabel],
    ['generalEmail', copy.generalEmailLabel],
    ['businessActivity', copy.businessActivityLabel],
  ] as const;
  return (
    <form
      aria-label={copy.correctionFormLabel}
      aria-describedby={validation ? 'client-correction-validation' : undefined}
      onSubmit={onSubmit}
      noValidate
    >
      {fields.map(([field, label]) => (
        <InputField
          key={field}
          id={`dossier-${field}`}
          label={label}
          type={field === 'generalEmail' ? 'email' : 'text'}
          value={draft[field]}
          inputRef={field === 'displayName' ? nameInput : undefined}
          invalid={
            validation?.field === 'displayName' && field === 'displayName'
          }
          onChange={(value) => onDraftChange({ ...draft, [field]: value })}
        />
      ))}
      <ClientContactEditor
        contacts={draft.contacts}
        idPrefix="dossier-contact"
        invalid={validation?.field === 'contacts'}
        errorId="client-correction-validation"
        onChange={(contacts) => onDraftChange({ ...draft, contacts })}
      />
      <button type="submit" disabled={pending}>
        {pending ? copy.savingCorrection : copy.saveCorrection}
      </button>
    </form>
  );
}

function InputField({
  id,
  label,
  type,
  value,
  inputRef,
  invalid,
  onChange,
}: {
  id: string;
  label: string;
  type: 'email' | 'text';
  value: string;
  inputRef: Ref<HTMLInputElement> | undefined;
  invalid: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        ref={inputRef}
        aria-invalid={invalid}
        aria-describedby={invalid ? 'client-correction-validation' : undefined}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </>
  );
}

function emptyDraft(): DossierDraft {
  return {
    displayName: '',
    taxId: '',
    address: '',
    telephone: '',
    generalEmail: '',
    contacts: [],
    businessActivity: '',
  };
}

function draftFrom(dossier: ClientDossierView): DossierDraft {
  return {
    displayName: dossier.displayName,
    taxId: dossier.taxId ?? '',
    address: dossier.address ?? '',
    telephone: dossier.telephone ?? '',
    generalEmail: dossier.generalEmail ?? '',
    contacts: dossier.contacts.map(contactDraft),
    businessActivity: dossier.businessActivity ?? '',
  };
}

function nullableText(value: string): string | null {
  return value.trim() || null;
}
