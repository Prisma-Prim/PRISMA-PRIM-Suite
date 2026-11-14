import { describe, expect, it } from 'vitest';
import { companyAccessAdministrationResponse } from './company-access-administration-response';
import { COMPANY_GRANT_LABELS, COMPANY_GRANT_REGISTRY } from './company-grants';

const member = {
  workspaceMembershipId: '00000000-0000-4000-8000-000000007041',
  displayName: 'Fictional member',
  email: 'fictional@example.test',
};
const company = {
  id: '00000000-0000-4000-8000-000000007042',
  displayName: 'Fictional Company',
};
function assignment(bundle: string, permissionSetVersion: unknown) {
  return {
    id: '00000000-0000-4000-8000-000000007043',
    workspaceMembershipId: member.workspaceMembershipId,
    companyId: company.id,
    bundle,
    permissionSetVersion,
    active: true,
  };
}
function response(assignments: unknown[]) {
  return { members: [member], companies: [company], assignments };
}

describe('Company assignment administration Knowledge compatibility', () => {
  it('reads existing and new captured v1 labels together without losing the whole response', () => {
    const assignments = [
      assignment('Company Context Access', null),
      assignment('Company Knowledge Source Administrator', 'v1'),
      assignment('Company Knowledge Evidence Reader', 'v1'),
    ];
    expect(companyAccessAdministrationResponse(response(assignments))).toEqual(
      response(assignments),
    );
  });

  it.each([
    'Company Knowledge Source Administrator',
    'Company Knowledge Evidence Reader',
  ])('retains an inactive %s capture without inferring a grant', (bundle) => {
    const inactive = { ...assignment(bundle, 'v1'), active: false };
    expect(
      companyAccessAdministrationResponse(response([inactive])).assignments,
    ).toEqual([inactive]);
  });

  it.each<[string, unknown]>([
    ['Company Knowledge Source Administrator', null],
    ['Company Knowledge Source Administrator', undefined],
    ['Company Knowledge Source Administrator', 'v2'],
    ['Company Knowledge Source Administrator', 'v99'],
    ['Company Knowledge Evidence Reader', null],
    ['Company Knowledge Evidence Reader', undefined],
    ['Company Knowledge Evidence Reader', 'v2'],
    ['Company Knowledge Evidence Reader', 'v99'],
  ])('rejects unsupported captured versions for %s: %s', (bundle, version) => {
    expect(() =>
      companyAccessAdministrationResponse(
        response([assignment(bundle, version)]),
      ),
    ).toThrow();
  });

  it.each(['Unknown Company Bundle', 'Company Knowledge Future Permission'])(
    'continues to fail closed for unknown label %s in a mixed response',
    (bundle) => {
      expect(() =>
        companyAccessAdministrationResponse(
          response([
            assignment('Company Context Access', null),
            assignment('Company Knowledge Evidence Reader', 'v1'),
            assignment(bundle, 'v1'),
          ]),
        ),
      ).toThrow();
    },
  );
});

describe('Company assignment administration captured versions', () => {
  // The accepted versions are derived from the Company grants registry
  // mirror, which company-grants.test.ts ties to the API registry.
  const labels = new Map<string, string>(Object.entries(COMPANY_GRANT_LABELS));
  const cases = Object.entries(COMPANY_GRANT_REGISTRY).map(
    ([bundle, versions]): [string, (string | null)[]] => {
      const captured = Object.keys(versions);
      return [
        labels.get(bundle) ?? bundle,
        captured.length === 0 ? [null] : captured,
      ];
    },
  );

  it.each(cases)(
    'reads %s at each version it can capture',
    (label, versions) => {
      for (const version of versions)
        expect(
          companyAccessAdministrationResponse(
            response([assignment(label, version)]),
          ).assignments,
        ).toEqual([assignment(label, version)]);
    },
  );

  it.each(cases)('refuses %s at any other version', (label, versions) => {
    for (const version of [null, 'v0', `v${versions.length + 1}`].filter(
      (candidate) => !versions.includes(candidate),
    ))
      expect(() =>
        companyAccessAdministrationResponse(
          response([assignment(label, version)]),
        ),
      ).toThrow();
  });
});
