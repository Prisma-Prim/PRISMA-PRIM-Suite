import {
  Injectable,
  NotFoundException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { ActorContextRequest } from './actor-context.adapter.js';
import {
  COMPANY_ROLE_BUNDLES,
  companyRoleAssignmentRouteNoun,
  type CompanyRoleBundle,
} from './company-permissions.js';

export interface CompanyRoleAssignmentRequest extends ActorContextRequest {
  /** Parameters supplied by the matched HTTP route; the noun is validated below. */
  params: { noun?: unknown };
  companyRoleAssignmentBundle?: CompanyRoleBundle;
}

const routes = new Map<string, CompanyRoleBundle>();
for (const bundle of Object.keys(COMPANY_ROLE_BUNDLES).filter(
  (key): key is CompanyRoleBundle => Object.hasOwn(COMPANY_ROLE_BUNDLES, key),
)) {
  const noun = companyRoleAssignmentRouteNoun(bundle);
  if (noun === null) continue;
  if (routes.has(noun))
    throw new Error('Duplicate Company assignment route noun');
  routes.set(noun, bundle);
}

/** Match the registered route before actor admission, as static routes do. */
@Injectable()
export class CompanyRoleAssignmentRouteGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<CompanyRoleAssignmentRequest>();
    const noun = request.params.noun;
    // Express matched the former static routes without regard to casing.
    const bundle =
      typeof noun === 'string' ? routes.get(noun.toLowerCase()) : undefined;
    if (!bundle) throw new NotFoundException();
    request.companyRoleAssignmentBundle = bundle;
    return true;
  }
}

export function requireCompanyRoleAssignmentBundle(
  request: CompanyRoleAssignmentRequest,
) {
  const bundle = request.companyRoleAssignmentBundle;
  if (!bundle) throw new NotFoundException();
  return bundle;
}
