import {
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react';

const focusable =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal focus for a Clarté dialog or side panel: focus moves inside on open,
 * Tab stays inside, Escape dismisses without reaching the frame's menus, and
 * focus returns to the opener when the dialog unmounts or, for a panel kept
 * mounted while closed, when it stops being `active`.
 */
export function useModalFocus({
  container,
  initialFocus,
  onDismiss,
  active = true,
}: Readonly<{
  container: RefObject<HTMLElement | null>;
  initialFocus?: RefObject<HTMLElement | null>;
  onDismiss: () => void;
  active?: boolean;
}>) {
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useEffect(() => {
    if (!active) return;
    const opener = document.activeElement;
    const root = container.current;
    const first = root?.querySelector<HTMLElement>(focusable);
    (initialFocus?.current ?? first ?? root)?.focus();
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [container, initialFocus, active]);

  return function handleKeyDown(event: ReactKeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      dismiss.current();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = Array.from(
      container.current?.querySelectorAll<HTMLElement>(focusable) ?? [],
    );
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) {
      event.preventDefault();
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
}
