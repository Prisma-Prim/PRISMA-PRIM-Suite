import type { MouseEventHandler, ReactNode } from 'react';
import {
  Briefcase,
  Building2,
  Files,
  Lightbulb,
  ListChecks,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { ApplicationSection } from '../production-shell/application-section';
import { settingsTabs } from './settings/settings-tabs';

export type ClarteEntryId =
  | 'today'
  | 'affaires'
  | 'clients'
  | 'missions'
  | 'tasks'
  | 'documents'
  | 'finance'
  | 'improvement'
  | 'settings';

/**
 * Destinations only the Clarté interface has, composed by App and passed to
 * the frame as `clarteScreens`: the current interface never shows them.
 */
export type ClarteOnlyDestinationId = 'settings' | 'language';

/** Every destination the frame shows: Today's overview, App's sections and Clarté-only screens. */
export type ClarteDestinationId =
  'overview' | ApplicationSection['id'] | ClarteOnlyDestinationId;

/**
 * What App composed for one destination, as its tab renderer receives it:
 * `content` is the current interface's component and `clarteContent` the
 * Clarté screen a slice composed next to it in App.
 */
export type ClarteScreen = Omit<ApplicationSection, 'id'> & {
  id: ClarteDestinationId;
};

/** A destination only Clarté shows, with no current-interface component. */
export type ClarteOnlyScreen = Readonly<{
  id: ClarteOnlyDestinationId;
  label: string;
  description: string;
  clarteContent: ReactNode;
}>;

/** One offered view of an entry, as a screen that draws its own views receives it. */
export type ClarteView = Readonly<{
  id: ClarteDestinationId;
  label: string;
  description: string;
  href: string;
}>;

/** The offered views of the entry a screen belongs to. */
export type ClarteEntryViews = Readonly<{
  views: readonly ClarteView[];
  /** Follows a view link through the frame: history, focus and the protected-write hold. */
  onNavigate: MouseEventHandler<HTMLAnchorElement>;
}>;

/**
 * Renders one tab's screen. The frame keeps the screen title, the tab row,
 * mounting, hidden sections, focus and the protected-write hold. An entry
 * whose screens draw their own views receives them as `entry`.
 */
export type ClarteTabRenderer = (
  screen: ClarteScreen,
  entry: ClarteEntryViews,
) => ReactNode;

/** A tab no slice replaced yet shows the current interface's component. */
export const renderCurrentScreen: ClarteTabRenderer = (screen) =>
  screen.content;

/** A migrated tab shows the Clarté screen App composed as `clarteContent`. */
export const renderClarteScreen: ClarteTabRenderer = (screen) =>
  screen.clarteContent;

export type ClarteTab = Readonly<{
  destination: ClarteDestinationId;
  render: ClarteTabRenderer;
}>;

export type ClarteEntry = Readonly<{
  id: ClarteEntryId;
  /** Primary entries come first; secondary ones are set apart below them. */
  group: 'primary' | 'secondary';
  icon: LucideIcon;
  /**
   * `screen`: the entry's screens draw their own list of views and their
   * header, from the views the frame hands their renderer; the frame shows
   * only the entry title. By default the frame draws the row of views.
   */
  viewNavigation?: 'frame' | 'screen';
  /** In display order; the first authorized tab is the entry's landing view. */
  tabs: readonly ClarteTab[];
}>;

/**
 * The one table from App's authorized composition to the Clarté menu: an
 * entry appears only when App offers at least one of its destinations, and
 * each offered destination is one tab. A slice replaces only its own tab's
 * `render` here; see README.md.
 */
export const clarteEntries = [
  {
    id: 'today',
    group: 'primary',
    icon: Sun,
    tabs: [{ destination: 'overview', render: renderCurrentScreen }],
  },
  {
    id: 'affaires',
    group: 'primary',
    icon: Briefcase,
    tabs: [{ destination: 'requests', render: renderCurrentScreen }],
  },
  {
    id: 'clients',
    group: 'primary',
    icon: Building2,
    tabs: [{ destination: 'clients', render: renderCurrentScreen }],
  },
  {
    id: 'missions',
    group: 'primary',
    icon: ShieldCheck,
    tabs: [{ destination: 'projects', render: renderCurrentScreen }],
  },
  {
    id: 'tasks',
    group: 'primary',
    icon: ListChecks,
    tabs: [
      { destination: 'my-tasks', render: renderCurrentScreen },
      { destination: 'unassigned-tasks', render: renderCurrentScreen },
      { destination: 'blocked-tasks', render: renderCurrentScreen },
      { destination: 'team-tasks', render: renderCurrentScreen },
      { destination: 'internal-tasks', render: renderCurrentScreen },
    ],
  },
  {
    id: 'documents',
    group: 'primary',
    icon: Files,
    tabs: [
      { destination: 'documents', render: renderClarteScreen },
      { destination: 'knowledge-evidence', render: renderClarteScreen },
    ],
  },
  {
    id: 'finance',
    group: 'primary',
    icon: Wallet,
    tabs: [
      { destination: 'invoice-records', render: renderCurrentScreen },
      { destination: 'payments', render: renderCurrentScreen },
    ],
  },
  {
    id: 'improvement',
    group: 'secondary',
    icon: Lightbulb,
    tabs: [
      { destination: 'ideas', render: renderCurrentScreen },
      { destination: 'operational-risks', render: renderCurrentScreen },
    ],
  },
  {
    id: 'settings',
    group: 'secondary',
    icon: SlidersHorizontal,
    // The Settings console draws its own list of sections (#1546). Its
    // sections are registered in settings/settings-registry.ts, not here.
    viewNavigation: 'screen',
    tabs: settingsTabs,
  },
] as const satisfies readonly ClarteEntry[];

/** The entries the phone bottom bar shows; every other one is under More. */
export const clartePhoneEntries: ReadonlySet<ClarteEntryId> = new Set([
  'today',
  'affaires',
  'tasks',
  'documents',
]);
