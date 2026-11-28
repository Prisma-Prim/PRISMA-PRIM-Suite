import type { InterfacePreference } from '../clarte/interface-preference';
import { act, fireEvent, screen, within } from './render-with-interface-locale';
import { changeValue } from './select-option';

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
  // An entry lists its sections as views, or as Settings lists its own.
  const views =
    screen.queryByRole('navigation', { name: `${entry} views` }) ??
    screen.queryByRole('navigation', { name: `${entry} sections` });
  if (views) fireEvent.click(within(views).getByRole('link', { name: label }));
}

/** One Company access bundle granted or revoked from Team & access. */
export type AccessChange = Readonly<{
  operation: 'grant' | 'revoke';
  member: Readonly<{ workspaceMembershipId: string; displayName: string }>;
  company: Readonly<{ id: string; displayName: string }>;
  /** The bundle's value in the current interface's form, e.g. `director-client`. */
  bundle: string;
  /** Its label in Clarté's rights panel, e.g. `Company Director Client Access`. */
  bundleLabel: string;
}>;

/**
 * Grants or revokes a Company access bundle and waits for App's refreshed
 * server state: through the current interface's Company access form, or
 * through the member's rights panel of Clarté's Settings console, which it
 * closes again.
 */
export async function publishAccessInInterface(
  appInterface: InterfacePreference,
  change: AccessChange,
) {
  const action =
    change.operation === 'grant' ? 'Grant access' : 'Revoke access';
  const done =
    change.operation === 'grant'
      ? 'Access granted. Server state refreshed.'
      : 'Access revoked. Server state refreshed.';
  navigateInInterface(appInterface, 'Team & access');
  if (appInterface === 'current') {
    const access = await screen.findByRole('region', {
      name: 'Company access',
    });
    changeValue(
      within(access).getByLabelText('Workspace member'),
      change.member.workspaceMembershipId,
    );
    changeValue(
      within(access).getByLabelText('Company', { exact: true }),
      change.company.id,
    );
    changeValue(within(access).getByLabelText('Access bundle'), change.bundle);
    fireEvent.click(within(access).getByRole('button', { name: action }));
    await screen.findByText(done);
    return;
  }
  const team = await screen.findByRole('region', { name: 'Team & access' });
  fireEvent.click(
    await within(team).findByRole('button', {
      name: change.member.displayName,
    }),
  );
  const panel = screen.getByRole('dialog', { name: change.member.displayName });
  fireEvent.click(
    within(panel).getByRole('button', { name: change.company.displayName }),
  );
  fireEvent.click(
    within(panel).getByRole('button', {
      name: `${action} — ${change.bundleLabel}`,
    }),
  );
  await within(panel).findByText(done);
  fireEvent.click(within(panel).getByRole('button', { name: 'Close' }));
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
