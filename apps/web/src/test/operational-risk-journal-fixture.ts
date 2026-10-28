import type { ActorContext } from '../access-types';
import type {
  OperationalRiskJournalStatement,
  OperationalRiskRecord,
} from '../operational-risk/operational-risk.types';

export const riskCompanyId = '55555555-5555-4555-8555-555555555555';
export const journalRiskId = '00000000-0000-4000-8000-000000000962';
const attribution = {
  actor: {
    workspaceMembershipId: '33333333-3333-4333-8333-333333333333',
    displayName: 'Synthetic original author',
  },
  recordedAt: '2026-10-28T12:00:00.000Z',
};
const intake = {
  ...attribution,
  id: '00000000-0000-4000-8000-000000962001',
  revision: 1,
  kind: 'intake-recorded',
  predecessorId: null,
  reason: null,
  facts: {
    process: 'Synthetic journal risk',
    cause: 'Cause',
    effect: 'Effect',
    plannedMeasure: 'Measure',
    plannedDate: null,
    existingMeasures: null,
    sourceDescription: null,
  },
} satisfies OperationalRiskRecord['originalIntake'];
export const journalRisk = {
  id: journalRiskId,
  companyId: riskCompanyId,
  revision: 2,
  assessment: 'not-assessed',
  responsibility: 'not-specified',
  createdAt: intake.recordedAt,
  originalIntake: intake,
  currentIntake: intake,
} satisfies OperationalRiskRecord;
export const journalOriginal = {
  ...attribution,
  id: '00000000-0000-4000-8000-000000962002',
  revision: 2,
  kind: 'observation',
  narrative: ' Original literal statement Î Ж <script> ',
  occurredOn: '2024-02-29',
} satisfies OperationalRiskJournalStatement['originalEntry'];
export const journalStatement = {
  riskId: journalRiskId,
  companyId: riskCompanyId,
  revision: 2,
  originalEntry: journalOriginal,
  currentEntry: journalOriginal,
} satisfies OperationalRiskJournalStatement;
export const journalCorrection = {
  ...attribution,
  actor: { ...attribution.actor, displayName: 'Synthetic corrector' },
  id: '00000000-0000-4000-8000-000000962003',
  revision: 3,
  kind: 'journal-corrected',
  journalKind: 'observation',
  originalEntryId: journalOriginal.id,
  predecessorId: journalOriginal.id,
  narrative: ' Corrected literal statement\nÎ Ж <tag> ',
  occurredOn: null,
  reason: ' Checked the source ',
} satisfies OperationalRiskJournalStatement['currentEntry'];
export const journalActor = {
  internalUserId: '11111111-1111-4111-8111-111111111111',
  workspaceMembershipId: attribution.actor.workspaceMembershipId,
  workspaceId: '44444444-4444-4444-8444-444444444444',
  workspaceName: 'Synthetic Risk Workspace',
  displayName: 'Synthetic Risk Recorder',
  email: 'recorder@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: riskCompanyId,
    displayName: 'Synthetic Risk Company',
    operationalRiskPermissions: ['risk.read', 'risk.record'],
    operationalRiskReaderAssignmentId: '00000000-0000-4000-8000-000000962010',
    operationalRiskReaderPermissionSetVersion: 'v1',
    operationalRiskRecorderAssignmentId: '00000000-0000-4000-8000-000000962011',
    operationalRiskRecorderPermissionSetVersion: 'v1',
  },
} satisfies ActorContext;

export function journalReadResponse(path: string): Response {
  if (path === '/api/operational-risks')
    return Response.json({
      items: [
        {
          id: journalRiskId,
          companyId: riskCompanyId,
          revision: 2,
          process: intake.facts.process,
          createdAt: intake.recordedAt,
        },
      ],
      next_cursor: null,
    });
  if (path === `/api/operational-risks/${journalRiskId}`)
    return Response.json(journalRisk);
  if (path === `/api/operational-risks/${journalRiskId}/history`)
    return Response.json({
      items: [journalOriginal, intake],
      next_cursor: null,
    });
  if (path === journalRoot) return Response.json(journalStatement);
  throw new Error('Unexpected synthetic Risk read.');
}
export const journalRoot = `/api/operational-risks/${journalRiskId}/journal/${journalOriginal.id}`;
