import { useCallback, useLayoutEffect, useRef } from 'react';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import type { ApiResult } from '../api/authenticated-api-client';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';

/** Recovery consumes a full Actor independently of the still-valid Client/Task read scope. */
export function useClientMissionRejection(context: {
  actor: ActorContext;
  identity: BrowserIdentity;
  onCompanyContextRejected: (id: string) => void;
  onActorRevalidated: (actor: ActorContext) => void | Promise<void>;
  onWorkspaceAccessRejected?: () => void | Promise<void>;
}) {
  const current = useRef(context);
  const recovery = useRef<AbortController | undefined>(undefined);
  const lifetime = useRef(new AbortController());
  if (
    current.current.actor !== context.actor ||
    current.current.identity !== context.identity
  ) {
    recovery.current?.abort();
    recovery.current = undefined;
  }
  current.current = context;
  useLayoutEffect(() => {
    const owner = new AbortController();
    lifetime.current = owner;
    return () => {
      owner.abort();
      recovery.current?.abort();
    };
  }, []);

  return useCallback(
    async (input: {
      result: ApiResult<unknown>;
      signal: AbortSignal;
      startedUnder: ActorContext;
    }) => {
      if (
        input.signal.aborted ||
        lifetime.current.signal.aborted ||
        current.current.actor !== input.startedUnder
      )
        return;
      recovery.current?.abort();
      const controller = new AbortController();
      recovery.current = controller;
      const owner = lifetime.current;
      const abort = () => controller.abort();
      input.signal.addEventListener('abort', abort, { once: true });
      const live = () =>
        !input.signal.aborted &&
        !owner.signal.aborted &&
        !controller.signal.aborted &&
        recovery.current === controller &&
        current.current.actor === input.startedUnder;
      try {
        await handleAuthenticatedAccessRejection({
          result: input.result,
          identity: current.current.identity,
          companyContextId: input.startedUnder.activeCompany?.id,
          signal: controller.signal,
          onActorRevalidated: (actor) =>
            live() ? current.current.onActorRevalidated(actor) : undefined,
          onCompanyContextRejected: (id) => {
            if (live()) current.current.onCompanyContextRejected(id);
          },
          onWorkspaceAccessRejected: () =>
            live() ? current.current.onWorkspaceAccessRejected?.() : undefined,
        });
      } finally {
        input.signal.removeEventListener('abort', abort);
        if (recovery.current === controller) recovery.current = undefined;
      }
    },
    [],
  );
}
