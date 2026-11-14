import { ForbiddenException } from '@nestjs/common';
import { sql, type SQLWrapper } from 'drizzle-orm';
import type { ActiveCompanyContext, ActorContext } from './access.types.js';
import {
  COMPANY_ROLE_BUNDLES,
  companyRolePermissionsFor,
  type CompanyRoleBundle,
  type CompanyRoleCapturedVersion,
  type CompanyRolePermission,
  type CompanyRolePermissionSetVersion,
} from './company-permissions.js';

export type CompanyPermission = {
  [Bundle in CompanyRoleBundle]: CompanyRolePermission<Bundle>;
}[CompanyRoleBundle];

export type CapturedCompanyGrant = {
  [Bundle in CompanyRoleBundle]: {
    readonly bundle: Bundle;
    readonly assignmentId: string;
    readonly permissionSetVersion: CompanyRoleCapturedVersion<Bundle>;
  };
}[CompanyRoleBundle];

type PermissionsAt<
  Bundle extends CompanyRoleBundle,
  Version extends CompanyRolePermissionSetVersion<Bundle>,
> = (typeof COMPANY_ROLE_BUNDLES)[Bundle]['versions'][Version] extends readonly (infer Permission)[]
  ? Permission
  : never;

type GrantWithPermission<Permission extends CompanyPermission> = {
  [Bundle in CompanyRoleBundle]: {
    [
      Version in CompanyRolePermissionSetVersion<Bundle>
    ]: Permission extends PermissionsAt<Bundle, Version>
      ? {
          readonly bundle: Bundle;
          readonly assignmentId: string;
          readonly permissionSetVersion: Version;
        }
      : never;
  }[CompanyRolePermissionSetVersion<Bundle>];
}[CompanyRoleBundle];

/** Each alternative must be carried in full by one captured grant. */
export type PermissionRequirement = (
  | { permissions: readonly CompanyPermission[]; anyOf?: never }
  | { anyOf: readonly (readonly CompanyPermission[])[]; permissions?: never }
) & {
  workspaceAlternative?: 'company.manage' | 'client.manage';
};

export type CapturedPermissionRequest = PermissionRequirement & {
  lock?: boolean;
  /** Opportunity reassignment locks its target member before the Company itself. */
  lockCompany?: boolean;
  prerequisites?: readonly PermissionRequirement[];
  /** A feature fence may require this particular captured grant. */
  assignmentId?: string;
};

const captureIdentity = Symbol('Access captured Company permissions');
const snapshots = new WeakMap<
  object,
  {
    readonly workspaceId: string;
    readonly membershipId: string;
    readonly internalUserId: string;
    readonly companyId: string;
    readonly projections: ReadonlyMap<
      string,
      Readonly<Record<string, unknown>>
    >;
    readonly grants: readonly CapturedCompanyGrant[];
  }
>();

/** Symbol identity survives internal spreads and is omitted by JSON serialization. */
export function captureCompanyPermissions(input: {
  actor: ActorContext;
  company: ActiveCompanyContext;
  grants: readonly {
    bundle: CompanyRoleBundle;
    assignmentId: string;
    permissionSetVersion: string | null;
  }[];
  projections?: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
}): void {
  const token = {};
  snapshots.set(token, {
    workspaceId: input.actor.workspaceId,
    membershipId: input.actor.workspaceMembershipId,
    internalUserId: input.actor.internalUserId,
    companyId: input.company.id,
    projections: input.projections ?? new Map(),
    grants: input.grants
      .map((grant) => ({
        bundle: grant.bundle,
        assignmentId: grant.assignmentId,
        permissionSetVersion: grant.permissionSetVersion,
      }))
      .filter(isCapturedCompanyGrant),
  });
  Object.defineProperty(input.company, captureIdentity, {
    value: token,
    enumerable: true,
  });
}

/** Whether the row is a grant its bundle could have captured; anything else is not. */
export function isCapturedCompanyGrant(grant: {
  bundle: CompanyRoleBundle;
  assignmentId: string;
  permissionSetVersion: string | null;
}): grant is CapturedCompanyGrant {
  if (!Object.hasOwn(COMPANY_ROLE_BUNDLES, grant.bundle)) return false;
  return grant.bundle === 'company_context_access'
    ? grant.permissionSetVersion === null
    : typeof grant.permissionSetVersion === 'string' &&
        Object.hasOwn(
          COMPANY_ROLE_BUNDLES[grant.bundle].versions,
          grant.permissionSetVersion,
        );
}

export function capturedCompanyGrants(
  actor: ActorContext,
): readonly CapturedCompanyGrant[] {
  const snapshot = capturedCompanySnapshot(actor);
  return snapshot.grants.filter((grant) =>
    retainsCapturedProjection(
      actor.activeCompany,
      snapshot.projections.get(grant.assignmentId) ?? {},
    ),
  );
}

function capturedCompanySnapshot(actor: ActorContext) {
  const token: unknown =
    actor.activeCompany && Reflect.get(actor.activeCompany, captureIdentity);
  const snapshot =
    typeof token === 'object' && token !== null
      ? snapshots.get(token)
      : undefined;
  if (
    !actor.active ||
    !snapshot ||
    snapshot.workspaceId !== actor.workspaceId ||
    snapshot.membershipId !== actor.workspaceMembershipId ||
    snapshot.internalUserId !== actor.internalUserId ||
    actor.activeCompany?.id !== snapshot.companyId
  )
    throw new ForbiddenException();
  return snapshot;
}

