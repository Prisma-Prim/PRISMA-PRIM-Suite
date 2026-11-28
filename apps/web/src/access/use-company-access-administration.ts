import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
import {
  useScopedOperation,
  useScopedOperationGroup,
} from '../api/use-scoped-operation';
import { ASSIGNMENT_PATHS, type AssignmentBundle } from './assignment-bundles';
import {
  type CompanyAccessAdministration,
  companyAccessAdministrationResponse,
} from './company-access-administration-response';
import { readCurrentActor } from './current-actor';
import { useWorkspaceRequestScope } from './use-workspace-request-scope';

export type AccessSubmission = 'grant' | 'revoke';
export type AdministrationLoadState =
  | { status: 'loading' }
  | { status: 'ready'; value: CompanyAccessAdministration }
  | { status: 'error' };
export type AccessMutationState =
  | { status: 'idle' }
  | { status: 'submitting'; submission: AccessSubmission }
  | { status: 'ready'; submission: AccessSubmission }
  // The server confirmed the command, but the administration read after it
  // failed. Only a later successful read concludes it.
  | { status: 'unrefreshed'; submission: AccessSubmission }
  | { status: 'error' };

export type CompanyAccessAdministrationCallbacks = Readonly<{
  onActorRevalidated?: (actor: ActorContext) => Promise<void> | void;
  onCompanyContextRejected?: (companyId: string) => Promise<void> | void;
  onActivityRecorded?: () => Promise<void> | void;
  onClientAuthorityChanged?: () => Promise<void> | void;
  onWorkspaceAccessRejected?: () => Promise<void> | void;
}>;

/**
 * The Company access administration both interfaces present: the server
 * administration read, the selected member and Company, and the grant and
 * revoke commands with their exact retry. It never decides authority; the
 * server's administration read is the only state shown.
 */
