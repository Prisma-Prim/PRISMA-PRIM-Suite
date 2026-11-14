import { SectionVisibility } from './section-visibility';
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
import { usePrismeCopy } from './prisme/prisme.copy';
import './application-shell.css';
import './prisme/prisme-frame.css';

export interface ApplicationSection {
  id:
    | 'payments'
    | 'invoice-records'
    | 'knowledge-evidence'
    | 'internal-tasks'
    | 'ideas'
    | 'operational-risks'
    | 'documents'
    | 'requests'
    | 'catalogue'
    | 'pricing'
    | 'offer-models'
    | 'contract-models'
    | 'projects'
    | 'my-tasks'
    | 'unassigned-tasks'
    | 'blocked-tasks'
    | 'team-tasks'
    | 'clients'
    | 'access'
    | 'companies'
    | 'activity'
    | 'invitations';
  label: string;
  description: string;
  content: ReactNode;
  /** A fresh read-only view retires requests and rows on section navigation. */
  mountWhenSelected?: true;
  /** Retain the scoped owner after deliberate entry; it owns fresh-return reads. */
  retainAfterSelection?: true;
}

/**
 * These sections render their own focusable destination; the layout wrapper
 * generates no box, so it cannot receive navigation focus.
 */
const sectionsOwningFocusTarget: ReadonlySet<ApplicationSection['id']> =
  new Set([
    'payments',
    'invoice-records',
    'knowledge-evidence',
    'internal-tasks',
    'ideas',
    'operational-risks',
    'clients',
    'documents',
    'projects',
    'requests',
    'my-tasks',
    'unassigned-tasks',
    'blocked-tasks',
    'team-tasks',
    'activity',
  ]);

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
  /** Optional overview content between the Prisme hero and its capabilities. */
  overviewSummary?: ReactNode;
  /** Retires a pending continuation when the user deliberately leaves its view. */
  onNavigate?: () => void;
  /** A held Source write keeps its section until the write settles. */
  navigationProtected?: boolean;
}

export function ApplicationShell({
  context,
  sections,
  companyContext,
  userArea,
  overviewSummary,
  onNavigate,
  navigationProtected = false,
}: ApplicationShellProps) {
  const copy = usePrismeCopy();
  const [location, setLocation] = useState(() => window.location.href);
  const navigation = useRef({ protected: navigationProtected, href: location });
  navigation.current.protected = navigationProtected;
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const previousHash = useRef(window.location.hash);
  const url = new URL(location);
  // URL fragments only select from the sections already authorized by App.
  const entered = useRef(new Set<ApplicationSection['id']>());
  const selected = sections.find((section) => `#${section.id}` === url.hash);

  if (selected) entered.current.add(selected.id);

  useEffect(() => {
    const onLocationChange = () => {
      const next = new URL(window.location.href);
      const accepted = new URL(navigation.current.href);
      if (navigation.current.protected && next.hash !== accepted.hash) {
        next.hash = accepted.hash;
        window.history.replaceState(window.history.state, '', next);
      }
      navigation.current.href = next.href;
      setLocation(next.href);
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
    const fragmentChanged = previousHash.current !== url.hash;
    if (fragmentChanged && selected) {
      const destination = document.getElementById(selected.id);
      destination?.scrollIntoView?.({ block: 'start' });
      destination?.focus();
    } else if (fragmentChanged) titleRef.current?.focus();
    previousHash.current = url.hash;
  }, [url.hash]);

  function closeNavigation() {
    setIsNavigationOpen(false);
    titleRef.current?.focus();
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
    if (
      navigation.current.protected &&
      new URL(event.currentTarget.href).hash !==
        new URL(navigation.current.href).hash
    ) {
      event.preventDefault();
      return;
    }
    onNavigate?.();
    event.preventDefault();
    const nextUrl = event.currentTarget.href;
    if (nextUrl !== window.location.href) {
      // Transport opaque session recovery state; its owning module validates it.
      const preservedState: unknown = window.history.state;
      window.history.pushState(preservedState, '', nextUrl);
    }
    navigation.current.href = window.location.href;
    setLocation(window.location.href);
    closeNavigation();
  }
  function handleNavigationKeyDown(event: ReactKeyboardEvent) {
    if (event.key === 'Escape' && isNavigationOpen) {
      setIsNavigationOpen(false);
      menuButtonRef.current?.focus();
    }
  }

  return (
    <div
      className="production-shell prisme-shell"
      onKeyDown={handleNavigationKeyDown}
    >
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
      <header className="production-header">
        <button
          ref={menuButtonRef}
          className="production-menu-button"
          type="button"
          aria-controls="primary-navigation"
          aria-expanded={isNavigationOpen}
          aria-label={
            isNavigationOpen ? copy.closeNavigation : copy.openNavigation
          }
          onClick={() => setIsNavigationOpen((isOpen) => !isOpen)}
        >
          {isNavigationOpen ? (
            <X aria-hidden="true" />
          ) : (
            <Menu aria-hidden="true" />
          )}
        </button>
        <div className="prisme-breadcrumb">
          <span>{context.workspaceName}</span>
          <strong>{context.companyName ?? copy.noCompany}</strong>
        </div>
        <span className="prisme-presentation-label">{copy.presentation}</span>
      </header>
      <div className="production-body">
        <nav
          id="primary-navigation"
          className="production-navigation"
          aria-label={copy.navigation}
          data-open={isNavigationOpen}
        >
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
          <p className="production-navigation-label">{copy.workspace}</p>
          <ul>
            <li>
              <a
                href="#overview"
                aria-current={selected ? undefined : 'page'}
                onClick={navigate}
              >
                <SectionIcon id="overview" />
                {copy.overview}
              </a>
            </li>
            {sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  aria-current={
                    selected?.id === section.id ? 'page' : undefined
                  }
                  onClick={navigate}
                >
                  <SectionIcon id={section.id} />
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="prisme-sidebar-bottom">
            <div className="prisme-user-area">{userArea}</div>
          </div>
        </nav>
        <main className="production-content">
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
              summary={overviewSummary}
              onNavigate={navigate}
            />
          )}
          <div className="application-sections">
            {sections.map((section) => (
              <div
                className="application-section"
                key={section.id}
                id={
                  sectionsOwningFocusTarget.has(section.id)
                    ? undefined
                    : section.id
                }
                tabIndex={
                  sectionsOwningFocusTarget.has(section.id) ? undefined : -1
                }
                hidden={selected?.id !== section.id}
              >
                {!section.mountWhenSelected ||
                selected?.id === section.id ||
                (section.retainAfterSelection &&
                  entered.current.has(section.id)) ? (
                  <SectionVisibility value={selected?.id === section.id}>
                    {section.content}
                  </SectionVisibility>
                ) : null}
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
