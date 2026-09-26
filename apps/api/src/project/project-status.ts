import type { projects } from '../database/schema/index.js';

export type ProjectStatus = (typeof projects.$inferSelect)['status'];

/**
 * The Project module's exhaustive lifecycle classification (Operational
 * Dashboard PRD §17.2). A status added later fails type-checking here until a
 * lifecycle slice classifies it; completed and cancelled are closed.
 */
const PROJECT_STATUS_PHASES = {
  preparatory: 'open',
  active: 'open',
  on_hold: 'open',
  completed: 'closed',
  cancelled: 'closed',
} as const satisfies Record<ProjectStatus, 'open' | 'closed'>;

export function isOpenProjectStatus(status: ProjectStatus): boolean {
  return PROJECT_STATUS_PHASES[status] === 'open';
}
