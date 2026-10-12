import { describe, expect, it } from 'vitest';
import {
  COMMERCIAL_INTAKE_READ_PERMISSIONS,
  commercialActivityPermissionsFor,
  profitabilityContributorPermissionsFor,
  profitabilityDirectorPermissionsFor,
  commercialIntakePermissionsFor,
  commercialIntakeVersionsWith,
  opportunityManagerPermissionsFor,
  opportunityManagerVersionsWith,
  isOpportunityManagerPermissionSetVersion,
  companyDirectorClientPermissionsFor,
  documentApproverPermissionsFor,
  documentPermissionsFor,
  isCommercialIntakePermissionSetVersion,
  isProjectPermissionSetVersion,
  offerPreparerPermissionsFor,
  offerApproverPermissionsFor,
  pricingAdjustmentPermissionsFor,
  pricingConfigurationPermissionsFor,
  projectApproverPermissionsFor,
  pricingUserPermissionsFor,
  projectPermissionsFor,
  serviceCataloguePermissionsFor,
  taskPermissionsFor,
  type CompanyCommercialIntakePermissionSetVersion,
  type CompanyProjectPermissionSetVersion,
  type DocumentPermissionSetVersion,
  type CompanyDirectorClientPermissionSetVersion,
} from './company-permissions.js';

describe('Company Offer Preparer permission sets', () => {
  it('resolves exactly the four captured v1 permissions without calculation', () => {
    expect(offerPreparerPermissionsFor('v1')).toEqual([
      'commercial.offer.read',
      'commercial.offer.prepare',
      'commercial.offer.transmission.record',
      'commercial.pricing.snapshot.read',
    ]);
    expect(offerPreparerPermissionsFor('v1')).not.toContain(
      'commercial.pricing.calculate',
    );
  });

  it.each([null, undefined, '', 'V1', 'v2', 1])(
    'fails closed for an unsupported version: %s',
    (version) => expect(offerPreparerPermissionsFor(version)).toEqual([]),
  );
});

describe('Company Offer Approver permission sets', () => {
  it('captures only Offer read, approval and response authority', () => {
    expect(offerApproverPermissionsFor('v1')).toEqual([
      'commercial.offer.read',
      'commercial.offer.approve',
      'commercial.offer.response.record',
    ]);
    expect(offerPreparerPermissionsFor('v1')).not.toContain(
      'commercial.offer.approve',
    );
  });
  it.each([null, undefined, '', 'v2', 'V1', 1])(
    'fails closed for version %s',
    (version) => expect(offerApproverPermissionsFor(version)).toEqual([]),
  );
});

describe('Company Opportunity Manager permission sets', () => {
  it('resolves exactly the captured v1 reassignment permission', () => {
    expect(opportunityManagerPermissionsFor('v1')).toEqual([
      'commercial.opportunity.assign',
    ]);
  });

  it('resolves captured v2 as v1 plus the outcome status change', () => {
    expect(opportunityManagerPermissionsFor('v2')).toEqual([
      'commercial.opportunity.assign',
      'commercial.opportunity.outcome.change',
    ]);
    expect(isOpportunityManagerPermissionSetVersion('v2')).toBe(true);
  });

  it('accepts reassignment from v1 and v2 but the outcome change from v2 only', () => {
    expect(
      opportunityManagerVersionsWith('commercial.opportunity.assign'),
    ).toEqual(['v1', 'v2']);
    expect(
      opportunityManagerVersionsWith('commercial.opportunity.outcome.change'),
    ).toEqual(['v2']);
  });

  it.each([null, undefined, '', 'V1', 'V2', 'v3', 1])(
    'fails closed for an unsupported version: %s',
    (version) => {
      expect(opportunityManagerPermissionsFor(version)).toEqual([]);
      expect(isOpportunityManagerPermissionSetVersion(version)).toBe(false);
    },
  );

  it('is never conferred by another bundle and confers none of their permissions', () => {
    const others: ReadonlyArray<readonly string[]> = [
      commercialIntakePermissionsFor('v1'),
      commercialIntakePermissionsFor('v2'),
      commercialIntakePermissionsFor('v3'),
      commercialActivityPermissionsFor('v1'),
      pricingConfigurationPermissionsFor('v1'),
      pricingAdjustmentPermissionsFor('v1'),
      serviceCataloguePermissionsFor('v1'),
      companyDirectorClientPermissionsFor('v2'),
      projectPermissionsFor('v2'),
      taskPermissionsFor('v1'),
      documentPermissionsFor('v2'),
    ];
    for (const permissions of others) {
      expect(permissions).not.toContain('commercial.opportunity.assign');
      for (const permission of opportunityManagerPermissionsFor('v2'))
        expect(permissions).not.toContain(permission);
    }
  });

  it('accepts every captured Commercial Intake version carrying both reads as the read prerequisite', () => {
    expect(
      commercialIntakeVersionsWith(COMMERCIAL_INTAKE_READ_PERMISSIONS),
    ).toEqual(['v1', 'v2', 'v3']);
    expect(
      commercialIntakeVersionsWith([
        'commercial.opportunity.next_action.update',
      ]),
    ).toEqual(['v2', 'v3']);
    expect(
      commercialIntakeVersionsWith(['commercial.request.client.associate']),
    ).toEqual(['v3']);
  });
});

