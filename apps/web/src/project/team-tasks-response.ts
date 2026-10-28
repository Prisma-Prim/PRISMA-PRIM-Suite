import { taskStates, validTaskDate } from './task-response';
import { readTaskDiscoveryPage } from './task-discovery-response';
export const teamTaskStates = ['open', 'all', ...taskStates] as const;
export const teamResponsibilities = ['all', 'unassigned', 'name'] as const;
export type TeamTaskFilters = {
  state: (typeof teamTaskStates)[number];
  responsibility: (typeof teamResponsibilities)[number];
  assigneeName: string | null;
  dueFrom: string | null;
  dueThrough: string | null;
};
export const defaultTeamTaskFilters: TeamTaskFilters = {
  state: 'open',
  responsibility: 'all',
  assigneeName: null,
  dueFrom: null,
  dueThrough: null,
};
export function validTeamName(value: string) {
  const count = Array.from(value.trim()).length;
  return (
    count > 0 &&
    count <= 200 &&
    !(value.includes('\0') || /[\uD800-\uDFFF]/u.test(value))
  );
}
/** Exact finite §33 comparison; no locale-sensitive or general Unicode case conversion. */
export function foldTeamName(value: string) {
  const upper = Array.from(
    'ABCDEFGHIJKLMNOPQRSTUVWXYZÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞŒŸĂȘŞȚŢАБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯЁ',
  );
  const lower = Array.from(
    'abcdefghijklmnopqrstuvwxyzàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþœÿășşțţабвгдежзийклмнопрстуфхцчшщъыьэюяё',
  );
  return Array.from(
    value.normalize('NFC'),
    (char) => lower[upper.indexOf(char)] ?? char,
  )
    .join('')
    .replace(/[ăâ]/g, 'a')
    .replace(/î/g, 'i')
    .replace(/[șş]/g, 's')
    .replace(/[țţ]/g, 't');
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid team Task response.');
  return Object.fromEntries(Object.entries(value));
}
function uuid(value: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new Error('Invalid native Task identity.');
}
export function teamTasksPath(filters: TeamTaskFilters, offset: number) {
  const query = new URLSearchParams({
    state: filters.state,
    responsibility: filters.responsibility,
    offset: String(offset),
  });
  for (const key of ['assigneeName', 'dueFrom', 'dueThrough'] as const)
    if (filters[key] !== null) query.set(key, filters[key]);
  return `/team-tasks?${query}`;
}
export function readTeamTasks(
  value: unknown,
  scope: { companyId: string; offset: number; filters: TeamTaskFilters },
) {
  const raw = record(value),
    echo = record(raw.appliedFilters);
  for (const key of [
    'state',
    'responsibility',
    'assigneeName',
    'dueFrom',
    'dueThrough',
  ] as const)
    if (echo[key] !== scope.filters[key])
      throw new Error('Invalid team Task criteria echo.');
  const page = readTaskDiscoveryPage(value, scope),
    f = scope.filters;
  uuid(page.companyId);
  const label = (value: string) => {
    if (!value.trim() || value.includes('\0') || /[\uD800-\uDFFF]/u.test(value))
      throw new Error('Invalid native label.');
  };
  for (const task of page.tasks) {
    if (task.title.length > 200 || task.version > 2147483647)
      throw new Error('Invalid native Task fields.');
    for (const value of [
      task.title,
      task.project.title,
      task.project.clientDisplayName,
    ])
      label(value);
    for (const id of [
      task.id,
      task.companyId,
      task.projectId,
      task.clientAccountId,
      task.project.id,
    ])
      uuid(id);
    const actors = [
      task.createdBy,
      ...(task.status === 'blocked'
        ? [task.blockage.actor]
        : task.status === 'cancelled'
          ? [task.cancellation.actor]
          : task.status === 'done'
            ? [task.completion.actor]
            : []),
    ];
    for (const actor of actors) {
      uuid(actor.internalUserId);
      uuid(actor.workspaceMembershipId);
      label(actor.displayName);
    }
    if (task.assignee) {
      uuid(task.assignee.workspaceMembershipId);
      label(task.assignee.displayLabel);
    }
    if (
      (f.state !== 'all' &&
        (f.state === 'open'
          ? ['done', 'cancelled'].includes(task.status)
          : task.status !== f.state)) ||
      (f.responsibility === 'unassigned' && task.assignee !== null) ||
      (f.responsibility === 'name' &&
        (!f.assigneeName ||
          !task.assignee ||
          !foldTeamName(task.assignee.displayLabel).includes(
            foldTeamName(f.assigneeName),
          ))) ||
      (f.dueFrom !== null &&
        (task.dueDate === null || task.dueDate < f.dueFrom)) ||
      (f.dueThrough !== null &&
        (task.dueDate === null || task.dueDate > f.dueThrough))
    )
      throw new Error('Task does not satisfy applied criteria.');
  }
  return { ...page, appliedFilters: scope.filters };
}
export { validTaskDate };
