import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';
import {
  COMPANY_ROLE_BUNDLES,
  companyRoleGrantVersion,
  companyRolePermissionsFor,
  type CompanyRoleBundle,
} from './company-permissions.js';
import { assignmentRouteCases } from './company-role-assignment.routes.test-fixture.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;
const WORKSPACE_ID = '00000000-0000-4000-8000-000000001332';

/**
 * How the legacy per-bundle fields of the active Company context describe a
 * live grant of each bundle. `permissions` may be a field shared with other
 * bundles: each case holds only this bundle besides Company Context Access,
 * which adds no permission. A fact the legacy fields never carried is absent
 * from its entry, and `grants` must still carry it.
 */
type LegacyDescription =
  | { kind: 'context-only' }
  | {
      kind: 'fields';
      permissions?: string;
      assignmentId?: string;
      permissionSetVersion?: string;
    }
  | { kind: 'list'; list: string; permissions: boolean };

function fields(
  permissions: string | undefined,
  assignmentId: string | undefined,
  permissionSetVersion: string | undefined,
): LegacyDescription {
  return { kind: 'fields', permissions, assignmentId, permissionSetVersion };
}

const LEGACY_FIELDS = {
  company_context_access: { kind: 'context-only' },
  company_director_client_access: fields(
    'clientPermissions',
    'clientPermissionAssignmentId',
    'clientPermissionSetVersion',
  ),
  company_internal_task_manager: fields(
    'internalTaskPermissions',
    'internalTaskManagerAssignmentId',
    'internalTaskManagerPermissionSetVersion',
  ),
  company_task_manager: fields(
    'taskPermissions',
    'taskPermissionAssignmentId',
    'taskPermissionSetVersion',
  ),
  company_document_project_organizer: fields(
    'documentPermissions',
    undefined,
    undefined,
  ),
  company_document_registrar: fields(
    'documentPermissions',
    'documentPermissionAssignmentId',
    'documentPermissionSetVersion',
  ),
  company_document_approver: fields(
    'documentPermissions',
    'documentApproverAssignmentId',
    'documentApproverPermissionSetVersion',
  ),
  company_project_access: fields(
    'projectPermissions',
    'projectPermissionAssignmentId',
    'projectPermissionSetVersion',
  ),
  company_commercial_intake: fields(
    'commercialIntakePermissions',
    'commercialIntakePermissionAssignmentId',
    'commercialIntakePermissionSetVersion',
  ),
  company_service_catalogue: fields(
    'serviceCataloguePermissions',
    'serviceCataloguePermissionAssignmentId',
    'serviceCataloguePermissionSetVersion',
  ),
  company_pricing_configuration: fields(
    'pricingConfigurationPermissions',
    'pricingConfigurationPermissionAssignmentId',
    'pricingConfigurationPermissionSetVersion',
  ),
  company_pricing_user: fields(
    'pricingUserPermissions',
    'pricingUserPermissionAssignmentId',
    'pricingUserPermissionSetVersion',
  ),
  company_pricing_adjustment: fields(
    'pricingAdjustmentPermissions',
    'pricingAdjustmentPermissionAssignmentId',
    'pricingAdjustmentPermissionSetVersion',
  ),
  company_offer_preparer: fields(
    'offerPermissions',
    'offerPermissionAssignmentId',
    'offerPermissionSetVersion',
  ),
  company_contract_preparer: fields(
    'contractPermissions',
    'contractPermissionAssignmentId',
    'contractPermissionSetVersion',
  ),
  company_contract_early_preparation: fields(
    'contractPermissions',
    'contractEarlyPreparationAssignmentId',
    'contractEarlyPreparationPermissionSetVersion',
  ),
  company_contract_approver: fields(
    'contractPermissions',
    'contractApproverAssignmentId',
    'contractApproverPermissionSetVersion',
  ),
  company_offer_approver: fields(
    'offerPermissions',
    'offerApproverAssignmentId',
    'offerApproverPermissionSetVersion',
  ),
  company_commercial_activity_reader: fields(
    'commercialActivityPermissions',
    undefined,
    'commercialActivityPermissionSetVersion',
  ),
  company_opportunity_manager: fields(
    'opportunityManagerPermissions',
    'opportunityManagerPermissionAssignmentId',
    'opportunityManagerPermissionSetVersion',
  ),
  company_project_approver: fields(
    'projectApproverPermissions',
    'projectApproverPermissionAssignmentId',
    'projectApproverPermissionSetVersion',
  ),
  company_profitability_contributor: fields(
    'profitabilityContributorPermissions',
    'profitabilityContributorPermissionAssignmentId',
    'profitabilityContributorPermissionSetVersion',
  ),
  company_profitability_director: fields(
    'profitabilityDirectorPermissions',
    'profitabilityDirectorPermissionAssignmentId',
    'profitabilityDirectorPermissionSetVersion',
  ),
  company_sales_stage_configuration: fields(
    'salesStageConfigurationPermissions',
    'salesStageConfigurationPermissionAssignmentId',
    'salesStageConfigurationPermissionSetVersion',
  ),
  company_document_content_reader: fields(
    'documentPermissions',
    'documentContentReaderAssignmentId',
    'documentContentReaderPermissionSetVersion',
  ),
  company_document_content_uploader: fields(
    'documentPermissions',
    'documentContentUploaderAssignmentId',
    'documentContentUploaderPermissionSetVersion',
  ),
  company_project_template_user: fields(
    'projectTemplatePermissions',
    'projectTemplatePermissionAssignmentId',
    'projectTemplatePermissionSetVersion',
  ),
  company_project_stage_advancer: fields(
    'projectStagePermissions',
    'projectStagePermissionAssignmentId',
    'projectStagePermissionSetVersion',
  ),
  company_project_template_configuration: fields(
    'projectTemplateConfigurationPermissions',
    'projectTemplateConfigurationPermissionAssignmentId',
    'projectTemplateConfigurationPermissionSetVersion',
  ),
  company_ideas_reader: fields(
    'ideasReaderPermissions',
    'ideasReaderPermissionAssignmentId',
    'ideasReaderPermissionSetVersion',
  ),
  company_ideas_recorder: fields(
    'ideasRecorderPermissions',
    'ideasRecorderPermissionAssignmentId',
    'ideasRecorderPermissionSetVersion',
  ),
  company_ideas_reviewer: fields(
    'ideasReviewerPermissions',
    'ideasReviewerPermissionAssignmentId',
    'ideasReviewerPermissionSetVersion',
  ),
  company_operational_risk_reader: fields(
    'operationalRiskPermissions',
    'operationalRiskReaderAssignmentId',
    'operationalRiskReaderPermissionSetVersion',
  ),
  company_operational_risk_recorder: fields(
    'operationalRiskPermissions',
    'operationalRiskRecorderAssignmentId',
    'operationalRiskRecorderPermissionSetVersion',
  ),
  company_task_result_recorder: fields(
    'taskResultPermissions',
    'taskResultRecorderAssignmentId',
    'taskResultRecorderPermissionSetVersion',
  ),
  company_project_next_action_coordinator: fields(
    'projectNextActionPermissions',
    'projectNextActionCoordinatorAssignmentId',
    'projectNextActionCoordinatorPermissionSetVersion',
  ),
  company_mission_applicability_coordinator: fields(
    'missionApplicabilityProposalPermissions',
    'missionApplicabilityCoordinatorAssignmentId',
    'missionApplicabilityCoordinatorPermissionSetVersion',
  ),
  company_mission_applicability_approver: fields(
    'missionApplicabilityDecisionPermissions',
    'missionApplicabilityApproverAssignmentId',
    'missionApplicabilityApproverPermissionSetVersion',
  ),
  company_mission_result_reviewer: fields(
    'missionResultReviewPermissions',
    'missionResultReviewerAssignmentId',
    'missionResultReviewerPermissionSetVersion',
  ),
  company_mission_deliverable_access: fields(
    'documentPermissions',
    'missionDeliverableAccessAssignmentId',
    'missionDeliverableAccessPermissionSetVersion',
  ),
  company_contract_signature_declarer: fields(
    undefined,
    'contractSignatureDeclarerAssignmentId',
    'contractSignatureDeclarerPermissionSetVersion',
  ),
  company_received_contract_access: fields(
    'documentPermissions',
    'receivedContractAccessAssignmentId',
    'receivedContractAccessPermissionSetVersion',
  ),
  company_received_addendum_access: fields(
    'documentPermissions',
    'receivedAddendumAccessAssignmentId',
    'receivedAddendumAccessPermissionSetVersion',
  ),
  company_offer_model_editor: {
    kind: 'list',
    list: 'offerModelGrants',
    permissions: true,
  },
  company_offer_model_approver: {
    kind: 'list',
    list: 'offerModelGrants',
    permissions: true,
  },
  company_contract_model_editor: {
    kind: 'list',
    list: 'contractModelGrants',
    permissions: true,
  },
  company_contract_model_approver: {
    kind: 'list',
    list: 'contractModelGrants',
    permissions: true,
  },
  company_mission_plan_configuration: {
    kind: 'list',
    list: 'missionPlanGrants',
    permissions: true,
  },
  company_mission_plan_user: {
    kind: 'list',
    list: 'missionPlanGrants',
    permissions: true,
  },
  company_knowledge_source_administrator: {
    kind: 'list',
    list: 'knowledgeGrants',
    permissions: false,
  },
  company_knowledge_evidence_reader: {
    kind: 'list',
    list: 'knowledgeGrants',
    permissions: false,
  },
  company_payment_reader: {
    kind: 'list',
    list: 'paymentGrants',
    permissions: false,
  },
  company_payment_recorder: {
    kind: 'list',
    list: 'paymentGrants',
    permissions: false,
  },
  company_payment_confirmer: {
    kind: 'list',
    list: 'paymentGrants',
    permissions: false,
  },
  company_payment_reverser: {
    kind: 'list',
    list: 'paymentGrants',
    permissions: false,
  },
  company_payment_evidence_access: {
    kind: 'list',
    list: 'paymentGrants',
    permissions: false,
  },
  company_invoice_reader: {
    kind: 'list',
    list: 'externalInvoiceGrants',
    permissions: false,
  },
  company_invoice_recorder: {
    kind: 'list',
    list: 'externalInvoiceGrants',
    permissions: false,
  },
  company_external_invoice_access: {
    kind: 'list',
    list: 'externalInvoiceGrants',
    permissions: false,
  },
  company_opportunity_follow_up_coordinator: fields(
    'opportunityFollowUpPermissions',
    'opportunityFollowUpCoordinatorAssignmentId',
    'opportunityFollowUpCoordinatorPermissionSetVersion',
  ),
  company_working_evidence_case_reader: fields(
    'workingEvidenceCasePermissions',
    'workingEvidenceCaseReaderAssignmentId',
    'workingEvidenceCaseReaderPermissionSetVersion',
  ),
  company_working_evidence_case_recorder: fields(
    'workingEvidenceCasePermissions',
    'workingEvidenceCaseRecorderAssignmentId',
    'workingEvidenceCaseRecorderPermissionSetVersion',
  ),
  company_received_audit_source_access: fields(
    'documentPermissions',
    'receivedAuditSourceAccessAssignmentId',
    'receivedAuditSourceAccessPermissionSetVersion',
  ),
  company_certification_reader: fields(
    'certificationReaderPermissions',
    'certificationReaderAssignmentId',
    'certificationReaderPermissionSetVersion',
  ),
  company_certification_programme_manager: fields(
    'certificationProgrammeManagerPermissions',
    'certificationProgrammeManagerAssignmentId',
    'certificationProgrammeManagerPermissionSetVersion',
  ),
  company_certification_approver: fields(
    'certificationApproverPermissions',
    'certificationApproverAssignmentId',
    'certificationApproverPermissionSetVersion',
  ),
  company_certification_auditor: fields(
    'certificationAuditorPermissions',
    'certificationAuditorAssignmentId',
    'certificationAuditorPermissionSetVersion',
  ),
} satisfies Record<CompanyRoleBundle, LegacyDescription>;

