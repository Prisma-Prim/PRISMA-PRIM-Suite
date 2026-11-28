import type { ClarteOnlyScreen } from '../clarte-entries';
import { ClarteLanguageSettings } from './ClarteLanguageSettings';
import { useSettingsConsoleCopy } from './settings-console.copy';

/**
 * The Settings destinations only Clarté has, for App to pass as
 * `clarteScreens`: the console's home, which lists the sections, and
 * Language and region, open to every member.
 */
export function useSettingsConsoleScreens(): readonly ClarteOnlyScreen[] {
  const copy = useSettingsConsoleCopy();
  return [
    {
      id: 'settings',
      label: copy.homeLabel,
      description: copy.homeDescription,
      // The console draws its home from the sections the actor may open.
      clarteContent: null,
    },
    {
      id: 'language',
      label: copy.languageLabel,
      description: copy.languageDescription,
      clarteContent: <ClarteLanguageSettings />,
    },
  ];
}
