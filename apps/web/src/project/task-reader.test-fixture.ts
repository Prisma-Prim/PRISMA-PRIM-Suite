import type { ActorContext } from '../access-types';
import { grantOf } from '../access/company-grants';
import { withoutCompanyGrants } from '../access/company-grants.test-fixture';

type Company = NonNullable<ActorContext['activeCompany']>;

/**
 * `company` with its Task Manager grant narrowed to `task.read`. No registry
 * version grants `task.read` without `task.manage`, so the current Actor
 * parser refuses such a grant (#1332); the Task screens still check
 * `task.manage` on its own, which the tests using this keep proving.
 */
export function taskReaderCompany(company: Company): Company {
  const task = grantOf(company, 'company_task_manager');
  if (!task) throw new Error('Expected a Task Manager grant.');
  return {
    ...company,
    grants: [
      ...withoutCompanyGrants(company.grants, 'company_task_manager'),
      { ...task, permissions: ['task.read'] },
    ],
  };
}
