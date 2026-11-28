import { ChevronRight } from 'lucide-react';
import type { MouseEvent } from 'react';

/**
 * A pointer anywhere on a row opens its record; the row's own button stays
 * the keyboard and assistive path, so a click on it is not counted twice.
 */
export function openFromRow(open: () => void) {
  return (event: MouseEvent<HTMLTableRowElement>) => {
    if (event.target instanceof Element && event.target.closest('button, a'))
      return;
    open();
  };
}

/** The row's visual cue that it opens; the row's button carries its name. */
export function RowChevron() {
  return (
    <td className="clarte-finance-chevron" aria-hidden="true">
      <ChevronRight />
    </td>
  );
}

/** The header cell above the row cues; it names nothing. */
export function RowChevronHead() {
  return <td className="clarte-finance-chevron" aria-hidden="true" />;
}
