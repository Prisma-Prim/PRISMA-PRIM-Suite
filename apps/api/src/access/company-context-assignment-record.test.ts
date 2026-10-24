import { describe, expect, expectTypeOf, it } from 'vitest';
import { assignmentRecord } from './company-context-assignment-record.js';
import type {
  CompanyAssignmentDefinition,
  CompanyContextAssignmentRecord,
} from './company-context-assignment.types.js';
import { COMPANY_ROLE_BUNDLES } from './company-permissions.js';

const identifiers = {
  id: '11111111-1111-4111-8111-111111111111',
  workspaceMembershipId: '22222222-2222-4222-8222-222222222222',
  companyId: '33333333-3333-4333-8333-333333333333',
};

describe('Company assignment record decoding', () => {
  it.each(Object.entries(COMPANY_ROLE_BUNDLES))(
    'preserves every supported capture of %s in active and revoked records',
    (bundle, definition) => {
      const versions = Object.keys(definition.versions);
      for (const permissionSetVersion of versions.length ? versions : [null])
        for (const active of [true, false])
          expect(
            assignmentRecord(
              { ...identifiers, bundle, permissionSetVersion },
              active,
            ),
          ).toEqual({
            ...identifiers,
            bundle: definition.label,
            permissionSetVersion,
            active,
          });
    },
  );

  it.each(
    Object.entries(COMPANY_ROLE_BUNDLES).filter(
      ([bundle]) => bundle !== 'company_context_access',
    ),
  )('rejects invalid historical captures for %s', (bundle, definition) => {
    for (const permissionSetVersion of [
      null,
      undefined,
      '',
      'V1',
      'v0',
      'v5',
      ' v1',
      'toString',
      'constructor',
      '__proto__',
      1,
      {},
      ['v1'],
      ...['v1', 'v2', 'v3', 'v4'].filter(
        (version) => !Object.hasOwn(definition.versions, version),
      ),
    ])
      expect(() =>
        assignmentRecord(
          { ...identifiers, bundle, permissionSetVersion },
          true,
        ),
      ).toThrow('Invalid Company assignment version.');
  });

  it.each([
    undefined,
    null,
    1,
    {},
    '',
    'unknown',
    'toString',
    'constructor',
    '__proto__',
  ])(
    'rejects an unknown bundle %j before reading its registry entry',
    (bundle) => {
      expect(() =>
        assignmentRecord(
          { ...identifiers, bundle, permissionSetVersion: 'v1' },
          true,
        ),
      ).toThrow('Invalid Company assignment bundle.');
    },
  );

  it('retains the explicitly unversioned Company Context Access representation', () => {
    expect(
      assignmentRecord(
        {
          ...identifiers,
          bundle: 'company_context_access',
          permissionSetVersion: 'legacy-ignored-value',
        },
        true,
      ),
    ).toEqual({
      ...identifiers,
      bundle: 'Company Context Access',
      permissionSetVersion: null,
      active: true,
    });
  });

  it('correlates definition captures and response labels at compile time', () => {
    expectTypeOf<
      Extract<
        CompanyAssignmentDefinition,
        { value: 'company_offer_model_editor' }
      >
    >().toEqualTypeOf<{
      value: 'company_offer_model_editor';
      permissionSetVersion: 'v1';
    }>();
    expectTypeOf<keyof CompanyAssignmentDefinition>().toEqualTypeOf<
      'value' | 'permissionSetVersion'
    >();
    expectTypeOf<{
      value: 'company_offer_model_editor';
      permissionSetVersion: 'v4';
    }>().not.toMatchTypeOf<CompanyAssignmentDefinition>();
    expectTypeOf<{
      bundle: 'Company Offer Model Editor';
      permissionSetVersion: 'v2';
      id: string;
      workspaceMembershipId: string;
      companyId: string;
      active: boolean;
    }>().not.toMatchTypeOf<CompanyContextAssignmentRecord>();
    expectTypeOf<
      Extract<
        CompanyContextAssignmentRecord,
        { bundle: 'Company Context Access' }
      >['permissionSetVersion']
    >().toEqualTypeOf<null>();
    expectTypeOf<
      Extract<
        CompanyContextAssignmentRecord,
        { bundle: 'Company Offer Preparer' }
      >['permissionSetVersion']
    >().toEqualTypeOf<'v1' | 'v2'>();
  });
});
