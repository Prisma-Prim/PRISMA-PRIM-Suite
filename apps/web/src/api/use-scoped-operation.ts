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

function createOperationGroup() {
  const pending = new Set<AbortController>();
  return {
    begin(): PendingOperation {
      const controller = new AbortController();
      pending.add(controller);
      return {
        signal: controller.signal,
        release: () => {
          pending.delete(controller);
        },
        retire: () => {
          pending.delete(controller);
          controller.abort();
        },
      };
    },
    retire() {
      const retiring = [...pending];
      pending.clear();
      for (const controller of retiring) controller.abort();
    },
    isPending: () => pending.size > 0,
  };
}
type Owner = {
  scope: { value: string };
  group: ReturnType<typeof createOperationGroup>;
  latest: PendingOperation | null;
};

/** Speculative renders cannot retire the committed owner or its callbacks. */
function useOperationOwner(scope: string) {
  const rendered = useMemo(() => ({ value: scope }), [scope]);
  const owner = useRef<Owner | null>(null);
  useLayoutEffect(() => {
    const current: Owner = {
      scope: rendered,
      group: createOperationGroup(),
      latest: null,
    };
    owner.current = current;
    return () => {
      if (owner.current === current) owner.current = null;
      current.group.retire();
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
  const begin = useCallback(() => {
    const current = capture();
    if (!current) return null;
    const previous = current.latest;
    const next = current.group.begin();
    current.latest = next;
    previous?.retire();
    return next.signal;
  }, [capture]);
  const retire = useCallback(() => {
    const current = capture();
    if (!current) return;
    current.latest = null;
    current.group.retire();
  }, [capture]);
  return useMemo(() => ({ begin, retire }), [begin, retire]);
}

/** Parallel members share a scope; completion releases only that member. */
export function useScopedOperationGroup(scope: string): ScopedOperationGroup {
  const capture = useOperationOwner(scope);
  const begin = useCallback(() => capture()?.group.begin() ?? null, [capture]);
  const retire = useCallback(() => capture()?.group.retire(), [capture]);
  const isLive = useCallback(() => capture() !== null, [capture]);
  const isPending = useCallback(
    () => capture()?.group.isPending() ?? false,
    [capture],
  );
  return useMemo(
    () => ({ begin, retire, isLive, isPending }),
    [begin, retire, isLive, isPending],
  );
}
