import {
  type FormEvent,
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
  ClientContactEditor,
  normalizedContacts,
  type ClientContact,
  type ClientContactDraft,
} from './ClientContactEditor';
import { clientWorkspaceCopy as copy } from './client-workspace.copy';

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
  | { status: 'validation'; message: string };

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
}) {
  const [dossierState, setDossierState] = useState<DossierState>({
    status: 'idle',
  });
  const [correctionState, setCorrectionState] = useState<CorrectionState>({
    status: 'idle',
  });
  const [draft, setDraft] = useState<DossierDraft>(emptyDraft());
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
    setDraft(emptyDraft());
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
        message: copy.displayNameRequired,
      });
      return;
    }
    const contacts = normalizedContacts(draft.contacts);
    if (!contacts) {
      setCorrectionState({
        status: 'validation',
        message: copy.contactsInvalid,
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
      contacts,
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
          setCorrectionState({
            status: 'validation',
            message: result.message ?? copy.correctionInvalid,
          });
          return;
        }
        if (result.status !== 'ok') {
          setCorrectionState({ status: 'error' });
          return;
        }
        correctionRetryCommand.current = undefined;
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
    return <p role="status">{copy.loadingDossier}</p>;
  }
  if (dossierState.status === 'notFound') {
    return <p role="alert">{copy.dossierNotFound}</p>;
  }
  if (dossierState.status === 'forbidden') {
    return <p role="alert">{copy.permissionDenied}</p>;
  }
  if (dossierState.status === 'error') {
    return <p role="alert">{copy.retryableError}</p>;
  }
  if (dossierState.status !== 'ready') return null;

  const dossier = dossierState.dossier;
  return (
    <section className="client-dossier" aria-labelledby="client-dossier-title">
      <div>
        <p className="eyebrow">{copy.dossierEyebrow}</p>
        <h3 id="client-dossier-title">{dossier.displayName}</h3>
        <p>{copy.version(dossier.version)}</p>
      </div>
      <dl>
        <DossierValue label={copy.taxIdLabel} value={dossier.taxId} />
        <DossierValue label={copy.addressLabel} value={dossier.address} />
        <DossierValue label={copy.telephoneLabel} value={dossier.telephone} />
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
      <section aria-labelledby="client-contacts-title">
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
              </li>
            ))}
          </ul>
        )}
      </section>
      {canUpdate && (
        <CorrectionForm
          draft={draft}
          pending={correctionState.status === 'submitting'}
          onDraftChange={setDraft}
          onSubmit={correctDossier}
        />
      )}
      {correctionState.status === 'validation' && (
        <p role="alert">{correctionState.message}</p>
      )}
      {correctionState.status === 'success' && (
        <p role="status">{copy.correctionSaved}</p>
      )}
      {correctionState.status === 'error' && (
        <p role="alert">{copy.correctionRetry}</p>
      )}
      {correctionState.status === 'possibleDuplicate' && (
        <p role="alert">{copy.possibleDuplicate}</p>
      )}
      {correctionState.status === 'stale' && (
        <div role="alert">
          <p>{copy.staleCorrection}</p>
          <button type="button" onClick={() => void loadDossier(dossier.id)}>
            {copy.reloadDossier}
          </button>
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
  onDraftChange,
  onSubmit,
}: {
  draft: DossierDraft;
  pending: boolean;
  onDraftChange: (draft: DossierDraft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const fields = [
    ['displayName', copy.displayNameLabel],
    ['taxId', copy.taxIdLabel],
    ['address', copy.addressLabel],
    ['telephone', copy.telephoneLabel],
    ['generalEmail', copy.generalEmailLabel],
    ['businessActivity', copy.businessActivityLabel],
  ] as const;
  return (
    <form aria-label={copy.correctionFormLabel} onSubmit={onSubmit} noValidate>
      {fields.map(([field, label]) => (
        <InputField
          key={field}
          id={`dossier-${field}`}
          label={label}
          type={field === 'generalEmail' ? 'email' : 'text'}
          value={draft[field]}
          onChange={(value) => onDraftChange({ ...draft, [field]: value })}
        />
      ))}
      <ClientContactEditor
        contacts={draft.contacts}
        idPrefix="dossier-contact"
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
  onChange,
}: {
  id: string;
  label: string;
  type: 'email' | 'text';
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
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
    contacts: dossier.contacts.map((contact) => ({
      name: contact.name,
      telephone: contact.telephone ?? '',
      email: contact.email ?? '',
    })),
    businessActivity: dossier.businessActivity ?? '',
  };
}

function nullableText(value: string): string | null {
  return value.trim() || null;
}
