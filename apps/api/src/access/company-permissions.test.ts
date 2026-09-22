import { describe, expect, it } from 'vitest';
import {
  commercialActivityPermissionsFor,
  commercialIntakePermissionsFor,
  companyDirectorClientPermissionsFor,
  documentPermissionsFor,
  type DocumentPermissionSetVersion,
  type CompanyDirectorClientPermissionSetVersion,
} from './company-permissions.js';

describe('Company Director Client permission sets', () => {
  it.each([
    ['v1', ['client.read', 'client.create', 'client.update']],
    [
      'v2',
      [
        'client.read',
        'client.create',
        'client.update',
        'client.duplicate.resolve',
      ],
    ],
  ] satisfies Array<
    [CompanyDirectorClientPermissionSetVersion, readonly string[]]
  >)('resolves immutable %s permissions', (version, expected) => {
    expect(companyDirectorClientPermissionsFor(version)).toEqual(expected);
  });

  it.each([null, undefined, '', 'V2', 'v3'])(
    'fails closed for an unsupported version: %s',
    (version) => {
      expect(companyDirectorClientPermissionsFor(version)).toEqual([]);
    },
  );
});

describe('Company Document Registrar permission sets', () => {
  it.each([
    ['v1', ['document.read', 'document.register', 'document.reference.read']],
    [
      'v2',
      [
        'document.read',
        'document.register',
        'document.reference.read',
        'document.correct',
      ],
    ],
  ] satisfies Array<[DocumentPermissionSetVersion, readonly string[]]>)(
    'resolves immutable %s permissions',
    (version, expected) => {
      expect(documentPermissionsFor(version)).toEqual(expected);
    },
  );

  it.each([null, undefined, '', 'V2', 'v3'])(
    'fails closed for an unsupported version: %s',
    (version) => {
      expect(documentPermissionsFor(version)).toEqual([]);
    },
  );
});

describe('Company Commercial Activity Reader permission sets', () => {
  it('resolves exactly the captured v1 read permission', () => {
    expect(commercialActivityPermissionsFor('v1')).toEqual([
      'commercial.activity.read',
    ]);
  });

  it('is never conferred by Commercial Intake v1', () => {
    expect(commercialIntakePermissionsFor('v1')).not.toContain(
      'commercial.activity.read',
    );
  });

  it.each([null, undefined, '', 'V1', 'v2'])(
    'fails closed for an unsupported version: %s',
    (version) => {
      expect(commercialActivityPermissionsFor(version)).toEqual([]);
    },
  );
});
