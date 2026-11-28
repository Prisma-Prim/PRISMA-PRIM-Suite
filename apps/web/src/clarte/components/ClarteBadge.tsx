import type { ReactNode } from 'react';

export type ClarteTone =
  'neutral' | 'accent' | 'info' | 'success' | 'warning' | 'danger';

/**
 * A chip or status badge. Its text states the status; the tone only adds
 * colour. The prism colours stay reserved for the seven deal stages.
 */
export function ClarteBadge({
  tone = 'neutral',
  children,
}: Readonly<{ tone?: ClarteTone; children: ReactNode }>) {
  return (
    <span className={`clarte-badge clarte-badge--${tone}`}>{children}</span>
  );
}
