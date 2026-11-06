import { expect, it } from 'vitest';
import type { ActorContext } from '../access-types';
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
      receivedAddendumAccessAssignmentId:
        '10000000-0000-4000-8000-000000000005',
      receivedAddendumAccessPermissionSetVersion: 'v1',
      receivedAddendumClientReadCapture:
        'received-addendum-client-read.v1.' + 'a'.repeat(64),
      documentPermissions: [
        'document.read',
        'document.register',
        'document.received_addendum.access',
      ],
      documentPermissionAssignmentId: 'native-document',
      documentPermissionSetVersion: 'v3',
      clientPermissions: ['client.read'],
      clientPermissionAssignmentId: 'native-client',
      clientPermissionSetVersion: 'v2',
      contractPermissions: ['commercial.contract.read'],
      contractPermissionAssignmentId: 'native-contract',
      contractPermissionSetVersion: 'v2',
      commercialIntakePermissions: ['commercial.opportunity.read'],
      commercialIntakePermissionAssignmentId: 'native-intake',
      commercialIntakePermissionSetVersion: 'v4',
    },
  };
}

it('requires the strict opt-in family capture and chosen native read rights without recipient-identity or model rights', () => {
  const actor = receivedAddendumActor();
  expect(hasReceivedAddendumAccess(actor.activeCompany)).toBe(true);
  expect(canReadReceivedAddendumRelation(actor)).toBe(true);
  expect(
    hasReceivedAddendumAccess({
      ...actor.activeCompany,
      id: 'company',
      displayName: 'Company',
      receivedAddendumAccessAssignmentId: 'opaque',
    }),
  ).toBe(false);
  expect(
    hasReceivedAddendumAccess({
      ...actor.activeCompany,
      id: 'company',
      displayName: 'Company',
      receivedAddendumClientReadCapture: { invented: true },
    }),
  ).toBe(false);
});

it('supports Workspace Client management and captured Contract approver without granting read through Early Preparation', () => {
  const actor = receivedAddendumActor();
  if (!actor.activeCompany) throw new Error('Missing fixture Company');
  actor.workspacePermissions = ['client.manage'];
  actor.activeCompany.clientPermissions = [];
  actor.activeCompany.clientPermissionAssignmentId = undefined;
  actor.activeCompany.clientPermissionSetVersion = undefined;
  actor.activeCompany.contractPermissionAssignmentId = undefined;
  actor.activeCompany.contractApproverAssignmentId = 'native-approver';
  actor.activeCompany.contractApproverPermissionSetVersion = 'v1';
  expect(canReadReceivedAddendumRelation(actor)).toBe(true);
  actor.activeCompany.contractApproverAssignmentId = undefined;
  actor.activeCompany.contractEarlyPreparationAssignmentId = 'native-early';
  actor.activeCompany.contractEarlyPreparationPermissionSetVersion = 'v1';
  // Early Preparation v1 grants prepare_pending_offer only; even the still
  // present untrusted aggregate read flag cannot turn it into a read capture.
  expect(canReadReceivedAddendumRelation(actor)).toBe(false);
  actor.activeCompany.contractPermissions = [
    'commercial.contract.prepare_pending_offer',
  ];
  expect(canReadReceivedAddendumRelation(actor)).toBe(false);
  actor.activeCompany.contractEarlyPreparationAssignmentId = undefined;
  expect(canReadReceivedAddendumRelation(actor)).toBe(false);
});

it('preserves source work when only an unconsumed Early Preparation capture changes', () => {
  const actor = receivedAddendumActor();
  if (!actor.activeCompany) throw new Error('Missing fixture Company');
  const original = receivedAddendumSourceAuthority(actor);
  actor.activeCompany.contractEarlyPreparationAssignmentId = 'early-first';
  actor.activeCompany.contractEarlyPreparationPermissionSetVersion = 'v1';
  expect(canReadReceivedAddendumRelation(actor)).toBe(true);
  expect(receivedAddendumSourceAuthority(actor)).toBe(original);
  actor.activeCompany.contractEarlyPreparationAssignmentId =
    'early-replacement';
  expect(receivedAddendumSourceAuthority(actor)).toBe(original);
});

it('fails closed on missing endpoint permission, capture or malformed dedicated Client capture', () => {
  for (const field of [
    'receivedAddendumAccessAssignmentId',
    'receivedAddendumClientReadCapture',
    'documentPermissionAssignmentId',
    'clientPermissionAssignmentId',
    'contractPermissionAssignmentId',
    'commercialIntakePermissionAssignmentId',
  ]) {
    const actor = receivedAddendumActor();
    if (!actor.activeCompany) throw new Error('Missing fixture Company');
    Reflect.deleteProperty(actor.activeCompany, field);
    expect(canReadReceivedAddendumRelation(actor)).toBe(false);
  }
  const actor = receivedAddendumActor();
  if (!actor.activeCompany) throw new Error('Missing fixture Company');
  actor.activeCompany.receivedAddendumClientReadCapture =
    'received-addendum-client-read.v1.' + 'A'.repeat(64);
  expect(canReadReceivedAddendumRelation(actor)).toBe(false);
});

it('retires exact relevant captures and scope, without consuming economic, configuration, content or unused Company Client grants', () => {
  const actor = receivedAddendumActor();
  if (!actor.activeCompany) throw new Error('Missing fixture Company');
  const original = receivedAddendumSourceAuthority(actor);
  actor.activeCompany.contractModelGrants = { future: true };
  actor.activeCompany.pricingConfigurationPermissionAssignmentId = 'unrelated';
  actor.activeCompany.documentContentReaderAssignmentId = 'unrelated';
  expect(receivedAddendumSourceAuthority(actor)).toBe(original);
  actor.activeCompany.receivedAddendumClientReadCapture =
    'received-addendum-client-read.v1.' + 'b'.repeat(64);
  expect(receivedAddendumSourceAuthority(actor)).not.toBe(original);
  actor.workspacePermissions = ['client.manage'];
  const workspaceRead = receivedAddendumSourceAuthority(actor);
  actor.activeCompany.clientPermissionAssignmentId =
    'unconsumed-company-client';
  expect(receivedAddendumSourceAuthority(actor)).toBe(workspaceRead);
  actor.internalUserId = 'replacement-user';
  expect(receivedAddendumSourceAuthority(actor)).not.toBe(workspaceRead);
});
