import {
  isProjectStatus,
  type ProjectStatus,
} from './project-lifecycle-response';

/** The existing Project list/detail response; responsibility stays server-owned. */
export type ProjectView = {
  id: string;
  companyId: string;
  clientAccountId: string;
  clientDossierId?: string;
  clientDisplayName: string;
  title: string;
  status: ProjectStatus;
  createdAt: string;
};
export type ClientChoice = { id: string; displayName: string };
export type ProjectDirectoryView = 'all' | 'mine_open';

export function isClientChoice(value: unknown): value is ClientChoice {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.displayName === 'string'
  );
}

/** HTTP list and detail responses are validated at their one owning boundary. */
export function isProject(value: unknown): value is ProjectView {
  return (
    isRecord(value) &&
    ['id', 'companyId', 'clientAccountId', 'clientDisplayName', 'title'].every(
      (key) => typeof value[key] === 'string',
    ) &&
    isTimestamp(value.createdAt) &&
    isProjectStatus(value.status) &&
    (value.clientDossierId === undefined ||
      typeof value.clientDossierId === 'string')
  );
}
function isTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const timestamp = new Date(value);
  return (
    Number.isFinite(timestamp.valueOf()) && timestamp.toISOString() === value
  );
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
