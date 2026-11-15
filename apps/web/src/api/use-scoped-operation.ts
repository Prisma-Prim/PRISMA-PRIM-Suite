import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';

export type PendingOperation = {
  readonly signal: AbortSignal;
  release: () => void;
  retire: () => void;
};
export type ScopedOperation = {
  /** Start from an event/effect under the committed scope, or return null. */
  begin: () => AbortSignal | null;
  retire: () => void;
};
export type ScopedOperationGroup = {
  /** Independent members do not supersede each other. */
  begin: () => PendingOperation | null;
  retire: () => void;
  isLive: () => boolean;
  isPending: () => boolean;
};

/** One imperative lifetime owns admission, completion and cancellation. */
export function createOperationScope() {
  const pending = new Set<PendingOperation>();
  let live = true;
  let latest: PendingOperation | null = null;
  function begin(): PendingOperation | null {
    if (!live) return null;
    const controller = new AbortController();
    const operation: PendingOperation = {
      signal: controller.signal,
      release: () => {
        pending.delete(operation);
      },
      retire: () => {
        pending.delete(operation);
        controller.abort();
      },
    };
    pending.add(operation);
    return operation;
  }
  function retire() {
    const retiring = new Set(pending);
    if (latest) retiring.add(latest);
    latest = null;
    pending.clear();
    for (const operation of retiring) operation.retire();
  }
  return {
    begin,
    beginLatest() {
      const next = begin();
      if (!next) return null;
      const previous = latest;
      latest = next;
      previous?.retire();
      return next;
    },
    retire,
    close() {
      live = false;
      retire();
    },
    isLive: () => live,
    isPending: () => pending.size > 0,
  };
}
type Owner = {
  scope: { value: string };
  operations: ReturnType<typeof createOperationScope>;
};

/** Speculative renders cannot retire the committed owner or its callbacks. */
function useOperationOwner(scope: string) {
  const rendered = useMemo(() => ({ value: scope }), [scope]);
  const owner = useRef<Owner | null>(null);
  useLayoutEffect(() => {
    const current: Owner = {
      scope: rendered,
      operations: createOperationScope(),
    };
    owner.current = current;
    return () => {
      if (owner.current === current) owner.current = null;
      current.operations.close();
    };
  }, [rendered]);
  return useCallback(() => {
    const current = owner.current;
    return current?.scope === rendered ? current : null;
  }, [rendered]);
}

/**
 * Latest work under one committed scope. Equal values returning later have a
 * new owner; old controls and continuations remain retired. Layout cleanup
 * precedes paint (#1095/#1096), and StrictMode setup creates a fresh owner.
 */
export function useScopedOperation(scope: string): ScopedOperation {
  const capture = useOperationOwner(scope);
  const begin = useCallback(
    () => capture()?.operations.beginLatest()?.signal ?? null,
    [capture],
  );
  const retire = useCallback(() => capture()?.operations.retire(), [capture]);
  return useMemo(() => ({ begin, retire }), [begin, retire]);
}

/** Parallel members share a scope; completion releases only that member. */
export function useScopedOperationGroup(scope: string): ScopedOperationGroup {
  const capture = useOperationOwner(scope);
  const begin = useCallback(
    () => capture()?.operations.begin() ?? null,
    [capture],
  );
  const retire = useCallback(() => capture()?.operations.retire(), [capture]);
  const isLive = useCallback(() => capture() !== null, [capture]);
  const isPending = useCallback(
    () => capture()?.operations.isPending() ?? false,
    [capture],
  );
  return useMemo(
    () => ({ begin, retire, isLive, isPending }),
    [begin, retire, isLive, isPending],
  );
}
