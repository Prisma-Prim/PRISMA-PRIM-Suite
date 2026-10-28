import { afterEach, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import { deterministicBrowserIdentity } from '../access-composition';
import { MissionPlanCurrentWork } from './MissionPlanCurrentWork';
import {
  currentActor,
  currentOverview,
  id,
  project,
} from './current-work.fixture';
import { currentWorkMessages } from './current-work.copy';
import { assertMessageCoverage } from '../localization/messages';
function held() {
  let resolve: (v: Response) => void = () => {};
  const promise = new Promise<Response>((r) => {
    resolve = r;
  });
  return { resolve, promise };
}
afterEach(() => vi.unstubAllGlobals());
it('covers every current-work message in four locales', () =>
  assertMessageCoverage('current-work', currentWorkMessages));
const transitions = [
  'source',
  'task',
  'project',
  'client',
  'result',
  'session',
  'selection',
] as const;
it.each(
  transitions.flatMap((kind) => [200, 403].map((status) => ({ kind, status }))),
)(
  'permanently retires held$status through $kind A→B→A without navigation or shared callbacks',
  async ({ kind, status }) => {
    const actor = currentActor(),
      identity = deterministicBrowserIdentity(),
      onActorRevalidated = vi.fn(),
      onOpenTask = vi.fn(),
      first = held();
    let next: Promise<Response> | undefined = first.promise;
    let reads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        reads++;
        return next ?? Response.json(currentOverview());
      }),
    );
    const base = {
      actor,
      identity,
      projectId: project.id,
      clientAccountId: project.clientAccountId,
      onActorRevalidated,
      onOpenTask,
    };
    const view = render(<MissionPlanCurrentWork {...base} />);
    await waitFor(() => expect(reads).toBe(1));
    const other = currentActor();
    if (!other.activeCompany) throw new Error('Missing Company');
    if (kind === 'source') other.activeCompany.missionPlanGrants = [];
    if (kind === 'task')
      other.activeCompany.taskPermissionAssignmentId = id(90);
    if (kind === 'project')
      other.activeCompany.projectPermissionAssignmentId = id(90);
    if (kind === 'client')
      other.activeCompany.clientPermissionAssignmentId = id(90);
    if (kind === 'result')
      other.activeCompany.documentContentReaderAssignmentId = id(90);
    next = undefined;
    view.rerender(
      <MissionPlanCurrentWork
        {...base}
        actor={other}
        identity={
          kind === 'session' ? deterministicBrowserIdentity() : identity
        }
        projectId={kind === 'selection' ? id(30) : project.id}
      />,
    );
    view.rerender(<MissionPlanCurrentWork {...base} />);
    await screen.findByText('Current declaration 1 Ж / é');
    const before = reads;
    await act(async () =>
      first.resolve(Response.json({ overview: null }, { status })),
    );
    expect(reads).toBe(before);
    expect(onActorRevalidated).not.toHaveBeenCalled();
    expect(onOpenTask).not.toHaveBeenCalled();
    expect(screen.getByText('Current declaration 1 Ж / é')).toBeVisible();
  },
);
it('retires result-only fields immediately while keeping base Task/source/window and replacing only the new result projection', async () => {
  const actor = currentActor(),
    identity = deterministicBrowserIdentity();
  let pending: Promise<Response> | undefined = undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => pending ?? Response.json(currentOverview())),
  );
  const props = {
    actor,
    identity,
    projectId: project.id,
    clientAccountId: project.clientAccountId,
    onOpenTask: vi.fn(),
  };
  const view = render(<MissionPlanCurrentWork {...props} />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Next activities' }),
  );
  expect(screen.getByText('Current declaration 26 Ж / é')).toBeVisible();
  const deferred = held();
  pending = deferred.promise;
  const denied = currentActor();
  if (!denied.activeCompany) throw new Error('Missing Company');
  denied.activeCompany.documentPermissions = ['document.read'];
  denied.activeCompany.documentContentReaderAssignmentId = undefined;
  view.rerender(<MissionPlanCurrentWork {...props} actor={denied} />);
  expect(screen.queryByText('Current declaration 26 Ж / é')).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Open current Task: Current Task 26' }),
  ).toBeEnabled();
  expect(screen.getByText('Activities 26–26 of 26')).toBeVisible();
  const value = currentOverview();
  await act(async () =>
    deferred.resolve(
      Response.json({
        overview: {
          ...value.overview,
          activities: value.overview.activities.map((row) => ({
            ...row,
            result: { kind: 'unavailable' },
          })),
        },
      }),
    ),
  );
  expect(
    screen.getByText(
      'Result access unavailable. Ordinary Task work remains available.',
    ),
  ).toBeVisible();
});
it('does not restart a ready read for unconsumed publication/instantiation/Recorder/Reviewer or ordinary management grants', async () => {
  const actor = currentActor(),
    identity = deterministicBrowserIdentity();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(currentOverview())),
  );
  const props = {
    actor,
    identity,
    projectId: project.id,
    clientAccountId: project.clientAccountId,
    onOpenTask: vi.fn(),
  };
  const view = render(<MissionPlanCurrentWork {...props} />);
  await screen.findByText('Current declaration 1 Ж / é');
  const next = currentActor();
  if (!next.activeCompany) throw new Error('Missing Company');
  next.activeCompany.taskResultRecorderAssignmentId = id(90);
  next.activeCompany.missionResultReviewerAssignmentId = id(91);
  next.activeCompany.taskPermissions = ['task.read'];
  next.activeCompany.projectPermissions = ['project.read'];
  view.rerender(<MissionPlanCurrentWork {...props} actor={next} />);
  expect(fetch).toHaveBeenCalledTimes(1);
});
