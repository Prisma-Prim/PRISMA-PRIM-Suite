import { type FormEvent, useEffect, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import { companyContextAccessCopy as copy } from './company-context-access.copy';

type Submission = 'grant' | 'revoke';
type State =
  | { status: 'idle' }
  | { status: 'submitting'; submission: Submission }
  | { status: 'ready'; submission: Submission }
  | { status: 'error' };

export function CompanyContextAccess({
  actor,
  identity,
}: {
  actor: ActorContext;
  identity: BrowserIdentity;
}) {
  const [workspaceMembershipId, setWorkspaceMembershipId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [state, setState] = useState<State>({ status: 'idle' });
  const retryCommand = useRef<
    | {
        submission: Submission;
        workspaceMembershipId: string;
        companyId: string;
        idempotencyKey: string;
      }
    | undefined
  >(undefined);
  const pendingRequest = useRef<AbortController | undefined>(undefined);
  const canManageAssignments = actor.workspacePermissions.includes(
    'company.assignment.manage',
  );
  useEffect(() => {
    pendingRequest.current?.abort();
    retryCommand.current = undefined;
    setState({ status: 'idle' });
    return () => pendingRequest.current?.abort();
  }, [
    actor.activeCompany?.id,
    actor.internalUserId,
    actor.workspaceId,
    actor.workspaceMembershipId,
    canManageAssignments,
    identity,
  ]);

  if (!canManageAssignments) return null;

  async function submit(event: FormEvent, submission: Submission) {
    event.preventDefault();
    const member = workspaceMembershipId.trim();
    const company = companyId.trim();
    if (!member || !company) return setState({ status: 'error' });
    setState({ status: 'submitting', submission });
    const command =
      retryCommand.current?.submission === submission &&
      retryCommand.current.workspaceMembershipId === member &&
      retryCommand.current.companyId === company
        ? retryCommand.current
        : {
            submission,
            workspaceMembershipId: member,
            companyId: company,
            idempotencyKey: crypto.randomUUID(),
          };
    retryCommand.current = command;
    pendingRequest.current?.abort();
    const request = new AbortController();
    pendingRequest.current = request;
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (request.signal.aborted) return;
      const result = await api.request<unknown>(
        submission === 'grant'
          ? '/company-context-assignments'
          : `/company-context-assignments/${encodeURIComponent(member)}/${encodeURIComponent(company)}`,
        submission === 'grant'
          ? {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'idempotency-key': command.idempotencyKey,
              },
              body: JSON.stringify({
                workspaceMembershipId: member,
                companyId: company,
              }),
              signal: request.signal,
            }
          : {
              method: 'DELETE',
              headers: { 'idempotency-key': command.idempotencyKey },
              signal: request.signal,
            },
      );
      if (request.signal.aborted) return;
      if (result.status === 'unauthorized') await identity.rejectSession();
      if (request.signal.aborted) return;
      if (result.status === 'ok') retryCommand.current = undefined;
      setState(
        result.status === 'ok'
          ? { status: 'ready', submission }
          : { status: 'error' },
      );
    } catch {
      if (request.signal.aborted) return;
      setState({ status: 'error' });
    } finally {
      if (pendingRequest.current === request)
        pendingRequest.current = undefined;
    }
  }

  const pending = state.status === 'submitting';
  return (
    <section aria-labelledby="company-context-access-title">
      <p className="eyebrow">{copy.eyebrow}</p>
      <h2 id="company-context-access-title">{copy.title}</h2>
      <p>{copy.description}</p>
      <form noValidate onSubmit={(event) => void submit(event, 'grant')}>
        <label htmlFor="context-access-membership">
          {copy.workspaceMembershipLabel}
        </label>
        <input
          id="context-access-membership"
          value={workspaceMembershipId}
          onChange={(event) => setWorkspaceMembershipId(event.target.value)}
        />
        <label htmlFor="context-access-company">{copy.companyLabel}</label>
        <input
          id="context-access-company"
          value={companyId}
          onChange={(event) => setCompanyId(event.target.value)}
        />
        <button type="submit" disabled={pending}>
          {copy.grant}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={(event) => void submit(event, 'revoke')}
        >
          {copy.revoke}
        </button>
      </form>
      {state.status === 'ready' && (
        <p role="status">
          {state.submission === 'grant' ? copy.granted : copy.revoked}
        </p>
      )}
      {state.status === 'error' && <p role="alert">{copy.error}</p>}
    </section>
  );
}
