import { afterEach, expect, it, vi } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '../test/render-with-interface-locale';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { MissionResultReview } from './MissionResultReview';
import { expectedPilotActivities } from './project-pilot-plan.test-fixtures';
import {
  pilotTemplateKey,
  type CopiedPilotTemplatePlan,
} from './project-template-response';

const actor: ActorContext = {
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
    projectPermissions: ['project.read'],
    taskPermissions: ['task.read'],
    projectTemplatePermissions: [
      'project.template.read',
      'project.template.pilot.read',
    ],
    projectTemplatePermissionSetVersion: 'v2',
    projectTemplatePermissionAssignmentId: 'template',
    documentPermissions: [
      'document.read',
      'document.content.read',
      'document.mission_deliverable.access',
    ],
    documentPermissionAssignmentId: 'registrar',
    documentPermissionSetVersion: 'v3',
    documentContentReaderAssignmentId: 'reader',
    documentContentReaderPermissionSetVersion: 'v1',
    missionDeliverableAccessAssignmentId: 'mission',
    missionDeliverableAccessPermissionSetVersion: 'v1',
    missionResultReviewPermissions: ['project.mission_result.review'],
    missionResultReviewerAssignmentId: 'reviewer',
    missionResultReviewerPermissionSetVersion: 'v1',
  },
};
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
function snapshot(version = 2) {
  return {
    review: {
      kind: 'available',
      mutable: true,
      project: { id: 'project', status: 'active' },
      source: { templateKey: pilotTemplateKey, version: 1, title: plan.title },
      revision: 0,
      activities: plan.activities.map((row) => ({
        ...row,
        task: { id: row.taskId, title: row.title, status: 'done', version },
        result: { kind: 'available', current: null },
        latest: null,
      })),
    },
  };
}
const history = {
  history: {
    kind: 'available',
    batches: [],
    hasMore: false,
    nextBeforeRevision: null,
  },
};
const props = { actor, identity, projectId: 'project', plan };
afterEach(() => vi.unstubAllGlobals());
it('prepares a deliberate multi-activity review and retries only the identical uncertain command', async () => {
  const commands: Array<{ body: unknown; key: string | null }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        expect(new Headers(init.headers).get('content-type')).toBe(
          'application/json',
        );
        commands.push({
          body: init.body,
          key: new Headers(init.headers).get('idempotency-key'),
        });
        if (commands.length === 1) throw new Error('Lost confirmation DEMO');
        return Response.json(
          {
            action: 'recorded',
            projectId: 'project',
            batchId: 'batch',
            reviewRevision: 1,
          },
          { status: 201 },
        );
      }
      return Response.json(url.includes('/history') ? history : snapshot());
    }),
  );
  render(<MissionResultReview {...props} />);
  const checkboxes = await screen.findAllByRole('checkbox');
  for (const box of checkboxes.slice(0, 2)) fireEvent.click(box);
  const references = screen.getAllByRole('textbox', {
    name: /Literal external reference/u,
  });
  for (const [i, field] of references.entries())
    fireEvent.change(field, {
      target: { value: `Physical register ${i} DEMO` },
    });
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Shared review basis' }),
    { target: { value: 'Literal human basis DEMO' } },
  );
  fireEvent.click(screen.getByRole('button', { name: 'Record human review' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Retry identical review' }),
  );
  await screen.findByText('Review confirmed.');
  expect(commands).toHaveLength(2);
  expect(commands[1]).toEqual(commands[0]);
  expect(JSON.parse(String(commands[0]?.body))).toMatchObject({
    basis: 'Literal human basis DEMO',
    items: [{ taskId: 'task-0' }, { taskId: 'task-1' }],
  });
});
it('retires a Reviewer draft without losing permitted reads or refetching history', async () => {
  const fetcher = vi.fn(async (url: string) =>
    Response.json(url.includes('/history') ? history : snapshot()),
  );
  vi.stubGlobal('fetch', fetcher);
  const { rerender } = render(<MissionResultReview {...props} />);
  await screen.findByRole('textbox', { name: 'Shared review basis' });
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Shared review basis' }),
    { target: { value: 'Private draft DEMO' } },
  );
  const before = fetcher.mock.calls.length;
  if (!actor.activeCompany) throw new Error('Expected Company context');
  rerender(
    <MissionResultReview
      {...props}
      actor={{
        ...actor,
        activeCompany: {
          ...actor.activeCompany,
          missionResultReviewerAssignmentId: undefined,
        },
      }}
    />,
  );
  expect(
    screen.queryByDisplayValue('Private draft DEMO'),
  ).not.toBeInTheDocument();
  expect(screen.getByText('Immutable review history')).toBeInTheDocument();
  await waitFor(() => expect(fetcher.mock.calls).toHaveLength(before));
});
it('keeps a prepared judgment bound to old observed facts after reload', async () => {
  let version = 2;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      Response.json(url.includes('/history') ? history : snapshot(version)),
    ),
  );
  render(<MissionResultReview {...props} />);
  const first = (await screen.findAllByRole('checkbox'))[0];
  if (!first) throw new Error('Expected a selectable activity');
  fireEvent.click(first);
  fireEvent.change(
    screen.getByRole('textbox', {
      name: 'Literal external reference — CT_AN01',
    }),
    { target: { value: 'Physical evidence DEMO' } },
  );
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Shared review basis' }),
    { target: { value: 'Old observed basis DEMO' } },
  );
  version = 3;
  fireEvent.click(screen.getByRole('button', { name: 'Reload review' }));
  await screen.findByText(
    'Prepared facts changed. Clear the selection and deliberately review the new facts.',
  );
  expect(
    screen.getByDisplayValue('Old observed basis DEMO'),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Record human review' }),
  ).toBeDisabled();
});

