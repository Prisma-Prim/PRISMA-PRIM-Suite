import type { ActorContext } from '../src/access-types';
import type { ProjectResponsibility } from '../src/project/project-responsible-response';

/** The responsible-member read of a Project nobody was ever named for. */
export const unassignedResponsibility = {
  responsible: null,
  revision: 0,
  lastChange: null,
  mutable: true,
} satisfies ProjectResponsibility;

type CompanySummaryKind = 'active_clients' | 'open_projects' | 'overdue_tasks';

/**
 * The Company summary the Prisme overview and the Classic home read for an
 * actor holding a Client, Project or Task read. Only the given kinds appear.
 */
export function operationalHomeFixture(
  companyId: string,
  counts: Partial<Record<CompanySummaryKind, number>>,
) {
  const kinds: CompanySummaryKind[] = [
    'active_clients',
    'open_projects',
    'overdue_tasks',
  ];
  return {
    companyId,
    today: '2026-09-27',
    summaries: kinds.flatMap((kind) => {
      const count = counts[kind];
      return count === undefined ? [] : [{ kind, count }];
    }),
  };
}

export const actorContextFixture = {
  internalUserId: '00000000-0000-4000-8000-000000000001',
  workspaceMembershipId: '00000000-0000-4000-8000-000000000002',
  workspaceId: '00000000-0000-4000-8000-000000000003',
  workspaceName: 'PRISMA Workspace',
  displayName: 'Ada Ionescu',
  email: 'ada@example.test',
  active: true,
  workspacePermissions: ['company.manage'],
} satisfies ActorContext;
