import { type FormEvent, useLayoutEffect, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import type { ApiResult } from '../api/authenticated-api-client';
import {
  resolveIdempotentDisplayNameCommand,
  type IdempotentDisplayNameCommand,
} from '../api/idempotent-display-name-command';
import {
  handleAuthenticatedAccessRejection,
  runLatestAuthenticatedRequest,
} from '../api/latest-authenticated-request';
import {
  useActorObservation,
  useRequestLifetime,
} from '../api/use-actor-requests';
import { useScopedOperationGroup } from '../api/use-scoped-operation';
import {
  readCreatedCompanyReference,
  readRegisteredCompany,
} from './company-response';

export type RegisteredCompany = ReturnType<typeof readRegisteredCompany>;

export type CompanyRegistrationState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'ready'; company: RegisteredCompany }
  | { status: 'validation' }
  | { status: 'forbidden' }
  | { status: 'error' };

/**
 * Registers a provider Company in the Workspace with an idempotent command
 * whose exact retry survives an unconfirmed outcome. Both interfaces present it.
 */
export function useCompanyRegistration({
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
  onCompanyRegistered: (company: RegisteredCompany) => void;
}) {
  const [displayName, setDisplayName] = useState('');
  const [state, setState] = useState<CompanyRegistrationState>({
    status: 'idle',
  });
  const retryCommand = useRef<IdempotentDisplayNameCommand | undefined>(
    undefined,
  );
  const allowed = actor.workspacePermissions.includes('company.manage');
  const lifetime = useRequestLifetime(
    identity,
    JSON.stringify([
      actor.activeCompany?.id,
      actor.internalUserId,
      actor.workspaceId,
      actor.workspaceMembershipId,
      allowed,
    ]),
  );
  const registration = useScopedOperationGroup(String(lifetime));
  const actorObservation = useActorObservation(actor);
  const recovery = useScopedOperationGroup(
    JSON.stringify([lifetime, actorObservation]),
  );
  useLayoutEffect(() => {
    retryCommand.current = undefined;
    setState({ status: 'idle' });
  }, [lifetime]);

  async function handleAccessRejection(
    result: ApiResult<unknown>,
    requestCompanyContextId: string | undefined,
    signal: AbortSignal,
    requestRecovery: typeof recovery,
  ): Promise<boolean> {
    if (signal.aborted) return true;
    if (result.status !== 'forbidden' && result.status !== 'unauthorized')
      return false;
    const operation = requestRecovery.beginLatest();
    const isCurrent = () => !signal.aborted;
    try {
      if (operation && isCurrent()) {
        const rejection = await handleAuthenticatedAccessRejection({
          result,
          identity,
          companyContextId: requestCompanyContextId,
          onCompanyContextRejected,
          onActorRevalidated,
          onWorkspaceAccessRejected,
          signal: operation.signal,
          isCurrent,
        });
        if (!signal.aborted)
          setState({
            status: rejection === 'forbidden' ? 'forbidden' : 'error',
          });
      } else if (!signal.aborted) {
        setState({
          status: result.status === 'forbidden' ? 'forbidden' : 'error',
        });
      }
      return true;
    } finally {
      operation?.release();
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (registration.isPending()) return;
    const command = resolveIdempotentDisplayNameCommand(
      displayName,
      retryCommand.current,
    );
    if (!command) {
      setState({ status: 'validation' });
      return;
    }

    const operation = registration.beginLatest();
    if (!operation) return;
    retryCommand.current = command;
    setState({ status: 'submitting' });
    const requestCompanyContextId = actor.activeCompany?.id;
    await runLatestAuthenticatedRequest({
      signal: operation.signal,
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
          (await handleAccessRejection(
            request.result,
            requestCompanyContextId,
            signal,
            recovery,
          )) ||
          signal.aborted
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
    }).finally(operation.release);
  }

  return { allowed, displayName, setDisplayName, state, submit };
}
