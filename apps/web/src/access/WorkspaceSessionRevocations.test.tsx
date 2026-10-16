import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import { afterEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { WorkspaceSessionRevocations } from './WorkspaceSessionRevocations';
const memberId = '11111111-1111-4111-8111-111111111111';
const actor: ActorContext = {
  internalUserId: '00000000-0000-4000-8000-000000000001',
  workspaceMembershipId: '00000000-0000-4000-8000-000000000002',
  workspaceId: '00000000-0000-4000-8000-000000000003',
  workspaceName: 'Workspace',
  displayName: 'Owner',
  email: 'owner@example.test',
  active: true,
  workspacePermissions: ['company.assignment.manage'],
};
const page = (status: string) => ({
  records: [
    {
      workspaceMembershipId: memberId,
      displayName: 'Suspended Person',
      status,
    },
  ],
  nextCursor: null,
});
const response = (value: unknown) =>
  new Response(JSON.stringify(value), { status: 200 });
afterEach(() => vi.unstubAllGlobals());
it('shows failure explicitly, retries and reads canonical completion', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(response(page('retry_required')))
    .mockResolvedValueOnce(response({ status: 'checked' }))
    .mockResolvedValueOnce(response(page('complete')));
  vi.stubGlobal('fetch', fetch);
  const activity = vi.fn();
  render(
    <WorkspaceSessionRevocations
      actor={actor}
      identity={deterministicBrowserIdentity()}
      onWorkspaceAccessRejected={vi.fn()}
      onActivityRecorded={activity}
    />,
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Check session revocations' }),
  );
  expect(await screen.findByText(/needs another attempt/)).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry session revocation' }),
  );
  expect(
    await screen.findByText(/Existing provider sessions revoked/),
  ).toBeInTheDocument();
  expect(fetch.mock.calls[1]?.[0]).toContain(
    `/workspace-session-revocations/${memberId}/retry`,
  );
  expect(activity).toHaveBeenCalledOnce();
});
it('does not report success from a malformed retry acknowledgement', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(response(page('pending')))
      .mockResolvedValueOnce(response({ status: 'complete' })),
  );
  render(
    <WorkspaceSessionRevocations
      actor={actor}
      identity={deterministicBrowserIdentity()}
      onWorkspaceAccessRejected={vi.fn()}
      onActivityRecorded={vi.fn()}
    />,
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Check session revocations' }),
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Retry session revocation' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'could not be verified',
  );
  expect(
    screen.queryByText(/Existing provider sessions revoked/),
  ).not.toBeInTheDocument();
});
it('discards a delayed result after identity or Workspace replacement', async () => {
  let release: (response: Response) => void = () => undefined;
  const fetch = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
  );
  vi.stubGlobal('fetch', fetch);
  const identity = deterministicBrowserIdentity();
  const props = {
    actor,
    identity,
    onWorkspaceAccessRejected: vi.fn(),
    onActivityRecorded: vi.fn(),
  };
  const view = render(<WorkspaceSessionRevocations {...props} />);
  fireEvent.click(
    screen.getByRole('button', { name: 'Check session revocations' }),
  );
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  view.rerender(
    <WorkspaceSessionRevocations
      {...props}
      actor={{ ...actor, workspaceId: '00000000-0000-4000-8000-000000000009' }}
    />,
  );
  await act(async () => {
    release(response(page('complete')));
  });
  expect(screen.queryByText('Suspended Person')).not.toBeInTheDocument();
});
it('clears restricted data when authority is lost', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(page('complete'))));
  const props = {
    actor,
    identity: deterministicBrowserIdentity(),
    onWorkspaceAccessRejected: vi.fn(),
    onActivityRecorded: vi.fn(),
  };
  const view = render(<WorkspaceSessionRevocations {...props} />);
  fireEvent.click(
    screen.getByRole('button', { name: 'Check session revocations' }),
  );
  expect(await screen.findByText('Suspended Person')).toBeInTheDocument();
  view.rerender(
    <WorkspaceSessionRevocations
      {...props}
      actor={{ ...actor, workspacePermissions: [] }}
    />,
  );
  expect(screen.queryByText('Suspended Person')).not.toBeInTheDocument();
});

it.each([
  { action: 'list', status: 401 },
  { action: 'retry', status: 401 },
  { action: 'list', status: 403 },
  { action: 'retry', status: 403 },
])(
  'routes $action HTTP $status to the appropriate access boundary',
  async ({ action, status }) => {
    const fetch = vi.fn();
    if (action === 'retry')
      fetch.mockResolvedValueOnce(response(page('retry_required')));
    fetch.mockResolvedValueOnce(new Response(null, { status }));
    vi.stubGlobal('fetch', fetch);
    const rejectSession = vi.fn();
    const rejectWorkspace = vi.fn();
    const activity = vi.fn();
    render(
      <WorkspaceSessionRevocations
        actor={actor}
        identity={{ ...deterministicBrowserIdentity(), rejectSession }}
        onWorkspaceAccessRejected={rejectWorkspace}
        onActivityRecorded={activity}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Check session revocations' }),
    );
    if (action === 'retry') {
      fireEvent.click(
        await screen.findByRole('button', { name: 'Retry session revocation' }),
      );
    }
    await screen.findByRole('alert');
    expect(rejectSession).toHaveBeenCalledTimes(status === 401 ? 1 : 0);
    expect(rejectWorkspace).toHaveBeenCalledTimes(status === 403 ? 1 : 0);
    expect(activity).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(action === 'retry' ? 2 : 1);
  },
);
