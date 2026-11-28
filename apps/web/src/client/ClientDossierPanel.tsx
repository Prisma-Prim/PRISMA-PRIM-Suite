import {
  type FormEvent,
  type ReactNode,
  type Ref,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ClientContactDescription,
  ClientContactEditor,
} from './ClientContactEditor';
import { useClientDossierCopy } from './client-dossier.copy';
import { useClientContactEditorCopy } from './client-contact-editor.copy';
import { useClientRegistrationCopy } from './client-registration.copy';
import { ClientDirectoryFeedback } from './ClientDirectoryFeedback';
import { ClientCorrectionHistory } from './ClientCorrectionHistory';
import { ClientLegalEntities } from './ClientLegalEntities';
import {
  useClientDossier,
  type ClientCorrectionValidation,
  type ClientDossierDraft,
  type ClientDossierOwnerProps,
} from './use-client-dossier';
import type { ClientLinkTarget } from './use-client-workspace';
import './client-dossier.css';

export function ClientDossierPanel(
  props: ClientDossierOwnerProps & {
    onHeadingReady?: (heading: HTMLHeadingElement | null) => void;
    onOpenProjects?: (client: ClientLinkTarget) => void;
    onOpenDocuments?: (client: ClientLinkTarget) => void;
    onOpenRequests?: (client: ClientLinkTarget) => void;
    renderCommercialWork?: (clientDossierId: string) => ReactNode;
    renderMissionWork?: (clientDossierId: string) => ReactNode;
    renderDocumentWork?: (clientDossierId: string) => ReactNode;
  },
) {
  const {
    clientAccountId,
    companyContextId,
    canUpdate,
    identity,
    captureRecovery,
    onCompanyContextRejected,
    onActorRevalidated = () => undefined,
    onWorkspaceAccessRejected = () => undefined,
    onActivityRecorded,
    onHeadingReady,
    onOpenProjects,
    onOpenDocuments,
    onOpenRequests,
    renderCommercialWork,
    renderMissionWork,
    renderDocumentWork,
  } = props;
  const copy = useClientDossierCopy();
  const contactCopy = useClientContactEditorCopy();
  const sharedClientCopy = useClientRegistrationCopy();
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const correctionTrigger = useRef<HTMLButtonElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const owner = useClientDossier(props);
  const dossierState = owner.state;
  const correctionState = owner.correction.state;
  const draft = owner.correction.draft;
  useEffect(() => {
    if (correctionOpen) nameInput.current?.focus();
  }, [correctionOpen, dossierState.status]);
  useEffect(() => {
    setCorrectionOpen(false);
  }, [clientAccountId, companyContextId, owner.reload]);

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
  const displayedVersion = owner.displayedVersion(dossier);
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
            onClick={() => void owner.reload(dossier.id)}
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
        {canUpdate && (
          <button
            type="button"
            ref={correctionTrigger}
            aria-expanded={correctionOpen}
            aria-controls="client-correction"
            onClick={() => {
              if (!correctionOpen) owner.correction.prepare(dossier);
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
      {!correctionOpen && correctionFeedback}
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
      {renderCommercialWork?.(dossier.id)}
      {renderMissionWork?.(dossier.id)}
      {renderDocumentWork?.(dossier.id)}
      <ClientLegalEntities
        key={dossier.id}
        clientAccountId={dossier.id}
        dossierVersion={dossier.version}
        companyContextId={companyContextId}
        canUpdate={canUpdate}
        identity={identity}
        captureRecovery={captureRecovery}
        onCompanyContextRejected={onCompanyContextRejected}
        onActorRevalidated={onActorRevalidated}
        onWorkspaceAccessRejected={onWorkspaceAccessRejected}
        onClientVersionChanged={owner.confirmVersion}
        onActivityRecorded={onActivityRecorded}
      />
      <ClientCorrectionHistory
        clientAccountId={dossier.id}
        dossierVersion={dossier.version}
        companyContextId={companyContextId}
        identity={identity}
        captureRecovery={captureRecovery}
        onCompanyContextRejected={onCompanyContextRejected}
        onActorRevalidated={onActorRevalidated}
        onWorkspaceAccessRejected={onWorkspaceAccessRejected}
      />
      {correctionOpen && correctionFeedback}
      {canUpdate && (
        <div
          id="client-correction"
          className="client-correction"
          hidden={!correctionOpen}
        >
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
          <CorrectionForm
            draft={draft}
            pending={correctionState.status === 'submitting'}
            validation={
              correctionState.status === 'validation'
                ? correctionState
                : undefined
            }
            nameInput={nameInput}
            onDraftChange={owner.correction.change}
            onSubmit={(event) => void owner.correction.submit(event)}
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
  draft: ClientDossierDraft;
  pending: boolean;
  validation: ClientCorrectionValidation | undefined;
  nameInput: Ref<HTMLInputElement>;
  onDraftChange: (draft: ClientDossierDraft) => void;
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
