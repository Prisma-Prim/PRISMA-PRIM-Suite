import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import { useScopedOperationGroup } from '../api/use-scoped-operation';
import { useWorkspaceRequestScope } from './use-workspace-request-scope';
import { confirmsWorkspaceMembershipSuspension } from './workspace-membership-suspension-response';

export interface SuspensionMemberOption {
  readonly workspaceMembershipId: string;
  readonly label: string;
}

export type SuspensionState =
  | { status: 'idle' }
  | { status: 'reviewing'; workspaceMembershipId: string }
  | { status: 'submitting' | 'refreshing'; workspaceMembershipId: string }
  | { status: 'ready' }
  | { status: 'error' };

export type MembershipSuspensionOptions = Readonly<{
  actor: ActorContext;
  identity: BrowserIdentity;
  members: readonly SuspensionMemberOption[];
  disabled: boolean;
  reloadAdministration: (signal: AbortSignal) => Promise<boolean>;
  onPendingChange: (pending: boolean) => void;
  onActivityRecorded: () => Promise<void> | void;
  onWorkspaceAccessRejected: () => Promise<void> | void;
}>;

/**
 * Suspends one active member after review and confirmation, keeping the
 * identity, assignments and history, with the exact retry of an unconfirmed
 * command. Both interfaces present it.
 */
export function useMembershipSuspension({
  actor,
  identity,
  members,
  disabled,
  reloadAdministration,
  onPendingChange,
  onActivityRecorded,
  onWorkspaceAccessRejected,
}: MembershipSuspensionOptions) {
  const [workspaceMembershipId, setWorkspaceMembershipId] = useState('');
  const [state, setState] = useState<SuspensionState>({ status: 'idle' });
  const retryCommand = useRef<
    { workspaceMembershipId: string; idempotencyKey: string } | undefined
  >(undefined);
  const { allowed, scope, captureRecovery } = useWorkspaceRequestScope({
    actor,
    identity,
    permission: 'company.assignment.manage',
  });
  const resetBoundary = useRef(scope);
  const pending =
    state.status === 'submitting' || state.status === 'refreshing';
  const selectedMember = members.find(
    (member) => member.workspaceMembershipId === workspaceMembershipId,
  );
  const requests = useScopedOperationGroup(
    JSON.stringify([scope, workspaceMembershipId]),
  );
  const notified = useRef(false);
  const callbacks = useRef({
    onPendingChange,
    onActivityRecorded,
    onWorkspaceAccessRejected,
  });
  useLayoutEffect(() => {
    callbacks.current = {
      onPendingChange,
      onActivityRecorded,
      onWorkspaceAccessRejected,
    };
  });
  useLayoutEffect(
    () => () => {
      if (notified.current) {
        notified.current = false;
        callbacks.current.onPendingChange(false);
      }
    },
    [requests],
  );

  useEffect(() => {
    if (resetBoundary.current === scope) return;
    resetBoundary.current = scope;
    retryCommand.current = undefined;
    setWorkspaceMembershipId('');
    setState({ status: 'idle' });
    callbacks.current.onPendingChange(false);
  }, [scope]);

  useEffect(() => {
    if (
      workspaceMembershipId &&
      state.status !== 'refreshing' &&
      !members.some(
        (member) => member.workspaceMembershipId === workspaceMembershipId,
      )
    ) {
      setWorkspaceMembershipId('');
      retryCommand.current = undefined;
      setState({ status: 'idle' });
    }
  }, [members, workspaceMembershipId, state.status]);

  function reset() {
    retryCommand.current = undefined;
    setState({ status: 'idle' });
  }

  async function submit() {
    if (
      !allowed ||
      disabled ||
      requests.isPending() ||
      !selectedMember ||
      state.status !== 'reviewing' ||
      state.workspaceMembershipId !== workspaceMembershipId
    )
      return;
    const request = requests.begin();
    if (!request) return;
    const current = () => requests.isLive() && !request.signal.aborted;
    const recoveryLive = captureRecovery();
    const command =
      retryCommand.current?.workspaceMembershipId === workspaceMembershipId
        ? retryCommand.current
        : {
            workspaceMembershipId,
            idempotencyKey: crypto.randomUUID(),
          };
    retryCommand.current = command;
    setState({
      status: 'submitting',
      workspaceMembershipId,
    });
    notified.current = true;
    callbacks.current.onPendingChange(true);
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (!current()) return;
      const result = await api.request('/workspace-membership-suspensions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': command.idempotencyKey,
        },
        body: JSON.stringify({
          workspaceMembershipId: command.workspaceMembershipId,
        }),
        signal: request.signal,
      });
      if (!current()) return;
      if (result.status === 'unauthorized') {
        setState({ status: 'error' });
        if (recoveryLive()) await identity.rejectSession();
        return;
      }
      const confirmed =
        result.status === 'ok' &&
        confirmsWorkspaceMembershipSuspension({
          value: result.value,
          workspaceMembershipId: command.workspaceMembershipId,
        });
      if (
        confirmed &&
        command.workspaceMembershipId.toLowerCase() ===
          actor.workspaceMembershipId.toLowerCase()
      ) {
        retryCommand.current = undefined;
        await callbacks.current.onWorkspaceAccessRejected();
        return;
      }
      if (confirmed) {
        setState({
          status: 'refreshing',
          workspaceMembershipId: command.workspaceMembershipId,
        });
        await callbacks.current.onActivityRecorded();
        if (!current()) return;
      }
      const refreshed = await reloadAdministration(request.signal);
      if (!current()) return;
      if (confirmed && refreshed) {
        retryCommand.current = undefined;
        setWorkspaceMembershipId('');
        setState({ status: 'ready' });
      } else {
        setState({ status: 'error' });
      }
    } catch (error) {
      if (!current()) return;
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setState({ status: 'error' });
    } finally {
      if (current() && notified.current) {
        notified.current = false;
        callbacks.current.onPendingChange(false);
      }
      request.release();
    }
  }

  return {
    allowed,
    workspaceMembershipId,
    selectedMember,
    state,
    pending,
    /** Chooses the member to suspend; any earlier review or retry ends. */
    select(id: string) {
      reset();
      setWorkspaceMembershipId(id);
    },
    /** Opens the review of `id`'s suspension; nothing is sent yet. */
    review(id: string) {
      setWorkspaceMembershipId(id);
      setState({ status: 'reviewing', workspaceMembershipId: id });
    },
    reset,
    submit,
  };
}
