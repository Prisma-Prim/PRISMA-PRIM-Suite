import { describe, expect, it } from 'vitest';
import {
  COMPANY_GRANT_REGISTRY,
  grantOf,
  holds,
  isCompanyGrants,
  type CompanyGrant,
} from './company-grants';
import { readCurrentActor } from './current-actor';
import { completeActor } from './current-actor.test-fixture';

const registryFile = 'apps/api/src/access/company-permissions.ts';

// The API registry is read with import.meta.glob, as the bundle fixture guard
// does: the production web image type-checks apps/web alone, so a static
// import of apps/api/src would break its build. Its shape is checked here.
const registryModules = import.meta.glob(
  '../../../api/src/access/company-permissions.ts',
  { eager: true },
);

type Versions = Readonly<Record<string, readonly string[]>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The API registry as bundle id to captured version to permissions. */
function apiRegistry(): ReadonlyMap<string, Versions> {
  const registryModule: unknown = Object.values(registryModules)[0];
  const bundles = isRecord(registryModule)
    ? registryModule.COMPANY_ROLE_BUNDLES
    : undefined;
  if (!isRecord(bundles))
    throw new Error(
      `COMPANY_ROLE_BUNDLES is not exported by ${registryFile}. If the registry moved, update the import.meta.glob path in this test.`,
    );
  return new Map(
    Object.entries(bundles).map(([bundle, row]): [string, Versions] => {
      const versions = isRecord(row) ? row.versions : undefined;
      if (!isRecord(versions))
        throw new Error(
          `COMPANY_ROLE_BUNDLES.${bundle} in ${registryFile} has no versions table; update this guard.`,
        );
      return [
        bundle,
        Object.fromEntries(
          Object.entries(versions).map(([version, permissions]) => {
            if (
              !Array.isArray(permissions) ||
              !permissions.every((permission) => typeof permission === 'string')
            )
              throw new Error(
                `COMPANY_ROLE_BUNDLES.${bundle}.versions.${version} is not a permission list; update this guard.`,
              );
            const listed: readonly string[] = permissions;
            return [version, listed];
          }),
        ),
      ];
    }),
  );
}

/** Every difference between the web mirror and the API registry, as a fix. */
function registryMirrorDivergences(
  registry: ReadonlyMap<string, Versions>,
  mirror: Readonly<Record<string, Versions>>,
): string[] {
  const problems: string[] = [];
  for (const [bundle, versions] of registry) {
    const mirrored = Object.hasOwn(mirror, bundle) ? mirror[bundle] : undefined;
    if (mirrored === undefined) {
      problems.push(
        `COMPANY_ROLE_BUNDLES has "${bundle}" but COMPANY_GRANT_REGISTRY in apps/web/src/access/company-grants.ts does not: add "${bundle}: ${JSON.stringify(versions)}" so grants of it are readable.`,
      );
      continue;
    }
    if (JSON.stringify(mirrored) !== JSON.stringify(versions))
      problems.push(
        `COMPANY_GRANT_REGISTRY.${bundle} is ${JSON.stringify(mirrored)} but the API registry captures ${JSON.stringify(versions)}: copy the API row (versions and permissions, in order).`,
      );
  }
  for (const bundle of Object.keys(mirror))
    if (!registry.has(bundle))
      problems.push(
        `COMPANY_GRANT_REGISTRY lists "${bundle}", which is not a COMPANY_ROLE_BUNDLES bundle: remove it or use the registry id.`,
      );
  return problems;
}

function grant(overrides: Record<string, unknown> = {}) {
  return {
    bundle: 'company_certification_reader',
    assignmentId: 'certification-reader-grant',
    permissionSetVersion: 'v1',
    permissions: ['certification.read'],
    ...overrides,
  };
}

const contextGrant = {
  bundle: 'company_context_access',
  assignmentId: 'context-grant',
  permissionSetVersion: null,
  permissions: [],
};

describe('Company grants registry mirror', () => {
  it('mirrors every bundle, version and permission of the API registry', () => {
    expect(
      registryMirrorDivergences(apiRegistry(), COMPANY_GRANT_REGISTRY),
    ).toEqual([]);
  });

  it('names the row to add when a registry bundle is not mirrored', () => {
    const registry = new Map([
      ...apiRegistry(),
      ['company_future_bundle', { v1: ['future.read'] }],
    ]);
    expect(registryMirrorDivergences(registry, COMPANY_GRANT_REGISTRY)).toEqual(
      [
        'COMPANY_ROLE_BUNDLES has "company_future_bundle" but COMPANY_GRANT_REGISTRY in apps/web/src/access/company-grants.ts does not: add "company_future_bundle: {"v1":["future.read"]}" so grants of it are readable.',
      ],
    );
  });

  it('accepts a grant of every registry bundle at every captured version', () => {
    for (const [bundle, versions] of apiRegistry()) {
      const captured = Object.entries(versions);
      const cases: [string | null, readonly string[]][] =
        captured.length === 0 ? [[null, []]] : captured;
      for (const [permissionSetVersion, permissions] of cases)
        expect(
          isCompanyGrants([
            {
              bundle,
              assignmentId: `${bundle}-grant`,
              permissionSetVersion,
              permissions: [...permissions].reverse(),
            },
          ]),
          `${bundle} ${String(permissionSetVersion)}`,
        ).toBe(true);
    }
  });
});

