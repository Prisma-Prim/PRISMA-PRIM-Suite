import { describe, expect, it } from 'vitest';
import {
  commercialActivityPermissionsFor,
  commercialIntakePermissionsFor,
  companyDirectorClientPermissionsFor,
  documentPermissionsFor,
  isCommercialIntakePermissionSetVersion,
  isProjectPermissionSetVersion,
  pricingConfigurationPermissionsFor,
  projectApproverPermissionsFor,
  projectPermissionsFor,
  serviceCataloguePermissionsFor,
  taskPermissionsFor,
  type CompanyCommercialIntakePermissionSetVersion,
  type CompanyProjectPermissionSetVersion,
  type DocumentPermissionSetVersion,
  type CompanyDirectorClientPermissionSetVersion,
} from './company-permissions.js';

describe('Company Pricing Configuration permission sets', () => {
  it('resolves exactly the captured v1 configuration permissions', () => {
    expect(pricingConfigurationPermissionsFor('v1')).toEqual([
      'commercial.offering.read',
      'commercial.pricing.configuration.read',
      'commercial.pricing.configuration.manage',
    ]);
  });

  it('shares only offering read with the catalogue bundle', () => {
    const configuration: readonly string[] =
      pricingConfigurationPermissionsFor('v1');
    const catalogue: readonly string[] = serviceCataloguePermissionsFor('v1');
    expect(
      configuration.filter((permission) => catalogue.includes(permission)),
    ).toEqual(['commercial.offering.read']);
  });

  it.each([null, undefined, '', 'V1', 'v2', 1])(
    'fails closed for an unsupported version: %s',
    (version) => {
      expect(pricingConfigurationPermissionsFor(version)).toEqual([]);
    },
  );
});

describe('Company Service Catalogue permission sets', () => {
  it('resolves the immutable v1 catalogue permissions only', () => {
    expect(serviceCataloguePermissionsFor('v1')).toEqual([
      'service.definition.read',
      'service.definition.create',
      'commercial.offering.read',
      'commercial.offering.manage',
    ]);
  });

  it.each([null, undefined, '', 'V1', 'v2'])(
    'fails closed for an unsupported version: %s',
    (version) => {
      expect(serviceCataloguePermissionsFor(version)).toEqual([]);
    },
  );
});

describe('Company Commercial Intake permission sets', () => {
  it.each([
    [
      'v1',
      [
        'commercial.request.read',
        'commercial.request.create',
        'commercial.opportunity.read',
        'commercial.opportunity.create',
      ],
    ],
    [
      'v2',
      [
        'commercial.request.read',
        'commercial.request.create',
        'commercial.opportunity.read',
        'commercial.opportunity.create',
        'commercial.opportunity.next_action.update',
      ],
    ],
  ] satisfies Array<
    [CompanyCommercialIntakePermissionSetVersion, readonly string[]]
  >)('resolves immutable %s permissions', (version, expected) => {
    expect(commercialIntakePermissionsFor(version)).toEqual(expected);
    expect(isCommercialIntakePermissionSetVersion(version)).toBe(true);
  });

  it.each([null, undefined, '', 'V2', 'v3'])(
    'fails closed for an unsupported captured version: %s',
    (version) => {
      expect(commercialIntakePermissionsFor(version)).toEqual([]);
      expect(isCommercialIntakePermissionSetVersion(version)).toBe(false);
    },
  );
});

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

describe('Company Project Access permission sets', () => {
  it.each([
    ['v1', ['project.read', 'project.create']],
    ['v2', ['project.read', 'project.create', 'project.update']],
  ] satisfies Array<[CompanyProjectPermissionSetVersion, readonly string[]]>)(
    'resolves immutable %s permissions',
    (version, expected) => {
      expect(projectPermissionsFor(version)).toEqual(expected);
      expect(isProjectPermissionSetVersion(version)).toBe(true);
    },
  );

  it.each([null, undefined, '', 'V2', 'v3'])(
    'fails closed for an unsupported captured version: %s',
    (version) => {
      expect(projectPermissionsFor(version)).toEqual([]);
      expect(isProjectPermissionSetVersion(version)).toBe(false);
    },
  );

  it('is never conferred by the Task Manager or Document bundles', () => {
    for (const permissions of [
      taskPermissionsFor('v1'),
      documentPermissionsFor('v1'),
      documentPermissionsFor('v2'),
    ])
      expect(permissions).not.toContain('project.update');
  });
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

describe('Company Project Approver permission sets', () => {
  it('resolves exactly the captured v1 lifecycle permissions', () => {
    expect(projectApproverPermissionsFor('v1')).toEqual([
      'project.lifecycle.transition',
      'project.close',
    ]);
  });

  it('is conferred by no Project Access version', () => {
    for (const version of ['v1', 'v2'])
      for (const permission of projectApproverPermissionsFor('v1')) {
        const granted: readonly string[] = projectPermissionsFor(version);
        expect(granted).not.toContain(permission);
      }
  });

  it.each([null, undefined, '', 'V1', 'v2'])(
    'fails closed for an unsupported version: %s',
    (version) => {
      expect(projectApproverPermissionsFor(version)).toEqual([]);
    },
  );
});