const KNOWLEDGE_ROUTES: Partial<Record<CompanyRoleBundle, string>> = {
  company_knowledge_source_administrator:
    '/api/knowledge/assignments/administrators',
  company_knowledge_evidence_reader: '/api/knowledge/assignments/readers',
};

const REGISTRY_BUNDLES = Object.keys(COMPANY_ROLE_BUNDLES).filter(
  (bundle): bundle is CompanyRoleBundle =>
    Object.hasOwn(COMPANY_ROLE_BUNDLES, bundle),
);

function routeOf(bundle: CompanyRoleBundle): string {
  const route =
    assignmentRouteCases.find((candidate) => candidate.bundle === bundle)
      ?.path ?? KNOWLEDGE_ROUTES[bundle];
  if (!route) throw new Error(`No assignment route for ${bundle}`);
  return route;
}

/** Every version an assignment of `bundle` can have captured, in order. */
function capturedVersions(bundle: CompanyRoleBundle): (string | null)[] {
  const versions = Object.keys(COMPANY_ROLE_BUNDLES[bundle].versions);
  return versions.length === 0 ? [null] : versions;
}

interface ExpectedGrant {
  bundle: CompanyRoleBundle;
  assignmentId: string;
  permissionSetVersion: string | null;
  permissions: string[];
}

