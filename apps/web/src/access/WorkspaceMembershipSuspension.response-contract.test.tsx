import { afterEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import { changeValue } from '../test/select-option';
import { WorkspaceMembershipSuspension } from './WorkspaceMembershipSuspension';

const actor: ActorContext = {
  internalUserId: 'user',
  workspaceMembershipId: 'own-membership',
  workspaceId: 'workspace',
  workspaceName: 'Workspace',
  displayName: 'Ada',
  email: 'ada@example.test',
  active: true,
  workspacePermissions: ['company.assignment.manage'],
};
const memberId = 'other-membership';

afterEach(() => vi.unstubAllGlobals());

function mount(selectedId = memberId) {
  const props = {
    actor,
    identity: deterministicBrowserIdentity(),
    members: [{ workspaceMembershipId: selectedId, label: 'Bogdan' }],
    disabled: false,
    reloadAdministration: vi.fn(async () => true),
    onPendingChange: vi.fn(),
    onActivityRecorded: vi.fn(),
    onWorkspaceAccessRejected: vi.fn(),
  };
  const view = render(<WorkspaceMembershipSuspension {...props} />);
  changeValue(screen.getByLabelText('Member to suspend'), selectedId);
  return { ...view, props };
}

function confirm() {
  fireEvent.click(screen.getByRole('button', { name: 'Review suspension' }));
  fireEvent.click(screen.getByRole('button', { name: 'Suspend access' }));
}

it('does not confirm an unreadable suspension acknowledgement even after a successful canonical reload', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({})),
  );
  const { props } = mount();
  confirm();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'The suspension could not be completed.',
  );
  expect(props.onActivityRecorded).not.toHaveBeenCalled();
  expect(props.onWorkspaceAccessRejected).not.toHaveBeenCalled();
  expect(props.reloadAdministration).toHaveBeenCalledOnce();
  expect(
    screen.queryByText('Member suspended. Server state refreshed.'),
  ).toBeNull();
});

it.each([
  null,
  [],
  { workspaceMembershipId: memberId },
  { status: 'inactive' },
  { workspaceMembershipId: 'another-membership', status: 'inactive' },
  { workspaceMembershipId: memberId, status: 'active' },
])('rejects an unproved suspension acknowledgement %j', async (value) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(value)),
  );
  const { props } = mount();
  confirm();
  await screen.findByRole('alert');
  expect(props.onActivityRecorded).not.toHaveBeenCalled();
  expect(props.reloadAdministration).toHaveBeenCalledOnce();
});

it('retains the command after malformed success and confirms an additive acknowledgement on an exact retry', async () => {
  const fetcher = vi
    .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
    .mockResolvedValueOnce(Response.json({}))
    .mockResolvedValueOnce(
      Response.json({
        workspaceMembershipId: memberId.toUpperCase(),
        status: 'inactive',
        future: true,
      }),
    );
  vi.stubGlobal('fetch', fetcher);
  const { props } = mount();
  confirm();
  await screen.findByRole('alert');
  confirm();
  await screen.findByText('Member suspended. Server state refreshed.');
  const first = fetcher.mock.calls[0]?.[1];
  const second = fetcher.mock.calls[1]?.[1];
  const key = new Headers(first?.headers).get('idempotency-key');
  expect(key).toBeTruthy();
  expect(new Headers(second?.headers).get('idempotency-key')).toBe(key);
  expect(first?.body).toBe(JSON.stringify({ workspaceMembershipId: memberId }));
  expect(second?.body).toBe(first?.body);
  expect(props.onActivityRecorded).toHaveBeenCalledOnce();
  expect(props.reloadAdministration).toHaveBeenCalledTimes(2);
  expect(props.onPendingChange).toHaveBeenLastCalledWith(false);
});

it.each([false, true])(
  'requires a proved own-Membership suspension before leaving the Workspace (valid: %s)',
  async (valid) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          valid
            ? {
                workspaceMembershipId: actor.workspaceMembershipId,
                status: 'inactive',
              }
            : {
                workspaceMembershipId: actor.workspaceMembershipId,
                status: 'unknown',
              },
        ),
      ),
    );
    const { props } = mount(actor.workspaceMembershipId);
    confirm();
    if (valid) {
      await waitFor(() =>
        expect(props.onWorkspaceAccessRejected).toHaveBeenCalledOnce(),
      );
      expect(props.reloadAdministration).not.toHaveBeenCalled();
    } else {
      await screen.findByRole('alert');
      expect(props.onWorkspaceAccessRejected).not.toHaveBeenCalled();
    }
    expect(props.onActivityRecorded).not.toHaveBeenCalled();
  },
);

it('rejects lost authentication without reading the success payload', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({}, { status: 401 })),
  );
  const { props, rerender } = mount();
  const identity = {
    ...props.identity,
    rejectSession: vi.fn(async () => undefined),
  };
  rerender(<WorkspaceMembershipSuspension {...props} identity={identity} />);
  changeValue(screen.getByLabelText('Member to suspend'), memberId);
  confirm();
  await waitFor(() => expect(identity.rejectSession).toHaveBeenCalledOnce());
  expect(props.reloadAdministration).not.toHaveBeenCalled();
  expect(props.onActivityRecorded).not.toHaveBeenCalled();
});

it('ignores a late unauthorized acknowledgement after identity replacement', async () => {
  let resolve: (value: Response) => void = () => {
    throw new Error('Uninitialized response');
  };
  const response = new Promise<Response>((settle) => {
    resolve = settle;
  });
  const fetcher = vi.fn<
    (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  >(async () => response);
  vi.stubGlobal('fetch', fetcher);
  const { props, rerender } = mount();
  const rejectSession = vi.spyOn(props.identity, 'rejectSession');
  confirm();
  await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  const signal = fetcher.mock.calls[0]?.[1]?.signal;
  rerender(
    <WorkspaceMembershipSuspension
      {...props}
      identity={deterministicBrowserIdentity()}
    />,
  );
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    resolve(Response.json({}, { status: 401 }));
    await response;
  });
  expect(rejectSession).not.toHaveBeenCalled();
  expect(props.onActivityRecorded).not.toHaveBeenCalled();
  expect(props.reloadAdministration).not.toHaveBeenCalled();
});
