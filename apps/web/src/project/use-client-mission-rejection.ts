import { useCallback, useLayoutEffect, useRef } from 'react';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import type { ApiResult } from '../api/authenticated-api-client';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
import {
  useActorObservation,
  useRequestLifetime,
} from '../api/use-actor-requests';
import { useScopedOperationGroup } from '../api/use-scoped-operation';

/** Recovery consumes a full Actor independently of the still-valid Client/Task read scope. */
export function useClientMissionRejection(context: {
  actor: ActorContext;
  identity: BrowserIdentity;
  onCompanyContextRejected: (id: string) => void;
  onActorRevalidated: (actor: ActorContext) => void | Promise<void>;
  onWorkspaceAccessRejected?: () => void | Promise<void>;
}) {
  const actorObservation = useActorObservation(context.actor);
  const generation = useRequestLifetime(
    context.identity,
    String(actorObservation),
  );
  const requests = useScopedOperationGroup(String(generation));
  const current = useRef({ context, requests });
  useLayoutEffect(() => {
    current.current = { context, requests };
  });

  return useCallback(
    async (input: {
      result: ApiResult<unknown>;
      signal: AbortSignal;
      startedUnder: ActorContext;
    }) => {
      const committed = current.current;
      if (
        input.signal.aborted ||
        committed.context.actor !== input.startedUnder
      )
        return;
      const operation = committed.requests.beginLatest();
      if (!operation) return;
      const abort = operation.retire;
      input.signal.addEventListener('abort', abort, { once: true });
      const live = () =>
        !input.signal.aborted &&
        !operation.signal.aborted &&
        current.current.context.actor === input.startedUnder;
      try {
        await handleAuthenticatedAccessRejection({
          result: input.result,
          identity: committed.context.identity,
          companyContextId: input.startedUnder.activeCompany?.id,
          signal: operation.signal,
          isCurrent: live,
          onActorRevalidated: (actor) =>
            live()
              ? current.current.context.onActorRevalidated(actor)
              : undefined,
          onCompanyContextRejected: (id) => {
            if (live()) current.current.context.onCompanyContextRejected(id);
          },
          onWorkspaceAccessRejected: () =>
            live()
              ? current.current.context.onWorkspaceAccessRejected?.()
              : undefined,
        });
      } finally {
        input.signal.removeEventListener('abort', abort);
        operation.release();
      }
    },
    [],
  );
}
