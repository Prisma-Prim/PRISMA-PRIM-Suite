import { useCallback, useLayoutEffect, useRef, useState } from 'react';
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
  const [, publishCommittedLifetime] = useState(lifetime);
  useLayoutEffect(() => {
    committed.current = owner.capture;
    // Re-evaluate stored projection guards after the previous owner closes.
    publishCommittedLifetime(lifetime);
  }, [owner, lifetime]);
  return useCallback(() => committed.current(), []);
}
