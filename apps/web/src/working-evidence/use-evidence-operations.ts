import { useEffect, useRef } from 'react';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import { useAuthorityLifetime } from '../access/use-authority-lifetime';
import {
  createAuthenticatedApiClient,
  type ApiResult,
} from '../api/authenticated-api-client';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
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
  const capture = useAuthorityLifetime(signature, identity);
  const recovery = useAuthorityLifetime(JSON.stringify(actor), identity);
  const controllers = useRef(new Set<AbortController>()),
    urls = useRef(new Set<string>());
  useEffect(
    () => () => {
      for (const controller of controllers.current) controller.abort();
      for (const url of urls.current) URL.revokeObjectURL(url);
      controllers.current.clear();
      urls.current.clear();
    },
    [signature, identity],
  );
  function operation(isOperationCurrent: () => boolean = () => true) {
    const live = capture(),
      recoveryLive = recovery(),
      controller = new AbortController();
    controllers.current.add(controller);
    const current = () =>
      live() && !controller.signal.aborted && isOperationCurrent();
    const recover = (result: ApiResult<unknown>) => {
      if (result.status !== 'unauthorized' && result.status !== 'forbidden')
        return;
      // Settle the local operation first. Actor/session recovery has an independent owner.
      void Promise.resolve()
        .then(() =>
          handleAuthenticatedAccessRejection({
            result,
            identity,
            companyContextId: actor.activeCompany?.id,
            signal: controller.signal,
            isCurrent: () => current() && recoveryLive(),
            onActorRevalidated:
              callbacks.onActorRevalidated ?? (() => undefined),
            onCompanyContextRejected:
              callbacks.onCompanyContextRejected ?? (() => undefined),
            onWorkspaceAccessRejected: callbacks.onWorkspaceAccessRejected,
          }),
        )
        .catch(() => undefined);
    };
    return {
      current,
      controller,
      recover,
      finish: () => controllers.current.delete(controller),
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
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (!request.current()) return false;
      const result = await api.download(path, {
        companyContextId: actor.activeCompany?.id,
        signal: request.controller.signal,
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
    try {
      const api = await createAuthenticatedApiClient(identity);
      if (!request.current()) return null;
      const result = await api.download(path, {
        companyContextId: actor.activeCompany?.id,
        signal: request.controller.signal,
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
