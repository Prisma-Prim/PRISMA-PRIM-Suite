import type { ReactNode } from 'react';
import { useClarteComponentCopy } from './clarte-components.copy';

/** Nothing to show yet: says so plainly and offers the next useful action. */
export function ClarteEmptyState({
  title,
  children,
  action,
}: Readonly<{ title: string; children?: ReactNode; action?: ReactNode }>) {
  return (
    <div className="clarte-state">
      <p className="clarte-state-title">{title}</p>
      {children}
      {action}
    </div>
  );
}

/** A read in progress, announced politely. */
export function ClarteLoadingState({ label }: Readonly<{ label?: string }>) {
  const copy = useClarteComponentCopy();
  return (
    <div className="clarte-state" role="status">
      <span className="clarte-spinner" aria-hidden="true" />
      <p className="clarte-state-title">{label ?? copy.loading}</p>
    </div>
  );
}

/** A failed or refused read, announced at once, with its retry when one exists. */
export function ClarteErrorState({
  title,
  children,
  action,
}: Readonly<{ title: string; children?: ReactNode; action?: ReactNode }>) {
  return (
    <div className="clarte-state clarte-state--error" role="alert">
      <p className="clarte-state-title">{title}</p>
      {children}
      {action}
    </div>
  );
}
