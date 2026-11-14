import { type FormEvent, useEffect, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { useInterfaceLocale } from '../localization/interface-locale';
import type { ApiResult } from '../api/authenticated-api-client';
import {
  resolveIdempotentDisplayNameCommand,
  type IdempotentDisplayNameCommand,
} from '../api/idempotent-display-name-command';
import {
  handleAuthenticatedAccessRejection,
  runLatestAuthenticatedRequest,
} from '../api/latest-authenticated-request';
import { useCompanyRegistrationCopy } from './company-registration.copy';
import {
  readCreatedCompanyReference,
  readRegisteredCompany,
} from './company-response';
import './company-registration.css';

type CompanyRecord = ReturnType<typeof readRegisteredCompany>;

type RegistrationState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'ready'; company: CompanyRecord }
  | { status: 'validation' }
  | { status: 'forbidden' }
  | { status: 'error' };

export function CompanyRegistration({
  actor,
  identity,
  onCompanyContextRejected,
  onActorRevalidated = () => undefined,
  onWorkspaceAccessRejected = () => undefined,
  onCompanyRegistered,
}: {
  actor: ActorContext;
  identity: BrowserIdentity;
  onCompanyContextRejected: (companyContextId: string) => void;
  onActorRevalidated?: (actor: ActorContext) => Promise<void> | void;
  onWorkspaceAccessRejected?: () => Promise<void> | void;
  onCompanyRegistered: (company: CompanyRecord) => void;
}) {
  const copy = useCompanyRegistrationCopy();
  const { formatDateTime } = useInterfaceLocale();
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
      <section className="company-registration company-registration-denied company-registration--prisme">
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
      onActorRevalidated,
      onWorkspaceAccessRejected,
      signal,
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
      setState({ status: 'validation' });
      return;
    }

    retryCommand.current = command;
    setState({ status: 'submitting' });
    const requestCompanyContextId = actor.activeCompany?.id;
    await runLatestAuthenticatedRequest({
      pending: pendingRequest,
      identity,
      execute: async (api, signal) => {
        const createResult = await api.request('/companies', {
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
        const createdCompany = readCreatedCompanyReference(createResult.value);
        const readResult = await api.request(
          `/companies/${encodeURIComponent(createdCompany.id)}`,
          {
            companyContextId: requestCompanyContextId,
            signal,
          },
        );
        return {
          phase: 'read' as const,
          companyId: createdCompany.id,
          result: readResult,
        };
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
              ? { status: 'validation' }
              : { status: 'error' },
          );
          return;
        }
        if (request.result.status !== 'ok') {
          setState({ status: 'error' });
          return;
        }
        const company = readRegisteredCompany(request.result.value, {
          companyId: request.companyId,
          workspaceId: actor.workspaceId,
        });
        retryCommand.current = undefined;
        onCompanyRegistered(company);
        setState({ status: 'ready', company });
      },
      onError: () => setState({ status: 'error' }),
    });
  }

  return (
    <section
      className="company-registration company-registration--prisme"
      aria-labelledby="company-registration-title"
    >
      <div className="company-registration-heading">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h2 id="company-registration-title">{copy.title}</h2>
        <p>{copy.description}</p>
      </div>
      <form
        className="company-registration-form"
        onSubmit={(event) => void submit(event)}
        noValidate
      >
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
          <button
            className="company-registration-primary-action"
            type="submit"
            disabled={state.status === 'submitting'}
          >
            {state.status === 'submitting' ? copy.submitting : copy.submit}
          </button>
        </div>
      </form>
      {state.status === 'validation' && (
        <p id="company-registration-message" role="alert">
          {copy.displayNameRequired}
        </p>
      )}
      {state.status === 'forbidden' && (
        <p role="alert">{copy.permissionDenied}</p>
      )}
      {state.status === 'error' && <p role="alert">{copy.retryableError}</p>}
      {state.status === 'ready' && (
        <article
          className="company-record company-registration-result"
          aria-live="polite"
        >
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
              <dd>{formatDateTime(state.company.createdAt)}</dd>
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
