import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import type { OpportunityFollowUpPanelProps } from './OpportunityFollowUpPanel';

export const actor = {
  internalUserId: 'user-ada',
  workspaceMembershipId: 'member-ada',
  workspaceId: 'workspace-a',
  workspaceName: 'Workspace',
  displayName: 'Ada',
  email: 'ada@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: 'company-a',
    displayName: 'Company',
    commercialIntakePermissions: [
      'commercial.request.read',
      'commercial.opportunity.read',
      'commercial.opportunity.next_action.update',
    ],
    commercialIntakePermissionAssignmentId:
      '11111111-1111-4111-8111-111111111111',
    commercialIntakePermissionSetVersion: 'v2',
    opportunityFollowUpPermissions: [
      'commercial.opportunity.follow_up.read',
      'commercial.opportunity.follow_up.manage',
    ],
    opportunityFollowUpCoordinatorAssignmentId:
      '22222222-2222-4222-8222-222222222222',
    opportunityFollowUpCoordinatorPermissionSetVersion: 'v1',
    opportunityFollowUpReadCapture: `opportunity-follow-up-read.v1.${'a'.repeat(64)}`,
  },
} satisfies ActorContext;
export const format = 'opportunity-follow-up.v1';
export const recordedBy = {
  workspaceMembershipId: 'member-ada',
  displayLabel: 'Ada · literal',
};
export const fact = {
  state: 'RECORDED',
  revision: 1,
  followUpOn: null,
  confirmedEpoch: 'epoch-a',
  recordedBy,
  recordedAt: '2026-10-01T10:00:00.000Z',
};
export const absent = {
  format,
  opportunityId: 'opportunity-a',
  requestId: 'request-a',
  status: 'OPEN',
  opportunityVersion: 3,
  outcomeEpoch: 'epoch-a',
  head: { state: 'UNRECORDED', revision: 0 },
  history: {
    format,
    opportunityId: 'opportunity-a',
    headRevision: 0,
    entries: [],
    nextCursor: null,
  },
};
export const entry = {
  format,
  opportunityId: 'opportunity-a',
  revision: 1,
  before: absent.head,
  after: fact,
  reason: null,
  commandId: 'command-a',
  actor: recordedBy,
  occurredAt: fact.recordedAt,
};
export const recorded = {
  ...absent,
  head: fact,
  history: { ...absent.history, headRevision: 1, entries: [entry] },
};
export const identity = deterministicBrowserIdentity();
export const baseProps: OpportunityFollowUpPanelProps = {
  actor,
  identity,
  requestId: 'request-a',
  opportunityId: 'opportunity-a',
  nativeVersion: 3,
  nativeStatus: 'OPEN',
  nativeOutcomeObservation: 'OPEN:creation-a',
  editorAvailable: true,
  onProtectedChange: () => undefined,
  onCompanyContextRejected: () => undefined,
  onActorRevalidated: () => undefined,
  onWorkspaceAccessRejected: () => undefined,
};
