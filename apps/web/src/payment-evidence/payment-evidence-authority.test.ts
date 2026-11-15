import { expect, it } from 'vitest';
import type { ActorContext } from '../access-types';
import {
  companyGrants,
  withCompanyGrants,
  withoutCompanyGrants,
} from '../access/company-grants.test-fixture';
import { readCurrentActor } from '../access/current-actor';
import { paymentEvidenceAuthority } from './payment-evidence-authority';
const uuid = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function actor() {
  return {
    internalUserId: uuid(1),
    workspaceId: uuid(2),
    workspaceMembershipId: uuid(3),
    workspaceName: 'Fictional Workspace',
    displayName: 'Fictional Reader',
    email: 'reader@example.test',
    active: true,
    workspacePermissions: ['client.manage'],
    activeCompany: {
      id: uuid(4),
      displayName: 'Fictional Company',
      clientPermissions: ['client.read'],
      clientPermissionAssignmentId: uuid(5),
      clientPermissionSetVersion: 'v2',
      documentPermissionAssignmentId: uuid(6),
      documentPermissionSetVersion: 'v3',
      documentPermissions: [
        'document.read',
        'document.register',
        'document.reference.read',
        'document.correct',
        'document.version.manage',
        'document.version.designate_official',
        'document.content.read',
        'document.content.upload',
      ],
      documentApproverAssignmentId: uuid(7),
      documentApproverPermissionSetVersion: 'v1',
      documentContentReaderAssignmentId: uuid(8),
      documentContentReaderPermissionSetVersion: 'v1',
      documentContentUploaderAssignmentId: uuid(9),
      documentContentUploaderPermissionSetVersion: 'v1',
      paymentEvidenceContextCapture:
        'payment-evidence-context.v1.' + 'a'.repeat(64),
      paymentEvidenceReferenceReadCapture:
        'payment-evidence-reference-read.v1.' + 'b'.repeat(64),
      grants: companyGrants(
        {
          bundle: 'company_director_client_access',
          version: 'v2',
          assignmentId: uuid(5),
        },
        {
          bundle: 'company_document_registrar',
          version: 'v3',
          assignmentId: uuid(6),
        },
        {
          bundle: 'company_document_approver',
          version: 'v1',
          assignmentId: uuid(7),
        },
        {
          bundle: 'company_document_content_reader',
          version: 'v1',
          assignmentId: uuid(8),
        },
        {
          bundle: 'company_document_content_uploader',
          version: 'v1',
          assignmentId: uuid(9),
        },
        {
          bundle: 'company_payment_reader',
          version: 'v1',
          assignmentId: uuid(10),
        },
        {
          bundle: 'company_payment_recorder',
          version: 'v1',
          assignmentId: uuid(11),
        },
        {
          bundle: 'company_payment_evidence_access',
          version: 'v1',
          assignmentId: uuid(12),
        },
      ),
    },
  } satisfies ActorContext & { activeCompany: Record<string, unknown> };
}
const read = (current: unknown) =>
  readCurrentActor({
    api: { request: async () => ({ status: 'ok', value: current }) },
  });
it('keeps independent Reader authority when a nonconsumed Recorder is replaced by a non-native capture', async () => {
  const current = actor();
  const before = paymentEvidenceAuthority(current);
  expect(before?.registerKey).not.toBeNull();
  current.activeCompany.grants = withCompanyGrants(
    current.activeCompany.grants,
    {
      bundle: 'company_payment_recorder',
      version: 'v1',
      assignmentId: 'recorder-capture',
    },
  );
  const after = paymentEvidenceAuthority(current);
  expect(after?.readKey).toBe(before?.readKey);
  expect(after?.registerKey).toBeNull();
  // A future captured Recorder version is refused for the whole current
  // Actor (#1332), so no screen sees it.
  const future = actor();
  expect((await read(future)).status).toBe('ok');
  expect(
    await read({
      ...future,
      activeCompany: {
        ...future.activeCompany,
        grants: future.activeCompany.grants.map((grant) =>
          grant.bundle === 'company_payment_recorder'
            ? {
                ...grant,
                assignmentId: uuid(13),
                permissionSetVersion: 'future',
              }
            : grant,
        ),
      },
    }),
  ).toEqual({ status: 'error' });
});
it('keeps replay and independent native operations after identity-only loss while withholding fresh copying and payer', () => {
  const current = actor();
  const before = paymentEvidenceAuthority(current);
  current.activeCompany.clientPermissions = [];
  current.activeCompany.grants = withoutCompanyGrants(
    current.activeCompany.grants,
    'company_director_client_access',
  );
  const after = paymentEvidenceAuthority(current);
  expect(after?.readKey).toBe(before?.readKey);
  expect(after?.registerKey).toBe(before?.registerKey);
  expect(after?.designateKey).toBe(before?.designateKey);
  expect(after?.contentReadKey).toBe(before?.contentReadKey);
  expect(after?.freshPayerKey).toBeNull();
  expect(after?.payerKey).toBeNull();
});
it('does not require content reader or uploader for designation', () => {
  const current = actor();
  current.activeCompany.documentPermissions =
    current.activeCompany.documentPermissions.filter(
      (p) => p !== 'document.content.read' && p !== 'document.content.upload',
    );
  current.activeCompany.grants = withoutCompanyGrants(
    current.activeCompany.grants,
    'company_document_content_reader',
    'company_document_content_uploader',
  );
  const authority = paymentEvidenceAuthority(current);
  expect(authority?.designateKey).toEqual(expect.any(String));
  expect(authority?.contentReadKey).toBeNull();
  expect(authority?.uploadKey).toBeNull();
});
it('fails closed for a duplicate consumed family identity', async () => {
  // The current Actor parser refuses a duplicated grant for the whole Actor
  // (#1332); a family grant without a native assignment denies the source.
  const current = actor();
  const family = current.activeCompany.grants.find(
    (grant) => grant.bundle === 'company_payment_evidence_access',
  );
  expect(
    await read({
      ...current,
      activeCompany: {
        ...current.activeCompany,
        grants: [...current.activeCompany.grants, family],
      },
    }),
  ).toEqual({ status: 'error' });
  current.activeCompany.grants = withCompanyGrants(
    current.activeCompany.grants,
    {
      bundle: 'company_payment_evidence_access',
      version: 'v1',
      assignmentId: 'family-capture',
    },
  );
  expect(paymentEvidenceAuthority(current)).toBeUndefined();
});
