import { readFile } from 'node:fs/promises';
import { PgDialect, getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  companyRoleAssignments,
  companyRoleBundle,
} from '../database/schema/index.js';
import {
  COMPANY_ROLE_BUNDLES,
  companyRolePermissionsFor,
  companyRoleVersionsWith,
  isCompanyRolePermissionSetVersion,
  type CompanyRoleBundle,
} from './company-permissions.js';

// The captured permission sets every Company role bundle resolves today. A
// new version is added here deliberately, never by editing an existing one.
const EXPECTED: Record<CompanyRoleBundle, Record<string, readonly string[]>> = {
  company_context_access: {},
  company_director_client_access: {
    v1: ['client.read', 'client.create', 'client.update'],
    v2: [
      'client.read',
      'client.create',
      'client.update',
      'client.duplicate.resolve',
    ],
  },
  company_task_manager: { v1: ['task.read', 'task.manage'] },
  company_document_project_organizer: { v1: ['document.project.manage'] },
  company_document_registrar: {
    v1: ['document.read', 'document.register', 'document.reference.read'],
    v2: [
      'document.read',
      'document.register',
      'document.reference.read',
      'document.correct',
    ],
    v3: [
      'document.read',
      'document.register',
      'document.reference.read',
      'document.correct',
      'document.version.manage',
    ],
  },
  company_document_approver: { v1: ['document.version.designate_official'] },
  company_project_access: {
    v1: ['project.read', 'project.create'],
    v2: ['project.read', 'project.create', 'project.update'],
  },
  company_commercial_intake: {
    v1: [
      'commercial.request.read',
      'commercial.request.create',
      'commercial.opportunity.read',
      'commercial.opportunity.create',
    ],
    v2: [
      'commercial.request.read',
      'commercial.request.create',
      'commercial.opportunity.read',
      'commercial.opportunity.create',
      'commercial.opportunity.next_action.update',
    ],
    v3: [
      'commercial.request.read',
      'commercial.request.create',
      'commercial.opportunity.read',
      'commercial.opportunity.create',
      'commercial.opportunity.next_action.update',
      'commercial.request.client.associate',
    ],
    v4: [
      'commercial.request.read',
      'commercial.request.create',
      'commercial.opportunity.read',
      'commercial.opportunity.create',
      'commercial.opportunity.next_action.update',
      'commercial.request.client.associate',
      'commercial.opportunity.stage.set',
    ],
  },
  company_service_catalogue: {
    v1: [
      'service.definition.read',
      'service.definition.create',
      'commercial.offering.read',
      'commercial.offering.manage',
    ],
  },
  company_pricing_configuration: {
    v1: [
      'commercial.offering.read',
      'commercial.pricing.configuration.read',
      'commercial.pricing.configuration.manage',
    ],
  },
  company_pricing_user: {
    v1: [
      'commercial.offering.read',
      'commercial.pricing.configuration.read',
      'commercial.pricing.calculate',
      'commercial.pricing.snapshot.read',
    ],
  },
  company_pricing_adjustment: { v1: ['commercial.pricing.adjustment.apply'] },
  company_offer_preparer: {
    v1: [
      'commercial.offer.read',
      'commercial.offer.prepare',
      'commercial.offer.transmission.record',
      'commercial.pricing.snapshot.read',
    ],
  },
  company_contract_preparer: {
    v1: [
      'commercial.contract.read',
      'commercial.contract.prepare',
      'commercial.contract.project.link',
    ],
  },
  company_contract_approver: {
    v1: [
      'commercial.contract.read',
      'commercial.contract.approve',
      'commercial.contract.signature.record',
    ],
  },
  company_offer_approver: {
    v1: [
      'commercial.offer.read',
      'commercial.offer.approve',
      'commercial.offer.response.record',
    ],
  },
  company_commercial_activity_reader: { v1: ['commercial.activity.read'] },
  company_opportunity_manager: {
    v1: ['commercial.opportunity.assign'],
    v2: [
      'commercial.opportunity.assign',
      'commercial.opportunity.outcome.change',
    ],
  },
  company_project_approver: {
    v1: ['project.lifecycle.transition', 'project.close'],
  },
  company_profitability_contributor: {
    v1: [
      'commercial.profitability_estimate.read',
      'commercial.profitability_estimate.create',
    ],
  },
  company_profitability_director: {
    v1: [
      'commercial.profitability_estimate.read',
      'commercial.profitability_estimate.decide',
    ],
  },
  company_sales_stage_configuration: {
    v1: ['commercial.sales_stage.configure'],
  },
  company_document_content_reader: { v1: ['document.content.read'] },
  company_document_content_uploader: { v1: ['document.content.upload'] },
};