/** An internally narrowed actor must still claim the particular permissions consumed. */
export function carriesCapturedPermissions(
  actor: ActorContext,
  grant: CapturedCompanyGrant,
  requirement: PermissionRequirement,
): boolean {
  const snapshot = capturedCompanySnapshot(actor);
  const projection = snapshot.projections.get(grant.assignmentId) ?? {};
  const alternatives =
    requirement.permissions === undefined
      ? requirement.anyOf
      : [requirement.permissions];
  return alternatives.some(
    (permissions) =>
      carriesPermissions(grant, { permissions }) &&
      retainsCapturedProjection(actor.activeCompany, projection, permissions),
  );
}

/** Bind the legacy fields the existing projector wrote to this particular grant. */
export function captureGrantProjection(input: {
  before: ActiveCompanyContext;
  after: ActiveCompanyContext;
  grant: { bundle: CompanyRoleBundle; permissionSetVersion: string | null };
}): Readonly<Record<string, unknown>> {
  const previous = new Map(Object.entries(input.before));
  const own: readonly string[] = companyRolePermissionsFor(
    input.grant.bundle,
    input.grant.permissionSetVersion,
  );
  const captured: [string, unknown][] = [];
  for (const [key, value] of Object.entries(input.after)) {
    const before: unknown = previous.get(key);
    if (value === before) continue;
    if (Array.isArray(value)) {
      const values: readonly unknown[] = value;
      const earlier: readonly unknown[] = Array.isArray(before) ? before : [];
      const relevant = key.endsWith('Permissions')
        ? values.filter(
            (permission) =>
              typeof permission === 'string' && own.includes(permission),
          )
        : values.filter(
            (item) =>
              !earlier.some((old) => retainsCapturedProjection(old, item)),
          );
      if (relevant.length) captured.push([key, structuredClone(relevant)]);
    } else if (value !== before) captured.push([key, value]);
  }
  return Object.fromEntries(captured);
}

/** Existing Access projections accept additive permissions but cannot lose captured evidence. */
function retainsCapturedProjection(
  actual: unknown,
  captured: unknown,
  permissions?: readonly CompanyPermission[],
): boolean {
  if (Array.isArray(captured)) {
    if (!Array.isArray(actual)) return false;
    const expected: readonly unknown[] = captured;
    const present: readonly unknown[] = actual;
    return expected.every((value) =>
      present.some((candidate) =>
        retainsCapturedProjection(candidate, value, permissions),
      ),
    );
  }
  if (typeof captured === 'object' && captured !== null) {
    if (typeof actual !== 'object' || actual === null || Array.isArray(actual))
      return false;
    const present = new Map(Object.entries(actual));
    return Object.entries(captured).every(([key, value]) => {
      if (key === 'permissions' || key.endsWith('Permissions')) {
        if (permissions === undefined) return true;
        const current: unknown = present.get(key);
        if (!Array.isArray(value) || !Array.isArray(current)) return false;
        const expected: readonly unknown[] = value;
        const available: readonly unknown[] = current;
        return permissions.every(
          (permission) =>
            expected.includes(permission) && available.includes(permission),
        );
      }
      return (
        present.has(key) &&
        retainsCapturedProjection(present.get(key), value, permissions)
      );
    });
  }
  return actual === captured;
}

export function carriesPermissions(
  grant: CapturedCompanyGrant,
  requirement: PermissionRequirement,
): boolean {
  const versions: Readonly<Record<string, readonly string[]>> =
    COMPANY_ROLE_BUNDLES[grant.bundle].versions;
  const own =
    grant.permissionSetVersion === null
      ? []
      : (versions[grant.permissionSetVersion] ?? []);
  const alternatives =
    requirement.permissions === undefined
      ? requirement.anyOf
      : [requirement.permissions];
  return alternatives.some(
    (permissions) =>
      permissions.length > 0 &&
      permissions.every((permission) => own.includes(permission)),
  );
}

/** Constant-sized SQL rechecks the exact id, bundle and captured version, including NULL. */
export function capturedAssignmentsCondition(
  grants: readonly CapturedCompanyGrant[],
  columns: {
    id: SQLWrapper;
    bundle: SQLWrapper;
    permissionSetVersion: SQLWrapper;
  },
) {
  return sql`EXISTS (SELECT 1 FROM jsonb_to_recordset(${JSON.stringify(
    grants.map((grant) => ({
      id: grant.assignmentId,
      bundle: grant.bundle,
      version: grant.permissionSetVersion,
    })),
  )}::jsonb) AS capture(id uuid, bundle text, version text)
    WHERE capture.id = ${columns.id}
      AND capture.bundle = ${columns.bundle}::text
      AND capture.version IS NOT DISTINCT FROM ${columns.permissionSetVersion})`;
}

export function capturedPermissionResult(
  companyId: string,
  grants: readonly CapturedCompanyGrant[],
) {
  return {
    companyId,
    grants,
    grant<Permission extends CompanyPermission>(permission: Permission) {
      const grant = grants.find(
        (candidate): candidate is GrantWithPermission<Permission> =>
          carriesPermissions(candidate, { permissions: [permission] }),
      );
      if (!grant) throw new ForbiddenException();
      return { companyId, ...grant };
    },
  };
}
