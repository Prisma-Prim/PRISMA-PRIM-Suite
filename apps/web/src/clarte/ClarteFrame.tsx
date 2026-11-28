import { Bell, Ellipsis, LogOut, Search } from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  RecentChanges,
  type RecentChangesProps,
} from '../operational-home/RecentChanges';
import {
  sectionsOwningFocusTarget,
  type ApplicationSection,
} from '../production-shell/application-section';
import { SectionVisibility } from '../production-shell/section-visibility';
import { ClarteJumpList, type ClarteJumpDestination } from './ClarteJumpList';
import { ClarteLanguageChoice } from './ClarteLanguageChoice';
import { ClarteMark } from './ClarteMark';
import {
  clarteEntries,
  clartePhoneEntries,
  renderCurrentScreen,
  type ClarteDestinationId,
  type ClarteEntry,
  type ClarteScreen,
  type ClarteTabRenderer,
} from './clarte-entries';
import { useClarteFrameCopy } from './clarte-frame.copy';
import { ClarteTabs } from './components/ClarteTabs';
import { useInterfacePreference } from './InterfacePreferenceProvider';
import './clarte-tokens.css';
import './clarte-frame.css';
import './components/clarte-components.css';

export type ClarteFrameContext = Readonly<{
  actorName: string;
  workspaceName: string;
  companyName: string | undefined;
}>;

export type ClarteUser = Readonly<{
  name: string;
  email: string;
  onSignOut: () => void;
}>;

export type ClarteFrameProps = Readonly<{
  context: ClarteFrameContext;
  /** App's authorized section composition, the same list the current shell receives. */
  sections: readonly ApplicationSection[];
  /** App's active Company selector, with its own remount and draft rules. */
  companyContext: ReactNode;
  user: ClarteUser;
  /** Today's current screen: App's overview composition. */
  overview: ReactNode;
  /** Today's Clarté screen, once the Today slice composes one in App. */
  clarteOverview?: ReactNode;
  /** The latest Activity Log changes, offered exactly where the current overview shows them. */
  recentChanges: RecentChangesProps | undefined;
  /** Retires a pending continuation when the user deliberately leaves its view. */
  onNavigate?: () => void;
  /** A held protected write keeps its screen and Company until the write settles. */
  navigationProtected?: boolean;
}>;

type MenuId = 'jump' | 'recent' | 'user' | 'more';

type OfferedTab = Readonly<{
  screen: ClarteScreen;
  render: ClarteTabRenderer;
}>;

type OfferedEntry = Readonly<{
  entry: ClarteEntry;
  label: string;
  tabs: readonly [OfferedTab, ...OfferedTab[]];
}>;

/** The entries App's composition offers, each with only its offered tabs. */
function offeredEntries(
  screens: ReadonlyMap<ClarteDestinationId, ClarteScreen>,
  label: (entry: ClarteEntry) => string,
): OfferedEntry[] {
  return clarteEntries.flatMap((entry: ClarteEntry) => {
    const tabs = entry.tabs.flatMap((tab): OfferedTab[] => {
      const screen = screens.get(tab.destination);
      return screen ? [{ screen, render: tab.render }] : [];
    });
    const [first, ...rest] = tabs;
    if (!first) return [];
    const offered: OfferedEntry = {
      entry,
      label: label(entry),
      tabs: [first, ...rest],
    };
    return [offered];
  });
}

function hrefOf(destination: ClarteDestinationId): string {
  const url = new URL(window.location.href);
  url.hash = destination;
  return url.href;
}

/**
 * The Clarté frame (#1530): left menu, top bar, screen title with views,
 * phone bottom bar and jump list around App's authorized composition. Like
 * the current shell it keeps every section mounted while hidden, selects
 * only authorized sections from the URL fragment and holds navigation while
 * a protected write is in progress. It owns no data, request or permission.
 */
