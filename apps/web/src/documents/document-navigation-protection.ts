import { useLayoutEffect, useRef } from 'react';

/** Owners expose only whether navigation must wait, never their command state. */
export function useDocumentNavigationProtection(
  protectedWork: boolean,
  onChange: ((protectedWork: boolean) => void) | undefined,
) {
  const listener = useRef(onChange);
  listener.current = onChange;
  useLayoutEffect(() => {
    listener.current?.(protectedWork);
  }, [protectedWork]);
  useLayoutEffect(() => () => listener.current?.(false), []);
}
