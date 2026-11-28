import {
  Building2,
  FileSignature,
  FileText,
  History,
  Languages,
  ListChecks,
  MailPlus,
  Percent,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import type { ClarteDestinationId } from '../clarte-entries';
import type { SettingsGroup } from './settings-console.copy';

export type SettingsSection = Readonly<{
  destination: ClarteDestinationId;
  group: SettingsGroup;
  icon: LucideIcon;
  /**
   * `clarte`: the Clarté screen App composed as `clarteContent`, under the
   * console's section title. `current`: the current interface's component,
   * with its own title, until the slice that migrates the section switches it.
   */
  screen: 'clarte' | 'current';
}>;

/** The console's groups, in display order. */
export const settingsGroups: readonly SettingsGroup[] = [
  'you',
  'organisation',
  'commercial',
  'traceability',
];

/**
 * The Settings console's sections in display order. To add a section, add
 * one row here: the console lists it under its group for the actors App
 * offers it to, and shows its screen. See README.md, "Settings".
 */
export const settingsSections: readonly SettingsSection[] = [
  {
    destination: 'language',
    group: 'you',
    icon: Languages,
    screen: 'clarte',
  },
  {
    destination: 'companies',
    group: 'organisation',
    icon: Building2,
    screen: 'clarte',
  },
  {
    destination: 'access',
    group: 'organisation',
    icon: UsersRound,
    screen: 'clarte',
  },
  {
    destination: 'invitations',
    group: 'organisation',
    icon: MailPlus,
    screen: 'clarte',
  },
  {
    destination: 'catalogue',
    group: 'commercial',
    icon: ListChecks,
    screen: 'current',
  },
  {
    destination: 'pricing',
    group: 'commercial',
    icon: Percent,
    screen: 'current',
  },
  {
    destination: 'offer-models',
    group: 'commercial',
    icon: FileText,
    screen: 'current',
  },
  {
    destination: 'contract-models',
    group: 'commercial',
    icon: FileSignature,
    screen: 'current',
  },
  {
    destination: 'activity',
    group: 'traceability',
    icon: History,
    screen: 'clarte',
  },
];
