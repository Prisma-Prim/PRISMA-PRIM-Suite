import { useLayoutEffect, useRef, useState } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  createAuthenticatedApiClient,
  type ApiRequest,
  type ApiResult,
  type AuthenticatedApiClient,
} from './authenticated-api-client';
import { handleAuthenticatedAccessRejection } from './latest-authenticated-request';
import { useScopedOperationGroup } from './use-scoped-operation';

export type ActorRequestProps = {
  actor: ActorContext;
  identity: BrowserIdentity;
  onCompanyContextRejected: (companyId: string) => void;
  onActorRevalidated: (actor: ActorContext) => Promise<void> | void;
  onWorkspaceAccessRejected: () => Promise<void> | void;
};
export type AccessRecovery = (result: ApiResult<unknown>) => void;
type Result<T> = ApiResult<T> | { status: 'retired' };

/** Render state rolls back with an abandoned render; committed A-B-A is new. */
export function useRequestLifetime(identity: BrowserIdentity, scope: string) {
  const [owner, setOwner] = useState({ identity, scope, generation: 0 });
  if (owner.identity !== identity || owner.scope !== scope) {
    const next = { identity, scope, generation: owner.generation + 1 };
    setOwner(next);
    return next.generation;
  }
  return owner.generation;
}

function useActorObservation(actor: ActorContext) {
  const [observation, setObservation] = useState({ actor, generation: 0 });
  if (observation.actor !== actor) {
    const next = { actor, generation: observation.generation + 1 };
    setObservation(next);
    return next.generation;
  }
  return observation.generation;
}

export function useActorRequests({
  companyId,
  scope,
  recoverThrough,
  ...props
}: ActorRequestProps & {
  companyId: string;
  scope: string;
  recoverThrough?: AccessRecovery;
}) {
  const lifetime = useRequestLifetime(
    props.identity,
    JSON.stringify([
      companyId,
      scope,
      props.identity.loaded,
      props.identity.signedIn,
      props.actor.active,
      props.actor.workspaceId,
      props.actor.internalUserId,
      props.actor.workspaceMembershipId,
      props.actor.activeCompany?.id,
    ]),
  );
  const actorObservation = useActorObservation(props.actor);
  const ordinary = useScopedOperationGroup(String(lifetime));
  const recovery = useScopedOperationGroup(
    JSON.stringify([lifetime, actorObservation]),
  );
  const latest = useRef({ props, recoverThrough });
  useLayoutEffect(() => {
    latest.current = { props, recoverThrough };
  });

  function recover(result: ApiResult<unknown>) {
    if (
      !ordinary.isLive() ||
      !recovery.isLive() ||
      !accessRejected(result) ||
      recovery.isPending()
    )
      return;
    const operation = recovery.begin();
    if (!operation) return;
    const current = () =>
      ordinary.isLive() && recovery.isLive() && !operation.signal.aborted;
    void handleAuthenticatedAccessRejection({
      result,
      identity: props.identity,
      companyContextId: companyId,
      signal: operation.signal,
      isCurrent: current,
      onActorRevalidated: (actor) =>
        current() ? latest.current.props.onActorRevalidated(actor) : undefined,
      onCompanyContextRejected: (company) => {
        if (current()) latest.current.props.onCompanyContextRejected(company);
      },
      onWorkspaceAccessRejected: () =>
        current()
          ? latest.current.props.onWorkspaceAccessRejected()
          : undefined,
    })
      .catch(() => undefined)
      .finally(operation.release);
  }

  async function run<T>(
    operation: (
      api: AuthenticatedApiClient,
      signal: AbortSignal,
      current: () => boolean,
    ) => Promise<ApiResult<T>>,
  ): Promise<Result<T>> {
    const pending = ordinary.begin();
    if (!pending) return { status: 'retired' };
    const current = () => ordinary.isLive() && !pending.signal.aborted;
    try {
      const api = await createAuthenticatedApiClient(props.identity);
      if (!current()) return { status: 'retired' };
      const result = await operation(api, pending.signal, current);
      if (!current()) return { status: 'retired' };
      if (recovery.isLive()) (latest.current.recoverThrough ?? recover)(result);
      return result;
    } catch {
      return current() ? { status: 'error' } : { status: 'retired' };
    } finally {
      pending.release();
    }
  }

  function request(path: string, options: ApiRequest = {}) {
    return run((api, signal) =>
      api.request(path, {
        ...options,
        signal,
        companyContextId: companyId,
        cache: 'no-store',
      }),
    );
  }
  function retire() {
    ordinary.retire();
    recovery.retire();
  }
  return {
    request,
    run,
    recover,
    retire,
    retireRequests: ordinary.retire,
    isLive: ordinary.isLive,
  };
}

export function accessRejected(result: { status: string }) {
  return result.status === 'unauthorized' || result.status === 'forbidden';
}
