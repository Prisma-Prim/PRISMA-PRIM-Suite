import { fireEvent, screen, within } from '@testing-library/react';
import type { InterfacePreference } from '../clarte/interface-preference';
import { changeValue } from './select-option';

/**
 * The opened Project's sections that the Clarté mission space shows in a side
 * panel, with the header button that opens it. The current interface shows
 * them inline in the Project detail. The switch-over (#1548) keeps only the
 * Clarté steps.
 */
const clartePanels = {
  Lifecycle: { opener: 'Lifecycle', panel: 'Project lifecycle' },
  'Responsible member': { opener: 'Owner', panel: 'Project owner' },
  'Project next action': {
    opener: /^(Change|History)$/u,
    panel: 'Project next action',
  },
} as const;
export type PanelledProjectSection = keyof typeof clartePanels;

/** The menu entry that leads to the Projects section. */
export function projectsMenuLabel(appInterface: InterfacePreference) {
  return appInterface === 'current' ? 'Projects' : 'Missions and audits';
}

/**
 * One section of the opened Project `detail`: inline in the current
 * interface, inside its panel in Clarté, which this opens when closed.
 */
export function projectDetailSection(
  appInterface: InterfacePreference,
  detail: HTMLElement,
  name: PanelledProjectSection,
): HTMLElement {
  if (appInterface === 'current')
    return within(detail).getByRole('region', { name });
  const { opener, panel } = clartePanels[name];
  if (!screen.queryByRole('dialog', { name: panel }))
    fireEvent.click(within(detail).getByRole('button', { name: opener }));
  return within(screen.getByRole('dialog', { name: panel })).getByRole(
    'region',
    { name },
  );
}

/** The listed Project's row: a list item, or a table row in Clarté. */
export function projectRowOf(button: HTMLElement): HTMLElement {
  const row = button.closest<HTMLElement>('li, tr');
  if (!row) throw new Error('The Project button is not in a listed row.');
  return row;
}

/**
 * Clarté shows an opened Project instead of the list: its "Back to Projects"
 * button returns to the list. The current interface shows both at once.
 */
export function showProjectList(
  appInterface: InterfacePreference,
  projects: HTMLElement,
) {
  if (appInterface === 'current') return;
  const back = within(projects).queryByRole('button', {
    name: 'Back to Projects',
  });
  if (back) fireEvent.click(back);
}

const registrationPanels = {
  preparatory: {
    opener: 'Preparatory Project',
    panel: 'New preparatory Project',
  },
  template: {
    opener: 'From a template',
    panel: 'Create a Project from a template',
  },
} as const;

/**
 * Where a Project is registered: the form beside the list in the current
 * interface, the creation panel in Clarté, which this opens from the list.
 */
export function registrationForm(
  appInterface: InterfacePreference,
  projects: HTMLElement,
  kind: keyof typeof registrationPanels,
): HTMLElement {
  if (appInterface === 'current') return projects;
  const { opener, panel } = registrationPanels[kind];
  const open = screen.queryByRole('dialog', { name: panel });
  if (open) return open;
  showProjectList(appInterface, projects);
  fireEvent.click(within(projects).getByRole('button', { name: opener }));
  return screen.getByRole('dialog', { name: panel });
}

/** The mission space views; the current interface shows these sections at once. */
export function showProjectView(
  appInterface: InterfacePreference,
  detail: HTMLElement,
  view: 'Plan' | 'Current work' | 'Tasks',
) {
  if (appInterface === 'clarte')
    fireEvent.click(within(detail).getByRole('tab', { name: view }));
}

const languageNames = {
  ro: 'Română',
  ru: 'Русский',
  fr: 'Français',
  en: 'English',
} as const;

/**
 * Chooses the interface language: the floating selector of the current
 * interface, or the four choices of Clarté's user menu, which stays open.
 */
export function chooseInterfaceLanguage(
  appInterface: InterfacePreference,
  locale: keyof typeof languageNames,
) {
  if (appInterface === 'current') {
    changeValue(
      screen.getByRole('combobox', {
        name: /Interface language|Limba interfeței|Язык интерфейса|Langue de l’interface/u,
      }),
      locale,
    );
    return;
  }
  if (!screen.queryByRole('radio', { name: languageNames[locale] }))
    fireEvent.click(screen.getByRole('button', { name: 'User menu' }));
  fireEvent.click(screen.getByRole('radio', { name: languageNames[locale] }));
}
