import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';

export type ScopedOperation = {
  /**
   * Supersedes the slot's earlier work and returns the new work's signal, or
   * `null` when the caller rendered a scope that is no longer committed or the
   * owner has unmounted. Apply a result only while its signal is not aborted.
   */
  begin: () => AbortSignal | null;
  /** Retires the slot's current work. */
  retire: () => void;
};

type Owner = { scope: string; controller: AbortController | null };

/**
 * One slot of asynchronous work tied to a captured authority or source scope.
 *
 * Changing `scope` or unmounting retires the slot's work for good, even when
 * equal values return. Retirement runs inside the commit, before the browser
 * paints, so input on the first displayed frame begins work that this reset
 * can no longer reach (#1095, #1096). Each StrictMode effect replay creates a
 * fresh owner: replayed setup begins live work and earlier work stays retired.
 * Call `begin` from event handlers, passive effects or their continuations,
 * never during render.
 */
export function useScopedOperation(scope: string): ScopedOperation {
  const owner = useRef<Owner | null>(null);
  useLayoutEffect(() => {
    const current: Owner = { scope, controller: null };
    owner.current = current;
    return () => {
      owner.current = null;
      current.controller?.abort();
    };
  }, [scope]);
  const begin = useCallback(() => {
    const current = owner.current;
    if (current?.scope !== scope) return null;
    current.controller?.abort();
    const controller = new AbortController();
    current.controller = controller;
    return controller.signal;
  }, [scope]);
  const retire = useCallback(() => owner.current?.controller?.abort(), []);
  return useMemo(() => ({ begin, retire }), [begin, retire]);
}
