import { Menu, X } from 'lucide-react';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useRef,
  useState,
} from 'react';
import './application-shell.css';

export interface ApplicationNavigationItem {
  href: string;
  label: string;
}

interface ApplicationShellProps {
  activeHref: string;
  navigationItems: readonly ApplicationNavigationItem[];
  userArea: ReactNode;
  children: ReactNode;
}

interface ApplicationContentSurfaceProps {
  children: ReactNode;
}

export function ApplicationContentSurface({
  children,
}: ApplicationContentSurfaceProps) {
  return <section className="production-content-surface">{children}</section>;
}

export function ApplicationShell({
  activeHref,
  navigationItems,
  userArea,
  children,
}: ApplicationShellProps) {
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  function closeNavigation() {
    setIsNavigationOpen(false);
    menuButtonRef.current?.focus();
  }

  function handleNavigationKeyDown(event: ReactKeyboardEvent) {
    if (event.key === 'Escape' && isNavigationOpen) {
      closeNavigation();
    }
  }

  return (
    <div className="production-shell" onKeyDown={handleNavigationKeyDown}>
      <header className="production-header">
        <a
          className="production-brand"
          href="/"
          aria-label="PRISMA-PRIM Suite home"
        >
          <span className="production-brand-mark" aria-hidden="true">
            P
          </span>
          <span>
            <strong>PRISMA-PRIM</strong>
            <small>Suite</small>
          </span>
        </a>

        <div className="production-user-area">{userArea}</div>

        <button
          ref={menuButtonRef}
          className="production-menu-button"
          type="button"
          aria-controls="primary-navigation"
          aria-expanded={isNavigationOpen}
          aria-label={isNavigationOpen ? 'Close navigation' : 'Open navigation'}
          onClick={() => setIsNavigationOpen((isOpen) => !isOpen)}
        >
          {isNavigationOpen ? (
            <X aria-hidden="true" />
          ) : (
            <Menu aria-hidden="true" />
          )}
        </button>
      </header>

      <div className="production-body">
        <nav
          id="primary-navigation"
          className="production-navigation"
          aria-label="Primary navigation"
          data-open={isNavigationOpen}
        >
          <p className="production-navigation-label">Workspace</p>
          <ul>
            {navigationItems.map((item) => {
              const isActive = item.href === activeHref;

              return (
                <li key={item.href}>
                  <a
                    href={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => setIsNavigationOpen(false)}
                  >
                    {item.label}
                    {isActive && (
                      <span className="production-active-label">Current</span>
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <main className="production-content">{children}</main>
      </div>
    </div>
  );
}