const EXPECTED_LABELS: Record<CompanyRoleBundle, string> = {
  company_context_access: 'Company Context Access',
  company_director_client_access: 'Company Director Client Access',
  company_task_manager: 'Company Task Manager',
  company_document_project_organizer: 'Company Document Project Organizer',
  company_document_registrar: 'Company Document Registrar',
  company_document_approver: 'Company Document Approver',
  company_project_access: 'Company Project Access',
  company_commercial_intake: 'Company Commercial Intake',
  company_service_catalogue: 'Company Service Catalogue',
  company_pricing_configuration: 'Company Pricing Configuration',
  company_pricing_user: 'Company Pricing User',
  company_pricing_adjustment: 'Company Pricing Adjustment',
  company_offer_preparer: 'Company Offer Preparer',
  company_contract_preparer: 'Company Contract Preparer',
  company_contract_approver: 'Company Contract Approver',
  company_offer_approver: 'Company Offer Approver',
  company_commercial_activity_reader: 'Company Commercial Activity Reader',
  company_opportunity_manager: 'Company Opportunity Manager',
  company_project_approver: 'Company Project Approver',
  company_profitability_contributor: 'Company Profitability Contributor',
  company_profitability_director: 'Company Profitability Director',
  company_sales_stage_configuration: 'Company Sales Stage Configuration',
  company_document_content_reader: 'Company Document Content Reader',
  company_document_content_uploader: 'Company Document Content Uploader',
};

const BUNDLES = Object.keys(EXPECTED).filter(
  (bundle): bundle is CompanyRoleBundle => Object.hasOwn(EXPECTED, bundle),
);
const ALL_CAPTURED_VERSIONS = ['v1', 'v2', 'v3', 'v4'];

describe('Company role bundle registry', () => {
  it('registers exactly the persisted Company role bundles', () => {
    expect(Object.keys(COMPANY_ROLE_BUNDLES).sort()).toEqual(
      [...companyRoleBundle.enumValues].sort(),
    );
    expect(Object.keys(COMPANY_ROLE_BUNDLES).sort()).toEqual(
      [...BUNDLES].sort(),
    );
  });

  it.each(BUNDLES)('pins the label and captured versions of %s', (bundle) => {
    expect(COMPANY_ROLE_BUNDLES[bundle].label).toBe(EXPECTED_LABELS[bundle]);
    expect(COMPANY_ROLE_BUNDLES[bundle].versions).toEqual(EXPECTED[bundle]);
    // Captured versions resolve in their capture order.
    expect(companyRoleVersionsWith(bundle, [])).toEqual(
      Object.keys(EXPECTED[bundle]),
    );
    for (const [version, permissions] of Object.entries(EXPECTED[bundle])) {
      expect(companyRolePermissionsFor(bundle, version)).toEqual(permissions);
      expect(isCompanyRolePermissionSetVersion(bundle, version)).toBe(true);
    }
  });

  it.each(BUNDLES)(
    'fails closed for %s on null, unknown and other-bundle versions',
    (bundle) => {
      const foreign = ALL_CAPTURED_VERSIONS.filter(
        (version) => !Object.hasOwn(EXPECTED[bundle], version),
      );
      for (const version of [
        null,
        undefined,
        '',
        'V1',
        'v0',
        'v5',
        ' v1',
        'toString',
        '__proto__',
        'constructor',
        1,
        {},
        ['v1'],
        ...foreign,
      ]) {
        expect(companyRolePermissionsFor(bundle, version)).toEqual([]);
        expect(isCompanyRolePermissionSetVersion(bundle, version)).toBe(false);
      }
    },
  );

  it.each(BUNDLES)(
    'accepts for %s exactly the versions carrying every required permission',
    (bundle) => {
      const versions = Object.entries(EXPECTED[bundle]);
      for (const [version] of versions)
        for (const permission of companyRolePermissionsFor(bundle, version))
          expect(companyRoleVersionsWith(bundle, [permission])).toEqual(
            versions
              .filter(([, granted]) => granted.includes(permission))
              .map(([carrying]) => carrying),
          );
    },
  );

  it('resolves the versions carrying several required permissions', () => {
    expect(
      companyRoleVersionsWith('company_commercial_intake', [
        'commercial.request.read',
        'commercial.opportunity.read',
      ]),
    ).toEqual(['v1', 'v2', 'v3', 'v4']);
    expect(
      companyRoleVersionsWith('company_commercial_intake', [
        'commercial.request.read',
        'commercial.request.client.associate',
      ]),
    ).toEqual(['v3', 'v4']);
    expect(
      companyRoleVersionsWith('company_commercial_intake', [
        'commercial.request.read',
        'commercial.opportunity.read',
        'commercial.opportunity.stage.set',
      ]),
    ).toEqual(['v4']);
    expect(
      companyRoleVersionsWith('company_opportunity_manager', [
        'commercial.opportunity.outcome.change',
      ]),
    ).toEqual(['v2']);
    expect(
      companyRoleVersionsWith('company_director_client_access', [
        'client.duplicate.resolve',
      ]),
    ).toEqual(['v2']);
  });
});

