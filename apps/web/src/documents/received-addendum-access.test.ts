import { expect, it } from 'vitest';
import type { ActorContext } from '../access-types';
import {
  companyGrants,
  withCompanyGrants,
  withoutCompanyGrants,
} from '../access/company-grants.test-fixture';
import { readCurrentActor } from '../access/current-actor';
import {
  canReadReceivedAddendumRelation,
  hasReceivedAddendumAccess,
  receivedAddendumSourceAuthority,
} from './received-addendum-access';

/** Public synthetic actor reused only by this family's UI seam tests. */
function receivedAddendumActor(): ActorContext {
  return {
    internalUserId: '10000000-0000-4000-8000-000000000001',
    workspaceId: '10000000-0000-4000-8000-000000000002',
    workspaceMembershipId: '10000000-0000-4000-8000-000000000003',
    workspaceName: 'Fictional Workspace',
    displayName: 'Fictional registrar',
    email: 'fictional@example.test',
    active: true,
    workspacePermissions: [],
    activeCompany: {
      id: '10000000-0000-4000-8000-000000000004',
      displayName: 'Fictional Company',
      grants: companyGrants(
        {
          bundle: 'company_received_addendum_access',
          version: 'v1',
          assignmentId: '10000000-0000-4000-8000-000000000005',
        },
        {
          bundle: 'company_document_registrar',
          version: 'v3',
          assignmentId: 'native-document',
        },
        {
          bundle: 'company_director_client_access',
          version: 'v2',
          assignmentId: 'native-client',
        },
        {
          bundle: 'company_contract_preparer',
          version: 'v2',
          assignmentId: 'native-contract',
        },
        {
          bundle: 'company_commercial_intake',
          version: 'v4',
          assignmentId: 'native-intake',
        },
      ),
      receivedAddendumClientReadCapture:
        'received-addendum-client-read.v1.' + 'a'.repeat(64),
    },
  };
}

function companyOf(actor: ActorContext) {
  if (!actor.activeCompany) throw new Error('Missing fixture Company');
  return actor.activeCompany;
}

it('requires the strict opt-in family capture and chosen native read rights without recipient-identity or model rights', () => {
  const actor = receivedAddendumActor();
  const company = companyOf(actor);
  expect(hasReceivedAddendumAccess(company)).toBe(true);
  expect(canReadReceivedAddendumRelation(actor)).toBe(true);
  expect(
    hasReceivedAddendumAccess({
      ...company,
      id: 'company',
      displayName: 'Company',
      grants: withCompanyGrants(company.grants, {
        bundle: 'company_received_addendum_access',
        version: 'v1',
        assignmentId: 'opaque',
      }),
    }),
  ).toBe(false);
  expect(
    hasReceivedAddendumAccess({
      ...company,
      id: 'company',
      displayName: 'Company',
      receivedAddendumClientReadCapture: { invented: true },
    }),
  ).toBe(false);
});

it('supports Workspace Client management and captured Contract approver without granting read through Early Preparation', async () => {
  const actor = receivedAddendumActor();
  const company = companyOf(actor);
  actor.workspacePermissions = ['client.manage'];
  company.grants = withCompanyGrants(
    withoutCompanyGrants(
      company.grants,
      'company_director_client_access',
      'company_contract_preparer',
    ),
    {
      bundle: 'company_contract_approver',
      version: 'v1',
      assignmentId: 'native-approver',
    },
  );
  expect(canReadReceivedAddendumRelation(actor)).toBe(true);
  company.grants = withCompanyGrants(
    withoutCompanyGrants(company.grants, 'company_contract_approver'),
    {
      bundle: 'company_contract_early_preparation',
      version: 'v1',
      assignmentId: 'native-early',
    },
  );
  // Early Preparation v1 grants prepare_pending_offer only; a grant claiming
  // Contract read through it is refused with the whole current Actor.
  expect(canReadReceivedAddendumRelation(actor)).toBe(false);
  expect(
    await readCurrentActor({
      api: {
        request: async () => ({
          status: 'ok',
          value: {
            ...actor,
            activeCompany: {
              ...company,
              grants: (company.grants ?? []).map((grant) =>
                grant.bundle === 'company_contract_early_preparation'
                  ? {
                      ...grant,
                      permissions: [
                        'commercial.contract.prepare_pending_offer',
                        'commercial.contract.read',
                      ],
                    }
                  : grant,
              ),
            },
          },
        }),
      },
    }),
  ).toEqual({ status: 'error' });
  company.grants = withoutCompanyGrants(
    company.grants,
    'company_contract_early_preparation',
  );
  expect(canReadReceivedAddendumRelation(actor)).toBe(false);
});

