import assert from 'node:assert/strict';
import test from 'node:test';
import { COMPANY_ROLE_BUNDLES } from '../apps/api/src/access/company-permissions.ts';
import {
  companyContextSchema,
  companyGrantSchema,
  createCurrentActorValidator,
  readContract,
} from './company-grants-openapi.mjs';

const contract = readContract();
const validator = createCurrentActorValidator(contract);
const uuid = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const company = { id: uuid, displayName: 'Fictional Company', grants: [] };
function actor(activeCompany = company) {
  return {
    internalUserId: uuid,
    workspaceMembershipId: uuid,
    workspaceId: uuid,
    workspaceName: 'Fictional Workspace',
    displayName: 'Fictional member',
    email: 'member@example.test',
    active: true,
    workspacePermissions: [],
    activeCompany,
  };
}

test('committed Company schemas exactly follow the registry and require only identity and grants', () => {
  assert.deepEqual(
    contract.components.schemas.CompanyGrant,
    companyGrantSchema(),
  );
  assert.deepEqual(
    contract.components.schemas.ActiveCompanyContext,
    companyContextSchema(contract.components.schemas.ActiveCompanyContext),
  );
  assert.deepEqual(contract.components.schemas.ActiveCompanyContext.required, [
    'id',
    'displayName',
    'grants',
  ]);
});

for (const [bundle, row] of Object.entries(COMPANY_ROLE_BUNDLES)) {
  test(`the public Actor schema accepts every exact captured ${bundle} version and refuses changed authority`, () => {
    const versions = Object.entries(row.versions);
    for (const [version, permissions] of versions.length
      ? versions
      : [[null, []]]) {
      const grant = {
        bundle,
        assignmentId: uuid,
        permissionSetVersion: version,
        permissions: [...permissions],
      };
      const accepts = (next) =>
        validator.accepts(actor({ ...company, grants: [next] }));
      assert.equal(accepts(grant), true, validator.errors());
      assert.equal(accepts({ ...grant, permissionSetVersion: 'v999' }), false);
      assert.equal(
        accepts({
          ...grant,
          permissions: [...permissions, 'unknown.permission'],
        }),
        false,
      );
      if (permissions.length) {
        assert.equal(
          accepts({ ...grant, permissions: permissions.slice(1) }),
          false,
        );
        assert.equal(
          accepts({ ...grant, permissions: [...permissions, permissions[0]] }),
          false,
        );
      }
    }
  });
}

test('the public Actor schema rejects missing grants, legacy fields and duplicate bundle captures', () => {
  const withoutGrants = { id: company.id, displayName: company.displayName };
  assert.equal(validator.accepts(actor(withoutGrants)), false);
  assert.equal(
    validator.accepts(actor({ ...company, clientPermissions: [] })),
    false,
  );
  assert.equal(validator.accepts(actor({ ...company, grants: null })), false);
  const grant = {
    bundle: 'company_context_access',
    assignmentId: uuid,
    permissionSetVersion: null,
    permissions: [],
  };
  assert.equal(
    validator.accepts(actor({ ...company, grants: [grant, grant] })),
    false,
  );
  assert.equal(
    validator.accepts(
      actor({
        ...company,
        grants: [grant, { ...grant, assignmentId: otherId }],
      }),
    ),
    false,
  );
  assert.equal(
    validator.accepts(
      actor({ ...company, grants: [{ ...grant, bundle: 'company_unknown' }] }),
    ),
    false,
  );
  assert.equal(
    validator.accepts(
      actor({ ...company, grants: [{ ...grant, assignmentId: 'invalid' }] }),
    ),
    false,
  );
});

test('a future registry row adds a supported grant without any Company context property', () => {
  const registry = {
    ...COMPANY_ROLE_BUNDLES,
    company_future_test: { versions: { v1: ['future.read'] } },
  };
  const context = companyContextSchema(
    contract.components.schemas.ActiveCompanyContext,
    registry,
  );
  assert.deepEqual(
    Object.keys(context.properties),
    Object.keys(contract.components.schemas.ActiveCompanyContext.properties),
  );
  const next = createCurrentActorValidator({
    ...contract,
    components: {
      ...contract.components,
      schemas: {
        ...contract.components.schemas,
        ActiveCompanyContext: context,
        CompanyGrant: companyGrantSchema(registry),
      },
    },
  });
  const futureActor = actor({
    ...company,
    grants: [
      {
        bundle: 'company_future_test',
        assignmentId: uuid,
        permissionSetVersion: 'v1',
        permissions: ['future.read'],
      },
    ],
  });
  assert.equal(validator.accepts(futureActor), false);
  assert.equal(next.accepts(futureActor), true, next.errors());
});