it('discards a held command after Reviewer revoke/regrant without losing independent review reads', async () => {
  let release: ((value: Response) => void) | undefined;
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST')
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    return Response.json(url.includes('/history') ? history : snapshot());
  });
  vi.stubGlobal('fetch', fetcher);
  const { rerender } = render(<MissionResultReview {...props} />);
  const first = (await screen.findAllByRole('checkbox'))[0];
  if (!first || !actor.activeCompany)
    throw new Error('Expected prepared access');
  fireEvent.click(first);
  fireEvent.change(
    screen.getByRole('textbox', {
      name: 'Literal external reference — CT_AN01',
    }),
    { target: { value: 'Protected reference DEMO' } },
  );
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Shared review basis' }),
    { target: { value: 'Protected pending basis DEMO' } },
  );
  fireEvent.click(screen.getByRole('button', { name: 'Record human review' }));
  await waitFor(() => expect(release).toBeDefined());
  const before = fetcher.mock.calls.length;
  rerender(
    <MissionResultReview
      {...props}
      actor={{
        ...actor,
        activeCompany: {
          ...actor.activeCompany,
          missionResultReviewerAssignmentId: undefined,
        },
      }}
    />,
  );
  expect(
    screen.queryByDisplayValue('Protected pending basis DEMO'),
  ).not.toBeInTheDocument();
  rerender(
    <MissionResultReview
      {...props}
      actor={{
        ...actor,
        activeCompany: {
          ...actor.activeCompany,
          missionResultReviewerAssignmentId: 'regranted',
        },
      }}
    />,
  );
  const deliver = release;
  if (!deliver) throw new Error('Expected held command');
  deliver(
    Response.json({
      action: 'recorded',
      projectId: 'project',
      batchId: 'old-batch',
      reviewRevision: 1,
    }),
  );
  await waitFor(() =>
    expect(screen.queryByText('Review confirmed.')).not.toBeInTheDocument(),
  );
  expect(
    screen.getByRole('textbox', { name: 'Shared review basis' }),
  ).toHaveValue('');
  expect(fetcher.mock.calls).toHaveLength(before);
});
it('retires held protected reads after evidence capture changes and cannot restore old judgments', async () => {
  let release: ((value: Response) => void) | undefined;
  let reads = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('/history')) return Response.json(history);
      if (++reads === 2)
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      return Response.json(
        reads > 2 ? { review: { kind: 'unavailable' } } : snapshot(),
      );
    }),
  );
  const { rerender } = render(<MissionResultReview {...props} />);
  await screen.findAllByRole('checkbox');
  fireEvent.click(screen.getByRole('button', { name: 'Reload review' }));
  await waitFor(() => expect(release).toBeDefined());
  if (!actor.activeCompany) throw new Error('Expected Company');
  rerender(
    <MissionResultReview
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
  await screen.findByText('Evidence unavailable under current access.');
  const deliver = release;
  if (!deliver) throw new Error('Expected held read');
  deliver(Response.json(snapshot()));
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('textbox', { name: 'Shared review basis' }),
  ).not.toBeInTheDocument();
});

