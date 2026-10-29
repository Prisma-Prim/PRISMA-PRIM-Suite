import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { useClerkNativeValidationCopy } from './clerk-native-validation.copy';

type EmailProblem = 'emailRequired' | 'emailFormat';

function emailProblem(input: HTMLInputElement): EmailProblem | undefined {
  if (input.type !== 'email' && input.inputMode !== 'email') return;
  if (input.validity.valueMissing) return 'emailRequired';
  if (input.validity.patternMismatch || input.validity.typeMismatch)
    return 'emailFormat';
}

function addDescription(input: HTMLInputElement, id: string): void {
  const current = input.getAttribute('aria-describedby');
  if (current?.split(/\s+/u).includes(id)) return;
  input.setAttribute('aria-describedby', current ? current + ' ' + id : id);
}

function removeDescription(input: HTMLInputElement, id: string): void {
  const current = input.getAttribute('aria-describedby');
  if (!current?.split(/\s+/u).includes(id)) return;
  const remaining = current
    .split(/\s+/u)
    .filter((value) => value && value !== id);
  if (remaining.length)
    input.setAttribute('aria-describedby', remaining.join(' '));
  else input.removeAttribute('aria-describedby');
}

// The configured Clerk UI forwards an English aria-label to this semantic input.
// Bind only this entry's one-time-code control to an owned, localized label.
function bindVerificationCodeLabel(
  root: HTMLDivElement,
  id: string,
): () => void {
  let input: HTMLInputElement | undefined;
  function release(): void {
    if (!input) return;
    const ids = input.getAttribute('aria-labelledby')?.split(/\s+/u) ?? [];
    if (ids.includes(id)) {
      const remaining = ids.filter((value) => value && value !== id);
      if (remaining.length)
        input.setAttribute('aria-labelledby', remaining.join(' '));
      else input.removeAttribute('aria-labelledby');
    }
    input = undefined;
  }
  function bind(): void {
    const element = root.querySelector('input[autocomplete="one-time-code"]');
    const next = element instanceof HTMLInputElement ? element : undefined;
    if (next !== input) {
      release();
      input = next;
    }
    if (!input) return;
    const current = input.getAttribute('aria-labelledby');
    if (!current?.split(/\s+/u).includes(id))
      input.setAttribute('aria-labelledby', current ? id + ' ' + current : id);
  }
  bind();
  const observer = new MutationObserver(bind);
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['autocomplete', 'aria-labelledby'],
  });
  return () => {
    observer.disconnect();
    release();
  };
}

export function ClerkNativeValidation({ children }: { children: ReactNode }) {
  const copy = useClerkNativeValidationCopy();
  const descriptionId = useId();
  const verificationCodeLabelId = useId();
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (root.current)
      return bindVerificationCodeLabel(root.current, verificationCodeLabelId);
  }, [verificationCodeLabelId]);
  const input = useRef<HTMLInputElement | undefined>(undefined);
  const [problem, setProblem] = useState<EmailProblem>();
  const releaseDescription = useCallback(() => {
    if (input.current) removeDescription(input.current, descriptionId);
    input.current = undefined;
  }, [descriptionId]);
  const clearFeedback = useCallback(() => {
    releaseDescription();
    setProblem(undefined);
  }, [releaseDescription]);

  useEffect(() => releaseDescription, [releaseDescription]);
  useEffect(() => {
    window.addEventListener('hashchange', clearFeedback);
    return () => window.removeEventListener('hashchange', clearFeedback);
  }, [clearFeedback]);
  const message = problem === undefined ? undefined : copy[problem];
  useLayoutEffect(() => {
    if (!problem || !input.current) return;
    if (!input.current.isConnected) clearFeedback();
    else addDescription(input.current, descriptionId);
  }, [problem, message, descriptionId, clearFeedback]);

  function showNativeFeedback(event: FormEvent<HTMLDivElement>): void {
    if (!(event.target instanceof HTMLInputElement)) return;
    const next = emailProblem(event.target);
    if (!next) return;
    // Suppress only the browser-language popup. Native validity still blocks
    // submission; no constraint, custom validity or provider state is changed.
    event.preventDefault();
    if (input.current !== event.target) releaseDescription();
    input.current = event.target;
    addDescription(event.target, descriptionId);
    setProblem(next);
  }

  function refreshNativeFeedback(event: FormEvent<HTMLDivElement>): void {
    if (event.target !== input.current || !input.current) return;
    const next = emailProblem(input.current);
    if (next) setProblem(next);
    else clearFeedback();
  }

  return (
    <div
      className="invitation-authentication"
      ref={root}
      onInvalidCapture={showNativeFeedback}
      onInputCapture={refreshNativeFeedback}
    >
      {children}
      <span hidden id={verificationCodeLabelId}>
        {copy.verificationCode}
      </span>
      {message && (
        <p id={descriptionId} role="alert" className="invitation-native-error">
          {message}
        </p>
      )}
    </div>
  );
}
