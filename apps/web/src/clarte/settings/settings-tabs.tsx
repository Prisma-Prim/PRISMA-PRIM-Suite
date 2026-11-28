import type { ClarteTab, ClarteTabRenderer } from '../clarte-entries';
import { SettingsConsole } from './SettingsConsole';
import { settingsSections } from './settings-registry';

/** Every Settings screen, the console's home included, inside the console. */
export const renderSettingsConsole: ClarteTabRenderer = (screen, entry) => (
  <SettingsConsole screen={screen} entry={entry} />
);

/** The Settings entry's tabs: the console's home first, then each section. */
export const settingsTabs: readonly ClarteTab[] = [
  { destination: 'settings', render: renderSettingsConsole },
  ...settingsSections.map((section): ClarteTab => ({
    destination: section.destination,
    render: renderSettingsConsole,
  })),
];