it('redacts the current projection when the following history read observes evidence denial', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      Response.json(
        url.includes('/history')
          ? { history: { kind: 'unavailable' } }
          : snapshot(),
      ),
    ),
  );
  render(<MissionResultReview {...props} />);
  await screen.findByText('Evidence unavailable under current access.');
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});

it.each([403, 404])(
  'retires loaded protected judgments, older history and a draft when pagination observes HTTP%s',
  async (status) => {
    const first = plan.activities[0];
    if (!first) throw new Error('Expected mapped activity');
    const judgment = (revision: number) => ({
      id: `row-${revision}`,
      batchId: `batch-${revision}`,
      reviewRevision: revision,
      predecessorId: revision > 1 ? `row-${revision - 1}` : null,
      outcome: 'NEEDS_WORK',
      basis: 'Protected historical basis DEMO887',
      actor: {
        internalUserId: 'owner',
        workspaceMembershipId: 'member',
        displayName: 'Owner',
      },
      occurredAt: '2026-10-26T10:00:00.000Z',
      observedTask: { id: first.taskId, title: first.title, version: 2 },
      observedResultRevision: 0,
      evidence: {
        kind: 'EXTERNAL_REPORTED',
        reference: 'Protected historical evidence DEMO887',
      },
    });
    const current = snapshot().review;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('beforeRevision='))
          return Response.json(
            { message: 'Read authority revoked DEMO' },
            { status },
          );
        if (url.includes('/history'))
          return Response.json({
            history: {
              kind: 'available',
              hasMore: true,
              nextBeforeRevision: 2,
              batches: Array.from({ length: 25 }, (_, index) => {
                const row = judgment(26 - index);
                return {
                  id: row.batchId,
                  reviewRevision: row.reviewRevision,
                  outcome: row.outcome,
                  basis: row.basis,
                  items: [row],
                };
              }),
            },
          });
        return Response.json({
          review: {
            ...current,
            revision: 26,
            activities: current.activities.map((row, index) => ({
              ...row,
              latest: index === 0 ? { ...judgment(26), current: true } : null,
            })),
          },
        });
      }),
    );
    render(<MissionResultReview {...props} />);
    await screen.findByRole('button', { name: 'Load older reviews' });
    expect(
      screen.getAllByText('Protected historical basis DEMO887').length,
    ).toBeGreaterThan(1);
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Shared review basis' }),
      { target: { value: 'Protected pending review draft DEMO887' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Load older reviews' }));
    await screen.findByText('Review access unavailable.');
    expect(
      screen.queryByText('Protected historical basis DEMO887'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Protected historical evidence DEMO887'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByDisplayValue('Protected pending review draft DEMO887'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Record human review' }),
    ).not.toBeInTheDocument();
  },
);