describe('Company role permission set version CHECK', () => {
  const bundle = '"company_role_assignments"."bundle"::text';
  const version = '"company_role_assignments"."permission_set_version"';
  const singleVersionBundles =
    "'company_task_manager', 'company_document_project_organizer', 'company_document_approver', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader'";
  const versionedBundles =
    "'company_director_client_access', 'company_task_manager', 'company_document_project_organizer', 'company_document_registrar', 'company_document_approver', 'company_project_access', 'company_commercial_intake', 'company_service_catalogue', 'company_pricing_configuration', 'company_pricing_user', 'company_pricing_adjustment', 'company_offer_preparer', 'company_contract_preparer', 'company_contract_approver', 'company_offer_approver', 'company_commercial_activity_reader', 'company_opportunity_manager', 'company_project_approver', 'company_profitability_contributor', 'company_profitability_director', 'company_sales_stage_configuration', 'company_document_content_reader', 'company_document_content_uploader'";
  const EXPECTED_CHECK = [
    '(',
    `        (${bundle} = 'company_director_client_access'`,
    `          AND ${version} IS NOT NULL`,
    `          AND ${version} IN ('v1', 'v2'))`,
    '        OR',
    `        (${bundle} = 'company_document_registrar' AND ${version} IS NOT NULL AND ${version} IN ('v1', 'v2', 'v3'))`,
    '        OR',
    `        (${bundle} = 'company_commercial_intake' AND ${version} IS NOT NULL AND ${version} IN ('v1', 'v2', 'v3', 'v4'))`,
    '        OR',
    `        (${bundle} = 'company_project_access' AND ${version} IS NOT NULL AND ${version} IN ('v1', 'v2'))`,
    '        OR',
    `        (${bundle} = 'company_opportunity_manager' AND ${version} IS NOT NULL AND ${version} IN ('v1', 'v2'))`,
    '        OR',
    `        (${bundle} IN (${singleVersionBundles}) AND ${version} IS NOT NULL AND ${version} = 'v1')`,
    '        OR',
    `        (${bundle} NOT IN (${versionedBundles})`,
    `          AND ${version} IS NULL)`,
    '      )',
  ].join('\n');

  function renderedCheck(): string {
    const check = getTableConfig(companyRoleAssignments).checks.find(
      ({ name }) =>
        name === 'company_role_assignments_permission_set_version_check',
    );
    if (check === undefined) throw new Error('The version CHECK is missing.');
    const { sql, params } = new PgDialect().sqlToQuery(check.value);
    expect(params).toEqual([]);
    return sql;
  }

  it('renders the CHECK generated from the registry byte for byte', () => {
    expect(renderedCheck()).toBe(EXPECTED_CHECK);
  });

  it('matches the constraint captured by the latest migration snapshot', async () => {
    const journal = await readFile('drizzle/meta/_journal.json', 'utf8');
    const indexes = [...journal.matchAll(/"idx": (\d+)/gu)].map(([, index]) =>
      Number(index),
    );
    const latest = String(Math.max(...indexes)).padStart(4, '0');
    const snapshot = await readFile(
      `drizzle/meta/${latest}_snapshot.json`,
      'utf8',
    );
    expect(snapshot).toContain(`"value": ${JSON.stringify(renderedCheck())}`);
  });
});