describe('Company grants parser', () => {
  it('accepts a complete list, an empty list and additive keys', () => {
    expect(isCompanyGrants([contextGrant, grant()])).toBe(true);
    expect(isCompanyGrants([])).toBe(true);
    expect(isCompanyGrants([grant({ capturedAt: 'future' })])).toBe(true);
  });

  it.each<[string, unknown]>([
    ['a non-list', { 0: grant() }],
    ['a null entry', [null]],
    ['a list entry', [[grant()]]],
    ['an unknown bundle', [grant({ bundle: 'company_future_bundle' })]],
    ['an inherited bundle name', [grant({ bundle: 'constructor' })]],
    ['a missing bundle', [grant({ bundle: undefined })]],
    ['a missing version', [grant({ permissionSetVersion: undefined })]],
    [
      'a null version on a versioned bundle',
      [grant({ permissionSetVersion: null })],
    ],
    ['an unknown version', [grant({ permissionSetVersion: 'v2' })]],
    [
      'a version on the unversioned bundle',
      [{ ...contextGrant, permissionSetVersion: 'v1' }],
    ],
    [
      'a permission on the unversioned bundle',
      [{ ...contextGrant, permissions: ['certification.read'] }],
    ],
    ['a missing assignment', [grant({ assignmentId: undefined })]],
    ['a blank assignment', [grant({ assignmentId: ' ' })]],
    ['missing permissions', [grant({ permissions: undefined })]],
    ['no permission', [grant({ permissions: [] })]],
    [
      'a permission of another bundle',
      [grant({ permissions: ['certification.approve'] })],
    ],
    [
      'a duplicated permission',
      [grant({ permissions: ['certification.read', 'certification.read'] })],
    ],
    [
      'a missing permission of the version',
      [
        grant({
          bundle: 'company_project_access',
          permissionSetVersion: 'v2',
          permissions: ['project.read', 'project.create'],
        }),
      ],
    ],
    ['a duplicated bundle', [grant(), grant({ assignmentId: 'another' })]],
    [
      'a duplicated assignment',
      [
        grant(),
        grant({
          bundle: 'company_certification_approver',
          permissions: ['certification.approve'],
        }),
      ],
    ],
  ])('refuses the whole list on %s', (_name, value) => {
    expect(isCompanyGrants(value)).toBe(false);
  });

  it('refuses the current Actor with a malformed list and reads one without it', async () => {
    const read = (activeCompany: unknown) =>
      readCurrentActor({
        api: {
          request: async () => ({
            status: 'ok',
            value: { ...completeActor, activeCompany },
          }),
        },
      });
    expect(
      await read({
        ...completeActor.activeCompany,
        grants: [grant({ bundle: 'company_future_bundle' })],
      }),
    ).toEqual({ status: 'error' });
    expect(
      await read({
        ...completeActor.activeCompany,
        grants: [grant({ permissionSetVersion: undefined })],
      }),
    ).toEqual({ status: 'error' });
    expect(
      await read({
        ...completeActor.activeCompany,
        grants: [grant(), grant()],
      }),
    ).toEqual({ status: 'error' });
    const withoutGrants = Object.fromEntries(
      Object.entries(completeActor.activeCompany).filter(
        ([key]) => key !== 'grants',
      ),
    );
    const result = await read(withoutGrants);
    expect(result).toEqual({
      status: 'ok',
      value: { ...completeActor, activeCompany: withoutGrants },
    });
    if (result.status !== 'ok') throw new Error('Readable Actor required');
    expect(
      grantOf(result.value.activeCompany, 'company_project_access'),
    ).toBeUndefined();
  });
});

describe('Company grants accessor', () => {
  const company: { grants: CompanyGrant[] } = {
    grants: [
      {
        bundle: 'company_context_access',
        assignmentId: 'context-grant',
        permissionSetVersion: null,
        permissions: [],
      },
      {
        bundle: 'company_project_access',
        assignmentId: 'project-grant',
        permissionSetVersion: 'v1',
        permissions: ['project.read', 'project.create'],
      },
    ],
  };

  it('returns the live grant of a bundle with its captured facts', () => {
    expect(grantOf(company, 'company_project_access')).toEqual({
      bundle: 'company_project_access',
      assignmentId: 'project-grant',
      permissionSetVersion: 'v1',
      permissions: ['project.read', 'project.create'],
    });
    expect(grantOf(company, 'company_context_access')?.assignmentId).toBe(
      'context-grant',
    );
  });

  it('holds only the permissions the captured version confers', () => {
    expect(holds(company, 'company_project_access', 'project.read')).toBe(true);
    // Project Access v2 adds the update; this grant captured v1.
    expect(holds(company, 'company_project_access', 'project.update')).toBe(
      false,
    );
    expect(
      holds(company, 'company_certification_reader', 'certification.read'),
    ).toBe(false);
  });

  it('confers nothing without a Company or without a grants list', () => {
    expect(grantOf(undefined, 'company_project_access')).toBeUndefined();
    expect(holds(undefined, 'company_project_access', 'project.read')).toBe(
      false,
    );
    expect(holds({}, 'company_project_access', 'project.read')).toBe(false);
  });
});