function expectedGrant(
  bundle: CompanyRoleBundle,
  assignmentId: string,
  permissionSetVersion: string | null,
): ExpectedGrant {
  return {
    bundle,
    assignmentId,
    permissionSetVersion,
    permissions: [...companyRolePermissionsFor(bundle, permissionSetVersion)],
  };
}

/** What the legacy fields say about `bundle`; undefined when they show no grant. */
function legacyGrant(
  company: Record<string, unknown>,
  bundle: CompanyRoleBundle,
):
  | {
      assignmentId?: unknown;
      permissionSetVersion?: unknown;
      permissions?: unknown;
    }
  | undefined {
  const description: LegacyDescription = LEGACY_FIELDS[bundle];
  switch (description.kind) {
    case 'context-only':
      return {};
    case 'fields': {
      // `clientPermissions` is always present, and empty without a grant.
      const facts = Object.fromEntries(
        (['permissions', 'assignmentId', 'permissionSetVersion'] as const)
          .map((fact) => [fact, description[fact]] as const)
          .flatMap(([fact, key]) =>
            key === undefined ||
            company[key] === undefined ||
            (Array.isArray(company[key]) && company[key].length === 0)
              ? []
              : [[fact, company[key]]],
          ),
      );
      return Object.keys(facts).length === 0 ? undefined : facts;
    }
    case 'list': {
      const list = company[description.list];
      if (list === undefined) return undefined;
      if (!Array.isArray(list))
        throw new Error(`${description.list} is not a list`);
      const entries: unknown[] = list;
      const entry = entries
        .map(object)
        .find((candidate) => candidate.bundle === bundle);
      if (!entry) return undefined;
      return {
        assignmentId: entry.assignmentId,
        permissionSetVersion: entry.permissionSetVersion,
        ...(description.permissions ? { permissions: entry.permissions } : {}),
      };
    }
  }
}