it('preserves source work when only an unconsumed Early Preparation capture changes', () => {
  const actor = receivedAddendumActor();
  const company = companyOf(actor);
  const original = receivedAddendumSourceAuthority(actor);
  company.grants = withCompanyGrants(company.grants, {
    bundle: 'company_contract_early_preparation',
    version: 'v1',
    assignmentId: 'early-first',
  });
  expect(canReadReceivedAddendumRelation(actor)).toBe(true);
  expect(receivedAddendumSourceAuthority(actor)).toBe(original);
  company.grants = withCompanyGrants(company.grants, {
    bundle: 'company_contract_early_preparation',
    version: 'v1',
    assignmentId: 'early-replacement',
  });
  expect(receivedAddendumSourceAuthority(actor)).toBe(original);
});

it('fails closed on missing endpoint permission, capture or malformed dedicated Client capture', () => {
  for (const bundle of [
    'company_received_addendum_access',
    'company_document_registrar',
    'company_director_client_access',
    'company_contract_preparer',
    'company_commercial_intake',
  ] as const) {
    const actor = receivedAddendumActor();
    const company = companyOf(actor);
    company.grants = withoutCompanyGrants(company.grants, bundle);
    expect(canReadReceivedAddendumRelation(actor)).toBe(false);
  }
  const withoutCapture = receivedAddendumActor();
  Reflect.deleteProperty(
    companyOf(withoutCapture),
    'receivedAddendumClientReadCapture',
  );
  expect(canReadReceivedAddendumRelation(withoutCapture)).toBe(false);
  const actor = receivedAddendumActor();
  companyOf(actor).receivedAddendumClientReadCapture =
    'received-addendum-client-read.v1.' + 'A'.repeat(64);
  expect(canReadReceivedAddendumRelation(actor)).toBe(false);
});

it('retires exact relevant captures and scope, without consuming economic, configuration, content or unused Company Client grants', () => {
  const actor = receivedAddendumActor();
  const company = companyOf(actor);
  const original = receivedAddendumSourceAuthority(actor);
  company.grants = withCompanyGrants(
    company.grants,
    {
      bundle: 'company_contract_model_editor',
      version: 'v1',
      assignmentId: 'unrelated-model',
    },
    {
      bundle: 'company_pricing_configuration',
      version: 'v1',
      assignmentId: 'unrelated',
    },
    {
      bundle: 'company_document_content_reader',
      version: 'v1',
      assignmentId: 'unrelated-reader',
    },
  );
  expect(receivedAddendumSourceAuthority(actor)).toBe(original);
  company.receivedAddendumClientReadCapture =
    'received-addendum-client-read.v1.' + 'b'.repeat(64);
  expect(receivedAddendumSourceAuthority(actor)).not.toBe(original);
  actor.workspacePermissions = ['client.manage'];
  const workspaceRead = receivedAddendumSourceAuthority(actor);
  company.grants = withCompanyGrants(company.grants, {
    bundle: 'company_director_client_access',
    version: 'v2',
    assignmentId: 'unconsumed-company-client',
  });
  expect(receivedAddendumSourceAuthority(actor)).toBe(workspaceRead);
  actor.internalUserId = 'replacement-user';
  expect(receivedAddendumSourceAuthority(actor)).not.toBe(workspaceRead);
});
