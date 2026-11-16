import { useCallback, useLayoutEffect, useRef } from 'react';
import type { BrowserIdentity } from '../access-composition';
import { useRequestLifetime } from '../api/use-actor-requests';
import { useScopedOperationGroup } from '../api/use-scoped-operation';

/** Captures consume committed authority; abandoned renders cannot retire it. */
export function useAuthorityLifetime(
  signature: string,
  identity: BrowserIdentity,
) {
  const lifetime = useRequestLifetime(identity, signature);
  const owner = useScopedOperationGroup(String(lifetime));
  const committed = useRef(owner.capture);
  useLayoutEffect(() => {
    committed.current = owner.capture;
  }, [owner]);
  return useCallback(() => committed.current(), []);
}
