import { expect, it } from 'vitest';
import type { ActorContext } from '../access-types';
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
      paymentGrants: [
        {
          bundle: 'company_payment_reader',
          assignmentId: uuid(10),
          permissionSetVersion: 'v1',
        },
        {
          bundle: 'company_payment_recorder',
          assignmentId: uuid(11),
          permissionSetVersion: 'v1',
        },
        {
          bundle: 'company_payment_evidence_access',
          assignmentId: uuid(12),
          permissionSetVersion: 'v1',
        },
      ],
    },
  } satisfies ActorContext & { activeCompany: Record<string, unknown> };
}
it('keeps independent Reader authority when a nonconsumed Recorder is replaced by a future capture', () => {
  const current = actor();
  const before = paymentEvidenceAuthority(current);
  expect(before?.registerKey).not.toBeNull();
  current.activeCompany.paymentGrants[1] = {
    bundle: 'company_payment_recorder',
    assignmentId: uuid(13),
    permissionSetVersion: 'future',
  };
  const after = paymentEvidenceAuthority(current);
  expect(after?.readKey).toBe(before?.readKey);
  expect(after?.registerKey).toBeNull();
});
it('keeps replay and independent native operations after identity-only loss while withholding fresh copying and payer', () => {
  const current = actor();
  const before = paymentEvidenceAuthority(current);
  current.activeCompany.clientPermissions = [];
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
  const authority = paymentEvidenceAuthority(current);
  expect(authority?.designateKey).toEqual(expect.any(String));
  expect(authority?.contentReadKey).toBeNull();
  expect(authority?.uploadKey).toBeNull();
});
it('fails closed for a duplicate consumed family identity', () => {
  const current = actor();
  current.activeCompany.paymentGrants.push(
    current.activeCompany.paymentGrants[2],
  );
  expect(paymentEvidenceAuthority(current)).toBeUndefined();
});
