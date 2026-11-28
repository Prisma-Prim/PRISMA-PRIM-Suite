import {
  type FormEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  handleAuthenticatedAccessRejection,
  runLatestAuthenticatedRequest,
} from '../api/latest-authenticated-request';
import { useRequestLifetime } from '../api/use-actor-requests';
import {
  useScopedOperation,
  useScopedOperationGroup,
} from '../api/use-scoped-operation';
import { resolveRetryCommand, type RetryCommand } from './client-command';
import {
  contactDraft,
  normalizedContacts,
  type ClientContactDraft,
  type ClientContactValidationIssue,
} from './ClientContactEditor';
import {
  clientDossierValidationIssue,
  type ClientDossierValidationIssue,
} from './client-dossier.copy';
import {
  clientRegistrationValidationIssue,
  type ClientRegistrationValidationIssue,
} from './client-registration.copy';
import {
  readClientDossier,
  type ClientDossierView,
} from './client-dossier-response';

/** The correction draft of one dossier, as the member edits it. */
export interface ClientDossierDraft {
  displayName: string;
  taxId: string;
  address: string;
  telephone: string;
  generalEmail: string;
  contacts: ClientContactDraft[];
  businessActivity: string;
}

export type ClientDossierState =
  | { status: 'idle' | 'loading' | 'notFound' | 'forbidden' | 'error' }
  | { status: 'ready'; dossier: ClientDossierView };

export type ClientCorrectionState =
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

export type ClientCorrectionValidation = Extract<
  ClientCorrectionState,
  { status: 'validation' }
>;

/** What one dossier owner needs from the directory that selected it. */
export type ClientDossierOwnerProps = {
  clientAccountId: string | undefined;
  companyContextId: string;
  canUpdate: boolean;
  identity: BrowserIdentity;
  captureRecovery?: () => () => boolean;
  onCompanyContextRejected: (companyContextId: string) => void;
  onActorRevalidated?: (actor: ActorContext) => Promise<void> | void;
  onWorkspaceAccessRejected?: () => Promise<void> | void;
  onActivityRecorded: () => Promise<void>;
  onClientsChanged: () => Promise<void>;
  onDuplicateReviewRequired?: () => void;
  /**
   * Bumped after a union outcome: the dossier is read again from scratch, as
   * a newly selected one, and work under the previous identity is retired.
   */
  revision?: number;
};

/**
 * One Client dossier shared by both interfaces: its read, the correction
 * draft with the version it observed and its retry key, and the version a
 * confirmed legal-entity change reported. The server decides every
 * correction; this owner only keeps what the member typed and saw.
 */
