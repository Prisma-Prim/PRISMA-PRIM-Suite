import type { ProjectLifecycle } from './project-lifecycle-response';

/** The lifecycle read of a Project no transition has left `preparatory`. */
export const preparatoryLifecycle = {
  status: 'preparatory',
  lifecycleRevision: 0,
  mutable: true,
  start: null,
  transitions: [],
} satisfies ProjectLifecycle;

/** Whether a stubbed request reads a Project's lifecycle section. */
export function isLifecycleRead(url: string): boolean {
  return /^\/api\/projects\/[^/]+\/lifecycle$/u.test(url);
}