it.each(['evidence', 'reviewer'])(
  'revalidates protected reads after a command refusal while preserving independent %s authority',
  async (loss) => {
    const first = plan.activities[0];
    if (!first) throw new Error('Expected mapped activity');
    const latest = {
      id: 'prior-row',
      batchId: 'prior-batch',
      reviewRevision: 1,
      predecessorId: null,
      outcome: 'NEEDS_WORK',
      basis: 'Previously readable protected basis DEMO888',
      actor: {
        internalUserId: 'owner',
        workspaceMembershipId: 'member',
        displayName: 'Owner',
      },
      occurredAt: '2026-10-26T10:00:00.000Z',
      observedTask: { id: first.taskId, title: first.title, version: 2 },
      observedResultRevision: 0,
      evidence: {
        kind: 'EXTERNAL_REPORTED',
        reference: 'Previously readable protected evidence DEMO888',
      },
      current: true,
    };
    const raw = snapshot().review;
    const previous = {
      review: {
        ...raw,
        revision: 1,
        activities: raw.activities.map((row, index) => ({
          ...row,
          latest: index === 0 ? latest : null,
        })),
      },
    };
    let refused = false,
      currentReads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          refused = true;
          return Response.json(
            { message: 'Authority changed DEMO' },
            { status: loss === 'evidence' ? 404 : 403 },
          );
        }
        if (url.includes('/history'))
          return Response.json({
            history: {
              kind: 'available',
              hasMore: false,
              nextBeforeRevision: null,
              batches: [
                {
                  id: 'prior-batch',
                  reviewRevision: 1,
                  outcome: latest.outcome,
                  basis: latest.basis,
                  items: [latest],
                },
              ],
            },
          });
        currentReads++;
        return Response.json(
          refused && loss === 'evidence'
            ? { review: { kind: 'unavailable' } }
            : previous,
        );
      }),
    );
    render(<MissionResultReview {...props} />);
    const checkbox = (await screen.findAllByRole('checkbox'))[0];
    if (!checkbox) throw new Error('Expected selection');
    await screen.findByRole('heading', { name: 'Immutable review history' });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Reload review' }),
      ).toBeEnabled(),
    );
    fireEvent.click(checkbox);
    fireEvent.change(
      screen.getByRole('textbox', {
        name: 'Literal external reference — CT_AN01',
      }),
      { target: { value: 'New draft reference DEMO888' } },
    );
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Shared review basis' }),
      { target: { value: 'New draft basis DEMO888' } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Record human review' }),
    );
    await waitFor(() => expect(currentReads).toBe(2));
    expect(
      screen.queryByDisplayValue('New draft basis DEMO888'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Record human review' }),
    ).not.toBeInTheDocument();
    if (loss === 'evidence') {
      await screen.findByText('Evidence unavailable under current access.');
      expect(screen.queryByText(latest.basis)).not.toBeInTheDocument();
      expect(
        screen.queryByText(latest.evidence.reference),
      ).not.toBeInTheDocument();
    } else {
      await waitFor(() =>
        expect(screen.getAllByText(latest.basis)).toHaveLength(2),
      );
      expect(
        screen.getByRole('heading', { name: 'Immutable review history' }),
      ).toBeInTheDocument();
    }
  },
);

it('retires a held protected read and prepared command immediately on command401 before session rejection completes', async () => {
  let releasePost: ((value: Response) => void) | undefined;
  let releaseRead: ((value: Response) => void) | undefined;
  let currentReads = 0;
  const privateSnapshot = snapshot();
  const privateTask = privateSnapshot.review.activities[0];
  if (!privateTask) throw new Error('Expected mapped Task');
  privateTask.task.title = 'Protected Task fact DEMO888';
  const rejectSession = vi.fn(async () => {});
  const browserIdentity = { ...identity, rejectSession };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST')
        return new Promise<Response>((resolve) => {
          releasePost = resolve;
        });
      if (url.includes('/history')) return Response.json(history);
      if (++currentReads === 2)
        return new Promise<Response>((resolve) => {
          releaseRead = resolve;
        });
      return Response.json(privateSnapshot);
    }),
  );
  render(<MissionResultReview {...props} identity={browserIdentity} />);
  const checkbox = (await screen.findAllByRole('checkbox'))[0];
  if (!checkbox) throw new Error('Expected selection');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Reload review' })).toBeEnabled(),
  );
  fireEvent.click(checkbox);
  fireEvent.change(
    screen.getByRole('textbox', {
      name: 'Literal external reference — CT_AN01',
    }),
    { target: { value: 'Protected prepared reference DEMO888' } },
  );
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Shared review basis' }),
    { target: { value: 'Protected prepared basis DEMO888' } },
  );
  fireEvent.click(screen.getByRole('button', { name: 'Record human review' }));
  await waitFor(() => expect(releasePost).toBeDefined());
  fireEvent.click(screen.getByRole('button', { name: 'Reload review' }));
  await waitFor(() => expect(releaseRead).toBeDefined());
  const deliverPost = releasePost,
    deliverRead = releaseRead;
  if (!deliverPost || !deliverRead)
    throw new Error('Expected held request boundaries');
  deliverPost(new Response(null, { status: 401 }));
  await screen.findByText('Review access unavailable.');
  deliverRead(Response.json(privateSnapshot));
  await waitFor(() => expect(rejectSession).toHaveBeenCalledOnce());
  expect(currentReads).toBe(2);
  expect(
    screen.queryByText('Protected Task fact DEMO888'),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByDisplayValue('Protected prepared basis DEMO888'),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});