describe('Company Pricing Adjustment permission sets', () => {
  it('resolves only the captured v1 adjustment permission', () => {
    expect(pricingAdjustmentPermissionsFor('v1')).toEqual([
      'commercial.pricing.adjustment.apply',
    ]);
  });

  it('does not confer calculation, snapshot read or configuration access', () => {
    const permissions: readonly string[] =
      pricingAdjustmentPermissionsFor('v1');
    expect(permissions).not.toContain('commercial.pricing.calculate');
    expect(permissions).not.toContain('commercial.pricing.snapshot.read');
    expect(permissions).not.toContain('commercial.pricing.configuration.read');
  });

  it('is added to no existing captured permission set', () => {
    for (const permissions of [
      pricingUserPermissionsFor('v1'),
      pricingConfigurationPermissionsFor('v1'),
      serviceCataloguePermissionsFor('v1'),
      commercialIntakePermissionsFor('v1'),
      commercialIntakePermissionsFor('v2'),
    ])
      expect(permissions).not.toContain('commercial.pricing.adjustment.apply');
  });

  it.each([null, undefined, '', 'V1', 'v2', 1])(
    'fails closed for an unsupported version: %s',
    (version) => {
      expect(pricingAdjustmentPermissionsFor(version)).toEqual([]);
    },
  );
});