export function ClarteFrame({
  context,
  sections,
  companyContext,
  user,
  overview,
  clarteOverview,
  recentChanges,
  onNavigate,
  navigationProtected = false,
}: ClarteFrameProps) {
  const copy = useClarteFrameCopy();
  const { leave, claimLanguageControl } = useInterfacePreference();
  const [location, setLocation] = useState(() => window.location.href);
  const navigation = useRef({ protected: navigationProtected, href: location });
  navigation.current.protected = navigationProtected;
  const [openMenu, setOpenMenu] = useState<MenuId>();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const jumpTrigger = useRef<HTMLButtonElement>(null);
  const recentTrigger = useRef<HTMLButtonElement>(null);
  const userTrigger = useRef<HTMLButtonElement>(null);
  const moreTrigger = useRef<HTMLButtonElement>(null);
  const recentArea = useRef<HTMLDivElement>(null);
  const userArea = useRef<HTMLDivElement>(null);
  const moreArea = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const previousHash = useRef(window.location.hash);
  const url = new URL(location);
  // URL fragments only select from the sections already authorized by App.
  const entered = useRef(new Set<ApplicationSection['id']>());
  const selected = sections.find((section) => `#${section.id}` === url.hash);
  if (selected) entered.current.add(selected.id);

  // The frame offers the interface language in its user menu while mounted.
  useLayoutEffect(() => claimLanguageControl(), [claimLanguageControl]);

  useEffect(() => {
    const onLocationChange = () => {
      const next = new URL(window.location.href);
      const accepted = new URL(navigation.current.href);
      if (navigation.current.protected && next.hash !== accepted.hash) {
        next.hash = accepted.hash;
        // Opaque recovery state of other modules travels unchanged.
        const preservedState: unknown = window.history.state;
        window.history.replaceState(preservedState, '', next);
      }
      navigation.current.href = next.href;
      setLocation(next.href);
      setOpenMenu(undefined);
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
      // The screen title and its views sit just above the destination.
      document.documentElement.scrollTop = 0;
      destination?.focus({ preventScroll: true });
    } else if (fragmentChanged) titleRef.current?.focus();
    previousHash.current = url.hash;
  }, [url.hash]);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === 'k'
      ) {
        event.preventDefault();
        openFrom('jump', jumpTrigger);
      }
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, []);

  useEffect(() => {
    const area =
      openMenu === 'recent'
        ? recentArea
        : openMenu === 'user'
          ? userArea
          : openMenu === 'more'
            ? moreArea
            : undefined;
    if (!area) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!area.current?.contains(target)) setOpenMenu(undefined);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [openMenu]);

  useEffect(() => {
    if (!openMenu) return;
    // A control that handles Escape itself stops it before it reaches here.
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismissMenu();
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [openMenu]);

  function openFrom(menu: MenuId, trigger: RefObject<HTMLElement | null>) {
    const focused = document.activeElement;
    returnFocus.current =
      focused instanceof HTMLElement && focused !== document.body
        ? focused
        : trigger.current;
    setOpenMenu(menu);
  }

  function toggle(menu: MenuId, trigger: RefObject<HTMLElement | null>) {
    if (openMenu === menu) setOpenMenu(undefined);
    else openFrom(menu, trigger);
  }

  function dismissMenu() {
    setOpenMenu(undefined);
    const target = returnFocus.current;
    if (target?.isConnected) target.focus();
  }

  function go(href: string) {
    onNavigate?.();
    if (href !== window.location.href) {
      // Transport opaque session recovery state; its owning module validates it.
      const preservedState: unknown = window.history.state;
      window.history.pushState(preservedState, '', href);
    }
    navigation.current.href = window.location.href;
    setLocation(window.location.href);
    setOpenMenu(undefined);
    titleRef.current?.focus();
  }

  function held(href: string): boolean {
    return (
      navigation.current.protected &&
      new URL(href).hash !== new URL(navigation.current.href).hash
    );
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
    event.preventDefault();
    if (held(event.currentTarget.href)) return;
    go(event.currentTarget.href);
  }

  function jumpTo(destination: ClarteDestinationId) {
    const href = hrefOf(destination);
    if (held(href)) dismissMenu();
    else go(href);
  }

  const overviewScreen: ClarteScreen = {
    id: 'overview',
    label: copy.entry('today'),
    description: copy.greeting(context.actorName),
    content: overview,
    clarteContent: clarteOverview,
  };
  const screens = new Map<ClarteDestinationId, ClarteScreen>([
    ['overview', overviewScreen],
    ...sections.map((section): [ClarteDestinationId, ClarteScreen] => [
      section.id,
      section,
    ]),
  ]);
  const entries = offeredEntries(screens, (entry) => copy.entry(entry.id));
  const selectedId: ClarteDestinationId = selected?.id ?? 'overview';
  const activeEntry = entries.find((offered) =>
    offered.tabs.some((tab) => tab.screen.id === selectedId),
  );
  const selectedScreen = selected ?? overviewScreen;
  const renderers = new Map(
    entries.flatMap((offered) =>
      offered.tabs.map((tab): [ClarteDestinationId, ClarteTabRenderer] => [
        tab.screen.id,
        tab.render,
      ]),
    ),
  );
  const renderScreen = (screen: ClarteScreen) =>
    (renderers.get(screen.id) ?? renderCurrentScreen)(screen);
  const jumpDestinations: ClarteJumpDestination[] = entries.flatMap((offered) =>
    offered.tabs.map((tab) => ({
      id: tab.screen.id,
      label: tab.screen.id === 'overview' ? offered.label : tab.screen.label,
      entryLabel: offered.label,
    })),
  );
  const phoneEntries = entries.filter((offered) =>
    clartePhoneEntries.has(offered.entry.id),
  );
  const moreEntries = entries.filter(
    (offered) => !clartePhoneEntries.has(offered.entry.id),
  );
  const initials = user.name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase())
    .join('');

  const entryLink = (offered: OfferedEntry) => {
    const Icon = offered.entry.icon;
    return (
      <li key={offered.entry.id}>
        <a
          href={`#${offered.tabs[0].screen.id}`}
          aria-current={offered === activeEntry ? 'page' : undefined}
          onClick={navigate}
        >
          <Icon aria-hidden="true" />
          <span>{offered.label}</span>
        </a>
      </li>
    );
  };

  return (
    <div className="clarte-frame">
      <a
        className="clarte-skip-link"
        href="#clarte-screen-title"
        onClick={(event) => {
          event.preventDefault();
          setOpenMenu(undefined);
          titleRef.current?.focus();
        }}
      >
        {copy.skipToContent}
      </a>
      <aside className="clarte-sidebar">
        <div className="clarte-sidebar-content">
          <a
            className="clarte-brand"
            href="#overview"
            aria-label={copy.brandHome}
            onClick={navigate}
          >
            <ClarteMark />
            <span>
              <strong>PRISMA</strong>
              <small>{copy.brandTagline}</small>
            </span>
          </a>
          <nav className="clarte-menu" aria-label={copy.primaryNavigation}>
            <ul>
              {entries
                .filter((offered) => offered.entry.group === 'primary')
                .map(entryLink)}
            </ul>
            <ul className="clarte-menu-secondary">
              {entries
                .filter((offered) => offered.entry.group === 'secondary')
                .map(entryLink)}
            </ul>
          </nav>
        </div>
      </aside>
      <div className="clarte-main">
        <header className="clarte-topbar">
          <button
            ref={jumpTrigger}
            type="button"
            className="clarte-jump-trigger"
            // The phone layout shows only the search icon.
            aria-label={copy.jumpOpen}
            aria-haspopup="dialog"
            aria-expanded={openMenu === 'jump'}
            aria-keyshortcuts="Control+K Meta+K"
            onClick={() => openFrom('jump', jumpTrigger)}
          >
            <Search aria-hidden="true" />
            <span>{copy.jumpOpen}</span>
            <kbd aria-hidden="true">Ctrl K</kbd>
          </button>
          <div className="clarte-company">{companyContext}</div>
          {recentChanges && (
            <div className="clarte-popover" ref={recentArea}>
              <button
                ref={recentTrigger}
                type="button"
                className="clarte-icon-button"
                aria-label={copy.recentChanges}
                aria-expanded={openMenu === 'recent'}
                aria-controls={
                  openMenu === 'recent' ? 'clarte-recent-changes' : undefined
                }
                onClick={() => toggle('recent', recentTrigger)}
              >
                <Bell aria-hidden="true" />
              </button>
              {openMenu === 'recent' && (
                <div
                  id="clarte-recent-changes"
                  className="clarte-popover-panel clarte-recent-panel"
                >
                  <RecentChanges {...recentChanges} />
                </div>
              )}
            </div>
          )}
          <div className="clarte-popover" ref={userArea}>
            <button
              ref={userTrigger}
              type="button"
              className="clarte-avatar-button"
              aria-label={copy.userMenu}
              aria-expanded={openMenu === 'user'}
              aria-controls={
                openMenu === 'user' ? 'clarte-user-menu' : undefined
              }
              onClick={() => toggle('user', userTrigger)}
            >
              <span aria-hidden="true">{initials}</span>
            </button>
            {openMenu === 'user' && (
              <div
                id="clarte-user-menu"
                className="clarte-popover-panel clarte-user-panel"
                role="group"
                aria-label={copy.userMenu}
              >
                <p className="clarte-user-identity">
                  <strong>{user.name}</strong>
                  <span>{user.email}</span>
                </p>
                <ClarteLanguageChoice />
                <div className="clarte-user-actions">
                  <button
                    type="button"
                    className="clarte-button clarte-button--secondary"
                    // Leaving unmounts every section, with a protected write's owner.
                    disabled={navigationProtected}
                    onClick={leave}
                  >
                    {copy.leaveClarte}
                  </button>
                  <button
                    type="button"
                    className="clarte-button clarte-button--quiet"
                    onClick={user.onSignOut}
                  >
                    <LogOut aria-hidden="true" />
                    {copy.signOut}
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>
        <main className="clarte-content">
          <div className="clarte-screen-head">
            <p className="clarte-eyebrow">
              <span>{context.workspaceName}</span>
              <span>{context.companyName ?? copy.noCompany}</span>
            </p>
            <h1 id="clarte-screen-title" tabIndex={-1} ref={titleRef}>
              {activeEntry?.label ?? overviewScreen.label}
            </h1>
            <p className="clarte-screen-description">
              {selectedScreen.description}
            </p>
            {activeEntry && activeEntry.tabs.length > 1 && (
              <ClarteTabs
                label={copy.tabsLabel(activeEntry.label)}
                tabs={activeEntry.tabs.map((tab) => ({
                  href: `#${tab.screen.id}`,
                  label: tab.screen.label,
                  current: tab.screen.id === selectedId,
                }))}
                onNavigate={navigate}
              />
            )}
          </div>
          {!selected && (
            <div className="clarte-overview">
              {renderScreen(overviewScreen)}
            </div>
          )}
          <div className="clarte-sections">
            {sections.map((section) => (
              <div
                className="clarte-section"
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
                    {renderScreen(section)}
                  </SectionVisibility>
                ) : null}
              </div>
            ))}
          </div>
        </main>
      </div>
      <nav className="clarte-bottom-bar" aria-label={copy.phoneNavigation}>
        <ul>
          {phoneEntries.map(entryLink)}
          {moreEntries.length > 0 && (
            <li>
              <div className="clarte-popover" ref={moreArea}>
                <button
                  ref={moreTrigger}
                  type="button"
                  aria-expanded={openMenu === 'more'}
                  aria-controls={
                    openMenu === 'more' ? 'clarte-more' : undefined
                  }
                  data-current={
                    moreEntries.some((offered) => offered === activeEntry) ||
                    undefined
                  }
                  onClick={() => toggle('more', moreTrigger)}
                >
                  <Ellipsis aria-hidden="true" />
                  <span>{copy.more}</span>
                </button>
                {openMenu === 'more' && (
                  <div
                    id="clarte-more"
                    className="clarte-more-sheet"
                    role="group"
                    aria-label={copy.moreTitle}
                  >
                    <ul>{moreEntries.map(entryLink)}</ul>
                  </div>
                )}
              </div>
            </li>
          )}
        </ul>
      </nav>
      {openMenu === 'jump' && (
        <ClarteJumpList
          destinations={jumpDestinations}
          onChoose={jumpTo}
          onDismiss={dismissMenu}
          copy={{
            title: copy.jumpOpen,
            placeholder: copy.jumpPlaceholder,
            inputLabel: copy.jumpInputLabel,
            empty: copy.jumpEmpty,
            hint: copy.jumpHint,
          }}
        />
      )}
    </div>
  );
}