export function useCompanyAccessAdministration({
  actor,
  identity,
  onActorRevalidated = () => undefined,
  onCompanyContextRejected = () => undefined,
  onActivityRecorded = () => undefined,
  onClientAuthorityChanged = () => undefined,
  onWorkspaceAccessRejected = () => undefined,
}: CompanyAccessAdministrationCallbacks &
  Readonly<{ actor: ActorContext; identity: BrowserIdentity }>) {
  const [workspaceMembershipId, setWorkspaceMembershipId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [administration, setAdministration] = useState<AdministrationLoadState>(
    { status: 'loading' },
  );
  const [mutation, setMutation] = useState<AccessMutationState>({
    status: 'idle',
  });
  const [suspensionPending, setSuspensionPending] = useState(false);
  const retryCommand = useRef<
    | {
        submission: AccessSubmission;
        bundle: AssignmentBundle;
        workspaceMembershipId: string;
        companyId: string;
        idempotencyKey: string;
      }
    | undefined
  >(undefined);
  const {
    allowed: canManageAssignments,
    scope,
    captureRecovery,
  } = useWorkspaceRequestScope({
    actor,
    identity,
    permission: 'company.assignment.manage',
  });
  const listing = useScopedOperation(scope);
  const commands = useScopedOperationGroup(scope);
  const acceptRevalidatedActor = useRef(onActorRevalidated);
  const rejectCompanyContext = useRef(onCompanyContextRejected);
  const rejectWorkspaceAccess = useRef(onWorkspaceAccessRejected);
  useLayoutEffect(() => {
    acceptRevalidatedActor.current = onActorRevalidated;
    rejectCompanyContext.current = onCompanyContextRejected;
    rejectWorkspaceAccess.current = onWorkspaceAccessRejected;
  });

  const reloadAdministration = useCallback(
    async (signal: AbortSignal, showLoading = false): Promise<boolean> => {
      const recoveryLive = captureRecovery();
      const current = () =>
        canManageAssignments && commands.isLive() && !signal.aborted;
      if (!current()) return false;
      if (showLoading) setAdministration({ status: 'loading' });
      try {
        const api = await createAuthenticatedApiClient(identity);
        if (!current()) return false;
        const result = await api.request(
          '/company-context-assignments/administration',
          { signal },
        );
        if (!current()) return false;
        const rejection = await handleAuthenticatedAccessRejection({
          result,
          identity,
          companyContextId: undefined,
          onCompanyContextRejected: (companyId) =>
            rejectCompanyContext.current(companyId),
          onActorRevalidated: (revalidatedActor) =>
            acceptRevalidatedActor.current(revalidatedActor),
          onWorkspaceAccessRejected: () => rejectWorkspaceAccess.current(),
          signal,
          isCurrent: () => current() && recoveryLive(),
        });
        if (!current()) return false;
        if (rejection) {
          if (!current()) return false;
          if (rejection === 'forbidden') setAdministration({ status: 'error' });
          return false;
        }
        if (result.status !== 'ok') {
          setAdministration({ status: 'error' });
          return false;
        }
        const value = companyAccessAdministrationResponse(result.value);
        setAdministration({ status: 'ready', value });
        setWorkspaceMembershipId((current) =>
          value.members.some(
            (member) => member.workspaceMembershipId === current,
          )
            ? current
            : '',
        );
        setCompanyId((current) =>
          value.companies.some((company) => company.id === current)
            ? current
            : '',
        );
        return true;
      } catch (error) {
        if (!current()) return false;
        if (error instanceof DOMException && error.name === 'AbortError')
          return false;
        setAdministration({ status: 'error' });
        return false;
      }
    },
    [identity, canManageAssignments, commands, captureRecovery],
  );

  useEffect(() => {
    retryCommand.current = undefined;
    setWorkspaceMembershipId('');
    setCompanyId('');
    setMutation({ status: 'idle' });
    setSuspensionPending(false);
    if (!canManageAssignments) return;
    const signal = listing.begin();
    if (!signal) return;
    setAdministration({ status: 'loading' });
    void reloadAdministration(signal);
    return () => listing.retire();
  }, [scope, canManageAssignments, listing, reloadAdministration]);

  /** Grants or revokes `bundle` for the selected member and Company. */
  async function submit(
    submission: AccessSubmission,
    bundle: AssignmentBundle,
  ) {
    if (!canManageAssignments || commands.isPending() || suspensionPending)
      return;
    if (!workspaceMembershipId || !companyId) return;
    const request = commands.begin();
    if (!request) return;
    const current = () => commands.isLive() && !request.signal.aborted;
    const recoveryLive = captureRecovery();
    setMutation({ status: 'submitting', submission });
    const command =
      retryCommand.current?.submission === submission &&
      retryCommand.current.bundle === bundle &&
      retryCommand.current.workspaceMembershipId === workspaceMembershipId &&
      retryCommand.current.companyId === companyId
        ? retryCommand.current
        : {
            submission,
            bundle,
            workspaceMembershipId,
            companyId,
            idempotencyKey: crypto.randomUUID(),
          };
    retryCommand.current = command;
    listing.retire();
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (!current()) return;
      const assignmentPath = ASSIGNMENT_PATHS[bundle];
      const result = await api.request(
        submission === 'grant'
          ? assignmentPath
          : `${assignmentPath}/${encodeURIComponent(workspaceMembershipId)}/${encodeURIComponent(companyId)}`,
        submission === 'grant'
          ? {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'idempotency-key': command.idempotencyKey,
              },
              body: JSON.stringify({ workspaceMembershipId, companyId }),
              signal: request.signal,
            }
          : {
              method: 'DELETE',
              headers: { 'idempotency-key': command.idempotencyKey },
              signal: request.signal,
            },
      );
      if (!current()) return;
      if (result.status === 'unauthorized') {
        setMutation({ status: 'error' });
        if (recoveryLive()) await identity.rejectSession();
        return;
      }

      let actorRevalidationFailed = false;
      let activityRefreshedByRecovery = false;
      if (
        result.status === 'ok' &&
        recoveryLive() &&
        command.bundle !== 'company-context' &&
        command.workspaceMembershipId.toLowerCase() ===
          actor.workspaceMembershipId.toLowerCase() &&
        command.companyId.toLowerCase() ===
          actor.activeCompany?.id.toLowerCase()
      ) {
        const revalidated = await readCurrentActor({
          api,
          companyContextId: command.companyId,
          signal: request.signal,
        });
        if (!current()) return;
        if (recoveryLive()) {
          if (revalidated.status === 'unauthorized') {
            await identity.rejectSession();
            return;
          }
          if (revalidated.status === 'forbidden') {
            await rejectCompanyContext.current(command.companyId);
            if (!current()) return;
            activityRefreshedByRecovery = true;
          } else if (revalidated.status === 'ok') {
            await acceptRevalidatedActor.current(revalidated.value);
            if (!current()) return;
          } else {
            actorRevalidationFailed = true;
          }
        }
      }

      if (
        result.status === 'ok' &&
        !activityRefreshedByRecovery &&
        recoveryLive()
      ) {
        await onActivityRecorded();
        if (!current()) return;
      }

      if (
        result.status === 'ok' &&
        // Only this bundle carries Client read. Other consumers retire their own captured authority.
        command.bundle === 'director-client' &&
        command.workspaceMembershipId.toLowerCase() ===
          actor.workspaceMembershipId.toLowerCase()
      ) {
        await onClientAuthorityChanged();
        if (!current()) return;
      }

      if (!current()) return;
      const refreshed = await reloadAdministration(request.signal);
      if (!current()) return;
      if (result.status === 'ok' && refreshed && !actorRevalidationFailed) {
        retryCommand.current = undefined;
        setMutation({ status: 'ready', submission });
      } else if (result.status === 'ok' && !actorRevalidationFailed) {
        setMutation({ status: 'unrefreshed', submission });
      } else {
        setMutation({ status: 'error' });
      }
    } catch (error) {
      if (!current()) return;
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setMutation({ status: 'error' });
    } finally {
      request.release();
    }
  }

  function resetCommand() {
    retryCommand.current = undefined;
    setMutation({ status: 'idle' });
  }

  async function retryAdministration() {
    if (!canManageAssignments || commands.isPending() || suspensionPending)
      return;
    const signal = listing.begin();
    if (!signal) return;
    const refreshed = await reloadAdministration(signal, true);
    if (signal.aborted || !refreshed || mutation.status !== 'unrefreshed')
      return;
    retryCommand.current = undefined;
    setMutation({ status: 'ready', submission: mutation.submission });
  }

  /**
   * The unresolved command to repeat with its original key for `bundle` and
   * the selected member and Company, if the last one could not be confirmed.
   */
  function retrySubmission(
    bundle: AssignmentBundle,
  ): AccessSubmission | undefined {
    const unresolved =
      mutation.status === 'error' || mutation.status === 'unrefreshed';
    return unresolved &&
      retryCommand.current?.bundle === bundle &&
      retryCommand.current.workspaceMembershipId === workspaceMembershipId &&
      retryCommand.current.companyId === companyId
      ? retryCommand.current.submission
      : undefined;
  }

  return {
    allowed: canManageAssignments,
    administration,
    mutation,
    workspaceMembershipId,
    companyId,
    selectMember(id: string) {
      resetCommand();
      setWorkspaceMembershipId(id);
    },
    selectCompany(id: string) {
      resetCommand();
      setCompanyId(id);
    },
    submit,
    resetCommand,
    retryAdministration,
    retrySubmission,
    reloadAdministration,
    suspensionPending,
    setSuspensionPending,
  };
}
