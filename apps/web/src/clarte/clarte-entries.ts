import type { ReactNode } from 'react';
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

/** Every destination the frame shows: Today's overview and App's sections. */
export type ClarteDestinationId = 'overview' | ApplicationSection['id'];

/**
 * What App composed for one destination, as its tab renderer receives it:
 * `content` is the current interface's component and `clarteContent` the
 * Clarté screen a slice composed next to it in App.
 */
export type ClarteScreen = Omit<ApplicationSection, 'id'> & {
  id: ClarteDestinationId;
};

/**
 * Renders one tab's screen. The frame keeps the screen title, the tab row,
 * mounting, hidden sections, focus and the protected-write hold.
 */
export type ClarteTabRenderer = (screen: ClarteScreen) => ReactNode;

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
      { destination: 'invoice-records', render: renderClarteScreen },
      { destination: 'payments', render: renderClarteScreen },
      { destination: 'payment-proofs', render: renderClarteScreen },
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
    tabs: [
      { destination: 'companies', render: renderCurrentScreen },
      { destination: 'access', render: renderCurrentScreen },
      { destination: 'invitations', render: renderCurrentScreen },
      { destination: 'activity', render: renderCurrentScreen },
      { destination: 'catalogue', render: renderCurrentScreen },
      { destination: 'pricing', render: renderCurrentScreen },
      { destination: 'offer-models', render: renderCurrentScreen },
      { destination: 'contract-models', render: renderCurrentScreen },
    ],
  },
] as const satisfies readonly ClarteEntry[];

/** The entries the phone bottom bar shows; every other one is under More. */
export const clartePhoneEntries: ReadonlySet<ClarteEntryId> = new Set([
  'today',
  'affaires',
  'tasks',
  'documents',
]);
