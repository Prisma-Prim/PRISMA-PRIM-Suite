import { useEffect } from 'react';

/** Keep the current retry alive; release ownership on resolution or scope retirement. */
export function useOfferCommandLock(
  locked: boolean,
  onCommandLockChange?: (locked: boolean) => void,
) {
  useEffect(() => {
    onCommandLockChange?.(locked);
    return () => onCommandLockChange?.(false);
  }, [locked, onCommandLockChange]);
}
