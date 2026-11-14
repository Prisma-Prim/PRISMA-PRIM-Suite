import { describe, expect, it } from 'vitest';
import { describeCompanyGrants } from './company-grants.js';
import {
  COMPANY_ROLE_BUNDLES,
  companyRolePermissionsFor,
  type CompanyRoleBundle,
} from './company-permissions.js';

const BUNDLES = Object.keys(COMPANY_ROLE_BUNDLES).filter(
  (bundle): bundle is CompanyRoleBundle =>
    Object.hasOwn(COMPANY_ROLE_BUNDLES, bundle),
);

describe('Company grants description', () => {
  // Registry-driven: a bundle row added to the registry is described with no
  // other change, at every version it can capture.
  it.each(BUNDLES)(
    'describes every captured version of %s with its registry permissions',
    (bundle) => {
      const versions = Object.keys(COMPANY_ROLE_BUNDLES[bundle].versions);
      for (const version of versions.length === 0 ? [null] : versions) {
        expect(
          describeCompanyGrants([
            {
              bundle,
              assignmentId: 'assignment',
              permissionSetVersion: version,
            },
          ]),
        ).toEqual([
          {
            bundle,
            assignmentId: 'assignment',
            permissionSetVersion: version,
            permissions: [...companyRolePermissionsFor(bundle, version)],
          },
        ]);
      }
    },
  );

  it.each([
    ['an unknown version', 'company_project_access', 'v9'],
    ['a missing version', 'company_project_access', null],
    ['a version on the unversioned bundle', 'company_context_access', 'v1'],
    ['another bundle version', 'company_ideas_reader', 'v2'],
  ] satisfies [string, CompanyRoleBundle, string | null][])(
    'leaves out a row with %s (fail closed)',
    (_name, bundle, permissionSetVersion) => {
      expect(
        describeCompanyGrants([
          { bundle, assignmentId: 'assignment', permissionSetVersion },
        ]),
      ).toEqual([]);
    },
  );

  it('lists grants in registry order, whatever the row order', () => {
    const rows = [
      {
        bundle: 'company_certification_reader',
        assignmentId: 'b',
        permissionSetVersion: 'v1',
      },
      {
        bundle: 'company_project_access',
        assignmentId: 'a',
        permissionSetVersion: 'v2',
      },
      {
        bundle: 'company_context_access',
        assignmentId: 'c',
        permissionSetVersion: null,
      },
    ] satisfies Parameters<typeof describeCompanyGrants>[0];
    expect(describeCompanyGrants(rows).map((grant) => grant.bundle)).toEqual([
      'company_context_access',
      'company_project_access',
      'company_certification_reader',
    ]);
    expect(
      describeCompanyGrants([...rows].reverse()).map((grant) => grant.bundle),
    ).toEqual([
      'company_context_access',
      'company_project_access',
      'company_certification_reader',
    ]);
  });
});