function sorted(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  const items: unknown[] = value;
  return items.map(String).sort();
}

/** The legacy fields carry each fact they hold exactly as `grant` does. */
function expectLegacyToDescribe(
  company: Record<string, unknown>,
  grant: ExpectedGrant,
) {
  const legacy = legacyGrant(company, grant.bundle);
  expect(legacy, `legacy fields of ${grant.bundle}`).toBeDefined();
  if (!legacy) return;
  if ('assignmentId' in legacy)
    expect(legacy.assignmentId).toBe(grant.assignmentId);
  if ('permissionSetVersion' in legacy)
    expect(legacy.permissionSetVersion).toBe(grant.permissionSetVersion);
  if ('permissions' in legacy)
    expect(sorted(legacy.permissions)).toEqual(sorted(grant.permissions));
}

describeWithPostgres('Active Company grants list', () => {
  let isolated: IsolatedPostgresTestDatabase;
  let harness: PostgresRestTestHarness;
  let pool: Pool;
  let origin: string;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    isolated = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'company_grants',
    });
    harness = await createPostgresRestTestHarness({
      databaseUrl: isolated.targetUrl,
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'workspace-owner',
        ACCESS_BOOTSTRAP_WORKSPACE_ID: WORKSPACE_ID,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Grants List Workspace',
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify([
          {
            provider: 'deterministic-test',
            subject: 'workspace-member',
            workspaceId: WORKSPACE_ID,
          },
        ]),
      },
    });
    ({ pool, origin } = harness);
  }, 120_000);

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE activity_log_events, company_role_assignments, companies, workspace_permission_grants, workspace_memberships, internal_users, workspaces CASCADE',
    );
  });

  afterAll(async () => {
    await harness?.close();
    await isolated?.close();
  });

  it('covers every registry bundle with a legacy description and a route', () => {
    expect(Object.keys(LEGACY_FIELDS).sort()).toEqual(
      [...REGISTRY_BUNDLES].sort(),
    );
    for (const bundle of REGISTRY_BUNDLES)
      expect(routeOf(bundle)).toMatch(/^\/api\//u);
  });

  it.each(REGISTRY_BUNDLES)(
    'describes a live %s grant in grants exactly as the legacy fields do, at every captured version and after its revocation',
    async (bundle) => {
      const target = await createTargets();
      const context =
        bundle === 'company_context_access'
          ? undefined
          : await grant('company_context_access', target);
      const receipt = await grant(bundle, target);
      expect(receipt.permissionSetVersion).toBe(
        companyRoleGrantVersion(bundle),
      );
      expect(context?.permissionSetVersion ?? null).toBeNull();
      const others = context
        ? [expectedGrant('company_context_access', text(context.id), null)]
        : [];

      for (const version of capturedVersions(bundle)) {
        await pool.query(
          'UPDATE company_role_assignments SET permission_set_version = $1 WHERE id = $2',
          [version, receipt.id],
        );
        const company = await activeCompany(target.companyId);
        const live = expectedGrant(bundle, text(receipt.id), version);
        expect(company.grants).toEqual(ordered([...others, live]));
        expectLegacyToDescribe(company, live);
      }

      const revoke = await fetch(
        `${origin}${routeOf(bundle)}/${target.workspaceMembershipId}/${target.companyId}`,
        {
          method: 'DELETE',
          headers: { ...identity('workspace-owner'), 'idempotency-key': 'r' },
        },
      );
      expect(revoke.status).toBe(200);
      if (bundle === 'company_context_access') {
        // Without any grant the member has no Company context at all.
        expect((await currentActor(target.companyId)).status).toBe(403);
        return;
      }
      const company = await activeCompany(target.companyId);
      expect(company.grants).toEqual(others);
      expect(legacyGrant(company, bundle)).toBeUndefined();
    },
  );

  it('lists no grant for a Workspace Company manager holding none, and omits the context without a Company', async () => {
    const target = await createTargets();
    const response = await fetch(`${origin}/api/access/current-actor`, {
      headers: {
        ...identity('workspace-owner'),
        'x-company-context-id': target.companyId,
      },
    });
    expect(response.status).toBe(200);
    const actor = await objectResponse(response);
    expect(actor.workspacePermissions).toContain('company.manage');
    const company = object(actor.activeCompany);
    expect(company.grants).toEqual([]);
    for (const bundle of REGISTRY_BUNDLES)
      if (bundle !== 'company_context_access')
        expect(legacyGrant(company, bundle)).toBeUndefined();

    const withoutCompany = await objectResponse(
      await fetch(`${origin}/api/access/current-actor`, {
        headers: identity('workspace-member'),
      }),
    );
    expect(withoutCompany).not.toHaveProperty('activeCompany');
    expect((await currentActor(target.companyId)).status).toBe(403);
  });

  /** Grants of a context ordered as the registry lists their bundles. */
  function ordered(grants: ExpectedGrant[]) {
    return [...grants].sort(
      (left, right) =>
        REGISTRY_BUNDLES.indexOf(left.bundle) -
        REGISTRY_BUNDLES.indexOf(right.bundle),
    );
  }

  async function grant(
    bundle: CompanyRoleBundle,
    target: { workspaceMembershipId: string; companyId: string },
  ) {
    const response = await fetch(origin + routeOf(bundle), {
      method: 'POST',
      headers: {
        ...identity('workspace-owner'),
        'content-type': 'application/json',
        'idempotency-key': `grant-${bundle}`,
      },
      body: JSON.stringify(target),
    });
    expect(response.status).toBe(201);
    return objectResponse(response);
  }

  function currentActor(companyId: string) {
    return fetch(`${origin}/api/access/current-actor`, {
      headers: {
        ...identity('workspace-member'),
        'x-company-context-id': companyId,
      },
    });
  }

  async function activeCompany(companyId: string) {
    const response = await currentActor(companyId);
    expect(response.status).toBe(200);
    return object((await objectResponse(response)).activeCompany);
  }

  async function createTargets() {
    await actor('workspace-owner');
    const member = await actor('workspace-member');
    const response = await fetch(`${origin}/api/companies`, {
      method: 'POST',
      headers: {
        ...identity('workspace-owner'),
        'content-type': 'application/json',
        'idempotency-key': 'company',
      },
      body: JSON.stringify({ displayName: 'Grants List Company' }),
    });
    expect(response.status).toBe(201);
    const company = await objectResponse(response);
    return {
      workspaceMembershipId: text(member.workspaceMembershipId),
      companyId: text(company.id),
    };
  }

  async function actor(subject: string) {
    const response = await fetch(`${origin}/api/access/current-actor`, {
      headers: identity(subject),
    });
    expect(response.status).toBe(200);
    return objectResponse(response);
  }
});

function identity(subject: string) {
  return {
    'x-test-external-provider': 'deterministic-test',
    'x-test-external-subject': subject,
    'x-test-display-name': subject,
    'x-test-email': `${subject}@example.test`,
  };
}

async function objectResponse(
  response: Response,
): Promise<Record<string, unknown>> {
  const value: unknown = await response.json();
  return object(value);
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a public JSON object');
  return Object.fromEntries(Object.entries(value));
}

function text(value: unknown) {
  if (typeof value !== 'string' || !value)
    throw new Error('Expected a public identity');
  return value;
}
