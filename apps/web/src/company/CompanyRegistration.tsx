import { type FormEvent, useEffect, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { formatApplicationDateTime } from '../presentation/date-time';
import type { ApiResult } from '../api/authenticated-api-client';
import {
  resolveIdempotentDisplayNameCommand,
  type IdempotentDisplayNameCommand,
} from '../api/idempotent-display-name-command';
import {
  handleAuthenticatedAccessRejection,
  runLatestAuthenticatedRequest,
} from '../api/latest-authenticated-request';
import { companyRegistrationCopy as copy } from './company-registration.copy';

interface CompanyRecord {
  id: string;
  workspaceId: string;
  displayName: string;
  status: 'active';
  createdAt: string;
  createdByInternalUserId: string;
}

type RegistrationState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'ready'; company: CompanyRecord }
  | { status: 'validation'; message: string }
  | { status: 'forbidden' }
  | { status: 'error' };

export function CompanyRegistration({
  actor,
  identity,
  onCompanyContextRejected,
  onCompanyRegistered,
}: {
  actor: ActorContext;
  identity: BrowserIdentity;
  onCompanyContextRejected: (companyContextId: string) => void;
  onCompanyRegistered: (company: CompanyRecord) => void;
}) {
  const [displayName, setDisplayName] = useState('');
  const [state, setState] = useState<RegistrationState>({ status: 'idle' });
  const retryCommand = useRef<IdempotentDisplayNameCommand | undefined>(
    undefined,
  );
  const pendingRequest = useRef<AbortController | undefined>(undefined);
  useEffect(
    () => () => pendingRequest.current?.abort(),
    [
      actor.activeCompany?.id,
      actor.internalUserId,
      actor.workspaceId,
      actor.workspaceMembershipId,
      identity,
    ],
  );

  if (!actor.workspacePermissions.includes('company.manage')) {
    return (
      <section className="company-registration company-registration-denied">
        <p role="alert">{copy.permissionDenied}</p>
      </section>
    );
  }

  async function handleAccessRejection(
    result: ApiResult<unknown>,
    requestCompanyContextId: string | undefined,
    signal: AbortSignal,
  ): Promise<boolean> {
    if (signal.aborted) return true;
    const rejection = await handleAuthenticatedAccessRejection({
      result,
      identity,
      companyContextId: requestCompanyContextId,
      onCompanyContextRejected,
    });
    if (signal.aborted) return true;
    if (!rejection) return false;
    setState({ status: rejection === 'forbidden' ? 'forbidden' : 'error' });
    return true;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const command = resolveIdempotentDisplayNameCommand(
      displayName,
      retryCommand.current,
    );
    if (!command) {
      setState({
        status: 'validation',
        message: copy.displayNameRequired,
      });
      return;
    }

    retryCommand.current = command;
    setState({ status: 'submitting' });
    const requestCompanyContextId = actor.activeCompany?.id;
    await runLatestAuthenticatedRequest({
      pending: pendingRequest,
      identity,
      execute: async (api, signal) => {
        const createResult = await api.request<CompanyRecord>('/companies', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': command.idempotencyKey,
          },
          companyContextId: requestCompanyContextId,
          body: JSON.stringify({ displayName: command.displayName }),
          signal,
        });
        if (createResult.status !== 'ok')
          return { phase: 'create' as const, result: createResult };
        signal.throwIfAborted();
        const readResult = await api.request<CompanyRecord>(
          `/companies/${createResult.value.id}`,
          {
            companyContextId: requestCompanyContextId,
            signal,
          },
        );
        return { phase: 'read' as const, result: readResult };
      },
      async onResult(request, signal) {
        if (
          await handleAccessRejection(
            request.result,
            requestCompanyContextId,
            signal,
          )
        )
          return;
        if (request.phase === 'create') {
          setState(
            request.result.status === 'validation'
              ? {
                  status: 'validation',
                  message: request.result.message ?? copy.displayNameRequired,
                }
              : { status: 'error' },
          );
          return;
        }
        if (request.result.status !== 'ok') {
          setState({ status: 'error' });
          return;
        }
        retryCommand.current = undefined;
        onCompanyRegistered(request.result.value);
        setState({ status: 'ready', company: request.result.value });
      },
      onError: () => setState({ status: 'error' }),
    });
  }

  return (
    <section
      className="company-registration"
      aria-labelledby="company-registration-title"
    >
      <div className="company-registration-heading">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h2 id="company-registration-title">{copy.title}</h2>
        <p>{copy.description}</p>
      </div>
      <form onSubmit={(event) => void submit(event)} noValidate>
        <label htmlFor="company-display-name">{copy.displayNameLabel}</label>
        <div className="company-registration-controls">
          <input
            id="company-display-name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            aria-describedby={
              state.status === 'validation'
                ? 'company-registration-message'
                : undefined
            }
            aria-invalid={state.status === 'validation'}
          />
          <button type="submit" disabled={state.status === 'submitting'}>
            {state.status === 'submitting' ? copy.submitting : copy.submit}
          </button>
        </div>
      </form>
      {state.status === 'validation' && (
        <p id="company-registration-message" role="alert">
          {state.message}
        </p>
      )}
      {state.status === 'forbidden' && (
        <p role="alert">{copy.permissionDenied}</p>
      )}
      {state.status === 'error' && <p role="alert">{copy.retryableError}</p>}
      {state.status === 'ready' && (
        <article className="company-record" aria-live="polite">
          <div>
            <p className="company-status">{copy.active}</p>
            <h2>{state.company.displayName}</h2>
          </div>
          <dl>
            <div>
              <dt>{copy.workspace}</dt>
              <dd>{actor.workspaceName}</dd>
            </div>
            <div>
              <dt>{copy.created}</dt>
              <dd>{formatApplicationDateTime(state.company.createdAt)}</dd>
            </div>
          </dl>
          <p>
            {copy.registeredBy(
              state.company.createdByInternalUserId === actor.internalUserId
                ? actor.displayName
                : copy.authorizedUser,
            )}
          </p>
        </article>
      )}
    </section>
  );
}
