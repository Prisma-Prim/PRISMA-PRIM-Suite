import { Menu, X } from 'lucide-react';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  PrismeMark,
  PrismeOverview,
  SectionIcon,
} from './prisme/PrismeOverview';
import { prismeCopy as copy } from './prisme/prisme.copy';
import { ApplicationPresentation } from './application-presentation';
import './application-shell.css';
import './prisme/prisme-frame.css';

export interface ApplicationSection {
  id: 'clients' | 'access' | 'companies' | 'activity' | 'invitations';
  label: string;
  description: string;
  content: ReactNode;
}

export interface FrameContext {
  actorName: string;
  workspaceName: string;
  companyName: string | undefined;
}

interface ApplicationShellProps {
  context: FrameContext;
  sections: readonly ApplicationSection[];
  companyContext: ReactNode;
  userArea: ReactNode;
  children: ReactNode;
}

export function ApplicationContentSurface({
  children,
}: {
  children: ReactNode;
}) {
  return <section className="production-content-surface">{children}</section>;
}

export function ApplicationShell({
  context,
  sections,
  companyContext,
  userArea,
  children,
}: ApplicationShellProps) {
  const [location, setLocation] = useState(() => window.location.href);
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const presentationControlRef = useRef<HTMLButtonElement>(null);
  const previousHash = useRef(window.location.hash);
  const url = new URL(location);
  const isPrisme = url.searchParams.get('frame') === 'prisme';
  const previousPresentation = useRef(isPrisme);
  // URL fragments only select from the sections already authorized by App.
  const selected = sections.find((section) => `#${section.id}` === url.hash);

  useEffect(() => {
    const onLocationChange = () => {
      setLocation(window.location.href);
      setIsNavigationOpen(false);
    };
    window.addEventListener('hashchange', onLocationChange);
    window.addEventListener('popstate', onLocationChange);
    return () => {
      window.removeEventListener('hashchange', onLocationChange);
      window.removeEventListener('popstate', onLocationChange);
    };
  }, []);

  useEffect(() => {
    const presentationChanged = previousPresentation.current !== isPrisme;
    if (isPrisme && (presentationChanged || previousHash.current !== url.hash))
      titleRef.current?.focus();
    else if (presentationChanged) {
      const menuButton = menuButtonRef.current;
      if (menuButton && menuButton.getClientRects().length > 0)
        menuButton.focus();
      else presentationControlRef.current?.focus();
    }
    previousPresentation.current = isPrisme;
    previousHash.current = url.hash;
  }, [isPrisme, url.hash]);

  function changePresentation() {
    const nextUrl = new URL(window.location.href);
    if (isPrisme) nextUrl.searchParams.delete('frame');
    else nextUrl.searchParams.set('frame', 'prisme');
    window.history.replaceState(window.history.state, '', nextUrl);
    setLocation(nextUrl.href);
    setIsNavigationOpen(false);
  }

  function closeNavigation() {
    setIsNavigationOpen(false);
    if (isPrisme) titleRef.current?.focus();
  }

  function navigate(event: ReactMouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      (event.currentTarget.target && event.currentTarget.target !== '_self')
    )
      return;
    if (!isPrisme) {
      closeNavigation();
      return;
    }
    event.preventDefault();
    const nextUrl = event.currentTarget.href;
    if (nextUrl !== window.location.href) {
      // Transport opaque session recovery state; its owning module validates it.
      const preservedState: unknown = window.history.state;
      window.history.pushState(preservedState, '', nextUrl);
    }
    setLocation(window.location.href);
    closeNavigation();
  }
  function handleNavigationKeyDown(event: ReactKeyboardEvent) {
    if (event.key === 'Escape' && isNavigationOpen) {
      setIsNavigationOpen(false);
      menuButtonRef.current?.focus();
    }
  }

  const presentationControl = (
    <button
      ref={presentationControlRef}
      className="frame-presentation-control"
      type="button"
      onClick={changePresentation}
    >
      {isPrisme ? copy.returnToClassic : copy.optIn}
    </button>
  );
  const menuControl = (
    <button
      ref={menuButtonRef}
      className="production-menu-button"
      type="button"
      aria-controls="primary-navigation"
      aria-expanded={isNavigationOpen}
      aria-label={isNavigationOpen ? copy.closeNavigation : copy.openNavigation}
      onClick={() => setIsNavigationOpen((isOpen) => !isOpen)}
    >
      {isNavigationOpen ? (
        <X aria-hidden="true" />
      ) : (
        <Menu aria-hidden="true" />
      )}
    </button>
  );

  return (
    <div
      className={`production-shell${isPrisme ? ' prisme-shell' : ''}`}
      onKeyDown={handleNavigationKeyDown}
    >
      {isPrisme && (
        <a
          className="prisme-skip-link"
          href="#prisme-page-title"
          onClick={(event) => {
            event.preventDefault();
            closeNavigation();
          }}
        >
          {copy.skipToContent}
        </a>
      )}
      <header className="production-header">
        {isPrisme ? (
          <>
            {menuControl}
            <div className="prisme-breadcrumb">
              <span>{context.workspaceName}</span>
              <strong>{context.companyName ?? copy.noCompany}</strong>
            </div>
            <span className="prisme-presentation-label">
              {copy.presentation}
            </span>
          </>
        ) : (
          <>
            <a
              className="production-brand"
              href="/"
              aria-label={copy.brandHome}
            >
              <span className="production-brand-mark" aria-hidden="true">
                P
              </span>
              <span>
                <strong>PRISMA-PRIM</strong>
                <small>Suite</small>
              </span>
            </a>
            <div className="production-user-area">
              {userArea}
              {presentationControl}
            </div>
            {menuControl}
          </>
        )}
      </header>
      <div className="production-body">
        <nav
          id="primary-navigation"
          className="production-navigation"
          aria-label={copy.navigation}
          data-open={isNavigationOpen}
        >
          {isPrisme && (
            <>
              <a
                className="prisme-brand"
                onClick={navigate}
                href="#overview"
                aria-label={copy.brandHome}
              >
                <PrismeMark />
                <span>
                  <strong>PRISMA</strong>
                  <small>{copy.brandTagline}</small>
                </span>
              </a>
              <div className="prisme-company-selector">{companyContext}</div>
            </>
          )}
          <p className="production-navigation-label">{copy.workspace}</p>
          <ul>
            <li>
              <a
                href={isPrisme ? '#overview' : '/'}
                aria-current={!isPrisme || !selected ? 'page' : undefined}
                onClick={navigate}
              >
                {isPrisme && <SectionIcon id="overview" />}
                {isPrisme ? copy.overview : copy.home}
                {!isPrisme && (
                  <span className="production-active-label">Current</span>
                )}
              </a>
            </li>
            {sections
              .filter((section) => isPrisme || section.id === 'clients')
              .map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    aria-current={
                      isPrisme && selected?.id === section.id
                        ? 'page'
                        : undefined
                    }
                    onClick={navigate}
                  >
                    {isPrisme && <SectionIcon id={section.id} />}
                    {section.label}
                  </a>
                </li>
              ))}
          </ul>
          {isPrisme && (
            <div className="prisme-sidebar-bottom">
              {presentationControl}
              <div className="prisme-user-area">{userArea}</div>
            </div>
          )}
        </nav>
        <main className="production-content">
          {isPrisme ? (
            <>
              <div className="prisme-page-heading">
                <p className="prisme-eyebrow">{context.workspaceName}</p>
                <h1 id="prisme-page-title" tabIndex={-1} ref={titleRef}>
                  {selected?.label ?? copy.greeting(context.actorName)}
                </h1>
                <p>{selected?.description ?? copy.introduction}</p>
              </div>
              {!selected && (
                <PrismeOverview
                  context={context}
                  sections={sections}
                  onNavigate={navigate}
                />
              )}
            </>
          ) : (
            children
          )}
          {!isPrisme && companyContext}
          <ApplicationPresentation value={isPrisme ? 'prisme' : 'classic'}>
            <div className="application-sections">
              {sections.map((section) => (
                <div
                  className="application-section"
                  key={section.id}
                  hidden={isPrisme && selected?.id !== section.id}
                >
                  {section.content}
                </div>
              ))}
            </div>
          </ApplicationPresentation>
        </main>
      </div>
    </div>
  );
}
