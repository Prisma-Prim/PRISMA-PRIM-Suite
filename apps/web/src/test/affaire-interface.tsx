import type { InterfacePreference } from '../clarte/interface-preference';
import { act, fireEvent, screen, within } from './render-with-interface-locale';

/**
 * The steps of the Request App tests that differ between the interfaces
 * (#1533). The current interface lists sections in its left menu; Clarté
 * lists entries, each section a view of its entry, and opens a Request's
 * detail inside its affaire page. Everything after these steps is the same.
 */
const clarteEntryOf: Readonly<Record<string, string>> = {
  'Client Requests': 'Affaires',
  Clients: 'Clients',
  'Team & access': 'Settings',
};

/** Opens a section by its current-interface label in either interface. */
export function navigateInInterface(
  appInterface: InterfacePreference,
  label: string,
) {
  const primary = screen.getByRole('navigation', {
    name: 'Primary navigation',
  });
  if (appInterface === 'current') {
    fireEvent.click(within(primary).getByRole('link', { name: label }));
    return;
  }
  const entry = clarteEntryOf[label];
  if (!entry) throw new Error(`No Clarté entry is known for ${label}.`);
  fireEvent.click(within(primary).getByRole('link', { name: entry }));
  const views = screen.queryByRole('navigation', { name: `${entry} views` });
  if (views) fireEvent.click(within(views).getByRole('link', { name: label }));
}

/**
 * Opens a Request detail from the loaded list: its row in the current
 * interface, its affaire's row and then its Request stage in Clarté.
 */
export async function openRequestInInterface(
  appInterface: InterfacePreference,
  request: { subject: string; title: string },
) {
  const row =
    appInterface === 'current'
      ? await screen.findByRole('button', {
          name: new RegExp(`^${escapeRegExp(request.subject)}`, 'u'),
        })
      : await screen.findByRole('button', { name: request.title });
  // Settle the detail effects before a test types into the detail.
  await act(async () => {
    fireEvent.click(row);
  });
  return screen.findByRole('article', { name: request.subject });
}

/** Leaves the Request detail for the list. */
export function leaveRequestInInterface(appInterface: InterfacePreference) {
  fireEvent.click(
    screen.getByRole('button', {
      name:
        appInterface === 'current' ? 'Back to Requests' : 'Back to affaires',
    }),
  );
}

/**
 * The signed-in member's name: shown in the current shell, inside the user
 * menu in Clarté, which this opens and closes again.
 */
export function actorNameShown(
  appInterface: InterfacePreference,
  name: string,
): boolean {
  if (appInterface === 'current') return screen.queryByText(name) !== null;
  const menu = screen.getByRole('button', { name: 'User menu' });
  fireEvent.click(menu);
  const shown =
    within(screen.getByRole('group', { name: 'User menu' })).queryByText(
      name,
    ) !== null;
  fireEvent.click(menu);
  return shown;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
