import type { MouseEventHandler } from 'react';

export type ClarteTabLink = Readonly<{
  href: string;
  label: string;
  current: boolean;
}>;

/**
 * A row of views of one screen. Each view is a link with its own URL, so
 * Back/Forward, new tabs and the protected-write hold behave like any link.
 */
export function ClarteTabs({
  label,
  tabs,
  onNavigate,
}: Readonly<{
  label: string;
  tabs: readonly ClarteTabLink[];
  onNavigate?: MouseEventHandler<HTMLAnchorElement>;
}>) {
  return (
    <nav className="clarte-tabs" aria-label={label}>
      <ul>
        {tabs.map((tab) => (
          <li key={tab.href}>
            <a
              href={tab.href}
              aria-current={tab.current ? 'page' : undefined}
              onClick={onNavigate}
            >
              {tab.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
