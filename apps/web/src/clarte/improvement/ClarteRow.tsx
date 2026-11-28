import { ChevronRight } from 'lucide-react';
import type { MouseEvent } from 'react';

/**
 * A pointer anywhere on a row opens its record through the row's own
 * button, which stays the keyboard and assistive path and the element focus
 * returns to; a click on a control of the row is not counted twice.
 */
export function openRowButton(event: MouseEvent<HTMLTableRowElement>) {
  if (
    event.target instanceof Element &&
    event.target.closest('button, a, input, label, select, textarea')
  )
    return;
  event.currentTarget
    .querySelector<HTMLButtonElement>('button:not(:disabled)')
    ?.click();
}

/** The row's visual cue that it opens; the row's button carries its name. */
export function RowChevron() {
  return (
    <td className="clarte-improvement-chevron" aria-hidden="true">
      <ChevronRight />
    </td>
  );
}

/** The header cell above the row cues; it names nothing. */
export function RowChevronHead() {
  return <td className="clarte-improvement-chevron" aria-hidden="true" />;
}
