import { useScopedOperationGroup } from '../api/use-scoped-operation';
import { useRequestLifetime } from '../api/use-actor-requests';
import { useMissionPlanRejection } from './mission-plan-access-lifetime';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  createAuthenticatedApiClient,
  conflictCode,
} from '../api/authenticated-api-client';
import { runLatestAuthenticatedRequest } from '../api/latest-authenticated-request';
import type { PlanAuthority } from './mission-plan-authority';
export interface PlanContext {
  identity: BrowserIdentity;
  authority: PlanAuthority;
  onActorRevalidated?: (actor: ActorContext) => void | Promise<void>;
  onCompanyContextRejected?: (id: string) => void;
  onWorkspaceAccessRejected?: () => void | Promise<void>;
}
type Read<T> =
  | { kind: 'idle' | 'loading' | 'error' | 'denied' | 'missing' }
  | { kind: 'ready'; value: T };
/** Page/exact reads share cancellation; locale and callback changes never initiate I/O. */
export function useMissionPlanRead<T>(
  context: PlanContext,
  path: string | null,
  decode: (value: unknown) => T,
) {
  const reject = useMissionPlanRejection();
  const [state, setState] = useState<Read<T>>({
    kind: path ? 'loading' : 'idle',
  });
  const generation = useRequestLifetime(
    context.identity,
    JSON.stringify([context.authority.key, path]),
  );
  const reads = useScopedOperationGroup(String(generation));
  const current = useRef({ decode, reject });
  useLayoutEffect(() => {
    current.current = { decode, reject };
  });
  const {
    identity,
    authority: { companyId },
  } = context;
  const load = useCallback(() => {
    if (path === null) return;
    const operation = reads.beginLatest();
    if (!operation) return;
    const reject = current.current.reject;
    setState({ kind: 'loading' });
    void runLatestAuthenticatedRequest({
      signal: operation.signal,
      identity,
      execute: (api, signal) =>
        api.request(path, { companyContextId: companyId, signal }),
      onResult: (result) => {
        if (result.status === 'ok')
          setState({
            kind: 'ready',
            value: current.current.decode(result.value),
          });
        else if (
          result.status === 'unauthorized' ||
          result.status === 'forbidden'
        ) {
          setState({ kind: 'denied' });
          reject(result);
        } else
          setState({
            kind: result.status === 'notFound' ? 'missing' : 'error',
          });
      },
      onError: () => setState({ kind: 'error' }),
    }).finally(operation.release);
  }, [identity, companyId, path, reads]);
  useEffect(() => {
    if (path === null) {
      reads.retire();
      setState({ kind: 'idle' });
    } else load();
    return reads.retire;
  }, [load, path]);
  return { state, load };
}
type Attempt<T> = {
  path: string;
  body: string;
  key: string;
  decode: (value: unknown) => T;
};
type Command<T> =
  | {
      kind: 'idle';
      notice: null | 'saved' | 'created';
      error: null | 'invalid' | 'stale' | 'conflict' | 'denied' | 'missing';
    }
  | { kind: 'pending' | 'uncertain'; attempt: Attempt<T> };
/** Two deliberate commands use the same bounded immutable-intent recovery protocol. */
export function useMissionPlanCommand<T>(
  context: PlanContext,
  onConfirmed: (value: T) => void,
  notice: 'saved' | 'created',
) {
  const reject = useMissionPlanRejection();
  const [state, setState] = useState<Command<T>>({
    kind: 'idle',
    notice: null,
    error: null,
  });
  const generation = useRequestLifetime(
    context.identity,
    context.authority.key,
  );
  const writes = useScopedOperationGroup(String(generation));
  const callbacks = useRef({ onConfirmed });
  useLayoutEffect(() => {
    callbacks.current = { onConfirmed };
  });
  async function run(attempt: Attempt<T>) {
    if (writes.isPending()) return;
    const operation = writes.begin();
    if (!operation) return;
    setState({ kind: 'pending', attempt });
    let confirmed: T | undefined;
    try {
      const api = await createAuthenticatedApiClient(context.identity);
      if (operation.signal.aborted) return;
      const result = await api.request(attempt.path, {
        method: 'POST',
        body: attempt.body,
        headers: {
          'content-type': 'application/json',
          'idempotency-key': attempt.key,
        },
        companyContextId: context.authority.companyId,
        signal: operation.signal,
      });
      if (operation.signal.aborted) return;
      if (result.status === 'unauthorized' || result.status === 'forbidden') {
        setState({ kind: 'idle', notice: null, error: 'denied' });
        reject(result);
        return;
      }
      if (
        result.status === 'validation' ||
        result.status === 'conflict' ||
        result.status === 'notFound'
      ) {
        setState({
          kind: 'idle',
          notice: null,
          error:
            result.status === 'validation'
              ? 'invalid'
              : result.status === 'notFound'
                ? 'missing'
                : conflictCode(result) === 'STALE_VERSION'
                  ? 'stale'
                  : 'conflict',
        });
        return;
      }
      if (result.status !== 'ok') {
        setState({ kind: 'uncertain', attempt });
        return;
      }
      confirmed = attempt.decode(result.value);
      setState({ kind: 'idle', notice, error: null });
    } catch {
      if (!operation.signal.aborted) setState({ kind: 'uncertain', attempt });
    } finally {
      operation.release();
    }
    // A failed optional refresh cannot turn a committed, validated receipt uncertain.
    if (confirmed !== undefined && !operation.signal.aborted)
      callbacks.current.onConfirmed(confirmed);
  }
  return {
    state,
    blocked: state.kind !== 'idle',
    start(
      path: string,
      payload: Record<string, unknown>,
      decode: (value: unknown) => T,
    ) {
      if (state.kind !== 'idle' || writes.isPending()) return;
      void run({
        path,
        body: JSON.stringify(payload),
        key: crypto.randomUUID(),
        decode,
      });
    },
    retry() {
      if (state.kind === 'uncertain') void run(state.attempt);
    },
  };
}
