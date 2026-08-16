import { type FormEvent, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';

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

  if (!actor.workspacePermissions.includes('company.assignment.manage'))
    return null;

  async function submit(event: FormEvent, submission: Submission) {
    event.preventDefault();
    const member = workspaceMembershipId.trim();
    const company = companyId.trim();
    if (!member || !company) return setState({ status: 'error' });
    setState({ status: 'submitting', submission });
    const idempotencyKey = crypto.randomUUID();
    const api = await createAuthenticatedApiClient(identity);
    const result = await api.request<void>(
      submission === 'grant'
        ? '/company-context-assignments'
        : `/company-context-assignments/${encodeURIComponent(member)}/${encodeURIComponent(company)}`,
      submission === 'grant'
        ? {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'idempotency-key': idempotencyKey,
            },
            body: JSON.stringify({
              workspaceMembershipId: member,
              companyId: company,
            }),
          }
        : {
            method: 'DELETE',
            headers: { 'idempotency-key': idempotencyKey },
          },
    );
    if (result.status === 'unauthorized') await identity.rejectSession();
    setState(
      result.status === 'ok'
        ? { status: 'ready', submission }
        : { status: 'error' },
    );
  }

  const pending = state.status === 'submitting';
  return (
    <section aria-labelledby="company-context-access-title">
      <p className="eyebrow">Access</p>
      <h2 id="company-context-access-title">Company Context Access</h2>
      <p>Grant or revoke the narrow ability to list and select one Company.</p>
      <form noValidate>
        <label htmlFor="context-access-membership">
          Workspace membership ID
        </label>
        <input
          id="context-access-membership"
          value={workspaceMembershipId}
          onChange={(event) => setWorkspaceMembershipId(event.target.value)}
        />
        <label htmlFor="context-access-company">Company ID</label>
        <input
          id="context-access-company"
          value={companyId}
          onChange={(event) => setCompanyId(event.target.value)}
        />
        <button
          type="submit"
          disabled={pending}
          onClick={(event) => void submit(event, 'grant')}
        >
          Grant access
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={(event) => void submit(event, 'revoke')}
        >
          Revoke access
        </button>
      </form>
      {state.status === 'ready' && (
        <p role="status">
          Access {state.submission === 'grant' ? 'granted' : 'revoked'}.
        </p>
      )}
      {state.status === 'error' && (
        <p role="alert">The access change could not be completed.</p>
      )}
    </section>
  );
}
