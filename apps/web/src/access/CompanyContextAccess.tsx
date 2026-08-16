import { type FormEvent, useState } from 'react';
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

  if (!actor.workspacePermissions.includes('company.assignment.manage'))
    return null;

  async function submit(event: FormEvent, submission: Submission) {
    event.preventDefault();
    const member = workspaceMembershipId.trim();
    const company = companyId.trim();
    if (!member || !company) return setState({ status: 'error' });
    setState({ status: 'submitting', submission });
    const idempotencyKey = crypto.randomUUID();
    try {
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
    } catch {
      setState({ status: 'error' });
    }
  }

  const pending = state.status === 'submitting';
  return (
    <section aria-labelledby="company-context-access-title">
      <p className="eyebrow">{copy.eyebrow}</p>
      <h2 id="company-context-access-title">{copy.title}</h2>
      <p>{copy.description}</p>
      <form noValidate>
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
        <button
          type="submit"
          disabled={pending}
          onClick={(event) => void submit(event, 'grant')}
        >
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
