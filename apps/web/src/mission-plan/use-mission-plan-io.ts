import { useMissionPlanRejection } from './mission-plan-access-lifetime';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  const pending = useRef<AbortController | undefined>(undefined);
  const current = useRef({ decode, reject });
  current.current = { decode, reject };
  const {
    identity,
    authority: { companyId },
  } = context;
  const load = useCallback(() => {
    if (path === null) return;
    setState({ kind: 'loading' });
    void runLatestAuthenticatedRequest({
      pending,
      identity,
      execute: (api, signal) =>
        api.request<unknown>(path, { companyContextId: companyId, signal }),
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
          current.current.reject(result);
        } else
          setState({
            kind: result.status === 'notFound' ? 'missing' : 'error',
          });
      },
      onError: () => setState({ kind: 'error' }),
    });
  }, [identity, companyId, path]);
  useEffect(() => {
    if (path === null) {
      pending.current?.abort();
      setState({ kind: 'idle' });
    } else load();
    return () => pending.current?.abort();
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
  const pending = useRef<AbortController | null>(null),
    lock = useRef(false);
  const callbacks = useRef({ onConfirmed });
  callbacks.current = { onConfirmed };
  useEffect(
    () => () => {
      pending.current?.abort();
    },
    [context.identity],
  );
  async function run(attempt: Attempt<T>) {
    if (lock.current) return;
    lock.current = true;
    const controller = new AbortController();
    pending.current = controller;
    setState({ kind: 'pending', attempt });
    let confirmed: T | undefined;
    try {
      const api = await createAuthenticatedApiClient(context.identity);
      if (controller.signal.aborted) return;
      const result = await api.request<unknown>(attempt.path, {
        method: 'POST',
        body: attempt.body,
        headers: {
          'content-type': 'application/json',
          'idempotency-key': attempt.key,
        },
        companyContextId: context.authority.companyId,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
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
      if (!controller.signal.aborted) setState({ kind: 'uncertain', attempt });
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        lock.current = false;
      }
    }
    // A failed optional refresh cannot turn a committed, validated receipt uncertain.
    if (confirmed !== undefined && !controller.signal.aborted)
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
      if (state.kind !== 'idle' || lock.current) return;
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
