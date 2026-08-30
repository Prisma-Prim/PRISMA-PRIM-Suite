import { useEffect, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import { workspaceMembershipSuspensionCopy as copy } from './workspace-membership-suspension.copy';

export interface SuspensionMemberOption {
  readonly workspaceMembershipId: string;
  readonly label: string;
}

type SuspensionState =
  | { status: 'idle' }
  | { status: 'reviewing'; workspaceMembershipId: string }
  | { status: 'submitting'; workspaceMembershipId: string }
  | { status: 'ready' }
  | { status: 'error' };

export function WorkspaceMembershipSuspension({
  actor,
  identity,
  members,
  disabled,
  reloadAdministration,
  onPendingChange,
  onActivityRecorded,
  onWorkspaceAccessRejected,
}: {
  actor: ActorContext;
  identity: BrowserIdentity;
  members: readonly SuspensionMemberOption[];
  disabled: boolean;
  reloadAdministration: (request: AbortController) => Promise<boolean>;
  onPendingChange: (pending: boolean) => void;
  onActivityRecorded: () => Promise<void> | void;
  onWorkspaceAccessRejected: () => Promise<void> | void;
}) {
  const [workspaceMembershipId, setWorkspaceMembershipId] = useState('');
  const [state, setState] = useState<SuspensionState>({ status: 'idle' });
  const retryCommand = useRef<
    { workspaceMembershipId: string; idempotencyKey: string } | undefined
  >(undefined);
  const pendingRequest = useRef<AbortController | undefined>(undefined);
  const resetBoundary = useRef({
    internalUserId: actor.internalUserId,
    workspaceId: actor.workspaceId,
    workspaceMembershipId: actor.workspaceMembershipId,
    identity,
  });
  const pending = state.status === 'submitting';
  const selectedMember = members.find(
    (member) => member.workspaceMembershipId === workspaceMembershipId,
  );

  useEffect(() => {
    const previous = resetBoundary.current;
    const replacement =
      previous.internalUserId !== actor.internalUserId ||
      previous.workspaceId !== actor.workspaceId ||
      previous.workspaceMembershipId !== actor.workspaceMembershipId ||
      previous.identity !== identity;
    resetBoundary.current = {
      internalUserId: actor.internalUserId,
      workspaceId: actor.workspaceId,
      workspaceMembershipId: actor.workspaceMembershipId,
      identity,
    };
    if (!replacement) return;

    pendingRequest.current?.abort();
    retryCommand.current = undefined;
    setWorkspaceMembershipId('');
    setState({ status: 'idle' });
    onPendingChange(false);
  }, [
    actor.internalUserId,
    actor.workspaceId,
    actor.workspaceMembershipId,
    identity,
    onPendingChange,
  ]);

  useEffect(() => () => pendingRequest.current?.abort(), []);

  useEffect(() => {
    if (
      workspaceMembershipId &&
      !members.some(
        (member) => member.workspaceMembershipId === workspaceMembershipId,
      )
    ) {
      setWorkspaceMembershipId('');
    }
  }, [members, workspaceMembershipId]);

  function reset() {
    retryCommand.current = undefined;
    setState({ status: 'idle' });
  }

  async function submit() {
    if (
      state.status !== 'reviewing' ||
      state.workspaceMembershipId !== workspaceMembershipId
    )
      return;
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
    onPendingChange(true);
    pendingRequest.current?.abort();
    const request = new AbortController();
    pendingRequest.current = request;
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (request.signal.aborted) return;
      const result = await api.request<{
        workspaceMembershipId: string;
        status: 'inactive';
      }>('/workspace-membership-suspensions', {
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
      if (request.signal.aborted) return;
      if (result.status === 'unauthorized') {
        await identity.rejectSession();
        return;
      }
      if (
        result.status === 'ok' &&
        command.workspaceMembershipId.toLowerCase() ===
          actor.workspaceMembershipId.toLowerCase()
      ) {
        retryCommand.current = undefined;
        await onWorkspaceAccessRejected();
        return;
      }
      if (result.status === 'ok') {
        await onActivityRecorded();
        if (request.signal.aborted) return;
      }
      const refreshed = await reloadAdministration(request);
      if (request.signal.aborted) return;
      if (result.status === 'ok' && refreshed) {
        retryCommand.current = undefined;
        setWorkspaceMembershipId('');
        setState({ status: 'ready' });
      } else {
        setState({ status: 'error' });
      }
    } catch (error) {
      if (request.signal.aborted) return;
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setState({ status: 'error' });
    } finally {
      if (pendingRequest.current === request) {
        pendingRequest.current = undefined;
        onPendingChange(false);
      }
    }
  }

  return (
    <section aria-labelledby="workspace-access-suspension-title">
      <h3 id="workspace-access-suspension-title">{copy.title}</h3>
      <p>{copy.description}</p>
      {members.length === 0 ? (
        <p>{copy.empty}</p>
      ) : (
        <>
          <label htmlFor="workspace-access-suspension-member">
            {copy.memberLabel}
          </label>
          <select
            id="workspace-access-suspension-member"
            value={workspaceMembershipId}
            disabled={disabled || pending}
            onChange={(event) => {
              reset();
              setWorkspaceMembershipId(event.target.value);
            }}
          >
            <option value="">{copy.selectMember}</option>
            {members.map((member) => (
              <option
                key={member.workspaceMembershipId}
                value={member.workspaceMembershipId}
              >
                {member.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={disabled || pending || !workspaceMembershipId}
            onClick={() =>
              setState({
                status: 'reviewing',
                workspaceMembershipId,
              })
            }
          >
            {copy.review}
          </button>
        </>
      )}
      {state.status === 'reviewing' && selectedMember && (
        <div role="region" aria-label={copy.confirmationRegionLabel}>
          <p>
            {copy.selectedMemberLabel}: <strong>{selectedMember.label}</strong>
          </p>
          <p>{copy.confirmation}</p>
          <button type="button" onClick={reset}>
            {copy.cancel}
          </button>
          <button type="button" onClick={() => void submit()}>
            {copy.confirm}
          </button>
        </div>
      )}
      {state.status === 'submitting' && <p role="status">{copy.submitting}</p>}
      {state.status === 'ready' && <p role="status">{copy.suspended}</p>}
      {state.status === 'error' && <p role="alert">{copy.error}</p>}
    </section>
  );
}