export function useClientDossier({
  clientAccountId,
  companyContextId,
  canUpdate,
  identity,
  captureRecovery,
  onCompanyContextRejected,
  onActorRevalidated = () => undefined,
  onWorkspaceAccessRejected = () => undefined,
  onActivityRecorded,
  onClientsChanged,
  onDuplicateReviewRequired = () => undefined,
  revision = 0,
}: ClientDossierOwnerProps) {
  const [dossierState, setDossierState] = useState<ClientDossierState>({
    status: 'idle',
  });
  const [correctionState, setCorrectionState] = useState<ClientCorrectionState>(
    { status: 'idle' },
  );
  const [draft, setDraft] = useState<ClientDossierDraft>(emptyDraft());
  // A confirmed legal-entity change refreshes the displayed version only; the
  // correction draft keeps the version it observed.
  const [confirmedVersion, setConfirmedVersion] = useState(0);
  const draftEdited = useRef(false);
  const correctionRetryCommand = useRef<RetryCommand | undefined>(undefined);
  const requestScope = String(
    useRequestLifetime(
      identity,
      JSON.stringify([companyContextId, clientAccountId, canUpdate, revision]),
    ),
  );
  const dossierRead = useScopedOperation(requestScope);
  const correctionWork = useScopedOperationGroup(requestScope);
  const rejectCompanyContext = useRef(onCompanyContextRejected);
  const acceptRevalidatedActor = useRef(onActorRevalidated);
  const rejectWorkspaceAccess = useRef(onWorkspaceAccessRejected);
  useLayoutEffect(() => {
    rejectCompanyContext.current = onCompanyContextRejected;
    acceptRevalidatedActor.current = onActorRevalidated;
    rejectWorkspaceAccess.current = onWorkspaceAccessRejected;
  });

  const loadDossier = useCallback(
    async (selectedClientId: string): Promise<void> => {
      const requestSignal = dossierRead.begin();
      if (!requestSignal) return;
      const recoveryCurrent = captureRecovery?.();
      setDossierState({ status: 'loading' });
      setCorrectionState({ status: 'idle' });
      correctionRetryCommand.current = undefined;
      await runLatestAuthenticatedRequest({
        signal: requestSignal,
        identity,
        execute: (api, signal) =>
          api.request(`/clients/${encodeURIComponent(selectedClientId)}`, {
            companyContextId,
            signal,
          }),
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
            isCurrent: () => !signal.aborted && (recoveryCurrent?.() ?? true),
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
          const dossier = readClientDossier(result.value, {
            clientAccountId: selectedClientId,
          });
          draftEdited.current = false;
          setDraft(draftFrom(dossier));
          setDossierState({ status: 'ready', dossier });
        },
        onError: () => setDossierState({ status: 'error' }),
      });
    },
    [captureRecovery, companyContextId, dossierRead, identity],
  );

  useEffect(() => {
    correctionRetryCommand.current = undefined;
    setCorrectionState({ status: 'idle' });
    draftEdited.current = false;
    setDraft(emptyDraft());
    setConfirmedVersion(0);
    if (!clientAccountId) {
      setDossierState({ status: 'idle' });
      return;
    }
    void loadDossier(clientAccountId);
  }, [clientAccountId, companyContextId, loadDossier, revision]);

  async function correctDossier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canUpdate || dossierState.status !== 'ready') return;
    const correctionClientId = dossierState.dossier.id;
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
    if (correctionWork.isPending()) return;
    const operation = correctionWork.beginLatest();
    if (!operation) return;
    const recoveryCurrent = captureRecovery?.();
    correctionRetryCommand.current = command;
    setCorrectionState({ status: 'submitting' });

    await runLatestAuthenticatedRequest({
      signal: operation.signal,
      identity,
      execute: (api, signal) =>
        api.request(`/clients/${encodeURIComponent(correctionClientId)}`, {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': command.idempotencyKey,
          },
          companyContextId,
          body: command.serializedBody,
          signal,
        }),
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
          isCurrent: () => !signal.aborted && (recoveryCurrent?.() ?? true),
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
        const dossier = readClientDossier(result.value, {
          clientAccountId: correctionClientId,
        });
        correctionRetryCommand.current = undefined;
        draftEdited.current = false;
        setDraft(draftFrom(dossier));
        setDossierState({ status: 'ready', dossier });
        setCorrectionState({ status: 'success' });
        operation.release();
        void Promise.allSettled([
          Promise.resolve().then(() => {
            if (!signal.aborted) return onActivityRecorded();
          }),
          Promise.resolve().then(() => {
            if (!signal.aborted) return onClientsChanged();
          }),
        ]);
      },
      onError: () => setCorrectionState({ status: 'error' }),
      onSettled: operation.release,
    });
  }

  /**
   * Before the correction form opens: a new draft must observe fields and
   * their version together, so a dossier whose legal entities moved its
   * version rereads. Edited or uncertain commands keep their observation.
   */
  function prepareCorrection(dossier: ClientDossierView) {
    if (
      !draftEdited.current &&
      !correctionRetryCommand.current &&
      confirmedVersion > dossier.version
    )
      void loadDossier(dossier.id);
  }

  return {
    state: dossierState,
    reload: loadDossier,
    /** The newer of the read version and the one legal entities confirmed. */
    displayedVersion: (dossier: ClientDossierView) =>
      Math.max(dossier.version, confirmedVersion),
    confirmVersion: (version: number) =>
      setConfirmedVersion((current) => Math.max(current, version)),
    correction: {
      draft,
      state: correctionState,
      change: (nextDraft: ClientDossierDraft) => {
        draftEdited.current = true;
        setDraft(nextDraft);
      },
      prepare: prepareCorrection,
      submit: correctDossier,
    },
  };
}

export type ClientDossierOwner = ReturnType<typeof useClientDossier>;

function emptyDraft(): ClientDossierDraft {
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

function draftFrom(dossier: ClientDossierView): ClientDossierDraft {
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
