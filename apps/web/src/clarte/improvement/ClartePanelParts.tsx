import type { RefObject } from 'react';
import { useClarteImprovementCopy } from './clarte-improvement.copy';

export type ClartePanelPart = Readonly<{
  label: string;
  /** The part's focusable heading; the part is skipped while it is absent. */
  heading: RefObject<HTMLHeadingElement | null>;
  selected?: boolean;
  onSelect?: () => void;
}>;

/**
 * The parts of a long side panel, one button each: it scrolls the part into
 * view and moves focus to its heading. The URL fragment is left alone,
 * because it selects the screen in the frame.
 */
export function ClartePanelParts({
  parts,
}: Readonly<{ parts: readonly ClartePanelPart[] }>) {
  const text = useClarteImprovementCopy();
  return (
    <nav className="clarte-improvement-parts" aria-label={text('panelParts')}>
      {parts.map((part) => (
        <button
          key={part.label}
          type="button"
          aria-pressed={part.selected}
          onClick={() => {
            const heading = part.heading.current;
            if (!heading) return;
            part.onSelect?.();
            heading.scrollIntoView({ block: 'start' });
            heading.focus({ preventScroll: true });
          }}
        >
          {part.label}
        </button>
      ))}
    </nav>
  );
}
