import { vi } from 'vitest';
import type { ActorContext } from '../access-types';
import type { BrowserIdentity } from '../access-composition';
import { withCompanyGrants } from '../access/company-grants.test-fixture';
import { documentGrants } from '../documents/document-grants.test-fixture';
export const ids = {
  project: '10000000-0000-4000-8000-000000000001',
  client: '10000000-0000-4000-8000-000000000002',
  case: '10000000-0000-4000-8000-000000000003',
  revision: '10000000-0000-4000-8000-000000000004',
  document: '10000000-0000-4000-8000-000000000005',
  version: '10000000-0000-4000-8000-000000000006',
  representation: '10000000-0000-4000-8000-000000000007',
  evidence: '10000000-0000-4000-8000-000000000008',
  member: '10000000-0000-4000-8000-000000000009',
  reader: '10000000-0000-4000-8000-000000000010',
  recorder: '10000000-0000-4000-8000-000000000011',
  projectAccess: '10000000-0000-4000-8000-000000000012',
};
export const actor: ActorContext = {
  internalUserId: ids.member,
  workspaceMembershipId: ids.member,
  workspaceId: ids.project,
  workspaceName: 'Fictional workspace',
  displayName: 'Fictional person',
  email: 'fictional@example.test',
  active: true,
  workspacePermissions: ['client.manage'],
  activeCompany: {
    id: ids.project,
    displayName: 'Fictional Company',

    workingEvidenceContextCapture: `working-evidence-context.v1.${'a'.repeat(64)}`,
    workingEvidenceClientReadCapture: `working-evidence-client-read.v1.${'b'.repeat(64)}`,

    // The screens read these registry-consistent live grants.
    grants: withCompanyGrants(
      documentGrants(
        [
          'document.read',
          'document.reference.read',
          'document.received_audit_source.access',
          'document.content.read',
        ],
        { company_received_audit_source_access: ids.project },
      ),
      {
        bundle: 'company_project_access',
        version: 'v1',
        assignmentId: ids.projectAccess,
      },
      {
        bundle: 'company_working_evidence_case_reader',
        version: 'v1',
        assignmentId: ids.reader,
      },
      {
        bundle: 'company_working_evidence_case_recorder',
        version: 'v1',
        assignmentId: ids.recorder,
      },
    ),
  },
};
export const identity: BrowserIdentity = {
  loaded: true,
  signedIn: true,
  getToken: async () => 'token',
  rejectSession: vi.fn(async () => undefined),
  signOut: async () => undefined,
  signedOutView: null,
};
export const source = {
  documentId: ids.document,
  versionId: ids.version,
  versionNumber: 1,
  representationId: ids.representation,
  sourceTitle: 'Fictional exact original',
};
export const revision = {
  format: 'WORKING_EVIDENCE_CASE_REVISION/1',
  caseId: ids.case,
  revisionId: ids.revision,
  revisionNumber: 1,
  previousRevisionId: null,
  action: 'RECORD',
  recordedAt: '2026-10-01T10:00:00.000Z',
  actor: { membershipId: ids.member, displayName: 'Fictional person' },
  reason: null,
  title: 'Fictional working statement',
  declaredContext: null,
  process: 'Fictional process',
  statement: 'Human literal <script>not executable</script>',
  observationNote: null,
  evidence: {
    state: 'visible',
    supports: [
      {
        ...source,
        evidenceId: ids.evidence,
        sourcePurpose: 'Literal received source',
        filename: 'fictional.pdf',
        mediaType: 'application/pdf',
        sizeBytes: 12,
        sha256: 'a'.repeat(64),
        locator: null,
        supportNote: 'Literal unverified support',
      },
    ],
  },
};
