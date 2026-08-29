import { describe, expect, it } from 'vitest';
import {
  companyDirectorClientPermissionsFor,
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
