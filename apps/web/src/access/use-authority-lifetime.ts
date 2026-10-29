import { useCallback, useEffect, useRef } from 'react';
import type { BrowserIdentity } from '../access-composition';

/** A consumed authority's old operations remain retired even when equal values return. */
export function useAuthorityLifetime(
  signature: string,
  identity: BrowserIdentity,
) {
  const current = useRef({ signature, identity, retired: false });
  if (
    current.current.signature !== signature ||
    current.current.identity !== identity
  ) {
    current.current.retired = true;
    current.current = { signature, identity, retired: false };
  }
  useEffect(() => {
    // StrictMode replays setup after cleanup; each setup has a fresh live owner.
    if (current.current.retired)
      current.current = { signature, identity, retired: false };
    const owner = current.current;
    return () => {
      owner.retired = true;
    };
  }, [signature, identity]);
  return useCallback(() => {
    const owner = current.current;
    return () => !owner.retired && current.current === owner;
  }, []);
}
