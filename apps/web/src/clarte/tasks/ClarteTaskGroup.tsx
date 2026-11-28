import { useId, type ReactNode } from 'react';
import { useInterfaceLocale } from '../../localization/interface-locale';

/**
 * One group of a Tasks view: its heading with the number of rows it holds
 * on this page, and its rows in a card. `late` colours a past-due heading.
 */
export function ClarteTaskGroup({
  heading,
  count,
  late = false,
  children,
}: Readonly<{
  heading: string;
  count: number;
  late?: boolean;
  children: ReactNode;
}>) {
  const { formatNumber } = useInterfaceLocale();
  const headingId = useId();
  return (
    <section
      className="clarte-task-group"
      data-late={late || undefined}
      aria-labelledby={headingId}
    >
      <h2 id={headingId} className="clarte-task-group-head">
        {heading}
        <span>{formatNumber(count)}</span>
      </h2>
      <div className="clarte-card clarte-task-card">{children}</div>
    </section>
  );
}
