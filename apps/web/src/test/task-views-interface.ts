import type { InterfacePreference } from '../clarte/interface-preference';
import { fireEvent, screen, within } from './render-with-interface-locale';

/** The Tasks views both interfaces offer, by their visible names. */
export type TaskViewName =
  | 'My Tasks'
  | 'Unassigned Tasks'
  | 'Blocked Tasks'
  | 'Team Tasks'
  | 'Internal Tasks';

/**
 * Opens a Tasks view through each frame's own navigation: the current
 * interface lists it in the primary navigation; Clarté opens the Tasks entry
 * and then the view in its "Tasks views" navigation (#1542).
 */
export function openTaskView(
  appInterface: InterfacePreference,
  name: TaskViewName,
) {
  const navigation = screen.getByRole('navigation', {
    name: 'Primary navigation',
  });
  if (appInterface === 'current') {
    fireEvent.click(within(navigation).getByRole('link', { name }));
    return;
  }
  fireEvent.click(within(navigation).getByRole('link', { name: 'Tasks' }));
  fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Tasks views' })).getByRole(
      'link',
      { name },
    ),
  );
}

const taskViews: readonly TaskViewName[] = [
  'My Tasks',
  'Unassigned Tasks',
  'Blocked Tasks',
  'Team Tasks',
  'Internal Tasks',
];
function isTaskView(label: string): label is TaskViewName {
  return taskViews.some((view) => view === label);
}

/** Clarté's menu entries for the current interface's labels that differ. */
const clarteEntries: Readonly<Record<string, string>> = {
  Projects: 'Missions and audits',
  Overview: 'Today',
};

/**
 * Opens a section by the current interface's menu label in either frame: a
 * Tasks view through its entry, Projects under Missions and audits and the
 * overview as Today in Clarté, any other section by the same label.
 */
export function navigateIn(appInterface: InterfacePreference, label: string) {
  if (isTaskView(label)) {
    openTaskView(appInterface, label);
    return;
  }
  const name =
    appInterface === 'clarte' ? (clarteEntries[label] ?? label) : label;
  fireEvent.click(
    within(
      screen.getByRole('navigation', { name: 'Primary navigation' }),
    ).getByRole('link', { name }),
  );
}

/** The link that marks the selected Tasks view as the current page. */
export function taskViewLink(
  appInterface: InterfacePreference,
  name: TaskViewName,
) {
  const navigation = screen.getByRole('navigation', {
    name: appInterface === 'current' ? 'Primary navigation' : 'Tasks views',
  });
  return within(navigation).getByRole('link', { name });
}
