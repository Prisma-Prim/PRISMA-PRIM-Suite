import { ClarteClients } from '../clarte/clients/ClarteClients';
import type { InterfacePreference } from '../clarte/interface-preference';
import { ClientWorkspace } from '../client/ClientWorkspace';
import { fireEvent, screen, within } from './render-with-interface-locale';

/**
 * The steps of the Client App tests that differ between the interfaces
 * (#1536). The current interface shows the directory and the selected
 * dossier on one page; Clarté shows one dossier page at a time, with its
 * parts grouped in views. Everything after these steps is the same.
 */
export type ClientDossierView =
  | 'Overview'
  | 'Contacts'
  | 'Legal entities and branches'
  | 'Deals'
  | 'Missions'
  | 'Documents'
  | 'History';

/** Clarté names the current interface's home and sections by their screens. */
const clarteScreenOf: Readonly<Record<string, string>> = {
  Overview: 'Today',
};

/**
 * Opens a section by its current-interface label: its left menu link, or
 * Clarté's jump list, which reaches every screen whatever entry holds it.
 */
export function goToSection(appInterface: InterfacePreference, label: string) {
  if (appInterface === 'current') {
    const primary = screen.getByRole('navigation', {
      name: 'Primary navigation',
    });
    fireEvent.click(within(primary).getByRole('link', { name: label }));
    return;
  }
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
  const field = screen.getByRole('combobox', { name: 'Screen name' });
  fireEvent.change(field, {
    target: { value: clarteScreenOf[label] ?? label },
  });
  fireEvent.keyDown(field, { key: 'Enter' });
}

/**
 * Shows one view of the open dossier in Clarté, once the dossier is read;
 * the current interface shows every part at once.
 */
export async function showDossierView(
  appInterface: InterfacePreference,
  view: ClientDossierView,
) {
  if (appInterface === 'current') return;
  const views = await screen.findByRole('tablist', {
    name: 'Client dossier sections',
  });
  fireEvent.click(within(views).getByRole('tab', { name: view }));
}

/** The Clients screen each interface renders for the same composition. */
export const clientScreenOf = {
  current: ClientWorkspace,
  clarte: ClarteClients,
} as const satisfies Record<InterfacePreference, unknown>;

/** Returns from an open dossier page to the Clarté directory; the current interface shows both. */
export function showClientDirectory(appInterface: InterfacePreference) {
  if (appInterface === 'current') return;
  const back = screen.queryByRole('button', { name: 'Back to Clients' });
  if (back) fireEvent.click(back);
}

/**
 * Opens a Client's dossier from its directory card or row, after leaving a
 * dossier page Clarté shows, and returns the dossier region.
 */
export async function openClientDossierInInterface(
  appInterface: InterfacePreference,
  displayName: string,
) {
  showClientDirectory(appInterface);
  const heading = await screen.findByRole('heading', { name: displayName });
  const row = heading.closest('li');
  if (!row) throw new Error(`Expected a directory entry for ${displayName}`);
  fireEvent.click(within(row).getByRole('button', { name: 'Open dossier' }));
  return screen.findByRole('region', { name: displayName });
}
