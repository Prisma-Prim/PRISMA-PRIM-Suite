import { afterEach, expect, it, vi } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '../test/render-with-interface-locale';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { MissionReadiness } from './MissionReadiness';
import { expectedPilotActivities } from './project-pilot-plan.test-fixtures';
import {
  pilotTemplateKey,
  type CopiedPilotTemplatePlan,
} from './project-template-response';
import { readMissionReadiness } from './mission-readiness-response';

const actor = {
  internalUserId: 'owner',
  workspaceId: 'workspace',
  workspaceMembershipId: 'member',
  workspaceName: 'DEMO',
  displayName: 'Owner',
  email: 'owner@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: 'company',
    displayName: 'Company',
    documentPermissionAssignmentId: 'registrar',
    documentPermissionSetVersion: 'v3',
    documentPermissions: [
      'document.read',
      'document.content.read',
      'document.mission_deliverable.access',
    ],
    documentContentReaderAssignmentId: 'reader',
    documentContentReaderPermissionSetVersion: 'v1',
    missionDeliverableAccessAssignmentId: 'mission',
    missionDeliverableAccessPermissionSetVersion: 'v1',
  },
} satisfies ActorContext;
const identity = deterministicBrowserIdentity();
const plan: CopiedPilotTemplatePlan = {
  templateKey: pilotTemplateKey,
  version: 1,
  title: 'Plan DEMO',
  illustrative: true,
  activities: expectedPilotActivities.map((row, index) => ({
    ...row,
    taskId: `task-${index}`,
  })),
};
const declaration = {
  kind: 'recorded',
  id: 'result',
  revision: 1,
  declaration: 'Private declaration DEMO883',
  occurredAt: '2026-10-01T10:00:00.000Z',
  actor: {
    internalUserId: 'owner',
    workspaceMembershipId: 'member',
    displayName: 'Owner',
  },
  reference: {
    documentId: 'document',
    versionId: 'version',
    versionNumber: 1,
    title: 'Private PDF DEMO883',
    status: 'official',
    representationId: 'pdf',
  },
};
function snapshot(projectId = 'project') {
  return {
    assessment: {
      kind: 'DIAGNOSTIC_ONLY',
      project: { id: projectId, status: 'preparatory' },
      source: { templateKey: pilotTemplateKey, version: 1, title: plan.title },
      clarification: {
        state: 'BUSINESS_CLARIFICATION_PENDING',
        questionId: 'MISSION-CLOSE-01',
      },
      activities: plan.activities.map((row) => ({
        key: row.key,
        title: row.title,
        activity: row.activity,
        intendedResult: row.intendedResult,
        task: { id: row.taskId, title: row.title, status: 'done', version: 2 },
        result: { kind: 'available', current: declaration },
        state: 'RECORDED_RESULT_NOT_REVIEWED',
      })),
    },
  };
}
afterEach(() => vi.unstubAllGlobals());

it('retires held evidence across revoke/regrant while keeping independent Task facts', async () => {
  const releases: Array<() => void> = [];
  let calls = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      if (++calls > 1)
        await new Promise<void>((resolve) => releases.push(resolve));
      return Response.json(snapshot());
    }),
  );
  const props = { actor, identity, projectId: 'project', plan };
  const { rerender } = render(<MissionReadiness {...props} />);
  await waitFor(() =>
    expect(screen.getAllByText(declaration.declaration)).toHaveLength(13),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Reload mission readiness' }),
  );
  await waitFor(() => expect(releases).toHaveLength(1));
  rerender(
    <MissionReadiness
      {...props}
      actor={{
        ...actor,
        activeCompany: {
          ...actor.activeCompany,
          documentContentReaderAssignmentId: undefined,
        },
      }}
    />,
  );
  expect(screen.queryByText(declaration.declaration)).not.toBeInTheDocument();
  expect(screen.getAllByText(/— Done$/u)).toHaveLength(13);
  await waitFor(() => expect(releases).toHaveLength(2));
  rerender(
    <MissionReadiness
      {...props}
      actor={{
        ...actor,
        activeCompany: {
          ...actor.activeCompany,
          documentContentReaderAssignmentId: 'regranted',
        },
      }}
    />,
  );
  expect(screen.queryByText(declaration.declaration)).not.toBeInTheDocument();
  await waitFor(() => expect(releases).toHaveLength(3));
  releases[0]?.();
  releases[1]?.();
  await waitFor(() =>
    expect(screen.getAllByText('Task done; evidence unavailable')).toHaveLength(
      13,
    ),
  );
  expect(screen.queryByText(declaration.declaration)).not.toBeInTheDocument();
  releases[2]?.();
  await waitFor(() =>
    expect(screen.getAllByText(declaration.declaration)).toHaveLength(13),
  );
});

it('retires old Project replies and opens only the exact mapped Task', async () => {
  let release = () => {};
  let calls = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      if (++calls === 1) {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return Response.json(snapshot());
      }
      return Response.json(snapshot('second'));
    }),
  );
  const onOpenTask = vi.fn();
  const { rerender } = render(
    <MissionReadiness
      actor={actor}
      identity={identity}
      projectId="project"
      plan={plan}
      onOpenTask={onOpenTask}
    />,
  );
  await waitFor(() => expect(calls).toBe(1));
  rerender(
    <MissionReadiness
      actor={actor}
      identity={identity}
      projectId="second"
      plan={plan}
      onOpenTask={onOpenTask}
    />,
  );
  await waitFor(() =>
    expect(screen.getAllByText(declaration.declaration)).toHaveLength(13),
  );
  release();
  fireEvent.click(screen.getByRole('button', { name: 'Open Task — CT_AN03' }));
  expect(onOpenTask).toHaveBeenCalledExactlyOnceWith('task-2');
});

it('rejects mismatched source/Project/result states instead of presenting partial success', () => {
  const value = snapshot();
  expect(() =>
    readMissionReadiness(value, { projectId: 'foreign', plan }),
  ).toThrow();
  value.assessment.source.version = 2;
  expect(() =>
    readMissionReadiness(value, { projectId: 'project', plan }),
  ).toThrow();
  value.assessment.source.version = 1;
  const first = value.assessment.activities[0];
  if (!first) throw new Error('Missing activity');
  first.state = 'WORK_OPEN';
  expect(() =>
    readMissionReadiness(value, { projectId: 'project', plan }),
  ).toThrow();
});

it('hides evidence immediately when a reload rejects the session', async () => {
  const rejected = vi.fn(async () => {});
  const browserIdentity = { ...identity, rejectSession: rejected };
  let reads = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      ++reads === 1
        ? Response.json(snapshot())
        : new Response(null, { status: 401 }),
    ),
  );
  render(
    <MissionReadiness
      actor={actor}
      identity={browserIdentity}
      projectId="project"
      plan={plan}
    />,
  );
  await waitFor(() =>
    expect(screen.getAllByText(declaration.declaration)).toHaveLength(13),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Reload mission readiness' }),
  );
  await waitFor(() => expect(rejected).toHaveBeenCalledOnce());
  expect(screen.queryAllByText(declaration.declaration)).toHaveLength(0);
});
