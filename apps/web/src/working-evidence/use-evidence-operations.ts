import { useLayoutEffect, useRef } from 'react';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import {
  createAuthenticatedApiClient,
  type ApiResult,
} from '../api/authenticated-api-client';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
import {
  useActorObservation,
  useRequestLifetime,
} from '../api/use-actor-requests';
import { useScopedOperationGroup } from '../api/use-scoped-operation';
export type EvidenceCallbacks = {
  onActorRevalidated?: (actor: ActorContext) => void | Promise<void>;
  onCompanyContextRejected?: (companyId: string) => void;
  onWorkspaceAccessRejected?: () => void | Promise<void>;
};
export function useEvidenceOperations({
  actor,
  identity,
  signature,
  ...callbacks
}: EvidenceCallbacks & {
  actor: ActorContext;
  identity: BrowserIdentity;
  signature: string;
}) {
  const lifetime = useRequestLifetime(identity, signature);
  const work = useScopedOperationGroup(String(lifetime));
  const actorObservation = useActorObservation(actor);
  const recovery = useScopedOperationGroup(
    JSON.stringify([lifetime, actorObservation]),
  );
  const latestCallbacks = useRef(callbacks);
  const urls = useRef(new Set<string>());
  useLayoutEffect(() => {
    latestCallbacks.current = callbacks;
  });
  useLayoutEffect(
    () => () => {
      for (const url of urls.current) URL.revokeObjectURL(url);
      urls.current.clear();
    },
    [work],
  );
  function operation(isOperationCurrent: () => boolean = () => true) {
    const request = work.begin();
    if (!request) return null;
    const sameLifetime = work.capture();
    const current = () =>
      sameLifetime() && !request.signal.aborted && isOperationCurrent();
    const recover = (result: ApiResult<unknown>) => {
      if (
        !current() ||
        (result.status !== 'unauthorized' && result.status !== 'forbidden')
      )
        return;
      const repair = recovery.begin();
      if (!repair) return;
      // Settle locally before starting independently cancellable Actor recovery.
      void Promise.resolve()
        .then(() =>
          handleAuthenticatedAccessRejection({
            result,
            identity,
            companyContextId: actor.activeCompany?.id,
            signal: repair.signal,
            isCurrent: () => current() && !repair.signal.aborted,
            onActorRevalidated: (updated) =>
              latestCallbacks.current.onActorRevalidated?.(updated),
            onCompanyContextRejected: (companyId) =>
              latestCallbacks.current.onCompanyContextRejected?.(companyId),
            onWorkspaceAccessRejected: () =>
              latestCallbacks.current.onWorkspaceAccessRejected?.(),
          }),
        )
        .catch(() => undefined)
        .finally(repair.release);
    };
    return {
      current,
      signal: request.signal,
      recover,
      finish: request.release,
    };
  }
  async function download(
    path: string,
    filename: string,
    mediaType: string,
    maximumBytes: number,
    expected?: { sizeBytes: number; sha256: string },
  ) {
    const request = operation();
    if (!request) return false;
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (!request.current()) return false;
      const result = await api.download(path, {
        companyContextId: actor.activeCompany?.id,
        signal: request.signal,
        cache: 'no-store',
        maximumBytes,
      });
      if (!request.current()) return false;
      if (result.status !== 'ok') {
        request.recover(result);
        return false;
      }
      const blob = result.value;
      if (
        blob.type.split(';')[0] !== mediaType ||
        (expected && blob.size !== expected.sizeBytes)
      )
        return false;
      if (expected) {
        const bytes = await blob.arrayBuffer();
        if (!request.current()) return false;
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        if (!request.current()) return false;
        if (
          Array.from(new Uint8Array(digest), (part) =>
            part.toString(16).padStart(2, '0'),
          ).join('') !== expected.sha256
        )
          return false;
      }
      if (!request.current()) return false;
      const url = URL.createObjectURL(blob);
      urls.current.add(url);
      if (!request.current()) {
        URL.revokeObjectURL(url);
        urls.current.delete(url);
        return false;
      }
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.append(link);
      if (request.current()) link.click();
      link.remove();
      return request.current();
    } catch {
      return false;
    } finally {
      request.finish();
    }
  }
  async function statement(path: string) {
    const request = operation();
    if (!request) return null;
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (!request.current()) return null;
      const result = await api.download(path, {
        companyContextId: actor.activeCompany?.id,
        signal: request.signal,
        cache: 'no-store',
        maximumBytes: 256 * 1024,
      });
      if (!request.current()) return null;
      if (result.status !== 'ok') {
        request.recover(result);
        return null;
      }
      if (result.value.type.split(';')[0] !== 'text/html') return null;
      const html = await result.value.text();
      return request.current() ? { html, current: request.current } : null;
    } catch {
      return null;
    } finally {
      request.finish();
    }
  }
  return { operation, download, statement };
}