describe('Company Pricing User permission sets', () => {
  it('resolves exactly the four captured v1 Pricing User permissions', () => {
    expect(pricingUserPermissionsFor('v1')).toEqual([
      'commercial.offering.read',
      'commercial.pricing.configuration.read',
      'commercial.pricing.calculate',
      'commercial.pricing.snapshot.read',
    ]);
  });

  it('shares only offering and configuration read with Configuration v1', () => {
    const pricingUser: readonly string[] = pricingUserPermissionsFor('v1');
    const configuration: readonly string[] =
      pricingConfigurationPermissionsFor('v1');
    expect(
      pricingUser.filter((permission) => configuration.includes(permission)),
    ).toEqual([
      'commercial.offering.read',
      'commercial.pricing.configuration.read',
    ]);
    expect(configuration).not.toContain('commercial.pricing.calculate');
    expect(configuration).not.toContain('commercial.pricing.snapshot.read');
  });

  it('shares only offering read with Catalogue v1', () => {
    const pricingUser: readonly string[] = pricingUserPermissionsFor('v1');
    const catalogue: readonly string[] = serviceCataloguePermissionsFor('v1');
    expect(
      pricingUser.filter((permission) => catalogue.includes(permission)),
    ).toEqual(['commercial.offering.read']);
  });

  it.each([null, undefined, '', 'V1', 'v2', 1])(
    'fails closed for an unsupported version: %s',
    (version) => {
      expect(pricingUserPermissionsFor(version)).toEqual([]);
    },
  );
});

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
    [
      'v3',
      [
        'commercial.request.read',
        'commercial.request.create',
        'commercial.opportunity.read',
        'commercial.opportunity.create',
        'commercial.opportunity.next_action.update',
        'commercial.request.client.associate',
      ],
    ],
  ] satisfies Array<
    [CompanyCommercialIntakePermissionSetVersion, readonly string[]]
  >)('resolves immutable %s permissions', (version, expected) => {
    expect(commercialIntakePermissionsFor(version)).toEqual(expected);
    expect(isCommercialIntakePermissionSetVersion(version)).toBe(true);
  });

  it.each([null, undefined, '', 'V3', 'v4'])(
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
    [
      'v3',
      [
        'document.read',
        'document.register',
        'document.reference.read',
        'document.correct',
        'document.version.manage',
      ],
    ],
  ] satisfies Array<[DocumentPermissionSetVersion, readonly string[]]>)(
    'resolves immutable %s permissions',
    (version, expected) => {
      expect(documentPermissionsFor(version)).toEqual(expected);
    },
  );

  it.each([null, undefined, '', 'V2', 'v4'])(
    'fails closed for an unsupported version: %s',
    (version) => {
      expect(documentPermissionsFor(version)).toEqual([]);
    },
  );

  it('never designates an official Version in any captured version', () => {
    for (const version of ['v1', 'v2', 'v3'])
      expect(documentPermissionsFor(version)).not.toContain(
        'document.version.designate_official',
      );
  });
});

describe('Company Document Approver permission sets', () => {
  it('resolves exactly the captured v1 designation permission', () => {
    expect(documentApproverPermissionsFor('v1')).toEqual([
      'document.version.designate_official',
    ]);
  });

  it.each([null, undefined, '', 'V1', 'v2'])(
    'fails closed for an unsupported version: %s',
    (version) => {
      expect(documentApproverPermissionsFor(version)).toEqual([]);
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
      documentPermissionsFor('v3'),
      documentApproverPermissionsFor('v1'),
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

describe('Company Profitability permission sets', () => {
  it('keeps contributor creation and director decision independent', () => {
    expect(profitabilityContributorPermissionsFor('v1')).toEqual([
      'commercial.profitability_estimate.read',
      'commercial.profitability_estimate.create',
    ]);
    expect(profitabilityDirectorPermissionsFor('v1')).toEqual([
      'commercial.profitability_estimate.read',
      'commercial.profitability_estimate.decide',
    ]);
  });

  it.each([null, undefined, '', 'V1', 'v2', 1])(
    'fails closed for an unsupported captured version: %s',
    (version) => {
      expect(profitabilityContributorPermissionsFor(version)).toEqual([]);
      expect(profitabilityDirectorPermissionsFor(version)).toEqual([]);
    },
  );

  it('never expands any existing captured assignment', () => {
    const existing: ReadonlyArray<readonly string[]> = [
      commercialIntakePermissionsFor('v1'),
      commercialIntakePermissionsFor('v2'),
      commercialActivityPermissionsFor('v1'),
      opportunityManagerPermissionsFor('v1'),
      pricingConfigurationPermissionsFor('v1'),
      pricingUserPermissionsFor('v1'),
      pricingAdjustmentPermissionsFor('v1'),
      offerPreparerPermissionsFor('v1'),
      serviceCataloguePermissionsFor('v1'),
      companyDirectorClientPermissionsFor('v2'),
      projectPermissionsFor('v2'),
      projectApproverPermissionsFor('v1'),
      taskPermissionsFor('v1'),
      documentPermissionsFor('v3'),
      documentApproverPermissionsFor('v1'),
    ];
    for (const permissions of existing)
      for (const permission of [
        ...profitabilityContributorPermissionsFor('v1'),
        ...profitabilityDirectorPermissionsFor('v1'),
      ])
        expect(permissions).not.toContain(permission);
  });
});
